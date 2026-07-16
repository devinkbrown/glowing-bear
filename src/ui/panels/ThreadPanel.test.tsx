import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import type { WeeChatBuffer, WeeChatLine } from '@/types';
import { addLines, clearBuffers, upsertBuffer } from '@/state/buffers';
import {
  openThread,
  resetThreads,
  threadReadThroughFor,
  threadsState,
} from '@/state/threads';
import { requestHistoryTotal, sendTo } from '@/state';
import { sendReply } from '@/core/bridge';
import ThreadPanel from './ThreadPanel';

vi.mock('@/core/bridge', () => ({ sendReply: vi.fn(() => true) }));
vi.mock('@/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/state')>();
  return {
    ...actual,
    requestHistoryTotal: vi.fn(),
    sendTo: vi.fn(() => true),
    setActive: vi.fn(),
  };
});

const PTR = '0xb';
const BUFFER_KEY = 'irc.fixture.#darkbear';

function buffer(id = PTR): WeeChatBuffer {
  return {
    id, number: 1, name: BUFFER_KEY, fullName: BUFFER_KEY, shortName: '#darkbear',
    title: '', type: 0, nicksCount: 0,
    localVars: { type: 'channel', channel: '#darkbear', server: 'fixture' },
    notify: 3, hidden: false,
  };
}

function line(id: string, msgid: string, replyTo?: string, nick = 'alice', ms = 1000): WeeChatLine {
  const date = new Date(ms);
  return {
    id, buffer: PTR, date, datePrinted: date, displayed: true, highlight: false,
    tags: [], prefix: nick, message: `${nick} says ${id}`, nick,
    ircTags: new Map(), msgid, replyTo,
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: true,
      media: '(min-width: 1024px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  clearBuffers();
  resetThreads();
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('ThreadPanel', () => {
  it('traps keyboard focus and restores the thread opener on Escape', async () => {
    upsertBuffer(buffer());
    addLines(PTR, [line('root-line', 'root', undefined, 'alice', 1000)]);
    let opener!: HTMLButtonElement;
    const { getByPlaceholderText, getByRole } = render(() => (
      <>
        <button
          ref={opener}
          type="button"
          onClick={() => openThread(PTR, BUFFER_KEY, 'root')}
        >
          Open thread test
        </button>
        <Show when={threadsState.activeThread !== null}><ThreadPanel /></Show>
      </>
    ));

    opener.focus();
    fireEvent.click(opener);
    const panel = getByRole('dialog', { name: 'Message thread' });
    const close = getByRole('button', { name: 'Close thread panel' });
    const composer = getByPlaceholderText('Reply in thread…');
    await vi.waitFor(() => expect(close).toHaveFocus());
    expect(opener).toHaveAttribute('inert');

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(composer).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
    expect(panel.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(threadsState.activeThread).toBeNull();
    expect(opener).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });

  it('shows root, ordered replies, participants and sends a root-scoped reply', async () => {
    upsertBuffer(buffer());
    addLines(PTR, [
      line('root-line', 'root', undefined, 'alice', 1000),
      line('reply-two', 'r2', 'r1', 'carol', 3000),
      line('reply-one', 'r1', 'root', 'bob', 2000),
    ]);
    openThread(PTR, BUFFER_KEY, 'root');

    const { getAllByRole, getByText, getByPlaceholderText, getByRole, container } = render(() => <ThreadPanel />);

    expect(getByText('alice says root-line')).toBeInTheDocument();
    expect(getByText('2 replies · 3 participants')).toBeInTheDocument();
    expect(getByText('2 unread')).toBeInTheDocument();
    expect([...container.querySelectorAll('[data-thread-message]')].map((node) => node.getAttribute('data-thread-message')))
      .toEqual(['root', 'r1', 'r2']);

    fireEvent.click(getAllByRole('button', { name: /Jump/ })[0]!);
    expect(threadsState.scrollRequest?.msgid).toBe('root');

    addLines(PTR, [line('reply-three', 'r3', 'root', 'dave', 4000)]);
    await waitFor(() => expect(getByText('3 replies · 4 participants')).toBeInTheDocument());
    expect(getByText('3 unread')).toBeInTheDocument();

    fireEvent.input(getByPlaceholderText('Reply in thread…'), { target: { value: 'thread response' } });
    fireEvent.keyDown(getByPlaceholderText('Reply in thread…'), { key: 'Enter', isComposing: true });
    expect(vi.mocked(sendReply)).not.toHaveBeenCalled();
    expect(getByPlaceholderText('Reply in thread…')).toHaveValue('thread response');
    fireEvent.click(getByRole('button', { name: 'Send thread reply' }));
    expect(vi.mocked(sendReply)).toHaveBeenCalledWith(PTR, 'thread response', 'root');
    expect(getByPlaceholderText('Reply in thread…')).toHaveValue('');

    fireEvent.click(getByRole('button', { name: 'Close thread panel' }));
    expect(threadsState.activeThread).toBeNull();
    expect(threadReadThroughFor(BUFFER_KEY, 'root')).toBe(4000);
  });

  it('retains a reply until either direct or relay delivery accepts it', () => {
    upsertBuffer(buffer());
    addLines(PTR, [line('root-line', 'root', undefined, 'alice', 1000)]);
    openThread(PTR, BUFFER_KEY, 'root');
    vi.mocked(sendReply).mockReturnValue(false);
    vi.mocked(sendTo).mockReturnValue(false);

    const { getByPlaceholderText, getByRole } = render(() => <ThreadPanel />);
    const composer = getByPlaceholderText('Reply in thread…');
    fireEvent.input(composer, { target: { value: 'keep this reply' } });
    fireEvent.click(getByRole('button', { name: 'Send thread reply' }));

    expect(vi.mocked(sendTo)).toHaveBeenCalledWith(PTR, 'keep this reply');
    expect(composer).toHaveValue('keep this reply');

    vi.mocked(sendTo).mockReturnValue(true);
    fireEvent.click(getByRole('button', { name: 'Send thread reply' }));
    expect(composer).toHaveValue('');
  });

  it('resolves a stable buffer after pointer churn and requests a missing root', async () => {
    const nextPtr = '0xc';
    upsertBuffer(buffer(nextPtr));
    addLines(nextPtr, [{ ...line('reply', 'r1', 'missing-root', 'bob', 2000), buffer: nextPtr }]);
    openThread('stale-pointer', BUFFER_KEY, 'missing-root');

    const { getByText } = render(() => <ThreadPanel />);

    expect(getByText('Loading the thread root from relay history…')).toBeInTheDocument();
    expect(getByText('bob says reply')).toBeInTheDocument();
    await waitFor(() => {
      expect(vi.mocked(requestHistoryTotal)).toHaveBeenCalledWith(501, nextPtr);
    });

    addLines(nextPtr, [{
      ...line('loaded-parent', 'missing-root', 'actual-root', 'alice', 1000),
      buffer: nextPtr,
    }], true);
    await waitFor(() => expect(threadsState.activeThread?.rootMsgid).toBe('actual-root'));
  });
});
