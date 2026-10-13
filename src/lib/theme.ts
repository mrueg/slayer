const STORAGE_KEY = 'slayer-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();

const getStoredTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    // Storage can be unavailable (e.g. blocked cookies); fall back to the system preference
    return null;
  }
};

const applyDarkMode = (dark: boolean) => {
  document.documentElement.classList.toggle('dark', dark);
  listeners.forEach(listener => listener());
};

export const isDarkMode = (): boolean => document.documentElement.classList.contains('dark');

/** Applies and remembers an explicit choice, overriding the system preference. */
export const setDarkMode = (dark: boolean) => {
  try {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    // Not persisted, but still applied for this session
  }
  applyDarkMode(dark);
};

/** useSyncExternalStore subscription; follows system changes until the user picks a theme. */
export const subscribeToTheme = (listener: () => void) => {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = (event: MediaQueryListEvent) => {
    if (!getStoredTheme()) applyDarkMode(event.matches);
  };
  media.addEventListener('change', onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystemChange);
  };
};

/**
 * Inline script for <head>: applies the stored or system theme before the
 * first paint so the page doesn't flash light before hydration.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');` +
  `var d=t==='dark'||(t!=='light'&&window.matchMedia('${DARK_QUERY}').matches);` +
  `document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
