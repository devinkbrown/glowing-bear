// Sidebar — brand row, connection pill, buffer filter, buffers grouped by
// server (channels + DMs), per-server join bar, unread/highlight pips, and the
// unread jump button. Solid port of the old React Sidebar.

import { createMemo, createSignal, For, Show } from 'solid-js';
import {
  buffersState,
  ConnectionState,
  connectionState,
  cycleNotifyMode,
  getNotifyMode,
  getTemporaryMuteUntil,
  getTotalHighlights,
  getTotalUnread,
  getSorted,
  isPinned,
  nextHighlighted,
  openModal,
  requestHistory,
  requestNicklist,
  sendInput,
  sessionKind,
  setActive,
  openSplitWith,
  setSidebarOpen,
  settings,
} from '@/state';
import { isDirectOnyxSession } from '@/lib/connect/sessionKind';
import type { BufferEntry, NotifyMode } from '@/state';
import BearLogo from '@/ui/bits/BearLogo';
import { bufferKind, type BufferKind } from '@/lib/bufferKind';
import { stripColors } from '@/lib/weechat/strip-colors';
import { createMediaQuery } from '@/primitives/mediaQuery';
import { formatDate, t } from '@/lib/i18n';
import { isImeComposing } from '@/primitives/ime';

interface SidebarProps {
  /** Optional extra hook fired after a buffer is selected (e.g. close a drawer). */
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

const PIP_MAX = 99;
type BufferMode = 'all' | 'unread' | 'mentions' | 'dms';

export default function Sidebar(props: SidebarProps) {
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const [filterQuery, setFilterQuery] = createSignal('');
  const [bufferMode, setBufferMode] = createSignal<BufferMode>('all');
  const [joinInput, setJoinInput] = createSignal('');
  const [showJoinBar, setShowJoinBar] = createSignal<string | null>(null);
  const isMobile = createMediaQuery('(max-width: 1023px)');

  const isConnected = () => connectionState() === ConnectionState.CONNECTED;
  const isConnecting = () =>
    connectionState() === ConnectionState.CONNECTING ||
    connectionState() === ConnectionState.AUTHENTICATING;
  const isReconnecting = () => connectionState() === ConnectionState.RECONNECTING;
  const onyxDirect = () => isDirectOnyxSession(sessionKind());
  const connectionHost = () => {
    if (onyxDirect()) {
      const raw = settings.bridge.wsUrl.trim();
      try {
        return new URL(raw).host || raw;
      } catch {
        return raw.replace(/^wss?:\/\//i, '') || t('sidebar.disconnected');
      }
    }
    return settings.relay.host;
  };
  const connectionTransport = () => {
    if (onyxDirect()) {
      return settings.bridge.wsUrl.trim().toLowerCase().startsWith('ws://')
        ? t('sidebar.plain')
        : t('sidebar.wss');
    }
    return settings.relay.tls ? 'TLS' : t('sidebar.plain');
  };

  const selectBuffer = (pointer: string, e?: MouseEvent): void => {
    // Alt-click or middle-click sends the buffer to the SPLIT pane (opening it
    // if needed) instead of switching the main pane — the way to put a second,
    // different buffer side-by-side.
    const toSplit = !!e && (e.altKey || e.button === 1);
    if (toSplit) {
      e!.preventDefault();
      openSplitWith(pointer);
    } else {
      setActive(pointer);
    }
    const entry = buffersState.buffers[pointer];
    if (entry && entry.lines.length === 0 && !entry.loading) {
      requestHistory(100, pointer);
    }
    if (entry && (entry.buffer.localVars['type'] ?? '') === 'channel') {
      requestNicklist(pointer);
    }
    if (!toSplit && isMobile()) setSidebarOpen(false);
    if (!toSplit) props.onSelect?.();
  };

  const grouped = createMemo(() => {
    const sorted = getSorted();
    const core: BufferEntry[] = [];
    const serverOrder: string[] = [];
    const serverMap: Record<string, ServerGroup> = {};
    const fq = filterQuery().trim().toLowerCase();
    const active = buffersState.activeBuffer;

    for (const entry of sorted) {
      const type = entry.buffer.localVars['type'] ?? '';
      const srvName = entry.buffer.localVars['server'] ?? '';
      const kind = bufferKind(entry.buffer);
      const mode = bufferMode();

      if (settings.onlyUnread && entry.unread === 0 && entry.highlighted === 0 && entry.buffer.id !== active) continue;
      if (mode === 'unread' && entry.unread === 0 && entry.highlighted === 0 && entry.buffer.id !== active) continue;
      if (mode === 'mentions' && entry.highlighted === 0 && entry.buffer.id !== active) continue;
      if (mode === 'dms' && kind !== 'query' && entry.buffer.id !== active) continue;
      if (fq) {
        const name = (entry.buffer.shortName || entry.buffer.name).toLowerCase();
        const last = stripColors(entry.lines.at(-1)?.message ?? '').toLowerCase();
        if (!name.includes(fq) && !last.includes(fq) && entry.buffer.id !== active) continue;
      }

      if (!srvName && type !== 'channel' && type !== 'private') {
        core.push(entry);
        continue;
      }

      const key = srvName || entry.buffer.name;
      let grp = serverMap[key];
      if (!grp) {
        grp = { serverName: key, serverEntry: null, channels: [], queries: [], totalHighlights: 0, totalUnread: 0 };
        serverMap[key] = grp;
        serverOrder.push(key);
      }
      if (type === 'channel') grp.channels.push(entry);
      else if (type === 'private') grp.queries.push(entry);
      else grp.serverEntry = entry;
      grp.totalHighlights += entry.highlighted;
      grp.totalUnread += entry.unread;
    }

    return { core, servers: serverOrder.map((key) => serverMap[key]!) };
  });

  const toggleCollapse = (key: string): void => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const submitJoin = (grp: ServerGroup): void => {
    const ch = joinInput().trim();
    if (!ch) {
      setShowJoinBar(null);
      return;
    }
    const channel = ch.startsWith('#') || ch.startsWith('&') ? ch : `#${ch}`;
    // Route the /join through this server group's buffer so multi-server
    // setups join on the right network (falls back to the active buffer).
    const pointer = grp.serverEntry?.buffer.id ?? grp.channels[0]?.buffer.id ?? grp.queries[0]?.buffer.id;
    if (sendInput(`/join ${channel}`, pointer)) {
      setJoinInput('');
      setShowJoinBar(null);
    }
  };

  const nextUnread = createMemo(() => nextHighlighted(true));
  const stats = createMemo(() => {
    const entries = Object.values(buffersState.buffers);
    let channels = 0;
    let dms = 0;
    for (const entry of entries) {
      const kind = bufferKind(entry.buffer);
      if (kind === 'channel') channels++;
      else if (kind === 'query') dms++;
    }
    return {
      channels,
      dms,
      unread: getTotalUnread(),
      mentions: getTotalHighlights(),
    };
  });
  const modeActive = (mode: BufferMode) => bufferMode() === mode;

  return (
    <aside
      class="darkbear-sidebar flex flex-col h-full border-r border-white/[0.06] select-none overflow-hidden touch-pan-y"
      style={{ width: `min(${settings.sidebarWidth}px, 85vw)`, 'flex-shrink': 0 }}
    >
      {/* Brand */}
      <div class="sidebar-brand flex items-center gap-2.5 pl-4 pr-3 pt-4 pb-3 shrink-0">
        <div class="relative">
          <BearLogo size={26} />
          <span
            class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-gray-950"
            classList={{
              'bg-[var(--role-online,#34d399)]': isConnected(),
              'bg-amber-400 animate-pulse': isConnecting() || isReconnecting(),
              'bg-gray-600': !isConnected() && !isConnecting() && !isReconnecting(),
            }}
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[14px] font-black text-gray-100 tracking-tight leading-tight">DarkBear</div>
          <div class="text-[9px] uppercase tracking-[0.18em] text-gray-600 leading-tight">
            {onyxDirect() ? t('sidebar.onyxConsole') : t('sidebar.relayConsole')}
          </div>
        </div>
        <button
          onClick={() => openModal('settings')}
          class="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] active:bg-white/[0.08] transition-all"
          title={t('mobile.settings')}
          aria-label={t('mobile.settings')}
        >
          <svg class="w-[15px] h-[15px] sm:w-[13px] sm:h-[13px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
          </svg>
        </button>
      </div>

      {/* Connection + activity deck */}
      <div class="mx-3 mb-3 shrink-0 space-y-2">
        <div
          class="darkbear-connection-pill flex items-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-0 rounded-xl text-[11px] font-semibold"
          classList={{
            'bg-[var(--role-online,#34d399)]/[0.08] text-[var(--role-online,#34d399)] border-[var(--role-online,#34d399)]/25': isConnected(),
            'bg-amber-500/[0.08] text-amber-300 border-amber-400/15': isConnecting() || isReconnecting(),
            'bg-white/[0.03] text-gray-500': !isConnected() && !isConnecting(),
          }}
        >
          <span
            class="w-[5px] h-[5px] rounded-full shrink-0"
            classList={{
              'bg-[var(--role-online,#34d399)]': isConnected(),
              'bg-amber-400 animate-pulse': isConnecting(),
              'bg-orange-400 animate-pulse': isReconnecting(),
              'bg-gray-600': !isConnected() && !isConnecting() && !isReconnecting(),
            }}
          />
          <span class="truncate" data-testid="connection-host">
            {isConnected() ? connectionHost() :
             isConnecting() ? t('sidebar.connecting') :
             isReconnecting() ? t('sidebar.reconnecting') :
             t('sidebar.disconnected')}
          </span>
          <span class="ml-auto font-mono text-[10px] opacity-70" data-testid="connection-transport">
            {connectionTransport()}
          </span>
        </div>
        <div class="grid grid-cols-4 gap-1.5">
          <StatCell label={t('sidebar.unread')} value={stats().unread} hot={stats().unread > 0} />
          <StatCell label={t('sidebar.mentions')} value={stats().mentions} hot={stats().mentions > 0} danger />
          <StatCell label={t('sidebar.channelsShort')} value={stats().channels} />
          <StatCell label={t('sidebar.dmShort')} value={stats().dms} />
        </div>
      </div>

      {/* Filter */}
      <div class="px-3 pb-2 shrink-0 space-y-2">
        <label class="relative block">
          <svg class="sidebar-filter-icon pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M10.5 10.5L14.5 14.5" />
          </svg>
          <input
            type="text"
            value={filterQuery()}
            onInput={(e) => setFilterQuery(e.currentTarget.value)}
            placeholder={t('sidebar.filter')}
            autocomplete="off"
            spellcheck={false}
            onKeyDown={(e) => {
              if (isImeComposing(e)) return;
              if (e.key === 'Escape') {
                setFilterQuery('');
                e.currentTarget.blur();
              }
            }}
            class="sidebar-filter-input w-full rounded-xl border border-white/[0.07] bg-white/[0.035] py-2.5 pl-9 pr-3 text-[13px] text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-[var(--role-primary,#818cf8)]/35 focus:bg-white/[0.055] sm:py-2 sm:text-[12px]"
          />
        </label>
        <div class="grid grid-cols-4 gap-1 rounded-xl border border-white/[0.055] bg-black/20 p-1">
          <ModeButton label={t('sidebar.all')} active={modeActive('all')} onClick={() => setBufferMode('all')} />
          <ModeButton label={t('sidebar.hot')} active={modeActive('unread')} onClick={() => setBufferMode('unread')} />
          <ModeButton label="@" active={modeActive('mentions')} onClick={() => setBufferMode('mentions')} />
          <ModeButton label={t('sidebar.dmMode')} active={modeActive('dms')} onClick={() => setBufferMode('dms')} />
        </div>
      </div>

      {/* Buffer list */}
      <div class="flex-1 overflow-y-auto pt-1 pb-2 px-1.5">
        <For each={grouped().core}>
          {(entry) => (
            <BufItem
              entry={entry}
              active={buffersState.activeBuffer === entry.buffer.id}
              onClick={(e) => selectBuffer(entry.buffer.id, e)}
            />
          )}
        </For>

        <For each={grouped().servers}>
          {(grp) => {
            const isCollapsed = () => !!collapsed()[grp.serverName];
            return (
              <div class="mt-3 first:mt-0">
                {/* Server header */}
                <div class="darkbear-server-header flex items-center gap-0.5 pl-1 pr-2 mb-1">
                  <button
                    onClick={() => toggleCollapse(grp.serverName)}
                    class="shrink-0 w-7 h-7 sm:w-5 sm:h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
                    aria-label={isCollapsed() ? t('sidebar.expand', { server: grp.serverName }) : t('sidebar.collapse', { server: grp.serverName })}
                  >
                    <svg
                      class="w-[9px] h-[9px] transition-transform duration-100"
                      classList={{ '-rotate-90': isCollapsed() }}
                      viewBox="0 0 8 8"
                      fill="currentColor"
                    >
                      <path d="M1 2l3 3.5L7 2z" />
                    </svg>
                  </button>
                  <Show
                    when={grp.serverEntry}
                    fallback={
                      <span class="flex-1 text-[9px] font-black uppercase tracking-[0.18em] text-gray-600 py-1.5 px-1 truncate">
                        {grp.serverName}
                      </span>
                    }
                  >
                    {(serverEntry) => (
                      <button
                        onClick={(e) => selectBuffer(serverEntry().buffer.id, e)}
                        class="flex-1 text-left text-[9px] font-black uppercase tracking-[0.18em] py-1.5 px-1 rounded transition-colors truncate"
                        classList={{
                          'text-[var(--role-primary,#818cf8)]': buffersState.activeBuffer === serverEntry().buffer.id,
                          'text-gray-600 hover:text-gray-300': buffersState.activeBuffer !== serverEntry().buffer.id,
                        }}
                      >
                        {grp.serverName}
                      </button>
                    )}
                  </Show>
                  <Show when={isCollapsed() && grp.totalHighlights > 0}>
                    <Pip count={grp.totalHighlights} hot />
                  </Show>
                  <Show when={!isCollapsed() && (grp.totalUnread > 0 || grp.totalHighlights > 0)}>
                    <span class="rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-gray-500">
                      {grp.totalHighlights > 0 ? `${grp.totalHighlights}@` : grp.totalUnread}
                    </span>
                  </Show>
                  <Show when={!isCollapsed()}>
                    <button
                      onClick={() => {
                        setShowJoinBar(grp.serverName);
                        setJoinInput('');
                      }}
                      class="shrink-0 w-7 h-7 sm:w-5 sm:h-5 flex items-center justify-center rounded text-gray-500 hover:text-[var(--role-primary,#818cf8)] active:bg-white/[0.04] transition-colors"
                      title={t('sidebar.join')}
                      aria-label={t('sidebar.join')}
                    >
                      <svg class="w-[12px] h-[12px] sm:w-[10px] sm:h-[10px]" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <path d="M5 1v8M1 5h8" />
                      </svg>
                    </button>
                  </Show>
                </div>

                <Show when={!isCollapsed()}>
                  <Show when={showJoinBar() === grp.serverName}>
                    <div class="px-2 pb-1 animate-fade-in">
                      <input
                        ref={(el) => queueMicrotask(() => el.focus())}
                        value={joinInput()}
                        onInput={(e) => setJoinInput(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (isImeComposing(e)) return;
                          if (e.key === 'Enter') submitJoin(grp);
                          if (e.key === 'Escape') {
                            setShowJoinBar(null);
                            setJoinInput('');
                          }
                        }}
                        placeholder="#channel"
                        class="w-full bg-[var(--role-primary,#818cf8)]/[0.06] border border-[var(--role-primary,#818cf8)]/20 rounded-lg text-[13px] sm:text-[12px] text-gray-200 px-3 py-2.5 sm:py-1.5 outline-none focus:border-[var(--role-primary,#818cf8)]/40 placeholder-gray-600 transition-colors"
                      />
                    </div>
                  </Show>

                  <For each={grp.channels}>
                    {(entry) => (
                      <BufItem
                        entry={entry}
                        active={buffersState.activeBuffer === entry.buffer.id}
                        onClick={(e) => selectBuffer(entry.buffer.id, e)}
                        indent
                        pinned={isPinned(entry.buffer.id)}
                        notifyMode={getNotifyMode(entry.buffer.id)}
                        temporaryMutedUntil={getTemporaryMuteUntil(entry.buffer.id)}
                      />
                    )}
                  </For>

                  <Show when={grp.queries.length > 0}>
                    <div class="pl-8 pt-3 pb-1">
                      <span class="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-500">{t('sidebar.dms')}</span>
                    </div>
                    <For each={grp.queries}>
                      {(entry) => (
                        <BufItem
                          entry={entry}
                          active={buffersState.activeBuffer === entry.buffer.id}
                          onClick={(e) => selectBuffer(entry.buffer.id, e)}
                          indent
                          notifyMode={getNotifyMode(entry.buffer.id)}
                          temporaryMutedUntil={getTemporaryMuteUntil(entry.buffer.id)}
                        />
                      )}
                    </For>
                  </Show>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* Unread jump */}
      <Show when={nextUnread()}>
        {(pointer) => (
          <div class="shrink-0 px-3 py-2" style={{ 'padding-bottom': 'max(0.5rem, env(safe-area-inset-bottom))' }}>
            <button
              onClick={(e) => selectBuffer(pointer(), e)}
              class="w-full flex items-center justify-center gap-2 py-2.5 sm:py-2 rounded-full bg-[var(--role-mention,#f87171)]/10 text-[var(--role-mention,#f87171)] text-[12px] sm:text-[11px] font-semibold hover:bg-[var(--role-mention,#f87171)]/15 active:bg-[var(--role-mention,#f87171)]/20 transition-all"
            >
              <svg class="w-3.5 h-3.5 sm:w-3 sm:h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M8 2v8M5 7l3 3 3-3" />
              </svg>
              {t('sidebar.unreadJump')}
            </button>
          </div>
        )}
      </Show>
    </aside>
  );
}

function BufItem(props: {
  entry: BufferEntry;
  active: boolean;
  onClick: (e: MouseEvent) => void;
  indent?: boolean;
  pinned?: boolean;
  notifyMode?: NotifyMode;
  temporaryMutedUntil?: number;
}) {
  const name = () => props.entry.buffer.shortName || props.entry.buffer.name;
  const kind = () => bufferKind(props.entry.buffer);
  const lastLine = () => props.entry.lines.at(-1);
  const preview = () => {
    const line = lastLine();
    if (!line) return '';
    const text = stripColors(line.message).replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const prefix = line.nick ? `${line.nick}: ` : '';
    const value = `${prefix}${text}`;
    return value.length > 96 ? `${value.slice(0, 95)}…` : value;
  };
  const activityTime = () => {
    const line = lastLine();
    if (!line) return '';
    return formatDate(line.date, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    // The row selector and notification control are sibling buttons. A single
    // interactive container would hide the inner control from assistive tech.
    <div
      onClick={(event) => props.onClick(event)}
      class="darkbear-buffer-row w-full text-left pr-2 py-2.5 sm:py-2 flex items-start gap-2 transition-[transform,background-color,box-shadow,color] duration-150 ease-out text-[14px] sm:text-[13px] rounded-xl group relative active:scale-[0.985] cursor-pointer focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--role-primary,#818cf8)]/50"
      classList={{
        'pl-6': props.indent,
        'pl-3': !props.indent,
        'text-gray-100 bg-[var(--role-primary,#818cf8)]/[0.14] ring-1 ring-inset ring-[var(--role-primary,#818cf8)]/30 shadow-sm shadow-black/20': props.active,
        'text-gray-100 hover:bg-white/[0.04]': !props.active && props.entry.highlighted > 0,
        'text-gray-300 hover:bg-white/[0.03]': !props.active && props.entry.highlighted === 0 && props.entry.unread > 0,
        'text-gray-400 hover:text-gray-200 hover:bg-white/[0.025]':
          !props.active && props.entry.highlighted === 0 && props.entry.unread === 0,
      }}
    >
      <button
        type="button"
        aria-label={name()}
        aria-current={props.active ? 'page' : undefined}
        title={props.entry.buffer.fullName}
        class="absolute inset-0 z-0 rounded-xl focus:outline-none"
      />
      {/* Selection rail — an accent left-edge that reads as a continuum:
          hidden when idle, faint on hover, solid + taller when selected.
          Animated on opacity/transform only (compositor-friendly). */}
      <span
        class="buffer-selection-rail pointer-events-none absolute left-0 top-1/2 z-[1] -translate-y-1/2 w-[3px] rounded-r-full bg-[var(--role-primary,#818cf8)] origin-center transition-[opacity,transform] duration-200 ease-out"
        classList={{
          'h-6 sm:h-5 scale-y-100 opacity-100': props.active,
          'h-4 scale-y-50 opacity-0 group-hover:opacity-50 group-hover:scale-y-100': !props.active,
        }}
      />
      <span class="pointer-events-none relative z-[1] mt-0.5">
        <BufIcon kind={kind()} active={props.active || props.entry.unread > 0 || props.entry.highlighted > 0} />
      </span>
      <span class="pointer-events-none relative z-[1] min-w-0 flex-1">
        <span class="flex min-w-0 items-center gap-1.5">
          <span
            class="truncate leading-snug"
            classList={{ 'font-semibold': props.active, 'font-medium': !props.active }}
          >
            {name()}
          </span>
          <Show when={activityTime()}>
            <span class="ml-auto hidden shrink-0 font-mono text-[9px] text-gray-600 group-hover:text-gray-500 sm:inline">{activityTime()}</span>
          </Show>
        </span>
        <Show when={preview()}>
          <span class="mt-0.5 block truncate text-[10px] leading-tight text-gray-600 group-hover:text-gray-500">
            {preview()}
          </span>
        </Show>
      </span>
      <Show when={props.pinned}>
        <span class="pointer-events-none relative z-[1] w-1 h-1 rounded-full bg-[var(--role-primary,#818cf8)]/50 shrink-0" />
      </Show>
      <Show when={props.notifyMode}>
        {(mode) => (
          <NotifyButton
            mode={mode()}
            temporaryMutedUntil={props.temporaryMutedUntil ?? 0}
            onCycle={(e) => {
              // Keep the notify toggle from also selecting the buffer.
              e.stopPropagation();
              cycleNotifyMode(props.entry.buffer.id);
            }}
          />
        )}
      </Show>
      <Show when={props.entry.highlighted > 0} fallback={
        <Show when={props.entry.unread > 0}>
          <span class="pointer-events-none relative z-[1]"><Pip count={props.entry.unread} /></span>
        </Show>
      }>
        <span class="pointer-events-none relative z-[1]"><Pip count={props.entry.highlighted} hot /></span>
      </Show>
    </div>
  );
}

/**
 * Per-buffer notification tier control — a real, keyboard-focusable button that
 * cycles all → mentions → mute → all. Icon + semantics per tier:
 *   all      → bell, kept faint until hover/focus so default rows stay calm
 *   mentions → bell with an accent "mention" dot, always visible
 *   mute     → bell-slash, always visible
 * Motion is opacity/colour/transform only (compositor-friendly), timed on the
 * house 150ms ease-out. The label announces the current tier for a screen
 * reader and updates reactively as the tier changes.
 */
function NotifyButton(props: { mode: NotifyMode; temporaryMutedUntil: number; onCycle: (e: MouseEvent) => void }) {
  const temporarilyMuted = () => props.temporaryMutedUntil > Date.now();
  const label = () => {
    if (temporarilyMuted()) {
      return t('sidebar.notifyTemporary', {
        time: formatDate(props.temporaryMutedUntil, { hour: '2-digit', minute: '2-digit' }),
      });
    }
    switch (props.mode) {
      case 'all':
        return t('sidebar.notifyAll');
      case 'mentions':
        return t('sidebar.notifyMentions');
      case 'mute':
        return t('sidebar.notifyMuted');
    }
  };
  const iconCls = 'w-[13px] h-[13px] sm:w-3 sm:h-3';
  return (
    <button
      type="button"
      aria-label={label()}
      title={label()}
      data-notify-mode={props.mode}
      data-temporary-mute={temporarilyMuted() ? 'true' : undefined}
      onClick={(e) => props.onCycle(e)}
      class="relative z-[2] shrink-0 flex items-center justify-center w-11 h-11 sm:w-6 sm:h-6 -my-1 sm:-my-0.5 rounded-md transition-[opacity,color,transform] duration-150 ease-out hover:bg-white/[0.06] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--role-primary,#818cf8)]/60"
      classList={{
        // Default tier: unobtrusive until the row is hovered or the control focused.
        'opacity-40 text-gray-600 group-hover:opacity-90 group-hover:text-gray-400 focus-visible:opacity-100':
          props.mode === 'all',
        // Mentions-only: present and legible, the --role-mention dot carries the meaning.
        'opacity-100 text-gray-400 hover:text-gray-200': props.mode === 'mentions',
        // Muted: present but quiet, the slash carries the meaning.
        'opacity-100 text-gray-600 hover:text-gray-400': props.mode === 'mute',
      }}
    >
      <Show when={temporarilyMuted()}>
        <svg class={iconCls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 4.8v3.5l2.3 1.4" />
        </svg>
      </Show>
      <Show when={!temporarilyMuted() && props.mode === 'all'}>
        <svg class={iconCls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2a1 1 0 0 0-1 1v.5C5.4 3.9 4.3 5.4 4.3 7.1c0 2.5-1 3.5-1 3.5h9.4s-1-1-1-3.5c0-1.7-1.1-3.2-2.7-3.6V3a1 1 0 0 0-1-1z" />
          <path d="M6.7 11.4a1.4 1.4 0 0 0 2.6 0" />
        </svg>
      </Show>
      <Show when={!temporarilyMuted() && props.mode === 'mentions'}>
        <svg class={iconCls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2a1 1 0 0 0-1 1v.5C5.4 3.9 4.3 5.4 4.3 7.1c0 2.5-1 3.5-1 3.5h9.4s-1-1-1-3.5c0-1.7-1.1-3.2-2.7-3.6V3a1 1 0 0 0-1-1z" />
          <path d="M6.7 11.4a1.4 1.4 0 0 0 2.6 0" />
          <circle cx="12" cy="4" r="2.4" fill="var(--role-mention,#f87171)" stroke="none" />
        </svg>
      </Show>
      <Show when={!temporarilyMuted() && props.mode === 'mute'}>
        <svg class={iconCls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2a1 1 0 0 0-1 1v.5C5.4 3.9 4.3 5.4 4.3 7.1c0 2.5-1 3.5-1 3.5h9.4s-1-1-1-3.5c0-1.7-1.1-3.2-2.7-3.6V3a1 1 0 0 0-1-1z" opacity="0.7" />
          <path d="M6.7 11.4a1.4 1.4 0 0 0 2.6 0" opacity="0.7" />
          <path d="M3 3l10 10" />
        </svg>
      </Show>
    </button>
  );
}

function StatCell(props: { label: string; value: number; hot?: boolean; danger?: boolean }) {
  return (
    <div
      class="rounded-xl border border-white/[0.055] bg-white/[0.025] px-2 py-1.5 text-center"
      classList={{
        'border-[var(--role-primary,#818cf8)]/20 bg-[var(--role-primary,#818cf8)]/[0.06]': props.hot && !props.danger,
        'border-[var(--role-mention,#f87171)]/20 bg-[var(--role-mention,#f87171)]/[0.07]': props.hot && props.danger,
      }}
    >
      <div
        class="font-mono text-[13px] font-black leading-none tabular-nums"
        classList={{
          'text-[var(--role-primary,#818cf8)]': props.hot && !props.danger,
          'text-[var(--role-mention,#f87171)]': props.hot && props.danger,
          'text-gray-300': !props.hot,
        }}
      >
        {props.value > PIP_MAX ? `${PIP_MAX}+` : props.value}
      </div>
      <div class="mt-1 truncate text-[8px] font-bold uppercase tracking-[0.12em] text-gray-600">{props.label}</div>
    </div>
  );
}

function ModeButton(props: { label: string; active: boolean; onClick: (e: MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => props.onClick(e)}
      class="h-7 rounded-lg text-[10px] font-black uppercase tracking-[0.08em] transition-all"
      classList={{
        'darkbear-mode-button-active shadow-lg shadow-black/20': props.active,
        'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300': !props.active,
      }}
    >
      {props.label}
    </button>
  );
}

function BufIcon(props: { kind: BufferKind; active?: boolean }) {
  const cls = 'w-3.5 h-3.5 shrink-0 transition-opacity';
  const opacity = () => props.active ? 'opacity-80' : 'opacity-40';
  return (
    <>
      <Show when={props.kind === 'channel'}>
        <svg class={`${cls} ${opacity()}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M6 2L4 14M12 2l-2 12M2 6h12M1 10h12" />
        </svg>
      </Show>
      <Show when={props.kind === 'query'}>
        <svg class={`${cls} ${opacity()}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 10c0 1.1-.9 2-2 2H5l-3 2V4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v6z" />
        </svg>
      </Show>
      <Show when={props.kind === 'raw'}>
        <svg class={`${cls} ${opacity()}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="1" y="2" width="14" height="12" rx="2" />
          <path d="M4 6l2 2-2 2M8 10h4" />
        </svg>
      </Show>
      <Show when={props.kind === 'fset'}>
        <svg class={`${cls} ${opacity()}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4" />
        </svg>
      </Show>
      <Show when={props.kind === 'core'}>
        <svg class={`${cls} ${opacity()}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="2" y="3" width="12" height="10" rx="2" />
          <path d="M5 8h6M5 11h3" />
        </svg>
      </Show>
      <Show when={props.kind === 'plugin'}>
        <svg class={`${cls} ${opacity()}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="3" y="1" width="10" height="14" rx="2" />
          <path d="M6 5h4M6 8h4M6 11h2" />
        </svg>
      </Show>
    </>
  );
}

function Pip(props: { count: number; hot?: boolean }) {
  return (
    <span
      class="shrink-0 flex items-center justify-center rounded-full min-w-[16px] h-4 text-[10px] font-bold tabular-nums leading-none"
      classList={{
        // Mention: --role-mention solid, ringed + glow — the "what did I miss"
        // focal point. Glyphs use the theme GROUND (text-gray-950: near-black on
        // dark, white on light) so they clear AA on the badge on every theme.
        'px-1.5 bg-[var(--role-mention,#f87171)] text-gray-950 ring-1 ring-[var(--role-mention,#f87171)]/50 shadow-sm shadow-[var(--role-mention,#f87171)]/40': props.hot,
        // Unread: quieter primary tint, one tier down.
        'px-1 bg-[var(--role-primary,#818cf8)]/20 text-[var(--role-primary,#818cf8)]': !props.hot,
      }}
    >
      {props.count > PIP_MAX ? `${PIP_MAX}+` : props.count}
    </span>
  );
}
