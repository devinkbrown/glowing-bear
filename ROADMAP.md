# DarkBear Product Roadmap

_Last updated: 2026-07-16. Verified through the deployed R6.2 release and its
source, unit, browser, build, provenance, and public-live gates. This is the
forward product plan; current source and tests remain the authority when this
document drifts._

## Product direction

DarkBear should become the most dependable way to use a WeeChat relay from a
browser, with Orochi adding secure realtime communication rather than becoming
a requirement for basic chat. The next gains will come from confidence,
continuity, and media reliability, not from adding more disconnected controls.

Five rules guide the roadmap:

1. Relay chat must remain fully useful without the optional Orochi bridge.
2. Security and accessibility are release criteria, not later polish.
3. Secrets are never persisted by default, and diagnostic exports are redacted.
4. Every major workflow gets a deterministic Playwright path before it is called
   complete.
5. Deploys are versioned, health-checked, and reversible.

## Current baseline

DarkBear already ships the foundations this roadmap builds on:

- SolidJS, virtualized scrollback, split panes, mobile drawers, persisted drafts,
  input history, command palette, and structured message search.
- Secure WeeChat relay handshake with PBKDF2 password hashing and a guarded
  compatibility fallback.
- IRCv3 replies and read markers, typing, reactions, per-buffer notification
  tiers, IRCX channel/account tools, and operator workflows.
- Optional Orochi bridge for E2EE DMs, voice, video, screen sharing, captions,
  cross-device markers, and Web Push. Call Audio E2EE remains unavailable until
  its signalling and lifecycle are complete; camera video and screen sharing
  are not end-to-end encrypted.
- Bounded media replay windows, MAC verification, reduced-motion handling,
  semantic theme roles, accessible dialogs, code splitting, and a
  deploy-version-aware service worker that retains bounded release caches
  without serving stale HTML.
- A large unit/component suite and a deterministic connected-relay Playwright
  fixture covering hashed authentication, hydration, history, send, and echo.

The last point is the largest mismatch between feature breadth and production
confidence, so it leads the plan.

## Phase 0: Release confidence

### R0.1 Connected Playwright matrix

**Status: COMPLETE.** A deterministic binary relay fixture and direct Orochi
account fixture now exercise every production connection transition without an
external service. The complete 160-case matrix covers 152 journeys with eight
intentional project-scoped performance skips across desktop Chromium, Firefox,
WebKit, Pixel 7, and iPhone 15. Coverage includes authentication rejection,
mid-send relay loss without duplicate lines or commands, broad product
workflows, axe gates, and separate bridge/media journeys.

Build a deterministic test relay fixture that speaks the minimum WeeChat binary
protocol needed to exercise real application behavior. Keep an opt-in live smoke
against `eshmaki.me`, with credentials supplied only through environment
variables.

Cover these journeys:

- hashed relay authentication, initial buffer/history/nicklist hydration, send,
  confirmed echo, join, query, and disconnect;
- reconnect with backoff, failed authentication, relay loss during send, and
  recovery without duplicate lines;
- command palette, structured search, reply composition, read markers, settings,
  profile/channel panels, and notification-tier changes;
- desktop Chromium, mobile Chromium, and WebKit for the entry/connect/chat path;
- keyboard-only operation, focus visibility, dialog focus restore, no overlap at
  narrow widths, and screenshot evidence on failure;
- bridge-enabled typing, reaction, E2EE DM, and fake-device voice/video flows in
  a separate suite so relay-only failures stay easy to diagnose.

**Exit gate:** a clean machine can run the deterministic suite without external
services; the live smoke is secret-gated; traces and screenshots are retained on
failure; the production connect/send/reconnect path has no untested state
transition.

### R0.2 Atomic, reversible deploys

**Status: COMPLETE.** Versioned release construction, atomic `current`
activation, previous-release rollback, local/public asset checks, and a
Playwright live boot smoke are implemented. The production migration and a
rollback/roll-forward drill both passed on `eshmaki.me`.

Stop building directly into the directory nginx is serving. Build into a new
versioned release directory, verify it, then atomically switch a `current`
symlink. Retain four releases by default; `.deploy-previous` identifies the
single one-command rollback target.

Preflight and postflight checks must verify:

- file and directory permissions, deploy stamp, HTML, hashed JS/CSS, fonts,
  manifest, service worker, and WASM assets;
- public `https://eshmaki.me/darkbear/` status and asset loading;
- a browser boot smoke with no console errors or failed same-origin requests;
- cleanup only after the new release is healthy.

**Exit gate:** an interrupted build cannot alter the live site, rollback does
not rebuild, and a permission regression such as the prior 403 is caught before
cutover.

### R0.3 Secret-storage policy

**Status: COMPLETE.** Relay, bridge, and profile passwords are session-only by
default with explicit remember-on-device controls. Legacy passwords migrate out
of local storage, exports/imports are credential-free, direct bridge credentials
follow the same policy, and Forget This Device clears settings, profiles,
passwords, tokens, drafts/history, and the local push subscription.

Make relay and bridge passwords session-only by default. “Remember password” is
an explicit opt-in per connection profile, with a clear local-device warning.
Bearer session/reclaim tokens remain session-scoped and bounded by expiry.

