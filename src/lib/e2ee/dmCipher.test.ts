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
  const tampered = new Uint8Array(body!);
  tampered[byteIndex] = tampered[byteIndex]! ^ 0x01;
  return `${ENVELOPE_PREFIX}${toB64url(tampered)}`;
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

  it('fails closed to null for tampered nonce and ciphertext bodies', async () => {
    // Arrange
    const alice = await createIdentity();
    const bob = await createIdentity();
    const envelope = await asIdentity(alice, () => sealDm(bob.keys.publicB64, 'do not reveal'));
    expect(envelope).not.toBeNull();
    const nonceTampered = tamperEnvelope(envelope!, 0);
    const ciphertextTampered = tamperEnvelope(envelope!, ENVELOPE_PREFIX.length);

    // Act
    const nonceResult = await asIdentity(bob, () => openDm(alice.keys.publicB64, nonceTampered));
    const ciphertextResult = await asIdentity(bob, () => openDm(alice.keys.publicB64, ciphertextTampered));

    // Assert
    expect(nonceResult).toBeNull();
    expect(ciphertextResult).toBeNull();
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
});
