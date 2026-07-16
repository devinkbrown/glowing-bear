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
  const sessionBacking = new Map<string, string>();
  const sessionStub = {
    get length() { return sessionBacking.size; },
    clear: () => { sessionBacking.clear(); },
    getItem: (k: string) => sessionBacking.get(k) ?? null,
    key: (i: number) => [...sessionBacking.keys()][i] ?? null,
    removeItem: (k: string) => { sessionBacking.delete(k); },
    setItem: (k: string, v: string) => { sessionBacking.set(k, String(v)); },
  } satisfies Storage;
  Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStub, configurable: true, writable: true });
});

import type { AppSettings } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_BRIDGE, DEFAULT_RELAY } from '@/types';
import {
  settings,
  updateSettings,
  preferenceSettingsSnapshot,
  applyPreferenceSettings,
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
  sanitizeCustomCss,
  sanitizePortableBridgeUrl,
  sanitizePortableUploadUrl,
} from './settings';

const STORAGE_KEY = 'darkbear_settings_v2';
const V1_STORAGE_KEY = 'darkbear_settings_v1';
const SESSION_SECRETS_KEY = 'darkbear_settings_secrets_v1';

function stored(): AppSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('nothing persisted under ' + STORAGE_KEY);
  return JSON.parse(raw) as AppSettings;
}

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // resetSettings cancels any pending debounce and persists defaults.
    resetSettings();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('defaults', () => {
    it('DEFAULT_SETTINGS uses the retro theme and default bridge/relay', () => {
      expect(DEFAULT_SETTINGS.theme).toBe('retro');
      expect(DEFAULT_SETTINGS.locale).toBe('system');
      expect(DEFAULT_SETTINGS.bridge).toEqual(DEFAULT_BRIDGE);
      expect(DEFAULT_SETTINGS.bridge.e2eeDms).toBe(false);
      expect(DEFAULT_SETTINGS.bridge.enabled).toBe(false);
      expect(DEFAULT_SETTINGS.bridge.wsUrl).toBe('');
      expect(DEFAULT_SETTINGS.relay).toEqual(DEFAULT_RELAY);
      expect(DEFAULT_SETTINGS.timestampFormat).toBe('24h');
      expect(DEFAULT_SETTINGS.inlineImages).toBe(false);
      expect(DEFAULT_SETTINGS.uploadUrl).toBe('https://eshmaki.me/upload');
      expect(DEFAULT_SETTINGS.archiveRetention).toBe('off');
      expect(DEFAULT_SETTINGS.archiveMaxMiB).toBe(100);
      expect(DEFAULT_SETTINGS.captionSize).toBe('medium');
      expect(DEFAULT_SETTINGS.captionBackground).toBe('solid');
      expect(DEFAULT_SETTINGS.quietHoursEnabled).toBe(false);
      expect(DEFAULT_SETTINGS.quietHoursStart).toBe('22:00');
      expect(DEFAULT_SETTINGS.quietHoursEnd).toBe('07:00');
      expect(DEFAULT_SETTINGS.quietHoursTimezone).toBe('system');
      expect(DEFAULT_SETTINGS.notificationsSnoozedUntil).toBe(0);
    });

    it('the store starts at defaults after a reset', () => {
      expect(settings.theme).toBe('retro');
      expect(settings.profiles).toEqual([]);
      expect(settings.userActions).toEqual([]);
      expect(settings.highlightWords).toEqual([]);
      expect(settings.bridge.e2eeDms).toBe(false);
      expect(settings.archiveRetention).toBe('off');
      expect(settings.inlineImages).toBe(false);
    });
  });

  describe('inline image privacy normalization', () => {
    it('defaults missing or malformed values off and preserves explicit v2 choices', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({}));
      loadSettings();
      expect(settings.inlineImages).toBe(false);

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ inlineImages: true }));
      loadSettings();
      expect(settings.inlineImages).toBe(true);

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ inlineImages: false }));
      loadSettings();
      expect(settings.inlineImages).toBe(false);

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ inlineImages: 'yes' }));
      loadSettings();
      expect(settings.inlineImages).toBe(false);
    });

    it('preserves explicit v1 opt-in and opt-out during migration', () => {
      localStorage.clear();
      localStorage.setItem(V1_STORAGE_KEY, JSON.stringify({ inlineImages: true }));
      loadSettings();
      expect(settings.inlineImages).toBe(true);

      localStorage.clear();
      localStorage.setItem(V1_STORAGE_KEY, JSON.stringify({ inlineImages: false }));
      loadSettings();
      expect(settings.inlineImages).toBe(false);
    });
  });

  describe('locale normalization', () => {
    it('loads supported locale preferences and falls back for unknown values', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ locale: 'ar' }));
      loadSettings();
      expect(settings.locale).toBe('ar');

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ locale: 'xx-unknown' }));
      loadSettings();
      expect(settings.locale).toBe('system');
    });

    it('persists an explicit locale preference through the typed settings layer', () => {
      vi.useFakeTimers();
      updateSettings({ locale: 'de' });
      vi.advanceTimersByTime(500);

      expect(settings.locale).toBe('de');
      expect(stored().locale).toBe('de');
    });
  });

  describe('notification DND normalization', () => {
    it('keeps valid scheduled quiet hours and a future pause', () => {
      const future = Date.now() + 60_000;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        quietHoursEnabled: true,
        quietHoursStart: '21:15',
        quietHoursEnd: '06:45',
        quietHoursTimezone: 'Europe/Berlin',
        notificationsSnoozedUntil: future,
      }));

      loadSettings();

      expect(settings.quietHoursEnabled).toBe(true);
      expect(settings.quietHoursStart).toBe('21:15');
      expect(settings.quietHoursEnd).toBe('06:45');
      expect(settings.quietHoursTimezone).toBe('Europe/Berlin');
      expect(settings.notificationsSnoozedUntil).toBe(future);
    });

    it('falls back safely for invalid clocks, zones, and expired pauses', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        quietHoursEnabled: 'yes',
        quietHoursStart: '25:90',
        quietHoursEnd: 'later',
        quietHoursTimezone: 'Mars/Olympus',
        notificationsSnoozedUntil: Date.now() - 1,
      }));

      loadSettings();

      expect(settings.quietHoursEnabled).toBe(false);
      expect(settings.quietHoursStart).toBe('22:00');
      expect(settings.quietHoursEnd).toBe('07:00');
      expect(settings.quietHoursTimezone).toBe('system');
      expect(settings.notificationsSnoozedUntil).toBe(0);
    });
  });

  describe('user command action normalization', () => {
    it('keeps only named actions from the fixed safe command registry', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        userActions: [
          { id: 'safe', name: 'Join team', commandId: 'join', scope: 'global', confirmed: true },
          { id: 'unsafe', name: 'Run raw', commandId: 'exec', scope: 'global', confirmed: true },
          { id: '', name: '', commandId: 'whois', scope: 'global' },
        ],
      }));

      loadSettings();

      expect(settings.userActions).toEqual([
        { id: 'safe', name: 'Join team', commandId: 'join', scope: 'global', confirmed: true },
      ]);
    });

    it('round-trips safe actions through the credential-free settings export', () => {
      updateSettings({
        userActions: [{ id: 'who', name: 'Whois', commandId: 'whois', scope: 'global', confirmed: false }],
      });
      const exported = exportSettings();
      resetSettings();

      expect(importSettings(exported)).toBe(true);
      expect(settings.userActions).toEqual([
        { id: 'who', name: 'Whois', commandId: 'whois', scope: 'global', confirmed: false },
      ]);
    });
  });

  describe('cross-device preference allowlist', () => {
    it('exports and applies only appearance, accessibility, and notification fields', () => {
      updateSettings({
        theme: 'nord',
        fontFamily: 'mono',
        fontSize: 18,
        sceneMotion: 'reduced',
        readMarker: false,
        notifications: false,
        notificationSound: true,
        readOnFocus: false,
        customCSS: '.secret {}',
        uploadUrl: 'https://private.example/upload',
      });
      expect(preferenceSettingsSnapshot()).toEqual({
        appearance: { theme: 'nord' },
        accessibility: {
          fontFamily: 'mono', fontSize: 18, sceneMotion: 'reduced', readMarker: false,
        },
        notifications: { enabled: false, sound: true, readOnFocus: false },
      });

      applyPreferenceSettings({
        appearance: { theme: 'gruvbox' },
        accessibility: {
          fontFamily: 'serif', fontSize: 16, sceneMotion: 'auto', readMarker: true,
        },
        notifications: { enabled: true, sound: false, readOnFocus: true },
      });
      expect(settings.theme).toBe('gruvbox');
      expect(settings.fontFamily).toBe('serif');
      expect(settings.customCSS).toBe('.secret {}');
      expect(settings.uploadUrl).toBe('https://private.example/upload');
      expect(document.documentElement.getAttribute('data-theme')).toBe('gruvbox');
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

    it('keeps relay and bridge passwords session-only by default', () => {
      vi.useFakeTimers();
      updateRelay({ password: 'relay-secret' });
      updateBridge({ password: 'bridge-secret' });
      vi.advanceTimersByTime(500);

      expect(settings.relay.password).toBe('relay-secret');
      expect(settings.bridge.password).toBe('bridge-secret');
      expect(stored().relay.password).toBe('');
      expect(stored().bridge.password).toBe('');
      expect(sessionStorage.getItem(SESSION_SECRETS_KEY)).toContain('relay-secret');
      expect(sessionStorage.getItem(SESSION_SECRETS_KEY)).toContain('bridge-secret');
    });

    it('persists passwords locally only after explicit remember opt-in', () => {
      vi.useFakeTimers();
      updateSettings({ rememberRelayPassword: true, rememberBridgePassword: true });
      updateRelay({ password: 'relay-secret' });
      updateBridge({ password: 'bridge-secret' });
      vi.advanceTimersByTime(500);

      expect(stored().relay.password).toBe('relay-secret');
      expect(stored().bridge.password).toBe('bridge-secret');
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
      updateRelay({ host: 'one.example.org', password: 'profile-secret' });

      saveProfile('home');

      expect(settings.profiles).toHaveLength(1);
      expect(settings.profiles[0]?.name).toBe('home');
      expect(settings.profiles[0]?.relay.host).toBe('one.example.org');
      saveSettings();
      expect(stored().profiles[0]?.relay.password).toBe('');
      expect(sessionStorage.getItem(SESSION_SECRETS_KEY)).toContain('profile-secret');
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

    it('never exports or imports credentials', () => {
      updateSettings({ rememberRelayPassword: true, rememberBridgePassword: true });
      updateRelay({ password: 'relay-secret' });
      updateBridge({ password: 'bridge-secret' });
      saveProfile('secret-profile', true);

      const json = exportSettings();
      expect(json).not.toContain('relay-secret');
      expect(json).not.toContain('bridge-secret');

      expect(importSettings(JSON.stringify({
        relay: { ...DEFAULT_RELAY, password: 'imported-relay' },
        bridge: { ...DEFAULT_BRIDGE, password: 'imported-bridge' },
        rememberRelayPassword: true,
        rememberBridgePassword: true,
      }))).toBe(true);
      expect(settings.relay.password).toBe('');
      expect(settings.bridge.password).toBe('');
      expect(settings.rememberRelayPassword).toBe(false);
      expect(settings.rememberBridgePassword).toBe(false);
    });

    it('redacts non-password secrets from a copy without mutating live settings', () => {
      const apiSecret = 'SENTINEL_TENOR_API_SECRET';
      const userSecret = 'SENTINEL_UPLOAD_USER';
      const passwordSecret = 'SENTINEL_UPLOAD_PASSWORD';
      const querySecret = 'SENTINEL_UPLOAD_QUERY';
      const fragmentSecret = 'SENTINEL_UPLOAD_FRAGMENT';
      const bridgeQuerySecret = 'SENTINEL_BRIDGE_QUERY';
      const bridgeUserSecret = 'SENTINEL_BRIDGE_USER';
      const backgroundSecret = 'SENTINEL_BACKGROUND_QUERY';
      const privateUploadUrl =
        `https://${userSecret}:${passwordSecret}@uploads.example/private/upload` +
        `?signature=${querySecret}#${fragmentSecret}`;
      const privateBridgeUrl =
        `wss://${bridgeUserSecret}:${passwordSecret}@orochi.example/irc` +
        `?token=${bridgeQuerySecret}#${fragmentSecret}`;
      const privateBackgroundUrl = `https://wall.example/private.jpg?token=${backgroundSecret}`;
      updateSettings({
        tenorApiKey: apiSecret,
        uploadUrl: privateUploadUrl,
        bgImage: privateBackgroundUrl,
      });
      updateBridge({ wsUrl: privateBridgeUrl });

      const json = exportSettings();
      const exported = JSON.parse(json) as AppSettings;

      for (const secret of [
        apiSecret,
        userSecret,
        passwordSecret,
        querySecret,
        fragmentSecret,
        bridgeQuerySecret,
        bridgeUserSecret,
        backgroundSecret,
      ]) {
        expect(json).not.toContain(secret);
      }
      expect(exported.tenorApiKey).toBe('');
      expect(exported.uploadUrl).toBe('https://uploads.example/private/upload');
      expect(exported.bridge.wsUrl).toBe('wss://orochi.example/irc');
      expect(exported.bgImage).toBe('https://wall.example/private.jpg');
      expect(settings.tenorApiKey).toBe(apiSecret);
      expect(settings.uploadUrl).toBe(privateUploadUrl);
      expect(settings.bridge.wsUrl).toBe(privateBridgeUrl);
      expect(settings.bgImage).toBe(privateBackgroundUrl);
    });

    it('sanitizes non-password secrets on import too', () => {
      const apiSecret = 'SENTINEL_IMPORTED_TENOR_SECRET';
      const urlSecret = 'SENTINEL_IMPORTED_UPLOAD_SECRET';
      const bridgeSecret = 'SENTINEL_IMPORTED_BRIDGE_SECRET';
      const backgroundSecret = 'SENTINEL_IMPORTED_BACKGROUND_SECRET';

      expect(importSettings(JSON.stringify({
        tenorApiKey: apiSecret,
        uploadUrl: `https://user:password@uploads.example/upload?token=${urlSecret}`,
        bgImage: `https://user:password@wall.example/private.jpg?token=${backgroundSecret}`,
        bridge: {
          ...DEFAULT_BRIDGE,
          wsUrl: `wss://user:password@orochi.example/irc?token=${bridgeSecret}`,
        },
      }))).toBe(true);

      expect(settings.tenorApiKey).toBe('');
      expect(settings.uploadUrl).toBe('https://uploads.example/upload');
      expect(settings.bridge.wsUrl).toBe('wss://orochi.example/irc');
      expect(settings.bgImage).toBe('https://wall.example/private.jpg');
      expect(JSON.stringify(settings)).not.toContain(apiSecret);
      expect(JSON.stringify(settings)).not.toContain(urlSecret);
      expect(JSON.stringify(settings)).not.toContain(bridgeSecret);
      expect(JSON.stringify(settings)).not.toContain(backgroundSecret);
    });

    it('migrates a legacy local password into session storage by default', () => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        relay: { ...DEFAULT_RELAY, password: 'legacy-secret' },
      }));

      loadSettings();

      expect(settings.relay.password).toBe('legacy-secret');
      expect(stored().relay.password).toBe('');
      expect(sessionStorage.getItem(SESSION_SECRETS_KEY)).toContain('legacy-secret');
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

    it('deep-defaults a partial import instead of leaving nested blocks undefined', () => {
      resetSettings();
      // Export shape with only a partial bridge block and no customColors/relay.
      const ok = importSettings(JSON.stringify({ theme: 'nord', bridge: { enabled: true } }));

      expect(ok).toBe(true);
      expect(settings.theme).toBe('nord');
      expect(settings.bridge.enabled).toBe(true);
      // Missing nested fields fall back to defaults, not undefined.
      expect(settings.bridge.wsUrl).toBe(DEFAULT_BRIDGE.wsUrl);
      expect(settings.bridge.e2eeDms).toBe(DEFAULT_BRIDGE.e2eeDms);
      expect(settings.relay).toEqual(DEFAULT_RELAY);
      expect(typeof settings.customColors.accent).toBe('string'); // nested block present
      expect(settings.uploadUrl).toBe(DEFAULT_SETTINGS.uploadUrl);
    });

    it('drops unknown keys and clamps out-of-range numerics on import', () => {
      resetSettings();
      const ok = importSettings(JSON.stringify({
        fontSize: 999, sidebarWidth: 5, evilKey: 'boom', profiles: 'not-an-array',
      }));

      expect(ok).toBe(true);
      expect(settings.fontSize).toBe(20);       // clamped to max
      expect(settings.sidebarWidth).toBe(120);  // clamped to min
      expect(settings.profiles).toEqual([]);    // bad shape → default
      expect(settings as unknown as Record<string, unknown>).not.toHaveProperty('evilKey');
    });

    it('normalizes untrusted caption presentation values', () => {
      expect(importSettings(JSON.stringify({
        captionSize: 'enormous',
        captionBackground: 'invisible',
      }))).toBe(true);
      expect(settings.captionSize).toBe('medium');
      expect(settings.captionBackground).toBe('solid');
    });

    it('sanitizes malicious customCSS on import', () => {
      resetSettings();
      const css = '@import url("https://evil.example/x.css");\n.a{background:url(https://evil.example/beacon.png)}';
      importSettings(JSON.stringify({ customCSS: css }));

      expect(settings.customCSS).not.toContain('@import');
      expect(settings.customCSS).not.toContain('evil.example');
    });
  });

  describe('sanitizeCustomCss', () => {
    it('strips @import at-rules', () => {
      expect(sanitizeCustomCss('@import "x.css";\n.a{color:red}')).not.toContain('@import');
      expect(sanitizeCustomCss('@import url(https://e/x);.a{color:red}')).toContain('color:red');
    });

    it('neutralises external and protocol-relative url() targets', () => {
      expect(sanitizeCustomCss('.a{background:url(https://e/p.png)}')).not.toContain('https://e');
      expect(sanitizeCustomCss(".a{background:url('//e/p.png')}")).not.toContain('//e/');
    });

    it('leaves data: and relative url() intact', () => {
      const css = '.a{background:url(data:image/png;base64,AAAA)} .b{background:url(/local.png)}';
      const out = sanitizeCustomCss(css);
      expect(out).toContain('data:image/png');
      expect(out).toContain('url(/local.png)');
    });
  });

  describe('sanitizePortableUploadUrl', () => {
    it('preserves only HTTP(S) origin/path and root-relative paths', () => {
      expect(sanitizePortableUploadUrl('https://u:p@example.test/upload?q=secret#private'))
        .toBe('https://example.test/upload');
      expect(sanitizePortableUploadUrl('/upload?q=secret#private')).toBe('/upload');
    });

    it('fails closed for protocol-relative, non-network, malformed, and relative values', () => {
      expect(sanitizePortableUploadUrl('//user:secret@example.test/upload')).toBe('');
      expect(sanitizePortableUploadUrl('data:text/plain,secret')).toBe('');
      expect(sanitizePortableUploadUrl('not a url')).toBe('');
      expect(sanitizePortableUploadUrl('relative/upload?token=secret')).toBe('');
    });
  });

  describe('sanitizePortableBridgeUrl', () => {
    it('preserves only policy-safe WS origin/path data', () => {
      expect(sanitizePortableBridgeUrl('wss://u:p@orochi.example/irc?token=secret#private'))
        .toBe('wss://orochi.example/irc');
      expect(sanitizePortableBridgeUrl('ws://127.0.0.1:8080/irc?token=secret'))
        .toBe('ws://127.0.0.1:8080/irc');
      expect(sanitizePortableBridgeUrl('ws://[::1]:8080/irc#secret'))
        .toBe('ws://[::1]:8080/irc');
    });

    it('fails closed for remote plaintext, non-WS, and malformed values', () => {
      expect(sanitizePortableBridgeUrl('ws://orochi.example/irc')).toBe('');
      expect(sanitizePortableBridgeUrl('https://orochi.example/irc')).toBe('');
      expect(sanitizePortableBridgeUrl('//orochi.example/irc')).toBe('');
      expect(sanitizePortableBridgeUrl('not a url')).toBe('');
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