Also add “forget this device” and “forget all local profiles” actions that clear
settings credentials, direct-bridge credentials, drafts, tokens, and push
subscriptions with an exact confirmation summary.

**Exit gate:** a normal connection leaves no password in `localStorage`; tests
cover migration from existing saved credentials without exposing secret values
in logs, settings exports, traces, or support bundles.

### R0.4 Diagnostics and support bundle

**Status: COMPLETE.** Settings exposes bounded relay phases and reconnect detail,
negotiated protocol/auth/compression capabilities, bridge and Orochi media
health, codec/runtime availability, service-worker and asset versions, scoped
error identifiers, and a copyable whitelist-built support bundle. Raw errors,
endpoints, credentials, message text, keys, and identities cannot enter it.

Add a local diagnostics panel with connection phases, reconnect reason, relay
protocol mode, negotiated capabilities, bridge status, codec availability,
media-drop counters, service-worker version, and active asset version.

Export a redacted JSON support bundle containing only bounded recent events and
environment metadata. Passwords, bearer tokens, message bodies, channel keys,
push endpoints, and E2EE material must be structurally impossible to export.

**Exit gate:** a user can distinguish relay, bridge, media, permission, and
deployment failures without opening developer tools.

### R0.5 Static-analysis ratchet

**Status: COMPLETE.** Explicit `any` is an error outside two documented browser/
Emscripten adapter files. Type-aware floating- and misused-promise checks are
hard errors; the four violations they exposed were fixed with explicit handling.

Keep `no-explicit-any` outside the Emscripten boundary,
`no-floating-promises`, and `no-misused-promises` enforced. Continue turning
remaining warnings into errors incrementally and record deliberate boundary
exceptions next to their adapters.

**Exit gate:** lint, typecheck, unit tests, deterministic Playwright, production
build, and `git diff --check` form one required release gate.

## Phase 1: Conversation continuity

### R1.1 Durable local archive and full search

**Status: COMPLETE.** An opt-in typed IndexedDB repository stores bounded
normalized message records, while a dedicated Worker owns retention, uses
hashed-trigram candidate lookup for indexable searches, and preserves exact
timestamp-scan fallback during migration and for short or filter-only queries. Settings
provides off/7-day/30-day/custom-size policies, per-buffer deletion, and wipe-all;
search supports grouping, snippets, keyboard traversal, exact phrases, and the
planned `has:`/`is:` filters. Targeted jumps stage absolute relay-history totals
to a 100,000-line safety bound and retain a centered 5,000-line render window.
The real Worker/IndexedDB opt-in, search, secret exclusion, and wipe path passes
Chromium, Firefox, WebKit, Pixel 7, and iPhone 15 browser journeys.

Move optional local history into a bounded IndexedDB archive with retention
controls: off, 7 days, 30 days, or custom size. Index normalized text, sender,
buffer, timestamp, msgid, and reply parent in a worker.

Extend search beyond the currently loaded 5,000-line buffer window with:

- global results grouped by buffer and day;
- exact phrase, `has:link`, `has:file`, `is:mention`, and `is:unread` filters;
- result snippets, keyboard traversal, and reliable jump-to-message with relay
  history fetch when the target is not loaded;
- delete-one-buffer and wipe-all-history controls.

**Exit gate:** searching a large archive does not block message rendering, and
disabling the archive leaves no stored transcript.

### R1.2 Real thread view

**Status: COMPLETE.** Message and context-menu actions open an optional
reconnect-safe desktop side panel or mobile sheet. The view derives the root,
transitive ordered replies, participants, and local unread count from the
canonical timeline; it stages missing-ancestor history loads, rebases through
nested missing parents, jumps back to timeline messages, and supplies a
root-scoped composer. WeeChat `irc_tag_*` metadata is normalized so current
`+draft/reply` and legacy `+reply` lines share the same graph. Component coverage
exercises pointer churn and loaded-window edits, while the five-project browser
journey covers live replies, composition, mobile navigation, and scoped axe.

Turn existing reply links into an optional thread side panel. Show the root,
ordered replies, missing-parent loading, participant count, unread state, and a
thread-scoped composer. Keep the normal timeline canonical so IRC clients that
do not understand threads still receive ordinary messages.

**Exit gate:** reply/jump/thread behavior works across history pagination,
reconnects, edits to the loaded window, and mobile navigation.

### R1.3 Saved messages and activity inbox

**Status: COMPLETE.** Archive-opted-in messages can be saved locally with a
private note and are pruned or wiped with the selected archive policy. A bounded
local inbox collects mentions, linked replies, DMs, Orochi call transitions, and
explicit operator alerts with independent unread state. Desktop/mobile entry
points and `Alt+A` open one responsive panel; every timeline-backed item jumps
when loaded or gives a specific unavailable/expired explanation. State/component
coverage verifies retention, dedupe, clearing, source jumps, and notes, while the
full five-project browser journey covers a live reply and saved note.

Add private local bookmarks with notes, plus one activity inbox for mentions,
replies, DMs, call events, and operator alerts. Every item must jump to its
source or explain why the source has expired.

