import { describe, expect, it } from 'vitest';
import {
  buildRelayWebSocketUrl,
  mixedContentBlocked,
  parseRelayHostInput,
  parseRelayLocationParams,
} from './relayUrl';

describe('parseRelayHostInput', () => {
  it('accepts host, host:port, host:port/path, and [ipv6]:port/path', () => {
    expect(parseRelayHostInput('relay.example.com')).toEqual({ host: 'relay.example.com' });
    expect(parseRelayHostInput('relay.example.com:9001')).toEqual({
      host: 'relay.example.com',
      port: 9001,
    });
    expect(parseRelayHostInput('relay.example.com:9001/weechat')).toEqual({
      host: 'relay.example.com',
      port: 9001,
      path: 'weechat',
    });
    expect(parseRelayHostInput('[2001:db8::1]:9001/custom')).toEqual({
      host: '2001:db8::1',
      port: 9001,
      path: 'custom',
    });
  });

  it('strips a pasted scheme and never takes TLS from the host field', () => {
    expect(parseRelayHostInput('wss://relay.example.com:9001')).toEqual({
      host: 'relay.example.com',
      port: 9001,
    });
  });
});

describe('buildRelayWebSocketUrl', () => {
  it('builds /weechat by default and honors a custom path', () => {
    expect(buildRelayWebSocketUrl({
      host: 'relay.example.com',
      port: 9001,
      tls: true,
      path: 'weechat',
    })).toBe('wss://relay.example.com:9001/weechat');
    expect(buildRelayWebSocketUrl({
      host: 'relay.example.com',
      port: 9001,
      tls: false,
      path: 'custom',
    })).toBe('ws://relay.example.com:9001/custom');
  });

  it('wraps IPv6 hosts and ignores a scheme in the host field', () => {
    expect(buildRelayWebSocketUrl({
      host: '2001:db8::1',
      port: 9001,
      tls: true,
      path: 'weechat',
    })).toBe('wss://[2001:db8::1]:9001/weechat');
    expect(buildRelayWebSocketUrl({
      host: 'wss://relay.example.com',
      port: 9001,
      tls: true,
      path: 'weechat',
    })).toBe('wss://relay.example.com:9001/weechat');
  });
});

describe('mixedContentBlocked', () => {
  it('blocks remote plaintext from a secure context', () => {
    expect(mixedContentBlocked(false, 'relay.example.com', true)).toBe(true);
    expect(mixedContentBlocked(true, 'relay.example.com', true)).toBe(false);
    expect(mixedContentBlocked(false, 'localhost', true)).toBe(false);
    expect(mixedContentBlocked(false, 'relay.example.com', false)).toBe(false);
  });
});

describe('parseRelayLocationParams', () => {
  it('reads hash/query host, port, path, tls, and password', () => {
    const params = parseRelayLocationParams(
      '?host=relay.example.com&port=9001',
      '#path=weechat&tls=1&password=secret&autoconnect=1',
    );
    expect(params.host).toBe('relay.example.com');
    expect(params.port).toBe(9001);
    expect(params.path).toBe('weechat');
    expect(params.tls).toBe(true);
    expect(params.password).toBe('secret');
    expect(params.autoconnect).toBe(true);
    expect(params.passwordFromUrl).toBe(true);
  });
});
