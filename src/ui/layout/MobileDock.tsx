import { createMemo, Show, type JSX } from 'solid-js';
import {
  buffersState,
  closeModal,
  getTotalHighlights,
  getTotalUnread,
  openModal,
  setSidebarOpen,
  setUserListOpen,
  toggleSearch,
  uiState,
} from '@/state';
import { bufferKind } from '@/lib/bufferKind';

const BADGE_MAX = 99;

function badgeValue(value: number): string {
  return value > BADGE_MAX ? `${BADGE_MAX}+` : String(value);
}

function activeIsChannel(): boolean {
  const ptr = buffersState.activeBuffer;
  const entry = ptr ? buffersState.buffers[ptr] : undefined;
  return entry ? bufferKind(entry.buffer) === 'channel' : false;
}

function DockButton(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  hot?: boolean;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      class="mobile-dock-btn relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[9px] font-black uppercase tracking-[0.03em] transition-all disabled:opacity-35"
      classList={{
        'mobile-dock-btn-active text-white': props.active,
        'text-gray-500 active:bg-white/[0.06]': !props.active,
      }}
      aria-label={props.label}
    >
      <span class="relative flex h-4 w-4 items-center justify-center">
        {props.children}
        <Show when={(props.badge ?? 0) > 0}>
          <span
            class="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[8px] font-black leading-none"
            classList={{
              'bg-red-500 text-white': props.hot,
              'bg-[var(--custom-accent,#818cf8)] text-white': !props.hot,
            }}
          >
            {badgeValue(props.badge ?? 0)}
          </span>
        </Show>
      </span>
      <span class="mobile-dock-label">
        <span class="truncate">{props.label}</span>
      </span>
    </button>
  );
}

export default function MobileDock() {
  const unread = createMemo(() => getTotalUnread());
  const mentions = createMemo(() => getTotalHighlights());
  const isChannel = createMemo(() => activeIsChannel());
  const activeName = createMemo(() => {
    const ptr = buffersState.activeBuffer;
    const entry = ptr ? buffersState.buffers[ptr] : undefined;
    return entry?.buffer.shortName || entry?.buffer.name || 'No buffer';
  });

  return (
    <nav class="mobile-dock shrink-0 border-t border-white/[0.07] bg-gray-950/92 px-2 pt-1 backdrop-blur-xl sm:hidden">
      <div class="mobile-dock-context mx-auto mb-1 flex max-w-[520px] items-center gap-2 rounded-xl border border-white/[0.055] bg-black/20 px-2.5 py-1.5">
        <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--custom-accent,#818cf8)]" />
        <span class="min-w-0 flex-1 truncate text-[11px] font-bold text-gray-300">{activeName()}</span>
        <Show when={mentions() > 0 || unread() > 0}>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none"
            classList={{
              'bg-red-500 text-white': mentions() > 0,
              'bg-[var(--custom-accent,#818cf8)]/20 text-[var(--custom-accent,#818cf8)]': mentions() === 0,
            }}
          >
            {mentions() > 0 ? `${badgeValue(mentions())}@` : badgeValue(unread())}
          </span>
        </Show>
      </div>
      <div class="mx-auto grid max-w-[520px] grid-cols-5 gap-1 rounded-xl border border-white/[0.07] bg-black/25 p-0.5 shadow-2xl shadow-black/30">
        <DockButton
          label="Buffers"
          active={uiState.sidebarOpen}
          badge={mentions() > 0 ? mentions() : unread()}
          hot={mentions() > 0}
          onClick={() => {
            closeModal();
            setUserListOpen(false);
            setSidebarOpen(!uiState.sidebarOpen);
          }}
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
            <path d="M2 4h12M2 8h8M2 12h11" />
          </svg>
        </DockButton>

        <DockButton
          label="Search"
          active={uiState.searchOpen}
          onClick={() => {
            closeModal();
            setSidebarOpen(false);
            setUserListOpen(false);
            toggleSearch();
          }}
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10l4 4" />
          </svg>
        </DockButton>

        <DockButton
          label="Channels"
          active={uiState.activeModal === 'channelList'}
          onClick={() => {
            setSidebarOpen(false);
            setUserListOpen(false);
            openModal('channelList');
          }}
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M5 1 3 15M13 1l-2 14M1 5h14M1 11h14" />
          </svg>
        </DockButton>

        <DockButton
          label="Users"
          active={uiState.userListOpen}
          disabled={!isChannel()}
          onClick={() => {
            closeModal();
            setSidebarOpen(false);
            setUserListOpen(!uiState.userListOpen);
          }}
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <circle cx="6" cy="5" r="2.4" />
            <path d="M1.5 14c.4-3.1 2.1-5 4.5-5s4.1 1.9 4.5 5" />
            <path d="M11 6.8c1.7.4 2.9 1.9 3.2 4.2" />
          </svg>
        </DockButton>

        <DockButton
          label="Settings"
          active={uiState.activeModal === 'settings'}
          onClick={() => {
            setSidebarOpen(false);
            setUserListOpen(false);
            openModal('settings');
          }}
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="2.4" />
            <path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1" />
          </svg>
        </DockButton>
      </div>
    </nav>
  );
}
