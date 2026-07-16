// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const makeStorage = (): Storage => {
    const backing = new Map<string, string>();
    return {
      get length() { return backing.size; },
      clear: () => backing.clear(),
      getItem: (key) => backing.get(key) ?? null,
      key: (index) => [...backing.keys()][index] ?? null,
      removeItem: (key) => { backing.delete(key); },
      setItem: (key, value) => { backing.set(key, String(value)); },
    };
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeStorage(), configurable: true, writable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: makeStorage(), configurable: true, writable: true,
  });
});
import {
  PREFERENCE_MANIFEST_KEY,
  createPreferenceDocument,
  decodePreferenceMetadata,
  encodePreferenceMetadata,
  type PreferenceValues,
} from '@/lib/preferences/sync';
import { applyBufferPreferences, exportBufferPreferences } from './buffers';
import { resetSettings, settings, updateSettings } from './settings';
import { exportReadState, resetThreads } from './threads';
import {
  _collectPreferenceMetadata,
  _finishPreferenceMetadataCollection,
  _preferenceTransportReady,
  _resetPreferenceSyncForTests,
  _setPreferenceSyncTransport,
  initPreferenceSync,
  preferenceSyncState,
  syncPreferencesNow,
  type PreferenceSyncTransport,
} from './preferenceSync';

const REMOTE_DEVICE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function currentValues(overrides: Partial<PreferenceValues> = {}): PreferenceValues {
  return {
    appearance: { theme: 'retro' },
    accessibility: {
      fontFamily: 'system', fontSize: 14, sceneMotion: 'auto', readMarker: true,
    },
    notifications: { enabled: true, sound: false, readOnFocus: true },
    buffers: {},
    read: {},
    ...overrides,
  };
}

function fakeTransport(supported = true) {
  const api = {
    ready: vi.fn(() => true),
    supported: vi.fn(() => supported),
    list: vi.fn<() => boolean>(() => true),
    set: vi.fn<(key: string, value: string) => boolean>(() => true),
    clear: vi.fn<(key: string) => boolean>(() => true),
  } satisfies PreferenceSyncTransport;
  return api;
}

function deliver(document: ReturnType<typeof createPreferenceDocument>): void {
  for (const entry of encodePreferenceMetadata(document)) {
    expect(_collectPreferenceMetadata(entry.key, entry.value)).toBe(true);
  }
  _finishPreferenceMetadataCollection();
}

beforeEach(() => {
  _resetPreferenceSyncForTests();
  localStorage.clear();
  resetSettings();
  applyBufferPreferences({});
  resetThreads();
  _resetPreferenceSyncForTests();
});

afterEach(() => {
  vi.useRealTimers();
  _resetPreferenceSyncForTests();
});

