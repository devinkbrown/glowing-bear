// @vitest-environment jsdom
//
// Media store transitions, driven by a fake CadenceMediaEngine. The store's
// public actions must call the right engine methods, and the engine's
// callbacks (captured from the constructor) must move mediaState correctly.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadenceMediaCallbacks, CadencePeerState } from '@/lib/cadence-media/types';

// ── fake engine harness ──────────────────────────────────────────────────────

const harness = vi.hoisted(() => ({
  callbacks: null as CadenceMediaCallbacks | null,
  engine: null as Record<string, ReturnType<typeof vi.fn>> | null,
  codecSelfTest: vi.fn<() => Promise<void>>(),
  archiveMessages: vi.fn<() => Promise<void>>(),
}));

vi.mock('@/lib/archive/client', () => ({ archiveMessages: harness.archiveMessages }));

vi.mock('@/lib/cadence-media/MediaEngine', () => {
  class CadenceMediaEngine {
    joinVoice = vi.fn();
    joinVideo = vi.fn();
    leaveRoom = vi.fn();
    startCall = vi.fn();
    acceptIncomingCall = vi.fn();
    rejectCall = vi.fn();
    hangup = vi.fn();
    setMuted = vi.fn();
    setDeafened = vi.fn();
    startCamera = vi.fn();
    stopCamera = vi.fn();
    startScreenShare = vi.fn();
    stopBroadcast = vi.fn();
    sendReaction = vi.fn();
    setOutput = vi.fn();
    setClient = vi.fn();
    setTransportConnected = vi.fn();
    getLocalKind = vi.fn(() => null);
    getLocalStream = vi.fn(() => null);
    getScreenStream = vi.fn(() => null);
    getPeers = vi.fn(() => new Map());
    constructor(cbs: CadenceMediaCallbacks) {
      harness.callbacks = cbs;
      harness.engine = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
    }
  }
  return {
    CadenceMediaEngine,
    runCadenceCodecSelfTest: harness.codecSelfTest,
    setMountedCadenceMediaEngine: vi.fn(),
    getMountedCadenceMediaEngine: vi.fn(() => null),
  };
});

// ringtone is a no-op under jsdom (no AudioContext) — mock it away.
vi.mock('@/lib/ringtone', () => ({
  startIncomingRing: vi.fn(),
  startOutgoingRing: vi.fn(),
  stopRing: vi.fn(),
}));

import * as media from './media';
import { _setBridgeBackend, _setBridgeState, type BridgeBackend } from './bridge';
import { resetSettings, updateSettings } from './settings';

// The store registers every callback used below; assert non-null so the
// optional-in-interface fields are callable without `?.` noise in each test.
const cb = () => {
  if (!harness.callbacks) throw new Error('engine not constructed yet');
  return harness.callbacks as Required<CadenceMediaCallbacks>;
};
const eng = () => {
  if (!harness.engine) throw new Error('engine not constructed yet');
  return harness.engine;
};

/** A backend whose ensureReady runs the action synchronously (bridge ready). */
function readyBackend(): BridgeBackend {
  return {
    ready: () => true,
    ownNick: () => 'me',
    targetForBuffer: () => null,
    sendTagmsg: vi.fn(),
    sendPrivmsg: vi.fn(),
    sendRaw: vi.fn(),
    requestPeerDmKey: vi.fn(),
    ensureReady: (action: () => void) => action(),
  };
}

function fakeStream(video = false) {
  const audioTrack = { kind: 'audio', stop: vi.fn(), clone: vi.fn() };
  audioTrack.clone.mockReturnValue({ ...audioTrack, stop: vi.fn() });
  const videoTrack = { kind: 'video', stop: vi.fn(), clone: vi.fn() };
  videoTrack.clone.mockReturnValue({ ...videoTrack, stop: vi.fn() });
  const tracks = video ? [audioTrack, videoTrack] : [audioTrack];
  return {
    stream: {
      getTracks: () => tracks,
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => video ? [videoTrack] : [],
    } as unknown as MediaStream,
    tracks,
  };
}

const getUserMedia = vi.fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>();
const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>();
const permissionQuery = vi.fn<() => Promise<PermissionStatus>>();

