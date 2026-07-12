// App mobile-drawer dialog semantics.
//
// The mobile buffers drawer is a slide-in sheet that keeps a full <Sidebar>
// mounted behind the app. This suite pins its modal contract: opening it exposes
// role="dialog"/aria-modal, moves focus INTO the sheet, marks <main> inert, and
// Escape closes it AND restores focus to the trigger that opened it.
//
// matchMedia is stubbed to report a mobile viewport (min-width:1024px => false)
// so the overlay-drawer branch renders. The direct-orochi bridge and the media
// store are mocked away — they open sockets/timers this UI-shape suite does not
// need.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, screen } from '@solidjs/testing-library';
import {
  uiState,
  setSidebarOpen,
  setUserListOpen,
  resetSettings,
  updateSettings,
  clearBuffers,
  clearIrcx,
  disconnect,
} from '@/state';
import App from './App';

vi.mock('@/core/bridge', () => ({ initBridge: () => undefined }));

vi.mock('@/state/media', () => ({
  mediaState: {
    callState: 'idle',
    channel: null,
    kind: 'voice',
    callWith: null,
    startedAt: null,
    peers: {},
    selfMuted: false,
    selfDeafened: false,
    cameraOn: false,
    screenSharing: false,
    speakingNick: null,
    minimized: false,
    spotlightNick: null,
    error: null,
    mediaAvailable: true,
  },
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  startCall: vi.fn(),
  acceptCall: vi.fn(),
  rejectCall: vi.fn(),
  hangup: vi.fn(),
  toggleMute: vi.fn(),
  toggleDeafen: vi.fn(),
  toggleCamera: vi.fn(),
  toggleScreenShare: vi.fn(),
  setMinimized: vi.fn(),
  setSpotlight: vi.fn(),
  sendRoomReaction: vi.fn(),
  peerStream: vi.fn(() => null),
  selfPreviewStream: vi.fn(() => null),
}));

beforeAll(() => {
  // jsdom has no matchMedia; report a phone viewport so App renders the mobile
  // overlay drawers (every query resolves to non-matching, incl. min-width:1024).
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  globalThis.localStorage?.clear();
  resetSettings();
  // The animated ThemeBg scene is a lazy chunk we don't need for these assertions.
  updateSettings({ animateThemes: false });
  clearBuffers();
  clearIrcx();
  // uiState is a module singleton; keep drawer state from leaking across tests.
  setSidebarOpen(false);
  setUserListOpen(false);
});

afterEach(() => {
  cleanup();
  setSidebarOpen(false);
  setUserListOpen(false);
  disconnect();
  vi.clearAllMocks();
});

describe('App mobile buffers drawer', () => {
  it('is not a dialog while closed', () => {
    render(() => <App />);
    expect(screen.queryByRole('dialog', { name: 'Buffers' })).toBeNull();
  });

  it('opening exposes role=dialog/aria-modal, traps focus in, and inerts <main>', () => {
    const { container } = render(() => <App />);

    setSidebarOpen(true);

    const dialog = screen.getByRole('dialog', { name: 'Buffers' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Focus moved into the sheet (never left behind the backdrop).
    expect(dialog.contains(document.activeElement)).toBe(true);
    // The region behind the sheet is inert so AT/focus can't reach it.
    expect(container.querySelector('main')).toHaveProperty('inert', true);
  });

  it('Escape closes the drawer and restores focus to the trigger', () => {
    render(() => <App />);

    // A real trigger holding focus at open-time; the sheet must return focus here.
    const trigger = document.createElement('button');
    trigger.textContent = 'open buffers';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    setSidebarOpen(true);
    const dialog = screen.getByRole('dialog', { name: 'Buffers' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(uiState.sidebarOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });
});
