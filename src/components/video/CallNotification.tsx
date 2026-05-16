'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/stores';
import { nickColor } from '@/lib/nickcolor';
import { startIncomingRing, startOutgoingRing, stopRing } from '@/lib/ringtone';

export default function CallNotification() {
  const callState = useStore(s => s.callState);
  const callWith = useStore(s => s.callWith);
  const callType = useStore(s => s.callType);
  const acceptCall = useStore(s => s.acceptCall);
  const rejectCall = useStore(s => s.rejectCall);
  const hangup = useStore(s => s.hangup);
  const soundEnabled = useStore(s => s.settings.notificationSound);

  const [ringPulse, setRingPulse] = useState(0);

  // Visual pulse
  useEffect(() => {
    if (callState !== 'ringing_in' && callState !== 'ringing_out') return;
    const id = setInterval(() => setRingPulse(p => p + 1), 2000);
    return () => clearInterval(id);
  }, [callState]);

  // Ringtone audio (respects notification sound setting)
  useEffect(() => {
    if (!soundEnabled) { stopRing(); return; }
    if (callState === 'ringing_in') startIncomingRing();
    else if (callState === 'ringing_out') startOutgoingRing();
    else stopRing();
    return () => stopRing();
  }, [callState, soundEnabled]);

  // Browser notification for incoming calls when tab is not focused
  useEffect(() => {
    if (callState !== 'ringing_in') return;
    if (typeof document !== 'undefined' && document.hasFocus()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification(`Incoming ${callType} call`, {
      body: `${callWith} is calling you`,
      icon: '/darkbear/favicon.svg',
      tag: 'ladon-call',
      requireInteraction: true,
    });
    n.onclick = () => { window.focus(); n.close(); };
    return () => n.close();
  }, [callState, callWith, callType]);

  if (callState !== 'ringing_in' && callState !== 'ringing_out') return null;

  const isIncoming = callState === 'ringing_in';
  const color = nickColor(callWith);
  const initial = callWith.charAt(0).toUpperCase();
  const isVideo = callType === 'video';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(10,11,16,0.95) 0%, rgba(10,11,16,0.99) 100%)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>

      <div className="flex flex-col items-center gap-5 sm:gap-6 animate-fade-in px-6">
        {/* Avatar with rings */}
        <div className="relative">
          {/* Pulsing rings */}
          <div key={`ring-${ringPulse}`} className="absolute -inset-4 rounded-full animate-ping opacity-10"
            style={{ border: `2px solid ${color}`, animationDuration: '2s' }} />
          <div key={`ring2-${ringPulse}`} className="absolute -inset-8 rounded-full animate-ping opacity-5"
            style={{ border: `1.5px solid ${color}`, animationDuration: '2s', animationDelay: '0.5s' }} />

          {/* Avatar */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-3xl sm:text-4xl font-bold text-white/90 shadow-2xl"
            style={{
              background: `linear-gradient(135deg, ${color}, ${color}bb)`,
              boxShadow: `0 0 40px ${color}30`,
            }}>
            {initial}
          </div>

          {/* Call type badge */}
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gray-900 border-2 border-gray-800 flex items-center justify-center">
            {isVideo ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="5" width="15" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="text-center">
          <p className="text-[20px] font-semibold text-gray-100 mb-1">{callWith}</p>
          <p className="text-[13px] text-gray-500">
            {isIncoming
              ? `Incoming ${isVideo ? 'video' : 'voice'} call...`
              : `Calling ${callWith}...`}
          </p>
        </div>

        {/* Ringing dots */}
        <div className="flex items-center gap-1.5 h-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400"
              style={{
                animation: 'pulse 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }} />
          ))}
        </div>

        {/* Keyboard hint */}
        <p className="text-[11px] text-gray-600">
          Press <kbd className="px-1.5 py-0.5 bg-white/[0.06] rounded text-gray-400 text-[10px] font-mono">Esc</kbd> to {isIncoming ? 'decline' : 'cancel'}
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-6 sm:gap-4 mt-2">
          {isIncoming ? (
            <>
              {/* Decline */}
              <button onClick={rejectCall}
                className="w-18 h-18 sm:w-16 sm:h-16 rounded-full bg-red-600 text-white flex items-center justify-center
                  hover:bg-red-500 active:scale-90 transition-all shadow-lg shadow-red-600/20"
                title="Decline">
                <svg width="26" height="26" className="sm:w-[24px] sm:h-[24px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              {/* Accept */}
              <button onClick={acceptCall}
                className="w-18 h-18 sm:w-16 sm:h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center
                  hover:bg-emerald-500 active:scale-90 transition-all shadow-lg shadow-emerald-600/20
                  animate-bounce"
                style={{ animationDuration: '2s' }}
                title="Accept">
                {isVideo ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="5" width="15" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                )}
              </button>
            </>
          ) : (
            /* Cancel outgoing call */
            <button onClick={hangup}
              className="w-18 h-18 sm:w-16 sm:h-16 rounded-full bg-red-600 text-white flex items-center justify-center
                hover:bg-red-500 active:scale-90 transition-all shadow-lg shadow-red-600/20"
              title="Cancel">
              <svg width="26" height="26" className="sm:w-[24px] sm:h-[24px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
