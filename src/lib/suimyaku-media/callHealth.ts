import type { NetworkQualityTier } from './types';

/** Recent sequence history retained for each inbound media stream. */
export const LOSS_WINDOW_PACKETS = 128;
/** Hard participant-stream ceiling: memory stays bounded under forged stream ids. */
export const MAX_HEALTH_STREAMS = 128;

interface LossLane {
  high: number;
  span: number;
  bits: Uint32Array;
}

const LOSS_WINDOW_WORDS = LOSS_WINDOW_PACKETS / 32;

function popcount32(value: number): number {
  let v = value >>> 0;
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function bitSet(bits: Uint32Array, offset: number): boolean {
  return (bits[offset >>> 5]! & (1 << (offset & 31))) !== 0;
}

function setBit(bits: Uint32Array, offset: number): void {
  bits[offset >>> 5]! |= 1 << (offset & 31);
}

/** Shift recorded offsets toward the older edge of the fixed packet window. */
function shiftBits(bits: Uint32Array, delta: number): void {
  if (delta >= LOSS_WINDOW_PACKETS) {
    bits.fill(0);
    return;
  }
  const wordShift = delta >>> 5;
  const bitShift = delta & 31;
  for (let i = bits.length - 1; i >= 0; i--) {
    const src = i - wordShift;
    let value = 0;
    if (src >= 0) {
      value = bits[src]! << bitShift;
      if (bitShift > 0 && src > 0) value |= bits[src - 1]! >>> (32 - bitShift);
    }
    bits[i] = value >>> 0;
  }
}

/**
 * Bounded, reorder-aware packet loss estimator for Kagura u32 sequences.
 *
 * Each stream retains only its last 128 sequence positions. Late packets inside
 * that window repair a previously observed gap; duplicates and stale packets do
 * not inflate the denominator. Stream lanes are capped and oldest-evicted.
 */
export class PacketLossTracker {
  private readonly lanes = new Map<number, LossLane>();

  observe(streamId: number, sequence: number): boolean {
    const id = streamId >>> 0;
    const seq = sequence >>> 0;
    let lane = this.lanes.get(id);
    if (!lane) {
      if (this.lanes.size >= MAX_HEALTH_STREAMS) {
        const oldest = this.lanes.keys().next().value;
        if (oldest !== undefined) this.lanes.delete(oldest);
      }
      lane = { high: seq, span: 1, bits: new Uint32Array(LOSS_WINDOW_WORDS) };
      setBit(lane.bits, 0);
      this.lanes.set(id, lane);
      return true;
    }

    // Signed u32 delta treats wraparound (0xffffffff -> 0) as one step ahead.
    const ahead = (seq - lane.high) | 0;
    if (ahead > 0) {
      shiftBits(lane.bits, ahead);
      lane.high = seq;
      lane.span = Math.min(LOSS_WINDOW_PACKETS, lane.span + ahead);
      setBit(lane.bits, 0);
      return true;
    }

    const offset = (lane.high - seq) >>> 0;
    if (offset >= lane.span || offset >= LOSS_WINDOW_PACKETS || bitSet(lane.bits, offset)) return false;
    setBit(lane.bits, offset);
    return true;
  }

  lossRate(): number {
    let expected = 0;
    let received = 0;
    for (const lane of this.lanes.values()) {
      expected += lane.span;
      for (const word of lane.bits) received += popcount32(word);
    }
    return expected === 0 ? 0 : Math.max(0, (expected - received) / expected);
  }

  remove(streamId: number): void {
    this.lanes.delete(streamId >>> 0);
  }

  clear(): void {
    this.lanes.clear();
  }

  get size(): number {
    return this.lanes.size;
  }
}

const DEGRADE_SAMPLES = 2;
const RECOVER_SAMPLES = 4;

function bitrateTier(bps: number): NetworkQualityTier {
  return bps >= 300_000 ? 0 : bps >= 150_000 ? 1 : bps >= 60_000 ? 2 : 3;
}

function lossTier(lossRate: number): NetworkQualityTier {
  return lossRate >= 0.15 ? 3 : lossRate >= 0.08 ? 2 : lossRate >= 0.03 ? 1 : 0;
}

function pressureTier(pressure: number): NetworkQualityTier {
  return pressure >= 1.35 ? 3 : pressure >= 1.05 ? 2 : pressure >= 0.85 ? 1 : 0;
}

function hasRecoveryHeadroom(
  tier: NetworkQualityTier,
  bps: number | null,
  lossRate: number,
  encodePressure: number,
): boolean {
  const bpsOk = bps === null || (
    tier === 3 ? bps >= 75_000
      : tier === 2 ? bps >= 180_000
        : tier === 1 ? bps >= 360_000
          : true
  );
  return bpsOk && lossRate < 0.02 && encodePressure < 0.75;
}

export interface AdaptiveQualitySample {
  /** Null until Orochi or the local throughput meter has a useful estimate. */
  suggestedBps: number | null;
  lossRate: number;
  /** Encode duration divided by the frame budget. */
  encodePressure: number;
}

export interface AdaptiveQualityResult {
  tier: NetworkQualityTier;
  changed: boolean;
}

/** Stateful one-step quality controller with asymmetric degrade/recovery holds. */
export class AdaptiveQualityController {
  private tier: NetworkQualityTier = 0;
  private degradeCount = 0;
  private recoverCount = 0;

  observe(sample: AdaptiveQualitySample): AdaptiveQualityResult {
    const target = Math.max(
      sample.suggestedBps === null ? 0 : bitrateTier(sample.suggestedBps),
      lossTier(sample.lossRate),
      pressureTier(sample.encodePressure),
    ) as NetworkQualityTier;

    if (target > this.tier) {
      this.degradeCount += 1;
      this.recoverCount = 0;
      if (this.degradeCount >= DEGRADE_SAMPLES) {
        this.tier = Math.min(3, this.tier + 1) as NetworkQualityTier;
        this.degradeCount = 0;
        return { tier: this.tier, changed: true };
      }
      return { tier: this.tier, changed: false };
    }

    if (this.tier > 0 && target < this.tier && hasRecoveryHeadroom(
      this.tier,
      sample.suggestedBps,
      sample.lossRate,
      sample.encodePressure,
    )) {
      this.recoverCount += 1;
      this.degradeCount = 0;
      if (this.recoverCount >= RECOVER_SAMPLES) {
        this.tier = (this.tier - 1) as NetworkQualityTier;
        this.recoverCount = 0;
        return { tier: this.tier, changed: true };
      }
      return { tier: this.tier, changed: false };
    }

    this.degradeCount = 0;
    this.recoverCount = 0;
    return { tier: this.tier, changed: false };
  }

  reset(): void {
    this.tier = 0;
    this.degradeCount = 0;
    this.recoverCount = 0;
  }

  get currentTier(): NetworkQualityTier {
    return this.tier;
  }
}
