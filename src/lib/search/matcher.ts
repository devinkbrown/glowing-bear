// Message-search matcher.
//
// A pure predicate that decides whether one message record satisfies a parsed
// SearchQuery. Kept DOM-free and wire-free: callers adapt their own line/message
// type into a SearchRecord (see MessageView), so this module has no dependency
// on the WeeChat model and tests trivially.

import type { SearchQuery } from './grammar';

export interface SearchRecord {
  /** Author nick, or null for server/system lines. */
  nick: string | null;
  /** Channel/buffer name the record belongs to (leading # / & optional). */
  channel: string;
  /** Message time in ms since epoch. */
  timestamp: number;
  /** Raw message text. */
  text: string;
}

function channelMatches(channel: string, needle: string): boolean {
  return channel.replace(/^[#&]+/, '').toLowerCase().includes(needle);
}

/**
 * True when `rec` satisfies every constraint in `query`.
 *
 * All present constraints are ANDed together. An empty query matches nothing —
 * the caller decides what "no query" means (the message list treats it as
 * "search inactive").
 */
export function matchesQuery(rec: SearchRecord, query: SearchQuery): boolean {
  if (query.isEmpty) return false;

  const nick = (rec.nick ?? '').toLowerCase();

  if (query.from !== null && !nick.includes(query.from)) return false;
  if (query.in !== null && !channelMatches(rec.channel, query.in)) return false;
  if (query.after !== null && rec.timestamp < query.after) return false;
  if (query.before !== null && rec.timestamp >= query.before) return false;

  if (query.text !== null) {
    const inText = rec.text.toLowerCase().includes(query.text);
    const inNick = nick.includes(query.text);
    if (!inText && !inNick) return false;
  }

  return true;
}
