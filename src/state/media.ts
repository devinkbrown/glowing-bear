// Media store — Solid store + actions wrapping the Suimyaku media engine
// (voice/video rooms, 1:1 calls, screen share) for the voice UI components.
//
// The engine itself (encode/decode, WS media plane, TSUMUGI crypto) lives in
// src/lib/suimyaku-media/MediaEngine.ts; it is mounted here once and attached
// to the bridge's IRCClient by src/core/bridge.ts via _attachBridgeClient.
// All engine callbacks funnel into `mediaState` below.

import { createStore, produce } from 'solid-js/store';
import type { IRCClient } from '@/lib/irc/client';
import {
  SuimyakuMediaEngine,
  setMountedSuimyakuMediaEngine,
} from '@/lib/suimyaku-media/MediaEngine';
import type {
  CallState as EngineCallState,
  SuimyakuMediaCallbacks,
  SuimyakuPeerState,
} from '@/lib/suimyaku-media/types';
import { startIncomingRing, startOutgoingRing, stopRing } from '@/lib/ringtone';
import { bridgeRun, bridgeState } from './bridge';

// ---------------------------------------------------------------------------
// Types + store
// ---------------------------------------------------------------------------

export type CallState = 'idle' | 'ringing_in' | 'ringing_out' | 'connecting' | 'in_call';

export interface MediaPeer {
  nick: string;
  hasVideo: boolean;
  speaking: boolean;
  muted: boolean;
  audioLevel: number;
}

interface MediaStateShape {
  callState: CallState;
  /** Voice/video room channel (null for 1:1 calls). */
  channel: string | null;
  kind: 'voice' | 'video';
  /** 1:1 call peer nick (null for room calls). */
  callWith: string | null;
  /** ms epoch when the call went live, for the duration timer. */
  startedAt: number | null;
  peers: Record<string, MediaPeer>;
  selfMuted: boolean;
  selfDeafened: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  /** Most recently speaking peer (for spotlight-follows-speaker UIs). */
  speakingNick: string | null;
  minimized: boolean;
  spotlightNick: string | null;
  error: string | null;
  /** True once the bridge session confirms MEDIA is usable. */
  mediaAvailable: boolean;
}

function initialCallFields(): Omit<MediaStateShape, 'minimized' | 'mediaAvailable'> {
  return {
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
    spotlightNick: null,
    error: null,
  };
}

const [mediaState, setMediaState] = createStore<MediaStateShape>({
  ...initialCallFields(),
  minimized: false,
  mediaAvailable: false,
});

/** Read-only media call state. Mutate via the exported actions only. */
export { mediaState };

function resetCallState(): void {
  stopRing();
  clearPeerCanvasStreams();
  setMediaState(produce((s) => {
    Object.assign(s, initialCallFields());
  }));
}

/** Internal: bridge controller marks MEDIA availability on welcome/teardown. */
export function _setMediaAvailable(available: boolean): void {
  setMediaState('mediaAvailable', available);
}

// ---------------------------------------------------------------------------
// Engine mount + callbacks
// ---------------------------------------------------------------------------

let engine: SuimyakuMediaEngine | null = null;

function handleCallState(state: EngineCallState, nick: string, channel: string | null): void {
  if (state === 'idle') {
    resetCallState();
    return;
  }
  if (state === 'ringing_in') {
    startIncomingRing();
    setMediaState(produce((s) => {
      s.callState = 'ringing_in';
      if (nick) s.callWith = nick;
      s.channel = null;
      s.error = null;
    }));
    return;
  }
  if (state === 'ringing_out') {
    startOutgoingRing();
    setMediaState(produce((s) => {
      s.callState = 'ringing_out';
      if (nick) s.callWith = nick;
      s.error = null;
    }));
    return;
  }
  // in_call
  stopRing();
  setMediaState(produce((s) => {
    s.callState = 'in_call';
    const room = channel ?? s.channel;
    if (room && (room.startsWith('#') || room.startsWith('&'))) {
      s.channel = room;
      s.callWith = null;
    } else if (nick) {
      s.callWith = nick;
      s.channel = null;
    }
    if (s.startedAt === null) s.startedAt = Date.now();
    s.error = null;
  }));
}

function upsertPeer(peer: SuimyakuPeerState): void {
  setMediaState(produce((s) => {
    const existing = s.peers[peer.nick];
    s.peers[peer.nick] = {
      nick: peer.nick,
      hasVideo: peer.hasVideo,
      speaking: peer.speaking,
      muted: peer.muted,
      audioLevel: existing?.audioLevel ?? 0,
    };
    if (peer.speaking) s.speakingNick = peer.nick;
  }));
}

const mediaCallbacks: SuimyakuMediaCallbacks = {
  onCallState: handleCallState,

  onPeerState: upsertPeer,

  onPeerLeft(nick) {
    clearPeerCanvasStream(nick);
    setMediaState(produce((s) => {
      delete s.peers[nick];
      if (s.speakingNick === nick) s.speakingNick = null;
      if (s.spotlightNick === nick) s.spotlightNick = null;
    }));
  },

  onPeerSpeaking(nick, speaking) {
    if (nick === 'local') return; // local VAD — self state is not a peer tile
    setMediaState(produce((s) => {
      const p = s.peers[nick];
      if (p) p.speaking = speaking;
      if (speaking) s.speakingNick = nick;
      else if (s.speakingNick === nick) s.speakingNick = null;
    }));
  },

  onLocalStream() {
    const kind = engine?.getLocalKind() ?? null;
    const stream = engine?.getLocalStream() ?? null;
    setMediaState(produce((s) => {
      s.cameraOn = kind === 'video' && !!stream;
      s.screenSharing = kind === 'screen' && !!stream;
    }));
  },

  onError(msg) {
    setMediaState('error', msg);
  },

  onAudioLevel(nick, level) {
    setMediaState(produce((s) => {
      const p = s.peers[nick];
      if (p) p.audioLevel = level;
    }));
  },

  onPresence() {
    setMediaState('mediaAvailable', true);
  },

  enableVideoCalls: () => true,
  enableVoiceCalls: () => true,

  getLocalNick: () => bridgeState.nick ?? '',
};

