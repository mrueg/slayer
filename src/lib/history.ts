export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  // Consecutive edits with the same key within COALESCE_MS become one undo step
  lastKey?: string;
  lastTime: number;
}

export type HistoryAction<T> =
  | { type: 'set'; value: T; coalesceKey?: string; now: number }
  | { type: 'replace'; value: T } // without an undo step, e.g. restoring a saved model
  | { type: 'mapAll'; fn: (value: T) => T } // rewrite every entry, e.g. dropping chaos failures
  | { type: 'undo' }
  | { type: 'redo' };

export const MAX_HISTORY = 100;
export const COALESCE_MS = 1000;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], lastTime: 0 });

export const historyReducer = <T>(state: History<T>, action: HistoryAction<T>): History<T> => {
  switch (action.type) {
    case 'set': {
      if (action.value === state.present) return state;
      const coalesce = action.coalesceKey !== undefined
        && action.coalesceKey === state.lastKey
        && action.now - state.lastTime < COALESCE_MS
        && state.past.length > 0;
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-MAX_HISTORY),
        present: action.value,
        future: [],
        lastKey: action.coalesceKey,
        lastTime: action.now,
      };
    }
    case 'replace':
      return { ...state, present: action.value, lastKey: undefined };
    case 'mapAll':
      return {
        ...state,
        past: state.past.map(action.fn),
        present: action.fn(state.present),
        future: state.future.map(action.fn),
      };
    case 'undo': {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
        lastTime: 0,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
        lastTime: 0,
      };
    }
  }
};
