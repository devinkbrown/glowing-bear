import { For, Show, createEffect, createMemo, onCleanup, onMount } from 'solid-js';
import Modal from '@/ui/bits/Modal';
import {
  closeMediaPreflight,
  confirmMediaPreflight,
  mediaPreflightPreviewStream,
  mediaState,
  refreshMediaDevices,
  runMediaEchoTest,
  runMediaPreflight,
  selectMediaDevice,
  type MediaDeviceOption,
  type MediaPermissionStatus,
} from '@/state/media';

type CheckTone = 'waiting' | 'active' | 'ready' | 'error';

function CheckCard(props: { label: string; detail: string; tone: CheckTone }) {
  const dotClass = () => ({
    waiting: 'bg-gray-600',
    active: 'bg-amber-300 animate-pulse',
    ready: 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.55)]',
    error: 'bg-red-400',
  })[props.tone];
  return (
    <div class="min-w-0 flex-1 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
      <div class="flex items-center gap-2">
        <span class={`h-2 w-2 shrink-0 rounded-full ${dotClass()}`} aria-hidden="true" />
        <span class="text-[10px] font-black uppercase tracking-[0.16em] text-[#aab1bd]">{props.label}</span>
      </div>
      <p class="mt-1 truncate text-[12px] font-medium text-gray-100">{props.detail}</p>
    </div>
  );
}

function permissionDetail(permission: MediaPermissionStatus, ready: boolean): string {
  if (ready) return 'Signal received';
  if (permission === 'denied') return 'Access blocked';
  if (permission === 'prompt') return 'Permission needed';
  if (permission === 'granted') return 'Opening device';
  return 'Checking device';
}

function DeviceSelect(props: {
  id: string;
  label: string;
  value: string | null;
  options: MediaDeviceOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label for={props.id} class="block min-w-0">
      <span class="mb-1.5 block text-[10px] font-black uppercase tracking-[0.15em] text-[#aab1bd]">{props.label}</span>
      <select
        id={props.id}
        value={props.value ?? ''}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        class="h-10 w-full rounded-xl border border-white/[0.08] bg-gray-950 px-3 text-[12px] text-gray-200 outline-none transition-colors focus:border-[var(--custom-accent,#818cf8)] focus:ring-2 focus:ring-[var(--custom-accent,#818cf8)]/20"
      >
        <option value="">System default</option>
        <For each={props.options}>
          {(device) => <option value={device.deviceId}>{device.label}</option>}
        </For>
      </select>
    </label>
  );
}

