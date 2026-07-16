import { createStore, produce } from 'solid-js/store';
import { settings } from '@/state/settings';
import {
  UploadError,
  effectiveUploadType,
  uploadFile,
  validateUploadFile,
} from '@/lib/upload/upload';
import type { UploadProgress, UploadResult } from '@/lib/upload/upload';

export type UploadQueueStatus = 'queued' | 'uploading' | 'complete' | 'error' | 'cancelled';

export interface UploadQueueItem {
  id: string;
  file: File;
  bufferKey: string;
  status: UploadQueueStatus;
  progress: UploadProgress;
  result?: UploadResult;
  error?: string;
  attempts: number;
  /** The accepted URL has been claimed by its original composer draft. */
  drafted: boolean;
  /** A relay/direct transport accepted a message containing the URL. */
  inserted: boolean;
  previewUrl?: string;
  createdAt: number;
}

interface UploadQueueState {
  items: UploadQueueItem[];
}

export const MAX_UPLOAD_QUEUE = 20;
export const MAX_CONCURRENT_UPLOADS = 2;

const controllers = new Map<string, AbortController>();
let activeUploads = 0;
let sequence = 0;

const [state, setState] = createStore<UploadQueueState>({ items: [] });
export { state as uploadQueueState };

function nextId(): string {
  sequence += 1;
  return `upload-${Date.now()}-${sequence}`;
}

function previewUrl(file: File): string | undefined {
  const type = effectiveUploadType(file);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return undefined;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return undefined;
  return URL.createObjectURL(file);
}

function revokePreview(item: UploadQueueItem | undefined): void {
  if (item?.previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function indexOf(id: string): number {
  return state.items.findIndex((item) => item.id === id);
}

function pump(): void {
  while (activeUploads < MAX_CONCURRENT_UPLOADS) {
    const next = state.items.find((item) => item.status === 'queued');
    if (!next) return;
    void runUpload(next.id);
  }
}

async function runUpload(id: string): Promise<void> {
  const index = indexOf(id);
  const item = state.items[index];
  if (!item || item.status !== 'queued') return;
  const controller = new AbortController();
  controllers.set(id, controller);
  activeUploads += 1;
  setState('items', index, {
    status: 'uploading',
    attempts: item.attempts + 1,
    error: undefined,
    progress: { loaded: 0, total: item.file.size, percent: 0 },
  });
  try {
    const result = await uploadFile(item.file, {
      mediaUrl: settings.uploadUrl.trim() || undefined,
      signal: controller.signal,
      onProgress: (progress) => {
        const current = indexOf(id);
        if (current >= 0 && state.items[current]?.status === 'uploading') {
          setState('items', current, 'progress', progress);
        }
      },
    });
    const current = indexOf(id);
    if (current >= 0 && state.items[current]?.status === 'uploading') {
      setState('items', current, {
        status: 'complete',
        result,
        progress: { loaded: item.file.size, total: item.file.size, percent: 100 },
      });
    }
  } catch (error) {
    const current = indexOf(id);
    if (current >= 0) {
      const cancelled = controller.signal.aborted || (error instanceof UploadError && error.code === 'cancelled');
      setState('items', current, {
        status: cancelled ? 'cancelled' : 'error',
        error: cancelled
          ? 'Upload cancelled.'
          : error instanceof Error ? error.message.slice(0, 240) : 'Upload failed.',
      });
    }
  } finally {
    controllers.delete(id);
    activeUploads = Math.max(0, activeUploads - 1);
    pump();
  }
}

export function enqueueUploads(files: Iterable<File>, bufferKey: string): string[] {
  const ids: string[] = [];
  for (const file of files) {
    if (state.items.length >= MAX_UPLOAD_QUEUE) break;
    const id = nextId();
    let error: string | undefined;
    try {
      validateUploadFile(file);
    } catch (reason) {
      error = reason instanceof Error ? reason.message.slice(0, 240) : 'File is not allowed.';
    }
    const item: UploadQueueItem = {
      id,
      file,
      bufferKey,
      status: error ? 'error' : 'queued',
      progress: { loaded: 0, total: file.size || null, percent: 0 },
      error,
      attempts: 0,
      drafted: false,
      inserted: false,
      previewUrl: error ? undefined : previewUrl(file),
      createdAt: Date.now(),
    };
    setState('items', (items) => [...items, item]);
    ids.push(id);
  }
  pump();
  return ids;
}

export function cancelUpload(id: string): void {
  const item = state.items[indexOf(id)];
  if (!item || item.status === 'complete' || item.status === 'error' || item.status === 'cancelled') return;
  if (item.status === 'uploading') controllers.get(id)?.abort();
  else {
    const index = indexOf(id);
    if (index >= 0) setState('items', index, { status: 'cancelled', error: 'Upload cancelled.' });
    pump();
  }
}

export function retryUpload(id: string): void {
  const index = indexOf(id);
  const item = state.items[index];
  if (!item || (item.status !== 'error' && item.status !== 'cancelled')) return;
  try {
    validateUploadFile(item.file);
  } catch (error) {
    setState('items', index, 'error', error instanceof Error ? error.message.slice(0, 240) : 'File is not allowed.');
    return;
  }
  setState('items', index, {
    status: 'queued', error: undefined, result: undefined, drafted: false, inserted: false,
    progress: { loaded: 0, total: item.file.size, percent: 0 },
  });
  pump();
}

export function markUploadDrafted(id: string): void {
  const index = indexOf(id);
  if (index >= 0 && state.items[index]?.status === 'complete') setState('items', index, 'drafted', true);
}

export function markUploadInserted(id: string): void {
  const index = indexOf(id);
  if (index >= 0 && state.items[index]?.status === 'complete' && state.items[index]?.drafted) {
    setState('items', index, 'inserted', true);
  }
}

export function completedUploadsForBuffer(bufferKey: string): UploadQueueItem[] {
  return state.items.filter((item) => item.bufferKey === bufferKey && item.status === 'complete' && !item.drafted && !!item.result?.url);
}

export function draftedUploadsForBuffer(bufferKey: string): UploadQueueItem[] {
  return state.items.filter((item) => item.bufferKey === bufferKey && item.status === 'complete' && item.drafted && !item.inserted && !!item.result?.url);
}

/**
 * Whether an accepted message contains the complete upload URL as its own
 * whitespace-delimited token. Uploads are inserted into drafts on their own
 * line, but users may add text around that line before sending. Substring
 * matching is intentionally avoided: editing `/a` into `/abc` no longer
 * consumes the original upload queue item.
 */
export function messageContainsUploadUrl(message: string, url: string): boolean {
  return message.split(/\s+/u).some((token) => token === url);
}

export function removeUpload(id: string): void {
  const index = indexOf(id);
  const item = state.items[index];
  if (!item) return;
  controllers.get(id)?.abort();
  revokePreview(item);
  setState('items', (items) => items.filter((candidate) => candidate.id !== id));
}

export function clearFinishedUploads(): void {
  const removed = state.items.filter((item) => (item.status === 'complete' && item.inserted) || item.status === 'cancelled');
  for (const item of removed) revokePreview(item);
  setState('items', (items) => items.filter((item) => !((item.status === 'complete' && item.inserted) || item.status === 'cancelled')));
}

export function resetUploads(): void {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  for (const item of state.items) revokePreview(item);
  activeUploads = 0;
  setState(produce((draft) => { draft.items = []; }));
}
