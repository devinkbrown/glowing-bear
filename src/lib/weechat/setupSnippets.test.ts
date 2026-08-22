import { describe, expect, it } from 'vitest';
import {
  nginxWeechatConfig,
  onyxPlainIrcEndpoint,
  onyxTlsEndpoint,
  onyxWssEndpoint,
  weechatListenerName,
  weechatOriginCommand,
  weechatQuickstartCommands,
} from './setupSnippets';

describe('setup snippets', () => {
  it('never emits weechat.weechat', () => {
    for (const tls of [true, false]) {
      const cmds = weechatQuickstartCommands({ port: 9001, tls });
      expect(cmds.join('\n')).not.toContain('weechat.weechat');
    }
  });

  it('uses weechat, tls.weechat, or ssl.weechat', () => {
    expect(weechatListenerName(false)).toBe('weechat');
    expect(weechatListenerName(true, 4)).toBe('tls.weechat');
    expect(weechatListenerName(true, 3)).toBe('ssl.weechat');
    expect(weechatQuickstartCommands({ port: 9001, tls: false })[2]).toBe('/relay add weechat 9001');
    expect(weechatQuickstartCommands({ port: 9001, tls: true })[2]).toBe('/relay add tls.weechat 9001');
  });

  it('includes websocket_allowed_origins and a /weechat nginx location', () => {
    expect(weechatOriginCommand('https://eshmaki.me')).toContain('websocket_allowed_origins');
    const nginx = nginxWeechatConfig(9001, 'weechat');
    expect(nginx).toContain('location /weechat');
    expect(nginx).toContain('proxy_pass http://127.0.0.1:9001/weechat');
    expect(nginx).toContain('Upgrade');
  });

  it('matches Onyx listen ports from onyx-server config docs', () => {
    expect(onyxWssEndpoint('eshmaki.me')).toBe('wss://eshmaki.me:8080');
    expect(onyxTlsEndpoint('eshmaki.me')).toBe('eshmaki.me:6697');
    expect(onyxPlainIrcEndpoint()).toBe('127.0.0.1:6667');
  });
});
