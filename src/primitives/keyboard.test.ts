// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  buffersState: {
    activeBuffer: '0xactive' as string | null,
    buffers: {} as Record<string, { buffer: { id: string; shortName: string; localVars: Record<string, string> } }>,
  },
  uiState: { activeModal: null as string | null },
  mediaState: { callState: 'idle', transcriptOpen: false },
  clearLines: vi.fn(),
  closeModal: vi.fn(),
  getSorted: vi.fn(() => [] as Array<{ buffer: { id: string } }>),
  isActiveOnyxServer: vi.fn(() => false),
  isOper: vi.fn(() => false),
  nextHighlighted: vi.fn(() => null as string | null),
  openActivityPanel: vi.fn(),
  openChannelInfo: vi.fn(),
  openModal: vi.fn(),
  setActive: vi.fn(),
  toggleSplit: vi.fn(),
  toggleSearch: vi.fn(),
  toggleSidebar: vi.fn(),
  toggleUserList: vi.fn(),
  hangup: vi.fn(),
  rejectCall: vi.fn(),
  setMinimized: vi.fn(),
  setTranscriptOpen: vi.fn(),
  toggleCamera: vi.fn(),
  toggleDeafen: vi.fn(),
  toggleMute: vi.fn(),
  toggleScreenShare: vi.fn(),
}));

vi.mock('@/state', () => ({
  buffersState: harness.buffersState,
  clearLines: harness.clearLines,
  closeModal: harness.closeModal,
  getSorted: harness.getSorted,
  isActiveOnyxServer: harness.isActiveOnyxServer,
  isOper: harness.isOper,
  nextHighlighted: harness.nextHighlighted,
  openActivityPanel: harness.openActivityPanel,
  openChannelInfo: harness.openChannelInfo,
  openModal: harness.openModal,
  setActive: harness.setActive,
  toggleSplit: harness.toggleSplit,
  toggleSearch: harness.toggleSearch,
  toggleSidebar: harness.toggleSidebar,
  toggleUserList: harness.toggleUserList,
  uiState: harness.uiState,
}));

vi.mock('@/state/media', () => ({
  hangup: harness.hangup,
  mediaState: harness.mediaState,
  rejectCall: harness.rejectCall,
  setMinimized: harness.setMinimized,
  setTranscriptOpen: harness.setTranscriptOpen,
  toggleCamera: harness.toggleCamera,
  toggleDeafen: harness.toggleDeafen,
  toggleMute: harness.toggleMute,
  toggleScreenShare: harness.toggleScreenShare,
}));

import { setupKeyboardShortcuts } from './keyboard';

function keydown(key: string, init: KeyboardEventInit = {}, target: EventTarget = window): boolean {
  return target.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...init,
  }));
}

