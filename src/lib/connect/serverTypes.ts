/**
 * First-class connect server types, verified against onyx-server
 * `docs/reference/config.md` (`[listen]`, `[tls]`) and DarkBear's stack.
 *
 * Implemented as connect paths (see SessionKind A/B/C/D):
 *   1. weechat   — WeeChat binary `weechat` relay over WS/WSS (kind A, or B
 *                  when the user opts into extras)
 *   2. onyx-wss  — First-class Onyx WSS (`[listen].ws`, typically 8080) — kind C.
 *                  Optional expander adds a WeeChat relay (kind B).
 *   3. onyx-tls  — Implicit TLS IRC (`[tls]` default 6697) — kind D. Browser
 *                  cannot open raw TCP. Current Tauri shell cannot either.
 *
 * Documented, never offered as connect types:
 *   - `[listen].irc` plain IRC (often 6667) — dev/LAN; mixed content on HTTPS
 *   - `[listen].s2s` mesh
 *   - WebTransport/HTTP3 (`[listen].webtransport`)
 *   - webhook HTTP
 *   - native UDP media ports
 *   - WeeChat HTTP `api` relay
 *
 * Never offer STARTTLS. Production WSS only; `ws_plain` is loopback/dev.
 */

export const CONNECT_SERVER_TYPES = ['weechat', 'onyx-wss', 'onyx-tls'] as const;
export type ConnectServerType = (typeof CONNECT_SERVER_TYPES)[number];

/** Listeners DarkBear must not present as a connect control. */
export const NON_CONNECT_LISTENERS = [
  's2s',
  'webtransport',
  'webhook',
  'udp-media',
  'weechat-api',
  'onyx-plain',
] as const;

export function canOpenOnyxTlsIrc(): boolean {
  // No native TLS TCP socket is exposed to the SolidJS client (browser or
  // current Tauri allowlist). Users should attach via WeeChat or WSS.
  return false;
}

export function canOpenOnyxPlainIrc(): boolean {
  return false;
}

export function isConnectableServerType(type: ConnectServerType): boolean {
  if (type === 'onyx-tls') return canOpenOnyxTlsIrc();
  return true;
}

export function defaultSetupTab(type: ConnectServerType): 'weechat' | 'proxy' | 'totp' | 'onyx' | 'tls' {
  if (type === 'onyx-tls') return 'tls';
  if (type === 'onyx-wss') return 'onyx';
  return 'weechat';
}

export function setupTabsForType(type: ConnectServerType): ReadonlyArray<'weechat' | 'proxy' | 'totp' | 'onyx' | 'tls'> {
  if (type === 'onyx-tls') return ['tls', 'onyx', 'weechat'];
  if (type === 'onyx-wss') return ['onyx', 'weechat', 'proxy'];
  return ['weechat', 'proxy', 'totp', 'onyx'];
}
