import { describe, expect, it } from 'vitest';
import {
  ONYX_WEBSOCKET_PROTOCOLS,
  ONYX_WEB_CAPS,
  WANTED_CAP_SKIP,
  wantedCaps,
} from './wantedCaps';

const HALLOY_ONLY = ['soju.im/bouncer-networks', 'soju.im/filehost', 'draft/whoami'];
const SERVER_ONLY_FOR_HALLOY = [
  'account-tag',
  'draft/search',
  'draft/message-editing',
  'draft/channel-rename',
  'draft/account-registration',
  'draft/pre-away',
  'draft/netsplit',
  'draft/netjoin',
];
const VENDOR = ['onyx/session-sync', 'onyx/bouncer', 'onyx/topics', 'onyx/e2ee'];

describe('wantedCaps', () => {
  it('offers media then text IRCv3 subprotocols', () => {
    expect([...ONYX_WEBSOCKET_PROTOCOLS]).toEqual(['onyx.irc-media.v1', 'text.ircv3.net']);
  });

  it('requests the Onyx web set only when advertised', () => {
    const advertised = [...ONYX_WEB_CAPS, 'sts', ...HALLOY_ONLY, 'made-up/cap'];
    const req = wantedCaps(advertised, { hasSaslCredentials: true });
    expect(req).toEqual([...ONYX_WEB_CAPS]);
    expect(req).toContain('sasl');
    expect(req).not.toContain('sts');
    for (const cap of HALLOY_ONLY) expect(req).not.toContain(cap);
    expect(req).not.toContain('made-up/cap');
  });

  it('skips sasl when no credentials are configured', () => {
    const req = wantedCaps(['sasl', 'message-tags'], { hasSaslCredentials: false });
    expect(req).toEqual(['message-tags']);
  });

  it('owns Halloy-missing server-only caps and vendor onyx/* when advertised', () => {
    const req = wantedCaps([...SERVER_ONLY_FOR_HALLOY, ...VENDOR], { hasSaslCredentials: false });
    expect(req).toEqual([...SERVER_ONLY_FOR_HALLOY, ...VENDOR]);
  });

  it('never requests skip-list tokens even when advertised', () => {
    const req = wantedCaps([...WANTED_CAP_SKIP, 'server-time'], { hasSaslCredentials: true });
    expect(req).toEqual(['server-time']);
  });

  it('does not invent tokens that were not in CAP LS', () => {
    expect(wantedCaps(['message-tags'], { hasSaslCredentials: true })).toEqual(['message-tags']);
    expect(wantedCaps([], { hasSaslCredentials: true })).toEqual([]);
  });
});
