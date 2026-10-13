import { describe, expect, it } from 'vitest';
import {
  SLAItem,
  calculateDRMetrics,
  calculateReliability,
  calculateSLA,
  formatDuration,
  formatSLAPercentage,
  getBlastRadiusMap,
  runMonteCarlo,
} from './sla-calculator';

const YEAR_MINUTES = 365.25 * 24 * 60;

const component = (id: string, sla: number, extra: Partial<SLAItem> = {}): SLAItem => ({
  id,
  name: id,
  type: 'component',
  sla,
  ...extra,
});

const group = (id: string, config: 'series' | 'parallel', children: SLAItem[], extra: Partial<SLAItem> = {}): SLAItem => ({
  id,
  name: id,
  type: 'group',
  config,
  children,
  ...extra,
});

// Base failure frequency of a single component (failures per year)
const baseFrequency = (sla: number, mttr: number) => ((1 - sla / 100) * YEAR_MINUTES) / mttr;

const expectConsistent = (item: SLAItem) => {
  const rel = calculateReliability(item);
  // frequency × MTTR must equal the expected yearly downtime of the headline SLA
  expect(rel.sla).toBeCloseTo(calculateSLA(item), 10);
  expect(rel.frequency * rel.mttr).toBeCloseTo((1 - rel.sla / 100) * YEAR_MINUTES, 6);
};

describe('calculateSLA', () => {
  it('multiplies availabilities in series', () => {
    const root = group('root', 'series', [component('a', 99.9), component('b', 99.9)]);
    expect(calculateSLA(root)).toBeCloseTo(99.9 * 0.999, 10);
  });

  it('computes 1-out-of-2 replicas', () => {
    expect(calculateSLA(component('a', 99, { replicas: 2 }))).toBeCloseTo(99.99, 10);
  });

  it('computes 2-out-of-3 replicas', () => {
    const p = 0.99;
    const expected = (3 * p ** 2 - 2 * p ** 3) * 100;
    expect(calculateSLA(component('a', 99, { replicas: 3, minReplicasRequired: 2 }))).toBeCloseTo(expected, 10);
  });

  it('only applies failover reliability when the primary fails', () => {
    const root = group('root', 'parallel', [component('a', 99), component('b', 99)], { failoverSla: 99 });
    // Fails if primary is down and either failover fails or the standby is also down
    const expected = (1 - 0.01 * (0.01 + 0.99 * 0.01)) * 100;
    expect(calculateSLA(root)).toBeCloseTo(expected, 10);
  });

  it('is zero when chaos failures exceed tolerated replicas', () => {
    expect(calculateSLA(component('a', 99.9, { replicas: 3, minReplicasRequired: 2, failedReplicas: 2 }))).toBe(0);
  });
});

describe('calculateReliability', () => {
  it('matches calculateSLA for parallel groups with failover (bug #1)', () => {
    const root = group('root', 'parallel', [component('a', 99.9), component('b', 99.9)], { failoverSla: 99 });
    expect(calculateReliability(root).sla).toBeCloseTo(calculateSLA(root), 10);
    expect(calculateReliability(root).sla).toBeGreaterThan(99.99);
  });

  it('combines parallel frequencies using each child MTTR (bug #2)', () => {
    const a = component('a', 99, { mttr: 30 });
    const b = component('b', 99.9, { mttr: 240 });
    const root = group('root', 'parallel', [a, b]);
    const expected = baseFrequency(99, 30) * 0.001 + baseFrequency(99.9, 240) * 0.01;
    expect(calculateReliability(root).frequency).toBeCloseTo(expected, 10);
    expectConsistent(root);
  });

  it('respects minChildrenRequired for parallel frequency (bug #2)', () => {
    const children = [component('a', 99), component('b', 99), component('c', 99)];
    const oneOfThree = calculateReliability(group('g1', 'parallel', children));
    const twoOfThree = calculateReliability(group('g2', 'parallel', children, { minChildrenRequired: 2 }));
    expect(twoOfThree.frequency).toBeGreaterThan(oneOfThree.frequency * 10);
  });

  it('gives the 1-out-of-2 replica frequency and halves MTTR', () => {
    const rel = calculateReliability(component('a', 99, { replicas: 2, mttr: 60 }));
    expect(rel.frequency).toBeCloseTo(2 * baseFrequency(99, 60) * 0.01, 10);
    expect(rel.mttr).toBeCloseTo(30, 10);
  });

  it('gives the 2-out-of-3 replica frequency (bug #3)', () => {
    const p = 0.99;
    const rel = calculateReliability(component('a', 99, { replicas: 3, minReplicasRequired: 2, mttr: 60 }));
    // System fails when any of 3 replicas fails while exactly one other is down: 3·f·2pq
    expect(rel.frequency).toBeCloseTo(3 * baseFrequency(99, 60) * 2 * p * (1 - p), 10);
  });

  it('keeps frequency × MTTR consistent with SLA for nested trees', () => {
    const root = group('root', 'series', [
      component('dns', 99.99, { mttr: 15 }),
      group('web', 'parallel', [component('w1', 99.5, { mttr: 45 }), component('w2', 99.9, { mttr: 90 })], { failoverSla: 99.5 }),
      group('db', 'parallel', [component('d1', 99.9), component('d2', 99.9), component('d3', 99.9)], { minChildrenRequired: 2 }),
      component('cache', 99.9, { replicas: 4, minReplicasRequired: 3, mttr: 20 }),
      group('az', 'series', [component('x', 99.95)], { replicas: 3, minReplicasRequired: 2 }),
    ]);
    expectConsistent(root);
  });

  it('reports zero frequency when a component is perfect', () => {
    expect(calculateReliability(component('a', 100)).frequency).toBe(0);
  });
});

