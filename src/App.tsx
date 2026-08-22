import { ErrorBoundary, Show, Suspense, createEffect, createMemo, lazy, onCleanup, onMount } from 'solid-js';
import {
  settings,
  buffersState,
  clearUnread,
  getTotalHighlights,
  getTotalUnread,
  connectionState,
  connectServerType,
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
  activityState,
  applyNotificationAction,
  queueNotificationAction,
  flushPendingNotificationAction,
  notificationActionFromUrl,
  clearNotificationActionUrl,
  notificationMuteSnapshot,
  activeUserActionId,
  setupBrowserConnectivity,
} from '@/state';
import { connectModalAction } from '@/state/connectModalPolicy';
import { mediaState } from '@/state/media';
import { bridgeState, markRead } from '@/state/bridge';
import { threadsState } from '@/state/threads';
import { initBridge } from '@/core/bridge';
import { syncNotificationPolicy, updateTitle } from '@/lib/notifications';
import { notificationActionMessage } from '@/lib/notificationPolicy';
import { isDesktopBuild, setupDesktopDeepLinks } from '@/lib/desktop';
import { hydrateDesktopCredentialPasswords } from '@/lib/credentials';
import { hydrateDesktopSettingsSecrets } from '@/state/settings';
import { applyLocalePreference, t } from '@/lib/i18n';
import { currentPerformanceTier } from '@/lib/performance';
import { isImeComposing } from '@/primitives/ime';

import { createMediaQuery } from '@/primitives/mediaQuery';
import { setupViewportHeight } from '@/primitives/viewportHeight';
import { setupKeyboardShortcuts } from '@/primitives/keyboard';
import { setupFaviconBadge } from '@/primitives/faviconBadge';
import { createSwipeGesture } from '@/primitives/swipe';

import Sidebar from '@/ui/layout/Sidebar';
import Header from '@/ui/layout/Header';
import MobileDock from '@/ui/layout/MobileDock';
import ConnectivityStatus from '@/ui/layout/ConnectivityStatus';
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
const StarfieldBg = lazy(() => import('@/ui/bits/StarfieldBg'));
// The 816-line mascot stays out of the entry chunk: it only ever renders in the
// disconnected empty state, so its import fires the first time that state shows.
const AstronautBear = lazy(() => import('@/ui/bits/AstronautBear'));
const VideoRoom = lazy(() => import('@/ui/media/VideoRoom'));
const MediaPreflight = lazy(() => import('@/ui/media/MediaPreflight'));
const UserList = lazy(() => import('@/ui/panels/UserList'));
const ThreadPanel = lazy(() => import('@/ui/panels/ThreadPanel'));
const ActivityPanel = lazy(() => import('@/ui/panels/ActivityPanel'));
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
const UserActionModal = lazy(() => import('@/ui/modals/UserActionModal'));

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

// Mobile slide-in sheets are modal dialogs, but the shared <Modal> shell centers
// its own backdrop + panel and cannot host a bottom-anchored, drag-dismissable
// sheet — so the same a11y guarantees (focus-in, Escape, Tab-wrap, focus
// restore) are provided inline here. This mirrors Modal.tsx's focusable filter.
const SHEET_FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function sheetFocusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(SHEET_FOCUSABLE)).filter((el) => {
    if ((el as HTMLButtonElement | HTMLInputElement).disabled) return false;
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.hidden || el.closest('[hidden]')) return false;
    return true;
  });
}

