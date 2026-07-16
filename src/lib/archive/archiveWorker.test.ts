import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompiledArchiveSearch } from './search';
import type {
  ArchivePolicy,
  ArchiveRecord,
  ArchiveSearchHit,
  ArchiveSearchRequest,
  ArchiveStats,
  ArchiveWorkerRequest,
  ArchiveWorkerResponse,
} from './types';

const repository = vi.hoisted(() => ({
  put: vi.fn<(records: ArchiveRecord[]) => Promise<void>>(async () => undefined),
  applyPolicy: vi.fn<(policy: ArchivePolicy) => Promise<void>>(async () => undefined),
  searchRecent: vi.fn<(
    search: CompiledArchiveSearch,
    shouldContinue: () => boolean,
  ) => Promise<ArchiveSearchHit[]>>(async () => []),
  deleteBuffer: vi.fn<(bufferKey: string) => Promise<void>>(async () => undefined),
  clear: vi.fn<() => Promise<void>>(async () => undefined),
  stats: vi.fn<() => Promise<ArchiveStats>>(async () => ({ messages: 0, bytes: 0, buffers: [] })),
}));

const compileArchiveSearch = vi.hoisted(() => vi.fn<(
  request: ArchiveSearchRequest,
) => CompiledArchiveSearch | null>(() => ({
  after: null,
  before: null,
  limit: 100,
  candidateToken: null,
  match: () => null,
})));

vi.mock('./repository', () => ({
  ArchiveRepository: class {
    put = repository.put;
    applyPolicy = repository.applyPolicy;
    searchRecent = repository.searchRecent;
    deleteBuffer = repository.deleteBuffer;
    clear = repository.clear;
    stats = repository.stats;
  },
}));

vi.mock('./search', () => ({ compileArchiveSearch }));

interface WorkerScopeHarness {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: ReturnType<typeof vi.fn<(response: ArchiveWorkerResponse) => void>>;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function loadWorker(): Promise<WorkerScopeHarness> {
  const scope: WorkerScopeHarness = {
    onmessage: null,
    postMessage: vi.fn(),
  };
  vi.stubGlobal('self', scope);
  await import('./archiveWorker');
  if (!scope.onmessage) throw new Error('archive Worker did not install a message handler');
  return scope;
}

function send(scope: WorkerScopeHarness, request: unknown): void {
  scope.onmessage?.({ data: request } as MessageEvent<unknown>);
}

function responses(scope: WorkerScopeHarness): ArchiveWorkerResponse[] {
  return scope.postMessage.mock.calls.map(([response]) => response);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  repository.put.mockResolvedValue(undefined);
  repository.applyPolicy.mockResolvedValue(undefined);
  repository.searchRecent.mockResolvedValue([]);
  repository.deleteBuffer.mockResolvedValue(undefined);
  repository.clear.mockResolvedValue(undefined);
  repository.stats.mockResolvedValue({ messages: 0, bytes: 0, buffers: [] });
});

describe('archive Worker command ordering', () => {
  it('runs normal commands FIFO so a search cannot overtake a prior put policy', async () => {
    const put = deferred<void>();
    repository.put.mockReturnValueOnce(put.promise);
    const scope = await loadWorker();

    send(scope, {
      id: 1,
      type: 'put',
      records: [],
      policy: { retention: '7d', maxMiB: 100 },
    } satisfies ArchiveWorkerRequest);
    send(scope, {
      id: 2,
      type: 'search',
      request: { query: 'deploy' },
    } satisfies ArchiveWorkerRequest);

    await vi.waitFor(() => expect(repository.put).toHaveBeenCalledOnce());
    expect(repository.applyPolicy).not.toHaveBeenCalled();
    expect(repository.searchRecent).not.toHaveBeenCalled();

    put.resolve();
    await vi.waitFor(() => expect(responses(scope).map((response) => response.id)).toEqual([1, 2]));
    expect(repository.applyPolicy).toHaveBeenCalledBefore(repository.searchRecent);
  });

  it('handles cancel-search immediately while its target scan owns the FIFO lane', async () => {
    const search = deferred<[]>();
    let shouldContinue: (() => boolean) | undefined;
    repository.searchRecent.mockImplementationOnce(async (_compiled, continueSearch) => {
      shouldContinue = continueSearch;
      return await search.promise;
    });
    const scope = await loadWorker();

    send(scope, { id: 10, type: 'search', request: { query: 'deploy' } } satisfies ArchiveWorkerRequest);
    await vi.waitFor(() => expect(repository.searchRecent).toHaveBeenCalledOnce());
    expect(shouldContinue?.()).toBe(true);

    send(scope, { id: 11, type: 'cancel-search', targetId: 10 } satisfies ArchiveWorkerRequest);
    expect(shouldContinue?.()).toBe(false);
    expect(responses(scope)).toContainEqual({ id: 11, ok: true, result: null });

    search.resolve([]);
    await vi.waitFor(() => expect(responses(scope)).toContainEqual({
      id: 10,
      ok: false,
      error: 'cancelled',
    }));
  });

  it('cancels active search work immediately before queued destructive work', async () => {
    const search = deferred<[]>();
    let shouldContinue: (() => boolean) | undefined;
    repository.searchRecent.mockImplementationOnce(async (_compiled, continueSearch) => {
      shouldContinue = continueSearch;
      return await search.promise;
    });
    const scope = await loadWorker();

    send(scope, { id: 20, type: 'search', request: { query: 'old' } } satisfies ArchiveWorkerRequest);
    await vi.waitFor(() => expect(repository.searchRecent).toHaveBeenCalledOnce());
    send(scope, { id: 21, type: 'wipe' } satisfies ArchiveWorkerRequest);

    expect(shouldContinue?.()).toBe(false);
    expect(repository.clear).not.toHaveBeenCalled();
    search.resolve([]);
    await vi.waitFor(() => expect(repository.clear).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(responses(scope)).toEqual(expect.arrayContaining([
      { id: 20, ok: false, error: 'cancelled' },
      { id: 21, ok: true, result: null },
    ])));
  });

  it('responds invalid-request for unknown and malformed runtime messages', async () => {
    const scope = await loadWorker();
    send(scope, { id: 30, type: 'not-a-command' });
    send(scope, { id: 31, type: 'search', request: { query: 42 } });
    send(scope, null);

    expect(responses(scope)).toEqual([
      { id: 30, ok: false, error: 'invalid-request' },
      { id: 31, ok: false, error: 'invalid-request' },
      { id: 0, ok: false, error: 'invalid-request' },
    ]);
    expect(repository.searchRecent).not.toHaveBeenCalled();
  });
});
