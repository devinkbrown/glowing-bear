// Proves the mIRC message-colour legibility clamp (task 2) by construction.
//
// Sender-chosen .irc-fg-0..98 colours are absolute hex: #000000 (code 1, plus
// the near-black extended codes) vanishes on dark themes and #ffffff (code 0/98
// + near-white codes) vanishes on the light theme. Each class re-resolves its
// hex through `oklch(from <hex> clamp(var(--irc-l-floor), l, var(--irc-l-ceil))
// c h)` — an OKLCH lightness clamp that keeps hue+chroma (c, h) and only pulls L
// toward the theme's text rail, the same stay-in-family idea as the nick colours.
//
// This test replicates that clamp in the OKLab colour space (clamping OKLab L
// while holding a, b is identical to clamping OKLCH L while holding C, H) and
// verifies every resolved colour clears WCAG AA (>=4.5:1) on its theme's ground
// (--color-gray-950) — computed by relative luminance on the resolved hex. No
// OKLCH palette factory: hand-authored hex, luminance-verified.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8');

// ── sRGB <-> linear ──
const srgbToLinear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (c: number): number => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};
type RGB = [number, number, number];
const parseHex = (hex: string): RGB => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toHex = ([r, g, b]: RGB): string =>
  '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');

const luminance = (rgb: RGB): number =>
  0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);

const contrast = (a: RGB, b: RGB): number => {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

// ── sRGB <-> OKLab (Björn Ottosson) ──
const srgbToOklab = ([R, G, B]: RGB): RGB => {
  const r = srgbToLinear(R);
  const g = srgbToLinear(G);
  const b = srgbToLinear(B);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
};
const oklabToSrgb = ([L, A, B]: RGB): RGB => {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
};

// Mirrors `oklch(from hex clamp(lo, l, hi) c h)`.
const clampLightness = (hex: string, lo: number, hi: number): string => {
  const lab = srgbToOklab(parseHex(hex));
  lab[0] = Math.max(lo, Math.min(hi, lab[0]));
  return toHex(oklabToSrgb(lab));
};

// ── Parse CSS ──
const IRC_FG = (() => {
  const map = new Map<number, string>();
  for (const m of css.matchAll(/\.irc-fg-(\d+)\s*\{\s*color:\s*(#[0-9a-fA-F]{6})/g)) {
    if (m[1] && m[2]) map.set(Number(m[1]), m[2]);
  }
  return map;
})();

type ThemeClamp = { name: string; ground: string; floor: number; ceil: number };

function parseThemeClamps(): ThemeClamp[] {
  const blocks = css.match(/(:root[^{]*|\[data-theme="[^"]+"\])\s*\{[^}]*\}/g) ?? [];
  // Base :root defines the dark default floor/ceil; theme blocks may override.
  let baseFloor = 0.72;
  let baseCeil = 1;
  const out: ThemeClamp[] = [];
  for (const block of blocks) {
    const f = block.match(/--irc-l-floor:\s*([0-9.]+)/)?.[1];
    const c = block.match(/--irc-l-ceil:\s*([0-9.]+)/)?.[1];
    const ground = block.match(/--color-gray-950:\s*(#[0-9a-fA-F]{6});/)?.[1];
    // The base :root block sets the defaults but no ground — capture and skip.
    if (!ground) {
      if (f) baseFloor = parseFloat(f);
      if (c) baseCeil = parseFloat(c);
      continue;
    }
    const name = block.match(/data-theme="([^"]+)"/)?.[1] ?? 'darkbear';
    if (out.some((t) => t.name === name)) continue;
    out.push({
      name,
      ground,
      floor: f ? parseFloat(f) : baseFloor,
      ceil: c ? parseFloat(c) : baseCeil,
    });
  }
  return out;
}

describe('mIRC message-colour clamp (WCAG relative luminance on resolved hex)', () => {
  const themes = parseThemeClamps();

  it('parses all 99 mIRC fg codes (0-98)', () => {
    expect(IRC_FG.size).toBe(99);
  });

  it('defines an --irc clamp for every theme (dark default + light override)', () => {
    expect(themes.length).toBeGreaterThanOrEqual(18);
    // The light theme caps the ceiling; the dark themes lift the floor.
    const light = themes.find((t) => t.name === 'light');
    expect(light?.ceil).toBeLessThan(1);
    expect(themes.filter((t) => t.name !== 'light').every((t) => t.floor >= 0.7)).toBe(true);
  });

  for (const t of themes) {
    it(`${t.name}: every clamped mIRC colour clears 4.5:1 on its ground`, () => {
      const ground = parseHex(t.ground);
      for (const [code, hex] of IRC_FG) {
        const resolved = clampLightness(hex, t.floor, t.ceil);
        const ratio = contrast(parseHex(resolved), ground);
        expect(ratio, `code ${code} (${hex}→${resolved}) on ${t.name} ${t.ground}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('sanity: the raw absolute codes vanish (proves the clamp is load-bearing)', () => {
    const darkGround = parseHex('#000005'); // darkbear
    const lightGround = parseHex('#ffffff'); // light theme
    // Raw #000000 (code 1) is invisible on a dark ground.
    expect(contrast(parseHex('#000000'), darkGround)).toBeLessThan(1.2);
    // Raw #ffffff (code 0/98) is invisible on the light ground.
    expect(contrast(parseHex('#ffffff'), lightGround)).toBeLessThan(1.2);
  });
});
