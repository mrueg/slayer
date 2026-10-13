import type { SLAItem } from './sla-calculator';

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
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !parsed.id || !parsed.type) {
    throw new Error('Invalid configuration');
  }
  return parsed as SLAItem;
};

/** Removes all chaos-injected failures from a tree. */
export const clearFailures = (item: SLAItem): SLAItem => {
  const { failedReplicas: _failed, ...rest } = item;
  return rest.children ? { ...rest, children: rest.children.map(clearFailures) } : rest;
};

export const hasFailures = (item: SLAItem): boolean =>
  (item.failedReplicas || 0) > 0 || (item.children || []).some(hasFailures);
