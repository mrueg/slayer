import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from './config';

describe('parseConfig', () => {
  it('accepts a valid configuration', () => {
    const sample = {
      id: 'root', name: 'Root', type: 'group', config: 'parallel', minChildrenRequired: 1,
      children: [{ id: 'a', name: 'A', type: 'component', sla: 99.9, replicas: 3, minReplicasRequired: 2, rto: 30 }],
    };
    expect(parseConfig(sample)).toEqual(sample);
  });

  it.each([
    [null, 'root must be an object'],
    [[], 'root must be an object'],
    [{ id: 'x', type: 'service' }, 'root.type'],
    [{ id: 'x', type: 'group', children: 'nope' }, 'root.children must be an array'],
    [{ id: 'x', type: 'group', children: [{ id: 'y', type: 'component', sla: '99.9' }] }, 'root.children[0].sla'],
    [{ id: 'x', type: 'component', name: 42 }, 'root.name'],
    [{ id: 'x', type: 'component', sla: 120 }, 'root.sla must be between 0 and 100'],
    [{ id: 'x', type: 'component', replicas: 0 }, 'root.replicas must be between 1 and 99'],
    [{ id: 'x', type: 'component', failureDomains: Array.from({ length: 11 }, (_, i) => ({ id: `z${i}`, sla: 99.9 })) }, 'root.failureDomains can have at most 10 domains'],
  ])('rejects %j', (input, message) => {
    expect(() => parseConfig(input)).toThrow(ConfigError);
    expect(() => parseConfig(input)).toThrow(message);
  });

  it('drops unknown fields and invalid enums', () => {
    const parsed = parseConfig({ id: 'x', type: 'component', evil: '<script>', inputMode: 'bogus' });
    expect(parsed).toEqual({ id: 'x', name: '', type: 'component' });
  });

  it('replaces duplicate and missing ids', () => {
    const parsed = parseConfig({
      id: 'root', type: 'group', children: [
        { id: 'dup', type: 'component' },
        { id: 'dup', type: 'component' },
        { type: 'component' },
      ],
    });
    const ids = [parsed.id, ...(parsed.children || []).map(c => c.id)];
    expect(new Set(ids).size).toBe(4);
    expect(parsed.children?.[0].id).toBe('dup');
  });

  it('defaults group config to series', () => {
    expect(parseConfig({ id: 'g', type: 'group' })).toMatchObject({ config: 'series', children: [] });
  });

  it('rejects excessively deep nesting', () => {
    let node: Record<string, unknown> = { id: 'leaf', type: 'component' };
    for (let i = 0; i < 100; i++) node = { id: `g${i}`, type: 'group', children: [node] };
    expect(() => parseConfig(node)).toThrow(ConfigError);
  });
});
