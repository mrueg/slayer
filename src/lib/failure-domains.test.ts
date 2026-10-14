import { describe, expect, it } from 'vitest';
import {
  FailureDomain,
  SLAItem,
  calculateReliability,
  calculateSLA,
  getBlastRadiusMap,
  getCalculationSteps,
  getDomainImpact,
} from './sla-calculator';
import { parseConfig } from './config';

const YEAR_MINUTES = 365.25 * 24 * 60;

const component = (id: string, sla: number, extra: Partial<SLAItem> = {}): SLAItem => ({ id, name: id, type: 'component', sla, ...extra });
const group = (id: string, config: 'series' | 'parallel', children: SLAItem[], extra: Partial<SLAItem> = {}): SLAItem => ({
  id, name: id, type: 'group', config, children, ...extra,
});
const zone = (id: string, sla = 99.9, mttr = 120): FailureDomain => ({ id, name: id, sla, mttr });

describe('failure domains', () => {
  it('ignores domains nobody references', () => {
    const plain = group('root', 'parallel', [component('a', 99.9), component('b', 99.9)]);
    const withUnused = { ...plain, failureDomains: [zone('az1')] };
    expect(calculateSLA(withUnused)).toBeCloseTo(calculateSLA(plain), 12);
  });

  it('makes replicas in one zone fail together', () => {
    const root = group('root', 'parallel', [
      component('a', 99.9, { domains: ['az1'] }),
      component('b', 99.9, { domains: ['az1'] }),
    ], { failureDomains: [zone('az1', 99.9)] });
    const expected = 0.999 * (1 - 0.001 ** 2) * 100;
    expect(calculateSLA(root)).toBeCloseTo(expected, 10);
  });

  it('spreading across zones beats a single zone', () => {
    const domains = [zone('az1', 99.9), zone('az2', 99.9)];
    const sameZone = group('root', 'parallel', [
      component('a', 99.9, { domains: ['az1'] }), component('b', 99.9, { domains: ['az1'] }),
    ], { failureDomains: domains });
    const spread = group('root', 'parallel', [
      component('a', 99.9, { domains: ['az1'] }), component('b', 99.9, { domains: ['az2'] }),
    ], { failureDomains: domains });
    const up = 0.999 * 0.999;
    expect(calculateSLA(spread)).toBeCloseTo((1 - (1 - up) ** 2) * 100, 10);
    expect(calculateSLA(spread)).toBeGreaterThan(calculateSLA(sameZone));
  });

  it('applies a domain on a group to everything inside it', () => {
    const tagged = group('root', 'series', [
      group('pool', 'parallel', [component('a', 99.9), component('b', 99.9)], { domains: ['region'] }),
    ], { failureDomains: [zone('region', 99.95)] });
    expect(calculateSLA(tagged)).toBeCloseTo(0.9995 * (1 - 0.001 ** 2) * 100, 10);
  });

  it('derives the failure frequency by hand for redundancy in one zone and across zones', () => {
    const p = 0.995;
    const zoneAvailability = 0.999;
    const componentFrequency = ((1 - p) * YEAR_MINUTES) / 30;
    const zoneFrequency = ((1 - zoneAvailability) * YEAR_MINUTES) / 60;
    const domains = [zone('az1', 99.9, 60), zone('az2', 99.9, 60)];

    // One zone: A = A_z (1 - (1 - p)^2); Birnbaum over the zone and both components
    const sameZone = group('root', 'parallel', [
      component('a', 99.5, { domains: ['az1'], mttr: 30 }), component('b', 99.5, { domains: ['az1'], mttr: 30 }),
    ], { failureDomains: domains });
    const sameExpected = zoneFrequency * (1 - (1 - p) ** 2) + 2 * componentFrequency * zoneAvailability * (1 - p);
    expect(calculateReliability(sameZone).frequency).toBeCloseTo(sameExpected, 10);

    // Two zones: each path is up with A_z p; A = 1 - (1 - A_z p)^2
    const spread = group('root', 'parallel', [
      component('a', 99.5, { domains: ['az1'], mttr: 30 }), component('b', 99.5, { domains: ['az2'], mttr: 30 }),
    ], { failureDomains: domains });
    const pathDown = 1 - zoneAvailability * p;
    const spreadExpected = 2 * componentFrequency * zoneAvailability * pathDown + 2 * zoneFrequency * p * pathDown;
    expect(calculateReliability(spread).frequency).toBeCloseTo(spreadExpected, 10);
  });

  it('counts a domain failure once, not once per tagged item', () => {
    const root = group('root', 'series', [
      component('a', 100, { domains: ['az1'] }), component('b', 100, { domains: ['az1'] }), component('c', 100, { domains: ['az1'] }),
    ], { failureDomains: [zone('az1', 99.9, 60)] });
    const rel = calculateReliability(root);
    expect(rel.frequency).toBeCloseTo((0.001 * YEAR_MINUTES) / 60, 10);
    expect(rel.mttr).toBeCloseTo(60, 8);
  });

  it('shows up in the blast radius of the shared item and the calculation steps', () => {
    const root = group('root', 'parallel', [
      component('a', 99.9, { domains: ['az1'] }), component('b', 99.9, { domains: ['az1'] }),
    ], { failureDomains: [zone('az1', 99.9)] });
    // Losing a leaves the system up only if the zone and b are up
    const p = 0.999;
    const zoneAvailability = 0.999;
    const availability = zoneAvailability * (1 - (1 - p) ** 2);
    expect(getBlastRadiusMap(root).a).toBeCloseTo((availability - zoneAvailability * p) / availability, 12);
    const steps = getCalculationSteps(root);
    const last = steps[steps.length - 1];
    expect(last.name).toBe('Shared failure domains');
    expect(last.result).toBeCloseTo(calculateSLA(root), 10);
    expect(steps[steps.length - 2].result).toBeGreaterThan(last.result);
  });

  it('reports what each domain costs and leaves standing', () => {
    const root = group('root', 'parallel', [
      component('a', 99.9, { domains: ['az1'] }), component('b', 99.9, { domains: ['az2'] }),
    ], { failureDomains: [zone('az1', 99.9), zone('az2', 99.9), zone('unused', 99)] });
    const impact = getDomainImpact(root);
    const az1 = impact.find(d => d.id === 'az1')!;
    expect(az1.itemCount).toBe(1);
    expect(az1.slaWhileDown).toBeCloseTo(99.9 * 0.999, 8);
    expect(az1.downtimePerYear).toBeGreaterThan(0);
    expect(impact.find(d => d.id === 'unused')).toMatchObject({ itemCount: 0, downtimePerYear: 0 });
  });

  it('stays exact enough with many domains', () => {
    const domains = Array.from({ length: 12 }, (_, i) => zone(`z${i}`, 99.99));
    const root = group('root', 'series', domains.map(d => component(d.id, 100, { domains: [d.id] })), { failureDomains: domains });
    expect(calculateSLA(root)).toBeCloseTo(0.9999 ** 12 * 100, 9);
  });
});

