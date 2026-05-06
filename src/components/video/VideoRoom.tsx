'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/stores';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import VideoTile from './VideoTile';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function VideoRoom() {
  const callState = useStore(s => s.callState);
  const callWith = useStore(s => s.callWith);
  const callChannel = useStore(s => s.callChannel);
  const callType = useStore(s => s.callType);
  const callStartTime = useStore(s => s.callStartTime);
  const localStream = useStore(s => s.localStream);
  const localScreenStream = useStore(s => s.localScreenStream);
  const getActivePeers = useStore(s => s.getActivePeers);
  const audioLevels = useStore(s => s.audioLevels);
  const hangup = useStore(s => s.hangup);
  const toggleAudioMute = useStore(s => s.toggleAudioMute);
  const toggleVideoOff = useStore(s => s.toggleVideoOff);
  const toggleScreenShare = useStore(s => s.toggleScreenShare);
  const setSpotlight = useStore(s => s.setSpotlight);
  const audioMuted = useStore(s => s.audioMuted);
  const videoOff = useStore(s => s.videoOff);
  const screenSharing = useStore(s => s.screenSharing);
  const spotlightNick = useStore(s => s.spotlightNick);
  const minimized = useStore(s => s.minimized);
  const videoError = useStore(s => s.videoError);

  const [elapsed, setElapsed] = useState('0:00');
  const [showDevices, setShowDevices] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 639px)');
  const isLandscape = useMediaQuery('(orientation: landscape) and (max-height: 500px)');

  // Timer
  useEffect(() => {
    if (!callStartTime) return;
    const tick = () => setElapsed(formatDuration(Date.now() - callStartTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [callStartTime]);

  // Fullscreen
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else roomRef.current?.requestFullscreen?.();
  }, []);

  // PiP drag handlers
  const onPipPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top };
  }, []);

  const onPipPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setPipPos({
        x: Math.max(0, Math.min(window.innerWidth - 220, dragRef.current.originX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 160, dragRef.current.originY + dy)),
      });
    }
  }, []);

  const onPipPointerUp = useCallback((e: React.PointerEvent) => {
    const wasDrag = dragRef.current && (
      Math.abs(e.clientX - dragRef.current.startX) > 3 ||
      Math.abs(e.clientY - dragRef.current.startY) > 3
    );
    dragRef.current = null;
    if (!wasDrag) useStore.setState({ minimized: false });
  }, []);

  // Load device list
  const loadDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === 'audioinput' || d.kind === 'videoinput'));
    } catch { /* no device access */ }
  }, []);

  if (callState !== 'in_call' && callState !== 'connecting') return null;

  const peers = getActivePeers();
  const title = callChannel ?? callWith;
  const participantCount = peers.length + 1;
  const localAudio = audioLevels.get('_local');

  // Grid layout logic
  const hasSpotlight = spotlightNick !== null;
  const totalTiles = participantCount + (localScreenStream ? 1 : 0);

  const gridClass = hasSpotlight
    ? 'grid-cols-1 lg:grid-cols-[1fr_280px]'
    : totalTiles <= 1 ? 'grid-cols-1 max-w-2xl mx-auto'
    : totalTiles <= 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-4xl mx-auto'
    : totalTiles <= 4 ? 'grid-cols-2'
    : totalTiles <= 9 ? 'grid-cols-2 sm:grid-cols-3'
    : 'grid-cols-3 sm:grid-cols-4';

  // ── Minimized PiP ────────────────────────────────────────────────────────

  if (minimized) {
    const pipStyle = pipPos
      ? { left: `${pipPos.x}px`, top: `${pipPos.y}px`, right: 'auto', bottom: 'auto' }
      : isMobile
        ? { right: '12px', bottom: '80px' }
        : { right: '16px', bottom: '16px' };
    const pipPeer = peers[0];
    const pipStream = pipPeer?.stream ?? localStream;
    const pipLabel = pipPeer ? pipPeer.nick : 'You';
    const pipQuality = pipPeer?.connectionQuality ?? 'excellent';

    return (
      <div className="fixed z-40 group cursor-grab active:cursor-grabbing select-none touch-none"
        style={pipStyle}
        onPointerDown={onPipPointerDown}
        onPointerMove={onPipPointerMove}
        onPointerUp={onPipPointerUp}>
        <div className={`${isMobile ? 'w-40' : 'w-52'} rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-gray-950
          transition-transform duration-200 hover:scale-[1.03]`}>
          <VideoTile nick={pipLabel} stream={pipStream} muted={!pipPeer} mirror={!pipPeer}
            label={pipLabel} connectionQuality={pipQuality}
            audioLevel={localAudio?.level} speaking={localAudio?.speaking} />

          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-white/80 font-medium truncate max-w-[60px] sm:max-w-[80px]">{title}</span>
              <span className="text-[10px] text-white/50 tabular-nums">{elapsed}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-white/60">{participantCount}</span>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" opacity="0.6">
                <circle cx="6" cy="5" r="2.5" /><path d="M1 14c0-3 2-5.5 5-5.5s5 2.5 5 5.5" />
              </svg>
            </div>
          </div>
        </div>

        {/* Quick mute — always visible on touch devices */}
        <button onClick={(e) => { e.stopPropagation(); toggleAudioMute(); }}
          className={`absolute -bottom-2 -left-2 w-8 h-8 sm:w-7 sm:h-7 rounded-full flex items-center justify-center
            ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity shadow-lg
            ${audioMuted ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-800 hover:bg-gray-700'} text-white`}
          title={audioMuted ? 'Unmute (M)' : 'Mute (M)'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {audioMuted
              ? <><path d="M1 1l22 22M9 9v2a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12" /></>
              : <><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0" /></>}
          </svg>
        </button>

        {/* Quick hangup — always visible on touch devices */}
        <button onClick={(e) => { e.stopPropagation(); hangup(); }}
          className={`absolute -top-2 -right-2 w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-red-600 text-white flex items-center justify-center
            ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity shadow-lg hover:bg-red-500`}
          title="Leave (H)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Fullscreen Room ──────────────────────────────────────────────────────

  return (
    <div ref={roomRef} className="fixed inset-0 z-40 bg-gray-950 flex flex-col select-none"
      style={{
        background: 'linear-gradient(180deg, #0a0b10 0%, #0d0e14 100%)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-3 sm:px-6 shrink-0 ${isLandscape ? 'py-1' : 'py-2.5 sm:py-3'}`}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
            <span className="text-[13px] sm:text-[14px] font-semibold text-gray-100 truncate max-w-[120px] sm:max-w-none">{title}</span>
          </div>
          {/* Call type badge — hide on very small screens */}
          <span className={`hidden xs:flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider shrink-0
            ${callType === 'video' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
            {callType === 'video' ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="2" y="5" width="15" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0" />
              </svg>
            )}
            {callType}
          </span>
          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-[12px] text-gray-500">
            <span className="tabular-nums">{elapsed}</span>
            <span className="hidden sm:inline opacity-40">|</span>
            <span className="hidden sm:inline">{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* Fullscreen — hide on mobile (use native fullscreen gestures) */}
          {!isMobile && (
            <button onClick={toggleFullscreen}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-all"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {isFullscreen ? (
                  <><path d="M5 1v4H1M11 1v4h4M5 15v-4H1M11 15v-4h4" /></>
                ) : (
                  <><path d="M1 5V1h4M15 5V1h-4M1 11v4h4M15 11v4h-4" /></>
                )}
              </svg>
            </button>
          )}
          {/* Minimize */}
          <button onClick={() => { setPipPos(null); useStore.setState({ minimized: true }); }}
            className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-all"
            title="Minimize">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 10h12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Connecting overlay ──────────────────────────────────────────────── */}
      {callState === 'connecting' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-2 border-gray-700 border-t-indigo-400 rounded-full animate-spin" />
            <p className="text-[14px] text-gray-400">Connecting to {callWith}...</p>
          </div>
        </div>
      )}

      {/* ── Video error toast ──────────────────────────────────────────────── */}
      {videoError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-red-900/90 border border-red-500/20 rounded-xl px-4 py-2 shadow-xl animate-slide-down">
          <span className="text-[12px] text-red-200">{videoError}</span>
        </div>
      )}

      {/* ── Video grid ─────────────────────────────────────────────────────── */}
      <div className={`flex-1 min-h-0 p-1.5 sm:p-4 grid ${gridClass} gap-1.5 sm:gap-3 auto-rows-fr items-stretch content-center`}>
        {hasSpotlight ? (
          <>
            {/* Spotlight area */}
            <div className="min-h-0">
              {spotlightNick === '_local' ? (
                <VideoTile nick="You" stream={localScreenStream ?? localStream} muted mirror={!localScreenStream}
                  label={localScreenStream ? 'Your Screen' : 'You'} spotlight
                  audioLevel={localAudio?.level} speaking={localAudio?.speaking}
                  audioMuted={audioMuted} videoOff={videoOff}
                  onPin={() => setSpotlight(null)} />
              ) : (
                (() => {
                  const p = peers.find(p => p.nick === spotlightNick);
                  if (!p) return null;
                  const peerAudio = audioLevels.get(p.nick.toLowerCase());
                  return (
                    <VideoTile nick={p.nick} stream={p.screenStream ?? p.stream} spotlight
                      label={p.screenStream ? `${p.nick}'s Screen` : p.nick}
                      audioLevel={peerAudio?.level} speaking={peerAudio?.speaking}
                      connectionQuality={p.connectionQuality}
                      onPin={() => setSpotlight(null)} />
                  );
                })()
              )}
            </div>
            {/* Sidebar strip */}
            <div className="flex flex-row lg:flex-col gap-2 overflow-auto min-h-0">
              {spotlightNick !== '_local' && (
                <div className="shrink-0 lg:w-full w-40">
                  <VideoTile nick="You" stream={localStream} muted mirror label="You"
                    audioLevel={localAudio?.level} speaking={localAudio?.speaking}
                    audioMuted={audioMuted} videoOff={videoOff}
                    onPin={() => setSpotlight('_local')} />
                </div>
              )}
              {peers.filter(p => p.nick !== spotlightNick).map(p => {
                const peerAudio = audioLevels.get(p.nick.toLowerCase());
                return (
                  <div key={p.nick} className="shrink-0 lg:w-full w-40">
                    <VideoTile nick={p.nick} stream={p.stream}
                      audioLevel={peerAudio?.level} speaking={peerAudio?.speaking}
                      connectionQuality={p.connectionQuality}
                      onPin={() => setSpotlight(p.nick)} />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* Local screen share tile (large) */}
            {localScreenStream && (
              <div className="col-span-full">
                <VideoTile nick="You" stream={localScreenStream} muted label="Your Screen"
                  onPin={() => setSpotlight('_local')} />
              </div>
            )}

            {/* Peer screen share tiles */}
            {peers.filter(p => p.screenStream).map(p => (
              <div key={`screen-${p.nick}`} className="col-span-full">
                <VideoTile nick={p.nick} stream={p.screenStream} label={`${p.nick}'s Screen`}
                  onPin={() => setSpotlight(p.nick)} />
              </div>
            ))}

            {/* Gallery grid */}
            <VideoTile nick="You" stream={localStream} muted mirror label="You"
              audioLevel={localAudio?.level} speaking={localAudio?.speaking}
              audioMuted={audioMuted} videoOff={videoOff}
              onPin={() => setSpotlight('_local')} />
            {peers.map(p => {
              const peerAudio = audioLevels.get(p.nick.toLowerCase());
              return (
                <VideoTile key={p.nick} nick={p.nick} stream={p.stream}
                  audioLevel={peerAudio?.level} speaking={peerAudio?.speaking}
                  connectionQuality={p.connectionQuality}
                  onPin={() => setSpotlight(p.nick)} />
              );
            })}
          </>
        )}
      </div>

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div className={`shrink-0 px-3 sm:px-6 ${isLandscape ? 'py-1.5' : 'py-2 sm:py-4'}`}
        style={{ paddingBottom: `max(${isLandscape ? '6px' : '8px'}, env(safe-area-inset-bottom))` }}>
        <div className="flex items-center justify-center gap-3 sm:gap-3 relative">
          {/* Mic */}
          <ControlButton
            active={audioMuted} danger={audioMuted}
            icon={audioMuted ? 'mic-off' : 'mic'}
            label={audioMuted ? 'Unmute (M)' : 'Mute (M)'}
            onClick={toggleAudioMute}
            compact={isLandscape}
          />

          {/* Camera */}
          <ControlButton
            active={videoOff} danger={videoOff}
            icon={videoOff ? 'video-off' : 'video'}
            label={videoOff ? 'Start Video (V)' : 'Stop Video (V)'}
            onClick={toggleVideoOff}
            compact={isLandscape}
          />

          {/* Screen share — hide in landscape to save space */}
          {!isLandscape && (
            <ControlButton
              active={screenSharing} accent={screenSharing}
              icon="screen"
              label={screenSharing ? 'Stop Sharing (S)' : 'Share Screen (S)'}
              onClick={toggleScreenShare}
            />
          )}

          {/* Device picker — hide on mobile */}
          {!isMobile && (
            <div className="relative">
              <ControlButton
                icon="settings"
                label="Devices"
                onClick={() => { loadDevices(); setShowDevices(!showDevices); }}
              />
              {showDevices && (
                <DeviceMenu devices={devices} onClose={() => setShowDevices(false)} />
              )}
            </div>
          )}

          {/* Hang up */}
          <button onClick={hangup} title="Leave (H)"
            className={`bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold rounded-2xl
              transition-all hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] active:scale-95 ml-1 sm:ml-2
              ${isLandscape ? 'h-9 px-4 text-[12px]' : 'h-12 px-5 sm:px-8 sm:h-11 text-[13px]'}`}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Control Button ──────────────────────────────────────────────────────────

function ControlButton({ icon, label, onClick, active = false, danger = false, accent = false, compact = false }: {
  icon: string; label: string; onClick: () => void;
  active?: boolean; danger?: boolean; accent?: boolean; compact?: boolean;
}) {
  const size = compact ? 'w-10 h-10 rounded-xl' : 'w-13 h-13 sm:w-11 sm:h-11 rounded-2xl sm:rounded-xl';
  const base = `${size} flex items-center justify-center transition-all active:scale-90`;
  const style = danger
    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
    : accent
    ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
    : active
    ? 'bg-white/10 text-white hover:bg-white/15'
    : 'bg-white/[0.06] text-gray-400 hover:text-gray-200 hover:bg-white/[0.1]';

  return (
    <button onClick={onClick} title={label} className={`${base} ${style}`}>
      <IconSvg name={icon} />
    </button>
  );
}

// ── Device Menu ─────────────────────────────────────────────────────────────

function DeviceMenu({ devices, onClose }: { devices: MediaDeviceInfo[]; onClose: () => void }) {
  const switchDevice = useStore(s => s.switchDevice);
  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const videoInputs = devices.filter(d => d.kind === 'videoinput');

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute bottom-full mb-2 right-0 w-64 bg-gray-900 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-20 animate-slide-down">
        {audioInputs.length > 0 && (
          <div className="p-2">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider px-2 py-1">Microphone</p>
            {audioInputs.map(d => (
              <button key={d.deviceId}
                onClick={() => { switchDevice('audioinput', d.deviceId); onClose(); }}
                className="w-full text-left px-2 py-1.5 text-[12px] text-gray-300 hover:bg-white/[0.04] rounded-lg truncate transition-colors">
                {d.label || 'Microphone'}
              </button>
            ))}
          </div>
        )}
        {videoInputs.length > 0 && (
          <div className="p-2 border-t border-white/[0.06]">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider px-2 py-1">Camera</p>
            {videoInputs.map(d => (
              <button key={d.deviceId}
                onClick={() => { switchDevice('videoinput', d.deviceId); onClose(); }}
                className="w-full text-left px-2 py-1.5 text-[12px] text-gray-300 hover:bg-white/[0.04] rounded-lg truncate transition-colors">
                {d.label || 'Camera'}
              </button>
            ))}
          </div>
        )}
        {devices.length === 0 && (
          <p className="p-3 text-[12px] text-gray-500 text-center">No devices found</p>
        )}
      </div>
    </>
  );
}

// ── SVG Icons ───────────────────────────────────────────────────────────────

function IconSvg({ name }: { name: string }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const };
  switch (name) {
    case 'mic':
      return <svg {...props}><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0" /><path d="M12 17v4M8 21h8" /></svg>;
    case 'mic-off':
      return <svg {...props}><path d="M1 1l22 22M9 9v2a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12M12 17v4M8 21h8" /></svg>;
    case 'video':
      return <svg {...props}><rect x="2" y="5" width="15" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3" /></svg>;
    case 'video-off':
      return <svg {...props}><path d="M17 9l5-3v12l-5-3" /><rect x="2" y="5" width="15" height="14" rx="2" /><path d="M1 1l22 22" /></svg>;
    case 'screen':
      return <svg {...props}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
    case 'settings':
      return <svg {...props} strokeWidth={1.5}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    default:
      return null;
  }
}
