// @vitest-environment jsdom
//
// Media store transitions, driven by a fake SuimyakuMediaEngine. The store's
// public actions must call the right engine methods, and the engine's
// callbacks (captured from the constructor) must move mediaState correctly.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuimyakuMediaCallbacks, SuimyakuPeerState } from '@/lib/suimyaku-media/types';

// ── fake engine harness ──────────────────────────────────────────────────────

const harness = vi.hoisted(() => ({
  callbacks: null as SuimyakuMediaCallbacks | null,
  engine: null as Record<string, ReturnType<typeof vi.fn>> | null,
}));

vi.mock('@/lib/suimyaku-media/MediaEngine', () => {
  class SuimyakuMediaEngine {
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
    setClient = vi.fn();
    getLocalKind = vi.fn(() => null);
    getLocalStream = vi.fn(() => null);
    getScreenStream = vi.fn(() => null);
    getPeers = vi.fn(() => new Map());
    constructor(cbs: SuimyakuMediaCallbacks) {
      harness.callbacks = cbs;
      harness.engine = this as unknown as Record<string, ReturnType<typeof vi.fn>>;
    }
  }
  return { SuimyakuMediaEngine, setMountedSuimyakuMediaEngine: vi.fn(), getMountedSuimyakuMediaEngine: vi.fn(() => null) };
});

// ringtone is a no-op under jsdom (no AudioContext) — mock it away.
vi.mock('@/lib/ringtone', () => ({
  startIncomingRing: vi.fn(),
  startOutgoingRing: vi.fn(),
  stopRing: vi.fn(),
}));

import * as media from './media';
import { _setBridgeBackend, _setBridgeState, type BridgeBackend } from './bridge';

// The store registers every callback used below; assert non-null so the
// optional-in-interface fields are callable without `?.` noise in each test.
const cb = () => {
  if (!harness.callbacks) throw new Error('engine not constructed yet');
  return harness.callbacks as Required<SuimyakuMediaCallbacks>;
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

beforeEach(() => {
  _setBridgeState({ status: 'ready', nick: 'me', error: null, e2eeReady: false });
  _setBridgeBackend(readyBackend());
  // The media engine is a module singleton — construct it once (its
  // constructor captures the callbacks into the harness), then reset call
  // state to idle via the engine's own idle callback so each test starts clean.
  media._ensureMediaEngine();
  cb().onCallState('idle', '', null);
  vi.clearAllMocks();
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
});

describe('peers', () => {
  const peer = (over: Partial<SuimyakuPeerState> = {}): SuimyakuPeerState => ({
    nick: 'bob', hasVideo: false, speaking: false, muted: false, ...over,
  } as SuimyakuPeerState);

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

  it('peerStream returns null for an unknown peer', () => {
    media.joinRoom('#room', true);
    expect(media.peerStream('ghost')).toBeNull();
  });
});
