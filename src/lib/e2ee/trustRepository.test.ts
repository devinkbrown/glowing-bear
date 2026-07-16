import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { toB64url } from './dmCipher';
import { DmTrustRepository, fingerprintDmKey } from './trustRepository';

function publicKey(seed: number): string {
  const raw = new Uint8Array(65);
  raw[0] = 0x04;
  for (let index = 1; index < raw.length; index++) raw[index] = (seed + index) & 0xff;
  return toB64url(raw);
}

describe('DmTrustRepository', () => {
  it('produces a complete, grouped SHA-256 fingerprint for a valid P-256 key', async () => {
    const fingerprint = await fingerprintDmKey(publicKey(3));
    expect(fingerprint).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){15}$/);
    expect(await fingerprintDmKey('not-a-public-key')).toBeNull();
  });

  it('persists pins by endpoint/account scope and case-insensitive peer', async () => {
    const repository = new DmTrustRepository(new IDBFactory());
    const key = publicKey(5);
    const fingerprint = (await fingerprintDmKey(key))!;
    expect(await repository.put({
      scope: 'wss://one.example/irc\nme',
      peer: 'Alice',
      publicKey: key,
      fingerprint,
      verifiedAt: 123,
    })).toBe(true);

    expect(await repository.get('wss://one.example/irc\nme', 'alice')).toMatchObject({
      peer: 'alice',
      publicKey: key,
      fingerprint,
      verifiedAt: 123,
    });
    expect(await repository.get('wss://two.example/irc\nme', 'alice')).toBeNull();
  });

  it('deletes only the requested peer pin', async () => {
    const repository = new DmTrustRepository(new IDBFactory());
    const key = publicKey(7);
    const fingerprint = (await fingerprintDmKey(key))!;
    await repository.put({ scope: 'scope', peer: 'alice', publicKey: key, fingerprint, verifiedAt: 1 });
    await repository.put({ scope: 'scope', peer: 'bob', publicKey: key, fingerprint, verifiedAt: 2 });

    expect(await repository.delete('scope', 'ALICE')).toBe(true);
    expect(await repository.get('scope', 'alice')).toBeNull();
    expect(await repository.get('scope', 'bob')).not.toBeNull();
  });
});
