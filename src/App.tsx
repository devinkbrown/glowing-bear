import { ErrorBoundary, Show, Suspense, createEffect, createMemo, lazy, onCleanup, onMount } from 'solid-js';
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

import StarfieldBg from '@/ui/bits/StarfieldBg';
import Sidebar from '@/ui/layout/Sidebar';
import Header from '@/ui/layout/Header';
import MobileDock from '@/ui/layout/MobileDock';
import MessageView from '@/ui/chat/MessageView';
import TypingIndicator from '@/ui/chat/TypingIndicator';
import InputBar from '@/ui/input/InputBar';
import CallNotification from '@/ui/media/CallNotification';
import type { ThemeName } from '@/ui/bits/ThemeBg';

// Heavy, non-critical surfaces are code-split via lazy() so they stay out of
// the first-paint entry chunk. Each is rendered behind a <Show> gate, so its
// dynamic import only fires the first time the surface is actually opened; the
// <Suspense> boundaries below keep a still-loading overlay from blanking the
// main UI (a null fallback renders nothing until the chunk resolves).
const ThemeBg = lazy(() => import('@/ui/bits/ThemeBg'));
const VideoRoom = lazy(() => import('@/ui/media/VideoRoom'));
const UserList = lazy(() => import('@/ui/panels/UserList'));
const ChannelInfoPanel = lazy(() => import('@/ui/panels/ChannelInfoPanel'));
const ServicesPanel = lazy(() => import('@/ui/panels/ServicesPanel'));
const UserProfileCard = lazy(() => import('@/ui/panels/UserProfileCard'));
const ChannelListModal = lazy(() => import('@/ui/panels/ChannelListModal'));
const OperConsole = lazy(() => import('@/ui/panels/OperConsole'));
const ConnectModal = lazy(() => import('@/ui/modals/ConnectModal'));
const SettingsModal = lazy(() => import('@/ui/modals/SettingsModal'));
const HelpModal = lazy(() => import('@/ui/modals/HelpModal'));
const AboutModal = lazy(() => import('@/ui/modals/AboutModal'));
const BufferSwitcher = lazy(() => import('@/ui/modals/BufferSwitcher'));

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
          <Suspense>
            <Show when={settings.theme === 'starfield'} fallback={<ThemeBg theme={settings.theme as ThemeName} />}>
              <StarfieldBg />
            </Show>
          </Suspense>
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
        <Suspense>
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
        </Suspense>

        {/* Media surfaces — VideoRoom is code-split; CallNotification stays in the
            entry chunk (always mounted, small) so it never blanks under Suspense. */}
        <Suspense>
          <Show when={mediaState.callState !== 'idle'}>
            <VideoRoom />
          </Show>
        </Suspense>
        <CallNotification />

        {/* Modals + IRCX panels — each <Show>-gated so its chunk loads on first
            open. Grouped under one Suspense: only one is open at a time and the
            null fallback renders nothing over the (separate) main column. */}
        <Suspense>
          <Show when={uiState.activeModal === 'connect'}>
            <ConnectModal open onClose={closeModal} />
          </Show>
          <Show when={uiState.activeModal === 'settings'}>
            <SettingsModal open onClose={closeModal} />
          </Show>
          <Show when={uiState.activeModal === 'help'}>
            <HelpModal open onClose={closeModal} />
          </Show>
          <Show when={uiState.activeModal === 'about'}>
            <AboutModal open onClose={closeModal} />
          </Show>
          <Show when={uiState.activeModal === 'bufferSwitcher'}>
            <BufferSwitcher />
          </Show>
          <Show when={uiState.activeModal === 'channelList'}>
            <ChannelListModal open onClose={closeModal} />
          </Show>
          <Show when={!!ircxState.channelInfoTarget}>
            <ChannelInfoPanel open onClose={closeChannelInfo} />
          </Show>
          <Show when={!!ircxState.userProfileTarget}>
            <UserProfileCard open onClose={closeUserProfile} />
          </Show>
          <Show when={ircxState.servicesPanel !== null}>
            <ServicesPanel open onClose={closeServicesPanel} />
          </Show>
          <Show when={uiState.operConsoleOpen}>
            <OperConsole open onClose={() => setOperConsoleOpen(false)} />
          </Show>
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
