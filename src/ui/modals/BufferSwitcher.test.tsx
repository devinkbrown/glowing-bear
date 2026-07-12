// BufferSwitcher (command palette) tests — modal gating via the ui store, the
// grouped buffers/actions listbox, fuzzy filtering, full keyboard nav with
// wrap, and command dispatch through the real @/state actions.

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import type { WeeChatBuffer } from '@/types';
import {
  buffersState,
  clearBuffers,
  closeModal,
  isMuted,
  openModal,
  setActiveBuffer,
  setTheme,
  uiState,
  upsertBuffer,
} from '@/state';
import BufferSwitcher from './BufferSwitcher';

function makeBuffer(id: string, number: number, over: Partial<WeeChatBuffer> = {}): WeeChatBuffer {
  return {
    id,
    number,
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

function arrangeBuffers(): void {
  upsertBuffer(makeBuffer('0x1', 1, {
    name: 'irc.eshmaki.#alpha',
    fullName: 'irc.eshmaki.#alpha',
    shortName: '#alpha',
    localVars: { type: 'channel', server: 'eshmaki', channel: '#alpha' },
  }));
  upsertBuffer(makeBuffer('0x2', 2, {
    name: 'irc.eshmaki.#beta',
    fullName: 'irc.eshmaki.#beta',
    shortName: '#beta',
    localVars: { type: 'channel', server: 'eshmaki', channel: '#beta' },
  }));
  upsertBuffer(makeBuffer('0x3', 3, {
    name: 'irc.eshmaki.trev',
    fullName: 'irc.eshmaki.trev',
    shortName: 'trev',
    localVars: { type: 'private', server: 'eshmaki', channel: 'trev' },
  }));
}

/** Mounted the way App mounts it: gated on the ui store's active modal. */
function renderPalette() {
  return render(() => (
    <Show when={uiState.activeModal === 'bufferSwitcher'}>
      <BufferSwitcher />
    </Show>
  ));
}

const PLACEHOLDER = 'Search buffers and actions...';

beforeAll(() => {
  // jsdom has no scrollIntoView; the palette keeps its selection visible.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  globalThis.localStorage?.clear();
  clearBuffers();
  closeModal();
  setTheme('darkbear');
  arrangeBuffers();
  openModal('bufferSwitcher');
});

afterEach(() => {
  cleanup();
  closeModal();
  clearBuffers();
});

describe('BufferSwitcher command palette', () => {
  it('renders buffers and actions groups when opened', () => {
    const { getByText, getByPlaceholderText } = renderPalette();

    expect(getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
    // Buffers group.
    expect(getByText('#alpha')).toBeInTheDocument();
    expect(getByText('trev')).toBeInTheDocument();
    // Actions group — always-available action.
    expect(getByText('Open settings')).toBeInTheDocument();
  });

  it('renders nothing while the modal is closed', () => {
    closeModal();
    const { container } = renderPalette();
    expect(container.innerHTML).toBe('');
  });

  it('exposes a listbox with a roving aria-activedescendant', () => {
    const { getByPlaceholderText, container } = renderPalette();
    const input = getByPlaceholderText(PLACEHOLDER);

    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    // First row is active on open.
    expect(input.getAttribute('aria-activedescendant')).toBe('cmdk-option-0');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('cmdk-option-1');
  });

  it('narrows to matching commands when typing a filter', () => {
    const { getByPlaceholderText, getByText, queryByText } = renderPalette();

    fireEvent.input(getByPlaceholderText(PLACEHOLDER), { target: { value: 'bet' } });

    expect(getByText('#beta')).toBeInTheDocument();
    expect(queryByText('#alpha')).toBeNull();
    expect(queryByText('trev')).toBeNull();
    expect(queryByText('Open settings')).toBeNull();
  });

  it('jumps to the highlighted buffer with ArrowDown + Enter and closes', () => {
    const { getByPlaceholderText } = renderPalette();
    const input = getByPlaceholderText(PLACEHOLDER);

    // Buffers sort by number: #alpha, #beta, trev. One ArrowDown → #beta.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(buffersState.activeBuffer).toBe('0x2');
    expect(uiState.activeModal).toBeNull();
  });

  it('wraps ArrowUp from the first row to the last and dispatches it', () => {
    const setAttr = vi.spyOn(document.documentElement, 'setAttribute');
    const { getByPlaceholderText } = renderPalette();
    const input = getByPlaceholderText(PLACEHOLDER);

    // The last row (no active buffer) is the final theme action — "Light".
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(setAttr).toHaveBeenCalledWith('data-theme', 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(uiState.activeModal).toBeNull();
  });

  it('dispatches the Open settings action, keeping settings open past the palette close', () => {
    const { getByText } = renderPalette();

    fireEvent.click(getByText('Open settings'));

    // run() closes the palette FIRST, then opens settings — the single
    // activeModal slot ends on 'settings', not null.
    expect(uiState.activeModal).toBe('settings');
  });

  it('dispatches a buffer-scoped Mute action for the active buffer', () => {
    setActiveBuffer('0x1');
    const { getByPlaceholderText, getByText } = renderPalette();

    fireEvent.input(getByPlaceholderText(PLACEHOLDER), { target: { value: 'mute alpha' } });
    fireEvent.click(getByText('Mute — #alpha'));

    expect(isMuted('0x1')).toBe(true);
    expect(uiState.activeModal).toBeNull();
  });

  it('closes on Escape without changing the active buffer', () => {
    const { getByPlaceholderText } = renderPalette();
    const active = buffersState.activeBuffer;

    fireEvent.keyDown(getByPlaceholderText(PLACEHOLDER), { key: 'Escape' });

    expect(uiState.activeModal).toBeNull();
    expect(buffersState.activeBuffer).toBe(active);
  });

  it('closes when the backdrop is clicked', () => {
    const { getByPlaceholderText, container } = renderPalette();

    // The palette now renders inside the shared Modal shell, whose dimming
    // backdrop is bg-black/60 and closes via the shell's onClose.
    const backdrop = container.querySelector('.bg-black\\/60');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    expect(uiState.activeModal).toBeNull();
    expect(() => getByPlaceholderText(PLACEHOLDER)).toThrow();
  });

  it('renders inside the Modal shell as a dialog with the combobox+listbox inside', () => {
    const { container, getByPlaceholderText } = renderPalette();

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    // The combobox input and the listbox live inside the dialog panel.
    expect(dialog!.contains(getByPlaceholderText(PLACEHOLDER))).toBe(true);
    expect(dialog!.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('moves initial focus onto the search input via the shell', () => {
    const { getByPlaceholderText } = renderPalette();
    expect(document.activeElement).toBe(getByPlaceholderText(PLACEHOLDER));
  });

  it('traps Tab within the dialog — focus cannot escape the palette', () => {
    const { getByPlaceholderText, container } = renderPalette();
    const input = getByPlaceholderText(PLACEHOLDER);
    const dialog = container.querySelector('[role="dialog"]');
    expect(document.activeElement).toBe(input);

    // The listbox rows are role=option divs, not tab stops, so the input is the
    // only focusable node — the shell wraps Tab/Shift+Tab back onto it.
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(dialog!.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(dialog!.contains(document.activeElement)).toBe(true);
  });

  it('Escape closes the palette and restores focus to the opener', () => {
    // An opener with focus before the palette mounts — the shell records it and
    // must hand focus back on close.
    const opener = document.createElement('button');
    opener.textContent = 'open palette';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    try {
      const { getByPlaceholderText } = renderPalette();
      const input = getByPlaceholderText(PLACEHOLDER);
      expect(document.activeElement).toBe(input);

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(uiState.activeModal).toBeNull();
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
    }
  });
});
