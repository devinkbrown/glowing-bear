import { createEffect, createSignal, For, onMount, Show } from 'solid-js';
import type { SuimyakuTranscriptEntry } from '@/lib/suimyaku-media/types';
import { downloadCallTranscript } from '@/lib/callTranscript';
import { settings, updateSettings } from '@/state/settings';
import { formatDate } from '@/lib/i18n';

interface Props {
  scope: string;
  entries: readonly SuimyakuTranscriptEntry[];
  onClose: () => void;
}

export default function TranscriptPanel(props: Props) {
  const [exported, setExported] = createSignal(false);
  let list: HTMLOListElement | undefined;
  let panel: HTMLElement | undefined;

  onMount(() => panel?.focus());

  createEffect(() => {
    const length = props.entries.length;
    if (length > 0) queueMicrotask(() => list?.lastElementChild?.scrollIntoView?.({ block: 'nearest' }));
  });

  const exportCurrent = () => {
    if (!downloadCallTranscript(props.entries, props.scope)) return;
    setExported(true);
    setTimeout(() => setExported(false), 1600);
  };

  return (
    <section
      ref={(element) => (panel = element)}
      role="dialog"
      aria-label="Call transcript"
      aria-modal="false"
      tabindex="-1"
      class="absolute inset-x-3 bottom-[92px] top-[70px] z-30 ml-auto flex w-auto max-w-[440px] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-gray-950/98 shadow-2xl shadow-black/60 backdrop-blur-xl sm:right-5 sm:left-auto sm:w-[420px]"
    >
      <header class="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div>
          <p class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">Live accessibility</p>
          <h3 class="mt-0.5 text-[15px] font-semibold text-gray-100">Call transcript</h3>
          <p class="mt-0.5 text-[10px] text-gray-500">{props.scope} · {props.entries.length} caption{props.entries.length === 1 ? '' : 's'}</p>
        </div>
        <button
          type="button"
          onClick={() => props.onClose()}
          aria-label="Close call transcript"
          class="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 hover:bg-white/[0.06] hover:text-gray-100"
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="m4 4 8 8m0-8-8 8" />
          </svg>
        </button>
      </header>

      <div class="grid grid-cols-2 gap-2 border-b border-white/[0.07] px-4 py-3">
        <label class="text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500">
          Caption size
          <select
            aria-label="Caption size"
            value={settings.captionSize}
            onChange={(event) => updateSettings({ captionSize: event.currentTarget.value as typeof settings.captionSize })}
            class="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-gray-950 px-2.5 py-2 text-[11px] font-normal normal-case tracking-normal text-gray-200"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label class="text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500">
          Background
          <select
            aria-label="Caption background"
            value={settings.captionBackground}
            onChange={(event) => updateSettings({ captionBackground: event.currentTarget.value as typeof settings.captionBackground })}
            class="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-gray-950 px-2.5 py-2 text-[11px] font-normal normal-case tracking-normal text-gray-200"
          >
            <option value="solid">High contrast</option>
            <option value="translucent">Translucent</option>
          </select>
        </label>
      </div>

      <Show
        when={props.entries.length > 0}
        fallback={<p class="flex flex-1 items-center justify-center px-6 text-center text-[12px] leading-relaxed text-gray-500">Captions will appear here with speaker labels and times.</p>}
      >
        <ol ref={(element) => (list = element)} aria-label="Caption transcript" class="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          <For each={props.entries}>
            {(entry) => (
              <li
                tabindex="0"
                data-caption-row
                onKeyDown={navigateRows}
                aria-label={`${entry.nick} at ${formatCaptionTime(entry.time)}: ${entry.text}`}
                class="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="text-[11px] font-semibold text-emerald-200">{entry.nick}</span>
                  <time class="font-mono text-[9px] tabular-nums text-gray-600" datetime={new Date(entry.time).toISOString()}>{formatCaptionTime(entry.time)}</time>
                </div>
                <p class="mt-1 text-[12px] leading-relaxed text-gray-200">{entry.text}</p>
              </li>
            )}
          </For>
        </ol>
      </Show>

      <footer class="flex items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-3">
        <p class="max-w-[230px] text-[9px] leading-relaxed text-gray-600">
          {settings.archiveRetention === 'off'
            ? 'Local storage is off. Captions disappear when the call ends.'
            : 'Caption records follow the Local Archive retention and wipe controls.'}
        </p>
        <button
          type="button"
          disabled={props.entries.length === 0}
          onClick={exportCurrent}
          class="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[10px] font-semibold text-gray-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
        >
          {exported() ? 'Exported' : 'Export .txt'}
        </button>
      </footer>
    </section>
  );
}

function formatCaptionTime(timestamp: number): string {
  return formatDate(timestamp, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function navigateRows(event: KeyboardEvent & { currentTarget: HTMLLIElement }): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const rows = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[data-caption-row]') ?? [])];
  const current = rows.indexOf(event.currentTarget);
  if (current < 0 || rows.length === 0) return;
  event.preventDefault();
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? rows.length - 1
      : Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
  rows[next]?.focus();
}
