import { For, Show } from 'solid-js';
import {
  cancelUpload,
  clearFinishedUploads,
  removeUpload,
  retryUpload,
  uploadQueueState,
} from '@/state/uploads';
import type { UploadQueueItem } from '@/state/uploads';
import { formatDate, formatNumber, t } from '@/lib/i18n';

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KiB`;
  return `${formatNumber(bytes / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MiB`;
}

function expiryLabel(value: string | undefined): string {
  if (!value) return '';
  const expires = Date.parse(value);
  if (!Number.isFinite(expires)) return '';
  const minutes = Math.max(0, Math.round((expires - Date.now()) / 60_000));
  if (expires <= Date.now()) return 'Expired';
  if (minutes < 60) return `Expires in ${formatNumber(minutes)} min`;
  if (minutes < 48 * 60) return `Expires in ${formatNumber(Math.round(minutes / 60))} hr`;
  return t('upload.expires', {
    date: formatDate(expires, { year: 'numeric', month: 'short', day: 'numeric' }),
  });
}

function statusLabel(item: UploadQueueItem): string {
  if (item.status === 'queued') return 'Queued';
  if (item.status === 'uploading') return item.progress.percent === null ? 'Uploading' : `Uploading ${item.progress.percent}%`;
  if (item.status === 'complete') {
    if (item.inserted) return 'Sent';
    return item.drafted ? 'Added to draft' : 'Upload accepted';
  }
  if (item.status === 'cancelled') return 'Cancelled';
  return item.error ?? 'Upload failed';
}

function destinationLabel(item: UploadQueueItem): string {
  return item.bufferKey.split('.').at(-1) || item.bufferKey;
}

export default function UploadQueue() {
  const hasFinished = () => uploadQueueState.items.some((item) => (item.status === 'complete' && item.inserted) || item.status === 'cancelled');
  return (
    <Show when={uploadQueueState.items.length > 0}>
      <section
        class="mx-2 mb-1 rounded-xl border border-white/[0.08] bg-gray-950/95 p-2.5 shadow-xl sm:mx-3"
        aria-label="Upload queue"
        data-testid="upload-queue"
      >
        <div class="mb-2 flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <h3 class="text-[11px] font-black uppercase tracking-[0.12em] text-white/85">Upload queue</h3>
            <p class="text-[10px] text-white/65">Accepted URLs are added to their original buffer draft.</p>
          </div>
          <Show when={hasFinished()}>
            <button type="button" onClick={clearFinishedUploads} class="rounded-lg px-2 py-1 text-[10px] font-bold text-white/70 hover:bg-white/[0.06] hover:text-white">
              Clear finished
            </button>
          </Show>
        </div>
        <div class="max-h-[220px] space-y-1.5 overflow-y-auto" role="list" aria-live="polite">
          <For each={uploadQueueState.items}>
            {(item) => (
              <article class="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] p-2" role="listitem">
                <Show when={item.previewUrl} fallback={
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[9px] font-black uppercase text-white/70">
                    {item.file.name.split('.').at(-1)?.slice(0, 4) || 'file'}
                  </div>
                }>
                  <img src={item.previewUrl} alt="" class="h-10 w-10 shrink-0 rounded-lg bg-black/30 object-cover" />
                </Show>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[11px] font-bold text-white/90">{item.file.name}</p>
                  <div class="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-white/65">
                    <span>{sizeLabel(item.file.size)}</span>
                    <span>to {destinationLabel(item)}</span>
                    <span class={item.status === 'error' ? 'text-red-200' : item.status === 'complete' ? 'text-emerald-100' : ''}>{statusLabel(item)}</span>
                    <Show when={item.result?.metadataStripped}><span>Image metadata removed</span></Show>
                    <Show when={expiryLabel(item.result?.expiresAt)}>{(label) => <span class="text-amber-100">{label()}</span>}</Show>
                  </div>
                  <Show when={item.status === 'uploading'}>
                    <div class="mt-1 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                      <div class="h-full rounded-full bg-white/75 transition-[width]" style={{ width: `${item.progress.percent ?? 15}%` }} />
                    </div>
                  </Show>
                </div>
                <Show when={item.status === 'queued' || item.status === 'uploading'}>
                  <button type="button" onClick={() => cancelUpload(item.id)} class="rounded-lg px-2 py-1.5 text-[10px] font-bold text-white/70 hover:bg-white/[0.06] hover:text-white" aria-label={`Cancel upload ${item.file.name}`}>
                    Cancel
                  </button>
                </Show>
                <Show when={item.status === 'cancelled' || (item.status === 'error' && item.attempts > 0)}>
                  <button type="button" onClick={() => retryUpload(item.id)} class="rounded-lg px-2 py-1.5 text-[10px] font-bold text-white/80 hover:bg-white/[0.06]" aria-label={`Retry upload ${item.file.name}`}>
                    Retry
                  </button>
                </Show>
                <Show when={item.status === 'complete' || item.status === 'error' || item.status === 'cancelled'}>
                  <button type="button" onClick={() => removeUpload(item.id)} class="rounded-lg px-2 py-1.5 text-[10px] font-bold text-white/65 hover:bg-red-500/10 hover:text-red-100" aria-label={`Remove upload ${item.file.name}`}>
                    ×
                  </button>
                </Show>
              </article>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}
