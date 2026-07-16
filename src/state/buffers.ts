// Buffers store — the chat backbone state.
//
// Holds every WeeChat buffer (channel/private/server) with its lines, nicks,
// unread counters, typing/reaction state and channel modes. Collections are
// plain objects (Record) / arrays so Solid store proxies track them.

import { createStore, produce, reconcile } from 'solid-js/store';
import type { WeeChatBuffer, WeeChatLine, WeeChatNick, HotlistEntry } from '@/lib/weechat/model';
import type { BufferEntry, Reaction, TypingInfo } from '@/types';
import { type NotifyMode, DEFAULT_NOTIFY_MODE, nextNotifyMode } from '@/lib/notifyDecision';
import { normalizeNotificationTarget } from '@/lib/notificationPolicy';
import { archiveMessages } from '@/lib/archive/client';
import { archiveRecordFromLine } from '@/lib/archive/record';
import { settings } from './settings';

export type { NotifyMode };

const MAX_LINES = 5000;
const TYPING_ACTIVE_MS = 30_000;
const TYPING_PAUSED_MS = 8_000;

const PIN_KEY = 'db-pinned';
const MUTE_KEY = 'db-muted';
const IGNORE_KEY = 'db-ignored';
const LAST_BUFFER_KEY = 'db-last-buffer';
// Per-buffer notify tier overrides, keyed by full name (same name-keyed
// discipline as db-muted/db-pinned so it survives reconnect pointer churn).
// Holds only NON-default, non-mute tiers (i.e. 'all' while the default is
// 'mentions'): 'mute' lives in db-muted (legacy source of truth, so existing
// muted buffers migrate to the 'mute' tier for free), and DEFAULT_NOTIFY_MODE
// is stored implicitly by absence. See setNotifyMode/getNotifyMode.
const NOTIFY_MODE_KEY = 'db-notify-modes';
const TEMPORARY_MUTE_KEY = 'db-temporary-mutes';
const MAX_TEMPORARY_MUTE_MS = 31 * 24 * 60 * 60 * 1000;

// Ordered privilege tiers, highest first -- checked against nick.prefix.trim().
// Covers orochi's PREFIX=(YQqov)*!.@+ (Y=* network-oper, Q=! founder,
// q=. owner, o=@ op, v=+ voice) AND standard IRC (~ owner, & admin, @ op,
// % halfop, + voice). A nick's WeeChat-relay prefix is its single highest
// char; Founder (!) is ranked above Owner (~/.) so orochi channels group
// correctly. Networks only ever use one prefix universe, so the interleaving
// is harmless.
const PREFIX_TIERS: { chars: Set<string>; label: string }[] = [
  { chars: new Set(['*']),      label: 'Operator' }, // orochi network operator (Y)
  { chars: new Set(['!']),      label: 'Founder' },  // orochi channel founder (Q)
  { chars: new Set(['.', '~']), label: 'Owner' },    // orochi owner (q) / standard owner
  { chars: new Set(['&']),      label: 'Admin' },    // standard admin
  { chars: new Set(['@']),      label: 'Op' },       // op (o)
  { chars: new Set(['%']),      label: 'Halfop' },   // standard halfop
  { chars: new Set(['+']),      label: 'Voice' },    // voice (v)
];

/** Tier labels in nicklist display order (nickGroups key insertion order). */
export const NICK_TIER_ORDER = [...PREFIX_TIERS.map((t) => t.label), 'Regular'] as const;

function makeEntry(buffer: WeeChatBuffer): BufferEntry {
  return {
    buffer,
    lines: [],
    lineIds: {},
    nicks: {},
    nickGroups: {},
    unread: 0,
    highlighted: 0,
    lastSeen: undefined,
    loading: false,
    typing: {},
    reactions: {},
    msgIndex: {},
    modes: [],
  };
}

function buildNickGroups(nicks: Record<string, WeeChatNick>): Record<string, WeeChatNick[]> {
  const buckets: Record<string, WeeChatNick[]> = {};
  for (const nick of Object.values(nicks)) {
    if (nick.group) continue;    // skip group headers
    if (!nick.visible) continue; // skip invisible nicks
    const p = nick.prefix.trim();
    const tier = PREFIX_TIERS.find((t) => t.chars.has(p));
    const label = tier?.label ?? 'Regular';
    (buckets[label] ??= []).push(nick);
  }
  for (const arr of Object.values(buckets)) {
    arr.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }
  // Insert keys in tier display order so consumers can iterate directly.
  const ordered: Record<string, WeeChatNick[]> = {};
  for (const label of NICK_TIER_ORDER) {
    const arr = buckets[label];
    if (arr?.length) ordered[label] = arr;
  }
  return ordered;
}

