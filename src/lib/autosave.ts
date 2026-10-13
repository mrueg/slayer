import { parseConfig } from './config';
import type { SLAItem } from './sla-calculator';

const STORAGE_KEY = 'slayer-model';

/** Returns the autosaved model, or null if there is none or it is unusable. */
export const loadSavedModel = (): SLAItem | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseConfig(JSON.parse(raw)) : null;
  } catch (err) {
    console.warn('Ignoring unreadable autosaved model', err);
    return null;
  }
};

export const saveModel = (root: SLAItem) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    // Storage full or unavailable: autosave is best effort
  }
};
