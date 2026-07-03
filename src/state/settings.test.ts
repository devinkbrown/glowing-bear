// Tests for the settings store — defaults, debounced persistence, v1
// migration, themes, profiles, export/import round-trips.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Node 22+ defines an experimental localStorage global that is undefined
// without --localstorage-file and shadows any jsdom implementation. Install a
// working in-memory Storage before the store modules load and read it.
vi.hoisted(() => {
  const backing = new Map<string, string>();
  const stub = {
    get length() { return backing.size; },
    clear: () => { backing.clear(); },
    getItem: (k: string) => backing.get(k) ?? null,
    key: (i: number) => [...backing.keys()][i] ?? null,
    removeItem: (k: string) => { backing.delete(k); },
    setItem: (k: string, v: string) => { backing.set(k, String(v)); },
  } satisfies Storage;
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
});

import type { AppSettings } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_BRIDGE, DEFAULT_RELAY } from '@/types';
import {
  settings,
  updateSettings,
  updateRelay,
  updateBridge,
  setTheme,
  applyTheme,
  setCustomColors,
  saveProfile,
  deleteProfile,
  loadProfile,
  resetSettings,
  loadSettings,
  saveSettings,
  exportSettings,
  importSettings,
} from './settings';

const STORAGE_KEY = 'darkbear_settings_v2';
const V1_STORAGE_KEY = 'darkbear_settings_v1';

