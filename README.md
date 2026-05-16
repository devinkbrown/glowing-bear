# DarkBear

A WeeChat relay client. Connect to your IRC bouncer from any browser, with a clean dark UI built for heavy IRC use.

## What it is

DarkBear connects to WeeChat's relay protocol over WebSocket. WeeChat runs on your server as an IRC bouncer; DarkBear runs in the browser and talks to it. You get full buffer history, highlights, nick completion, and persistent connection — without running a desktop client.

## Features

- Multi-buffer sidebar with unread/highlight badges
- Split-pane view (two buffers side by side)
- Nick and command tab completion
- Message search per buffer
- IRC formatting: bold, italic, color (ANSI rendered)
- IRCv3: SASL, away-notify, account-notify, message tags, bot mode
- IRCX: PROP (channel/user properties), ACCESS (channel access lists), WHISPER, CREATE, LISTX
- Services: NickServ, ChanServ, MemoServ integration panels
- User profiles (IRCX PROP): avatar, bio, location, URL, gender
- Channel info panel with live property editing and access list management
- Bot mode badges on messages and user list
- Account display and tracking
- MONITOR (online notification tracking)
- PUSHSET (push notification configuration)
- LADON media: WebRTC video/voice calls and channel rooms
- Oper console
- Mobile responsive — sidebar overlay, swipe gestures
- Invite-code gate (optional, client-side)
- Keyboard-driven — see shortcuts below

## Setup

### WeeChat relay

In WeeChat:

```
/relay add weechat 9001
/set relay.network.password your-password
```

For TLS (recommended if not behind a reverse proxy):

```
/relay add ssl.weechat 9001
```

### Deploy

```sh
pnpm install
pnpm build
cp -r build/. /path/to/webroot/darkbear/
```

The `deploy.sh` script at the repo root handles backup of `invite.json`, build, and copy in one step.

### Nginx

```nginx
location /darkbear/ {
    alias /path/to/webroot/darkbear/;
    try_files $uri $uri/ /darkbear/index.html;
}
```

If your WeeChat relay is on the same host, proxy it:

```nginx
location /weechat {
    proxy_pass http://127.0.0.1:9001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
}
```

## Invite system

DarkBear ships with an optional invite-code gate. On first load, users must enter a valid code before seeing the client.

Codes live in `invite.json` in the web root:

```json
{ "codes": ["your-code-here"] }
```

The management API (if `upload_server.py` is running) handles add/remove at `/darkbear/invites` with Bearer token auth. The `deploy.sh` script preserves `invite.json` across deploys.

To bypass the gate entirely, remove or empty `invite.json`.

## Keyboard shortcuts

| Keys | Action |
|------|--------|
| `Ctrl+K` | Quick buffer switch |
| `Alt+1–9` | Jump to Nth buffer |
| `Alt+↑ / Alt+↓` | Next/prev unread highlight |
| `Alt+PgUp / Alt+PgDn` | Previous/next buffer |
| `Ctrl+\` | Toggle sidebar |
| `↑ / ↓` | Browse input history |
| `Tab` | Nick/command completion |
| `Ctrl+A / Ctrl+E` | Start/end of line |
| `Ctrl+K / Ctrl+U` | Delete to end/start |
| `Ctrl+W` | Delete word before cursor |
| `Ctrl+B / Ctrl+I` | Bold / italic (IRC formatting) |
| `Ctrl+,` | Settings |
| `Ctrl+O` | Oper console |
| `Ctrl+F` | Search buffer |
| `/` | Focus input |
| `Ctrl+Shift+S` | Split pane |
| `Ctrl+I` | Channel info (IRCX) |

## IRCX / ophion commands

| Command | Description |
|---------|-------------|
| `/whisper #ch nick msg` | IRCX whisper (in-channel private message) |
| `/prop target [key] [val]` | View or set IRCX properties |
| `/access #channel` | View channel access list |
| `/chaninfo [#channel]` | Open channel info panel |
| `/profile nick` | Open user profile card |
| `/services` | Open NickServ/ChanServ/Memo panel |
| `/monitor add\|del nick` | MONITOR online tracking |
| `/pushset key value` | Configure push notifications |
| `?` | Help |
| `Esc` | Close modal |

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Zustand (state management)
- WeeChat relay protocol (WebSocket)
