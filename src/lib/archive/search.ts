import { parseSearchQuery } from '@/lib/search/grammar';
import { matchesQuery } from '@/lib/search/matcher';
import { normalizeArchiveText } from './record';
import { archiveSearchCandidateToken } from './searchIndex';
import type { ArchiveRecord, ArchiveSearchHit, ArchiveSearchRequest } from './types';

interface ArchiveFilters {
  queryText: string;
  phrases: string[];
  hasLink: boolean;
  hasFile: boolean;
  isMention: boolean;
  isUnread: boolean;
}

export interface CompiledArchiveSearch {
  after: number | null;
  before: number | null;
  limit: number;
  candidateToken: string | null;
  match: (record: ArchiveRecord) => ArchiveSearchHit | null;
}

function parseArchiveFilters(raw: string): ArchiveFilters {
  const phrases: string[] = [];
  const remaining = raw.replace(/"([^"]+)"/g, (_match, phrase: string) => {
    const normalized = normalizeArchiveText(phrase);
    if (normalized) phrases.push(normalized);
    return ' ';
  });
  let hasLink = false;
  let hasFile = false;
  let isMention = false;
  let isUnread = false;
  const queryTokens: string[] = [];
  for (const token of remaining.trim().split(/\s+/).filter(Boolean)) {
    switch (token.toLowerCase()) {
      case 'has:link': hasLink = true; break;
      case 'has:file': hasFile = true; break;
      case 'is:mention': isMention = true; break;
      case 'is:unread': isUnread = true; break;
      default: queryTokens.push(token); break;
    }
  }
  return { queryText: queryTokens.join(' '), phrases, hasLink, hasFile, isMention, isUnread };
}

function snippet(record: ArchiveRecord, needle: string): string {
  const plain = record.text.replace(/\s+/g, ' ').trim();
  if (plain.length <= 180) return plain;
  const normalized = normalizeArchiveText(plain);
  const at = needle ? normalized.indexOf(needle) : -1;
  const start = Math.max(0, at < 0 ? 0 : at - 70);
  const end = Math.min(plain.length, start + 180);
  return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
}

export function compileArchiveSearch(request: ArchiveSearchRequest): CompiledArchiveSearch | null {
  const filters = parseArchiveFilters(request.query);
  const query = parseSearchQuery(filters.queryText, request.now ?? Date.now());
  const hasArchiveFilter =
    filters.phrases.length > 0 || filters.hasLink || filters.hasFile || filters.isMention || filters.isUnread;
  if (query.isEmpty && !hasArchiveFilter) return null;
  const limit = Math.max(1, Math.min(200, request.limit ?? 100));
  const needle = filters.phrases[0] ?? query.text ?? '';
  const candidates = [
    archiveSearchCandidateToken('normalized', filters.phrases.reduce<string | null>(
      (longest, phrase) => longest === null || phrase.length > longest.length ? phrase : longest,
      null,
    )),
    archiveSearchCandidateToken('raw', query.text),
    archiveSearchCandidateToken('raw', query.from),
    archiveSearchCandidateToken('channel', query.in),
  ];

  return {
    after: query.after,
    before: query.before,
    limit,
    candidateToken: candidates.find((candidate) => candidate !== null) ?? null,
    match(record) {
    if (!query.isEmpty && !matchesQuery({
      nick: record.sender,
      channel: record.bufferName,
      timestamp: record.timestamp,
      text: record.text,
    }, query)) return null;
    if (filters.hasLink && !record.hasLink) return null;
    if (filters.hasFile && !record.hasFile) return null;
    if (filters.isMention && !record.isMention) return null;
    if (filters.isUnread && !record.isUnread) return null;
    if (filters.phrases.some((phrase) => !record.normalizedText.includes(phrase))) return null;
    return {
      key: record.key,
      bufferKey: record.bufferKey,
      bufferName: record.bufferName,
      lineId: record.lineId,
      timestamp: record.timestamp,
      sender: record.sender,
      text: record.text,
      msgid: record.msgid,
      replyParent: record.replyParent,
      snippet: snippet(record, needle),
    };
    },
  };
}

export function searchArchiveRecords(
  records: readonly ArchiveRecord[],
  request: ArchiveSearchRequest,
): ArchiveSearchHit[] {
  const compiled = compileArchiveSearch(request);
  if (!compiled) return [];
  const hits: ArchiveSearchHit[] = [];
  for (const record of records) {
    const hit = compiled.match(record);
    if (hit) hits.push(hit);
    if (hits.length >= compiled.limit) break;
  }
  return hits;
}
