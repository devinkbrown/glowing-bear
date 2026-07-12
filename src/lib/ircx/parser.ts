import type { PropEntry, AccessEntry, AccessLevel } from './types';
import type { WeeChatLine } from '@/lib/weechat/model';
import { parseIRCMessage } from '@/lib/irc/parser';

 
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

export interface ParsedChannelListRow {
  type: 'channel_list_row';
  channel: string;
  users: number;
  topic: string;
  modes?: string;
}

export interface ParsedChannelListEnd {
  type: 'channel_list_end';
}

export interface ParsedEventFeed {
  type: 'event_feed';
  kind: 'event' | 'note' | 'observe' | 'media';
  raw: string;
  source?: string;
  target?: string;
  category: string;
  verb?: string;
  channel?: string;
  subject?: string;
  sender?: string;
  detail?: string;
  attrs: Record<string, string>;
}

export type IrcxParsed =
  | ParsedProp
  | ParsedPropEnd
  | ParsedAccessEntry
  | ParsedAccessStart
  | ParsedAccessEnd
  | ParsedEvent
  | ParsedChannelListRow
  | ParsedChannelListEnd
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
    case '825': return parseEventChange(plain);
    case '322': return parseChannelListRow(plain);
    case '323': return { type: 'channel_list_end' };
    case '812': return parseListxRow(plain);
    case '817': return { type: 'channel_list_end' };
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

export function isChannelListNumeric(tags: string[]): boolean {
  const num = findIrcNumeric(tags);
  return num === '321' || num === '322' || num === '323' || num === '812' || num === '817';
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
const EVENT_TYPES = new Set([
  'CHANNEL', 'MEMBER', 'USER', 'MEDIA',
  'CONNECT', 'DISCONNECT', 'SERVER_LINK', 'FLOOD', 'ERROR', 'ANNOUNCE',
  'OPER_ACTION', 'KILL', 'SPAM', 'DEBUG', 'POLICY', 'SERVICE', 'SECURITY',
]);

function parseEventAck(type: 'event_add' | 'event_delete' | 'event_list', plain: string): ParsedEvent {
  const colonIdx = plain.indexOf(' :');
  const before = colonIdx !== -1 ? plain.slice(0, colonIdx) : plain;
  let parts = before.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && !EVENT_TYPES.has(parts[0]!.toUpperCase()) && EVENT_TYPES.has(parts[1]!.toUpperCase())) {
    parts = parts.slice(1);
  }
  return { type, eventType: parts[0], mask: parts[1] };
}

function parseEventChange(plain: string): ParsedEvent {
  const parsed = parseEventAck('event_list', plain);
  return { type: 'event_change', eventType: parsed.eventType, mask: parsed.mask };
}

function tokenizeIrcish(text: string): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest) {
    if (rest[0] === ':') {
      out.push(rest.slice(1));
      break;
    }
    const idx = rest.indexOf(' ');
    if (idx === -1) {
      out.push(rest);
      break;
    }
    out.push(rest.slice(0, idx));
    rest = rest.slice(idx + 1).trimStart();
  }
  return out.filter(Boolean);
}

function attrsFrom(parts: string[]): { attrs: Record<string, string>; rest: string[] } {
  const attrs: Record<string, string> = {};
  const rest: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0) attrs[part.slice(0, eq)] = part.slice(eq + 1);
    else rest.push(part);
  }
  return { attrs, rest };
}

