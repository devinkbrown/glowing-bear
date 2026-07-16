import type { CompiledArchiveSearch } from './search';
import {
  ARCHIVE_UNINDEXED_TOKEN,
  archiveSearchIndexKeys,
  archiveSearchIndexRange,
} from './searchIndex';
import type { ArchivePolicy, ArchiveRecord, ArchiveSearchHit, ArchiveStats } from './types';

const DB_NAME = 'darkbear-archive-v1';
const DB_VERSION = 3;
const STORE = 'messages';
const SEARCH_INDEX = 'bySearchIndexKey';
const META_STORE = 'metadata';
const STATS_STORE = 'archiveStats';
const SEARCH_META_KEY = 'search-index-v1';
const STATS_STATE_KEY = 'state';
const STATS_TOTAL_KEY = 'total';
const BACKFILL_BATCH = 250;
const INDEX_ENTRY_OVERHEAD_BYTES = 64;
const RECORD_OVERHEAD_BYTES = 256;
const utf8 = new TextEncoder();

interface StoredArchiveRecord extends ArchiveRecord {
  searchIndexKeys: string[];
  statsVersion?: 1;
  storageBytes?: number;
}

interface SearchIndexMetadata {
  key: typeof SEARCH_META_KEY;
  complete: boolean;
  cursorKey?: IDBValidKey;
}

interface StatsState {
  key: typeof STATS_STATE_KEY;
  complete: boolean;
  cursorKey?: IDBValidKey;
}

interface StatsTotal {
  key: typeof STATS_TOTAL_KEY;
  messages: number;
  bytes: number;
  storageBytes: number;
}

