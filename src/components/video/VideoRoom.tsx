'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/stores';
import type { MediaStat } from '@/stores/video';

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
  const peerMap = useStore(s => s.peers);
  const rosterVoice = useStore(s => s.rosterVoice);
  const rosterVideo = useStore(s => s.rosterVideo);
  const mediaStats = useStore(s => s.mediaStats);
  const hangup = useStore(s => s.hangup);
  const toggleAudioMute = useStore(s => s.toggleAudioMute);
  const toggleVideoOff = useStore(s => s.toggleVideoOff);
  const toggleScreenShare = useStore(s => s.toggleScreenShare);
  const requestRoster = useStore(s => s.requestRoster);
  const audioMuted = useStore(s => s.audioMuted);
  const videoOff = useStore(s => s.videoOff);
  const screenSharing = useStore(s => s.screenSharing);
  const minimized = useStore(s => s.minimized);
  const videoError = useStore(s => s.videoError);

  const [elapsed, setElapsed] = useState('0:00');

  const peers = useMemo(() => {
    const all = [...peerMap.values()];
    if (callChannel) return all.filter(p => p.channel === callChannel || p.channel === null);
    return all.filter(p => p.nick.toLowerCase() === callWith.toLowerCase());
  }, [peerMap, callChannel, callWith]);

  // Participant count: prefer roster data, fall back to peer map
  const rosterCount = Math.max(rosterVoice.length, rosterVideo.length);

  useEffect(() => {
    if (!callStartTime) return;
    const tick = () => setElapsed(formatDuration(Date.now() - callStartTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [callStartTime]);

  if (callState !== 'in_call' && callState !== 'connecting') return null;

  const title = callChannel ?? callWith;
  const participantCount = Math.max(1, rosterCount > 0 ? rosterCount + 1 : peers.length + 1);

  if (minimized) {
    return (
      <div className="fixed right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 w-[min(92vw,310px)] rounded-2xl border border-emerald-400/20 bg-gray-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden">
        <button onClick={() => useStore.setState({ minimized: false })}
          className="w-full px-4 py-3 text-left flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-gray-100 truncate">{title}</span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-emerald-300">LADON {callType} active</span>
          </span>
          <span className="text-[11px] font-mono text-gray-400 tabular-nums">{elapsed}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#05070c] text-gray-100"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="absolute inset-0 pointer-events-none opacity-80"
        style={{
          background:
            'radial-gradient(circle at 20% 10%, rgba(16,185,129,0.20), transparent 32%), radial-gradient(circle at 84% 20%, rgba(99,102,241,0.18), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 35%)',
        }}
      />

      <header className="relative z-[1] flex items-center justify-between gap-3 px-4 sm:px-7 py-3 border-b border-white/[0.06]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)] animate-pulse" />
            <h2 className="text-[15px] sm:text-[17px] font-semibold truncate">{title}</h2>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-gray-500">
            <span>LADON {callType}</span>
            <span className="opacity-40">/</span>
            <span className="font-mono tabular-nums">{elapsed}</span>
            <span className="hidden sm:inline opacity-40">/</span>
            <span className="hidden sm:inline">{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => useStore.setState({ minimized: true })}
            className="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-100 hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors"
            title="Minimize">
            <span className="sr-only">Minimize</span>
            <svg className="mx-auto" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 10h12" />
            </svg>
          </button>
          <button onClick={hangup}
            className="h-10 px-4 rounded-xl bg-red-500/15 text-red-200 border border-red-400/20 hover:bg-red-500/25 active:bg-red-500/30 transition-colors text-[12px] font-semibold">
            Leave
          </button>
        </div>
      </header>

      <main className="relative z-[1] flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 py-5 sm:py-7">
        {videoError && (
          <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-100">
            {videoError}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] max-w-6xl mx-auto">
          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.035] shadow-2xl shadow-black/30 overflow-hidden">
            <div className="p-5 sm:p-7 min-h-[260px] sm:min-h-[420px] flex flex-col justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/80">Server Media Transport</p>
                <h3 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-[-0.04em] leading-none">
                  LADON session is live.
                </h3>
                <p className="mt-4 max-w-xl text-[13px] sm:text-[15px] leading-6 text-gray-400">
                  Darkbear now coordinates media through Ophion LADON commands on the IRC connection. The browser UI stays focused on session controls and server-backed media state.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
                <StatusCard label="Audio" value={audioMuted ? 'Muted' : 'Open'} active={!audioMuted} />
                <StatusCard label="Video" value={videoOff ? 'Paused' : callType === 'video' ? 'Ready' : 'Voice'} active={!videoOff && callType === 'video'} />
                <StatusCard label="Screen" value={screenSharing ? 'Shared' : 'Off'} active={screenSharing} />
              </div>
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/[0.08] bg-gray-950/80 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Participants</p>
                <p className="text-[13px] text-gray-300">{participantCount} in session</p>
              </div>
              <div className="flex items-center gap-2">
                {callChannel && (
                  <button onClick={() => requestRoster(callChannel)}
                    title="Refresh roster"
                    className="w-7 h-7 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors flex items-center justify-center">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M14 8a6 6 0 1 1-1.5-4" /><path d="M14 3v4h-4" />
                    </svg>
                  </button>
                )}
                <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">LADON</span>
              </div>
            </div>
            <div className="p-4 space-y-2 max-h-[360px] overflow-y-auto">
              <Participant name="You"
                sub={audioMuted ? 'Muted' : callType === 'voice' ? 'Voice active' : 'Video active'}
                active />
              {rosterVoice.map(v => {
                const stat = mediaStats.find(s => s.nick.toLowerCase() === v.nick.toLowerCase());
                return (
                  <Participant key={`voice:${v.nick}`} name={v.nick}
                    sub={v.speaking ? 'Speaking' : stat ? `${stat.rtt_ms}ms · ${(v.loss * 100).toFixed(0)}% loss` : 'Voice'}
                    active={v.speaking}
                    stat={stat}
                  />
                );
              })}
              {rosterVideo.filter(v => !rosterVoice.some(r => r.nick.toLowerCase() === v.nick.toLowerCase())).map(v => {
                const stat = mediaStats.find(s => s.nick.toLowerCase() === v.nick.toLowerCase());
                return (
                  <Participant key={`video:${v.nick}`} name={v.nick}
                    sub={`${v.w}×${v.h} ${v.fps}fps${v.screen ? ' screen' : ''}`}
                    active={false}
                    stat={stat}
                  />
                );
              })}
              {rosterVoice.length === 0 && rosterVideo.length === 0 && peers.length > 0 && (
                peers.map(peer => (
                  <Participant key={`peer:${peer.nick}`} name={peer.nick}
                    sub={peer.speaking ? 'Speaking' : 'Remote participant'}
                    active={peer.speaking}
                  />
                ))
              )}
              {rosterVoice.length === 0 && rosterVideo.length === 0 && peers.length === 0 && (
                <p className="px-2 py-6 text-center text-[12px] text-gray-500">
                  {callChannel ? 'Tap ↻ to load participants.' : 'Waiting for session updates.'}
                </p>
              )}
            </div>
          </aside>
        </section>
      </main>

      <footer className="relative z-[1] px-4 sm:px-7 py-4 border-t border-white/[0.06] bg-black/20">
        <div className="mx-auto max-w-3xl flex items-center justify-center gap-3">
          <ControlButton on={audioMuted} danger label={audioMuted ? 'Unmute' : 'Mute'} onClick={toggleAudioMute} icon="mic" />
          <ControlButton on={videoOff} label={videoOff ? 'Enable video' : 'Pause video'} onClick={toggleVideoOff} icon="video" />
          <ControlButton on={screenSharing} label={screenSharing ? 'Stop share' : 'Share'} onClick={toggleScreenShare} icon="screen" />
          <button onClick={hangup}
            className="h-12 px-5 rounded-2xl bg-red-600 text-white text-[12px] font-semibold shadow-lg shadow-red-950/30 hover:bg-red-500 active:scale-95 transition-all">
            Hang up
          </button>
        </div>
      </footer>
    </div>
  );
}

function StatusCard({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className={`rounded-2xl border px-3 py-3 ${active ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-white/[0.06] bg-black/18'}`}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">{label}</div>
      <div className={`mt-1 text-[13px] font-semibold ${active ? 'text-emerald-200' : 'text-gray-300'}`}>{value}</div>
    </div>
  );
}

function qualityColor(q: MediaStat['loss'], rtt: number): string {
  if (q < 0.02 && rtt < 100) return 'bg-emerald-400';
  if (q < 0.05 && rtt < 200) return 'bg-yellow-400';
  if (q < 0.10 && rtt < 400) return 'bg-orange-400';
  return 'bg-red-400';
}

function Participant({ name, sub, active, stat }: { name: string; sub: string; active?: boolean; stat?: MediaStat }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.03] px-3 py-3">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-[12px] font-bold ${active ? 'bg-emerald-400 text-gray-950' : 'bg-white/[0.08] text-gray-300'}`}>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-gray-100 truncate">{name}</div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 truncate">{sub}</span>
          {stat && (
            <span className="shrink-0 text-[10px] text-gray-600 font-mono">{stat.bw_kbps}kbps</span>
          )}
        </div>
      </div>
      {stat && (
        <span className={`w-2 h-2 rounded-full ${qualityColor(stat.loss, stat.rtt_ms)}`}
          title={`RTT ${stat.rtt_ms}ms · loss ${(stat.loss * 100).toFixed(1)}%`} />
      )}
      {!stat && active && <span className="w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />}
    </div>
  );
}

function ControlButton({ on, danger, label, onClick, icon }: {
  on: boolean;
  danger?: boolean;
  label: string;
  onClick: () => void;
  icon: 'mic' | 'video' | 'screen';
}) {
  return (
    <button onClick={onClick}
      className={`h-12 min-w-12 sm:min-w-[92px] px-3 rounded-2xl border flex items-center justify-center gap-2 text-[12px] font-semibold transition-all active:scale-95
        ${on
          ? danger
            ? 'bg-red-500/18 border-red-400/25 text-red-100 hover:bg-red-500/25'
            : 'bg-emerald-500/18 border-emerald-400/25 text-emerald-100 hover:bg-emerald-500/25'
          : 'bg-white/[0.05] border-white/[0.08] text-gray-300 hover:bg-white/[0.08]'}`}>
      <Icon name={icon} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Icon({ name }: { name: 'mic' | 'video' | 'screen' }) {
  if (name === 'video') {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="5" width="15" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3" />
      </svg>
    );
  }
  if (name === 'screen') {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0" /><path d="M12 17v4M8 21h8" />
    </svg>
  );
}
