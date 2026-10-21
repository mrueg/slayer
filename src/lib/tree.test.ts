import { describe, expect, it } from 'vitest';
import { findAncestorIds, findNestedGroupIds } from './tree';
import type { SLAItem } from './sla-calculator';

const root: SLAItem = {
  id: 'root',
  name: 'System',
  type: 'group',
  config: 'series',
  children: [
    { id: 'dns', name: 'DNS', type: 'component', sla: 99.99 },
    {
      id: 'app',
      name: 'App',
      type: 'group',
      config: 'series',
      children: [
        { id: 'db', name: 'DB', type: 'group', config: 'parallel', children: [{ id: 'primary', name: 'Primary', type: 'component', sla: 99.95 }] },
      ],
    },
  ],
};

describe('findAncestorIds', () => {
  it('lists the containing groups, outermost first', () => {
    expect(findAncestorIds(root, 'primary')).toEqual(['root', 'app', 'db']);
    expect(findAncestorIds(root, 'dns')).toEqual(['root']);
  });

  it('returns no ancestors for the root and undefined for unknown ids', () => {
    expect(findAncestorIds(root, 'root')).toEqual([]);
    expect(findAncestorIds(root, 'missing')).toBeUndefined();
  });
});

describe('findNestedGroupIds', () => {
  it('lists every group below the root, but not the root or components', () => {
    expect(findNestedGroupIds(root)).toEqual(['app', 'db']);
  });

  it('is empty for a model without nested groups', () => {
    expect(findNestedGroupIds({ ...root, children: [{ id: 'dns', name: 'DNS', type: 'component', sla: 99.99 }] })).toEqual([]);
  });
});
