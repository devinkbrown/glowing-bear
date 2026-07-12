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
import { buffersState, setReadMarker, requestHistory, settings, uiState, setSearchOpen } from '@/state';
import type { Reaction, WeeChatLine } from '@/types';
import { bufferKind, type BufferKind } from '@/lib/bufferKind';
import { extractEmbeds, stripFormatting, type MediaEmbed } from '@/lib/irc-classic/formatter';
import { createMediaQuery } from '@/primitives/mediaQuery';
import MessageLine from './MessageLine';
import MessageEmbed from './MessageEmbed';
import ReactionBar from './ReactionBar';
import TypingIndicator from './TypingIndicator';

export interface MessageViewProps {
  bufferPtr: string;
}

// ── Render item types (flat list including day separators & read marker) ────
interface DayItem { kind: 'day'; key: string; date: Date }
interface ReadMarkerItem { kind: 'readMarker'; key: string }
interface MsgItem { kind: 'msg'; key: string; line: WeeChatLine; grouped: boolean; dimmed: boolean }
type RenderItem = DayItem | ReadMarkerItem | MsgItem;

const GROUP_WINDOW_MS = 300_000; // same-nick grouping window (5 min)
const HISTORY_TOP_PX = 200; // scrollTop threshold that triggers history load
const AT_BOTTOM_PX = 40;
const HISTORY_PAGE = 100;
const ANNOUNCE_MAX = 30; // cap the live-region node count (old nodes are removals, unspoken)

function getDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Screen-reader text for one newly-arrived line: nick + plain-text body, with
// mIRC/ANSI control codes stripped so the announcement isn't garbled.
function announceText(line: WeeChatLine): string {
  const body = stripFormatting(line.message).trim();
  if (line.isJoin || line.isPart || line.isQuit || line.isNotice || !line.nick) return body;
  if (line.isAction) return `${line.nick} ${body}`;
  return `${line.nick}: ${body}`;
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
    <div class="flex items-center gap-3 sm:gap-4 py-3 sm:py-4 my-1 sm:my-2 px-3 sm:px-1">
      <div class="flex-1 h-px bg-white/[0.04]" />
      <span class="text-[10px] font-semibold uppercase tracking-[0.12em] sm:tracking-[0.15em] text-gray-500 select-none whitespace-nowrap px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.05]">
        {props.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
      </span>
      <div class="flex-1 h-px bg-white/[0.04]" />
    </div>
  );
}

function ReadMarkerRow() {
  return (
    <div class="flex items-center gap-3 my-2 px-3 sm:px-1">
      <div class="flex-1 h-px bg-red-500/25" />
      <span class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-red-500/40 select-none">
        <span class="w-1 h-1 rounded-full bg-red-500/40" />
        new
        <span class="w-1 h-1 rounded-full bg-red-500/40" />
      </span>
      <div class="flex-1 h-px bg-red-500/25" />
    </div>
  );
}

function EmptyState() {
  return (
    <div class="flex-1 flex items-center justify-center px-6">
      <div class="text-center space-y-3">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center">
          <svg class="w-6 h-6 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
          </svg>
        </div>
        <p class="text-gray-500 text-[13px]">No buffer selected</p>
        <p class="text-gray-600 text-[11px] font-mono">
          <span class="hidden sm:inline">
            <kbd class="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-[10px]">Ctrl+K</kbd> to search buffers
          </span>
          <span class="sm:hidden">Swipe right to open sidebar</span>
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
  let atBottom = true;
  let lockScroll = false;
  let prevLineCount = 0;

  const [showScrollBtn, setShowScrollBtn] = createSignal(false);
  const [missedCount, setMissedCount] = createSignal(0);
  const [searchQuery, setSearchQuery] = createSignal('');

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

  const searchMatches = createMemo<{ ids: Record<string, true>; count: number } | null>(() => {
    const query = (uiState.searchOpen ? searchQuery() : '').trim().toLowerCase();
    if (!query) return null;
    const ids: Record<string, true> = {};
    let count = 0;
    for (const line of filteredLines()) {
      if (line.message.toLowerCase().includes(query) || (line.nick && line.nick.toLowerCase().includes(query))) {
        ids[line.id] = true;
        count++;
      }
    }
    return { ids, count };
  });

  // Build flat render items (messages + day separators + read marker)
  const renderItems = createMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    const special = isSpecialBuf();
    const readMarker = buffersState.readMarkerPos[props.bufferPtr];
    const matches = searchMatches();
    const lines = filteredLines();
    let lastDayKey: string | null = null;
    let prevMsgLine: WeeChatLine | null = null;

    for (let i = 0; i < lines.length; i++) {
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

    return items;
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
    const prevIdx = lastAnnouncedId === undefined ? -1 : lines.findIndex((l) => l.id === lastAnnouncedId);
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
              placeholder="Search messages..."
              autocomplete="off"
              spellcheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchOpen(false);
                  setSearchQuery('');
                }
              }}
              class="flex-1 bg-transparent text-[13px] text-gray-200 placeholder-gray-600 outline-none"
            />
            <Show when={searchMatches()}>
              {(matches) => (
                <span class="text-[10px] text-gray-500 tabular-nums shrink-0">{matches().count} found</span>
              )}
            </Show>
            <button
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

        {/* Virtual message list */}
        <div
          ref={(el) => (scrollEl = el)}
          onScroll={onScroll}
          class="flex-1 overflow-y-auto overflow-x-hidden px-0 sm:px-2 py-2 sm:py-3 msg-area"
          style={{ 'font-size': `${settings.fontSize}px` }}
        >
          <Show when={entry()?.loading}>
            <div class="flex items-center justify-center py-6">
              <div class="flex items-center gap-2.5 text-gray-400 text-[12px]">
                <span class="w-4 h-4 border-2 border-gray-600 border-t-[var(--custom-accent,#818cf8)] rounded-full animate-spin" />
                Loading history...
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
            aria-label="Scroll to bottom"
          >
            <svg class="w-3.5 h-3.5 text-white shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M8 2v10M4 9l4 4 4-4" />
            </svg>
            <Show when={missedCount() > 0}>
              <span class="ml-1.5 text-[11px] font-semibold text-white tabular-nums">
                {missedCount() > 99 ? '99+' : missedCount()}
              </span>
            </Show>
          </button>
        </Show>
      </div>
    </Show>
  );
}
