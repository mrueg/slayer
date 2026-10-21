// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { loadBooleanPreference, saveBooleanPreference, useBooleanPreference } from './preferences';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('boolean preferences', () => {
  it('round-trips a saved value', () => {
    saveBooleanPreference('k', true);
    expect(loadBooleanPreference('k', false)).toBe(true);
    saveBooleanPreference('k', false);
    expect(loadBooleanPreference('k', true)).toBe(false);
  });

  it('falls back when nothing or something unexpected is stored', () => {
    expect(loadBooleanPreference('k', true)).toBe(true);
    localStorage.setItem('k', 'yes');
    expect(loadBooleanPreference('k', false)).toBe(false);
  });

  it('falls back instead of throwing when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => saveBooleanPreference('k', true)).not.toThrow();
    expect(loadBooleanPreference('k', true)).toBe(true);
  });
});

describe('useBooleanPreference', () => {
  it('starts from the stored value and remembers changes', () => {
    saveBooleanPreference('k', true);
    const { result } = renderHook(() => useBooleanPreference('k', false));
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(loadBooleanPreference('k', true)).toBe(false);
  });

  it('keeps every user of the same key in sync', () => {
    const first = renderHook(() => useBooleanPreference('k', false));
    const second = renderHook(() => useBooleanPreference('k', false));
    act(() => first.result.current[1](true));
    expect(second.result.current[0]).toBe(true);
  });
});
