import type { ArchiveRecord } from './types';

const GRAM_SIZE = 3;
const MAX_INDEX_TOKENS = 256;
const MAX_TIMESTAMP = Number.MAX_SAFE_INTEGER;
const TIMESTAMP_WIDTH = String(MAX_TIMESTAMP).length;

export const ARCHIVE_UNINDEXED_TOKEN = 'u';

type SearchSurface = 'raw' | 'normalized' | 'channel';

function hashGram(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function tokenPrefix(surface: SearchSurface): string {
  switch (surface) {
    case 'raw': return 'r';
    case 'normalized': return 'n';
    case 'channel': return 'c';
  }
}

function grams(value: string): string[] {
  if (value.length < GRAM_SIZE) return [];
  const out: string[] = [];
  for (let index = 0; index <= value.length - GRAM_SIZE; index++) {
    out.push(value.slice(index, index + GRAM_SIZE));
  }
  return out;
}

function timestampKey(timestamp: number): string {
  const bounded = Math.max(0, Math.min(MAX_TIMESTAMP, Math.trunc(timestamp) || 0));
  return String(bounded).padStart(TIMESTAMP_WIDTH, '0');
}

function searchableChannel(value: string): string {
  return value.replace(/^[#&]+/, '').toLowerCase();
}

function indexToken(surface: SearchSurface, gram: string): string {
  return `${tokenPrefix(surface)}:${hashGram(gram)}`;
}

/**
 * Select one necessary trigram from a required substring clause. Hash
 * collisions can add candidates, but the exact matcher always removes them.
 */
export function archiveSearchCandidateToken(
  surface: SearchSurface,
  value: string | null,
): string | null {
  if (value === null || value.length < GRAM_SIZE) return null;
  const parts = value.split(/\s+/u).filter((part) => part.length >= GRAM_SIZE);
  const anchor = parts.reduce<string | null>(
    (longest, part) => longest === null || part.length > longest.length ? part : longest,
    null,
  ) ?? value;
  const at = Math.max(0, Math.floor((anchor.length - GRAM_SIZE) / 2));
  return indexToken(surface, anchor.slice(at, at + GRAM_SIZE));
}

/** Build bounded multiEntry keys. Oversized records use one fallback key. */
export function archiveSearchIndexKeys(record: ArchiveRecord): string[] {
  const tokens = new Set<string>();
  const add = (surface: SearchSurface, value: string) => {
    for (const gram of grams(value)) {
      tokens.add(indexToken(surface, gram));
      if (tokens.size > MAX_INDEX_TOKENS) return false;
    }
    return true;
  };

  const complete = add('raw', record.sender.toLowerCase())
    && add('raw', record.text.toLowerCase())
    && add('normalized', record.normalizedText)
    && add('channel', searchableChannel(record.bufferName));
  const suffix = timestampKey(record.timestamp);
  if (!complete) return [`${ARCHIVE_UNINDEXED_TOKEN}:${suffix}`];
  return [...tokens].sort().map((token) => `${token}:${suffix}`);
}

export function archiveSearchIndexRange(
  token: string,
  after: number | null,
  before: number | null,
): IDBKeyRange | null {
  const lower = Math.max(0, after ?? 0);
  const upper = before === null ? MAX_TIMESTAMP : Math.max(0, before - 1);
  if (upper < lower) return null;
  return IDBKeyRange.bound(
    `${token}:${timestampKey(lower)}`,
    `${token}:${timestampKey(upper)}`,
  );
}