interface StatsBuffer {
  key: string;
  kind: 'buffer';
  bufferKey: string;
  bufferName: string;
  messages: number;
  bytes: number;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

function recordBytes(record: ArchiveRecord): number {
  const value = Number(record.sizeBytes);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function estimatedStorageBytes(record: ArchiveRecord, indexKeys?: readonly string[]): number {
  const stored = (record as StoredArchiveRecord).storageBytes;
  if (Number.isSafeInteger(stored) && Number(stored) >= 0) return Number(stored);
  const keys = indexKeys ?? (record as StoredArchiveRecord).searchIndexKeys
    ?? archiveSearchIndexKeys(record);
  const derivedText = [
    record.key,
    record.bufferName,
    record.lineId,
    record.normalizedText,
    record.msgid,
    record.replyParent,
  ].reduce((bytes, value) => bytes + utf8.encode(value).byteLength, 0);
  const indexBytes = keys.reduce(
    (bytes, key) => bytes + utf8.encode(key).byteLength + INDEX_ENTRY_OVERHEAD_BYTES,
    0,
  );
  return recordBytes(record) + derivedText + indexBytes + RECORD_OVERHEAD_BYTES;
}

function statsBufferKey(bufferKey: string): string {
  return `buffer:${bufferKey}`;
}

export class ArchiveRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private backfillPromise: Promise<void> | null = null;
  private statsBackfillPromise: Promise<void> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    let blocked = false;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE)
          ? request.transaction!.objectStore(STORE)
          : db.createObjectStore(STORE, { keyPath: 'key' });
        if (!store.indexNames.contains('byTimestamp')) store.createIndex('byTimestamp', 'timestamp');
        if (!store.indexNames.contains('byBufferTimestamp')) {
          store.createIndex('byBufferTimestamp', ['bufferKey', 'timestamp']);
        }
        if (!store.indexNames.contains('bySender')) store.createIndex('bySender', 'sender');
        if (!store.indexNames.contains('byMsgid')) store.createIndex('byMsgid', 'msgid');
        if (!store.indexNames.contains('byReplyParent')) store.createIndex('byReplyParent', 'replyParent');
        if (!store.indexNames.contains(SEARCH_INDEX)) {
          store.createIndex(SEARCH_INDEX, 'searchIndexKeys', { multiEntry: true });
        }
        const metadata = db.objectStoreNames.contains(META_STORE)
          ? request.transaction!.objectStore(META_STORE)
          : db.createObjectStore(META_STORE, { keyPath: 'key' });
        if (event.oldVersion < 2) {
          metadata.put({
            key: SEARCH_META_KEY,
            complete: event.oldVersion === 0,
          } satisfies SearchIndexMetadata);
        }
        const stats = db.objectStoreNames.contains(STATS_STORE)
          ? request.transaction!.objectStore(STATS_STORE)
          : db.createObjectStore(STATS_STORE, { keyPath: 'key' });
        if (event.oldVersion < 3) {
          stats.put({
            key: STATS_STATE_KEY,
            complete: event.oldVersion === 0,
          } satisfies StatsState);
          stats.put({
            key: STATS_TOTAL_KEY,
            messages: 0,
            bytes: 0,
            storageBytes: 0,
          } satisfies StatsTotal);
        }
      };
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();
          return;
        }
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          if (this.dbPromise === opening) this.dbPromise = null;
        };
        resolve(db);
        this.startSearchIndexBackfill();
        this.startStatsBackfill();
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      request.onblocked = () => {
        blocked = true;
        reject(new Error('IndexedDB open blocked'));
      };
    });
    this.dbPromise = opening;
    void opening.catch(() => {
      if (this.dbPromise === opening) this.dbPromise = null;
    });
    return opening;
  }

  private startSearchIndexBackfill(): void {
    if (this.backfillPromise) return;
    const running = this.backfillSearchIndex();
    this.backfillPromise = running;
    void running.finally(() => {
      if (this.backfillPromise === running) this.backfillPromise = null;
    }).catch(() => undefined);
  }

  private async backfillSearchIndex(): Promise<void> {
    const db = await this.open();
    while (true) {
      const tx = db.transaction([STORE, META_STORE], 'readwrite');
      const done = transactionDone(tx);
      const store = tx.objectStore(STORE);
      const metadataStore = tx.objectStore(META_STORE);
      const metadata = await requestResult(metadataStore.get(SEARCH_META_KEY)) as SearchIndexMetadata | undefined;
      if (metadata?.complete !== false) {
        await done;
        return;
      }
      let count = 0;
      let lastKey = metadata.cursorKey;
      let exhausted = false;
      await new Promise<void>((resolve, reject) => {
        const request = store.openCursor(
          lastKey === undefined ? undefined : IDBKeyRange.lowerBound(lastKey, true),
        );
        request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            exhausted = true;
            resolve();
            return;
          }
          if (count >= BACKFILL_BATCH) {
            resolve();
            return;
          }
          const record = cursor.value as ArchiveRecord;
          cursor.update({ ...record, searchIndexKeys: archiveSearchIndexKeys(record) });
          lastKey = cursor.primaryKey;
          count += 1;
          cursor.continue();
        };
      });
      metadataStore.put({
        key: SEARCH_META_KEY,
        complete: exhausted,
        ...(exhausted || lastKey === undefined ? {} : { cursorKey: lastKey }),
      } satisfies SearchIndexMetadata);
      await done;
      if (exhausted) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  private async searchIndexIsComplete(): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction(META_STORE, 'readonly');
    const done = transactionDone(tx);
    const metadata = await requestResult(tx.objectStore(META_STORE).get(SEARCH_META_KEY)) as
      SearchIndexMetadata | undefined;
    await done;
    return metadata?.complete === true;
  }

  private startStatsBackfill(): void {
    if (this.statsBackfillPromise) return;
    const running = this.backfillStats();
    this.statsBackfillPromise = running;
    void running.finally(() => {
      if (this.statsBackfillPromise === running) this.statsBackfillPromise = null;
    }).catch(() => undefined);
  }

  private async adjustStats(
    store: IDBObjectStore,
    record: ArchiveRecord,
    direction: 1 | -1,
  ): Promise<void> {
    const bytes = recordBytes(record);
    const storageBytes = estimatedStorageBytes(record);
    const total = (await requestResult(store.get(STATS_TOTAL_KEY)) as StatsTotal | undefined)
      ?? { key: STATS_TOTAL_KEY, messages: 0, bytes: 0, storageBytes: 0 };
    const totalMessages = total.messages + direction;
    const totalBytes = total.bytes + direction * bytes;
    const totalStorageBytes = total.storageBytes + direction * storageBytes;
    if (!Number.isSafeInteger(totalMessages) || totalMessages < 0
      || !Number.isSafeInteger(totalBytes) || totalBytes < 0
      || !Number.isSafeInteger(totalStorageBytes) || totalStorageBytes < 0) {
      throw new Error('archive aggregate invariant violated');
    }
    await requestResult(store.put({
      ...total,
      messages: totalMessages,
      bytes: totalBytes,
      storageBytes: totalStorageBytes,
    } satisfies StatsTotal));

    const key = statsBufferKey(record.bufferKey);
    const buffer = (await requestResult(store.get(key)) as StatsBuffer | undefined) ?? {
      key,
      kind: 'buffer',
      bufferKey: record.bufferKey,
      bufferName: record.bufferName,
      messages: 0,
      bytes: 0,
    };
    const messages = buffer.messages + direction;
    const nextBytes = buffer.bytes + direction * bytes;
    if (!Number.isSafeInteger(messages) || messages < 0
      || !Number.isSafeInteger(nextBytes) || nextBytes < 0) {
      throw new Error('archive buffer aggregate invariant violated');
    }
    if (messages === 0) await requestResult(store.delete(key));
    else {
      await requestResult(store.put({
        ...buffer,
        bufferName: direction === 1 ? record.bufferName : buffer.bufferName,
        messages,
        bytes: nextBytes,
      } satisfies StatsBuffer));
    }
  }

  private async backfillStats(): Promise<void> {
    const db = await this.open();
    while (true) {
      const tx = db.transaction([STORE, STATS_STORE], 'readwrite');
      const done = transactionDone(tx);
      const messages = tx.objectStore(STORE);
      const stats = tx.objectStore(STATS_STORE);
      const state = await requestResult(stats.get(STATS_STATE_KEY)) as StatsState | undefined;
      if (state?.complete !== false) {
        await done;
        return;
      }
      let count = 0;
      let lastKey = state.cursorKey;
      let exhausted = false;
      await new Promise<void>((resolve, reject) => {
        const request = messages.openCursor(
          lastKey === undefined ? undefined : IDBKeyRange.lowerBound(lastKey, true),
        );
        request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            exhausted = true;
            resolve();
            return;
          }
          if (count >= BACKFILL_BATCH) {
            resolve();
            return;
          }
          void (async () => {
            const record = cursor.value as StoredArchiveRecord;
            if (record.statsVersion !== 1) {
              const storageBytes = estimatedStorageBytes(record);
              const indexed = { ...record, storageBytes, statsVersion: 1 } satisfies StoredArchiveRecord;
              await this.adjustStats(stats, indexed, 1);
              await requestResult(cursor.update(indexed));
            }
            lastKey = cursor.primaryKey;
            count += 1;
            cursor.continue();
          })().catch(reject);
        };
      });
      await requestResult(stats.put({
        key: STATS_STATE_KEY,
        complete: exhausted,
        ...(exhausted || lastKey === undefined ? {} : { cursorKey: lastKey }),
      } satisfies StatsState));
      await done;
      if (exhausted) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  private async statsState(): Promise<StatsState | undefined> {
    const db = await this.open();
    const tx = db.transaction(STATS_STORE, 'readonly');
    const done = transactionDone(tx);
    const state = await requestResult(tx.objectStore(STATS_STORE).get(STATS_STATE_KEY)) as
      StatsState | undefined;
    await done;
    return state;
  }

  async put(records: ArchiveRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = await this.open();
    const tx = db.transaction([STORE, STATS_STORE], 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(STORE);
    const stats = tx.objectStore(STATS_STORE);
    for (const record of records) {
      const existing = await requestResult(store.get(record.key)) as StoredArchiveRecord | undefined;
      if (existing?.statsVersion === 1) await this.adjustStats(stats, existing, -1);
      const searchIndexKeys = archiveSearchIndexKeys(record);
      const storageBytes = estimatedStorageBytes(record, searchIndexKeys);
      const stored = { ...record, searchIndexKeys, storageBytes, statsVersion: 1 } satisfies StoredArchiveRecord;
      await this.adjustStats(stats, stored, 1);
      await requestResult(store.put({
        ...stored,
      }));
    }
    await done;
    this.startSearchIndexBackfill();
    this.startStatsBackfill();
  }

  async recent(after: number | null, before: number | null, limit: number): Promise<ArchiveRecord[]> {
    return await this.scanRecent(after, before, limit, (record) => record);
  }

  /** Scan newest-first until enough matching projections are found. */
  async scanRecent<T>(
    after: number | null,
    before: number | null,
    limit: number,
    select: (record: ArchiveRecord) => T | null,
    shouldContinue: () => boolean = () => true,
  ): Promise<T[]> {
    const lower = after ?? 0;
    const upper = before === null ? Number.MAX_SAFE_INTEGER : Math.max(0, before - 1);
    if (upper < lower || limit <= 0) return [];
    const db = await this.open();
    const tx = db.transaction(STORE, 'readonly');
    const done = transactionDone(tx);
    const index = tx.objectStore(STORE).index('byTimestamp');
    const range = IDBKeyRange.bound(lower, upper);
    const out: T[] = [];
    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(range, 'prev');
      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || out.length >= limit || !shouldContinue()) {
          resolve();
          return;
        }
        const selected = select(cursor.value as ArchiveRecord);
        if (selected !== null) out.push(selected);
        cursor.continue();
      };
    });
    await done;
    return out;
  }

  async searchRecent(
    search: CompiledArchiveSearch,
    shouldContinue: () => boolean = () => true,
  ): Promise<ArchiveSearchHit[]> {
    if (search.candidateToken === null || !await this.searchIndexIsComplete()) {
      this.startSearchIndexBackfill();
      return await this.scanRecent(
        search.after,
        search.before,
        search.limit,
        search.match,
        shouldContinue,
      );
    }
    const indexed = await this.scanSearchIndex(
      search.candidateToken,
      search,
      shouldContinue,
    );
    const fallback = shouldContinue()
      ? await this.scanSearchIndex(ARCHIVE_UNINDEXED_TOKEN, search, shouldContinue)
      : [];
    return [...indexed, ...fallback]
      .sort((left, right) => right.timestamp - left.timestamp || (
        left.key < right.key ? 1 : left.key > right.key ? -1 : 0
      ))
      .slice(0, search.limit);
  }

  private async scanSearchIndex(
    token: string,
    search: CompiledArchiveSearch,
    shouldContinue: () => boolean,
  ): Promise<ArchiveSearchHit[]> {
    const range = archiveSearchIndexRange(token, search.after, search.before);
    if (range === null || search.limit <= 0 || !shouldContinue()) return [];
    const db = await this.open();
    const tx = db.transaction(STORE, 'readonly');
    const done = transactionDone(tx);
    const index = tx.objectStore(STORE).index(SEARCH_INDEX);
    const out: ArchiveSearchHit[] = [];
    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(range, 'prev');
      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || out.length >= search.limit || !shouldContinue()) {
          resolve();
          return;
        }
        const selected = search.match(cursor.value as ArchiveRecord);
        if (selected !== null) out.push(selected);
        cursor.continue();
      };
    });
    await done;
    return out;
  }

  async deleteBuffer(bufferKey: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE, STATS_STORE], 'readwrite');
    const done = transactionDone(tx);
    const index = tx.objectStore(STORE).index('byBufferTimestamp');
    const range = IDBKeyRange.bound([bufferKey, 0], [bufferKey, Number.MAX_SAFE_INTEGER]);
    await this.deleteCursor(index.openCursor(range), tx.objectStore(STATS_STORE));
    await done;
  }

  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE, STATS_STORE], 'readwrite');
    const done = transactionDone(tx);
    await requestResult(tx.objectStore(STORE).clear());
    const stats = tx.objectStore(STATS_STORE);
    await requestResult(stats.clear());
    await requestResult(stats.put({ key: STATS_STATE_KEY, complete: true } satisfies StatsState));
    await requestResult(stats.put({
      key: STATS_TOTAL_KEY,
      messages: 0,
      bytes: 0,
      storageBytes: 0,
    } satisfies StatsTotal));
    await done;
  }

  async applyPolicy(policy: ArchivePolicy, now = Date.now()): Promise<void> {
    if (policy.retention === 'off') {
      await this.clear();
      return;
    }
    if (policy.retention === '7d' || policy.retention === '30d') {
      const days = policy.retention === '7d' ? 7 : 30;
      await this.deleteBefore(now - days * 86_400_000);
      return;
    }
    await this.trimToBytes(Math.max(1, policy.maxMiB) * 1024 * 1024);
  }

  async stats(): Promise<ArchiveStats> {
    const db = await this.open();
    const aggregateTx = db.transaction([STATS_STORE, STORE], 'readonly');
    const aggregateDone = transactionDone(aggregateTx);
    const aggregateStore = aggregateTx.objectStore(STATS_STORE);
    const state = await requestResult(aggregateStore.get(STATS_STATE_KEY)) as StatsState | undefined;
    if (state?.complete === true) {
      const total = (await requestResult(aggregateStore.get(STATS_TOTAL_KEY)) as StatsTotal | undefined)
        ?? { key: STATS_TOTAL_KEY, messages: 0, bytes: 0, storageBytes: 0 };
      const rows = await requestResult(aggregateStore.getAll()) as Array<StatsState | StatsTotal | StatsBuffer>;
      const bufferIndex = aggregateTx.objectStore(STORE).index('byBufferTimestamp');
      const buffers = [];
      for (const row of rows) {
        if (!('kind' in row) || row.kind !== 'buffer') continue;
        const range = IDBKeyRange.bound(
          [row.bufferKey, 0],
          [row.bufferKey, Number.MAX_SAFE_INTEGER],
        );
        const newest = await requestResult(bufferIndex.openCursor(range, 'prev'));
        buffers.push({
          bufferKey: row.bufferKey,
          bufferName: (newest?.value as ArchiveRecord | undefined)?.bufferName ?? row.bufferName,
          messages: row.messages,
          bytes: row.bytes,
        });
      }
      await aggregateDone;
      return {
        messages: total.messages,
        bytes: total.bytes,
        buffers: buffers.sort((left, right) => left.bufferName.localeCompare(right.bufferName)),
      };
    }
    await aggregateDone;
    this.startStatsBackfill();
    return await this.scanStats();
  }

  private async scanStats(): Promise<ArchiveStats> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readonly');
    const done = transactionDone(tx);
    const store = tx.objectStore(STORE);
    const messages = await requestResult(store.count());
    let bytes = 0;
    const buffers = new Map<string, { bufferKey: string; bufferName: string; messages: number; bytes: number }>();
    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor();
      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const record = cursor.value as ArchiveRecord;
        const bytesForRecord = recordBytes(record);
        bytes += bytesForRecord;
        const buffer = buffers.get(record.bufferKey) ?? {
          bufferKey: record.bufferKey,
          bufferName: record.bufferName,
          messages: 0,
          bytes: 0,
        };
        buffer.messages += 1;
        buffer.bytes += bytesForRecord;
        buffers.set(record.bufferKey, buffer);
        cursor.continue();
      };
    });
    await done;
    return {
      messages,
      bytes,
      buffers: [...buffers.values()].sort((a, b) => a.bufferName.localeCompare(b.bufferName)),
    };
  }

  private async deleteBefore(cutoff: number): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE, STATS_STORE], 'readwrite');
    const done = transactionDone(tx);
    const index = tx.objectStore(STORE).index('byTimestamp');
    await this.deleteCursor(
      index.openCursor(IDBKeyRange.upperBound(cutoff, true)),
      tx.objectStore(STATS_STORE),
    );
    await done;
  }

  private async trimToBytes(maxBytes: number): Promise<void> {
    const state = await this.statsState();
    if (state?.complete === true) {
      await this.trimUsingStats(maxBytes);
      return;
    }
    this.startStatsBackfill();
    await this.trimByFullScan(maxBytes);
  }

  private async trimUsingStats(maxBytes: number): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE, STATS_STORE], 'readwrite');
    const done = transactionDone(tx);
    const index = tx.objectStore(STORE).index('byTimestamp');
    const stats = tx.objectStore(STATS_STORE);
    const total = (await requestResult(stats.get(STATS_TOTAL_KEY)) as StatsTotal | undefined)
      ?? { key: STATS_TOTAL_KEY, messages: 0, bytes: 0, storageBytes: 0 };
    let remainingBytes = total.storageBytes;
    if (remainingBytes <= maxBytes) {
      await done;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor();
      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || remainingBytes <= maxBytes) {
          resolve();
          return;
        }
        void (async () => {
          const record = cursor.value as StoredArchiveRecord;
          remainingBytes = Math.max(0, remainingBytes - estimatedStorageBytes(record));
          if (record.statsVersion === 1) await this.adjustStats(stats, record, -1);
          await requestResult(cursor.delete());
          cursor.continue();
        })().catch(reject);
      };
    });
    await done;
  }

  private async trimByFullScan(maxBytes: number): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE, STATS_STORE], 'readwrite');
    const done = transactionDone(tx);
    const index = tx.objectStore(STORE).index('byTimestamp');
    const stats = tx.objectStore(STATS_STORE);
    let totalBytes = 0;
    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor();
      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          if (totalBytes <= maxBytes) {
            resolve();
            return;
          }
          const deletion = index.openCursor();
          deletion.onerror = () => reject(deletion.error ?? new Error('IndexedDB cursor failed'));
          deletion.onsuccess = () => {
            const oldest = deletion.result;
            if (!oldest || totalBytes <= maxBytes) {
              resolve();
              return;
            }
            void (async () => {
              const record = oldest.value as StoredArchiveRecord;
              totalBytes = Math.max(0, totalBytes - estimatedStorageBytes(record));
              if (record.statsVersion === 1) await this.adjustStats(stats, record, -1);
              await requestResult(oldest.delete());
              oldest.continue();
            })().catch(reject);
          };
          return;
        }
        totalBytes += estimatedStorageBytes(cursor.value as ArchiveRecord);
        cursor.continue();
      };
    });
    await done;
  }

  private async deleteCursor(
    request: IDBRequest<IDBCursorWithValue | null>,
    stats: IDBObjectStore,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        void (async () => {
          const record = cursor.value as StoredArchiveRecord;
          if (record.statsVersion === 1) await this.adjustStats(stats, record, -1);
          await requestResult(cursor.delete());
          cursor.continue();
        })().catch(reject);
      };
    });
  }
}
