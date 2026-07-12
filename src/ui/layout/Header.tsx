// Header — buffer name + kind badge, expandable topic, TLS/lag indicators,
// IRCX channel-info + tools, search / split / user-list toggles, and direct
// voice/video call buttons wired to the media bridge. Solid port of the old
// React Header (call dropdown replaced with dedicated call buttons).

/* eslint-disable solid/no-innerhtml --
   The topic innerHTML is fed exclusively by formatText(), which HTML-escapes
   the raw IRC text before injecting its own markup. */

import { createEffect, createMemo, createSignal, on, Show } from 'solid-js';
import {
  buffersState,
  ConnectionState,
  connectionState,
  isActiveOrochi,
  lag,
  openChannelInfo,
  openModal,
  openServicesPanel,
  setSplitMode,
  settings,
  toggleSearch,
  toggleUserList,
  uiState,
} from '@/state';
import { joinRoom, mediaState, startCall } from '@/state/media';
import { formatText } from '@/lib/irc-classic/formatter';
import { BUFFER_KIND_LABEL, bufferKind, isIrcBuffer } from '@/lib/bufferKind';
import { createMediaQuery } from '@/primitives/mediaQuery';
import { useClickOutside } from '@/primitives/clickOutside';

const LAG_WARN_MS = 500;

