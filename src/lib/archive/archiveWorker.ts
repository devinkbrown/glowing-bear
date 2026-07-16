/// <reference lib="webworker" />

import { ArchiveRepository } from './repository';
import { compileArchiveSearch } from './search';
import type {
  ArchivePolicy,
  ArchiveSearchRequest,
  ArchiveWorkerRequest,
  ArchiveWorkerResponse,
} from './types';

const scope = self as DedicatedWorkerGlobalScope;
const repository = new ArchiveRepository();
const searches = new Map<number, { cancelled: boolean }>();
let operationQueue: Promise<void> = Promise.resolve();

function respond(response: ArchiveWorkerResponse): void {
  scope.postMessage(response);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requestId(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function isPolicy(value: unknown): value is ArchivePolicy {
  if (!isRecord(value)) return false;
  return (
    (value.retention === 'off' || value.retention === '7d'
      || value.retention === '30d' || value.retention === 'custom')
    && typeof value.maxMiB === 'number'
    && Number.isFinite(value.maxMiB)
  );
}

function isSearchRequest(value: unknown): value is ArchiveSearchRequest {
  if (!isRecord(value) || typeof value.query !== 'string') return false;
  if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || Number(value.limit) <= 0)) {
    return false;
  }
  return value.now === undefined || (
    typeof value.now === 'number' && Number.isFinite(value.now)
  );
}

function validatedRequest(value: unknown): ArchiveWorkerRequest | null {
  if (!isRecord(value)) return null;
  const id = requestId(value.id);
  if (id === null || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'put':
      return Array.isArray(value.records) && isPolicy(value.policy)
        ? value as unknown as ArchiveWorkerRequest
        : null;
    case 'search':
      return isSearchRequest(value.request) ? { id, type: 'search', request: value.request } : null;
    case 'cancel-search': {
      const targetId = requestId(value.targetId);
      return targetId === null ? null : { id, type: 'cancel-search', targetId };
    }
    case 'delete-buffer':
      return typeof value.bufferKey === 'string' && value.bufferKey.length > 0
        ? { id, type: 'delete-buffer', bufferKey: value.bufferKey }
        : null;
    case 'wipe': return { id, type: 'wipe' };
    case 'configure':
      return isPolicy(value.policy) ? { id, type: 'configure', policy: value.policy } : null;
    case 'stats': return { id, type: 'stats' };
    default: return null;
  }
}

function cancelSearch(id: number): void {
  const search = searches.get(id);
  if (search) search.cancelled = true;
}

function cancelAllSearches(): void {
  for (const search of searches.values()) search.cancelled = true;
}

function isDestructive(request: ArchiveWorkerRequest): boolean {
  return request.type === 'wipe' || request.type === 'delete-buffer' || request.type === 'configure';
}

async function handle(request: Exclude<ArchiveWorkerRequest, { type: 'cancel-search' }>): Promise<void> {
  try {
    switch (request.type) {
      case 'put':
        await repository.put(request.records);
        await repository.applyPolicy(request.policy);
        respond({ id: request.id, ok: true, result: null });
        return;
      case 'search': {
        const state = searches.get(request.id);
        if (!state || state.cancelled) {
          respond({ id: request.id, ok: false, error: 'cancelled' });
          return;
        }
        const search = compileArchiveSearch(request.request);
        const hits = search
          ? await repository.searchRecent(search, () => !state.cancelled)
          : [];
        respond(state.cancelled
          ? { id: request.id, ok: false, error: 'cancelled' }
          : { id: request.id, ok: true, result: hits });
        return;
      }
      case 'delete-buffer':
        await repository.deleteBuffer(request.bufferKey);
        respond({ id: request.id, ok: true, result: null });
        return;
      case 'wipe':
        await repository.clear();
        respond({ id: request.id, ok: true, result: null });
        return;
      case 'configure':
        await repository.applyPolicy(request.policy);
        respond({ id: request.id, ok: true, result: null });
        return;
      case 'stats':
        respond({ id: request.id, ok: true, result: await repository.stats() });
        return;
    }
  } catch {
    respond({ id: request.id, ok: false, error: 'storage' });
  } finally {
    if (request.type === 'search') searches.delete(request.id);
  }
}

scope.onmessage = (event: MessageEvent<unknown>) => {
  const request = validatedRequest(event.data);
  if (!request) {
    const id = isRecord(event.data) ? requestId(event.data.id) ?? 0 : 0;
    respond({ id, ok: false, error: 'invalid-request' });
    return;
  }
  if (request.type === 'cancel-search') {
    cancelSearch(request.targetId);
    respond({ id: request.id, ok: true, result: null });
    return;
  }
  if (request.type === 'search') searches.set(request.id, { cancelled: false });
  if (isDestructive(request)) cancelAllSearches();
  operationQueue = operationQueue.then(() => handle(request));
};
