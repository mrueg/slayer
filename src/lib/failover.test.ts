import { describe, expect, it } from 'vitest';
import { SLAItem, calculateReliability, calculateSLA, runMonteCarlo } from './sla-calculator';

const YEAR_MINUTES = 365.25 * 24 * 60;

const component = (id: string, sla: number, extra: Partial<SLAItem> = {}): SLAItem => ({ id, name: id, type: 'component', sla, ...extra });
const group = (id: string, config: 'series' | 'parallel', children: SLAItem[], extra: Partial<SLAItem> = {}): SLAItem => ({
  id, name: id, type: 'group', config, children, ...extra,
});
const baseFrequency = (sla: number, mttr: number) => ((1 - sla / 100) * YEAR_MINUTES) / mttr;

describe('failover switchover time', () => {
  const pair = (extra: Partial<SLAItem> = {}) =>
    group('root', 'parallel', [component('primary', 99, { mttr: 60 }), component('standby', 99, { mttr: 60 })], extra);

  it('changes nothing at 0 minutes', () => {
    expect(calculateReliability(pair({ failoverTime: 0 }))).toEqual(calculateReliability(pair()));
  });

  it('adds one outage of the switchover time per successful failover', () => {
    const failovers = baseFrequency(99, 60) * 0.99; // primary failures while the standby is up
    const without = calculateReliability(pair());
    const withSwitch = calculateReliability(pair({ failoverTime: 2 }));
    expect(withSwitch.frequency - without.frequency).toBeCloseTo(failovers, 10);
    expect(without.sla - withSwitch.sla).toBeCloseTo(((failovers * 2) / YEAR_MINUTES) * 100, 10);
  });

  it('only counts failovers that succeed', () => {
    const failovers = baseFrequency(99, 60) * 0.9 * 0.99;
    const delta = calculateReliability(pair({ failoverTime: 5, failoverSla: 90 })).frequency - calculateReliability(pair({ failoverSla: 90 })).frequency;
    expect(delta).toBeCloseTo(failovers, 10);
  });

  it('does not apply to k-of-n pools or single-child groups', () => {
    const pool = group('root', 'parallel', [component('a', 99), component('b', 99), component('c', 99)], { minChildrenRequired: 2 });
    expect(calculateSLA({ ...pool, failoverTime: 5 })).toBe(calculateSLA(pool));
    const single = group('root', 'parallel', [component('a', 99)]);
    expect(calculateSLA({ ...single, failoverTime: 5 })).toBe(calculateSLA(single));
  });

  it('flows into the Monte Carlo simulation', () => {
    const rel = calculateReliability(pair({ failoverTime: 3 }));
    const result = runMonteCarlo(rel, 99.9, 20000, 11);
    const expected = (1 - rel.sla / 100) * YEAR_MINUTES;
    expect(result.meanDowntime).toBeGreaterThan(expected * 0.95);
    expect(result.meanDowntime).toBeLessThan(expected * 1.05);
  });
});
