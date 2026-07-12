// Deterministic subsequence fuzzy ranker for the command palette.
//
// Pure, no DOM, no store — every score is a function of (haystack, query)
// alone, so ranking is fully testable. Higher score is a better match; a
// non-subsequence returns null. The score tiers are, best-first:
//   prefix match      → PREFIX_BASE
//   substring match   → SUBSTR_BASE - offset
//   scattered match   → SUBSEQ_BASE + accumulated bonuses
// with per-command ranking taking the best of its title and keywords (a
// keyword hit is penalised so a title hit of equal shape always wins).

const PREFIX_BASE = 1000;
const SUBSTR_BASE = 600;
const SUBSEQ_BASE = 200;

const CHAR_BONUS = 10; // each matched character
const STREAK_BONUS = 5; // per additional contiguous character
const BOUNDARY_BONUS = 15; // match at a word boundary
const KEYWORD_PENALTY = 40; // a keyword hit ranks below an equal title hit

/** A character begins a "word" if it starts the string or follows a separator. */
function isBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text[index - 1];
  return prev !== undefined && /[\s#@~._/-]/.test(prev);
}

/**
 * Score `query` against a single `haystack`. Returns null when `query` is not
 * an in-order subsequence of `haystack`. An empty query matches everything
 * with a neutral score of 0 (callers keep the natural order in that case).
 */
export function fuzzyScore(haystack: string, query: string): number | null {
  if (query.length === 0) return 0;

  const h = haystack.toLowerCase();
  const q = query.toLowerCase();

  const at = h.indexOf(q);
  if (at === 0) return PREFIX_BASE;
  if (at > 0) return SUBSTR_BASE - at;

  let qi = 0;
  let last = -2;
  let streak = 0;
  let bonus = 0;

  for (let i = 0; i < h.length && qi < q.length; i += 1) {
    if (h[i] !== q[qi]) continue;

    bonus += CHAR_BONUS;
    if (i === last + 1) {
      streak += 1;
      bonus += streak * STREAK_BONUS;
    } else {
      streak = 0;
    }
    if (isBoundary(h, i)) bonus += BOUNDARY_BONUS;

    last = i;
    qi += 1;
  }

  return qi === q.length ? SUBSEQ_BASE + bonus : null;
}

/** Best score of `query` across a title and its keywords, or null if none hit. */
export function bestScore(title: string, keywords: readonly string[], query: string): number | null {
  let best = fuzzyScore(title, query);

  for (const keyword of keywords) {
    const raw = fuzzyScore(keyword, query);
    if (raw === null) continue;
    const scored = raw - KEYWORD_PENALTY;
    if (best === null || scored > best) best = scored;
  }

  return best;
}

export interface Rankable {
  title: string;
  keywords: readonly string[];
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/**
 * Filter and rank `items` by `query`. With an empty query the input order is
 * preserved verbatim (score 0). Otherwise non-matches drop and the survivors
 * sort by score desc, breaking ties by shorter title then by index so the
 * result is stable and deterministic.
 */
export function rankCommands<T extends Rankable>(items: readonly T[], query: string): Array<Ranked<T>> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return items.map((item) => ({ item, score: 0 }));

  const scored: Array<Ranked<T> & { index: number }> = [];
  items.forEach((item, index) => {
    const score = bestScore(item.title, item.keywords, trimmed);
    if (score !== null) scored.push({ item, score, index });
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.item.title.length !== b.item.title.length) return a.item.title.length - b.item.title.length;
    return a.index - b.index;
  });

  return scored.map(({ item, score }) => ({ item, score }));
}
