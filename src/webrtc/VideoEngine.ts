export type CallState = 'idle' | 'ringing_out' | 'ringing_in' | 'connecting' | 'in_call';

export interface PeerState {
  nick: string;
  connection: RTCPeerConnection;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  channel: string | null;
  audioLevel: number;
  speaking: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
}

export interface VideoEngineCallbacks {
  onCallState: (state: CallState, nick: string, channel: string | null) => void;
  onPeerStream: (nick: string, stream: MediaStream) => void;
  onPeerScreenStream: (nick: string, stream: MediaStream | null) => void;
  onPeerLeft: (nick: string) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onLocalScreenStream: (stream: MediaStream | null) => void;
  onAudioLevels: (levels: Map<string, { level: number; speaking: boolean }>) => void;
  onConnectionQuality: (nick: string, quality: PeerState['connectionQuality']) => void;
  onError: (msg: string) => void;
  sendWebRTC: (target: string, type: string, payload?: string) => void;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const AUDIO_LEVEL_INTERVAL = 50;
const SPEAKING_THRESHOLD = 0.015;
const SPEAKING_DEBOUNCE = 300;
const STATS_INTERVAL = 3000;
const RING_TIMEOUT_MS = 30_000;

export class VideoEngine {
  private cb: VideoEngineCallbacks;
  private peers = new Map<string, PeerState>();
  private localStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private activeRoom: string | null = null;
  private callState: CallState = 'idle';
  private callWith = '';
  private _pendingOffer: { nick: string; sdp: string } | undefined;
  private _roomVoiceOnly = false;
  private audioContext: AudioContext | null = null;
  private analysers = new Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>();
  private audioLevelTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private speakingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _videoEnabled = true;
  private iceServers: RTCIceServer[] = [...DEFAULT_ICE_SERVERS];
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: VideoEngineCallbacks) {
    this.cb = callbacks;
  }

  setIceServers(turnUrl: string, turnUsername: string, turnCredential: string) {
    this.iceServers = [...DEFAULT_ICE_SERVERS];
    if (turnUrl) {
      this.iceServers.push({ urls: turnUrl, username: turnUsername || undefined, credential: turnCredential || undefined });
    }
  }

  getLocalStream() { return this.localStream; }
  getLocalScreenStream() { return this.localScreenStream; }
  getPeers() { return new Map(this.peers); }
  getCallState() {
    return { callState: this.callState, callWith: this.callWith, callChannel: this.activeRoom };
  }

  // ── Media ──────────────────────────────────────────────────────────────────

