import { describe, expect, it } from 'vitest';
import {
  allowsOnyxExtras,
  connectServerTypeForKind,
  hidesOnyxChrome,
  isDirectOnyxSession,
  isSessionKind,
  sessionKindFromConnect,
  usesWeeRelay,
} from './sessionKind';

describe('sessionKindFromConnect', () => {
  it('maps WeeChat picker to kind A', () => {
    expect(sessionKindFromConnect('weechat', false)).toBe('weechat-generic');
    expect(sessionKindFromConnect('weechat', true)).toBe('weechat-generic');
  });

  it('maps Onyx WSS without a relay to kind C', () => {
    expect(sessionKindFromConnect('onyx-wss', false)).toBe('onyx-direct-wss');
  });

  it('maps Onyx WSS plus a WeeChat relay expander to kind B', () => {
    expect(sessionKindFromConnect('onyx-wss', true)).toBe('weechat-onyx');
  });

  it('maps TLS to kind D without blocking C', () => {
    expect(sessionKindFromConnect('onyx-tls', false)).toBe('onyx-tls-irc');
  });
});

describe('session kind predicates', () => {
  it('treats only C as a first-party socket (no WeeRelay, no second WSS)', () => {
    expect(isDirectOnyxSession('onyx-direct-wss')).toBe(true);
    expect(usesWeeRelay('onyx-direct-wss')).toBe(false);
    expect(allowsOnyxExtras('onyx-direct-wss')).toBe(false);
  });

  it('keeps A on the relay and hides Onyx chrome', () => {
    expect(usesWeeRelay('weechat-generic')).toBe(true);
    expect(hidesOnyxChrome('weechat-generic')).toBe(true);
    expect(allowsOnyxExtras('weechat-generic')).toBe(false);
  });

  it('keeps B as the hybrid extras hop only', () => {
    expect(usesWeeRelay('weechat-onyx')).toBe(true);
    expect(allowsOnyxExtras('weechat-onyx')).toBe(true);
    expect(hidesOnyxChrome('weechat-onyx')).toBe(false);
  });

  it('rejects unknown kind tokens', () => {
    expect(isSessionKind('onyx-direct-wss')).toBe(true);
    expect(isSessionKind('bridge-only-ghost')).toBe(false);
  });

  it('round-trips UI server types', () => {
    expect(connectServerTypeForKind('weechat-generic')).toBe('weechat');
    expect(connectServerTypeForKind('onyx-direct-wss')).toBe('onyx-wss');
    expect(connectServerTypeForKind('weechat-onyx')).toBe('onyx-wss');
    expect(connectServerTypeForKind('onyx-tls-irc')).toBe('onyx-tls');
  });
});
