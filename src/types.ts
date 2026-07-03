// App-level shared type definitions for DarkBear (SolidJS rewrite).
//
// Protocol types (WeeChatBuffer, WeeChatLine, WeeChatNick, HotlistEntry,
// ConnectionState, RelaySettings ...) live in @/lib/weechat/model and are
// re-exported here for convenience.

import type { RelaySettings, WeeChatBuffer, WeeChatLine, WeeChatNick } from '@/lib/weechat/model';

export type {
  WeeChatBuffer,
  WeeChatLine,
  WeeChatNick,
  HotlistEntry,
  RelaySettings,
} from '@/lib/weechat/model';
export { ConnectionState } from '@/lib/weechat/model';

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export type ThemeId =
  | 'darkbear' | 'midnight' | 'obsidian' | 'nord' | 'gruvbox' | 'rose-pine'
  | 'abyss' | 'ember' | 'aurora' | 'catppuccin' | 'tokyo-night'
  | 'dracula' | 'solarized' | 'starfield' | 'lightning' | 'phoenix'
  | 'retro' | 'light' | 'custom';

export interface CustomColors {
  gray950: string;
  gray900: string;
  gray800: string;
  gray700: string;
  gray600: string;
  gray500: string;
  gray400: string;
  gray300: string;
  gray200: string;
  gray100: string;
  gray50: string;
  accent: string;
}

export const DEFAULT_CUSTOM_COLORS: CustomColors = {
  gray950: '#0c0d12',
  gray900: '#111318',
  gray800: '#15171d',
  gray700: '#1c1e25',
  gray600: '#25272e',
  gray500: '#484b5c',
  gray400: '#686c7e',
  gray300: '#9298aa',
  gray200: '#c4c8d8',
  gray100: '#e8ebf5',
  gray50:  '#f4f6ff',
  accent:  '#3b82f6',
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface RelayProfile {
  name: string;
  relay: RelaySettings;
}

/** Direct orochi WS session settings (voice/video, typing, reactions, E2EE). */
export interface BridgeSettings {
  enabled: boolean;
  /** Bridge WebSocket URL. '' = auto node probing. */
  wsUrl: string;
  account: string;
  password: string;
  autoJoinMedia: boolean;
  /** Publish this device's E2EE key + allow encrypted DM composition. */
  e2eeDms: boolean;
}

export const DEFAULT_BRIDGE: BridgeSettings = {
  enabled: false,
  wsUrl: '',
  account: '',
  password: '',
  autoJoinMedia: false,
  e2eeDms: false,
};

export interface AppSettings {
  relay: RelaySettings;
  profiles: RelayProfile[];
  bridge: BridgeSettings;
  theme: ThemeId;
  customColors: CustomColors;
  fontFamily: string;
  watermarkOpacity: number;
  bgImage: string;
  bgOpacity: number;
  bgBlur: number;
  bgTint: string;
  bgTintOpacity: number;
  sidebarWidth: number;
  fontSize: number;
  timestampFormat: '12h' | '24h' | 'off' | 'relative';
  compactMode: boolean;
  inlineImages: boolean;
  notifications: boolean;
  notificationSound: boolean;
  readOnFocus: boolean;
  joinPartMsgs: boolean;
  colorNicks: boolean;
  showPrefixes: boolean;
  autoReconnect: boolean;
  readMarker: boolean;
  onlyUnread: boolean;
  customCSS: string;
  highlightWords: string[];
  uploadUrl: string;
  tenorApiKey: string;
  animateThemes: boolean;
}

export const DEFAULT_RELAY: RelaySettings = {
  host: 'eshmaki.me',
  port: 9001,
  tls: true,
  password: '',
  compression: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  relay: { ...DEFAULT_RELAY },
  profiles: [],
  bridge: { ...DEFAULT_BRIDGE },
  theme: 'retro',
  customColors: { ...DEFAULT_CUSTOM_COLORS },
  fontFamily: 'system',
  watermarkOpacity: 15,
  bgImage: '',
  bgOpacity: 40,
  bgBlur: 0,
  bgTint: '',
  bgTintOpacity: 30,
  sidebarWidth: 240,
  fontSize: 14,
  timestampFormat: '24h',
  compactMode: false,
  inlineImages: true,
  notifications: true,
  notificationSound: false,
  readOnFocus: true,
  joinPartMsgs: true,
  colorNicks: true,
  showPrefixes: true,
  autoReconnect: true,
  readMarker: true,
  onlyUnread: false,
  customCSS: '',
  highlightWords: [],
  uploadUrl: 'https://eshmaki.me/upload',
  tenorApiKey: 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ',
  animateThemes: true,
};

// ---------------------------------------------------------------------------
// Buffer state
// ---------------------------------------------------------------------------

export interface TypingInfo {
  state: 'active' | 'paused';
  expiry: number;
}

export interface Reaction {
  emoji: string;
  nicks: string[];
}

/** Nicklist privilege tier labels, in display order. */
export type NickTier = 'Owner' | 'Admin' | 'Op' | 'Halfop' | 'Voice' | 'Regular';

/**
 * Per-buffer state entry held in the buffers store.
 *
 * Uses plain-object collections (Record / array) instead of Map/Set so Solid
 * store proxies can track them fine-grained.
 */
export interface BufferEntry {
  buffer: WeeChatBuffer;
  lines: WeeChatLine[];
  /** Line-id presence index (dedup); optimistic `_opt_` ids are never added. */
  lineIds: Record<string, true>;
  /** Nicklist keyed by nick name. */
  nicks: Record<string, WeeChatNick>;
  /** Tier label -> sorted nicks; keys inserted in NickTier display order. */
  nickGroups: Record<string, WeeChatNick[]>;
  unread: number;
  highlighted: number;
  lastSeen?: Date;
  loading: boolean;
  /** nick -> typing state with expiry timestamp (ms). */
  typing: Record<string, TypingInfo>;
  /** msgid -> reactions. */
  reactions: Record<string, Reaction[]>;
  /** msgid -> line, for reply/reaction lookup. */
  msgIndex: Record<string, WeeChatLine>;
  /** Active channel mode letters. */
  modes: string[];
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export type ModalType =
  | 'connect'
  | 'settings'
  | 'bufferSwitcher'
  | 'help'
  | 'about'
  | 'channelInfo'
  | 'userProfile'
  | 'services'
  | 'channelList'
  | 'operConsole'
  | null;

export type SplitMode = 'none' | 'horizontal' | 'vertical';
