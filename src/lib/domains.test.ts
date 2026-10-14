import { describe, expect, it } from 'vitest';
import { filterDomainTags, nextDomainName } from './domains';
import type { SLAItem } from './sla-calculator';

const domains = (...names: string[]) => names.map((name, i) => ({ id: `d${i}`, name, sla: 99.9 }));

describe('nextDomainName', () => {
  it('starts at Zone 1', () => {
    expect(nextDomainName([])).toBe('Zone 1');
  });

  it('does not repeat a name after a deletion', () => {
    // Zone 1 and Zone 2 were added, then Zone 1 was deleted
    expect(nextDomainName(domains('Zone 2'))).toBe('Zone 1');
    expect(nextDomainName(domains('Zone 2', 'Zone 1'))).toBe('Zone 3');
  });

  it('ignores case and surrounding spaces and leaves custom names alone', () => {
    expect(nextDomainName(domains(' zone 1 ', 'us-east-1a'))).toBe('Zone 2');
  });
});

describe('filterDomainTags', () => {
  const tree: SLAItem = {
    id: 'root', name: 'root', type: 'group', config: 'series', domains: ['a'],
    children: [
      { id: 'x', name: 'x', type: 'component', sla: 99, domains: ['a', 'b'] },
      { id: 'y', name: 'y', type: 'component', sla: 99, domains: ['b'] },
    ],
  };

  it('keeps matching tags and drops empty tag lists, without touching the input', () => {
    const result = filterDomainTags(tree, id => id !== 'b');
    expect(result.domains).toEqual(['a']);
    expect(result.children![0].domains).toEqual(['a']);
    expect(result.children![1]).not.toHaveProperty('domains');
    expect(tree.children![1].domains).toEqual(['b']);
  });
});
