import type { WeeChatBuffer } from '@/types';

export type BufferKind = 'channel' | 'query' | 'server' | 'raw' | 'fset' | 'core' | 'plugin';

export function bufferKind(buf: WeeChatBuffer): BufferKind {
  const type = buf.localVars['type'] ?? '';
  const plugin = buf.localVars['plugin'] ?? '';
  const name = buf.fullName || buf.name;

  if (type === 'channel') return 'channel';
  if (type === 'private') return 'query';
  if (type === 'server') return 'server';
  if (plugin === 'fset') return 'fset';
  if (plugin === 'irc' && /raw/i.test(name)) return 'raw';
  if (plugin === 'core' || name === 'weechat') return 'core';
  return 'plugin';
}

export function isIrcBuffer(kind: BufferKind): boolean {
  return kind === 'channel' || kind === 'query' || kind === 'server';
}

export const BUFFER_KIND_LABEL: Record<BufferKind, string> = {
  channel: 'Channel',
  query: 'Query',
  server: 'Server',
  raw: 'Raw Log',
  fset: 'Settings',
  core: 'Core',
  plugin: 'Plugin',
};
