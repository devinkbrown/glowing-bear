import { describe, expect, it } from 'vitest';
import { connectivityHops, showTlsPadlock } from './connectivityHops';

describe('connectivityHops', () => {
  it('shows a single relay chip on generic WeeChat (kind A)', () => {
    expect(connectivityHops('weechat-generic', {
      connected: true,
      extrasEnabled: true,
      extrasStatus: 'ready',
    })).toEqual({
      show: true,
      chips: ['relay'],
      hopsLabelKey: 'connectivity.hopsRelay',
    });
    expect(connectivityHops('weechat-generic', {
      connected: false,
      extrasEnabled: false,
      extrasStatus: 'off',
    }).show).toBe(false);
  });

  it('shows relay and extras chips on WeeChat+Onyx (kind B)', () => {
    expect(connectivityHops('weechat-onyx', {
      connected: true,
      extrasEnabled: true,
      extrasStatus: 'connecting',
    })).toEqual({
      show: true,
      chips: ['relay', 'extras'],
      hopsLabelKey: 'connectivity.hops',
    });
  });

  it('shows a single session chip on first-party Onyx (kind C)', () => {
    expect(connectivityHops('onyx-direct-wss', {
      connected: true,
      extrasEnabled: true,
      extrasStatus: 'ready',
    })).toEqual({
      show: true,
      chips: ['session'],
      hopsLabelKey: 'connectivity.hopsSession',
    });
  });
});

describe('showTlsPadlock', () => {
  it('treats kind C WSS as TLS even when the unused relay toggle is off', () => {
    expect(showTlsPadlock('onyx-direct-wss', false)).toBe(true);
    expect(showTlsPadlock('weechat-generic', false)).toBe(false);
    expect(showTlsPadlock('weechat-generic', true)).toBe(true);
  });
});
