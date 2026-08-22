// Settings store — persisted to localStorage 'darkbear_settings_v2'.
//
// Module-level Solid store singleton + exported action functions.
// Saves are debounced 500ms; v1 settings are migrated on first load.

import { createStore, reconcile, unwrap } from 'solid-js/store';
import type { AppSettings, RelaySettings, RelayProfile, ThemeId, CustomColors, UserCommandAction } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_RELAY, DEFAULT_CUSTOM_COLORS, DEFAULT_BRIDGE } from '@/types';
import type {
  AccessibilityPreferences,
  AppearancePreferences,
  NotificationPreferences,
} from '@/lib/preferences/sync';
import { isClockTime, isValidTimeZone } from '@/lib/notificationPolicy';
import { isSafeCommandId, MAX_USER_ACTIONS } from '@/lib/userActions';
import {
  desktopVaultDelete,
  desktopVaultGet,
  desktopVaultSet,
  isDesktopBuild,
  isDesktopRuntime,
} from '@/lib/desktop';

// WCAG 2.2.2 (Pause, Stop, Hide) requires a user-OPERABLE mechanism to stop
// motion, not merely honoring the OS media query. `sceneMotion === 'reduced'`
// forces the decorative SMIL scenes (AstronautBear, ThemeBg) off regardless of
// the OS prefers-reduced-motion state. Declared optional by augmenting the shared
// AppSettings, so the canonical DEFAULT_SETTINGS literal in types.ts stays valid
// without editing it; freshDefaults() below supplies the concrete 'auto' default.
declare module '@/types' {
  interface AppSettings {
    sceneMotion?: 'auto' | 'reduced';
  }
}

type SceneMotion = 'auto' | 'reduced';

const STORAGE_KEY = 'darkbear_settings_v2';
const V1_STORAGE_KEY = 'darkbear_settings_v1';
const SESSION_SECRETS_KEY = 'darkbear_settings_secrets_v1';
const SAVE_DEBOUNCE_MS = 500;

interface SessionSecrets {
  relayPassword?: string;
  bridgePassword?: string;
  profilePasswords?: Record<string, string>;
}