export default function MediaPreflight() {
  let preview: HTMLVideoElement | undefined;

  const intent = createMemo(() => mediaState.preflight.intent);
  const needsVideo = createMemo(() => intent()?.video ?? false);
  const ready = createMemo(() => mediaState.preflight.status === 'ready');
  const checking = createMemo(() => mediaState.preflight.status === 'checking');
  const destination = createMemo(() => intent()?.target ?? 'call');
  const actionLabel = createMemo(() => {
    const current = intent();
    if (!current) return 'Continue';
    if (current.mode === 'accept') return `Accept ${current.video ? 'video' : 'voice'} call`;
    if (current.mode === 'call') return `Start ${current.video ? 'video' : 'voice'} call`;
    return `Join ${current.video ? 'video' : 'voice'}`;
  });
  const captureTone = createMemo<CheckTone>(() => {
    if (ready()) return 'ready';
    if (mediaState.preflight.status === 'error') return 'error';
    return checking() ? 'active' : 'waiting';
  });
  const codecTone = createMemo<CheckTone>(() => {
    if (mediaState.preflight.codec === 'ready') return 'ready';
    if (mediaState.preflight.codec === 'error') return 'error';
    return mediaState.preflight.codec === 'checking' ? 'active' : 'waiting';
  });
  const echoLabel = createMemo(() => {
    if (mediaState.preflight.echo === 'recording') return 'Recording…';
    if (mediaState.preflight.echo === 'playing') return 'Playing…';
    if (mediaState.preflight.echo === 'error') return 'Try echo test again';
    return 'Run echo test';
  });

  createEffect(() => {
    const status = mediaState.preflight.status;
    const stream = mediaPreflightPreviewStream();
    if (!preview || preview.srcObject === stream || status === 'idle') return;
    preview.srcObject = stream;
    if (stream) void preview.play().catch(() => undefined);
  });

  onMount(() => {
    const devices = navigator.mediaDevices;
    if (!devices?.addEventListener) return;
    const onDeviceChange = () => void refreshMediaDevices().catch(() => undefined);
    devices.addEventListener('devicechange', onDeviceChange);
    onCleanup(() => devices.removeEventListener('devicechange', onDeviceChange));
  });

  onCleanup(() => {
    if (preview) preview.srcObject = null;
  });

  return (
    <Modal
      open={mediaState.preflight.open}
      onClose={closeMediaPreflight}
      title="Media preflight"
      width="880px"
      maxHeight="92dvh"
      class="bg-[#0a0d14]"
    >
      <div class="max-h-[calc(92dvh-57px)] overflow-y-auto">
        <div class="border-b border-white/[0.05] px-4 py-4 sm:px-5">
          <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--custom-accent,#818cf8)]">Before you connect</p>
              <p class="mt-1 text-[17px] font-semibold tracking-tight text-gray-50">
                Check your signal for <span class="text-gray-300">{destination()}</span>
              </p>
            </div>
            <p class="max-w-sm text-[11px] leading-relaxed text-gray-400">
              DarkBear verifies capture and media encoding here, before anyone in the room can hear or see you.
            </p>
          </div>

          <div class="mt-4 flex gap-2" role="status" aria-live="polite" aria-label="Media checks">
            <CheckCard
              label="Microphone"
              tone={captureTone()}
              detail={permissionDetail(mediaState.preflight.microphonePermission, ready())}
            />
            <Show when={needsVideo()}>
              <CheckCard
                label="Camera"
                tone={captureTone()}
                detail={permissionDetail(mediaState.preflight.cameraPermission, ready())}
              />
            </Show>
            <CheckCard
              label="Media codec"
              tone={codecTone()}
              detail={
                mediaState.preflight.codec === 'ready'
                  ? 'Encoder ready'
                  : mediaState.preflight.codec === 'error'
                    ? 'Unavailable'
                    : 'Testing encoder'
              }
            />
          </div>
        </div>

        <div class="grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1.05fr)_minmax(270px,0.95fr)]">
          <section aria-label={needsVideo() ? 'Camera preview' : 'Microphone preview'}>
            <div class="relative flex aspect-video min-h-[180px] items-center justify-center overflow-hidden rounded-2xl border border-white/[0.07] bg-[#05070b]">
              <div
                class="absolute inset-0 opacity-50"
                style={{ background: 'radial-gradient(circle at 50% 40%, rgba(129,140,248,0.18), transparent 55%)' }}
                aria-hidden="true"
              />
              <Show
                when={needsVideo()}
                fallback={
                  <div class="relative flex flex-col items-center gap-4 px-8 text-center">
                    <div class="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200">
                      <MicIcon />
                    </div>
                    <div>
                      <p class="text-[13px] font-semibold text-gray-200">Speak to test your microphone</p>
                      <p class="mt-1 text-[11px] text-gray-600">The meter responds locally and is not transmitted.</p>
                    </div>
                  </div>
                }
              >
                <video
                  ref={(element) => { preview = element; }}
                  class="relative h-full w-full object-cover"
                  muted
                  playsinline
                  aria-label="Live camera preview"
                />
              </Show>

              <div class="absolute inset-x-3 bottom-3 rounded-lg border border-white/[0.07] bg-black/55 px-2.5 py-2 backdrop-blur-md">
                <div class="mb-1.5 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.14em] text-gray-400">
                  <span>Mic level</span>
                  <span>{Math.round(mediaState.preflight.audioLevel * 100)}%</span>
                </div>
                <div
                  class="h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
                  role="meter"
                  aria-label="Microphone level"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={Math.round(mediaState.preflight.audioLevel * 100)}
                >
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-indigo-400 via-emerald-300 to-amber-300 transition-[width] duration-100"
                    style={{ width: `${Math.max(2, mediaState.preflight.audioLevel * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Media devices" class="flex flex-col gap-3">
            <DeviceSelect
              id="preflight-microphone"
              label="Microphone"
              value={mediaState.preflight.microphoneId}
              options={mediaState.preflight.microphones}
              onChange={(value) => selectMediaDevice('microphone', value)}
            />
            <Show when={needsVideo()}>
              <DeviceSelect
                id="preflight-camera"
                label="Camera"
                value={mediaState.preflight.cameraId}
                options={mediaState.preflight.cameras}
                onChange={(value) => selectMediaDevice('camera', value)}
              />
            </Show>
            <DeviceSelect
              id="preflight-speaker"
              label="Speaker"
              value={mediaState.preflight.speakerId}
              options={mediaState.preflight.speakers}
              onChange={(value) => selectMediaDevice('speaker', value)}
            />

            <button
              type="button"
              onClick={() => void runMediaEchoTest()}
              disabled={!ready() || mediaState.preflight.echo === 'recording' || mediaState.preflight.echo === 'playing'}
              class="mt-1 h-10 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--custom-accent,#818cf8)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {echoLabel()}
            </button>
          </section>
        </div>

        <Show when={mediaState.preflight.error}>
          {(error) => (
            <div class="mx-4 mb-4 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-3.5 py-3 text-[12px] leading-relaxed text-red-200 sm:mx-5" role="alert">
              {error()}
            </div>
          )}
        </Show>

        <footer class="sticky bottom-0 flex items-center justify-between gap-3 border-t border-white/[0.06] bg-[#0a0d14]/95 px-4 py-3 backdrop-blur-xl sm:px-5">
          <button
            type="button"
            onClick={() => void runMediaPreflight()}
            disabled={checking()}
            class="rounded-xl px-3 py-2.5 text-[11px] font-semibold text-gray-400 transition-colors hover:bg-white/[0.05] hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-40"
          >
            Check again
          </button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={closeMediaPreflight}
              class="rounded-xl px-3.5 py-2.5 text-[11px] font-semibold text-gray-400 hover:bg-white/[0.05] hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmMediaPreflight}
              disabled={!ready()}
              class="min-w-[122px] rounded-xl bg-emerald-300 px-4 py-2.5 text-[11px] font-black text-[#07101f] shadow-lg shadow-emerald-950/30 transition-all hover:bg-emerald-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {checking() ? 'Checking…' : actionLabel()}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3M9 21h6" />
    </svg>
  );
}
