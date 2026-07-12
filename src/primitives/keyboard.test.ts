// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  buffersState: {
    activeBuffer: '0xactive' as string | null,
    buffers: {} as Record<string, { buffer: { id: string; shortName: string; localVars: Record<string, string> } }>,
  },
  uiState: { activeModal: null as string | null },
  mediaState: { callState: 'idle' },
  clearLines: vi.fn(),
  closeModal: vi.fn(),
  getSorted: vi.fn(() => [] as Array<{ buffer: { id: string } }>),
  isActiveOrochi: vi.fn(() => false),
  isOper: vi.fn(() => false),
  nextHighlighted: vi.fn(() => null as string | null),
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
  toggleCamera: vi.fn(),
  toggleMute: vi.fn(),
  toggleScreenShare: vi.fn(),
}));

vi.mock('@/state', () => ({
  buffersState: harness.buffersState,
  clearLines: harness.clearLines,
  closeModal: harness.closeModal,
  getSorted: harness.getSorted,
  isActiveOrochi: harness.isActiveOrochi,
  isOper: harness.isOper,
  nextHighlighted: harness.nextHighlighted,
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
  toggleCamera: harness.toggleCamera,
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
    harness.getSorted.mockReturnValue([]);
    harness.isActiveOrochi.mockReturnValue(false);
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
});
