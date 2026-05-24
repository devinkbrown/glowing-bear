'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '@/stores';
import MessageLine from './MessageLine';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { bufferKind } from '@/lib/bufferKind';
import type { BufferKind } from '@/lib/bufferKind';
import type { WeeChatLine } from '@/types';

// ── Render item types (flat list including day separators & read marker) ──────
type RenderItem =
  | { kind: 'day'; key: string; date: Date }
  | { kind: 'readMarker'; key: string }
  | { kind: 'msg'; key: string; line: WeeChatLine; grouped: boolean; dimmed: boolean };

function getDayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function MessageView() {
  // Subscribe only to the active buffer entry — avoids re-rendering on messages to OTHER channels
  const activeBuffer = useStore(s => s.activeBuffer);
  const entry = useStore(s => s.activeBuffer ? s.buffers.get(s.activeBuffer) : null);

  const joinPartMsgs    = useStore(s => s.settings.joinPartMsgs);
  const fontSize        = useStore(s => s.settings.fontSize);
  const compactMode     = useStore(s => s.settings.compactMode);
  const timestampFormat = useStore(s => s.settings.timestampFormat);
  const colorNicks      = useStore(s => s.settings.colorNicks);
  const showPrefixes    = useStore(s => s.settings.showPrefixes);
  const inlineImages    = useStore(s => s.settings.inlineImages);
  const readMarkerEnabled = useStore(s => s.settings.readMarker);
  const requestHistory  = useStore(s => s.requestHistory);
  const readMarkerPos   = useStore(s => s.readMarkerPos);
  const setReadMarker   = useStore(s => s.setReadMarker);
  const searchOpen      = useStore(s => s.searchOpen);
  const setSearchOpen   = useStore(s => s.setSearchOpen);
  const isBot           = useStore(s => s.isBot);

  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottom   = useRef(true);
  const lockScroll   = useRef(false);

  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [missedCount, setMissedCount]     = useState(0);
  const prevLineCount = useRef(0);

  const isMobile  = useMediaQuery('(max-width: 639px)');
  const isDesktop = useMediaQuery('(min-width: 640px)');

  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const lines   = entry?.lines ?? [];
  const loading = entry?.loading ?? false;
  const kind    = entry ? bufferKind(entry.buffer) : 'core' as BufferKind;

  const filteredLines = useMemo(() => {
    if (joinPartMsgs) return lines;
    return lines.filter(l => !l.isJoin && !l.isPart && !l.isQuit);
  }, [lines, joinPartMsgs]);

  const searchLower = searchQuery.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (!searchLower) return null;
    const set = new Set<string>();
    for (const l of filteredLines) {
      if (l.message.toLowerCase().includes(searchLower) || (l.nick && l.nick.toLowerCase().includes(searchLower))) {
        set.add(l.id);
      }
    }
    return set;
  }, [filteredLines, searchLower]);

  const readMarker = activeBuffer ? readMarkerPos.get(activeBuffer) : undefined;

  // Build flat render items (messages + day separators + read marker)
  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    const isSpecialBuf = kind === 'raw' || kind === 'fset' || kind === 'plugin';
    let lastDayKey: string | null = null;
    let prevMsgLine: WeeChatLine | null = null;

    for (let i = 0; i < filteredLines.length; i++) {
      const line = filteredLines[i];
      const dayKey = getDayKey(line.date);
      const dayChanged = dayKey !== lastDayKey;

      if (!isSpecialBuf && dayChanged) {
        items.push({ kind: 'day', key: `day-${dayKey}`, date: line.date });
        lastDayKey = dayKey;
      }

      if (readMarker !== undefined && i === readMarker) {
        items.push({ kind: 'readMarker', key: `rm-${readMarker}` });
      }

      const grouped = !isSpecialBuf && !!(
        prevMsgLine &&
        !dayChanged &&
        line.nick &&
        prevMsgLine.nick === line.nick &&
        !line.isAction && !prevMsgLine.isAction &&
        !line.isJoin && !line.isPart && !line.isQuit &&
        !prevMsgLine.isJoin && !prevMsgLine.isQuit &&
        line.date.getTime() - prevMsgLine.date.getTime() < 300000
      );

      const dimmed = searchMatches !== null && !searchMatches.has(line.id);
      items.push({ kind: 'msg', key: line.id, line, grouped, dimmed });
      prevMsgLine = line;
    }

    return items;
  }, [filteredLines, kind, readMarker, searchMatches]);

  // Keep a ref so scrollToEnd callback doesn't need to re-create on every length change
  const renderItemsLenRef = useRef(0);
  renderItemsLenRef.current = renderItems.length;

  // ── Virtual list ─────────────────────────────────────────────────────────────
  const rowVirtualizer = useVirtualizer({
    count: renderItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback((i: number) => {
      // Rough estimates — the virtualizer measures actual heights after mount
      const item = renderItems[i];
      if (!item || item.kind === 'day') return 52;
      if (item.kind === 'readMarker') return 28;
      if (!isDesktop) return (item as { grouped: boolean }).grouped ? 26 : 60;
      return compactMode ? 22 : 28;
    }, [renderItems, isDesktop, compactMode]),
    overscan: 20,
  });

  const scrollToEnd = useCallback((smooth = false) => {
    const len = renderItemsLenRef.current;
    if (len === 0) return;
    lockScroll.current = true;
    rowVirtualizer.scrollToIndex(len - 1, {
      align: 'end',
      behavior: smooth ? 'smooth' : 'auto',
    });
    requestAnimationFrame(() => { lockScroll.current = false; });
  }, [rowVirtualizer]);

  // New messages — scroll if at bottom
  useEffect(() => {
    const count = filteredLines.length;
    if (!isAtBottom.current && count > prevLineCount.current) {
      setMissedCount(prev => prev + (count - prevLineCount.current));
    }
    if (isAtBottom.current) {
      requestAnimationFrame(() => scrollToEnd());
    }
    prevLineCount.current = count;
  }, [filteredLines.length, scrollToEnd]);

  // Buffer switch — scroll to bottom, reset state
  useEffect(() => {
    lockScroll.current = true;
    requestAnimationFrame(() => {
      scrollToEnd();
      isAtBottom.current = true;
      setShowScrollBtn(false);
      setMissedCount(0);
      prevLineCount.current = filteredLines.length;
      if (activeBuffer) setReadMarker(activeBuffer);
      setSearchOpen(false);
      setSearchQuery('');
      setTimeout(() => { lockScroll.current = false; }, 100);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBuffer]);

  // iOS virtual keyboard: keep messages pinned to bottom when keyboard opens
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;

    let prevHeight = vp.height;
    let wasAtBottom = true;

    const snapshot = () => {
      const el = containerRef.current;
      if (el) wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    };

    const onResize = () => {
      const delta = vp.height - prevHeight;
      prevHeight = vp.height;
      if (wasAtBottom || delta > 0) {
        lockScroll.current = true;
        scrollToEnd();
        requestAnimationFrame(() => {
          scrollToEnd();
          isAtBottom.current = true;
          setShowScrollBtn(false);
        });
        setTimeout(() => {
          scrollToEnd();
          lockScroll.current = false;
        }, 350);
      }
      setTimeout(snapshot, 500);
    };

    document.addEventListener('focusin', snapshot, { passive: true });
    vp.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('focusin', snapshot);
      vp.removeEventListener('resize', onResize);
    };
  }, [scrollToEnd]);

  // Scroll handler — detect bottom and trigger history load
  const scrollRAF = useRef(0);
  const onScroll = useCallback(() => {
    if (lockScroll.current) return;
    cancelAnimationFrame(scrollRAF.current);
    scrollRAF.current = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      isAtBottom.current = atBottom;
      setShowScrollBtn(!atBottom);
      if (atBottom) setMissedCount(0);
      if (el.scrollTop < 200 && !loading && activeBuffer) {
        requestHistory(100, activeBuffer);
      }
    });
  }, [loading, activeBuffer, requestHistory]);

  const scrollToBottom = useCallback(() => {
    scrollToEnd(true);
    setMissedCount(0);
  }, [scrollToEnd]);

  useEffect(() => {
    const onStable = () => { if (isAtBottom.current) scrollToEnd(); };
    window.addEventListener('viewport-stable', onStable);
    return () => window.removeEventListener('viewport-stable', onStable);
  }, [scrollToEnd]);

  // Ctrl+F search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (searchOpen) {
          setSearchQuery('');
          setSearchOpen(false);
        } else {
          setSearchOpen(true);
          setTimeout(() => searchRef.current?.focus(), 50);
        }
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, setSearchOpen]);

  if (!activeBuffer) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
            </svg>
          </div>
          <p className="text-gray-500 text-[13px]">No buffer selected</p>
          <p className="text-gray-600 text-[11px] font-mono">
            <span className="hidden sm:inline"><kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-[10px]">Ctrl+K</kbd> to search buffers</span>
            <span className="sm:hidden">Swipe right to open sidebar</span>
          </p>
        </div>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-white/[0.04] bg-gray-950/90 backdrop-blur-sm shrink-0 animate-slide-down">
          <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="5" /><path d="M10.5 10.5L14.5 14.5" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            autoComplete="off"
            spellCheck={false}
            onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); } }}
            className="flex-1 bg-transparent text-[13px] text-gray-200 placeholder-gray-600 outline-none"
          />
          {searchMatches && (
            <span className="text-[10px] text-gray-500 tabular-nums shrink-0">{searchMatches.size} found</span>
          )}
          <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 active:bg-white/[0.06] transition-colors shrink-0">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      )}

      {/* Virtual message list */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-0 sm:px-2 py-2 sm:py-3 msg-area"
        style={{ fontSize: `${fontSize}px` }}
      >
        {loading && (
          <div className="flex items-center justify-center py-6">
            <div className="flex items-center gap-2.5 text-gray-400 text-[12px]">
              <span className="w-4 h-4 border-2 border-gray-600 border-t-[var(--custom-accent,#818cf8)] rounded-full animate-spin" />
              Loading history...
            </div>
          </div>
        )}

        {/* Virtualizer container — absolute-positioned items inside a sized wrapper */}
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {virtualItems.map(virtualItem => {
            const item = renderItems[virtualItem.index];
            if (!item) return null;

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {item.kind === 'day' && (
                  <div className="flex items-center gap-3 sm:gap-4 py-3 sm:py-4 my-1 sm:my-2 px-3 sm:px-1">
                    <div className="flex-1 h-px bg-white/[0.04]" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] sm:tracking-[0.15em] text-gray-500 select-none whitespace-nowrap px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.05]">
                      {item.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 h-px bg-white/[0.04]" />
                  </div>
                )}
                {item.kind === 'readMarker' && readMarkerEnabled && (
                  <div className="flex items-center gap-3 my-2 px-3 sm:px-1">
                    <div className="flex-1 h-px bg-red-500/25" />
                    <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-red-500/40 select-none">
                      <span className="w-1 h-1 rounded-full bg-red-500/40" />
                      new
                      <span className="w-1 h-1 rounded-full bg-red-500/40" />
                    </span>
                    <div className="flex-1 h-px bg-red-500/25" />
                  </div>
                )}
                {item.kind === 'msg' && (
                  <div style={item.dimmed ? { opacity: 0.2 } : undefined}>
                    <MessageLine
                      line={item.line}
                      grouped={item.grouped}
                      compact={compactMode}
                      timestampFormat={timestampFormat}
                      colorNicks={colorNicks}
                      showPrefixes={showPrefixes}
                      inlineImages={inlineImages}
                      bufferKind={kind}
                      isDesktop={isDesktop}
                      isBot={isBot}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scroll-to-bottom FAB */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute right-3 sm:right-4 flex items-center justify-center rounded-full
            bg-[var(--custom-accent,#818cf8)] border border-white/[0.15] active:scale-90 transition-all duration-150 animate-fade-up z-10"
          style={{
            bottom: isMobile ? '8px' : '12px',
            width: missedCount > 0 ? 'auto' : '36px',
            height: '36px',
            padding: missedCount > 0 ? '0 12px 0 10px' : '0',
            boxShadow: '0 4px 16px color-mix(in srgb, var(--custom-accent, #818cf8) 40%, transparent)',
          }}
          aria-label="Scroll to bottom"
        >
          <svg className="w-3.5 h-3.5 text-white shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M8 2v10M4 9l4 4 4-4" />
          </svg>
          {missedCount > 0 && (
            <span className="ml-1.5 text-[11px] font-semibold text-white tabular-nums">
              {missedCount > 99 ? '99+' : missedCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