describe('parseConfig with failure domains', () => {
  it('keeps domain definitions and references', () => {
    const config = {
      id: 'root', name: 'r', type: 'group', config: 'series',
      failureDomains: [{ id: 'az1', name: 'AZ 1', sla: 99.99, mttr: 60 }],
      children: [{ id: 'a', name: 'a', type: 'component', sla: 99.9, domains: ['az1'] }],
    };
    expect(parseConfig(config)).toEqual(config);
  });

  it('drops references to undefined domains', () => {
    const parsed = parseConfig({ id: 'root', type: 'group', children: [{ id: 'a', type: 'component', domains: ['ghost'] }] });
    expect(parsed.children?.[0].domains).toBeUndefined();
  });

  it.each([
    [{ failureDomains: 'x' }, 'root.failureDomains must be an array'],
    [{ failureDomains: [{ name: 'n', sla: 99 }] }, 'root.failureDomains[0].id is required'],
    [{ failureDomains: [{ id: 'a', sla: 120 }] }, 'root.failureDomains[0].sla must be between 0 and 100'],
    [{ failureDomains: [{ id: 'a', sla: 99 }, { id: 'a', sla: 99 }] }, 'is duplicated'],
    [{ domains: [1] }, 'root.domains must be an array of strings'],
  ])('rejects %j', (extra, message) => {
    expect(() => parseConfig({ id: 'root', type: 'group', ...extra })).toThrow(message);
  });
});
