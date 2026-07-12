// Tests for the UI store — modals, panels, split view, search.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  uiState,
  openModal,
  closeModal,
  toggleSidebar,
  setSidebarOpen,
  toggleUserList,
  setUserListOpen,
  toggleOperConsole,
  setOperConsoleOpen,
  setSplitMode,
  setSplitBuffer,
  toggleSplit,
  openSplitWith,
  toggleSearch,
  setSearchOpen,
} from './ui';

describe('ui store', () => {
  beforeEach(() => {
    // Reset the module singleton to a known state via the public actions.
    closeModal();
    setSidebarOpen(false);
    setUserListOpen(false);
    setOperConsoleOpen(false);
    setSplitMode('none');
    setSplitBuffer(null);
    setSearchOpen(false);
  });

  describe('modals', () => {
    it('starts with the connect modal until explicitly closed', () => {
      openModal('connect');

      expect(uiState.activeModal).toBe('connect');
    });

    it('opens a modal by type', () => {
      openModal('settings');

      expect(uiState.activeModal).toBe('settings');
    });

    it('replaces the active modal when another opens', () => {
      openModal('settings');

      openModal('help');

      expect(uiState.activeModal).toBe('help');
    });

    it('closes the active modal', () => {
      openModal('channelList');

      closeModal();

      expect(uiState.activeModal).toBeNull();
    });

    it('keeps closeModal idempotent when no modal is active', () => {
      closeModal();

      closeModal();

      expect(uiState.activeModal).toBeNull();
    });

    it('treats opening a null modal as clearing the active modal', () => {
      openModal('settings');

      openModal(null);

      expect(uiState.activeModal).toBeNull();
    });
  });

  describe('split view', () => {
    it('sets the split mode', () => {
      setSplitMode('horizontal');
      expect(uiState.splitMode).toBe('horizontal');

      setSplitMode('vertical');
      expect(uiState.splitMode).toBe('vertical');

      setSplitMode('none');
      expect(uiState.splitMode).toBe('none');
    });

    it('sets and clears the split buffer pointer', () => {
      setSplitBuffer('0xabc');
      expect(uiState.splitBuffer).toBe('0xabc');

      setSplitBuffer(null);
      expect(uiState.splitBuffer).toBeNull();
    });

    it('toggleSplit opens pinned to the active buffer, then closes and clears the pin', () => {
      // open: pins the current active buffer so the panes can diverge
      toggleSplit('0xactive');
      expect(uiState.splitMode).toBe('vertical');
      expect(uiState.splitBuffer).toBe('0xactive');

      // close: clears mode and pin
      toggleSplit('0xactive');
      expect(uiState.splitMode).toBe('none');
      expect(uiState.splitBuffer).toBeNull();
    });

    it('toggleSplit can open without an active buffer and still closes cleanly', () => {
      toggleSplit(null);
      expect(uiState.splitMode).toBe('vertical');
      expect(uiState.splitBuffer).toBeNull();

      toggleSplit('0xignored');
      expect(uiState.splitMode).toBe('none');
      expect(uiState.splitBuffer).toBeNull();
    });

    it('toggleSplit closes a horizontal split and ignores the passed active buffer', () => {
      setSplitMode('horizontal');
      setSplitBuffer('0xpinned');

      toggleSplit('0xactive');

      expect(uiState.splitMode).toBe('none');
      expect(uiState.splitBuffer).toBeNull();
    });

    it('openSplitWith pins a buffer and opens the split if closed', () => {
      expect(uiState.splitMode).toBe('none');
      openSplitWith('0xother');
      expect(uiState.splitMode).toBe('vertical');
      expect(uiState.splitBuffer).toBe('0xother');
      // re-assigning while open keeps it open, swaps the pin
      openSplitWith('0xthird');
      expect(uiState.splitBuffer).toBe('0xthird');
      expect(uiState.splitMode).toBe('vertical');
    });

    it('openSplitWith keeps an already-open horizontal split in horizontal mode', () => {
      setSplitMode('horizontal');
      setSplitBuffer('0xleft');

      openSplitWith('0xright');

      expect(uiState.splitMode).toBe('horizontal');
      expect(uiState.splitBuffer).toBe('0xright');
    });
  });

  describe('sidebar', () => {
    it('toggles the sidebar', () => {
      toggleSidebar();
      expect(uiState.sidebarOpen).toBe(true);

      toggleSidebar();
      expect(uiState.sidebarOpen).toBe(false);
    });

    it('sets the sidebar open state directly', () => {
      setSidebarOpen(true);
      expect(uiState.sidebarOpen).toBe(true);

      setSidebarOpen(false);
      expect(uiState.sidebarOpen).toBe(false);
    });

    it('does not disturb the user list when the sidebar changes', () => {
      setUserListOpen(true);

      toggleSidebar();

      expect(uiState.sidebarOpen).toBe(true);
      expect(uiState.userListOpen).toBe(true);
    });
  });

  describe('user list', () => {
    it('toggles the user list', () => {
      toggleUserList();
      expect(uiState.userListOpen).toBe(true);

      toggleUserList();
      expect(uiState.userListOpen).toBe(false);
    });

    it('sets the user list open state directly', () => {
      setUserListOpen(true);
      expect(uiState.userListOpen).toBe(true);

      setUserListOpen(false);
      expect(uiState.userListOpen).toBe(false);
    });
  });

  describe('oper console', () => {
    it('toggles the oper console', () => {
      toggleOperConsole();
      expect(uiState.operConsoleOpen).toBe(true);

      toggleOperConsole();
      expect(uiState.operConsoleOpen).toBe(false);
    });

    it('sets the oper console open state directly', () => {
      setOperConsoleOpen(true);
      expect(uiState.operConsoleOpen).toBe(true);

      setOperConsoleOpen(false);
      expect(uiState.operConsoleOpen).toBe(false);
    });
  });

  describe('search', () => {
    it('toggles the search bar', () => {
      toggleSearch();
      expect(uiState.searchOpen).toBe(true);

      toggleSearch();
      expect(uiState.searchOpen).toBe(false);
    });

    it('sets the search open state directly', () => {
      setSearchOpen(true);
      expect(uiState.searchOpen).toBe(true);

      setSearchOpen(false);
      expect(uiState.searchOpen).toBe(false);
    });

    it('keeps search state independent from panel toggles', () => {
      setSearchOpen(true);

      toggleSidebar();
      toggleUserList();

      expect(uiState.searchOpen).toBe(true);
      expect(uiState.sidebarOpen).toBe(true);
      expect(uiState.userListOpen).toBe(true);
    });
  });
});
