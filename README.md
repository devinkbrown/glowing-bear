# DarkBear

A WeeChat relay client with real voice/video. Connect to your IRC bouncer from any browser — and when your network is IRCXNet (orochi), DarkBear opens a companion session that carries realtime voice, video, screenshare, typing, reactions, and E2EE DMs.

## Architecture

DarkBear v3 is a SolidJS + Vite SPA with two wire connections:

```
Browser ──weechat relay (binary protocol over WS)──▶ WeeChat ──IRC──▶ any network   (chat)
Browser ──direct WS (orochi bridge)──▶ orochi                                       (media + extras)
```

- **Chat backbone**: the WeeChat relay protocol. WeeChat runs on your server as the bouncer; DarkBear speaks its binary relay protocol over WebSocket. Buffers, history, nicklists, hotlist — all relay-driven.
- **Orochi bridge** (optional, Settings → Connection → Bridge): a persistent direct WebSocket session to the IRCXNet orochi server, auto-activated when the relay's network is detected as orochi/ophion. It carries:
  - **Voice/video/screenshare** — KaguraVox/KaguraVis WASM codecs over binary WS frames with per-stream HMAC, MEDIA control plane, EVENT MEDIA presence
  - **Typing notifications & emoji reactions** (TAGMSG) sent and received
  - **Read-marker sync** across devices (MARKREAD)
  - **E2EE DMs** (P-256 ECDH + AES-GCM `TSUMUGI1` envelopes; keys published via METADATA)

## Features

- Multi-buffer sidebar with unread/highlight badges, pin/mute, per-server groups
- Split-pane view (Ctrl+\\ — two buffers side by side)
- Nick and command tab completion
- Per-buffer message search (Ctrl+F)
- IRC formatting: bold, italic, colors 0–98, inline images, YouTube/Twitch/video/audio embeds
- IRCv3: SASL, away-notify, account-notify, message tags, typing, reactions, bot mode
- IRCX: PROP (channel/user properties), ACCESS lists, WHISPER, CREATE, LISTX
- Services panels for orochi's built-in services (REGISTER/IDENTIFY/GHOST/VHOST/TOTP/CHANNEL/TEGAMI — real commands, no pseudo-clients)
- User profiles (IRCX PROP): avatar, bio, location, URL, gender
- Channel info panel with live property editing and access list management
- Voice/video rooms per channel and 1:1 calls with ring overlay, spotlight, mute/deafen/camera/screenshare, room reactions
- Oper console (Ctrl+Shift+O): Event Spine subscriptions, severity filter, broadcast, KILL/WARD/JUPE helpers
- MONITOR (online notification tracking), PUSHSET
- GIF picker (Tenor), file/image upload, paste-to-upload
- 19 animated themes + custom palette, custom CSS
- Mobile responsive — sidebar/userlist drawers, swipe gestures, iOS viewport handling
- Keyboard-driven — press Ctrl+K, or see Help for the full map

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

### Dev

```sh
pnpm install
pnpm dev          # http://localhost:5173/darkbear/
pnpm typecheck && pnpm lint && pnpm test
```

### Deploy

```sh
./deploy.sh       # builds to out/ and copies to /home/kain/website/darkbear
```

The app is served under `/darkbear/` (Vite `base`). `deploy.sh` stamps an asset version into `index.html` that unregisters stale service workers on change.

### Env (build-time, optional)

- `VITE_IRC_WS` — pin the orochi bridge WS endpoint (unset = latency-probe node selection)
- `VITE_MEDIA_URL` — upload service base (unset = settings uploadUrl / same-origin `/upload`)

## Source layout

```
src/
├── lib/
│   ├── weechat/         # binary relay protocol: parser, serializer, client
│   ├── irc/             # direct orochi WS client (CAP/SASL/SCRAM/session resume)
│   ├── irc-classic/     # IRC line parsing + mIRC formatting + embeds
│   ├── ircx/            # IRCX numerics (PROP/ACCESS)
│   ├── suimyaku-media/  # voice/video engine (WASM codecs, WS frames, MAC, E2EE)
│   └── e2ee/            # DM cipher
├── state/               # Solid stores: settings, buffers, connection, ircx, ui,
│                        # completion, bridge, media (see state/README.md)
├── core/bridge.ts       # orochi bridge controller
├── ui/                  # components: layout, chat, input, modals, panels, media, bits
├── primitives/          # keyboard, swipe, viewport, media-query, favicon badge
└── styles/global.css    # 19 themes, irc color classes
```
