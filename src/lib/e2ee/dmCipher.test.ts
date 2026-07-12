// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENVELOPE_PREFIX,
  _resetDeviceKeysForTests,
  _resetSharedKeysForTests,
  deviceKeys,
  fromB64url,
  openDm,
  sealDm,
  toB64url,
  type DeviceKeys,
} from './dmCipher';

type TestIdentity = {
  db: IDBFactory;
  keys: DeviceKeys;
};

function installIdentityDb(db: IDBFactory): void {
  vi.stubGlobal('indexedDB', db);
  _resetDeviceKeysForTests();
  _resetSharedKeysForTests();
}

async function createIdentity(): Promise<TestIdentity> {
  const db = new IDBFactory();
  installIdentityDb(db);
  const keys = await deviceKeys();
  expect(keys).not.toBeNull();
  return { db, keys: keys! };
}

async function asIdentity<T>(identity: TestIdentity, action: () => Promise<T>): Promise<T> {
  installIdentityDb(identity.db);
  return action();
}

function tamperEnvelope(envelope: string, byteIndex: number): string {
  const body = fromB64url(envelope.slice(ENVELOPE_PREFIX.length));
  expect(body).not.toBeNull();
  expect(byteIndex).toBeGreaterThanOrEqual(0);
  expect(byteIndex).toBeLessThan(body!.length);
  const tampered = new Uint8Array(body!);
  tampered[byteIndex] = tampered[byteIndex]! ^ 0x01;
  return `${ENVELOPE_PREFIX}${toB64url(tampered)}`;
}

function envelopeBody(envelope: string): Uint8Array {
  const body = fromB64url(envelope.slice(ENVELOPE_PREFIX.length));
  expect(body).not.toBeNull();
  return body!;
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveManualAesKey(
  sender: DeviceKeys,
  peerPublicB64: string,
): Promise<CryptoKey> {
  const peerRaw = fromB64url(peerPublicB64);
  expect(peerRaw).not.toBeNull();
  const peerKey = await crypto.subtle.importKey(
    'raw',
    exactBuffer(peerRaw!),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerKey },
    sender.keyPair.privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const pair = [sender.publicB64, peerPublicB64].sort();
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('onyx-dm-v1'),
      info: new TextEncoder().encode(`onyx-dm:${pair[0]}:${pair[1]}`),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function manualEnvelope(
  sender: DeviceKeys,
  peerPublicB64: string,
  nonce: Uint8Array,
  plaintext: string,
): Promise<string> {
  expect(nonce).toHaveLength(12);
  const key = await deriveManualAesKey(sender, peerPublicB64);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: exactBuffer(nonce) },
    key,
    exactBuffer(new TextEncoder().encode(plaintext)),
  );
  const body = new Uint8Array(nonce.length + ct.byteLength);
  body.set(nonce, 0);
  body.set(new Uint8Array(ct), nonce.length);
  return `${ENVELOPE_PREFIX}${toB64url(body)}`;
}

beforeEach(() => {
  _resetDeviceKeysForTests();
  _resetSharedKeysForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetDeviceKeysForTests();
  _resetSharedKeysForTests();
});

