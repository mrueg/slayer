import { describe, expect, it } from 'vitest';
import { SLAItem, findBottleneck, getDomainImpact, getSensitivityRanking } from './sla-calculator';

const component = (id: string, sla: number, extra: Partial<SLAItem> = {}): SLAItem => ({ id, name: id, type: 'component', sla, ...extra });
const group = (id: string, config: 'series' | 'parallel', children: SLAItem[], extra: Partial<SLAItem> = {}): SLAItem => ({
  id, name: id, type: 'group', config, children, ...extra,
});

describe('improvement levers with failure domains', () => {
  // Two zones, each holding one replica of a strong pair: the zones dominate
  const zoned = group('root', 'parallel', [
    component('a', 99.99, { domains: ['z1'] }),
    component('b', 99.99, { domains: ['z2'] }),
  ], { failureDomains: [{ id: 'z1', name: 'Zone 1', sla: 99 }, { id: 'z2', name: 'Zone 2', sla: 99 }] });

  it('ranks domains next to items, with the downtime they cause', () => {
    const ranking = getSensitivityRanking(zoned);
    expect(ranking.map(entry => entry.id)).toEqual(['z1', 'z2', 'a', 'b']);
    expect(ranking[0].type).toBe('domain');
    const [impact] = getDomainImpact(zoned);
    expect(ranking[0].downtimeSavedPerYear).toBeCloseTo(impact.downtimePerYear, 6);
  });

  it('marks a domain as the bottleneck when it is the top lever', () => {
    // Both zones tie; equal SLAs keep both
    expect(findBottleneck(zoned)).toMatchObject({ ids: ['z1', 'z2'] });
    const weaker = { ...zoned, failureDomains: [{ id: 'z1', name: 'Zone 1', sla: 98 }, { id: 'z2', name: 'Zone 2', sla: 99 }] };
    expect(findBottleneck(weaker).ids).toEqual(['z1']);
  });

  it('breaks ties by availability including domains', () => {
    // Improving a or b gains the same, but a is less available because of its zone
    const root = group('root', 'series', [component('a', 99.9, { domains: ['z'] }), component('b', 99.9)], {
      failureDomains: [{ id: 'z', name: 'Zone', sla: 99.99 }],
    });
    expect(findBottleneck(root).ids).toEqual(['a']);
  });
});

describe('findBottleneck', () => {
  it('uses the ranking it is given', () => {
    const root = group('root', 'series', [component('a', 99), component('b', 99.9)]);
    const ranking = getSensitivityRanking(root);
    expect(findBottleneck(root, ranking)).toEqual({ ids: ['a'], impact: ranking[0].slaGain });
  });

  it('marks nothing when no improvement helps', () => {
    const root = group('root', 'series', [component('a', 100), component('b', 100)]);
    expect(findBottleneck(root).ids).toEqual([]);
  });

  it('marks a single component model itself', () => {
    expect(findBottleneck(component('only', 99.9)).ids).toEqual(['only']);
  });

  it('skips items killed in chaos mode that redundancy covers', () => {
    const root = group('root', 'parallel', [component('a', 99, { failedReplicas: 1 }), component('b', 99.9)]);
    expect(findBottleneck(root).ids).toEqual(['b']);
  });
});
