// Message-search query grammar.
//
// A pure, DOM-free parser that turns a raw search string into a structured
// predicate (SearchQuery). It understands a small filter grammar layered on top
// of the plain-substring search the message list has always had:
//
//   from:<nick>        nick contains <nick> (case-insensitive substring)
//   in:<#channel>      buffer channel contains <channel> (# / & prefix ignored)
//   before:<when>      message timestamp is strictly before <when>
//   after:<when>       message timestamp is at or after <when>
//   <free text>        message OR nick contains the text (the classic behavior)
//
// <when> accepts:
//   - an absolute local day        2024-01-15   (resolves to local midnight)
//   - a relative age               3h  45m  2d  (now minus that duration)
//   - the keywords today / yesterday (local midnight of that day)
//
// A query with NO recognized operators is treated as one plain substring — byte
// for byte the previous behavior — so a bare term keeps working unchanged.
//
// Relative/keyword dates are resolved against an injected `now` (ms) so the
// parser stays deterministic and unit-testable; production passes Date.now().

export interface SearchQuery {
  /** Lowercased nick substring, or null when no `from:` was given. */
  from: string | null;
  /** Lowercased channel substring (no leading # / &), or null. */
  in: string | null;
  /** Exclusive upper bound (ms) — keep records strictly before this. */
  before: number | null;
  /** Inclusive lower bound (ms) — keep records at or after this. */
  after: number | null;
  /** Lowercased free-text substring (message OR nick), or null. */
  text: string | null;
  /** True when there is neither an operator constraint nor free text. */
  isEmpty: boolean;
}

const MS_PER = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
const OP_RE = /^(from|in|before|after):(.*)$/i;
const RELATIVE_RE = /^(\d+)(m|h|d)$/i;
const ABSOLUTE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Local midnight (ms) of the day containing `atMs`, shifted by `dayOffset` days.
function localMidnight(atMs: number, dayOffset = 0): number {
  const d = new Date(atMs);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.getTime();
}

// Resolve a <when> token to an absolute ms instant, or null when malformed.
// A malformed date yields no constraint rather than silently excluding every
// message (fail-open on the bound so a typo never blanks the results).
export function resolveWhen(token: string, now: number): number | null {
  const t = token.trim().toLowerCase();
  if (t === '') return null;
  if (t === 'today') return localMidnight(now, 0);
  if (t === 'yesterday') return localMidnight(now, -1);

  const rel = RELATIVE_RE.exec(t);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2] as keyof typeof MS_PER;
    return now - n * MS_PER[unit];
  }

  const abs = ABSOLUTE_RE.exec(t);
  if (abs) {
    const year = Number(abs[1]);
    const month = Number(abs[2]);
    const day = Number(abs[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day, 0, 0, 0, 0);
    // Reject overflow (e.g. 2024-02-31 rolling into March).
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      return null;
    }
    return d.getTime();
  }

  return null;
}

/**
 * Parse a raw search string into a structured predicate.
 *
 * @param raw the user's search text
 * @param now current time in ms (inject a fixed value in tests)
 */
export function parseSearchQuery(raw: string, now: number): SearchQuery {
  const trimmed = raw.trim();
  const query: SearchQuery = {
    from: null,
    in: null,
    before: null,
    after: null,
    text: null,
    isEmpty: true,
  };
  if (trimmed === '') return query;

  const tokens = trimmed.split(/\s+/);
  const freeParts: string[] = [];
  let sawOperator = false;

  for (const token of tokens) {
    const op = OP_RE.exec(token);
    if (!op) {
      freeParts.push(token);
      continue;
    }
    const key = op[1]!.toLowerCase();
    const value = op[2]!;
    // `from:` / `in:` with an empty value (a dangling `from:`) is not a real
    // constraint — treat the token as free text so it still narrows something.
    if ((key === 'from' || key === 'in') && value === '') {
      freeParts.push(token);
      continue;
    }
    sawOperator = true;
    switch (key) {
      case 'from':
        query.from = value.toLowerCase();
        break;
      case 'in':
        query.in = value.replace(/^[#&]+/, '').toLowerCase();
        break;
      case 'before':
        query.before = resolveWhen(value, now);
        break;
      case 'after':
        query.after = resolveWhen(value, now);
        break;
    }
  }

  // Bare query (no operators at all): keep the exact original substring so the
  // classic plain-text search is unchanged, spacing and all.
  if (!sawOperator) {
    query.text = trimmed.toLowerCase();
  } else if (freeParts.length > 0) {
    query.text = freeParts.join(' ').toLowerCase();
  }

  query.isEmpty =
    query.from === null &&
    query.in === null &&
    query.before === null &&
    query.after === null &&
    query.text === null;

  return query;
}
