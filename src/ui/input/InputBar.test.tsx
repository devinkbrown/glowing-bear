// @vitest-environment jsdom
//
// InputBar reply-chip tests: the "Replying to …" chip shows while a pending
// reply target is set for the active buffer, its × clears the target (and the
// chip disappears reactively), and sending threads the message through the
// direct-bridge reply path with the parent msgid, clearing the target.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import type { WeeChatBuffer } from '@/lib/weechat/model';
import {
  buffersState,
  clearBuffers,
  clearDraftsAndHistory,
  clearIrcx,
  getDraft,
  markOnyxServer,
  resetSettings,
  setSessionKind,
  resetUploads,
  restoreComposerDraft,
  setActiveBuffer,
  updateSettings,
  updateBridge,
  uploadQueueState,
  upsertBuffer,
} from '@/state';
import { canE2ee, dmSecurityFor, sendE2eeDm } from '@/state/bridge';
import { pendingReplyFor, resetThreads, setPendingReply } from '@/state/threads';
import { sendReply } from '@/core/bridge';
import InputBar from './InputBar';

const inputMocks = vi.hoisted(() => ({
  sendInput: vi.fn((_text: string, _pointer?: string) => true),
}));

vi.mock('@/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/state')>();
  return { ...actual, sendInput: inputMocks.sendInput };
});

vi.mock('@/lib/upload/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/upload/upload')>();
  return {
    ...actual,
    uploadFile: vi.fn(async (file: File) => ({ url: `https://uploads.example/${file.name}` })),
  };
});

vi.mock('@/core/bridge', () => ({ sendReply: vi.fn(() => true) }));

vi.mock('@/state/bridge', () => ({
  bridgeState: { status: 'off', nick: null, error: null, e2eeReady: false },
  _setBridgeState: vi.fn(),
  _setBridgeBackend: vi.fn(),
  bridgeRun: vi.fn(),
  sendTyping: vi.fn(),
  sendReactionTag: vi.fn(),
  markRead: vi.fn(),
  refreshPeerDmKey: vi.fn(),
  canE2ee: vi.fn(() => false),
  dmSecurityFor: vi.fn((nick: string) => ({
    nick,
    status: 'unavailable',
    currentFingerprint: null,
    pinnedFingerprint: null,
    verifiedAt: null,
  })),
  _storeDecryptedOverlay: vi.fn(),
  decryptedFor: vi.fn(() => null),
  _setPeerDmKey: vi.fn(),
  _ingestEncryptedDm: vi.fn(),
  sendE2eeDm: vi.fn(async () => false),
  verifyPeerDmKey: vi.fn(async () => false),
  forgetPeerDmTrust: vi.fn(async () => false),
}));

const sendReplyMock = vi.mocked(sendReply);
const dmSecurityForMock = vi.mocked(dmSecurityFor);
const canE2eeMock = vi.mocked(canE2ee);
const sendE2eeDmMock = vi.mocked(sendE2eeDm);

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

const QUERY: WeeChatBuffer = {
  id: '0xq',
  number: 2,
  name: 'irc.eshmaki.alice',
  fullName: 'irc.eshmaki.alice',
  shortName: 'alice',
  title: '',
  type: 0,
  nicksCount: 0,
  localVars: { type: 'private', server: 'eshmaki', channel: 'alice' },
  notify: 0,
  hidden: false,
};

beforeEach(() => {
  resetThreads();
  clearBuffers();
  clearIrcx();
  resetSettings();
  setSessionKind('weechat-generic');
  resetUploads();
  clearDraftsAndHistory();
  inputMocks.sendInput.mockReturnValue(true);
  // jsdom has no layout; InputBar scrolls the wrapper into view on focus.
  Element.prototype.scrollIntoView = vi.fn();
  dmSecurityForMock.mockImplementation((nick) => ({
    nick,
    status: 'unavailable',
    currentFingerprint: null,
    pinnedFingerprint: null,
    verifiedAt: null,
  }));
  sendE2eeDmMock.mockResolvedValue(false);
  canE2eeMock.mockReturnValue(false);
  upsertBuffer(CHANNEL);
  setActiveBuffer('0xb');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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

  it('does not submit an unfinished IME composition on Enter', () => {
    setPendingReply('0xb', { msgid: 'm1', nick: 'alice', preview: 'hi' });
    const { getByPlaceholderText } = render(() => <InputBar />);
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;
    fireEvent.input(box, { target: { value: '日本語' } });

    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });

    expect(box).toHaveValue('日本語');
    expect(sendReplyMock).not.toHaveBeenCalled();
    expect(pendingReplyFor('0xb')).toBeDefined();
  });
});

