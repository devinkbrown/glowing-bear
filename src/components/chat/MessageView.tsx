'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useStore } from '@/stores';
import MessageLine from './MessageLine';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export default function MessageView() {
  const activeBuffer = useStore(s => s.activeBuffer);
  const buffers = useStore(s => s.buffers);
  const settings = useStore(s => s.settings);
  const requestHistory = useStore(s => s.requestHistory);
  const readMarkerPos = useStore(s => s.readMarkerPos);
  const setReadMarker = useStore(s => s.setReadMarker);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);
  const searchOpen = useStore(s => s.searchOpen);
  const setSearchOpen = useStore(s => s.setSearchOpen);

  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [missedCount, setMissedCount] = useState(0);
  const prevLineCount = useRef(0);
  const isMobile = useMediaQuery('(max-width: 639px)');

  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const entry = activeBuffer ? buffers.get(activeBuffer) : null;
  const lines = entry?.lines ?? [];
  const loading = entry?.loading ?? false;

  const filteredLines = useMemo(() => {
    if (settings.joinPartMsgs) return lines;
    return lines.filter(l => !l.isJoin && !l.isPart && !l.isQuit);
  }, [lines, settings.joinPartMsgs]);

  // Search filtering
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

  // iOS Safari does not support scrollIntoView({ behavior: 'instant' }).
  // Fall back to scrollTop assignment which is universally supported.
  const scrollToEnd = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    if (smooth) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Track missed messages when scrolled up
  useEffect(() => {
    const count = filteredLines.length;
    if (!isAtBottom.current && count > prevLineCount.current) {
      setMissedCount(prev => prev + (count - prevLineCount.current));
    }
    if (isAtBottom.current) {
      scrollToEnd();
    }
    prevLineCount.current = count;
  }, [filteredLines.length, scrollToEnd]);

  // Reset on buffer switch
  useEffect(() => {
    scrollToEnd();
    isAtBottom.current = true;
    setShowScrollBtn(false);
    setMissedCount(0);
    prevLineCount.current = filteredLines.length;
    if (activeBuffer) setReadMarker(activeBuffer);
    setSearchOpen(false);
    setSearchQuery('');
  }, [activeBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-anchor to bottom when virtual keyboard opens/closes
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const onResize = () => {
      if (isAtBottom.current) {
        requestAnimationFrame(() => scrollToEnd());
      }
    };
    vp.addEventListener('resize', onResize);
    return () => vp.removeEventListener('resize', onResize);
  }, [scrollToEnd]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    isAtBottom.current = atBottom;
    setShowScrollBtn(!atBottom);
    if (atBottom) setMissedCount(0);
    if (el.scrollTop < 100 && !loading && activeBuffer) {
      requestHistory(100, activeBuffer);
    }
  }, [loading, activeBuffer, requestHistory]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setMissedCount(0);
    setShowScrollBtn(false);
  }, []);

  // Keyboard shortcut: Ctrl+F to open search
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
  }, [searchOpen]);

  const getDayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  if (!activeBuffer) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-gray-400 text-[15px] sm:text-[14px]">Select a buffer to start chatting</p>
          <p className="text-gray-500 text-[12px] mt-2 sm:mt-1 font-mono">
            <span className="hidden sm:inline">Ctrl+K to search buffers</span>
            <span className="sm:hidden">Swipe right to open sidebar</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-white/[0.04] bg-gray-900/80 backdrop-blur-sm shrink-0 animate-slide-down">
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

      {/* Messages */}
      <div ref={containerRef} onScroll={onScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-0 sm:px-2 py-2 sm:py-3 msg-area"
        style={{ fontSize: `${settings.fontSize}px` }}>

        {loading && (
          <div className="flex items-center justify-center py-6">
            <div className="flex items-center gap-2.5 text-gray-400 text-[12px]">
              <span className="w-4 h-4 border-2 border-gray-600 border-t-indigo-400 rounded-full animate-spin" />
              Loading history...
            </div>
          </div>
        )}

        {filteredLines.map((line, i) => {
          const prevLine = i > 0 ? filteredLines[i - 1] : null;
          const showDaySep = !prevLine || getDayKey(line.date) !== getDayKey(prevLine.date);
          const showReadMarker = readMarker !== undefined && i === readMarker && i < filteredLines.length;

          const grouped = !!(
            prevLine &&
            !showDaySep &&
            line.nick &&
            prevLine.nick === line.nick &&
            !line.isAction &&
            !prevLine.isAction &&
            !line.isJoin && !line.isPart && !line.isQuit &&
            !prevLine.isJoin && !prevLine.isQuit &&
            line.date.getTime() - prevLine.date.getTime() < 300000
          );

          const dimmed = searchMatches !== null && !searchMatches.has(line.id);

          return (
            <div key={line.id} style={dimmed ? { opacity: 0.2 } : undefined}>
              {showDaySep && (
                <div className="flex items-center gap-3 sm:gap-4 py-3 sm:py-4 my-1 sm:my-2 px-3 sm:px-1">
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] sm:tracking-[0.15em] text-gray-500 select-none whitespace-nowrap">
                    {line.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                </div>
              )}
              {showReadMarker && settings.readMarker && (
                <div className="flex items-center gap-3 my-2 px-3 sm:px-1">
                  <div className="flex-1 h-px bg-red-500/25" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-red-500/40 select-none">new</span>
                  <div className="flex-1 h-px bg-red-500/25" />
                </div>
              )}
              <MessageLine line={line} grouped={grouped} compact={settings.compactMode}
                timestampFormat={settings.timestampFormat} colorNicks={settings.colorNicks}
                showPrefixes={settings.showPrefixes} inlineImages={settings.inlineImages} />
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom FAB */}
      {showScrollBtn && (
        <button onClick={scrollToBottom}
          className="absolute right-3 sm:right-4 flex items-center justify-center rounded-full bg-gray-800/90 border border-white/[0.08] shadow-lg backdrop-blur-sm
            hover:bg-gray-700/90 active:scale-90 transition-all animate-fade-up z-10"
          style={{ bottom: isMobile ? '8px' : '12px', width: missedCount > 0 ? 'auto' : '36px', height: '36px', padding: missedCount > 0 ? '0 12px 0 10px' : '0' }}
          aria-label="Scroll to bottom">
          <svg className="w-4 h-4 text-gray-300 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M8 2v10M4 9l4 4 4-4" />
          </svg>
          {missedCount > 0 && (
            <span className="ml-1.5 text-[11px] font-semibold text-indigo-300 tabular-nums">{missedCount > 99 ? '99+' : missedCount}</span>
          )}
        </button>
      )}
    </div>
  );
}
