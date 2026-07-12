// StarfieldBg compositor-cost guard. The scene used to run one CSS twinkle animation
// on every star (~480 always-animating nodes). It now paints stars as STATIC dots and
// shimmers them a handful of layers at a time, so the animating-node count is a small
// constant regardless of star density. These tests pin the pure grouping logic and the
// resulting animating-node budget so the win can't silently regress.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@solidjs/testing-library';
import StarfieldBg, {
  buildFieldStars,
  buildMilkyWayStars,
  groupStars,
  FIELD_GROUPS,
  MILKY_GROUPS,
} from './StarfieldBg';

// The render-budget cases below synchronously mount the full ~560-node starfield.
// Their asserted values are seeded-deterministic (they pass identically every run),
// but the render itself costs ~0.5s in isolation and inflates 3-4x when the full
// suite saturates every core — occasionally past vitest's 5s default per-test
// timeout, which surfaced as a load-only flake. A generous ceiling removes the
// contention timeout without touching any assertion: a real value regression still
// fails its expect() immediately, timeout or not.
vi.setConfig({ testTimeout: 20_000 });

afterEach(cleanup);

describe('buildFieldStars', () => {
  it('produces the requested count with every star assigned a valid group', () => {
    const stars = buildFieldStars(7, 280, FIELD_GROUPS);
    expect(stars).toHaveLength(280);
    for (const s of stars) {
      expect(s.group).toBeGreaterThanOrEqual(0);
      expect(s.group).toBeLessThan(FIELD_GROUPS);
      expect(Number.isInteger(s.group)).toBe(true);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(100);
    }
  });

  it('is deterministic for a fixed seed', () => {
    expect(buildFieldStars(7, 40)).toEqual(buildFieldStars(7, 40));
  });
});

describe('buildMilkyWayStars', () => {
  it('produces the requested count with valid groups', () => {
    const stars = buildMilkyWayStars(314, 200, MILKY_GROUPS);
    expect(stars).toHaveLength(200);
    for (const s of stars) {
      expect(s.group).toBeGreaterThanOrEqual(0);
      expect(s.group).toBeLessThan(MILKY_GROUPS);
    }
  });
});

describe('groupStars', () => {
  it('preserves every star while collapsing them into a fixed number of animated layers', () => {
    const stars = buildFieldStars(7, 280, FIELD_GROUPS);
    const layers = groupStars(stars, FIELD_GROUPS);
    expect(layers).toHaveLength(FIELD_GROUPS);
    const total = layers.reduce((n, l) => n + l.length, 0);
    expect(total).toBe(stars.length);
    // The whole point: far fewer animated wrappers than stars.
    expect(layers.length).toBeLessThan(stars.length / 10);
  });

  it('routes each star into its own group bucket', () => {
    const stars = buildFieldStars(7, 120, FIELD_GROUPS);
    const layers = groupStars(stars, FIELD_GROUPS);
    layers.forEach((layer, g) => {
      for (const s of layer) expect(s.group).toBe(g);
    });
  });
});

describe('StarfieldBg render — animating-node budget', () => {
  // Every compositor-animated node carries either an inline `animation:` (star layers,
  // drift, nebulae, galaxies, supernova wrappers, cluster wrappers) or the `.sf-shooter`
  // class. Star DOTS themselves must be static.
  function animatingCount(container: HTMLElement): number {
    const inline = container.querySelectorAll('[style*="animation"]').length;
    const shooters = container.querySelectorAll('.sf-shooter').length;
    return inline + shooters;
  }

  it('keeps the animating-node count to a small constant (>=40% below the ~563-node baseline)', () => {
    const { container } = render(() => <StarfieldBg />);
    const animating = animatingCount(container);
    // Old scene animated ~563 nodes; the 40% target caps us at ~337. We land far lower.
    expect(animating).toBeLessThanOrEqual(60);
    // Sanity: the decorative motion (drift, nebulae, galaxies, novae, shooters, layers)
    // is still present, not accidentally stripped.
    expect(animating).toBeGreaterThan(20);
  });

  it('renders the full star density but with no per-star animation', () => {
    const { container } = render(() => <StarfieldBg />);
    // Static dots (percentage-positioned, no animation) still number in the hundreds.
    const staticDots = Array.from(container.querySelectorAll('div[style*="left"]')).filter(
      (el) => !el.getAttribute('style')?.includes('animation'),
    );
    expect(staticDots.length).toBeGreaterThan(400);
  });
});
