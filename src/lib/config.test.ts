import { describe, expect, it } from 'vitest';
import type { SLAItem } from './sla-calculator';
import {
  decodeShareHash,
  encodeShareHash,
} from './config';

const sample: SLAItem = {
  id: 'root',
  name: 'Système → Ünïcødé 🚀',
  type: 'group',
  config: 'series',
  children: [
    { id: 'a', name: 'API', type: 'component', sla: 99.9, notes: 'naïve “quotes”', failedReplicas: 1 },
    { id: 'g', name: 'Pool', type: 'group', config: 'parallel', children: [
      { id: 'b', name: 'B', type: 'component', sla: 99.5, replicas: 3, failedReplicas: 2 },
    ] },
  ],
};

describe('share hash', () => {
  it('round-trips non-Latin-1 text', () => {
    const encoded = encodeShareHash(sample);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeShareHash(encoded)).toEqual(sample);
  });

  it('accepts a leading #', () => {
    expect(decodeShareHash(`#${encodeShareHash(sample)}`)).toEqual(sample);
  });

  it('decodes legacy btoa links', () => {
    const legacy = { id: 'root', name: 'Legacy', type: 'group', config: 'series', children: [] };
    expect(decodeShareHash(btoa(JSON.stringify(legacy)))).toEqual(legacy);
  });
});

