import { describe, expect, it } from 'vitest';

import { verifyMediaDatagramMac } from './MediaEngine';
import { encodeKaguraFrame, KaguraCodec, KAGURA_MIN_FRAME_BYTES } from './kaguraFrame';
import { appendMediaMac, importMediaMacKey, MEDIA_MAC_TAG_BYTES } from './mediaMac';

// Inbound media-MAC verification (the client-edge authenticity check). When a
// stream's per-stream MAC key is known, `handleMediaDatagram` MUST verify the
// trailing tag and DROP the datagram on mismatch. These tests pin the pure
// verifier that decision routes through, using real crypto.subtle in jsdom.

const WS_BAND_AUDIO = 64;

function sampleFrame(payload: Uint8Array): Uint8Array {
  return encodeKaguraFrame({
    bandId: WS_BAND_AUDIO,
    streamId: 0x1234abcd,
    sequence: 7,
    timestamp: 1_700_000_000,
    keyframe: false,
    codec: KaguraCodec.kaguravoxAudio,
    payload,
  });
}

async function freshKey(): Promise<CryptoKey> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return importMediaMacKey(raw);
}

describe('verifyMediaDatagramMac — inbound per-stream MAC verification', () => {
  it('accepts a datagram whose tag matches the frame under the known key', async () => {
    const key = await freshKey();
    const frame = sampleFrame(new Uint8Array([1, 2, 3, 4, 5]));
    const datagram = await appendMediaMac(key, frame);

    const ok = await verifyMediaDatagramMac(key, datagram, frame.length);
    expect(ok).toBe(true);
  });

  it('DROPS a datagram whose tag was tampered (fail-closed)', async () => {
    const key = await freshKey();
    const frame = sampleFrame(new Uint8Array([1, 2, 3, 4, 5]));
    const datagram = await appendMediaMac(key, frame);
    // Flip one bit in the trailing 16-byte tag.
    datagram.set([datagram[datagram.length - 1]! ^ 0x01], datagram.length - 1);

    const ok = await verifyMediaDatagramMac(key, datagram, frame.length);
    expect(ok).toBe(false);
  });

  it('DROPS a datagram whose payload was tampered under an unchanged tag', async () => {
    const key = await freshKey();
    const frame = sampleFrame(new Uint8Array([9, 9, 9, 9, 9]));
    const datagram = await appendMediaMac(key, frame);
    // Flip a payload byte (last byte before the tag).
    datagram.set([datagram[frame.length - 1]! ^ 0x01], frame.length - 1);

    const ok = await verifyMediaDatagramMac(key, datagram, frame.length);
    expect(ok).toBe(false);
  });

  it('DROPS a datagram that carries no tag when a key is known (must be authenticated)', async () => {
    const key = await freshKey();
    const frame = sampleFrame(new Uint8Array([1, 2, 3, 4, 5]));

    // No tag appended: length is exactly the frame length.
    const ok = await verifyMediaDatagramMac(key, frame, frame.length);
    expect(ok).toBe(false);
  });

  it('DROPS a datagram whose length is neither frame nor frame+tag', async () => {
    const key = await freshKey();
    const frame = sampleFrame(new Uint8Array([1, 2, 3, 4, 5]));
    const datagram = await appendMediaMac(key, frame);
    // Truncate one byte off the tag.
    const truncated = datagram.subarray(0, datagram.length - 1);

    const ok = await verifyMediaDatagramMac(key, truncated, frame.length);
    expect(ok).toBe(false);
  });

  it('rejects a negative frame length without touching crypto', async () => {
    const key = await freshKey();
    const bytes = new Uint8Array(KAGURA_MIN_FRAME_BYTES + MEDIA_MAC_TAG_BYTES);
    expect(await verifyMediaDatagramMac(key, bytes, -1)).toBe(false);
  });
});
