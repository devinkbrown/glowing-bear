// Sidebar render tests — server grouping, channel/DM rows, unread and
// highlight pips, buffer activation on click, and the filter input.
//
// State is arranged through the buffers store actions (components self-wire
// to the module singletons). No relay client exists in these tests, so
// selection side effects (history/nicklist requests) are silent no-ops.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import type { WeeChatBuffer } from '@/types';
import {
  buffersState,
  clearBuffers,
  resetSettings,
  updateHotlist,
  upsertBuffer,
} from '@/state';
import Sidebar from './Sidebar';

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
  // Server buffer first — it becomes the initial active buffer, so hotlist
  // counters for the channels below are applied (active buffers are skipped).
  upsertBuffer(makeBuffer('0x1', 1, {
    name: 'irc.server.eshmaki',
    fullName: 'irc.server.eshmaki',
    shortName: 'eshmaki',
    localVars: { type: 'server', server: 'eshmaki', nick: 'kain' },
  }));
  upsertBuffer(makeBuffer('0x2', 2, {
    name: 'irc.eshmaki.#alpha',
    fullName: 'irc.eshmaki.#alpha',
    shortName: '#alpha',
    localVars: { type: 'channel', server: 'eshmaki', channel: '#alpha' },
  }));
  upsertBuffer(makeBuffer('0x3', 3, {
    name: 'irc.eshmaki.#beta',
    fullName: 'irc.eshmaki.#beta',
    shortName: '#beta',
    localVars: { type: 'channel', server: 'eshmaki', channel: '#beta' },
  }));
  upsertBuffer(makeBuffer('0x4', 4, {
    name: 'irc.eshmaki.trev',
    fullName: 'irc.eshmaki.trev',
    shortName: 'trev',
    localVars: { type: 'private', server: 'eshmaki', channel: 'trev' },
  }));
  // #alpha: 3 unread messages; #beta: 2 highlights.
  updateHotlist([
    { buffer: '0x2', count: [0, 3, 0, 0] },
    { buffer: '0x3', count: [0, 0, 0, 2] },
  ]);
}

beforeAll(() => {
  // jsdom has no matchMedia; Sidebar uses createMediaQuery for mobile layout.
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
  clearBuffers();
  arrangeBuffers();
});

afterEach(() => {
  cleanup();
  clearBuffers();
});

describe('Sidebar', () => {
  it('renders the server group header, channels, and the DMs section', () => {
    const { getByText } = render(() => <Sidebar />);

    expect(getByText('eshmaki')).toBeInTheDocument();
    expect(getByText('#alpha')).toBeInTheDocument();
    expect(getByText('#beta')).toBeInTheDocument();
    expect(getByText('DMs')).toBeInTheDocument();
    expect(getByText('trev')).toBeInTheDocument();
  });

  it('shows an unread pip for #alpha and a hot highlight pip for #beta', () => {
    const { getAllByText } = render(() => <Sidebar />);

    const unreadPip = getAllByText('3').find((el) => el.classList.contains('min-w-[16px]'));
    expect(unreadPip).toBeInTheDocument();
    expect(unreadPip?.classList.contains('bg-red-500')).toBe(false);

    const hotPip = getAllByText('2').find((el) => el.classList.contains('min-w-[16px]'));
    expect(hotPip).toBeInTheDocument();
    expect(hotPip?.classList.contains('bg-red-500')).toBe(true);
  });

  it('activates a channel when its row is clicked', () => {
    const { getByText } = render(() => <Sidebar />);

    expect(buffersState.activeBuffer).toBe('0x1');
    fireEvent.click(getByText('#alpha'));

    expect(buffersState.activeBuffer).toBe('0x2');
  });

  it('activating a channel clears its unread counter', () => {
    const { getByText, queryByText } = render(() => <Sidebar />);

    fireEvent.click(getByText('#alpha'));

    expect(buffersState.buffers['0x2']?.unread).toBe(0);
    expect(queryByText('3')).toBeNull();
  });

  it('fires the onSelect hook after selecting a buffer', () => {
    const onSelect = vi.fn();
    const { getByText } = render(() => <Sidebar onSelect={onSelect} />);

    fireEvent.click(getByText('#beta'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('narrows the buffer list with the filter input', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(() => <Sidebar />);

    fireEvent.input(getByPlaceholderText('Filter buffers or text'), { target: { value: 'beta' } });

    expect(getByText('#beta')).toBeInTheDocument();
    expect(queryByText('#alpha')).toBeNull();
    expect(queryByText('trev')).toBeNull();
    // The server group header survives as the group container.
    expect(getByText('eshmaki')).toBeInTheDocument();
  });

  it('filters the buffer deck by unread and DM modes', () => {
    const { getByText, queryByText } = render(() => <Sidebar />);

    fireEvent.click(getByText('Hot'));
    expect(getByText('#alpha')).toBeInTheDocument();
    expect(getByText('#beta')).toBeInTheDocument();
    expect(queryByText('trev')).toBeNull();

    fireEvent.click(getByText('DM'));
    expect(getByText('trev')).toBeInTheDocument();
    expect(queryByText('#alpha')).toBeNull();
  });
});
