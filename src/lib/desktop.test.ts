import { describe, expect, it } from 'vitest';
import { parseDesktopDeepLink } from './desktop';

describe('parseDesktopDeepLink', () => {
  it('accepts only a controlled buffer-navigation target', () => {
    expect(parseDesktopDeepLink('darkbear://open/buffer?target=irc.onyx.%23darkbear'))
      .toBe('irc.onyx.#darkbear');
    expect(parseDesktopDeepLink('darkbear://open/buffer?target=0x1234')).toBe('0x1234');
  });

  it.each([
    'https://example.test/buffer?target=x',
    'darkbear://connect/buffer?target=x',
    'darkbear://open/send?target=x',
    'darkbear://open/buffer?target=x&command=OPER',
    'darkbear://user:password@open/buffer?target=x',
    'darkbear://open/buffer?target=%0APRIVMSG',
    'darkbear://open/buffer?target=',
    'darkbear://open/buffer?target=x#fragment',
  ])('rejects untrusted shape %s', (value) => {
    expect(parseDesktopDeepLink(value)).toBeNull();
  });

  it('rejects oversized targets', () => {
    expect(parseDesktopDeepLink(`darkbear://open/buffer?target=${'a'.repeat(257)}`)).toBeNull();
  });
});
