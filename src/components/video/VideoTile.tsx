'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { nickColor } from '@/lib/nickcolor';

interface Props {
  nick: string;
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  label?: string;
  speaking?: boolean;
  audioLevel?: number;
  connectionQuality?: 'excellent' | 'good' | 'poor' | 'disconnected';
  audioMuted?: boolean;
  videoOff?: boolean;
  spotlight?: boolean;
  onPin?: () => void;
}

const QUALITY_COLORS = {
  excellent: '#22c55e',
  good: '#eab308',
  poor: '#ef4444',
  disconnected: '#6b7280',
};

export default function VideoTile({
  nick, stream, muted = false, mirror = false, label,
  speaking = false, audioLevel = 0, connectionQuality = 'excellent',
  audioMuted = false, videoOff = false, spotlight = false, onPin,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onTap = useCallback(() => {
    if (!onPin) return;
    if ('ontouchstart' in window) {
      setShowControls(true);
      clearTimeout(controlsTimer.current);
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [onPin]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!stream) { setHasVideo(false); return; }
    const check = () => {
      const tracks = stream.getVideoTracks();
      setHasVideo(tracks.length > 0 && tracks.some(t => t.enabled && t.readyState === 'live'));
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [stream]);

  const color = nickColor(nick);
  const initial = nick.charAt(0).toUpperCase();
  const levelWidth = Math.min(100, audioLevel * 300);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-gray-900/80 flex items-center justify-center
        transition-all duration-200 group ${spotlight ? 'col-span-full row-span-2' : ''}
        ${onPin ? 'cursor-pointer' : ''} aspect-video`}
      style={{
        boxShadow: speaking
          ? `0 0 0 2px ${color}, 0 0 20px ${color}40`
          : '0 0 0 1px rgba(255,255,255,0.04)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onPin}
      onClick={onTap}
    >
      {/* Video element */}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`w-full h-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          {/* Avatar circle with speaking ring */}
          <div className="relative">
            <div
              className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-2xl sm:text-3xl font-bold text-white/90 transition-transform duration-200
                ${speaking ? 'scale-110' : 'scale-100'}`}
              style={{
                background: `linear-gradient(135deg, ${color}, ${color}99)`,
                boxShadow: speaking ? `0 0 30px ${color}60` : 'none',
              }}
            >
              {initial}
            </div>
            {speaking && (
              <div className="absolute -inset-1.5 rounded-full animate-ping opacity-20"
                style={{ border: `2px solid ${color}` }} />
            )}
          </div>

          {/* Audio level indicator for voice-only */}
          {stream && !audioMuted && (
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i}
                  className="w-1 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(20, audioLevel * 100 * (1 + i * 0.5)))}px`,
                    background: speaking ? color : 'rgba(255,255,255,0.15)',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Muted/video-off overlays */}
      {audioMuted && !muted && (
        <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-red-500/90 flex items-center justify-center backdrop-blur-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 1l22 22M9 9v2a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
            <path d="M17 16.95A7 7 0 015 12M12 17v4M8 21h8" />
          </svg>
        </div>
      )}

      {/* Speaking audio bar at bottom */}
      {speaking && hasVideo && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: color, opacity: 0.8 }}>
          <div className="h-full transition-all duration-75" style={{ width: `${levelWidth}%`, background: color }} />
        </div>
      )}

      {/* Label bar */}
      <div className={`absolute bottom-0 left-0 right-0 flex items-center gap-1.5 px-3 py-2 transition-opacity duration-150
        ${hovered || !hasVideo ? 'opacity-100' : 'opacity-80'}
        bg-gradient-to-t from-black/60 via-black/30 to-transparent`}>
        <span className="text-[12px] text-white/90 font-medium truncate">{label ?? nick}</span>

        {/* Connection quality dot */}
        <span className="w-1.5 h-1.5 rounded-full shrink-0 ml-auto"
          style={{ background: QUALITY_COLORS[connectionQuality] }}
          title={connectionQuality} />
      </div>

      {/* Controls overlay — hover on desktop, tap on mobile */}
      {(hovered || showControls) && onPin && (
        <div className="absolute top-2 left-2 flex gap-1 animate-fade-in">
          <button onClick={(e) => { e.stopPropagation(); onPin(); }}
            className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 active:bg-black/80 transition-all"
            title={spotlight ? 'Unpin' : 'Pin'}>
            <svg width="14" height="14" className="sm:w-[12px] sm:h-[12px]" viewBox="0 0 16 16" fill={spotlight ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
              <path d="M9.828 2.172a2 2 0 012.828 0l1.172 1.172a2 2 0 010 2.828L11 9l-1.5 4.5L6 10 2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Hidden video (for when no video tracks but element needed) */}
      {!hasVideo && <video ref={videoRef} autoPlay playsInline muted={muted} className="hidden" />}
    </div>
  );
}
