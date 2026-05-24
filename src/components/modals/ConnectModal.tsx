'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/stores';
import { ConnectionState } from '@/types';
import type { ThemeName } from '@/types';
import AstronautBear from '@/components/ui/AstronautBear';
import ThemeBg from '@/components/ui/ThemeBg';

const THEME_LIST: { id: ThemeName; name: string; accent: string }[] = [
  { id: 'darkbear', name: 'DarkBear', accent: '#818cf8' },
  { id: 'midnight', name: 'Midnight', accent: '#8b9cf8' },
  { id: 'obsidian', name: 'Obsidian', accent: '#a78bfa' },
  { id: 'nord', name: 'Nord', accent: '#88c0d0' },
  { id: 'gruvbox', name: 'Gruvbox', accent: '#d79921' },
  { id: 'rose-pine', name: 'Rose Pine', accent: '#eb6f92' },
  { id: 'abyss', name: 'Abyss', accent: '#2dd4bf' },
  { id: 'ember', name: 'Ember', accent: '#f97316' },
  { id: 'aurora', name: 'Aurora', accent: '#a78bfa' },
  { id: 'catppuccin', name: 'Catppuccin', accent: '#cba6f7' },
  { id: 'tokyo-night', name: 'Tokyo Night', accent: '#7aa2f7' },
  { id: 'dracula', name: 'Dracula', accent: '#bd93f9' },
  { id: 'solarized', name: 'Solarized', accent: '#268bd2' },
  { id: 'starfield', name: 'Starfield', accent: '#818cf8' },
  { id: 'lightning', name: 'Lightning', accent: '#60a5fa' },
  { id: 'phoenix', name: 'Phoenix', accent: '#f59e0b' },
  { id: 'retro', name: 'Retro Arcade', accent: '#ff00ff' },
  { id: 'light', name: 'Light', accent: '#4f46e5' },
  { id: 'custom', name: 'Custom', accent: '#888' },
];

const THEME_ACCENT: Record<string, { accent: string; bg1: string; bg2: string; bg3: string }> = {
  darkbear:     { accent: '#818cf8', bg1: '#0c0d1a', bg2: '#06060d', bg3: '#020208' },
  midnight:     { accent: '#60a5fa', bg1: '#0a0e1a', bg2: '#060a12', bg3: '#020408' },
  obsidian:     { accent: '#a78bfa', bg1: '#0c0a14', bg2: '#08060e', bg3: '#040208' },
  nord:         { accent: '#88c0d0', bg1: '#0d1117', bg2: '#0a0e14', bg3: '#060a0e' },
  gruvbox:      { accent: '#fabd2f', bg1: '#1a1410', bg2: '#120e0a', bg3: '#0a0806' },
  'rose-pine':  { accent: '#c4a7e7', bg1: '#150e18', bg2: '#0e0812', bg3: '#08040a' },
  abyss:        { accent: '#0ea5e9', bg1: '#020810', bg2: '#01060c', bg3: '#000408' },
  ember:        { accent: '#f97316', bg1: '#120a04', bg2: '#0c0602', bg3: '#060200' },
  aurora:       { accent: '#34d399', bg1: '#080d12', bg2: '#040a0e', bg3: '#020608' },
  catppuccin:   { accent: '#cba6f7', bg1: '#11111b', bg2: '#0c0c14', bg3: '#06060c' },
  'tokyo-night':{ accent: '#7aa2f7', bg1: '#0a0e16', bg2: '#080a12', bg3: '#04060a' },
  dracula:      { accent: '#bd93f9', bg1: '#16101e', bg2: '#0e0a14', bg3: '#06040a' },
  solarized:    { accent: '#268bd2', bg1: '#001620', bg2: '#001018', bg3: '#000810' },
  starfield:    { accent: '#818cf8', bg1: '#0c0d1a', bg2: '#06060d', bg3: '#020208' },
  lightning:    { accent: '#60a5fa', bg1: '#080a12', bg2: '#06080e', bg3: '#02040a' },
  phoenix:      { accent: '#f59e0b', bg1: '#120a04', bg2: '#0c0602', bg3: '#060200' },
  retro:        { accent: '#ff00ff', bg1: '#0a0a18', bg2: '#060612', bg3: '#02020a' },
  light:        { accent: '#4f46e5', bg1: '#e8eaf0', bg2: '#dde0e8', bg3: '#d0d4e0' },
  custom:       { accent: '#818cf8', bg1: '#0c0d1a', bg2: '#06060d', bg3: '#020208' },
};

interface Props {
  onClose?: () => void;
}

