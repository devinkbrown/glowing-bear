// VideoRoom teardown-contract tests — a regression guard proving the call
// surface releases every resource IT binds when it unmounts (leaving a call):
//   • each <video>.srcObject it set is nulled on cleanup,
//   • the per-tile stream-rebind poll interval is cleared (no post-unmount
//     peerStream() churn),
//   • the window 'darkbear:voice-reaction' listener is removed.
//
// VideoRoom only READS media state and BINDS streams the engine owns; it must
// null the srcObject it bound but must NOT stop tracks (MediaEngine owns track
// lifecycle). These assertions lock that boundary in.
//
// '@/state/media' + '@/state/bridge' are mocked with hand-rolled modules so the
// real media engine / bridge wiring is never imported. The mocked mediaState is
// a mutable plain object seeded before render (the flow under test is a single
// render → unmount, so mid-test reactivity is not required).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@solidjs/testing-library';

const FAKE_PEER_STREAM = { id: 'peer-stream' } as unknown as MediaStream;
const FAKE_SELF_STREAM = { id: 'self-stream' } as unknown as MediaStream;

// Mutable store shared with the component via the module mock.
const media = vi.hoisted(() => ({
  state: {
    callState: 'in_call' as string,
    channel: '#room' as string | null,
    kind: 'video' as 'voice' | 'video',
    callWith: null as string | null,
    startedAt: Date.now(),
    peers: {} as Record<string, unknown>,
    selfMuted: false,
    selfDeafened: false,
    cameraOn: true,
    screenSharing: false,
    speakingNick: null as string | null,
    raisedHands: {} as Record<string, true>,
    transcripts: {} as Record<string, unknown[]>,
    liveCaption: null as unknown,
    minimized: false,
    spotlightNick: null as string | null,
    error: null as string | null,
    mediaAvailable: true,
  },
  peerStream: vi.fn((_nick: string) => FAKE_PEER_STREAM),
  selfPreviewStream: vi.fn(() => FAKE_SELF_STREAM),
}));

vi.mock('@/state/media', () => ({
  get mediaState() {
    return media.state;
  },
  peerStream: media.peerStream,
  selfPreviewStream: media.selfPreviewStream,
  hangup: vi.fn(),
  leaveRoom: vi.fn(),
  sendRoomReaction: vi.fn(),
  setMinimized: vi.fn(),
  setSpotlight: vi.fn(),
  toggleCamera: vi.fn(),
  toggleDeafen: vi.fn(),
  toggleMute: vi.fn(),
  toggleScreenShare: vi.fn(),
}));

vi.mock('@/state/bridge', () => ({
  bridgeState: { nick: 'me', status: 'ready' },
}));

import VideoRoom from './VideoRoom';

function peerRow(nick: string) {
  return { nick, hasVideo: true, speaking: false, muted: false, audioLevel: 0 };
}

function boundVideos(): HTMLVideoElement[] {
  return Array.from(document.querySelectorAll('video')).filter(
    (v) => v.srcObject !== null,
  );
}

let playSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom does not implement play(); the bind effect does `void el.play().catch()`.
  playSpy = vi
    .spyOn(window.HTMLMediaElement.prototype, 'play')
    .mockImplementation(() => Promise.resolve());
  media.state.peers = { bob: peerRow('bob') };
  media.state.cameraOn = true;
  media.state.minimized = false;
  media.state.callState = 'in_call';
  media.peerStream.mockClear();
  media.selfPreviewStream.mockClear();
});

afterEach(() => {
  cleanup();
  playSpy.mockRestore();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('VideoRoom teardown', () => {
  it('binds the engine streams it is given onto the tile <video> elements', () => {
    render(() => <VideoRoom />);

    const srcs = boundVideos().map((v) => v.srcObject);
    // self tile (camera on) + peer tile both bind.
    expect(srcs).toContain(FAKE_SELF_STREAM);
    expect(srcs).toContain(FAKE_PEER_STREAM);
  });

  it('nulls every bound srcObject when the surface unmounts (leaving the call)', () => {
    const { unmount } = render(() => <VideoRoom />);
    expect(boundVideos().length).toBeGreaterThan(0);

    unmount();

    // No <video> retains a MediaStream reference after teardown.
    expect(boundVideos()).toHaveLength(0);
  });

  it('clears the per-tile rebind poll so no stream lookup fires after unmount', () => {
    const { unmount } = render(() => <VideoRoom />);
    unmount();

    media.peerStream.mockClear();
    media.selfPreviewStream.mockClear();
    // Advance well past several poll ticks; a leaked interval would re-query.
    vi.advanceTimersByTime(5000);

    expect(media.peerStream).not.toHaveBeenCalled();
    expect(media.selfPreviewStream).not.toHaveBeenCalled();
  });

  it('removes the voice-reaction window listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(() => <VideoRoom />);
    const added = addSpy.mock.calls.filter(
      ([type]) => (type as string) === 'darkbear:voice-reaction',
    );
    expect(added.length).toBe(1);

    unmount();

    const removed = removeSpy.mock.calls.filter(
      ([type]) => (type as string) === 'darkbear:voice-reaction',
    );
    expect(removed.length).toBe(1);
    // Same handler reference added and removed — a real detach, not a no-op.
    expect(removed[0]?.[1]).toBe(added[0]?.[1]);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('leaves track lifecycle to the engine — never stops the bound stream', () => {
    // VideoRoom must only release what it bound (null srcObject); stopping the
    // camera track is MediaEngine's job. Prove the UI never calls track.stop().
    const stop = vi.fn();
    const tracked = {
      id: 'live',
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    media.selfPreviewStream.mockReturnValue(tracked);

    const { unmount } = render(() => <VideoRoom />);
    unmount();

    expect(stop).not.toHaveBeenCalled();
    media.selfPreviewStream.mockReturnValue(FAKE_SELF_STREAM);
  });
});
