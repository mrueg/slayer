import type { DowntimePeriod, InputMode, SLAItem } from './sla-calculator';

const MAX_DEPTH = 64;

export class ConfigError extends Error {}

const RANGES: Partial<Record<keyof SLAItem, [number, number]>> = {
  sla: [0, 100],
  failoverSla: [0, 100],
  mttr: [0, Infinity],
  rto: [0, Infinity],
  rpo: [0, Infinity],
  downtimeValue: [0, Infinity],
  replicas: [1, 99],
  minReplicasRequired: [1, 99],
  minChildrenRequired: [1, Infinity],
  failedReplicas: [0, 99],
};

const validateRanges = (item: SLAItem, path: string) => {
  for (const [key, [min, max]] of Object.entries(RANGES) as [keyof SLAItem, [number, number]][]) {
    const value = item[key];
    if (typeof value === 'number' && (value < min || value > max)) {
      throw new ConfigError(`${path}.${key} must be between ${min} and ${max}`);
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readNumber = (raw: Record<string, unknown>, key: string, path: string): number | undefined => {
  const value = raw[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ConfigError(`${path}.${key} must be a finite number`);
  }
  return value;
};

const readString = (raw: Record<string, unknown>, key: string, path: string): string | undefined => {
  const value = raw[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ConfigError(`${path}.${key} must be a string`);
  return value;
};

const readEnum = <T extends string>(raw: Record<string, unknown>, key: string, allowed: readonly T[]): T | undefined => {
  const value = raw[key];
  return allowed.includes(value as T) ? (value as T) : undefined;
};

/**
 * Validates untrusted input (imported file or share link) and returns a
 * clean SLAItem tree containing only known fields. Duplicate ids are
 * replaced so that tree updates stay unambiguous.
 */
export const parseConfig = (input: unknown): SLAItem => {
  const seenIds = new Set<string>();

  const parseItem = (raw: unknown, path: string, depth: number): SLAItem => {
    if (depth > MAX_DEPTH) throw new ConfigError(`Configuration is nested deeper than ${MAX_DEPTH} levels`);
    if (!isRecord(raw)) throw new ConfigError(`${path} must be an object`);

    const type = raw.type;
    if (type !== 'component' && type !== 'group') {
      throw new ConfigError(`${path}.type must be "component" or "group"`);
    }

    let id = readString(raw, 'id', path);
    if (!id || seenIds.has(id)) id = crypto.randomUUID();
    seenIds.add(id);

    const item: SLAItem = {
      id,
      name: readString(raw, 'name', path) ?? '',
      type,
    };

    const icon = readString(raw, 'icon', path);
    if (icon !== undefined) item.icon = icon;
    const notes = readString(raw, 'notes', path);
    if (notes !== undefined) item.notes = notes;
    if (raw.isOptional === true) item.isOptional = true;

    const numericKeys = [
      'mttr', 'sla', 'replicas', 'minReplicasRequired', 'minChildrenRequired',
      'failoverSla', 'failedReplicas', 'downtimeValue', 'rto', 'rpo',
    ] as const;
    for (const key of numericKeys) {
      const value = readNumber(raw, key, path);
      if (value !== undefined) item[key] = value;
    }

    const inputMode = readEnum<InputMode>(raw, 'inputMode', ['percentage', 'downtime']);
    if (inputMode) item.inputMode = inputMode;
    const downtimePeriod = readEnum<DowntimePeriod>(raw, 'downtimePeriod', ['day', 'month', 'year']);
    if (downtimePeriod) item.downtimePeriod = downtimePeriod;

    if (type === 'group') {
      item.config = readEnum(raw, 'config', ['series', 'parallel'] as const) ?? 'series';
      const children = raw.children ?? [];
      if (!Array.isArray(children)) throw new ConfigError(`${path}.children must be an array`);
      item.children = children.map((child, i) => parseItem(child, `${path}.children[${i}]`, depth + 1));
    }

    validateRanges(item, path);
    return item;
  };

  return parseItem(input, 'root', 0);
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlToBytes = (encoded: string): Uint8Array => {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
};

/** Encodes a configuration for the URL hash (UTF-8 safe, base64url). */
export const encodeShareHash = (root: SLAItem): string =>
  bytesToBase64Url(new TextEncoder().encode(JSON.stringify(root)));

/**
 * Decodes a URL hash produced by encodeShareHash. Also accepts legacy links
 * that were plain btoa() of Latin-1 JSON.
 */
export const decodeShareHash = (hash: string): SLAItem => {
  const bytes = base64UrlToBytes(decodeURIComponent(hash.replace(/^#/, '')));
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    json = Array.from(bytes, b => String.fromCharCode(b)).join('');
  }
  return parseConfig(JSON.parse(json));
};

/** Removes all chaos-injected failures from a tree. */
export const clearFailures = (item: SLAItem): SLAItem => {
  const { failedReplicas: _failed, ...rest } = item;
  return rest.children ? { ...rest, children: rest.children.map(clearFailures) } : rest;
};

export const hasFailures = (item: SLAItem): boolean =>
  (item.failedReplicas || 0) > 0 || (item.children || []).some(hasFailures);