describe('setupKeyboardShortcuts', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    harness.buffersState.activeBuffer = '0xactive';
    harness.buffersState.buffers = {};
    harness.uiState.activeModal = null;
    harness.mediaState.callState = 'idle';
    harness.mediaState.transcriptOpen = false;
    harness.getSorted.mockReturnValue([]);
    harness.isActiveOnyxServer.mockReturnValue(false);
    harness.isOper.mockReturnValue(false);
    harness.nextHighlighted.mockReturnValue(null);
    cleanup = setupKeyboardShortcuts();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.replaceChildren();
  });

  it('opens the buffer switcher for Ctrl+K and reports the event handled', () => {
    // Arrange
    const shortcut = { ctrlKey: true };

    // Act
    const wasNotCanceled = keydown('k', shortcut);

    // Assert
    expect(wasNotCanceled).toBe(false);
    expect(harness.openModal).toHaveBeenCalledWith('bufferSwitcher');
  });

  it('does not run global shortcuts during IME composition', () => {
    const wasNotCanceled = keydown('k', { ctrlKey: true, isComposing: true });

    expect(wasNotCanceled).toBe(true);
    expect(harness.openModal).not.toHaveBeenCalled();
  });

  it('opens the unified activity inbox for Alt+A', () => {
    const wasNotCanceled = keydown('a', { altKey: true });

    expect(wasNotCanceled).toBe(false);
    expect(harness.openActivityPanel).toHaveBeenCalledTimes(1);
  });

  it('does not open a second overlay while an aria-modal surface is active', () => {
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);

    expect(keydown('a', { altKey: true })).toBe(true);
    expect(keydown('k', { ctrlKey: true })).toBe(true);
    expect(harness.openActivityPanel).not.toHaveBeenCalled();
    expect(harness.openModal).not.toHaveBeenCalled();
  });

  it('leaves Escape to the active overlay dismissal listener', () => {
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);
    harness.uiState.activeModal = 'settings';
    harness.mediaState.callState = 'ringing_in';
    const overlayEscape = vi.fn((event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault();
    });
    window.addEventListener('keydown', overlayEscape);

    try {
      expect(keydown('Escape')).toBe(false);
      expect(overlayEscape).toHaveBeenCalledTimes(1);
      expect(harness.closeModal).not.toHaveBeenCalled();
      expect(harness.rejectCall).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', overlayEscape);
    }
  });

  it('toggles message search for Ctrl+F and reports the event handled', () => {
    // Arrange
    const shortcut = { ctrlKey: true };

    // Act
    const wasNotCanceled = keydown('F', shortcut);

    // Assert
    expect(wasNotCanceled).toBe(false);
    expect(harness.toggleSearch).toHaveBeenCalledTimes(1);
  });

  it('toggles the split pane for Ctrl+Backslash on the active buffer', () => {
    // Arrange
    harness.buffersState.activeBuffer = '0xsplit';

    // Act
    const wasNotCanceled = keydown('\\', { ctrlKey: true });

    // Assert
    expect(wasNotCanceled).toBe(false);
    expect(harness.toggleSplit).toHaveBeenCalledWith('0xsplit');
  });

  it('clears the active buffer for Ctrl+L outside text inputs', () => {
    // Arrange
    harness.buffersState.activeBuffer = '0xclear';

    // Act
    const wasNotCanceled = keydown('l', { ctrlKey: true });

    // Assert
    expect(wasNotCanceled).toBe(false);
    expect(harness.clearLines).toHaveBeenCalledWith('0xclear');
  });

  it('ignores Ctrl+L while typing in an input', () => {
    // Arrange
    const input = document.createElement('input');
    document.body.append(input);

    // Act
    const wasNotCanceled = keydown('l', { ctrlKey: true }, input);

    // Assert
    expect(wasNotCanceled).toBe(true);
    expect(harness.clearLines).not.toHaveBeenCalled();
  });

  it('leaves unhandled chords uncanceled', () => {
    // Arrange
    const shortcut = { ctrlKey: true };

    // Act
    const wasNotCanceled = keydown('x', shortcut);

    // Assert
    expect(wasNotCanceled).toBe(true);
    expect(harness.openModal).not.toHaveBeenCalled();
    expect(harness.toggleSearch).not.toHaveBeenCalled();
    expect(harness.toggleSplit).not.toHaveBeenCalled();
    expect(harness.clearLines).not.toHaveBeenCalled();
  });

  it('covers deafen and transcript with unmodified in-call shortcuts', () => {
    harness.mediaState.callState = 'in_call';
    expect(keydown('d')).toBe(false);
    expect(harness.toggleDeafen).toHaveBeenCalledOnce();

    expect(keydown('c')).toBe(false);
    expect(harness.setTranscriptOpen).toHaveBeenCalledWith(true);
  });

  it('closes the transcript before Escape minimizes the call', () => {
    harness.mediaState.callState = 'in_call';
    harness.mediaState.transcriptOpen = true;
    expect(keydown('Escape')).toBe(false);
    expect(harness.setTranscriptOpen).toHaveBeenCalledWith(false);
    expect(harness.setMinimized).not.toHaveBeenCalled();
  });

  it('does not run live call controls while a call is only ringing', () => {
    harness.mediaState.callState = 'ringing_in';
    expect(keydown('m')).toBe(true);
    expect(harness.toggleMute).not.toHaveBeenCalled();
  });
});
