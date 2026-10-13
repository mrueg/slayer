import { describe, expect, it } from 'vitest';
import type { SLAItem } from './sla-calculator';
import {
  clearFailures,
  decodeShareHash,
  encodeShareHash,
  hasFailures,
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
  it('round-trips non-Latin-1 text', async () => {
    const encoded = await encodeShareHash(sample);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeShareHash(encoded)).toEqual(sample);
  });

  it('accepts a leading #', async () => {
    expect(await decodeShareHash(`#${await encodeShareHash(sample)}`)).toEqual(sample);
  });

  it('compresses large models', async () => {
    const big: SLAItem = {
      id: 'root', name: 'Big', type: 'group', config: 'series',
      children: Array.from({ length: 40 }, (_, i) => ({
        id: `service-${i}`, name: `Service ${i}`, type: 'component' as const, sla: 99.95, mttr: 60, replicas: 3, rto: 30, rpo: 5,
        notes: 'Runs in three availability zones behind a load balancer.',
      })),
    };
    const uncompressed = Buffer.from(JSON.stringify(big)).toString('base64url');
    const encoded = await encodeShareHash(big);
    expect(encoded.length).toBeLessThan(uncompressed.length / 4);
    expect(await decodeShareHash(encoded)).toEqual(big);
  });

  it('rejects garbage', async () => {
    await expect(decodeShareHash('not-a-valid-hash')).rejects.toThrow();
  });
});

describe('clearFailures', () => {
  it('removes failedReplicas everywhere', () => {
    expect(hasFailures(sample)).toBe(true);
    const cleared = clearFailures(sample);
    expect(hasFailures(cleared)).toBe(false);
    expect(JSON.stringify(cleared)).not.toContain('failedReplicas');
    expect(cleared.children?.[1].children?.[0].replicas).toBe(3);
  });
});

