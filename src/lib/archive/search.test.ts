import { describe, expect, it } from 'vitest';
import type { ArchiveRecord } from './types';
import { compileArchiveSearch, searchArchiveRecords } from './search';

function record(over: Partial<ArchiveRecord> = {}): ArchiveRecord {
  return {
    key: 'buf\0line', bufferKey: 'buf', bufferName: '#general', lineId: 'line',
    timestamp: 1_700_000_000_000, sender: 'alice', text: 'deploy is ready',
    normalizedText: 'alice deploy is ready', msgid: '', replyParent: '', hasLink: false,
    hasFile: false, isMention: false, isUnread: false, sizeBytes: 32, ...over,
  };
}

describe('archive worker search', () => {
  it('supports exact phrases and returns bounded snippets', () => {
    const hits = searchArchiveRecords([
      record({ key: 'a', text: 'the deploy is ready now', normalizedText: 'alice the deploy is ready now' }),
      record({ key: 'b', text: 'deploy might be ready', normalizedText: 'alice deploy might be ready' }),
    ], { query: '"deploy is ready"' });

    expect(hits.map((hit) => hit.key)).toEqual(['a']);
    expect(hits[0]?.snippet).toContain('deploy is ready');
  });

  it('supports has:link, has:file, is:mention, and is:unread filters', () => {
    const matching = record({ key: 'match', hasLink: true, hasFile: true, isMention: true, isUnread: true });
    const ordinary = record({ key: 'ordinary' });

    expect(searchArchiveRecords([ordinary, matching], {
      query: 'has:link has:file is:mention is:unread',
    }).map((hit) => hit.key)).toEqual(['match']);
  });

  it('combines existing from/in/date grammar with archive filters', () => {
    const hits = searchArchiveRecords([
      record({ key: 'a', sender: 'Alice', bufferName: '#ops', timestamp: 200, hasLink: true }),
      record({ key: 'b', sender: 'Bob', bufferName: '#ops', timestamp: 200, hasLink: true }),
    ], { query: 'from:alice in:#ops after:100 has:link', now: 1_000 });

    expect(hits.map((hit) => hit.key)).toEqual(['a']);
  });

  it('plans only semantics-safe trigram candidates and falls back for short clauses', () => {
    expect(compileArchiveSearch({ query: 'deployment' })?.candidateToken).toMatch(/^r:/);
    expect(compileArchiveSearch({ query: 'from:alice' })?.candidateToken).toMatch(/^r:/);
    expect(compileArchiveSearch({ query: 'in:#general' })?.candidateToken).toMatch(/^c:/);
    expect(compileArchiveSearch({ query: '"ready now"' })?.candidateToken).toMatch(/^n:/);
    expect(compileArchiveSearch({ query: 'xy' })?.candidateToken).toBeNull();
  });
});
