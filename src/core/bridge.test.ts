// @vitest-environment jsdom
//
// Focused unit tests for the pure parts of the orochi bridge: activation
// predicate, relay↔bridge channel mapping, reaction dedupe guard, identity
// resolution, and the E2EE decrypted-text overlay.

import { describe, expect, it } from 'vitest';
import type { BufferEntry, Reaction } from '@/types';
import {
  bridgeShouldRun,
  findChannelPtr,
  hasReaction,
  randomGuestNick,
  relayOwnNick,
  resolveMappedPtr,
  serverNameOf,
  sweepChannelBuffers,
} from './bridge';
import { _storeDecryptedOverlay, decryptedFor } from '@/state/bridge';

// ── fixtures ────────────────────────────────────────────────────────────────

function entry(id: string, localVars: Record<string, string>, name = ''): BufferEntry {
  return {
    buffer: {
      id,
      number: 1,
      name,
      fullName: name,
      shortName: localVars['channel'] ?? '',
      title: '',
      type: 0,
      nicksCount: 0,
      localVars,
      notify: 0,
      hidden: false,
    },
    lines: [],
    lineIds: {},
    nicks: {},
    nickGroups: {},
    unread: 0,
    highlighted: 0,
    lastSeen: undefined,
    loading: false,
    typing: {},
    reactions: {},
    msgIndex: {},
    modes: [],
  };
}

const buffers: Record<string, BufferEntry> = {
  '0x1': entry('0x1', { type: 'server', server: 'eshmaki', nick: 'kain' }, 'irc.server.eshmaki'),
  '0x2': entry('0x2', { type: 'channel', server: 'eshmaki', channel: '#Root', nick: 'kain' }, 'irc.eshmaki.#Root'),
  '0x3': entry('0x3', { type: 'channel', server: 'eshmaki', channel: '#dev' }, 'irc.eshmaki.#dev'),
  '0x4': entry('0x4', { type: 'server', server: 'libera', nick: 'otherme' }, 'irc.server.libera'),
  '0x5': entry('0x5', { type: 'channel', server: 'libera', channel: '#linux' }, 'irc.libera.#linux'),
  '0x6': entry('0x6', { type: 'private', server: 'eshmaki', channel: 'Trev' }, 'irc.eshmaki.trev'),
};

const orochi = new Set(['eshmaki']);

// ── activation predicate ────────────────────────────────────────────────────

describe('bridgeShouldRun', () => {
  it('requires the bridge to be enabled', () => {
    expect(bridgeShouldRun(false, true, 'wss://x')).toBe(false);
    expect(bridgeShouldRun(false, false, '')).toBe(false);
  });

  it('runs when enabled and orochi was detected on the relay', () => {
    expect(bridgeShouldRun(true, true, '')).toBe(true);
  });

  it('runs when enabled and an endpoint is pinned (no detection needed)', () => {
    expect(bridgeShouldRun(true, false, 'wss://eshmaki.me:8080')).toBe(true);
  });

  it('stays off when enabled but neither detected nor pinned', () => {
    expect(bridgeShouldRun(true, false, '')).toBe(false);
    expect(bridgeShouldRun(true, false, '   ')).toBe(false);
  });
});

// ── channel mapping ─────────────────────────────────────────────────────────

describe('channel mapping', () => {
  it('serverNameOf prefers local vars, falls back to buffer name patterns', () => {
    expect(serverNameOf(buffers['0x1']!)).toBe('eshmaki');
    expect(serverNameOf(entry('x', {}, 'irc.server.meshnode'))).toBe('meshnode');
    expect(serverNameOf(entry('x', {}, 'irc.meshnode.#chan'))).toBe('meshnode');
    expect(serverNameOf(entry('x', {}, 'core.weechat'))).toBe('');
  });

  it('sweepChannelBuffers only mirrors channels on detected orochi servers', () => {
    const swept = sweepChannelBuffers(buffers, orochi);
    expect(swept).toEqual([
      { channel: '#Root', ptr: '0x2' },
      { channel: '#dev', ptr: '0x3' },
    ]);
  });

  it('findChannelPtr matches server + channel case-insensitively', () => {
    expect(findChannelPtr(buffers, 'Eshmaki', '#root')).toBe('0x2');
    expect(findChannelPtr(buffers, 'eshmaki', '#linux')).toBeNull();
    expect(findChannelPtr(buffers, 'libera', '#linux')).toBe('0x5');
  });

  it('resolveMappedPtr maps channels through the mirror map', () => {
    const map = new Map([['#root', '0x2'], ['#dev', '0x3']]);
    expect(resolveMappedPtr(map, buffers, '#Root')).toBe('0x2');
    expect(resolveMappedPtr(map, buffers, '#ROOT')).toBe('0x2');
    expect(resolveMappedPtr(map, buffers, '#unmapped')).toBeNull();
  });

  it('resolveMappedPtr maps DM nicks through relay private buffers', () => {
    const map = new Map<string, string>();
    expect(resolveMappedPtr(map, buffers, 'trev')).toBe('0x6');
    expect(resolveMappedPtr(map, buffers, 'TREV')).toBe('0x6');
    expect(resolveMappedPtr(map, buffers, 'nobody')).toBeNull();
  });
});

