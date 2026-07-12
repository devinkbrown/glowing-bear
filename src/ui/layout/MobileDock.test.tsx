import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import type { WeeChatBuffer } from '@/types';
import {
  buffersState,
  clearBuffers,
  closeModal,
  resetSettings,
  setActiveBuffer,
  setSearchOpen,
  setSidebarOpen,
  setUserListOpen,
  uiState,
  updateHotlist,
  upsertBuffer,
} from '@/state';
import MobileDock from './MobileDock';

function makeBuffer(id: string, over: Partial<WeeChatBuffer> = {}): WeeChatBuffer {
  return {
    id,
    number: 1,
    name: '',
    fullName: '',
    shortName: '',
    title: '',
    type: 0,
    nicksCount: 0,
    localVars: {},
    notify: 0,
    hidden: false,
    ...over,
  };
}

beforeEach(() => {
  globalThis.localStorage?.clear();
  resetSettings();
  clearBuffers();
  closeModal();
  setSidebarOpen(false);
  setUserListOpen(false);
  setSearchOpen(false);
  upsertBuffer(makeBuffer('0xc', {
    name: 'irc.esh.#alpha',
    fullName: 'irc.esh.#alpha',
    shortName: '#alpha',
    localVars: { type: 'channel', server: 'esh', channel: '#alpha' },
  }));
  upsertBuffer(makeBuffer('0xd', {
    name: 'irc.esh.#beta',
    fullName: 'irc.esh.#beta',
    shortName: '#beta',
    localVars: { type: 'channel', server: 'esh', channel: '#beta' },
  }));
  setActiveBuffer('0xc');
});

afterEach(() => {
  cleanup();
  clearBuffers();
});

describe('MobileDock', () => {
  it('opens the buffer sheet and shows unread badge counts', () => {
    updateHotlist([{ buffer: '0xd', count: [0, 3, 0, 0] }]);
    const { getByLabelText, getAllByText } = render(() => <MobileDock />);

    fireEvent.click(getByLabelText('Buffers'));

    expect(uiState.sidebarOpen).toBe(true);
    expect(getAllByText('3').length).toBeGreaterThan(0);
  });

  it('keeps a keyboard-operable buffers control even with no active buffer (SC 2.1.1)', () => {
    // No active buffer: swipe-to-open is the only gesture, so the dock must
    // still expose a real <button> a keyboard/touch user can activate.
    clearBuffers();
    expect(buffersState.activeBuffer).toBeNull();

    const { getByLabelText } = render(() => <MobileDock />);
    const buffersBtn = getByLabelText('Buffers');

    // Native button element => inherently keyboard focusable/activable.
    expect(buffersBtn.tagName).toBe('BUTTON');
    expect(buffersBtn).toBeEnabled();
    // Disclosure state exposed programmatically, reflecting the drawer.
    expect(buffersBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(buffersBtn);

    expect(uiState.sidebarOpen).toBe(true);
    expect(buffersBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles message search from the dock', () => {
    const { getByLabelText } = render(() => <MobileDock />);

    fireEvent.click(getByLabelText('Search'));
    expect(uiState.searchOpen).toBe(true);
  });

  it('opens channel list and settings modals', () => {
    const { getByLabelText } = render(() => <MobileDock />);

    fireEvent.click(getByLabelText('Channels'));
    expect(uiState.activeModal).toBe('channelList');

    fireEvent.click(getByLabelText('Settings'));
    expect(uiState.activeModal).toBe('settings');
  });

  it('opens user list only for channel buffers', () => {
    const { getByLabelText } = render(() => <MobileDock />);

    fireEvent.click(getByLabelText('Users'));
    expect(uiState.userListOpen).toBe(true);

    upsertBuffer(makeBuffer('0xq', {
      name: 'irc.esh.trev',
      fullName: 'irc.esh.trev',
      shortName: 'trev',
      localVars: { type: 'private', server: 'esh', channel: 'trev' },
    }));
    setActiveBuffer('0xq');
    fireEvent.click(getByLabelText('Users'));
    expect(buffersState.activeBuffer).toBe('0xq');
    expect(getByLabelText('Users')).toBeDisabled();
  });
});
