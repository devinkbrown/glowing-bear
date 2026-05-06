'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '@/stores';
import { ConnectionState } from '@/types';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatText } from '@/protocol/irc/formatter';

interface Props {
  onToggleSidebar: () => void;
  onToggleUserList: () => void;
  onToggleSearch?: () => void;
}

export default function Header({ onToggleSidebar, onToggleUserList, onToggleSearch }: Props) {
  const activeBuffer = useStore(s => s.activeBuffer);
  const buffers = useStore(s => s.buffers);
  const connectionState = useStore(s => s.connectionState);
  const lag = useStore(s => s.lag);
  const userListOpen = useStore(s => s.userListOpen);
  const enableVideoCalls = useStore(s => s.settings.enableVideoCalls);
  const callState = useStore(s => s.callState);
  const callWith = useStore(s => s.callWith);
  const callChannel = useStore(s => s.callChannel);
  const startCall = useStore(s => s.startCall);
  const joinRoom = useStore(s => s.joinRoom);
  const isMobile = useMediaQuery('(max-width: 639px)');

  const [topicExpanded, setTopicExpanded] = useState(false);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const topicRef = useRef<HTMLDivElement>(null);
  const callMenuRef = useRef<HTMLDivElement>(null);

  const entry = activeBuffer ? buffers.get(activeBuffer) : null;
  const bufName = entry?.buffer.shortName || entry?.buffer.name || '';
  const rawTitle = entry?.buffer.title || '';
  const title = useMemo(() => rawTitle ? formatText(rawTitle) : '', [rawTitle]);
  const isChannel = entry?.buffer.localVars['type'] === 'channel';
  const isPrivate = entry?.buffer.localVars['type'] === 'private';
  const nickCount = isChannel ? entry?.nicks.size ?? 0 : 0;
  const isIdle = callState === 'idle';
  const isInCallHere = !isIdle && ((isPrivate && callWith === bufName) || (isChannel && callChannel === (entry?.buffer.localVars['channel'] ?? '')));

  useEffect(() => { setTopicExpanded(false); setCallMenuOpen(false); }, [activeBuffer]);

  useEffect(() => {
    if (!topicExpanded) return;
    function onClick(e: MouseEvent) {
      if (topicRef.current && !topicRef.current.contains(e.target as Node)) {
        setTopicExpanded(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('touchstart', onClick as EventListener);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('touchstart', onClick as EventListener);
    };
  }, [topicExpanded]);

  useEffect(() => {
    if (!callMenuOpen) return;
    function onClick(e: MouseEvent | TouchEvent) {
      if (callMenuRef.current && !callMenuRef.current.contains(e.target as Node)) {
        setCallMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('touchstart', onClick as EventListener);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('touchstart', onClick as EventListener);
    };
  }, [callMenuOpen]);

  const canCall = enableVideoCalls && connectionState === ConnectionState.CONNECTED && isIdle;
  const showCallBtn = canCall && (isPrivate || isChannel);

  return (
    <header className="flex items-center gap-1.5 sm:gap-3 px-1.5 sm:px-4 h-11 sm:h-12 border-b border-white/[0.04] shrink-0 relative">
      {/* Mobile menu */}
      <button onClick={onToggleSidebar}
        className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-100 active:bg-white/[0.06] transition-colors"
        aria-label="Menu">
        <svg className="w-[20px] h-[20px] sm:w-[18px] sm:h-[18px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 4h12M2 8h8M2 12h10" />
        </svg>
      </button>

      {/* Buffer name + topic */}
      <div ref={topicRef} className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-3 justify-center relative">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[14px] sm:text-[14px] font-semibold text-gray-100 truncate leading-tight">{bufName}</h2>
          {/* In-call badge */}
          {isInCallHere && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[9px] font-semibold uppercase tracking-wider shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
        {title && (
          <button
            onClick={() => setTopicExpanded(!topicExpanded)}
            className="text-[11px] text-gray-500 sm:text-gray-400 truncate leading-tight sm:text-[12px] max-w-full text-left hover:text-gray-300 transition-colors"
            title={topicExpanded ? 'Collapse topic' : 'Expand topic'}>
            <span dangerouslySetInnerHTML={{ __html: title }} />
          </button>
        )}
        {topicExpanded && title && (
          <div className="absolute top-full left-0 right-0 mt-1 sm:-ml-3 sm:-mr-3 z-30 animate-slide-down">
            <div className="bg-gray-900 border border-white/[0.08] rounded-xl shadow-xl px-4 py-3 mx-1 sm:mx-0">
              <p className="text-[12px] sm:text-[13px] text-gray-300 leading-relaxed break-words"
                dangerouslySetInnerHTML={{ __html: title }} />
            </div>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
        {lag > 0 && connectionState === ConnectionState.CONNECTED && (
          <span className={`text-[9px] sm:text-[10px] tabular-nums font-mono ${lag > 500 ? 'text-amber-500' : 'text-gray-600 sm:text-gray-500'}`}>{lag}ms</span>
        )}

        {/* Call button */}
        {showCallBtn && (
          <div className="relative" ref={callMenuRef}>
            <button onClick={() => setCallMenuOpen(!callMenuOpen)}
              className={`w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-full transition-all
                ${callMenuOpen ? 'text-emerald-400 bg-emerald-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] active:bg-white/[0.06]'}`}
              title="Call">
              <svg className="w-[14px] h-[14px] sm:w-[12px] sm:h-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
            </button>

            {callMenuOpen && (
              <div className={`absolute top-full mt-1 z-30 bg-gray-900 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden min-w-[160px] animate-slide-down
                ${isMobile ? 'right-0 left-auto' : 'right-0'}`}>
                {isPrivate && (
                  <>
                    <CallMenuItem
                      icon="video"
                      label="Video Call"
                      onClick={() => { startCall(bufName, true); setCallMenuOpen(false); }}
                    />
                    <CallMenuItem
                      icon="voice"
                      label="Voice Call"
                      onClick={() => { startCall(bufName, false); setCallMenuOpen(false); }}
                    />
                  </>
                )}
                {isChannel && (
                  <>
                    <CallMenuItem
                      icon="video"
                      label="Join Video Room"
                      onClick={() => { joinRoom(entry?.buffer.localVars['channel'] ?? bufName); setCallMenuOpen(false); }}
                    />
                    <CallMenuItem
                      icon="voice"
                      label="Join Voice Room"
                      onClick={() => { joinRoom(entry?.buffer.localVars['channel'] ?? bufName, true); setCallMenuOpen(false); }}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Search button */}
        {onToggleSearch && (
          <button onClick={onToggleSearch}
            className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] active:bg-white/[0.06] transition-all"
            title="Search messages (Ctrl+F)">
            <svg className="w-[14px] h-[14px] sm:w-[12px] sm:h-[12px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="6.5" cy="6.5" r="5" /><path d="M10.5 10.5L14.5 14.5" />
            </svg>
          </button>
        )}

        {isChannel && (
          <button onClick={onToggleUserList}
            className={`flex items-center gap-1 h-9 sm:h-7 px-2.5 sm:px-2.5 rounded-full text-[12px] sm:text-[11px] font-medium transition-all
              ${userListOpen
                ? 'bg-indigo-500/10 text-indigo-300'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] active:bg-white/[0.06]'}`}>
            <svg className="w-[15px] h-[15px] sm:w-[12px] sm:h-[12px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="6" cy="5" r="2.5" /><path d="M1 14c0-3 2-5.5 5-5.5s5 2.5 5 5.5" />
            </svg>
            {nickCount > 0 && <span className="tabular-nums">{nickCount}</span>}
          </button>
        )}
      </div>
    </header>
  );
}

function CallMenuItem({ icon, label, onClick }: { icon: 'video' | 'voice'; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors">
      {icon === 'video' ? (
        <svg className="w-4 h-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="2" y="5" width="15" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3" />
        </svg>
      ) : (
        <svg className="w-4 h-4 shrink-0 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0" /><path d="M12 17v4M8 21h8" />
        </svg>
      )}
      {label}
    </button>
  );
}
