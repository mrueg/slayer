import { describe, expect, it } from 'vitest';
import { normalizeDomain, normalizeItem } from './normalize';

describe('normalizeItem', () => {
  it('clamps percentages', () => {
    expect(normalizeItem({ id: 'a', name: 'a', type: 'component', sla: 120, failoverSla: -5 })).toMatchObject({ sla: 100, failoverSla: 0 });
  });

  it('lowers Min UP and failed replicas when replicas shrink', () => {
    const item = normalizeItem({ id: 'a', name: 'a', type: 'component', replicas: 2, minReplicasRequired: 4, failedReplicas: 3 });
    expect(item).toMatchObject({ replicas: 2, minReplicasRequired: 2, failedReplicas: 2 });
  });

  it('caps minChildrenRequired at the number of children', () => {
    const item = normalizeItem({
      id: 'g', name: 'g', type: 'group', config: 'parallel', minChildrenRequired: 5,
      children: [{ id: 'a', name: 'a', type: 'component' }, { id: 'b', name: 'b', type: 'component' }],
    });
    expect(item.minChildrenRequired).toBe(2);
  });

  it('keeps replicas within 1-99', () => {
    expect(normalizeItem({ id: 'a', name: 'a', type: 'component', replicas: 0 }).replicas).toBe(1);
    expect(normalizeItem({ id: 'a', name: 'a', type: 'component', replicas: 500 }).replicas).toBe(99);
  });
});

describe('normalizeDomain', () => {
  it('clamps the SLA and keeps the MTTR a whole number of at least 1 minute', () => {
    expect(normalizeDomain({ id: 'z', name: 'z', sla: 120, mttr: 0.4 })).toEqual({ id: 'z', name: 'z', sla: 100, mttr: 1 });
    expect(normalizeDomain({ id: 'z', name: 'z', sla: -1, mttr: 90.7 })).toEqual({ id: 'z', name: 'z', sla: 0, mttr: 90 });
    expect(normalizeDomain({ id: 'z', name: 'z', sla: 99.9 })).toEqual({ id: 'z', name: 'z', sla: 99.9 });
  });
});
