// BufferSwitcher render tests — modal gating via the ui store, fuzzy filter,
// and keyboard navigation (ArrowDown + Enter activates the highlighted row).

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import type { WeeChatBuffer } from '@/types';
import { buffersState, clearBuffers, closeModal, openModal, uiState, upsertBuffer } from '@/state';
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
function renderSwitcher() {
  return render(() => (
    <Show when={uiState.activeModal === 'bufferSwitcher'}>
      <BufferSwitcher />
    </Show>
  ));
}

beforeAll(() => {
  // jsdom has no scrollIntoView; the switcher keeps its selection visible.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  globalThis.localStorage?.clear();
  clearBuffers();
  closeModal();
  arrangeBuffers();
  openModal('bufferSwitcher');
});

afterEach(() => {
  cleanup();
  closeModal();
  clearBuffers();
});

describe('BufferSwitcher', () => {
  it('renders all buffers when opened via the ui store', () => {
    const { getByText, getByPlaceholderText } = renderSwitcher();

    expect(getByPlaceholderText('Jump to channel...')).toBeInTheDocument();
    expect(getByText('#alpha')).toBeInTheDocument();
    expect(getByText('#beta')).toBeInTheDocument();
    expect(getByText('trev')).toBeInTheDocument();
  });

  it('renders nothing while the modal is closed', () => {
    closeModal();
    const { container } = renderSwitcher();
    expect(container.innerHTML).toBe('');
  });

  it('narrows the list when typing a filter', () => {
    const { getByPlaceholderText, getByText, queryByText } = renderSwitcher();

    fireEvent.input(getByPlaceholderText('Jump to channel...'), { target: { value: 'bet' } });

    expect(getByText('#beta')).toBeInTheDocument();
    expect(queryByText('#alpha')).toBeNull();
    expect(queryByText('trev')).toBeNull();
  });

  it('activates the highlighted buffer with ArrowDown + Enter and closes', () => {
    const { getByPlaceholderText } = renderSwitcher();
    const input = getByPlaceholderText('Jump to channel...');

    // Rows are sorted by buffer number: #alpha, #beta, trev. One ArrowDown
    // moves the highlight from #alpha to #beta.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(buffersState.activeBuffer).toBe('0x2');
    expect(uiState.activeModal).toBeNull();
  });

  it('activates a row on click', () => {
    const { getByText } = renderSwitcher();

    fireEvent.click(getByText('trev'));

    expect(buffersState.activeBuffer).toBe('0x3');
    expect(uiState.activeModal).toBeNull();
  });

  it('closes on Escape without changing the active buffer', () => {
    const { getByPlaceholderText } = renderSwitcher();
    const active = buffersState.activeBuffer;

    fireEvent.keyDown(getByPlaceholderText('Jump to channel...'), { key: 'Escape' });

    expect(uiState.activeModal).toBeNull();
    expect(buffersState.activeBuffer).toBe(active);
  });

  it('closes when the backdrop is clicked', () => {
    const { getByPlaceholderText, container } = renderSwitcher();

    // The dimming backdrop covers the overlay; it is what a user clicks.
    const backdrop = container.querySelector('.bg-black\\/50');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    expect(uiState.activeModal).toBeNull();
    expect(() => getByPlaceholderText('Jump to channel...')).toThrow();
  });
});
