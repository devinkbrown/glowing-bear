// Deterministic ranking is the palette's contract — these lock the tiers and
// ordering so a scoring tweak can't silently reshuffle results.

import { describe, it, expect } from 'vitest';
import { fuzzyScore, bestScore, rankCommands, type Rankable } from './fuzzy';

describe('fuzzyScore', () => {
  it('returns null for a non-subsequence', () => {
    expect(fuzzyScore('alpha', 'xyz')).toBeNull();
    expect(fuzzyScore('alpha', 'ah')).not.toBeNull(); // a..h is a subsequence
    expect(fuzzyScore('alpha', 'pl')).toBeNull(); // 'l' precedes 'p', wrong order
  });

  it('scores an empty query as neutral 0', () => {
    expect(fuzzyScore('anything', '')).toBe(0);
  });

  it('ranks prefix over substring over scattered', () => {
    const prefix = fuzzyScore('settings', 'set')!;
    const substring = fuzzyScore('reset all', 'set')!;
    const scattered = fuzzyScore('subtle text', 'set')!;

    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(scattered);
  });

  it('rewards an earlier substring match', () => {
    expect(fuzzyScore('xset', 'set')).toBeGreaterThan(fuzzyScore('xxxset', 'set')!);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('DarkBear', 'dark')).toBe(fuzzyScore('darkbear', 'dark'));
  });
});

describe('bestScore', () => {
  it('prefers a title hit over an equal-shape keyword hit', () => {
    const title = bestScore('mute', [], 'mute')!;
    const keyword = bestScore('silence channel', ['mute'], 'mute')!;
    expect(title).toBeGreaterThan(keyword);
  });

  it('falls back to keywords when the title misses', () => {
    expect(bestScore('Open settings', ['preferences'], 'pref')).not.toBeNull();
    expect(bestScore('Open settings', ['preferences'], 'zzz')).toBeNull();
  });
});

interface Cmd extends Rankable {
  id: string;
}

function cmd(id: string, title: string, keywords: string[] = []): Cmd {
  return { id, title, keywords };
}

describe('rankCommands', () => {
  const items: Cmd[] = [
    cmd('a', 'alpha'),
    cmd('b', 'beta'),
    cmd('c', 'settings', ['preferences']),
    cmd('d', 'reset'),
  ];

  it('preserves input order for an empty query', () => {
    const ranked = rankCommands(items, '');
    expect(ranked.map((r) => r.item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops non-matches and sorts by score', () => {
    const ranked = rankCommands(items, 'set');
    // "settings" (prefix) outranks "reset" (substring); alpha/beta drop.
    expect(ranked.map((r) => r.item.id)).toEqual(['c', 'd']);
  });

  it('breaks score ties by shorter title then stable index', () => {
    const tied: Cmd[] = [cmd('long', 'settingsss'), cmd('short', 'settings')];
    const ranked = rankCommands(tied, 'settings');
    expect(ranked.map((r) => r.item.id)).toEqual(['short', 'long']);
  });
});
