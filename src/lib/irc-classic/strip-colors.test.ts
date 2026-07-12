import { describe, expect, it } from 'vitest';

import { stripFormatting } from './formatter';

describe('stripFormatting — mIRC formatting controls', () => {
  it('leaves plain text unchanged', () => {
    expect(stripFormatting('plain message 12,34 #channel')).toBe('plain message 12,34 #channel');
  });

  it('strips bold, italic, underline, and reset controls', () => {
    expect(stripFormatting('\x02bold\x02 \x1ditalic\x1d \x1funder\x1f \x0fplain')).toBe(
      'bold italic under plain',
    );
  });

  it('strips foreground and foreground/background mIRC color codes', () => {
    expect(stripFormatting('\x0304red \x033,07green-on-orange')).toBe('red green-on-orange');
  });

  it('strips bare reset color codes without dropping following text', () => {
    expect(stripFormatting('before\x03after')).toBe('beforeafter');
  });

  it('keeps non-color comma text after malformed background color syntax', () => {
    expect(stripFormatting('\x034,not-bg')).toBe(',not-bg');
  });

  it('strips truncated foreground color codes at the end of a line', () => {
    expect(stripFormatting('left \x030')).toBe('left ');
  });

  it('leaves the comma from a truncated foreground/background pair visible', () => {
    expect(stripFormatting('left \x0304,')).toBe('left ,');
  });
});