function freshDefaults(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    relay: { ...DEFAULT_RELAY },
    customColors: { ...DEFAULT_CUSTOM_COLORS },
    bridge: { ...DEFAULT_BRIDGE },
    profiles: [],
    userActions: [],
    highlightWords: [],
    sceneMotion: 'auto',
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

function finiteNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Strip network-reaching constructs from user-supplied CSS: `@import` rules and
 * external `url(...)` references (absolute http(s) and protocol-relative). These
 * are the two vectors by which injected CSS can exfiltrate/beacon or pull remote
 * resources; data: and same-origin/relative urls are left intact.
 */
export function sanitizeCustomCss(css: string): string {
  if (typeof css !== 'string') return '';
  return css
    // Drop @import at-rules whole (with or without trailing ';').
    .replace(/@import\b[^;]*;?/gi, '')
    // Neutralise external url() targets, keeping the property syntactically valid.
    .replace(/url\(\s*(['"]?)\s*(?:https?:)?\/\/[^)]*?\1\s*\)/gi, 'url()');
}

const NUMERIC_CLAMPS: Partial<Record<keyof AppSettings, [number, number]>> = {
  sidebarWidth: [120, 400],
  fontSize: [12, 20],
  archiveMaxMiB: [10, 2048],
};

const NUMERIC_FIELDS: (keyof AppSettings)[] = [
  'watermarkOpacity', 'bgOpacity', 'bgBlur', 'bgTintOpacity',
];

function isRelayProfile(v: unknown): v is RelayProfile {
  return isPlainObject(v) && typeof v.name === 'string' && isPlainObject(v.relay);
}

function normalizeProfile(v: unknown): RelayProfile | null {
  if (!isRelayProfile(v)) return null;
  const relay = v.relay as unknown as Record<string, unknown>;
  return {
    name: v.name,
    relay: {
      ...DEFAULT_RELAY,
      host: typeof relay.host === 'string' ? relay.host : DEFAULT_RELAY.host,
      port: clampNum(relay.port, 1, 65535, DEFAULT_RELAY.port),
      tls: relay.tls !== false,
      password: typeof relay.password === 'string' ? relay.password : '',
      compression: relay.compression !== false,
      path: typeof relay.path === 'string' && relay.path.trim()
        ? relay.path.trim().replace(/^\/+|\/+$/g, '')
        : DEFAULT_RELAY.path,
    },
    rememberPassword: v.rememberPassword === true,
  };
}

function normalizeUserAction(value: unknown): UserCommandAction | null {
  if (!isPlainObject(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim().slice(0, 100) : '';
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '';
  const scope = typeof value.scope === 'string' &&
    (value.scope === 'global' || value.scope.startsWith('profile:'))
    ? value.scope.slice(0, 120)
    : 'global';
  if (!id || !name || !isSafeCommandId(value.commandId)) return null;
  return { id, name, commandId: value.commandId, scope, confirmed: value.confirmed === true };
}

function readSessionSecrets(): SessionSecrets {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(SESSION_SECRETS_KEY) ?? '{}');
    if (!isPlainObject(parsed)) return {};
    const profilePasswords: Record<string, string> = {};
    if (isPlainObject(parsed.profilePasswords)) {
      for (const [name, password] of Object.entries(parsed.profilePasswords)) {
        if (typeof password === 'string' && password) profilePasswords[name] = password;
      }
    }
    return {
      relayPassword: typeof parsed.relayPassword === 'string' ? parsed.relayPassword : undefined,
      bridgePassword: typeof parsed.bridgePassword === 'string' ? parsed.bridgePassword : undefined,
      profilePasswords,
    };
  } catch {
    return {};
  }
}

function writeSessionSecrets(value: AppSettings): void {
  if (typeof sessionStorage === 'undefined') return;
  const profilePasswords: Record<string, string> = {};
  for (const profile of value.profiles) {
    if (profile.relay.password) profilePasswords[profile.name] = profile.relay.password;
  }
  const secrets: SessionSecrets = {
    relayPassword: value.relay.password || undefined,
    bridgePassword: value.bridge.password || undefined,
    profilePasswords,
  };
  try {
    const hasSecrets = Boolean(
      secrets.relayPassword || secrets.bridgePassword || Object.keys(profilePasswords).length,
    );
    if (hasSecrets) sessionStorage.setItem(SESSION_SECRETS_KEY, JSON.stringify(secrets));
    else sessionStorage.removeItem(SESSION_SECRETS_KEY);
  } catch { /* private mode / quota: keep secrets in memory only */ }
}

function localSnapshot(value: AppSettings): AppSettings {
  return {
    ...value,
    relay: {
      ...value.relay,
      password: !isDesktopBuild && value.rememberRelayPassword ? value.relay.password : '',
    },
    bridge: {
      ...value.bridge,
      password: !isDesktopBuild && value.rememberBridgePassword ? value.bridge.password : '',
    },
    profiles: value.profiles.map((profile) => ({
      ...profile,
      relay: {
        ...profile.relay,
        password: !isDesktopBuild && profile.rememberPassword ? profile.relay.password : '',
      },
    })),
  };
}

// Desktop settings load synchronously, but the OS vault is asynchronous. Do
// not let the initial localStorage normalization delete the vault before its
// remembered values have been read.
let desktopSettingsHydrated = !isDesktopBuild;

function persistValue(value: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localSnapshot(value)));
  writeSessionSecrets(value);
  if (isDesktopBuild && desktopSettingsHydrated) void persistDesktopSettingsSecrets(value);
}

/**
 * Coerce untrusted data (localStorage blob or imported JSON) into a fully-formed
 * AppSettings: unknown top-level keys are dropped, each nested block is
 * deep-merged over its DEFAULT_*, arrays are shape-guarded, numeric fields are
 * clamped/finite-checked, and customCSS is sanitized. Never throws.
 */
function normalizeSettings(input: unknown): AppSettings {
  const data = isPlainObject(input) ? input : {};
  const merged = freshDefaults();

  // Copy only known primitive/scalar top-level keys; nested blocks handled below.
  for (const key of Object.keys(merged) as (keyof AppSettings)[]) {
    if (key === 'relay' || key === 'customColors' || key === 'bridge' ||
        key === 'profiles' || key === 'userActions' || key === 'highlightWords') continue;
    if (key in data && data[key] !== undefined) {
      (merged as unknown as Record<string, unknown>)[key] = data[key];
    }
  }

  merged.relay = { ...DEFAULT_RELAY, ...(isPlainObject(data.relay) ? data.relay : {}) };
  merged.relay.path = typeof merged.relay.path === 'string' && merged.relay.path.trim()
    ? merged.relay.path.trim().replace(/^\/+|\/+$/g, '')
    : DEFAULT_RELAY.path;
  merged.customColors = { ...DEFAULT_CUSTOM_COLORS, ...(isPlainObject(data.customColors) ? data.customColors : {}) };
  merged.bridge = { ...DEFAULT_BRIDGE, ...(isPlainObject(data.bridge) ? data.bridge : {}) };
  merged.profiles = Array.isArray(data.profiles)
    ? data.profiles.map(normalizeProfile).filter((profile): profile is RelayProfile => profile !== null)
    : [];
  merged.userActions = Array.isArray(data.userActions)
    ? data.userActions.slice(0, MAX_USER_ACTIONS)
      .map(normalizeUserAction)
      .filter((action): action is UserCommandAction => action !== null)
    : [];
  merged.highlightWords = Array.isArray(data.highlightWords)
    ? data.highlightWords.filter((w): w is string => typeof w === 'string')
    : [];

  for (const [field, [min, max]] of Object.entries(NUMERIC_CLAMPS) as [keyof AppSettings, [number, number]][]) {
    (merged as unknown as Record<string, number>)[field] = clampNum(merged[field], min, max, DEFAULT_SETTINGS[field] as number);
  }
  for (const field of NUMERIC_FIELDS) {
    (merged as unknown as Record<string, number>)[field] = finiteNum(merged[field], DEFAULT_SETTINGS[field] as number);
  }

  merged.customCSS = sanitizeCustomCss(merged.customCSS);
  // Fetching a remote message image exposes the viewer's IP address and request
  // timing. Missing or malformed preferences therefore fail closed, while an
  // explicit existing boolean remains authoritative.
  merged.inlineImages = merged.inlineImages === true;
  merged.rememberRelayPassword = merged.rememberRelayPassword === true;
  merged.rememberBridgePassword = merged.rememberBridgePassword === true;
  merged.bridge.e2eeDms = merged.bridge.e2eeDms === true;
  merged.bridge.e2eePolicy = merged.bridge.e2eePolicy === 'verified'
    ? 'verified'
    : 'opportunistic';
  if (!['off', '7d', '30d', 'custom'].includes(merged.archiveRetention)) {
    merged.archiveRetention = 'off';
  }
  if (!['system', 'en', 'de', 'ar'].includes(merged.locale)) merged.locale = 'system';
  if (!['small', 'medium', 'large'].includes(merged.captionSize)) {
    merged.captionSize = 'medium';
  }
  merged.captionBackground = merged.captionBackground === 'translucent'
    ? 'translucent'
    : 'solid';
  merged.quietHoursEnabled = merged.quietHoursEnabled === true;
  if (!isClockTime(merged.quietHoursStart)) merged.quietHoursStart = DEFAULT_SETTINGS.quietHoursStart;
  if (!isClockTime(merged.quietHoursEnd)) merged.quietHoursEnd = DEFAULT_SETTINGS.quietHoursEnd;
  if (!isValidTimeZone(merged.quietHoursTimezone)) {
    merged.quietHoursTimezone = DEFAULT_SETTINGS.quietHoursTimezone;
  }
  merged.notificationsSnoozedUntil = finiteNum(merged.notificationsSnoozedUntil, 0);
  if (merged.notificationsSnoozedUntil <= Date.now()) merged.notificationsSnoozedUntil = 0;
  if (!merged.uploadUrl) merged.uploadUrl = DEFAULT_SETTINGS.uploadUrl;
  // Coerce any untrusted/unknown value to a valid mode; 'auto' is the default.
  merged.sceneMotion = merged.sceneMotion === 'reduced' ? 'reduced' : 'auto';
  return merged;
}

function migrateV1(raw: string): AppSettings {
  const parsed: unknown = JSON.parse(raw);
  if (!isPlainObject(parsed)) return freshDefaults();
  const data = parsed;
  // Drop ZNC/irssi fields, keep the rest
  const migrated = freshDefaults();
  if (data['relay']) migrated.relay = { ...DEFAULT_RELAY, ...(data['relay'] as Partial<RelaySettings>) };
  if (data['profiles']) migrated.profiles = data['profiles'] as RelayProfile[];
  if (data['theme']) migrated.theme = (data['theme'] === 'midnight' ? 'darkbear' : data['theme']) as ThemeId;
  if (data['customColors']) migrated.customColors = { ...DEFAULT_CUSTOM_COLORS, ...(data['customColors'] as Partial<CustomColors>) };
  if (data['fontFamily']) migrated.fontFamily = data['fontFamily'] as string;
  if (data['sidebarWidth']) migrated.sidebarWidth = Math.max(120, Math.min(400, data['sidebarWidth'] as number));
  if (data['fontSize']) migrated.fontSize = Math.max(12, Math.min(20, data['fontSize'] as number));
  if (data['timestampFormat']) migrated.timestampFormat = data['timestampFormat'] as AppSettings['timestampFormat'];
  if (data['compactMode'] !== undefined) migrated.compactMode = data['compactMode'] as boolean;
  if (typeof data['inlineImages'] === 'boolean') migrated.inlineImages = data['inlineImages'];
  if (data['notifications'] !== undefined) migrated.notifications = data['notifications'] as boolean;
  if (data['notificationSound'] !== undefined) migrated.notificationSound = data['notificationSound'] as boolean;
  if (data['readOnFocus'] !== undefined) migrated.readOnFocus = data['readOnFocus'] as boolean;
  if (data['joinPartMsgs'] !== undefined) migrated.joinPartMsgs = data['joinPartMsgs'] as boolean;
  if (data['colorNicks'] !== undefined) migrated.colorNicks = data['colorNicks'] as boolean;
  if (data['showPrefixes'] !== undefined) migrated.showPrefixes = data['showPrefixes'] as boolean;
  if (data['autoReconnect'] !== undefined) migrated.autoReconnect = data['autoReconnect'] as boolean;
  if (data['readMarker'] !== undefined) migrated.readMarker = data['readMarker'] as boolean;
  if (data['onlyUnread'] !== undefined) migrated.onlyUnread = data['onlyUnread'] as boolean;
  if (data['customCSS'] !== undefined) migrated.customCSS = data['customCSS'] as string;
  if (data['highlightWords']) migrated.highlightWords = data['highlightWords'] as string[];
  if (data['watermarkOpacity'] !== undefined) migrated.watermarkOpacity = data['watermarkOpacity'] as number;
  if (data['bgImage'] !== undefined) migrated.bgImage = data['bgImage'] as string;
  if (data['bgOpacity'] !== undefined) migrated.bgOpacity = data['bgOpacity'] as number;
  if (data['bgBlur'] !== undefined) migrated.bgBlur = data['bgBlur'] as number;
  if (data['bgTint'] !== undefined) migrated.bgTint = data['bgTint'] as string;
  if (data['bgTintOpacity'] !== undefined) migrated.bgTintOpacity = data['bgTintOpacity'] as number;
  if (data['sceneMotion'] !== undefined) migrated.sceneMotion = data['sceneMotion'] as SceneMotion;
  // Final pass: sanitize CSS, clamp numerics, shape-guard arrays, coerce sceneMotion.
  return normalizeSettings(migrated);
}

function loadFromStorage(): AppSettings {
  if (typeof localStorage === 'undefined') return freshDefaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Try migrating from v1
      const v1 = localStorage.getItem(V1_STORAGE_KEY);
      const value = v1 ? migrateV1(v1) : freshDefaults();
      const secrets = readSessionSecrets();
      value.relay.password = secrets.relayPassword ?? value.relay.password;
      value.bridge.password = secrets.bridgePassword ?? value.bridge.password;
      return value;
    }
    // Deep-merges nested blocks over DEFAULT_*, shape-guards arrays, clamps
    // numerics, sanitizes customCSS, and backfills additive fields (e.g. bridge,
    // uploadUrl) for forward compatibility with pre-bridge saves.
    const value = normalizeSettings(JSON.parse(raw));
    const secrets = readSessionSecrets();
    value.relay.password = secrets.relayPassword ?? value.relay.password;
    value.bridge.password = secrets.bridgePassword ?? value.bridge.password;
    for (const profile of value.profiles) {
      profile.relay.password = secrets.profilePasswords?.[profile.name] ?? profile.relay.password;
    }
    // Migrates legacy localStorage passwords into the session-only split unless
    // the corresponding remember flag was explicitly enabled.
    persistValue(value);
    return value;
  } catch {
    return freshDefaults();
  }
}

const [settings, setSettings] = createStore<AppSettings>(loadFromStorage());

/** Read-only settings store. Mutate via the exported actions only. */
export { settings };

function desktopSettingsSecrets(value: AppSettings): SessionSecrets {
  const profilePasswords: Record<string, string> = {};
  for (const profile of value.profiles) {
    if (profile.rememberPassword && profile.relay.password) {
      profilePasswords[profile.name] = profile.relay.password;
    }
  }
  return {
    relayPassword: value.rememberRelayPassword && value.relay.password
      ? value.relay.password
      : undefined,
    bridgePassword: value.rememberBridgePassword && value.bridge.password
      ? value.bridge.password
      : undefined,
    profilePasswords,
  };
}

async function persistDesktopSettingsSecrets(value: AppSettings): Promise<void> {
  if (!isDesktopRuntime()) return;
  const secrets = desktopSettingsSecrets(value);
  if (!secrets.relayPassword && !secrets.bridgePassword
      && Object.keys(secrets.profilePasswords ?? {}).length === 0) {
    await desktopVaultDelete('settings-v1');
    return;
  }
  await desktopVaultSet('settings-v1', JSON.stringify({ version: 1, ...secrets }));
}

/** Hydrate opted-in passwords from the OS vault before native connections start. */
export async function hydrateDesktopSettingsSecrets(): Promise<void> {
  if (!isDesktopRuntime()) return;
  const payload = await desktopVaultGet('settings-v1');
  let stored: SessionSecrets = {};
  if (payload) {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (isPlainObject(parsed) && parsed.version === 1) {
        const profiles: Record<string, string> = {};
        if (isPlainObject(parsed.profilePasswords)) {
          for (const [name, password] of Object.entries(parsed.profilePasswords)) {
            if (typeof password === 'string' && password) profiles[name] = password;
          }
        }
        stored = {
          relayPassword: typeof parsed.relayPassword === 'string' ? parsed.relayPassword : undefined,
          bridgePassword: typeof parsed.bridgePassword === 'string' ? parsed.bridgePassword : undefined,
          profilePasswords: profiles,
        };
      }
    } catch { /* corrupt vault data is ignored and replaced below */ }
  }

  if (settings.rememberRelayPassword && stored.relayPassword) {
    setSettings('relay', 'password', stored.relayPassword);
  }
  if (settings.rememberBridgePassword && stored.bridgePassword) {
    setSettings('bridge', 'password', stored.bridgePassword);
  }
  for (let index = 0; index < settings.profiles.length; index += 1) {
    const profile = settings.profiles[index];
    if (!profile?.rememberPassword) continue;
    const password = stored.profilePasswords?.[profile.name];
    if (password) setSettings('profiles', index, 'relay', 'password', password);
  }

  // Migrates any remembered value from a legacy desktop localStorage snapshot,
  // and removes obsolete vault fields when a remember toggle was disabled.
  desktopSettingsHydrated = true;
  await persistDesktopSettingsSecrets(unwrap(settings));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localSnapshot(unwrap(settings))));
  writeSessionSecrets(unwrap(settings));
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistValue(unwrap(settings));
  }, SAVE_DEBOUNCE_MS);
}