**Exit gate:** clearing a buffer does not leave broken unread counters, and
bookmarks follow the user’s chosen archive-retention policy.

### R1.4 Cross-device preferences

**Status: COMPLETE.** Authenticated direct sessions negotiate Orochi
`draft/metadata-2`, read one versioned account snapshot, and publish only the
allowlisted theme, font/motion accessibility, alert controls, stable-name
notification tiers, pins, mutes, and monotonic read positions. Per-family
Lamport revisions with timestamp/device tie-breaks make merges deterministic;
read positions additionally merge by maximum so another device cannot rewind
them. The 512-byte server value ceiling is enforced with bounded,
generation-tagged collection parts and a manifest published last. Incomplete or
invalid generations fail closed, older clients ignore the namespaced keys, and
the existing credential-free export/import path remains the capability fallback.
Unit, controller, wire, Settings, scoped axe, and five-project browser coverage
verify the complete path without syncing local-only data.

Sync non-secret preferences through an account-scoped Orochi capability when
available: theme, accessibility settings, notification tiers, pins, mutes, and
read state. Keep export/import as the relay-only fallback. Never sync passwords,
custom CSS, local history, or device media choices.

**Exit gate:** conflict resolution is deterministic and an older client can
ignore the capability without losing local settings.

## Phase 2: Media users can trust

### R2.1 Device and permission preflight

**Status: COMPLETE.** Every room join, direct call, incoming-call accept, user
menu action, and media slash command now passes through one typed preflight
state machine before the media engine can act. It probes browser permissions,
opens the selected microphone/camera for a local meter and preview, constructs
the shipped KaguraVox and KaguraVis encoders, offers an isolated echo test, and
keeps output selection synchronized with the mounted engine. Device IDs remain
local, disconnected selections retry the system default and are removed, and
device-change events refresh the available choices. Capture and codec failures
are both preserved when simultaneous. State/component coverage and the
five-project browser matrix verify success, permission denial, codec load
failure, device recovery, responsive layout, and scoped WCAG A/AA checks.

Before joining a call, offer microphone, camera, and speaker selection; live
level meters; camera preview; echo test; permission status; and a codec/WASM
self-test. Remember device IDs locally but recover cleanly when hardware changes.

**Exit gate:** users discover a blocked microphone or unavailable codec before
entering the room, not after everyone else sees them join.

### R2.2 Call health and adaptive recovery

**Status: COMPLETE.** DarkBear now derives reorder-aware packet loss from a
fixed 128-packet window per stream with a hard stream cap, samples per-peer
audio jitter and Worker/main-thread encode pressure, and renders those signals
with the selected quality tier in an accessible compact call-health inspector.
Quality degrades after consecutive bad samples and recovers only after a longer
headroom hold. Loss is reported through Orochi `MEDIA ABR`, recovery keyframes
are forced, and transient bridge drops retain one capture/decoder pipeline for
a bounded grace period before re-announcing the room and roster. Intentional
detach and grace expiry still release every track. The live audio worklet is now
a same-origin base-aware asset so the call path satisfies CSP in Firefox and
WebKit. Pure loss/reorder/hysteresis tests, engine lifecycle tests, bridge wire
coverage, and the five-project browser journey verify the exit gate.

Surface packet loss, jitter, encode pressure, selected quality tier, and bridge
reconnect state in a compact call-health view. Use those signals to step video
quality down and back up with hysteresis, request keyframes after loss, and
rejoin a room after short bridge interruptions without leaking tracks or
duplicating peers.

**Exit gate:** scripted loss/reorder/reconnect tests prove bounded memory, one
active media pipeline per participant, and understandable degraded states.

### R2.3 Verifiable encryption state

**Status: COMPLETE.** Every query now exposes the currently observed peer key,
a complete grouped SHA-256 fingerprint, its short generation marker, and a
local verification state scoped to the authenticated Orochi endpoint/account.
Trust pins live behind a typed IndexedDB repository and never sync. A changed
verified key is shown against the previous fingerprint and blocks sending until
the user explicitly compares and re-trusts it. The optional verified-only
delivery policy also blocks unknown or merely observed keys; failed encryption
with a known key can no longer fall through to plaintext, and blocked text stays
in the composer. Call diagnostics may show an observed peer audio fingerprint,
but explicitly mark Audio E2EE unavailable while signalling and lifecycle work
remains incomplete. They also say that camera video and screen sharing are not
end-to-end encrypted. If an in-memory audio session or group key exists,
encryption errors drop the frame instead of downgrading it to plaintext.
Unit, state, component, cipher-session, scoped axe, rotation, plaintext-leak,
and five-project Playwright coverage verify the exit gate.

Show whether each DM/call is protected, which key generation is active, and when
a peer key unexpectedly changes. Add human-verifiable fingerprints or QR
comparison, explicit re-trust, and fail-closed controls for users who require
verified peers.

**Exit gate:** the UI never claims functional call Audio E2EE until the complete
signalling, receive, replay, leave, and ratchet lifecycle is verified; it never
implies video/screen E2EE, and encryption or key rotation cannot silently
downgrade protected traffic.

