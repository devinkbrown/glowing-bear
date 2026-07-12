// ThemeBg SMIL reduced-motion gate — several scenes drive decorative motion with
// SMIL (<animate>/<animateMotion>): the DarkBear data-stream dots + pulse rings,
// the Abyss jellyfish tentacles + sonar pings, the Dracula flying bats, the
// Lightning strikes and the Phoenix eye-pulse. CSS `animation:none` (the
// .theme-bg-shell reduced-motion rule) CANNOT reach SMIL, so under
// prefers-reduced-motion: reduce those nodes must be absent from the DOM entirely
// (WCAG 2.2.2 Pause, Stop, Hide). This asserts the JS gate does that.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@solidjs/testing-library';
import ThemeBg, { type ThemeName } from './ThemeBg';

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