describe('InputBar verified encryption policy', () => {
  it('keeps the encrypted DM in the composer when the bridge socket rejects it', async () => {
    clearBuffers();
    upsertBuffer(QUERY);
    setActiveBuffer('0xq');
    updateBridge({ e2eeDms: true, e2eePolicy: 'opportunistic' });
    canE2eeMock.mockReturnValue(true);
    sendE2eeDmMock.mockResolvedValue(false);

    const { findByText, getByPlaceholderText } = render(() => <InputBar />);
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;
    fireEvent.input(box, { target: { value: 'retain after socket race' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await findByText(/encryption for alice failed/i)).toBeInTheDocument();
    expect(box).toHaveValue('retain after socket race');
    expect(sendE2eeDmMock).toHaveBeenCalledWith('alice', 'retain after socket race');
  });

  it('keeps the message in the composer when the peer key is not verified', async () => {
    clearBuffers();
    upsertBuffer(QUERY);
    setActiveBuffer('0xq');
    updateBridge({ e2eeDms: true, e2eePolicy: 'verified' });
    dmSecurityForMock.mockReturnValue({
      nick: 'alice',
      status: 'unverified',
      currentFingerprint: 'AAAA BBBB',
      pinnedFingerprint: null,
      verifiedAt: null,
    });
    canE2eeMock.mockReturnValue(true);

    const { findByText, getByPlaceholderText } = render(() => <InputBar />);
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;
    fireEvent.input(box, { target: { value: 'do not leak this' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await findByText(/verified encryption is required for alice/i)).toBeInTheDocument();
    expect(box).toHaveValue('do not leak this');
    expect(sendE2eeDmMock).not.toHaveBeenCalled();
  });

  it('blocks a changed verified key even in opportunistic mode', async () => {
    clearBuffers();
    upsertBuffer(QUERY);
    setActiveBuffer('0xq');
    updateBridge({ e2eeDms: true, e2eePolicy: 'opportunistic' });
    dmSecurityForMock.mockReturnValue({
      nick: 'alice',
      status: 'changed',
      currentFingerprint: 'CCCC DDDD',
      pinnedFingerprint: 'AAAA BBBB',
      verifiedAt: 1,
    });

    const { findByText, getByPlaceholderText } = render(() => <InputBar />);
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;
    fireEvent.input(box, { target: { value: 'rotation safety' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await findByText(/verified device key changed/i)).toBeInTheDocument();
    expect(box).toHaveValue('rotation safety');
    expect(sendE2eeDmMock).not.toHaveBeenCalled();
  });
});

describe('InputBar relay acknowledgement', () => {
  it('keeps a rejected message and accepts an immediate retry', async () => {
    inputMocks.sendInput.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { findByText, getByPlaceholderText } = render(() => <InputBar />);
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;
    fireEvent.input(box, { target: { value: 'retry me' } });

    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await findByText('Relay is not connected. Your message was kept for retry.')).toBeInTheDocument();
    expect(box).toHaveValue('retry me');
    expect(inputMocks.sendInput).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(box).toHaveValue(''));
    expect(inputMocks.sendInput).toHaveBeenCalledTimes(2);
  });

  it('marks drafted upload URLs sent only after relay acceptance', async () => {
    setSessionKind('weechat-onyx');
    markOnyxServer('eshmaki');
    inputMocks.sendInput.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { findByText, getByLabelText, getByPlaceholderText } = render(() => <InputBar />);
    const chooser = getByLabelText('Choose files to upload') as HTMLInputElement;
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;

    fireEvent.change(chooser, {
      target: { files: [new File(['hello'], 'note.txt', { type: 'text/plain' })] },
    });
    await waitFor(() => expect(box).toHaveValue('https://uploads.example/note.txt'));
    expect(uploadQueueState.items[0]).toMatchObject({ drafted: true, inserted: false });

    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await findByText('Relay is not connected. Your message was kept for retry.')).toBeInTheDocument();
    expect(box).toHaveValue('https://uploads.example/note.txt');
    expect(uploadQueueState.items[0]).toMatchObject({ drafted: true, inserted: false });

    fireEvent.input(box, {
      target: { value: 'please review https://uploads.example/note.txt when ready' },
    });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(box).toHaveValue(''));
    expect(uploadQueueState.items[0]).toMatchObject({ drafted: true, inserted: true });
  });

  it('does not mark a drafted upload sent when its URL was edited into a longer token', async () => {
    setSessionKind('weechat-onyx');
    markOnyxServer('eshmaki');
    const { getByLabelText, getByPlaceholderText } = render(() => <InputBar />);
    const chooser = getByLabelText('Choose files to upload') as HTMLInputElement;
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;

    fireEvent.change(chooser, {
      target: { files: [new File(['hello'], 'a', { type: 'text/plain' })] },
    });
    await waitFor(() => expect(box).toHaveValue('https://uploads.example/a'));

    fireEvent.input(box, { target: { value: 'https://uploads.example/abc' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => expect(box).toHaveValue(''));
    expect(inputMocks.sendInput).toHaveBeenCalledWith('https://uploads.example/abc', '0xb');
    expect(uploadQueueState.items[0]).toMatchObject({ drafted: true, inserted: false });
  });

  it('shows an externally restored failed reply in the active persisted draft', async () => {
    const { getByPlaceholderText } = render(() => <InputBar />);
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;
    const entry = buffersState.buffers['0xb'];

    expect(restoreComposerDraft(entry, 'failed notification reply')).toBe(true);

    await waitFor(() => expect(box).toHaveValue('failed notification reply'));
    expect(getDraft(CHANNEL.fullName)).toBe('failed notification reply');
  });

  it('hides GIF and attach on a generic IRC buffer', () => {
    const { queryByLabelText } = render(() => <InputBar />);
    expect(queryByLabelText('GIF picker')).toBeNull();
    expect(queryByLabelText('Upload file')).toBeNull();
  });

  it('keeps the composer on the same 72ch measure as the transcript', () => {
    const { getByTestId } = render(() => <InputBar />);
    expect(getByTestId('composer-measure').className).toContain('max-w-[72ch]');
  });

  it('restores a selected GIF URL when relay dispatch is rejected', async () => {
    setSessionKind('weechat-onyx');
    markOnyxServer('eshmaki');
    updateSettings({ tenorApiKey: 'test-key' });
    inputMocks.sendInput.mockReturnValueOnce(false);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({
        results: [{
          id: 'gif-1',
          title: 'Retry GIF',
          media_formats: {
            gif: { url: 'https://tenor.example/retry.gif', dims: [320, 240] },
            tinygif: { url: 'https://tenor.example/retry-preview.gif', dims: [160, 120] },
          },
        }],
      }),
    })));
    const { findByRole, findByText, getByLabelText, getByPlaceholderText } = render(() => <InputBar />);
    const box = getByPlaceholderText('Message...') as HTMLTextAreaElement;

    fireEvent.click(getByLabelText('GIF picker'));
    fireEvent.click(await findByRole('button', { name: 'Retry GIF' }));

    await findByText('Relay is not connected. Your message was kept for retry.');
    await waitFor(() => expect(box).toHaveValue('https://tenor.example/retry.gif'));
    expect(getDraft(CHANNEL.fullName)).toBe('https://tenor.example/retry.gif');
  });
});
