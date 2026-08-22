import { describe, expect, it } from 'vitest';
import { isOnyxMyinfo, onyxGatewayFromMyinfo } from './onyxDetect';

describe('isOnyxMyinfo', () => {
  it('matches onyx- version tokens in 004', () => {
    expect(isOnyxMyinfo('kain eshmaki.me onyx-abc123 iowx bklmnt')).toBe(true);
  });

  it('matches NETWORK=Onyx', () => {
    expect(isOnyxMyinfo('NETWORK=Onyx CHANTYPES=#& are supported by this server')).toBe(true);
  });

  it('matches NETWORK=IRCXNet only when paired with onyx-', () => {
    expect(isOnyxMyinfo('NETWORK=IRCXNet CHANTYPES=#& are supported by this server')).toBe(false);
    expect(isOnyxMyinfo('eshmaki.me onyx-1 iow NETWORK=IRCXNet CHANTYPES=#&')).toBe(true);
  });

  it('matches known Onyx hosts', () => {
    expect(isOnyxMyinfo('kain eshmaki.me hybrid-1 iow')).toBe(true);
    expect(isOnyxMyinfo('kain ircx.us hybrid-1 iow')).toBe(true);
  });

  it('does not match generic IRC or a generic relay fingerprint', () => {
    expect(isOnyxMyinfo('kain irc.libera.chat ergo-2.14 iow')).toBe(false);
    expect(isOnyxMyinfo('NETWORK=Libera.Chat CHANTYPES=#&')).toBe(false);
    expect(isOnyxMyinfo('NETWORK=IRCXNet PREFIX=(ov)@+')).toBe(false);
  });

  it('synthesizes a WSS gateway from the 004 host', () => {
    expect(onyxGatewayFromMyinfo('kain eshmaki.me onyx-1 iow')).toBe('wss://eshmaki.me:8080');
  });
});
