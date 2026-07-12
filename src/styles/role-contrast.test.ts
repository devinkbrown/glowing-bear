// Proves the P2.5 semantic colour roles are AA-legible by construction on every
// theme. DarkBear has NO OKLCH factory — the roles are hand-authored hex in the
// theme blocks (a shared dark default in :root, a re-derived darker set in the
// light block) and are verified here by the WCAG relative-luminance formula on
// resolved hex, per theme.
//
// Roles (see global.css):
//   --role-primary  = the per-theme --custom-accent (brand / interactive)
//   --role-online   = presence / success green
//   --role-mention  = the hot mention / highlight colour (rose/red)
//   --role-info     = informational / notice lines
//
// A theme inherits the base (:root) role defaults unless it overrides them, so
// the "effective" role for a theme is its own override if present, else the base
// default. --role-primary resolves to that theme's own accent.

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

// The base role defaults live in the FIRST block that sets them (the :root base
// vars block). They cascade to every theme that does not override them.
function baseRole(role: string): string {
  const m = css.match(new RegExp(`--role-${role}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`base --role-${role} not found`);
  return m[1]!;
}
const BASE = {
  online: baseRole('online'),
  mention: baseRole('mention'),
  info: baseRole('info'),
};

type Theme = {
  name: string;
  ground: string;
  primary: string; // resolved --custom-accent
  online: string;
  mention: string;
  info: string;
};

function themeRole(block: string, role: string, fallback: string): string {
  return block.match(new RegExp(`--role-${role}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? fallback;
}

// Parse each theme block that declares a ground + accent, resolving effective
// roles through the base cascade. The base :root vars block declares roles but
// no ground/accent, so it is naturally skipped as a "theme".
function parseThemes(): Theme[] {
  const blocks = css.match(/(:root[^{]*|\[data-theme="[^"]+"\])\s*\{[^}]*\}/g) ?? [];
  const out: Theme[] = [];
  for (const block of blocks) {
    const ground = block.match(/--color-gray-950:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const primary = block.match(/--custom-accent:\s*(#[0-9a-fA-F]{6});/)?.[1];
    if (!ground || !primary) continue;
    const name = block.match(/data-theme="([^"]+)"/)?.[1] ?? 'darkbear';
    if (out.some((t) => t.name === name)) continue;
    out.push({
      name,
      ground,
      primary,
      online: themeRole(block, 'online', BASE.online),
      mention: themeRole(block, 'mention', BASE.mention),
      info: themeRole(block, 'info', BASE.info),
    });
  }
  return out;
}

describe('semantic role token contrast (WCAG relative luminance)', () => {
  const themes = parseThemes();

  it('declares all four role tokens in the base :root block', () => {
    expect(css).toMatch(/--role-primary:\s*var\(--custom-accent/);
    expect(BASE.online).toBeTruthy();
    expect(BASE.mention).toBeTruthy();
    expect(BASE.info).toBeTruthy();
  });

  it('covers every theme that sets a ground (18 blocks + darkbear via :root)', () => {
    expect(themes.length).toBeGreaterThanOrEqual(18);
  });

  it('re-derives the light theme roles off the dark defaults (inverted ground)', () => {
    const light = themes.find((t) => t.name === 'light');
    expect(light).toBeTruthy();
    expect(light!.online).not.toBe(BASE.online);
    expect(light!.mention).not.toBe(BASE.mention);
    expect(light!.info).not.toBe(BASE.info);
  });

  for (const t of themes) {
    // Text roles (notice/info body, mention text, StatCell numbers) must clear
    // WCAG AA body contrast (>=4.5:1) on the theme's own ground.
    it(`${t.name}: --role-online clears 4.5:1 on its ground`, () => {
      expect(contrast(t.ground, t.online)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${t.name}: --role-mention clears 4.5:1 on its ground`, () => {
      expect(contrast(t.ground, t.mention)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${t.name}: --role-info clears 4.5:1 on its ground`, () => {
      expect(contrast(t.ground, t.info)).toBeGreaterThanOrEqual(4.5);
    });
    // Primary is spent mostly on interactive/large/tint chrome (active buffer,
    // links, focus rails), so it is held to AA-large / UI contrast (>=3:1) on
    // its ground — the strictest bound it must meet everywhere.
    it(`${t.name}: --role-primary (accent) clears 3:1 on its ground`, () => {
      expect(contrast(t.ground, t.primary)).toBeGreaterThanOrEqual(3);
    });
    // The hot mention Pip is a SOLID --role-mention badge whose glyphs use the
    // theme GROUND colour (text-gray-950). Those glyphs must clear AA on the
    // badge on every theme (near-black on dark, white on light).
    it(`${t.name}: mention-Pip ground-colour glyphs clear 4.5:1 on the badge`, () => {
      expect(contrast(t.mention, t.ground)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
