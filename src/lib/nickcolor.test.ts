import { describe, expect, it } from 'vitest';

import { nickColor } from './nickcolor';

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
});
