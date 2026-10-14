import { describe, expect, it } from 'vitest';
import { FailureDomain, SLAItem, calculateReliability, createRandom } from './sla-calculator';

const YEAR_MINUTES = 365.25 * 24 * 60;

/** The model without domains, with every item in a down domain failed outright. */
const withDomainsDown = (item: SLAItem, down: Set<string>): SLAItem => ({
  ...item,
  domains: undefined,
  failureDomains: undefined,
  ...(item.domains?.some(d => down.has(d)) ? { failedReplicas: item.replicas || 1 } : {}),
  children: item.children?.map(child => withDomainsDown(child, down)),
});

/**
 * Reference: condition on every combination of domain states at the root and
 * add domain failure frequencies with the Birnbaum formula.
 */
const bruteForce = (root: SLAItem, domains: FailureDomain[]) => {
  const states: { down: Set<string>; probability: number; sla: number; frequency: number }[] = [];
  for (let mask = 0; mask < 1 << domains.length; mask++) {
    const down = new Set(domains.filter((_, i) => mask & (1 << i)).map(d => d.id));
    const probability = domains.reduce((p, d) => p * (down.has(d.id) ? 1 - d.sla / 100 : d.sla / 100), 1);
    const { sla, frequency } = calculateReliability(withDomainsDown(root, down));
    states.push({ down, probability, sla: sla / 100, frequency });
  }
  const availability = states.reduce((sum, s) => sum + s.probability * s.sla, 0);
  let frequency = states.reduce((sum, s) => sum + s.probability * s.frequency, 0);
  for (const domain of domains) {
    const a = domain.sla / 100;
    const whenUp = states.filter(s => !s.down.has(domain.id)).reduce((sum, s) => sum + s.probability * s.sla, 0);
    const whenDown = states.filter(s => s.down.has(domain.id)).reduce((sum, s) => sum + s.probability * s.sla, 0);
    frequency += ((1 - a) * YEAR_MINUTES / (domain.mttr ?? 120)) * Math.max(0, whenUp / a - whenDown / (1 - a));
  }
  return { sla: availability * 100, frequency };
};

const randomModel = (seed: number) => {
  const random = createRandom(seed);
  const pick = <T,>(values: T[]) => values[Math.floor(random() * values.length)];
  const domains: FailureDomain[] = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, i) => ({
    id: `z${i}`, name: `z${i}`, sla: pick([90, 99, 99.9]), mttr: pick([30, 120, 600]),
  }));
  let next = 0;
  const tags = () => domains.filter(() => random() < 0.25).map(d => d.id);
  const build = (depth: number): SLAItem => {
    const id = `n${next++}`;
    const shared = {
      id, name: id, domains: tags(), isOptional: random() < 0.1,
      ...(random() < 0.3 ? { replicas: 2 + Math.floor(random() * 2), minReplicasRequired: 1 + Math.floor(random() * 2) } : {}),
    };
    if (depth >= 3 || random() < 0.4) {
      return { ...shared, type: 'component', sla: pick([95, 99, 99.9, 99.99]), mttr: pick([30, 60, 240]) };
    }
    const children = Array.from({ length: 2 + Math.floor(random() * 3) }, () => build(depth + 1));
    return {
      ...shared, type: 'group', config: pick(['series', 'parallel'] as const), children,
      minChildrenRequired: 1 + Math.floor(random() * 2),
      ...(random() < 0.3 ? { failoverSla: 99, failoverTime: 5 } : {}),
    };
  };
  const root = { ...build(0), isOptional: false, failureDomains: domains };
  return { root, domains };
};

describe('domain conditioning', () => {
  it('matches conditioning on every domain at the root', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const { root, domains } = randomModel(seed);
      const expected = bruteForce(root, domains);
      const actual = calculateReliability(root);
      expect(actual.sla, `seed ${seed}`).toBeCloseTo(expected.sla, 10);
      // How a standby's state changes the switchover losses is left out of
      // child failure frequencies; a domain conditioned below the failover
      // group is treated the same way, which shifts the frequency slightly
      const switchover = JSON.stringify(root).includes('failoverTime');
      const tolerance = (switchover ? 1e-3 : 1e-9) * Math.max(1, expected.frequency);
      expect(Math.abs(actual.frequency - expected.frequency), `seed ${seed}`).toBeLessThan(tolerance);
    }
  });

  it('stays fast when every component has its own domain', () => {
    const domains = Array.from({ length: 24 }, (_, i) => ({ id: `d${i}`, name: `d${i}`, sla: 50 }));
    const root: SLAItem = {
      id: 'root', name: 'root', type: 'group', config: 'parallel', failureDomains: domains,
      children: domains.map(d => ({ id: `c-${d.id}`, name: d.id, type: 'component', sla: 99.9, domains: [d.id] })),
    };
    const start = performance.now();
    // 2^24 states if conditioned at the root
    expect(calculateReliability(root).sla).toBeGreaterThan(99.99);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
