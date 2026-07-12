// Settings store — persisted to localStorage 'darkbear_settings_v2'.
//
// Module-level Solid store singleton + exported action functions.
// Saves are debounced 500ms; v1 settings are migrated on first load.

import { createStore, reconcile, unwrap } from 'solid-js/store';
import type { AppSettings, RelaySettings, RelayProfile, ThemeId, CustomColors } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_RELAY, DEFAULT_CUSTOM_COLORS, DEFAULT_BRIDGE } from '@/types';

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
const SAVE_DEBOUNCE_MS = 500;

function freshDefaults(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    relay: { ...DEFAULT_RELAY },
    customColors: { ...DEFAULT_CUSTOM_COLORS },
    bridge: { ...DEFAULT_BRIDGE },
    profiles: [],
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
};

const NUMERIC_FIELDS: (keyof AppSettings)[] = [
  'watermarkOpacity', 'bgOpacity', 'bgBlur', 'bgTintOpacity',
];

function isRelayProfile(v: unknown): v is RelayProfile {
  return isPlainObject(v) && typeof v.name === 'string' && isPlainObject(v.relay);
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
        key === 'profiles' || key === 'highlightWords') continue;
    if (key in data && data[key] !== undefined) {
      (merged as unknown as Record<string, unknown>)[key] = data[key];
    }
  }

  merged.relay = { ...DEFAULT_RELAY, ...(isPlainObject(data.relay) ? data.relay : {}) };
  merged.customColors = { ...DEFAULT_CUSTOM_COLORS, ...(isPlainObject(data.customColors) ? data.customColors : {}) };
  merged.bridge = { ...DEFAULT_BRIDGE, ...(isPlainObject(data.bridge) ? data.bridge : {}) };
  merged.profiles = Array.isArray(data.profiles) ? data.profiles.filter(isRelayProfile) : [];
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
  if (data['inlineImages'] !== undefined) migrated.inlineImages = data['inlineImages'] as boolean;
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
      if (v1) return migrateV1(v1);
      return freshDefaults();
    }
    // Deep-merges nested blocks over DEFAULT_*, shape-guards arrays, clamps
    // numerics, sanitizes customCSS, and backfills additive fields (e.g. bridge,
    // uploadUrl) for forward compatibility with pre-bridge saves.
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return freshDefaults();
  }
}

const [settings, setSettings] = createStore<AppSettings>(loadFromStorage());

/** Read-only settings store. Mutate via the exported actions only. */
export { settings };

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unwrap(settings)));
  }, SAVE_DEBOUNCE_MS);
}

/** Immediately write settings to localStorage (cancels any pending debounce). */
export function saveSettings(): void {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(unwrap(settings)));
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

/** Save the current relay settings as a named profile (overwrites same name). */
export function saveProfile(name: string): void {
  const profile: RelayProfile = { name, relay: { ...unwrap(settings).relay } };
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
  scheduleSave();
}

/** Reset everything to defaults and persist immediately. */
export function resetSettings(): void {
  setSettings(reconcile(freshDefaults()));
  saveSettings();
}

/** Export the full settings object as pretty-printed JSON. */
export function exportSettings(): string {
  return JSON.stringify(unwrap(settings), null, 2);
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
  setSettings(reconcile(normalizeSettings(parsed)));
  saveSettings();
  return true;
}
