/**
 * WeeChat relay WebSocket URL helpers.
 *
 * Glowing Bear accepts host, host:port, host:port/path, and [ipv6]:port/path
 * in the hostname field. DarkBear now does the same, and also reads
 * hash/query autoconnect parameters. The scheme is never taken from the host
 * field — TLS is an explicit setting.
 */

import type { RelaySettings } from './model';

export const DEFAULT_RELAY_PATH = 'weechat';

export interface ParsedRelayHost {
  host: string;
  port?: number;
  path?: string;
}

export interface RelayLocationParams {
  host?: string;
  port?: number;
  path?: string;
  tls?: boolean;
  password?: string;
  autoconnect?: boolean;
  passwordFromUrl: boolean;
}

const IPV6_WRAPPED = /^\[([^\]]+)\](?::(\d{1,5}))?(?:\/(.*))?$/;
const HOST_PORT_PATH = /^([^[/\]\s:]+)(?::(\d{1,5}))(?:\/(.*))?$/;
const BARE_HOST = /^([^[/\]\s:]+)$/;

export function normalizeRelayPath(raw?: string | null): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed || DEFAULT_RELAY_PATH;
}

export function formatHostForUrl(host: string): string {
  const cleaned = host.trim().replace(/^\[|\]$/g, '');
  return cleaned.includes(':') ? `[${cleaned}]` : cleaned;
}

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/**
 * Parse a hostname field the way Glowing Bear does. The scheme must not be
 * included; if the user pastes one it is stripped and ignored.
 */
export function parseRelayHostInput(raw: string): ParsedRelayHost | null {
  let value = raw.trim();
  if (!value) return { host: '' };
  value = value.replace(/^(wss|ws|https|http):\/\//i, '');
  if (value.includes('@')) return null;

  const ipv6 = IPV6_WRAPPED.exec(value);
  if (ipv6) {
    const host = ipv6[1] ?? '';
    if (!host) return null;
    const port = ipv6[2] ? Number(ipv6[2]) : undefined;
    const path = ipv6[3] ? normalizeRelayPath(ipv6[3]) : undefined;
    if (path && port === undefined) return null;
    return { host, port, path };
  }

  if (value.includes(':') && value.includes(']') === false && value.split(':').length > 2) {
    // Unwrapped IPv6 is rejected — wrap it in brackets.
    return null;
  }

  const hostPortPath = HOST_PORT_PATH.exec(value);
  if (hostPortPath) {
    const host = hostPortPath[1] ?? '';
    const port = hostPortPath[2] ? Number(hostPortPath[2]) : undefined;
    const path = hostPortPath[3] ? normalizeRelayPath(hostPortPath[3]) : undefined;
    if (!host) return null;
    return { host, port, path };
  }

  // Path without a port is invalid (GB rule).
  if (value.includes('/')) return null;

  const bare = BARE_HOST.exec(value);
  if (!bare?.[1]) return null;
  return { host: bare[1] };
}

export function buildRelayWebSocketUrl(settings: Pick<RelaySettings, 'host' | 'port' | 'tls' | 'path'>): string {
  const scheme = settings.tls ? 'wss' : 'ws';
  const host = formatHostForUrl(settings.host.replace(/^(wss|ws|https|http):\/\//i, ''));
  const path = normalizeRelayPath(settings.path);
  return `${scheme}://${host}:${settings.port}/${path}`;
}

export function mixedContentBlocked(tls: boolean, host: string, secureContext = typeof window !== 'undefined' && window.isSecureContext): boolean {
  if (!secureContext || tls) return false;
  return !isLoopbackHost(host);
}

function readParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value === null || value === '' ? undefined : value;
}

export function parseRelayLocationParams(search: string, hash: string): RelayLocationParams {
  const fromSearch = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash;
  const fromHash = new URLSearchParams(hashBody.includes('=') ? hashBody : '');
  const get = (key: string): string | undefined => readParam(fromHash, key) ?? readParam(fromSearch, key);

  const hostRaw = get('host');
  const parsedHost = hostRaw ? parseRelayHostInput(hostRaw) : null;
  const portRaw = get('port');
  const pathRaw = get('path') ?? parsedHost?.path;
  const tlsRaw = get('tls');
  const password = get('password');
  const autoconnectRaw = get('autoconnect');

  return {
    host: parsedHost?.host ?? hostRaw,
    port: portRaw ? Number(portRaw) : parsedHost?.port,
    path: pathRaw ? normalizeRelayPath(pathRaw) : undefined,
    tls: tlsRaw === undefined ? undefined : tlsRaw === '1' || tlsRaw.toLowerCase() === 'true',
    password,
    autoconnect: autoconnectRaw === '1' || autoconnectRaw?.toLowerCase() === 'true',
    passwordFromUrl: Boolean(password),
  };
}
