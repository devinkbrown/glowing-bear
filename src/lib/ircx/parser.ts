import type { PropEntry, AccessEntry, AccessLevel } from './types';
import type { WeeChatLine } from '@/lib/weechat/model';

 
const STRIP_RE = /\x19[^\x1c]?|\x1a.|\x1c|\x02|\x0f|\x11|\x16|\x1d|\x1e|\x1f|\x03(\d{1,2}(,\d{1,2})?)?/g;

function strip(s: string): string {
  return s.replace(STRIP_RE, '').trim();
}

function findIrcNumeric(tags: string[]): string | null {
  for (const tag of tags) {
    const match = tag.match(/^irc_(\d{3})$/);
    if (match) return match[1]!;
  }
  return null;
}

export function isIrcxNumeric(tags: string[]): boolean {
  const num = findIrcNumeric(tags);
  if (!num) return false;
  const n = parseInt(num, 10);
  return (n >= 801 && n <= 825) || n === 913 || (n >= 915 && n <= 919);
}

export interface ParsedProp {
  type: 'prop';
  target: string;
  key: string;
  value: string;
}

export interface ParsedPropEnd {
  type: 'prop_end';
  target: string;
}

export interface ParsedAccessEntry {
  type: 'access_entry' | 'access_add' | 'access_delete';
  entry: AccessEntry;
}

export interface ParsedAccessStart {
  type: 'access_start';
  channel: string;
}

export interface ParsedAccessEnd {
  type: 'access_end';
  channel: string;
}

export interface ParsedEvent {
  type: 'event_add' | 'event_start' | 'event_list' | 'event_end' | 'event_delete' | 'event_change';
  eventType?: string;
  mask?: string;
}

export interface ParsedError {
  type: 'ircx_error';
  numeric: string;
  target: string;
  message: string;
}

export type IrcxParsed =
  | ParsedProp
  | ParsedPropEnd
  | ParsedAccessEntry
  | ParsedAccessStart
  | ParsedAccessEnd
  | ParsedEvent
  | ParsedError;

export function parseIrcxLine(line: WeeChatLine): IrcxParsed | null {
  const numeric = findIrcNumeric(line.tags);
  if (!numeric) return null;

  const plain = strip(line.message);

  switch (numeric) {
    case '818': return parsePropList(plain);
    case '819': return parsePropEnd(plain);
    case '801': return parseAccessEntry(plain, 'access_add');
    case '802': return parseAccessEntry(plain, 'access_delete');
    case '803': return parseAccessStart(plain);
    case '804': return parseAccessEntry(plain, 'access_entry');
    case '805': return parseAccessEnd(plain);
    // EVENT numerics per draft-pfenning-04, live-verified against orochi:
    // "806 <me> MEDIA * :Event added", "807 ... :Event removed",
    // "808 <me> :Start of event list", "809 <me> <cat> <mask>", "810 :End".
    case '806': return parseEventAck('event_add', plain);
    case '807': return parseEventAck('event_delete', plain);
    case '808': return { type: 'event_start' };
    case '809': return parseEventAck('event_list', plain);
    case '810': return { type: 'event_end' };
    case '825': return { type: 'event_change' };
    case '913':
    case '915':
    case '916':
    case '917':
    case '918':
    case '919':
      return parseError(numeric, plain);
    default:
      return null;
  }
}

// 818: "<target> <key> :<value>"
// WeeChat shows this as: "<target> <key> <value>" or similar
function parsePropList(plain: string): ParsedProp | null {
  // Format: target key :value  OR  target key value
  const colonIdx = plain.indexOf(' :');
  if (colonIdx !== -1) {
    const before = plain.slice(0, colonIdx);
    const value = plain.slice(colonIdx + 2);
    const parts = before.split(/\s+/);
    if (parts.length >= 2) {
      return { type: 'prop', target: parts[0]!, key: parts[1]!, value };
    }
  }

  // Fallback: split by spaces, last token is value
  const parts = plain.split(/\s+/);
  if (parts.length >= 3) {
    return { type: 'prop', target: parts[0]!, key: parts[1]!, value: parts.slice(2).join(' ') };
  }
  if (parts.length === 2) {
    return { type: 'prop', target: parts[0]!, key: parts[1]!, value: '' };
  }
  return null;
}

// 819: "<target> :End of property list"
function parsePropEnd(plain: string): ParsedPropEnd | null {
  const parts = plain.split(/\s+/);
  if (parts.length >= 1) {
    return { type: 'prop_end', target: parts[0]! };
  }
  return null;
}

// Orochi wire shapes (live-verified):
//   804 RPL_ACCESSENTRY:  "<channel> <level> <mask> <set_by> <duration>"
//   801/802 ADD/DELETE:   "<channel> <level> <mask> :ACCESS entry added|deleted"
// The relay may render the trailing text with or without its ':' marker, so
// only the first three tokens are trusted for 801/802; 804 reads all five.
function parseAccessEntry(plain: string, type: 'access_entry' | 'access_add' | 'access_delete'): ParsedAccessEntry | null {
  const colonIdx = plain.indexOf(' :');
  let reason = '';
  let before = plain;
  if (colonIdx !== -1) {
    reason = plain.slice(colonIdx + 2);
    before = plain.slice(0, colonIdx);
  }

  const parts = before.split(/\s+/);
  if (parts.length < 3) return null;

  const isFullEntry = type === 'access_entry';
  return {
    type,
    entry: {
      channel: parts[0]!,
      level: parts[1]!.toUpperCase() as AccessLevel,
      mask: parts[2]!,
      setter: isFullEntry ? (parts[3] ?? '') : '',
      duration: isFullEntry ? parseInt(parts[4] ?? '0', 10) || 0 : 0,
      reason,
    },
  };
}

// 806/807/809: "<category> <mask> :<text>"  (category/mask absent on some acks)
function parseEventAck(type: 'event_add' | 'event_delete' | 'event_list', plain: string): ParsedEvent {
  const colonIdx = plain.indexOf(' :');
  const before = colonIdx !== -1 ? plain.slice(0, colonIdx) : plain;
  const parts = before.split(/\s+/).filter(Boolean);
  return { type, eventType: parts[0], mask: parts[1] };
}

// 803: "<channel> :Start of access entries"
function parseAccessStart(plain: string): ParsedAccessStart | null {
  const parts = plain.split(/\s+/);
  return parts.length >= 1 ? { type: 'access_start', channel: parts[0]! } : null;
}

// 805: "<channel> :End of access entries"
function parseAccessEnd(plain: string): ParsedAccessEnd | null {
  const parts = plain.split(/\s+/);
  return parts.length >= 1 ? { type: 'access_end', channel: parts[0]! } : null;
}

function parseError(numeric: string, plain: string): ParsedError {
  const parts = plain.split(/\s+/);
  const target = parts[0] ?? '';
  const colonIdx = plain.indexOf(' :');
  const message = colonIdx !== -1 ? plain.slice(colonIdx + 2) : parts.slice(1).join(' ');
  return { type: 'ircx_error', numeric, target, message };
}

export function buildPropEntry(parsed: ParsedProp): PropEntry {
  return { target: parsed.target, key: parsed.key, value: parsed.value };
}
