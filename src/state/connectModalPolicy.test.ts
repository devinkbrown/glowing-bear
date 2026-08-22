import { describe, expect, it } from 'vitest';
import { connectModalAction } from './connectModalPolicy';
import { ConnectionState } from '@/lib/weechat/model';
import type { ModalType } from '@/types';

const KNOWN_NON_CONNECT_MODALS: Exclude<ModalType, 'connect' | null>[] = [
  'settings',
  'bufferSwitcher',
  'help',
  'about',
  'channelInfo',
  'userProfile',
  'services',
  'channelList',
  'operConsole',
];

describe('connectModalAction', () => {
  it('closes the connect modal once connected (the regression that broke connect)', () => {
    expect(connectModalAction(ConnectionState.CONNECTED, 'connect')).toBe('close');
  });

  it('closes the connect modal when first-party Onyx WSS is ready without a relay', () => {
    expect(connectModalAction(ConnectionState.DISCONNECTED, 'connect', { firstPartyReady: true })).toBe('close');
  });

  it('leaves the modal open while first-party Onyx WSS is dialing', () => {
    expect(connectModalAction(ConnectionState.DISCONNECTED, 'connect', { firstPartyConnecting: true })).toBe('none');
    expect(connectModalAction(ConnectionState.DISCONNECTED, null, { firstPartyConnecting: true })).toBe('none');
  });

  it('leaves other modals alone when connected', () => {
    expect(connectModalAction(ConnectionState.CONNECTED, 'settings')).toBe('none');
    expect(connectModalAction(ConnectionState.CONNECTED, null)).toBe('none');
  });

  it('opens the connect modal on disconnect when nothing else is open', () => {
    expect(connectModalAction(ConnectionState.DISCONNECTED, null)).toBe('open');
  });

  it('does not steal focus from another open modal on disconnect', () => {
    for (const modal of KNOWN_NON_CONNECT_MODALS) {
      expect(connectModalAction(ConnectionState.DISCONNECTED, modal)).toBe('none');
    }
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

  it('keeps the policy fail-closed for malformed connection states', () => {
    const malformedState = 'half-open' as ConnectionState;

    expect(connectModalAction(malformedState, null)).toBe('none');
    expect(connectModalAction(malformedState, 'connect')).toBe('none');
  });

  it('keeps malformed modal values from opening or closing anything', () => {
    const malformedModal = 'floating-debug-panel' as ModalType;

    expect(connectModalAction(ConnectionState.CONNECTED, malformedModal)).toBe('none');
    expect(connectModalAction(ConnectionState.DISCONNECTED, malformedModal)).toBe('none');
  });
});
