const STORAGE_KEY = 'slayer-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

type Theme = 'light' | 'dark';

const getStoredTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    // Storage can be unavailable (e.g. blocked site data); fall back to the system preference
    return null;
  }
};

const resolveDarkMode = (): boolean => {
  const stored = getStoredTheme();
  return stored ? stored === 'dark' : window.matchMedia(DARK_QUERY).matches;
};

const applyDarkMode = (dark: boolean) => {
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  // Native controls (scrollbars, selects, file inputs) follow color-scheme, not the class
  root.style.colorScheme = dark ? 'dark' : 'light';
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

/**
 * Keeps the theme in sync with system changes (until the user picks a theme)
 * and with choices made in other tabs. Returns a cleanup function.
 */
export const watchTheme = () => {
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = (event: MediaQueryListEvent) => {
    if (!getStoredTheme()) applyDarkMode(event.matches);
  };
  const onStorage = (event: StorageEvent) => {
    // key is null when another tab cleared all storage
    if (event.key === STORAGE_KEY || event.key === null) applyDarkMode(resolveDarkMode());
  };
  media.addEventListener('change', onSystemChange);
  window.addEventListener('storage', onStorage);
  return () => {
    media.removeEventListener('change', onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
};

/**
 * Inline script for <head>: applies the stored or system theme before the
 * first paint so the page doesn't flash light before hydration. Storage
 * errors must not prevent falling back to the system preference.
 */
export const THEME_INIT_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem('${STORAGE_KEY}')}catch(e){}` +
  `var d=t==='dark'||(t!=='light'&&window.matchMedia('${DARK_QUERY}').matches);` +
  `var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light'})()`;
