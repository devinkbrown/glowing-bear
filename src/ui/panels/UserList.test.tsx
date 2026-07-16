// UserList render tests — tier grouping from nick prefixes, member rows,
// the total count badge, and the per-nick action popup.
//
// State is arranged via the buffers store actions; '@/state/media' is mocked
// with a hand-rolled module exposing the documented contract so importing the
// real media engine (and its bridge wiring) is avoided.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import type { WeeChatBuffer, WeeChatNick } from '@/types';
import { clearBuffers, clearIrcx, setActiveBuffer, setNicklist, upsertBuffer } from '@/state';
import UserList from './UserList';

vi.mock('@/state/media', () => ({
  mediaState: {
    callState: 'idle',
    channel: null,
    kind: 'voice',
    callWith: null,
    startedAt: null,
    peers: {},
    selfMuted: false,
    selfDeafened: false,
    cameraOn: false,
    screenSharing: false,
    speakingNick: null,
    minimized: false,
    spotlightNick: null,
    error: null,
    mediaAvailable: true,
    preflight: { open: false },
  },
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  startCall: vi.fn(),
  acceptCall: vi.fn(),
  requestRoomJoin: vi.fn(),
  requestStartCall: vi.fn(),
  requestAcceptCall: vi.fn(),
  rejectCall: vi.fn(),
  hangup: vi.fn(),
  toggleMute: vi.fn(),
  toggleDeafen: vi.fn(),
  toggleCamera: vi.fn(),
  toggleScreenShare: vi.fn(),
  setMinimized: vi.fn(),
  setSpotlight: vi.fn(),
  sendRoomReaction: vi.fn(),
  peerStream: vi.fn(() => null),
  selfPreviewStream: vi.fn(() => null),
}));

const PTR = '0xc';

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

/** WeeChatNick fixture — the prefix field carries the privilege sigil. */
function makeNick(name: string, prefix: string): WeeChatNick {
  return {
    id: `n_${name}`,
    pointer: PTR,
    level: 0,
    name,
    color: '',
    prefix,
    prefixColor: '',
    visible: true,
    group: false,
  };
}

function arrangeChannel(): void {
  upsertBuffer(makeBuffer(PTR));
  setActiveBuffer(PTR);
  setNicklist(PTR, [
    makeNick('op1', '@'),
    makeNick('voice1', '+'),
    makeNick('reg1', ''),
  ]);
}

beforeEach(() => {
  globalThis.localStorage?.clear();
  clearBuffers();
  clearIrcx();
  arrangeChannel();
});

afterEach(() => {
  cleanup();
  clearBuffers();
  vi.clearAllMocks();
});

describe('UserList', () => {
  it('groups nicks into tiers with a header per tier', () => {
    const { getByText } = render(() => <UserList />);

    expect(getByText('Op')).toBeInTheDocument();
    expect(getByText('Voice')).toBeInTheDocument();
    expect(getByText('Regular')).toBeInTheDocument();

    expect(getByText('op1')).toBeInTheDocument();
    expect(getByText('voice1')).toBeInTheDocument();
    expect(getByText('reg1')).toBeInTheDocument();
  });

  it('shows the total member count in the panel header', () => {
    const { getByText } = render(() => <UserList />);
    // Header count badge: 3 visible non-group nicks.
    expect(getByText('3')).toBeInTheDocument();
  });

  it('shows the privilege sigil badge on tiered members', () => {
    const { getByTitle } = render(() => <UserList />);
    expect(getByTitle('op1').textContent).toContain('@');
    expect(getByTitle('voice1').textContent).toContain('+');
  });

  it('opens the action popup with a Message entry when a nick is clicked', () => {
    const { getByTitle, getByText, queryByText } = render(() => <UserList />);

    expect(queryByText('Message')).toBeNull();
    fireEvent.click(getByTitle('op1'));

    expect(getByText('Message')).toBeInTheDocument();
    expect(getByText('Whois')).toBeInTheDocument();
    // Popup header shows the clicked nick's tier.
    expect(getByText('Op', { selector: 'div' })).toBeInTheDocument();
  });

  it('filters members by the search input', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(() => <UserList />);

    fireEvent.input(getByPlaceholderText('Search users...'), { target: { value: 'voice' } });

    expect(getByText('voice1')).toBeInTheDocument();
    expect(queryByText('op1')).toBeNull();
    expect(queryByText('reg1')).toBeNull();
  });

  it('does not clear the user filter when IME composition emits Escape', () => {
    const { getByPlaceholderText, getByText } = render(() => <UserList />);
    const input = getByPlaceholderText('Search users...');
    fireEvent.input(input, { target: { value: 'voice' } });

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(input).toHaveValue('voice');
    expect(getByText('voice1')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(getByText('op1')).toBeInTheDocument();
  });
});
