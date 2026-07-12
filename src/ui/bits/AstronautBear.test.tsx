// AstronautBear SMIL reduced-motion gate — the mascot's blink/idle + accessory
// animation is SMIL (<animate>/<animateTransform>), which CSS `animation:none`
// cannot reach. Under prefers-reduced-motion: reduce the SMIL nodes must not run;
// here we assert they are absent from the DOM entirely (WCAG 2.2.2 / 2.3.3).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@solidjs/testing-library';
import AstronautBear from './AstronautBear';
import { setSceneMotion } from '@/state/settings';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Reset the module-level settings singleton so suites stay isolated.
  setSceneMotion('auto');
});

// jsdom has no matchMedia; createMediaQuery needs it. `reduce` decides whether
// the prefers-reduced-motion: reduce query reports a match.
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

describe('AstronautBear reduced-motion SMIL gate', () => {
  it('renders SMIL animate nodes when motion is allowed', () => {
    stubMatchMedia(false);
    const { container } = render(() => <AstronautBear />);

    expect(container.querySelector('svg')).toBeTruthy();
    // The always-present blink animation lives in the eye clip-paths, so the
    // default (darkbear) mascot must carry SMIL nodes when motion is allowed.
    expect(smilNodes(container).length).toBeGreaterThan(0);
  });

  it('renders NO SMIL animate nodes when prefers-reduced-motion: reduce matches', () => {
    stubMatchMedia(true);
    const { container } = render(() => <AstronautBear />);

    // The mascot still renders (static SVG), but every <animate>/<animateTransform>
    // is gated out — CSS cannot stop SMIL, so absence is the only guarantee.
    expect(container.querySelector('svg')).toBeTruthy();
    expect(smilNodes(container).length).toBe(0);
  });

  it('renders NO SMIL nodes when the user sets sceneMotion=reduced, even if the OS query does NOT match', () => {
    // OS reports NO reduced-motion preference...
    stubMatchMedia(false);
    // ...but the in-app WCAG 2.2.2 control asks to stop motion.
    setSceneMotion('reduced');
    const { container } = render(() => <AstronautBear />);

    expect(container.querySelector('svg')).toBeTruthy();
    expect(smilNodes(container).length).toBe(0);
  });

  it('restores SMIL nodes when the user returns sceneMotion to auto (OS not reduced)', () => {
    stubMatchMedia(false);
    setSceneMotion('reduced');
    const first = render(() => <AstronautBear />);
    expect(smilNodes(first.container).length).toBe(0);
    cleanup();

    setSceneMotion('auto');
    const { container } = render(() => <AstronautBear />);
    expect(smilNodes(container).length).toBeGreaterThan(0);
  });

  it('gates SMIL across accessory-heavy themes under reduced motion', () => {
    stubMatchMedia(true);
    // obsidian/midnight/ember carry animateTransform + many animate nodes.
    for (const theme of ['midnight', 'obsidian', 'ember'] as const) {
      const { container } = render(() => <AstronautBear theme={theme} />);
      expect(smilNodes(container).length).toBe(0);
      cleanup();
    }
  });
});
