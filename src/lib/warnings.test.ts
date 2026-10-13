import { describe, expect, it } from 'vitest';
import type { SLAItem } from './sla-calculator';
import { getModelWarnings } from './warnings';

const component = (id: string, sla: number, extra: Partial<SLAItem> = {}): SLAItem => ({ id, name: id, type: 'component', sla, ...extra });
const group = (id: string, config: 'series' | 'parallel', children: SLAItem[], extra: Partial<SLAItem> = {}): SLAItem => ({
  id, name: id, type: 'group', config, children, ...extra,
});
const messagesFor = (root: SLAItem, id: string) => getModelWarnings(root).filter(w => w.itemId === id).map(w => w.message);

describe('getModelWarnings', () => {
  it('is quiet for a sensible model', () => {
    const root = group('root', 'series', [
      component('a', 99.9, { replicas: 3, minReplicasRequired: 2, rto: 5, mttr: 60 }),
      group('pool', 'parallel', [component('b', 99.9), component('c', 99.9)]),
    ]);
    expect(getModelWarnings(root)).toEqual([]);
  });

  it('flags replicas that must all be up', () => {
    const root = group('root', 'series', [component('a', 99.9, { replicas: 3, minReplicasRequired: 3 })]);
    expect(messagesFor(root, 'a')[0]).toContain('All 3 replicas must be up');
  });

  it('flags 100% components', () => {
    const root = group('root', 'series', [component('a', 100)]);
    expect(getModelWarnings(root)).toMatchObject([{ itemId: 'a', severity: 'info' }]);
  });

  it('flags empty groups, including groups with only optional children', () => {
    const root = group('root', 'series', [
      component('a', 99.9),
      group('empty', 'series', []),
      group('optionalOnly', 'series', [component('o', 99, { isOptional: true })]),
    ]);
    expect(getModelWarnings(root).map(w => w.itemId)).toEqual(['empty', 'optionalOnly']);
  });

  it('flags parallel groups that need every child', () => {
    const root = group('root', 'parallel', [component('a', 99.9), component('b', 99.9)], { minChildrenRequired: 2 });
    expect(messagesFor(root, 'root')[0]).toBe('Both children must be up, so this parallel group behaves like a series group.');
  });

  it('flags parallel groups with a single critical child', () => {
    const root = group('root', 'parallel', [component('a', 99.9), component('b', 99.9, { isOptional: true })]);
    expect(messagesFor(root, 'root')[0]).toContain('single critical child');
  });

  it('flags a weak primary behind imperfect failover', () => {
    const weakPrimary = group('root', 'parallel', [component('weak', 99), component('strong', 99.99)], { failoverSla: 99 });
    expect(messagesFor(weakPrimary, 'root')[0]).toContain('The primary (weak) is less available than strong');
    const perfectFailover = group('root', 'parallel', [component('weak', 99), component('strong', 99.99)]);
    expect(getModelWarnings(perfectFailover)).toEqual([]);
  });

  it('skips optional subtrees', () => {
    const root = group('root', 'series', [
      component('a', 99.9),
      group('opt', 'series', [component('b', 100)], { isOptional: true }),
    ]);
    expect(getModelWarnings(root)).toEqual([]);
  });
});
