import { describe, expect, it } from 'vitest';
import { SLAItem, calculateSLA } from './sla-calculator';
import { compileModel, planYears, simulateSystem } from './simulation';

const YEAR_MINUTES = 365.25 * 24 * 60;

const component = (id: string, sla: number, extra: Partial<SLAItem> = {}): SLAItem => ({ id, name: id, type: 'component', sla, ...extra });
const group = (id: string, config: 'series' | 'parallel', children: SLAItem[], extra: Partial<SLAItem> = {}): SLAItem => ({
  id, name: id, type: 'group', config, children, ...extra,
});

// The analytical SLA is exact for the long-run average, so the simulated mean must agree with it
const expectMeanMatchesSla = (root: SLAItem, tolerance = 0.05, iterations = 4000) => {
  const result = simulateSystem(root, 99.9, iterations, 7);
  const expected = (1 - calculateSLA(root) / 100) * YEAR_MINUTES;
  expect(result.meanDowntime).toBeGreaterThan(expected * (1 - tolerance));
  expect(result.meanDowntime).toBeLessThan(expected * (1 + tolerance));
};

// Real simulations: leave room for slow or busy machines
describe('simulateSystem agrees with the analytical SLA', { timeout: 30000 }, () => {
  it('for a series of components', () => {
    expectMeanMatchesSla(group('root', 'series', [component('a', 99, { mttr: 60 }), component('b', 99.5, { mttr: 30 })]));
  });

  it('for active/standby failover with an unreliable switch', () => {
    expectMeanMatchesSla(group('root', 'parallel', [component('a', 98, { mttr: 120 }), component('b', 98, { mttr: 30 })], { failoverSla: 95 }), 0.06);
  });

  it('for failover with switchover time', () => {
    expectMeanMatchesSla(group('root', 'parallel', [component('a', 99, { mttr: 60 }), component('b', 99, { mttr: 60 })], { failoverTime: 3 }), 0.06);
  });

  it('for k-of-n pools behind a switch', () => {
    const pool = group('root', 'parallel', [component('a', 98), component('b', 98), component('c', 98)], { minChildrenRequired: 2, failoverSla: 99.9 });
    expectMeanMatchesSla(pool, 0.08);
  });

  it('for replicas with shared failures', () => {
    expectMeanMatchesSla(component('a', 97, { mttr: 90, replicas: 3, minReplicasRequired: 2, commonCause: 10 }), 0.06);
  });

  it('for redundancy defeated by a shared failure domain', () => {
    const root = group('root', 'parallel', [
      component('a', 99, { domains: ['zone'] }),
      component('b', 99, { domains: ['zone'] }),
    ], { failureDomains: [{ id: 'zone', name: 'Zone', sla: 99.5, mttr: 120 }] });
    expectMeanMatchesSla(root, 0.06);
  });

  it('for a mixed model with optional items', () => {
    const root = group('root', 'series', [
      component('dns', 99.99, { mttr: 15 }),
      group('app', 'series', [component('api', 99.9, { replicas: 3 }), component('cache', 95, { isOptional: true })]),
      group('db', 'parallel', [component('primary', 99.5, { mttr: 45 }), component('replica', 99.5, { mttr: 45 })]),
    ]);
    expectMeanMatchesSla(root, 0.06);
  });
});

describe('simulateSystem edge cases', () => {
  it('treats a hard-down system as down for the whole year', () => {
    const result = simulateSystem(component('a', 99.9, { failedReplicas: 1 }), 99.9, 100, 1);
    expect(result.meanDowntime).toBeCloseTo(YEAR_MINUTES, 6);
    expect(result.breachProbability).toBe(100);
    expect(result.monthlyBreachProbability).toBe(100);
    expect(result.breachedMonthsPerYear).toBe(12);
  });

  it('has no downtime for a perfect system', () => {
    const result = simulateSystem(group('root', 'series', [component('a', 100), component('b', 100)]), 99.9, 100, 1);
    expect(result.meanDowntime).toBe(0);
    expect(result.monthlyBreachProbability).toBe(0);
  });

  it('reproduces a run from its seed and differs for other seeds', () => {
    const root = group('root', 'series', [component('a', 99, { mttr: 60 }), component('b', 99.5, { mttr: 30 })]);
    const first = simulateSystem(root, 99.9, 500);
    expect(simulateSystem(root, 99.9, 500, first.seed)).toEqual(first);
    expect(simulateSystem(root, 99.9, 500, 1).distribution).not.toEqual(simulateSystem(root, 99.9, 500, 2).distribution);
  });

  it('plans fewer years for very flaky models', () => {
    // Each replica fails about every 2 hours: tens of thousands of events per simulated year
    const flaky = compileModel(component('a', 99, { mttr: 1, replicas: 3, minReplicasRequired: 2 })).processes;
    expect(planYears(flaky, 10000)).toBeLessThan(10000);
    expect(planYears(flaky, 10000)).toBeGreaterThan(0);
    // Ordinary models get every requested year
    expect(planYears(compileModel(component('a', 99.9)).processes, 10000)).toBe(10000);
    // Always at least one year, however flaky
    expect(planYears([{ unavailability: 0.5, mttr: 1e-6 }], 10000)).toBe(1);
  });

  it('reports the years it simulated', () => {
    const result = simulateSystem(component('a', 99.9), 99.9, 300, 3);
    expect(result.iterations).toBe(300);
    expect(result.distribution).toHaveLength(300);
  });
});

describe('simulateSystem timing effects', () => {
  it('shares one process per failure domain across every item tagged with it', () => {
    const root = group('root', 'series', [component('a', 99, { domains: ['zone'] }), component('b', 99, { domains: ['zone'] })], {
      failureDomains: [{ id: 'zone', name: 'Zone', sla: 99.9 }],
    });
    // a, b and one zone
    expect(compileModel(root).processes).toHaveLength(3);
  });

  it('gives replicas their own processes and shared failures one more', () => {
    expect(compileModel(component('a', 99, { replicas: 3 })).processes).toHaveLength(3);
    expect(compileModel(component('a', 99, { replicas: 3, commonCause: 20 })).processes).toHaveLength(4);
  });
});

describe('simulateSystem monthly breaches', () => {
  // About 52 minutes of downtime a year in hour-long outages: a whole year's budget fits, single months often don't
  const root = component('a', 99.99, { mttr: 60 });

  it('is at least as likely to breach in some month as over the whole year', () => {
    const result = simulateSystem(root, 99.99, 3000, 5);
    expect(result.monthlyBreachProbability).toBeGreaterThanOrEqual(result.breachProbability);
    // One outage of ~1 hour exceeds a month's 4m 23s budget, so most years have a breached month
    expect(result.monthlyBreachProbability).toBeGreaterThan(result.breachProbability + 20);
  });

  it('counts breached months per year consistently with the share of years', () => {
    const result = simulateSystem(root, 99.99, 3000, 5);
    expect(result.breachedMonthsPerYear).toBeGreaterThanOrEqual(result.monthlyBreachProbability / 100);
    expect(result.breachedMonthsPerYear).toBeLessThanOrEqual(12);
  });
});
