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

export interface VoiceParticipant {
  nick: string;
  sample_rate: number;
  speaking: boolean;
  rtt_ms: number;
  loss: number;
}

export interface VideoParticipant {
  nick: string;
  w: number;
  h: number;
  fps: number;
  screen: boolean;
  seen_iframe: boolean;
}

export interface MediaStat {
  nick: string;
  rtt_ms: number;
  loss: number;
  bw_kbps: number;
  frames_total: number;
  frames_i: number;
  keyframe_pending: boolean;
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
  rosterVoice: VoiceParticipant[];
  rosterVideo: VideoParticipant[];
  mediaStats: MediaStat[];
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
  handleServerMedia: (channel: string, subtype: string, payload: string) => void;
  requestRoster: (channel: string) => void;
  requestStats: (channel: string) => void;
  sendLadonMedia: (target: string, type: string, payload?: unknown) => void;
  sendMediaFrame: (channel: string, subtype: string, payload?: string) => void;
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

// Old-style MEDIA signaling (DM calls, backward compat with other clients)
function sendMedia(target: string, type: string, payload?: unknown) {
  if (!sendFn || !target || !type) return;
  sendFn(`/quote MEDIA ${target} ${type.toUpperCase()} :${encodePayload(payload)}`);
}

// New MEDIAFRAME command (channel voice/video via ophion server pipeline)
function sendMediaFrameCmd(channel: string, subtype: string, payload = '') {
  if (!sendFn || !channel || !subtype) return;
  sendFn(`/quote MEDIAFRAME ${channel} ${subtype}${payload ? ` :${payload}` : ''}`);
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
    rosterVoice: [],
    rosterVideo: [],
    mediaStats: [],
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

function qualityFromStats(stat: MediaStat): PeerState['connectionQuality'] {
  if (stat.loss < 0.02 && stat.rtt_ms < 100) return 'excellent';
  if (stat.loss < 0.05 && stat.rtt_ms < 200) return 'good';
  if (stat.loss < 0.10 && stat.rtt_ms < 400) return 'fair';
  return 'poor';
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
  rosterVoice: [],
  rosterVideo: [],
  mediaStats: [],
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
    const { callChannel, callWith, callType } = get();
    if (callChannel) {
      // Channel session: leave via MEDIAFRAME
      sendMediaFrameCmd(callChannel, callType === 'voice' ? 'VOICE_LEAVE' : 'VIDEO_LEAVE');
    } else if (callWith) {
      // DM call: old MEDIA HANGUP signaling
      sendMedia(callWith, 'HANGUP', { ts: Date.now() });
    }
    set(resetCallState());
  },

  joinRoom: (channel, voiceOnly = false) => {
    const callType = voiceOnly ? 'voice' : 'video';
    // Use MEDIAFRAME with ophion server pipeline (320x240 15fps for IRC-friendly bandwidth)
    if (voiceOnly) {
      sendMediaFrameCmd(channel, 'VOICE_JOIN', '48000 2');
    } else {
      sendMediaFrameCmd(channel, 'VIDEO_JOIN', '320 240 40 15');
    }
    set({
      callState: 'in_call',
      callWith: '',
      callChannel: channel,
      callType,
      callStartTime: Date.now(),
      peers: new Map(),
      rosterVoice: [],
      rosterVideo: [],
      mediaStats: [],
      videoError: null,
      minimized: false,
    });
    // Request roster immediately so participants populate
    sendMediaFrameCmd(channel, 'ROSTER', '');
  },

  leaveRoom: (channel) => {
    const { callType } = get();
    sendMediaFrameCmd(channel, callType === 'voice' ? 'VOICE_LEAVE' : 'VIDEO_LEAVE');
    set(resetCallState());
  },

  toggleAudioMute: () => {
    set({ audioMuted: !get().audioMuted });
  },

  toggleVideoOff: () => {
    set({ videoOff: !get().videoOff });
  },

  toggleScreenShare: () => {
    const sharing = !get().screenSharing;
    const { callChannel, callType } = get();
    set({ screenSharing: sharing, spotlightNick: sharing ? '_screen' : null });
    if (callChannel && callType === 'video') {
      if (sharing) {
        sendMediaFrameCmd(callChannel, 'VIDEO_JOIN', '1280 720 60 15 screen');
      } else {
        sendMediaFrameCmd(callChannel, 'VIDEO_JOIN', '320 240 40 15');
      }
    }
  },

  setSpotlight: (nick) => set({ spotlightNick: nick }),

  handleVideoLine: (fromNick, target, rawType, payload) => {
    const type = rawType.toUpperCase();
    const data = parsePayload(payload);
    const mode = data.mode === 'voice' || type.includes('VOICE') ? 'voice' : 'video';
    const isChannel = target.startsWith('#') || target.startsWith('&');

    // DM call signaling (INVITE/ACCEPT/REJECT/HANGUP) — old MEDIA mechanism
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

  handleServerMedia: (channel, subtype, payload) => {
    const upper = subtype.toUpperCase();

    if (upper === 'ROSTER') {
      try {
        const data = JSON.parse(payload) as { voice?: VoiceParticipant[]; video?: VideoParticipant[] };
        set({
          rosterVoice: Array.isArray(data.voice) ? data.voice : [],
          rosterVideo: Array.isArray(data.video) ? data.video : [],
        });
        // Sync peers from roster so participant list is accurate
        const { callChannel } = get();
        if (callChannel && callChannel.toLowerCase() === channel.toLowerCase()) {
          const peers = new Map<string, PeerState>();
          for (const v of (data.voice ?? [])) {
            peers.set(normalizeNick(v.nick), {
              ...basePeer(v.nick, channel),
              speaking: v.speaking,
              audioLevel: v.speaking ? 0.5 : 0,
            });
          }
          set({ peers });
        }
      } catch { /* ignore parse errors */ }
      return;
    }

    if (upper === 'STATS') {
      try {
        const data = JSON.parse(payload) as { participants?: MediaStat[] };
        set({ mediaStats: Array.isArray(data.participants) ? data.participants : [] });
        // Update speaking state in peers from STATS rtt/loss data
        const peers = new Map(get().peers);
        let changed = false;
        for (const stat of (data.participants ?? [])) {
          const key = normalizeNick(stat.nick);
          const existing = peers.get(key);
          if (existing) {
            peers.set(key, { ...existing, connectionQuality: qualityFromStats(stat) });
            changed = true;
          }
        }
        if (changed) set({ peers });
      } catch { /* ignore parse errors */ }
      return;
    }

    if (upper === 'VIDEO_KEYREQ') {
      // Server requesting a keyframe — placeholder for opcodec integration
      set({ videoError: null });
      return;
    }
  },

  requestRoster: (channel) => {
    sendMediaFrameCmd(channel, 'ROSTER', '');
  },

  requestStats: (channel) => {
    sendMediaFrameCmd(channel, 'STATS', '');
  },

  sendLadonMedia: (target, type, payload) => sendMedia(target, type, payload),

  sendMediaFrame: (channel, subtype, payload) => sendMediaFrameCmd(channel, subtype, payload),

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