### R2.4 Captions and call accessibility

**Status: COMPLETE.** Event Spine captions now drive a polite, atomic live
status with persistent local size and high-contrast/translucent presentation
controls. The call transcript panel keeps the bounded current-call history with
speaker/time labels, Arrow/Home/End navigation, focus handoff, responsive
layout, and an explicit user-triggered text export. Caption records enter the
existing Worker-backed IndexedDB archive only when its retention policy is
enabled; the default remains no storage, and buffer delete/global wipe retain
authority over every persisted caption. All call controls have explicit
accessible names, and M/D/V/S/C/H plus Escape cover mute, deafen, camera,
sharing, transcript, hangup, and panel closure without firing while a call only
rings. Pure adapter/export tests, store and component coverage, scoped axe, a
real download, archive inspection, and five-project call journeys verify the
exit gate.

Build on Event Spine captions with a navigable transcript panel, speaker
labels, caption size/background controls, keyboard-complete call controls, and
optional local transcript export. Transcript storage is off by default and
obeys the archive wipe controls.

## Phase 3: Focus and power workflows

### R3.1 Quiet hours and actionable notifications

**Status: COMPLETE.** Foreground alerts and closed-tab Orochi Web Push now
share a device-local policy with scheduled overnight/daytime quiet windows,
IANA or system time zones, and one-hour/eight-hour/until-tomorrow global pause
controls. Expiring per-buffer mutes persist separately from the existing synced
all/mentions/mute tier and are available from the command palette; a push action
can apply the same one-hour mute even before the app opens. Service-worker
notifications expose open, mark-read, mute-one-hour, and inline reply actions,
falling back to open when the platform cannot carry reply text. Action payloads
are allowlisted, target-resolved, and bounded, and reply plaintext is never
queued in storage or placed in a URL. Pure timezone/policy tests, state and UI
coverage, a service-worker contract gate, scoped axe, and five-project connected
journeys verify the slice.

Add scheduled quiet hours, timezone-aware DND, temporary mute durations, and
notification actions for open, mark read, mute one hour, and reply where the
platform permits. Preserve the existing all/mentions/mute per-buffer tiers.

### R3.2 User-defined command actions

**Status: COMPLETE.** Advanced settings now creates, lists, and deletes named
global or saved-profile actions from a fixed typed registry of existing safe
commands. The command palette exposes only actions valid for the connected
profile, and a generated runner collects command-specific arguments, rejects
newline/target injection, caps expansion at 2,048 characters, and shows the
exact IRC command before sending. First use requires explicit confirmation;
subsequent runs retain the review surface. Persisted actions are normalized and
capped at 50, settings export strips credentials as before, and no raw command
template, JavaScript, shell, or general execution path exists. Unit/component
coverage and a connected five-project Playwright journey verify creation,
scope, accessibility, rejection, relay delivery, and credential-safe storage.

### R3.3 Operator incident workspace

**Status: COMPLETE.** The operator console now preserves Orochi's subscription
category and severity tags alongside the structured Event Spine domain/verb,
then supports named device-local views of category subscriptions, severity
thresholds, and text queries. A bounded 500-event timeline exposes exact nick,
userhost, and channel pivots that correlate entities across event domains.
Redacted JSON export omits raw lines and server sources and scrubs URLs,
hostnames, IP addresses, userhosts, sensitive keyed attributes, secrets, and
opaque key material from structured events and client audit entries. KILL,
WARD, JUPE, and destructive raw commands stop at an exact-command review and
remain disabled until the operator types the precise target. Every command sent
from the console enters a redacted, device-local 200-entry audit; saved views
are capped at 20 and Forget This Device clears both stores. Pure parser,
filter/correlation/redaction/state tests, UI safety tests, scoped axe, and a
connected five-project browser journey verify the workspace.

### R3.4 Upload queue

**Status: COMPLETE.** The composer now sends file selections and accepted image
pastes through a bounded device-memory queue with two concurrent transfers,
per-item progress, cancellation, retry, and stable destination-buffer
ownership. Chat remains usable during transfer. A typed transport layer
enforces a 25 MiB allowlist, checks raster signatures, strips JPEG, PNG, and
WebP metadata before upload, sanitizes filenames, bounds service responses,
rejects unsafe configuration and returned URL schemes, and normalizes optional
absolute or TTL expiry. Only JPEG, PNG, and WebP receive local blob previews;
other accepted files use generic tiles. A completed URL is claimed once and
appended only to the original buffer's draft after service acceptance, never
sent automatically. Unit/state/component coverage and a connected
five-project Playwright journey verify policy rejection, concurrent chat,
cancellation, retry, binary metadata removal, expiry presentation,
accepted-only insertion, and scoped accessibility.

## Phase 4: Platform reach

### R4.1 Deploy-safe offline shell