function parseEventParams(params: string[], raw: string, source?: string): ParsedEventFeed | null {
  if (params.length < 2) return null;
  const target = params[0];
  const category = params[1]?.toUpperCase();
  if (!category) return null;

  if (category === 'OBSERVE') {
    const action = params[2];
    const subject = params[3];
    const { attrs, rest } = attrsFrom(params.slice(4));
    return {
      type: 'event_feed',
      kind: 'observe',
      raw,
      source,
      target,
      category,
      verb: action?.toUpperCase(),
      subject,
      detail: rest.join(' ') || undefined,
      attrs,
    };
  }

  if (category === 'MEDIA') {
    const verb = params[2]?.toUpperCase();
    const channel = params[3]?.match(/^[#&]/) ? params[3] : undefined;
    const subject = channel ? params[4] : params[3];
    const { attrs, rest } = attrsFrom(params.slice(channel ? 5 : 4));
    return {
      type: 'event_feed',
      kind: 'media',
      raw,
      source,
      target,
      category,
      verb,
      channel,
      subject,
      detail: rest.join(' ') || undefined,
      attrs,
    };
  }

  const verb = params[2]?.toUpperCase();
  const subject = params[3];
  const { attrs, rest } = attrsFrom(params.slice(subject ? 4 : 3));
  return {
    type: 'event_feed',
    kind: 'event',
    raw,
    source,
    target,
    category,
    verb,
    subject,
    detail: rest.join(' ') || undefined,
    attrs,
  };
}

function parseNoteEventParams(params: string[], raw: string, source?: string): ParsedEventFeed | null {
  if ((params[0] ?? '').toUpperCase() !== 'EVENT') return null;
  const category = params[1]?.toUpperCase();
  if (!category) return null;
  const body = params.slice(2).join(' ').trim();
  const senderSplit = body.match(/^([^:]+):\s*(.*)$/);
  return {
    type: 'event_feed',
    kind: 'note',
    raw,
    source,
    category,
    sender: senderSplit?.[1]?.trim() || undefined,
    detail: senderSplit ? senderSplit[2]?.trim() || undefined : body || undefined,
    attrs: {},
  };
}

/** Parse live Event Spine feed lines, including raw IRC and WeeChat-rendered text. */
export function parseEventFeedText(text: string): ParsedEventFeed | null {
  let plain = strip(text);
  if (!plain.includes('EVENT')) return null;
  plain = unwrapWeechatUnknownEventLine(plain);
  plain = normalizeBareEventTags(plain);

  if (plain[0] === '@' || plain[0] === ':') {
    const msg = parseIRCMessage(plain);
    if (msg.command === 'EVENT') return parseEventParams(msg.params, plain, msg.prefix ?? undefined);
    if (msg.command === 'NOTE') return parseNoteEventParams(msg.params, plain, msg.prefix ?? undefined);
  }

  const parts = tokenizeIrcish(plain);
  if (parts.length === 0) return null;
  const upper = parts.map((p) => p.toUpperCase());

  if (upper[0] === 'NOTE') return parseNoteEventParams(parts.slice(1), plain);
  if (upper[0] === 'EVENT') return parseEventParams(parts.slice(1), plain);

  const eventIdx = upper.indexOf('EVENT');
  if (eventIdx === -1) return null;
  const source = eventIdx > 0 ? parts[eventIdx - 1] : undefined;

  if (eventIdx > 0 && upper[eventIdx - 1] === 'NOTE') {
    return parseNoteEventParams(parts.slice(eventIdx), plain, eventIdx > 1 ? parts[eventIdx - 2] : undefined);
  }
  return parseEventParams(parts.slice(eventIdx + 1), plain, source);
}

function unwrapWeechatUnknownEventLine(plain: string): string {
  const match = plain.match(/command\s+"EVENT"\s+not found:\s+(.+)$/i);
  if (!match) return plain;
  return match[1]!.trim().replace(/^"|"$/g, '');
}

function normalizeBareEventTags(plain: string): string {
  if (plain[0] === '@' || plain[0] === ':') return plain;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+=/.test(plain) && plain.includes(' :')) {
    return `@${plain}`;
  }
  return plain;
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

function dropRequester(parts: string[]): string[] {
  if (parts.length >= 2 && !/^[#&]/.test(parts[0]!) && /^[#&]/.test(parts[1]!)) {
    return parts.slice(1);
  }
  return parts;
}

// 322: "[<me>] <#channel> <users> :<topic>"
function parseChannelListRow(plain: string): ParsedChannelListRow | null {
  const colonIdx = plain.indexOf(' :');
  const before = colonIdx !== -1 ? plain.slice(0, colonIdx) : plain;
  const topic = colonIdx !== -1 ? plain.slice(colonIdx + 2) : '';
  const parts = dropRequester(before.split(/\s+/).filter(Boolean));
  const channel = parts[0] ?? '';
  if (!/^[#&]/.test(channel)) return null;
  const users = parseInt(parts[1] ?? '0', 10);
  return {
    type: 'channel_list_row',
    channel,
    users: Number.isFinite(users) ? users : 0,
    topic: topic || parts.slice(2).join(' '),
  };
}

// Orochi LISTX live shape: "[<me>] <#channel> <users> <modes> <created> :<topic>"
function parseListxRow(plain: string): ParsedChannelListRow | null {
  const colonIdx = plain.indexOf(' :');
  const before = colonIdx !== -1 ? plain.slice(0, colonIdx) : plain;
  const topic = colonIdx !== -1 ? plain.slice(colonIdx + 2) : '';
  const parts = dropRequester(before.split(/\s+/).filter(Boolean));
  const channel = parts[0] ?? '';
  if (!/^[#&]/.test(channel)) return null;
  const users = parseInt(parts[1] ?? '0', 10);
  return {
    type: 'channel_list_row',
    channel,
    users: Number.isFinite(users) ? users : 0,
    modes: parts.slice(2).join(' '),
    topic,
  };
}

export function buildPropEntry(parsed: ParsedProp): PropEntry {
  return { target: parsed.target, key: parsed.key, value: parsed.value };
}