beforeEach(() => {
  resetSettings();
  media.closeMediaPreflight();
  media.selectMediaDevice('microphone', '');
  media.selectMediaDevice('camera', '');
  media.selectMediaDevice('speaker', '');
  _setBridgeState({ status: 'ready', nick: 'me', error: null, e2eeReady: false });
  _setBridgeBackend(readyBackend());
  // The media engine is a module singleton — construct it once (its
  // constructor captures the callbacks into the harness), then reset call
  // state to idle via the engine's own idle callback so each test starts clean.
  media._ensureMediaEngine();
  cb().onCallState('idle', '', null);
  cb().onCallHealth?.({
    status: 'idle', transportConnected: false, tier: 0, suggestedBps: 0,
    jitterMs: 0, lossRate: 0, roundTripMs: 0, encodePressure: 0,
    roomStats: null, reconnectAttempt: 0, updatedAt: 0,
  });
  vi.clearAllMocks();
  harness.codecSelfTest.mockResolvedValue(undefined);
  harness.archiveMessages.mockResolvedValue(undefined);
  getUserMedia.mockResolvedValue(fakeStream().stream);
  enumerateDevices.mockResolvedValue([
    { deviceId: 'mic-default', groupId: 'inputs', kind: 'audioinput', label: 'Desk microphone', toJSON: vi.fn() },
    { deviceId: 'camera-default', groupId: 'inputs', kind: 'videoinput', label: 'Desk camera', toJSON: vi.fn() },
    { deviceId: 'speaker-default', groupId: 'outputs', kind: 'audiooutput', label: 'Desk speakers', toJSON: vi.fn() },
  ]);
  permissionQuery.mockResolvedValue({ state: 'granted' } as PermissionStatus);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: permissionQuery },
  });
});

describe('media preflight', () => {
  it('gates a room join on capture and the actual codec self-test', async () => {
    const captured = fakeStream(true);
    getUserMedia.mockResolvedValueOnce(captured.stream);

    media.requestRoomJoin('#room', true);

    expect(eng().joinVideo).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(media.mediaState.preflight.status).toBe('ready'));
    expect(harness.codecSelfTest).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: expect.any(Object) }));
    expect(media.mediaState.preflight.codec).toBe('ready');
    expect(media.mediaState.preflight.microphones[0]?.label).toBe('Desk microphone');
    expect(media.confirmMediaPreflight()).toBe(true);
    expect(eng().joinVideo).toHaveBeenCalledWith('#room');
    expect(captured.tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
  });

  it('surfaces blocked permission before any engine action', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));

    media.requestStartCall('trev', false);

    await vi.waitFor(() => expect(media.mediaState.preflight.status).toBe('error'));
    expect(media.mediaState.preflight.microphonePermission).toBe('denied');
    expect(media.mediaState.preflight.error).toContain('permission is blocked');
    expect(media.confirmMediaPreflight()).toBe(false);
    expect(eng().startCall).not.toHaveBeenCalled();
  });

  it('surfaces an unavailable codec before joining', async () => {
    harness.codecSelfTest.mockRejectedValueOnce(new Error('WASM unavailable'));

    media.requestRoomJoin('#room', false);

    await vi.waitFor(() => expect(media.mediaState.preflight.status).toBe('error'));
    expect(media.mediaState.preflight.codec).toBe('error');
    expect(media.mediaState.preflight.error).toContain('WASM unavailable');
    expect(eng().joinVoice).not.toHaveBeenCalled();
  });

  it('recovers a disconnected saved microphone by retrying the default', async () => {
    const recovered = fakeStream();
    media.selectMediaDevice('microphone', 'missing-mic');
    getUserMedia
      .mockRejectedValueOnce(new DOMException('gone', 'OverconstrainedError'))
      .mockResolvedValueOnce(recovered.stream);

    media.requestRoomJoin('#room', false);

    await vi.waitFor(() => expect(media.mediaState.preflight.status).toBe('ready'));
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(media.mediaState.preflight.microphoneId).toBeNull();
  });

  it('feeds selected devices to the engine and updates its output', () => {
    media.selectMediaDevice('microphone', 'mic-2');
    media.selectMediaDevice('camera', 'camera-2');
    media.selectMediaDevice('speaker', 'speaker-2');

    expect(cb().getMediaSettings()).toEqual(expect.objectContaining({
      inputDeviceId: 'mic-2',
      cameraDeviceId: 'camera-2',
    }));
    expect(eng().setOutput).toHaveBeenCalledWith('speaker-2', 100);
  });
});

