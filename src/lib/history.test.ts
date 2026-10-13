import { describe, expect, it } from 'vitest';
import { COALESCE_MS, MAX_HISTORY, createHistory, historyReducer } from './history';

const set = (value: number, now = 0, coalesceKey?: string) => ({ type: 'set' as const, value, now, coalesceKey });

describe('historyReducer', () => {
  it('undoes and redoes changes', () => {
    let h = createHistory(0);
    h = historyReducer(h, set(1));
    h = historyReducer(h, set(2));
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe(1);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe(0);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe(0);
    h = historyReducer(h, { type: 'redo' });
    h = historyReducer(h, { type: 'redo' });
    expect(h.present).toBe(2);
    expect(historyReducer(h, { type: 'redo' })).toBe(h);
  });

  it('drops the redo stack on a new change', () => {
    let h = historyReducer(historyReducer(createHistory(0), set(1)), { type: 'undo' });
    h = historyReducer(h, set(5));
    expect(h.future).toEqual([]);
    expect(h.past).toEqual([0]);
  });

  it('merges quick edits with the same key into one step', () => {
    let h = createHistory(0);
    h = historyReducer(h, set(1, 0, 'name'));
    h = historyReducer(h, set(2, 100, 'name'));
    h = historyReducer(h, set(3, 200, 'name'));
    expect(h.past).toEqual([0]);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present).toBe(0);
  });

  it('does not merge different keys, slow edits or edits right after undo', () => {
    let h = createHistory(0);
    h = historyReducer(h, set(1, 0, 'a'));
    h = historyReducer(h, set(2, 10, 'b'));
    h = historyReducer(h, set(3, 10 + COALESCE_MS, 'b'));
    expect(h.past).toEqual([0, 1, 2]);
    h = historyReducer(h, { type: 'undo' });
    h = historyReducer(h, set(9, 20 + COALESCE_MS, 'b'));
    expect(h.past).toEqual([0, 1, 2]);
  });

  it('replaces without an undo step', () => {
    const h = historyReducer(historyReducer(createHistory(0), set(1)), { type: 'replace', value: 7 });
    expect(h.present).toBe(7);
    expect(h.past).toEqual([0]);
  });

  it('rewrites every entry with mapAll', () => {
    let h = historyReducer(historyReducer(createHistory(1), set(2)), set(3));
    h = historyReducer(h, { type: 'undo' });
    h = historyReducer(h, { type: 'mapAll', fn: (v: number) => v * 10 });
    expect([h.past, h.present, h.future]).toEqual([[10], 20, [30]]);
  });

  it(`keeps at most ${MAX_HISTORY} undo steps`, () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 20; i++) h = historyReducer(h, set(i));
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past[0]).toBe(20);
  });
});
