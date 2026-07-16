// CallNotification — full-screen 1:1 call overlay for the ringing states.
//
//   ringing_in  — incoming call: caller avatar with pulsing ring animation,
//                 Accept (requestAcceptCall) / Decline (rejectCall), Esc hint.
//   ringing_out — outgoing call: callee avatar with pulsing ring, Cancel
//                 (hangup).
//
// The ringtone is already driven by the media store (startIncomingRing /
// startOutgoingRing on state transitions) — nothing audible is wired here.
// When the tab is hidden, an incoming ring also fires a browser Notification
// (tag 'darkbear-call', requireInteraction) that focuses the window on click.
// The Esc shortcut itself is handled by the global keyboard layer — this
// component only displays the hint.

import { For, Show, createEffect, createMemo, onCleanup } from 'solid-js';
import { hangup, mediaState, rejectCall, requestAcceptCall } from '@/state/media';
import { appAsset, isDesktopRuntime, sendDesktopNotification } from '@/lib/desktop';
import { nickColor } from '@/lib/nickcolor';

const NOTIFICATION_ICON = appAsset('favicon.svg');
const KBD_CLASS =
  'px-1.5 py-0.5 bg-white/[0.06] rounded text-gray-400 text-[10px] font-mono';

export default function CallNotification() {
  const ringing = createMemo(
    () => mediaState.callState === 'ringing_in' || mediaState.callState === 'ringing_out',
  );
  return (
    <Show when={ringing()}>
      <RingOverlay />
    </Show>
  );
}

function RingOverlay() {
  const incoming = createMemo(() => mediaState.callState === 'ringing_in');
  const peerNick = createMemo(() => mediaState.callWith ?? 'unknown');
  const isVideo = createMemo(() => mediaState.kind === 'video');
  const color = createMemo(() => nickColor(peerNick()));
  const initial = createMemo(() => peerNick().charAt(0).toUpperCase());

  // Browser notification for incoming calls while the tab is hidden.
  createEffect(() => {
    if (!incoming()) return;
    const nick = peerNick();
    const kind = mediaState.kind;
    if (typeof document === 'undefined' || !document.hidden) return;
    if (isDesktopRuntime()) {
      void sendDesktopNotification({
        title: `Incoming ${kind} call`,
        body: `${nick} is calling you`,
      });
      return;
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(`Incoming ${kind} call`, {
        body: `${nick} is calling you`,
        icon: NOTIFICATION_ICON,
        tag: 'darkbear-call',
        requireInteraction: true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      onCleanup(() => n.close());
    } catch {
      // Notifications can throw in some secure contexts (sandboxed iframes).
    }
  });

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(10,11,16,0.95) 0%, rgba(10,11,16,0.99) 100%)',
        'padding-top': 'env(safe-area-inset-top)',
        'padding-bottom': 'env(safe-area-inset-bottom)',
      }}
    >
      <div class="flex flex-col items-center gap-5 sm:gap-6 px-6">
        {/* Avatar with pulsing rings */}
        <div class="relative">
          <div
            class="absolute -inset-4 rounded-full animate-ping opacity-10"
            style={{ border: `2px solid ${color()}`, 'animation-duration': '2s' }}
          />
          <div
            class="absolute -inset-8 rounded-full animate-ping opacity-5"
            style={{ border: `1.5px solid ${color()}`, 'animation-duration': '2s', 'animation-delay': '0.5s' }}
          />

          <div
            class="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-3xl sm:text-4xl font-bold text-white/90 shadow-2xl"
            style={{
              background: `linear-gradient(135deg, ${color()}, ${color()}bb)`,
              'box-shadow': `0 0 40px ${color()}30`,
            }}
          >
            {initial()}
          </div>

          {/* Call type badge */}
          <div class="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gray-900 border-2 border-gray-800 flex items-center justify-center">
            <Show when={isVideo()} fallback={<PhoneIcon size={14} color={color()} />}>
              <CameraIcon size={14} color={color()} />
            </Show>
          </div>
        </div>

        {/* Info */}
        <div class="text-center">
          <p class="text-[20px] font-semibold text-gray-100 mb-1">{peerNick()}</p>
          <p class="text-[13px] text-gray-500">
            {incoming()
              ? `Incoming ${isVideo() ? 'video' : 'voice'} call...`
              : `Calling ${peerNick()}...`}
          </p>
        </div>

        {/* Ringing dots */}
        <div class="flex items-center gap-1.5 h-4">
          <For each={[0, 1, 2]}>
            {(i) => (
              <div
                class="w-1.5 h-1.5 rounded-full bg-gray-400"
                style={{
                  animation: 'pulse 1.2s ease-in-out infinite',
                  'animation-delay': `${i * 0.2}s`,
                }}
              />
            )}
          </For>
        </div>

        {/* Keyboard hint */}
        <p class="text-[11px] text-gray-600">
          Press <kbd class={KBD_CLASS}>Esc</kbd> to {incoming() ? 'decline' : 'cancel'}
        </p>

        {/* Buttons */}
        <div class="flex items-center gap-6 sm:gap-4 mt-2">
          <Show
            when={incoming()}
            fallback={
              <button
                onClick={hangup}
                class="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500 active:scale-90 transition-all shadow-lg shadow-red-600/20"
                title="Cancel"
              >
                <CloseIcon size={26} />
              </button>
            }
          >
            <button
              onClick={rejectCall}
              class="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500 active:scale-90 transition-all shadow-lg shadow-red-600/20"
              title="Decline"
            >
              <CloseIcon size={26} />
            </button>

            <button
              onClick={requestAcceptCall}
              class="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-500 active:scale-90 transition-all shadow-lg shadow-emerald-600/20 animate-bounce"
              style={{ 'animation-duration': '2s' }}
              title="Accept"
            >
              <Show when={isVideo()} fallback={<PhoneIcon size={24} />}>
                <CameraIcon size={24} />
              </Show>
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────

function CameraIcon(props: { size: number; color?: string }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke={props.color ?? 'currentColor'} stroke-width="2" stroke-linecap="round">
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="M17 9l5-3v12l-5-3" />
    </svg>
  );
}

function PhoneIcon(props: { size: number; color?: string }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke={props.color ?? 'currentColor'} stroke-width="2" stroke-linecap="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function CloseIcon(props: { size: number }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
