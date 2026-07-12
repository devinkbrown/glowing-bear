import { describe, expect, it } from 'vitest';

import { NICK_PALETTE, nickColor } from './nickcolor';

// WCAG relative luminance on an sRGB hex string.
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Extreme theme message grounds: lightest (`light` gray-950) and darkest
// (`darkbear` gray-950). Any color legible on both is legible on all 19 themes.
const LIGHT_GROUND = '#ffffff';
const DARK_GROUND = '#000005';
const AA_FLOOR = 3; // WCAG large-text / UI-component minimum

describe('nickColor', () => {
  it('returns the same color for the same nick', () => {
    const nick = 'kain';

    const firstColor = nickColor(nick);
    const secondColor = nickColor(nick);

    expect(secondColor).toBe(firstColor);
  });

  it('spreads a representative nick set across the palette', () => {
    const nicks = [
      'alice',
      'bob',
      'charlie',
      'dana',
      'eve',
      'frank',
      'grace',
      'heidi',
      'ivan',
      'judy',
      'mallory',
      'oscar',
      'peggy',
      'trent',
      'victor',
      'wendy',
    ];

    const colors = new Set(nicks.map((nick) => nickColor(nick)));

    expect(colors.size).toBeGreaterThanOrEqual(8);
  });

  it('handles an empty nick with a stable CSS color', () => {
    const color = nickColor('');

    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(nickColor('')).toBe(color);
  });

  it('handles unicode nicks with deterministic colors', () => {
    const nick = '火星-カイン';

    const color = nickColor(nick);

    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(nickColor(nick)).toBe(color);
  });

  it('yields distinct colors for distinct nicks (palette is not collapsed)', () => {
    expect(nickColor('alice')).not.toBe(nickColor('bob'));
  });

  it('clears the AA contrast floor on both the lightest and darkest grounds', () => {
    for (const color of NICK_PALETTE) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      const onLight = contrast(color, LIGHT_GROUND);
      const onDark = contrast(color, DARK_GROUND);
      expect(onLight, `${color} vs light ground`).toBeGreaterThanOrEqual(AA_FLOOR);
      expect(onDark, `${color} vs dark ground`).toBeGreaterThanOrEqual(AA_FLOOR);
    }
  });

  it('holds every entry within the dual-ground luminance band', () => {
    for (const color of NICK_PALETTE) {
      const l = luminance(color);
      // L must sit in [0.10, 0.30] to clear 3:1 on both pure white and black.
      expect(l, `${color} luminance`).toBeGreaterThanOrEqual(0.1);
      expect(l, `${color} luminance`).toBeLessThanOrEqual(0.3);
    }
  });

  it('exposes 16 unique palette entries', () => {
    expect(new Set(NICK_PALETTE).size).toBe(16);
  });
});
