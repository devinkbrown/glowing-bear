// Media store — Solid store + actions wrapping the Cadence media engine
// (voice/video rooms, 1:1 calls, screen share) for the voice UI components.
//
// The engine itself (encode/decode, WS media plane, TSUMUGI crypto) lives in
// src/lib/cadence-media/MediaEngine.ts; it is mounted here once and attached
// to the bridge's IRCClient by src/core/bridge.ts via _attachBridgeClient.
// All engine callbacks funnel into `mediaState` below.

import { createStore, produce } from 'solid-js/store';
import type { IRCClient } from '@/lib/irc/client';
import {
  CadenceMediaEngine,
  runCadenceCodecSelfTest,
  setMountedCadenceMediaEngine,
} from '@/lib/cadence-media/MediaEngine';
import type {
  CallState as EngineCallState,
  CadenceMediaCallbacks,
  CadenceCallHealth,
  CadencePeerState,
  CadenceTranscriptEntry,
} from '@/lib/cadence-media/types';
import { startIncomingRing, startOutgoingRing, stopRing } from '@/lib/ringtone';
import { bridgeRun, bridgeState } from './bridge';
import { recordDiagnosticEvent } from '@/lib/diagnosticsEvents';
import { recordCallActivity } from './activity';
import { settings } from './settings';
import { archiveMessages } from '@/lib/archive/client';
import { archiveRecordFromCaption } from '@/lib/archive/record';

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

export interface MediaAudioKeyObservation {
  epoch: number;
  fingerprint: string;
}

export type MediaTranscriptEntry = CadenceTranscriptEntry;

export type MediaPermissionStatus = PermissionState | 'unsupported';
export type MediaPreflightStatus = 'idle' | 'checking' | 'ready' | 'error';
export type MediaCodecStatus = 'idle' | 'checking' | 'ready' | 'error';
export type MediaEchoStatus = 'idle' | 'recording' | 'playing' | 'error';

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

export interface MediaPreflightIntent {
  mode: 'room' | 'call' | 'accept';
  target: string;
  video: boolean;
}

interface MediaDevicePreferences {
  microphoneId: string | null;
  cameraId: string | null;
  speakerId: string | null;
}

interface MediaPreflightState {
  open: boolean;
  intent: MediaPreflightIntent | null;
  status: MediaPreflightStatus;
  codec: MediaCodecStatus;
  microphonePermission: MediaPermissionStatus;
  cameraPermission: MediaPermissionStatus;
  microphones: MediaDeviceOption[];
  cameras: MediaDeviceOption[];
  speakers: MediaDeviceOption[];
  microphoneId: string | null;
  cameraId: string | null;
  speakerId: string | null;
  audioLevel: number;
  echo: MediaEchoStatus;
  error: string | null;
}

const MEDIA_DEVICE_STORAGE_KEY = 'darkbear_media_devices_v1';

function loadMediaDevicePreferences(): MediaDevicePreferences {
  const empty: MediaDevicePreferences = { microphoneId: null, cameraId: null, speakerId: null };
  if (typeof localStorage === 'undefined') return empty;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MEDIA_DEVICE_STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
    const value = parsed as Record<string, unknown>;
    return {
      microphoneId: typeof value.microphoneId === 'string' && value.microphoneId ? value.microphoneId : null,
      cameraId: typeof value.cameraId === 'string' && value.cameraId ? value.cameraId : null,
      speakerId: typeof value.speakerId === 'string' && value.speakerId ? value.speakerId : null,
    };
  } catch {
    return empty;
  }
}

function saveMediaDevicePreferences(value: MediaDevicePreferences): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(MEDIA_DEVICE_STORAGE_KEY, JSON.stringify(value)); } catch { /* local-only best effort */ }
}

