import { describe, expect, it } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
  it('returns unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, generateId));
    expect(ids.size).toBe(100);
  });
});
