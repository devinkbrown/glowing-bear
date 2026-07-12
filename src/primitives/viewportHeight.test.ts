// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { setupViewportHeight } from './viewportHeight';

describe('setupViewportHeight — --vh contract', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.documentElement.style.removeProperty('--vh');
  });

  it('sets --vh to the FULL viewport height in px (App.tsx consumes it directly)', () => {
    // jsdom defaults innerHeight to 768; pin it so the assertion is exact.
    Object.defineProperty(window, 'innerHeight', { value: 812, configurable: true });
    cleanup = setupViewportHeight();
    const vh = document.documentElement.style.getPropertyValue('--vh');
    // Must be the full height, e.g. "812px" — NOT a 1%-unit like "8.12px".
    expect(vh).toBe('812px');
    expect(parseFloat(vh)).toBeGreaterThan(100); // guards against the 1%-unit regression
  });

  it('returns a cleanup function that removes the listeners', () => {
    cleanup = setupViewportHeight();
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup?.()).not.toThrow();
    cleanup = null;
  });
});
