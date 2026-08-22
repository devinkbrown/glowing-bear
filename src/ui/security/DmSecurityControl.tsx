import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { settings } from '@/state/settings';
import {
  bridgeState,
  dmSecurityFor,
  forgetPeerDmTrust,
  refreshPeerDmKey,
  verifyPeerDmKey,
} from '@/state/bridge';
import { useClickOutside } from '@/primitives/clickOutside';
import { formatDate, t } from '@/lib/i18n';

interface Props {
  peer: string;
}

const STATUS_COPY = {
  unavailable: { label: 'Unprotected', tone: 'text-gray-500', dot: 'bg-gray-600' },
  loading: { label: 'Checking key', tone: 'text-amber-300', dot: 'bg-amber-400 animate-pulse' },
  unverified: { label: 'Encrypted · unverified', tone: 'text-amber-300', dot: 'bg-amber-400' },
  verified: { label: 'Encrypted · verified', tone: 'text-emerald-300', dot: 'bg-emerald-400' },
  changed: { label: 'Key changed · blocked', tone: 'text-red-300', dot: 'bg-red-400' },
} as const;

export default function DmSecurityControl(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let root: HTMLDivElement | undefined;

  const security = () => dmSecurityFor(props.peer);
  const status = createMemo(() => settings.bridge.e2eeDms ? security().status : 'unavailable');
  const copy = createMemo(() => STATUS_COPY[status()]);
  const keyGeneration = createMemo(() => security().currentFingerprint?.split(' ').slice(0, 4).join(' ') ?? null);

  useClickOutside(() => (open() ? root : undefined), () => setOpen(false));

  createEffect(() => {
    if (settings.bridge.e2eeDms && bridgeState.status === 'ready') {
      refreshPeerDmKey(props.peer);
    }
  });

  const verify = async () => {
    setBusy(true);
    setError(null);
    const ok = await verifyPeerDmKey(props.peer);
    if (!ok) setError('Could not save this verification on this device.');
    setBusy(false);
  };

  const forget = async () => {
    setBusy(true);
    setError(null);
    const ok = await forgetPeerDmTrust(props.peer);
    if (!ok) setError('Could not remove this verification on this device.');
    setBusy(false);
  };

  return (
    <div ref={(element) => (root = element)} class="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open())}
        aria-label={`DM security: ${copy().label}`}
        aria-expanded={open()}
        class={`flex h-5 items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.035] px-1.5 text-[9px] font-semibold transition-colors hover:bg-white/[0.07] ${copy().tone}`}
      >
        <span class={`h-1.5 w-1.5 rounded-full ${copy().dot}`} aria-hidden="true" />
        <span class="hidden md:inline">{copy().label}</span>
        <svg class="h-2.5 w-2.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
          <path d="M8 1.5 13 3v4c0 3.2-2 5.8-5 7.5C5 12.8 3 10.2 3 7V3l5-1.5Z" />
        </svg>
      </button>

      <Show when={open()}>
        <section
          role="dialog"
          aria-label={`Security details for ${props.peer}`}
          class="absolute left-0 top-full z-50 mt-2 w-[min(88vw,360px)] rounded-2xl border border-white/[0.1] bg-gray-950/98 p-4 text-left shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-600">DM security</p>
              <h3 class="mt-0.5 text-[14px] font-semibold text-gray-100">{props.peer}</h3>
            </div>
            <span class={`flex items-center gap-1.5 text-[10px] font-semibold ${copy().tone}`}>
              <span class={`h-2 w-2 rounded-full ${copy().dot}`} aria-hidden="true" />
              {copy().label}
            </span>
          </div>

          <Show
            when={settings.bridge.e2eeDms}
            fallback={<p class="text-[11px] leading-relaxed text-gray-400">DM encryption is disabled in Settings. Messages use the relay plaintext path.</p>}
          >
            <Show
              when={security().currentFingerprint}
              fallback={
                <p class="text-[11px] leading-relaxed text-gray-400">
                  {bridgeState.status === 'ready'
                    ? 'No peer device key is available. Messages are not end-to-end encrypted.'
                    : t('security.connectOnyx')}
                </p>
              }
            >
              <p class="text-[10px] text-gray-500">Observed key generation {keyGeneration()}</p>
              <Fingerprint label="Current fingerprint" value={security().currentFingerprint!} />

              <Show when={security().status === 'changed'}>
                <div role="alert" class="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2.5">
                  <p class="text-[11px] font-semibold text-red-200">The verified key changed. Sending is blocked.</p>
                  <p class="mt-1 text-[10px] leading-relaxed text-red-200/70">Compare the new fingerprint with {props.peer} over another channel before re-trusting it.</p>
                </div>
                <Show when={security().pinnedFingerprint}>
                  <Fingerprint label="Previously trusted fingerprint" value={security().pinnedFingerprint!} />
                </Show>
              </Show>

              <Show when={security().status === 'verified' && security().verifiedAt}>
                <p class="mt-2 text-[10px] text-emerald-300/70">Verified on this device {formatDate(security().verifiedAt!, { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </Show>

              <div class="mt-3 flex gap-2">
                <Show when={security().status === 'unverified' || security().status === 'changed'}>
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={() => void verify()}
                    class="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-40"
                  >
                    {security().status === 'changed' ? 'Re-trust new key' : 'Mark fingerprint verified'}
                  </button>
                </Show>
                <Show when={security().status === 'verified'}>
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={() => void forget()}
                    class="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-gray-300 hover:bg-white/[0.07] disabled:opacity-40"
                  >
                    Remove verification
                  </button>
                </Show>
              </div>
            </Show>
          </Show>

          <p class="mt-3 text-[10px] leading-relaxed text-gray-600">
            Verification pins the peer public key locally. It is not synced to other devices.
          </p>
          <Show when={error()}><p role="alert" class="mt-2 text-[10px] text-red-300">{error()}</p></Show>
        </section>
      </Show>
    </div>
  );
}

function Fingerprint(props: { label: string; value: string }) {
  return (
    <div class="mt-2 rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2.5">
      <p class="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-gray-600">{props.label}</p>
      <code class="block break-words font-mono text-[10px] leading-relaxed tracking-[0.08em] text-gray-300">{props.value}</code>
    </div>
  );
}
