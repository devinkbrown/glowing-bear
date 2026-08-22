import { describe, expect, it } from 'vitest';

import { nodeFromWssGateway, wssUrlForOnyxHost } from './nodes';

describe('Onyx Server WSS gateway discovery', () => {
  it('derives the default browser gateway from an Onyx Server 004 host', () => {
    expect(wssUrlForOnyxHost('eshmaki.me')).toBe('wss://eshmaki.me:8080');
    expect(wssUrlForOnyxHost('ircx.us')).toBe('wss://ircx.us:8080');
  });

  it('normalizes whitespace and bracketed host tokens from relay 004', () => {
    expect(wssUrlForOnyxHost('  ircx.us  ')).toBe('wss://ircx.us:8080');
    expect(wssUrlForOnyxHost('[eshmaki.me]')).toBe('wss://eshmaki.me:8080');
  });

  it('preserves explicit secure WebSocket ports and paths', () => {
    expect(wssUrlForOnyxHost('wss://node.example:9443/irc')).toBe('wss://node.example:9443/irc');
  });

  it('coerces explicit URLs to WSS and strips query, hash, and trailing slashes', () => {
    expect(wssUrlForOnyxHost('https://node.example/irc///?token=secret#frag')).toBe(
      'wss://node.example:8080/irc',
    );
  });

  it('adds the browser gateway fallback port to explicit WSS URLs without one', () => {
    expect(wssUrlForOnyxHost('wss://node.example/relay')).toBe('wss://node.example:8080/relay');
    expect(wssUrlForOnyxHost('https://Example.COM')).toBe('wss://example.com:8080');
  });

  it('preserves IPv6 literals and explicit ports while normalizing path suffixes', () => {
    expect(wssUrlForOnyxHost('wss://[2001:db8::1]:9443/irc/')).toBe(
      'wss://[2001:db8::1]:9443/irc',
    );
  });

  it('rejects malformed host tokens', () => {
    expect(wssUrlForOnyxHost('')).toBeNull();
    expect(wssUrlForOnyxHost('   ')).toBeNull();
    expect(wssUrlForOnyxHost('bad host')).toBeNull();
    expect(wssUrlForOnyxHost('example.com:6697')).toBeNull();
    expect(wssUrlForOnyxHost('example.com/path')).toBeNull();
    expect(wssUrlForOnyxHost(String.raw`example.com\path`)).toBeNull();
    expect(wssUrlForOnyxHost('wss://')).toBeNull();
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

  it('preserves a caller-provided id and normalized secure gateway URL', () => {
    expect(nodeFromWssGateway('wss://Example.COM:8080/path/', 'relay-004')).toEqual({
      id: 'relay-004',
      host: 'example.com',
      wss: 'wss://example.com:8080/path',
    });
  });

  it('accepts secure IPv6 gateway URLs', () => {
    expect(nodeFromWssGateway('wss://[2001:db8::1]:9443/irc/', 'v6')).toEqual({
      id: 'v6',
      host: '[2001:db8::1]',
      wss: 'wss://[2001:db8::1]:9443/irc',
    });
  });

  it('rejects malformed or non-secure gateway URLs fail-closed', () => {
    expect(nodeFromWssGateway('not a url')).toBeNull();
    expect(nodeFromWssGateway('http://ircx.us:8080')).toBeNull();
    expect(nodeFromWssGateway('ws://ircx.us:8080')).toBeNull();
    expect(nodeFromWssGateway('wss://')).toBeNull();
  });
});