describe('room join / leave', () => {
  it('joinRoom(video) sets connecting then calls engine.joinVideo', () => {
    media.joinRoom('#room', true);
    expect(media.mediaState.channel).toBe('#room');
    expect(media.mediaState.kind).toBe('video');
    expect(eng().joinVideo).toHaveBeenCalledWith('#room');
  });

  it('joinRoom(voice) calls engine.joinVoice', () => {
    media.joinRoom('#room', false);
    expect(media.mediaState.kind).toBe('voice');
    expect(eng().joinVoice).toHaveBeenCalledWith('#room');
  });

  it('engine onCallState in_call for a channel promotes the room and stamps startedAt', () => {
    media.joinRoom('#room', false);
    cb().onCallState('in_call', '', '#room');
    expect(media.mediaState.callState).toBe('in_call');
    expect(media.mediaState.channel).toBe('#room');
    expect(media.mediaState.callWith).toBeNull();
    expect(media.mediaState.startedAt).not.toBeNull();
  });

  it('leaveRoom calls engine.leaveRoom for the active channel', () => {
    media.joinRoom('#room', false);
    cb().onCallState('in_call', '', '#room');
    media.leaveRoom();
    expect(eng().leaveRoom).toHaveBeenCalledWith('#room');
  });
});

describe('1:1 calls', () => {
  it('startCall sets connecting + callWith and calls engine.startCall', () => {
    media.startCall('trev', true);
    expect(media.mediaState.callState).toBe('connecting');
    expect(media.mediaState.callWith).toBe('trev');
    expect(media.mediaState.channel).toBeNull();
    expect(eng().startCall).toHaveBeenCalledWith('trev', 'video');
  });

  it('incoming ring → acceptCall calls engine.acceptIncomingCall', () => {
    media.joinRoom('#x', false); // construct the engine
    cb().onCallState('ringing_in', 'trev', null);
    expect(media.mediaState.callState).toBe('ringing_in');
    expect(media.mediaState.callWith).toBe('trev');
    media.acceptCall();
    expect(eng().acceptIncomingCall).toHaveBeenCalled();
  });

  it('rejectCall calls engine.rejectCall with the ringing peer', () => {
    media.joinRoom('#x', false);
    cb().onCallState('ringing_in', 'trev', null);
    media.rejectCall();
    expect(eng().rejectCall).toHaveBeenCalledWith('trev');
  });

  it('hangup on a 1:1 call calls engine.hangup', () => {
    media.startCall('trev', false);
    cb().onCallState('in_call', 'trev', null);
    media.hangup();
    expect(eng().hangup).toHaveBeenCalledWith('trev');
  });

  it('onCallState idle resets to idle', () => {
    media.startCall('trev', false);
    cb().onCallState('in_call', 'trev', null);
    cb().onCallState('idle', '', null);
    expect(media.mediaState.callState).toBe('idle');
    expect(media.mediaState.callWith).toBeNull();
  });

  it('records a confirmed peer media key and clears it when the call ends', () => {
    media.startCall('trev', false);
    cb().onCallState('in_call', 'trev', null);
    cb().onMooringState('Trev', 3, 'PeerKey12345');
    expect(media.mediaState.observedAudioKeys['trev']).toEqual({
      epoch: 3,
      fingerprint: 'PeerKey12345',
    });

    cb().onCallState('idle', '', null);
    expect(media.mediaState.observedAudioKeys).toEqual({});
  });
});

describe('peers', () => {
  const peer = (over: Partial<CadencePeerState> = {}): CadencePeerState => ({
    nick: 'bob', hasVideo: false, speaking: false, muted: false, ...over,
  } as CadencePeerState);

  beforeEach(() => {
    media.joinRoom('#room', true); // construct engine + callbacks
    cb().onCallState('in_call', '', '#room');
  });

  it('onPeerState adds a peer', () => {
    cb().onPeerState(peer({ hasVideo: true }));
    expect(media.mediaState.peers['bob']?.hasVideo).toBe(true);
  });

  it('onPeerSpeaking flips speaking + tracks speakingNick', () => {
    cb().onPeerState(peer());
    cb().onPeerSpeaking('bob', true);
    expect(media.mediaState.peers['bob']?.speaking).toBe(true);
    expect(media.mediaState.speakingNick).toBe('bob');
    cb().onPeerSpeaking('bob', false);
    expect(media.mediaState.speakingNick).toBeNull();
  });

  it('onAudioLevel updates the level', () => {
    cb().onPeerState(peer());
    cb().onAudioLevel?.('bob', 0.7);
    expect(media.mediaState.peers['bob']?.audioLevel).toBeCloseTo(0.7);
  });

  it('onPeerLeft removes the peer and clears spotlight', () => {
    cb().onPeerState(peer());
    media.setSpotlight('bob');
    cb().onPeerLeft('bob');
    expect(media.mediaState.peers['bob']).toBeUndefined();
    expect(media.mediaState.spotlightNick).toBeNull();
  });

  it('onCaption stores a bounded room transcript and dispatches live captions', () => {
    const got: unknown[] = [];
    const h = (e: Event) => got.push((e as CustomEvent).detail);
    window.addEventListener('darkbear:caption', h);

    cb().onCaption({ channel: '#room', nick: 'bob', text: 'first line', time: 1 }, true);
    cb().onCaption({ channel: '#room', nick: 'bob', text: 'replayed line', time: 2 }, false);
    window.removeEventListener('darkbear:caption', h);

    expect(media.mediaState.transcripts['#room']).toHaveLength(2);
    expect(media.mediaState.liveCaption?.text).toBe('first line');
    expect(got).toEqual([{ channel: '#room', nick: 'bob', text: 'first line', time: 1 }]);
  });

  it('archives captions only through the existing opt-in archive policy', () => {
    cb().onCaption({ channel: '#room', nick: 'bob', text: 'ephemeral', time: 3 }, true);
    expect(harness.archiveMessages).not.toHaveBeenCalled();

    updateSettings({ archiveRetention: '7d' });
    cb().onCaption({ channel: '#room', nick: 'bob', text: 'persisted locally', time: 4 }, true);
    expect(harness.archiveMessages).toHaveBeenCalledWith([
      expect.objectContaining({ bufferKey: 'media:#room', sender: 'bob', text: 'persisted locally' }),
    ], { retention: '7d', maxMiB: 100 });
  });
});

