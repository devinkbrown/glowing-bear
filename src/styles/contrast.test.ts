// Proves timestamp legibility by construction: every theme's --color-timestamp
// must clear WCAG AA body contrast (>=4.5:1) against that theme's ground
// (--color-gray-950), computed by the relative-luminance formula on resolved
// hex. No OKLCH factory — themes are hand-authored hex, verified here.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8');

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Parse every theme block: capture selector, its --color-gray-950 ground and
// its --color-timestamp value.
type Theme = { name: string; ground: string; ts: string };

function parseThemes(): Theme[] {
  const blocks = css.match(/(:root[^{]*|\[data-theme="[^"]+"\])\s*\{[^}]*\}/g) ?? [];
  const out: Theme[] = [];
  for (const block of blocks) {
    const ground = block.match(/--color-gray-950:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const ts = block.match(/--color-timestamp:\s*(#[0-9a-fA-F]{6});/)?.[1];
    if (!ground || !ts) continue;
    const name = block.match(/data-theme="([^"]+)"/)?.[1] ?? 'darkbear';
    out.push({ name, ground, ts });
  }
  return out;
}

describe('timestamp token contrast (WCAG relative luminance)', () => {
  const themes = parseThemes();

  it('defines a timestamp token for every theme that sets a ground', () => {
    // 18 [data-theme] blocks + darkbear via :root.
    expect(themes.length).toBeGreaterThanOrEqual(18);
  });

  for (const t of themes) {
    it(`${t.name}: --color-timestamp clears 4.5:1 on its ground`, () => {
      expect(contrast(t.ground, t.ts)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('sanity: the old gray-600 border token would have failed 3:1', () => {
    // Guards against anyone re-pointing .msg-ts back at a border token.
    const darkbear = css.match(/\[data-theme="darkbear"\][^{]*\{[^}]*\}/)?.[0] ?? '';
    const g600 = darkbear.match(/--color-gray-600:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const g950 = darkbear.match(/--color-gray-950:\s*(#[0-9a-fA-F]{6});/)?.[1];
    expect(g600 && g950).toBeTruthy();
    expect(contrast(g950!, g600!)).toBeLessThan(3);
  });
});
