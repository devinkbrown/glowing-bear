import { describe, it, expect } from 'vitest';
import {
  ReplayWindow,
  WINDOW_BITS,
  MAX_PREFIXES,
  IV_BYTES,
  PREFIX_BYTES,
} from './replayWindow';

/** Build a 12-byte IV = 8-byte prefix (all `p`) + big-endian u32 counter. */
function iv(prefix: number, counter: number): Uint8Array {
  const b = new Uint8Array(IV_BYTES);
  b.fill(prefix, 0, PREFIX_BYTES);
  b[8]  = (counter >>> 24) & 0xff;
  b[9]  = (counter >>> 16) & 0xff;
  b[10] = (counter >>> 8) & 0xff;
  b[11] = counter & 0xff;
  return b;
}

/** Accept helper mirroring TsumugiSession's two-phase check→remember. */
function accept(w: ReplayWindow, frame: Uint8Array): boolean {
  if (w.seen(frame)) return false;
  return w.remember(frame);
}

describe('ReplayWindow', () => {
  it('accepts a fresh monotonic sequence', () => {
    const w = new ReplayWindow();
    for (let c = 0; c < 500; c++) {
      expect(accept(w, iv(1, c))).toBe(true);
    }
    expect(w.size).toBe(1);
  });

  it('rejects an exact replay via seen() before remember()', () => {
    const w = new ReplayWindow();
    expect(accept(w, iv(1, 10))).toBe(true);
    expect(w.seen(iv(1, 10))).toBe(true);
    expect(accept(w, iv(1, 10))).toBe(false);
  });

  it('rejects a replay that races past seen() at remember()', () => {
    const w = new ReplayWindow();
    // Simulate two concurrent decrypts of the same frame: both pass seen()
    // before either records, then both try to remember.
    const a = iv(1, 7);
    const b = iv(1, 7);
    expect(w.seen(a)).toBe(false);
    expect(w.seen(b)).toBe(false);
    expect(w.remember(a)).toBe(true);
    expect(w.remember(b)).toBe(false); // second one caught as replay
  });

  it('accepts out-of-order frames within the window', () => {
    const w = new ReplayWindow();
    expect(accept(w, iv(1, 100))).toBe(true);
    expect(accept(w, iv(1, 98))).toBe(true);  // older, still fresh
    expect(accept(w, iv(1, 99))).toBe(true);
    expect(accept(w, iv(1, 98))).toBe(false); // now a replay
    expect(accept(w, iv(1, 99))).toBe(false);
  });

  it('fails closed on frames older than the window edge', () => {
    const w = new ReplayWindow();
    expect(accept(w, iv(1, WINDOW_BITS + 50))).toBe(true);
    // Counter far below high-water mark: cannot prove non-replay → reject.
    expect(w.seen(iv(1, 1))).toBe(true);
    expect(accept(w, iv(1, 1))).toBe(false);
  });

  it('accepts the frame exactly at the trailing window edge but rejects one past it', () => {
    const w = new ReplayWindow();
    const high = WINDOW_BITS + 10;
    expect(accept(w, iv(1, high))).toBe(true);
    // offset === WINDOW_BITS - 1 is the last in-window slot.
    expect(accept(w, iv(1, high - (WINDOW_BITS - 1)))).toBe(true);
    // offset === WINDOW_BITS is just past the edge → rejected.
    expect(accept(w, iv(1, high - WINDOW_BITS))).toBe(false);
  });

  it('tracks distinct prefixes independently', () => {
    const w = new ReplayWindow();
    expect(accept(w, iv(1, 5))).toBe(true);
    expect(accept(w, iv(2, 5))).toBe(true); // same counter, different prefix
    expect(w.size).toBe(2);
    expect(accept(w, iv(1, 5))).toBe(false); // replay on prefix 1
    expect(accept(w, iv(2, 5))).toBe(false); // replay on prefix 2
  });

  it('bounds tracked prefixes to MAX_PREFIXES, evicting the oldest', () => {
    const w = new ReplayWindow();
    for (let p = 0; p < MAX_PREFIXES + 20; p++) {
      expect(accept(w, iv(p, 1))).toBe(true);
    }
    expect(w.size).toBe(MAX_PREFIXES);
  });

  it('clear() drops all history', () => {
    const w = new ReplayWindow();
    expect(accept(w, iv(1, 9))).toBe(true);
    w.clear();
    expect(w.size).toBe(0);
    // After clear a previously-seen IV looks fresh again.
    expect(accept(w, iv(1, 9))).toBe(true);
  });

  it('refuses malformed (wrong-length) IVs fail-closed', () => {
    const w = new ReplayWindow();
    const short = new Uint8Array(IV_BYTES - 1);
    expect(w.seen(short)).toBe(true);      // seen() rejects
    expect(w.remember(short)).toBe(false); // remember() rejects
    expect(w.size).toBe(0);
  });

  it('handles a large counter jump without corrupting the window', () => {
    const w = new ReplayWindow();
    expect(accept(w, iv(1, 3))).toBe(true);
    expect(accept(w, iv(1, 3 + WINDOW_BITS * 4))).toBe(true); // huge advance
    // The old low counter is now far outside the window.
    expect(accept(w, iv(1, 3))).toBe(false);
    // A counter just below the new high is still fresh.
    expect(accept(w, iv(1, 3 + WINDOW_BITS * 4 - 1))).toBe(true);
  });
});