**Status: COMPLETE.** Release stamping now injects the exact deploy version and
an allowlist of immutable build/public assets into the worker. Four namespaced
release caches preserve old hashed chunks and same-version stable assets across
activation and rollback while pruning only DarkBear-owned excess caches.
Interactive HTML is never cached: navigations use no-store network responses
and fall back on network failure or 5xx to a purpose-built standalone shell
that explicitly contains no transcript, draft, decrypted message, account, or
relay data. All API, upload, WebSocket, archive, message, and media responses
remain outside the fetch allowlist. The loaded app shows a distinct browser-
offline banner and bounded relay-reconnect detail with the existing retry path.
The old cache-killer bootstrap no longer unregisters workers or clears caches;
it exposes the stamped version to each controlled client instead. Source,
state, component, build-stamp, CSP, and connected five-project Playwright
coverage verifies cache pruning, unrelated-cache preservation, old-asset
resolution, offline fallback, recovery, and accessibility. The complete 100-
journey matrix passes.

### R4.2 Installable desktop package

**Status: COMPLETE.** A Tauri v2 shell packages the same SolidJS protocol,
state, archive Worker, media Workers, and UI implementation through a dedicated
relative-asset build; the browser build and deploy-version service worker stay
unchanged. One local-only window receives four reviewed native interfaces:
events, notifications, controlled deep links, and a custom credential vault.
The vault exposes only two fixed records through bounded, redacted Rust
commands and maps explicitly remembered relay/profile/Orochi passwords to the
operating-system secret store. Non-remembered passwords and all bearer tokens
remain session-only, and localStorage contains metadata rather than desktop
secrets. Remote frames receive no native capability.

Native notifications preserve the encrypted-message fail-closed policy,
window state survives restarts, and single-instance delivery accepts only the
strict `darkbear://open/buffer?target=...` shape before resolving a known relay
buffer. The Linux default produces a Debian installer; an automated package
gate checks its control metadata, executable, icons, desktop entry, and scheme
registration. TypeScript/Vitest contracts, a Rust allowlist test, both web and
desktop production builds, an optimized native build, installer verification,
and a virtual-display launch smoke cover the boundary. The existing five-engine
connected Playwright matrix remains the browser regression gate.

### R4.3 Localization and international input

**Status: COMPLETE.** A compile-time-complete built-in catalog supplies English,
German, and Arabic, with a persisted system/explicit locale preference. Startup
updates the root `lang` and `dir` attributes atomically; Arabic mirrors structural
rails while bidi plaintext isolation keeps nicks, commands, URLs, and mixed-script
messages readable. Shared Intl helpers now own user-facing dates, times, relative
labels, and numbers across the chat, archive, uploads, calls, activity, operator,
settings, sidebar, and thread surfaces.

The extracted core shell covers connection credentials and Orochi bridge copy,
navigation, sidebar/user list, chat header and search, composer, threads, mobile
dock, command palette actions, and settings navigation. A single IME predicate
guards global shortcuts and every key-driven high-risk surface, including relay
and Orochi credentials, TOTP, the main and thread composers, message/user/buffer
search, and the command palette. Unit/source contracts plus a connected Arabic
journey verify live locale switching, RTL overflow, composition preservation, and
WCAG A/AA behavior in Chromium, Firefox, WebKit, Pixel 7, and iPhone 15.

### R4.4 Performance budgets

**Status: COMPLETE.** The production build now has executable gzip budgets for
initial JavaScript, CSS, their combined transfer, and the lazy theme-scene
chunk. Rollup keeps shared runtime in the entry graph without hoisting it into a
named lazy chunk, so the theme library is no longer modulepreloaded. The current
caps are 155 KiB initial JS, 30 KiB initial CSS, 185 KiB combined, and 60 KiB
for the on-demand scene library.

A coarse, privacy-preserving capability profile uses data-saver, 2G-class
network, device-memory, and core-count hints to select `full` or `low`
decorative quality. Low-tier clients retain every functional surface while
omitting scene/mascot modules and backdrop sampling. OS- and user-requested
reduced motion also omit scenes; direct scene renders disable both SMIL and CSS
motion. The connect entry uses a bounded CSS scene and static mascot, avoiding
the former multi-thousand-node scene churn during account preference changes.

Live relay lines coalesce across a bounded 16 ms event-loop window, folding
adjacent WebSocket frames into one store update per buffer. A Chromium scene
gate measures incremental frame cost against a same-page control. A 4x-throttled
Pixel 7 journey drives a 400-message burst, verifies command-palette latency and
settling time, samples low-tier frames, joins a real mocked voice call, delivers
2,000 captions, proves the 200-entry transcript cap, and checks post-GC heap
growth. Source contracts and unit tests protect capability detection, lazy chunk
boundaries, reduced-motion behavior, and cross-frame line batching.

### R5.1 Orochi authentication and session continuity

**Status: COMPLETE.** DarkBear now distinguishes Orochi's account-bound SASL
`SESSION-TOKEN` credential from local/mesh logical-session reclaim tokens. The
TLS-issued bounded `sst_...` credential remains in session storage, is preferred
over replaying the password on reconnect, and falls back once to password/SCRAM
after an explicit rejection while preserving `SESSION RESUME` state. The SASL
authcid can differ from the visible nick, so nick-collision aliases never change
the authenticated account.