const initialDevices = loadMediaDevicePreferences();
let selectedOutputDeviceId = initialDevices.speakerId;

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
  /** Peers with raised hands, keyed by nick. */
  raisedHands: Record<string, true>;
  /** Last caption/transcript lines per room, keyed by lowercase channel. */
  transcripts: Record<string, MediaTranscriptEntry[]>;
  /** Most recent live caption for the current surface. */
  liveCaption: MediaTranscriptEntry | null;
  /** Whether the in-call, keyboard-navigable transcript panel is open. */
  transcriptOpen: boolean;
  minimized: boolean;
  spotlightNick: string | null;
  error: string | null;
  /** True once the bridge session confirms MEDIA is usable. */
  mediaAvailable: boolean;
  /** Bounded live telemetry from the active Onyx Server media pipeline. */
  health: CadenceCallHealth;
  /** Observed peer audio keys only; never evidence that Audio E2EE is usable. */
  observedAudioKeys: Record<string, MediaAudioKeyObservation>;
  /** Device/permission/codec gate shown before capture is committed to a call. */
  preflight: MediaPreflightState;
}

function initialCallFields(): Omit<MediaStateShape, 'minimized' | 'mediaAvailable' | 'health' | 'preflight'> {
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
    raisedHands: {},
    transcripts: {},
    liveCaption: null,
    transcriptOpen: false,
    spotlightNick: null,
    error: null,
    observedAudioKeys: {},
  };
}

