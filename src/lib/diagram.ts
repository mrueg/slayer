import { calculateItemSLA, formatSLAPercentage, type FailureDomain, type SLAItem } from './sla-calculator';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 66;
const H_GAP = 20;
const V_GAP = 48;
const PADDING = 24;
const MAX_NAME_CHARS = 26;

export const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const describe = (item: SLAItem, domainNames: Map<string, string>): string => {
  const replicas = item.replicas || 1;
  const parts: string[] = [];
  if (item.type === 'group') {
    const children = (item.children || []).filter(child => !child.isOptional).length;
    parts.push(item.config === 'parallel' ? `parallel · ${item.minChildrenRequired || 1} of ${children}` : 'series');
  }
  if (replicas > 1) parts.push(`${item.minReplicasRequired || 1} of ${replicas} replicas`);
  if (item.isOptional) parts.push('optional');
  for (const id of item.domains || []) if (domainNames.has(id)) parts.push(`⌖ ${domainNames.get(id)}`);
  return parts.join(' · ');
};

interface LaidOutNode {
  item: SLAItem;
  x: number; // left edge
  y: number; // top edge
  children: LaidOutNode[];
}

const subtreeWidth = (item: SLAItem): number => {
  const children = item.children || [];
  if (children.length === 0) return NODE_WIDTH;
  const childrenWidth = children.reduce((sum, child) => sum + subtreeWidth(child), 0) + H_GAP * (children.length - 1);
  return Math.max(NODE_WIDTH, childrenWidth);
};

const layout = (item: SLAItem, left: number, depth: number): LaidOutNode => {
  const width = subtreeWidth(item);
  const children = item.children || [];
  const childrenWidth = children.reduce((sum, child) => sum + subtreeWidth(child), 0) + H_GAP * Math.max(0, children.length - 1);
  let childLeft = left + (width - childrenWidth) / 2;
  const laidOutChildren = children.map(child => {
    const node = layout(child, childLeft, depth + 1);
    childLeft += subtreeWidth(child) + H_GAP;
    return node;
  });
  return {
    item,
    x: left + (width - NODE_WIDTH) / 2,
    y: PADDING + depth * (NODE_HEIGHT + V_GAP),
    children: laidOutChildren,
  };
};

const treeDepth = (item: SLAItem): number => 1 + Math.max(0, ...(item.children || []).map(treeDepth));

/**
 * Renders the model as a standalone SVG tree (top-down), independent of the
 * on-screen theme so exports look the same everywhere.
 */
export const renderDiagramSvg = (root: SLAItem): string => {
  // Domains are defined on the root; subtrees need them to include common-cause failures
  const domains: FailureDomain[] = root.failureDomains || [];
  const domainNames = new Map(domains.map(d => [d.id, d.name || '(unnamed)']));
  const width = subtreeWidth(root) + PADDING * 2;
  const height = treeDepth(root) * (NODE_HEIGHT + V_GAP) - V_GAP + PADDING * 2;
  const tree = layout(root, PADDING, 0);

  const edges: string[] = [];
  const nodes: string[] = [];

  const draw = (node: LaidOutNode) => {
    const { item, x, y } = node;
    const centerX = x + NODE_WIDTH / 2;
    for (const child of node.children) {
      const childCenterX = child.x + NODE_WIDTH / 2;
      const midY = y + NODE_HEIGHT + V_GAP / 2;
      edges.push(`<path d="M${centerX} ${y + NODE_HEIGHT} V${midY} H${childCenterX} V${child.y}" fill="none" stroke="#94a3b8" stroke-width="1.5"${child.item.isOptional ? ' stroke-dasharray="4 4"' : ''}/>`);
      draw(child);
    }

    const isDown = (item.failedReplicas || 0) >= (item.replicas || 1);
    const isGroup = item.type === 'group';
    const fill = item.isOptional ? '#f8fafc' : isGroup ? '#eff6ff' : '#ffffff';
    const stroke = isDown ? '#dc2626' : item.isOptional ? '#94a3b8' : isGroup ? '#3b82f6' : '#cbd5e1';
    const detail = truncate(describe(item, domainNames), 36);
    nodes.push(
      `<g>` +
      `<rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${isDown ? 2.5 : 1.5}"${item.isOptional ? ' stroke-dasharray="5 4"' : ''}/>` +
      `<text x="${centerX}" y="${y + 22}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">${escapeXml(truncate(item.name || '(unnamed)', MAX_NAME_CHARS))}</text>` +
      `<text x="${centerX}" y="${y + 41}" text-anchor="middle" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="${isDown ? '#dc2626' : '#2563eb'}">${isDown ? 'DOWN' : `${formatSLAPercentage(calculateItemSLA(item, domains))}%`}</text>` +
      (detail ? `<text x="${centerX}" y="${y + 57}" text-anchor="middle" font-size="10" fill="#64748b">${escapeXml(detail)}</text>` : '') +
      `</g>`
    );
  };
  draw(tree);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...edges,
    ...nodes,
    `</svg>`,
  ].join('\n');
};
