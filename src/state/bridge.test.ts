// @vitest-environment jsdom
//
// Bridge store API over a fake BridgeBackend, plus a REAL end-to-end E2EE DM
// round-trip through dmCipher (fake-indexeddb). The round-trip is the guard
// that would have caught the corrupted ENVELOPE_PREFIX (stray \x01) — it seals
// with the real cipher and opens the exact wire envelope back.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canE2ee,
  dmSecurityFor,
  forgetPeerDmTrust,
  decryptedFor,
  markRead,
  sendReactionTag,
  sendTyping,
  sendE2eeDm,
  verifyPeerDmKey,
  _setBridgeBackend,
  _setBridgeCryptoScope,
  _setBridgeState,
  _setPeerDmKey,
  _ingestEncryptedDm,
  _storeDecryptedOverlay,
  _resetBridgeCrypto,
  _bridgeCryptoSizes,
  type BridgeBackend,
} from './bridge';
import { updateBridge, resetSettings } from './settings';
import { clearBuffers, upsertBuffer, buffersState } from './buffers';
import { deviceKeys, sealDm, _resetDeviceKeysForTests, _resetSharedKeysForTests } from '@/lib/e2ee/dmCipher';
import type { WeeChatBuffer } from '@/lib/weechat/model';

function chanBuffer(id: string, channel: string): WeeChatBuffer {
  return {
    id, number: 2, name: `irc.eshmaki.${channel}`, fullName: `irc.eshmaki.${channel}`,
    shortName: channel, title: '', type: 0,
    localVars: { type: 'channel', server: 'eshmaki', channel }, nicksCount: 0, notify: 0, hidden: false,
  };
}

function makeBackend(over: Partial<BridgeBackend> = {}): BridgeBackend & { [K in keyof BridgeBackend]: ReturnType<typeof vi.fn> } {
  return {
    ready: vi.fn(() => true),
    ownNick: vi.fn(() => 'me'),
    targetForBuffer: vi.fn((ptr: string) => (ptr === '0xchan' ? '#room' : null)),
    sendTagmsg: vi.fn(() => true),
    sendPrivmsg: vi.fn(() => true),
    sendRaw: vi.fn(() => true),
    requestPeerDmKey: vi.fn(),
    ensureReady: vi.fn(),
    ...over,
  } as never;
}

