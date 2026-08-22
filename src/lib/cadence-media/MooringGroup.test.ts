import { describe, it, expect } from 'vitest';
import { MooringGroup } from './MooringGroup';
import { MooringSession } from './MooringSession';
import { WINDOW_BITS, MAX_PREFIXES } from './replayWindow';

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Return a second group holding the *same* group key as `master` but with its
 * own random send-IV prefix — the way a distinct participant behaves on the
 * wire. Uses the real wrap/unwrap path so the key material is genuinely shared.
 */
async function shareKey(master: MooringGroup): Promise<MooringGroup> {
  const a = await MooringSession.create();
  const b = await MooringSession.create();
  await a.ingestPeerKey(await b.exportPublicKey());
  await b.ingestPeerKey(await a.exportPublicKey());
  const wrapped = await master.exportKeyFor(a);
  return MooringGroup.importKey(wrapped, b);
}

describe('MooringGroup', () => {
  it('round-trips a frame under the shared group key', async () => {
    const group = await MooringGroup.create();
    const ct = await group.encrypt(enc.encode('hi group'));
    expect(ct.length).toBe(12 + 'hi group'.length + 16);
    expect(dec.decode(await group.decrypt(ct))).toBe('hi group');
  });

  it('accepts fresh in-order frames', async () => {
    const group = await MooringGroup.create();
    for (let i = 0; i < 32; i++) {
      const ct = await group.encrypt(enc.encode(`f${i}`));
      expect(dec.decode(await group.decrypt(ct))).toBe(`f${i}`);
    }
  });

  it('rejects an in-window replay of an already-seen frame', async () => {
    const group = await MooringGroup.create();
    const ct = await group.encrypt(enc.encode('once'));
    expect(dec.decode(await group.decrypt(ct))).toBe('once');
    // Same IV + ciphertext replayed while still inside the window → rejected.
    await expect(group.decrypt(ct)).rejects.toThrow(/replayed frame/);
  });

  it('rejects a very old frame that has fallen below the window', async () => {
    const group = await MooringGroup.create();
    // Capture frame #0 but do not decrypt it yet.
    const old = await group.encrypt(enc.encode('stale'));
    // Advance the high-water mark past the window edge with newer frames.
    const fresh: Uint8Array[] = [];
    for (let i = 0; i < WINDOW_BITS + 4; i++) fresh.push(await group.encrypt(enc.encode(`n${i}`)));
    for (const f of fresh) await group.decrypt(f);
    // frame #0 is now > WINDOW_BITS below the high-water → too old to prove fresh.
    await expect(group.decrypt(old)).rejects.toThrow(/replayed frame/);
  });

  it('still accepts a genuinely new frame after heavy traffic', async () => {
    const group = await MooringGroup.create();
    for (let i = 0; i < 64; i++) await group.decrypt(await group.encrypt(enc.encode(`x${i}`)));
    const ct = await group.encrypt(enc.encode('later'));
    expect(dec.decode(await group.decrypt(ct))).toBe('later');
  });

  it('keeps replay-guard memory O(senders), not O(frames)', async () => {
    const group = await MooringGroup.create();
    // Thousands of frames from a single sender must not grow the guard: one
    // sender = one prefix lane, regardless of frame count (the old unbounded
    // Set grew one entry per frame here).
    for (let i = 0; i < 5000; i++) await group.decrypt(await group.encrypt(enc.encode('f')));
    expect(group.replayLaneCount).toBe(1);
  });

  it('caps tracked sender prefixes under a many-sender flood', async () => {
    const master = await MooringGroup.create();
    // Each distinct sender contributes one prefix lane; the guard must cap the
    // number of lanes rather than grow without bound.
    for (let i = 0; i < MAX_PREFIXES + 8; i++) {
      const sender = await shareKey(master);
      await master.decrypt(await sender.encrypt(enc.encode(`s${i}`)));
    }
    expect(master.replayLaneCount).toBeLessThanOrEqual(MAX_PREFIXES);
  });

  it('clears the replay guard on destroy', async () => {
    const group = await MooringGroup.create();
    await group.decrypt(await group.encrypt(enc.encode('a')));
    expect(group.replayLaneCount).toBe(1);
    group.destroy();
    expect(group.replayLaneCount).toBe(0);
    await expect(group.encrypt(enc.encode('b'))).rejects.toThrow(/destroyed/);
  });
});