describe('preference sync controller', () => {
  it('publishes a bounded initial snapshot when the account has no remote document', () => {
    const transport = fakeTransport();
    _setPreferenceSyncTransport(transport);
    initPreferenceSync();

    _preferenceTransportReady(true);
    expect(transport.list).toHaveBeenCalledOnce();
    _finishPreferenceMetadataCollection();

    expect(preferenceSyncState.status).toBe('synced');
    expect(transport.set).toHaveBeenCalled();
    expect(transport.set.mock.calls.at(-1)?.[0]).toBe(PREFERENCE_MANIFEST_KEY);
    expect(transport.set.mock.calls.every(([, value]) => new TextEncoder().encode(value).byteLength <= 512)).toBe(true);
  });

  it('applies a newer remote allowlist while preserving unrelated local settings', () => {
    const transport = fakeTransport();
    updateSettings({ customCSS: '.local-only {}', uploadUrl: 'https://local.example/upload' });
    _setPreferenceSyncTransport(transport);
    initPreferenceSync();
    _preferenceTransportReady(true);

    deliver(createPreferenceDocument(currentValues({
      appearance: { theme: 'nord' },
      accessibility: {
        fontFamily: 'serif', fontSize: 18, sceneMotion: 'reduced', readMarker: false,
      },
      notifications: { enabled: false, sound: true, readOnFocus: false },
      buffers: {
        'irc.example.#one': { pinned: true, notify: 'all' },
        'irc.example.#two': { pinned: false, notify: 'mute' },
      },
      read: { 'irc.example.#one': 2000 },
    }), REMOTE_DEVICE, 1000, 10));

    expect(settings.theme).toBe('nord');
    expect(settings.fontSize).toBe(18);
    expect(settings.customCSS).toBe('.local-only {}');
    expect(settings.uploadUrl).toBe('https://local.example/upload');
    expect(exportBufferPreferences()).toEqual({
      'irc.example.#one': { pinned: true, notify: 'all' },
      'irc.example.#two': { pinned: false, notify: 'mute' },
    });
    expect(exportReadState()).toEqual({ 'irc.example.#one': 2000 });
    expect(preferenceSyncState.status).toBe('synced');
  });

  it('keeps local settings when a listed generation is incomplete', () => {
    const transport = fakeTransport();
    _setPreferenceSyncTransport(transport);
    initPreferenceSync();
    _preferenceTransportReady(true);
    const remote = createPreferenceDocument(currentValues({
      buffers: { 'irc.example.#one': { pinned: true, notify: 'all' } },
    }), REMOTE_DEVICE, 1000, 10);
    const encoded = encodePreferenceMetadata(remote);
    const manifest = encoded.find((entry) => entry.key === PREFERENCE_MANIFEST_KEY)!;
    _collectPreferenceMetadata(manifest.key, manifest.value);

    _finishPreferenceMetadataCollection();

    expect(preferenceSyncState.status).toBe('error');
    expect(settings.theme).toBe('retro');
    expect(transport.set).not.toHaveBeenCalled();
  });

  it('debounces a local change after bootstrap and publishes a decodable document', async () => {
    vi.useFakeTimers();
    const transport = fakeTransport();
    _setPreferenceSyncTransport(transport);
    initPreferenceSync();
    _preferenceTransportReady(true);
    _finishPreferenceMetadataCollection();
    transport.set.mockClear();

    updateSettings({ theme: 'gruvbox' });
    await Promise.resolve();
    vi.advanceTimersByTime(750);

    const sent = new Map(transport.set.mock.calls.map(([key, value]) => [key, value]));
    const decoded = decodePreferenceMetadata(sent);
    expect(decoded?.appearance.value.theme).toBe('gruvbox');
  });

  it('keeps a partially written multipart update pending and retries the complete document', async () => {
    vi.useFakeTimers();
    const transport = fakeTransport();
    _setPreferenceSyncTransport(transport);
    initPreferenceSync();
    _preferenceTransportReady(true);
    _finishPreferenceMetadataCollection();
    const previousSyncedAt = preferenceSyncState.lastSyncedAt;
    transport.set.mockClear();

    let writes = 0;
    transport.set.mockImplementation(() => {
      writes += 1;
      return writes !== 2;
    });
    applyBufferPreferences(Object.fromEntries(
      Array.from({ length: 24 }, (_, index) => [
        `irc.example.${'long-buffer-name-'.repeat(2)}${index}`,
        { pinned: true, notify: 'all' as const },
      ]),
    ));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(750);

    expect(transport.set).toHaveBeenCalledTimes(2);
    expect(transport.set.mock.calls.some(([key]) => key === PREFERENCE_MANIFEST_KEY)).toBe(false);
    expect(preferenceSyncState.status).toBe('pending');
    expect(preferenceSyncState.lastSyncedAt).toBe(previousSyncedAt);

    transport.set.mockImplementation(() => true);
    await vi.advanceTimersByTimeAsync(750);

    expect(preferenceSyncState.status).toBe('synced');
    expect(transport.set.mock.calls.filter(([key]) => key === PREFERENCE_MANIFEST_KEY)).toHaveLength(1);
    const sent = new Map(transport.set.mock.calls.map(([key, value]) => [key, value]));
    expect(Object.keys(decodePreferenceMetadata(sent)?.buffers.value ?? {})).toHaveLength(24);
  });

  it('keeps stale-part cleanup pending until every clear is accepted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const transport = fakeTransport();
    _setPreferenceSyncTransport(transport);
    initPreferenceSync();
    _preferenceTransportReady(true);
    deliver(createPreferenceDocument(currentValues({
      buffers: Object.fromEntries(
        Array.from({ length: 24 }, (_, index) => [
          `irc.example.${'remote-buffer-'.repeat(2)}${index}`,
          { pinned: true, notify: 'all' as const },
        ]),
      ),
    }), REMOTE_DEVICE, 1_000, 10));
    const previousSyncedAt = preferenceSyncState.lastSyncedAt;
    transport.set.mockClear();
    transport.clear.mockImplementationOnce(() => false);

    applyBufferPreferences({});
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(750);

    expect(transport.set.mock.calls.at(-1)?.[0]).toBe(PREFERENCE_MANIFEST_KEY);
    expect(transport.clear).toHaveBeenCalledTimes(1);
    expect(preferenceSyncState.status).toBe('pending');
    expect(preferenceSyncState.lastSyncedAt).toBe(previousSyncedAt);

    await vi.advanceTimersByTimeAsync(750);

    expect(transport.clear.mock.calls.length).toBeGreaterThan(1);
    expect(preferenceSyncState.status).toBe('synced');
  });

  it('does not start a metadata collection when LIST loses the socket race', () => {
    const transport = fakeTransport();
    transport.list.mockReturnValue(false);
    _setPreferenceSyncTransport(transport);
    initPreferenceSync();

    expect(syncPreferencesNow()).toBe(false);
    expect(preferenceSyncState.status).toBe('pending');
    expect(preferenceSyncState.lastSyncedAt).toBeNull();
    _finishPreferenceMetadataCollection();
    expect(transport.set).not.toHaveBeenCalled();
  });

  it('stays local-only and sends nothing when the capability is unavailable', () => {
    const transport = fakeTransport(false);
    _setPreferenceSyncTransport(transport);
    initPreferenceSync();

    _preferenceTransportReady(false);

    expect(preferenceSyncState.available).toBe(false);
    expect(preferenceSyncState.status).toBe('local-only');
    expect(syncPreferencesNow()).toBe(false);
    expect(transport.list).not.toHaveBeenCalled();
    expect(transport.set).not.toHaveBeenCalled();
  });
});
