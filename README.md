# DarkBear

A WeeChat relay client with real voice/video. Connect to your IRC bouncer from any browser — and when your network is Orochi, DarkBear opens a companion session that carries realtime voice, video, screenshare, typing, reactions, and E2EE DMs.

## Architecture

DarkBear v3 is a SolidJS + Vite SPA with two wire connections:

```
Browser ──weechat relay (binary protocol over WS)──▶ WeeChat ──IRC──▶ any network   (chat)
Browser ──direct WSS (Orochi bridge)──▶ Orochi                                      (media + extras)
```

- **Chat backbone**: the WeeChat relay protocol. WeeChat runs on your server as the bouncer; DarkBear speaks its binary relay protocol over WebSocket. Buffers, history, nicklists, hotlist — all relay-driven.
- **Orochi bridge** (optional, Settings → Connection → Bridge): a persistent direct secure WebSocket session to the Orochi server, auto-activated when the relay's network is detected as Orochi. Production and credentialed endpoints require `wss://`; plain `ws://` is limited to unauthenticated loopback development. It carries:
  - **Voice/video/screenshare** — KaguraVox/KaguraVis WASM codecs over binary WS frames with per-stream HMAC, MEDIA control plane, EVENT MEDIA presence
  - **Typing notifications & emoji reactions** (TAGMSG) sent and received
  - **Read-marker sync** across devices (MARKREAD)
  - **Verifiable E2EE DMs** (P-256 ECDH + AES-GCM `TSUMUGI1` envelopes; full peer fingerprints, local trust pins, rotation warnings, and verified-only fail-closed delivery)

## Features

- Multi-buffer sidebar with unread/highlight badges, pin/mute, per-server groups
- Timezone-aware quiet hours, temporary global/per-buffer mutes, and actionable
  browser notifications whose replies return only to the exact originating tab;
  unscoped Web Push remains open-only
- Profile-scoped command-palette actions built from fixed safe commands, generated prompts, and exact-command review
- Split-pane view (Ctrl+\\ — two buffers side by side)
- Nick and command tab completion
- Per-buffer message search (Ctrl+F), with opt-in Worker-backed IndexedDB archive
  search, exact hashed-trigram acceleration, resumable v1 migration, and stale
  query cancellation; transactional per-buffer totals and conservative
  index-aware storage estimates keep retention work bounded
- Optional desktop/mobile thread panel derived from canonical `msgid` reply links, with modal focus isolation shared by the activity panel
- Private archive-scoped saved messages with notes and a unified activity inbox
- IRC formatting: bold, italic, colors 0–98, opt-in no-referrer inline images, and YouTube/Twitch/video/audio embeds
- IRCv3: SASL, away-notify, account-notify, message tags, typing, reactions, bot mode
- IRCX: PROP (channel/user properties), ACCESS lists, WHISPER, CREATE, LISTX
- Localized, accessible services panels for Orochi's built-in services (REGISTER/IDENTIFY/GHOST/VHOST/TOTP/CHANNEL/TEGAMI — real commands, no pseudo-clients) with mobile scrolling, RTL-aware keyboard tabs, relay-enqueue acknowledgement, retained retry input, and authenticated server-scoped reply feedback
- User profiles (IRCX PROP): avatar, bio, location, URL, gender; remote avatars
  remain initials until inline images are explicitly enabled, then load lazily
  without a referrer
- Channel info panel with live property editing and access list management
- Voice/video rooms per channel and 1:1 calls with device/codec preflight, adaptive call health, reconnect recovery, accessible live captions and transcript export, spotlight, mute/deafen/camera/screenshare, and room reactions
- Operator incident workspace (Ctrl+Shift+O): saved Event Spine views, nick/channel correlation pivots, redacted JSON export, target-confirmed destructive actions, and a bounded local client audit
- MONITOR (online notification tracking), PUSHSET
- GIF picker (Tenor) plus a non-blocking upload queue with cancellation, retry,
  explicit size/type policy, metadata-safe image handling, safe previews, and
  service-provided expiry status; upload endpoints reject URL credentials and
  response bodies are cancelled as soon as their 64 KiB bound is crossed
- Socket-enqueue-acknowledged user actions: rejected relay/direct sends retain
  composer, upload, thread, Services, notification-reply, operator, IRCX edit,
  and join inputs for retry; reactions update and preference sync completion
  wait for acceptance
