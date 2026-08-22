// VideoRoom — the in-call voice/video surface. Rendered by App whenever
// mediaState.callState !== 'idle'; shows itself for 'connecting'/'in_call'
// (CallNotification owns the ringing states). Full-screen overlay, or a
// floating pill when minimized.
//
// Unlike the old roster-only placeholder, tiles render REAL media: peer
// video via canvas-captured MediaStreams (peerStream), local camera/screen
// preview (selfPreviewStream), live speaking rings, audio-level bars and
// working controls against the Cadence media engine.
//
// Keyboard shortcuts (M/V/S/H) are handled globally elsewhere — the footer
// only displays the hints.

import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';
import {
  hangup,
  leaveRoom,
  mediaState,
  peerStream,
  selfPreviewStream,
  sendRoomReaction,
  setMinimized,
  setSpotlight,
  setTranscriptOpen,
  toggleCamera,
  toggleDeafen,
  toggleMute,
  toggleScreenShare,
} from '@/state/media';
import { bridgeState, type BridgeStatus } from '@/state/bridge';
import { nickColor } from '@/lib/nickcolor';
import type { CallHealthStatus, NetworkQualityTier } from '@/lib/cadence-media/types';
import TranscriptPanel from './TranscriptPanel';
import { settings } from '@/state/settings';
import { formatNumber } from '@/lib/i18n';

const TIMER_TICK_MS = 1000;
const STREAM_POLL_MS = 1000;
const REACTION_BURST_MS = 1400;
const REACTION_EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '🔥'];

const KBD_CLASS =
  'px-1.5 py-0.5 bg-white/[0.06] rounded text-gray-400 text-[10px] font-mono';

const BRIDGE_DOT: Record<BridgeStatus, { cls: string; label: string }> = {
  ready: { cls: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]', label: 'Onyx ready' },
  connecting: { cls: 'bg-amber-400 animate-pulse', label: 'Onyx connecting' },
  error: { cls: 'bg-red-400', label: 'Onyx error' },
  off: { cls: 'bg-gray-600', label: 'Onyx off' },
};

const HEALTH_STYLE: Record<CallHealthStatus, { dot: string; text: string; label: string }> = {
  idle: { dot: 'bg-gray-500', text: 'text-gray-400', label: 'Starting' },
  healthy: { dot: 'bg-emerald-400', text: 'text-emerald-200', label: 'Healthy' },
  degraded: { dot: 'bg-amber-400', text: 'text-amber-200', label: 'Degraded' },
  reconnecting: { dot: 'bg-orange-400 animate-pulse', text: 'text-orange-200', label: 'Reconnecting' },
};

const QUALITY_LABEL: Record<NetworkQualityTier, string> = {
  0: 'Full',
  1: 'High',
  2: 'Medium',
  3: 'Low',
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 max-w-3xl';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-5xl';
  if (count <= 4) return 'grid-cols-2 max-w-5xl';
  if (count <= 9) return 'grid-cols-2 md:grid-cols-3 max-w-6xl';
  return 'grid-cols-3 md:grid-cols-4 max-w-7xl';
}

export default function VideoRoom() {
  const active = createMemo(
    () => mediaState.callState === 'in_call' || mediaState.callState === 'connecting',
  );
  return (
    <Show when={active()}>
      <Surface />
    </Show>
  );
}

// ── The mounted call surface (timer + pill/full-overlay switch) ──────────

function Surface() {
  const [now, setNow] = createSignal(Date.now());
  const tick = setInterval(() => setNow(Date.now()), TIMER_TICK_MS);
  onCleanup(() => clearInterval(tick));

  const elapsed = createMemo<string | null>(() => {
    const started = mediaState.startedAt;
    if (started === null) return null;
    return formatDuration(Math.max(0, now() - started));
  });

  const title = createMemo(() => mediaState.channel ?? mediaState.callWith ?? 'call');
  const kindLabel = createMemo(
    () => `${mediaState.kind} ${mediaState.channel ? 'room' : 'call'}`,
  );

  const endCall = () => {
    if (mediaState.channel) leaveRoom();
    else hangup();
  };

  return (
    <Show
      when={!mediaState.minimized}
      fallback={<MinimizedPill title={title()} kindLabel={kindLabel()} elapsed={elapsed()} onEnd={endCall} />}
    >
      <FullOverlay title={title()} kindLabel={kindLabel()} elapsed={elapsed()} onEnd={endCall} />
    </Show>
  );
}

