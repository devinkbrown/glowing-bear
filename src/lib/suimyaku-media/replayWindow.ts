/*
 * replayWindow.ts — Bounded sliding-window anti-replay guard for TSUMUGI IVs.
 *
 * TSUMUGI (and group-audio) IVs are `[8-byte random prefix][4-byte big-endian
 * counter]`. A given receive direction uses one prefix per key generation and a
 * strictly-monotonic counter, so replay protection does NOT need to remember
 * every IV ever seen (an unbounded Set that grows ~1 entry/frame — ~180k
 * strings/hour at 50 fps). Instead we keep, per prefix, the highest accepted
 * counter plus a fixed-width bitmask covering the most recent `WINDOW_BITS`
 * counters. Memory is O(prefixes) with a hard cap — bounded regardless of call
 * length.
 *
 * Two-phase use (matches TsumugiSession's check-before-decrypt / record-after-
 * decrypt discipline so a forged GCM tag can never advance the window):
 *   1. `seen(iv)`   — read-only; true => known replay OR too old to prove fresh.
 *   2. `remember(iv)` — after a *successful* AEAD decrypt; advances the window.
 *                       Returns false on a replay/too-old that raced past `seen`.
 *
 * Fail-closed: anything outside the window (older than `high - WINDOW_BITS`) is
 * rejected rather than assumed fresh, and a prefix flood past `MAX_PREFIXES`
 * evicts the oldest lane rather than growing without bound.
 */

export const IV_BYTES = 12;
export const PREFIX_BYTES = 8;
/** Reorder tolerance: counters within this many of the high-water mark are
 *  individually tracked. 1024 frames ≈ 20 s at 50 fps; 128 bytes/prefix. */
export const WINDOW_BITS = 1024;
const WINDOW_BYTES = WINDOW_BITS / 8;
/** Hard cap on tracked prefixes (O(participants); a 1:1 session uses one). */
export const MAX_PREFIXES = 64;

interface Lane {
  high: number;      // highest counter recorded for this prefix
  bits: Uint8Array;  // bit i set => counter (high - i) has been recorded
}

export class ReplayWindow {
  /** Insertion-ordered so the oldest lane is evicted first under flood. */
  private readonly lanes = new Map<string, Lane>();

  /**
   * Read-only replay probe. Returns true when `iv` is a known replay or is too
   * old to be proven fresh (outside the window) — both fail closed upstream.
   * Never mutates state, so an unauthenticated frame cannot move the window.
   */
  seen(iv: Uint8Array): boolean {
    const parsed = parse(iv);
    if (!parsed) return true; // malformed → refuse
    const lane = this.lanes.get(parsed.prefix);
    if (!lane) return false;
    if (parsed.counter > lane.high) return false;
    const offset = lane.high - parsed.counter;
    if (offset >= WINDOW_BITS) return true; // too old to dedup → fail closed
    return getBit(lane.bits, offset);
  }

  /**
   * Record an authenticated IV, advancing the window. Returns true if newly
   * recorded, false if it was in fact a replay or fell outside the window
   * (the caller must reject on false).
   */
  remember(iv: Uint8Array): boolean {
    const parsed = parse(iv);
    if (!parsed) return false;
    let lane = this.lanes.get(parsed.prefix);

    if (!lane) {
      if (this.lanes.size >= MAX_PREFIXES) {
        const oldest = this.lanes.keys().next().value;
        if (oldest !== undefined) this.lanes.delete(oldest);
      }
      lane = { high: parsed.counter, bits: new Uint8Array(WINDOW_BYTES) };
      setBit(lane.bits, 0);
      this.lanes.set(parsed.prefix, lane);
      return true;
    }

    if (parsed.counter > lane.high) {
      shiftUp(lane.bits, parsed.counter - lane.high);
      lane.high = parsed.counter;
      setBit(lane.bits, 0);
      return true;
    }

    const offset = lane.high - parsed.counter;
    if (offset >= WINDOW_BITS) return false; // too old
    if (getBit(lane.bits, offset)) return false; // replay
    setBit(lane.bits, offset);
    return true;
  }

  /** Drop all history (e.g. on key ratchet or session teardown). */
  clear(): void {
    this.lanes.clear();
  }

  /** Number of distinct prefixes currently tracked (bounded by MAX_PREFIXES). */
  get size(): number {
    return this.lanes.size;
  }
}

interface ParsedIv { prefix: string; counter: number; }

function parse(iv: Uint8Array): ParsedIv | null {
  if (iv.length !== IV_BYTES) return null;
  let prefix = '';
  for (let i = 0; i < PREFIX_BYTES; i++) prefix += iv[i]!.toString(16).padStart(2, '0');
  const counter =
    (iv[8]! * 0x1000000) + (iv[9]! << 16) + (iv[10]! << 8) + iv[11]!; // big-endian u32
  return { prefix, counter };
}

function getBit(bits: Uint8Array, offset: number): boolean {
  return (bits[offset >> 3]! & (1 << (offset & 7))) !== 0;
}

function setBit(bits: Uint8Array, offset: number): void {
  bits[offset >> 3]! |= 1 << (offset & 7);
}

/** Shift every recorded offset up by `delta` (older); entries past the window
 *  edge fall off. Offset 0 is left clear for the caller to claim as new high. */
function shiftUp(bits: Uint8Array, delta: number): void {
  if (delta <= 0) return;
  if (delta >= WINDOW_BITS) { bits.fill(0); return; }
  const byteShift = delta >> 3;
  const bitShift = delta & 7;
  for (let i = WINDOW_BYTES - 1; i >= 0; i--) {
    const src = i - byteShift;
    let v = 0;
    if (src >= 0) {
      v = bits[src]! << bitShift;
      if (bitShift > 0 && src - 1 >= 0) v |= bits[src - 1]! >> (8 - bitShift);
    }
    bits[i] = v & 0xff;
  }
}