function stored(): AppSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('nothing persisted under ' + STORAGE_KEY);
  return JSON.parse(raw) as AppSettings;
}

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear();
    // resetSettings cancels any pending debounce and persists defaults.
    resetSettings();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('defaults', () => {
    it('DEFAULT_SETTINGS uses the retro theme and default bridge/relay', () => {
      expect(DEFAULT_SETTINGS.theme).toBe('retro');
      expect(DEFAULT_SETTINGS.bridge).toEqual(DEFAULT_BRIDGE);
      expect(DEFAULT_SETTINGS.bridge.e2eeDms).toBe(false);
      expect(DEFAULT_SETTINGS.bridge.enabled).toBe(false);
      expect(DEFAULT_SETTINGS.bridge.wsUrl).toBe('');
      expect(DEFAULT_SETTINGS.relay).toEqual(DEFAULT_RELAY);
      expect(DEFAULT_SETTINGS.timestampFormat).toBe('24h');
      expect(DEFAULT_SETTINGS.uploadUrl).toBe('https://eshmaki.me/upload');
    });

    it('the store starts at defaults after a reset', () => {
      expect(settings.theme).toBe('retro');
      expect(settings.profiles).toEqual([]);
      expect(settings.highlightWords).toEqual([]);
      expect(settings.bridge.e2eeDms).toBe(false);
    });
  });

  describe('debounced persistence', () => {
    it('updateSettings persists to darkbear_settings_v2 after the 500ms debounce', () => {
      vi.useFakeTimers();

      updateSettings({ fontSize: 18 });

      expect(settings.fontSize).toBe(18);
      expect(stored().fontSize).toBe(DEFAULT_SETTINGS.fontSize); // not flushed yet
      vi.advanceTimersByTime(499);
      expect(stored().fontSize).toBe(DEFAULT_SETTINGS.fontSize);
      vi.advanceTimersByTime(1);
      expect(stored().fontSize).toBe(18);
    });

    it('collapses rapid updates into a single save', () => {
      vi.useFakeTimers();

      updateSettings({ fontSize: 15 });
      vi.advanceTimersByTime(300);
      updateSettings({ fontSize: 16 });
      vi.advanceTimersByTime(499);

      expect(stored().fontSize).toBe(DEFAULT_SETTINGS.fontSize);
      vi.advanceTimersByTime(1);
      expect(stored().fontSize).toBe(16);
    });

    it('saveSettings flushes immediately and cancels the pending debounce', () => {
      vi.useFakeTimers();
      updateSettings({ compactMode: true });

      saveSettings();

      expect(stored().compactMode).toBe(true);
    });

    it('updateRelay merges into settings.relay and persists', () => {
      vi.useFakeTimers();

      updateRelay({ host: 'irc.example.org', port: 9999 });
      vi.advanceTimersByTime(500);

      expect(settings.relay.host).toBe('irc.example.org');
      expect(settings.relay.port).toBe(9999);
      expect(settings.relay.tls).toBe(DEFAULT_RELAY.tls); // untouched fields kept
      expect(stored().relay.host).toBe('irc.example.org');
    });

    it('updateBridge merges into settings.bridge and persists', () => {
      vi.useFakeTimers();

      updateBridge({ enabled: true, e2eeDms: true });
      vi.advanceTimersByTime(500);

      expect(settings.bridge.enabled).toBe(true);
      expect(settings.bridge.e2eeDms).toBe(true);
      expect(settings.bridge.account).toBe(''); // untouched fields kept
      expect(stored().bridge.e2eeDms).toBe(true);
    });

    it('setCustomColors merges into settings.customColors', () => {
      setCustomColors({ accent: '#ff0000' });

      expect(settings.customColors.accent).toBe('#ff0000');
      expect(settings.customColors.gray950).toBe(DEFAULT_SETTINGS.customColors.gray950);
    });
  });

  describe('v1 migration', () => {
    it('migrates darkbear_settings_v1 with theme midnight → darkbear and drops dead fields', () => {
      localStorage.clear();
      localStorage.setItem(V1_STORAGE_KEY, JSON.stringify({
        theme: 'midnight',
        fontSize: 16,
        compactMode: true,
        zncMode: true,       // dead ZNC field
        irssiProxy: 'x',     // dead irssi field
      }));

      loadSettings();

      expect(settings.theme).toBe('darkbear');
      expect(settings.fontSize).toBe(16);
      expect(settings.compactMode).toBe(true);
      const exported = JSON.parse(exportSettings()) as Record<string, unknown>;
      expect(exported).not.toHaveProperty('zncMode');
      expect(exported).not.toHaveProperty('irssiProxy');
      // fields absent from v1 fall back to defaults
      expect(settings.uploadUrl).toBe(DEFAULT_SETTINGS.uploadUrl);
      expect(settings.bridge).toEqual(DEFAULT_BRIDGE);
    });

    it('keeps a non-midnight v1 theme as-is and clamps sizes', () => {
      localStorage.clear();
      localStorage.setItem(V1_STORAGE_KEY, JSON.stringify({
        theme: 'nord',
        fontSize: 99,
        sidebarWidth: 10,
        relay: { host: 'old.example.net' },
      }));

      loadSettings();

      expect(settings.theme).toBe('nord');
      expect(settings.fontSize).toBe(20);      // clamped to max
      expect(settings.sidebarWidth).toBe(120); // clamped to min
      expect(settings.relay.host).toBe('old.example.net');
      expect(settings.relay.port).toBe(DEFAULT_RELAY.port);
    });

    it('prefers v2 data over v1 when both exist', () => {
      localStorage.clear();
      localStorage.setItem(V1_STORAGE_KEY, JSON.stringify({ theme: 'midnight' }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'gruvbox' }));

      loadSettings();

      expect(settings.theme).toBe('gruvbox');
    });
  });

  describe('themes', () => {
    it('setTheme stamps data-theme onto documentElement and persists', () => {
      setTheme('dracula');

      expect(settings.theme).toBe('dracula');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dracula');
    });

    it('applyTheme stamps the currently stored theme', () => {
      updateSettings({ theme: 'nord' });
      document.documentElement.setAttribute('data-theme', 'stale');

      applyTheme();

      expect(document.documentElement.getAttribute('data-theme')).toBe('nord');
    });
  });

  describe('profiles', () => {
    it('saveProfile snapshots current relay settings', () => {
      updateRelay({ host: 'one.example.org' });

      saveProfile('home');

      expect(settings.profiles).toHaveLength(1);
      expect(settings.profiles[0]?.name).toBe('home');
      expect(settings.profiles[0]?.relay.host).toBe('one.example.org');
    });

    it('saveProfile overwrites a profile with the same name', () => {
      updateRelay({ host: 'one.example.org' });
      saveProfile('home');
      updateRelay({ host: 'two.example.org' });

      saveProfile('home');

      expect(settings.profiles).toHaveLength(1);
      expect(settings.profiles[0]?.relay.host).toBe('two.example.org');
    });

    it('loadProfile copies the saved relay back into settings.relay', () => {
      updateRelay({ host: 'one.example.org', port: 1234 });
      saveProfile('home');
      updateRelay({ host: 'elsewhere.example.org', port: 9001 });

      loadProfile('home');

      expect(settings.relay.host).toBe('one.example.org');
      expect(settings.relay.port).toBe(1234);
    });

    it('loadProfile is a no-op for an unknown name', () => {
      updateRelay({ host: 'keep.example.org' });

      loadProfile('nope');

      expect(settings.relay.host).toBe('keep.example.org');
    });

    it('deleteProfile removes only the named profile', () => {
      saveProfile('a');
      saveProfile('b');

      deleteProfile('a');

      expect(settings.profiles.map((p) => p.name)).toEqual(['b']);
    });
  });

  describe('export / import', () => {
    it('round-trips settings through exportSettings and importSettings', () => {
      updateSettings({ fontSize: 17, compactMode: true, highlightWords: ['bear'] });
      setTheme('ember');
      const json = exportSettings();

      resetSettings();
      expect(settings.theme).toBe('retro');

      expect(importSettings(json)).toBe(true);
      expect(settings.theme).toBe('ember');
      expect(settings.fontSize).toBe(17);
      expect(settings.compactMode).toBe(true);
      expect(settings.highlightWords).toEqual(['bear']);
    });

    it('rejects invalid JSON', () => {
      expect(importSettings('{not json')).toBe(false);
      expect(settings.theme).toBe('retro');
    });

    it('rejects non-object JSON payloads', () => {
      expect(importSettings('null')).toBe(false);
      expect(importSettings('42')).toBe(false);
      expect(importSettings('"str"')).toBe(false);
    });
  });

  describe('resetSettings', () => {
    it('restores defaults and persists immediately', () => {
      updateSettings({ fontSize: 19, theme: 'abyss', highlightWords: ['x'] });
      saveProfile('p');

      resetSettings();

      expect(settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
      expect(settings.theme).toBe('retro');
      expect(settings.highlightWords).toEqual([]);
      expect(settings.profiles).toEqual([]);
      // persisted without waiting for the debounce
      expect(stored().theme).toBe('retro');
      expect(stored().fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    });
  });
});
