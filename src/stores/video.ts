import type { StateCreator } from 'zustand';
import type { BuffersSlice } from './buffers';
import type { SettingsSlice } from './settings';

export type CallState = 'idle' | 'ringing_in' | 'ringing_out' | 'connecting' | 'in_call';

export interface PeerState {
  nick: string;
  channel: string | null;
  stream: null;
  screenStream: null;
  audioLevel: number;
  speaking: boolean;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface VideoSlice {
  callState: CallState;
  callWith: string;
  callChannel: string | null;
  callType: 'video' | 'voice';
  callStartTime: number | null;
  localStream: null;
  localScreenStream: null;
  peers: Map<string, PeerState>;
  audioLevels: Map<string, { level: number; speaking: boolean }>;
  videoError: string | null;
  minimized: boolean;
  audioMuted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  spotlightNick: string | null;
  videoSendFn: ((text: string) => void) | null;

  startCall: (nick: string, video?: boolean) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  hangup: () => void;
  joinRoom: (channel: string, voiceOnly?: boolean) => void;
  leaveRoom: (channel: string) => void;
  toggleAudioMute: () => void;
  toggleVideoOff: () => void;
  toggleScreenShare: () => void;
  setSpotlight: (nick: string | null) => void;
  handleVideoLine: (fromNick: string, target: string, type: string, payload: string) => void;
  sendLadonMedia: (target: string, type: string, payload?: unknown) => void;
  setVideoSendFn: (fn: (text: string) => void) => void;
  getVideoServerBuffer: () => string | null;
  isVideoActive: () => boolean;
  getActivePeers: () => PeerState[];
  switchDevice: (kind: 'audioinput' | 'videoinput', deviceId: string) => void;
  updateIceServers: () => void;
}

type CombinedSlice = VideoSlice & BuffersSlice & SettingsSlice;

let sendFn: ((text: string) => void) | null = null;

function encodePayload(payload?: unknown): string {
  if (payload === undefined || payload === null) return '{}';
  if (typeof payload === 'string') return payload || '{}';
  return JSON.stringify(payload);
}

function sendMedia(target: string, type: string, payload?: unknown) {
  if (!sendFn || !target || !type) return;
  sendFn(`/quote MEDIA ${target} ${type.toUpperCase()} :${encodePayload(payload)}`);
}

function normalizeNick(nick: string): string {
  return nick.toLowerCase();
}

function basePeer(nick: string, channel: string | null): PeerState {
  return {
    nick,
    channel,
    stream: null,
    screenStream: null,
    audioLevel: 0,
    speaking: false,
    connectionQuality: 'good',
  };
}

function resetCallState(): Partial<VideoSlice> {
  return {
    callState: 'idle',
    callWith: '',
    callChannel: null,
    callStartTime: null,
    peers: new Map(),
    audioLevels: new Map(),
    videoError: null,
    minimized: false,
    audioMuted: false,
    videoOff: false,
    screenSharing: false,
    spotlightNick: null,
    localStream: null,
    localScreenStream: null,
  };
}

function parsePayload(payload: string): Record<string, unknown> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export const createVideoSlice: StateCreator<CombinedSlice, [], [], VideoSlice> = (set, get) => ({
  callState: 'idle',
  callWith: '',
  callChannel: null,
  callType: 'video',
  callStartTime: null,
  localStream: null,
  localScreenStream: null,
  peers: new Map(),
  audioLevels: new Map(),
  videoError: null,
  minimized: false,
  audioMuted: false,
  videoOff: false,
  screenSharing: false,
  spotlightNick: null,
  videoSendFn: null,

  startCall: (nick, video = true) => {
    const callType = video ? 'video' : 'voice';
    set({
      callState: 'ringing_out',
      callWith: nick,
      callChannel: null,
      callType,
      callStartTime: null,
      peers: new Map([[normalizeNick(nick), basePeer(nick, null)]]),
      videoError: null,
      minimized: false,
    });
    sendMedia(nick, 'INVITE', {
      action: 'invite',
      mode: callType,
      transport: 'ladon',
      client: 'darkbear',
      ts: Date.now(),
    });
  },

  acceptCall: () => {
    const { callWith, callType } = get();
    if (!callWith) return;
    sendMedia(callWith, 'ACCEPT', { mode: callType, transport: 'ladon', client: 'darkbear', ts: Date.now() });
    set({
      callState: 'in_call',
      callStartTime: Date.now(),
      peers: new Map([[normalizeNick(callWith), basePeer(callWith, null)]]),
      videoError: null,
    });
  },

  rejectCall: () => {
    const { callWith } = get();
    if (callWith) sendMedia(callWith, 'REJECT', { reason: 'declined', ts: Date.now() });
    set(resetCallState());
  },

  hangup: () => {
    const { callChannel, callWith } = get();
    if (callChannel) sendMedia(callChannel, 'LEAVE', { ts: Date.now() });
    else if (callWith) sendMedia(callWith, 'HANGUP', { ts: Date.now() });
    set(resetCallState());
  },

  joinRoom: (channel, voiceOnly = false) => {
    const callType = voiceOnly ? 'voice' : 'video';
    sendMedia(channel, voiceOnly ? 'VOICE_JOIN' : 'VIDEO_JOIN', {
      action: 'join',
      mode: callType,
      transport: 'ladon',
      client: 'darkbear',
      ts: Date.now(),
    });
    set({
      callState: 'in_call',
      callWith: '',
      callChannel: channel,
      callType,
      callStartTime: Date.now(),
      peers: new Map(),
      videoError: null,
      minimized: false,
    });
  },

  leaveRoom: (channel) => {
    sendMedia(channel, 'LEAVE', { ts: Date.now() });
    set(resetCallState());
  },

  toggleAudioMute: () => {
    const muted = !get().audioMuted;
    const target = get().callChannel || get().callWith;
    set({ audioMuted: muted });
    if (target) sendMedia(target, muted ? 'MUTE' : 'UNMUTE', { audio: muted, ts: Date.now() });
  },

  toggleVideoOff: () => {
    const off = !get().videoOff;
    const target = get().callChannel || get().callWith;
    set({ videoOff: off });
    if (target) sendMedia(target, off ? 'VIDEO_OFF' : 'VIDEO_ON', { video: !off, ts: Date.now() });
  },

  toggleScreenShare: () => {
    const sharing = !get().screenSharing;
    const target = get().callChannel || get().callWith;
    set({ screenSharing: sharing, spotlightNick: sharing ? '_screen' : null });
    if (target) sendMedia(target, sharing ? 'SCREEN_START' : 'SCREEN_STOP', { screen: sharing, ts: Date.now() });
  },

  setSpotlight: (nick) => set({ spotlightNick: nick }),

  handleVideoLine: (fromNick, target, rawType, payload) => {
    const type = rawType.toUpperCase();
    const data = parsePayload(payload);
    const mode = data.mode === 'voice' || type.includes('VOICE') ? 'voice' : 'video';
    const isChannel = target.startsWith('#') || target.startsWith('&');

    if (type === 'INVITE' || type === 'RING' || type === 'VOICERING') {
      if (get().callState !== 'idle') {
        sendMedia(fromNick, 'BUSY', { reason: 'already-in-call', ts: Date.now() });
        return;
      }
      set({
        callState: 'ringing_in',
        callWith: fromNick,
        callChannel: isChannel ? target : null,
        callType: mode,
        peers: new Map([[normalizeNick(fromNick), basePeer(fromNick, isChannel ? target : null)]]),
        videoError: null,
      });
      return;
    }

    if (type === 'ACCEPT' || type === 'JOINED') {
      set({
        callState: 'in_call',
        callStartTime: get().callStartTime ?? Date.now(),
        peers: new Map(get().peers).set(normalizeNick(fromNick), basePeer(fromNick, isChannel ? target : get().callChannel)),
        videoError: null,
      });
      return;
    }

    if (type === 'REJECT' || type === 'BUSY') {
      set({ ...resetCallState(), videoError: `${fromNick} is unavailable for LADON media` });
      setTimeout(() => set({ videoError: null }), 5000);
      return;
    }

    if (type === 'HANGUP' || type === 'LEAVE' || type === 'LEFT') {
      const next = new Map(get().peers);
      next.delete(normalizeNick(fromNick));
      if (!get().callChannel || next.size === 0) set(resetCallState());
      else set({ peers: next, spotlightNick: get().spotlightNick === fromNick ? null : get().spotlightNick });
      return;
    }

    if (type === 'SPEAKING' || type === 'AUDIO_LEVEL') {
      const level = Number(data.level ?? 0);
      const speaking = Boolean(data.speaking ?? level > 0.08);
      const audioLevels = new Map(get().audioLevels);
      audioLevels.set(normalizeNick(fromNick), { level, speaking });
      const peers = new Map(get().peers);
      const existing = peers.get(normalizeNick(fromNick)) ?? basePeer(fromNick, isChannel ? target : get().callChannel);
      peers.set(normalizeNick(fromNick), { ...existing, audioLevel: level, speaking });
      set({ audioLevels, peers });
      return;
    }

    if (type === 'SCREEN_START') set({ spotlightNick: fromNick });
    if (type === 'SCREEN_STOP' && get().spotlightNick === fromNick) set({ spotlightNick: null });
  },

  sendLadonMedia: (target, type, payload) => sendMedia(target, type, payload),

  setVideoSendFn: (fn) => {
    sendFn = fn;
    set({ videoSendFn: fn });
  },

  getVideoServerBuffer: () => {
    const { activeBuffer, buffers } = get();
    if (!activeBuffer) return null;
    const entry = buffers.get(activeBuffer);
    if (!entry) return null;
    const serverName = entry.buffer.localVars['server'];
    if (!serverName && entry.buffer.localVars['type'] === 'server') return entry.buffer.id;
    for (const [, e] of buffers) {
      if (e.buffer.localVars['server'] === serverName && e.buffer.localVars['type'] === 'server') return e.buffer.id;
      if (e.buffer.localVars['server'] === serverName && !e.buffer.localVars['type']) return e.buffer.id;
    }
    return null;
  },

  isVideoActive: () => get().callState !== 'idle',

  getActivePeers: () => {
    const { peers, callChannel, callWith } = get();
    const all = [...peers.values()];
    if (callChannel) return all.filter(p => p.channel === callChannel || p.channel === null);
    return all.filter(p => p.nick.toLowerCase() === callWith.toLowerCase());
  },

  switchDevice: () => {
    set({ videoError: 'Darkbear media uses LADON server transport; local capture devices are not configured here.' });
    setTimeout(() => set({ videoError: null }), 5000);
  },

  updateIceServers: () => {
    // Compatibility no-op. LADON transport is server coordinated.
  },
});
