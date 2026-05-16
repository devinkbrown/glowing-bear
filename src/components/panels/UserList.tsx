'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/stores';
import { nickColor } from '@/lib/nickcolor';
import type { WeeChatNick } from '@/types';

const TIER_ORDER = ['Owner', 'Admin', 'Op', 'Halfop', 'Voice', 'Regular'];

const TIER_ICONS: Record<string, { icon: string; label: string }> = {
  'Owner': { icon: '👑', label: 'Owner' },
  'Admin': { icon: '⚡', label: 'Admin' },
  'Op': { icon: '🛡️', label: 'Op' },
  'Halfop': { icon: '🔰', label: 'Half-Op' },
  'Voice': { icon: '🎙️', label: 'Voice' },
  'Regular': { icon: '', label: 'Regular' },
};

const TIER_SIGILS_FALLBACK: Record<string, string> = {
  'Owner': '.', 'Admin': '&', 'Op': '@', 'Halfop': '%', 'Voice': '+', 'Regular': '',
};

interface Props {
  mobile?: boolean;
  onClose?: () => void;
}

interface NickAction {
  nick: string;
  x: number;
  y: number;
}

export default function UserList({ mobile, onClose }: Props) {
  const activeBuffer = useStore(s => s.activeBuffer);
  const buffers = useStore(s => s.buffers);
  const openQuery = useStore(s => s.openQuery);
  const sendInput = useStore(s => s.sendInput);
  const startCall = useStore(s => s.startCall);
  const colorNicks = useStore(s => s.settings.colorNicks);
  const callState = useStore(s => s.callState);
  const isOper = useStore(s => s.isOper);
  const isBot = useStore(s => s.isBot);
  const openUserProfile = useStore(s => s.openUserProfile);
  const sendWhisper = useStore(s => s.sendWhisper);
  const isActiveOphion = useStore(s => s.isActiveOphion);
  const ophion = isActiveOphion();

  const [filter, setFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [actionPopup, setActionPopup] = useState<NickAction | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const entry = activeBuffer ? buffers.get(activeBuffer) : null;
  const nickGroups = entry?.nickGroups ?? new Map();
  const totalNicks = entry?.nicks ? [...entry.nicks.values()].filter(n => !n.group && n.visible).length : 0;

  const filteredGroups = useMemo(() => {
    const fq = filter.trim().toLowerCase();
    const result = new Map<string, WeeChatNick[]>();
    for (const tier of TIER_ORDER) {
      const nicks = nickGroups.get(tier);
      if (!nicks) continue;
      const filtered = fq
        ? nicks.filter((n: WeeChatNick) => n.name.toLowerCase().includes(fq))
        : nicks;
      if (filtered.length > 0) {
        result.set(tier, filtered);
      }
    }
    for (const [label, nicks] of nickGroups) {
      if (TIER_ORDER.includes(label)) continue;
      const filtered = fq
        ? nicks.filter((n: WeeChatNick) => n.name.toLowerCase().includes(fq))
        : nicks;
      if (filtered.length > 0) {
        result.set(label, filtered);
      }
    }
    return result;
  }, [nickGroups, filter]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  useEffect(() => {
    if (!actionPopup) return;
    function onPointerDown(e: Event) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setActionPopup(null);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [actionPopup]);

  const handleNickClick = useCallback((nick: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setActionPopup({
      nick,
      x: mobile ? rect.left : rect.right + 4,
      y: rect.top,
    });
  }, [mobile]);

  const doAction = useCallback((action: string) => {
    if (!actionPopup) return;
    const { nick } = actionPopup;
    setActionPopup(null);
    switch (action) {
      case 'query': openQuery(nick); onClose?.(); break;
      case 'whois': sendInput(`/whois ${nick}`); break;
      case 'profile': openUserProfile(nick); break;
      case 'whisper': {
        const entry = activeBuffer ? buffers.get(activeBuffer) : null;
        const ch = entry?.buffer.localVars['channel'];
        if (ch) {
          const msg = prompt(`Whisper to ${nick} in ${ch}:`);
          if (msg) sendWhisper(ch, nick, msg);
        }
        break;
      }
      case 'video': startCall(nick, true); onClose?.(); break;
      case 'voice': startCall(nick, false); onClose?.(); break;
      case 'kick': sendInput(`/kick ${nick}`); break;
      case 'ban': sendInput(`/ban ${nick}`); break;
    }
  }, [actionPopup, openQuery, sendInput, onClose, startCall]);

  if (!entry) return null;

  const tierColorForNick = (nick: WeeChatNick): string | undefined => {
    for (const [label, nicks] of nickGroups) {
      if (nicks.includes(nick) && label !== 'Regular') {
        return tierAccent(label);
      }
    }
    return undefined;
  };

  return (
    <aside className={`${mobile ? 'w-full' : 'w-[220px]'} shrink-0 flex flex-col h-full border-l border-white/[0.04] bg-gray-950 relative`}>
      {/* Header */}
      <div className="flex items-center h-11 sm:h-12 px-3 sm:px-3 border-b border-white/[0.04] shrink-0"
        style={mobile ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[var(--custom-accent,#818cf8)] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="6" cy="5" r="3" /><circle cx="11" cy="6" r="2.5" /><path d="M1 14c0-3 2-4.5 5-4.5" /><path d="M9 14c0-2.5 1.5-3.5 4-3.5" />
          </svg>
          <span className="text-[13px] sm:text-[12px] font-semibold text-gray-200 truncate">Users</span>
        </div>
        <span className="text-[11px] sm:text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[var(--custom-accent,#818cf8)]">{totalNicks}</span>
        {mobile && onClose && (
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-200 active:bg-white/[0.06] -mr-1 ml-1"
            aria-label="Close">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-2 sm:px-2 pt-2 pb-1 shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 sm:left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-3 sm:h-3 text-gray-600 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="4.5" /><path d="M10 10l4 4" />
          </svg>
          <input ref={filterRef} type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Search users..."
            autoComplete="off" spellCheck={false}
            onKeyDown={e => { if (e.key === 'Escape') { setFilter(''); filterRef.current?.blur(); } }}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-[13px] sm:text-[11px] text-gray-300 placeholder-gray-600 pl-8 sm:pl-7 pr-3 py-2 sm:py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/30 focus:bg-white/[0.04] transition-all" />
          {filter && (
            <button onClick={() => { setFilter(''); filterRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 transition-colors">
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Nick list */}
      <div className="flex-1 overflow-y-auto px-1.5 sm:px-1 pt-1 pb-2 nicklist-scroll">
        {Array.from(filteredGroups).map(([label, nicks]) => {
          const isCollapsed = collapsedGroups.has(label);
          const accent = tierAccent(label);
          const tierInfo = TIER_ICONS[label];

          return (
            <div key={label} className="mb-1">
              {/* Group header */}
              <button onClick={() => toggleGroup(label)}
                className="w-full flex items-center gap-1.5 px-2 py-2 sm:py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.02] active:bg-white/[0.04] transition-all group">
                <svg className={`w-[9px] h-[9px] sm:w-[8px] sm:h-[8px] shrink-0 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}
                  style={{ color: accent }}
                  viewBox="0 0 8 8" fill="currentColor"><path d="M1 2l3 3.5L7 2z" /></svg>
                {tierInfo?.icon && <span className="text-[10px] sm:text-[9px] leading-none">{tierInfo.icon}</span>}
                <span className="text-[11px] sm:text-[10px] font-bold uppercase tracking-[0.08em] flex-1 text-left"
                  style={{ color: accent }}>
                  {label}
                </span>
                <span className="text-[10px] sm:text-[9px] tabular-nums font-mono px-1.5 py-0.5 rounded bg-white/[0.03] text-gray-500 group-hover:text-gray-400 transition-colors">
                  {nicks.length}
                </span>
              </button>

              {/* Nick entries */}
              {!isCollapsed && (
                <div className="ml-1 sm:ml-0.5 border-l border-white/[0.03] pl-1 sm:pl-0.5">
                  {nicks.map((nick: WeeChatNick) => {
                    const isActive = actionPopup?.nick === nick.name;
                    const color = colorNicks ? nickColor(nick.name) : undefined;
                    const initials = nick.name.slice(0, 2).toUpperCase();
                    const sigil = nick.prefix.trim() || TIER_SIGILS_FALLBACK[label] || '';

                    const nickIsBot = isBot(nick.name);
                    return (
                      <button key={nick.name} onClick={e => handleNickClick(nick.name, e)}
                        className={`w-full flex items-center gap-2 sm:gap-1.5 px-1.5 sm:px-1 py-1.5 sm:py-[4px] rounded-lg sm:rounded-md text-[14px] sm:text-[12px] transition-all
                          ${isActive
                            ? 'bg-[var(--custom-accent,#818cf8)]/[0.08] text-gray-100'
                            : 'text-gray-400 hover:bg-white/[0.03] hover:text-gray-200 active:bg-white/[0.06]'}`}
                        title={nick.name}>
                        {/* Avatar */}
                        <div className="w-7 h-7 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] sm:text-[7px] font-bold relative"
                          style={{
                            background: color ? `${color}18` : 'rgba(255,255,255,0.04)',
                            color: color || 'var(--custom-accent, #818cf8)',
                          }}>
                          {initials}
                          {/* Tier badge */}
                          {sigil && (
                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 sm:w-2.5 sm:h-2.5 rounded-full flex items-center justify-center text-[7px] sm:text-[6px] font-bold leading-none"
                              style={{ background: accent, color: '#000' }}>
                              {sigil}
                            </span>
                          )}
                        </div>
                        {/* Name + bot badge */}
                        <span className="truncate flex-1 text-left leading-tight flex items-center gap-1"
                          style={color ? { color } : undefined}>
                          {nick.name}
                          {nickIsBot && (
                            <span className="inline-flex px-1 py-px rounded text-[7px] sm:text-[6px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 leading-none shrink-0">
                              BOT
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredGroups.size === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <svg className="w-8 h-8 text-gray-700" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
              <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3 3-5 6-5s6 2 6 5" />
            </svg>
            <span className="text-[11px] text-gray-600">
              {filter ? 'No matches' : 'No users'}
            </span>
          </div>
        )}
      </div>

      {/* Nick action popup */}
      {actionPopup && (
        <div ref={popupRef}
          className="fixed z-[100] animate-fade-up"
          style={{
            left: mobile ? '50%' : `${actionPopup.x}px`,
            top: `${Math.min(actionPopup.y, window.innerHeight - 260)}px`,
            transform: mobile ? 'translateX(-50%)' : undefined,
          }}>
          <div className="bg-gray-900 border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden min-w-[180px] backdrop-blur-sm"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)' }}>
            {/* Popup header with avatar */}
            <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{
                  background: `${nickColor(actionPopup.nick)}20`,
                  color: nickColor(actionPopup.nick),
                  boxShadow: `0 0 12px ${nickColor(actionPopup.nick)}15`,
                }}>
                {actionPopup.nick.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-100 truncate">{actionPopup.nick}</div>
                <div className="text-[10px] text-gray-500">
                  {(() => {
                    for (const [label] of nickGroups) {
                      const nicks = nickGroups.get(label);
                      if (nicks?.some((n: WeeChatNick) => n.name === actionPopup.nick) && label !== 'Regular') {
                        return label;
                      }
                    }
                    return 'User';
                  })()}
                </div>
              </div>
            </div>
            <div className="py-1.5">
              <PopupBtn icon="msg" label="Message" onClick={() => doAction('query')} />
              <PopupBtn icon="whois" label="Whois" onClick={() => doAction('whois')} />
              {ophion && <PopupBtn icon="profile" label="Profile" onClick={() => doAction('profile')} />}
              {ophion && entry?.buffer.localVars['type'] === 'channel' && (
                <PopupBtn icon="whisper" label="Whisper" onClick={() => doAction('whisper')} />
              )}
              {callState === 'idle' && (
                <>
                  <div className="h-px bg-white/[0.04] mx-3 my-1" />
                  <PopupBtn icon="video" label="LADON Video" onClick={() => doAction('video')} accent="emerald" />
                  <PopupBtn icon="voice" label="LADON Voice" onClick={() => doAction('voice')} accent="indigo" />
                </>
              )}
              {isOper && (
                <>
                  <div className="h-px bg-white/[0.04] mx-3 my-1" />
                  <PopupBtn icon="kick" label="Kick" onClick={() => doAction('kick')} danger />
                  <PopupBtn icon="ban" label="Ban" onClick={() => doAction('ban')} danger />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .nicklist-scroll::-webkit-scrollbar { width: 4px; }
        .nicklist-scroll::-webkit-scrollbar-track { background: transparent; }
        .nicklist-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }
        .nicklist-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }
      `}</style>
    </aside>
  );
}

function tierAccent(label: string): string {
  switch (label) {
    case 'Owner': return '#f87171';
    case 'Admin': return '#c084fc';
    case 'Op': return '#4ade80';
    case 'Halfop': return '#60a5fa';
    case 'Voice': return '#fbbf24';
    default: return 'var(--custom-accent, #818cf8)';
  }
}

function PopupBtn({ icon, label, onClick, danger, accent }: { icon: string; label: string; onClick: () => void; danger?: boolean; accent?: string }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-400' : accent === 'indigo' ? 'text-indigo-400' : '';
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 sm:py-2 text-[13px] sm:text-[12px] transition-all rounded-lg mx-0
        ${danger ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/15' : `${accentClass || 'text-gray-300'} hover:bg-white/[0.04] active:bg-white/[0.08]`}`}>
      <span className="w-4 h-4 flex items-center justify-center shrink-0">
        {icon === 'msg' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 3h12v8H5l-3 3V3z" />
          </svg>
        )}
        {icon === 'whois' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="8" cy="5" r="3" /><path d="M3 14c0-3 2-5 5-5s5 2 5 5" />
          </svg>
        )}
        {icon === 'kick' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 14l6-6m0 0L14 2M8 8l6 6M8 8L2 2" />
          </svg>
        )}
        {icon === 'video' && (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="2" y="5" width="15" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3" />
          </svg>
        )}
        {icon === 'voice' && (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0" /><path d="M12 17v4M8 21h8" />
          </svg>
        )}
        {icon === 'ban' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" /><path d="M3.5 3.5l9 9" strokeLinecap="round" />
          </svg>
        )}
        {icon === 'profile' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="3" y="1" width="10" height="14" rx="2" /><circle cx="8" cy="5.5" r="2" /><path d="M5 12c0-1.5 1.5-2.5 3-2.5s3 1 3 2.5" />
          </svg>
        )}
        {icon === 'whisper' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 3h12v7H6l-4 3V3z" /><path d="M5 6h6M5 8h4" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}
