// ThemeBg SMIL reduced-motion gate — several scenes drive decorative motion with
// SMIL (<animate>/<animateMotion>): the DarkBear data-stream dots + pulse rings,
// the Abyss jellyfish tentacles + sonar pings, the Dracula flying bats, the
// Lightning strikes and the Phoenix eye-pulse. CSS `animation:none` (the
// .theme-bg-shell reduced-motion rule) CANNOT reach SMIL, so under
// prefers-reduced-motion: reduce those nodes must be absent from the DOM entirely
// (WCAG 2.2.2 Pause, Stop, Hide). This asserts the JS gate does that.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@solidjs/testing-library';
import ThemeBg, { shimmerLayers, type ThemeName } from './ThemeBg';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom has no matchMedia; createMediaQuery needs it. `reduce` decides whether the
// prefers-reduced-motion: reduce query reports a match.
function stubMatchMedia(reduce: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion: reduce') ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function smilNodes(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll('animate, animateTransform, animateMotion');
}

// Scenes that carry SMIL nodes (verified against ThemeBg source).
const SMIL_SCENES: ThemeName[] = ['darkbear', 'abyss', 'dracula', 'lightning', 'phoenix'];

describe('ThemeBg reduced-motion SMIL gate', () => {
  it('renders SMIL nodes when motion is allowed (darkbear + abyss)', () => {
    stubMatchMedia(false);
    for (const theme of ['darkbear', 'abyss'] as const) {
      const { container } = render(() => <ThemeBg theme={theme} />);
      expect(smilNodes(container).length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('renders NO SMIL nodes when prefers-reduced-motion: reduce matches, across SMIL scenes', () => {
    stubMatchMedia(true);
    for (const theme of SMIL_SCENES) {
      const { container } = render(() => <ThemeBg theme={theme} />);
      // Scene still renders its static SVG; every <animate>/<animateMotion> is gated
      // out — CSS cannot stop SMIL, so absence is the only guarantee.
      expect(container.querySelector('svg')).toBeTruthy();
      expect(smilNodes(container).length).toBe(0);
      cleanup();
    }
  });
});

// ── Compositor-cost consolidation ──────────────────────────────────────────────
// The dense fields (star twinkle, city-window blink, aurora sparks) used to hang one
// CSS opacity animation on EVERY node. They now paint nodes STATIC and shimmer a
// handful of grouped wrappers, so the always-animating compositor-node count is a
// small constant regardless of node density (mirrors the StarfieldBg 563→41 win).
// These pin both the pure grouping helper and the per-scene animating-node budgets
// so the win can't silently regress.

describe('shimmerLayers', () => {
  it('collapses N items into at most `groups` layers while preserving every item', () => {
    const items = Array.from({ length: 60 }, (_, i) => i);
    const layers = shimmerLayers(items, 6);
    expect(layers).toHaveLength(6);
    expect(layers.flat().sort((a, b) => a - b)).toEqual(items);
  });

  it('round-robins by index so spatial neighbours land in different layers', () => {
    const layers = shimmerLayers([0, 1, 2, 3, 4, 5, 6, 7], 4);
    expect(layers).toEqual([[0, 4], [1, 5], [2, 6], [3, 7]]);
  });

  it('never produces more layers than items and never fewer than one', () => {
    expect(shimmerLayers([1, 2], 5)).toHaveLength(2);
    expect(shimmerLayers([], 5)).toHaveLength(1);
    expect(shimmerLayers([1], 1)).toHaveLength(1);
  });
});

// ── Compositor-only motion (no layout-bound keyframes) ─────────────────────────
// Every decorative @keyframes must animate only compositor-friendly properties
// (transform/opacity/filter/background). Animating left/right/top/bottom/width/
// height/margin thrashes layout+paint each frame across the always-running scene.
// This source-scan pins that: the moving cars, rain, bats, drips, wind, birds and
// scanlines drive their travel with transform, so a regression back to a layout
// property fails here rather than only under a frame profiler.
describe('ThemeBg keyframes are compositor-only', () => {
  const source = readFileSync(join(process.cwd(), 'src/ui/bits/ThemeBg.tsx'), 'utf8');
  // Match each `@keyframes name { …one nesting level… }` block whole.
  const blocks = source.match(/@keyframes\s+[\w-]+\s*\{(?:[^{}]|\{[^{}]*\})*\}/g) ?? [];
  // A layout property only counts when it appears as a declaration key (after `{`,
  // `;` or whitespace, before `:`) — so `transform-origin` values and gradient
  // directions like `to bottom` are not false positives.
  const LAYOUT_PROP = /[{;\s](?:left|right|top|bottom|width|height|margin|padding|font-size)\s*:/;
  const nameOf = (block: string): string => block.match(/@keyframes\s+([\w-]+)/)?.[1] ?? '?';

  it('scans the full keyframe set', () => {
    expect(blocks.length).toBeGreaterThan(50);
  });

  it('no @keyframes animates a layout-bound property', () => {
    const offenders = blocks.filter((b) => LAYOUT_PROP.test(b)).map(nameOf);
    expect(offenders).toEqual([]);
  });
});

describe('ThemeBg animating-node budget (consolidated scenes)', () => {
  function animatingCount(container: HTMLElement): number {
    return container.querySelectorAll('[style*="animation"]').length;
  }
  // Static leaf dots/panes carry a percentage `top` but NO animation — the wrapper
  // above them owns the shimmer.
  function staticDots(container: HTMLElement): number {
    return Array.from(container.querySelectorAll('[style*="top"]')).filter(
      (el) => !el.getAttribute('style')?.includes('animation'),
    ).length;
  }

  // { theme: [animating-cap, baseline-before, min-static-density] }
  const CASES: Record<string, [number, number, number]> = {
    'tokyo-night': [170, 257, 120], // ~180 windows → grouped blink wrappers
    midnight: [60, 151, 100], // 115 stars + 17 dots → grouped shimmer wrappers
    aurora: [60, 115, 55], // 60 stars + 20 sparks → grouped shimmer wrappers
  };

  for (const [theme, [cap, baseline, minStatic]] of Object.entries(CASES)) {
    it(`${theme}: animating nodes well below the ${baseline}-node baseline, density preserved`, () => {
      stubMatchMedia(false);
      const { container } = render(() => <ThemeBg theme={theme as ThemeName} />);
      const animating = animatingCount(container);
      // Materially fewer animating nodes than the per-element baseline…
      expect(animating).toBeLessThanOrEqual(cap);
      expect(animating).toBeLessThan(baseline * 0.75);
      // …but the decorative motion is not stripped entirely.
      expect(animating).toBeGreaterThan(10);
      // …and the visual density (static dots/panes) is retained, not thinned out.
      expect(staticDots(container)).toBeGreaterThan(minStatic);
    });
  }
});
