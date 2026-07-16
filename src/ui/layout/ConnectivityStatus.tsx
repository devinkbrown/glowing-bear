import { Show, createMemo } from 'solid-js';
import {
  browserOnline,
  connectionState,
  reconnect,
  relayDiagnostics,
  ConnectionState,
} from '@/state';

export default function ConnectivityStatus() {
  const reconnecting = () => connectionState() === ConnectionState.RECONNECTING;
  const visible = () => !browserOnline() || reconnecting();
  const detail = createMemo(() => {
    if (!browserOnline()) return 'Network unavailable. Chat and media will resume when this device is online.';
    const diagnostics = relayDiagnostics();
    const delay = diagnostics.reconnectDelayMs > 0
      ? ` Next attempt in ${Math.max(1, Math.ceil(diagnostics.reconnectDelayMs / 1000))}s.`
      : '';
    return `Relay connection interrupted${diagnostics.reconnectAttempt > 0 ? ` · attempt ${diagnostics.reconnectAttempt}` : ''}.${delay}`;
  });

  return (
    <Show when={visible()}>
      <div
        data-testid="connectivity-status"
        role="status"
        aria-live="polite"
        class="fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex w-[min(calc(100%_-_1.5rem),680px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/15 bg-[#111622]/95 px-3.5 py-3 text-[#e9edf8] shadow-2xl shadow-black/45 backdrop-blur-xl sm:px-4"
      >
        <span
          class={`h-2.5 w-2.5 shrink-0 rounded-full ${browserOnline() ? 'bg-[#f5c96b]' : 'bg-[#ff8b8b]'}`}
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p class="text-[12px] font-black tracking-wide text-white">
            {browserOnline() ? 'Reconnecting' : 'Offline'}
          </p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-[#c4cbda]">{detail()}</p>
        </div>
        <Show when={browserOnline() && reconnecting()}>
          <button
            type="button"
            class="shrink-0 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-black text-white transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-[#c7ccff]"
            onClick={reconnect}
          >
            Retry now
          </button>
        </Show>
      </div>
    </Show>
  );
}