// Trap focus + Escape inside an open sheet. Returns a disposer that removes the
// listener and restores focus to whatever held it when the sheet opened (the
// trigger). Caller owns clearing any `inert` on the region behind BEFORE this
// disposer runs, so the restore-focus target is reachable again.
function activateSheetDialog(panel: HTMLElement, close: () => void): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const initial = sheetFocusables(panel);
  // Fallback to the panel (tabindex=-1) so a sheet with no focusable child still
  // moves focus into the dialog rather than leaving it behind the backdrop.
  (initial[0] ?? panel).focus();

  const onKeydown = (e: KeyboardEvent): void => {
    if (isImeComposing(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = sheetFocusables(panel);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) {
      e.preventDefault();
      panel.focus();
      return;
    }
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  window.addEventListener('keydown', onKeydown);

  return () => {
    window.removeEventListener('keydown', onKeydown);
    previouslyFocused?.focus?.();
  };
}

function setupServiceWorkerRefresh(): () => void {
  // A dev server has no production cache contract and WebKit rejects the
  // generated worker load there. It also causes controller-change reloads to
  // race HMR and connected browser tests. Production builds retain the
  // deploy-version-aware registration below.
  if (import.meta.env.DEV || isDesktopBuild || !('serviceWorker' in navigator)) return () => undefined;
  const holder = document.getElementById('db-asset-version')?.textContent ?? '';
  const deployVersion = /'([^']+)'/.exec(holder)?.[1] ?? '';
  const announceVersion = (worker: ServiceWorker | null): void => {
    if (worker && deployVersion) {
      worker.postMessage({ type: 'darkbear-client-version', version: deployVersion });
    }
  };
  let reloaded = false;
  const onControllerChange = () => {
    announceVersion(navigator.serviceWorker.controller);
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  navigator.serviceWorker
    .register('/darkbear/sw.js', { scope: '/darkbear/' })
    .then((reg) => {
      announceVersion(reg.active);
      void reg.update();
    })
    .catch(() => undefined);
  void navigator.serviceWorker.ready.then((reg) => announceVersion(reg.active)).catch(() => undefined);
  return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
}