function CmdLine({ cmd, label }: { cmd: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [cmd]);

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 pl-1">{label}</span>}
      <div className="group flex items-center gap-0 rounded-lg bg-white/[0.03] border border-white/[0.05] overflow-hidden">
        <code className="flex-1 text-[12px] text-gray-300 font-mono px-3 py-2.5 leading-relaxed select-all overflow-x-auto guide-no-scrollbar">{cmd}</code>
        <button onClick={copy}
          className="shrink-0 w-9 self-stretch flex items-center justify-center text-gray-600 hover:text-[var(--custom-accent,#818cf8)] active:scale-90 transition-all border-l border-white/[0.05]">
          {copied ? (
            <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8l3 3 5-6" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 11V3h8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function ShellBlock({ lines }: { lines: string[] }) {
  const text = lines.join(String.fromCharCode(10));
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <div className="relative group rounded-lg bg-[rgba(0,0,0,0.25)] border border-white/[0.04] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04]">
        <div className="flex gap-1">
          <span className="w-[7px] h-[7px] rounded-full bg-white/[0.06]" />
          <span className="w-[7px] h-[7px] rounded-full bg-white/[0.06]" />
          <span className="w-[7px] h-[7px] rounded-full bg-white/[0.06]" />
        </div>
        <span className="flex-1 text-[9px] text-gray-600 font-mono">shell</span>
        <button onClick={copy}
          className="text-gray-600 hover:text-[var(--custom-accent,#818cf8)] active:scale-90 transition-all">
          {copied ? (
            <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8l3 3 5-6" /></svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 11V3h8" />
            </svg>
          )}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-[11px] leading-[1.7] font-mono overflow-x-auto text-gray-300 guide-no-scrollbar">
        {lines.map((l, i) => <div key={i}><span className="text-gray-600 select-none">$ </span>{l}</div>)}
      </pre>
    </div>
  );
}

function Callout({ type, children }: { type: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: { bg: 'bg-[var(--custom-accent,#818cf8)]/[0.06]', border: 'border-[var(--custom-accent,#818cf8)]/15', icon: 'text-[var(--custom-accent,#818cf8)]', dot: 'bg-[var(--custom-accent,#818cf8)]' },
    warn: { bg: 'bg-amber-500/[0.06]', border: 'border-amber-500/15', icon: 'text-amber-400', dot: 'bg-amber-400' },
    tip: { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/15', icon: 'text-emerald-400', dot: 'bg-emerald-400' },
  }[type];

  return (
    <div className={`flex items-start gap-2.5 ${styles.bg} border ${styles.border} rounded-lg px-3 py-2.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} mt-[5px] shrink-0`} />
      <span className="text-[11px] text-gray-400 leading-relaxed">{children}</span>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--custom-accent,#818cf8)]/15 text-[var(--custom-accent,#818cf8)] text-[10px] font-bold flex items-center justify-center">
      {n}
    </span>
  );
}

function NginxConfig() {
  const cfg = `server {
    listen 443 ssl http2;
    server_name relay.example.com;

    ssl_certificate     /etc/letsencrypt/live/relay.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;

    location /weechat {
        proxy_pass http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 604800;
    }
}`;
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(cfg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <div className="relative group rounded-lg bg-[rgba(0,0,0,0.25)] border border-white/[0.04] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04]">
        <span className="flex-1 text-[9px] text-gray-600 font-mono">nginx.conf</span>
        <button onClick={copy} className="text-gray-600 hover:text-[var(--custom-accent,#818cf8)] active:scale-90 transition-all">
          {copied ? (
            <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8l3 3 5-6" /></svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 11V3h8" />
            </svg>
          )}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-[11px] leading-[1.6] font-mono overflow-x-auto text-gray-400 guide-no-scrollbar">
        {cfg}
      </pre>
    </div>
  );
}

function CaddyConfig() {
  const cfg = `relay.example.com {
    reverse_proxy /weechat 127.0.0.1:9001
}`;
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(cfg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <div className="relative group rounded-lg bg-[rgba(0,0,0,0.25)] border border-white/[0.04] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04]">
        <span className="flex-1 text-[9px] text-gray-600 font-mono">Caddyfile</span>
        <button onClick={copy} className="text-gray-600 hover:text-[var(--custom-accent,#818cf8)] active:scale-90 transition-all">
          {copied ? (
            <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8l3 3 5-6" /></svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 11V3h8" />
            </svg>
          )}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-[11px] leading-[1.6] font-mono overflow-x-auto text-gray-400 guide-no-scrollbar">
        {cfg}
      </pre>
    </div>
  );
}

interface GuideSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  render: (port: number, tls: boolean) => React.ReactNode;
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'quickstart',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M8.5 1.5L3 9h5l-.5 5.5L13 7H8l.5-5.5z" />
      </svg>
    ),
    title: 'Quick start',
    badge: '3 steps',
    render: (port, tls) => (
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-gray-400 leading-relaxed">
          Get connected in under a minute. Run these three commands inside WeeChat, then fill in the form above.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <StepNumber n={1} />
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-[12px] text-gray-300 font-medium">Set a relay password</span>
              <CmdLine cmd="/set relay.network.password YourSecretPassword" />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <StepNumber n={2} />
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-[12px] text-gray-300 font-medium">Start the relay listener</span>
              <CmdLine cmd={`/relay add ${tls ? 'tls' : 'weechat'}.weechat ${port}`} />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <StepNumber n={3} />
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-[12px] text-gray-300 font-medium">Connect from DarkBear</span>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Enter your server hostname, port <code className="guide-code">{port}</code>, and the password above. {tls ? 'TLS is enabled.' : 'Toggle TLS on if your relay supports it.'}
              </p>
            </div>
          </div>
        </div>

        <Callout type="tip">
          Verify the relay is running: <code className="guide-code">/relay</code> will list all active relay listeners and connected clients.
        </Callout>
      </div>
    ),
  },
  {
    id: 'relay',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="1" y="4" width="14" height="8" rx="2" /><circle cx="4.5" cy="8" r="1" fill="currentColor" stroke="none" /><path d="M8 6v4M11 6v4" />
      </svg>
    ),
    title: 'Relay setup in depth',
    render: (port, tls) => (
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-gray-400 leading-relaxed">
          WeeChat&apos;s built-in relay turns your IRC session into a server that web clients like DarkBear can connect to over WebSocket.
        </p>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">Password</span>
          <p className="text-[11px] text-gray-500 leading-relaxed pl-1 pb-1">
            Use WeeChat&apos;s secure storage so your password never appears in plain-text config files.
          </p>
          <CmdLine cmd="/secure set relay_password YourSecretPassword" />
          <CmdLine cmd='/set relay.network.password "${sec.data.relay_password}"' />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">Hashed passwords</span>
          <p className="text-[11px] text-gray-500 leading-relaxed pl-1 pb-1">
            WeeChat 2.9+ supports PBKDF2 password hashing. Store the hash instead of the plain-text password for extra security.
          </p>
          <CmdLine cmd='/set relay.network.password_hash_algo "pbkdf2+sha512"' />
          <CmdLine cmd="/set relay.network.password_hash_iterations 100000" />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">Listener</span>
          <p className="text-[11px] text-gray-500 leading-relaxed pl-1 pb-1">
            The protocol prefix determines encryption. Use <code className="guide-code">tls.weechat</code> for direct TLS, or plain <code className="guide-code">weechat</code> if a reverse proxy handles TLS.
          </p>
          <CmdLine cmd={`/relay add ${tls ? 'tls' : 'weechat'}.weechat ${port}`} label={tls ? 'Direct TLS' : 'Plain (proxy handles TLS)'} />
        </div>

        <Callout type="info">
          For WeeChat &lt; 4.0, replace <code className="guide-code">tls</code> with <code className="guide-code">ssl</code> in the relay command.
          The <code className="guide-code">api</code> protocol (WeeChat 4.0+) is also supported — use <code className="guide-code">tls.api</code> or <code className="guide-code">api</code>.
        </Callout>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">Useful settings</span>
          <CmdLine cmd="/set relay.network.max_clients 5" label="Limit concurrent clients" />
          <CmdLine cmd='/set relay.network.allowed_ips "*"' label="Allowed IP ranges (default: all)" />
          <CmdLine cmd="/set relay.network.bind_address 0.0.0.0" label="Listen address" />
        </div>
      </div>
    ),
  },
  {
    id: 'tls',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 016 0v2" />
      </svg>
    ),
    title: 'TLS encryption',
    render: () => (
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-gray-400 leading-relaxed">
          TLS encrypts the connection between DarkBear and your WeeChat relay. Without it, your password and all messages travel in plain text.
        </p>

        <Callout type="warn">
          <strong className="text-amber-300">Always use TLS</strong> when connecting over the internet. Unencrypted relay connections expose your IRC password and session to anyone on the network path.
        </Callout>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">Let&apos;s Encrypt (recommended)</span>
          <p className="text-[11px] text-gray-500 leading-relaxed pl-1 pb-1">
            Concatenate your certificate chain and private key into the file WeeChat expects.
          </p>
          <ShellBlock lines={[
            'cat /etc/letsencrypt/live/relay.example.com/{fullchain,privkey}.pem \\',
            '  > ~/.config/weechat/relay.pem',
            'chmod 600 ~/.config/weechat/relay.pem',
          ]} />
          <div className="mt-1">
            <CmdLine cmd="/relay sslcertkey" label="Reload the cert in WeeChat" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">Auto-renewal hook</span>
          <p className="text-[11px] text-gray-500 leading-relaxed pl-1 pb-1">
            Add a certbot deploy hook so the relay.pem stays fresh after renewals.
          </p>
          <ShellBlock lines={[
            'cat > /etc/letsencrypt/renewal-hooks/deploy/weechat.sh << \'EOF\'',
            '#!/bin/bash',
            'cat /etc/letsencrypt/live/relay.example.com/{fullchain,privkey}.pem \\',
            '  > /home/you/.config/weechat/relay.pem',
            'chmod 600 /home/you/.config/weechat/relay.pem',
            'EOF',
            'chmod +x /etc/letsencrypt/renewal-hooks/deploy/weechat.sh',
          ]} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">Self-signed (testing only)</span>
          <p className="text-[11px] text-gray-500 leading-relaxed pl-1 pb-1">
            Your browser will warn about self-signed certs. Visit <code className="guide-code">https://host:port</code> first to accept the certificate, then connect from DarkBear.
          </p>
          <ShellBlock lines={[
            'openssl req -x509 -nodes -days 365 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \\',
            '  -keyout relay-key.pem -out relay-cert.pem -subj "/CN=relay.local"',
            'cat relay-cert.pem relay-key.pem > ~/.config/weechat/relay.pem',
          ]} />
        </div>

        <Callout type="tip">
          WeeChat watches <code className="guide-code">relay.pem</code> for changes and auto-reloads it. No restart needed after renewal.
        </Callout>
      </div>
    ),
  },
  {
    id: 'proxy',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 4h12M2 8h12M2 12h12" /><circle cx="5" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="7" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    title: 'Reverse proxy (nginx / Caddy)',
    render: (port) => (
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-gray-400 leading-relaxed">
          A reverse proxy lets you serve the relay on port 443, which works through corporate firewalls and avoids exposing custom ports. The proxy handles TLS, so WeeChat listens in plain mode.
        </p>

        <div className="flex flex-col gap-1.5">
          <CmdLine cmd={`/relay add weechat.weechat ${port}`} label="WeeChat: plain listener on localhost" />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">nginx</span>
          <p className="text-[11px] text-gray-500 leading-relaxed pl-1 pb-1">
            The <code className="guide-code">proxy_read_timeout</code> of 7 days keeps idle WebSocket connections alive.
          </p>
          <NginxConfig />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">Caddy</span>
          <p className="text-[11px] text-gray-500 leading-relaxed pl-1 pb-1">
            Caddy auto-provisions Let&apos;s Encrypt certificates and upgrades WebSocket connections automatically.
          </p>
          <CaddyConfig />
        </div>

        <Callout type="info">
          When connecting through a proxy, enter the proxy hostname (e.g. <code className="guide-code">relay.example.com</code>) and port <code className="guide-code">443</code> in the form above, with TLS enabled.
        </Callout>
      </div>
    ),
  },
  {
    id: 'totp',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="6" /><path d="M8 4v4l2.5 1.5" />
      </svg>
    ),
    title: 'TOTP two-factor auth',
    render: () => (
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-gray-400 leading-relaxed">
          TOTP adds a time-based 6-digit code on top of your password. Even if someone steals your relay password, they can&apos;t connect without the code from your authenticator app.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <StepNumber n={1} />
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-[12px] text-gray-300 font-medium">Generate a secret</span>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Create a random base32 secret. This is the shared key between WeeChat and your authenticator app.
              </p>
              <ShellBlock lines={[
                'python3 -c "import secrets, base64; print(base64.b32encode(secrets.token_bytes(20)).decode())"',
              ]} />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <StepNumber n={2} />
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-[12px] text-gray-300 font-medium">Store it securely in WeeChat</span>
              <CmdLine cmd="/secure set relay_totp YOUR_BASE32_SECRET" />
              <CmdLine cmd='/set relay.network.totp_secret "${sec.data.relay_totp}"' />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <StepNumber n={3} />
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-[12px] text-gray-300 font-medium">Add to your authenticator app</span>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                In Google Authenticator, Authy, or any TOTP app, add a new account manually and enter the same base32 secret. Use &ldquo;WeeChat Relay&rdquo; as the account name.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <StepNumber n={4} />
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-[12px] text-gray-300 font-medium">Connect with TOTP</span>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Enable the <strong className="text-gray-400">TOTP</strong> toggle in Advanced Options above. Enter the 6-digit code from your authenticator when connecting. DarkBear appends it to your password automatically.
              </p>
            </div>
          </div>
        </div>

        <Callout type="warn">
          Save a backup of your TOTP secret somewhere safe. If you lose access to your authenticator app without the secret, you&apos;ll need to edit <code className="guide-code">sec.conf</code> directly to remove TOTP.
        </Callout>
      </div>
    ),
  },
  {
    id: 'security',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M8 1.5L2.5 4v4c0 3.5 2.5 6 5.5 7 3-1 5.5-3.5 5.5-7V4L8 1.5z" />
        <path d="M6 8l1.5 1.5L10 7" />
      </svg>
    ),
    title: 'Security hardening',
    render: () => (
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-gray-400 leading-relaxed">
          Recommended settings for a relay exposed to the internet.
        </p>

        <div className="flex flex-col gap-1.5">
          <CmdLine cmd="/set relay.network.max_clients 3" label="Limit concurrent connections" />
          <CmdLine cmd='/set relay.network.allowed_ips "1.2.3.4,10.0.0.*"' label="Restrict to known IPs (optional)" />
          <CmdLine cmd='/set relay.network.password_hash_algo "pbkdf2+sha512"' label="Enable password hashing" />
          <CmdLine cmd="/set relay.network.password_hash_iterations 100000" label="Hash iterations" />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 pl-1">Firewall</span>
          <p className="text-[11px] text-gray-500 leading-relaxed pl-1 pb-1">
            Only open the relay port to the internet if you&apos;re <em>not</em> using a reverse proxy. If you are, bind WeeChat to <code className="guide-code">127.0.0.1</code> and only expose 443.
          </p>
          <CmdLine cmd="/set relay.network.bind_address 127.0.0.1" label="Localhost only (behind proxy)" />
        </div>

        <Callout type="tip">
          Use <code className="guide-code">/secure passphrase YourMasterPass</code> to encrypt WeeChat&apos;s <code className="guide-code">sec.conf</code>. You&apos;ll be prompted for it on startup — this protects all your stored secrets at rest.
        </Callout>

        <Callout type="info">
          DarkBear stores your connection details in <strong className="text-gray-300">localStorage</strong> only. Nothing is sent to any third-party server. The entire app is static HTML/JS served from your own host.
        </Callout>
      </div>
    ),
  },
  {
    id: 'troubleshooting',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="6" /><path d="M8 5v3.5M8 10.5v.5" />
      </svg>
    ),
    title: 'Troubleshooting',
    render: (port) => (
      <div className="flex flex-col gap-3">
        <TroubleItem
          problem="Connection refused"
          solutions={[
            <>Check the relay is running: <code className="guide-code">/relay</code> in WeeChat should show the listener.</>,
            <>Verify the port matches — WeeChat is listening on <code className="guide-code">{port}</code>.</>,
            <>If behind a firewall, ensure the port is open: <code className="guide-code">ss -tlnp | grep {port}</code>.</>,
          ]}
        />
        <TroubleItem
          problem="TLS handshake failure"
          solutions={[
            <>Ensure <code className="guide-code">relay.pem</code> contains both the full cert chain and private key.</>,
            <>For self-signed certs, visit <code className="guide-code">https://host:{port}</code> in your browser first to accept it.</>,
            <>Check cert permissions: <code className="guide-code">chmod 600 ~/.config/weechat/relay.pem</code>.</>,
          ]}
        />
        <TroubleItem
          problem="Authentication failed"
          solutions={[
            <>Confirm the password matches <code className="guide-code">relay.network.password</code> exactly.</>,
            <>If using TOTP, ensure your system clock is accurate — codes are time-sensitive.</>,
            <>If the password uses <code className="guide-code">$&#123;sec.data.*&#125;</code>, run <code className="guide-code">/secure</code> to verify the value is set.</>,
          ]}
        />
        <TroubleItem
          problem="WebSocket disconnects frequently"
          solutions={[
            <>Behind nginx, increase <code className="guide-code">proxy_read_timeout</code> (default 60s is too short).</>,
            <>Enable compression in Advanced Options to reduce bandwidth on slow connections.</>,
            <>DarkBear auto-reconnects — if it drops every few seconds, check your server load.</>,
          ]}
        />
        <TroubleItem
          problem="No buffers / empty channel list"
          solutions={[
            <>The relay may need time to sync. Wait a few seconds after connecting.</>,
            <>If using API protocol, check WeeChat version is 4.0+ — older versions don&apos;t support it.</>,
          ]}
        />
      </div>
    ),
  },
];

