import { formatDuration, type SLAItem } from './sla-calculator';

export interface ModelWarning {
  itemId: string;
  itemName: string;
  severity: 'warning' | 'info';
  message: string;
}

// "Both replicas" / "All 3 replicas"
const allOf = (count: number, noun: string) => (count === 2 ? `Both ${noun}` : `All ${count} ${noun}`);

const activeChildren = (item: SLAItem) => (item.children || []).filter(child => !child.isOptional);

// Children a parallel group needs up; rounded down like the calculator does
const requiredChildren = (item: SLAItem, count: number) =>
  Math.min(Math.max(Math.floor(item.minChildrenRequired || 1), 1), count);

/**
 * Failure domains whose failure alone takes the item down: its own tags, plus
 * any domain that hits more children than the group can lose.
 */
const coveringDomains = (item: SLAItem): Set<string> => {
  const covering = new Set(item.domains || []);
  if (item.type !== 'group') return covering;
  const children = activeChildren(item);
  if (children.length === 0) return covering;
  const required = item.config === 'parallel' ? requiredChildren(item, children.length) : children.length;
  const tolerated = children.length - required;
  const hits = new Map<string, number>();
  for (const child of children) {
    for (const domain of coveringDomains(child)) hits.set(domain, (hits.get(domain) || 0) + 1);
  }
  for (const [domain, count] of hits) if (count > tolerated) covering.add(domain);
  return covering;
};

/**
 * Flags configurations that are valid but probably not what the author
 * meant, e.g. replicas that add no redundancy or parallel groups that
 * behave like series groups.
 */
export const getModelWarnings = (root: SLAItem): ModelWarning[] => {
  const warnings: ModelWarning[] = [];
  const domainNames = new Map((root.failureDomains || []).map(d => [d.id, d.name || '(unnamed)']));

  // `inherited`: domains an ancestor is tagged with; the whole subtree already fails with them
  const visit = (item: SLAItem, inherited: ReadonlySet<string>) => {
    if (item.isOptional) return;
    const add = (severity: ModelWarning['severity'], message: string) =>
      warnings.push({ itemId: item.id, itemName: item.name || '(unnamed)', severity, message });

    const replicas = item.replicas || 1;
    const required = item.minReplicasRequired || 1;
    if (replicas > 1 && required >= replicas) {
      add('warning', `${allOf(replicas, 'replicas')} must be up, so extra replicas lower availability instead of adding redundancy.`);
    }

    if (item.type === 'component') {
      if ((item.sla ?? 100) >= 100) {
        add('info', 'Modelled as never failing. Provider SLAs of 100% describe service credits, not actual uptime.');
      }
    } else {
      const children = activeChildren(item);
      if (children.length === 0) {
        add('warning', 'Group has no critical children and counts as 100% available.');
      } else if (item.config === 'parallel') {
        const k = requiredChildren(item, children.length);
        if (children.length > 1 && k >= children.length) {
          add('warning', `${allOf(children.length, 'children')} must be up, so this parallel group behaves like a series group.`);
        }
        if (children.length === 1) {
          add('info', 'Parallel group with a single critical child provides no redundancy.');
        }
        if (k < children.length) {
          const own = new Set(item.domains || []);
          for (const domain of coveringDomains(item)) {
            if (own.has(domain) || inherited.has(domain) || !domainNames.has(domain)) continue;
            add('warning', `A failure of ${domainNames.get(domain)} takes down this whole group: its redundant paths share that domain.`);
          }
        }
        const primaryMttr = children[0].type === 'component' ? (children[0].mttr || 60) : undefined;
        if (k === 1 && children.length > 1 && item.failoverTime && primaryMttr !== undefined && item.failoverTime >= primaryMttr) {
          add('warning', `Failing over (${formatDuration(item.failoverTime)}) takes at least as long as repairing the primary (${formatDuration(primaryMttr)}), so the standby never shortens an outage.`);
        }
        if (k === 1 && children.length > 1 && (item.failoverSla ?? 100) < 100) {
          const primary = children[0];
          const strongest = children.reduce((best, child) => ((child.sla ?? 100) > (best.sla ?? 100) ? child : best));
          if (primary.type === 'component' && strongest !== primary && strongest.type === 'component') {
            add('info', `The primary (${primary.name}) is less available than ${strongest.name}; with imperfect failover, the most reliable child should come first.`);
          }
        }
      }
      const childInherited = new Set([...inherited, ...(item.domains || [])]);
      children.forEach(child => visit(child, childInherited));
    }
  };

  visit(root, new Set());
  return warnings;
};
