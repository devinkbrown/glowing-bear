// UserList — right-hand nicklist panel with tier grouping, filtering and a
// per-nick action popup (message / whois / profile / whisper / calls / oper
// kick+ban with confirm).

import { createSignal, createMemo, createEffect, onCleanup, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import {
  buffersState, NICK_TIER_ORDER, settings,
  openQuery, sendInput, isOperBuffer,
  isActiveOrochi, isBot, openUserProfile, sendWhisper,
} from '@/state';
import type { WeeChatNick } from '@/types';
import { mediaState, startCall } from '@/state/media';
import { nickColor } from '@/lib/nickcolor';

const TIER_ICONS: Record<string, { icon: string; label: string }> = {
  Operator: { icon: 'star', label: 'Operator' },
  Founder: { icon: 'crown', label: 'Founder' },
  Owner: { icon: 'crown', label: 'Owner' },
  Admin: { icon: 'bolt', label: 'Admin' },
  Op: { icon: 'shield', label: 'Op' },
  Halfop: { icon: 'halfshield', label: 'Half-Op' },
  Voice: { icon: 'mic', label: 'Voice' },
  Regular: { icon: '', label: 'Regular' },
};

const TIER_SIGILS_FALLBACK: Record<string, string> = {
  Operator: '*', Founder: '!', Owner: '.', Admin: '&', Op: '@', Halfop: '%', Voice: '+', Regular: '',
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

function tierAccent(label: string): string {
  switch (label) {
    case 'Operator': return '#fb7185'; // rose — network staff (orochi *)
    case 'Founder': return '#f59e0b';  // amber-gold — orochi founder (!)
    case 'Owner': return '#f87171';
    case 'Admin': return '#c084fc';
    case 'Op': return '#4ade80';
    case 'Halfop': return '#60a5fa';
    case 'Voice': return '#fbbf24';
    default: return 'var(--custom-accent, #818cf8)';
  }
}

export default function UserList(props: Props) {
  const [filter, setFilter] = createSignal('');
  const [collapsedGroups, setCollapsedGroups] = createSignal<Record<string, boolean>>({});
  const [actionPopup, setActionPopup] = createSignal<NickAction | null>(null);
  const [confirming, setConfirming] = createSignal<'kick' | 'ban' | null>(null);

  let popupEl: HTMLDivElement | undefined;
  let filterEl: HTMLInputElement | undefined;

  const entry = createMemo(() => {
    const active = buffersState.activeBuffer;
    return active ? buffersState.buffers[active] : undefined;
  });

  const totalNicks = createMemo(() => {
    const e = entry();
    if (!e) return 0;
    return Object.values(e.nicks).filter((n) => !n.group && n.visible).length;
  });

  const filteredGroups = createMemo<[string, WeeChatNick[]][]>(() => {
    const e = entry();
    if (!e) return [];
    const fq = filter().trim().toLowerCase();
    const groups = e.nickGroups;
    const out: [string, WeeChatNick[]][] = [];
    const seen = new Set<string>();
    const push = (label: string): void => {
      seen.add(label);
      const nicks = groups[label];
      if (!nicks || nicks.length === 0) return;
      const filtered = fq ? nicks.filter((n) => n.name.toLowerCase().includes(fq)) : nicks;
      if (filtered.length > 0) out.push([label, filtered]);
    };
    for (const tier of NICK_TIER_ORDER) push(tier);
    for (const label of Object.keys(groups)) {
      if (!seen.has(label)) push(label);
    }
    return out;
  });

  const popupTier = createMemo(() => {
    const p = actionPopup();
    const e = entry();
    if (!p || !e) return 'User';
    for (const [label, nicks] of Object.entries(e.nickGroups)) {
      if (label !== 'Regular' && nicks.some((n) => n.name === p.nick)) return label;
    }
    return 'User';
  });

  const canModerate = createMemo(() => {
    const active = buffersState.activeBuffer;
    return active ? isOperBuffer(active) : false;
  });

  const toggleGroup = (label: string): void => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const closePopup = (): void => {
    setActionPopup(null);
    setConfirming(null);
  };

  // Click-outside dismissal for the action popup.
  createEffect(() => {
    if (!actionPopup()) return;
    const handler = (ev: MouseEvent): void => {
      if (popupEl && !popupEl.contains(ev.target as Node)) closePopup();
    };
    document.addEventListener('mousedown', handler);
    onCleanup(() => document.removeEventListener('mousedown', handler));
  });

  const handleNickClick = (nick: string, ev: MouseEvent): void => {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    setConfirming(null);
    // The user list is right-docked, so anchor the popup to the row's LEFT edge
    // and let it grow leftward (see the style block) — opening rightward would
    // push it off the right edge of the screen.
    setActionPopup({ nick, x: rect.left, y: rect.top });
  };

  const doAction = (action: string): void => {
    const popup = actionPopup();
    if (!popup) return;
    const { nick } = popup;

    // Destructive actions arm a confirm step first.
    if (action === 'kick' || action === 'ban') {
      if (confirming() !== action) {
        setConfirming(action);
        return;
      }
      closePopup();
      sendInput(action === 'kick' ? `/kick ${nick}` : `/ban ${nick}`);
      return;
    }

    closePopup();
    switch (action) {
      case 'query':
        openQuery(nick);
        props.onClose?.();
        break;
      case 'whois':
        sendInput(`/whois ${nick}`);
        break;
      case 'profile':
        openUserProfile(nick);
        break;
      case 'whisper': {
        const ch = entry()?.buffer.localVars['channel'];
        if (ch) {
          const msg = prompt(`Whisper to ${nick} in ${ch}:`);
          if (msg) sendWhisper(ch, nick, msg);
        }
        break;
      }
      case 'video':
        startCall(nick, true);
        props.onClose?.();
        break;
      case 'voice':
        startCall(nick, false);
        props.onClose?.();
        break;
    }
  };

  return (
    <Show when={entry()}>
      <aside class={`${props.mobile ? 'w-full' : 'w-[220px]'} shrink-0 flex flex-col h-full border-l border-white/[0.04] bg-gray-950 relative`}>
        {/* Header */}
        <div
          class="flex items-center h-11 sm:h-12 px-3 sm:px-3 border-b border-white/[0.04] shrink-0"
          style={props.mobile ? { 'padding-top': 'env(safe-area-inset-top)' } : undefined}
        >
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <svg class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[var(--custom-accent,#818cf8)] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <circle cx="6" cy="5" r="3" /><circle cx="11" cy="6" r="2.5" /><path d="M1 14c0-3 2-4.5 5-4.5" /><path d="M9 14c0-2.5 1.5-3.5 4-3.5" />
            </svg>
            <span class="text-[13px] sm:text-[12px] font-semibold text-gray-200 truncate">Users</span>
          </div>
          <span class="text-[11px] sm:text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[var(--custom-accent,#818cf8)]">{totalNicks()}</span>
          <Show when={props.mobile && props.onClose}>
            <button
              onClick={() => props.onClose?.()}
              class="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-200 active:bg-white/[0.06] -mr-1 ml-1"
              aria-label="Close"
            >
              <svg class="w-[18px] h-[18px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </Show>
        </div>

        {/* Search */}
        <div class="px-2 sm:px-2 pt-2 pb-1 shrink-0">
          <div class="relative">
            <svg class="absolute left-2.5 sm:left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-3 sm:h-3 text-gray-600 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="6.5" cy="6.5" r="4.5" /><path d="M10 10l4 4" />
            </svg>
            <input
              ref={(el) => { filterEl = el; }}
              type="text"
              value={filter()}
              onInput={(e) => setFilter(e.currentTarget.value)}
              placeholder="Search users..."
              autocomplete="off"
              spellcheck={false}
              onKeyDown={(e) => { if (e.key === 'Escape') { setFilter(''); filterEl?.blur(); } }}
              class="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-[13px] sm:text-[11px] text-gray-300 placeholder-gray-600 pl-8 sm:pl-7 pr-3 py-2 sm:py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/30 focus:bg-white/[0.04] transition-all"
            />
            <Show when={filter()}>
              <button
                onClick={() => { setFilter(''); filterEl?.focus(); }}
                class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 transition-colors"
              >
                <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </Show>
          </div>
        </div>

        {/* Nick list */}
        <div class="flex-1 overflow-y-auto px-1.5 sm:px-1 pt-1 pb-2 nicklist-scroll">
          <For each={filteredGroups()}>
            {([label, nicks]) => {
              const isCollapsed = (): boolean => !!collapsedGroups()[label];
              const accent = tierAccent(label);
              const tierInfo = TIER_ICONS[label];
              return (
                <div class="mb-1">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(label)}
                    class="w-full flex items-center gap-1.5 px-2 py-2 sm:py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.02] active:bg-white/[0.04] transition-all group"
                  >
                    <svg
                      class={`w-[9px] h-[9px] sm:w-[8px] sm:h-[8px] shrink-0 transition-transform duration-150 ${isCollapsed() ? '-rotate-90' : ''}`}
                      style={{ color: accent }}
                      viewBox="0 0 8 8" fill="currentColor"
                    >
                      <path d="M1 2l3 3.5L7 2z" />
                    </svg>
                    <Show when={tierInfo?.icon}>
                      <TierIcon icon={tierInfo?.icon ?? ''} accent={accent} />
                    </Show>
                    <span class="text-[11px] sm:text-[10px] font-bold uppercase tracking-[0.08em] flex-1 text-left" style={{ color: accent }}>
                      {label}
                    </span>
                    <span class="text-[10px] sm:text-[9px] tabular-nums font-mono px-1.5 py-0.5 rounded bg-white/[0.03] text-gray-500 group-hover:text-gray-400 transition-colors">
                      {nicks.length}
                    </span>
                  </button>

                  {/* Nick entries */}
                  <Show when={!isCollapsed()}>
                    <div class="ml-1 sm:ml-0.5 border-l border-white/[0.03] pl-1 sm:pl-0.5">
                      <For each={nicks}>
                        {(nick) => {
                          const isActive = (): boolean => actionPopup()?.nick === nick.name;
                          const color = (): string | undefined => (settings.colorNicks ? nickColor(nick.name) : undefined);
                          const initials = nick.name.slice(0, 2).toUpperCase();
                          const sigil = nick.prefix.trim() || TIER_SIGILS_FALLBACK[label] || '';
                          return (
                            <button
                              onClick={(e) => handleNickClick(nick.name, e)}
                              class={`w-full flex items-center gap-2 sm:gap-1.5 px-1.5 sm:px-1 py-1.5 sm:py-[4px] rounded-lg sm:rounded-md text-[14px] sm:text-[12px] transition-all
                                ${isActive()
                                  ? 'bg-[var(--custom-accent,#818cf8)]/[0.08] text-gray-100'
                                  : 'text-gray-400 hover:bg-white/[0.03] hover:text-gray-200 active:bg-white/[0.06]'}`}
                              title={nick.name}
                            >
                              {/* Avatar */}
                              <div
                                class="w-7 h-7 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] sm:text-[7px] font-bold relative"
                                style={{
                                  background: color() ? `${color()}18` : 'rgba(255,255,255,0.04)',
                                  color: color() ?? 'var(--custom-accent, #818cf8)',
                                }}
                              >
                                {initials}
                                {/* Tier badge */}
                                <Show when={sigil}>
                                  <span
                                    class="absolute -top-0.5 -right-0.5 w-3 h-3 sm:w-2.5 sm:h-2.5 rounded-full flex items-center justify-center text-[7px] sm:text-[6px] font-bold leading-none"
                                    style={{ background: accent, color: '#000' }}
                                  >
                                    {sigil}
                                  </span>
                                </Show>
                              </div>
                              {/* Name + bot badge */}
                              <span class="truncate flex-1 text-left leading-tight flex items-center gap-1" style={color() ? { color: color() } : undefined}>
                                {nick.name}
                                <Show when={isBot(nick.name)}>
                                  <span class="inline-flex px-1 py-px rounded text-[7px] sm:text-[6px] font-bold uppercase tracking-wider bg-[var(--custom-accent,#818cf8)]/15 text-[var(--custom-accent,#818cf8)] border border-[var(--custom-accent,#818cf8)]/20 leading-none shrink-0">
                                    BOT
                                  </span>
                                </Show>
                              </span>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>

          <Show when={filteredGroups().length === 0}>
            <div class="flex flex-col items-center justify-center py-8 gap-2">
              <svg class="w-8 h-8 text-gray-700" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">
                <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3 3-5 6-5s6 2 6 5" />
              </svg>
              <span class="text-[11px] text-gray-600">
                {filter() ? 'No matches' : 'No users'}
              </span>
            </div>
          </Show>
        </div>

        {/* Nick action popup */}
        <Show when={actionPopup()}>
          {(popup) => (
            <div
              ref={(el) => { popupEl = el; }}
              class="fixed z-[100] animate-fade-up"
              style={{
                // Mobile: centered. Desktop: anchor the popup's RIGHT edge just
                // left of the nick row so it stays on-screen next to the
                // right-docked list. Vertically clamped into the viewport.
                left: props.mobile ? '50%' : 'auto',
                right: props.mobile ? 'auto' : `${Math.max(8, window.innerWidth - popup().x + 4)}px`,
                top: `${Math.max(8, Math.min(popup().y, window.innerHeight - 300))}px`,
                transform: props.mobile ? 'translateX(-50%)' : undefined,
              }}
            >
              <div
                class="bg-gray-900 border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden min-w-[180px] backdrop-blur-sm"
                style={{ 'box-shadow': '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)' }}
              >
                {/* Popup header with avatar */}
                <div class="px-4 py-3 border-b border-white/[0.04] flex items-center gap-3">
                  <div
                    class="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{
                      background: `${nickColor(popup().nick)}20`,
                      color: nickColor(popup().nick),
                      'box-shadow': `0 0 12px ${nickColor(popup().nick)}15`,
                    }}
                  >
                    {popup().nick.slice(0, 2).toUpperCase()}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-semibold text-gray-100 truncate">{popup().nick}</div>
                    <div class="text-[10px] text-gray-500">{popupTier()}</div>
                  </div>
                </div>
                <div class="py-1.5">
                  <PopupBtn icon="msg" label="Message" onClick={() => doAction('query')} />
                  <PopupBtn icon="whois" label="Whois" onClick={() => doAction('whois')} />
                  <Show when={isActiveOrochi()}>
                    <PopupBtn icon="profile" label="Profile" onClick={() => doAction('profile')} />
                  </Show>
                  <Show when={isActiveOrochi() && entry()?.buffer.localVars['type'] === 'channel'}>
                    <PopupBtn icon="whisper" label="Whisper" onClick={() => doAction('whisper')} />
                  </Show>
                  <Show when={mediaState.callState === 'idle'}>
                    <div class="h-px bg-white/[0.04] mx-3 my-1" />
                    <PopupBtn icon="video" label="Video call" onClick={() => doAction('video')} accent="emerald" />
                    <PopupBtn icon="voice" label="Voice call" onClick={() => doAction('voice')} accent="custom" />
                  </Show>
                  <Show when={canModerate()}>
                    <div class="h-px bg-white/[0.04] mx-3 my-1" />
                    <PopupBtn icon="kick" label={confirming() === 'kick' ? 'Confirm Kick?' : 'Kick'} onClick={() => doAction('kick')} danger />
                    <PopupBtn icon="ban" label={confirming() === 'ban' ? 'Confirm Ban?' : 'Ban'} onClick={() => doAction('ban')} danger />
                  </Show>
                </div>
              </div>
            </div>
          )}
        </Show>

        <style>{`
          .nicklist-scroll::-webkit-scrollbar { width: 4px; }
          .nicklist-scroll::-webkit-scrollbar-track { background: transparent; }
          .nicklist-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }
          .nicklist-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }
        `}</style>
      </aside>
    </Show>
  );
}

function TierIcon(props: { icon: string; accent: string }): JSX.Element {
  const cls = 'w-[9px] h-[9px] sm:w-[8px] sm:h-[8px] shrink-0';
  return (
    <>
      <Show when={props.icon === 'star'}>
        <svg class={cls} style={{ color: props.accent }} viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1l2 4.5 5 .5-3.7 3.3 1.1 4.9L8 11.8 3.6 14.2l1.1-4.9L1 6l5-.5z" />
        </svg>
      </Show>
      <Show when={props.icon === 'crown'}>
        <svg class={cls} style={{ color: props.accent }} viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 12h12l1-7-4 3-3-5-3 5-4-3z" />
        </svg>
      </Show>
      <Show when={props.icon === 'bolt'}>
        <svg class={cls} style={{ color: props.accent }} viewBox="0 0 16 16" fill="currentColor">
          <path d="M9 1L3 9h5l-1 6 6-8H8z" />
        </svg>
      </Show>
      <Show when={props.icon === 'shield'}>
        <svg class={cls} style={{ color: props.accent }} viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1L2 4v4c0 3 2.5 5.5 6 7 3.5-1.5 6-4 6-7V4z" />
        </svg>
      </Show>
      <Show when={props.icon === 'halfshield'}>
        <svg class={cls} style={{ color: props.accent }} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 1L2 4v4c0 3 2.5 5.5 6 7V1z" fill="currentColor" stroke="none" />
          <path d="M8 1l6 3v4c0 3-2.5 5.5-6 7" />
        </svg>
      </Show>
      <Show when={props.icon === 'mic'}>
        <svg class={cls} style={{ color: props.accent }} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="5" y="1" width="6" height="9" rx="3" /><path d="M3 8a5 5 0 0010 0M8 13v2" />
        </svg>
      </Show>
    </>
  );
}

function PopupBtn(props: { icon: string; label: string; onClick: () => void; danger?: boolean; accent?: string }): JSX.Element {
  const accentClass = (): string =>
    props.accent === 'emerald' ? 'text-emerald-400' : props.accent === 'custom' ? 'text-[var(--custom-accent,#818cf8)]' : '';
  return (
    <button
      onClick={() => props.onClick()}
      class={`w-full flex items-center gap-3 px-4 py-2.5 sm:py-2 text-[13px] sm:text-[12px] transition-all rounded-lg mx-0
        ${props.danger ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/15' : `${accentClass() || 'text-gray-300'} hover:bg-white/[0.04] active:bg-white/[0.08]`}`}
    >
      <span class="w-4 h-4 flex items-center justify-center shrink-0">
        <Show when={props.icon === 'msg'}>
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M2 3h12v8H5l-3 3V3z" />
          </svg>
        </Show>
        <Show when={props.icon === 'whois'}>
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="8" cy="5" r="3" /><path d="M3 14c0-3 2-5 5-5s5 2 5 5" />
          </svg>
        </Show>
        <Show when={props.icon === 'kick'}>
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M2 14l6-6m0 0L14 2M8 8l6 6M8 8L2 2" />
          </svg>
        </Show>
        <Show when={props.icon === 'video'}>
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="2" y="5" width="15" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3" />
          </svg>
        </Show>
        <Show when={props.icon === 'voice'}>
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0" /><path d="M12 17v4M8 21h8" />
          </svg>
        </Show>
        <Show when={props.icon === 'ban'}>
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="6" /><path d="M3.5 3.5l9 9" stroke-linecap="round" />
          </svg>
        </Show>
        <Show when={props.icon === 'profile'}>
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <rect x="3" y="1" width="10" height="14" rx="2" /><circle cx="8" cy="5.5" r="2" /><path d="M5 12c0-1.5 1.5-2.5 3-2.5s3 1 3 2.5" />
          </svg>
        </Show>
        <Show when={props.icon === 'whisper'}>
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M2 3h12v7H6l-4 3V3z" /><path d="M5 6h6M5 8h4" />
          </svg>
        </Show>
      </span>
      {props.label}
    </button>
  );
}
