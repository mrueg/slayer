import type { DowntimePeriod, FailureDomain, InputMode, SLAItem } from './sla-calculator';
import { MAX_FAILURE_DOMAINS, filterDomainTags } from './domains';

const MAX_DEPTH = 64;

export class ConfigError extends Error {}

const RANGES: Partial<Record<keyof SLAItem, [number, number]>> = {
  sla: [0, 100],
  failoverSla: [0, 100],
  failoverTime: [0, Infinity],
  mttr: [0, Infinity],
  rto: [0, Infinity],
  rpo: [0, Infinity],
  downtimeValue: [0, Infinity],
  replicas: [1, 99],
  minReplicasRequired: [1, 99],
  commonCause: [0, 100],
  minChildrenRequired: [1, Infinity],
  failedReplicas: [0, 99],
};

const parseFailureDomains = (raw: unknown, path: string): FailureDomain[] => {
  if (!Array.isArray(raw)) throw new ConfigError(`${path} must be an array`);
  if (raw.length > MAX_FAILURE_DOMAINS) throw new ConfigError(`${path} can have at most ${MAX_FAILURE_DOMAINS} domains`);
  const ids = new Set<string>();
  return raw.map((entry, i) => {
    const entryPath = `${path}[${i}]`;
    if (!isRecord(entry)) throw new ConfigError(`${entryPath} must be an object`);
    const id = readString(entry, 'id', entryPath);
    if (!id) throw new ConfigError(`${entryPath}.id is required`);
    if (ids.has(id)) throw new ConfigError(`${entryPath}.id "${id}" is duplicated`);
    ids.add(id);
    const sla = readNumber(entry, 'sla', entryPath);
    if (sla === undefined || sla < 0 || sla > 100) throw new ConfigError(`${entryPath}.sla must be between 0 and 100`);
    const domain: FailureDomain = { id, name: readString(entry, 'name', entryPath) ?? '', sla };
    const mttr = readNumber(entry, 'mttr', entryPath);
    if (mttr !== undefined) {
      if (mttr < 0) throw new ConfigError(`${entryPath}.mttr must be between 0 and Infinity`);
      domain.mttr = mttr;
    }
    return domain;
  });
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
      'commonCause',
      'mttr', 'sla', 'replicas', 'minReplicasRequired', 'minChildrenRequired',
      'failoverTime',
      'failoverSla', 'failedReplicas', 'downtimeValue', 'rto', 'rpo',
    ] as const;
    for (const key of numericKeys) {
      const value = readNumber(raw, key, path);
      if (value !== undefined) item[key] = value;
    }

    if (raw.domains !== undefined && raw.domains !== null) {
      if (!Array.isArray(raw.domains) || raw.domains.some(d => typeof d !== 'string')) {
        throw new ConfigError(`${path}.domains must be an array of strings`);
      }
      if (raw.domains.length > 0) item.domains = [...new Set(raw.domains as string[])];
    }
    if (depth === 0 && raw.failureDomains !== undefined && raw.failureDomains !== null) {
      item.failureDomains = parseFailureDomains(raw.failureDomains, `${path}.failureDomains`);
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

  const root = parseItem(input, 'root', 0);
  // Drop references to domains that are not defined
  const defined = new Set((root.failureDomains || []).map(d => d.id));
  return filterDomainTags(root, id => defined.has(id));
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

const transform = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());

/** Encodes a configuration for the URL hash: deflate-compressed UTF-8 JSON, base64url. */
export const encodeShareHash = async (root: SLAItem): Promise<string> =>
  bytesToBase64Url(await transform(new TextEncoder().encode(JSON.stringify(root)), new CompressionStream('deflate-raw')));

/** Decodes and validates a URL hash produced by encodeShareHash. */
export const decodeShareHash = async (hash: string): Promise<SLAItem> => {
  const bytes = await transform(base64UrlToBytes(decodeURIComponent(hash.replace(/^#/, ''))), new DecompressionStream('deflate-raw'));
  return parseConfig(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
};

/** Removes all chaos-injected failures from a tree. */
export const clearFailures = (item: SLAItem): SLAItem => {
  const { failedReplicas: _failed, ...rest } = item;
  return rest.children ? { ...rest, children: rest.children.map(clearFailures) } : rest;
};

export const hasFailures = (item: SLAItem): boolean =>
  (item.failedReplicas || 0) > 0 || (item.children || []).some(hasFailures);