// Persisted name sets (stored as JSON arrays, same format as the old client)
function loadKeys(key: string): Record<string, true> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return {};
      const out: Record<string, true> = {};
      for (const name of parsed) if (typeof name === 'string') out[name] = true;
      return out;
    }
  } catch { /* ignore */ }
  return {};
}

function saveKeys(key: string, keys: Record<string, true>): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(Object.keys(keys)));
  }
}

// Notify-mode overrides persist as a JSON object { fullName: 'mentions' }.
// Untrusted on load: reject non-objects and validate every value against the
// tier union, dropping anything unrecognized.
function loadNotifyModes(): Record<string, NotifyMode> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(NOTIFY_MODE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, NotifyMode> = {};
    for (const [name, mode] of Object.entries(parsed as Record<string, unknown>)) {
      if (mode === 'all' || mode === 'mentions' || mode === 'mute') out[name] = mode;
    }
    return out;
  } catch { /* ignore */ }
  return {};
}

function saveNotifyModes(modes: Record<string, NotifyMode>): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(NOTIFY_MODE_KEY, JSON.stringify(modes));
  }
}

function loadTemporaryMutes(now = Date.now()): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TEMPORARY_MUTE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [name, until] of Object.entries(parsed)) {
      if (!name || typeof until !== 'number' || !Number.isFinite(until)) continue;
      if (until <= now || until > now + MAX_TEMPORARY_MUTE_MS) continue;
      out[name] = until;
    }
    return out;
  } catch {
    return {};
  }
}

function saveTemporaryMutes(mutes: Record<string, number>): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(TEMPORARY_MUTE_KEY, JSON.stringify(mutes));
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface BuffersState {
  /** Buffer pointer -> entry. */
  buffers: Record<string, BufferEntry>;
  activeBuffer: string | null;
  /** Pinned buffer full names (persisted 'db-pinned'). */
  pinnedBuffers: Record<string, true>;
  /** Ignored nicks, lowercase (persisted 'db-ignored'). */
  ignoredNicks: Record<string, true>;
  /** Muted buffer full names (persisted 'db-muted'). Also the 'mute' tier. */
  mutedBuffers: Record<string, true>;
  /**
   * Per-buffer notify tier override by full name (persisted 'db-notify-modes').
   * Holds non-default, non-mute tiers ('all' under the 'mentions' default);
   * 'mute' is sourced from mutedBuffers and the default is absent. See
   * getNotifyMode for the precedence.
   */
  notifyModes: Record<string, NotifyMode>;
  /** Device-local, expiring per-buffer mute deadlines keyed by full name. */
  temporaryMutes: Record<string, number>;
  /** Buffer pointer -> line index of the read marker. */
  readMarkerPos: Record<string, number>;
}

const [state, setState] = createStore<BuffersState>({
  buffers: {},
  activeBuffer: null,
  pinnedBuffers: loadKeys(PIN_KEY),
  ignoredNicks: loadKeys(IGNORE_KEY),
  mutedBuffers: loadKeys(MUTE_KEY),
  notifyModes: loadNotifyModes(),
  temporaryMutes: loadTemporaryMutes(),
  readMarkerPos: {},
});

/** Read-only buffers store. Mutate via the exported actions only. */
export { state as buffersState };

// ---------------------------------------------------------------------------
// Derived helpers (plain functions — Solid tracks store reads automatically)
// ---------------------------------------------------------------------------

/** All buffers sorted by number, pinned first. */
export function getSorted(): BufferEntry[] {
  const all = Object.values(state.buffers).sort((a, b) => a.buffer.number - b.buffer.number);
  const fullName = (e: BufferEntry) => e.buffer.fullName || e.buffer.name;
  const pinned = all.filter((e) => state.pinnedBuffers[fullName(e)]);
  const rest = all.filter((e) => !state.pinnedBuffers[fullName(e)]);
  return [...pinned, ...rest];
}

export function getTotalHighlights(): number {
  let total = 0;
  for (const entry of Object.values(state.buffers)) total += entry.highlighted;
  return total;
}

export function getTotalUnread(): number {
  let total = 0;
  for (const entry of Object.values(state.buffers)) total += entry.unread;
  return total;
}

