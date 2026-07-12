// @vitest-environment jsdom

import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMediaQuery } from './mediaQuery';

function installMatchMedia(initialMatches: boolean): {
  addEventListener: ReturnType<typeof vi.fn>;
  dispatchChange: (matches: boolean) => void;
  matchMedia: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
} {
  let matches = initialMatches;
  const listeners = new Set<EventListenerOrEventListenerObject>();

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change') listeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change') listeners.delete(listener);
    }),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;

  const matchMedia = vi.fn((query: string) => {
    Object.defineProperty(mediaQueryList, 'media', { value: query, configurable: true });
    return mediaQueryList;
  });

  vi.stubGlobal('matchMedia', matchMedia);

  return {
    addEventListener: mediaQueryList.addEventListener as ReturnType<typeof vi.fn>,
    dispatchChange(nextMatches: boolean): void {
      matches = nextMatches;
      const event = new Event('change') as MediaQueryListEvent;
      Object.defineProperty(event, 'matches', { value: nextMatches, configurable: true });

      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener.call(mediaQueryList, event);
        } else {
          listener.handleEvent(event);
        }
      }
    },
    matchMedia,
    removeEventListener: mediaQueryList.removeEventListener as ReturnType<typeof vi.fn>,
  };
}

describe('createMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a reactive accessor for matchMedia changes', () => {
    const matchMedia = installMatchMedia(false);
    let dispose: (() => void) | undefined;
    let matches: (() => boolean) | undefined;

    createRoot((disposeRoot) => {
      dispose = disposeRoot;
      matches = createMediaQuery('(min-width: 768px)');
    });

    expect(matchMedia.matchMedia).toHaveBeenCalledWith('(min-width: 768px)');
    expect(matches?.()).toBe(false);

    matchMedia.dispatchChange(true);
    expect(matches?.()).toBe(true);

    dispose?.();
  });

  it('removes the change listener when the owner is disposed', () => {
    const matchMedia = installMatchMedia(true);
    let dispose: (() => void) | undefined;
    let matches: (() => boolean) | undefined;

    createRoot((disposeRoot) => {
      dispose = disposeRoot;
      matches = createMediaQuery('(prefers-reduced-motion: reduce)');
    });

    const listener = matchMedia.addEventListener.mock.calls[0]?.[1];
    expect(listener).toBeTypeOf('function');

    dispose?.();

    expect(matchMedia.removeEventListener).toHaveBeenCalledWith('change', listener);
    matchMedia.dispatchChange(false);
    expect(matches?.()).toBe(true);
  });
});