const [mediaState, setMediaState] = createStore<MediaStateShape>({
  ...initialCallFields(),
  minimized: false,
  mediaAvailable: false,
  health: {
    status: 'idle',
    transportConnected: false,
    tier: 0,
    suggestedBps: 0,
    jitterMs: 0,
    lossRate: 0,
    roundTripMs: 0,
    encodePressure: 0,
    roomStats: null,
    reconnectAttempt: 0,
    updatedAt: 0,
  },
  preflight: {
    open: false,
    intent: null,
    status: 'idle',
    codec: 'idle',
    microphonePermission: 'unsupported',
    cameraPermission: 'unsupported',
    microphones: [],
    cameras: [],
    speakers: [],
    microphoneId: initialDevices.microphoneId,
    cameraId: initialDevices.cameraId,
    speakerId: initialDevices.speakerId,
    audioLevel: 0,
    echo: 'idle',
    error: null,
  },
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
  recordDiagnosticEvent('media-state', available ? 'available' : 'unavailable');
}

// ---------------------------------------------------------------------------
// Engine mount + callbacks
// ---------------------------------------------------------------------------

let engine: CadenceMediaEngine | null = null;
let lastActivityCallState: EngineCallState = 'idle';
let captionArchiveSequence = 0;

function handleCallState(state: EngineCallState, nick: string, channel: string | null): void {
  const previous = lastActivityCallState;
  lastActivityCallState = state;
  if (state !== previous) {
    if (state === 'ringing_in') recordCallActivity('Incoming call', nick);
    else if (state === 'ringing_out') recordCallActivity('Outgoing call', nick);
    else if (state === 'in_call') recordCallActivity('Call connected', nick || channel || 'room');
    else if (state === 'idle' && previous !== 'idle') recordCallActivity('Call ended', nick || channel || mediaState.callWith || 'room');
  }
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

function upsertPeer(peer: CadencePeerState): void {
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

const mediaCallbacks: CadenceMediaCallbacks = {
  onCallState: handleCallState,

  onPeerState: upsertPeer,

  onPeerLeft(nick) {
    clearPeerCanvasStream(nick);
    setMediaState(produce((s) => {
      delete s.peers[nick];
      delete s.raisedHands[nick];
      delete s.observedAudioKeys[nick.toLowerCase()];
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

  onCallHealth(health) {
    setMediaState('health', health);
  },

  onMooringState(nick, epoch, fingerprint) {
    setMediaState('observedAudioKeys', nick.toLowerCase(), { epoch, fingerprint });
  },

  onReaction(nick, emoji) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('darkbear:voice-reaction', {
        detail: { nick, emoji },
      }));
    }
  },

  onHand(nick, raised) {
    setMediaState(produce((s) => {
      if (raised) s.raisedHands[nick] = true;
      else delete s.raisedHands[nick];
    }));
  },

  onCaption(entry, live) {
    const key = entry.channel.toLowerCase();
    setMediaState(produce((s) => {
      const existing = s.transcripts[key] ?? [];
      s.transcripts[key] = [...existing.slice(-199), entry];
      if (live) s.liveCaption = entry;
    }));
    if (live && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('darkbear:caption', {
        detail: entry,
      }));
    }
    if (settings.archiveRetention !== 'off') {
      const record = archiveRecordFromCaption(entry, captionArchiveSequence++);
      void archiveMessages([record], {
        retention: settings.archiveRetention,
        maxMiB: settings.archiveMaxMiB,
      }).catch(() => {
        // Caption persistence is optional; live accessibility must never depend on storage.
      });
    }
  },

  enableVideoCalls: () => true,
  enableVoiceCalls: () => true,

  getMediaSettings: () => ({
    inputDeviceId: mediaState.preflight.microphoneId,
    cameraDeviceId: mediaState.preflight.cameraId,
    outputDeviceId: mediaState.preflight.speakerId,
    outputVolume: 100,
    noiseSuppression: true,
    echoCancellation: true,
  }),

  getLocalNick: () => bridgeState.nick ?? '',
};

/** Internal: create + globally mount the engine on first use. */
export function _ensureMediaEngine(): CadenceMediaEngine {
  if (!engine) {
    engine = new CadenceMediaEngine(mediaCallbacks, { kind: 'video' });
    engine.setOutput(selectedOutputDeviceId, 100);
    setMountedCadenceMediaEngine(engine);
  }
  return engine;
}

/**
 * Internal: bridge controller attaches/detaches its IRCClient. The engine
 * registers its own EVENT MEDIA + binary-frame handlers on it.
 */
export function _attachBridgeClient(client: IRCClient | null): void {
  if (!client) {
    engine?.setClient(null);
    return;
  }
  _ensureMediaEngine().setClient(client);
}

/** Internal: preserve active pipelines across a transient bridge interruption. */
export function _setMediaTransportConnected(connected: boolean): void {
  if (!engine && !connected) return;
  _ensureMediaEngine().setTransportConnected(connected);
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
// Device + permission preflight
// ---------------------------------------------------------------------------

let preflightStream: MediaStream | null = null;
let preflightAudioContext: AudioContext | null = null;
let preflightMeterTimer: ReturnType<typeof setInterval> | null = null;
let preflightGeneration = 0;

export function mediaPreflightPreviewStream(): MediaStream | null {
  return preflightStream;
}

function stopPreflightMeter(): void {
  if (preflightMeterTimer) clearInterval(preflightMeterTimer);
  preflightMeterTimer = null;
  if (preflightAudioContext) void preflightAudioContext.close().catch(() => undefined);
  preflightAudioContext = null;
  setMediaState('preflight', 'audioLevel', 0);
}

function releasePreflightStream(): void {
  stopPreflightMeter();
  preflightStream?.getTracks().forEach((track) => track.stop());
  preflightStream = null;
}

function persistSelectedDevices(): void {
  saveMediaDevicePreferences({
    microphoneId: mediaState.preflight.microphoneId,
    cameraId: mediaState.preflight.cameraId,
    speakerId: mediaState.preflight.speakerId,
  });
}

async function queryMediaPermission(name: 'microphone' | 'camera'): Promise<MediaPermissionStatus> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';
  try {
    const result = await navigator.permissions.query({ name } as PermissionDescriptor);
    return result.state;
  } catch {
    return 'unsupported';
  }
}

function deviceOptions(devices: MediaDeviceInfo[], kind: MediaDeviceKind, fallback: string): MediaDeviceOption[] {
  let index = 0;
  return devices.filter((device) => device.kind === kind).map((device) => {
    index += 1;
    return { deviceId: device.deviceId, label: device.label || `${fallback} ${index}` };
  });
}

/** Refresh labels and drop persisted IDs that no longer exist. */
export async function refreshMediaDevices(): Promise<void> {
  const devicesApi = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!devicesApi?.enumerateDevices) return;
  const devices = await devicesApi.enumerateDevices();
  const microphones = deviceOptions(devices, 'audioinput', 'Microphone');
  const cameras = deviceOptions(devices, 'videoinput', 'Camera');
  const speakers = deviceOptions(devices, 'audiooutput', 'Speaker');
  setMediaState('preflight', 'microphones', microphones);
  setMediaState('preflight', 'cameras', cameras);
  setMediaState('preflight', 'speakers', speakers);
  const has = (options: MediaDeviceOption[], selected: string | null) =>
    selected === null || options.some((option) => option.deviceId === selected);
  if (!has(microphones, mediaState.preflight.microphoneId)) {
    setMediaState('preflight', 'microphoneId', null);
  }
  if (!has(cameras, mediaState.preflight.cameraId)) {
    setMediaState('preflight', 'cameraId', null);
  }
  if (!has(speakers, mediaState.preflight.speakerId)) {
    setMediaState('preflight', 'speakerId', null);
    selectedOutputDeviceId = null;
  }
  persistSelectedDevices();
}

function captureConstraints(video: boolean): MediaStreamConstraints {
  return {
    audio: {
      deviceId: mediaState.preflight.microphoneId
        ? { exact: mediaState.preflight.microphoneId }
        : undefined,
      noiseSuppression: true,
      echoCancellation: true,
    },
    video: video
      ? {
          deviceId: mediaState.preflight.cameraId
            ? { exact: mediaState.preflight.cameraId }
            : undefined,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        }
      : false,
  };
}

function captureErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Microphone or camera permission is blocked. Allow access in browser site settings, then check again.';
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'The selected media device is unavailable. Choose another device or reconnect it.';
    }
    if (error.name === 'NotReadableError') {
      return 'A media device is busy in another application.';
    }
  }
  return error instanceof Error ? error.message : 'Media capture could not start.';
}

