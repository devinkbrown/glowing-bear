import { ErrorBoundary, Show, createEffect, createMemo, onCleanup, onMount } from 'solid-js';
import {
  settings,
  buffersState,
  clearUnread,
  getTotalHighlights,
  getTotalUnread,
  connectionState,
  setActive,
  uiState,
  openModal,
  closeModal,
  setSidebarOpen,
  setUserListOpen,
  setOperConsoleOpen,
  setSplitMode,
  ircxState,
  closeChannelInfo,
  closeUserProfile,
  closeServicesPanel,
  applyTheme,
} from '@/state';
import { connectModalAction } from '@/state/connectModalPolicy';
import { mediaState } from '@/state/media';
import { markRead } from '@/state/bridge';
import { initBridge } from '@/core/bridge';
import { updateTitle } from '@/lib/notifications';

import { createMediaQuery } from '@/primitives/mediaQuery';
import { setupViewportHeight } from '@/primitives/viewportHeight';
import { setupKeyboardShortcuts } from '@/primitives/keyboard';
import { setupFaviconBadge } from '@/primitives/faviconBadge';
import { createSwipeGesture } from '@/primitives/swipe';

import ThemeBg, { type ThemeName } from '@/ui/bits/ThemeBg';
import StarfieldBg from '@/ui/bits/StarfieldBg';
import Sidebar from '@/ui/layout/Sidebar';
import Header from '@/ui/layout/Header';
import MobileDock from '@/ui/layout/MobileDock';
import MessageView from '@/ui/chat/MessageView';
import TypingIndicator from '@/ui/chat/TypingIndicator';
import InputBar from '@/ui/input/InputBar';
import UserList from '@/ui/panels/UserList';
import ChannelInfoPanel from '@/ui/panels/ChannelInfoPanel';
import ServicesPanel from '@/ui/panels/ServicesPanel';
import UserProfileCard from '@/ui/panels/UserProfileCard';
import ChannelListModal from '@/ui/panels/ChannelListModal';
import OperConsole from '@/ui/panels/OperConsole';
import ConnectModal from '@/ui/modals/ConnectModal';
import SettingsModal from '@/ui/modals/SettingsModal';
import HelpModal from '@/ui/modals/HelpModal';
import AboutModal from '@/ui/modals/AboutModal';
import BufferSwitcher from '@/ui/modals/BufferSwitcher';
import VideoRoom from '@/ui/media/VideoRoom';
import CallNotification from '@/ui/media/CallNotification';

const CUSTOM_COLOR_VARS: Array<[keyof typeof import('@/types').DEFAULT_CUSTOM_COLORS, string]> = [
  ['gray950', '--color-gray-950'],
  ['gray900', '--color-gray-900'],
  ['gray800', '--color-gray-800'],
  ['gray700', '--color-gray-700'],
  ['gray600', '--color-gray-600'],
  ['gray500', '--color-gray-500'],
  ['gray400', '--color-gray-400'],
  ['gray300', '--color-gray-300'],
  ['gray200', '--color-gray-200'],
  ['gray100', '--color-gray-100'],
  ['gray50', '--color-gray-50'],
];

const SHEET_DISMISS_PX = 72;

function setupServiceWorkerRefresh(): () => void {
  if (!('serviceWorker' in navigator)) return () => undefined;
  let reloaded = false;
  const onControllerChange = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  navigator.serviceWorker
    .register('/darkbear/sw.js', { scope: '/darkbear/' })
    .then((reg) => {
      void reg.update();
    })
    .catch(() => undefined);
  return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
}

