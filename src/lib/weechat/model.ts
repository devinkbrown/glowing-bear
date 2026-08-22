// Protocol-facing domain types for the WeeChat relay layer.
// Extracted from the old app's src/types/index.ts — ONLY the types the
// relay client and protocol utilities need. App/UI settings types live in
// the store layer, not here.

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  AUTHENTICATING = 'authenticating',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

export interface RelaySettings {
  host: string;
  port: number;
  tls: boolean;
  password: string;
  compression: boolean;
  /** WebSocket path without a leading slash. Default `weechat`. */
  path: string;
}

/** Session-only dial options that must never be persisted. */
export interface RelayDialSettings extends RelaySettings {
  totp?: string;
}

export const DEFAULT_RELAY: RelaySettings = {
  host: 'eshmaki.me',
  port: 9001,
  tls: true,
  password: '',
  compression: true,
  path: 'weechat',
};

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

/** Alias — the store layer refers to hotlist rows as HotlistEntry. */
export type HotlistEntry = WeeChatHotlist;
