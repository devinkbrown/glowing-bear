import { describe, expect, it } from 'vitest';
import { connectModalAction } from './connectModalPolicy';
import { ConnectionState } from '@/lib/weechat/model';

describe('connectModalAction', () => {
  it('closes the connect modal once connected (the regression that broke connect)', () => {
    expect(connectModalAction(ConnectionState.CONNECTED, 'connect')).toBe('close');
  });

  it('leaves other modals alone when connected', () => {
    expect(connectModalAction(ConnectionState.CONNECTED, 'settings')).toBe('none');
    expect(connectModalAction(ConnectionState.CONNECTED, null)).toBe('none');
  });

  it('opens the connect modal on disconnect when nothing else is open', () => {
    expect(connectModalAction(ConnectionState.DISCONNECTED, null)).toBe('open');
  });

  it('does not steal focus from another open modal on disconnect', () => {
    expect(connectModalAction(ConnectionState.DISCONNECTED, 'settings')).toBe('none');
    expect(connectModalAction(ConnectionState.DISCONNECTED, 'connect')).toBe('none');
  });

  it('leaves the modal untouched while connecting / authenticating / reconnecting', () => {
    for (const s of [
      ConnectionState.CONNECTING,
      ConnectionState.AUTHENTICATING,
      ConnectionState.RECONNECTING,
      ConnectionState.ERROR,
    ]) {
      expect(connectModalAction(s, 'connect')).toBe('none');
      expect(connectModalAction(s, null)).toBe('none');
    }
  });
});
