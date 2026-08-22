/**
 * Copy-pasteable WeeChat / proxy / Onyx setup snippets generated from the
 * live connect form. Never emit the invalid `weechat.weechat` listener name.
 */

import { DEFAULT_RELAY_PATH, normalizeRelayPath } from './relayUrl';

export interface WeeChatSnippetInput {
  port: number;
  tls: boolean;
  path?: string;
  origin?: string;
}

export function weechatListenerName(tls: boolean, weechatMajor = 4): string {
  if (!tls) return 'weechat';
  return weechatMajor >= 4 ? 'tls.weechat' : 'ssl.weechat';
}

export function weechatQuickstartCommands(input: WeeChatSnippetInput): string[] {
  const listener = weechatListenerName(input.tls);
  return [
    '/secure set relay_password YourSecretPassword',
    '/set relay.network.password "${sec.data.relay_password}"',
    `/relay add ${listener} ${input.port}`,
  ];
}

export function weechatOriginCommand(origin = '*'): string {
  return `/set relay.network.websocket_allowed_origins "${origin}"`;
}

export function weechatBindLocalhostCommand(): string {
  return '/set relay.network.bind_address 127.0.0.1';
}

export function weechatTotpCommands(): string[] {
  return [
    '/secure set relay_totp YOUR_BASE32_SECRET',
    '/set relay.network.totp_secret "${sec.data.relay_totp}"',
  ];
}

export function weechatTlsCertCommands(): string[] {
  return [
    '/relay sslcertkey',
    '/relay tls.certkey',
  ];
}

export function nginxWeechatConfig(port: number, path = DEFAULT_RELAY_PATH): string {
  const p = normalizeRelayPath(path);
  return `server {
    listen 443 ssl http2;
    server_name relay.example.com;

    ssl_certificate     /etc/letsencrypt/live/relay.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;

    location /${p} {
        proxy_pass http://127.0.0.1:${port}/${p};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 604800;
    }
}`;
}

export function caddyWeechatConfig(port: number, path = DEFAULT_RELAY_PATH): string {
  const p = normalizeRelayPath(path);
  return `relay.example.com {
    reverse_proxy /${p} 127.0.0.1:${port}
}`;
}

export function onyxWssEndpoint(host = 'eshmaki.me'): string {
  return `wss://${host}:8080`;
}

/** Implicit TLS IRC (`[tls]` default 6697). Never STARTTLS. */
export function onyxTlsEndpoint(host = 'eshmaki.me'): string {
  return `${host}:6697`;
}

/** Dev/LAN plaintext IRC (`[listen].irc`). Not offered from the HTTPS app. */
export function onyxPlainIrcEndpoint(host = '127.0.0.1'): string {
  return `${host}:6667`;
}

export function letsEncryptRelayPemLines(domain = 'relay.example.com'): string[] {
  return [
    `cat /etc/letsencrypt/live/${domain}/{fullchain,privkey}.pem \\`,
    '  > ~/.weechat/ssl/relay.pem',
    'chmod 600 ~/.weechat/ssl/relay.pem',
  ];
}