/** Find by name or fullName. */
export function findByName(name: string): BufferEntry | undefined {
  for (const entry of Object.values(state.buffers)) {
    if (entry.buffer.name === name || entry.buffer.fullName === name) return entry;
  }
  return undefined;
}

export function findByShortName(name: string): BufferEntry | undefined {
  for (const entry of Object.values(state.buffers)) {
    if (entry.buffer.shortName === name) return entry;
  }
  return undefined;
}

export function isPinned(pointer: string): boolean {
  const entry = state.buffers[pointer];
  if (!entry) return false;
  return !!state.pinnedBuffers[entry.buffer.fullName || entry.buffer.name];
}

export function isMuted(pointer: string): boolean {
  const entry = state.buffers[pointer];
  if (!entry) return false;
  return !!state.mutedBuffers[entry.buffer.fullName || entry.buffer.name];
}

/**
 * Effective notify tier for a buffer. Precedence: a muted buffer (legacy
 * db-muted set) is always 'mute'; otherwise a stored 'db-notify-modes'
 * override; otherwise the default 'all'. Unknown buffers default too.
 */
export function getNotifyMode(pointer: string): NotifyMode {
  const entry = state.buffers[pointer];
  if (!entry) return DEFAULT_NOTIFY_MODE;
  const name = entry.buffer.fullName || entry.buffer.name;
  if (state.mutedBuffers[name]) return 'mute';
  return state.notifyModes[name] ?? DEFAULT_NOTIFY_MODE;
}

export function getTemporaryMuteUntil(pointer: string, now = Date.now()): number {
  const entry = state.buffers[pointer];
  if (!entry) return 0;
  const name = entry.buffer.fullName || entry.buffer.name;
  const until = state.temporaryMutes[name] ?? 0;
  return until > now ? until : 0;
}

export function isTemporarilyMuted(pointer: string, now = Date.now()): boolean {
  return getTemporaryMuteUntil(pointer, now) > now;
}

export function isIgnored(nick: string): boolean {
  return !!state.ignoredNicks[nick.toLowerCase()];
}

export function hasMode(pointer: string, mode: string): boolean {
  return state.buffers[pointer]?.modes.includes(mode) ?? false;
}

// ---------------------------------------------------------------------------
// Buffer lifecycle
// ---------------------------------------------------------------------------

export function upsertBuffer(b: WeeChatBuffer): void {
  setState(produce((s) => {
    const existing = s.buffers[b.id];
    if (existing) {
      existing.buffer = b;
    } else {
      s.buffers[b.id] = makeEntry(b);
    }
    s.activeBuffer ??= b.id;
  }));
}

export function removeBuffer(pointer: string): void {
  setState(produce((s) => {
    delete s.buffers[pointer];
    if (s.activeBuffer === pointer) {
      const first = Object.keys(s.buffers)[0];
      s.activeBuffer = first ?? null;
    }
  }));
}

export function clearBuffers(): void {
  setState(produce((s) => {
    s.buffers = {};
    s.activeBuffer = null;
    s.readMarkerPos = {};
  }));
}

