'use client';

import { useEffect } from 'react';
import { useStore } from '@/stores';

export function useKeyboardShortcuts() {
  const setActive = useStore(s => s.setActive);
  const getSorted = useStore(s => s.getSorted);
  const activeBuffer = useStore(s => s.activeBuffer);
  const openModal = useStore(s => s.openModal);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  const toggleUserList = useStore(s => s.toggleUserList);
  const nextHighlighted = useStore(s => s.nextHighlighted);
  const setSplitMode = useStore(s => s.setSplitMode);
  const splitMode = useStore(s => s.splitMode);
  const toggleAudioMute = useStore(s => s.toggleAudioMute);
  const toggleVideoOff = useStore(s => s.toggleVideoOff);
  const toggleScreenShare = useStore(s => s.toggleScreenShare);
  const hangup = useStore(s => s.hangup);
  const rejectCall = useStore(s => s.rejectCall);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Alt+1-9: switch to buffer by number
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= 9) {
          e.preventDefault();
          const sorted = getSorted();
          const target = sorted[n - 1];
          if (target) setActive(target.buffer.id);
          return;
        }
        // Alt+0 → buffer 10
        if (e.key === '0') {
          e.preventDefault();
          const sorted = getSorted();
          const target = sorted[9];
          if (target) setActive(target.buffer.id);
          return;
        }
        // Alt+Up/Down: prev/next buffer
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const sorted = getSorted();
          if (!sorted.length) return;
          const cur = sorted.findIndex(e => e.buffer.id === activeBuffer);
          const step = e.key === 'ArrowUp' ? -1 : 1;
          const idx = ((cur + step) % sorted.length + sorted.length) % sorted.length;
          setActive(sorted[idx].buffer.id);
          return;
        }
        // Alt+A: next highlight
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          const next = nextHighlighted(true);
          if (next) setActive(next);
          return;
        }
      }

      // Ctrl+K: buffer switcher
      if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openModal('bufferSwitcher');
        return;
      }

      // Ctrl+\: toggle split
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === '\\') {
        e.preventDefault();
        setSplitMode(splitMode === 'none' ? 'vertical' : 'none');
        return;
      }

      // Ctrl+B: toggle sidebar (skip in text inputs — conflicts with bold formatting)
      if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'b' || e.key === 'B')) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Ctrl+U: toggle user list (skip in text inputs — conflicts with underline formatting)
      if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'u' || e.key === 'U')) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        toggleUserList();
        return;
      }

      // In-call shortcuts (only when not in text input)
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        const inInput = tag === 'INPUT' || tag === 'TEXTAREA';
        const state = useStore.getState();
        if (!inInput && state.callState !== 'idle') {
          if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            toggleAudioMute();
            return;
          }
          if (e.key === 'v' || e.key === 'V') {
            e.preventDefault();
            toggleVideoOff();
            return;
          }
          if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            toggleScreenShare();
            return;
          }
          if (e.key === 'h' || e.key === 'H') {
            e.preventDefault();
            hangup();
            return;
          }
        }
      }

      // Escape: cancel/reject ringing, minimize video room, close modals
      if (e.key === 'Escape') {
        const state = useStore.getState();
        if (state.callState === 'ringing_out') {
          e.preventDefault();
          hangup();
          return;
        }
        if (state.callState === 'ringing_in') {
          e.preventDefault();
          rejectCall();
          return;
        }
        if (state.callState !== 'idle' && !state.minimized) {
          e.preventDefault();
          useStore.setState({ minimized: true });
          return;
        }
        if (state.activeModal) {
          e.preventDefault();
          state.closeModal();
        }
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActive, getSorted, activeBuffer, openModal, toggleSidebar, toggleUserList, nextHighlighted, setSplitMode, splitMode, toggleAudioMute, toggleVideoOff, toggleScreenShare, hangup, rejectCall]);
}
