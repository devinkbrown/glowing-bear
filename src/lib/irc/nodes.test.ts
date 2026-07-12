import { describe, expect, it } from 'vitest';

import { nodeFromWssGateway, wssUrlForOrochiHost } from './nodes';

describe('Orochi WSS gateway discovery', () => {
  it('derives the default browser gateway from an Orochi 004 host', () => {
    expect(wssUrlForOrochiHost('eshmaki.me')).toBe('wss://eshmaki.me:8080');
    expect(wssUrlForOrochiHost('ircx.us')).toBe('wss://ircx.us:8080');
  });

  it('normalizes whitespace and bracketed host tokens from relay 004', () => {
    expect(wssUrlForOrochiHost('  ircx.us  ')).toBe('wss://ircx.us:8080');
    expect(wssUrlForOrochiHost('[eshmaki.me]')).toBe('wss://eshmaki.me:8080');
  });

  it('preserves explicit secure WebSocket ports and paths', () => {
    expect(wssUrlForOrochiHost('wss://node.example:9443/irc')).toBe('wss://node.example:9443/irc');
  });

  it('coerces explicit URLs to WSS and strips query, hash, and trailing slashes', () => {
    expect(wssUrlForOrochiHost('https://node.example/irc///?token=secret#frag')).toBe(
      'wss://node.example:8080/irc',
    );
  });

  it('rejects malformed host tokens', () => {
    expect(wssUrlForOrochiHost('')).toBeNull();
    expect(wssUrlForOrochiHost('   ')).toBeNull();
    expect(wssUrlForOrochiHost('bad host')).toBeNull();
    expect(wssUrlForOrochiHost('example.com:6697')).toBeNull();
    expect(wssUrlForOrochiHost('example.com/path')).toBeNull();
    expect(wssUrlForOrochiHost(String.raw`example.com\path`)).toBeNull();
  });

  it('turns a discovered gateway into a node candidate', () => {
    expect(nodeFromWssGateway('wss://eshmaki.me:8080', 'detected')).toEqual({
      id: 'detected',
      host: 'eshmaki.me',
      wss: 'wss://eshmaki.me:8080',
    });
  });

  it('uses the default detected id and removes a trailing gateway slash', () => {
    expect(nodeFromWssGateway('wss://ircx.us:8080/')).toEqual({
      id: 'detected',
      host: 'ircx.us',
      wss: 'wss://ircx.us:8080',
    });
  });

  it('rejects malformed or non-secure gateway URLs fail-closed', () => {
    expect(nodeFromWssGateway('not a url')).toBeNull();
    expect(nodeFromWssGateway('http://ircx.us:8080')).toBeNull();
    expect(nodeFromWssGateway('ws://ircx.us:8080')).toBeNull();
  });
});
