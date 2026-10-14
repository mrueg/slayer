import { describe, expect, it } from 'vitest';
import { SLAItem, getItemSLAs } from './sla-calculator';

describe('getItemSLAs', () => {
  it('gives every item its SLA with the root failure domains applied', () => {
    const root: SLAItem = {
      id: 'root', name: 'root', type: 'group', config: 'series',
      failureDomains: [{ id: 'z', name: 'Zone', sla: 99.9 }],
      children: [
        { id: 'a', name: 'a', type: 'component', sla: 99.9, domains: ['z'] },
        { id: 'pool', name: 'pool', type: 'group', config: 'parallel', children: [
          { id: 'b', name: 'b', type: 'component', sla: 99 },
          { id: 'c', name: 'c', type: 'component', sla: 99 },
        ] },
        { id: 'extra', name: 'extra', type: 'component', sla: 90, isOptional: true },
      ],
    };
    const slas = getItemSLAs(root);
    expect(Object.keys(slas).sort()).toEqual(['a', 'b', 'c', 'extra', 'pool', 'root']);
    expect(slas.a).toBeCloseTo(99.9 * 0.999, 10); // the zone applies to a on its own too
    expect(slas.pool).toBeCloseTo((1 - 0.01 ** 2) * 100, 10);
    expect(slas.b).toBeCloseTo(99, 10);
    expect(slas.extra).toBe(100); // optional items are left out of the calculation
    expect(slas.root).toBeCloseTo(0.999 * 0.999 * (1 - 0.01 ** 2) * 100, 10);
  });
});
