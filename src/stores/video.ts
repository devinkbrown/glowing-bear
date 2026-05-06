import type { StateCreator } from 'zustand';
import { VideoEngine, type CallState, type PeerState } from '@/webrtc/VideoEngine';
import type { BuffersSlice } from './buffers';
import type { SettingsSlice } from './settings';

export interface VideoSlice {
  callState: CallState;
  callWith: string;
  callChannel: string | null;
  callType: 'video' | 'voice';
  callStartTime: number | null;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
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
  setVideoSendFn: (fn: (text: string) => void) => void;
  getVideoServerBuffer: () => string | null;
  isVideoActive: () => boolean;
  getActivePeers: () => PeerState[];
  switchDevice: (kind: 'audioinput' | 'videoinput', deviceId: string) => void;
  updateIceServers: () => void;
}

type CombinedSlice = VideoSlice & BuffersSlice & SettingsSlice;

let engine: VideoEngine | null = null;
let sendFn: ((text: string) => void) | null = null;

function sendWebRTC(target: string, type: string, payload = '') {
  if (!sendFn) return;
  const cmd = payload
    ? `/quote WEBRTC ${target} ${type} :${payload}`
    : `/quote WEBRTC ${target} ${type}`;
  sendFn(cmd);
}

let getStore: () => CombinedSlice;

function getEngine(set: (partial: Partial<VideoSlice>) => void): VideoEngine {
  if (!engine) {
    engine = new VideoEngine({
      onCallState: (state, nick, channel) => {
        const partial: Partial<VideoSlice> = { callState: state, callWith: nick, callChannel: channel };
        if (state === 'in_call' || state === 'connecting') {
          if (!getStore().callStartTime) partial.callStartTime = Date.now();
        }
        if (state === 'idle') {
          Object.assign(partial, {
            peers: new Map(), minimized: false, audioMuted: false, videoOff: false,
            screenSharing: false, spotlightNick: null, callStartTime: null,
            audioLevels: new Map(), localScreenStream: null,
          });
        }
        set(partial);
      },
      onPeerStream: (nick, stream) => {
        const state = getStore();
        const next = new Map(state.peers);
        const existing = next.get(nick.toLowerCase());
        next.set(nick.toLowerCase(), {
          ...(existing ?? { connection: null as unknown as RTCPeerConnection, screenStream: null, channel: null, audioLevel: 0, speaking: false, connectionQuality: 'good' as const }),
          nick, stream,
        } as PeerState);
        set({ peers: next });
      },
      onPeerScreenStream: (nick, stream) => {
        const state = getStore();
        const next = new Map(state.peers);
        const existing = next.get(nick.toLowerCase());
        if (existing) {
          next.set(nick.toLowerCase(), { ...existing, screenStream: stream });
          set({ peers: next });
          if (stream) set({ spotlightNick: nick });
          else if (getStore().spotlightNick === nick) set({ spotlightNick: null });
        }
      },
      onPeerLeft: (nick) => {
        const state = getStore();
        const next = new Map(state.peers);
        next.delete(nick.toLowerCase());
        const partial: Partial<VideoSlice> = { peers: next };
        if (state.spotlightNick === nick) partial.spotlightNick = null;
        set(partial);
      },
      onLocalStream: (stream) => set({ localStream: stream }),
      onLocalScreenStream: (stream) => set({ localScreenStream: stream, screenSharing: !!stream }),
      onAudioLevels: (levels) => set({ audioLevels: levels }),
      onConnectionQuality: (nick, quality) => {
        const state = getStore();
        const next = new Map(state.peers);
        const existing = next.get(nick.toLowerCase());
        if (existing) {
          next.set(nick.toLowerCase(), { ...existing, connectionQuality: quality });
          set({ peers: next });
        }
      },
      onError: (msg) => {
        set({ videoError: msg });
        setTimeout(() => set({ videoError: null }), 5000);
      },
      sendWebRTC,
    });
  }
  return engine;
}

export const createVideoSlice: StateCreator<CombinedSlice, [], [], VideoSlice> = (set, get) => {
  getStore = get;
  return ({
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
    set({ callType: video ? 'video' : 'voice' });
    getEngine(set as (p: Partial<VideoSlice>) => void).startCall(nick, video);
  },
  acceptCall: () => getEngine(set as (p: Partial<VideoSlice>) => void).acceptIncomingCall(),
  rejectCall: () => {
    const { callWith } = get();
    if (callWith) getEngine(set as (p: Partial<VideoSlice>) => void).rejectCall(callWith);
  },
  hangup: () => {
    const { callChannel, callWith } = get();
    const eng = getEngine(set as (p: Partial<VideoSlice>) => void);
    if (callChannel) eng.leaveRoom(callChannel);
    else if (callWith) eng.hangup(callWith);
  },

  joinRoom: (channel, voiceOnly) => getEngine(set as (p: Partial<VideoSlice>) => void).joinRoom(channel, voiceOnly),
  leaveRoom: (channel) => getEngine(set as (p: Partial<VideoSlice>) => void).leaveRoom(channel),

  toggleAudioMute: () => {
    const muted = !get().audioMuted;
    set({ audioMuted: muted });
    getEngine(set as (p: Partial<VideoSlice>) => void).setMuted(muted);
  },
  toggleVideoOff: () => {
    const off = !get().videoOff;
    set({ videoOff: off });
    getEngine(set as (p: Partial<VideoSlice>) => void).setVideoEnabled(!off);
  },
  toggleScreenShare: () => {
    const eng = getEngine(set as (p: Partial<VideoSlice>) => void);
    if (get().screenSharing) eng.stopScreenShare();
    else eng.startScreenShare();
  },
  setSpotlight: (nick) => set({ spotlightNick: nick }),

  handleVideoLine: (fromNick, target, type, payload) => {
    if ((type === 'RING' || type === 'VOICERING') && !target.startsWith('#') && !get().settings.enableVideoCalls) {
      sendWebRTC(fromNick, 'BUSY', '');
      return;
    }
    if (type === 'RING') set({ callType: 'video' });
    else if (type === 'VOICERING') set({ callType: 'voice' });
    getEngine(set as (p: Partial<VideoSlice>) => void).handleWebRTCMessage(fromNick, target, type, payload);
  },

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
    if (!serverName) return null;
    for (const [, e] of buffers) {
      if (e.buffer.localVars['server'] === serverName && !e.buffer.localVars['type']) {
        return e.buffer.id;
      }
    }
    return null;
  },

  isVideoActive: () => get().callState !== 'idle',

  getActivePeers: () => {
    const { peers, callChannel, callWith } = get();
    const all = [...peers.values()];
    if (callChannel) return all.filter(p => p.channel === callChannel);
    return all.filter(p => p.nick.toLowerCase() === callWith.toLowerCase());
  },

  switchDevice: (kind, deviceId) => {
    getEngine(set as (p: Partial<VideoSlice>) => void).switchDevice(kind, deviceId);
  },

  updateIceServers: () => {
    const { turnUrl, turnUsername, turnCredential } = get().settings;
    getEngine(set as (p: Partial<VideoSlice>) => void).setIceServers(turnUrl, turnUsername, turnCredential);
  },
});
};
