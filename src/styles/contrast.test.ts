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

// ── Frosted reading-surface veil (task 1) ──────────────────────────────────
// The reading surface fills with --surface-veil (color-mix of gray-900 at P%)
// over the animated ThemeBg scene, backdrop-blurred. To guarantee body text
// stays AA over ANY scene, we composite the veil over the worst-case scene
// EXTREME — pure white for dark themes (brightest possible backdrop lowers
// light-text contrast the most), pure black for the light theme — and require
// primary body text (gray-200, the reading-surface default) to clear 4.5:1.
// Secondary body text (gray-300) must clear AA-large 3:1 on that same extreme.

type RGB = [number, number, number];
function parseHex(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// sRGB alpha-composite of `veil` (gray-900 at alpha P/100) over opaque backdrop.
function composite(g900: string, backdrop: string, pct: number): string {
  const a = pct / 100;
  const [r9, g9, b9] = parseHex(g900);
  const [rb, gb, bb] = parseHex(backdrop);
  const mix: RGB = [
    Math.round(a * r9 + (1 - a) * rb),
    Math.round(a * g9 + (1 - a) * gb),
    Math.round(a * b9 + (1 - a) * bb),
  ];
  return '#' + mix.map((x) => x.toString(16).padStart(2, '0')).join('');
}

type Veil = { name: string; g900: string; g200: string; g300: string; pct: number };

function parseVeils(): Veil[] {
  const blocks = css.match(/(:root[^{]*|\[data-theme="[^"]+"\])\s*\{[^}]*\}/g) ?? [];
  const out: Veil[] = [];
  for (const block of blocks) {
    const pctRaw = block.match(/--surface-veil:\s*color-mix\(in srgb,\s*var\(--color-gray-900[^)]*\)\s*(\d+)%/)?.[1];
    const g900 = block.match(/--color-gray-900:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const g200 = block.match(/--color-gray-200:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const g300 = block.match(/--color-gray-300:\s*(#[0-9a-fA-F]{6});/)?.[1];
    if (!pctRaw || !g900 || !g200 || !g300) continue;
    const name = block.match(/data-theme="([^"]+)"/)?.[1] ?? 'darkbear';
    if (out.some((v) => v.name === name)) continue;
    out.push({ name, g900, g200, g300, pct: parseInt(pctRaw, 10) });
  }
  return out;
}

// ── Muted body text (gray-500) ─────────────────────────────────────────────
// gray-500 is the "muted text" ramp step (text-gray-500 is used ~130x as text
// and ~0x decoratively). It must clear WCAG AA body contrast (>=4.5:1) against
// its own theme ground, and stay dimmer than gray-400 (tertiary text) so the
// text hierarchy holds. Both directions matter: dark themes darken the ramp,
// the light theme inverts it (gray-400 carries MORE contrast than gray-500).

type Muted = { name: string; ground: string; g400: string; g500: string };

function parseMuted(): Muted[] {
  const blocks = css.match(/(:root[^{]*|\[data-theme="[^"]+"\])\s*\{[^}]*\}/g) ?? [];
  const out: Muted[] = [];
  for (const block of blocks) {
    const ground = block.match(/--color-gray-950:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const g400 = block.match(/--color-gray-400:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const g500 = block.match(/--color-gray-500:\s*(#[0-9a-fA-F]{6});/)?.[1];
    if (!ground || !g400 || !g500) continue;
    const name = block.match(/data-theme="([^"]+)"/)?.[1] ?? 'darkbear';
    if (out.some((m) => m.name === name)) continue;
    out.push({ name, ground, g400, g500 });
  }
  return out;
}

describe('muted body text contrast (WCAG relative luminance)', () => {
  const muted = parseMuted();

  it('defines a gray-500 muted-text step for every theme', () => {
    expect(muted.length).toBeGreaterThanOrEqual(18);
  });

  for (const m of muted) {
    it(`${m.name}: gray-500 muted text clears 4.5:1 on its ground`, () => {
      expect(contrast(m.ground, m.g500)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${m.name}: gray-500 stays dimmer than gray-400 (hierarchy holds)`, () => {
      // Dimmer == lower contrast against the ground the muted step is read on.
      expect(contrast(m.ground, m.g500)).toBeLessThanOrEqual(contrast(m.ground, m.g400));
    });
  }
});

describe('reading-surface veil contrast (WCAG relative luminance)', () => {
  const veils = parseVeils();

  it('defines a per-theme --surface-veil density for every theme', () => {
    expect(veils.length).toBeGreaterThanOrEqual(18);
  });

  for (const v of veils) {
    const isLight = luminance(v.g900) > luminance(v.g200);
    const extreme = isLight ? '#000000' : '#ffffff';
    const surface = composite(v.g900, extreme, v.pct);

    it(`${v.name}: primary body text (gray-200) clears 4.5:1 over veil on worst-case scene`, () => {
      expect(contrast(surface, v.g200)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${v.name}: secondary body text (gray-300) clears 3:1 over veil on worst-case scene`, () => {
      expect(contrast(surface, v.g300)).toBeGreaterThanOrEqual(3);
    });
  }
});