When `orochi/session-sync` is active, both welcome-time and late-discovered
channel mirroring suppress client JOINs and let Orochi restore membership and
history without a competing JOIN/NAMES storm. Parser, credential, IRC state-
machine, bridge-controller, and connected five-profile call-recovery tests cover
the complete first-login, token capture, reconnect, fallback, and session-sync
contract.

### R5.2 Orochi service reply feedback

**Status: COMPLETE.** Server-buffer `FAIL`, `WARN`, `NOTE`, command-shaped
registration replies, and narrowly recognised Orochi service `NOTICE` lines now
feed a typed, server-scoped services log. The session-only store retains at most
24 entries, presents the latest four in the Services panel, and can clear one
network without affecting another. Unrelated server chatter and account-bound
`SESSIONTOKEN` credentials are rejected before storage, so bearer material can
never be echoed into this UI.

Parser, state, relay-pipeline, and component tests cover standard-replies,
capability fallback notices, bounds, scoping, clearing, and credential
exclusion. A connected journey verifies REGISTER failure, live TOTP feedback,
and token non-display in Chromium, Firefox, WebKit, Pixel 7, and iPhone 15. The
versioned `2026-07-16-192841-darkbear-00b824a` release is live and passed the
public postflight smoke.

### R5.3 Orochi service command hygiene

**Status: COMPLETE.** Every Services-panel command now crosses one
2,048-character, control-byte-free dispatch boundary before `/quote`. Rejected
input produces a typed local error without reflecting the attempted command or
its secrets. Memo line breaks and tabs are flattened into one trailing message
parameter, so pasted multiline text cannot become a second relay command.

REGISTER, IDENTIFY, ACCOUNTSET, GHOST, DROP, VERIFY, and TOTP credentials clear
only after an open relay WebSocket accepts the serialized dispatch; missing or
closing relay transports leave the form intact for retry. Password and one-time-
code inputs expose the correct browser autocomplete semantics. Component tests
cover routing, retention, bounds,
redaction, and memo normalization, while the connected service journey proves
safe relay bytes and password clearing across all five browser profiles. The
source suite passes 126 files and 1,787 tests; browser/desktop builds, Rust
check, and asset budgets pass. This slice is live in version
`2026-07-16-230427-darkbear-00b824a`.

### R5.4 Cross-tab alert ownership

**Status: COMPLETE.** Same-origin DarkBear tabs now exchange only an
ephemeral tab ID plus connected/focused booleans over `BroadcastChannel`. A
deterministic, stale-peer-bounded election prefers the focused connected tab
and otherwise chooses one stable connected owner. Only that tab may emit the
foreground notification and sound side effects for a relay line, preventing
duplicate alerts when several tabs mirror the same WeeChat session. Browsers or
constrained WebViews without `BroadcastChannel` retain the previous local-alert
behavior.

Pure election tests cover focus preference, stable ownership, inactive peers,
and expiry. The relay pipeline test proves a non-owner emits neither a browser
notification nor sound. A real two-page journey delivers the same highlighted
line to both connected tabs and observes exactly one notification in Chromium,
Firefox, WebKit, Pixel 7, and iPhone 15. Full local gates pass 127 Vitest files
with 1,792 tests, strict TypeScript/ESLint, browser and desktop builds, Rust
check, and asset budgets at 147.72 KiB initial JS, 25.43 KiB CSS, 173.14 KiB
combined, and 33.96 KiB lazy scenes. This slice is live in version
`2026-07-16-230427-darkbear-00b824a`.

### R5.5 Orochi services accessibility

**Status: COMPLETE.** Every Services-panel input and textarea now has
an explicit accessible name, and the account-setting, VHost, and auto-kick
selects expose their purpose to assistive technology. Shared action primitives
are explicit non-submit buttons. Small headings, helper copy, inactive tabs,
clear/cancel actions, and reply-log labels use contrast-safe theme roles that
remain legible under DarkBear's most demanding palette.

The connected Orochi services journey now runs `@axe-core/playwright` over the
settled Account, Channel, and Memo views. The gate waits for the modal overlay's
actual Web Animations completion instead of sampling its transient opacity or
using a timing sleep. It passes Chromium, Firefox, WebKit, Pixel 7, and iPhone
15; focused component tests and strict TypeScript/ESLint also pass. This slice
is live in version `2026-07-16-230427-darkbear-00b824a`.

### R5.6 Localized Orochi services

**Status: COMPLETE.** The entire Account, Channel, Memo, local-error,
confirmation, helper-copy, and accessibility-name surface now uses DarkBear's
existing compile-time-complete catalog. English, German, and Arabic ship as one
typed key set; protocol command tokens remain unchanged on the wire. Arabic
inherits the app's real RTL document direction rather than a panel-specific
layout fork.

Component coverage renders German account controls and Arabic memo controls,
including the RTL root and localized accessible names. The connected Arabic
IME journey now establishes current Orochi detection, opens the translated
services dialog, audits it with axe, and retains its full-document WCAG gate in
Chromium, Firefox, WebKit, Pixel 7, and iPhone 15. That broader gate found and
fixed a 20 px channel-info target and a short topic expander; both now meet the
WCAG 2.2 target-size floor. Full local gates pass 127 Vitest files with 1,793
tests, strict TypeScript/ESLint, browser and desktop builds, Rust check, and
asset budgets at 150.39 KiB initial JS, 25.43 KiB CSS, 175.82 KiB combined, and
33.96 KiB lazy scenes. This slice is live in version
`2026-07-16-230427-darkbear-00b824a`.