/** Immediately write settings to localStorage (cancels any pending debounce). */
export function saveSettings(): void {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  persistValue(unwrap(settings));
}

/** Re-read settings from localStorage (v1 migration included). */
export function loadSettings(): void {
  setSettings(reconcile(loadFromStorage()));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Shallow-merge a partial into settings (nested objects are replaced wholesale). */
export function updateSettings(partial: Partial<AppSettings>): void {
  setSettings(partial);
  scheduleSave();
}

export function updateRelay(partial: Partial<RelaySettings>): void {
  setSettings('relay', partial);
  scheduleSave();
}

export function updateBridge(partial: Partial<AppSettings['bridge']>): void {
  setSettings('bridge', partial);
  scheduleSave();
}

/** Set the theme and stamp it onto <html data-theme>. */
export function setTheme(theme: ThemeId): void {
  setSettings('theme', theme);
  scheduleSave();
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

/** Apply the currently-stored theme to <html data-theme> (call at startup). */
export function applyTheme(): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }
}

export function setCustomColors(colors: Partial<CustomColors>): void {
  setSettings('customColors', colors);
  scheduleSave();
}

/**
 * Set the scene-motion mode. 'reduced' is the WCAG 2.2.2 user-operable stop:
 * it forces decorative SMIL scenes off even when the OS does not request
 * reduced motion. 'auto' defers to the OS prefers-reduced-motion query.
 */
