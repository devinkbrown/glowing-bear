import type {
  ArchivePolicy,
  ArchiveRecord,
  ArchiveSearchHit,
  ArchiveSearchRequest,
  ArchiveStats,
  ArchiveWorkerRequest,
  ArchiveWorkerResponse,
  ArchiveWorkerResult,
} from './types';

interface PendingRequest {
  resolve: (value: ArchiveWorkerResult) => void;
  reject: (reason: Error) => void;
  cleanup: () => void;
}

type ArchiveWorkerCommand = ArchiveWorkerRequest extends infer Request
  ? Request extends { id: number }
    ? Omit<Request, 'id'>
    : never
  : never;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();

function abortError(): DOMException {
  return new DOMException('Local archive search cancelled', 'AbortError');
}

function rejectPending(message: string): void {
  for (const request of pending.values()) {
    request.cleanup();
    request.reject(new Error(message));
  }
  pending.clear();
}

function resetWorker(message: string, expected: Worker | null = worker): void {
  if (worker !== expected) return;
  rejectPending(message);
  expected?.terminate();
  worker = null;
}

function isWorkerResponse(value: unknown): value is ArchiveWorkerResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (!Number.isSafeInteger(response.id) || typeof response.ok !== 'boolean') return false;
  if (response.ok) return Object.hasOwn(response, 'result');
  return response.error === 'unavailable' || response.error === 'storage'
    || response.error === 'invalid-request' || response.error === 'cancelled';
}

function getWorker(): Worker {
  if (worker) return worker;
  if (typeof Worker === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('Local archive is unavailable in this browser');
  }
  const created = new Worker(new URL('./archiveWorker.ts', import.meta.url), { type: 'module' });
  worker = created;
  created.onmessage = (event: MessageEvent<unknown>) => {
    if (!isWorkerResponse(event.data)) {
      resetWorker('Local archive worker protocol failed', created);
      return;
    }
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    request.cleanup();
    if (response.ok) request.resolve(response.result);
    else if (response.error === 'cancelled') request.reject(abortError());
    else request.reject(new Error(`Local archive ${response.error}`));
  };
  created.onerror = () => resetWorker('Local archive worker failed', created);
  created.onmessageerror = () => resetWorker('Local archive worker message failed', created);
  return created;
}

function send(
  request: ArchiveWorkerCommand,
  signal?: AbortSignal,
): Promise<ArchiveWorkerResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      request.cleanup();
      try {
        worker?.postMessage({ id: nextId++, type: 'cancel-search', targetId: id } satisfies ArchiveWorkerRequest);
      } catch {
        // The local promise is already cancelled; worker failure cleanup is independent.
      }
      reject(abortError());
    };
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    try {
      pending.set(id, { resolve, reject, cleanup });
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      getWorker().postMessage({ ...request, id } as ArchiveWorkerRequest);
    } catch (error) {
      pending.delete(id);
      cleanup();
      reject(error instanceof Error ? error : new Error('Local archive unavailable'));
    }
  });
}

export async function archiveMessages(records: ArchiveRecord[], policy: ArchivePolicy): Promise<void> {
  if (policy.retention === 'off' || records.length === 0) return;
  await send({ type: 'put', records, policy });
}

export async function searchArchive(
  request: ArchiveSearchRequest,
  signal?: AbortSignal,
): Promise<ArchiveSearchHit[]> {
  return await send({ type: 'search', request }, signal) as ArchiveSearchHit[];
}

export async function configureArchive(policy: ArchivePolicy): Promise<void> {
  await send({ type: 'configure', policy });
}

export async function deleteArchiveBuffer(bufferKey: string): Promise<void> {
  await send({ type: 'delete-buffer', bufferKey });
}

export async function wipeArchive(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await send({ type: 'wipe' });
}

export async function archiveStats(): Promise<ArchiveStats> {
  return await send({ type: 'stats' }) as ArchiveStats;
}
