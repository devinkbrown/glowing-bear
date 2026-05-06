'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  /** Only trigger swipeRight if touch starts within this many px of the left edge */
  leftEdgeOnly?: number;
  /** Only trigger swipeLeft if touch starts within this many px of the right edge */
  rightEdgeOnly?: number;
}

export function useSwipeGesture(
  ref: RefObject<HTMLElement | null>,
  { onSwipeLeft, onSwipeRight, threshold = 50, leftEdgeOnly, rightEdgeOnly }: SwipeOptions,
) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      startTime.current = Date.now();
    }

    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      const dt = Date.now() - startTime.current;
      const velocity = Math.abs(dx) / Math.max(1, dt);
      const effectiveThreshold = velocity > 0.5 ? threshold * 0.6 : threshold;

      if (Math.abs(dx) > effectiveThreshold && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) {
          if (leftEdgeOnly !== undefined && startX.current > leftEdgeOnly) return;
          onSwipeRight?.();
        } else {
          if (rightEdgeOnly !== undefined && startX.current < window.innerWidth - rightEdgeOnly) return;
          onSwipeLeft?.();
        }
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight, threshold, leftEdgeOnly, rightEdgeOnly]);
}
