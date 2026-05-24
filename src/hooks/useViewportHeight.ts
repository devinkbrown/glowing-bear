'use client';

import { useEffect } from 'react';

// iOS Safari has multiple viewport height bugs:
// 1. 100vh includes the address bar, so content overflows when the bar is visible
// 2. The virtual keyboard shrinks visualViewport but doesn't update CSS vh units
// 3. visualViewport.resize fires before the keyboard animation completes
// 4. Focusing an input causes Safari to scroll the page up behind fixed elements
// 5. orientationchange fires before the viewport actually resizes
//
// This hook sets --vh to the real visual viewport height and aggressively
// prevents Safari from scrolling the document behind our fixed-position app shell.
export function useViewportHeight() {
  useEffect(() => {
    let ticking = false;
    let pendingRAF = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let orientTimers: ReturnType<typeof setTimeout>[] = [];

    function update() {
      const vp = window.visualViewport;
      const vh = vp ? vp.height : window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${vh}px`);

      // iOS Safari scrolls the html/body when the keyboard opens, even though
      // our app is position:fixed. Force it back.
      if (window.scrollY !== 0 || (vp && vp.offsetTop !== 0)) {
        window.scrollTo(0, 0);
      }
    }

    // Debounced update via rAF to avoid layout thrash during keyboard animation
    function scheduleUpdate() {
      if (ticking) return;
      ticking = true;
      pendingRAF = requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }

    // iOS: the keyboard animation takes ~300ms. A single resize event fires
    // at the start, but the viewport isn't fully settled yet. Fire again
    // after the animation likely completes.
    function onResize() {
      scheduleUpdate();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        update();
        // Notify message views that the viewport has stabilized
        window.dispatchEvent(new CustomEvent('viewport-stable'));
      }, 350);
    }

    // iOS fires scroll events on the visualViewport when the keyboard pushes
    // the viewport around. Always snap back.
    function resetScroll() {
      window.scrollTo(0, 0);
    }

    // orientationchange fires before the geometry updates; delay the read
    function onOrientationChange() {
      orientTimers.forEach(clearTimeout);
      orientTimers = [setTimeout(update, 100), setTimeout(update, 500)];
    }

    // iOS: when a focused input is near the bottom, Safari scrolls the
    // entire page upward. Catch it and push back.
    function onScroll() {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    }

    update();

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientationChange);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', resetScroll);

    // iOS Safari: focus/blur on inputs can also trigger viewport changes
    // that the resize event misses
    document.addEventListener('focusin', scheduleUpdate);
    document.addEventListener('focusout', scheduleUpdate);

    return () => {
      cancelAnimationFrame(pendingRAF);
      if (resizeTimer) clearTimeout(resizeTimer);
      orientTimers.forEach(clearTimeout);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('scroll', onScroll);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', resetScroll);
      document.removeEventListener('focusin', scheduleUpdate);
      document.removeEventListener('focusout', scheduleUpdate);
    };
  }, []);
}
