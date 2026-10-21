import { useCallback, useSyncExternalStore } from 'react';

// Per-browser view preferences. Storage can be unavailable (e.g. blocked site data), so reads
// fall back to the default and failed writes only lose the setting for the next visit.

export const loadBooleanPreference = (key: string, fallback: boolean): boolean => {
  try {
    const value = localStorage.getItem(key);
    return value === 'true' ? true : value === 'false' ? false : fallback;
  } catch {
    return fallback;
  }
};

export const saveBooleanPreference = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Not persisted, but still applied for this session
  }
};

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // Keeps other tabs in sync too
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};

/**
 * A remembered on/off view setting. The pre-rendered page always uses the fallback,
 * and the stored value takes over once the page is running in the browser.
 */
export const useBooleanPreference = (key: string, fallback: boolean): [boolean, (value: boolean) => void] => {
  const value = useSyncExternalStore(subscribe, () => loadBooleanPreference(key, fallback), () => fallback);
  const setValue = useCallback((next: boolean) => {
    saveBooleanPreference(key, next);
    listeners.forEach(listener => listener());
  }, [key]);
  return [value, setValue];
};
