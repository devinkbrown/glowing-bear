import { describe, expect, it } from 'vitest';
import {
  CONNECT_SERVER_TYPES,
  NON_CONNECT_LISTENERS,
  canOpenOnyxPlainIrc,
  canOpenOnyxTlsIrc,
  defaultSetupTab,
  isConnectableServerType,
  setupTabsForType,
} from './serverTypes';

describe('server types', () => {
  it('exposes the first-class picker types', () => {
    expect([...CONNECT_SERVER_TYPES]).toEqual(['weechat', 'onyx-wss', 'onyx-tls']);
  });

  it('does not offer TLS/plain IRC when the stack cannot open TCP', () => {
    expect(canOpenOnyxTlsIrc()).toBe(false);
    expect(canOpenOnyxPlainIrc()).toBe(false);
    expect(isConnectableServerType('onyx-tls')).toBe(false);
    expect(isConnectableServerType('weechat')).toBe(true);
    expect(isConnectableServerType('onyx-wss')).toBe(true);
  });

  it('does not treat mesh, webhook, or WeeChat api as connect types', () => {
    expect(NON_CONNECT_LISTENERS).toEqual(expect.arrayContaining([
      's2s',
      'webtransport',
      'webhook',
      'udp-media',
      'weechat-api',
      'onyx-plain',
    ]));
  });

  it('picks setup tabs for the chosen type', () => {
    expect(defaultSetupTab('weechat')).toBe('weechat');
    expect(defaultSetupTab('onyx-wss')).toBe('onyx');
    expect(defaultSetupTab('onyx-tls')).toBe('tls');
    expect(setupTabsForType('onyx-tls')[0]).toBe('tls');
    expect(setupTabsForType('onyx-wss')[0]).toBe('onyx');
  });
});
