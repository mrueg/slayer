import {
  calculateDRMetrics,
  calculateReliability,
  calculateSLA,
  formatDuration,
  formatSLAPercentage,
  getDowntime,
  getDomainImpact,
  getSensitivityRanking,
  type MonteCarloResult,
  type SLAItem,
} from './sla-calculator';
import { escapeXml, renderDiagramSvg } from './diagram';

export interface ReportOptions {
  generatedAt: Date;
  targetRto?: number; // minutes
  targetRpo?: number; // minutes
  simulation?: MonteCarloResult | null;
}

interface Row {
  depth: number;
  item: SLAItem;
}

const flatten = (item: SLAItem, depth = 0): Row[] => [
  { depth, item },
  ...(item.children || []).flatMap(child => flatten(child, depth + 1)),
];

/** YYYY-MM-DD in the viewer's time zone (toISOString would use UTC). */
export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const percent = (value: number) => `${formatSLAPercentage(value)}%`;
const optionalDuration = (minutes: number | undefined) => (minutes === undefined ? '—' : formatDuration(minutes));

const typeLabel = (item: SLAItem): string => {
  if (item.type === 'component') return 'component';
  if (item.config !== 'parallel') return 'series';
  const children = (item.children || []).filter(child => !child.isOptional).length;
  return `parallel (${item.minChildrenRequired || 1} of ${children})`;
};

const redundancyLabel = (item: SLAItem): string => {
  const replicas = item.replicas || 1;
  return replicas > 1 ? `${item.minReplicasRequired || 1} of ${replicas}` : '—';
};

const objective = (value: number | undefined, target: number | undefined) => {
  if (value === undefined) return 'not set';
  if (target === undefined) return formatDuration(value);
  return `${formatDuration(value)} (target ${formatDuration(target)}, ${value <= target ? 'met' : 'missed'})`;
};

/** Everything both renderers need, computed once. */
const collect = (root: SLAItem, options: ReportOptions) => {
  const sla = calculateSLA(root);
  const domainNames = new Map((root.failureDomains || []).map(d => [d.id, d.name || '(unnamed)']));
  const reliability = calculateReliability(root);
  const downtime = getDowntime(sla);
  const dr = calculateDRMetrics(root);
  return {
    title: root.name || 'Untitled system',
    date: localDate(options.generatedAt),
    summary: [
      ['System SLA', percent(sla)],
      ['Expected downtime', `${formatDuration(downtime.downtimePerYear)}/year · ${formatDuration(downtime.downtimePerMonth)}/month · ${formatDuration(downtime.downtimePerDay)}/day`],
      ['System MTTR', formatDuration(reliability.mttr)],
      ['Expected incidents', reliability.frequency > 0 ? `${reliability.frequency.toFixed(2)}/year (1 every ${(1 / reliability.frequency).toFixed(1)} years)` : 'none'],
      ['Recovery time (RTO)', objective(dr.rto, options.targetRto)],
      ['Data loss window (RPO)', objective(dr.rpo, options.targetRpo)],
    ] as [string, string][],
    simulation: options.simulation
      ? [
        ['Simulated years', options.simulation.iterations.toLocaleString('en-US')],
        ['Mean downtime', `${formatDuration(options.simulation.meanDowntime)}/year`],
        ['Median year', formatDuration(options.simulation.medianDowntime)],
        ['Bad year (P95)', formatDuration(options.simulation.p95Downtime)],
        ['Worst case (P99)', formatDuration(options.simulation.p99Downtime)],
        ['Breach probability', `${options.simulation.breachProbability.toFixed(2)}%`],
        ['Seed', String(options.simulation.seed)],
      ] as [string, string][]
      : null,
    levers: getSensitivityRanking(root).slice(0, 5),
    domains: getDomainImpact(root).map(impact => {
      const domain = (root.failureDomains || []).find(d => d.id === impact.id)!;
      return [
        impact.name || '(unnamed)',
        percent(domain.sla),
        String(impact.itemCount),
        impact.itemCount > 0 ? `${formatDuration(impact.downtimePerYear)}/year` : '—',
        impact.itemCount > 0 ? percent(impact.slaWhileDown) : '—',
      ];
    }),
    rows: flatten(root).map(({ depth, item }) => ({
      depth,
      name: item.name || '(unnamed)',
      type: typeLabel(item),
      sla: item.isOptional ? 'optional' : percent(calculateSLA(item, root.failureDomains || [])),
      redundancy: redundancyLabel(item),
      mttr: item.type === 'component' ? formatDuration(item.mttr || 60) : '—',
      rto: item.type === 'component' ? optionalDuration(item.rto) : '—',
      rpo: item.type === 'component' ? optionalDuration(item.rpo) : '—',
      domains: (item.domains || []).map(id => domainNames.get(id)).filter(Boolean).join(', '),
      notes: item.notes?.trim() || '',
    })),
  };
};

const DOMAIN_HEADERS = ['Domain', 'SLA', 'Items', 'Downtime caused', 'System SLA while down'];

