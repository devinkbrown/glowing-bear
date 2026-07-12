// Header render tests — buffer name, kind badge, topic, and the voice/video
// call buttons (channel room join vs 1:1 DM call).
//
// '@/state/media' is mocked with a hand-rolled module keeping the documented
// mediaState contract ({ callState: 'idle', ... }) and vi.fn() actions.
// The relay client is faked (an EventTarget) so the connection store can be
// driven to CONNECTED — the call buttons only render while connected.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import type { WeeChatBuffer } from '@/types';
import {
  clearBuffers,
  clearIrcx,
  connect,
  ConnectionState,
  disconnect,
  resetSettings,
  setActiveBuffer,
  uiState,
  upsertBuffer,
} from '@/state';
import { joinRoom, startCall } from '@/state/media';
import Header from './Header';

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
  },
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  startCall: vi.fn(),
  acceptCall: vi.fn(),
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

// Fake relay client — collected so tests can dispatch protocol events.
const relay = vi.hoisted(() => ({ clients: [] as EventTarget[] }));

vi.mock('@/lib/weechat/client', () => {
  class WeeRelayClient extends EventTarget {
    constructor(_settings: unknown) {
      super();
      relay.clients.push(this);
    }
    connect(): void {}
    disconnect(_force?: boolean): void {}
    sendPing(_arg: string): void {}
    sendInput(_pointer: string, _text: string): void {}
    requestHistory(_pointer: string, _count: number): void {}
    requestNicklist(_pointer: string): void {}
  }
  return { WeeRelayClient };
});

const joinRoomMock = vi.mocked(joinRoom);
const startCallMock = vi.mocked(startCall);

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

const CHANNEL = makeBuffer('0xc', {
  name: 'irc.eshmaki.#alpha',
  fullName: 'irc.eshmaki.#alpha',
  shortName: '#alpha',
  title: 'Welcome to alpha',
  localVars: { type: 'channel', server: 'eshmaki', channel: '#alpha' },
});

const QUERY = makeBuffer('0xq', {
  name: 'irc.eshmaki.trev',
  fullName: 'irc.eshmaki.trev',
  shortName: 'trev',
  localVars: { type: 'private', server: 'eshmaki', channel: 'trev' },
});

/** Open the (fake) relay and drive the connection store to CONNECTED. */
function goOnline(): void {
  connect();
  const client = relay.clients[relay.clients.length - 1];
  if (!client) throw new Error('fake relay client was not constructed');
  client.dispatchEvent(
    new CustomEvent('stateChanged', { detail: { state: ConnectionState.CONNECTED } }),
  );
}

beforeAll(() => {
  // jsdom has no matchMedia; Header uses createMediaQuery for mobile layout.
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
  clearIrcx();
});

afterEach(() => {
  cleanup();
  disconnect(); // stops the ping loop, clears buffers + ircx
  vi.clearAllMocks();
});

describe('Header', () => {
  it('renders the active channel name and topic (no kind badge for IRC buffers)', () => {
    upsertBuffer(CHANNEL);
    setActiveBuffer('0xc');

    const { getByText, queryByText } = render(() => <Header />);

    expect(getByText('#alpha')).toBeInTheDocument();
    expect(getByText('Welcome to alpha')).toBeInTheDocument();
    expect(queryByText('Channel')).toBeNull();
  });

  it('shows the kind badge for non-IRC buffers', () => {
    upsertBuffer(makeBuffer('0x9', {
      name: 'weechat',
      fullName: 'core.weechat',
      shortName: 'weechat',
      localVars: { plugin: 'core' },
    }));
    setActiveBuffer('0x9');

    const { getByText } = render(() => <Header />);
    expect(getByText('Core')).toBeInTheDocument();
  });

  it('shows room join buttons for a channel and routes clicks to joinRoom', () => {
    goOnline(); // connect() tears down state first, so arrange buffers after
    upsertBuffer(CHANNEL);
    setActiveBuffer('0xc');

    const { getByLabelText, queryByLabelText } = render(() => <Header />);

    expect(queryByLabelText('Voice call')).toBeNull();
    fireEvent.click(getByLabelText('Join voice'));
    expect(joinRoomMock).toHaveBeenCalledWith('#alpha', false);

    fireEvent.click(getByLabelText('Join video'));
    expect(joinRoomMock).toHaveBeenCalledWith('#alpha', true);
    expect(startCallMock).not.toHaveBeenCalled();
  });

  it('shows 1:1 call buttons for a query buffer and routes clicks to startCall', () => {
    goOnline(); // connect() tears down state first, so arrange buffers after
    upsertBuffer(QUERY);
    setActiveBuffer('0xq');

    const { getByLabelText, queryByLabelText } = render(() => <Header />);

    expect(queryByLabelText('Join voice')).toBeNull();
    fireEvent.click(getByLabelText('Voice call'));
    expect(startCallMock).toHaveBeenCalledWith('trev', false);

    fireEvent.click(getByLabelText('Video call'));
    expect(startCallMock).toHaveBeenCalledWith('trev', true);
    expect(joinRoomMock).not.toHaveBeenCalled();
  });

  it('hides the call buttons while disconnected', () => {
    upsertBuffer(CHANNEL);
    setActiveBuffer('0xc');

    const { queryByLabelText } = render(() => <Header />);
    expect(queryByLabelText('Join voice')).toBeNull();
    expect(queryByLabelText('Join video')).toBeNull();
  });

  it('opens the channel browser from the top bar while connected', () => {
    goOnline();
    upsertBuffer(CHANNEL);
    setActiveBuffer('0xc');

    const { getByLabelText } = render(() => <Header />);

    fireEvent.click(getByLabelText('Browse channels'));
    expect(uiState.activeModal).toBe('channelList');
  });
});