export function clearLines(pointer: string): void {
  setState(produce((s) => {
    const entry = s.buffers[pointer];
    if (!entry) return;
    entry.lines = [];
    entry.lineIds = {};
    entry.msgIndex = {};
    entry.unread = 0;
    entry.highlighted = 0;
  }));
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

const isOptimistic = (id: string) => id.startsWith('_opt_');

/**
 * Return whether a non-optimistic line repeats a stable relay pointer or IRC
 * msgid already accepted for this buffer. `staged` lets the connection's
 * frame-coalescing queue apply the same identity rule before the store flushes.
 */
export function isDuplicateLine(
  pointer: string,
  line: WeeChatLine,
  staged: readonly WeeChatLine[] = [],
): boolean {
  if (isOptimistic(line.id)) return false;
  const entry = state.buffers[pointer];
  if (!entry) return false;
  if (entry.lineIds[line.id]) return true;
  if (line.msgid && entry.msgIndex[line.msgid]) return true;
  return staged.some((candidate) => (
    !isOptimistic(candidate.id) && (
      candidate.id === line.id ||
      (!!line.msgid && candidate.msgid === line.msgid)
    )
  ));
}

function archiveAcceptedLines(entry: BufferEntry, lines: readonly WeeChatLine[], isUnread: boolean): void {
  if (settings.archiveRetention === 'off') return;
  const records = lines
    .map((line) => archiveRecordFromLine(entry.buffer, line, isUnread))
    .filter((record) => record !== null);
  if (records.length === 0) return;
  void archiveMessages(records, {
    retention: settings.archiveRetention,
    maxMiB: settings.archiveMaxMiB,
  }).catch(() => {
    // Storage availability/quota failures must never interrupt live chat.
  });
}

/**
 * Client-side highlight-word match. Returns a highlighted COPY when a trimmed
 * word occurs in the message, otherwise the original line untouched.
 */
function markHighlight(line: WeeChatLine, highlightWords: string[]): WeeChatLine {
  if (line.highlight || !line.message || highlightWords.length === 0) return line;
  const lcMsg = line.message.toLowerCase();
  for (const word of highlightWords) {
    const lc = word.trim().toLowerCase();
    if (lc && lcMsg.includes(lc)) return { ...line, highlight: true };
  }
  return line;
}

/**
 * Fold one line into a buffer-entry draft: msgIndex, optimistic-echo
 * replacement, append, lineIds, and the inactive-buffer unread/highlight bump.
 * Shared by addLine and addLineBatch so both produce identical state. The caller
 * trims to MAX_LINES afterwards (see trimEntry).
 */
function insertLine(e: BufferEntry, line: WeeChatLine, inactive: boolean, opt: boolean): void {
  if (line.msgid) e.msgIndex[line.msgid] = line;

  // Replace optimistic placeholder on confirmed echo
  if (!opt) {
    const optIdx = e.lines.findIndex((l) =>
      isOptimistic(l.id) && l.message === line.message &&
      (line.isSelf || l.nick === line.nick));
    if (optIdx !== -1) e.lines.splice(optIdx, 1);
  }

  e.lines.push(line);
  if (!opt) e.lineIds[line.id] = true;

  if (inactive && line.displayed && !opt) {
    e.unread += 1;
    if (line.highlight) e.highlighted += 1;
  }
}

/**
 * Trim a draft entry's lines to MAX_LINES, rebuilding lineIds (and msgIndex when
 * it has grown past the cap) from the survivors so both maps stay bounded.
 */
function trimEntry(e: BufferEntry): void {
  if (e.lines.length <= MAX_LINES) return;
  e.lines = e.lines.slice(-MAX_LINES);
  const ids: Record<string, true> = {};
  for (const l of e.lines) if (!isOptimistic(l.id)) ids[l.id] = true;
  e.lineIds = ids;
  if (Object.keys(e.msgIndex).length > MAX_LINES) {
    const keep = new Set(e.lines.map((l) => l.msgid).filter(Boolean));
    const idx: Record<string, WeeChatLine> = {};
    for (const [k, v] of Object.entries(e.msgIndex)) if (keep.has(k)) idx[k] = v;
    e.msgIndex = idx;
  }
}

/**
 * Append a single live line.
 *
 * Dedup uses stable relay line IDs and IRC msgids only. Content/time heuristics
 * are deliberately excluded: users may legitimately send identical text more
 * than once, including an immediate retry. Confirmed echoes replace their
 * `_opt_` optimistic placeholder. Client-side highlight words mark the line
 * highlighted before insertion. Unread/highlight counters bump when the buffer
 * is not active.
 */
export function addLine(pointer: string, line: WeeChatLine, highlightWords: string[]): void {
  // Suppress ignored nicks
  if (line.nick && state.ignoredNicks[line.nick.toLowerCase()]) return;

  const entry = state.buffers[pointer];
  if (!entry) return;

  const opt = isOptimistic(line.id);

  // Deduplicate only by stable protocol identity.
  if (!opt && isDuplicateLine(pointer, line)) return;

  const marked = markHighlight(line, highlightWords);
  const inactive = state.activeBuffer !== pointer;

  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    insertLine(e, marked, inactive, opt);
    trimEntry(e);
  }));
  if (!opt) archiveAcceptedLines(entry, [marked], inactive);
}

/**
 * Fold a burst of live lines (one WeeChat _buffer_line_added frame delivers each
 * line-added item, e.g. a netsplit rejoin or flood) into ONE store write.
 *
 * Observably identical to calling addLine for each line in order — same
 * ignored-nick suppression, id/content dedup, optimistic-echo replacement,
 * highlight-word marking, unread/highlight fold, ordering, MAX_LINES cap and
 * lineIds/msgIndex rebuild — but a single produce, so one reactive pass instead
 * of N. Dedup and opt-replacement run against the GROWING draft, so earlier
 * lines in the batch are visible to later ones exactly as sequential addLine
 * calls would see them.
 */