export function setSceneMotion(mode: SceneMotion): void {
  setSettings('sceneMotion', mode);
  scheduleSave();
}

/** Strict allowlist used by account preference sync. */
export function preferenceSettingsSnapshot(): {
  appearance: AppearancePreferences;
  accessibility: AccessibilityPreferences;
  notifications: NotificationPreferences;
} {
  const fontFamily = settings.fontFamily === 'mono' || settings.fontFamily === 'serif'
    ? settings.fontFamily
    : 'system';
  return {
    appearance: { theme: settings.theme },
    accessibility: {
      fontFamily,
      fontSize: settings.fontSize,
      sceneMotion: settings.sceneMotion === 'reduced' ? 'reduced' : 'auto',
      readMarker: settings.readMarker,
    },
    notifications: {
      enabled: settings.notifications,
      sound: settings.notificationSound,
      readOnFocus: settings.readOnFocus,
    },
  };
}

/** Apply only the non-secret, cross-device settings allowlist. */
export function applyPreferenceSettings(value: {
  appearance: AppearancePreferences;
  accessibility: AccessibilityPreferences;
  notifications: NotificationPreferences;
}): void {
  setSettings({
    theme: value.appearance.theme,
    fontFamily: value.accessibility.fontFamily,
    fontSize: value.accessibility.fontSize,
    sceneMotion: value.accessibility.sceneMotion,
    readMarker: value.accessibility.readMarker,
    notifications: value.notifications.enabled,
    notificationSound: value.notifications.sound,
    readOnFocus: value.notifications.readOnFocus,
  });
  scheduleSave();
  applyTheme();
}