describe('toggles', () => {
  beforeEach(() => {
    media.joinRoom('#room', true);
    cb().onCallState('in_call', '', '#room');
  });

  it('toggleMute flips selfMuted and calls engine.setMuted', () => {
    media.toggleMute();
    expect(media.mediaState.selfMuted).toBe(true);
    expect(eng().setMuted).toHaveBeenCalledWith(true);
  });

  it('toggleDeafen flips selfDeafened and calls engine.setDeafened', () => {
    media.toggleDeafen();
    expect(media.mediaState.selfDeafened).toBe(true);
    expect(eng().setDeafened).toHaveBeenCalledWith(true);
  });

  it('toggleCamera starts the camera when off', () => {
    media.toggleCamera();
    expect(eng().startCamera).toHaveBeenCalled();
  });

  it('toggleScreenShare starts a broadcast when not sharing', () => {
    media.toggleScreenShare();
    expect(eng().startScreenShare).toHaveBeenCalled();
  });

  it('sendRoomReaction calls engine.sendReaction', () => {
    media.sendRoomReaction('🎉');
    expect(eng().sendReaction).toHaveBeenCalledWith('🎉');
  });
});

describe('view state + errors', () => {
  it('setMinimized / setSpotlight are plain view state', () => {
    media.setMinimized(true);
    expect(media.mediaState.minimized).toBe(true);
    media.setSpotlight('bob');
    expect(media.mediaState.spotlightNick).toBe('bob');
    media.setTranscriptOpen(true);
    expect(media.mediaState.transcriptOpen).toBe(true);
  });

  it('engine onError surfaces to mediaState.error', () => {
    media.joinRoom('#room', false);
    cb().onError('mic blocked');
    expect(media.mediaState.error).toBe('mic blocked');
  });

  it('onPresence marks media available', () => {
    media.joinRoom('#room', false);
    cb().onPresence?.('#room', true);
    expect(media.mediaState.mediaAvailable).toBe(true);
  });

  it('stores typed call-health telemetry from the engine', () => {
    cb().onCallHealth?.({
      status: 'degraded', transportConnected: true, tier: 2, suggestedBps: 120_000,
      jitterMs: 42, lossRate: 0.08, roundTripMs: 90, encodePressure: 1.1,
      roomStats: { active_senders: 2, total_viewers: 4, video_fps: 30, audio_kbps: 48 },
      reconnectAttempt: 1, updatedAt: 1234,
    });
    expect(media.mediaState.health).toMatchObject({
      status: 'degraded', tier: 2, lossRate: 0.08, encodePressure: 1.1,
      roomStats: { active_senders: 2, total_viewers: 4 },
    });
  });

  it('forwards transient bridge connectivity without detaching the engine', () => {
    media._setMediaTransportConnected(false);
    media._setMediaTransportConnected(true);
    expect(eng().setTransportConnected).toHaveBeenNthCalledWith(1, false);
    expect(eng().setTransportConnected).toHaveBeenNthCalledWith(2, true);
    expect(eng().setClient).not.toHaveBeenCalledWith(null);
  });

  it('peerStream returns null for an unknown peer', () => {
    media.joinRoom('#room', true);
    expect(media.peerStream('ghost')).toBeNull();
  });
});