export default function App() {
  const isDesktop = createMediaQuery('(min-width: 1024px)');
  let sheetDrag: { startY: number; currentY: number; sheet: HTMLElement } | null = null;

  const beginSheetDrag = (ev: TouchEvent & { currentTarget: HTMLElement }): void => {
    const target = ev.target as HTMLElement | null;
    if (!target?.closest('.mobile-sheet-grip')) return;
    const touch = ev.touches[0];
    if (!touch) return;
    sheetDrag = { startY: touch.clientY, currentY: 0, sheet: ev.currentTarget };
    ev.currentTarget.style.transition = 'none';
  };

  const moveSheetDrag = (ev: TouchEvent): void => {
    if (!sheetDrag) return;
    const touch = ev.touches[0];
    if (!touch) return;
    const delta = Math.max(0, touch.clientY - sheetDrag.startY);
    sheetDrag.currentY = delta;
    sheetDrag.sheet.style.transform = `translateY(${delta}px)`;
    if (delta > 4) ev.preventDefault();
  };

  const endSheetDrag = (close: () => void): void => {
    if (!sheetDrag) return;
    const { currentY, sheet } = sheetDrag;
    sheetDrag = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (currentY >= SHEET_DISMISS_PX) close();
  };

  onMount(() => {
    applyTheme();
    initBridge();
    onCleanup(setupViewportHeight());
    onCleanup(setupKeyboardShortcuts());
    onCleanup(setupFaviconBadge(() => getTotalHighlights()));
    onCleanup(setupServiceWorkerRefresh());

    // Notification click → jump to the originating buffer.
    const onJump = (ev: Event) => {
      const ptr = (ev as CustomEvent<string>).detail;
      if (ptr && buffersState.buffers[ptr]) setActive(ptr);
    };
    window.addEventListener('jump-to-buffer', onJump);
    onCleanup(() => window.removeEventListener('jump-to-buffer', onJump));

    // Mark active buffer read when the window regains focus.
    const onFocus = () => {
      if (!settings.readOnFocus) return;
      const ptr = buffersState.activeBuffer;
      if (ptr) {
        clearUnread(ptr);
        markRead(ptr);
        updateTitle(getTotalHighlights(), getTotalUnread());
      }
    };
    window.addEventListener('focus', onFocus);
    onCleanup(() => window.removeEventListener('focus', onFocus));
  });

  // Mobile swipe: right opens sidebar / closes user list; left closes sidebar / opens user list.
  createSwipeGesture(() => window, {
    edgePx: 40,
    onSwipeRight: () => {
      if (isDesktop()) return;
      if (uiState.userListOpen) setUserListOpen(false);
      else setSidebarOpen(true);
    },
    onSwipeLeft: () => {
      if (isDesktop()) return;
      if (uiState.sidebarOpen) setSidebarOpen(false);
      else setUserListOpen(true);
    },
  });

  // Cross-device read sync on buffer activation.
  createEffect(() => {
    const ptr = buffersState.activeBuffer;
    if (ptr) markRead(ptr);
  });

  // Split panes are a desktop affordance; on phones they steal the message
  // column and make the keyboard path feel broken.
  createEffect(() => {
    if (!isDesktop() && uiState.splitMode !== 'none') setSplitMode('none');
  });

  // Connect modal follows the relay state (see connectModalPolicy): close it
  // once connected, re-open it when the relay drops with nothing else open.
  createEffect(() => {
    const action = connectModalAction(connectionState(), uiState.activeModal);
    if (action === 'close') closeModal();
    else if (action === 'open') openModal('connect');
  });

  // Custom-theme palette → CSS variables on <html>.
  createEffect(() => {
    const rootStyle = document.documentElement.style;
    if (settings.theme === 'custom') {
      for (const [key, cssVar] of CUSTOM_COLOR_VARS) rootStyle.setProperty(cssVar, settings.customColors[key]);
      rootStyle.setProperty('--custom-accent', settings.customColors.accent);
    } else {
      for (const [, cssVar] of CUSTOM_COLOR_VARS) rootStyle.removeProperty(cssVar);
      rootStyle.setProperty('--custom-accent', settings.customColors.accent);
    }
  });

  // Typography / layout CSS variables.
  createEffect(() => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--app-font-size', `${settings.fontSize}px`);
    rootStyle.setProperty('--sidebar-w', `${settings.sidebarWidth}px`);
  });

  // User CSS injection.
  let customStyleEl: HTMLStyleElement | undefined;
  createEffect(() => {
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.dataset.darkbear = 'custom-css';
      document.head.appendChild(customStyleEl);
    }
    customStyleEl.textContent = settings.customCSS;
  });
  onCleanup(() => customStyleEl?.remove());

  const activePtr = () => buffersState.activeBuffer;
  const splitPtr = createMemo(() => {
    if (uiState.splitMode === 'none') return null;
    return uiState.splitBuffer ?? buffersState.activeBuffer;
  });
  const splitEntry = () => (splitPtr() ? buffersState.buffers[splitPtr()!] : undefined);

  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div class="flex h-screen w-full flex-col items-center justify-center gap-4 bg-gray-950 text-gray-200">
          <div class="text-lg font-semibold">Something went wrong</div>
          <pre class="max-w-xl overflow-auto rounded bg-gray-900 p-4 text-xs text-red-400">{String(err)}</pre>
          <button class="rounded bg-gray-800 px-4 py-2 hover:bg-gray-700" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    >
      <div class="relative flex h-[var(--vh,100dvh)] w-full overflow-hidden bg-gray-950 text-gray-200">
        {/* Theme background layers */}
        <Show when={settings.animateThemes && settings.theme !== 'custom' && !settings.bgImage}>
          <Show when={settings.theme === 'starfield'} fallback={<ThemeBg theme={settings.theme as ThemeName} />}>
            <StarfieldBg />
          </Show>
        </Show>
        <Show when={settings.bgImage}>
          <div
            class="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
            style={{
              'background-image': `url(${settings.bgImage})`,
              opacity: String(settings.bgOpacity / 100),
              filter: settings.bgBlur > 0 ? `blur(${settings.bgBlur}px)` : undefined,
            }}
          />
          <Show when={settings.bgTint}>
            <div
              class="pointer-events-none fixed inset-0 z-0"
              style={{ 'background-color': settings.bgTint, opacity: String(settings.bgTintOpacity / 100) }}
            />
          </Show>
        </Show>

        {/* Sidebar — static on desktop, overlay drawer on mobile */}
        <Show
          when={isDesktop()}
          fallback={
            <>
              <Show when={uiState.sidebarOpen}>
                <div class="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
              </Show>
              <aside
                class="mobile-sheet mobile-buffer-sheet fixed bottom-0 left-0 right-0 z-50 flex h-[min(84vh,780px)] transform flex-col overflow-hidden rounded-t-3xl border-t border-white/[0.08] transition-transform duration-200"
                classList={{ 'translate-y-full': !uiState.sidebarOpen, 'translate-y-0': uiState.sidebarOpen }}
                onTouchStart={beginSheetDrag}
                onTouchMove={moveSheetDrag}
                onTouchEnd={() => endSheetDrag(() => setSidebarOpen(false))}
                onTouchCancel={() => endSheetDrag(() => undefined)}
              >
                <button
                  type="button"
                  class="mobile-sheet-grip"
                  aria-label="Close buffers panel"
                  onClick={() => setSidebarOpen(false)}
                />
                <div class="mobile-sheet-head">
                  <div>
                    <p class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">Navigation</p>
                    <h2 class="text-[16px] font-black tracking-tight text-gray-50">Buffers</h2>
                  </div>
                  <button
                    type="button"
                    class="mobile-sheet-close"
                    aria-label="Close buffers panel"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
                <div class="min-h-0 flex-1">
                  <Sidebar onSelect={() => setSidebarOpen(false)} />
                </div>
              </aside>
            </>
          }
        >
          <aside class="relative z-10 h-full w-[var(--sidebar-w,240px)] shrink-0">
            <Sidebar />
          </aside>
        </Show>

        {/* Main column */}
        <main class="relative z-10 flex h-full min-w-0 flex-1 flex-col">
          <Header />
          <div
            class="flex min-h-0 flex-1"
            classList={{ 'flex-col': uiState.splitMode === 'horizontal', 'flex-row': uiState.splitMode !== 'horizontal' }}
          >
            <section class="flex min-h-0 min-w-0 flex-1 flex-col">
              <Show
                when={activePtr()}
                fallback={
                  <div class="flex flex-1 items-center justify-center text-sm text-gray-500">
                    Connect to your WeeChat relay to get started
                  </div>
                }
              >
                {(ptr) => <MessageView bufferPtr={ptr()} />}
              </Show>
            </section>
            <Show when={uiState.splitMode !== 'none' && splitPtr()}>
              {(ptr) => (
                <section
                  class="flex min-h-0 min-w-0 flex-1 flex-col"
                  classList={{
                    'border-l border-gray-800/70': uiState.splitMode === 'vertical',
                    'border-t border-gray-800/70': uiState.splitMode === 'horizontal',
                  }}
                >
                  <div class="flex items-center justify-between border-b border-gray-800/70 bg-gray-900/40 px-3 py-1 text-xs text-gray-400">
                    <span class="truncate">
                      {splitEntry()?.buffer.shortName || splitEntry()?.buffer.name || 'split'}
                    </span>
                    <button
                      class="rounded px-1.5 py-0.5 hover:bg-gray-800 hover:text-gray-200"
                      title="Close split"
                      onClick={() => setSplitMode('none')}
                    >
                      ✕
                    </button>
                  </div>
                  <MessageView bufferPtr={ptr()} />
                </section>
              )}
            </Show>
          </div>
          <Show when={activePtr()}>
            {(ptr) => (
              <>
                <TypingIndicator bufferPtr={ptr()} />
                <Show when={!isDesktop()}>
                  <MobileDock />
                </Show>
                <InputBar />
              </>
            )}
          </Show>
        </main>

        {/* User list — desktop drawer / mobile overlay */}
        <Show when={uiState.userListOpen}>
          <Show
            when={isDesktop()}
            fallback={
              <>
                <div class="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setUserListOpen(false)} />
                <aside
                  class="mobile-sheet fixed bottom-0 left-0 right-0 z-50 flex h-[min(72vh,660px)] flex-col overflow-hidden rounded-t-3xl border-t border-white/[0.08]"
                  onTouchStart={beginSheetDrag}
                  onTouchMove={moveSheetDrag}
                  onTouchEnd={() => endSheetDrag(() => setUserListOpen(false))}
                  onTouchCancel={() => endSheetDrag(() => undefined)}
                >
                  <button
                    type="button"
                    class="mobile-sheet-grip"
                    aria-label="Close users panel"
                    onClick={() => setUserListOpen(false)}
                  />
                  <div class="mobile-sheet-head">
                    <div>
                      <p class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">Channel</p>
                      <h2 class="text-[16px] font-black tracking-tight text-gray-50">Users</h2>
                    </div>
                    <button
                      type="button"
                      class="mobile-sheet-close"
                      aria-label="Close users panel"
                      onClick={() => setUserListOpen(false)}
                    >
                      <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>
                  <div class="min-h-0 flex-1">
                    <UserList mobile onClose={() => setUserListOpen(false)} />
                  </div>
                </aside>
              </>
            }
          >
            <aside class="relative z-10 h-full w-[240px] shrink-0 border-l border-gray-800/70">
              <UserList />
            </aside>
          </Show>
        </Show>

        {/* Media surfaces */}
        <Show when={mediaState.callState !== 'idle'}>
          <VideoRoom />
        </Show>
        <CallNotification />

        {/* Modals */}
        <ConnectModal open={uiState.activeModal === 'connect'} onClose={closeModal} />
        <SettingsModal open={uiState.activeModal === 'settings'} onClose={closeModal} />
        <HelpModal open={uiState.activeModal === 'help'} onClose={closeModal} />
        <AboutModal open={uiState.activeModal === 'about'} onClose={closeModal} />
        <Show when={uiState.activeModal === 'bufferSwitcher'}>
          <BufferSwitcher />
        </Show>
        <ChannelListModal open={uiState.activeModal === 'channelList'} onClose={closeModal} />

        {/* IRCX panels */}
        <ChannelInfoPanel open={!!ircxState.channelInfoTarget} onClose={closeChannelInfo} />
        <UserProfileCard open={!!ircxState.userProfileTarget} onClose={closeUserProfile} />
        <ServicesPanel open={ircxState.servicesPanel !== null} onClose={closeServicesPanel} />
        <OperConsole open={uiState.operConsoleOpen} onClose={() => setOperConsoleOpen(false)} />
      </div>
    </ErrorBoundary>
  );
}
