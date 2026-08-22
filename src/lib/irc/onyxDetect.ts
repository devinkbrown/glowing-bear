/**
 * Onyx Server detection from relay 004/005 text and known node hosts.
 *
 * Auto-bridge (kind B extras) only when this returns true. NETWORK=IRCXNet
 * alone is a historical residual and must NOT trip extras on a generic network.
 * NETWORK=IRCXNet plus an onyx- version token is still Onyx.
 */

import { stripColors } from '@/lib/weechat/strip-colors';
import { NODES, wssUrlForOnyxHost } from './nodes';

export const ONYX_RE = /\bonyx(?:-server)?\b/i;
export const ONYX_VERSION_RE = /\bonyx-/i;
export const ONYX_NETWORK_ONYX_RE = /\bNETWORK=Onyx\b/i;
export const ONYX_NETWORK_IRCXNET_RE = /\bNETWORK=IRCXNet\b/i;
export const ONYX_HOSTS = new Set(NODES.map((node) => node.host.toLowerCase()));

export function isOnyxMyinfo(message: string): boolean {
  const plain = stripColors(message);
  if (ONYX_VERSION_RE.test(plain) || ONYX_RE.test(plain)) return true;
  if (ONYX_NETWORK_ONYX_RE.test(plain)) return true;
  if (ONYX_NETWORK_IRCXNET_RE.test(plain) && ONYX_VERSION_RE.test(plain)) return true;
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
