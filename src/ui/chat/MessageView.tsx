// MessageView — the virtualized message list for one buffer.
//
// Renders a flat item list (day separators + inline "new" read marker +
// grouped message lines) through @tanstack/solid-virtual, with:
//   - join/part/quit filtering per settings.joinPartMsgs
//   - same-nick-within-5-min message grouping (dimmed continuations)
//   - per-buffer Ctrl+F search (non-matching lines dimmed, match count)
//   - auto-stick to bottom + scroll-to-bottom FAB with missed count
//   - infinite history load near the top (connection.requestHistory)
//   - read-marker stamping on buffer switch
//   - iOS keyboard re-pin ('viewport-stable' window event + visualViewport)
//   - wired MessageEmbed (extractEmbeds) + ReactionBar per line and a
//     TypingIndicator at the bottom (the old app left these orphaned)
//
// Props take a buffer pointer so the App can mount two instances for the
// split pane.

import { createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack, For, Match, Show, Switch } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { buffersState, historyReceipt, setActive, setReadMarker, requestHistory, requestHistoryTotal, settings, uiState, setSearchOpen } from '@/state';
import type { Reaction, WeeChatLine } from '@/types';
import { searchArchive } from '@/lib/archive/client';
import type { ArchiveSearchHit } from '@/lib/archive/types';
import { consumeScrollRequest, requestScrollToMessage, threadsState } from '@/state/threads';
import { bufferKind, type BufferKind } from '@/lib/bufferKind';
import { extractEmbeds, stripFormatting, type MediaEmbed } from '@/lib/irc-classic/formatter';
import { parseSearchQuery, type SearchQuery } from '@/lib/search/grammar';
import { matchesQuery, type SearchRecord } from '@/lib/search/matcher';
import { createMediaQuery } from '@/primitives/mediaQuery';
import MessageLine from './MessageLine';
import MessageEmbed from './MessageEmbed';
import ReactionBar from './ReactionBar';
import TypingIndicator from './TypingIndicator';
import { formatDate, formatNumber, t } from '@/lib/i18n';
import { isImeComposing } from '@/primitives/ime';

export interface MessageViewProps {
  bufferPtr: string;
}

// ── Render item types (flat list including day separators & read marker) ────
interface DayItem { kind: 'day'; key: string; date: Date }
interface ReadMarkerItem { kind: 'readMarker'; key: string }
interface MsgItem { kind: 'msg'; key: string; line: WeeChatLine; grouped: boolean; dimmed: boolean }
type RenderItem = DayItem | ReadMarkerItem | MsgItem;

// A completed render-item build plus the snapshot needed to extend it
// incrementally on the next tail append (see buildRenderItems).
export interface RenderItemBuild {
  items: RenderItem[];
  ptr: string;
  special: boolean;
  readMarker: number | undefined;
  query: string;
  len: number;
  firstLine: WeeChatLine | undefined;
  lastLine: WeeChatLine | undefined;
  lastDayKey: string | null;
  prevMsgLine: WeeChatLine | null;
}

export interface RenderItemInput {
  ptr: string;
  special: boolean;
  readMarker: number | undefined;
  matches: { ids: Record<string, true> } | null;
  query: string;
  lines: readonly WeeChatLine[];
}

const GROUP_WINDOW_MS = 300_000; // same-nick grouping window (5 min)
const HISTORY_TOP_PX = 200; // scrollTop threshold that triggers history load
const AT_BOTTOM_PX = 40;
const HISTORY_PAGE = 100;
const ANNOUNCE_MAX = 30; // cap the live-region node count (old nodes are removals, unspoken)
const ARCHIVE_JUMP_PAGE = 500;
const ARCHIVE_JUMP_ATTEMPTS = 9;
const ARCHIVE_JUMP_MAX_TOTAL = 100_000;

interface PendingArchiveJump {
  bufferPtr: string;
  msgid: string;
  requestedTotal: number;
  attempts: number;
  receiptNonce: number;
}

// A jump may switch buffers and remount MessageView, so the bounded pagination
// intent lives at module scope until whichever mounted view owns the target.
let pendingArchiveJump: PendingArchiveJump | null = null;

function getDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Build the flat render-item list (day separators + inline read marker + grouped
// message lines) INCREMENTALLY.
//
// Building this over a 5000-line buffer allocates thousands of item objects
// (day-key strings, date math, grouping logic); doing it on every tail line is
// the list's hottest waste. So when `input.lines` is a clean tail-extension of
// the previous build — same shape inputs (buffer, join/part filter, search
// query, read-marker index) and an intact prefix (front not trimmed, boundary
// line identity unchanged) — the previously built prefix is reused BY REFERENCE
// (which also preserves the keyed <For> DOM identity of untouched rows) and only
// the newly appended lines get fresh items, carrying the day/grouping state
// across the window's top edge so the first new row groups exactly as a full
// rebuild would. Any other change (front trim at MAX_LINES, optimistic-echo
// splice, history prepend, filter/search/marker/buffer change) triggers a full
// rebuild. The output is identical to a from-scratch build in every case.
//
// Prefix identity is compared via snapshotted line references, so the fast path
// holds even when joinPartMsgs returns the live store array mutated in place by
// produce() (same array object across pushes).
export function buildRenderItems(prev: RenderItemBuild | null, input: RenderItemInput): RenderItemBuild {
  const { ptr, special, readMarker, matches, query, lines } = input;
  const len = lines.length;

  const canAppend =
    prev !== null &&
    ptr === prev.ptr &&
    special === prev.special &&
    readMarker === prev.readMarker &&
    query === prev.query &&
    prev.len > 0 &&
    len >= prev.len &&
    lines[0] === prev.firstLine &&
    lines[prev.len - 1] === prev.lastLine;

  // Nothing appended and nothing reshaped — return the prior build untouched so
  // the memo's reference-equality check short-circuits downstream work.
  if (canAppend && len === prev.len) return prev;

  const items: RenderItem[] = canAppend ? prev.items.slice() : [];
  const startIdx = canAppend ? prev.len : 0;
  let lastDayKey = canAppend ? prev.lastDayKey : null;
  let prevMsgLine = canAppend ? prev.prevMsgLine : null;

  for (let i = startIdx; i < len; i++) {
    const line = lines[i];
    if (!line) continue;
    const dayKey = getDayKey(line.date);
    const dayChanged = dayKey !== lastDayKey;

    if (!special && dayChanged) {
      items.push({ kind: 'day', key: `day-${dayKey}`, date: line.date });
      lastDayKey = dayKey;
    }

    if (readMarker !== undefined && i === readMarker) {
      items.push({ kind: 'readMarker', key: `rm-${readMarker}` });
    }

    const grouped = !special && !!(
      prevMsgLine &&
      !dayChanged &&
      line.nick &&
      prevMsgLine.nick === line.nick &&
      !line.isAction && !prevMsgLine.isAction &&
      !line.isJoin && !line.isPart && !line.isQuit &&
      !prevMsgLine.isJoin && !prevMsgLine.isQuit &&
      line.date.getTime() - prevMsgLine.date.getTime() < GROUP_WINDOW_MS
    );

    const dimmed = matches !== null && !matches.ids[line.id];
    items.push({ kind: 'msg', key: line.id, line, grouped, dimmed });
    prevMsgLine = line;
  }

  return {
    items,
    ptr,
    special,
    readMarker,
    query,
    len,
    firstLine: lines[0],
    lastLine: lines[len - 1],
    lastDayKey,
    prevMsgLine,
  };
}

// Screen-reader text for one newly-arrived line: nick + plain-text body, with
// mIRC/ANSI control codes stripped so the announcement isn't garbled.
function announceText(line: WeeChatLine): string {
  const body = stripFormatting(line.message).trim();
  if (line.isJoin || line.isPart || line.isQuit || line.isNotice || !line.nick) return body;
  if (line.isAction) return `${line.nick} ${body}`;
  return `${line.nick}: ${body}`;
}

// Adapt a WeeChat line into the wire-free record the search matcher consumes.
function lineToRecord(line: WeeChatLine, channel: string): SearchRecord {
  return {
    nick: line.nick ?? null,
    channel,
    timestamp: line.date.getTime(),
    text: line.message,
  };
}

// ── Cross-buffer match count (bounded rescan) ──────────────────────────────
// The search bar shows "N here · M across buffers"; M sums matches across every
// LOADED buffer. A naive memo rescans the WHOLE loaded corpus (up to MAX_LINES
// × #buffers) on ANY line into ANY buffer while search is open — the hottest
// waste once several busy channels are open. Messages are never edited in place
// (buffers only append / optimistic-splice / trim / prepend — see buffers.ts),
// so a buffer's match contribution can only change when its
// (length, first-id, last-id) signature moves. We cache each buffer's partial
// count keyed on that signature and rescan only buffers whose signature changed,
// dropping the per-tick cost from O(whole corpus) to O(the one changed buffer +
// #buffers). The returned total is identical to a from-scratch sum in every case.

export interface GlobalCountState {
  query: SearchQuery | null;
  skipMeta: boolean;
  perBuffer: Map<string, { sig: string; count: number }>;
}

export function createGlobalCountState(): GlobalCountState {
  return { query: null, skipMeta: false, perBuffer: new Map() };
}

export interface CountBuffer {
  ptr: string;
  channel: string;
  lines: readonly WeeChatLine[];
}

// Cheap change-signal for one buffer's line set. Because lines are append-only
// (never mutated in place), any add/splice/trim/prepend shifts length and/or a
// boundary id, so this triple detects every content change that matters.
function bufferSig(lines: readonly WeeChatLine[]): string {
  const n = lines.length;
  if (n === 0) return '0';
  return `${n} ${lines[0]!.id} ${lines[n - 1]!.id}`;
}

export function globalMatchTotal(
  state: GlobalCountState,
  query: SearchQuery,
  skipMeta: boolean,
  buffers: Iterable<CountBuffer>,
  match: (line: WeeChatLine, channel: string) => boolean,
): number {
  // A query or meta-filter change invalidates every cached partial count.
  if (state.query !== query || state.skipMeta !== skipMeta) {
    state.perBuffer.clear();
    state.query = query;
    state.skipMeta = skipMeta;
  }
  const seen = new Set<string>();
  let total = 0;
  for (const b of buffers) {
    seen.add(b.ptr);
    const sig = bufferSig(b.lines);
    const cached = state.perBuffer.get(b.ptr);
    if (cached && cached.sig === sig) {
      total += cached.count; // unchanged buffer — reuse, no rescan
      continue;
    }
    let count = 0;
    for (const line of b.lines) {
      if (skipMeta && (line.isJoin || line.isPart || line.isQuit)) continue;
      if (match(line, b.channel)) count++;
    }
    state.perBuffer.set(b.ptr, { sig, count });
    total += count;
  }
  // Evict counts for buffers that closed so the cache can't grow across a session.
  if (state.perBuffer.size > seen.size) {
    for (const k of state.perBuffer.keys()) if (!seen.has(k)) state.perBuffer.delete(k);
  }
  return total;
}

// ── extractEmbeds LRU (rows remount on scroll; avoid re-scanning URLs) ──────
const EMBED_CACHE_MAX = 400;
const embedCache = new Map<string, { text: string; embeds: MediaEmbed[] }>();

function embedsFor(line: WeeChatLine): MediaEmbed[] {
  const hit = embedCache.get(line.id);
  if (hit && hit.text === line.message) return hit.embeds;
  const embeds = extractEmbeds(line.message);
  embedCache.set(line.id, { text: line.message, embeds });
  if (embedCache.size > EMBED_CACHE_MAX) {
    const oldest = embedCache.keys().next().value;
    if (oldest !== undefined) embedCache.delete(oldest);
  }
  return embeds;
}

// ── Small presentational pieces ──────────────────────────────────────────────

function DaySeparator(props: { date: Date }) {
  return (
    <div class="flex items-center gap-2 py-2 my-0.5 px-3 sm:px-1">
      <div class="flex-1 h-px bg-white/[0.035]" />
      <span class="text-[10px] font-medium text-gray-600 select-none whitespace-nowrap">
        {formatDate(props.date, { weekday: 'short', month: 'short', day: 'numeric' })}
      </span>
      <div class="flex-1 h-px bg-white/[0.035]" />
    </div>
  );
}

function ReadMarkerRow() {
  return (
    <div class="flex items-center gap-2 my-1.5 px-3 sm:px-1">
      <div class="flex-1 h-px bg-[var(--role-mention,#f87171)]/25" />
      <span class="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--role-mention,#f87171)]/55 select-none">
        {t('message.new')}
      </span>
      <div class="flex-1 h-px bg-[var(--role-mention,#f87171)]/25" />
    </div>
  );
}

function EmptyState() {
  return (
    <div class="flex-1 flex items-center justify-center px-6">
      <div class="mx-auto w-full max-w-[72ch] text-center space-y-3">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-[var(--custom-accent,#818cf8)]/[0.08] border border-[var(--custom-accent,#818cf8)]/15 flex items-center justify-center">
          <svg class="w-6 h-6 text-[var(--custom-accent,#818cf8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
          </svg>
        </div>
        <p class="text-[var(--color-gray-300)] text-[14px]">{t('message.noBuffer')}</p>
        <p class="text-[var(--color-gray-500)] text-[11px] font-mono">
          <span class="hidden sm:inline">
            <kbd class="px-1.5 py-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[10px]">Ctrl+K</kbd> {t('message.searchHint')}
          </span>
          <span class="sm:hidden">{t('message.swipeHint')}</span>
        </p>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function MessageView(props: MessageViewProps) {
  const entry = () => buffersState.buffers[props.bufferPtr];
  const kind = createMemo<BufferKind>(() => {
    const e = entry();
    return e ? bufferKind(e.buffer) : 'core';
  });
  const isSpecialBuf = () => kind() === 'raw' || kind() === 'fset' || kind() === 'plugin';

  const isMobile = createMediaQuery('(max-width: 639px)');
  const isDesktop = createMediaQuery('(min-width: 640px)');

  let scrollEl: HTMLDivElement | undefined;
  let searchInput: HTMLInputElement | undefined;
  let archiveResultsEl: HTMLDivElement | undefined;
  let atBottom = true;
  let lockScroll = false;
  let prevLineCount = 0;

  const [showScrollBtn, setShowScrollBtn] = createSignal(false);
  const [missedCount, setMissedCount] = createSignal(0);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [archiveHits, setArchiveHits] = createSignal<ArchiveSearchHit[]>([]);
  const [archiveSearching, setArchiveSearching] = createSignal(false);
  const [archiveSearchError, setArchiveSearchError] = createSignal(false);
  const [archiveActiveIndex, setArchiveActiveIndex] = createSignal(-1);
  let archiveSearchGeneration = 0;
  let archiveSearchController: AbortController | null = null;

  // Live-region feed (SC 4.1.3): only NEW tail lines land here. History
  // prepends (requestHistory), buffer switches, and virtual row remounts must
  // never re-announce the transcript, so this is fed by tail-id diffing — not
  // by the virtualized container, which stays out of the live region entirely.
  const [announced, setAnnounced] = createSignal<{ id: string; text: string }[]>([]);
  let announceBufferPtr: string | undefined;
  let lastAnnouncedId: string | undefined;

  const filteredLines = createMemo<WeeChatLine[]>(() => {
    const lines = entry()?.lines ?? [];
    if (settings.joinPartMsgs) return lines;
    return lines.filter((l) => !l.isJoin && !l.isPart && !l.isQuit);
  });

  // Parsed filter-grammar predicate (from:/in:/before:/after: + free text). A
  // bare term parses to a single plain substring, so the classic search is
  // unchanged. Date.now() is read at parse time; only searchOpen/searchQuery
  // are tracked, which is exactly when the query should re-parse.
  const parsedQuery = createMemo(() =>
    parseSearchQuery(uiState.searchOpen ? searchQuery() : '', Date.now()),
  );

  const channelName = (e: ReturnType<typeof entry>): string =>
    e ? e.buffer.shortName || e.buffer.name : '';

  // Matches within the CURRENT buffer — drives per-line dimming + the count.
  const searchMatches = createMemo<{ ids: Record<string, true>; count: number } | null>(() => {
    const query = parsedQuery();
    if (query.isEmpty) return null;
    const channel = channelName(entry());
    const ids: Record<string, true> = {};
    let count = 0;
    for (const line of filteredLines()) {
      if (matchesQuery(lineToRecord(line, channel), query)) {
        ids[line.id] = true;
        count++;
      }
    }
    return { ids, count };
  });

  // Cross-buffer match total over all LOADED lines (bounded by MAX_LINES per
  // buffer). This is what makes `in:#other` meaningful — the list still only
  // dims the current buffer, but the count reflects the whole loaded corpus.
  // Boundary: this searches only lines already fetched into the store, not full
  // server-side history; a persistent index would be needed to search further
  // back than what has been loaded.
  const gcState = createGlobalCountState();
  const globalMatchCount = createMemo<number | null>(() => {
    const query = parsedQuery();
    if (query.isEmpty) return null;
    const skipMeta = !settings.joinPartMsgs;
    const bufs = buffersState.buffers;
    const list: CountBuffer[] = [];
    for (const ptr in bufs) {
      const e = bufs[ptr];
      if (!e) continue;
      list.push({ ptr, channel: e.buffer.shortName || e.buffer.name, lines: e.lines });
    }
    // Cached per-buffer counts: only buffers whose line-set signature moved get
    // rescanned, so a line into buffer B doesn't re-count buffers A/C/…
    return globalMatchTotal(gcState, query, skipMeta, list, (line, channel) =>
      matchesQuery(lineToRecord(line, channel), query),
    );
  });

  // Full-history search runs wholly in the archive worker. The UI only receives
  // the bounded result set; IndexedDB reads and filtering never share this turn.
  createEffect(on(
    [() => uiState.searchOpen, searchQuery, () => settings.archiveRetention],
    ([open, raw, retention]) => {
      const generation = ++archiveSearchGeneration;
      archiveSearchController?.abort();
      archiveSearchController = null;
      setArchiveSearchError(false);
      if (!open || retention === 'off' || raw.trim() === '') {
        setArchiveHits([]);
        setArchiveSearching(false);
        return;
      }
      setArchiveSearching(true);
      const timer = setTimeout(() => {
        const controller = new AbortController();
        archiveSearchController = controller;
        void searchArchive({ query: raw, limit: 100 }, controller.signal)
          .then((hits) => {
            if (generation === archiveSearchGeneration) setArchiveHits(hits);
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted
              || (error instanceof DOMException && error.name === 'AbortError')) return;
            if (generation === archiveSearchGeneration) {
              setArchiveHits([]);
              setArchiveSearchError(true);
            }
          })
          .finally(() => {
            if (archiveSearchController === controller) archiveSearchController = null;
            if (generation === archiveSearchGeneration) setArchiveSearching(false);
          });
      }, 180);
      onCleanup(() => {
        clearTimeout(timer);
        archiveSearchController?.abort();
        archiveSearchController = null;
      });
    },
  ));

  const archiveGroups = createMemo(() => {
    const groups: Array<{ key: string; label: string; hits: ArchiveSearchHit[] }> = [];
    const byKey = new Map<string, { key: string; label: string; hits: ArchiveSearchHit[] }>();
    for (const hit of archiveHits()) {
      const day = formatDate(hit.timestamp, { month: 'short', day: 'numeric', year: 'numeric' });
      const key = `${hit.bufferKey}\0${day}`;
      let group = byKey.get(key);
      if (!group) {
        group = { key, label: `${hit.bufferName} · ${day}`, hits: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.hits.push(hit);
    }
    return groups;
  });

  createEffect(on(archiveHits, () => setArchiveActiveIndex(-1)));

  // Incremental render-item cache. buildRenderItems reuses the previously built
  // prefix by reference on a clean tail append (see its doc), so the memo below
  // only allocates item objects for the newly arrived lines.
  let ciBuild: RenderItemBuild | null = null;
  const renderItems = createMemo<RenderItem[]>(() => {
    ciBuild = buildRenderItems(ciBuild, {
      ptr: props.bufferPtr,
      special: isSpecialBuf(),
      readMarker: buffersState.readMarkerPos[props.bufferPtr],
      matches: searchMatches(),
      query: (uiState.searchOpen ? searchQuery() : '').trim().toLowerCase(),
      lines: filteredLines(),
    });
    return ciBuild.items;
  });

  // ── Virtual list ────────────────────────────────────────────────────────
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return renderItems().length;
    },
    getScrollElement: () => scrollEl ?? null,
    estimateSize: (i: number) => {
      // Rough estimates — the virtualizer measures actual heights after mount
      const item = renderItems()[i];
      if (!item || item.kind === 'day') return 52;
      if (item.kind === 'readMarker') return 28;
      if (!isDesktop()) return item.grouped ? 26 : 60;
      return settings.compactMode ? 22 : 28;
    },
    overscan: 20,
  });

  const scrollToEnd = (smooth = false) => {
    const len = untrack(() => renderItems().length);
    if (len === 0) return;
    lockScroll = true;
    virtualizer.scrollToIndex(len - 1, { align: 'end', behavior: smooth ? 'smooth' : 'auto' });
    requestAnimationFrame(() => {
      lockScroll = false;
    });
  };

  createEffect(on([
    () => threadsState.scrollRequest?.nonce,
    () => entry()?.lines.length,
    () => entry()?.lines[0]?.id,
    () => entry()?.loading,
    () => historyReceipt().nonce,
  ], () => {
    const request = threadsState.scrollRequest;
    if (!request) return;
    const index = renderItems().findIndex((item) => item.kind === 'msg' && item.line.msgid === request.msgid);
    if (index >= 0) {
      consumeScrollRequest();
      pendingArchiveJump = null;
      lockScroll = true;
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
      requestAnimationFrame(() => { lockScroll = false; });
      return;
    }

    const pending = pendingArchiveJump;
    const current = entry();
    if (!pending || !current || pending.bufferPtr !== props.bufferPtr || current.loading) return;
    const receipt = historyReceipt();
    if (
      receipt.nonce > pending.receiptNonce &&
      receipt.bufferPtr === props.bufferPtr &&
      receipt.returnedCount < pending.requestedTotal
    ) {
      pendingArchiveJump = null;
      consumeScrollRequest();
      return;
    }
    if (pending.attempts >= ARCHIVE_JUMP_ATTEMPTS || pending.requestedTotal >= ARCHIVE_JUMP_MAX_TOTAL) {
      pendingArchiveJump = null;
      consumeScrollRequest();
      return;
    }
    const requestedTotal = Math.min(
      ARCHIVE_JUMP_MAX_TOTAL,
      Math.max(pending.requestedTotal + ARCHIVE_JUMP_PAGE, pending.requestedTotal * 2),
    );
    pendingArchiveJump = {
      ...pending,
      requestedTotal,
      attempts: pending.attempts + 1,
      receiptNonce: receipt.nonce,
    };
    requestHistoryTotal(requestedTotal, props.bufferPtr);
  }));

  // New messages — scroll if at bottom, otherwise count them for the FAB
  createEffect(on(() => filteredLines().length, (count) => {
    if (!atBottom && count > prevLineCount) {
      setMissedCount((prev) => prev + (count - prevLineCount));
    }
    if (atBottom) {
      requestAnimationFrame(() => scrollToEnd());
    }
    prevLineCount = count;
  }));

  // Announce new-tail messages only. Keyed on line count (reactive on push,
  // unlike the raw memo when join/part filtering is off) plus bufferPtr, so a
  // buffer switch always re-baselines silently.
  createEffect(on([() => props.bufferPtr, () => filteredLines().length], () => {
    const ptr = props.bufferPtr;
    const lines = untrack(filteredLines);
    // Buffer switch or first mount: adopt the current tail as the baseline and
    // stay silent — the existing transcript is never announced.
    if (ptr !== announceBufferPtr) {
      announceBufferPtr = ptr;
      lastAnnouncedId = lines[lines.length - 1]?.id;
      return;
    }
    const newLast = lines[lines.length - 1]?.id;
    // Unchanged tail => a prepend (requestHistory), reconcile, or no-op. Silent.
    if (newLast === undefined || newLast === lastAnnouncedId) return;
    // The baseline is the previous tail, so it sits near the end — scan from the
    // back (findLastIndex) instead of the front so this stays O(new tail) rather
    // than O(buffer) on every message. Ids are unique, so back-scan and
    // front-scan return the same index; behavior is identical.
    const prevIdx = lastAnnouncedId === undefined ? -1 : lines.findLastIndex((l) => l.id === lastAnnouncedId);
    // Known baseline: announce everything after it. Unknown baseline (trimmed
    // away or was empty): announce only the final line, never the transcript.
    const tail = prevIdx >= 0 ? lines.slice(prevIdx + 1) : lines.slice(-1);
    lastAnnouncedId = newLast;
    if (tail.length === 0) return;
    const additions = tail.map((l) => ({ id: l.id, text: announceText(l) }));
    setAnnounced((prev) => [...prev, ...additions].slice(-ANNOUNCE_MAX));
  }));

  // Buffer switch — scroll to bottom, reset state, stamp the read marker
  createEffect(on(() => props.bufferPtr, (ptr) => {
    lockScroll = true;
    requestAnimationFrame(() => {
      scrollToEnd();
      atBottom = true;
      setShowScrollBtn(false);
      setMissedCount(0);
      prevLineCount = untrack(() => filteredLines().length);
      setReadMarker(ptr);
      setSearchOpen(false);
      setSearchQuery('');
      setTimeout(() => {
        lockScroll = false;
      }, 100);
    });
  }));

  // iOS virtual keyboard: keep messages pinned to bottom when keyboard opens
  onMount(() => {
    const vp = window.visualViewport;
    if (!vp) return;

    let prevHeight = vp.height;
    let wasAtBottom = true;

    const snapshot = () => {
      const el = scrollEl;
      if (el) wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    };

    const onResize = () => {
      const delta = vp.height - prevHeight;
      prevHeight = vp.height;
      if (wasAtBottom || delta > 0) {
        lockScroll = true;
        scrollToEnd();
        requestAnimationFrame(() => {
          scrollToEnd();
          atBottom = true;
          setShowScrollBtn(false);
        });
        setTimeout(() => {
          scrollToEnd();
          lockScroll = false;
        }, 350);
      }
      setTimeout(snapshot, 500);
    };

    document.addEventListener('focusin', snapshot, { passive: true });
    vp.addEventListener('resize', onResize);
    onCleanup(() => {
      document.removeEventListener('focusin', snapshot);
      vp.removeEventListener('resize', onResize);
    });
  });

  // Scroll handler — detect bottom and trigger history load near the top
  let scrollRaf = 0;
  const onScroll = () => {
    if (lockScroll) return;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const el = scrollEl;
      if (!el) return;
      const nowAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_PX;
      atBottom = nowAtBottom;
      setShowScrollBtn(!nowAtBottom);
      if (nowAtBottom) setMissedCount(0);
      if (el.scrollTop < HISTORY_TOP_PX && !(entry()?.loading ?? false)) {
        requestHistory(HISTORY_PAGE, props.bufferPtr);
      }
    });
  };
  onCleanup(() => cancelAnimationFrame(scrollRaf));

  const scrollToBottom = () => {
    scrollToEnd(true);
    setMissedCount(0);
  };

  const openArchiveHit = (hit: ArchiveSearchHit) => {
    const target = Object.values(buffersState.buffers).find((candidate) =>
      (candidate.buffer.fullName || candidate.buffer.name) === hit.bufferKey,
    );
    if (!target) return;
    setActive(target.buffer.id);
    if (!hit.msgid) return;
    requestScrollToMessage(hit.msgid);
    if (target.msgIndex[hit.msgid] !== undefined) return;
    const requestedTotal = Math.min(
      ARCHIVE_JUMP_MAX_TOTAL,
      target.lines.filter((line) => !line.id.startsWith('_opt_')).length + ARCHIVE_JUMP_PAGE,
    );
    pendingArchiveJump = {
      bufferPtr: target.buffer.id,
      msgid: hit.msgid,
      requestedTotal,
      attempts: 1,
      receiptNonce: historyReceipt().nonce,
    };
    requestHistoryTotal(requestedTotal, target.buffer.id);
  };

  const focusArchiveResult = (index: number) => {
    const count = archiveHits().length;
    if (count === 0) return;
    const next = Math.max(0, Math.min(count - 1, index));
    setArchiveActiveIndex(next);
    queueMicrotask(() => {
      archiveResultsEl
        ?.querySelector<HTMLButtonElement>(`button[data-archive-hit-index="${next}"]`)
        ?.focus();
    });
  };

  const onArchiveResultKeyDown = (event: KeyboardEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-archive-hit-index]');
    if (!button) return;
    const current = Number(button.dataset.archiveHitIndex);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusArchiveResult(current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (current === 0) searchInput?.focus();
      else focusArchiveResult(current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusArchiveResult(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusArchiveResult(archiveHits().length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      searchInput?.focus();
    }
  };

  // Re-pin after layout settles (iOS keyboard close, orientation change)
  onMount(() => {
    const onStable = () => {
      if (atBottom) scrollToEnd();
    };
    window.addEventListener('viewport-stable', onStable);
    onCleanup(() => window.removeEventListener('viewport-stable', onStable));
  });

  // Ctrl+F search toggle (defaultPrevented guard keeps split-pane instances
  // from double-toggling the shared searchOpen flag)
  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isImeComposing(e)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (uiState.searchOpen) {
          setSearchQuery('');
          setSearchOpen(false);
        } else {
          setSearchOpen(true);
          setTimeout(() => searchInput?.focus(), 50);
        }
      }
      if (e.key === 'Escape' && uiState.searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  const reactionsOf = (msgid: string): Reaction[] => entry()?.reactions[msgid] ?? [];

  return (
    <Show when={entry()} fallback={<EmptyState />}>
      <div class="flex-1 flex flex-col min-h-0 relative">
        {/* Live region (SC 4.1.3) — fed new-tail-only; kept OUT of the virtual
            list so scroll/history-prepend/buffer-switch never re-announce. */}
        <div role="log" aria-live="polite" aria-relevant="additions" aria-atomic="false" class="sr-only">
          <For each={announced()}>{(a) => <div>{a.text}</div>}</For>
        </div>

        {/* Search bar */}
        <Show when={uiState.searchOpen}>
          <div class="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-white/[0.04] bg-gray-950/90 backdrop-blur-sm shrink-0 animate-slide-down">
            <svg class="w-3.5 h-3.5 text-gray-500 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="6.5" cy="6.5" r="5" />
              <path d="M10.5 10.5L14.5 14.5" />
            </svg>
            <input
              ref={(el) => (searchInput = el)}
              type="text"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder={t('search.messages')}
              autocomplete="off"
              spellcheck={false}
              onKeyDown={(e) => {
                if (isImeComposing(e)) return;
                if (e.key === 'Escape') {
                  setSearchOpen(false);
                  setSearchQuery('');
                } else if (e.key === 'ArrowDown' && archiveHits().length > 0) {
                  e.preventDefault();
                  focusArchiveResult(0);
                }
              }}
              class="flex-1 bg-transparent text-[13px] text-gray-200 placeholder-gray-600 outline-none"
            />
            <Show when={searchMatches()}>
              {(matches) => (
                <span class="text-[10px] text-gray-500 tabular-nums shrink-0">
                  <Show
                    when={(globalMatchCount() ?? matches().count) !== matches().count}
                    fallback={<>{t('search.found', { count: formatNumber(matches().count) })}</>}
                  >
                    {t('search.hereAcross', {
                      here: formatNumber(matches().count),
                      across: formatNumber(globalMatchCount() ?? matches().count),
                    })}
                  </Show>
                </span>
              )}
            </Show>
            <Show when={settings.archiveRetention !== 'off'}>
              <span class="text-[10px] text-gray-600 tabular-nums shrink-0">
                {archiveSearching()
                  ? t('search.archiveSearching')
                  : t('search.archived', { count: formatNumber(archiveHits().length) })}
              </span>
            </Show>
            <button
              aria-label={t('search.close')}
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery('');
              }}
              class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 active:bg-white/[0.06] transition-colors shrink-0"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </Show>

        <Show when={uiState.searchOpen && settings.archiveRetention !== 'off' && searchQuery().trim() !== ''}>
          <div ref={(element) => (archiveResultsEl = element)} onKeyDown={onArchiveResultKeyDown}
            aria-label={t('search.archiveResults')}
            class="max-h-60 shrink-0 overflow-y-auto border-b border-white/[0.05] bg-gray-950/95 px-3 py-2 sm:px-4">
            <Show when={!archiveSearchError()} fallback={<p class="py-2 text-[10px] text-red-300">{t('search.archiveUnavailable')}</p>}>
              <Show when={!archiveSearching() && archiveGroups().length === 0}>
                <p class="py-2 text-[10px] text-gray-600">{t('search.noArchivedResults')}</p>
              </Show>
              <For each={archiveGroups()}>
                {(group) => (
                  <section class="mb-2 last:mb-0">
                    <h4 class="sticky top-0 bg-gray-950/95 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-gray-600">{group.label}</h4>
                    <For each={group.hits}>
                      {(hit) => {
                        const index = () => archiveHits().findIndex((candidate) => candidate.key === hit.key);
                        return (
                        <button type="button" onClick={() => openArchiveHit(hit)}
                          data-archive-hit-index={index()}
                          aria-current={archiveActiveIndex() === index() ? 'true' : undefined}
                          onFocus={() => setArchiveActiveIndex(index())}
                          class="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--custom-accent,#818cf8)]">
                          <span class="block text-[10px] font-semibold text-gray-400">
                            {hit.sender || t('search.server')} · {formatDate(hit.timestamp, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span class="block truncate text-[11px] text-gray-300">{hit.snippet}</span>
                        </button>
                        );
                      }}
                    </For>
                  </section>
                )}
              </For>
            </Show>
          </div>
        </Show>

        {/* Virtual message list */}
        <div
          ref={(el) => (scrollEl = el)}
          onScroll={onScroll}
          class="flex-1 overflow-y-auto overflow-x-hidden px-0 sm:px-2 py-2 sm:py-3 msg-area"
          style={{ 'font-size': `${settings.fontSize}px` }}
        >
          <div class="mx-auto w-full max-w-[72ch]">
          <Show when={entry()?.loading}>
            <div class="flex items-center justify-center py-6">
              <div class="flex items-center gap-2.5 text-gray-400 text-[12px]">
                <span class="w-4 h-4 border-2 border-gray-600 border-t-[var(--custom-accent,#818cf8)] rounded-full animate-spin" />
                {t('message.loadingHistory')}
              </div>
            </div>
          </Show>

          {/* Virtualizer container — absolute-positioned items inside a sized wrapper */}
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            <For each={virtualizer.getVirtualItems()}>
              {(virtualItem) => {
                const item = createMemo(() => renderItems()[virtualItem.index]);
                const dayItem = () => {
                  const it = item();
                  return it?.kind === 'day' ? it : undefined;
                };
                const msgItem = () => {
                  const it = item();
                  return it?.kind === 'msg' ? it : undefined;
                };
                return (
                  <div
                    data-index={virtualItem.index}
                    ref={(el) => queueMicrotask(() => virtualizer.measureElement(el))}
                    style={{
                      position: 'absolute',
                      top: '0',
                      left: '0',
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <Switch>
                      <Match when={dayItem()}>
                        {(day) => <DaySeparator date={day().date} />}
                      </Match>
                      <Match when={item()?.kind === 'readMarker'}>
                        <Show when={settings.readMarker}>
                          <ReadMarkerRow />
                        </Show>
                      </Match>
                      <Match when={msgItem()}>
                        {(msg) => (
                          <div style={{ opacity: msg().dimmed ? '0.2' : '1' }}>
                            <MessageLine
                              line={msg().line}
                              grouped={msg().grouped}
                              bufferKind={kind()}
                              bufferPtr={props.bufferPtr}
                              isDesktop={isDesktop()}
                            />
                            <Show when={settings.inlineImages && !isSpecialBuf()}>
                              <For each={embedsFor(msg().line)}>
                                {(embed) => <MessageEmbed embed={embed} />}
                              </For>
                            </Show>
                            <Show when={msg().line.msgid}>
                              {(msgid) => (
                                <ReactionBar
                                  bufferPtr={props.bufferPtr}
                                  msgid={msgid()}
                                  reactions={reactionsOf(msgid())}
                                />
                              )}
                            </Show>
                          </div>
                        )}
                      </Match>
                    </Switch>
                  </div>
                );
              }}
            </For>
          </div>
          </div>
        </div>

        {/* Typing indicator */}
        <TypingIndicator bufferPtr={props.bufferPtr} />

        {/* Scroll-to-bottom FAB */}
        <Show when={showScrollBtn()}>
          <button
            onClick={scrollToBottom}
            class="absolute right-3 sm:right-4 flex items-center justify-center rounded-full bg-[var(--custom-accent,#818cf8)] border border-white/[0.15] active:scale-90 transition-all duration-150 animate-fade-up z-10"
            style={{
              bottom: isMobile() ? '8px' : '12px',
              width: missedCount() > 0 ? 'auto' : '36px',
              height: '36px',
              padding: missedCount() > 0 ? '0 12px 0 10px' : '0',
              'box-shadow': '0 4px 16px color-mix(in srgb, var(--custom-accent, #818cf8) 40%, transparent)',
            }}
            aria-label={t('message.scrollBottom')}
          >
            <svg class="w-3.5 h-3.5 text-white shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M8 2v10M4 9l4 4 4-4" />
            </svg>
            <Show when={missedCount() > 0}>
              <span class="ml-1.5 text-[11px] font-semibold text-white tabular-nums">
                {missedCount() > 99 ? '99+' : formatNumber(missedCount())}
              </span>
            </Show>
          </button>
        </Show>
      </div>
    </Show>
  );
}