/** Save the current relay settings as a named profile (overwrites same name). */
export function saveProfile(name: string, rememberPassword = settings.rememberRelayPassword): void {
  const profile: RelayProfile = {
    name,
    relay: { ...unwrap(settings).relay },
    rememberPassword,
  };
  const existing = settings.profiles.findIndex((p) => p.name === name);
  const profiles = existing >= 0
    ? settings.profiles.map((p, i) => (i === existing ? profile : p))
    : [...settings.profiles, profile];
  setSettings('profiles', profiles);
  scheduleSave();
}

export function deleteProfile(name: string): void {
  setSettings('profiles', settings.profiles.filter((p) => p.name !== name));
  scheduleSave();
}

/** Load a named profile's relay settings into the active relay settings. */
export function loadProfile(name: string): void {
  const p = settings.profiles.find((x) => x.name === name);
  if (!p) return;
  setSettings('relay', { ...p.relay });
  setSettings('rememberRelayPassword', p.rememberPassword);
  scheduleSave();
}

/** Reset everything to defaults and persist immediately. */
export function resetSettings(): void {
  setSettings(reconcile(freshDefaults()));
  saveSettings();
}

/**
 * Keep an upload endpoint portable without copying embedded credentials,
 * signed query parameters, or fragments. Absolute HTTP(S) and same-origin
 * root-relative paths are the only accepted forms; everything else fails
 * closed to an empty value (the uploader's same-origin fallback).
 */
