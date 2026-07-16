// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadOptions, UploadResult } from '@/lib/upload/upload';

interface PendingUpload {
  file: File;
  options: UploadOptions;
  resolve: (result: UploadResult) => void;
  reject: (error: Error) => void;
}

const mocks = vi.hoisted(() => ({ pending: [] as PendingUpload[] }));

vi.mock('@/lib/upload/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/upload/upload')>();
  return {
    ...actual,
    uploadFile: vi.fn((file: File, options: UploadOptions) => new Promise<UploadResult>((resolve, reject) => {
      const pending = { file, options, resolve, reject };
      mocks.pending.push(pending);
      options.signal?.addEventListener('abort', () => reject(new actual.UploadError('Upload was cancelled.', 'cancelled')), { once: true });
    })),
  };
});

vi.mock('@/state/settings', () => ({ settings: { uploadUrl: 'https://media.example/upload' } }));

import {
  cancelUpload,
  completedUploadsForBuffer,
  draftedUploadsForBuffer,
  enqueueUploads,
  markUploadDrafted,
  markUploadInserted,
  messageContainsUploadUrl,
  resetUploads,
  retryUpload,
  uploadQueueState,
} from './uploads';

beforeEach(() => {
  resetUploads();
  mocks.pending.length = 0;
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
    revokeObjectURL: vi.fn(),
  });
});

describe('upload queue', () => {
  it('matches a drafted upload only as an exact URL token', () => {
    const url = 'https://cdn.example/a';

    expect(messageContainsUploadUrl(`please share\n${url}\nwhen ready`, url)).toBe(true);
    expect(messageContainsUploadUrl('https://cdn.example/abc', url)).toBe(false);
    expect(messageContainsUploadUrl(`prefix-${url}`, url)).toBe(false);
  });

  it('runs two files concurrently, tracks progress, and starts the next after completion', async () => {
    const files = ['one', 'two', 'three'].map((name) => new File([name], `${name}.txt`, { type: 'text/plain' }));
    const ids = enqueueUploads(files, 'buffer');
    expect(ids).toHaveLength(3);
    expect(mocks.pending).toHaveLength(2);
    mocks.pending[0]!.options.onProgress?.({ loaded: 1, total: 3, percent: 33 });
    expect(uploadQueueState.items[0]?.progress.percent).toBe(33);

    mocks.pending[0]!.resolve({ url: 'https://cdn.example/one.txt', expiresAt: '2026-07-17T00:00:00.000Z' });
    await vi.waitFor(() => expect(mocks.pending).toHaveLength(3));
    expect(uploadQueueState.items[0]).toMatchObject({
      status: 'complete', attempts: 1, drafted: false, inserted: false,
    });
    expect(uploadQueueState.items[2]?.status).toBe('uploading');

    expect(completedUploadsForBuffer('buffer').map((item) => item.id)).toEqual([ids[0]]);
    markUploadDrafted(ids[0]!);
    expect(completedUploadsForBuffer('buffer')).toEqual([]);
    expect(draftedUploadsForBuffer('buffer').map((item) => item.id)).toEqual([ids[0]]);
    expect(uploadQueueState.items[0]).toMatchObject({ drafted: true, inserted: false });

    markUploadInserted(ids[0]!);
    expect(draftedUploadsForBuffer('buffer')).toEqual([]);
    expect(uploadQueueState.items[0]).toMatchObject({ drafted: true, inserted: true });
  });

  it('cancels in-flight work and retries an error without losing the file', async () => {
    const [id] = enqueueUploads([new File(['hello'], 'note.txt', { type: 'text/plain' })], 'buffer');
    cancelUpload(id!);
    await vi.waitFor(() => expect(uploadQueueState.items[0]?.status).toBe('cancelled'));

    retryUpload(id!);
    await vi.waitFor(() => expect(mocks.pending).toHaveLength(2));
    mocks.pending[1]!.reject(new Error('service unavailable'));
    await vi.waitFor(() => expect(uploadQueueState.items[0]).toMatchObject({ status: 'error', attempts: 2 }));

    retryUpload(id!);
    await vi.waitFor(() => expect(mocks.pending).toHaveLength(3));
    mocks.pending[2]!.resolve({ url: 'https://cdn.example/note.txt' });
    await vi.waitFor(() => expect(uploadQueueState.items[0]?.status).toBe('complete'));
    expect(uploadQueueState.items[0]?.file.name).toBe('note.txt');
  });

  it('retains a visible policy error without starting a request', () => {
    enqueueUploads([new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' })], 'buffer');
    expect(mocks.pending).toEqual([]);
    expect(uploadQueueState.items[0]).toMatchObject({ status: 'error', attempts: 0 });
    expect(uploadQueueState.items[0]?.error).toContain('not allowed');
  });
});
