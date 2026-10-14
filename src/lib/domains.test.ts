import { describe, expect, it } from 'vitest';
import { nextDomainName } from './domains';

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
