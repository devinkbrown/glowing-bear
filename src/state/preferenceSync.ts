import { createEffect, createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';
import {
  PREFERENCE_MANIFEST_KEY,
  PREFERENCE_METADATA_PREFIX,
  createPreferenceDocument,
  decodePreferenceMetadata,
  encodePreferenceMetadata,
  isPreferenceMetadataKey,
  mergePreferenceDocuments,
  parsePreferenceDocument,
  preferenceDocumentsEqual,
  stalePreferenceMetadataKeys,
  updatePreferenceDocument,
  type PreferenceDocument,
  type PreferenceValues,
} from '@/lib/preferences/sync';
import { applyBufferPreferences, exportBufferPreferences } from './buffers';
import { applyPreferenceSettings, preferenceSettingsSnapshot } from './settings';
import { applyReadState, exportReadState } from './threads';

const DOCUMENT_STORAGE_KEY = 'darkbear_preference_sync_v1';
const DEVICE_STORAGE_KEY = 'darkbear_device_id_v1';
const PUBLISH_DEBOUNCE_MS = 750;

export type PreferenceSyncStatus =
  | 'local-only'
  | 'checking'
  | 'pending'
  | 'synced'
  | 'error';

interface PreferenceSyncState {
  available: boolean;
  status: PreferenceSyncStatus;
  lastSyncedAt: number | null;
  detail: string;
}

const [preferenceSyncState, setPreferenceSyncState] = createStore<PreferenceSyncState>({
  available: false,
  status: 'local-only',
  lastSyncedAt: null,
  detail: 'Connect an Orochi account to sync non-secret preferences.',
});

export { preferenceSyncState };

export interface PreferenceSyncTransport {
  ready(): boolean;
  supported(): boolean;
  list(): boolean;
  set(key: string, value: string): boolean;
  clear(key: string): boolean;
}

let transport: PreferenceSyncTransport | null = null;
let initialized = false;
let disposeReactive: (() => void) | null = null;
let bootstrapped = false;
let applyingRemote = false;
let collecting = false;
let collected = new Map<string, string>();
let document: PreferenceDocument | null = loadDocument();
let publishTimer: ReturnType<typeof setTimeout> | null = null;
let remotePartCounts = { buffers: 0, read: 0 };

function storageGet(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, value); } catch { /* local state remains usable */ }
}

function storageRemove(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(key); } catch { /* ignore unavailable storage */ }
}

function deviceId(): string {
  const saved = storageGet(DEVICE_STORAGE_KEY);
  if (saved && /^[a-f0-9]{32}$/.test(saved)) return saved;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const created = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  storageSet(DEVICE_STORAGE_KEY, created);
  return created;
}

function loadDocument(): PreferenceDocument | null {
  const raw = storageGet(DOCUMENT_STORAGE_KEY);
  return raw ? parsePreferenceDocument(raw) : null;
}

function persistDocument(value: PreferenceDocument): void {
  storageSet(DOCUMENT_STORAGE_KEY, JSON.stringify(value));
}

function reportPreferenceError(error: unknown): void {
  setPreferenceSyncState({
    status: 'error',
    detail: error instanceof Error ? error.message : 'Preferences could not be synchronized.',
  });
}

function snapshot(): PreferenceValues {
  const selected = preferenceSettingsSnapshot();
  return {
    ...selected,
    buffers: exportBufferPreferences(),
    read: exportReadState(),
  };
}

function applyDocument(value: PreferenceDocument): void {
  applyingRemote = true;
  try {
    applyPreferenceSettings({
      appearance: value.appearance.value,
      accessibility: value.accessibility.value,
      notifications: value.notifications.value,
    });
    applyBufferPreferences(value.buffers.value);
    applyReadState(value.read.value);
  } finally {
    applyingRemote = false;
  }
}

function ensureDocument(): PreferenceDocument {
  if (!document) {
    // A zero-stamped seed loses to any established remote document, but becomes
    // the initial remote value when the account has never synced before.
    document = createPreferenceDocument(snapshot(), deviceId());
    persistDocument(document);
  }
  return document;
}

