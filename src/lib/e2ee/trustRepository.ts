import { fromB64url } from './dmCipher';

const DB_NAME = 'darkbear-trust';
const DB_VERSION = 1;
const STORE = 'dm-peers';

export interface DmTrustRecord {
  id: string;
  scope: string;
  peer: string;
  publicKey: string;
  fingerprint: string;
  verifiedAt: number;
}

function recordId(scope: string, peer: string): string {
  return `${scope}\n${peer.toLowerCase()}`;
}

function validRecord(value: unknown): value is DmTrustRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.scope === 'string' &&
    typeof record.peer === 'string' && typeof record.publicKey === 'string' &&
    typeof record.fingerprint === 'string' && typeof record.verifiedAt === 'number' &&
    Number.isSafeInteger(record.verifiedAt) && record.verifiedAt > 0;
}

/** Full SHA-256 fingerprint of a raw P-256 public key, grouped for comparison. */
export async function fingerprintDmKey(publicKey: string): Promise<string | null> {
  try {
    const raw = fromB64url(publicKey);
    if (!raw || raw.length !== 65 || raw[0] !== 0x04) return null;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw.slice().buffer as ArrayBuffer));
    const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    return hex.match(/.{1,4}/g)?.join(' ') ?? null;
  } catch {
    return null;
  }
}

/** Small typed persistence boundary for locally verified peer device keys. */
export class DmTrustRepository {
  constructor(
    private readonly factory: IDBFactory | null =
      typeof indexedDB === 'undefined' ? null : indexedDB,
  ) {}

  async get(scope: string, peer: string): Promise<DmTrustRecord | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(recordId(scope, peer));
      request.onsuccess = () => resolve(validRecord(request.result) ? request.result : null);
      request.onerror = () => resolve(null);
    });
  }

  async put(record: Omit<DmTrustRecord, 'id' | 'peer'> & { peer: string }): Promise<boolean> {
    const db = await this.open();
    if (!db) return false;
    const value: DmTrustRecord = {
      ...record,
      peer: record.peer.toLowerCase(),
      id: recordId(record.scope, record.peer),
    };
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }

  async delete(scope: string, peer: string): Promise<boolean> {
    const db = await this.open();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(recordId(scope, peer));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }

  private open(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      if (!this.factory) return resolve(null);
      try {
        const request = this.factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) {
            request.result.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
}

export const dmTrustRepository = new DmTrustRepository();
