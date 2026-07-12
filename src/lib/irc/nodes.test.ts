import { describe, expect, it } from 'vitest';

import { nodeFromWssGateway, wssUrlForOrochiHost } from './nodes';

describe('Orochi WSS gateway discovery', () => {
  it('derives the default browser gateway from an Orochi 004 host', () => {
    expect(wssUrlForOrochiHost('eshmaki.me')).toBe('wss://eshmaki.me:8080');
    expect(wssUrlForOrochiHost('ircx.us')).toBe('wss://ircx.us:8080');
  });

  it('preserves explicit secure WebSocket ports and paths', () => {
    expect(wssUrlForOrochiHost('wss://node.example:9443/irc')).toBe('wss://node.example:9443/irc');
  });

  it('rejects malformed host tokens', () => {
    expect(wssUrlForOrochiHost('bad host')).toBeNull();
    expect(wssUrlForOrochiHost('example.com:6697')).toBeNull();
  });

  it('turns a discovered gateway into a node candidate', () => {
    expect(nodeFromWssGateway('wss://eshmaki.me:8080', 'detected')).toEqual({
      id: 'detected',
      host: 'eshmaki.me',
      wss: 'wss://eshmaki.me:8080',
    });
  });
});
