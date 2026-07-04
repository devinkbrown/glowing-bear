// iOS visual-viewport height management — Solid port of useViewportHeight.
//
// iOS Safari has multiple viewport height bugs:
// 1. 100vh includes the address bar, so content overflows when the bar is visible
// 2. The virtual keyboard shrinks visualViewport but doesn't update CSS vh units
// 3. visualViewport.resize fires before the keyboard animation completes
// 4. Focusing an input causes Safari to scroll the page up behind fixed elements
// 5. orientationchange fires before the viewport actually resizes
//
// This sets --vh to the real visual viewport height, aggressively prevents
// Safari from scrolling the document behind our fixed-position app shell, and
// dispatches a 'viewport-stable' window event once the keyboard animation has
// settled so message views can re-anchor their scroll position.

/** Keyboard show/hide animation on iOS takes ~300ms; re-measure after it. */
const VIEWPORT_SETTLE_MS = 350;
/** orientationchange fires before geometry updates; re-read at both delays. */
const ORIENTATION_DELAYS_MS = [100, 500] as const;

/**
 * Installs viewport listeners and keeps `--vh` in sync with the visual
 * viewport. Returns a cleanup function that removes every listener and timer.
 */
export function setupViewportHeight(): () => void {
  let ticking = false;
  let pendingRAF = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let orientTimers: ReturnType<typeof setTimeout>[] = [];

  function update(): void {
    const vp = window.visualViewport;
    const vh = vp ? vp.height : window.innerHeight;
    // CONTRACT: --vh is the FULL visual-viewport height in px (NOT a 1% unit).
    // The app shell consumes it directly as `h-[var(--vh,100dvh)]` in App.tsx.
    // Do NOT switch to the `innerHeight * 0.01` "1vh unit" convention without
    // also changing that consumer — a mismatch multiplies the layout 100× and
    // pushes the whole app off-screen (only the input bar stays visible).
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    // iOS Safari scrolls the html/body when the keyboard opens, even though
    // our app is position:fixed. Force it back.
    if (window.scrollY !== 0 || (vp && vp.offsetTop !== 0)) {
      window.scrollTo(0, 0);
    }
  }

  // Debounced update via rAF to avoid layout thrash during keyboard animation
  function scheduleUpdate(): void {
    if (ticking) return;
    ticking = true;
    pendingRAF = requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  }

  // A single resize event fires at the start of the keyboard animation, but
  // the viewport isn't fully settled yet. Fire again after it completes.
  function onResize(): void {
    scheduleUpdate();
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      update();
      // Notify message views that the viewport has stabilized
      window.dispatchEvent(new CustomEvent('viewport-stable'));
    }, VIEWPORT_SETTLE_MS);
  }

  // iOS fires scroll events on the visualViewport when the keyboard pushes
  // the viewport around. Always snap back.
  function resetScroll(): void {
    window.scrollTo(0, 0);
  }

  function onOrientationChange(): void {
    orientTimers.forEach(clearTimeout);
    orientTimers = ORIENTATION_DELAYS_MS.map((ms) => setTimeout(update, ms));
  }

  // iOS: when a focused input is near the bottom, Safari scrolls the entire
  // page upward. Catch it and push back.
  function onScroll(): void {
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

  // iOS Safari: focus/blur on inputs can also trigger viewport changes that
  // the resize event misses
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
}