### R5.7 Release-candidate hardening

**Status: COMPLETE.** The optional direct Orochi bridge now fails closed
unless production and credential-bearing endpoints use `wss://`. The only plain
`ws://` exception is an unauthenticated loopback endpoint for local development,
and the desktop content-security policy no longer permits generic plain
WebSocket connections. Fresh `SESSIONTOKEN` notices are accepted only from the
server prefix authenticated by the current SASL exchange, while relay-side
Services feedback requires a server-authored source rather than merely appearing
in a server buffer.

Foreground notification reply plaintext is bound to the exact originating
DarkBear document. Before showing reply-capable actions, that document registers
a random opaque scope with its controlling service worker and waits for an
acknowledgement; the worker persists a short-lived one-to-one binding to the
source `WindowClient`. Missing, expired, ambiguous, or closed scopes fail closed
to a clean `/darkbear/` open and are never rerouted to another tab. Server push
cannot authenticate a document scope, so it exposes Open only and carries no
conversation/action-routing metadata. Inline message images now default off for
new or malformed preferences; explicit existing choices survive migration, and
enabled message images and profile avatars use a no-referrer request policy.
Remote profile avatars remain initials unless inline images are explicitly
enabled.

Portable settings remove passwords and API keys and sanitize every URL-bearing
portable surface. Upload and remote-background URLs retain only a valid HTTP(S)
origin/path or safe root-relative path. Direct bridge endpoints retain only WSS,
plus the credential-free loopback WS development exception. Userinfo, query,
fragment, unsafe schemes, and invalid endpoints cannot survive export or import.

Upload endpoints reject absolute URLs containing username/password credentials.
Fetch and XHR response readers enforce the 64 KiB service-response cap while
bytes arrive, cancelling the body or request immediately on overflow rather
than buffering an unbounded response first.

The Services dialog now owns a bounded vertical scroll region with sticky tabs
and no horizontal overflow on mobile. Account, Channel, and Memo are real ARIA
tabs with roving focus plus Home/End and RTL-aware arrow navigation. The relay
and direct Orochi clients now return whether an authenticated open socket
actually accepted each frame. Rejected sends retain ordinary and encrypted
composer text, drafted upload URLs, thread replies, every Services field and
confirmation, notification reply text, operator raw/broadcast/destructive
inputs, IRCX profile/property/access edits, safe user actions, and join/create
state. Uploads are marked inserted only after their containing message is
accepted. Reactions are added locally only after an accepted TAGMSG, preference
publishing and stale-part cleanup remain pending on rejection, and failed sends
do not create optimistic echoes or false operator audit entries.

Live and history dedupe now relies only on stable relay line IDs and IRC
`msgid`; content/time heuristics no longer collapse legitimate repeated text or
an immediate retry. Activity and Thread overlays share modal focus isolation:
background regions become inert, Tab stays inside, Escape dismisses, and focus
returns to the opener.

Focused unit, component, worker-runtime, wire, and connected browser coverage
exercises the new transport, exact-tab notification scope, origin, privacy,
bounded-response, stable-identity dedupe, mobile-scroll, keyboard, relay-loss,
input-retention, and focus contracts. Final local gates pass 128 Vitest files
with 1,884 tests, strict TypeScript/ESLint, browser and desktop production
builds, Rust check, and the 160-case browser matrix as 152 journeys plus eight
intentional project-scoped skips. Atomic activation published version
`2026-07-16-230427-darkbear-00b824a`; its public HTML/worker stamps, immutable
assets, rollback pointer, and independent Playwright boot smoke all pass.

### R6.0 Reproducible release provenance

**Status: COMPLETE.** Release construction now computes a deterministic
SHA-256 over the production source inputs before building and refuses to publish
if those inputs change during the build. A second digest binds every built
artifact that does not contain the circular release stamp. The timestamped
release name includes the commit, clean/dirty tree state, and artifact-digest
prefix instead of identifying an uncommitted build as only the current commit.

Each release carries a strictly validated `release.json` with its full commit,
tree state, source and artifact digests, canonical UTC build time, and exact
Node, pnpm, and Vite versions. It contains no absolute source paths, environment
values, credentials, or host inventory. Local verification recomputes the
artifact digest; production postflight fetches the public manifest without cache
and requires a byte-for-byte match before the atomic cutover is committed.
Rollback remains compatible with releases created before provenance manifests
while verifying every provenance-aware release before activation.

**Exit gate:** focused source-ordering, artifact-tamper, manifest-schema,
privacy, version, and build-race contracts pass; a disposable assembled release
passes the same write/verify path as deploy; and the first provenance-aware live
release passes public manifest, HTML/worker stamp, asset, and Playwright checks.
Production version
`2026-07-16-232251-darkbear-00b824a-dirty-90776f41bd5c` satisfies that gate;
its public manifest exactly matches the local release, independently recomputes
artifact digest `90776f41bd5c567ea9e3e1b2c006f34c1055e11bcfd4869833f51e4c09eee650`,
and retains the prior R5.7 release for rollback.

