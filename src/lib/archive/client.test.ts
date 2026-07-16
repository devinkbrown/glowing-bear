import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveWorkerRequest, ArchiveWorkerResponse } from './types';

class WorkerHarness {
  static instances: WorkerHarness[] = [];

  onmessage: ((event: MessageEvent<ArchiveWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly messages: ArchiveWorkerRequest[] = [];
  terminated = false;

  constructor() {
    WorkerHarness.instances.push(this);
  }

  postMessage(message: ArchiveWorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: ArchiveWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<ArchiveWorkerResponse>);
  }
}

beforeEach(() => {
  vi.resetModules();
  WorkerHarness.instances = [];
  vi.stubGlobal('Worker', WorkerHarness);
  vi.stubGlobal('indexedDB', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('archive Worker client cancellation', () => {
  it('rejects an already-aborted search without starting a Worker', async () => {
    const { searchArchive } = await import('./client');
    const controller = new AbortController();
    controller.abort();

    await expect(searchArchive({ query: 'deploy' }, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(WorkerHarness.instances).toHaveLength(0);
  });

  it('cancels an in-flight search by target request id and ignores its late response', async () => {
    const { searchArchive } = await import('./client');
    const controller = new AbortController();
    const result = searchArchive({ query: 'deploy', limit: 20 }, controller.signal);
    const worker = WorkerHarness.instances[0]!;
    const search = worker.messages[0];
    expect(search).toMatchObject({ type: 'search', request: { query: 'deploy', limit: 20 } });

    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.messages[1]).toMatchObject({
      type: 'cancel-search',
      targetId: search?.id,
    });

    worker.respond({ id: search!.id, ok: false, error: 'cancelled' });
    expect(worker.terminated).toBe(false);
  });

  it('rejects pending work on message decode failure and recreates the Worker', async () => {
    const { searchArchive } = await import('./client');
    const first = searchArchive({ query: 'first' });
    const failedWorker = WorkerHarness.instances[0]!;
    failedWorker.onmessageerror?.({ data: null } as MessageEvent);

    await expect(first).rejects.toThrow('Local archive worker message failed');
    expect(failedWorker.terminated).toBe(true);

    const second = searchArchive({ query: 'second' });
    const replacement = WorkerHarness.instances[1]!;
    const request = replacement.messages[0]!;
    replacement.respond({ id: request.id, ok: true, result: [] });
    await expect(second).resolves.toEqual([]);
  });

  it('rejects malformed responses without letting stale Worker errors kill its replacement', async () => {
    const { searchArchive } = await import('./client');
    const first = searchArchive({ query: 'first' });
    const stale = WorkerHarness.instances[0]!;
    stale.onmessage?.({ data: {} } as MessageEvent<ArchiveWorkerResponse>);
    await expect(first).rejects.toThrow('Local archive worker protocol failed');
    expect(stale.terminated).toBe(true);

    const second = searchArchive({ query: 'second' });
    const replacement = WorkerHarness.instances[1]!;
    stale.onerror?.({} as ErrorEvent);
    expect(replacement.terminated).toBe(false);
    const request = replacement.messages[0]!;
    replacement.respond({ id: request.id, ok: true, result: [] });
    await expect(second).resolves.toEqual([]);
  });
});