export function addLineBatch(pointer: string, lines: WeeChatLine[], highlightWords: string[]): void {
  if (lines.length === 0) return;
  const entry = state.buffers[pointer];
  if (!entry) return;

  const accepted: WeeChatLine[] = [];
  const inactive = state.activeBuffer !== pointer;
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    for (const raw of lines) {
      // Suppress ignored nicks
      if (raw.nick && s.ignoredNicks[raw.nick.toLowerCase()]) continue;
      const opt = isOptimistic(raw.id);
      if (!opt && e.lineIds[raw.id]) continue;
      if (!opt && raw.msgid && e.msgIndex[raw.msgid]) continue;
      const marked = markHighlight(raw, highlightWords);
      insertLine(e, marked, inactive, opt);
      if (!opt) accepted.push(marked);
    }
    trimEntry(e);
  }));
  archiveAcceptedLines(entry, accepted, inactive);
}

/**
 * Bulk-insert lines (history). `prepend` puts them before existing lines.
 *
 * A targeted archive/reply jump may ask the relay for substantially more than
 * MAX_LINES. When `preserveMsgid` is present in that response, retain a
 * centered render window around it instead of trimming it back out with the
 * oldest lines. Normal history paging keeps its newest-MAX_LINES behaviour.
 */
export function addLines(
  pointer: string,
  lines: WeeChatLine[],
  prepend = false,
  preserveMsgid?: string,
): void {
  const entry = state.buffers[pointer];
  if (!entry) return;

  // O(1) stable relay-id/msgid dedup. Never collapse repeated authored text.
  const existingIds = entry.lineIds;
  const existingMsgids = new Set(Object.keys(entry.msgIndex));
  const seenInBatch = new Set<string>();
  const seenMsgids = new Set<string>();
  const fresh = lines.filter((l) => {
    if (existingIds[l.id]) return false;
    if (seenInBatch.has(l.id)) return false;
    seenInBatch.add(l.id);
    if (l.msgid) {
      if (existingMsgids.has(l.msgid) || seenMsgids.has(l.msgid)) return false;
      seenMsgids.add(l.msgid);
    }
    return true;
  });
  if (fresh.length === 0) return;

  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    let newLines = prepend ? [...fresh, ...e.lines] : [...e.lines, ...fresh];
    if (newLines.length > MAX_LINES) {
      const targetIndex = preserveMsgid
        ? newLines.findIndex((line) => line.msgid === preserveMsgid)
        : -1;
      if (targetIndex >= 0) {
        const halfWindow = Math.floor(MAX_LINES / 2);
        const start = Math.max(0, Math.min(
          targetIndex - halfWindow,
          newLines.length - MAX_LINES,
        ));
        newLines = newLines.slice(start, start + MAX_LINES);
      } else {
        newLines = newLines.slice(-MAX_LINES);
      }
    }
    e.lines = newLines;
    // Rebuild both indexes from the final array (handles trimming and makes
    // history-loaded msgids immediately available to reply/archive jumps).
    const ids: Record<string, true> = {};
    const msgIndex: Record<string, WeeChatLine> = {};
    for (const l of newLines) {
      if (!isOptimistic(l.id)) ids[l.id] = true;
      if (l.msgid) msgIndex[l.msgid] = l;
    }
    e.lineIds = ids;
    e.msgIndex = msgIndex;
  }));
  archiveAcceptedLines(entry, fresh, false);
}

let sysLineCounter = 0;

/**
 * Append a locally generated system notice to a buffer (never sent to the
 * relay). Used for things like "voice/video requires the orochi bridge".
 */
export function addLocalSystemLine(bufferPtr: string, text: string): void {
  const now = new Date();
  addLine(bufferPtr, {
    id: `_sys_${Date.now()}_${sysLineCounter++}`,
    buffer: bufferPtr,
    date: now,
    datePrinted: now,
    displayed: true,
    highlight: false,
    tags: ['darkbear_system'],
    prefix: '--',
    message: text,
    nick: undefined,
    isAction: false,
    isSelf: false,
    isNotice: false,
    isJoin: false,
    isPart: false,
    isQuit: false,
    isNick: false,
    isTopic: false,
    isMode: false,
    isTagMsg: false,
    isWhisper: false,
    ircTags: new Map(),
    msgid: undefined,
    replyTo: undefined,
    account: undefined,
  }, []);
}

// ---------------------------------------------------------------------------
// Nicklist
// ---------------------------------------------------------------------------

