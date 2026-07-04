// Buffers store — the chat backbone state.
//
// Holds every WeeChat buffer (channel/private/server) with its lines, nicks,
// unread counters, typing/reaction state and channel modes. Collections are
// plain objects (Record) / arrays so Solid store proxies track them.

import { createStore, produce } from 'solid-js/store';
import type { WeeChatBuffer, WeeChatLine, WeeChatNick, HotlistEntry } from '@/lib/weechat/model';
import type { BufferEntry, Reaction, TypingInfo } from '@/types';

const MAX_LINES = 5000;
const CONTENT_DEDUP_WINDOW_MS = 3000;
const CONTENT_DEDUP_SCAN = 10;
const TYPING_ACTIVE_MS = 30_000;
const TYPING_PAUSED_MS = 8_000;

const PIN_KEY = 'db-pinned';
const MUTE_KEY = 'db-muted';
const IGNORE_KEY = 'db-ignored';
const LAST_BUFFER_KEY = 'db-last-buffer';

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
      const out: Record<string, true> = {};
      for (const name of JSON.parse(raw) as string[]) out[name] = true;
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
  /** Muted buffer full names (persisted 'db-muted'). */
  mutedBuffers: Record<string, true>;
  /** Buffer pointer -> line index of the read marker. */
  readMarkerPos: Record<string, number>;
}

const [state, setState] = createStore<BuffersState>({
  buffers: {},
  activeBuffer: null,
  pinnedBuffers: loadKeys(PIN_KEY),
  ignoredNicks: loadKeys(IGNORE_KEY),
  mutedBuffers: loadKeys(MUTE_KEY),
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
 * Append a single live line.
 *
 * Dedup: O(1) id lookup, then a content scan over the last 10 lines within a
 * 3s window (same nick + message). Confirmed echoes replace their `_opt_`
 * optimistic placeholder. Client-side highlight words mark the line
 * highlighted before insertion. Unread/highlight counters bump when the
 * buffer is not active.
 */
export function addLine(pointer: string, line: WeeChatLine, highlightWords: string[]): void {
  // Suppress ignored nicks
  if (line.nick && state.ignoredNicks[line.nick.toLowerCase()]) return;

  const entry = state.buffers[pointer];
  if (!entry) return;

  const opt = isOptimistic(line.id);

  // Deduplicate: O(1) id lookup
  if (!opt && entry.lineIds[line.id]) return;

  // Content-based dedup: skip if a recent line has identical nick+message
  // (catches cases where the same message arrives with different pointer IDs)
  if (!opt && line.message && entry.lines.length > 0) {
    const tail = entry.lines;
    const cutoff = line.date.getTime() - CONTENT_DEDUP_WINDOW_MS;
    for (let i = tail.length - 1; i >= Math.max(0, tail.length - CONTENT_DEDUP_SCAN); i--) {
      const l = tail[i];
      if (!l) break;
      if (l.date.getTime() < cutoff) break;
      if (isOptimistic(l.id)) continue;
      if (l.nick === line.nick && l.message === line.message) return;
    }
  }

  // Client-side highlight words (applied before insertion so the stored line
  // carries the highlight flag)
  if (!line.highlight && line.message && highlightWords.length > 0) {
    const lcMsg = line.message.toLowerCase();
    for (const word of highlightWords) {
      const lc = word.trim().toLowerCase();
      if (lc && lcMsg.includes(lc)) {
        line = { ...line, highlight: true };
        break;
      }
    }
  }

  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;

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

    if (e.lines.length > MAX_LINES) {
      e.lines = e.lines.slice(-MAX_LINES);
      // Rebuild the index from the trimmed array to prevent unbounded growth
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

    if (s.activeBuffer !== pointer && line.displayed && !opt) {
      e.unread += 1;
      if (line.highlight) e.highlighted += 1;
    }
  }));
}

/** Bulk-insert lines (history). `prepend` puts them before existing lines. */
export function addLines(pointer: string, lines: WeeChatLine[], prepend = false): void {
  const entry = state.buffers[pointer];
  if (!entry) return;

  // O(1) id lookup + content-based dedup over 3s buckets
  const existingIds = entry.lineIds;
  const existingContent = new Set<string>();
  for (const l of entry.lines) {
    if (isOptimistic(l.id) || !l.nick || !l.message) continue;
    existingContent.add(`${l.nick}\0${l.message}\0${Math.floor(l.date.getTime() / CONTENT_DEDUP_WINDOW_MS)}`);
  }
  const seenInBatch = new Set<string>();
  const fresh = lines.filter((l) => {
    if (existingIds[l.id]) return false;
    if (seenInBatch.has(l.id)) return false;
    seenInBatch.add(l.id);
    if (l.nick && l.message) {
      const bucket = Math.floor(l.date.getTime() / CONTENT_DEDUP_WINDOW_MS);
      const key = `${l.nick}\0${l.message}\0${bucket}`;
      if (existingContent.has(key) ||
          existingContent.has(`${l.nick}\0${l.message}\0${bucket - 1}`) ||
          existingContent.has(`${l.nick}\0${l.message}\0${bucket + 1}`)) return false;
      existingContent.add(key);
    }
    return true;
  });
  if (fresh.length === 0) return;

  setState(produce((s) => {
    const e = s.buffers[pointer];
    if (!e) return;
    let newLines = prepend ? [...fresh, ...e.lines] : [...e.lines, ...fresh];
    if (newLines.length > MAX_LINES) newLines = newLines.slice(-MAX_LINES);
    e.lines = newLines;
    // Rebuild the id index from the final array (handles trimming)
    const ids: Record<string, true> = {};
    for (const l of newLines) if (!isOptimistic(l.id)) ids[l.id] = true;
    e.lineIds = ids;
  }));
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

/** Map WeeChat hotlist counts onto unread/highlight counters (skips active). */
export function updateHotlist(items: HotlistEntry[]): void {
  setState(produce((s) => {
    for (const item of items) {
      const e = s.buffers[item.buffer];
      if (!e || item.buffer === s.activeBuffer) continue;
      const messages = item.count[1] + item.count[2];
      const highlights = item.count[3];
      e.unread = messages + highlights;
      e.highlighted = highlights;
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
    if (s.mutedBuffers[name]) delete s.mutedBuffers[name];
    else s.mutedBuffers[name] = true;
  }));
  saveKeys(MUTE_KEY, state.mutedBuffers);
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
