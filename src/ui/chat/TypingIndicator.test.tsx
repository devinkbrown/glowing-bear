// TypingIndicator render tests — text variants for 1/2/N typers, the
// empty-state gate, and the active-only filter. State is arranged through the
// buffers store actions (components self-wire to the module singletons).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import type { WeeChatBuffer } from '@/types';
import { clearBuffers, setTyping, upsertBuffer } from '@/state';
import TypingIndicator from './TypingIndicator';

const PTR = '0xt';

function makeBuffer(id: string, over: Partial<WeeChatBuffer> = {}): WeeChatBuffer {
  return {
    id,
    number: 1,
    name: 'irc.eshmaki.#alpha',
    fullName: 'irc.eshmaki.#alpha',
    shortName: '#alpha',
    title: '',
    type: 0,
    nicksCount: 0,
    localVars: { type: 'channel', server: 'eshmaki', channel: '#alpha' },
    notify: 0,
    hidden: false,
    ...over,
  };
}

beforeEach(() => {
  globalThis.localStorage?.clear();
  clearBuffers();
  upsertBuffer(makeBuffer(PTR));
});

afterEach(() => {
  cleanup();
  clearBuffers();
});

describe('TypingIndicator', () => {
  it('renders "X is typing" for a single typer', () => {
    setTyping(PTR, 'alice', 'active');
    const { getByText } = render(() => <TypingIndicator bufferPtr={PTR} />);
    expect(getByText('alice is typing')).toBeInTheDocument();
  });

  it('renders "X and Y are typing" for two typers', () => {
    setTyping(PTR, 'alice', 'active');
    setTyping(PTR, 'bob', 'active');
    const { getByText } = render(() => <TypingIndicator bufferPtr={PTR} />);
    expect(getByText('alice and bob are typing')).toBeInTheDocument();
  });

  it('renders "X and N others are typing" for three or more typers', () => {
    setTyping(PTR, 'alice', 'active');
    setTyping(PTR, 'bob', 'active');
    setTyping(PTR, 'carol', 'active');
    const { getByText } = render(() => <TypingIndicator bufferPtr={PTR} />);
    expect(getByText('alice and 2 others are typing')).toBeInTheDocument();
  });

  it('renders nothing when nobody is typing', () => {
    const { container } = render(() => <TypingIndicator bufferPtr={PTR} />);
    expect(container.innerHTML).toBe('');
  });

  it('ignores paused typers (only active entries count)', () => {
    setTyping(PTR, 'alice', 'paused');
    const { container } = render(() => <TypingIndicator bufferPtr={PTR} />);
    expect(container.innerHTML).toBe('');
  });

  it('updates live when a typer appears in the store after mount', () => {
    const { container, getByText } = render(() => <TypingIndicator bufferPtr={PTR} />);
    expect(container.innerHTML).toBe('');
    setTyping(PTR, 'dave', 'active');
    expect(getByText('dave is typing')).toBeInTheDocument();
  });
});