function startPreflightMeter(stream: MediaStream): void {
  stopPreflightMeter();
  if (typeof AudioContext === 'undefined' || stream.getAudioTracks().length === 0) return;
  try {
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    preflightAudioContext = context;
    preflightMeterTimer = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      setMediaState('preflight', 'audioLevel', Math.min(1, Math.sqrt(sum / samples.length) * 4));
    }, 100);
  } catch {
    stopPreflightMeter();
  }
}

async function captureForPreflight(video: boolean): Promise<MediaStream> {
  const devicesApi = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!devicesApi?.getUserMedia) throw new Error('Media devices are unavailable in this browser.');
  try {
    return await devicesApi.getUserMedia(captureConstraints(video));
  } catch (error) {
    const recoverable = error instanceof DOMException &&
      (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') &&
      Boolean(mediaState.preflight.microphoneId || (video && mediaState.preflight.cameraId));
    if (!recoverable) throw error;
    setMediaState('preflight', 'microphoneId', null);
    if (video) setMediaState('preflight', 'cameraId', null);
    persistSelectedDevices();
    return devicesApi.getUserMedia(captureConstraints(video));
  }
}

/** Run capture and actual audio+video codec construction before a call starts. */
export async function runMediaPreflight(): Promise<void> {
  const intent = mediaState.preflight.intent;
  if (!intent) return;
  const generation = ++preflightGeneration;
  releasePreflightStream();
  setMediaState('preflight', {
    status: 'checking',
    codec: 'checking',
    echo: 'idle',
    error: null,
  });
  const [microphonePermission, cameraPermission] = await Promise.all([
    queryMediaPermission('microphone'),
    intent.video ? queryMediaPermission('camera') : Promise.resolve<MediaPermissionStatus>('unsupported'),
  ]);
  if (generation !== preflightGeneration) return;
  setMediaState('preflight', 'microphonePermission', microphonePermission);
  setMediaState('preflight', 'cameraPermission', cameraPermission);

  const codecResult = runCadenceCodecSelfTest()
    .then(() => ({ ok: true as const }))
    .catch((error: unknown) => ({ ok: false as const, error }));
  const captureResult = captureForPreflight(intent.video)
    .then((stream) => ({ ok: true as const, stream }))
    .catch((error: unknown) => ({ ok: false as const, error }));
  const [codec, capture] = await Promise.all([codecResult, captureResult]);
  if (generation !== preflightGeneration) {
    if (capture.ok) capture.stream.getTracks().forEach((track) => track.stop());
    return;
  }
  setMediaState('preflight', 'codec', codec.ok ? 'ready' : 'error');
  if (capture.ok) {
    preflightStream = capture.stream;
    setMediaState('preflight', 'microphonePermission', 'granted');
    if (intent.video) setMediaState('preflight', 'cameraPermission', 'granted');
    startPreflightMeter(capture.stream);
    await refreshMediaDevices().catch(() => undefined);
  } else {
    const denied = capture.error instanceof DOMException &&
      (capture.error.name === 'NotAllowedError' || capture.error.name === 'SecurityError');
    if (denied) {
      setMediaState('preflight', 'microphonePermission', 'denied');
      if (intent.video) setMediaState('preflight', 'cameraPermission', 'denied');
    }
  }
  const failures: string[] = [];
  if (!capture.ok) failures.push(captureErrorMessage(capture.error));
  if (!codec.ok) {
    failures.push(`Codec self-test failed: ${codec.error instanceof Error ? codec.error.message : String(codec.error)}`);
  }
  const error = failures.length > 0 ? failures.join(' ') : null;
  setMediaState('preflight', {
    status: error ? 'error' : 'ready',
    error,
  });
}

