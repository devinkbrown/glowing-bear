// Favicon highlight badge — Solid port of the old useFaviconBadge hook.
//
// Draws the app favicon onto a canvas with a red notification badge in the
// top-right corner (with the count when it fits in one digit) and swaps the
// <link rel="icon"> href to the rendered data URL.

import { createEffect, createRoot } from 'solid-js';
import { appAsset } from '@/lib/desktop';

const FAVICON_DEFAULT = appAsset('favicon.svg');
const ICON_PX = 32;
const BADGE_RADIUS_PX = 8;
/** Counts above this render as a plain dot instead of a number. */
const MAX_NUMERIC_BADGE = 9;

/**
 * Reactively re-renders the favicon whenever `getCount()` changes (track a
 * store/signal inside the getter, e.g. `getTotalHighlights`). Returns a
 * cleanup function that stops tracking and restores the default favicon.
 */
export function setupFaviconBadge(getCount: () => number): () => void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return () => {};

  let base: HTMLImageElement | null = null;
  let lastCount = 0;

  const render = (count: number): void => {
    lastCount = count;
    if (count === 0) {
      link.href = FAVICON_DEFAULT;
      return;
    }
    if (!base) return; // re-rendered from img.onload once the base icon loads

    const canvas = document.createElement('canvas');
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(base, 0, 0, ICON_PX, ICON_PX);

    // Red circle in top-right
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(ICON_PX - BADGE_RADIUS_PX, BADGE_RADIUS_PX, BADGE_RADIUS_PX, 0, Math.PI * 2);
    ctx.fill();

    // Number text
    if (count <= MAX_NUMERIC_BADGE) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(count), ICON_PX - BADGE_RADIUS_PX, BADGE_RADIUS_PX + 1);
    }

    link.href = canvas.toDataURL('image/png');
  };

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    base = img;
    if (lastCount > 0) render(lastCount);
  };
  img.src = FAVICON_DEFAULT;

  // Own reactive root so this works from any calling context and can be
  // disposed independently of the caller's owner tree.
  const dispose = createRoot((disposeRoot) => {
    createEffect(() => render(getCount()));
    return disposeRoot;
  });

  return () => {
    dispose();
    link.href = FAVICON_DEFAULT;
  };
}