- 19 animated themes + custom palette, custom CSS
- Mobile responsive — sidebar/userlist drawers, swipe gestures, iOS viewport handling
- Deploy-safe PWA shell with versioned immutable release caches, a privacy-safe
  offline screen, visible offline/reconnecting status, rollback asset retention,
  and notification replies bound by an opaque scope to the exact live DarkBear
  document that displayed them
- Installable Tauri desktop shell with OS-vault credential storage, native
  notifications, restored window state, and controlled `darkbear://` buffer links
- Built-in English, German, and Arabic interface locales with system-language
  selection, locale-aware dates/numbers, mirrored RTL chrome, mixed-direction
  message isolation, and IME-safe keyboard handling
- Enforced production asset, frame-time, message-burst, and long-call memory
  budgets, with automatic low-capability decorative-quality reduction
- Credential-free portable settings exports: passwords and API keys are removed;
  upload and background URLs retain only a safe HTTP(S) origin/path, and bridge
  endpoints retain only WSS or credential-free loopback WS origin/path data
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
pnpm perf         # production asset budgets + Chromium/Pixel 7 runtime budgets
```

### Desktop

The installed client reuses the same SolidJS protocol, state, media, and UI
implementation. Its native surface is deliberately narrow: two fixed records
in the operating-system credential vault, notifications, window-state restore,
single-instance behavior, and `darkbear://open/buffer?target=...` navigation.
Remote content has no native capability.

```sh
pnpm desktop:check             # Rust/Tauri compile check
pnpm desktop:dev               # installed-shell development mode
pnpm desktop:build --ci        # platform installer; .deb on Linux
pnpm desktop:verify-package    # verify Linux package metadata and payload
```

Browser builds continue using `/darkbear/` and the deploy-version service
worker. The desktop build uses relative assets and never registers that worker.
On desktop, an explicitly remembered relay or Orochi password is stored in the
OS credential vault; bearer tokens and non-remembered passwords remain
session-only. `src-tauri/tauri.linux.conf.json` selects the verified Debian
installer on Linux. Other native formats should be produced on their supported
packaging hosts.

### Deploy

```sh
./deploy.sh              # build, verify, and atomically activate a release
./deploy.sh --rollback   # swap back to the previously active release
```

The app is served under `/darkbear/` (Vite `base`). Releases are built under
`.releases/`, and nginx serves the release selected by the `current` symlink.
The deploy performs local asset checks, public HTTP checks, and a Playwright boot
smoke before it succeeds; a failed postflight restores the prior release. Each
release name binds the build time, full-source commit state, and built-artifact
digest. A public `release.json` records the full commit, clean/dirty tree state,
deterministic source and artifact SHA-256 digests, UTC build time, and exact
Node/pnpm/Vite versions. The deploy recomputes that manifest locally and compares
the public copy byte-for-byte before committing the cutover. It contains no
source paths, environment values, or credentials.

Each release also stamps its worker with an explicit immutable-asset manifest.
The worker retains four release caches for open clients and rollback, never
caches interactive HTML or private application data, and uses a standalone
offline document when network navigation fails.

### Env (build-time, optional)

- `VITE_IRC_WS` — pin the Orochi bridge WS endpoint (unset = latency-probe node selection)
- `VITE_MEDIA_URL` — upload service base (unset = settings uploadUrl / same-origin `/upload`)

## Source layout

```
src/
├── lib/
│   ├── weechat/         # binary relay protocol: parser, serializer, client
│   ├── irc/             # direct Orochi WS client (CAP/SASL/SCRAM/session resume)
│   ├── irc-classic/     # IRC line parsing + mIRC formatting + embeds
│   ├── ircx/            # IRCX numerics (PROP/ACCESS)
│   ├── archive/         # IndexedDB v3 repository + Worker trigram search/accounting/retention
│   ├── suimyaku-media/  # voice/video engine (WASM codecs, WS frames, MAC; Audio E2EE primitives hard-disabled)
│   └── e2ee/            # DM cipher + typed local peer-trust repository
├── state/               # Solid stores: settings, buffers, connection, ircx, ui,
│                        # completion, bridge, media (see state/README.md)
├── core/bridge.ts       # Orochi bridge controller
├── ui/                  # components: layout, chat, input, modals, panels, media, bits
├── primitives/          # keyboard, swipe, viewport, media-query, favicon badge
└── styles/global.css    # 19 themes, irc color classes
```
