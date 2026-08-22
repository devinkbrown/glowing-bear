/**
 * Onyx Server detection from relay 004/005 text and known node hosts.
 * IRCXNet is a historical NETWORK residual — treat it as Onyx. Product copy
 * stays Onyx / Onyx Server; this matcher is a wire fingerprint only.
 */

import { stripColors } from '@/lib/weechat/strip-colors';
import { NODES, wssUrlForOnyxHost } from './nodes';

export const ONYX_RE = /\bonyx(?:-server)?\b/i;
export const ONYX_NETWORK_RE = /\bNETWORK=(?:Onyx|IRCXNet)\b/i;
export const ONYX_HOSTS = new Set(NODES.map((node) => node.host.toLowerCase()));

export function isOnyxMyinfo(message: string): boolean {
  const plain = stripColors(message);
  if (ONYX_RE.test(plain)) return true;
  if (ONYX_NETWORK_RE.test(plain)) return true;
  if (/\bonyx-/.test(plain)) return true;
  for (const token of plain.split(/\s+/).filter(Boolean)) {
    if (ONYX_HOSTS.has(token.toLowerCase())) return true;
  }
  return false;
}

export function onyxGatewayFromMyinfo(message: string): string | undefined {
  const parts = stripColors(message).split(/\s+/).filter(Boolean);
  const host = parts[1] ?? '';
  return wssUrlForOnyxHost(host) ?? undefined;
}
