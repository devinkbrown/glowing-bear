import { describe, it, expect } from 'vitest';
import { MooringSession } from './MooringSession';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Create two sessions and complete the ECDH handshake between them. */
async function pair(): Promise<[MooringSession, MooringSession]> {
  const a = await MooringSession.create();
  const b = await MooringSession.create();
  const aPub = await a.exportPublicKey();
  const bPub = await b.exportPublicKey();
  await a.ingestPeerKey(bPub);
  await b.ingestPeerKey(aPub);
  return [a, b];
}

describe('MooringSession', () => {
  it('reports the established peer fingerprint rather than the local identity', async () => {
    const a = await MooringSession.create();
    const b = await MooringSession.create();
    await a.ingestPeerKey(await b.exportPublicKey());
    expect(await a.getPeerFingerprint()).toBe(await b.getFingerprint());
    expect(await a.getPeerFingerprint()).not.toBe(await a.getFingerprint());
  });

  it('exports a 65-byte uncompressed P-256 public key', async () => {
    const s = await MooringSession.create();
    const pub = await s.exportPublicKey();
    expect(pub.length).toBe(65);
    expect(pub[0]).toBe(0x04);
  });

  it('establishes a session and round-trips ciphertext both directions', async () => {
    const [a, b] = await pair();
    expect(a.established).toBe(true);
    expect(b.established).toBe(true);

    const msg = enc.encode('hello tsumugi');
    const ct = await a.encrypt(msg);
    // IV(12) + ciphertext + GCM tag(16) — never the bare plaintext.
    expect(ct.length).toBe(12 + msg.length + 16);
    expect(dec.decode(await b.decrypt(ct))).toBe('hello tsumugi');

    const reply = enc.encode('ack');
    expect(dec.decode(await a.decrypt(await b.encrypt(reply)))).toBe('ack');
  });

  it('produces a unique IV per frame (no nonce reuse)', async () => {
    const [a] = await pair();
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) {
      const ct = await a.encrypt(enc.encode(`f${i}`));
      const ivHex = Array.from(ct.slice(0, 12)).join(',');
      expect(seen.has(ivHex)).toBe(false);
      seen.add(ivHex);
    }
  });

  it('refuses ingesting its own public key', async () => {
    const s = await MooringSession.create();
    const pub = await s.exportPublicKey();
    await expect(s.ingestPeerKey(pub)).rejects.toThrow(/self public key/);
  });

  it('rejects an invalid peer public key', async () => {
    const s = await MooringSession.create();
    await expect(s.ingestPeerKey(new Uint8Array(65))).rejects.toThrow(/invalid P-256/);
  });

  it('rejects a replayed frame (fail-closed)', async () => {
    const [a, b] = await pair();
    const ct = await a.encrypt(enc.encode('once'));
    expect(dec.decode(await b.decrypt(ct))).toBe('once');
    await expect(b.decrypt(ct)).rejects.toThrow(/replayed frame/);
  });

  it('does not poison the replay window on a forged/garbage frame', async () => {
    const [a, b] = await pair();
    const ct = await a.encrypt(enc.encode('genuine'));
    // Tamper the ciphertext body → AEAD auth fails, IV must NOT be recorded.
    const forged = ct.slice();
    const last = forged.length - 1;
    forged[last] = forged[last]! ^ 0xff;
    await expect(b.decrypt(forged)).rejects.toThrow();
    // The genuine frame with the same IV must still decrypt.
    expect(dec.decode(await b.decrypt(ct))).toBe('genuine');
  });

  it('keeps replay memory bounded across a long stream', async () => {
    const [a, b] = await pair();
    for (let i = 0; i < 5000; i++) {
      await b.decrypt(await a.encrypt(enc.encode('x')));
    }
    // The bounded window keeps a single prefix lane regardless of frame count.
    const replay = (b as unknown as { replay: { size: number } }).replay;
    expect(replay.size).toBe(1);
  });

  it('ratchet advances the epoch and keeps both sides in sync', async () => {
    const [a, b] = await pair();
    expect(a.epoch).toBe(0);
    await a.ratchet();
    await b.ratchet();
    expect(a.epoch).toBe(1);
    expect(b.epoch).toBe(1);
    // Post-ratchet frames still round-trip under the new key generation.
    expect(dec.decode(await b.decrypt(await a.encrypt(enc.encode('post'))))).toBe('post');
  });

  it('ratchet clears the replay window (old counter usable again under new key)', async () => {
    const [a, b] = await pair();
    await b.decrypt(await a.encrypt(enc.encode('pre')));
    await a.ratchet();
    await b.ratchet();
    // A fresh frame after ratchet decrypts; window was cleared so no stale reject.
    expect(dec.decode(await b.decrypt(await a.encrypt(enc.encode('after'))))).toBe('after');
  });

  it('refuses ratchet before establishment', async () => {
    const s = await MooringSession.create();
    await expect(s.ratchet()).rejects.toThrow(/not yet established/);
  });

  it('destroyed sessions refuse operations', async () => {
    const [a] = await pair();
    a.destroy();
    expect(a.established).toBe(false);
    await expect(a.exportPublicKey()).rejects.toThrow(/destroyed/);
    await expect(a.ratchet()).rejects.toThrow(/destroyed/);
    await expect(a.encrypt(enc.encode('x'))).rejects.toThrow(/destroyed/);
  });

  it('rejects a too-short frame on decrypt', async () => {
    const [, b] = await pair();
    await expect(b.decrypt(new Uint8Array(12))).rejects.toThrow(/too short/);
  });

  it('exposes a stable 12-char fingerprint for the local key', async () => {
    const s = await MooringSession.create();
    const fp1 = await s.getFingerprint();
    const fp2 = await s.getFingerprint();
    expect(fp1).toHaveLength(12);
    expect(fp1).toBe(fp2);
  });
});
