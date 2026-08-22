/**
 * Kind C buffer keys. WeeChat pointers (0x…) must not be used: the first-party
 * session has no relay. Sidebar/header/composer keep consuming WeeChatBuffer.
 */

import type { WeeChatBuffer } from '@/lib/weechat/model';

export const ONYX_BUFFER_PREFIX = 'onyx:';

export function onyxBufferId(server: string, target: string): string {
  const safeServer = (server || 'onyx').replace(/:/g, '_');
  const safeTarget = (target || '*').replace(/:/g, '_');
  return `${ONYX_BUFFER_PREFIX}${safeServer}:${safeTarget}`;
}

export function isOnyxBufferId(id: string): boolean {
  return id.startsWith(ONYX_BUFFER_PREFIX);
}

export function parseOnyxBufferId(id: string): { server: string; target: string } | null {
  if (!isOnyxBufferId(id)) return null;
  const rest = id.slice(ONYX_BUFFER_PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon <= 0) return null;
  const server = rest.slice(0, colon);
  const target = rest.slice(colon + 1);
  if (!server || !target) return null;
  return { server, target };
}

export function onyxBufferTarget(id: string): string | null {
  return parseOnyxBufferId(id)?.target ?? null;
}

export interface MakeOnyxBufferOpts {
  server: string;
  target: string;
  type: 'server' | 'channel' | 'private';
  nick: string;
  number?: number;
  title?: string;
}

export function makeOnyxBuffer(opts: MakeOnyxBufferOpts): WeeChatBuffer {
  const target = opts.type === 'server' ? '*' : opts.target;
  const id = onyxBufferId(opts.server, target);
  const short = opts.type === 'server' ? opts.server : opts.target;
  const name = opts.type === 'server'
    ? `onyx.server.${opts.server}`
    : `onyx.${opts.server}.${opts.target}`;
  return {
    id,
    number: opts.number ?? 1,
    name,
    fullName: name,
    shortName: short,
    title: opts.title ?? (opts.type === 'server' ? opts.server : opts.target),
    type: 0,
    nicksCount: 0,
    localVars: {
      type: opts.type,
      server: opts.server,
      network: opts.server,
      channel: opts.type === 'server' ? '' : opts.target,
      nick: opts.nick,
      plugin: 'onyx',
    },
    notify: 3,
    hidden: false,
  };
}