export function openMediaPreflight(intent: MediaPreflightIntent): void {
  setMediaState('preflight', {
    open: true,
    intent,
    status: 'idle',
    codec: 'idle',
    echo: 'idle',
    error: null,
  });
  void runMediaPreflight();
}

export function closeMediaPreflight(): void {
  preflightGeneration += 1;
  releasePreflightStream();
  setMediaState('preflight', {
    open: false,
    intent: null,
    status: 'idle',
    codec: 'idle',
    echo: 'idle',
    error: null,
  });
}

export function selectMediaDevice(kind: 'microphone' | 'camera' | 'speaker', deviceId: string): void {
  const selected = deviceId || null;
  const field = kind === 'microphone' ? 'microphoneId' : kind === 'camera' ? 'cameraId' : 'speakerId';
  setMediaState('preflight', field, selected);
  if (kind === 'speaker') selectedOutputDeviceId = selected;
  persistSelectedDevices();
  if (kind === 'speaker') {
    engine?.setOutput(selected, 100);
    return;
  }
  if (mediaState.preflight.open) void runMediaPreflight();
}

export async function runMediaEchoTest(): Promise<void> {
  if (!preflightStream || preflightStream.getAudioTracks().length === 0 || typeof MediaRecorder === 'undefined') {
    setMediaState('preflight', { echo: 'error', error: 'Echo test is unavailable in this browser.' });
    return;
  }
  setMediaState('preflight', { echo: 'recording', error: null });
  const audioOnly = new MediaStream(preflightStream.getAudioTracks().map((track) => track.clone()));
  try {
    const recorder = new MediaRecorder(audioOnly);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    recorder.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    recorder.stop();
    await stopped;
    const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
    const audio = new Audio(url) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (mediaState.preflight.speakerId && audio.setSinkId) {
      await audio.setSinkId(mediaState.preflight.speakerId);
    }
    setMediaState('preflight', 'echo', 'playing');
    audio.onended = () => {
      URL.revokeObjectURL(url);
      setMediaState('preflight', 'echo', 'idle');
    };
    await audio.play();
  } catch (error) {
    setMediaState('preflight', {
      echo: 'error',
      error: error instanceof Error ? `Echo test failed: ${error.message}` : 'Echo test failed.',
    });
  } finally {
    audioOnly.getTracks().forEach((track) => track.stop());
  }
}

export function requestRoomJoin(channel: string, video: boolean): void {
  openMediaPreflight({ mode: 'room', target: channel, video });
}

export function requestStartCall(nick: string, video: boolean): void {
  openMediaPreflight({ mode: 'call', target: nick, video });
}

export function requestAcceptCall(): void {
  if (!mediaState.callWith) return;
  openMediaPreflight({ mode: 'accept', target: mediaState.callWith, video: mediaState.kind === 'video' });
}

export function confirmMediaPreflight(): boolean {
  const intent = mediaState.preflight.intent;
  if (!intent || mediaState.preflight.status !== 'ready') return false;
  closeMediaPreflight();
  if (intent.mode === 'room') joinRoom(intent.target, intent.video);
  else if (intent.mode === 'call') startCall(intent.target, intent.video);
  else acceptCall();
  return true;
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
  setMediaState(produce((state) => {
    state.minimized = v;
    if (v) state.transcriptOpen = false;
  }));
}

export function setTranscriptOpen(open: boolean): void {
  setMediaState('transcriptOpen', open);
}

export function setSpotlight(nick: string | null): void {
  setMediaState('spotlightNick', nick);
}

/** Broadcast an emoji reaction to the active room (MEDIA REACT). */
export function sendRoomReaction(emoji: string): void {
  engine?.sendReaction(emoji);
}
