import { describe, expect, it } from 'vitest';
import { searchTree } from './search';
import type { SLAItem } from './sla-calculator';

const root: SLAItem = {
  id: 'root',
  name: 'Cloud',
  type: 'group',
  config: 'series',
  children: [
    { id: 'dns', name: 'Global DNS', type: 'component', sla: 99.99 },
    {
      id: 'data',
      name: 'Data Tier',
      type: 'group',
      config: 'parallel',
      children: [
        { id: 'primary', name: 'Aurora Primary', type: 'component', sla: 99.95 },
        { id: 'replica', name: 'Aurora Replica', type: 'component', sla: 99.95 },
      ],
    },
    {
      id: 'app',
      name: 'Application',
      type: 'group',
      config: 'series',
      children: [{ id: 'cache', name: 'Cache', type: 'group', config: 'series', children: [{ id: 'redis', name: 'Redis', type: 'component', sla: 99.9 }] }],
    },
  ],
};

const sorted = (ids: Set<string>) => [...ids].sort();

describe('searchTree', () => {
  it('returns null for a blank query', () => {
    expect(searchTree(root, '')).toBeNull();
    expect(searchTree(root, '   ')).toBeNull();
  });

  it('matches names case-insensitively and shows the groups leading to them', () => {
    const result = searchTree(root, 'REDIS')!;
    expect(sorted(result.matchIds)).toEqual(['redis']);
    expect(sorted(result.visibleIds)).toEqual(['app', 'cache', 'redis', 'root']);
    // Open so the match can be seen even if collapsed
    expect(sorted(result.openIds)).toEqual(['app', 'cache', 'root']);
  });

  it('shows everything inside a matching group without forcing it open', () => {
    const result = searchTree(root, 'data')!;
    expect(sorted(result.matchIds)).toEqual(['data']);
    expect(sorted(result.visibleIds)).toEqual(['data', 'primary', 'replica', 'root']);
    expect(sorted(result.openIds)).toEqual(['root']);
  });

  it('finds several matches across groups', () => {
    const result = searchTree(root, 'aurora')!;
    expect(sorted(result.matchIds)).toEqual(['primary', 'replica']);
    expect(result.visibleIds.has('dns')).toBe(false);
    expect(result.visibleIds.has('app')).toBe(false);
  });

  it('keeps only the root when nothing matches', () => {
    const result = searchTree(root, 'kafka')!;
    expect(result.matchIds.size).toBe(0);
    expect(sorted(result.visibleIds)).toEqual(['root']);
  });

  it('keeps the trimmed query for display', () => {
    expect(searchTree(root, '  dns ')!.query).toBe('dns');
  });
});
