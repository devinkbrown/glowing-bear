import { describe, expect, it } from 'vitest';

import { parseSearchQuery } from './grammar';
import { matchesQuery, type SearchRecord } from './matcher';

const NOW = new Date(2026, 6, 12, 12, 0, 0, 0).getTime();

function rec(over: Partial<SearchRecord> = {}): SearchRecord {
  return {
    nick: 'alice',
    channel: '#general',
    timestamp: NOW - 30 * 60_000, // 30 min ago
    text: 'hello world',
    ...over,
  };
}

function match(raw: string, over: Partial<SearchRecord> = {}): boolean {
  return matchesQuery(rec(over), parseSearchQuery(raw, NOW));
}

describe('matchesQuery', () => {
  it('matches nothing for an empty query', () => {
    expect(matchesQuery(rec(), parseSearchQuery('', NOW))).toBe(false);
  });

  it('bare term matches message or nick, case-insensitively', () => {
    expect(match('WORLD')).toBe(true);
    expect(match('alice')).toBe(true); // nick
    expect(match('absent')).toBe(false);
  });

  it('from: filters by nick substring', () => {
    expect(match('from:ali')).toBe(true);
    expect(match('from:bob')).toBe(false);
    expect(match('from:alice', { nick: null })).toBe(false);
  });

  it('in: filters by channel, ignoring the sigil', () => {
    expect(match('in:general')).toBe(true);
    expect(match('in:#general')).toBe(true);
    expect(match('in:ops')).toBe(false);
    expect(match('in:general', { channel: 'general' })).toBe(true);
  });

  it('after: is inclusive lower bound, before: is exclusive upper bound', () => {
    const t = NOW - 60 * 60_000; // record 1h ago
    expect(matchesQuery(rec({ timestamp: t }), parseSearchQuery('after:2h', NOW))).toBe(true);
    expect(matchesQuery(rec({ timestamp: t }), parseSearchQuery('after:30m', NOW))).toBe(false);
    expect(matchesQuery(rec({ timestamp: t }), parseSearchQuery('before:30m', NOW))).toBe(true);
    expect(matchesQuery(rec({ timestamp: t }), parseSearchQuery('before:2h', NOW))).toBe(false);
  });

  it('after: boundary is inclusive', () => {
    const q = parseSearchQuery('after:1h', NOW);
    expect(matchesQuery(rec({ timestamp: NOW - 3_600_000 }), q)).toBe(true);
  });

  it('a malformed date bound imposes no constraint', () => {
    // before:xyz -> before is null, so only the free text applies and matches.
    expect(match('before:xyz world')).toBe(true);
    expect(match('before:xyz absent')).toBe(false);
  });

  it('ANDs every constraint together', () => {
    expect(match('from:alice in:general after:2h world')).toBe(true);
    expect(match('from:alice in:general after:2h absent')).toBe(false); // text fails
    expect(match('from:bob in:general after:2h world')).toBe(false); // from fails
    expect(match('from:alice in:ops after:2h world')).toBe(false); // channel fails
  });
});