export function setNicklist(pointer: string, nicks: WeeChatNick[]): void {
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    const rec: Record<string, WeeChatNick> = {};
    for (const n of nicks) rec[n.name] = n;
    e.nicks = rec;
    e.nickGroups = buildNickGroups(rec);
  }));
}

export function addNick(pointer: string, nick: WeeChatNick): void {
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    e.nicks[nick.name] = nick;
    e.nickGroups = buildNickGroups(e.nicks);
  }));
}

/** Remove by nick pointer id or name. */
export function removeNick(pointer: string, nickId: string): void {
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    for (const [name, nick] of Object.entries(e.nicks)) {
      if (nick.id === nickId || nick.name === nickId) {
        delete e.nicks[name];
        break;
      }
    }
    e.nickGroups = buildNickGroups(e.nicks);
  }));
}

/** Rename a nick in place (keeps prefix/color). */
export function updateNick(pointer: string, oldName: string, newName: string): void {
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    const nick = e.nicks[oldName];
    if (!nick) return;
    delete e.nicks[oldName];
    e.nicks[newName] = { ...nick, name: newName };
    e.nickGroups = buildNickGroups(e.nicks);
  }));
}

// ---------------------------------------------------------------------------
// Active buffer / unread
// ---------------------------------------------------------------------------

export function setActiveBuffer(pointer: string): void {
  setState('activeBuffer', pointer);
  clearUnread(pointer);
  const entry = state.buffers[pointer];
  if (entry && typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_BUFFER_KEY, entry.buffer.fullName || entry.buffer.name);
  }
}

/** Re-activate the buffer persisted under 'db-last-buffer', if present. */
export function restoreLastBuffer(): void {
  if (typeof localStorage === 'undefined') return;
  const name = localStorage.getItem(LAST_BUFFER_KEY);
  if (!name) return;
  const entry = findByName(name);
  if (entry) setActiveBuffer(entry.buffer.id);
}

export function clearUnread(pointer: string): void {
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    e.unread = 0;
    e.highlighted = 0;
    e.lastSeen = new Date();
  }));
}

/**
 * Reconcile the WeeChat server hotlist onto unread/highlight counters (skips
 * the active buffer). Unread is double-sourced — `addLine` increments locally
 * as lines arrive, and the hotlist reports server-authoritative totals — so a
 * hotlist snapshot generated *before* a line the client already counted would,
 * if applied verbatim, visibly regress the counter. Reconcile with `max`: the
 * hotlist may only *raise* a still-listed buffer's counters, never lower them.
 * A genuine read drops the buffer from the hotlist entirely (handled by
 * `clearUnread` on activation), so it never flows through here as a lower count.
 */
export function updateHotlist(items: HotlistEntry[]): void {
  setState(produce((s) => {
    for (const item of items) {
      const e = s.buffers[item.buffer];
      if (!e || item.buffer === s.activeBuffer) continue;
      const messages = item.count[1] + item.count[2];
      const highlights = item.count[3];
      e.unread = Math.max(e.unread, messages + highlights);
      e.highlighted = Math.max(e.highlighted, highlights);
    }
  }));
}

export function setLoading(pointer: string, loading: boolean): void {
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (e) e.loading = loading;
  }));
}

/** Place the read marker at the current end of the buffer. */
export function setReadMarker(pointer: string): void {
  const entry = state.buffers[pointer];
  if (!entry) return;
  setState('readMarkerPos', pointer, entry.lines.length);
}

// ---------------------------------------------------------------------------
// Typing
// ---------------------------------------------------------------------------

/** 'active' expires after 30s, 'paused' after 8s, 'done' removes. */
export function setTyping(pointer: string, nick: string, typingState: 'active' | 'paused' | 'done'): void {
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    if (typingState === 'done') {
      delete e.typing[nick];
    } else {
      const expiry = Date.now() + (typingState === 'active' ? TYPING_ACTIVE_MS : TYPING_PAUSED_MS);
      e.typing[nick] = { state: typingState, expiry } satisfies TypingInfo;
    }
  }));
}

/** Drop expired typing entries (call periodically from the typing UI). */
export function pruneTyping(pointer: string): void {
  const entry = state.buffers[pointer];
  if (!entry) return;
  const now = Date.now();
  const expired = Object.entries(entry.typing).filter(([, info]) => info.expiry < now);
  if (expired.length === 0) return;
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    for (const [nick] of expired) delete e.typing[nick];
  }));
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export function addReaction(pointer: string, msgid: string, emoji: string, nick: string): void {
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    const list = (e.reactions[msgid] ??= []);
    let r = list.find((x) => x.emoji === emoji);
    if (!r) {
      r = { emoji, nicks: [] } satisfies Reaction;
      list.push(r);
    }
    if (!r.nicks.includes(nick)) r.nicks.push(nick);
  }));
}

