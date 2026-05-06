'use client';

import { useEffect } from 'react';
import { useStore } from '@/stores';

const FAVICON_DEFAULT = '/darkbear/favicon.ico';
const BADGE_SIZE = 8;

export function useFaviconBadge() {
  const totalHighlights = useStore(s => s.getTotalHighlights());

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;

    if (totalHighlights === 0) {
      link.href = FAVICON_DEFAULT;
      return;
    }

    // Draw the favicon with a red notification badge
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, 32, 32);

      // Red circle in top-right
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(32 - BADGE_SIZE, BADGE_SIZE, BADGE_SIZE, 0, Math.PI * 2);
      ctx.fill();

      // Number text
      if (totalHighlights <= 9) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(totalHighlights), 32 - BADGE_SIZE, BADGE_SIZE + 1);
      }

      link.href = canvas.toDataURL('image/png');
    };
    img.src = FAVICON_DEFAULT;
  }, [totalHighlights]);
}
