// @vitest-environment jsdom
//
// InputBar reply-chip tests: the "Replying to …" chip shows while a pending
// reply target is set for the active buffer, its × clears the target (and the
// chip disappears reactively), and sending threads the message through the
// direct-bridge reply path with the parent msgid, clearing the target.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import type { WeeChatBuffer } from '@/lib/weechat/model';
import { clearBuffers, resetSettings, setActiveBuffer, upsertBuffer } from '@/state';
import { pendingReplyFor, resetThreads, setPendingReply } from '@/state/threads';
import { sendReply } from '@/core/bridge';
import InputBar from './InputBar';

vi.mock('@/core/bridge', () => ({ sendReply: vi.fn(() => true) }));

vi.mock('@/state/bridge', () => ({
  bridgeState: { status: 'off', nick: null, error: null, e2eeReady: false },
  _setBridgeState: vi.fn(),
  _setBridgeBackend: vi.fn(),
  bridgeRun: vi.fn(),
  sendTyping: vi.fn(),
  sendReactionTag: vi.fn(),
  markRead: vi.fn(),
  canE2ee: vi.fn(() => false),
  _storeDecryptedOverlay: vi.fn(),
  decryptedFor: vi.fn(() => null),
  _setPeerDmKey: vi.fn(),
  _ingestEncryptedDm: vi.fn(),
  sendE2eeDm: vi.fn(async () => false),
}));

const sendReplyMock = vi.mocked(sendReply);

const CHANNEL: WeeChatBuffer = {
  id: '0xb',
  number: 1,
  name: 'irc.eshmaki.#root',
  fullName: 'irc.eshmaki.#root',
  shortName: '#root',
  title: '',
  type: 0,
  nicksCount: 0,
  localVars: { type: 'channel', server: 'eshmaki', channel: '#root' },
  notify: 0,
  hidden: false,
};

beforeEach(() => {
  resetThreads();
  clearBuffers();
  resetSettings();
  // jsdom has no layout; InputBar scrolls the wrapper into view on focus.
  Element.prototype.scrollIntoView = vi.fn();
  upsertBuffer(CHANNEL);
  setActiveBuffer('0xb');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('InputBar reply chip', () => {
  it('shows the chip with the parent nick and preview when a reply is pending', () => {
    setPendingReply('0xb', { msgid: 'm1', nick: 'alice', preview: 'the original line' });
    const { getByText } = render(() => <InputBar />);
    expect(getByText('Replying to alice')).toBeInTheDocument();
    expect(getByText('the original line')).toBeInTheDocument();
  });

  it('renders no chip when nothing is pending', () => {
    const { queryByText } = render(() => <InputBar />);
    expect(queryByText(/Replying to/)).toBeNull();
  });

  it('× clears the pending reply and hides the chip reactively', () => {
    setPendingReply('0xb', { msgid: 'm1', nick: 'alice', preview: 'hi' });
    const { getByLabelText, queryByText } = render(() => <InputBar />);
    fireEvent.click(getByLabelText('Cancel reply'));
    expect(pendingReplyFor('0xb')).toBeUndefined();
    expect(queryByText(/Replying to/)).toBeNull();
  });

  it('threads the send with the parent msgid and clears the target', () => {
    setPendingReply('0xb', { msgid: 'm1', nick: 'alice', preview: 'hi' });
    const { getByPlaceholderText } = render(() => <InputBar />);
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;
    fireEvent.input(box, { target: { value: 'my reply' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(sendReplyMock).toHaveBeenCalledWith('0xb', 'my reply', 'm1');
    expect(pendingReplyFor('0xb')).toBeUndefined();
  });

  it('leaves the pending reply intact when a slash command is sent', () => {
    setPendingReply('0xb', { msgid: 'm1', nick: 'alice', preview: 'hi' });
    const { getByPlaceholderText } = render(() => <InputBar />);
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;
    fireEvent.input(box, { target: { value: '/help' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(sendReplyMock).not.toHaveBeenCalled();
    expect(pendingReplyFor('0xb')).toEqual({ msgid: 'm1', nick: 'alice', preview: 'hi' });
  });
});
