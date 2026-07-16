import { describe, expect, it } from 'vitest';

import {
  AdaptiveQualityController,
  MAX_HEALTH_STREAMS,
  PacketLossTracker,
} from './callHealth';

describe('PacketLossTracker', () => {
  it('measures gaps and repairs them when packets arrive out of order', () => {
    const tracker = new PacketLossTracker();
    tracker.observe(10, 100);
    tracker.observe(10, 102);
    expect(tracker.lossRate()).toBeCloseTo(1 / 3);

    tracker.observe(10, 101);
    expect(tracker.lossRate()).toBe(0);
  });

  it('ignores duplicates and handles u32 wraparound', () => {
    const tracker = new PacketLossTracker();
    expect(tracker.observe(4, 0xffff_ffff)).toBe(true);
    expect(tracker.observe(4, 0)).toBe(true);
    expect(tracker.observe(4, 0)).toBe(false);
    expect(tracker.lossRate()).toBe(0);
  });

  it('keeps a hard bound under a forged stream-id flood', () => {
    const tracker = new PacketLossTracker();
    for (let id = 0; id < MAX_HEALTH_STREAMS * 4; id++) tracker.observe(id, 1);
    expect(tracker.size).toBe(MAX_HEALTH_STREAMS);
  });
});

describe('AdaptiveQualityController', () => {
  it('requires consecutive congestion samples and degrades one tier at a time', () => {
    const controller = new AdaptiveQualityController();
    const bad = { suggestedBps: 20_000, lossRate: 0.2, encodePressure: 1.5 };
    expect(controller.observe(bad)).toEqual({ tier: 0, changed: false });
    expect(controller.observe(bad)).toEqual({ tier: 1, changed: true });
    expect(controller.observe(bad)).toEqual({ tier: 1, changed: false });
    expect(controller.observe(bad)).toEqual({ tier: 2, changed: true });
  });

  it('uses a longer headroom hold before recovering', () => {
    const controller = new AdaptiveQualityController();
    const bad = { suggestedBps: 100_000, lossRate: 0.1, encodePressure: 1.1 };
    controller.observe(bad);
    controller.observe(bad);
    expect(controller.currentTier).toBe(1);

    const good = { suggestedBps: 400_000, lossRate: 0, encodePressure: 0.4 };
    for (let i = 0; i < 3; i++) expect(controller.observe(good).changed).toBe(false);
    expect(controller.observe(good)).toEqual({ tier: 0, changed: true });
  });

  it('does not recover while bitrate sits inside the hysteresis band', () => {
    const controller = new AdaptiveQualityController();
    const bad = { suggestedBps: 100_000, lossRate: 0.1, encodePressure: 0.2 };
    controller.observe(bad);
    controller.observe(bad);
    const marginal = { suggestedBps: 320_000, lossRate: 0, encodePressure: 0.2 };
    for (let i = 0; i < 8; i++) controller.observe(marginal);
    expect(controller.currentTier).toBe(1);
  });
});
