import { describe, expect, it } from 'vitest';
import { SLAItem, calculateReliability, getDomainMttr } from './sla-calculator';

describe('getDomainMttr', () => {
  it('returns the configured MTTR', () => {
    expect(getDomainMttr({ id: 'z', name: 'z', sla: 99.9, mttr: 45 })).toBe(45);
  });

  it.each([undefined, 0, -5])('falls back to the default for %s', mttr => {
    expect(getDomainMttr({ id: 'z', name: 'z', sla: 99.9, mttr })).toBe(120);
  });

  it('is what the calculation uses', () => {
    const model = (mttr?: number): SLAItem => ({
      id: 'root', name: 'root', type: 'group', config: 'series',
      failureDomains: [{ id: 'z', name: 'z', sla: 99.9, mttr }],
      children: [{ id: 'a', name: 'a', type: 'component', sla: 100, domains: ['z'] }],
    });
    // Only the domain can fail, so the system MTTR is the domain MTTR
    expect(calculateReliability(model(0)).mttr).toBeCloseTo(getDomainMttr({ id: 'z', name: 'z', sla: 99.9, mttr: 0 }), 8);
    expect(calculateReliability(model(45)).mttr).toBeCloseTo(45, 8);
  });
});