### R6.1 Indexed archive search at scale

**Status: COMPLETE.** The typed archive repository now upgrades the
existing database in place and adds a bounded multi-entry hashed-trigram index.
Raw message/sender substrings, normalized quoted phrases, and channel substrings
get separate namespaces, while the existing exact matcher remains authoritative.
Hash collisions can only add candidates. One- and two-character clauses,
filter-only searches, and records exceeding the 256-token per-record bound use
the exact timestamp scan, so no previous substring or filter semantics are lost.

Existing v1 transcripts remain the source of truth during migration. A metadata
checkpoint backfills 250 records per transaction and yields between batches;
search falls back to the complete timestamp scan until that checkpoint is done.
Upserts generate the internal index in the repository, and IndexedDB removes the
derived keys automatically on buffer deletion, retention pruning, or wipe.
Connections close on version change and a blocked/rejected open can be retried.

Archive Worker commands now execute FIFO, preventing search from overtaking a
prior write plus retention policy. Searches accept `AbortSignal`; query changes
and component cleanup immediately send a targeted cancellation, cursor scans
cooperate with it, and destructive commands invalidate active searches before
running. Malformed runtime messages receive an explicit error, while Worker
decode failures reject pending work and permit clean recreation.

**Exit gate:** indexed/full-scan golden equivalence covers mid-word, sender,
channel, phrase, Unicode normalization, filter, date, and short-query behavior;
v1 migration, stale-key replacement, bounded fallback, FIFO, cancellation, and
Worker recreation tests pass. The real v1-upgrade/search/write/privacy/wipe
journey passes Chromium, Firefox, WebKit, Pixel 7, and iPhone 15. Custom-size
retention and statistics were subsequently replaced by R6.2's transactional
schema-v3 aggregates and index-aware custom retention.
Production version
`2026-07-16-234133-darkbear-00b824a-dirty-0e6440bf7eaa` satisfies the live
gate: the public archive Worker is byte-identical to the verified local artifact
and contains both index and cancellation contracts, public provenance matches,
HTML/worker stamps agree, and the independent Playwright boot smoke passes.

### R6.2 Transactional archive accounting

**Status: COMPLETE.** Archive schema v3 maintains total and per-buffer
message/logical-byte aggregates in the same IndexedDB transaction as every
upsert, buffer deletion, retention deletion, and wipe. Existing rows acquire a
per-record accounting marker through a resumable 250-record backfill; marked
records are the exact aggregate contribution during migration, so concurrent
writes, deletes, and multiple tabs cannot double-count them. Stats use aggregate
rows plus one newest-record name lookup per buffer, reducing normal work from
O(messages) to O(buffers), while incomplete migration retains the exact scan.

Custom retention now uses a conservative stored-byte estimate that includes
duplicated normalized text, derived search keys, and per-index-entry overhead.
When the archive is under budget it opens no message cursor. When over budget it
deletes only the contiguous oldest prefix required to fit, with the same
newest-suffix rule before and after migration. Aggregate underflow, non-finite
sizes, and double subtraction abort rather than silently poisoning counters.

The archive client also rejects malformed Worker responses, ignores late errors
from a replaced Worker, and treats Worker-initiated destructive cancellation as
cancellation rather than a false storage failure in the search UI.

**Exit gate:** transactional upsert/buffer/retention/wipe totals, aggregate
migration, no-cursor under-budget retention, newest-suffix trimming, invalid
counter input, response validation, stale-Worker isolation, and the real v1→v3
browser journey pass before production activation.
Production version
`2026-07-16-235449-darkbear-00b824a-dirty-7ed90eeebef3` satisfies the live
gate. Its public manifest and archive Worker are byte-identical to the verified
local release, schema-v3 aggregate/index/cancellation contracts are present,
HTML/service-worker stamps agree, and the independent Playwright boot smoke
passes with R6.1 retained for rollback.

## Completed delivery order

The first release train landed in this order:

1. Deterministic connected Playwright relay fixture and core chat journey.
2. Atomic deploy directories, public postflight smoke, and rollback.
3. Session-only password default plus migration and forget-device controls.
4. Diagnostics/support bundle and mobile/WebKit Playwright expansion.
5. IndexedDB archive/search, then the thread panel.
6. Media preflight, call-health recovery, and encryption verification.

R0.1 and R0.2 preceded the broader feature work and remain the release gate for
every later slice.

## Not planned

- Replacing WeeChat as the chat backbone.
- Making the Orochi bridge mandatory for normal chat.
- Persisting passwords or bearer tokens by default for convenience.
- An offline mode that appears connected or accepts messages it cannot deliver.
- Arbitrary scripts in command-palette actions.
- More themes before release confidence, continuity, and media trust are green.

## Definition of done

A roadmap item is complete only when implementation, focused tests,
documentation, accessibility review, and failure states land together. A live
item also requires a successful versioned deploy, public asset verification,
and Playwright proof against the deployed URL. A checked box without those
artifacts is progress, not completion.