export function sanitizePortableUploadUrl(value: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    try {
      const parsed = new URL(trimmed, 'https://darkbear.invalid');
      return parsed.pathname;
    } catch {
      return '';
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Keep a pinned Onyx Server endpoint portable without copying bearer-like URL
 * material. Remote bridges require WSS; plain WS is accepted only for the
 * credential-free loopback development exception used by the live transport.
 */
export function sanitizePortableBridgeUrl(value: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const loopback = host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
    if (parsed.protocol !== 'wss:' && !(parsed.protocol === 'ws:' && loopback)) return '';
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

/** Build a redacted copy for portability. Never mutates the live settings. */
function portableSettingsSnapshot(value: AppSettings): AppSettings {
  return {
    ...value,
    tenorApiKey: '',
    uploadUrl: sanitizePortableUploadUrl(value.uploadUrl),
    bgImage: sanitizePortableUploadUrl(value.bgImage),
    rememberRelayPassword: false,
    rememberBridgePassword: false,
    relay: { ...value.relay, password: '' },
    bridge: {
      ...value.bridge,
      password: '',
      wsUrl: sanitizePortableBridgeUrl(value.bridge.wsUrl),
    },
    profiles: value.profiles.map((profile) => ({
      ...profile,
      rememberPassword: false,
      relay: { ...profile.relay, password: '' },
    })),
  };
}

/**
 * Export a portable settings copy. Passwords and API keys are removed; upload
 * bridge endpoints, and remote backgrounds retain only policy-safe origin/path
 * data, without userinfo, query, or fragment data.
 */
export function exportSettings(): string {
  return JSON.stringify(portableSettingsSnapshot(unwrap(settings)), null, 2);
}

/**
 * Import settings from a JSON string (as produced by exportSettings). Untrusted
 * input is run through the same normalizer as `loadFromStorage`: unknown keys
 * dropped, nested blocks deep-merged over DEFAULT_*, numerics clamped, customCSS
 * sanitized. Missing fields fall back to defaults (not the current values), so a
 * partial or older export lands a fully-formed, valid settings object. The whole
 * store is replaced via `reconcile` (surgical diff), then persisted immediately.
 * Returns false only when the JSON itself is unparseable or not an object.
 */
export function importSettings(json: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return false;
  }
  if (!isPlainObject(parsed)) return false;
  const imported = portableSettingsSnapshot(normalizeSettings(parsed));
  setSettings(reconcile(imported));
  saveSettings();
  return true;
}
