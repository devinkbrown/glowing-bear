import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBIndex, IDBKeyRange } from 'fake-indexeddb';
import { ArchiveRepository } from './repository';
import { normalizeArchiveText } from './record';
import { compileArchiveSearch, searchArchiveRecords } from './search';
import type { ArchiveRecord } from './types';

function record(key: string, timestamp: number, bufferKey = 'buf', sizeBytes = 20): ArchiveRecord {
  return {
    key, bufferKey, bufferName: bufferKey, lineId: key, timestamp, sender: 'alice', text: key,
    normalizedText: key, msgid: '', replyParent: '', hasLink: false, hasFile: false,
    isMention: false, isUnread: false, sizeBytes,
  };
}

let repository: ArchiveRepository;
let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
  Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
  repository = new ArchiveRepository(factory);
});

describe('typed IndexedDB archive repository', () => {
  it('upserts records and reads newest candidates first', async () => {
    await repository.put([record('a', 100), record('b', 300), record('c', 200)]);

    expect((await repository.recent(null, null, 2)).map((item) => item.key)).toEqual(['b', 'c']);
    expect(await repository.stats()).toEqual({
      messages: 3,
      bytes: 60,
      buffers: [{ bufferKey: 'buf', bufferName: 'buf', messages: 3, bytes: 60 }],
    });
  });

  it('applies seven-day retention and can delete one stable buffer', async () => {
    const now = 30 * 86_400_000;
    await repository.put([
      record('old', now - 8 * 86_400_000, 'old-buffer'),
      record('keep-a', now - 6 * 86_400_000, 'a'),
      record('keep-b', now - 1, 'b'),
    ]);

    await repository.applyPolicy({ retention: '7d', maxMiB: 100 }, now);
    expect((await repository.recent(null, null, 10)).map((item) => item.key)).toEqual(['keep-b', 'keep-a']);
    expect(await repository.stats()).toEqual({
      messages: 2,
      bytes: 40,
      buffers: [
        { bufferKey: 'a', bufferName: 'a', messages: 1, bytes: 20 },
        { bufferKey: 'b', bufferName: 'b', messages: 1, bytes: 20 },
      ],
    });

    await repository.deleteBuffer('a');
    expect((await repository.recent(null, null, 10)).map((item) => item.key)).toEqual(['keep-b']);
    expect(await repository.stats()).toEqual({
      messages: 1,
      bytes: 20,
      buffers: [{ bufferKey: 'b', bufferName: 'b', messages: 1, bytes: 20 }],
    });
  });

  it('keeps newest messages within a custom size cap and wipes when disabled', async () => {
    await repository.put([
      record('old', 100, 'buf', 700_000),
      record('new', 200, 'buf', 700_000),
    ]);

    await repository.applyPolicy({ retention: 'custom', maxMiB: 1 });
    expect((await repository.recent(null, null, 10)).map((item) => item.key)).toEqual(['new']);
    expect(await repository.stats()).toEqual({
      messages: 1,
      bytes: 700_000,
      buffers: [{ bufferKey: 'buf', bufferName: 'buf', messages: 1, bytes: 700_000 }],
    });

    await repository.applyPolicy({ retention: 'off', maxMiB: 1 });
    expect(await repository.stats()).toEqual({ messages: 0, bytes: 0, buffers: [] });
  });

  it('uses aggregate bytes without opening a message cursor while custom retention is under budget', async () => {
    await repository.put([record('small', 100, 'buf', 20)]);
    const cursor = vi.spyOn(IDBIndex.prototype, 'openCursor');

    await repository.applyPolicy({ retention: 'custom', maxMiB: 1 });

    expect(cursor).not.toHaveBeenCalled();
    cursor.mockRestore();
  });

  it('keeps one contiguous newest suffix when estimated storage exceeds the custom cap', async () => {
    await repository.put([
      record('old-small', 100, 'buf', 100_000),
      record('middle', 200, 'buf', 400_000),
      record('newest', 300, 'buf', 800_000),
    ]);

    await repository.applyPolicy({ retention: 'custom', maxMiB: 1 });

    expect((await repository.recent(null, null, 10)).map((item) => item.key)).toEqual(['newest']);
    expect(await repository.stats()).toMatchObject({ messages: 1, bytes: 800_000 });
  });

  it('updates total and per-buffer aggregates transactionally across upserts', async () => {
    await repository.put([record('same', 100, 'first', 20)]);
    await repository.put([{
      ...record('same', 200, 'second', 35),
      bufferName: 'Second room',
    }]);

    expect(await repository.stats()).toEqual({
      messages: 1,
      bytes: 35,
      buffers: [{
        bufferKey: 'second',
        bufferName: 'Second room',
        messages: 1,
        bytes: 35,
      }],
    });
    expect((await repository.recent(null, null, 10)).map((item) => item.key)).toEqual(['same']);
  });

  it('normalizes non-finite logical byte input without poisoning aggregates', async () => {
    await repository.put([record('invalid-size', 100, 'buf', Number.POSITIVE_INFINITY)]);
    expect(await repository.stats()).toEqual({
      messages: 1,
      bytes: 0,
      buffers: [{ bufferKey: 'buf', bufferName: 'buf', messages: 1, bytes: 0 }],
    });
    await expect(repository.applyPolicy({ retention: 'custom', maxMiB: 1 })).resolves.toBeUndefined();
  });

  it('scans past non-matches instead of limiting the candidate window', async () => {
    await repository.put([
      record('target', 100),
      record('recent-a', 300),
      record('recent-b', 200),
    ]);

    const hits = await repository.scanRecent(null, null, 1, (item) =>
      item.key === 'target' ? item.key : null,
    );
    expect(hits).toEqual(['target']);
  });

  it('uses the trigram index while preserving mid-word and sender substring matches', async () => {
    const noise = Array.from({ length: 400 }, (_, index) => ({
      ...record(`noise-${index}`, 10_000 + index),
      text: `ordinary message ${index}`,
      normalizedText: `alice ordinary message ${index}`,
    }));
    await repository.put([
      ...noise,
      {
        ...record('target', 100),
        sender: 'ReleaseBear',
        text: 'redeployment completed',
        normalizedText: 'releasebear redeployment completed',
      },
    ]);

    const compiled = compileArchiveSearch({ query: 'deploy', limit: 10 });
    expect(compiled).not.toBeNull();
    let inspected = 0;
    const hits = await repository.searchRecent({
      ...compiled!,
      match(item) {
        inspected += 1;
        return compiled!.match(item);
      },
    });
    expect(hits.map((hit) => hit.key)).toEqual(['target']);
    expect(inspected).toBe(1);

    const sender = compileArchiveSearch({ query: 'from:leaseb' });
    expect((await repository.searchRecent(sender!)).map((hit) => hit.key)).toEqual(['target']);
  });

  it('replaces stale index keys on upsert and exact-scans bounded fallback records', async () => {
    await repository.put([{
      ...record('change', 100),
      text: 'beforetoken',
      normalizedText: 'alice beforetoken',
    }]);
    const before = compileArchiveSearch({ query: 'beforetoken' });
    expect((await repository.searchRecent(before!)).map((hit) => hit.key)).toEqual(['change']);

    await repository.put([{
      ...record('change', 100),
      text: 'aftertoken',
      normalizedText: 'alice aftertoken',
    }]);
    expect(await repository.searchRecent(before!)).toEqual([]);
    const after = compileArchiveSearch({ query: 'aftertoken' });
    expect((await repository.searchRecent(after!)).map((hit) => hit.key)).toEqual(['change']);

    const longPrefix = Array.from({ length: 400 }, (_, index) => String.fromCharCode(0x1000 + index)).join('');
    await repository.put([{
      ...record('fallback', 200),
      text: `${longPrefix} late needle`,
      normalizedText: `alice ${longPrefix} late needle`,
    }]);
    const fallback = compileArchiveSearch({ query: 'late needle' });
    expect((await repository.searchRecent(fallback!)).map((hit) => hit.key)).toEqual(['fallback']);
  });

  it('keeps genuine v1 rows searchable while the bounded v2 backfill runs', async () => {
    factory = new IDBFactory();
    const legacy = {
      ...record('legacy', 100),
      text: 'migrated archive proof',
      normalizedText: 'alice migrated archive proof',
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('darkbear-archive-v1', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('messages', { keyPath: 'key' });
        store.createIndex('byTimestamp', 'timestamp');
        store.createIndex('byBufferTimestamp', ['bufferKey', 'timestamp']);
        store.createIndex('bySender', 'sender');
        store.createIndex('byMsgid', 'msgid');
        store.createIndex('byReplyParent', 'replyParent');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('messages', 'readwrite');
    tx.objectStore('messages').put(legacy);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();

    repository = new ArchiveRepository(factory);
    const search = compileArchiveSearch({ query: 'archive proof' });
    expect((await repository.searchRecent(search!)).map((hit) => hit.key)).toEqual(['legacy']);
    expect(await repository.stats()).toEqual({
      messages: 1,
      bytes: 20,
      buffers: [{ bufferKey: 'buf', bufferName: 'buf', messages: 1, bytes: 20 }],
    });
    await vi.waitFor(async () => {
      const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open('darkbear-archive-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const upgradedRecord = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const request = upgraded.transaction('messages', 'readonly').objectStore('messages').get('legacy');
          request.onsuccess = () => resolve(request.result as Record<string, unknown>);
          request.onerror = () => reject(request.error);
        });
        expect(upgraded.version).toBe(3);
        expect(upgradedRecord.statsVersion).toBe(1);
      } finally {
        upgraded.close();
      }
    });
  });

  it('keeps indexed and full-scan results equivalent across the supported grammar', async () => {
    const corpus: ArchiveRecord[] = [
      { ...record('a', 900, 'ops'), sender: 'Alice', bufferName: '#ops', text: 'redeployment ready', hasLink: true },
      { ...record('b', 800, 'general'), sender: 'Bob', bufferName: '#general', text: 'ＤarkBear   READY', isMention: true },
      { ...record('c', 700, 'ops'), sender: 'Malice', bufferName: '#ops-room', text: 'report.pdf attached', hasFile: true },
      { ...record('d', 600, 'general'), sender: 'Carol', bufferName: '#general', text: 'xy', isUnread: true },
      { ...record('e', 500, 'random'), sender: 'Dan', bufferName: '#random', text: 'ordinary note' },
    ].map((item) => ({
      ...item,
      normalizedText: normalizeArchiveText(`${item.sender} ${item.text}`),
    }));
    await repository.put(corpus);
    const newestFirst = [...corpus].sort((left, right) =>
      right.timestamp - left.timestamp || (left.key < right.key ? 1 : -1),
    );
    const requests = [
      { query: 'deploy' },
      { query: 'lease' },
      { query: 'from:lic in:#ops' },
      { query: '"darkbear ready"' },
      { query: 'has:link' },
      { query: 'has:file in:ops' },
      { query: 'is:mention' },
      { query: 'is:unread' },
      { query: 'xy' },
      { query: 'after:1m ordinary', now: 60_500 },
    ];
    for (const request of requests) {
      const compiled = compileArchiveSearch(request);
      expect(compiled, request.query).not.toBeNull();
      expect(await repository.searchRecent(compiled!), request.query)
        .toEqual(searchArchiveRecords(newestFirst, request));
    }
  });
});
