// Touch swipe gesture primitive — Solid port of the old useSwipeGesture hook.

import { createEffect, onCleanup } from 'solid-js';

/** Minimum horizontal travel to count as a swipe. */
const SWIPE_THRESHOLD_PX = 50;
/** px/ms above which the gesture is "fast" and the threshold relaxes. */
const FAST_VELOCITY = 0.5;
/** Threshold multiplier applied to fast flicks. */
const FAST_THRESHOLD_SCALE = 0.6;
/** Horizontal travel must dominate vertical travel by this factor. */
const HORIZONTAL_DOMINANCE = 1.5;

/**
 * Attaches passive touch listeners to `target` and fires the swipe callbacks.
 * Fast flicks trigger at a reduced distance threshold; `edgePx` constrains
 * right swipes to gestures starting at the left screen edge (drawer-open
 * semantics). Call from component setup — listeners are re-bound reactively
 * if `target` changes and released on cleanup.
 */
export function createSwipeGesture(
  target: () => HTMLElement | Window,
  opts: { onSwipeLeft?: () => void; onSwipeRight?: () => void; edgePx?: number },
): void {
  let startX = 0;
  let startY = 0;
  let startTime = 0;

  const onTouchStart = (e: TouchEvent): void => {
    const touch = e.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
  };

  const onTouchEnd = (e: TouchEvent): void => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const dt = Date.now() - startTime;
    const velocity = Math.abs(dx) / Math.max(1, dt);
    const threshold = velocity > FAST_VELOCITY ? SWIPE_THRESHOLD_PX * FAST_THRESHOLD_SCALE : SWIPE_THRESHOLD_PX;

    if (Math.abs(dx) <= threshold || Math.abs(dx) <= Math.abs(dy) * HORIZONTAL_DOMINANCE) return;

    if (dx > 0) {
      if (opts.edgePx !== undefined && startX > opts.edgePx) return;
      opts.onSwipeRight?.();
    } else {
      opts.onSwipeLeft?.();
    }
  };

  createEffect(() => {
    const el = target();
    el.addEventListener('touchstart', onTouchStart as EventListener, { passive: true });
    el.addEventListener('touchend', onTouchEnd as EventListener, { passive: true });
    onCleanup(() => {
      el.removeEventListener('touchstart', onTouchStart as EventListener);
      el.removeEventListener('touchend', onTouchEnd as EventListener);
    });
  });
}
