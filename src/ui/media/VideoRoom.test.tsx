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
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { resetSettings, updateSettings } from '@/state/settings';

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
    transcriptOpen: false,
    minimized: false,
    spotlightNick: null as string | null,
    error: null as string | null,
    mediaAvailable: true,
    health: {
      status: 'healthy' as 'idle' | 'healthy' | 'degraded' | 'reconnecting',
      transportConnected: true,
      tier: 0 as 0 | 1 | 2 | 3,
      suggestedBps: 400_000,
      jitterMs: 8,
      lossRate: 0.01,
      roundTripMs: 24,
      encodePressure: 0.4,
      roomStats: null as null | { active_senders: number; total_viewers: number; video_fps: number; audio_kbps: number },
      reconnectAttempt: 0,
      updatedAt: Date.now(),
    },
    observedAudioKeys: {} as Record<string, { epoch: number; fingerprint: string }>,
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
  setTranscriptOpen: vi.fn(),
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
  media.state.transcriptOpen = false;
  media.state.transcripts = {};
  media.state.liveCaption = null;
  resetSettings();
  media.state.health.status = 'healthy';
  media.state.health.transportConnected = true;
  media.state.health.tier = 0;
  media.state.health.lossRate = 0.01;
  media.state.health.reconnectAttempt = 0;
  media.state.channel = '#room';
  media.state.callWith = null;
  media.state.observedAudioKeys = {};
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
  it('exposes the compact call health inspector with readable metrics', () => {
    const view = render(() => <VideoRoom />);
    expect(view.getByLabelText('Call health: Healthy')).toBeInTheDocument();
    expect(view.getByText('Packet loss')).toBeInTheDocument();
    expect(view.getByText('1.0%')).toBeInTheDocument();
    expect(view.getByText('Full tier')).toBeInTheDocument();
    expect(view.getByText('Audio E2EE')).toBeInTheDocument();
    expect(view.getByText('Unavailable')).toBeInTheDocument();
    expect(view.getByText(/room audio e2ee signalling is incomplete/i)).toBeInTheDocument();
    expect(view.getByText(/camera video and screen share are not end-to-end encrypted/i)).toBeInTheDocument();
  });

  it('does not claim direct-call audio E2EE when the engine only reports an observed peer key', () => {
    media.state.channel = null;
    media.state.callWith = 'bob';
    media.state.observedAudioKeys = { bob: { epoch: 2, fingerprint: 'PeerKey12345' } };
    const view = render(() => <VideoRoom />);
    expect(view.getByText('Unavailable')).toBeInTheDocument();
    expect(view.getByText(/Peer audio key observed: PeerKey12345 · generation 2/)).toBeInTheDocument();
    expect(view.getByText(/audio e2ee signalling is incomplete/i)).toBeInTheDocument();
    expect(view.getByText(/camera video and screen share are not end-to-end encrypted/i)).toBeInTheDocument();
  });

  it('surfaces a fail-closed audio encryption error as an alert', () => {
    media.state.error = 'Audio encryption failed. The audio frame was dropped instead of being sent as plaintext.';
    const view = render(() => <VideoRoom />);
    expect(view.getByRole('alert')).toHaveTextContent('dropped instead of being sent as plaintext');
  });

  it('opens a speaker-labelled transcript and exposes live captions as a polite status', () => {
    const captions = [
      { channel: '#room', nick: 'alice', text: 'first caption', time: 1 },
      { channel: '#room', nick: 'bob', text: 'second caption', time: 2 },
    ];
    media.state.transcripts = { '#room': captions };
    media.state.liveCaption = captions[1];
    const view = render(() => <VideoRoom />);
    expect(view.getByRole('status', { name: '' })).toHaveTextContent('bobsecond caption');
    const transcript = view.getByRole('button', { name: 'Call transcript (2)' });
    fireEvent.click(transcript);
    // The mock state is non-reactive, so drive the view state before a fresh render.
    cleanup();
    media.state.transcriptOpen = true;
    const reopened = render(() => <VideoRoom />);
    expect(reopened.getByRole('dialog', { name: 'Call transcript' })).toBeInTheDocument();
    expect(reopened.getAllByRole('listitem')).toHaveLength(2);
  });

  it('applies local caption size and background preferences', () => {
    const caption = { channel: '#room', nick: 'alice', text: 'large caption', time: 1 };
    media.state.transcripts = { '#room': [caption] };
    media.state.liveCaption = caption;
    updateSettings({ captionSize: 'large', captionBackground: 'translucent' });
    const view = render(() => <VideoRoom />);
    const status = view.getByRole('status');
    expect(status).toHaveClass('bg-black/55');
    expect(view.getByText('large caption')).toHaveClass('text-[18px]');
  });

  it('explains a transient Onyx Server reconnect without ending the call surface', () => {
    media.state.health.status = 'reconnecting';
    media.state.health.transportConnected = false;
    media.state.health.reconnectAttempt = 2;
    const view = render(() => <VideoRoom />);
    expect(view.getByRole('status')).toHaveTextContent(
      'Onyx extras interrupted. Keeping media active while reconnecting (attempt 2).',
    );
  });

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
