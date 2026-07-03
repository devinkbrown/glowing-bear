// Reactive media-query primitive — Solid port of the old useMediaQuery hook.

import { createSignal, onCleanup } from 'solid-js';

/**
 * Returns a reactive accessor that tracks whether the given media query
 * currently matches. Call inside a component (or any reactive owner) so the
 * change listener is released on cleanup.
 */
export function createMediaQuery(query: string): () => boolean {
  const mql = window.matchMedia(query);
  const [matches, setMatches] = createSignal(mql.matches);

  const onChange = (e: MediaQueryListEvent): void => {
    setMatches(e.matches);
  };

  mql.addEventListener('change', onChange);
  onCleanup(() => mql.removeEventListener('change', onChange));

  return matches;
}
