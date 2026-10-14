import { describe, expect, it } from 'vitest';
import { SLAItem, calculateSLA, getCalculationSteps, getDomainImpact } from './sla-calculator';

const model: SLAItem = {
  id: 'root', name: 'root', type: 'group', config: 'series',
  failureDomains: [
    { id: 'az1', name: 'us-east-1a', sla: 99.9 },
    { id: 'backup', name: 'Backup region', sla: 99 },
  ],
  children: [
    { id: 'a', name: 'A', type: 'component', sla: 99.9, domains: ['az1'] },
    { id: 'cold', name: 'Cold Backup', type: 'component', sla: 99, isOptional: true, domains: ['backup'] },
    { id: 'reports', name: 'Reports', type: 'group', config: 'series', isOptional: true, children: [
      { id: 'r', name: 'R', type: 'component', sla: 99, domains: ['backup'] },
    ] },
  ],
};

describe('domain tags on optional items', () => {
  it('do not count as tagged items or cause downtime', () => {
    const backup = getDomainImpact(model).find(d => d.id === 'backup')!;
    expect(backup.itemCount).toBe(0);
    expect(backup.downtimePerYear).toBe(0);
    expect(getDomainImpact(model).find(d => d.id === 'az1')!.itemCount).toBe(1);
  });

  it('are left out of the calculation breakdown', () => {
    const domainStep = getCalculationSteps(model).find(step => step.name === 'Shared failure domains')!;
    expect(domainStep.formula).toBe('Conditioned on 1 failure domain');
    expect(domainStep.inputValues).toEqual(['us-east-1a: 99.9%']);
  });

  it('do not change the result', () => {
    const untag = (item: SLAItem): SLAItem => ({
      ...item,
      domains: item.domains?.filter(d => d !== 'backup'),
      children: item.children?.map(untag),
    });
    expect(calculateSLA(model)).toBe(calculateSLA(untag(model)));
  });
});
