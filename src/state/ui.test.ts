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
    });
  });
});