// ---------------------------------------------------------------------------
// Channel modes
// ---------------------------------------------------------------------------

/** Apply a "+mode-mode" string to the buffer's tracked mode letters. */
export function applyModeChange(pointer: string, modeStr: string): void {
  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    let adding = true;
    for (const ch of modeStr) {
      if (ch === '+') { adding = true; continue; }
      if (ch === '-') { adding = false; continue; }
      if (/[a-zA-Z]/.test(ch)) {
        const idx = e.modes.indexOf(ch);
        if (adding && idx === -1) e.modes.push(ch);
        else if (!adding && idx !== -1) e.modes.splice(idx, 1);
      }
    }
  }));
}

// ---------------------------------------------------------------------------
// Pin / mute / ignore
// ---------------------------------------------------------------------------

export function togglePin(pointer: string): void {
  const entry = state.buffers[pointer];
  if (!entry) return;
  const name = entry.buffer.fullName || entry.buffer.name;
  setState(produce((s) => {
    if (s.pinnedBuffers[name]) delete s.pinnedBuffers[name];
    else s.pinnedBuffers[name] = true;
  }));
  saveKeys(PIN_KEY, state.pinnedBuffers);
}

export function toggleMute(pointer: string): void {
  const entry = state.buffers[pointer];
  if (!entry) return;
  const name = entry.buffer.fullName || entry.buffer.name;
  setState(produce((s) => {
    delete s.temporaryMutes[name];
    if (s.mutedBuffers[name]) delete s.mutedBuffers[name];
    else s.mutedBuffers[name] = true;
  }));
  saveKeys(MUTE_KEY, state.mutedBuffers);
  saveTemporaryMutes(state.temporaryMutes);
}