/** Internal: create + globally mount the engine on first use. */
export function _ensureMediaEngine(): SuimyakuMediaEngine {
  if (!engine) {
    engine = new SuimyakuMediaEngine(mediaCallbacks, { kind: 'video' });
    setMountedSuimyakuMediaEngine(engine);
  }
  return engine;
}

/**
 * Internal: bridge controller attaches/detaches its IRCClient. The engine
 * registers its own NOTE MEDIA / EVENT MEDIA + binary-frame handlers on it.
 */
export function _attachBridgeClient(client: IRCClient | null): void {
  if (!client) {
    engine?.setClient(null);
    return;
  }
  _ensureMediaEngine().setClient(client);
}

// ---------------------------------------------------------------------------
// Peer video streams (canvas captureStream, cached per canvas identity)
// ---------------------------------------------------------------------------

type CapturableCanvas = HTMLCanvasElement & { captureStream(fps?: number): MediaStream };

const canvasStreams = new Map<string, { canvas: HTMLCanvasElement; stream: MediaStream }>();

function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

function clearPeerCanvasStream(nick: string): void {
  const cached = canvasStreams.get(nick);
  stopStream(cached?.stream);
  canvasStreams.delete(nick);
}

function clearPeerCanvasStreams(): void {
  for (const cached of canvasStreams.values()) stopStream(cached.stream);
  canvasStreams.clear();
}

/**
 * A MediaStream for a peer's video tile: their live screen-share stream when
 * present, else a captureStream of the decoder canvas (cached per canvas).
 */
export function peerStream(nick: string): MediaStream | null {
  if (!engine) return null;
  const screen = engine.getScreenStream(nick);
  if (screen) return screen;
  const canvas = engine.getPeers().get(nick)?.canvas ?? null;
  if (!canvas || typeof (canvas as CapturableCanvas).captureStream !== 'function') return null;
  const cached = canvasStreams.get(nick);
  if (cached?.canvas === canvas) return cached.stream;
  stopStream(cached?.stream);
  const stream = (canvas as CapturableCanvas).captureStream(60);
  canvasStreams.set(nick, { canvas, stream });
  return stream;
}

/** Local camera/screen preview stream, or null when only audio is captured. */
export function selfPreviewStream(): MediaStream | null {
  const kind = engine?.getLocalKind() ?? null;
  if (kind !== 'video' && kind !== 'screen') return null;
  return engine?.getLocalStream() ?? null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Join a channel voice/video room (connects the bridge on demand). */
export function joinRoom(channel: string, video: boolean): void {
  setMediaState(produce((s) => {
    s.callState = 'connecting';
    s.channel = channel;
    s.callWith = null;
    s.kind = video ? 'video' : 'voice';
    s.error = null;
  }));
  bridgeRun(() => {
    const e = _ensureMediaEngine();
    void (video ? e.joinVideo(channel) : e.joinVoice(channel));
  });
}

/** Leave the active room (no-op cleanup when nothing is active). */
export function leaveRoom(): void {
  stopRing();
  if (engine) engine.leaveRoom(mediaState.channel ?? '');
  else resetCallState();
}

/** Ring a nick for a 1:1 voice or video call (connects the bridge on demand). */
export function startCall(nick: string, video: boolean): void {
  setMediaState(produce((s) => {
    s.callState = 'connecting';
    s.callWith = nick;
    s.channel = null;
    s.kind = video ? 'video' : 'voice';
    s.error = null;
  }));
  bridgeRun(() => {
    void _ensureMediaEngine().startCall(nick, video ? 'video' : 'voice');
  });
}

/** Accept the ringing incoming call. */
export function acceptCall(): void {
  stopRing();
  void engine?.acceptIncomingCall();
}

/** Reject the ringing incoming call. */
export function rejectCall(): void {
  stopRing();
  if (engine) engine.rejectCall(mediaState.callWith ?? '');
  else resetCallState();
}

/** End the active call or room session. */
export function hangup(): void {
  stopRing();
  if (!engine) {
    resetCallState();
    return;
  }
  if (mediaState.channel) engine.leaveRoom(mediaState.channel);
  else engine.hangup(mediaState.callWith ?? '');
}

export function toggleMute(): void {
  const next = !mediaState.selfMuted;
  setMediaState('selfMuted', next);
  engine?.setMuted(next);
}

export function toggleDeafen(): void {
  const next = !mediaState.selfDeafened;
  setMediaState('selfDeafened', next);
  engine?.setDeafened(next);
}

export function toggleCamera(): void {
  if (!engine) return;
  if (mediaState.cameraOn) {
    engine.stopCamera();
    return;
  }
  setMediaState('kind', 'video');
  void engine.startCamera(mediaState.channel ?? undefined);
}

export function toggleScreenShare(): void {
  if (!engine) return;
  if (mediaState.screenSharing) {
    engine.stopBroadcast(mediaState.channel ?? undefined);
    return;
  }
  void engine.startScreenShare(mediaState.channel ?? undefined);
}

export function setMinimized(v: boolean): void {
  setMediaState('minimized', v);
}

export function setSpotlight(nick: string | null): void {
  setMediaState('spotlightNick', nick);
}

/** Broadcast an emoji reaction to the active room (MEDIA REACT). */
export function sendRoomReaction(emoji: string): void {
  engine?.sendReaction(emoji);
}