describe('DM cipher round trips', () => {
  it('opens sealed messages in both directions with the sorted public-key info', async () => {
    // Arrange
    const alice = await createIdentity();
    const bob = await createIdentity();

    // Act
    const aliceToBob = await asIdentity(alice, () => sealDm(bob.keys.publicB64, 'hello from alice'));
    const openedByBob = await asIdentity(bob, () => openDm(alice.keys.publicB64, aliceToBob!));
    const bobToAlice = await asIdentity(bob, () => sealDm(alice.keys.publicB64, 'hello from bob'));
    const openedByAlice = await asIdentity(alice, () => openDm(bob.keys.publicB64, bobToAlice!));

    // Assert
    expect(aliceToBob).toMatch(/^TSUMUGI1 /);
    expect(openedByBob).toBe('hello from alice');
    expect(bobToAlice).toMatch(/^TSUMUGI1 /);
    expect(openedByAlice).toBe('hello from bob');
  });

  it('opens deterministic manual vectors for multiple messages under one static-static key', async () => {
    // Arrange
    const alice = await createIdentity();
    const bob = await createIdentity();
    const replayVectors = [
      {
        nonce: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
        plaintext: 'first history line',
      },
      {
        nonce: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]),
        plaintext: 'second history line',
      },
      {
        nonce: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]),
        plaintext: 'unicode \u2713 survives',
      },
    ];
    const symmetricNonce = Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2]);

    // Act
    const envelopes = await Promise.all(
      replayVectors.map((v) => manualEnvelope(alice.keys, bob.keys.publicB64, v.nonce, v.plaintext)),
    );
    const opened = [];
    for (const envelope of envelopes) {
      opened.push(await asIdentity(bob, () => openDm(alice.keys.publicB64, envelope)));
    }
    const aliceVector = await manualEnvelope(alice.keys, bob.keys.publicB64, symmetricNonce, 'same key');
    const bobVector = await manualEnvelope(bob.keys, alice.keys.publicB64, symmetricNonce, 'same key');
    const openedByAlice = await asIdentity(alice, () => openDm(bob.keys.publicB64, bobVector));

    // Assert
    expect(opened).toEqual(replayVectors.map((v) => v.plaintext));
    expect(envelopes.map((envelope) => Array.from(envelopeBody(envelope).slice(0, 12)))).toEqual(
      replayVectors.map((v) => Array.from(v.nonce)),
    );
    expect(bobVector).toBe(aliceVector);
    expect(openedByAlice).toBe('same key');
  });

  it('uses a unique random IV across many seals under the same peer key', async () => {
    // Arrange
    const alice = await createIdentity();
    const bob = await createIdentity();
    const messageCount = 32;

    // Act
    const envelopes: Array<string | null> = [];
    for (let i = 0; i < messageCount; i++) {
      envelopes.push(await asIdentity(alice, () => sealDm(bob.keys.publicB64, `message ${i}`)));
    }
    const nonces = envelopes.map((envelope) => {
      expect(envelope).not.toBeNull();
      return Array.from(envelopeBody(envelope!).slice(0, 12))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    });
    const openedLast = await asIdentity(
      bob,
      () => openDm(alice.keys.publicB64, envelopes[messageCount - 1]!),
    );

    // Assert
    expect(new Set(nonces)).toHaveLength(messageCount);
    expect(openedLast).toBe(`message ${messageCount - 1}`);
  });

  it('fails closed to null for envelope field tampering', async () => {
    // Arrange
    const alice = await createIdentity();
    const bob = await createIdentity();
    const envelope = await asIdentity(alice, () => sealDm(bob.keys.publicB64, 'do not reveal this body'));
    expect(envelope).not.toBeNull();
    const body = envelopeBody(envelope!);
    const cases = [
      ['prefix', envelope!.replace(ENVELOPE_PREFIX, 'TSUMUGI2 ')],
      ['base64 payload', `${ENVELOPE_PREFIX}not valid base64`],
      ['short body', `${ENVELOPE_PREFIX}${toB64url(new Uint8Array(12))}`],
      ['nonce', tamperEnvelope(envelope!, 0)],
      ['ciphertext', tamperEnvelope(envelope!, 12)],
      ['auth tag', tamperEnvelope(envelope!, body.length - 1)],
    ] as const;

    // Act
    const results: Record<string, string | null> = {};
    for (const [name, candidate] of cases) {
      results[name] = await asIdentity(bob, () => openDm(alice.keys.publicB64, candidate));
    }

    // Assert
    expect(results).toEqual({
      prefix: null,
      'base64 payload': null,
      'short body': null,
      nonce: null,
      ciphertext: null,
      'auth tag': null,
    });
  });

  it('fails closed to null when the caller supplies the wrong peer public key', async () => {
    // Arrange
    const alice = await createIdentity();
    const bob = await createIdentity();
    const mallory = await createIdentity();
    const envelope = await asIdentity(alice, () => sealDm(bob.keys.publicB64, 'secret for bob'));
    expect(envelope).not.toBeNull();

    // Act
    const result = await asIdentity(bob, () => openDm(mallory.keys.publicB64, envelope!));

    // Assert
    expect(result).toBeNull();
  });

  it('fails closed to null for malformed peer public keys before or during import', async () => {
    // Arrange
    const alice = await createIdentity();
    const bob = await createIdentity();
    const envelope = await asIdentity(alice, () => sealDm(bob.keys.publicB64, 'secret for bob'));
    expect(envelope).not.toBeNull();
    const wrongPrefix = new Uint8Array(65);
    wrongPrefix[0] = 0x02;
    const offCurve = new Uint8Array(65);
    offCurve[0] = 0x04;
    const invalidPeers = [
      ['non-base64', '*'],
      ['short key', toB64url(Uint8Array.from([0x04, 0x01, 0x02]))],
      ['wrong SEC1 prefix', toB64url(wrongPrefix)],
      ['off-curve point', toB64url(offCurve)],
    ] as const;

    // Act
    const openResults: Record<string, string | null> = {};
    const sealResults: Record<string, string | null> = {};
    for (const [name, peerPublicB64] of invalidPeers) {
      openResults[name] = await asIdentity(bob, () => openDm(peerPublicB64, envelope!));
      sealResults[name] = await asIdentity(alice, () => sealDm(peerPublicB64, 'must not send'));
    }

    // Assert
    expect(openResults).toEqual({
      'non-base64': null,
      'short key': null,
      'wrong SEC1 prefix': null,
      'off-curve point': null,
    });
    expect(sealResults).toEqual({
      'non-base64': null,
      'short key': null,
      'wrong SEC1 prefix': null,
      'off-curve point': null,
    });
  });

  it('fails closed to null when a different recipient device tries to open the envelope', async () => {
    // Arrange
    const alice = await createIdentity();
    const bob = await createIdentity();
    const mallory = await createIdentity();
    const envelope = await asIdentity(alice, () => sealDm(bob.keys.publicB64, 'secret for bob only'));
    expect(envelope).not.toBeNull();

    // Act
    const wrongRecipient = await asIdentity(mallory, () => openDm(alice.keys.publicB64, envelope!));
    const rightRecipient = await asIdentity(bob, () => openDm(alice.keys.publicB64, envelope!));

    // Assert
    expect(wrongRecipient).toBeNull();
    expect(rightRecipient).toBe('secret for bob only');
  });
});