export default function Header() {
  const [topicExpanded, setTopicExpanded] = createSignal(false);
  const [ircxOpen, setIrcxOpen] = createSignal(false);
  const isMobile = createMediaQuery('(max-width: 639px)');

  let topicRef: HTMLDivElement | undefined;
  let ircxRef: HTMLDivElement | undefined;

  const entry = () => {
    const ptr = buffersState.activeBuffer;
    return ptr ? buffersState.buffers[ptr] : undefined;
  };
  const bufName = () => entry()?.buffer.shortName || entry()?.buffer.name || '';
  const title = createMemo(() => {
    const raw = entry()?.buffer.title ?? '';
    return raw ? formatText(raw) : '';
  });
  const kind = () => {
    const e = entry();
    return e ? bufferKind(e.buffer) : 'core';
  };
  const isChannel = () => kind() === 'channel';
  const isPrivate = () => kind() === 'query';
  const isIrc = () => isIrcBuffer(kind());
  const chanName = () => entry()?.buffer.localVars['channel'] ?? bufName();
  const serverName = () => entry()?.buffer.localVars['server'] ?? entry()?.buffer.localVars['network'] ?? '';
  const nickCount = () => {
    const e = entry();
    return e && isChannel() ? Object.keys(e.nicks).length : 0;
  };
  const orochi = () => isActiveOrochi();
  const connected = () => connectionState() === ConnectionState.CONNECTED;

  // Live badge — scoped to the buffer the active call belongs to: a room call
  // carries its channel in mediaState.channel; a DM call (channel === null)
  // badges query buffers.
  const liveHere = createMemo(() => {
    if (mediaState.callState !== 'in_call') return false;
    if (mediaState.channel !== null) return isChannel() && mediaState.channel === chanName();
    return isPrivate();
  });

  const canCall = () => connected() && mediaState.callState === 'idle' && isIrc() && (isPrivate() || isChannel());

  // Collapse the topic + menus whenever the active buffer changes
  createEffect(on(() => buffersState.activeBuffer, () => {
    setTopicExpanded(false);
    setIrcxOpen(false);
  }));

  useClickOutside(() => (topicExpanded() ? topicRef : undefined), () => setTopicExpanded(false));
  useClickOutside(() => (ircxOpen() ? ircxRef : undefined), () => setIrcxOpen(false));

  return (
    <header class="darkbear-topbar flex items-center gap-1 sm:gap-3 px-1.5 sm:px-4 h-12 sm:h-14 border-b border-white/[0.07] bg-gray-950/85 backdrop-blur-md shrink-0 relative">
      {/* Buffer name + topic */}
      <div ref={(el) => (topicRef = el)} class="flex-1 min-w-0 flex flex-col justify-center relative">
        <div class="flex items-center gap-1.5 min-w-0">
          <h2 class="text-[15px] sm:text-[16px] font-black tracking-tight text-gray-50 truncate leading-tight">{bufName()}</h2>
          <Show when={serverName()}>
            <span class="hidden sm:inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-[0.14em] bg-white/[0.045] text-gray-500 border border-white/[0.06] shrink-0">
              {serverName()}
            </span>
          </Show>
          <Show when={!isIrc()}>
            <span class="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-white/[0.06] text-gray-500 border border-white/[0.06] shrink-0">
              {BUFFER_KIND_LABEL[kind()]}
            </span>
          </Show>
          <Show when={isChannel() && nickCount() > 0}>
            <span class="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-white/[0.035] text-gray-500 border border-white/[0.05] shrink-0">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
              {nickCount()} users
            </span>
          </Show>
          <Show when={orochi()}>
            <span class="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-[0.14em] bg-[var(--custom-accent,#818cf8)]/[0.08] text-[var(--custom-accent,#818cf8)] border border-[var(--custom-accent,#818cf8)]/15 shrink-0">
              Orochi
            </span>
          </Show>
          <Show when={isChannel() && orochi()}>
            <button
              onClick={() => openChannelInfo(chanName())}
              class="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 transition-colors shrink-0"
              title="Channel info (IRCX PROP + ACCESS)"
              aria-label="Channel info"
            >
              <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="8" cy="8" r="7" />
                <path d="M8 7v5M8 4.5v.5" />
              </svg>
            </button>
          </Show>
          {/* In-call badge */}
          <Show when={liveHere()}>
            <span class="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[9px] font-semibold uppercase tracking-wider shrink-0">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </Show>
        </div>
        <Show when={title()}>
          <button
            onClick={() => setTopicExpanded(!topicExpanded())}
            class="mt-0.5 text-[11px] text-gray-600 sm:text-gray-500 truncate leading-tight max-w-full text-left hover:text-gray-300 transition-colors"
            title={topicExpanded() ? 'Collapse topic' : 'Expand topic'}
          >
            <span innerHTML={title()} />
          </button>
        </Show>
        <Show when={topicExpanded() && title()}>
          <div class="absolute top-full left-0 right-0 mt-1 sm:-ml-3 sm:-mr-3 z-30 animate-slide-down">
            <div class="bg-gray-900 border border-white/[0.08] rounded-xl shadow-xl px-4 py-3 mx-1 sm:mx-0">
              <p class="text-[12px] sm:text-[13px] text-gray-300 leading-relaxed break-words" innerHTML={title()} />
            </div>
          </div>
        </Show>
      </div>

      {/* Right side */}
      <div class="mobile-header-actions flex items-center gap-0.5 sm:gap-2 shrink-0">
        <Show when={connected()}>
          <div class="flex items-center gap-1.5">
            <Show when={settings.relay.tls}>
              <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500/70" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H3.75A1.75 1.75 0 0 0 2 7.75v5.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 13.25v-5.5A1.75 1.75 0 0 0 12.25 6H11V4.5A3.5 3.5 0 0 0 7.5 1h.5zM6 4.5A2 2 0 0 1 8 2.5a2 2 0 0 1 2 2V6H6V4.5z" />
              </svg>
            </Show>
            <Show when={lag() > 0}>
              <span
                class="text-[9px] sm:text-[10px] tabular-nums font-mono"
                classList={{
                  'text-amber-500': lag() > LAG_WARN_MS,
                  'text-gray-600 sm:text-gray-500': lag() <= LAG_WARN_MS,
                }}
              >
                {lag()}ms
              </span>
            </Show>
          </div>
        </Show>

        {/* Call buttons — voice + video, DM call or channel room join */}
        <Show when={canCall()}>
          <button
            onClick={() => (isPrivate() ? startCall(bufName(), false) : joinRoom(chanName(), false))}
            class="w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-[var(--custom-accent,#818cf8)] hover:bg-white/[0.04] active:bg-white/[0.06] transition-all"
            title={isPrivate() ? 'Voice call' : 'Join voice'}
            aria-label={isPrivate() ? 'Voice call' : 'Join voice'}
          >
            <svg class="w-[13px] h-[13px] sm:w-[12px] sm:h-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0014 0" />
              <path d="M12 17v4M8 21h8" />
            </svg>
          </button>
          <button
            onClick={() => (isPrivate() ? startCall(bufName(), true) : joinRoom(chanName(), true))}
            class="w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-emerald-400 hover:bg-white/[0.04] active:bg-white/[0.06] transition-all"
            title={isPrivate() ? 'Video call' : 'Join video'}
            aria-label={isPrivate() ? 'Video call' : 'Join video'}
          >
            <svg class="w-[13px] h-[13px] sm:w-[12px] sm:h-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="2" y="5" width="15" height="14" rx="2" />
              <path d="M17 9l5-3v12l-5-3" />
            </svg>
          </button>
        </Show>

        {/* Channel browser */}
        <Show when={connected()}>
          <button
            onClick={() => openModal('channelList')}
            class="flex h-8 w-8 items-center justify-center gap-1.5 rounded-full px-0 text-[12px] font-semibold text-gray-400 transition-all hover:bg-white/[0.04] hover:text-emerald-300 active:bg-white/[0.06] sm:h-7 sm:w-auto sm:px-2.5 sm:text-[11px]"
            title="Browse channels"
            aria-label="Browse channels"
          >
            <svg class="h-[13px] w-[13px] sm:h-[12px] sm:w-[12px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M5 1 3 15M13 1l-2 14M1 5h14M1 11h14" />
            </svg>
            <span class="hidden md:inline">Channels</span>
          </button>
        </Show>

        {/* IRCX tools menu */}
        <div class="relative" ref={(el) => (ircxRef = el)}>
          <button
            onClick={() => setIrcxOpen(!ircxOpen())}
            class="hidden w-9 h-9 sm:w-7 sm:h-7 sm:flex items-center justify-center rounded-full transition-all"
            classList={{
              'text-[var(--custom-accent,#818cf8)] bg-[var(--custom-accent,#818cf8)]/[0.08]': ircxOpen(),
              'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] active:bg-white/[0.06]': !ircxOpen(),
            }}
            title="IRC tools"
            aria-label="IRC tools"
          >
            <svg class="w-[14px] h-[14px] sm:w-[12px] sm:h-[12px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="13" cy="8" r="1.5" />
            </svg>
          </button>
          <Show when={ircxOpen()}>
            <div class="absolute top-full right-0 mt-1 z-30 bg-gray-900 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden min-w-[170px] animate-slide-down">
              <Show when={orochi()}>
                <button
                  onClick={() => {
                    openServicesPanel('nick');
                    setIrcxOpen(false);
                  }}
                  class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
                >
                  <span class="w-4 h-4 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 text-[var(--custom-accent,#818cf8)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
                      <circle cx="8" cy="8" r="3" />
                    </svg>
                  </span>
                  Services
                </button>
              </Show>
              <button
                onClick={() => {
                  openModal('channelList');
                  setIrcxOpen(false);
                }}
                class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
              >
                <span class="w-4 h-4 flex items-center justify-center shrink-0">
                  <svg class="w-4 h-4 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <path d="M5 1l-2 14M13 1l-2 14M1 5h14M1 11h14" />
                  </svg>
                </span>
                Channel List
              </button>
            </div>
          </Show>
        </div>

        {/* Search toggle */}
        <button
          onClick={() => toggleSearch()}
          class="flex w-8 h-8 sm:w-7 sm:h-7 items-center justify-center rounded-full transition-all"
          classList={{
            'text-[var(--custom-accent,#818cf8)] bg-[var(--custom-accent,#818cf8)]/10': uiState.searchOpen,
            'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] active:bg-white/[0.06]': !uiState.searchOpen,
          }}
          title="Search messages (Ctrl+F)"
          aria-label="Search messages"
        >
          <svg class="w-[13px] h-[13px] sm:w-[12px] sm:h-[12px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M10.5 10.5L14.5 14.5" />
          </svg>
        </button>

        {/* Split pane toggle (desktop) */}
        <Show when={!isMobile()}>
          <button
            onClick={() => setSplitMode(uiState.splitMode === 'none' ? 'vertical' : 'none')}
            class="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-full transition-all"
            classList={{
              'text-[var(--custom-accent,#818cf8)] bg-[var(--custom-accent,#818cf8)]/10': uiState.splitMode !== 'none',
              'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] active:bg-white/[0.06]': uiState.splitMode === 'none',
            }}
            title="Split view (Ctrl+\)"
            aria-label="Toggle split view"
          >
            <svg class="w-[14px] h-[14px] sm:w-[12px] sm:h-[12px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
              <path d="M8 2.5v11" />
            </svg>
          </button>
        </Show>

        {/* User list toggle */}
        <Show when={isChannel()}>
          <button
            onClick={() => toggleUserList()}
            class="flex items-center justify-center gap-1 h-8 w-8 sm:h-7 sm:w-auto px-0 sm:px-2.5 rounded-full text-[12px] sm:text-[11px] font-medium transition-all"
            classList={{
              'bg-[var(--custom-accent,#818cf8)]/10 text-[var(--custom-accent,#818cf8)]': uiState.userListOpen,
              'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] active:bg-white/[0.06]': !uiState.userListOpen,
            }}
          >
            <svg class="w-[13px] h-[13px] sm:w-[12px] sm:h-[12px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <circle cx="6" cy="5" r="2.5" />
              <path d="M1 14c0-3 2-5.5 5-5.5s5 2.5 5 5.5" />
            </svg>
            <Show when={nickCount() > 0}>
              <span class="hidden tabular-nums sm:inline">{nickCount()}</span>
            </Show>
          </button>
        </Show>
      </div>
    </header>
  );
}
