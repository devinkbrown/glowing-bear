'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/stores';
import { ConnectionState } from '@/types';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useViewportHeight } from '@/hooks/useViewportHeight';
import { useFaviconBadge } from '@/hooks/useFaviconBadge';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ConnectModal from '@/components/modals/ConnectModal';
import SettingsModal from '@/components/modals/SettingsModal';
import BufferSwitcher from '@/components/modals/BufferSwitcher';
import HelpModal from '@/components/modals/HelpModal';
import AboutModal from '@/components/modals/AboutModal';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MessageView from '@/components/chat/MessageView';
import TypingIndicator from '@/components/chat/TypingIndicator';
import InputBar from '@/components/input/InputBar';
import UserList from '@/components/panels/UserList';
import VideoRoom from '@/components/video/VideoRoom';
import CallNotification from '@/components/video/CallNotification';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import StarfieldBg from '@/components/ui/StarfieldBg';
import ThemeBg from '@/components/ui/ThemeBg';

export default function ClientApp() {
  const connectionState = useStore(s => s.connectionState);
  const activeModal = useStore(s => s.activeModal);
  const openModal = useStore(s => s.openModal);
  const closeModal = useStore(s => s.closeModal);
  const sidebarOpen = useStore(s => s.sidebarOpen);
  const setSidebarOpen = useStore(s => s.setSidebarOpen);
  const userListOpen = useStore(s => s.userListOpen);
  const setUserListOpen = useStore(s => s.setUserListOpen);
  const activeBuffer = useStore(s => s.activeBuffer);
  const buffers = useStore(s => s.buffers);
  const settings = useStore(s => s.settings);
  const toggleSearch = useStore(s => s.toggleSearch);

  const isMobile = useMediaQuery('(max-width: 1024px)');
  const mainRef = useRef<HTMLDivElement>(null);

  useKeyboardShortcuts();
  useViewportHeight();
  useFaviconBadge();

  useSwipeGesture(mainRef, {
    onSwipeRight: () => {
      if (!isMobile) return;
      if (userListOpen) { setUserListOpen(false); return; }
      setSidebarOpen(true);
    },
    onSwipeLeft: () => {
      if (!isMobile) return;
      if (sidebarOpen) { setSidebarOpen(false); return; }
      if (isChannel && !userListOpen) setUserListOpen(true);
    },
    leftEdgeOnly: 40,
  });

  // Close mobile user list drawer when switching buffers
  useEffect(() => {
    if (isMobile) setUserListOpen(false);
  }, [activeBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark active buffer as read when window regains focus
  const clearUnread = useStore(s => s.clearUnread);
  useEffect(() => {
    if (!settings.readOnFocus) return;
    const onFocus = () => {
      const buf = useStore.getState().activeBuffer;
      if (buf) clearUnread(buf);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [settings.readOnFocus, clearUnread]);

  // Auto-show connect modal
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      if (activeModal === 'connect') closeModal();
    } else if (connectionState === ConnectionState.DISCONNECTED) {
      openModal('connect');
    }
  }, [connectionState, activeModal, closeModal, openModal]);

  // Custom theme vars — must clean up inline styles when leaving custom
  useEffect(() => {
    const root = document.documentElement;
    const props = [
      '--color-gray-950', '--color-gray-900', '--color-gray-800', '--color-gray-700',
      '--color-gray-600', '--color-gray-500', '--color-gray-400', '--color-gray-300',
      '--color-gray-200', '--color-gray-100', '--color-gray-50', '--custom-accent',
    ];
    if (settings.theme === 'custom') {
      const c = settings.customColors;
      root.style.setProperty('--color-gray-950', c.gray950);
      root.style.setProperty('--color-gray-900', c.gray900);
      root.style.setProperty('--color-gray-800', c.gray800);
      root.style.setProperty('--color-gray-700', c.gray700);
      root.style.setProperty('--color-gray-600', c.gray600);
      root.style.setProperty('--color-gray-500', c.gray500);
      root.style.setProperty('--color-gray-400', c.gray400);
      root.style.setProperty('--color-gray-300', c.gray300);
      root.style.setProperty('--color-gray-200', c.gray200);
      root.style.setProperty('--color-gray-100', c.gray100);
      root.style.setProperty('--color-gray-50', c.gray50);
      root.style.setProperty('--custom-accent', c.accent);
    } else {
      // Clear inline overrides so [data-theme] CSS rules take effect
      for (const p of props) root.style.removeProperty(p);
    }
    return () => {
      for (const p of props) root.style.removeProperty(p);
    };
  }, [settings.theme, settings.customColors]);

  // Custom CSS injection
  useEffect(() => {
    let style: HTMLStyleElement | null = null;
    if (settings.customCSS) {
      style = document.createElement('style');
      style.id = 'darkbear-custom-css';
      style.textContent = settings.customCSS;
      document.head.appendChild(style);
    }
    return () => { if (style) style.remove(); };
  }, [settings.customCSS]);

  // Font size
  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-size', `${settings.fontSize}px`);
  }, [settings.fontSize]);

  // Sidebar width
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${settings.sidebarWidth}px`);
  }, [settings.sidebarWidth]);

  const activeEntry = activeBuffer ? buffers.get(activeBuffer) : null;
  const isChannel = activeEntry?.buffer.localVars['type'] === 'channel';
  const hasThemedBg = !settings.bgImage && settings.theme !== 'light' && settings.theme !== 'custom';

  return (
    <ErrorBoundary>
      <div className={`relative flex h-[var(--vh,100dvh)] overflow-hidden ${hasThemedBg ? '' : 'bg-gray-950'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Theme backgrounds — rendered first, absolute so content layers on top */}
        {settings.theme === 'starfield' && !settings.bgImage && <StarfieldBg />}
        {hasThemedBg && settings.theme !== 'starfield' && <ThemeBg theme={settings.theme} />}
        {settings.bgImage && (
          <div className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${settings.bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: settings.bgOpacity / 100,
              filter: settings.bgBlur ? `blur(${settings.bgBlur}px)` : undefined,
            }} />
        )}

        {/* Sidebar */}
        {(sidebarOpen || !isMobile) && (
          <>
            {isMobile && (
              <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
                style={{ WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)' }}
                onClick={() => setSidebarOpen(false)} />
            )}
            <div className={`${isMobile ? 'fixed inset-y-0 left-0 z-50' : ''} border-r border-white/[0.04]`}
              style={isMobile ? { animation: 'slideRight 0.2s ease-out both' } : undefined}>
              <Sidebar onSelect={() => { if (isMobile) setSidebarOpen(false); }} />
            </div>
          </>
        )}

        {/* Main content */}
        <div ref={mainRef} className={`flex-1 flex flex-col min-w-0 relative ${hasThemedBg ? '' : 'bg-gray-950'}`}>
          <Header
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onToggleUserList={() => setUserListOpen(!userListOpen)}
            onToggleSearch={toggleSearch}
          />
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 flex flex-col min-w-0">
              <MessageView />
              <TypingIndicator />
              <InputBar />
            </div>
            {/* Desktop user list */}
            {userListOpen && isChannel && !isMobile && (
              <UserList />
            )}
          </div>
        </div>

        {/* Mobile user list drawer */}
        {userListOpen && isChannel && isMobile && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
              style={{ WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)' }}
              onClick={() => setUserListOpen(false)} />
            <div className="fixed inset-y-0 right-0 z-50 w-[280px] max-w-[85vw]"
              style={{ animation: 'slideLeft 0.2s ease-out both' }}>
              <UserList mobile onClose={() => setUserListOpen(false)} />
            </div>
          </>
        )}

        {/* Modals */}
        {activeModal === 'connect' && (
          <ConnectModal onClose={connectionState === ConnectionState.CONNECTED ? closeModal : undefined} />
        )}
        {activeModal === 'settings' && <SettingsModal onClose={closeModal} />}
        {activeModal === 'bufferSwitcher' && <BufferSwitcher onClose={closeModal} />}
        {activeModal === 'help' && <HelpModal onClose={closeModal} />}
        {activeModal === 'about' && <AboutModal onClose={closeModal} />}

        {/* Video overlay */}
        <VideoRoom />
        <CallNotification />

      </div>
    </ErrorBoundary>
  );
}