function partCount(entries: readonly { key: string }[], kind: 'b' | 'r'): number {
  return entries.filter((entry) => entry.key.startsWith(`${PREFERENCE_METADATA_PREFIX}.${kind}.`)).length;
}

function listedPartCount(entries: ReadonlyMap<string, string>, kind: 'b' | 'r'): number {
  let max = 0;
  const prefix = `${PREFERENCE_METADATA_PREFIX}.${kind}.`;
  for (const key of entries.keys()) {
    if (!key.startsWith(prefix)) continue;
    const index = Number.parseInt(key.slice(prefix.length), 36);
    if (Number.isInteger(index) && index >= 0) max = Math.max(max, index + 1);
  }
  return max;
}

function publish(value: PreferenceDocument): void {
  if (!bootstrapped || !transport?.ready() || !transport.supported()) return;
  let encoded;
  try {
    encoded = encodePreferenceMetadata(value);
  } catch (error) {
    setPreferenceSyncState({
      status: 'error',
      detail: error instanceof Error ? error.message : 'Preference payload could not be encoded.',
    });
    return;
  }
  const nextCounts = {
    buffers: partCount(encoded, 'b'),
    read: partCount(encoded, 'r'),
  };
  setPreferenceSyncState({ status: 'pending', detail: 'Publishing account preferences…' });
  // encodePreferenceMetadata deliberately places the manifest last. Parts from
  // a new generation can therefore never become visible as a complete snapshot
  // until every value they reference has been sent.
  for (const entry of encoded) {
    if (!transport.set(entry.key, entry.value)) {
      setPreferenceSyncState({
        status: 'pending',
        detail: 'Publishing was interrupted; preferences remain pending for retry.',
      });
      schedulePublish();
      return;
    }
  }
  for (const key of stalePreferenceMetadataKeys(remotePartCounts.buffers, nextCounts.buffers, 'b')) {
    if (!transport.clear(key)) {
      setPreferenceSyncState({
        status: 'pending',
        detail: 'Publishing was interrupted; preferences remain pending for retry.',
      });
      schedulePublish();
      return;
    }
  }
  for (const key of stalePreferenceMetadataKeys(remotePartCounts.read, nextCounts.read, 'r')) {
    if (!transport.clear(key)) {
      setPreferenceSyncState({
        status: 'pending',
        detail: 'Publishing was interrupted; preferences remain pending for retry.',
      });
      schedulePublish();
      return;
    }
  }
  remotePartCounts = nextCounts;
  setPreferenceSyncState({
    status: 'synced',
    lastSyncedAt: Date.now(),
    detail: 'Non-secret preferences are current on this account.',
  });
}

function schedulePublish(): void {
  if (!bootstrapped) return;
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = setTimeout(() => {
    publishTimer = null;
    if (document) publish(document);
  }, PUBLISH_DEBOUNCE_MS);
}

/** Install the controller transport. The socket lifecycle still owns readiness. */
export function _setPreferenceSyncTransport(value: PreferenceSyncTransport | null): void {
  transport = value;
}

/** Start reactive local-change capture inside the caller's Solid owner. */
export function initPreferenceSync(): void {
  if (initialized) return;
  initialized = true;
  try { ensureDocument(); } catch (error) { reportPreferenceError(error); }
  createRoot((dispose) => {
    disposeReactive = dispose;
    createEffect(() => {
      const current = snapshot();
      if (applyingRemote) return;
      let updated: ReturnType<typeof updatePreferenceDocument>;
      try {
        const local = ensureDocument();
        updated = updatePreferenceDocument(local, current, deviceId(), Date.now());
      } catch (error) {
        reportPreferenceError(error);
        return;
      }
      if (!updated.changed) return;
      document = updated.document;
      persistDocument(document);
      schedulePublish();
    });
  });
}

