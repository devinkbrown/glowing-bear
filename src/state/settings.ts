// Settings store — persisted to localStorage 'darkbear_settings_v2'.
//
// Module-level Solid store singleton + exported action functions.
// Saves are debounced 500ms; v1 settings are migrated on first load.

import { createStore, reconcile, unwrap } from 'solid-js/store';
import type { AppSettings, RelaySettings, RelayProfile, ThemeId, CustomColors } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_RELAY, DEFAULT_CUSTOM_COLORS, DEFAULT_BRIDGE } from '@/types';

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
  };
}

function migrateV1(raw: string): AppSettings {
  const data = JSON.parse(raw) as Record<string, unknown>;
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
  return migrated;
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
    const data = JSON.parse(raw) as Partial<AppSettings>;
    const merged: AppSettings = {
      ...freshDefaults(),
      ...data,
      relay: { ...DEFAULT_RELAY, ...data.relay },
      customColors: { ...DEFAULT_CUSTOM_COLORS, ...data.customColors },
      // Additive: pre-bridge saves are forward compatible.
      bridge: { ...DEFAULT_BRIDGE, ...data.bridge },
    };
    // Backfill upload URL if empty (added after initial release)
    if (!merged.uploadUrl) merged.uploadUrl = DEFAULT_SETTINGS.uploadUrl;
    return merged;
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
 * Import settings from a JSON string (as produced by exportSettings).
 * Returns false when the JSON is invalid; partial objects are merged.
 */
export function importSettings(json: string): boolean {
  try {
    const data = JSON.parse(json) as Partial<AppSettings>;
    if (typeof data !== 'object' || data === null) return false;
    updateSettings(data);
    return true;
  } catch {
    return false;
  }
}
