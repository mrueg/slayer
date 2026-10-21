import { describe, expect, it } from 'vitest';
import { calculateItemSLA, formatSLAPercentage, type SLAItem } from './sla-calculator';
import { renderDiagramSvg } from './diagram';
import { localDate, renderReportHtml, renderReportMarkdown } from './report';

const model: SLAItem = {
  id: 'root', name: 'Shop <Prod> & "Co"', type: 'group', config: 'series',
  children: [
    { id: 'dns', name: 'DNS', type: 'component', sla: 99.99, rto: 5, notes: 'Route53 | weighted\nfailover' },
    { id: 'web', name: 'Web Tier', type: 'group', config: 'parallel', minChildrenRequired: 1, children: [
      { id: 'w1', name: 'Web 1', type: 'component', sla: 99.9, replicas: 3, minReplicasRequired: 2 },
      { id: 'w2', name: 'Web 2', type: 'component', sla: 99.9 },
    ] },
    { id: 'analytics', name: 'Analytics', type: 'component', sla: 95, isOptional: true },
  ],
};
const options = { generatedAt: new Date(2026, 9, 14, 12), targetRto: 60, targetRpo: 15 };

describe('renderDiagramSvg', () => {
  const svg = renderDiagramSvg(model);

  it('draws one box per item and one connector per child', () => {
    expect(svg.match(/<rect x=/g)).toHaveLength(6);
    expect(svg.match(/<path /g)).toHaveLength(5);
  });

  it('escapes names', () => {
    expect(svg).toContain('Shop &lt;Prod&gt; &amp; &quot;Co&quot;');
    expect(svg).not.toContain('<Prod>');
  });

  it('labels groups, replicas and optional items', () => {
    expect(svg).toContain('parallel · 1 of 2');
    expect(svg).toContain('2 of 3 replicas');
    expect(svg).toContain('optional');
  });

  it('has positive dimensions and no overlapping siblings', () => {
    const [, width, height] = svg.match(/width="(\d+)" height="(\d+)"/)!.map(Number);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    const boxes = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="200"/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
    for (const a of boxes) for (const b of boxes) {
      if (a !== b && a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(200);
    }
  });

  it('marks failed items', () => {
    expect(renderDiagramSvg({ ...model, children: [{ id: 'x', name: 'X', type: 'component', sla: 99, failedReplicas: 1 }] })).toContain('DOWN');
  });
});

describe('renderReportMarkdown', () => {
  const md = renderReportMarkdown(model, options);

  it('has the title, date and summary', () => {
    expect(md).toContain('# Shop <Prod> & "Co" — Reliability Report');
    expect(md).toContain('_Generated 2026-10-14 with slayer._');
    expect(md).toMatch(/\| System SLA \| 99\.\d+% \|/);
    expect(md).toContain('| Recovery time (RTO) | 5m (target 1h, met) |');
    expect(md).toContain('| Data loss window (RPO) | not set |');
  });

  it('lists every item with indentation and escapes table cells', () => {
    const rows = md.split('\n').filter(line => line.startsWith('| ') && line.includes('component') || line.includes('| series |') || line.includes('parallel ('));
    expect(rows).toHaveLength(6);
    expect(md).toContain('Route53 \\| weighted failover');
    expect(md).toContain('  └ Web 1');
    expect(md).toContain('| optional |');
  });

  it('includes improvement levers and, when given, the simulation', () => {
    expect(md).toContain('## Improvement Levers');
    expect(md).not.toContain('## Monte Carlo Simulation');
    const withSim = renderReportMarkdown(model, {
      ...options,
      simulation: { iterations: 10000, seed: 42, meanDowntime: 60, medianDowntime: 50, p95Downtime: 120, p99Downtime: 200, breachProbability: 12.5, monthlyBreachProbability: 40, breachedMonthsPerYear: 0.75, distribution: [] },
    });
    expect(withSim).toContain('| Breach probability (year) | 12.50% |');
    expect(withSim).toContain('| Breach probability (any month) | 40.00% |');
    expect(withSim).toContain('| Months over budget per year | 0.8 |');
    expect(withSim).toContain('| Seed | 42 |');
  });
});

describe('localDate', () => {
  it('uses the local calendar date', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });
});

describe('renderReportHtml', () => {
  const html = renderReportHtml(model, options);

  it('is a standalone document with the diagram embedded', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(html).toContain('@media print');
  });

  it('escapes user text', () => {
    expect(html).toContain('<title>Shop &lt;Prod&gt; &amp; &quot;Co&quot; — Reliability Report</title>');
    expect(html).not.toMatch(/<Prod>/);
  });
});

describe('exports with failure domains', () => {
  const zoned: SLAItem = {
    id: 'root', name: 'Zoned', type: 'group', config: 'series',
    failureDomains: [{ id: 'az1', name: 'us-east-1a', sla: 99.9 }, { id: 'unused', name: 'Unused', sla: 99 }],
    children: [
      { id: 'pool', name: 'Pool', type: 'group', config: 'parallel', children: [
        { id: 'a', name: 'A', type: 'component', sla: 99.9, domains: ['az1'] },
        { id: 'b', name: 'B', type: 'component', sla: 99.9, domains: ['az1'] },
      ] },
    ],
  };
  const pool = zoned.children![0];
  const poolWithDomains = `${formatSLAPercentage(calculateItemSLA(pool, zoned.failureDomains || []))}%`;
  const poolWithout = `${formatSLAPercentage(calculateItemSLA(pool, []))}%`;

  it('uses domain-aware SLAs for sub-groups', () => {
    expect(poolWithDomains).not.toBe(poolWithout);
    expect(renderDiagramSvg(zoned)).toContain(`>${poolWithDomains}<`);
    expect(renderReportMarkdown(zoned, options)).toContain(`| ${poolWithDomains} |`);
    expect(renderReportHtml(zoned, options)).toContain(`>${poolWithDomains}<`);
  });

  it('lists domains on items and in their own report section', () => {
    expect(renderDiagramSvg(zoned)).toContain('⌖ us-east-1a');
    const md = renderReportMarkdown(zoned, options);
    expect(md).toContain('## Failure Domains');
    expect(md).toMatch(/\| us-east-1a \| 99\.9% \| 2 \| .+\/year \| 0% \|/);
    expect(md).toContain('| Unused | 99% | 0 | — | — |');
    // A's effective SLA includes its zone: 99.9% × 99.9% ≈ 99.8%
    expect(md).toMatch(/\| .*A \| component \| 99\.8% \| — \| 1h \| — \| — \| us-east-1a \|/);
    expect(renderReportHtml(zoned, options)).toContain('<h2>Failure Domains</h2>');
  });

  it('omits the domain section without domains', () => {
    expect(renderReportMarkdown(model, options)).not.toContain('## Failure Domains');
  });
});
