// Global keyboard shortcuts — Solid port of the old useKeyboardShortcuts hook,
// mapped onto the new state facade.
//
// Shortcut map:
//   Alt+1..9 / Alt+0   switch to buffer 1-9 / 10
//   Alt+Up / Alt+Down  previous / next buffer
//   Alt+A              jump to next highlighted buffer
//   Ctrl+K             open buffer switcher
//   Ctrl+F             toggle message search
//   Ctrl+\             toggle vertical split pane
//   Ctrl+L             clear current buffer lines (outside text inputs)
//   Ctrl+B             toggle sidebar (outside text inputs)
//   Ctrl+U             toggle user list (outside text inputs)
//   Ctrl+I             IRCX channel info — orochi servers only (outside text inputs)
//   Ctrl+Shift+O       toggle oper console (opers only)
//   M / V / S / H      in-call: mute / camera / screen share / hang up
//   Escape             hang up a ringing call, else close modal, else minimize call

import {
  buffersState,
  clearLines,
  closeModal,
  getSorted,
  isActiveOrochi,
  isOper,
  nextHighlighted,
  openChannelInfo,
  openModal,
  setActive,
  toggleSplit,
  toggleSearch,
  toggleSidebar,
  toggleUserList,
  uiState,
} from '@/state';
import {
  hangup,
  mediaState,
  rejectCall,
  setMinimized,
  toggleCamera,
  toggleMute,
  toggleScreenShare,
} from '@/state/media';

const MAX_ALT_BUFFER = 9;
const ALT_ZERO_INDEX = 9; // Alt+0 → tenth buffer

function inTextInput(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function handleAltShortcuts(e: KeyboardEvent): boolean {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= MAX_ALT_BUFFER) {
    e.preventDefault();
    const target = getSorted()[n - 1];
    if (target) setActive(target.buffer.id);
    return true;
  }
  if (e.key === '0') {
    e.preventDefault();
    const target = getSorted()[ALT_ZERO_INDEX];
    if (target) setActive(target.buffer.id);
    return true;
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const sorted = getSorted();
    if (sorted.length === 0) return true;
    const cur = sorted.findIndex((entry) => entry.buffer.id === buffersState.activeBuffer);
    const step = e.key === 'ArrowUp' ? -1 : 1;
    const idx = (((cur + step) % sorted.length) + sorted.length) % sorted.length;
    const target = sorted[idx];
    if (target) setActive(target.buffer.id);
    return true;
  }
  if (e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    const next = nextHighlighted(true);
    if (next) setActive(next);
    return true;
  }
  return false;
}

function handleCtrlShortcuts(e: KeyboardEvent): boolean {
  // Ctrl+Shift+O: toggle oper console (opers only)
  if (e.shiftKey && (e.key === 'o' || e.key === 'O')) {
    if (!isOper()) return false;
    e.preventDefault();
    if (uiState.activeModal === 'operConsole') closeModal();
    else openModal('operConsole');
    return true;
  }
  if (e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    openModal('bufferSwitcher');
    return true;
  }
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleSearch();
    return true;
  }
  if (e.key === '\\') {
    e.preventDefault();
    toggleSplit(buffersState.activeBuffer);
    return true;
  }
  // Ctrl+L: clear current buffer's visible messages
  if (e.key === 'l' || e.key === 'L') {
    if (inTextInput(e)) return true;
    e.preventDefault();
    if (buffersState.activeBuffer) clearLines(buffersState.activeBuffer);
    return true;
  }
  // Ctrl+B: toggle sidebar (skip in text inputs — conflicts with bold formatting)
  if (e.key === 'b' || e.key === 'B') {
    if (inTextInput(e)) return true;
    e.preventDefault();
    toggleSidebar();
    return true;
  }
  // Ctrl+U: toggle user list (skip in text inputs — conflicts with underline formatting)
  if (e.key === 'u' || e.key === 'U') {
    if (inTextInput(e)) return true;
    e.preventDefault();
    toggleUserList();
    return true;
  }
  // Ctrl+I: channel info (IRCX PROP + ACCESS) — orochi servers only
  if (e.key === 'i' || e.key === 'I') {
    if (inTextInput(e)) return true;
    if (!isActiveOrochi()) return true;
    e.preventDefault();
    const ptr = buffersState.activeBuffer;
    const entry = ptr ? buffersState.buffers[ptr] : undefined;
    if (entry && (entry.buffer.localVars['type'] ?? '') === 'channel') {
      const ch = entry.buffer.localVars['channel'] ?? entry.buffer.shortName;
      if (ch) openChannelInfo(ch);
    }
    return true;
  }
  return false;
}

function handleInCallKeys(e: KeyboardEvent): boolean {
  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    toggleMute();
    return true;
  }
  if (e.key === 'v' || e.key === 'V') {
    e.preventDefault();
    toggleCamera();
    return true;
  }
  if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    toggleScreenShare();
    return true;
  }
  if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    hangup();
    return true;
  }
  return false;
}

function handleEscape(e: KeyboardEvent): void {
  const call = mediaState.callState;
  // Cancel an outgoing ring / decline an incoming ring
  if (call === 'ringing_in') {
    e.preventDefault();
    rejectCall();
    return;
  }
  if (call === 'ringing_out') {
    e.preventDefault();
    hangup();
    return;
  }
  if (uiState.activeModal) {
    e.preventDefault();
    closeModal();
    return;
  }
  // Minimize the call surface instead of leaving the call
  if (call === 'in_call' || call === 'connecting') {
    e.preventDefault();
    setMinimized(true);
  }
}

/**
 * Installs the global keydown handler. Returns a cleanup function that
 * removes it. All state reads happen inside the handler (untracked), so this
 * can be called from any context.
 */
export function setupKeyboardShortcuts(): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (handleAltShortcuts(e)) return;
    }

    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      if (handleCtrlShortcuts(e)) return;
    }

    // In-call media keys (no modifiers, not while typing)
    if (
      !e.ctrlKey && !e.altKey && !e.metaKey &&
      mediaState.callState !== 'idle' && !inTextInput(e)
    ) {
      if (handleInCallKeys(e)) return;
    }

    if (e.key === 'Escape') handleEscape(e);
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
