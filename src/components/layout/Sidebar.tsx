'use client';

import { useState, useMemo, useCallback } from 'react';
import { useStore } from '@/stores';
import { ConnectionState } from '@/types';
import type { BufferEntry } from '@/types';
import BearLogo from '@/components/ui/BearLogo';

interface Props {
  onSelect?: () => void;
}

interface ServerGroup {
  serverName: string;
  serverEntry: BufferEntry | null;
  channels: BufferEntry[];
  queries: BufferEntry[];
  totalHighlights: number;
  totalUnread: number;
}

export default function Sidebar({ onSelect }: Props) {
  const connectionState = useStore(s => s.connectionState);
  const activeBuffer = useStore(s => s.activeBuffer);
  const getSorted = useStore(s => s.getSorted);
  const setActive = useStore(s => s.setActive);
  const requestHistory = useStore(s => s.requestHistory);
  const requestNicklist = useStore(s => s.requestNicklist);
  const sendInput = useStore(s => s.sendInput);
  const isPinned = useStore(s => s.isPinned);
  const isMuted = useStore(s => s.isMuted);
  const nextHighlighted = useStore(s => s.nextHighlighted);
  const buffers = useStore(s => s.buffers);
  const settings = useStore(s => s.settings);
  const openModal = useStore(s => s.openModal);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [showJoinBar, setShowJoinBar] = useState<string | null>(null);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING || connectionState === ConnectionState.AUTHENTICATING;

  const selectBuffer = useCallback((pointer: string) => {
    setActive(pointer);
    const entry = buffers.get(pointer);
    if (entry && entry.lines.length === 0 && !entry.loading) {
      requestHistory(100, pointer);
    }
    if (entry?.buffer.localVars['type'] === 'channel') {
      requestNicklist(pointer);
    }
    onSelect?.();
  }, [setActive, buffers, requestHistory, requestNicklist, onSelect]);

  const grouped = useMemo(() => {
    const sorted = getSorted();
    const core: BufferEntry[] = [];
    const serverMap = new Map<string, ServerGroup>();
    const fq = filterQuery.trim().toLowerCase();

    for (const entry of sorted) {
      const type = entry.buffer.localVars['type'] ?? '';
      const srvName = entry.buffer.localVars['server'] ?? '';

      if (settings.onlyUnread && entry.unread === 0 && entry.highlighted === 0 && entry.buffer.id !== activeBuffer) continue;
      if (fq) {
        const name = (entry.buffer.shortName || entry.buffer.name).toLowerCase();
        if (!name.includes(fq) && entry.buffer.id !== activeBuffer) continue;
      }

      if (!srvName && type !== 'channel' && type !== 'private') {
        core.push(entry);
        continue;
      }

      const key = srvName || entry.buffer.name;
      if (!serverMap.has(key)) {
        serverMap.set(key, { serverName: key, serverEntry: null, channels: [], queries: [], totalHighlights: 0, totalUnread: 0 });
      }
      const grp = serverMap.get(key)!;
      if (type === 'channel') grp.channels.push(entry);
      else if (type === 'private') grp.queries.push(entry);
      else grp.serverEntry = entry;
      grp.totalHighlights += entry.highlighted;
      grp.totalUnread += entry.unread;
    }

    return { core, servers: Array.from(serverMap.values()) };
  }, [getSorted, filterQuery, settings.onlyUnread, activeBuffer]);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const submitJoin = useCallback(() => {
    const ch = joinInput.trim();
    if (!ch) { setShowJoinBar(null); return; }
    const channel = ch.startsWith('#') || ch.startsWith('&') ? ch : `#${ch}`;
    sendInput(`/join ${channel}`);
    setJoinInput('');
    setShowJoinBar(null);
  }, [joinInput, sendInput]);

  const nextUnreadPtr = nextHighlighted(true);

  return (
    <aside className="flex flex-col h-full bg-gray-950 select-none overflow-hidden touch-pan-y"
      style={{ width: `min(${settings.sidebarWidth}px, 85vw)`, flexShrink: 0 }}>

      {/* Brand */}
      <div className="flex items-center gap-2.5 pl-4 pr-3 pt-4 pb-2 shrink-0">
        <BearLogo size={24} />
        <span className="text-[14px] font-bold text-gray-200 tracking-tight flex-1">DarkBear</span>
        <button onClick={() => openModal('settings')}
          className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] active:bg-white/[0.08] transition-all"
          title="Settings">
          <svg className="w-[16px] h-[16px] sm:w-[14px] sm:h-[14px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="3" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="13" r="1" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      {/* Connection pill */}
      <div className="mx-3 mb-2 shrink-0">
        <div className={`flex items-center gap-2 px-3 py-[6px] rounded-full text-[11px] font-medium
          ${isConnected ? 'bg-emerald-500/[0.08] text-emerald-400' :
            isConnecting ? 'bg-amber-500/[0.08] text-amber-400' :
            'bg-white/[0.03] text-gray-500'}`}>
          <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${
            isConnected ? 'bg-emerald-400' :
            isConnecting ? 'bg-amber-400 animate-pulse' :
            connectionState === ConnectionState.RECONNECTING ? 'bg-orange-400 animate-pulse' :
            'bg-gray-600'
          }`} />
          <span className="truncate">
            {isConnected ? settings.relay.host :
             isConnecting ? 'Connecting...' :
             connectionState === ConnectionState.RECONNECTING ? 'Reconnecting...' :
             'Disconnected'}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-1 shrink-0">
        <input type="text" value={filterQuery} onChange={e => setFilterQuery(e.target.value)}
          placeholder="Filter buffers"
          autoComplete="off" spellCheck={false}
          onKeyDown={e => { if (e.key === 'Escape') { setFilterQuery(''); (e.target as HTMLInputElement).blur(); } }}
          className="w-full bg-white/[0.03] sm:bg-transparent border border-white/[0.06] sm:border-0 sm:border-b sm:border-white/[0.05] rounded-lg sm:rounded-none text-[13px] sm:text-[12px] text-gray-300 placeholder-gray-600 px-3 sm:px-1 py-2.5 sm:py-2 outline-none focus:border-indigo-500/30 transition-colors" />
      </div>

      {/* Buffer list */}
      <div className="flex-1 overflow-y-auto pt-1 pb-2 px-1.5">
        {grouped.core.map(entry => (
          <BufItem key={entry.buffer.id} entry={entry} active={activeBuffer === entry.buffer.id}
            onClick={() => selectBuffer(entry.buffer.id)} />
        ))}

        {grouped.servers.map(grp => {
          const isCollapsed = collapsed.has(grp.serverName);

          return (
            <div key={grp.serverName} className="mt-3 first:mt-0">
              {/* Server header */}
              <div className="flex items-center gap-0.5 pl-1 pr-2 mb-px">
                <button onClick={() => toggleCollapse(grp.serverName)}
                  className="shrink-0 w-7 h-7 sm:w-5 sm:h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors">
                  <svg className={`w-[9px] h-[9px] transition-transform duration-100 ${isCollapsed ? '-rotate-90' : ''}`}
                    viewBox="0 0 8 8" fill="currentColor"><path d="M1 2l3 3.5L7 2z" /></svg>
                </button>
                {grp.serverEntry ? (
                  <button onClick={() => selectBuffer(grp.serverEntry!.buffer.id)}
                    className={`flex-1 text-left text-[10px] font-extrabold uppercase tracking-[0.12em] py-1.5 px-1 rounded transition-colors truncate
                      ${activeBuffer === grp.serverEntry.buffer.id ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}>
                    {grp.serverName}
                  </button>
                ) : (
                  <span className="flex-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500 py-1.5 px-1 truncate">
                    {grp.serverName}
                  </span>
                )}
                {isCollapsed && grp.totalHighlights > 0 && <Pip count={grp.totalHighlights} hot />}
                {!isCollapsed && (
                  <button onClick={() => { setShowJoinBar(grp.serverName); setJoinInput(''); }}
                    className="shrink-0 w-7 h-7 sm:w-5 sm:h-5 flex items-center justify-center rounded text-gray-500 hover:text-indigo-400 active:bg-white/[0.04] transition-colors"
                    title="Join channel">
                    <svg className="w-[12px] h-[12px] sm:w-[10px] sm:h-[10px]" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M5 1v8M1 5h8" />
                    </svg>
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <>
                  {showJoinBar === grp.serverName && (
                    <div className="px-2 pb-1 animate-fade-in">
                      <input autoFocus value={joinInput} onChange={e => setJoinInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') submitJoin();
                          if (e.key === 'Escape') { setShowJoinBar(null); setJoinInput(''); }
                        }}
                        placeholder="#channel"
                        className="w-full bg-indigo-500/[0.06] border border-indigo-500/20 rounded-lg text-[13px] sm:text-[12px] text-gray-200 px-3 py-2.5 sm:py-1.5 outline-none focus:border-indigo-500/40 placeholder-gray-600 transition-colors" />
                    </div>
                  )}

                  {grp.channels.map(entry => (
                    <BufItem key={entry.buffer.id} entry={entry} active={activeBuffer === entry.buffer.id}
                      onClick={() => selectBuffer(entry.buffer.id)} indent
                      pinned={isPinned(entry.buffer.id)} muted={isMuted(entry.buffer.id)} />
                  ))}

                  {grp.queries.length > 0 && (
                    <>
                      <div className="pl-8 pt-3 pb-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-500">DMs</span>
                      </div>
                      {grp.queries.map(entry => (
                        <BufItem key={entry.buffer.id} entry={entry} active={activeBuffer === entry.buffer.id}
                          onClick={() => selectBuffer(entry.buffer.id)} indent query />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Unread jump */}
      {nextUnreadPtr && (
        <div className="shrink-0 px-3 py-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <button onClick={() => { setActive(nextUnreadPtr); onSelect?.(); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-2 rounded-full bg-red-500/10 text-red-400 text-[12px] sm:text-[11px] font-semibold hover:bg-red-500/15 active:bg-red-500/20 transition-all">
            <svg className="w-3.5 h-3.5 sm:w-3 sm:h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 2v8M5 7l3 3 3-3" /></svg>
            Unread
          </button>
        </div>
      )}
    </aside>
  );
}

function BufItem({ entry, active, onClick, indent, pinned, muted, query }: {
  entry: BufferEntry; active: boolean; onClick: () => void;
  indent?: boolean; pinned?: boolean; muted?: boolean; query?: boolean;
}) {
  const name = entry.buffer.shortName || entry.buffer.name;
  const isChannel = entry.buffer.localVars['type'] === 'channel';
  const displayName = name;

  return (
    <button onClick={onClick} title={entry.buffer.fullName}
      className={`w-full text-left ${indent ? 'pl-6' : 'pl-3'} pr-2 py-2 sm:py-[6px] flex items-center gap-2 transition-all text-[14px] sm:text-[13px] rounded-lg group relative
        active:bg-white/[0.04]
        ${active
          ? 'text-gray-100 bg-white/[0.06]'
          : entry.highlighted > 0
            ? 'text-gray-100'
            : entry.unread > 0
              ? 'text-gray-300'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.02]'}`}>
      {/* Active indicator */}
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 sm:h-4 rounded-r-full bg-indigo-500" />}
      {/* Name */}
      <span className="truncate flex-1 leading-snug">{displayName}</span>
      {pinned && <span className="w-1 h-1 rounded-full bg-indigo-500/50 shrink-0" />}
      {muted && <span className="text-[10px] text-gray-600 shrink-0">/</span>}
      {entry.highlighted > 0 ? (
        <Pip count={entry.highlighted} hot />
      ) : entry.unread > 0 ? (
        <Pip count={entry.unread} />
      ) : null}
    </button>
  );
}

function Pip({ count, hot }: { count: number; hot?: boolean }) {
  if (hot) {
    return (
      <span className="shrink-0 min-w-[16px] h-4 rounded-full text-[10px] font-bold flex items-center justify-center px-1 bg-red-500 text-white leading-none">
        {count > 99 ? '99+' : count}
      </span>
    );
  }
  return (
    <span className="shrink-0 min-w-[16px] h-4 rounded-full text-[10px] font-bold flex items-center justify-center px-1 bg-[var(--custom-accent,#818cf8)]/20 text-[var(--custom-accent,#818cf8)] leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
}
