import { describe, expect, it } from 'vitest';

import type { WeeChatBuffer } from '@/lib/weechat/model';

import { BUFFER_KIND_LABEL, bufferKind, isIrcBuffer } from './bufferKind';

function makeBuffer(overrides: Partial<WeeChatBuffer> = {}): WeeChatBuffer {
  return {
    id: 'buf-1',
    number: 1,
    name: 'example',
    fullName: 'irc.libera.example',
    shortName: 'example',
    title: '',
    type: 0,
    nicksCount: 0,
    localVars: {},
    notify: 1,
    hidden: false,
    ...overrides,
  };
}

describe('bufferKind', () => {
  it('classifies IRC channel buffers from the local type', () => {
    const buffer = makeBuffer({ localVars: { type: 'channel', plugin: 'irc' } });

    const kind = bufferKind(buffer);

    expect(kind).toBe('channel');
  });

  it('classifies IRC private buffers as queries', () => {
    const buffer = makeBuffer({ localVars: { type: 'private', plugin: 'irc' } });

    const kind = bufferKind(buffer);

    expect(kind).toBe('query');
  });

  it('classifies IRC server buffers from the local type', () => {
    const buffer = makeBuffer({ localVars: { type: 'server', plugin: 'irc' } });

    const kind = bufferKind(buffer);

    expect(kind).toBe('server');
  });

  it('lets the explicit WeeChat buffer type take priority over plugin/name heuristics', () => {
    const channelNamedRaw = makeBuffer({
      fullName: 'irc.libera.raw',
      localVars: { type: 'channel', plugin: 'irc' },
      name: 'raw',
    });
    const queryNamedCore = makeBuffer({
      fullName: '',
      localVars: { type: 'private', plugin: 'core' },
      name: 'weechat',
    });

    expect(bufferKind(channelNamedRaw)).toBe('channel');
    expect(bufferKind(queryNamedCore)).toBe('query');
  });

  it('classifies fset plugin buffers before generic plugins', () => {
    const buffer = makeBuffer({ localVars: { plugin: 'fset' } });

    const kind = bufferKind(buffer);

    expect(kind).toBe('fset');
  });

  it('classifies IRC raw log buffers by name', () => {
    const buffer = makeBuffer({
      fullName: 'irc.libera.raw',
      localVars: { plugin: 'irc' },
      name: 'raw',
    });

    const kind = bufferKind(buffer);

    expect(kind).toBe('raw');
  });

  it('classifies IRC raw logs from the fallback buffer name when fullName is empty', () => {
    const buffer = makeBuffer({
      fullName: '',
      localVars: { plugin: 'irc' },
      name: 'IRC.RAW',
    });

    const kind = bufferKind(buffer);

    expect(kind).toBe('raw');
  });

  it('classifies core buffers by plugin or weechat name', () => {
    const pluginCore = makeBuffer({ localVars: { plugin: 'core' } });
    const namedCore = makeBuffer({ fullName: '', name: 'weechat' });

    const pluginKind = bufferKind(pluginCore);
    const namedKind = bufferKind(namedCore);

    expect(pluginKind).toBe('core');
    expect(namedKind).toBe('core');
  });

  it('falls back to plugin for unrecognized buffers', () => {
    const buffer = makeBuffer({ localVars: { plugin: 'relay' } });

    const kind = bufferKind(buffer);

    expect(kind).toBe('plugin');
  });
});

describe('isIrcBuffer', () => {
  it('returns true only for channel, query, and server buffer kinds', () => {
    expect(isIrcBuffer('channel')).toBe(true);
    expect(isIrcBuffer('query')).toBe(true);
    expect(isIrcBuffer('server')).toBe(true);
    expect(isIrcBuffer('raw')).toBe(false);
    expect(isIrcBuffer('fset')).toBe(false);
    expect(isIrcBuffer('core')).toBe(false);
    expect(isIrcBuffer('plugin')).toBe(false);
  });
});

describe('BUFFER_KIND_LABEL', () => {
  it('provides labels for every buffer kind', () => {
    expect(BUFFER_KIND_LABEL).toEqual({
      channel: 'Channel',
      query: 'Query',
      server: 'Server',
      raw: 'Raw Log',
      fset: 'Settings',
      core: 'Core',
      plugin: 'Plugin',
    });
  });
});
