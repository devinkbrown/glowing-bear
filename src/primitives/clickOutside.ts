// Click-outside primitive — Solid port of the old useClickOutside hook.

import { onCleanup } from 'solid-js';

/**
 * Invokes `cb` whenever a pointer-down lands outside the element returned by
 * `el`. Return `undefined` from `el` to disable the check (e.g. while a menu
 * is closed). Registers document listeners immediately; call from component
 * setup so `onCleanup` can release them.
 */
export function useClickOutside(el: () => HTMLElement | undefined, cb: () => void): void {
  const handler = (e: Event): void => {
    const node = el();
    if (node && !node.contains(e.target as Node)) cb();
  };

  document.addEventListener('mousedown', handler);
  document.addEventListener('touchstart', handler);
  onCleanup(() => {
    document.removeEventListener('mousedown', handler);
    document.removeEventListener('touchstart', handler);
  });
}