// ── Minimized floating pill ──────────────────────────────────────────────

interface PillProps {
  title: string;
  kindLabel: string;
  elapsed: string | null;
  onEnd: () => void;
}

function MinimizedPill(props: PillProps) {
  const health = createMemo(() => HEALTH_STYLE[mediaState.health.status]);
  return (
    <div class="fixed right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 w-[min(92vw,320px)] rounded-2xl border border-emerald-400/20 bg-gray-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden animate-fade-in">
      <div class="flex items-center gap-2 pl-4 pr-2 py-2.5">
        <button
          onClick={() => setMinimized(false)}
          class="min-w-0 flex-1 text-left"
          title="Restore call"
        >
          <span class="flex items-center gap-2 text-[12px] font-semibold text-gray-100">
            <span class={`h-2 w-2 rounded-full shrink-0 ${health().dot}`} aria-hidden="true" />
            <span class="truncate">{props.title}</span>
          </span>
          <span class="block text-[10px] uppercase tracking-[0.18em] text-emerald-300">
            {props.kindLabel} · <span class="font-mono tabular-nums normal-case tracking-normal">{props.elapsed ?? 'connecting…'}</span>
          </span>
        </button>
        <button
          onClick={toggleMute}
          class={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
            mediaState.selfMuted
              ? 'bg-red-500/18 border-red-400/25 text-red-200'
              : 'bg-white/[0.05] border-white/[0.08] text-gray-300 hover:bg-white/[0.08]'
          }`}
          title={mediaState.selfMuted ? 'Unmute' : 'Mute'}
        >
          <Show when={mediaState.selfMuted} fallback={<IconMic />}>
            <IconMicOff />
          </Show>
        </button>
        <button
          onClick={() => props.onEnd()}
          class="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center hover:bg-red-500 active:scale-95 transition-all"
          title="Hang up"
        >
          <IconClose />
        </button>
      </div>
    </div>
  );
}

// ── Full-screen overlay ──────────────────────────────────────────────────

function FullOverlay(props: PillProps) {
  const [reactionsOpen, setReactionsOpen] = createSignal(false);
  const [burst, setBurst] = createSignal<string | null>(null);
  let burstTimer: ReturnType<typeof setTimeout> | undefined;
  let transcriptButton: HTMLButtonElement | undefined;
  let transcriptWasOpen = mediaState.transcriptOpen;
  onCleanup(() => clearTimeout(burstTimer));

  const showReactionBurst = (emoji: string) => {
    setBurst(emoji);
    clearTimeout(burstTimer);
    burstTimer = setTimeout(() => setBurst(null), REACTION_BURST_MS);
  };

  const fireReaction = (emoji: string) => {
    sendRoomReaction(emoji);
    setReactionsOpen(false);
    showReactionBurst(emoji);
  };

  createEffect(() => {
    const onReaction = (event: Event) => {
      const emoji = (event as CustomEvent<{ emoji?: string }>).detail?.emoji;
      if (emoji) showReactionBurst(emoji);
    };
    window.addEventListener('darkbear:voice-reaction', onReaction);
    onCleanup(() => window.removeEventListener('darkbear:voice-reaction', onReaction));
  });

  createEffect(() => {
    const open = mediaState.transcriptOpen;
    if (transcriptWasOpen && !open) queueMicrotask(() => transcriptButton?.focus());
    transcriptWasOpen = open;
  });

  const selfNick = createMemo(() => bridgeState.nick ?? 'you');
  const peerNicks = createMemo(() =>
    Object.keys(mediaState.peers).sort((a, b) => a.localeCompare(b)),
  );
  const participantCount = createMemo(() => peerNicks().length + 1);
  const latestCaption = createMemo(() => {
    const ch = mediaState.channel?.toLowerCase();
    if (!ch) return mediaState.liveCaption;
    const entries = mediaState.transcripts[ch] ?? [];
    return entries[entries.length - 1] ?? null;
  });
  const transcriptEntries = createMemo(() => {
    const scope = (mediaState.channel ?? mediaState.callWith)?.toLowerCase();
    return scope ? mediaState.transcripts[scope] ?? [] : [];
  });

  // Spotlight target, when valid: our own nick or a live peer.
  const spotNick = createMemo<string | null>(() => {
    const target = mediaState.spotlightNick;
    if (!target) return null;
    if (target === selfNick() || mediaState.peers[target]) return target;
    return null;
  });
  const spotIsSelf = createMemo(() => spotNick() === selfNick());
  const filmstripPeers = createMemo(() => peerNicks().filter((n) => n !== spotNick()));

  const onSpotlight = (nick: string) => {
    setSpotlight(mediaState.spotlightNick === nick ? null : nick);
  };

  const bridgeDot = createMemo(() => BRIDGE_DOT[bridgeState.status]);
  const health = createMemo(() => HEALTH_STYLE[mediaState.health.status]);

  return (
    <div
      class="fixed inset-0 z-40 flex flex-col bg-[#05070c] text-gray-100"
      aria-label="Active media call"
      style={{
        'padding-top': 'env(safe-area-inset-top)',
        'padding-bottom': 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        class="absolute inset-0 pointer-events-none opacity-80"
        style={{
          background:
            'radial-gradient(circle at 20% 10%, rgba(16,185,129,0.16), transparent 32%), radial-gradient(circle at 84% 20%, rgba(99,102,241,0.16), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 35%)',
        }}
      />

      {/* Header */}
      <header class="relative z-[1] flex items-center justify-between gap-3 px-4 sm:px-7 py-3 border-b border-white/[0.06]">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span
              class={`w-2.5 h-2.5 rounded-full shrink-0 ${bridgeDot().cls}`}
              title={bridgeDot().label}
            />
            <h2 class="text-[15px] sm:text-[17px] font-semibold truncate">{props.title}</h2>
          </div>
          <div class="mt-1 flex items-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-gray-500">
            <span>{props.kindLabel}</span>
            <span class="opacity-40">/</span>
            <span class="font-mono tabular-nums">{props.elapsed ?? 'connecting…'}</span>
            <span class="hidden sm:inline opacity-40">/</span>
            <span class="hidden sm:inline">
              {participantCount()} participant{participantCount() !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            ref={(element) => (transcriptButton = element)}
            type="button"
            onClick={() => setTranscriptOpen(!mediaState.transcriptOpen)}
            aria-label={`Call transcript (${transcriptEntries().length})`}
            aria-expanded={mediaState.transcriptOpen}
            class={`flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-[10px] font-semibold transition-colors ${
              mediaState.transcriptOpen
                ? 'border-emerald-400/25 bg-emerald-400/12 text-emerald-200'
                : 'border-white/[0.08] bg-white/[0.04] text-gray-300 hover:bg-white/[0.07]'
            }`}
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <path d="M2 3.5h12M2 7.5h8M2 11.5h10" />
            </svg>
            <span class="hidden sm:inline">Transcript</span>
            <span class="rounded bg-black/25 px-1 font-mono tabular-nums">{transcriptEntries().length}</span>
          </button>
          <CallHealthView />
          <button
            onClick={() => setMinimized(true)}
            class="w-10 h-10 rounded-xl text-gray-400 hover:text-gray-100 hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors shrink-0"
            title="Minimize"
          >
            <span class="sr-only">Minimize</span>
            <svg class="mx-auto" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M2 10h12" />
            </svg>
          </button>
        </div>
      </header>

      <Show when={mediaState.transcriptOpen}>
        <TranscriptPanel
          scope={mediaState.channel ?? mediaState.callWith ?? 'call'}
          entries={transcriptEntries()}
          onClose={() => setTranscriptOpen(false)}
        />
      </Show>

      {/* Stage */}
      <main class="relative z-[1] flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6 flex flex-col">
        <Show when={mediaState.health.status === 'reconnecting' || mediaState.health.status === 'degraded'}>
          <div
            class={`mb-4 rounded-xl border px-4 py-3 text-[12px] shrink-0 ${
              mediaState.health.status === 'reconnecting'
                ? 'border-orange-400/25 bg-orange-500/10 text-orange-100'
                : 'border-amber-400/20 bg-amber-500/10 text-amber-100'
            }`}
            role="status"
            aria-live="polite"
          >
            <span class={`inline-block mr-2 h-2 w-2 rounded-full ${health().dot}`} aria-hidden="true" />
            {mediaState.health.status === 'reconnecting'
              ? `Onyx Server bridge interrupted. Keeping media active while reconnecting (attempt ${mediaState.health.reconnectAttempt}).`
              : mediaState.health.tier === 0
                ? 'Packet loss or encoder pressure detected. Monitoring before reducing quality.'
                : `Call quality reduced to ${QUALITY_LABEL[mediaState.health.tier].toLowerCase()} while conditions recover.`}
          </div>
        </Show>
        <Show when={mediaState.error}>
          <div
            class="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-100 shrink-0"
            role="alert"
          >
            {mediaState.error}
          </div>
        </Show>

        <Show
          when={spotNick()}
          fallback={
            /* ── Grid layout ── */
            <div class={`grid gap-3 sm:gap-4 w-full mx-auto content-start ${gridClass(participantCount())}`}>
              <Tile nick={selfNick()} isSelf spotlit={false} onSpotlight={onSpotlight} />
              <For each={peerNicks()}>
                {(nick) => <Tile nick={nick} isSelf={false} spotlit={false} onSpotlight={onSpotlight} />}
              </For>
            </div>
          }
        >
          {(spot) => (
            /* ── Spotlight layout: big tile + filmstrip ── */
            <div class="flex flex-col gap-3 flex-1 min-h-0 w-full max-w-6xl mx-auto">
              <div class="flex-1 min-h-0">
                <Tile nick={spot()} isSelf={spotIsSelf()} fill spotlit onSpotlight={onSpotlight} />
              </div>
              <div class="flex gap-3 overflow-x-auto pb-1 shrink-0">
                <Show when={!spotIsSelf()}>
                  <Tile
                    nick={selfNick()}
                    isSelf
                    spotlit={false}
                    onSpotlight={onSpotlight}
                    class="w-40 sm:w-48 shrink-0"
                  />
                </Show>
                <For each={filmstripPeers()}>
                  {(nick) => (
                    <Tile
                      nick={nick}
                      isSelf={false}
                      spotlit={false}
                      onSpotlight={onSpotlight}
                      class="w-40 sm:w-48 shrink-0"
                    />
                  )}
                </For>
              </div>
            </div>
          )}
        </Show>

        <Show when={latestCaption()}>
          {(caption) => (
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              class={`mt-4 mx-auto max-w-3xl w-full rounded-xl border px-4 py-2 text-center shadow-xl shadow-black/20 ${
                settings.captionBackground === 'solid'
                  ? 'border-white/[0.16] bg-black/90'
                  : 'border-white/[0.08] bg-black/55 backdrop-blur-md'
              }`}
            >
              <span class="mr-2 text-[11px] font-semibold text-emerald-200">{caption().nick}</span>
              <span class={`leading-snug text-gray-100 break-words ${
                settings.captionSize === 'small'
                  ? 'text-[12px] sm:text-[13px]'
                  : settings.captionSize === 'large'
                    ? 'text-[18px] sm:text-[20px]'
                    : 'text-[14px] sm:text-[15px]'
              }`}>{caption().text}</span>
            </div>
          )}
        </Show>

        {/* Status cards — signature darkbear strip */}
        <div class="hidden sm:grid grid-cols-3 gap-2 max-w-md w-full mx-auto mt-5 shrink-0">
          <StatusCard label="Audio" value={mediaState.selfMuted ? 'Muted' : mediaState.selfDeafened ? 'Deafened' : 'Open'} active={!mediaState.selfMuted && !mediaState.selfDeafened} />
          <StatusCard label="Video" value={mediaState.cameraOn ? 'Live' : mediaState.kind === 'video' ? 'Ready' : 'Voice'} active={mediaState.cameraOn} />
          <StatusCard label="Screen" value={mediaState.screenSharing ? 'Shared' : 'Off'} active={mediaState.screenSharing} />
        </div>
      </main>

      {/* Control bar */}
      <footer class="relative z-[1] px-4 sm:px-7 py-4 border-t border-white/[0.06] bg-black/20">
        <div class="relative mx-auto max-w-3xl">
          <Show when={burst()}>
            <div class="absolute -top-12 left-1/2 -translate-x-1/2 text-3xl animate-fade-up pointer-events-none">
              {burst()}
            </div>
          </Show>
          <Show when={reactionsOpen()}>
            <div class="absolute -top-14 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-2xl border border-white/[0.08] bg-gray-950/95 backdrop-blur-xl px-2 py-1.5 shadow-2xl shadow-black/40 animate-slide-down">
              <For each={REACTION_EMOJI}>
                {(emoji) => (
                  <button
                    onClick={() => fireReaction(emoji)}
                    class="w-9 h-9 rounded-xl text-[18px] hover:bg-white/[0.08] active:scale-90 transition-all"
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                )}
              </For>
            </div>
          </Show>

          <div class="flex items-center justify-center gap-2 sm:gap-3">
            <ControlButton
              active={mediaState.selfMuted}
              danger
              label={mediaState.selfMuted ? 'Unmute' : 'Mute'}
              onClick={toggleMute}
            >
              <Show when={mediaState.selfMuted} fallback={<IconMic />}>
                <IconMicOff />
              </Show>
            </ControlButton>
            <ControlButton
              active={mediaState.selfDeafened}
              danger
              label={mediaState.selfDeafened ? 'Undeafen' : 'Deafen'}
              onClick={toggleDeafen}
            >
              <IconDeafen slashed={mediaState.selfDeafened} />
            </ControlButton>
            <ControlButton
              active={mediaState.cameraOn}
              label={mediaState.cameraOn ? 'Stop cam' : 'Camera'}
              onClick={toggleCamera}
            >
              <IconCamera slashed={!mediaState.cameraOn && mediaState.kind === 'video'} />
            </ControlButton>
            <ControlButton
              active={mediaState.screenSharing}
              label={mediaState.screenSharing ? 'Stop share' : 'Share'}
              onClick={toggleScreenShare}
            >
              <IconScreen />
            </ControlButton>
            <ControlButton
              active={reactionsOpen()}
              label="React"
              onClick={() => setReactionsOpen((v) => !v)}
            >
              <IconSmile />
            </ControlButton>
            <button
              onClick={() => props.onEnd()}
              class="h-12 px-5 rounded-2xl bg-red-600 text-white text-[12px] font-semibold shadow-lg shadow-red-950/30 hover:bg-red-500 active:scale-95 transition-all"
            >
              {mediaState.channel ? 'Leave' : 'Hang up'}
            </button>
          </div>

          <div class="mt-2.5 hidden items-center justify-center gap-3 text-[10px] text-gray-600 select-none sm:flex">
            <span><kbd class={KBD_CLASS}>M</kbd> mute</span>
            <span><kbd class={KBD_CLASS}>D</kbd> deafen</span>
            <span><kbd class={KBD_CLASS}>V</kbd> camera</span>
            <span><kbd class={KBD_CLASS}>S</kbd> share</span>
            <span><kbd class={KBD_CLASS}>C</kbd> captions</span>
            <span><kbd class={KBD_CLASS}>H</kbd> hang up</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Compact call health inspector ──────────────────────────────────────────

function formatBitrate(bps: number): string {
  if (bps <= 0) return '—';
  if (bps >= 1_000_000) return `${formatNumber(bps / 1_000_000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mbps`;
  return `${formatNumber(Math.round(bps / 1000))} kbps`;
}

function CallHealthView() {
  const style = createMemo(() => HEALTH_STYLE[mediaState.health.status]);
  const loss = createMemo(() => `${formatNumber(mediaState.health.lossRate * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
  const pressure = createMemo(() => `${formatNumber(Math.round(mediaState.health.encodePressure * 100))}%`);
  const room = createMemo(() => mediaState.health.roomStats);
  const observedPeerAudioKey = createMemo(() => {
    const peer = mediaState.callWith?.toLowerCase();
    return peer ? mediaState.observedAudioKeys[peer] ?? null : null;
  });

  return (
    <details class="relative">
      <summary
        class="h-10 px-3 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] cursor-pointer select-none flex items-center gap-2 transition-colors"
        style={{ 'list-style': 'none' }}
        aria-label={`Call health: ${style().label}`}
      >
        <span class={`h-2.5 w-2.5 rounded-full shrink-0 ${style().dot}`} aria-hidden="true" />
        <span class={`hidden sm:inline text-[11px] font-semibold ${style().text}`}>{style().label}</span>
        <IconChevronDown />
      </summary>
      <div class="absolute right-0 top-12 z-20 w-[min(88vw,320px)] rounded-2xl border border-white/[0.10] bg-gray-950/98 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-[10px] uppercase tracking-[0.18em] text-gray-400">Call health</p>
            <p class={`mt-1 text-[14px] font-semibold ${style().text}`}>{style().label}</p>
          </div>
          <span class="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-mono text-gray-300">
            {QUALITY_LABEL[mediaState.health.tier]} tier
          </span>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <HealthMetric label="Packet loss" value={loss()} warn={mediaState.health.lossRate >= 0.03} />
          <HealthMetric label="Jitter" value={`${Math.round(mediaState.health.jitterMs)} ms`} warn={mediaState.health.jitterMs >= 40} />
          <HealthMetric label="Encode load" value={pressure()} warn={mediaState.health.encodePressure >= 1} />
          <HealthMetric label="Onyx Server rate" value={formatBitrate(mediaState.health.suggestedBps)} warn={mediaState.health.tier >= 2} />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3 text-[10px] text-gray-400">
          <span>{mediaState.health.roundTripMs > 0 ? `${Math.round(mediaState.health.roundTripMs)} ms round trip` : 'Round trip pending'}</span>
          <Show when={room()}>
            {(stats) => <span>{stats().active_senders} sending · {stats().total_viewers} viewing</span>}
          </Show>
        </div>
        <div class="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">Audio E2EE</span>
            <span class="text-amber-300">Unavailable</span>
          </div>
          <p class="mt-1 text-[10px] leading-relaxed text-gray-500">
            {observedPeerAudioKey()
              ? `Peer audio key observed: ${observedPeerAudioKey()!.fingerprint} · generation ${observedPeerAudioKey()!.epoch}. Audio E2EE signalling is incomplete, so encrypted delivery is not available. Camera video and screen share are not end-to-end encrypted.`
              : mediaState.channel
                ? 'Room Audio E2EE signalling is incomplete, so encrypted delivery is not available. Camera video and screen share are not end-to-end encrypted.'
                : 'Audio E2EE signalling is incomplete, so encrypted delivery is not available. Camera video and screen share are not end-to-end encrypted.'}
          </p>
        </div>
      </div>
    </details>
  );
}

function HealthMetric(props: { label: string; value: string; warn: boolean }) {
  return (
    <div class="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
      <p class="text-[9px] uppercase tracking-[0.14em] text-gray-400">{props.label}</p>
      <p class={`mt-1 font-mono text-[12px] tabular-nums ${props.warn ? 'text-amber-200' : 'text-gray-100'}`}>
        {props.value}
      </p>
    </div>
  );
}

// ── Participant tile ─────────────────────────────────────────────────────

interface TileProps {
  nick: string;
  isSelf: boolean;
  /** Fill the parent (spotlight primary) instead of the 16:9 grid aspect. */
  fill?: boolean;
  spotlit: boolean;
  onSpotlight: (nick: string) => void;
  class?: string;
}

function Tile(props: TileProps) {
  let videoRef: HTMLVideoElement | undefined;
  const [hasStream, setHasStream] = createSignal(false);

  const peer = createMemo(() => (props.isSelf ? null : mediaState.peers[props.nick] ?? null));
  const wantsVideo = createMemo(() =>
    props.isSelf
      ? mediaState.cameraOn || mediaState.screenSharing
      : peer()?.hasVideo ?? false,
  );
  const speaking = createMemo(
    () => !props.isSelf && ((peer()?.speaking ?? false) || mediaState.speakingNick === props.nick),
  );
  const muted = createMemo(() => (props.isSelf ? mediaState.selfMuted : peer()?.muted ?? false));
  const handRaised = createMemo(() => !props.isSelf && !!mediaState.raisedHands[props.nick]);
  const level = createMemo(() => Math.min(1, Math.max(0, peer()?.audioLevel ?? 0)));
  const mirror = createMemo(() => props.isSelf && mediaState.cameraOn && !mediaState.screenSharing);
  const color = createMemo(() => nickColor(props.nick));
  const initials = createMemo(() => props.nick.slice(0, 2).toUpperCase());

  // Bind the live MediaStream to the <video>. The engine's decoder canvas
  // (and stream identity) can appear/change after hasVideo flips, so we bind
  // immediately and keep a slow poll to catch late canvases and camera↔screen
  // swaps. Cleanup always nulls srcObject on rerun/disposal.
  createEffect(() => {
    const el = videoRef;
    if (!el) return;
    if (!wantsVideo()) {
      el.srcObject = null;
      setHasStream(false);
      return;
    }
    const nick = props.nick;
    const self = props.isSelf;
    const bind = () => {
      const stream = self ? selfPreviewStream() : peerStream(nick);
      if (stream && el.srcObject !== stream) {
        el.srcObject = stream;
        void el.play().catch(() => undefined);
      }
      setHasStream(!!stream && el.srcObject === stream);
    };
    bind();
    const poll = setInterval(bind, STREAM_POLL_MS);
    onCleanup(() => {
      clearInterval(poll);
      el.srcObject = null;
      setHasStream(false);
    });
  });

  const frameClass = createMemo(() => {
    const base = props.fill ? 'h-full w-full' : 'aspect-video w-full';
    const ring = speaking()
      ? 'ring-2 ring-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
      : props.spotlit
        ? 'ring-1 ring-white/[0.15]'
        : '';
    return `relative ${base} rounded-2xl border border-white/[0.06] bg-white/[0.03] overflow-hidden text-left transition-shadow duration-150 ${ring} ${props.class ?? ''}`;
  });

  return (
    <button
      onClick={() => props.onSpotlight(props.nick)}
      class={frameClass()}
      title={props.spotlit ? 'Exit spotlight' : `Spotlight ${props.nick}`}
      aria-label={`${props.nick}${props.isSelf ? ' (you)' : ''}${speaking() ? ', speaking' : ''}${muted() ? ', muted' : ''}${handRaised() ? ', hand raised' : ''}`}
      aria-pressed={props.spotlit}
    >
      <video
        ref={(el) => { videoRef = el; }}
        class={`absolute inset-0 h-full w-full ${props.fill ? 'object-contain bg-black' : 'object-cover'} ${mirror() ? '-scale-x-100' : ''} ${hasStream() ? '' : 'hidden'}`}
        autoplay
        playsinline
        muted={props.isSelf}
      />

      {/* Avatar fallback (voice-only or stream not yet up) */}
      <Show when={!hasStream()}>
        <div class="absolute inset-0 flex items-center justify-center">
          <div
            class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-lg sm:text-xl font-bold text-white/90"
            style={{
              background: `linear-gradient(135deg, ${color()}, ${color()}bb)`,
              'box-shadow': speaking() ? `0 0 28px ${color()}50` : 'none',
            }}
          >
            {initials()}
          </div>
        </div>
      </Show>

      {/* Bottom info bar */}
      <div class="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1.5 pointer-events-none">
        <span class="flex items-center gap-1.5 max-w-full rounded-lg bg-black/55 backdrop-blur-sm px-2 py-0.5 text-[11px] font-semibold text-gray-100">
          <span class="truncate">{props.nick}</span>
          <Show when={props.isSelf}>
            <span class="text-gray-400 font-normal">(you)</span>
          </Show>
          <Show when={muted()}>
            <span class="text-red-300 shrink-0" title="Muted"><IconMicOff size={11} /></span>
          </Show>
          <Show when={props.isSelf && mediaState.selfDeafened}>
            <span class="text-red-300 shrink-0" title="Deafened"><IconDeafen slashed size={11} /></span>
          </Show>
          <Show when={handRaised()}>
            <span class="text-amber-200 shrink-0" title="Hand raised">✋</span>
          </Show>
        </span>
        <Show when={speaking()}>
          <span class="w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)] shrink-0" />
        </Show>
      </div>

      {/* Audio level bar (peers only — subtle) */}
      <Show when={!props.isSelf}>
        <div class="absolute bottom-0 inset-x-0 h-[3px] bg-black/30 pointer-events-none">
          <div
            class="h-full bg-emerald-400/70 transition-[width] duration-150"
            style={{ width: `${Math.round(level() * 100)}%` }}
          />
        </div>
      </Show>
    </button>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────

function StatusCard(props: { label: string; value: string; active: boolean }) {
  return (
    <div
      class={`rounded-2xl border px-3 py-2 ${
        props.active ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-white/[0.06] bg-black/20'
      }`}
    >
      <div class="text-[10px] uppercase tracking-[0.16em] text-gray-500">{props.label}</div>
      <div class={`mt-0.5 text-[12px] font-semibold ${props.active ? 'text-emerald-200' : 'text-gray-300'}`}>
        {props.value}
      </div>
    </div>
  );
}

interface ControlButtonProps {
  active: boolean;
  danger?: boolean;
  label: string;
  onClick: () => void;
  children: JSX.Element;
}

function ControlButton(props: ControlButtonProps) {
  const cls = createMemo(() => {
    const state = props.active
      ? props.danger
        ? 'bg-red-500/18 border-red-400/25 text-red-100 hover:bg-red-500/25'
        : 'bg-emerald-500/18 border-emerald-400/25 text-emerald-100 hover:bg-emerald-500/25'
      : 'bg-white/[0.05] border-white/[0.08] text-gray-300 hover:bg-white/[0.08]';
    return `h-12 min-w-12 sm:min-w-[88px] px-3 rounded-2xl border flex items-center justify-center gap-2 text-[12px] font-semibold transition-all active:scale-95 ${state}`;
  });
  return (
    <button onClick={() => props.onClick()} class={cls()} title={props.label} aria-label={props.label} aria-pressed={props.active}>
      {props.children}
      <span class="hidden sm:inline">{props.label}</span>
    </button>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────

function IconMic(props: { size?: number }) {
  return (
    <svg width={props.size ?? 17} height={props.size ?? 17} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0014 0" />
      <path d="M12 17v4M8 21h8" />
    </svg>
  );
}

function IconMicOff(props: { size?: number }) {
  return (
    <svg width={props.size ?? 17} height={props.size ?? 17} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M9 5a3 3 0 016 0v5a3 3 0 01-.5 1.66" />
      <path d="M5 10a7 7 0 0011.6 5.25M19 10a7 7 0 01-.36 2.2" />
      <path d="M12 17v4M8 21h8" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function IconDeafen(props: { slashed?: boolean; size?: number }) {
  return (
    <svg width={props.size ?? 17} height={props.size ?? 17} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M4 13a8 8 0 0116 0" />
      <rect x="3" y="13" width="4" height="7" rx="2" />
      <rect x="17" y="13" width="4" height="7" rx="2" />
      <Show when={props.slashed}>
        <path d="M3 3l18 18" />
      </Show>
    </svg>
  );
}

function IconCamera(props: { slashed?: boolean; size?: number }) {
  return (
    <svg width={props.size ?? 17} height={props.size ?? 17} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="M17 9l5-3v12l-5-3" />
      <Show when={props.slashed}>
        <path d="M3 3l18 18" />
      </Show>
    </svg>
  );
}

function IconScreen() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function IconSmile() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14a4.5 4.5 0 007 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