export default function App() {
  const isDesktop = createMediaQuery('(min-width: 1024px)');
  const prefersReducedMotion = createMediaQuery('(prefers-reduced-motion: reduce)');
  const lowDecorativeQuality = currentPerformanceTier() === 'low';
  createEffect(() => applyLocalePreference(settings.locale));
  // The reading surface + sidebar are translucent via the shared `.db-surface`
  // / `.darkbear-sidebar` contract in global.css: the theme's --surface-veil +
  // backdrop-blur let the animated ThemeBg scene + the mascot read THROUGH,
  // while a legibility scrim keeps body text >= AA over the scene's brightest
  // frame. prefers-reduced-transparency + forced-colors fall back to a solid
  // surface in CSS (no per-component JS media listener, and forced-colors is
  // reachable — which an inline style could not honour).
  let sheetDrag: { startY: number; currentY: number; sheet: HTMLElement } | null = null;
  let pendingDesktopBufferTarget: string | null = null;

  const openBufferTarget = (target: string): boolean => {
    const direct = buffersState.buffers[target];
    const matched = direct ?? Object.values(buffersState.buffers).find((entry) =>
      entry.buffer.fullName === target || entry.buffer.name === target,
    );
    if (!matched) return false;
    setActive(matched.buffer.id);
    return true;
  };

  createEffect(() => {
    const mutePolicy = notificationMuteSnapshot();
    void syncNotificationPolicy({
      enabled: settings.notifications,
      snoozedUntil: settings.notificationsSnoozedUntil,
      quietHours: {
        enabled: settings.quietHoursEnabled,
        start: settings.quietHoursStart,
        end: settings.quietHoursEnd,
        timeZone: settings.quietHoursTimezone,
      },
      ...mutePolicy,
    });
  });

  // Refs for the mobile dialog wiring: <main> is the region behind an open
  // sheet (made inert so AT/focus can't reach it); the sheets themselves get
  // focus-trap + Escape while open.
  let mainRef: HTMLElement | undefined;
  let bufferSheetRef: HTMLElement | undefined;
  let userSheetRef: HTMLElement | undefined;

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
    let alive = true;
    void Promise.all([
      hydrateDesktopCredentialPasswords(),
      hydrateDesktopSettingsSecrets(),
    ]).finally(() => {
      if (alive) initBridge();
    });
    onCleanup(() => { alive = false; });
    onCleanup(setupViewportHeight());
    onCleanup(setupKeyboardShortcuts());
    onCleanup(setupFaviconBadge(() => getTotalHighlights()));
    onCleanup(setupBrowserConnectivity());
    onCleanup(setupServiceWorkerRefresh());

    // Notification click → jump to the originating buffer.
    const onJump = (ev: Event) => {
      const ptr = (ev as CustomEvent<string>).detail;
      if (!ptr) return;
      if (!openBufferTarget(ptr)) pendingDesktopBufferTarget = ptr;
    };
    window.addEventListener('jump-to-buffer', onJump);
    onCleanup(() => window.removeEventListener('jump-to-buffer', onJump));
    onCleanup(setupDesktopDeepLinks());

    const initialAction = notificationActionFromUrl(window.location.href);
    if (initialAction) {
      if (!applyNotificationAction(initialAction)) queueNotificationAction(initialAction);
      clearNotificationActionUrl();
    }
    const onNotificationMessage = (event: MessageEvent<unknown>) => {
      const action = notificationActionMessage(event.data);
      if (!action) return;
      if (!applyNotificationAction(action)) queueNotificationAction(action);
    };
    navigator.serviceWorker?.addEventListener('message', onNotificationMessage);
    onCleanup(() => navigator.serviceWorker?.removeEventListener('message', onNotificationMessage));

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

  // An action may arrive before relay buffers hydrate. Re-attempt it whenever
  // the buffer key set changes. Reply plaintext stays only in exact-tab memory;
  // sessionStorage retains open-only intent.
  createEffect(() => {
    Object.keys(buffersState.buffers);
    flushPendingNotificationAction();
    if (pendingDesktopBufferTarget && openBufferTarget(pendingDesktopBufferTarget)) {
      pendingDesktopBufferTarget = null;
    }
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

  // Mobile drawer a11y. Order matters: this main-inert effect is created BEFORE
  // the per-sheet dialog effects, so on close it clears `inert` on <main> first,
  // then each sheet effect's cleanup restores focus to a now-reachable trigger.
  createEffect(() => {
    const sheetOpen = !isDesktop() && (uiState.sidebarOpen || uiState.userListOpen);
    const el = mainRef;
    if (!el) return;
    el.inert = sheetOpen;
  });

  // Buffers sheet: the <aside> is always mounted on mobile (it slides via a
  // transform and keeps a full <Sidebar> inside), so when closed it must be
  // `inert` — otherwise its buttons stay tabbable behind everything. When open
  // it becomes the focus-trapped dialog.
  createEffect(() => {
    const open = !isDesktop() && uiState.sidebarOpen;
    const panel = bufferSheetRef;
    if (!panel) return;
    panel.inert = !open;
    if (!open) return;
    onCleanup(activateSheetDialog(panel, () => setSidebarOpen(false)));
  });

  // Users sheet: only mounted (via <Show>) while open, so it needs no
  // closed-state inert — just the dialog wiring while present.
  createEffect(() => {
    const open = !isDesktop() && uiState.userListOpen;
    const panel = userSheetRef;
    if (!open || !panel) return;
    onCleanup(activateSheetDialog(panel, () => setUserListOpen(false)));
  });

  // Connect modal follows the relay state (see connectModalPolicy): close it
  // once connected, re-open it when the relay drops with nothing else open.
  createEffect(() => {
    const firstParty = connectServerType() === 'onyx-wss';
    const action = connectModalAction(connectionState(), uiState.activeModal, {
      firstPartyReady: firstParty && bridgeState.status === 'ready',
      firstPartyConnecting: firstParty && (bridgeState.status === 'connecting' || settings.bridge.enabled),
    });
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
          <div class="text-lg font-semibold">{t('app.somethingWrong')}</div>
          <pre class="max-w-xl overflow-auto rounded bg-gray-900 p-4 text-xs text-red-400">{String(err)}</pre>
          <button class="rounded bg-gray-800 px-4 py-2 hover:bg-gray-700" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    >
      <div class="relative flex h-[var(--vh,100dvh)] w-full overflow-hidden bg-gray-950 text-gray-200">
        <ConnectivityStatus />
        {/* Theme background layers */}
        <Show when={
          !lowDecorativeQuality &&
          uiState.activeModal !== 'connect' &&
          !prefersReducedMotion() &&
          settings.animateThemes &&
          settings.sceneMotion !== 'reduced' &&
          settings.theme !== 'custom' &&
          !settings.bgImage
        }>
          <div data-testid="decorative-theme-background" class="darkbear-decorative-scene">
            <Suspense>
              <Show when={settings.theme === 'starfield'} fallback={<ThemeBg theme={settings.theme as ThemeName} />}>
                <StarfieldBg />
              </Show>
            </Suspense>
          </div>
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
                ref={(el) => (bufferSheetRef = el)}
                role={uiState.sidebarOpen ? 'dialog' : undefined}
                aria-modal={uiState.sidebarOpen ? 'true' : undefined}
                aria-label={t('app.buffers')}
                tabindex="-1"
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
                  aria-label={t('app.closeBuffers')}
                  onClick={() => setSidebarOpen(false)}
                />
                <div class="mobile-sheet-head">
                  <div>
                    <p class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">{t('app.navigation')}</p>
                    <h2 class="text-[16px] font-black tracking-tight text-gray-50">{t('app.buffers')}</h2>
                  </div>
                  <button
                    type="button"
                    class="mobile-sheet-close"
                    aria-label={t('app.closeBuffers')}
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
        <main ref={(el) => (mainRef = el)} class="relative z-10 flex h-full min-w-0 flex-1 flex-col">
          <Header />
          <div
            class="flex min-h-0 flex-1"
            classList={{ 'flex-col': uiState.splitMode === 'horizontal', 'flex-row': uiState.splitMode !== 'horizontal' }}
          >
            <section class="db-surface flex min-h-0 min-w-0 flex-1 flex-col">
              <Show
                when={activePtr()}
                fallback={
                  <div class="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
                    <Show when={
                      !lowDecorativeQuality &&
                      !prefersReducedMotion() &&
                      settings.sceneMotion !== 'reduced'
                    }>
                      <Suspense fallback={<div class="h-[132px] w-[132px]" />}>
                        <AstronautBear
                          size={132}
                          theme={settings.theme as ThemeName}
                          class="drop-shadow-[0_10px_34px_rgba(6,6,26,0.6)]"
                        />
                      </Suspense>
                    </Show>
                    <div class="space-y-1.5">
                      <p class="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">DarkBear</p>
                      <h2 class="text-[22px] font-semibold tracking-tight text-gray-200 sm:text-[26px]">
                        Ready when you are
                      </h2>
                      <p class="mx-auto max-w-[34ch] text-[13px] leading-relaxed text-gray-500">
                        Connect to your WeeChat relay to bring your buffers, channels, and DMs into orbit.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openModal('connect')}
                      class="rounded-full border border-white/[0.10] bg-white/[0.04] px-5 py-2 text-[12px] font-semibold tracking-wide text-gray-200 transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--custom-accent,#818cf8)]"
                    >
                      Connect relay
                    </button>
                  </div>
                }
              >
                {(ptr) => <MessageView bufferPtr={ptr()} />}
              </Show>
            </section>
            <Show when={uiState.splitMode !== 'none' && splitPtr()}>
              {(ptr) => (
                <section
                  class="db-surface flex min-h-0 min-w-0 flex-1 flex-col"
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
          {/* Preserve the original active-buffer order (typing → dock → input) while
              keeping the mobile dock mounted even with NO active buffer, so the buffers
              drawer always has a keyboard/pointer opener (WCAG SC 2.1.1) — swipe alone is
              not keyboard-accessible. TypingIndicator/InputBar still require a buffer. */}
          <Show when={activePtr()}>
            {(ptr) => <TypingIndicator bufferPtr={ptr()} />}
          </Show>
          <Show when={!isDesktop()}>
            <MobileDock />
          </Show>
          <Show when={activePtr()}>
            <InputBar />
          </Show>
        </main>

        <Suspense>
          <Show when={threadsState.activeThread !== null}>
            <ThreadPanel />
          </Show>
          <Show when={activityState.panelOpen}>
            <ActivityPanel />
          </Show>
        </Suspense>

        {/* User list — desktop drawer / mobile overlay */}
        <Suspense>
          <Show when={uiState.userListOpen}>
            <Show
              when={isDesktop()}
              fallback={
                <>
                  <div class="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setUserListOpen(false)} />
                  <aside
                    ref={(el) => (userSheetRef = el)}
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('app.users')}
                    tabindex="-1"
                    class="mobile-sheet fixed bottom-0 left-0 right-0 z-50 flex h-[min(72vh,660px)] flex-col overflow-hidden rounded-t-3xl border-t border-white/[0.08]"
                    onTouchStart={beginSheetDrag}
                    onTouchMove={moveSheetDrag}
                    onTouchEnd={() => endSheetDrag(() => setUserListOpen(false))}
                    onTouchCancel={() => endSheetDrag(() => undefined)}
                  >
                    <button
                      type="button"
                      class="mobile-sheet-grip"
                      aria-label={t('app.closeUsers')}
                      onClick={() => setUserListOpen(false)}
                    />
                    <div class="mobile-sheet-head">
                      <div>
                        <p class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">{t('app.channel')}</p>
                        <h2 class="text-[16px] font-black tracking-tight text-gray-50">{t('app.users')}</h2>
                      </div>
                      <button
                        type="button"
                        class="mobile-sheet-close"
                        aria-label={t('app.closeUsers')}
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
          <Show when={mediaState.preflight.open}>
            <MediaPreflight />
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
          <Show when={activeUserActionId() !== null}>
            <UserActionModal />
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
