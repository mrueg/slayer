import { describe, expect, it } from 'vitest';
import { normalizeItem } from './normalize';

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