/** Temporarily silence one buffer without changing its synced notification tier. */
export function muteTemporarily(pointer: string, durationMs: number, now = Date.now()): number {
  const entry = state.buffers[pointer];
  if (!entry || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const name = entry.buffer.fullName || entry.buffer.name;
  const until = now + Math.min(durationMs, MAX_TEMPORARY_MUTE_MS);
  setState('temporaryMutes', name, until);
  saveTemporaryMutes(state.temporaryMutes);
  return until;
}

export function clearTemporaryMute(pointer: string): void {
  const entry = state.buffers[pointer];
  if (!entry) return;
  const name = entry.buffer.fullName || entry.buffer.name;
  setState(produce((s) => { delete s.temporaryMutes[name]; }));
  saveTemporaryMutes(state.temporaryMutes);
}

/** Remove expired entries and persist only when something changed. */
export function pruneTemporaryMutes(now = Date.now()): void {
  const expired = Object.entries(state.temporaryMutes)
    .filter(([, until]) => until <= now)
    .map(([name]) => name);
  if (expired.length === 0) return;
  setState(produce((s) => {
    for (const name of expired) delete s.temporaryMutes[name];
  }));
  saveTemporaryMutes(state.temporaryMutes);
}

/**
 * Policy aliases sent to the service worker. Full names preserve reconnect
 * identity; loaded short names let an Orochi push `{from}` or `{target}` match.
 */
export function notificationMuteSnapshot(now = Date.now()): {
  mutedTargets: string[];
  temporaryMutes: Record<string, number>;
} {
  const muted = new Set(Object.keys(state.mutedBuffers).map(normalizeNotificationTarget));
  const temporaryMutes: Record<string, number> = {};
  for (const [name, until] of Object.entries(state.temporaryMutes)) {
    if (until > now) temporaryMutes[normalizeNotificationTarget(name)] = until;
  }
  for (const entry of Object.values(state.buffers)) {
    const fullName = entry.buffer.fullName || entry.buffer.name;
    const aliases = [fullName, entry.buffer.name, entry.buffer.shortName, entry.buffer.localVars['channel']]
      .map(normalizeNotificationTarget)
      .filter(Boolean);
    if (state.mutedBuffers[fullName]) for (const alias of aliases) muted.add(alias);
    const until = state.temporaryMutes[fullName] ?? 0;
    if (until > now) for (const alias of aliases) temporaryMutes[alias] = until;
  }
  return { mutedTargets: [...muted].filter(Boolean).sort(), temporaryMutes };
}

/**
 * Set a buffer's notify tier. Keeps the two persisted stores consistent:
 * 'mute' lives in db-muted, 'mentions' in db-notify-modes, and 'all' clears
 * both (it is the default). A buffer is therefore never both muted and holding
 * a stale 'mentions'/'all' override.
 */
export function setNotifyMode(pointer: string, mode: NotifyMode): void {
  const entry = state.buffers[pointer];
  if (!entry) return;
  const name = entry.buffer.fullName || entry.buffer.name;
  setState(produce((s) => {
    delete s.temporaryMutes[name];
    if (mode === 'mute') {
      s.mutedBuffers[name] = true;
      delete s.notifyModes[name];
    } else {
      delete s.mutedBuffers[name];
      // The default tier is encoded by absence; any other (i.e. 'all') is stored.
      if (mode === DEFAULT_NOTIFY_MODE) delete s.notifyModes[name];
      else s.notifyModes[name] = mode;
    }
  }));
  saveKeys(MUTE_KEY, state.mutedBuffers);
  saveNotifyModes(state.notifyModes);
  saveTemporaryMutes(state.temporaryMutes);
}

/**
 * Advance a buffer to the next tier (all -> mentions -> mute -> all) and return
 * the effective mode. A no-op for an unknown pointer, so the returned mode is
 * read back rather than assumed.
 */
export function cycleNotifyMode(pointer: string): NotifyMode {
  setNotifyMode(pointer, nextNotifyMode(getNotifyMode(pointer)));
  return getNotifyMode(pointer);
}

export interface BufferPreferenceSnapshot {
  pinned: boolean;
  notify: NotifyMode;
}

/** Stable-name snapshot of the only buffer preferences safe to sync. */
export function exportBufferPreferences(): Record<string, BufferPreferenceSnapshot> {
  const names = new Set([
    ...Object.keys(state.pinnedBuffers),
    ...Object.keys(state.mutedBuffers),
    ...Object.keys(state.notifyModes),
  ]);
  const out: Record<string, BufferPreferenceSnapshot> = {};
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const pinned = state.pinnedBuffers[name] === true;
    const notify = state.mutedBuffers[name] ? 'mute' : (state.notifyModes[name] ?? DEFAULT_NOTIFY_MODE);
    if (pinned || notify !== DEFAULT_NOTIFY_MODE) out[name] = { pinned, notify };
  }
  return out;
}

/** Replace the synced buffer preference set and persist every backing store. */
export function applyBufferPreferences(value: Record<string, BufferPreferenceSnapshot>): void {
  const pinned: Record<string, true> = {};
  const muted: Record<string, true> = {};
  const notifyModes: Record<string, NotifyMode> = {};
  for (const [name, pref] of Object.entries(value)) {
    if (!name) continue;
    if (pref.pinned) pinned[name] = true;
    if (pref.notify === 'mute') muted[name] = true;
    else if (pref.notify !== DEFAULT_NOTIFY_MODE) notifyModes[name] = pref.notify;
  }
  setState('pinnedBuffers', reconcile(pinned));
  setState('mutedBuffers', reconcile(muted));
  setState('notifyModes', reconcile(notifyModes));
  saveKeys(PIN_KEY, state.pinnedBuffers);
  saveKeys(MUTE_KEY, state.mutedBuffers);
  saveNotifyModes(state.notifyModes);
}

export function addIgnore(nick: string): void {
  setState('ignoredNicks', nick.toLowerCase(), true);
  saveKeys(IGNORE_KEY, state.ignoredNicks);
}

export function removeIgnore(nick: string): void {
  setState(produce((s) => { delete s.ignoredNicks[nick.toLowerCase()]; }));
  saveKeys(IGNORE_KEY, state.ignoredNicks);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Next (or previous) buffer pointer with pending highlights, wrapping. */
export function nextHighlighted(forward = true): string | null {
  const sorted = getSorted();
  if (!sorted.length) return null;
  const active = state.activeBuffer;
  const cur = sorted.findIndex((e) => e.buffer.id === active);
  const step = forward ? 1 : -1;
  for (let i = 1; i <= sorted.length; i++) {
    const idx = ((cur + step * i) % sorted.length + sorted.length) % sorted.length;
    const e = sorted[idx];
    if (e && e.highlighted > 0) return e.buffer.id;
  }
  return null;
}
