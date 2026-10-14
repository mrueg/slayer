export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Parses a number input. Returns undefined for an empty or invalid field so
 * callers can skip the update instead of silently writing 0.
 */
export const parseNumberInput = (raw: string, parse: (value: string) => number = parseFloat): number | undefined => {
  if (raw.trim() === '') return undefined;
  const value = parse(raw);
  return Number.isFinite(value) ? value : undefined;
};