/** Called after 001, once capability negotiation is complete. */
export function _preferenceTransportReady(supported: boolean): void {
  if (!supported || !transport?.ready()) {
    bootstrapped = false;
    collecting = false;
    setPreferenceSyncState({
      available: false,
      status: 'local-only',
      detail: 'This connection does not offer Orochi account preference metadata.',
    });
    return;
  }
  setPreferenceSyncState({ available: true });
  syncPreferencesNow();
}

export function _preferenceTransportUnavailable(): void {
  bootstrapped = false;
  collecting = false;
  collected.clear();
  if (publishTimer) {
    clearTimeout(publishTimer);
    publishTimer = null;
  }
  setPreferenceSyncState({
    available: false,
    status: 'local-only',
    detail: 'Connect an Orochi account to sync non-secret preferences.',
  });
}

/** Begin a fail-closed full LIST; returns false when the capability is absent. */
export function syncPreferencesNow(): boolean {
  if (!transport?.ready() || !transport.supported()) {
    setPreferenceSyncState({
      available: false,
      status: 'local-only',
      detail: 'Orochi account preference sync is unavailable on this connection.',
    });
    return false;
  }
  collecting = true;
  collected = new Map();
  setPreferenceSyncState({ available: true, status: 'checking', detail: 'Checking account preferences…' });
  if (!transport.list()) {
    collecting = false;
    setPreferenceSyncState({
      status: 'pending',
      detail: 'The preference check was not sent; reconnect or retry.',
    });
    return false;
  }
  return true;
}

/** Remove this browser's sync identity/cache without deleting account data. */
export function forgetPreferenceSyncDevice(): void {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
  document = null;
  bootstrapped = false;
  collecting = false;
  collected.clear();
  storageRemove(DOCUMENT_STORAGE_KEY);
  storageRemove(DEVICE_STORAGE_KEY);
  setPreferenceSyncState({
    available: false,
    status: 'local-only',
    lastSyncedAt: null,
    detail: 'This device preference identity was removed.',
  });
}

/** Collect one preference row from an in-flight METADATA LIST. */
export function _collectPreferenceMetadata(key: string, value: string): boolean {
  if (!collecting || !isPreferenceMetadataKey(key)) return false;
  collected.set(key, value);
  return true;
}

/** Complete the LIST snapshot after numeric 762. */
export function _finishPreferenceMetadataCollection(): void {
  if (!collecting) return;
  collecting = false;
  const hasManifest = collected.has(PREFERENCE_MANIFEST_KEY);
  const remote = decodePreferenceMetadata(collected);
  remotePartCounts = {
    buffers: listedPartCount(collected, 'b'),
    read: listedPartCount(collected, 'r'),
  };
  if (hasManifest && !remote) {
    setPreferenceSyncState({
      status: 'error',
      detail: 'Account preferences were incomplete or invalid; local settings were kept.',
    });
    return;
  }
  let local: PreferenceDocument;
  try { local = ensureDocument(); } catch (error) {
    reportPreferenceError(error);
    return;
  }
  bootstrapped = true;
  if (!remote) {
    publish(local);
    return;
  }
  const merged = mergePreferenceDocuments(local, remote);
  document = merged;
  persistDocument(merged);
  applyDocument(merged);
  if (!preferenceDocumentsEqual(merged, remote)) {
    publish(merged);
  } else {
    setPreferenceSyncState({
      status: 'synced',
      lastSyncedAt: Date.now(),
      detail: 'Non-secret preferences are current on this account.',
    });
  }
}

/** Test-only reset for the singleton controller. */
export function _resetPreferenceSyncForTests(): void {
  disposeReactive?.();
  disposeReactive = null;
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
  transport = null;
  initialized = false;
  bootstrapped = false;
  applyingRemote = false;
  collecting = false;
  collected = new Map();
  document = loadDocument();
  remotePartCounts = { buffers: 0, read: 0 };
  setPreferenceSyncState({
    available: false,
    status: 'local-only',
    lastSyncedAt: null,
    detail: 'Connect an Orochi account to sync non-secret preferences.',
  });
}
