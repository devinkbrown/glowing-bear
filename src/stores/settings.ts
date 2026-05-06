import type { StateCreator } from 'zustand';
import type { AppSettings, RelaySettings, RelayProfile, ThemeName, CustomThemeColors } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_RELAY, DEFAULT_CUSTOM_COLORS } from '@/types';

const STORAGE_KEY = 'darkbear_settings_v2';

export interface SettingsSlice {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  updateRelay: (partial: Partial<RelaySettings>) => void;
  setTheme: (theme: ThemeName) => void;
  setCustomColors: (colors: Partial<CustomThemeColors>) => void;
  saveProfile: (name: string) => void;
  deleteProfile: (name: string) => void;
  loadProfile: (name: string) => void;
  resetSettings: () => void;
  loadSettings: () => void;
  saveSettings: () => void;
}

function loadFromStorage(): AppSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Try migrating from v1
      const v1 = localStorage.getItem('darkbear_settings_v1');
      if (v1) {
        const data = JSON.parse(v1);
        // Drop ZNC/irssi fields, keep the rest
        const migrated = { ...DEFAULT_SETTINGS };
        if (data.relay) migrated.relay = { ...DEFAULT_RELAY, ...data.relay };
        if (data.profiles) migrated.profiles = data.profiles;
        if (data.theme) migrated.theme = data.theme === 'midnight' ? 'darkbear' : data.theme;
        if (data.customColors) migrated.customColors = { ...DEFAULT_CUSTOM_COLORS, ...data.customColors };
        if (data.fontFamily) migrated.fontFamily = data.fontFamily;
        if (data.sidebarWidth) migrated.sidebarWidth = Math.max(120, Math.min(400, data.sidebarWidth));
        if (data.fontSize) migrated.fontSize = Math.max(12, Math.min(20, data.fontSize));
        if (data.timestampFormat) migrated.timestampFormat = data.timestampFormat;
        if (data.compactMode !== undefined) migrated.compactMode = data.compactMode;
        if (data.inlineImages !== undefined) migrated.inlineImages = data.inlineImages;
        if (data.notifications !== undefined) migrated.notifications = data.notifications;
        if (data.notificationSound !== undefined) migrated.notificationSound = data.notificationSound;
        if (data.readOnFocus !== undefined) migrated.readOnFocus = data.readOnFocus;
        if (data.joinPartMsgs !== undefined) migrated.joinPartMsgs = data.joinPartMsgs;
        if (data.colorNicks !== undefined) migrated.colorNicks = data.colorNicks;
        if (data.showPrefixes !== undefined) migrated.showPrefixes = data.showPrefixes;
        if (data.autoReconnect !== undefined) migrated.autoReconnect = data.autoReconnect;
        if (data.readMarker !== undefined) migrated.readMarker = data.readMarker;
        if (data.onlyUnread !== undefined) migrated.onlyUnread = data.onlyUnread;
        if (data.customCSS !== undefined) migrated.customCSS = data.customCSS;
        if (data.highlightWords) migrated.highlightWords = data.highlightWords;
        if (data.watermarkOpacity !== undefined) migrated.watermarkOpacity = data.watermarkOpacity;
        if (data.bgImage !== undefined) migrated.bgImage = data.bgImage;
        if (data.bgOpacity !== undefined) migrated.bgOpacity = data.bgOpacity;
        if (data.bgBlur !== undefined) migrated.bgBlur = data.bgBlur;
        if (data.bgTint !== undefined) migrated.bgTint = data.bgTint;
        if (data.bgTintOpacity !== undefined) migrated.bgTintOpacity = data.bgTintOpacity;
        if (data.enableVideoCalls !== undefined) migrated.enableVideoCalls = data.enableVideoCalls;
        return migrated;
      }
      return { ...DEFAULT_SETTINGS };
    }
    const data = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...data, relay: { ...DEFAULT_RELAY, ...data.relay }, customColors: { ...DEFAULT_CUSTOM_COLORS, ...data.customColors } };
    // Backfill upload URL if empty (added after initial release)
    if (!merged.uploadUrl) merged.uploadUrl = DEFAULT_SETTINGS.uploadUrl;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(settings: AppSettings) {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, 500);
}

export const createSettingsSlice: StateCreator<SettingsSlice, [], [], SettingsSlice> = (set, get) => ({
  settings: loadFromStorage(),

  updateSettings: (partial) => {
    const next = { ...get().settings, ...partial };
    set({ settings: next });
    scheduleSave(next);
  },

  updateRelay: (partial) => {
    const next = { ...get().settings, relay: { ...get().settings.relay, ...partial } };
    set({ settings: next });
    scheduleSave(next);
  },

  setTheme: (theme) => {
    const next = { ...get().settings, theme };
    set({ settings: next });
    scheduleSave(next);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  },

  setCustomColors: (colors) => {
    const next = { ...get().settings, customColors: { ...get().settings.customColors, ...colors } };
    set({ settings: next });
    scheduleSave(next);
  },

  saveProfile: (name) => {
    const s = get().settings;
    const profile: RelayProfile = { name, relay: { ...s.relay } };
    const existing = s.profiles.findIndex(p => p.name === name);
    const profiles = existing >= 0
      ? s.profiles.map((p, i) => i === existing ? profile : p)
      : [...s.profiles, profile];
    const next = { ...s, profiles };
    set({ settings: next });
    scheduleSave(next);
  },

  deleteProfile: (name) => {
    const next = { ...get().settings, profiles: get().settings.profiles.filter(p => p.name !== name) };
    set({ settings: next });
    scheduleSave(next);
  },

  loadProfile: (name) => {
    const p = get().settings.profiles.find(p => p.name === name);
    if (p) {
      const next = { ...get().settings, relay: { ...p.relay } };
      set({ settings: next });
      scheduleSave(next);
    }
  },

  resetSettings: () => {
    const next = { ...DEFAULT_SETTINGS };
    set({ settings: next });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  },

  loadSettings: () => {
    set({ settings: loadFromStorage() });
  },

  saveSettings: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().settings));
    }
  },
});
