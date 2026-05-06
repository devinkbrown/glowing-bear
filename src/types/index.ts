// App-wide shared type definitions

export type ThemeName =
  | 'darkbear' | 'midnight' | 'obsidian' | 'nord' | 'gruvbox' | 'rose-pine'
  | 'abyss' | 'ember' | 'aurora' | 'catppuccin' | 'tokyo-night'
  | 'dracula' | 'solarized' | 'starfield' | 'light' | 'custom';

export interface CustomThemeColors {
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

export const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
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

export interface RelayProfile {
  name: string;
  relay: RelaySettings;
}

export interface RelaySettings {
  host: string;
  port: number;
  tls: boolean;
  password: string;
  compression: boolean;
}

export interface TypingEntry {
  state: 'active' | 'paused';
  expiry: number;
}

export interface Reaction {
  emoji: string;
  nicks: string[];
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  AUTHENTICATING = 'authenticating',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

export interface WeeChatBuffer {
  id: string;
  number: number;
  name: string;
  fullName: string;
  shortName: string;
  title: string;
  type: number;
  nicksCount: number;
  localVars: Record<string, string>;
  notify: number;
  hidden: boolean;
}

export interface WeeChatLine {
  id: string;
  buffer: string;
  date: Date;
  datePrinted: Date;
  displayed: boolean;
  highlight: boolean;
  tags: string[];
  prefix: string;
  message: string;
  nick?: string;
  isAction?: boolean;
  isSelf?: boolean;
  isNotice?: boolean;
  isJoin?: boolean;
  isPart?: boolean;
  isQuit?: boolean;
  isNick?: boolean;
  isTopic?: boolean;
  isMode?: boolean;
  isTagMsg?: boolean;
  isWhisper?: boolean;
  ircTags: Map<string, string>;
  msgid?: string;
  replyTo?: string;
  account?: string;
}

export interface WeeChatNick {
  id: string;
  pointer: string;
  level: number;
  name: string;
  color: string;
  prefix: string;
  prefixColor: string;
  visible: boolean;
  group?: boolean;
}

export interface WeeChatHotlist {
  buffer: string;
  count: [number, number, number, number];
}

export interface BufferEntry {
  buffer: WeeChatBuffer;
  lines: WeeChatLine[];
  nicks: Map<string, WeeChatNick>;
  nickGroups: Map<string, WeeChatNick[]>;
  unread: number;
  highlighted: number;
  lastSeen?: Date;
  loading: boolean;
  typing: Map<string, TypingEntry>;
  reactions: Map<string, Reaction[]>;
  msgIndex: Map<string, WeeChatLine>;
  modes: Set<string>;
}

export interface AppSettings {
  relay: RelaySettings;
  profiles: RelayProfile[];
  theme: ThemeName;
  customColors: CustomThemeColors;
  fontFamily: string;
  watermarkOpacity: number;
  bgImage: string;
  bgOpacity: number;
  bgBlur: number;
  bgTint: string;
  bgTintOpacity: number;
  enableVideoCalls: boolean;
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
  turnUrl: string;
  turnUsername: string;
  turnCredential: string;
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
  theme: 'starfield',
  customColors: { ...DEFAULT_CUSTOM_COLORS },
  fontFamily: 'system',
  watermarkOpacity: 15,
  bgImage: '',
  bgOpacity: 40,
  bgBlur: 0,
  bgTint: '',
  bgTintOpacity: 30,
  enableVideoCalls: true,
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
  tenorApiKey: '',
  turnUrl: '',
  turnUsername: '',
  turnCredential: '',
  animateThemes: true,
};