// ── identity resolution ─────────────────────────────────────────────────────

describe('identity resolution', () => {
  it('relayOwnNick reads the orochi server buffer nick, not other networks', () => {
    expect(relayOwnNick(buffers, orochi)).toBe('kain');
    expect(relayOwnNick(buffers, new Set(['libera']))).toBe('otherme');
  });

  it('relayOwnNick accepts any server buffer when nothing is detected (pinned mode)', () => {
    const nick = relayOwnNick(buffers, new Set());
    expect(nick === 'kain' || nick === 'otherme').toBe(true);
  });

  it('relayOwnNick returns null with no server buffers', () => {
    expect(relayOwnNick({}, orochi)).toBeNull();
  });

  it('randomGuestNick is darkbear-prefixed with a numeric suffix', () => {
    expect(randomGuestNick()).toMatch(/^darkbear\d{4}$/);
  });
});

// ── reaction dedupe guard ───────────────────────────────────────────────────

describe('hasReaction', () => {
  const reactions: Record<string, Reaction[]> = {
    abc123: [
      { emoji: '👍', nicks: ['Kain', 'trev'] },
      { emoji: '🔥', nicks: ['trev'] },
    ],
  };

  it('finds an existing (msgid, emoji, nick) triple case-insensitively', () => {
    expect(hasReaction(reactions, 'abc123', '👍', 'kain')).toBe(true);
    expect(hasReaction(reactions, 'abc123', '👍', 'TREV')).toBe(true);
  });

  it('misses on a different emoji, nick, or msgid', () => {
    expect(hasReaction(reactions, 'abc123', '🔥', 'kain')).toBe(false);
    expect(hasReaction(reactions, 'abc123', '👍', 'nobody')).toBe(false);
    expect(hasReaction(reactions, 'zzz', '👍', 'kain')).toBe(false);
  });

  it('handles missing reaction state', () => {
    expect(hasReaction(undefined, 'abc123', '👍', 'kain')).toBe(false);
    expect(hasReaction({}, 'abc123', '👍', 'kain')).toBe(false);
  });
});

// ── decrypted overlay ───────────────────────────────────────────────────────

describe('decryptedFor overlay', () => {
  it('returns null for plain (non-envelope) text', () => {
    expect(decryptedFor('id1', 'hello world')).toBeNull();
    expect(decryptedFor(undefined, 'hello world')).toBeNull();
  });

  it('returns null for an unknown envelope without throwing', () => {
    expect(decryptedFor(undefined, 'TSUMUGI1 AAAA_unknown')).toBeNull();
  });

  it('resolves by msgid once stored', () => {
    _storeDecryptedOverlay('msg-1', 'TSUMUGI1 cipherA', 'secret hi');
    expect(decryptedFor('msg-1', 'TSUMUGI1 something-else')).toBe('secret hi');
  });

  it('resolves by exact ciphertext when the msgid is unknown', () => {
    _storeDecryptedOverlay(undefined, 'TSUMUGI1 cipherB', 'outbound text');
    expect(decryptedFor(undefined, 'TSUMUGI1 cipherB')).toBe('outbound text');
    expect(decryptedFor('no-such-id', 'TSUMUGI1 cipherB')).toBe('outbound text');
  });

  it('prefers the msgid overlay over the ciphertext overlay', () => {
    _storeDecryptedOverlay('msg-2', 'TSUMUGI1 cipherC', 'by-id');
    _storeDecryptedOverlay(undefined, 'TSUMUGI1 cipherD', 'by-cipher');
    expect(decryptedFor('msg-2', 'TSUMUGI1 cipherD')).toBe('by-id');
  });
});