  private async getMedia(videoRequested = true): Promise<MediaStream> {
    if (this.localStream) return this.localStream;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: videoRequested ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
      });
      this._videoEnabled = videoRequested && stream.getVideoTracks().length > 0;
      this.localStream = stream;
      this.cb.onLocalStream(stream);
      this.setupLocalAudioAnalyser(stream);
      return stream;
    } catch {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this._videoEnabled = false;
      this.localStream = stream;
      this.cb.onLocalStream(stream);
      this.setupLocalAudioAnalyser(stream);
      return stream;
    }
  }

  private releaseMedia() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
      this.cb.onLocalStream(null);
    }
    this.stopScreenShare();
    this.stopAudioAnalysis();
    this.stopStatsPolling();
  }

  // ── Screen Sharing ─────────────────────────────────────────────────────────

  async startScreenShare(): Promise<boolean> {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: false,
      });
      this.localScreenStream = screen;
      this.cb.onLocalScreenStream(screen);

      const videoTrack = screen.getVideoTracks()[0];
      videoTrack.onended = () => this.stopScreenShare();

      for (const peer of this.peers.values()) {
        const senders = peer.connection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender && videoTrack) {
          await videoSender.replaceTrack(videoTrack);
        } else {
          peer.connection.addTrack(videoTrack, screen);
        }
        this.cb.sendWebRTC(peer.nick, 'SCREEN', 'start');
      }
      return true;
    } catch {
      return false;
    }
  }

  async stopScreenShare() {
    if (!this.localScreenStream) return;
    this.localScreenStream.getTracks().forEach(t => t.stop());
    this.localScreenStream = null;
    this.cb.onLocalScreenStream(null);

    if (this.localStream) {
      const camTrack = this.localStream.getVideoTracks()[0];
      for (const peer of this.peers.values()) {
        const senders = peer.connection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender && camTrack) {
          await videoSender.replaceTrack(camTrack);
        }
        this.cb.sendWebRTC(peer.nick, 'SCREEN', 'stop');
      }
    }
  }

  // ── Audio Analysis ─────────────────────────────────────────────────────────

  private getAudioContext(): AudioContext {
    if (!this.audioContext) this.audioContext = new AudioContext();
    return this.audioContext;
  }

  private setupLocalAudioAnalyser(stream: MediaStream) {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    this.setupAnalyser('_local', stream);
    this.startAudioLevelPolling();
  }

  private setupAnalyser(key: string, stream: MediaStream) {
    const existing = this.analysers.get(key);
    if (existing) {
      existing.source.disconnect();
    }
    const ctx = this.getAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    this.analysers.set(key, { analyser, source });
  }

  private startAudioLevelPolling() {
    if (this.audioLevelTimer) return;
    this.audioLevelTimer = setInterval(() => {
      const levels = new Map<string, { level: number; speaking: boolean }>();

      for (const [key, { analyser }] of this.analysers) {
        const data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const normalized = Math.min(1, rms / 0.3);

        const wasSpeaking = key === '_local'
          ? false
          : (this.peers.get(key)?.speaking ?? false);
        const isSpeaking = normalized > SPEAKING_THRESHOLD;

        if (isSpeaking) {
          const timer = this.speakingTimers.get(key);
          if (timer) clearTimeout(timer);
          this.speakingTimers.set(key, setTimeout(() => {
            this.speakingTimers.delete(key);
          }, SPEAKING_DEBOUNCE));
          levels.set(key, { level: normalized, speaking: true });
        } else {
          const hasPendingTimer = this.speakingTimers.has(key);
          levels.set(key, { level: normalized, speaking: hasPendingTimer || wasSpeaking });
        }
      }

      this.cb.onAudioLevels(levels);
    }, AUDIO_LEVEL_INTERVAL);
  }

  private stopAudioAnalysis() {
    if (this.audioLevelTimer) {
      clearInterval(this.audioLevelTimer);
      this.audioLevelTimer = null;
    }
    for (const { source } of this.analysers.values()) source.disconnect();
    this.analysers.clear();
    for (const t of this.speakingTimers.values()) clearTimeout(t);
    this.speakingTimers.clear();
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  // ── Connection Quality ─────────────────────────────────────────────────────

  private startStatsPolling() {
    if (this.statsTimer) return;
    this.statsTimer = setInterval(async () => {
      for (const [key, peer] of this.peers) {
        try {
          const stats = await peer.connection.getStats();
          let packetsLost = 0;
          let packetsReceived = 0;
          let roundTripTime = 0;

          stats.forEach(report => {
            if (report.type === 'inbound-rtp') {
              packetsLost += report.packetsLost ?? 0;
              packetsReceived += report.packetsReceived ?? 0;
            }
            if (report.type === 'candidate-pair' && report.currentRoundTripTime) {
              roundTripTime = report.currentRoundTripTime * 1000;
            }
          });

          const total = packetsLost + packetsReceived;
          const lossRate = total > 0 ? packetsLost / total : 0;

          let quality: PeerState['connectionQuality'] = 'excellent';
          if (lossRate > 0.1 || roundTripTime > 500) quality = 'poor';
          else if (lossRate > 0.03 || roundTripTime > 200) quality = 'good';

          if (peer.connectionQuality !== quality) {
            peer.connectionQuality = quality;
            this.cb.onConnectionQuality(peer.nick, quality);
          }
        } catch { /* ignore stats errors */ }
      }
    }, STATS_INTERVAL);
  }

  private stopStatsPolling() {
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
  }

  // ── Peer connections ──────────────────────────────────────────────────────

  private createPeer(nick: string, channel: string | null): RTCPeerConnection {
    const key = nick.toLowerCase();
    const existing = this.peers.get(key);
    if (existing) existing.connection.close();

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => {
        this.localStream && pc.addTrack(t, this.localStream);
      });
    }

    pc.onicecandidate = ev => {
      if (ev.candidate) this.cb.sendWebRTC(nick, 'ICE', JSON.stringify(ev.candidate));
    };

    pc.ontrack = ev => {
      const stream = ev.streams[0];
      if (stream) {
        const peer = this.peers.get(key);
        if (peer) {
          peer.stream = stream;
          if (stream.getAudioTracks().length > 0) {
            this.setupAnalyser(key, stream);
          }
        }
        this.cb.onPeerStream(nick, stream);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        this.startStatsPolling();
        if (this.callState === 'connecting') {
          this.callState = 'in_call';
          this.cb.onCallState('in_call', this.callWith, this.activeRoom);
        }
      }
      if (state === 'failed') {
        this.iceRestart(nick).catch(() => {
          this.removePeer(nick, channel);
        });
        return;
      }
      if (state === 'disconnected' || state === 'closed') {
        this.removePeer(nick, channel);
      }
    };

    this.peers.set(key, {
      nick, connection: pc, stream: null, screenStream: null,
      channel, audioLevel: 0, speaking: false, connectionQuality: 'good',
    });
    return pc;
  }

  private removePeer(nick: string, channel: string | null) {
    const key = nick.toLowerCase();
    const peer = this.peers.get(key);
    if (peer) peer.connectionQuality = 'disconnected';
    this.analysers.get(key)?.source.disconnect();
    this.analysers.delete(key);
    this.peers.delete(key);
    this.cb.onPeerLeft(nick);
    if (channel === null && key === this.callWith.toLowerCase()) {
      this._setIdle();
    }
  }

  private async iceRestart(nick: string) {
    const key = nick.toLowerCase();
    const peer = this.peers.get(key);
    if (!peer) return;
    const offer = await peer.connection.createOffer({ iceRestart: true });
    await peer.connection.setLocalDescription(offer);
    this.cb.sendWebRTC(nick, 'OFFER', JSON.stringify(offer));
  }

  private closePeer(nick: string) {
    const key = nick.toLowerCase();
    const peer = this.peers.get(key);
    if (peer) {
      peer.connection.close();
      this.analysers.get(key)?.source.disconnect();
      this.analysers.delete(key);
      this.peers.delete(key);
      this.cb.onPeerLeft(nick);
    }
  }

  private _clearRingTimeout() {
    if (this.ringTimeout) { clearTimeout(this.ringTimeout); this.ringTimeout = null; }
  }

  private _startRingTimeout() {
    this._clearRingTimeout();
    this.ringTimeout = setTimeout(() => {
      if (this.callState === 'ringing_out') {
        this.hangup(this.callWith);
        this.cb.onError('No answer');
      } else if (this.callState === 'ringing_in') {
        this.rejectCall(this.callWith);
      }
    }, RING_TIMEOUT_MS);
  }

  private _setIdle() {
    this._clearRingTimeout();
    if (this.peers.size === 0) this.releaseMedia();
    this.callState = 'idle';
    this.callWith = '';
    this.activeRoom = null;
    this._roomVoiceOnly = false;
    this.cb.onCallState('idle', '', null);
  }

  // ── P2P calls ──────────────────────────────────────────────────────────────

  async startCall(nick: string, videoEnabled = true) {
    if (this.callState !== 'idle') { this.cb.onError('Already in a call'); return; }
    try {
      await this.getMedia(videoEnabled);
      const pc = this.createPeer(nick, null);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.cb.sendWebRTC(nick, videoEnabled ? 'RING' : 'VOICERING');
      this.cb.sendWebRTC(nick, 'OFFER', JSON.stringify(offer));
      this.callState = 'ringing_out';
      this.callWith = nick;
      this.cb.onCallState('ringing_out', nick, null);
      this._startRingTimeout();
    } catch (e) {
      this.cb.onError(`Failed to start call: ${e}`);
    }
  }

  async answerCall(nick: string, offerSdp: string) {
    try {
      await this.getMedia();
      const offer: RTCSessionDescriptionInit = JSON.parse(offerSdp);
      const pc = this.createPeer(nick, null);
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.cb.sendWebRTC(nick, 'ANSWER', JSON.stringify(answer));
      this._clearRingTimeout();
      this.callState = 'connecting';
      this.callWith = nick;
      this.cb.onCallState('connecting', nick, null);
    } catch (e) {
      this.cb.onError(`Failed to answer call: ${e}`);
    }
  }

  async handleAnswer(nick: string, answerSdp: string) {
    const key = nick.toLowerCase();
    const peer = this.peers.get(key);
    if (!peer) return;
    try {
      const answer: RTCSessionDescriptionInit = JSON.parse(answerSdp);
      await peer.connection.setRemoteDescription(answer);
      this._clearRingTimeout();
      this.callState = 'connecting';
      this.cb.onCallState('connecting', nick, null);
    } catch (e) {
      this.cb.onError(`Failed to handle answer: ${e}`);
    }
  }

  async addIceCandidate(nick: string, candidateJson: string) {
    const key = nick.toLowerCase();
    const peer = this.peers.get(key);
    if (!peer) return;
    try { await peer.connection.addIceCandidate(JSON.parse(candidateJson)); }
    catch { /* ignore */ }
  }

  hangup(nick: string) {
    this.cb.sendWebRTC(nick, 'HANGUP');
    this.closePeer(nick);
    if (nick.toLowerCase() === this.callWith.toLowerCase()) this._setIdle();
  }

  rejectCall(nick: string) {
    this.cb.sendWebRTC(nick, 'BUSY');
    this.closePeer(nick);
    if (this.callState === 'ringing_in' && nick.toLowerCase() === this.callWith.toLowerCase()) {
      this._setIdle();
    }
  }

  acceptIncomingCall() {
    if (this._pendingOffer) {
      const { nick, sdp } = this._pendingOffer;
      this._pendingOffer = undefined;
      this.answerCall(nick, sdp);
    }
  }

  // ── Group video room ──────────────────────────────────────────────────────

  async joinRoom(channel: string, voiceOnly = false) {
    if (this.activeRoom === channel) return;
    this.activeRoom = channel;
    this._roomVoiceOnly = voiceOnly;
    try {
      await this.getMedia(!voiceOnly);
      this.cb.sendWebRTC(channel, voiceOnly ? 'VJOIN' : 'JOIN');
      this.callState = 'in_call';
      this.cb.onCallState('in_call', '', channel);
    } catch (e) {
      this.cb.onError(`Failed to join room: ${e}`);
    }
  }

  leaveRoom(channel: string) {
    if (this.activeRoom !== channel) return;
    this.cb.sendWebRTC(channel, this._roomVoiceOnly ? 'VLEAVE' : 'LEAVE');
    for (const [key, peer] of this.peers) {
      if (peer.channel === channel) {
        peer.connection.close();
        this.analysers.get(key)?.source.disconnect();
        this.analysers.delete(key);
        this.peers.delete(key);
        this.cb.onPeerLeft(peer.nick);
      }
    }
    this.activeRoom = null;
    this._setIdle();
  }

  async offerRoomPeer(nick: string) {
    if (!this.activeRoom) return;
    try {
      await this.getMedia();
      const pc = this.createPeer(nick, this.activeRoom);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.cb.sendWebRTC(nick, 'OFFER', JSON.stringify(offer));
    } catch (e) {
      this.cb.onError(`Failed to offer room peer: ${e}`);
    }
  }

  async answerRoomPeer(nick: string, offerSdp: string) {
    if (!this.activeRoom) return;
    try {
      await this.getMedia();
      const offer: RTCSessionDescriptionInit = JSON.parse(offerSdp);
      const pc = this.createPeer(nick, this.activeRoom);
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.cb.sendWebRTC(nick, 'ANSWER', JSON.stringify(answer));
    } catch (e) {
      this.cb.onError(`Failed to answer room peer: ${e}`);
    }
  }

  // ── Incoming message dispatcher ───────────────────────────────────────────

  handleWebRTCMessage(fromNick: string, target: string, type: string, payload: string) {
    const isChannel = target.startsWith('#') || target.startsWith('&');

    if (isChannel) {
      switch (type) {
        case 'JOIN':
        case 'VJOIN':
          if (this.activeRoom === target) this.offerRoomPeer(fromNick);
          break;
        case 'LEAVE':
        case 'VLEAVE':
          this.closePeer(fromNick);
          break;
      }
    } else {
      switch (type) {
        case 'RING':
        case 'VOICERING':
          if (this.callState === 'idle') {
            this.callState = 'ringing_in';
            this.callWith = fromNick;
            this.cb.onCallState('ringing_in', fromNick, null);
            this._startRingTimeout();
          }
          break;
        case 'OFFER':
          if (this.activeRoom) {
            this.answerRoomPeer(fromNick, payload);
          } else {
            this._pendingOffer = { nick: fromNick, sdp: payload };
          }
          break;
        case 'ANSWER':
          this.handleAnswer(fromNick, payload);
          break;
        case 'ICE':
          this.addIceCandidate(fromNick, payload);
          break;
        case 'HANGUP':
          this.closePeer(fromNick);
          if (fromNick.toLowerCase() === this.callWith.toLowerCase()) this._setIdle();
          break;
        case 'BUSY':
          if (fromNick.toLowerCase() === this.callWith.toLowerCase()) {
            this.closePeer(fromNick);
            this._setIdle();
            this.cb.onError(`${fromNick} is busy`);
          }
          break;
        case 'SCREEN': {
          const key = fromNick.toLowerCase();
          const peer = this.peers.get(key);
          if (peer) {
            if (payload === 'start') {
              peer.screenStream = peer.stream;
              this.cb.onPeerScreenStream(fromNick, peer.stream);
            } else if (payload === 'stop') {
              peer.screenStream = null;
              this.cb.onPeerScreenStream(fromNick, null);
            }
          }
          break;
        }
      }
    }
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
  }

  setVideoEnabled(enabled: boolean) {
    this._videoEnabled = enabled;
    this.localStream?.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  async switchDevice(kind: 'audioinput' | 'videoinput', deviceId: string) {
    if (!this.localStream) return;
    const constraints: MediaStreamConstraints = kind === 'audioinput'
      ? { audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
      : { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } };

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = newStream.getTracks()[0];
      const oldTrack = kind === 'audioinput'
        ? this.localStream.getAudioTracks()[0]
        : this.localStream.getVideoTracks()[0];

      if (oldTrack) {
        this.localStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      this.localStream.addTrack(newTrack);

      for (const peer of this.peers.values()) {
        const sender = peer.connection.getSenders().find(s => s.track?.kind === newTrack.kind);
        if (sender) await sender.replaceTrack(newTrack);
      }

      if (kind === 'audioinput') {
        this.setupLocalAudioAnalyser(this.localStream);
      }

      this.cb.onLocalStream(this.localStream);
    } catch (e) {
      this.cb.onError(`Failed to switch device: ${e}`);
    }
  }

  destroy() {
    this._clearRingTimeout();
    for (const peer of this.peers.values()) peer.connection.close();
    this.peers.clear();
    this.releaseMedia();
    this.callState = 'idle';
  }
}