const markdownCell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export const renderReportMarkdown = (root: SLAItem, options: ReportOptions): string => {
  const data = collect(root, options);
  const lines: string[] = [
    `# ${data.title} — Reliability Report`,
    '',
    `_Generated ${data.date} with slayer._`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|---|---|',
    ...data.summary.map(([k, v]) => `| ${k} | ${markdownCell(v)} |`),
  ];

  if (data.simulation) {
    lines.push('', '## Monte Carlo Simulation', '', '| Metric | Value |', '|---|---|',
      ...data.simulation.map(([k, v]) => `| ${k} | ${markdownCell(v)} |`));
  }

  if (data.levers.length > 0) {
    lines.push('', '## Improvement Levers', '', 'Yearly downtime saved if the item never failed:', '',
      ...data.levers.map((lever, i) => `${i + 1}. **${markdownCell(lever.name)}** — ${formatDuration(lever.downtimeSavedPerYear)}`));
  }

  if (data.domains.length > 0) {
    lines.push('', '## Failure Domains', '', 'Shared infrastructure; tagged items fail together when it fails.', '',
      `| ${DOMAIN_HEADERS.join(' | ')} |`, `|${DOMAIN_HEADERS.map(() => '---').join('|')}|`,
      ...data.domains.map(cells => `| ${cells.map(markdownCell).join(' | ')} |`));
  }

  lines.push('', '## Architecture', '', '| Item | Type | SLA | Replicas | MTTR | RTO | RPO | Domains | Notes |', '|---|---|---|---|---|---|---|---|---|',
    ...data.rows.map(row => {
      // Non-breaking spaces keep the indentation in rendered tables
      const indent = row.depth > 0 ? `${'\u00a0\u00a0'.repeat(row.depth - 1)}└\u00a0` : '';
      return `| ${indent}${markdownCell(row.name)} | ${row.type} | ${row.sla} | ${row.redundancy} | ${row.mttr} | ${row.rto} | ${row.rpo} | ${markdownCell(row.domains)} | ${markdownCell(row.notes)} |`;
    }));

  return lines.join('\n') + '\n';
};

const htmlTable = (rows: [string, string][]) =>
  `<table class="kv">${rows.map(([k, v]) => `<tr><th>${escapeXml(k)}</th><td>${escapeXml(v)}</td></tr>`).join('')}</table>`;

/** Standalone, print-ready HTML version of the report (used for PDF via the print dialog). */
export const renderReportHtml = (root: SLAItem, options: ReportOptions): string => {
  const data = collect(root, options);
  const sections = [
    `<h1>${escapeXml(data.title)} — Reliability Report</h1>`,
    `<p class="meta">Generated ${data.date} with slayer.</p>`,
    `<h2>Summary</h2>${htmlTable(data.summary)}`,
  ];
  if (data.simulation) sections.push(`<h2>Monte Carlo Simulation</h2>${htmlTable(data.simulation)}`);
  if (data.levers.length > 0) {
    sections.push(`<h2>Improvement Levers</h2><p>Yearly downtime saved if the item never failed:</p><ol>${data.levers
      .map(lever => `<li><strong>${escapeXml(lever.name)}</strong> — ${escapeXml(formatDuration(lever.downtimeSavedPerYear))}</li>`).join('')}</ol>`);
  }
  if (data.domains.length > 0) {
    sections.push(`<h2>Failure Domains</h2><p>Shared infrastructure; tagged items fail together when it fails.</p><table class="items"><thead><tr>${DOMAIN_HEADERS
      .map(h => `<th>${escapeXml(h)}</th>`).join('')}</tr></thead><tbody>${data.domains
      .map(cells => `<tr>${cells.map(c => `<td>${escapeXml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
  }
  sections.push(`<h2>Topology</h2><div class="diagram">${renderDiagramSvg(root)}</div>`);
  sections.push(`<h2>Architecture</h2><table class="items"><thead><tr><th>Item</th><th>Type</th><th>SLA</th><th>Replicas</th><th>MTTR</th><th>RTO</th><th>RPO</th><th>Domains</th><th>Notes</th></tr></thead><tbody>${data.rows
    .map(row => `<tr><td style="padding-left:${0.5 + row.depth * 1.25}rem">${escapeXml(row.name)}</td><td>${escapeXml(row.type)}</td><td class="num">${escapeXml(row.sla)}</td><td>${row.redundancy}</td><td>${escapeXml(row.mttr)}</td><td>${escapeXml(row.rto)}</td><td>${escapeXml(row.rpo)}</td><td>${escapeXml(row.domains)}</td><td class="notes">${escapeXml(row.notes)}</td></tr>`)
    .join('')}</tbody></table>`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeXml(data.title)} — Reliability Report</title>
<style>
  body { font: 13px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f172a; margin: 2rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.05rem; margin: 1.75rem 0 .5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: .25rem; }
  .meta { color: #64748b; margin: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .3rem .5rem; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .kv th { width: 14rem; color: #475569; font-weight: 600; }
  .items th { background: #f8fafc; font-size: .75rem; text-transform: uppercase; letter-spacing: .03em; color: #475569; }
  .num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
  .notes { color: #475569; max-width: 18rem; }
  .diagram svg { max-width: 100%; height: auto; }
  @media print {
    body { margin: 0; }
    h2 { break-after: avoid; }
    tr, .diagram { break-inside: avoid; }
  }
</style>
</head>
<body>
${sections.join('\n')}
</body>
</html>
`;
};
