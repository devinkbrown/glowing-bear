/**
 * Connect session kinds. Product modes are WeeChat vs Onyx; these four
 * values are the wire/session taxonomy behind that picker.
 *
 *   A weechat-generic  — binary relay only. Hide Onyx chrome. Never auto-bridge.
 *   B weechat-onyx     — relay is chat; optional second WSS extras, same account.
 *   C onyx-direct-wss  — first-class. One socket is chat+media. No WeeChat client.
 *   D onyx-tls-irc     — Tauri later. Do not block C. No TCP in src-tauri today.
 */

import type { ConnectServerType } from './serverTypes';

export const SESSION_KINDS = [
  'weechat-generic',
  'weechat-onyx',
  'onyx-direct-wss',
  'onyx-tls-irc',
] as const;

export type SessionKind = (typeof SESSION_KINDS)[number];

export function isSessionKind(value: unknown): value is SessionKind {
  return typeof value === 'string' && (SESSION_KINDS as readonly string[]).includes(value);
}

/** Peer picker: WeeChat (A, or B if extras) vs Onyx (C). TLS is D. */
export function sessionKindFromConnect(
  type: ConnectServerType,
  hasWeechatRelay: boolean,
): SessionKind {
  if (type === 'onyx-tls') return 'onyx-tls-irc';
  if (type === 'onyx-wss') return hasWeechatRelay ? 'weechat-onyx' : 'onyx-direct-wss';
  return 'weechat-generic';
}

export function usesWeeRelay(kind: SessionKind): boolean {
  return kind === 'weechat-generic' || kind === 'weechat-onyx';
}

/** Kind C: one first-party socket. Never construct WeeRelayClient or a second WSS. */
export function isDirectOnyxSession(kind: SessionKind): boolean {
  return kind === 'onyx-direct-wss';
}

/** Kind B only: optional extras hop beside a live relay. */
export function allowsOnyxExtras(kind: SessionKind): boolean {
  return kind === 'weechat-onyx';
}

/** Kind A hides call/GIF/IRCX chrome even if a 004 later fingerprints Onyx. */
export function hidesOnyxChrome(kind: SessionKind): boolean {
  return kind === 'weechat-generic';
}

export function connectServerTypeForKind(kind: SessionKind): ConnectServerType {
  if (kind === 'onyx-tls-irc') return 'onyx-tls';
  if (kind === 'onyx-direct-wss' || kind === 'weechat-onyx') return 'onyx-wss';
  return 'weechat';
}