describe('runMonteCarlo', () => {
  it('produces a mean downtime matching the analytical SLA', () => {
    const root = group('root', 'series', [
      component('a', 99, { mttr: 60 }),
      group('p', 'parallel', [component('b', 98, { mttr: 120 }), component('c', 98, { mttr: 30 })], { failoverSla: 95 }),
    ]);
    const rel = calculateReliability(root);
    const result = runMonteCarlo(rel, 99.9, 20000);
    const expected = (1 - calculateSLA(root) / 100) * YEAR_MINUTES;
    expect(result.meanDowntime).toBeGreaterThan(expected * 0.97);
    expect(result.meanDowntime).toBeLessThan(expected * 1.03);
  });

  it('treats a hard-down system as down for the whole year', () => {
    const rel = calculateReliability(component('a', 99.9, { failedReplicas: 1 }));
    const result = runMonteCarlo(rel, 99.9, 100);
    expect(result.meanDowntime).toBeCloseTo(YEAR_MINUTES, 6);
    expect(result.breachProbability).toBe(100);
  });
});

describe('optional items', () => {
  it('excludes an optional child from a parallel group instead of treating it as perfect', () => {
    const root = group('root', 'parallel', [component('a', 99), component('b', 99.9, { isOptional: true })]);
    expect(calculateSLA(root)).toBeCloseTo(99, 10);
  });

  it('does not let an optional primary bypass failover', () => {
    const root = group('root', 'parallel', [
      component('opt', 99, { isOptional: true }),
      component('a', 99),
      component('b', 99),
    ], { failoverSla: 90 });
    const expected = (1 - 0.01 * (0.1 + 0.9 * 0.01)) * 100;
    expect(calculateSLA(root)).toBeCloseTo(expected, 10);
  });

  it('ignores optional children in DR metrics', () => {
    const root = group('root', 'parallel', [
      component('a', 99, { rto: 30, rpo: 5 }),
      component('b', 99, { isOptional: true, rto: 1, rpo: 1 }),
    ]);
    expect(calculateDRMetrics(root)).toEqual({ rto: 30, rpo: 5 });
  });

  it('gives an optional item no blast radius', () => {
    const root = group('root', 'series', [component('a', 99), component('b', 99, { isOptional: true })]);
    expect(getBlastRadiusMap(root).b).toBe(0);
  });
});

describe('calculateDRMetrics', () => {
  it('treats missing RTO/RPO as unknown rather than zero', () => {
    const root = group('root', 'parallel', [component('a', 99, { rto: 30, rpo: 5 }), component('b', 99)]);
    expect(calculateDRMetrics(root)).toEqual({ rto: 30, rpo: 5 });
  });

  it('sums defined RTOs and takes the max RPO in series', () => {
    const root = group('root', 'series', [
      component('a', 99, { rto: 30, rpo: 5 }),
      component('b', 99, { rto: 10 }),
      component('c', 99, { rpo: 60 }),
    ]);
    expect(calculateDRMetrics(root)).toEqual({ rto: 40, rpo: 60 });
  });

  it('is undefined when nothing defines it', () => {
    expect(calculateDRMetrics(group('root', 'series', [component('a', 99)]))).toEqual({ rto: undefined, rpo: undefined });
  });

  it('keeps an explicit zero', () => {
    const root = group('root', 'parallel', [component('a', 99, { rto: 0 }), component('b', 99, { rto: 30 })]);
    expect(calculateDRMetrics(root).rto).toBe(0);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [0.001, '< 1s'],
    [0.5, '30s'],
    [0.999, '1m'],
    [1.995, '2m'],
    [59.999, '1h'],
    [90, '1h 30m'],
    [24 * 60 + 0.5, '1d 30s'],
  ])('formats %f minutes as %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe('formatSLAPercentage', () => {
  it.each([
    [100, '100'],
    [0, '0'],
    [99.9, '99.9'],
    [99.95, '99.95'],
    [99.12345, '99.12'],
    [99.99912, '99.99912'],
    [99, '99'],
    [50.256, '50.25'],
    [99.9999999999999, '99.999999999999'],
  ])('formats %f as %s', (value, expected) => {
    expect(formatSLAPercentage(value)).toBe(expected);
  });
});