function TroubleItem({ problem, solutions }: { problem: string; solutions: React.ReactNode[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-white/[0.015] border border-white/[0.03] px-3 py-2.5">
      <span className="text-[12px] font-semibold text-gray-300">{problem}</span>
      <ul className="flex flex-col gap-1">
        {solutions.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[11px] text-gray-500 leading-relaxed">
            <span className="text-gray-600 mt-px shrink-0">&rsaquo;</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SetupGuide({ port, tls }: { port: number; tls: boolean }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="mt-5 pt-4 border-t border-white/[0.04]">
      <button onClick={() => setOpen(!open)}
        className="group w-full flex items-center gap-3 py-2 text-left">
        <div className="w-7 h-7 rounded-lg bg-[var(--custom-accent,#818cf8)]/[0.08] flex items-center justify-center shrink-0 group-hover:bg-[var(--custom-accent,#818cf8)]/[0.14] transition-colors">
          <svg className="w-3.5 h-3.5 text-[var(--custom-accent,#818cf8)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3h7l3 3v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M9 3v3h3" /><path d="M6 9h4M6 11.5h2.5" />
          </svg>
        </div>
        <div className="flex-1 flex flex-col">
          <span className="text-[12px] font-semibold text-gray-500 group-hover:text-gray-300 transition-colors tracking-wide">
            Setup Guide
          </span>
          <span className="text-[10px] text-gray-600">WeeChat relay configuration &amp; security</span>
        </div>
        <svg className={`w-3 h-3 text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 8 8" fill="currentColor"><path d="M1 3l3 3 3-3z" /></svg>
      </button>

      {open && (
        <div className="flex flex-col gap-0.5 pt-2 pb-1 animate-fade-in">
          {GUIDE_SECTIONS.map(sec => {
            const isExpanded = expanded === sec.id;
            return (
              <div key={sec.id}>
                <button onClick={() => setExpanded(isExpanded ? null : sec.id)}
                  className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-all
                    ${isExpanded ? 'bg-white/[0.035] text-gray-200' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'}`}>
                  <span className={`shrink-0 transition-colors ${isExpanded ? 'text-[var(--custom-accent,#818cf8)]' : 'text-gray-600'}`}>
                    {sec.icon}
                  </span>
                  <span className="flex-1 text-[13px] font-medium">{sec.title}</span>
                  {sec.badge && !isExpanded && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--custom-accent,#818cf8)]/60 bg-[var(--custom-accent,#818cf8)]/[0.08] px-2 py-0.5 rounded-full">{sec.badge}</span>
                  )}
                  <svg className={`w-2.5 h-2.5 text-gray-600 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                    viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3z" /></svg>
                </button>
                {isExpanded && (
                  <div className="pl-9 pr-1 pb-4 pt-2 animate-fade-in">
                    {sec.render(port, tls)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .guide-code {
          font-family: var(--mono-font);
          font-size: 10.5px;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          color: #a5b4fc;
          white-space: nowrap;
        }
        .guide-no-scrollbar { scrollbar-width: none; }
        .guide-no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

export default function ConnectModal({ onClose }: Props) {
  const settings = useStore(s => s.settings);
  const updateRelay = useStore(s => s.updateRelay);
  const saveSettings = useStore(s => s.saveSettings);
  const setTheme = useStore(s => s.setTheme);
  const connectionState = useStore(s => s.connectionState);
  const error = useStore(s => s.error);
  const connect = useStore(s => s.connect);
  const profiles = useStore(s => s.settings.profiles);
  const saveProfile = useStore(s => s.saveProfile);

  const [host, setHost] = useState(settings.relay.host);
  const [port, setPort] = useState(settings.relay.port);
  const [tls, setTls] = useState(settings.relay.tls);
  const [password, setPassword] = useState(settings.relay.password);
  const [compression, setCompression] = useState(settings.relay.compression);
  const [totp, setTotp] = useState('');
  const [useTotp, setUseTotp] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const hostRef = useRef<HTMLInputElement>(null);
  const totpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const themeScrollRef = useRef<HTMLDivElement>(null);
  const themeDrag = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });

  const connecting =
    connectionState === ConnectionState.CONNECTING ||
    connectionState === ConnectionState.AUTHENTICATING;
  const ready = !connecting && !!host && !!password;

  useEffect(() => {
    if (hostRef.current && !host) hostRef.current.focus();
  }, []);

  useEffect(() => {
    if (showThemePicker && themeScrollRef.current) {
      const active = themeScrollRef.current.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [showThemePicker]);

  const onThemePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = themeScrollRef.current;
    if (!el) return;
    themeDrag.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
  }, []);

  const onThemePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = themeDrag.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3) d.moved = true;
    themeScrollRef.current!.scrollLeft = d.scrollLeft - dx;
  }, []);

  const onThemePointerUp = useCallback(() => {
    themeDrag.current.active = false;
  }, []);

  const doConnect = useCallback(() => {
    if (!ready) return;
    const fullPassword = useTotp && totp.trim() ? `${password}${totp.trim()}` : password;
    updateRelay({ host, port, tls, password, compression });
    saveSettings();
    updateRelay({ password: fullPassword });
    connect();
    updateRelay({ password });
  }, [host, port, tls, password, compression, useTotp, totp, ready, updateRelay, saveSettings, connect]);

  const applyProfile = useCallback((name: string) => {
    const p = profiles.find(p => p.name === name);
    if (!p) return;
    setHost(p.relay.host);
    setPort(p.relay.port);
    setTls(p.relay.tls);
    setPassword(p.relay.password);
    setCompression(p.relay.compression);
  }, [profiles]);

  const doSaveProfile = useCallback(() => {
    const name = profileName.trim();
    if (!name) return;
    updateRelay({ host, port, tls, password, compression });
    saveProfile(name);
    setShowSaveProfile(false);
    setProfileName('');
  }, [profileName, host, port, tls, password, compression, updateRelay, saveProfile]);

  const handleTotpDigit = useCallback((index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const digits = totp.padEnd(6, ' ').split('');
    digits[index] = digit;
    const newTotp = digits.join('').trimEnd();
    setTotp(newTotp);
    if (digit && index < 5) totpRefs.current[index + 1]?.focus();
  }, [totp]);

  const handleTotpKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !totp[index] && index > 0) {
      totpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) totpRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) totpRefs.current[index + 1]?.focus();
  }, [totp]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) onClose();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doConnect();
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [onClose, doConnect]);

  const statusText =
    connectionState === ConnectionState.CONNECTING ? 'Establishing connection...' :
    connectionState === ConnectionState.AUTHENTICATING ? 'Authenticating...' :
    null;

  const tc = THEME_ACCENT[settings.theme] ?? THEME_ACCENT.retro;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Theme-aware background */}
      <div className="fixed inset-0" style={{ background: `radial-gradient(ellipse at 30% 20%, ${tc.bg1} 0%, ${tc.bg2} 50%, ${tc.bg3} 100%)` }} />

      {/* Animated theme background */}
      <div className="fixed inset-0 pointer-events-none">
        <ThemeBg theme={settings.theme} />

        {/* Nebula clouds — colored to theme accent */}
        <div className="absolute w-[600px] h-[600px] sm:w-[900px] sm:h-[900px] -top-[200px] -right-[200px] rounded-full opacity-[0.06]"
          style={{ background: `radial-gradient(circle, ${tc.accent}, transparent 50%)`, animation: 'login-float-a 30s ease-in-out infinite', willChange: 'transform' }} />
        <div className="absolute w-[500px] h-[500px] sm:w-[800px] sm:h-[800px] -bottom-[250px] -left-[200px] rounded-full opacity-[0.04]"
          style={{ background: `radial-gradient(circle, ${tc.accent}88, transparent 50%)`, animation: 'login-float-b 35s ease-in-out infinite', willChange: 'transform' }} />
        <div className="absolute w-[300px] h-[300px] top-[30%] right-[15%] rounded-full opacity-[0.03]"
          style={{ background: `radial-gradient(circle, ${tc.accent}66, transparent 55%)`, animation: 'login-float-c 22s ease-in-out infinite', willChange: 'transform' }} />

        {/* Noise grain */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")` }} />
      </div>

      {/* Content */}
      <div className="min-h-dvh flex flex-col relative z-10">
        <div className="flex-1 min-h-[24px] sm:min-h-0" />

        {/* Astronaut Bear — floating */}
        <div className="flex flex-col items-center px-6 pb-2 sm:pb-4 select-none"
          style={{ animation: 'fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
          <div className="relative" style={{ animation: 'astro-float 6s ease-in-out infinite' }}>
            {/* Glow behind astronaut */}
            <div className="absolute -inset-6 sm:-inset-8 rounded-full"
              style={{ background: `radial-gradient(circle, ${tc.accent}1a 0%, transparent 60%)`, animation: 'pulse-glow 4s ease-in-out infinite' }} />
            <AstronautBear size={120} className="sm:w-[150px] sm:h-[150px]" accent={tc.accent} theme={settings.theme} />
          </div>
          <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight text-gray-100 mt-1 sm:mt-2"
            style={{ animation: 'fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both' }}>
            DarkBear
          </h1>
          <p className="text-[10px] font-semibold tracking-[0.3em] uppercase text-gray-500 mt-1.5"
            style={{ animation: 'fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both' }}>
            WeeChat Relay Client
          </p>

          {/* Theme selector trigger */}
          <button onClick={() => setShowThemePicker(!showThemePicker)}
            className="group mt-4 flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all"
            style={{ animation: 'fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both' }}>
            <span className="w-3 h-3 rounded-full ring-1 ring-white/20 shadow-[0_0_6px_var(--dot-glow)]"
              style={{ background: tc.accent, '--dot-glow': `${tc.accent}66` } as React.CSSProperties} />
            <span className="text-[11px] text-gray-400 group-hover:text-gray-300 transition-colors font-medium">
              {THEME_LIST.find(t => t.id === settings.theme)?.name ?? 'Theme'}
            </span>
            <svg className={`w-2.5 h-2.5 text-gray-600 transition-transform duration-200 ${showThemePicker ? 'rotate-180' : ''}`}
              viewBox="0 0 8 8" fill="currentColor"><path d="M1 3l3 3 3-3z" /></svg>
          </button>

          {/* Theme picker dropdown */}
          {showThemePicker && (
            <div className="mt-2 w-full max-w-[440px] animate-fade-in"
              style={{ animation: 'fadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
              <div ref={themeScrollRef}
                onPointerDown={onThemePointerDown}
                onPointerMove={onThemePointerMove}
                onPointerUp={onThemePointerUp}
                onPointerCancel={onThemePointerUp}
                className="flex gap-1.5 overflow-x-auto pb-2 px-1 -mx-1 guide-no-scrollbar cursor-grab active:cursor-grabbing select-none">
                {THEME_LIST.map(t => {
                  const active = settings.theme === t.id;
                  return (
                    <button key={t.id} data-active={active}
                      onClick={() => { if (themeDrag.current.moved) return; setTheme(t.id); saveSettings(); }}
                      className={`shrink-0 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl transition-all
                        ${active
                          ? 'bg-white/[0.08] border border-white/[0.15] shadow-[0_0_20px_var(--sel-glow)]'
                          : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.05] hover:border-white/[0.08]'}`}
                      style={{ '--sel-glow': `${t.accent}22` } as React.CSSProperties}>
                      <span className={`w-5 h-5 rounded-full transition-all ${active ? 'ring-2 ring-white/30 scale-110' : 'ring-1 ring-white/10'}`}
                        style={{ background: t.accent, boxShadow: active ? `0 0 12px ${t.accent}55` : 'none' }} />
                      <span className={`text-[9px] font-medium tracking-wide whitespace-nowrap transition-colors
                        ${active ? 'text-gray-200' : 'text-gray-600'}`}>
                        {t.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Form area */}
        <div className="w-full sm:max-w-[440px] sm:mx-auto"
          style={{ animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both' }}>
          <div className="px-5 pb-6 sm:px-0 sm:pb-0">
            <div className="login-card-inner">

              {/* Profile chips */}
              {profiles.length > 0 && (
                <div className="mb-5">
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 guide-no-scrollbar">
                    {profiles.map(p => (
                      <button key={p.name} onClick={() => applyProfile(p.name)}
                        className="group shrink-0 flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium rounded-xl
                          bg-white/[0.03] border border-white/[0.06] text-gray-400
                          hover:bg-[var(--custom-accent,#818cf8)]/8 hover:border-[var(--custom-accent,#818cf8)]/20 hover:text-[var(--custom-accent,#818cf8)]
                          active:scale-[0.97] transition-all min-h-[44px]">
                        <svg className="w-3.5 h-3.5 text-gray-600 group-hover:text-[var(--custom-accent,#818cf8)]/70 transition-colors" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <circle cx="8" cy="8" r="6" /><path d="M8 5v6M5 8h6" />
                        </svg>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 bg-red-500/8 border border-red-500/15 rounded-xl p-4 text-[13px] text-red-300 mb-5 leading-snug"
                  style={{ animation: 'login-shake 0.4s ease-out, fadeIn 0.25s ease-out' }}>
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-[-2px]">
                    <svg className="w-4 h-4 text-red-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="8" cy="8" r="6" /><path d="M8 5v3.5M8 10.5v.5" />
                    </svg>
                  </div>
                  <span className="pt-0.5">{error}</span>
                </div>
              )}

              <div className="flex flex-col gap-4">
                {/* Host */}
                <div className="login-field" style={{ animationDelay: '0.24s' }}>
                  <label className="login-label" htmlFor="c-host">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="1" y="4" width="14" height="8" rx="2" /><circle cx="4.5" cy="8" r="1" fill="currentColor" stroke="none" /><path d="M8 6v4M11 6v4" />
                    </svg>
                    Hostname
                  </label>
                  <div className="relative">
                    <input ref={hostRef} id="c-host" type="text" value={host} onChange={e => setHost(e.target.value)}
                      placeholder="relay.example.com" autoComplete="off" spellCheck={false}
                      className="login-input" />
                    {host && (
                      <div className="login-input-check">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8l3 3 5-6" /></svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* Port + TLS */}
                <div className="flex items-end gap-3 login-field" style={{ animationDelay: '0.28s' }}>
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <label className="login-label" htmlFor="c-port">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M3 4h10M3 8h10M3 12h6" />
                      </svg>
                      Port
                    </label>
                    <input id="c-port" type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                      min={1} max={65535} className="login-input" />
                  </div>
                  <button type="button" onClick={() => setTls(!tls)}
                    className={`group flex items-center gap-2 px-5 min-w-[88px] justify-center login-input-height rounded-xl text-[13px] font-semibold border transition-all shrink-0
                      ${tls
                        ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.08)]'
                        : 'bg-white/[0.03] border-white/[0.08] text-gray-500 hover:text-gray-300 hover:border-white/[0.12]'}`}>
                    <svg className={`w-4 h-4 transition-transform ${tls ? 'scale-110' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      {tls ? (
                        <><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 016 0v2" /></>
                      ) : (
                        <><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 016 0" /></>
                      )}
                    </svg>
                    TLS
                  </button>
                </div>

                {/* Password */}
                <div className="login-field" style={{ animationDelay: '0.32s' }}>
                  <label className="login-label" htmlFor="c-pass">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="2" y="7" width="12" height="7" rx="2" /><path d="M5 7V5a3 3 0 016 0v2" /><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
                    </svg>
                    Password
                  </label>
                  <div className="relative">
                    <input id="c-pass" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Relay password" autoComplete="new-password"
                      className="login-input !pr-12" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                      className="absolute right-0 top-0 bottom-0 w-11 flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors">
                      {showPassword ? (
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M2.5 2.5l11 11" /><path d="M6.5 6.7A2.5 2.5 0 009.3 9.5" /><path d="M4 4.4C2.7 5.4 1.7 6.8 1.2 8c1 2.7 3.6 4.5 6.8 4.5.9 0 1.7-.1 2.5-.4M12 11.6c1.3-1 2.3-2.4 2.8-3.6-1-2.7-3.6-4.5-6.8-4.5-.6 0-1.1.1-1.7.2" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M1.2 8c1-2.7 3.6-4.5 6.8-4.5s5.8 1.8 6.8 4.5c-1 2.7-3.6 4.5-6.8 4.5S2.2 10.7 1.2 8z" /><circle cx="8" cy="8" r="2.5" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Advanced toggle */}
                <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                  className="group flex items-center gap-2.5 text-[12px] text-gray-600 hover:text-gray-400 transition-colors self-start -mt-1 py-1">
                  <div className="w-5 h-5 rounded-md bg-white/[0.03] border border-white/[0.06] flex items-center justify-center group-hover:border-white/[0.12] transition-colors">
                    <svg className={`w-2.5 h-2.5 transition-transform duration-200 ${showAdvanced ? 'rotate-90' : ''}`}
                      viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3z" /></svg>
                  </div>
                  Advanced options
                </button>

                {/* Advanced section */}
                {showAdvanced && (
                  <div className="flex flex-col gap-3 animate-fade-in -mt-1 pl-1">
                    <div className="flex items-center justify-between min-h-[44px] py-1">
                      <div className="flex items-center gap-2.5">
                        <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M4 2v12M12 2v12M4 5h8M4 8h8M4 11h8" />
                        </svg>
                        <span className="text-[13px] text-gray-400">Compression</span>
                      </div>
                      <button type="button" onClick={() => setCompression(!compression)}
                        className={`login-toggle ${compression ? 'login-toggle-on' : ''}`}>
                        <div className="login-toggle-dot" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between min-h-[44px] py-1">
                        <div className="flex items-center gap-2.5">
                          <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <circle cx="8" cy="8" r="6" /><path d="M8 4v4l2.5 1.5" />
                          </svg>
                          <span className="text-[13px] text-gray-400">TOTP</span>
                        </div>
                        <button type="button" onClick={() => setUseTotp(!useTotp)}
                          className={`login-toggle ${useTotp ? 'login-toggle-on' : ''}`}>
                          <div className="login-toggle-dot" />
                        </button>
                      </div>
                      {useTotp && (
                        <div className="flex gap-2 justify-center animate-fade-in pb-1">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <input
                              key={i}
                              ref={el => { totpRefs.current[i] = el; }}
                              type="text"
                              inputMode="numeric"
                              maxLength={1}
                              value={totp[i] ?? ''}
                              onChange={e => handleTotpDigit(i, e.target.value)}
                              onKeyDown={e => handleTotpKeyDown(i, e)}
                              onFocus={e => e.target.select()}
                              autoComplete="one-time-code"
                              className="login-totp-digit"
                              style={{ animationDelay: `${i * 40}ms` }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Connect button */}
                <div className="pt-1">
                  <button onClick={doConnect} disabled={!ready}
                    className={`group w-full login-btn-height text-[15px] font-semibold rounded-xl flex items-center justify-center gap-2.5 transition-all relative overflow-hidden
                      ${ready
                        ? 'bg-[var(--custom-accent,#818cf8)] text-white shadow-[0_4px_24px_color-mix(in_srgb,var(--custom-accent,#818cf8)_40%,transparent)] hover:opacity-90 hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.99] cursor-pointer'
                        : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.04]'}`}>
                    {ready && !connecting && (
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 55%, transparent 70%)', backgroundSize: '200% 100%', animation: 'shimmer 2.5s linear infinite' }} />
                    )}
                    <span className="relative flex items-center gap-2.5">
                      {connecting ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          {statusText}
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 8h12M10 4l4 4-4 4" />
                          </svg>
                          Connect
                        </>
                      )}
                    </span>
                  </button>

                  {ready && !connecting && (
                    <p className="text-center text-[10px] text-gray-700 mt-2.5 hidden sm:block">
                      <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-gray-600 font-mono text-[9px]">Ctrl</kbd>
                      {' + '}
                      <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-gray-600 font-mono text-[9px]">Enter</kbd>
                    </p>
                  )}
                </div>

                {/* Save profile */}
                {showSaveProfile ? (
                  <div className="flex gap-2 items-center animate-fade-in">
                    <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)}
                      placeholder="Profile name" maxLength={32} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') doSaveProfile(); if (e.key === 'Escape') { setShowSaveProfile(false); setProfileName(''); } }}
                      className="login-input flex-1 !h-[44px]" />
                    <button onClick={doSaveProfile} disabled={!profileName.trim()}
                      className="px-4 h-[44px] text-[13px] font-semibold bg-[var(--custom-accent,#818cf8)]/15 text-[var(--custom-accent,#818cf8)] rounded-xl hover:bg-[var(--custom-accent,#818cf8)]/25 disabled:opacity-30 shrink-0 transition-colors">
                      Save
                    </button>
                    <button onClick={() => { setShowSaveProfile(false); setProfileName(''); }}
                      className="w-[44px] h-[44px] flex items-center justify-center text-gray-500 rounded-xl hover:text-gray-300 hover:bg-white/[0.04] shrink-0 transition-colors">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowSaveProfile(true)}
                    className="group w-full h-[44px] text-[13px] text-gray-600 border border-dashed border-white/[0.06] rounded-xl hover:text-gray-400 hover:border-white/[0.12] hover:bg-white/[0.015] transition-all flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-500 transition-colors" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                    Save as profile
                  </button>
                )}

                {/* Back to chat */}
                {onClose && (
                  <button onClick={onClose}
                    className="w-full h-[44px] text-[13px] text-gray-600 hover:text-gray-400 transition-colors flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M10 4l-4 4 4 4" />
                    </svg>
                    Back to chat
                  </button>
                )}
              </div>

              {/* Getting Started guide */}
              <SetupGuide port={port} tls={tls} />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-[20px] sm:min-h-0" />

        {/* Version */}
        <div className="flex items-center justify-center gap-3 pb-4 sm:pb-6"
          style={{ animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both' }}>
          <div className="h-px w-8 bg-white/[0.04]" />
          <p className="text-[10px] text-gray-700 font-mono tracking-wider">v2.0</p>
          <div className="h-px w-8 bg-white/[0.04]" />
        </div>
      </div>

      <style>{`
        .login-card-inner {}
        @media (min-width: 640px) {
          .login-card-inner {
            background: linear-gradient(160deg, rgba(10,10,20,0.85) 0%, rgba(6,6,14,0.92) 100%);
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 30px 100px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
            border-radius: 20px;
            padding: 28px;
          }
        }

        .login-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-gray-500, #6b6f8a);
          padding-left: 2px;
          margin-bottom: 6px;
        }
        .login-input {
          width: 100%;
          height: 52px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          color: #e0e4f0;
          font-size: 16px;
          padding: 0 16px;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .login-input-height { height: 52px; }
        .login-btn-height { height: 54px; }
        @media (min-width: 640px) {
          .login-input { height: 46px; font-size: 14px; border-radius: 12px; padding: 0 14px; }
          .login-input-height { height: 46px; }
          .login-btn-height { height: 48px; }
        }
        .login-input::placeholder { color: #3d4058; }
        .login-input:focus {
          border-color: rgba(129,140,248,0.4);
          background: rgba(255,255,255,0.05);
          box-shadow: 0 0 0 3px rgba(129,140,248,0.08), 0 0 20px rgba(129,140,248,0.04);
        }
        .login-input::-webkit-inner-spin-button,
        .login-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .login-input[type="number"] { -moz-appearance: textfield; }

        .login-input-check {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(74, 222, 128, 0.5);
          animation: fadeIn 0.2s ease-out;
        }

        .login-field {
          animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .login-toggle {
          position: relative;
          width: 44px;
          height: 26px;
          border-radius: 13px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.06);
          transition: background 0.25s, border-color 0.25s, box-shadow 0.25s;
          cursor: pointer;
          flex-shrink: 0;
        }
        .login-toggle-on {
          background: rgba(99, 102, 241, 0.7);
          border-color: rgba(99, 102, 241, 0.4);
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);
        }
        .login-toggle-dot {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .login-toggle-on .login-toggle-dot {
          transform: translateX(18px);
        }

        .login-totp-digit {
          width: 42px;
          height: 52px;
          text-align: center;
          font-family: var(--mono-font);
          font-size: 22px;
          font-weight: 600;
          color: #e0e4f0;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          outline: none;
          caret-color: rgba(129,140,248,0.6);
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s, transform 0.2s;
          animation: fadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @media (min-width: 640px) {
          .login-totp-digit { width: 40px; height: 46px; font-size: 20px; border-radius: 10px; }
        }
        .login-totp-digit:focus {
          border-color: rgba(129,140,248,0.5);
          background: rgba(255,255,255,0.06);
          box-shadow: 0 0 0 3px rgba(129,140,248,0.1);
          transform: translateY(-1px);
        }

        @keyframes astro-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-6px) rotate(1deg); }
          75% { transform: translateY(4px) rotate(-1deg); }
        }

        @keyframes login-float-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, -25px) scale(1.06); }
          66% { transform: translate(-20px, 18px) scale(0.96); }
        }
        @keyframes login-float-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-30px, 25px) scale(1.04); }
          66% { transform: translate(25px, -12px) scale(0.97); }
        }
        @keyframes login-float-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(15px, -10px) scale(1.15); }
        }
        @keyframes login-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }

      `}</style>
    </div>
  );
}