beforeEach(() => {
  clearBuffers();
  resetSettings();
  _setBridgeBackend(null);
  _setBridgeState({ status: 'off', nick: null, error: null, e2eeReady: false });
  upsertBuffer(chanBuffer('0xchan', '#room'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('typing / reactions / read markers', () => {
  it('sendTyping maps the buffer to its Onyx Server target', () => {
    const be = makeBackend();
    _setBridgeBackend(be);
    sendTyping('0xchan', 'active');
    expect(be.sendTagmsg).toHaveBeenCalledWith('#room', { '+typing': 'active' });
  });

  it('sendTyping is a no-op when the backend is not ready', () => {
    const be = makeBackend({ ready: vi.fn(() => false) });
    _setBridgeBackend(be);
    sendTyping('0xchan', 'active');
    expect(be.sendTagmsg).not.toHaveBeenCalled();
  });

  it('sendTyping is a no-op for an unmapped buffer', () => {
    const be = makeBackend();
    _setBridgeBackend(be);
    sendTyping('0xnope', 'active');
    expect(be.sendTagmsg).not.toHaveBeenCalled();
  });

  it('sendReactionTag sends the tag AND optimistically adds the reaction exactly once', () => {
    const be = makeBackend();
    _setBridgeBackend(be);
    sendReactionTag('0xchan', 'MID1', '👍');
    expect(be.sendTagmsg).toHaveBeenCalledWith('#room', { '+draft/react': '👍', '+draft/reply': 'MID1' });
    const reactions = buffersState.buffers['0xchan']?.reactions['MID1'];
    expect(reactions).toEqual([{ emoji: '👍', nicks: ['me'] }]);
  });

  it('sendReactionTag does not double-apply when called twice for the same nick', () => {
    const be = makeBackend();
    _setBridgeBackend(be);
    sendReactionTag('0xchan', 'MID1', '👍');
    sendReactionTag('0xchan', 'MID1', '👍');
    expect(buffersState.buffers['0xchan']?.reactions['MID1']).toEqual([{ emoji: '👍', nicks: ['me'] }]);
  });

  it('does not add an optimistic reaction when the socket rejects the TAGMSG', () => {
    const be = makeBackend({ sendTagmsg: vi.fn(() => false) });
    _setBridgeBackend(be);

    sendReactionTag('0xchan', 'MID1', '👍');

    expect(be.sendTagmsg).toHaveBeenCalledWith('#room', { '+draft/react': '👍', '+draft/reply': 'MID1' });
    expect(buffersState.buffers['0xchan']?.reactions['MID1']).toBeUndefined();
  });

  it('markRead sends MARKREAD with an ISO timestamp', () => {
    const be = makeBackend();
    _setBridgeBackend(be);
    markRead('0xchan');
    expect(be.sendRaw).toHaveBeenCalledTimes(1);
    const args = be.sendRaw.mock.calls[0]!;
    expect(args[0]).toBe('MARKREAD');
    expect(args[1]).toBe('#room');
    expect(args[2]).toMatch(/^timestamp=\d{4}-\d\d-\d\dT/);
  });
});

describe('decryptedFor overlay precedence', () => {
  it('returns null for an unknown non-envelope', () => {
    expect(decryptedFor('MID', 'plain text')).toBeNull();
  });

  it('resolves by msgid, and falls back to the ciphertext key', () => {
    const cipher = 'TSUMUGI1 AAAA';
    // A decrypted message registers under BOTH keys (same plaintext).
    _storeDecryptedOverlay('MID', cipher, 'plain');
    expect(decryptedFor('MID', cipher)).toBe('plain'); // hit by msgid
    expect(decryptedFor(undefined, cipher)).toBe('plain'); // hit by ciphertext
    expect(decryptedFor('OTHER', cipher)).toBe('plain'); // msgid miss → ciphertext hit
  });

  it('resolves a ciphertext-only overlay (no msgid on the wire)', () => {
    const cipher = 'TSUMUGI1 BBBB';
    _storeDecryptedOverlay(undefined, cipher, 'echo-plain');
    expect(decryptedFor(undefined, cipher)).toBe('echo-plain');
    expect(decryptedFor('ANY', cipher)).toBe('echo-plain');
  });
});

describe('canE2ee', () => {
  it('is false before a peer key is known and true after', () => {
    expect(canE2ee('trev')).toBe(false);
    _setPeerDmKey('trev', 'BSomeKeyB64');
    expect(canE2ee('trev')).toBe(true);
    expect(canE2ee('TREV')).toBe(true); // case-insensitive
  });

  it('goes false again when the key is cleared', () => {
    _setPeerDmKey('trev', 'BSomeKeyB64');
    _setPeerDmKey('trev', null);
    expect(canE2ee('trev')).toBe(false);
  });
});

describe('peer key verification', () => {
  it('pins a valid peer key and detects a later rotation without trusting it', async () => {
    const scope = `wss://trust-${Date.now()}.example/irc\nme`;
    _setBridgeCryptoScope(scope);
    const first = await deviceKeys();
    expect(first).not.toBeNull();
    _setPeerDmKey('alice', first!.publicB64);

    for (let index = 0; index < 20 && dmSecurityFor('alice').status === 'loading'; index++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(dmSecurityFor('alice').status).toBe('unverified');
    expect(await verifyPeerDmKey('alice')).toBe(true);
    expect(dmSecurityFor('alice').status).toBe('verified');

    const rotatedRaw = new Uint8Array(65);
    rotatedRaw[0] = 0x04;
    crypto.getRandomValues(rotatedRaw.subarray(1));
    const rotated = btoa(String.fromCharCode(...rotatedRaw))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    _setPeerDmKey('ALICE', rotated);
    for (let index = 0; index < 20 && dmSecurityFor('alice').status === 'loading'; index++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(dmSecurityFor('alice').status).toBe('changed');
    expect(dmSecurityFor('alice').currentFingerprint)
      .not.toBe(dmSecurityFor('alice').pinnedFingerprint);
  });

  it('can remove a verification without deleting the observed peer key', async () => {
    const scope = `wss://forget-${Date.now()}.example/irc\nme`;
    _setBridgeCryptoScope(scope);
    const key = await deviceKeys();
    _setPeerDmKey('bob', key!.publicB64);
    expect(await verifyPeerDmKey('bob')).toBe(true);
    expect(await forgetPeerDmTrust('bob')).toBe(true);
    for (let index = 0; index < 20 && dmSecurityFor('bob').status === 'loading'; index++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(dmSecurityFor('bob').status).toBe('unverified');
    expect(canE2ee('bob')).toBe(true);
  });
});

describe('_resetBridgeCrypto / session teardown', () => {
  it('wipes cached peer keys and decrypted overlays', () => {
    _setPeerDmKey('trev', 'BSomeKeyB64');
    _storeDecryptedOverlay('MID', 'ENVELOPE', 'secret');
    expect(canE2ee('trev')).toBe(true);
    expect(decryptedFor('MID', 'ENVELOPE')).toBe('secret');

    _resetBridgeCrypto();

    expect(canE2ee('trev')).toBe(false);
    expect(decryptedFor('MID', 'ENVELOPE')).toBeNull();
  });

  it('is triggered when the session drops to off (no cross-session leak)', () => {
    _setPeerDmKey('peer', 'BSomeKeyB64');
    _storeDecryptedOverlay('MID2', 'ENV2', 'plain');

    _setBridgeState({ status: 'off' });

    expect(canE2ee('peer')).toBe(false);
    expect(decryptedFor('MID2', 'ENV2')).toBeNull();
  });
});

describe('per-session growth bounds (H1 retention window)', () => {
  // Mirrors MAX_OVERLAYS in bridge.ts (tied to buffers' MAX_LINES = 5000).
  const MAX_OVERLAYS = 5000;

  it('caps the decrypted-overlay index and evicts the oldest plaintext FIFO', () => {
    const overshoot = 50;
    for (let i = 0; i < MAX_OVERLAYS + overshoot; i++) {
      _storeDecryptedOverlay(`MID${i}`, `TSUMUGI1 c${i}`, `plain${i}`);
    }

    const sizes = _bridgeCryptoSizes();
    // Bounded: never more records than the retention window.
    expect(sizes.overlayRecords).toBe(MAX_OVERLAYS);
    expect(sizes.overlayKeys).toBe(MAX_OVERLAYS * 2); // m: + c: per record

    // Oldest overshoot records evicted — their plaintext no longer resident.
    expect(decryptedFor('MID0', 'TSUMUGI1 c0')).toBeNull();
    expect(decryptedFor(`MID${overshoot - 1}`, `TSUMUGI1 c${overshoot - 1}`)).toBeNull();
    // Newest still resolvable.
    const last = MAX_OVERLAYS + overshoot - 1;
    expect(decryptedFor(`MID${last}`, `TSUMUGI1 c${last}`)).toBe(`plain${last}`);
  });

  it('caps the attempted-envelope guard so undecryptable envelopes cannot grow it without bound', () => {
    // No peer keys: every decrypt attempt fails, so each cipher stays "attempted"
    // — exactly the path that would leak one guard entry per envelope forever.
    for (let i = 0; i < MAX_OVERLAYS + 100; i++) {
      decryptedFor(`Q${i}`, `TSUMUGI1 q${i}`);
    }
    expect(_bridgeCryptoSizes().attempted).toBeLessThanOrEqual(MAX_OVERLAYS);
  });

  it('_resetBridgeCrypto empties every bounded container (no cross-session residue)', () => {
    _storeDecryptedOverlay('MIDx', 'TSUMUGI1 cx', 'plainx');
    _setPeerDmKey('peerx', 'BKeyB64');
    _ingestEncryptedDm('unkeyed', 'DID', 'TSUMUGI1 parked'); // parks (no key)
    decryptedFor('Qy', 'TSUMUGI1 qy'); // marks an attempt

    const before = _bridgeCryptoSizes();
    expect(before.overlayRecords).toBeGreaterThan(0);
    expect(before.peerKeys).toBeGreaterThan(0);
    expect(before.pendingPeers).toBeGreaterThan(0);
    expect(before.attempted).toBeGreaterThan(0);

    _resetBridgeCrypto();

    expect(_bridgeCryptoSizes()).toEqual({
      overlayKeys: 0,
      overlayRecords: 0,
      attempted: 0,
      peerKeys: 0,
      pendingPeers: 0,
    });
  });
});

describe('E2EE DM round-trip (real cipher, fake-indexeddb)', () => {
  beforeEach(() => {
    _resetDeviceKeysForTests();
    _resetSharedKeysForTests();
  });

  it('seals a DM and the inbound envelope decrypts to the same plaintext', async () => {
    // Our device identity (static-static: sealing to a peer pubkey and opening
    // the same envelope with that pubkey derive the identical AES key).
    const dev = await deviceKeys();
    expect(dev).not.toBeNull();
    const peerPub = dev!.publicB64; // symmetric key with self — exercises full path

    updateBridge({ enabled: true, e2eeDms: true });
    const sent: Array<[string, string]> = [];
    const be = makeBackend({
      ready: vi.fn(() => true),
      sendPrivmsg: vi.fn((target: string, text: string) => {
        sent.push([target, text]);
        return true;
      }),
    });
    _setBridgeBackend(be);
    _setPeerDmKey('peer', peerPub);

    const ok = await sendE2eeDm('peer', 'hello secret');
    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    const envelope = sent[0]![1];
    expect(envelope.startsWith('TSUMUGI1 ')).toBe(true);
    // The wire NEVER carries the plaintext.
    expect(envelope.includes('hello secret')).toBe(false);
    // Our own echo is overlaid immediately (view-only).
    expect(decryptedFor(undefined, envelope)).toBe('hello secret');
  });

  it('an inbound TSUMUGI1 envelope from a keyed peer decrypts via the ingest path', async () => {
    const dev = await deviceKeys();
    const peerPub = dev!.publicB64;
    _setPeerDmKey('peer', peerPub);

    // Build a real envelope exactly as a peer would send it.
    const envelope = await sealDm(peerPub, 'inbound message');
    expect(envelope).not.toBeNull();
    expect(envelope!.startsWith('TSUMUGI1 ')).toBe(true);

    _ingestEncryptedDm('peer', 'DMID', envelope!);
    // decrypt is async — poll the overlay briefly.
    for (let i = 0; i < 20 && decryptedFor('DMID', envelope!) === null; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(decryptedFor('DMID', envelope!)).toBe('inbound message');
  });

  it('parks an envelope with no cached key and requests it, then decrypts on arrival', async () => {
    const dev = await deviceKeys();
    const peerPub = dev!.publicB64;
    const envelope = (await sealDm(peerPub, 'parked note'))!;

    const be = makeBackend();
    _setBridgeBackend(be);
    _ingestEncryptedDm('newpeer', 'DMID2', envelope);
    expect(be.requestPeerDmKey).toHaveBeenCalledWith('newpeer');
    expect(decryptedFor('DMID2', envelope)).toBeNull();

    _setPeerDmKey('newpeer', peerPub); // key lands → parked queue flushes
    for (let i = 0; i < 20 && decryptedFor('DMID2', envelope) === null; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(decryptedFor('DMID2', envelope)).toBe('parked note');
  });

  it('sendE2eeDm returns false and requests the key when the peer key is unknown', async () => {
    updateBridge({ enabled: true, e2eeDms: true });
    const be = makeBackend();
    _setBridgeBackend(be);
    const ok = await sendE2eeDm('strangernick', 'hi');
    expect(ok).toBe(false);
    expect(be.requestPeerDmKey).toHaveBeenCalledWith('strangernick');
  });

  it('sendE2eeDm returns false when e2eeDms is disabled', async () => {
    updateBridge({ enabled: true, e2eeDms: false });
    const dev = await deviceKeys();
    _setPeerDmKey('peer', dev!.publicB64);
    const be = makeBackend();
    _setBridgeBackend(be);
    expect(await sendE2eeDm('peer', 'hi')).toBe(false);
  });

  it('retains E2EE plaintext responsibility when the socket rejects the envelope', async () => {
    updateBridge({ enabled: true, e2eeDms: true });
    const dev = await deviceKeys();
    _setPeerDmKey('peer', dev!.publicB64);
    const be = makeBackend({ sendPrivmsg: vi.fn(() => false) });
    _setBridgeBackend(be);

    expect(await sendE2eeDm('peer', 'keep this secret')).toBe(false);
    const envelope = vi.mocked(be.sendPrivmsg).mock.calls[0]?.[1];
    expect(envelope).toMatch(/^TSUMUGI1 /);
    expect(decryptedFor(undefined, envelope!)).toBeNull();
  });
});
