# DarkBear Implementation Log

This is the chronological engineering log for roadmap implementation. It records
material inspections, edits, verification, deployment actions, failures, and
their resolutions. Secrets and credential values are never recorded.

## 2026-07-13

### Roadmap refresh

- Audited the current source, tests, recent commits, deployment layout, and
  existing roadmap.
- Replaced the stale audit backlog in `ROADMAP.md` with a current phased product
  roadmap covering release confidence, continuity, media trust, power workflows,
  and platform reach.
- Selected R0.1 connected Playwright coverage as the first implementation slice.

### R0.1 connected Playwright fixture

- Added `tests/e2e/fixtures/weechatRelay.ts`, a deterministic mocked WeeChat
  relay using Playwright WebSocket routing and valid typed binary relay frames.
- Added `tests/e2e/connected-chat.spec.ts` covering PBKDF2 authentication,
  buffer/history/hotlist/nicklist hydration, composer send, confirmed echo,
  browser errors, relay restart, re-authentication, transcript deduplication,
  and post-reconnect send.
- First connected run timed out during navigation because a pre-navigation
  storage-clearing init script blocked page startup. Removed the unnecessary
  script; Playwright already creates a fresh context per test.
- The next run hydrated the channel but not history. The fixture had emitted an
  extra `arr` type marker inside an hdata field whose type was already declared.
  Removed the marker and confirmed correct history decoding.
- Verification passed: TypeScript, ESLint, 1,529 unit/component tests, three
  Playwright tests, and `git diff --check`.
- Completed the remaining connection-state coverage with deterministic rejected
  authentication and mid-send relay loss. Rejected authentication proves the
  bounded password-hash/legacy fallback sequence terminates with an actionable
  alert; send-loss recovery proves one optimistic line, one command emission,
  re-authentication, and a successful subsequent send.

### R0.2 atomic deployment implementation

- Audited the active nginx configuration and confirmed `/darkbear/` and
  `/darkbear/assets/` were served directly from the mutable `out/` build.
- Reworked `deploy.sh` to build under `.releases/<version>`, validate required
  and referenced assets, atomically activate `current`, retain a previous target,
  expose `--rollback`, prune old releases, and automatically restore the prior
  target when public postflight verification fails.
- Added `scripts/verify-live.mjs`, a Playwright production boot smoke that checks
  the public page, deploy stamp, same-origin HTTP failures, console errors, and
  page errors.
- Added generated deployment paths to `.gitignore` and updated README, Vite,
  Playwright, and roadmap documentation for the versioned-release model.
- The first live-smoke trial flagged `ERR_ABORTED` module requests caused by the
  intentional asset-version reload. Updated the smoke to ignore only Chromium's
  navigation-abort signal while retaining HTTP and other request failures; the
  smoke then passed against the existing live release.
- Created `current -> out` so the nginx migration initially served
  byte-identical content.
- Updated the nginx site configuration to serve DarkBear and its immutable
  assets from the repository's `current/` release symlink.
- An unprivileged `nginx -t` parsed the configuration successfully but could not
  read `/run/nginx.pid`. Re-ran with `sudo`; config validation and nginx reload
  succeeded.
- First `./deploy.sh` attempt failed with `Permission denied` because replacing
  the script reset its executable bit. No build or live cutover occurred.
- Restored `deploy.sh` mode to executable (`0755`).
- Re-ran `./deploy.sh`. Vite built release
  `2026-07-13-013057-darkbear-00b824a` under `.releases/`; local asset and
  permission checks passed.
- Atomically switched `current` from the legacy `out/` build to the new release
  and recorded `out/` in `.deploy-previous`.
- Public HTML, hashed JS/CSS, manifest, service worker, WASM, and Playwright boot
  postflight checks passed on `https://eshmaki.me/darkbear/`.
- Ran `./deploy.sh --rollback`. It atomically restored the legacy release
  `2026-07-13-005653-darkbear-00b824a`, swapped the new release into
  `.deploy-previous`, and passed the old release's public Playwright smoke.
- Ran `./deploy.sh --rollback` a second time to roll forward. It restored
  versioned release `2026-07-13-013057-darkbear-00b824a`, returned `out/` to
  `.deploy-previous`, and passed the new release's public Playwright smoke.
- Marked roadmap item R0.2 complete after the production migration and
  rollback/roll-forward drill succeeded.
- The first complete post-deploy gate found ESLint traversing the new generated
  `.releases/` tree and reporting 1,870 errors in minified bundles. This was a
  release-layout ignore regression, not source failures; TypeScript passed.
- Added `.releases/` and the `current/` symlink to ESLint's global generated-file
  ignores. The complete gate must be rerun after this correction.
- Re-ran the full gate after the ignore correction. TypeScript, ESLint, 88 test
  files with 1,529 tests, three Playwright tests, deploy shell syntax, smoke
  script syntax, and privileged nginx configuration validation passed.
- The parallel live-smoke command failed before launching Playwright because a
  nested shell-quote expression misparsed the version-extraction `cut` argument.
  The site was not changed. Re-running with the active release directory name as
  the version source avoids this command-only quoting error.
- Re-ran the final public smoke using `basename $(readlink -f current)` as the
  version source. Playwright passed against live release
  `2026-07-13-013057-darkbear-00b824a`.

### R0.3 session-only secret storage

- Audited active settings, saved relay profiles, settings export/import, direct
  Onyx Server credentials, and the bridge connection lifecycle. Passwords could be
  persisted through all four paths.
- Added explicit relay, bridge, and per-profile remember flags with a default of
  false.
- Split settings persistence: passwords remain available through sessionStorage
  by default, while localStorage receives redacted snapshots unless the matching
  remember flag is enabled.
- Made settings exports and imports credential-free regardless of remember
  state, and added migration that moves legacy local passwords into the
  session-only store.
- Updated the connect and settings interfaces with explicit remember controls,
  and passed the bridge remember decision into its credential cache.
- Updated the direct credential store so passwords and bearer tokens are
  session-only by default, with local persistence only under explicit opt-in.
- Added focused regression tests. Settings passed 32 tests; credential tests
  initially found two failure-mode regressions where unavailable or corrupt
  sessionStorage discarded the password immediately.
- Added an in-memory secret fallback only for sessionStorage throw/corruption
  cases. A successful intentional sessionStorage clear still clears the fallback.
- Restricted that fallback to entered passwords only; bearer tokens remain
  fail-closed when sessionStorage cannot persist them.
- Added Forget This Device in Settings. It removes settings and profiles,
  settings secrets, direct bridge credentials and tokens, drafts/input history,
  and the browser's local push subscription after an exact confirmation.
- Added Playwright proof that a normal connected relay password is absent from
  localStorage and present only in sessionStorage.
- Verification passed: TypeScript, ESLint, 71 focused storage/draft tests, all
  three Playwright tests, and the full 88-file suite with 1,534 tests.
- Marked roadmap item R0.3 complete.
- Deployed R0.3 through the atomic pipeline as
  `2026-07-13-014311-darkbear-00b824a`. Local release checks, public asset
  checks, and the live Playwright boot smoke passed; the prior versioned release
  is available through `./deploy.sh --rollback`.

### R0.4 diagnostics and support bundle

- Audited relay, bridge, media, deploy-version, and media-drop state already
  available in the client.
- Added relay diagnostics for hashed/legacy authentication mode, server version,
  and negotiated compression.
- Added a bounded 80-entry diagnostics event ring for relay, bridge, and media
  state transitions. Event values are short state labels only.
- Added a whitelist-built support bundle containing runtime health, boolean error
  presence/categories, service-worker control, media-drop counters, and bounded
  events. It never serializes settings, buffers, messages, channels, identities,
  endpoints, passwords, or tokens.
- Added a compact Diagnostics section to Advanced Settings with relay lag/auth,
  bridge/E2EE, media, deploy version, and Copy Support Bundle.
- Added non-sensitive error identifiers for authentication, TLS, network, and
  protocol failures without exporting raw error text.
- Focused diagnostics, Settings UI, and relay-handshake tests passed (23 tests
  after the error-classification case); ESLint passed.
- Full R0.4 verification passed: TypeScript, ESLint, 89 test files with 1,537
  tests, and all three Playwright journeys.
- Deployed the R0.4 diagnostics slice atomically as
  `2026-07-13-014823-darkbear-00b824a`. Local release validation, public assets,
  and the live Playwright boot smoke passed.

### R0.5 static-analysis ratchet

- Inventoried explicit `any` usage. Five actual casts remain, all inside the
  Emscripten codec or MediaStreamTrackProcessor adapter boundary; ordinary
  application code has none.
- A trial `pnpm run lint -- --max-warnings=0` passed the extra separator through
  the package script as a filename and failed before linting. Existing normal
  lint had already passed; this was command syntax only.
- Enabled `no-explicit-any` as an error for application source with narrow
  exceptions for the two codec adapter files.
- Enabled type-aware `no-floating-promises` and `no-misused-promises` using the
  TypeScript project service. The next lint run will establish and repair the
  real promise-safety backlog.
- Corrected stale Connect help copy that still claimed all connection details
  were stored in localStorage.
- Type-aware lint found four floating promises: AudioContext resume in
  notifications and ringtone code, plus two media WASM initialization chains.
- Added explicit rejection handling. Media initialization failures increment
  bounded diagnostic drop counters; loss-tolerant audio resume failures remain
  explicitly ignored.
- R0.5 focused verification passed: ESLint with the new hard rules, TypeScript,
  and 16 notification/media tests. Marked R0.5 complete.
- Full post-R0.5 gate passed: TypeScript, strict ESLint, 89 test files with 1,537
  tests, all three Playwright journeys, deploy shell syntax, and diff checks.
- Deployed the R0.5 batch atomically as
  `2026-07-13-015319-darkbear-00b824a`. Local release validation, public assets,
  and live Playwright boot verification passed. Public `/darkbear/` returned
  HTTP 200 after cutover.

## 2026-07-16

### R0.4 diagnostics completion

- Added a redacted relay lifecycle model covering socket open, handshake,
  password-hash derivation, authentication, synchronization, ready, reconnect
  wait, and failure phases.
- Added negotiated transport, protocol/auth/compression, server-version,
  password-hash, TOTP, handshake, and browser decompression capability detail.
- Added scoped relay, bridge, media, permission, and deployment error identifiers
  plus codec/runtime capability reporting. Support bundles remain whitelist-only
  and contain no raw error text or user/network content.
- Expanded Advanced Settings diagnostics and focused relay/state/component tests.
- Marked R0.4 complete. This batch has not been deployed.

### R1.1 local archive and Worker search

- Added a typed native IndexedDB repository for normalized message records with
  buffer/time, sender, msgid, and reply-parent indexes.
- Added an archive Worker that owns storage, retention pruning, custom-size
  trimming, and newest-first global search so indexing and transforms stay off
  the chat-rendering path. Search scans the full bounded date range until the
  requested result limit is filled instead of silently capping candidates.
- Added opt-in off/7-day/30-day/custom-size settings, an explicit privacy note,
  per-buffer deletion, wipe-all control, and Forget This Device integration.
  Archive retention defaults to off.
- Extended search with global buffer/day grouping, snippets, quoted phrases,
  `has:link`, `has:file`, `is:mention`, and `is:unread` filters. Results can
  be traversed with arrow/Home/End keys, switch buffers, and request bounded
  relay-history pages when the target is not loaded. History bulk loads now
  rebuild msgid indexes for jump/reply lookup.
- Added fake-IndexedDB repository tests plus record and query-transform tests.
  Targeted jumps now request staged absolute relay totals up to a 100,000-line
  safety bound and retain a centered 5,000-line window around the result.
- Added a real-browser opt-in/index/search/wipe journey across Chromium,
  Firefox, WebKit, Pixel 7, and iPhone 15. It verifies that archive records omit
  relay credentials and endpoints. R1.1 is complete locally and not deployed.

### R1.2 thread view

- Added a reconnect-safe optional thread selection keyed by stable buffer name,
  transitive chronological reply derivation, participant counts, and monotonic
  per-thread unread/read-through state.
- Added inline and context-menu thread openers plus a responsive desktop side
  panel/mobile sheet with root and reply jumps and a root-scoped composer. The
  normal relay timeline remains the only message owner.
- Missing roots use staged absolute history loading and the centered target
  window. A fetched intermediate reply rebases the panel to the oldest ancestor.
- Normalized WeeChat relay `irc_tag_*` entries before IRCv3 parsing and accept
  both current `+draft/reply` and legacy `+reply` linkage.
- Added state, component, live tagged-reply, scoped axe, and five-browser/mobile
  journey coverage. R1.2 is complete locally and not deployed.

### R1.3 saved messages and activity inbox

- Added private local message bookmarks with sanitized notes, stable source
  identity, archive-opt-in gating, and archive retention/delete/wipe coupling.
- Added a bounded, deduplicated activity store for mentions, linked replies,
  DMs, explicit operator alerts, and Onyx Server call transitions. Inbox unread state
  is independent from buffer clearing.
- Added a code-split responsive Activity/Saved panel, desktop and mobile badges,
  source jumps or explicit expired/unavailable explanations, and the `Alt+A`
  entry shortcut.
- Added state, component, message-action, keyboard, and real-browser coverage.
  The final local gate passes strict lint/typecheck, 95 files with 1,569 tests,
  production build, and all 35 journeys across Chromium, Firefox, WebKit, Pixel
  7, and iPhone 15. R1.3 is complete locally and not deployed.

### R1.4 cross-device preferences

- Audited the existing direct Onyx Server session, `draft/metadata-2` negotiation,
  stable buffer-name stores, thread read markers, settings persistence, and the
  server's real 512-byte metadata-value ceiling before selecting the wire shape.
- Added a versioned preference document with independently stamped appearance,
  accessibility, notification, buffer, and read-state families. Lamport
  revision, timestamp, and device-ID ordering resolve equal conflicts
  deterministically; read positions additionally merge by maximum.
- Added a strict schema allowlist. Only theme, font/motion/read-marker
  accessibility, global alerts, notification tiers, pins, mutes, and read
  positions can enter the document. Passwords, endpoints, custom CSS, archives,
  message text, E2EE material, and media devices have no wire representation.
- Enforced Onyx Server's metadata limits with generation-tagged buffer/read parts,
  a maximum part/entry budget, a manifest published last, stale-part cleanup,
  and fail-closed rejection of incomplete or mixed generations.
- Added a WebCrypto-generated non-secret device ID, a local typed sync cache,
  debounced local publishing, account-private metadata visibility, capability
  and successful-SASL gates, complete LIST reassembly, manual retry, and a local
  device-forget path that leaves account data intact.
- Added Settings status, last-sync time, exact data-boundary copy, and an
  explicit export/import fallback when account metadata is unavailable.
- Added pure codec/merge, state, controller, IRC client, bridge-wire, Settings,
  deterministic direct-WebSocket, scoped axe, and cross-browser/mobile tests.
  The first full matrix exposed a test locator that matched the mobile tab label
  but not the desktop tab's description-bearing accessible name. Anchored the
  locator to both accessible forms and reran the complete matrix.
- Final local gate passed strict ESLint, TypeScript, 97 files with 1,590 tests,
  production build, peer checks, whitespace/static validation, and all 40
  Playwright journeys across Chromium, Firefox, WebKit, Pixel 7, and iPhone 15.
  R1.4 is complete locally and not deployed.

### R2.1 media device and permission preflight

- Audited every media entry point, the state/engine seam, capture constraints,
  device/output support, WebAssembly loader, current room UI, and browser
  harness before choosing the implementation shape.
- Added one typed preflight controller for room joins, outgoing calls, incoming
  accepts, user-menu calls, and media slash commands. The engine cannot act
  until capture and codec construction both report ready.
- Added permission state, microphone/camera/speaker discovery, local-only saved
  device IDs, selected-device capture constraints, automatic default-device
  retry after disconnection, device-change refresh, and output routing.
- Added a retained local preview stream, live microphone meter, isolated cloned
  echo recording/playback, and cleanup/generation guards so cancelled or stale
  checks cannot leak tracks or overwrite a newer run.
- Added an accessible code-split Media Preflight dialog with camera preview,
  audio-only fallback, signal/codec cards, responsive device controls, exact
  recovery guidance, keyboard focus trapping, and confirmation disabled until
  the pre-join gate succeeds.
- Added a real CadenceVox/CadenceVis construction probe. The first Chromium
  journey exposed an invalid 320x180 probe, then the cross-engine run proved
  smaller CadenceVis profiles are not accepted consistently by the shipped
  binary. The final probe uses its verified 1280x720 call profile.
- Moved the CadenceVis resolution/fallback constructor into a pure shared module
  and reused it in Worker and main-thread video capture. This fixed the previous
  Safari/Firefox fallback path, which constructed the requested 1920x1080
  encoder directly even when the binary rejected that size.
- Preserved simultaneous capture and codec failures instead of letting one mask
  the other. Permission-denied and missing-codec journeys now explain both
  independent blockers before any room/call action.
- Added state and component regression coverage plus Playwright success,
  permission-denial, disconnected-device recovery, codec-unavailable, and
  scoped axe journeys. Axe found theme-dependent 4.48:1 labels and a low-
  contrast accent button; both were corrected.
- The first full 60-journey run exposed the old 30-second test ceiling under a
  warmed single-worker WebKit matrix. Eight otherwise healthy journeys timed
  out late in visible interactions. Raised only the journey-level ceiling to
  90 seconds while retaining narrow assertion timeouts; the rerun also exposed
  that the deterministic Onyx Server fixture did not answer keepalive `PING`, so it
  now replies with `PONG` instead of filtering the resulting timeout errors.
- Final local gate passed strict ESLint, TypeScript, 98 test files with 1,599
  tests, production build, dependency/shell/Node syntax checks, whitespace and
  terminology scans, and all 60 Playwright journeys across Chromium, Firefox,
  WebKit, Pixel 7, and iPhone 15.
- R2.1 is complete locally and not deployed.

### R2.2 call health and adaptive recovery

- Audited the native Kagura datagram path, peer registry, Worker and
  main-thread encoders, Onyx Server `MEDIA STATS`/`ABR` controls, bridge reconnect
  ownership, and the mounted call UI before changing state.
- Added a reorder-aware packet loss estimator with a fixed 128-packet bit
  window per stream and a 128-stream hard cap. Late packets repair observed
  gaps, duplicates do not inflate samples, u32 wraparound is handled, departed
  streams are removed, and teardown clears all lanes.
- Added one adaptive quality controller driven by Onyx Server bitrate guidance,
  loss, and encoder pressure. It requires consecutive bad samples, steps down
  one tier at a time, and uses a longer headroom hold plus recovery margins to
  step back up without oscillation.
- Measured video encode pressure in both the dedicated Worker and the
  Safari/Firefox main-thread fallback. Lower tiers now skip work before encode,
  rebuild at the shared tier profile, retain periodic recovery keyframes, and
  remain able to recover instead of permanently destroying video at the old
  audio-only threshold.
- Corrected jitter accounting to retain an arrival clock per peer rather than
  mixing interleaved participants into one timestamp. Aggregate jitter and all
  call-health metrics reset on teardown.
- Routed high-loss reports through Onyx Server's implemented `MEDIA ABR` command,
  consumed targeted ABR bitrate/keyframe guidance, and forced outbound recovery
  keyframes after loss and quality recovery.
- Split transient bridge state from intentional client detach. A short socket
  interruption keeps the existing capture, decoders, and peer registry alive,
  exposes a reconnecting state, then re-announces media and roster exactly once.
  A 20-second grace expiry or explicit bridge teardown still stops every track
  and clears every timer, key, router, and peer.
- Added typed call-health state, diagnostic bundle fields, a compact responsive
  inspector for loss/jitter/encode load/Onyx Server rate/tier, and explicit degraded
  and reconnecting announcements. The minimized call pill also retains a
  non-color-only health indicator.
- Added pure loss/reorder/bounds/hysteresis coverage, engine ABR and reconnect
  lifecycle tests, bridge transport tests, state/component tests, and a real
  five-project browser journey that injects Kagura sequence 100/102/101,
  checks loss repair, runs scoped axe, restarts Onyx Server, and proves one Alice
  peer tile and one media rejoin.
- The browser journey exposed CSP rejection of the inline data-URL AudioWorklet
  in Firefox and WebKit. Moved the live CadenceVox capture processor to a
  base-aware same-origin asset and added that asset to atomic release preflight
  and public verification.
- R2.2 is complete locally and not deployed.

### R2.3 verifiable encryption state

- Audited the existing DM envelope, peer-metadata, media-session, settings, and
  composer paths before changing trust state. The audit found that the old
  `e2eeReady` label meant only "our key was published," the composer silently
  fell back to relay plaintext after a failed encryption attempt, peer metadata
  overwrote keys without rotation state, and media fingerprints reported the
  local identity rather than the peer.
- Added a small typed IndexedDB trust repository keyed by Onyx Server endpoint,
  authenticated account, and lowercase peer. It persists the pinned public key,
  a full grouped SHA-256 fingerprint, and local verification time; pins remain
  device-local and survive bridge sessions without crossing accounts or nodes.
- Added reactive `unavailable`, `loading`, `unverified`, `verified`, and
  `changed` peer states. Query headers proactively request the published key and
  expose the current fingerprint/generation, prior trusted fingerprint, local
  verification time, remove-verification action, and explicit re-trust action.
- Added `opportunistic` and `verified` DM delivery policies. Verified-only sends
  fail closed until the current key is pinned. A changed verified key blocks in
  both policies, and a known-key seal failure never downgrades to plaintext.
  Blocked messages remain in the composer with an actionable safety error.
- Corrected media-session identity reporting to fingerprint the ingested peer
  key. The call-health inspector may show that observed key, but marks Audio E2EE
  unavailable until signalling and lifecycle work is complete; it also states
  that camera video and screen sharing are not end-to-end encrypted. If a 1:1 or
  room audio encryption context exists, encryption failures drop frames and
  surface an error instead of sending plaintext. Call teardown and peer departure
  clear the observed-session state.
- Added typed repository, rotation, re-trust, fail-closed composer, settings,
  media-state, call-UI, and peer-fingerprint tests. The real browser journey
  fetches a valid P-256 key through Onyx Server metadata, runs scoped axe, verifies
  and sends ciphertext, rotates the key, proves plaintext remains unsent, then
  re-trusts and resumes encrypted delivery across Chromium, Firefox, WebKit,
  Pixel 7, and iPhone 15.
- Browser testing exposed two integration issues: chat content could intercept
  the otherwise visible header dialog, and mobile navigation required opening
  the buffer sheet before selecting a query. The header stacking layer and
  responsive journey now cover both paths.
- Local gates pass strict ESLint, TypeScript, 102 test files with 1,630 tests,
  production build, and all 70 Playwright journeys across the five browser and
  mobile projects.
  R2.3 is complete locally and not deployed.

### R2.4 captions and call accessibility

- Audited Event Spine caption parsing, the bounded media transcript state,
  call UI, global shortcuts, local settings, and the existing archive Worker.
  The prior surface showed only the latest visual line, had no live-region
  semantics or transcript navigation/export, fixed presentation, and never
  applied the archive privacy policy to captions.
- Added an atomic polite live-caption status with explicit speaker labels and
  device-local small/medium/large plus high-contrast/translucent presentation.
  The same controls are available before a call in Messages settings and inside
  the active transcript panel.
- Added a responsive call transcript dialog with speaker/time-labelled rows,
  Arrow Up/Down and Home/End traversal, automatic latest-caption scrolling,
  focus entry/restore, an empty state, and an explicit current-call `.txt`
  export. Export filenames are normalized and caption newlines cannot forge
  additional speaker rows.
- Adapted Event Spine captions into a distinct `media:<scope>` archive record.
  Records are sent to the existing dedicated Worker only when Local Archive
  retention is enabled. The default remains off; existing retention, per-buffer
  delete, and global wipe logic applies without a parallel caption database.
- Completed the keyboard call contract: M/D/V/S/C/H cover mute, deafen, camera,
  screen share, transcript, and hangup; Escape closes the transcript before
  minimizing. Ringing calls no longer respond to live-call media shortcuts, and
  every control now has an explicit accessible name on compact/mobile layouts.
- Added pure transcript formatting/filename and caption-record tests, archive
  opt-in state coverage, settings normalization/UI coverage, transcript
  navigation/export tests, live-caption presentation tests, and call shortcut
  tests.
- The real browser journey enters an Onyx Server voice room, injects two Event Spine
  captions, verifies live-region and keyboard navigation, changes presentation,
  runs scoped axe, downloads and inspects the transcript, confirms two records
  in the Worker-owned IndexedDB archive, and exercises C/Escape/D/H across
  Chromium, Firefox, WebKit, Pixel 7, and iPhone 15.
- Local source gates pass strict ESLint, TypeScript, 104 test files with 1,644
  tests, production build, and the 75-journey browser set. A full-matrix
  Firefox setup race replaced the reactive preflight button during
  Playwright's stability wait; the caption journey now invokes the already
  enabled native action directly, and its isolated Firefox rerun passed. R2.4
  is complete locally and not deployed.

### R3.1 quiet hours and actionable notifications

- Audited the pure all/mentions/mute decision table, foreground Notification
  constructor path, Onyx Server Web Push registration, production cache-killer
  service worker, app click routing, settings persistence, and stable-name
  buffer preference stores. The existing tier model was sound, but alert
  delivery had no clock/DND layer and the service worker could only open the
  app.
- Added a pure notification policy with validated `HH:MM` clocks, system or
  explicit IANA time zones, same-day and overnight schedule handling, global
  pause deadlines, normalized targets, permanent target mutes, and expiring
  target mutes. Foreground notification and sound delivery now obeys the policy
  without changing the existing per-buffer tier.
- Added device-local scheduled quiet-hour controls and one-hour/eight-hour/
  until-tomorrow pause actions in Alerts settings. Invalid saved clocks and
  zones fall back safely; expired global pauses normalize away. These local
  schedule fields intentionally remain outside cross-device preference sync.
- Added a separate `db-temporary-mutes` stable-name store. One-hour, eight-hour,
  and until-tomorrow buffer mutes are available from the command palette; the
  sidebar exposes the temporary deadline with a clock state. Explicit tier
  changes clear the temporary layer, while preference export/import continues
  to sync only permanent all/mentions/mute choices.
- Upgraded foreground notifications to prefer service-worker delivery with
  open, mark-read, mute-one-hour, and reply actions. Strict action parsing,
  bounded newline-free reply text, case-insensitive pointer/full-name/short-name
  target resolution, and delayed non-sensitive intent handle both live and
  closed clients. Reply plaintext is never stored or encoded into an action
  URL.
- Persisted the notification policy in a dedicated service-worker IndexedDB
  record so disabled alerts, scheduled DND, global pauses, and permanent/
  temporary target mutes also suppress closed-tab Onyx Server push. The worker
  validates every policy update, fails closed for encrypted DM bodies, rejects
  cross-origin action URLs, and applies a one-hour target mute before opening
  the app. Inline reply metadata falls back to an ordinary open action where
  unsupported.
- Added timezone/policy, settings normalization/UI, temporary-mute, foreground
  decision, action routing, actionable Notification, and service-worker source
  contract tests. The connected browser journey configures the schedule, runs
  scoped axe, opens a notification target, marks it read, verifies the temporary
  mute in the command palette, and sends an inline reply through the real relay
  fixture across Chromium, Firefox, WebKit, Pixel 7, and iPhone 15.
- Local source gates pass strict ESLint, TypeScript, service-worker syntax, 107
  test files with 1,671 tests, production build, and the full 80-journey browser
  set. The long run passed 78; a Pixel browser target crashed before archive
  initialization and WebKit emitted two engine-internal resource errors after
  every caption assertion passed. Both exact journeys passed immediately in
  fresh isolated browser processes. R3.1 is complete locally and not deployed.

### R3.2 user-defined command actions

- Audited the existing command palette, relay input path, settings persistence,
  profile model, modal focus contract, and export redaction before adding an
  action layer. The implementation reuses those seams rather than introducing
  a second command transport or executable template language.
- Added a fixed typed registry for join, query, whois, message, notice, action,
  away, nick, and MONITOR add/delete. Each definition owns generated argument
  fields and strict target/channel/text normalization. Newlines, malformed
  targets, missing required values, and expansions over 2,048 characters fail
  before relay input; arbitrary raw commands, JavaScript, and shell are not
  representable.
- Added normalized device-local named actions with global or saved-profile
  scope, a 50-action hard cap, first-use confirmation state, import/export
  round-tripping, and credential-safe settings export. Endpoint matching uses
  the saved profile's host, port, and TLS values without copying credentials
  into action records.
- Added an Advanced settings editor and command-palette integration. The lazy
  runner generates only the selected command's fields, displays the exact IRC
  command for every run, requires an explicit first-use confirmation, retains
  the review surface afterward, and keeps transient argument values out of
  persisted settings.
- Added registry injection/bounds tests, settings normalization/export tests,
  state/profile/send tests, palette integration coverage, settings editor tests,
  and runner validation/confirmation tests. The connected browser journey
  creates a profile-scoped WHOIS action, rejects an injected target, runs scoped
  axe against settings and the runner, confirms the exact relay command, and
  verifies first-use and credential-safe persistence across Chromium, Firefox,
  WebKit, Pixel 7, and iPhone 15.
- Mobile Chromium's custom green theme exposed insufficient contrast in helper
  labels and the accent-filled primary button. The runner now uses theme-stable
  translucent white copy and a neutral high-contrast primary surface; the
  isolated repair and complete five-project journey pass.
- Local source gates pass strict ESLint, TypeScript, service-worker/deploy
  syntax, whitespace and retired-name scans, 110 test files with 1,685 tests,
  production build, and the five-project connected action journey. R3.2 is
  complete locally and not deployed.

### R3.3 operator incident workspace

- Audited the Event Spine parser and structured message rendering, the existing
  operator console, oper authority detection, console send paths, local bounded
  stores, diagnostics redaction, and Forget This Device flow. The console had a
  useful 50-line structured tail, but component-only subscription state, no
  severity-tag retention, no saved views/correlation/export/audit, immediate
  WARD and JUPE sends, and an unrestricted destructive raw-command path.
- Extended Event Spine parsing without collapsing protocol concepts: the wire
  domain and verb remain structured while Onyx Server's `onyx_server.io/category`
  subscription category and severity tags are retained separately. MEMBER
  events now identify channel and subject independently, enabling one nick to
  correlate across USER and MEMBER domains.
- Added a pure incident layer for category/severity/query filters, exact entity
  extraction, chronological nick/channel pivots, a 500-event cap, normalized
  severities, and structured JSON export. Export excludes raw lines and source
  servers and scrubs URLs, hostnames, IPv4/IPv6 addresses, userhosts, sensitive
  keyed attributes, password/token/key/session/account values, and long opaque
  material.
- Added device-local stores capped at 20 named filters and 200 newest-first
  client command audit entries. Loading validates untrusted JSON, names replace
  case-insensitively, commands are redacted before persistence, and Forget This
  Device clears both stores. No server traffic or general buffer text is copied
  into the audit.
- Rebuilt the operator console as a scrollable incident workspace with saved
  subscription/severity/query views, a correlated timeline, nick/userhost/
  channel pivot chips, redacted JSON download, and visible bounded audit. Every
  console send now enters the audit only after dispatch.
- KILL, WARD, JUPE, and destructive raw commands now stage one exact command,
  identify its target, and remain unsendable until the operator types that exact
  target. Ordinary diagnostic raw commands still send directly and are audited.
- Added parser, redaction/filter/export, persistence/bounds, UI correlation,
  ordinary/destructive raw, KILL, and WARD tests. The connected browser journey
  grants oper status, injects tagged cross-domain events, saves a view, pivots
  on Alice, runs scoped axe, confirms a KILL target, proves the redacted local
  audit, downloads and inspects JSON, and passes Chromium, Firefox, WebKit,
  Pixel 7, and iPhone 15.
- Browser accessibility exposed the old console's theme-mapped gray text under
  Retro. All operator copy and controls now use theme-stable high-contrast
  surfaces; the five-project axe journey passes.
- Local source gates pass strict ESLint, TypeScript, service-worker/deploy
  syntax, whitespace and retired-name scans, 113 test files with 1,693 tests,
  production build, and all 90 Playwright journeys across Chromium, Firefox,
  WebKit, Pixel 7, and iPhone 15. R3.3 is complete locally and not deployed.

### R3.4 upload queue

- Audited the existing one-shot upload helper, composer file and paste paths,
  settings endpoint, message send behavior, Forget This Device flow, and upload
  service response shapes. Uploads previously blocked the composer, had no
  queue/progress/cancellation/retry state, trusted arbitrary file types and
  response URLs, preserved image metadata, and inserted each returned URL
  immediately into the active draft.
- Added a typed upload policy with a 25 MiB cap and an explicit JPEG, PNG,
  WebP, MP4, WebM, common audio, PDF, plain-text, and ZIP allowlist. Empty,
  unknown, SVG, GIF, and oversized inputs fail visibly before transport;
  missing MIME values may use a known filename extension. Raster signatures
  are verified before upload.
- Added binary metadata removal for JPEG APP1/APP13/comment segments, PNG EXIF
  and ancillary text/time chunks, and WebP EXIF/XMP chunks plus container
  flags. Filenames are sanitized, service error and response bodies are
  bounded, unsafe configured/returned URL schemes are rejected, and JSON
  response expiry is normalized from absolute values or bounded TTL seconds.
- Replaced one-shot composer work with an in-memory queue capped at 20 items
  and two active transfers. Every item owns progress, attempts, cancellation,
  retry, result, and a stable destination buffer key. Queue work never disables
  ordinary chat, and reset aborts active XHRs and revokes preview object URLs.
- Added a responsive, keyboard-accessible queue surface. Only validated JPEG,
  PNG, and WebP files receive local blob previews; other files render as generic
  tiles. Items expose progress, destination, cancellation/retry/removal,
  metadata-removal confirmation, service expiry, and accepted/inserted state.
- Completed URLs are claimed exactly once and appended only to the original
  buffer draft after service acceptance. The queue never sends a result
  automatically, does not move it when the active buffer changes, and preserves
  unclaimed completions from bulk cleanup.
- Added transport policy, unsafe URL, bounded response, expiry, cancellation,
  filename, and JPEG/PNG/WebP sanitizer tests; queue concurrency/destination/
  retry/reset tests; and composer integration coverage. The connected browser
  journey rejects SVG, chats during a held upload, cancels it, retries a 503,
  proves EXIF is absent from multipart bytes, displays TTL expiry, runs scoped
  axe, and confirms accepted URLs enter the draft without relay delivery across
  Chromium, Firefox, WebKit, Pixel 7, and iPhone 15.
- The first expanded 95-journey matrix exposed two harness-level boundaries.
  Axe could sample Firefox's preflight modal during its 250 ms entrance fade,
  making every composited color appear falsely dim; the journey now waits for
  the real rendered opacity boundary, and the small preflight labels use a
  theme-stable accessible color. Long WebKit matrices also accumulated enough
  animated-scene compositor pressure to leave unrelated controls perpetually
  unstable, so WebKit projects exercise DarkBear's shipped reduced-motion path
  while desktop Chromium and Firefox retain normal-motion coverage.
- Mobile Chromium then exposed an environment failure after all entry-form
  assertions: the headless browser died natively with `BUS_ADRERR`/`SIGSEGV`
  while `/tmp` was a 79%-occupied tmpfs. No application error was present.
  Moving only Playwright's temporary profiles to disk passed five consecutive
  mobile entry runs and the complete matrix without deleting shared caches.
- Final local gates pass strict ESLint, TypeScript, service-worker/deploy
  syntax, whitespace and retired-name scans, 114 test files with 1,703 tests,
  production build, and all 95 Playwright journeys across Chromium, Firefox,
  WebKit, Pixel 7, and iPhone 15 in 16.2 minutes. R3.4 is complete locally and
  not deployed.

### R4.1 deploy-safe offline shell

- Audited the cache-killer worker, production-only registration, asset-version
  bootstrap, Vite output, atomic release/rollback script, public postflight,
  connection diagnostics, and current browser tests. Atomic cutover existed,
  but every version change unregistered all workers and deleted every cache;
  navigations had no offline path, old hashed assets vanished behind the moved
  `current` symlink, and browser reachability had no distinct UI state.
- Replaced global cache deletion with version-stamped `darkbear-release-*`
  caches. `scripts/stamp-release.mjs` walks one completed release, excludes
  `index.html`, `sw.js`, and robots metadata, and injects the exact version plus
  an explicit immutable asset list. Deploy verification now requires the
  worker stamp, offline files, and an HTML-free manifest before atomic cutover.
- The worker precaches only that release allowlist, preserves the current and
  three prior DarkBear caches, and leaves every unrelated cache untouched. A
  client announces its stamped version and also carries it in `dbv`, allowing
  old unique chunks and stable codec/font/worklet assets to resolve from the
  matching release through activation and rollback.
- Navigations are never read from or written to cache. They use a no-store
  network request and fall back on transport failure or a 5xx response to a
  standalone `offline.html`; no stale interactive SPA is served. Subresource
  interception is limited to same-origin stamped assets and hashed
  `/darkbear/assets/` paths. No dynamic response is written with `cache.put`,
  keeping APIs, uploads, archives, transcripts, drafts, decrypted messages,
  relay/media traffic, and user content outside Cache Storage.
- Added a responsive standalone offline document and external reconnect script
  with explicit privacy copy, visible waiting/restored status, keyboard focus,
  safe-area layout, reduced-motion handling, and automatic return to the current
  app after an online event. The loaded SPA now has a live offline banner and a
  separate relay-reconnecting banner with bounded attempt/delay detail and the
  existing manual retry path.
- The deploy identity bootstrap no longer unregisters workers, purges caches,
  or reloads via a timeout. It stamps the DOM/local storage and replaces only
  the `dbv` history value before entry assets execute. The changed inline bytes
  received a recomputed CSP SHA-256 allowlist entry, and a source contract now
  verifies both executable inline hashes.
- Added browser-connectivity state/component tests and worker contracts for
  ownership, navigation policy, retention, client-version selection, privacy,
  deploy stamping, and notification coexistence. A disposable production build
  stamped 41 immutable assets and passed worker syntax/manifest checks.
- The connected five-project journey seeds multiple old release caches, proves
  pruning and unrelated-cache preservation, resolves an old hashed asset,
  triggers real offline fallback in both Chromium projects, renders the shell
  in every engine, verifies no cached HTML or private UI, runs axe, and recovers
  on the online event. Firefox/WebKit projects use direct shell navigation for
  that one fallback assertion because Playwright's offline emulation blocks
  before their workers can answer; all other worker/cache behavior is exercised
  in those engines.
- Full local gates pass strict ESLint, TypeScript, deploy/worker/offline-script
  syntax, whitespace and retired-name scans, 116 test files with 1,711 tests,
  production build, and all 100 Playwright journeys across Chromium, Firefox,
  WebKit, Pixel 7, and iPhone 15 in 15.8 minutes. R4.1 is complete locally and
  not deployed.

### R4.2 installable desktop package

- Added a Tauri v2 package that consumes a dedicated relative-asset Vite build.
  The existing browser build retains its `/darkbear/` base and version-aware
  service worker; the installed shell skips worker registration and shares the
  browser protocol, state, archive, media, and UI implementation.
- Kept native authority local and explicit. The single bundled `main` window
  receives event, notification, deep-link, and custom credential-vault
  permissions only. No remote capability or broad shell, filesystem, HTTP,
  opener, process, SQL, store, updater, or upload plugin is present, and the
  native CSP limits IPC to the bundled app.
- Added a Rust credential boundary backed by the operating-system secret store.
  It accepts only `settings-v1` and `credentials-v1`, caps records at 64 KiB,
  moves blocking secret-store calls off the async IPC thread, and returns
  redacted errors. Desktop localStorage keeps connection metadata but never
  remembered relay/profile/Onyx Server passwords; non-remembered passwords and all
  bearer tokens remain session-only.
- Routed installed-shell notifications through the native notification plugin
  while retaining the encrypted-body fail-closed rule. Added restored window
  state, single-instance focus, and strict deep-link parsing for only
  `darkbear://open/buffer?target=...`; unknown or not-yet-hydrated buffers are
  resolved through the existing state path after relay hydration.
- Added source contracts and desktop-mode unit tests for relative assets,
  capability scope, CSP, deep links, vault hydration, storage isolation, and
  service-worker exclusion. A Rust test independently guards the fixed vault
  record allowlist.
- Added a Linux platform override selecting the reproducible Debian installer
  and an automated package verifier for control metadata, ELF payload, icons,
  desktop entry, and scheme-handler registration. `pnpm desktop:build --ci`
  emits `DarkBear_3.0.0_amd64.deb`; the optimized app also stays alive and
  exposes its 1280x800 DarkBear window under a virtual X display. R4.2 is
  complete locally and not deployed or published.
- Final R4.2 gates pass strict ESLint and TypeScript, 120 Vitest files with
  1,730 tests, Rust formatting/check/test, browser and desktop Vite production
  builds, the optimized Tauri build, Debian payload verification, whitespace,
  script syntax, and the retired-name scan. All 100 connected Playwright
  journeys pass across Chromium, Firefox, WebKit, Pixel 7, and iPhone 15 in
  19.6 minutes.

### R4.3 localization and international input

- Added a dependency-free typed locale layer with compile-time-complete English,
  German, and Arabic catalogs. The persisted `system | en | de | ar` preference
  is normalized through the settings repository; system selection resolves
  against `navigator.languages`, with a safe English fallback.
- Application startup applies the resolved root `lang` and `dir` together, and
  the settings UI switches locale live. Extracted core copy covers the relay and
  Onyx Server credential flow, app/mobile navigation, sidebar and user list, chat
  header/search/composer, threads, command palette actions, and preferences
  shell while retaining typed catalog completeness for every shipped locale.
- Centralized user-facing date, time, relative-time, and numeric formatting on
  the active locale across chat timestamps and separators, archives, uploads,
  calls, activity, channel/operator panels, settings, sidebar previews, and
  threads.
- Added Arabic structural mirroring for sidebar, message/thread/user rails,
  connection secret controls, search affordances, selection rails, and message
  highlights. Inputs, editable regions, and IRC message bodies use plaintext
  bidi isolation so LTR nicks, commands, links, and mixed-script text retain
  their intended order inside RTL chrome.
- Added one shared IME predicate covering `isComposing`, legacy key code 229,
  and `Process`. Global shortcuts, relay/Onyx Server/TOTP credentials, main and thread
  composers, message/user/sidebar search, command palette, modal focus handling,
  and mobile sheet keys now ignore composition-owned keyboard events.
- Added settings normalization/persistence, locale formatting, RTL source
  contract, and composition-focused component tests. A deterministic connected
  Arabic browser journey composes through every credential class and chat input,
  proves composing Enter/Escape/shortcuts cannot submit or steal focus, switches
  Arabic→German→Arabic live, checks horizontal fit, and runs a WCAG A/AA axe gate
  in Chromium, Firefox, WebKit, Pixel 7, and iPhone 15.
- The new connected axe gate exposed a nested-interactive sidebar row: the
  row's button semantics contained an independently operable notification-tier
  button. The selector and tier control are now sibling native buttons under a
  visual row wrapper, retaining full-row pointer/keyboard activation without
  hiding either control from assistive technology.

### R4.4 performance budgets

- Added a dependency-free capability profile that uses only coarse data-saver,
  effective-network, device-memory, and core-count hints. It stamps the root as
  `full` or `low`; low-tier clients keep protocol and application behavior while
  omitting scene/mascot modules and disabling repeated backdrop sampling.
- OS- and user-selected reduced motion now prevent scene construction instead
  of merely hiding some SMIL nodes. `ThemeBg` also marks direct renders with an
  explicit motion state that disables CSS animation. This fixed a real Chromium
  renderer crash found by the preference-sync journey when Onyx Server metadata
  changed Retro to Nord while also requesting reduced motion.
- Replaced the credential screen's full theme-scene construction with a bounded
  three-layer CSS field and static illustrated mascot. Main-workspace scenes
  remain lazy, and the connect overlay no longer duplicates the scene already
  behind it.
- Enabled Rollup's explicit-only manual chunks so shared Solid runtime stays in
  the entry graph instead of making the lazy theme library an initial
  modulepreload. `scripts/check-performance-budgets.mjs` enforces 155 KiB initial
  JS gzip, 30 KiB CSS gzip, 185 KiB combined, a 60 KiB lazy-theme cap, and the
  absence of theme scenes from the preload graph. The current measured graph is
  144.99 KiB JS, 25.43 KiB CSS, 170.41 KiB combined, and 33.96 KiB lazy scenes.
- Extended live-line batching from one synchronous relay frame to a bounded
  16 ms cross-frame window. A burst of adjacent WebSocket messages now produces
  one store write per buffer while per-line protocol, notification, typing, and
  operator side effects remain synchronous.
- Added project-scoped Chromium performance journeys. Desktop measures the
  animated connect scene against a same-page control. A 4x-throttled Pixel 7
  profile proves automatic low quality, drives 400 incoming messages, checks
  command-palette latency and burst settlement, samples frame pacing, joins a
  voice call, delivers 2,000 captions, asserts the 200-entry transcript bound,
  and enforces post-GC heap growth at or below 16 MiB.
- Strict lint and TypeScript, 125 Vitest files with 1,763 tests, browser and
  desktop production builds, and both dedicated performance journeys pass.
  The definitive 125-case five-profile browser matrix passed 117 journeys with
  eight intentional project-scoped skips in 21.9 minutes. No deploy or
  publication was performed.

### R5.1 Onyx Server authentication and session continuity

- Audited DarkBear's unchecked Onyx Server integration checklist against the current
  DarkBear client and Onyx Server daemon/docs. The audit found that the local/mesh
  `SESSION TOKEN` reclaim credentials were implemented, but the distinct
  account-bound SASL `SESSION-TOKEN` credential was being dropped.
- Added a strict parser for Onyx Server's TLS-only
  `NOTICE ... :SESSIONTOKEN <account> <sst_...> expires=<unix>` response. The
  token, canonical account, and server deadline stay in session storage and are
  independently aged out without affecting the password or logical-session
  reclaim tokens.
- The direct client now keeps visible nick and SASL authcid as separate
  identities, prefers `SESSION-TOKEN` over password replay, arms a newly issued
  token for the next reconnect, and falls back once to password/SCRAM after an
  explicit rejection. Rejection clears only the invalid SASL credential.
- Both welcome-time and late buffer mirroring now suppress client JOINs when
  `onyx/session-sync` is negotiated, leaving membership/history restoration to
  Onyx Server and avoiding duplicate JOIN/NAMES/replay work.
- Parser, credential, IRC-client, and bridge-controller tests cover storage,
  expiry, account identity, token-first authentication, fallback, and
  session-sync. The connected call-health journey proves PLAIN first login then
  SESSION-TOKEN reconnect in Chromium, Firefox, WebKit, Pixel 7, and iPhone 15.
- Corrected `docs/ONYX_SERVER_PROTOCOL.md`, which had previously conflated SASL
  `sst_...` credentials with `SESSION RESUME` tokens, and marked the audited
  source-backed integration contracts complete.

### R5.2 Onyx Server service reply feedback

- Added a pure, typed parser for Onyx Server service `FAIL`, `WARN`, and `NOTE`
  standard replies, including the NOTICE fallback used when the client lacks
  `standard-replies`, plus command-shaped `REGISTER SUCCESS` responses and the
  daemon's known account, channel, certificate, VHOST, TOTP, and TEGAMI notices.
- Recognition is deliberately narrow. Unrelated server notices, non-service
  standard replies, and `SESSIONTOKEN ... sst_...` bearer credentials are
  rejected before entering application state.
- Added a 24-entry session-only feedback store scoped by relay server. The
  Services panel renders the latest four replies with distinct success,
  warning, error, and informational treatments, and clears only the active
  server's history.
- Added parser, bounded-store, relay-line, component, and connected browser
  coverage. The new journey proves REGISTER error mapping, live TOTP feedback,
  cross-server isolation, clearing, and bearer-token non-display in Chromium,
  Firefox, WebKit, Pixel 7, and iPhone 15.
- Full source gates pass 126 Vitest files with 1,784 tests, strict TypeScript and
  ESLint, browser and desktop production builds, Rust `cargo check`, production
  asset budgets, and both runtime performance budgets. The browser suite now
  contains 130 cases: 122 intended journeys and eight project-scoped performance
  skips. Four timing rows sampled during severe shared-host contention all
  passed in fresh isolated browser processes; every intended journey has a
  green five-project or project-scoped result.
- The first release attempt failed closed before cutover when the stamp script
  double-encoded its precache JSON and the offline-shell manifest check rejected
  it. The stamp now preserves a safely escaped single-quoted JSON value; its
  focused contracts and a disposable 42-asset stamp pass. The subsequent atomic
  deploy activated `2026-07-16-192841-darkbear-00b824a`, and public stamp,
  service-worker/offline manifest, entry assets, lazy Services chunk, and live
  Playwright boot checks all pass.

### R5.3 Onyx Server service command hygiene

- Centralized every Services-panel `/quote` dispatch behind a 2,048-character
  bound and an ASCII control-byte guard. Client-side rejection records only a
  typed command/code/reason tuple, never the attempted line or credential.
- Memo textarea input now collapses line breaks, tabs, and other controls into
  one whitespace-normalized trailing parameter. Text that resembles `/quote`
  remains memo body data and cannot become another WeeChat relay command.
- REGISTER, IDENTIFY, ACCOUNTSET, GHOST, DROP, VERIFY, and TOTP secrets clear
  only after an open relay WebSocket accepts the serialized send. No-route,
  disconnected, closing, and synchronous send failures keep the input for retry.
  Password fields use `new-password` or
  `current-password`; verification/TOTP fields use `one-time-code`, with a
  numeric TOTP input mode.
- Updated Help copy to name Onyx Server's real account/channel/memo services rather
  than pseudo-client brands.
- Six component tests cover safe memo normalization, oversize rejection without
  reflection, successful credential clearing, no-route retention, and browser
  autocomplete hints. The expanded connected service journey passes Chromium,
  Firefox, WebKit, Pixel 7, and iPhone 15.
- Final local gates pass strict TypeScript/ESLint, 126 Vitest files with 1,787
  tests, browser and desktop builds, Rust `cargo check`, and asset budgets at
  146.90 KiB initial JS, 25.43 KiB CSS, 172.33 KiB combined, and 33.96 KiB lazy
  scenes. R5.3 is complete locally and is not in the active release.

### R5.4 Cross-tab alert ownership

- Added an ephemeral same-origin alert coordinator over `BroadcastChannel`.
  Peers exchange only a random tab ID and connected/focused booleans; message
  content, buffer names, identities, credentials, and settings never cross the
  coordination channel.
- The pure owner election ignores disconnected and stale peers, prefers a
  focused connected tab, and otherwise chooses one stable connected owner.
  Five-second heartbeats and a 15-second lease bound abandoned-tab state.
- Relay state changes make a tab eligible only while connected. A highlighted
  line now emits its foreground notification and sound only when the tab owns
  delivery. Environments without `BroadcastChannel` preserve local alerts.
- Four pure election tests cover stability, focus preference, inactive tabs,
  and lease expiry. The connection-pipeline test proves non-owner suppression
  for both notification and sound.
- Added a two-page connected Playwright journey. Both relay sessions receive
  the same highlighted line, while the browser records exactly one alert with
  the expected title and body. It passes Chromium, Firefox, WebKit, Pixel 7,
  and iPhone 15.
- Full local gates pass strict TypeScript/ESLint, 127 Vitest files with 1,792
  tests, browser and desktop builds, Rust `cargo check`, and asset budgets at
  147.72 KiB initial JS, 25.43 KiB CSS, 173.14 KiB combined, and 33.96 KiB lazy
  scenes. R5.4 is complete locally and is not in the active release.

### R5.5 Onyx Server services accessibility

- Added explicit accessible names to the shared Services input primitive, the
  memo textarea, and all three native selects. Shared action buttons now declare
  `type="button"`, preventing accidental form submission if the panel is later
  embedded in a form boundary.
- Raised the contrast of small section headings, reply-log controls, inactive
  tabs, helper text, and cancel actions. The original Retro values missed AA by
  as little as 0.02; the new roles clear the threshold without flattening the
  panel hierarchy.
- Extended the connected service-reply journey with axe audits for Account,
  Channel, and Memo. The helper waits on the overlay parent's Web Animations
  promise so Firefox cannot sample the deliberate 250 ms opacity entrance as a
  settled contrast state.
- The enhanced journey passes Chromium, Firefox, WebKit, Pixel 7, and iPhone 15;
  Firefox also passes twice consecutively in isolation. Six focused component
  tests and strict TypeScript/ESLint pass. R5.5 is complete locally and is not
  in the active release.

### R5.6 Localized Onyx Server services

- Added the complete services vocabulary to DarkBear's existing typed English,
  German, and Arabic catalogs. Account, channel, memo, confirmation, helper,
  local-validation, and accessible-name copy now react to the active locale;
  protocol verbs and wire bytes remain unchanged.
- Added component proof for German account controls and Arabic memo controls,
  including translated dialog/field names and the inherited RTL document root.
- Extended the connected Arabic localization/IME journey to establish Onyx Server
  detection, open the localized services panel, audit its Memo tab with axe,
  and retain the full-page axe check. All five desktop/mobile browser profiles
  pass.
- The newly reachable Onyx Server header state exposed a 20 px channel-info button
  and a sub-24 px topic expander to the WCAG 2.2 target-size gate. Both now use
  explicit non-submit buttons and at least 24 px target dimensions.
- Full local gates pass strict TypeScript/ESLint, 127 Vitest files with 1,793
  tests, browser and desktop builds, Rust `cargo check`, and asset budgets at
  150.39 KiB initial JS, 25.43 KiB CSS, 175.82 KiB combined, and 33.96 KiB lazy
  scenes. R5.6 is complete locally and is not in the active release.

### R5.7 Release-candidate hardening

- Audited the completed local roadmap train across direct bridge transport,
  server-origin trust, service-worker reply routing, remote image privacy,
  upload response bounds, settings portability, mobile Services reachability,
  relay send acknowledgement, and non-modal side-panel focus behavior.
- Made the direct Onyx Server bridge fail closed for every non-WSS production
  endpoint and every credential-bearing connection. Plain `ws://` remains
  available only to unauthenticated `localhost`, IPv4 loopback, or IPv6 loopback
  development endpoints with no URL userinfo. Removed generic `ws:` permission
  from the installed desktop shell's CSP and added transport/CSP regression
  coverage.
- Bound SASL `SESSIONTOKEN` capture to the exact server prefix authenticated on
  the current connection. A user-authored NOTICE cannot install a bearer token,
  and a stale or differently prefixed server cannot do so after reconnect.
  Relay-side service feedback likewise requires a server-authored source: merely
  placing a shaped NOTICE in the WeeChat server buffer is insufficient.
- Bound foreground service-worker notification replies to the exact DarkBear
  document that displayed them. Each document creates a random opaque scope,
  registers it with the worker over a `MessageChannel`, and receives an
  acknowledgement before reply-capable actions are exposed. The worker keeps a
  short-lived one-to-one scope/`WindowClient` binding in IndexedDB; missing,
  stale, ambiguous, or closed bindings fail closed to a clean `/darkbear/` open
  rather than selecting another tab. Server push has no authenticated document
  scope, so it exposes Open only and strips conversation/action metadata.
- Changed fresh and malformed inline-image preferences to fail closed while
  preserving explicit migrated booleans. Enabled image markup now declares
  `referrerpolicy="no-referrer"`. Unit and connected browser coverage prove the
  default makes no remote request and explicit opt-in enables exactly one image.
- Hardened upload transport before response parsing. Absolute upload endpoints
  containing URL username/password credentials are rejected. Fetch reads the
  response stream incrementally and cancels it above 64 KiB; Content-Length and
  XHR progress paths abort early under the same cap instead of buffering an
  unbounded server response.
- Extended settings portability redaction to remove the Tenor API key and strip
  upload URL userinfo, query parameters, and fragments while retaining only a
  valid HTTP(S) origin/path or a root-relative path. Import applies the same
  reduction, so a hostile portable file cannot reintroduce those values.
- Applied the same portable URL reduction to remote backgrounds and direct
  bridge endpoints. Backgrounds accept only safe HTTP(S)/root-relative paths;
  bridge endpoints accept WSS or credential-free loopback WS. Unsafe schemes,
  credentials, queries, fragments, and invalid values fail closed without
  mutating the live settings during export.
- Made remote profile avatars follow the existing inline-image privacy choice.
  The default renders nick initials without a request; explicit opt-in permits
  only validated HTTP(S) images with lazy loading and `no-referrer`, while the
  safe URL remains available as an explicit inert-or-linked profile field.
- Rebuilt the Services dialog's overflow boundary around a vertically scrollable
  mobile region with sticky tabs and no horizontal overflow. Account, Channel,
  and Memo now implement ARIA tablist/tabpanel relationships, roving tabindex,
  Home/End, wrapped arrows, and RTL-aware horizontal direction. Connected mobile
  coverage reaches the account danger controls and resets scroll position when
  a tab is selected.
- Propagated actual frame-acceptance booleans through the WeeChat relay and
  direct Onyx Server clients. Relay input additionally requires the authenticated
  `CONNECTED` state, so the open handshake socket cannot falsely acknowledge a
  user command. A missing, closing, or synchronously failing socket now leaves
  the action retryable instead of being treated as sent.
- Applied that acknowledgement contract to ordinary and encrypted composers,
  drafted upload URLs, thread replies, every Services field/confirmation,
  notification inline replies, operator raw/broadcast/destructive inputs, IRCX
  profile/property/access edits, safe user actions, and channel join/create
  state. Services records only a content-free `CLIENT_NOT_CONNECTED` failure;
  notification reply text returns to the originating composer; operator audit
  entries and optimistic relay echoes are created only after acceptance.
- Deferred local reaction updates until the direct TAGMSG is accepted. Account
  preference metadata remains `pending` and retries when any generation part,
  manifest, or stale-part clear loses the socket race. Completed upload URLs are
  marked inserted only after an accepted message actually contains them.
- Replaced live/history content-time dedupe with stable relay line-ID and IRC
  `msgid` indexes. Confirmed echoes still replace their exact optimistic
  placeholder, while legitimate repeated authored text and immediate retry text
  remain visible.
- Added a shared focus-isolation primitive to Activity and Thread overlays.
  Background siblings become inert, focus enters the close control, Tab and
  Shift+Tab remain trapped, Escape dismisses, and teardown restores the prior
  opener without leaving stale inert state.
- Focused unit, component, worker-runtime, wire, and connected Playwright checks
  cover the individual hardening contracts. Final local gates pass 128 Vitest
  files with 1,884 tests, strict TypeScript/ESLint, browser and desktop builds,
  Rust check, asset budgets, and the complete browser acceptance surface as 152
  journeys plus eight intentional project-scoped skips. Atomic activation then
  published `2026-07-16-230427-darkbear-00b824a`. The public HTML and worker
  carry that exact stamp, required entry/offline/WASM/worklet assets resolve,
  the independent Playwright boot smoke is clean, and `.deploy-previous`
  retains `2026-07-16-192841-darkbear-00b824a` for one-command rollback.

### R6.0 reproducible release provenance

- Audited the completed roadmap release and found that its timestamp plus short
  commit identified the checked-out revision but could not identify the exact
  uncommitted source or built bytes.
- Added a bounded provenance utility with deterministic, path-delimited SHA-256
  source and artifact digests. Source hashing includes only production build
  inputs and rejects symlinks or special files; artifact hashing excludes the
  three circular stamped/manifest files and covers the remaining release tree.
- Added a strict `darkbear.release-provenance/v1` manifest containing the full
  Git object ID, clean/dirty tree state, source and artifact digests, canonical
  UTC build time, and Node/pnpm/Vite versions. Exact-field validation rejects
  extensions, malformed hashes, unsafe versions, oversized JSON, and artifact
  tampering. The public document contains no paths, environment values,
  credentials, or host inventory.
- Reworked atomic release assembly to hash source before the build, hash it
  again afterward to reject mixed-source output, bind the release directory name
  to the tree state and artifact digest, write and locally verify `release.json`,
  and require an uncached byte-for-byte public manifest match before committing
  cutover. Rollback validates provenance-aware releases while remaining able to
  restore the currently retained legacy release.
- Added focused contract coverage for deterministic source ordering, production
  input sensitivity, test-file exclusion, stable artifact ordering, strict
  privacy/schema output, and artifact-tamper rejection. A disposable production
  assembly passed the same build, stamp, write, and verify sequence; deliberate
  artifact tampering failed verification.
- Focused provenance/service-worker contracts pass 18 tests. The complete source
  gate passes strict TypeScript and ESLint plus 129 Vitest files with 1,891
  tests. The 139-module production build and asset budgets pass at 152.77 KiB
  initial JS, 25.46 KiB CSS, 178.23 KiB combined, and 33.96 KiB lazy scenes.
- Atomically activated the first provenance-aware release as
  `2026-07-16-232251-darkbear-00b824a-dirty-90776f41bd5c`. Local and public
  manifests match byte-for-byte, the artifact digest independently recomputes as
  `90776f41bd5c567ea9e3e1b2c006f34c1055e11bcfd4869833f51e4c09eee650`,
  HTML and service-worker stamps match, the public asset checks pass, and the
  independent Playwright boot smoke is clean. The previous R5.7 release remains
  the rollback target.

### R6.1 indexed archive search at scale

- Audited the Worker-backed archive and confirmed every query walked the entire
  timestamp range until it found the bounded matches. Word tokens were rejected
  because DarkBear's established behavior is exact mid-word substring search.
- Upgraded the existing `darkbear-archive-v1` database in place to schema version
  2. The typed repository derives namespaced, hashed overlapping trigrams for raw
  message/sender text, normalized phrase text, and channel text. Each record is
  bounded to 256 unique index tokens; oversized records enter an explicit exact
  fallback lane, and short or filter-only queries keep the timestamp scan.
- Kept the exact compiled matcher as the final predicate, so hash collisions only
  add work and cannot change results. Indexed and fallback hits merge in stable
  timestamp/key order before the existing result limit.
- Added resumable v1 backfill metadata. Existing records are indexed in batches
  of 250 per transaction with a yield between batches; searches use the complete
  timestamp path until migration finishes. New writes receive keys immediately.
  Version-change connections close cleanly, and failed or blocked opens no longer
  permanently poison the repository instance.
- Added cancellable, FIFO Worker operations. Search accepts `AbortSignal`, query
  replacement sends immediate targeted cancellation, repository cursors stop
  cooperatively, and destructive operations cancel active scans before entering
  the queue. Malformed runtime messages receive `invalid-request`; message decode
  failure rejects pending work and allows Worker recreation. UI generation guards
  remain as a second stale-result defense.
- Focused coverage proves indexed/full-scan equivalence across raw mid-word,
  sender, channel, normalized phrase, filter, date, and short-query behavior;
  scarce-candidate scans inspect only the matching indexed record. It also covers
  stale upsert keys, oversized fallback, real v1 migration, FIFO ordering,
  cancellation, malformed requests, decode failure, and UI cleanup.
- Extended the real archive journey to seed a genuine v1 record before the
  Worker opens, upgrade it, find both the migrated and new records, verify no
  relay password/endpoint enters storage, and wipe everything when retention is
  disabled. It passes Chromium, Firefox, WebKit, Pixel 7, and iPhone 15.
- Full local release gates pass strict TypeScript and ESLint, 131 Vitest files
  with 1,903 tests, the 139-module production build, and asset budgets at 153.06
  KiB initial JS, 25.46 KiB CSS, 178.52 KiB combined, and 33.96 KiB lazy scenes.
- Atomically activated
  `2026-07-16-234133-darkbear-00b824a-dirty-0e6440bf7eaa`. Its public
  provenance matches byte-for-byte, artifact digest independently recomputes as
  `0e6440bf7eaa4df12d79785f5584c806154e5cae22863f86c36f8e94e1ef5fbe`,
  and the public archive Worker exactly matches the local artifact and contains
  both v2 index and cancellation contracts. HTML/worker stamps, assets, and the
  independent Playwright boot smoke pass; R6.0 remains the rollback target.
- Deferred custom-size retention and statistics aggregation: both still scan the
  complete archive, and logical `sizeBytes` does not include derived index
  overhead. Those gaps were deferred here and resolved by R6.2 below.

### R6.2 transactional archive accounting

- Added schema-v3 aggregate storage for total and per-buffer message/logical-byte
  counts. Upsert subtracts only an already-counted prior row, adds the replacement,
  and stores its accounting marker in one transaction. Buffer deletion, dated
  retention, custom retention, and wipe mutate messages and aggregates together.
- Added a resumable 250-row accounting backfill. Its cursor, per-record marker,
  total, and buffer deltas commit atomically; normal stats fall back to a full
  exact scan until completion. Ready stats read aggregate rows and resolve each
  buffer's current display name from its newest stored record, making the normal
  path proportional to buffers rather than messages.
- Changed custom caps to conservative estimated storage, including normalized
  text, record metadata, bounded search keys, and per-index-entry overhead while
  retaining logical bytes for the user-visible statistics. Under-budget policy
  checks open no message cursor. Over-budget archives delete a contiguous oldest
  prefix, producing the same newest suffix during and after migration.
- Replaced silent aggregate clamps with finite safe-integer validation and
  transaction-aborting underflow checks. Added coverage for aggregate upserts,
  buffer/date/custom/wipe changes, v1 migration, no-cursor under-budget checks,
  and newest-suffix trimming.
- Hardened the Worker client against structured-clone-valid malformed responses
  and stale error events emitted by a terminated Worker. Destructive-operation
  search cancellation no longer appears as an archive storage failure in the UI.
  Focused archive and MessageView coverage passes 53 tests, and the genuine v1
  upgrade/search/write/privacy/wipe journey passes Chromium against schema v3.
- Full release gates pass strict TypeScript and ESLint, 131 Vitest files with
  1,908 tests, the 139-module production build, and asset budgets at 153.19 KiB
  initial JS, 25.46 KiB CSS, 178.65 KiB combined, and 33.96 KiB lazy scenes.
- Atomically activated
  `2026-07-16-235449-darkbear-00b824a-dirty-7ed90eeebef3`. Public provenance
  matches byte-for-byte and artifact digest independently recomputes as
  `7ed90eeebef304addfedecc304458892a76975a0575854a2780eb9499ce970f5`.
  The public archive Worker exactly matches the local artifact and contains the
  schema-v3 aggregate, trigram-index, and cancellation contracts. HTML/worker
  stamps, assets, and the independent Playwright boot smoke pass; R6.1 remains
  the rollback target.

### Browser accessibility matrix

- Added `@axe-core/playwright` and an automated WCAG A/AA entry-surface gate.
- Expanded Playwright projects to desktop Chromium, Firefox, and WebKit plus
  Pixel 7 and iPhone 15 viewports.
- The first gate found disabled page zoom and insufficient selected-filter
  contrast; both were corrected. It also exposed dev-only service-worker reload
  races in Firefox/WebKit, so the production worker remains enabled while Vite
  development skips registration.
- The suite now contains 160 cases spanning accessibility, archive/search,
  captions, call health, connection/reconnection, DM key rotation, localization
  and IME, media preflight, notification focus, offline release fallback,
  operator incidents, preferences, upload/action safety, relay failures, and
  project-scoped performance budgets.
- The matrix covers 152 journeys with eight intentional project-scoped
  performance skips across the five projects. The R5.2 journey passes all five
  projects; four shared-host timing failures from the combined release run each
  pass in a fresh isolated process. Browser acceptance is verified locally.

### Current release state

- Repository default branch: `master`; the roadmap implementation, tests, and
  release documentation are intended to move together through review.
- Live nginx aliases point to the repository's `current/` release symlink.
- Active release: `2026-07-16-235449-darkbear-00b824a-dirty-7ed90eeebef3`.
- Retained rollback release:
  `2026-07-16-234133-darkbear-00b824a-dirty-0e6440bf7eaa`.
- Public URL: `https://eshmaki.me/darkbear/`, verified HTTP 200 and Playwright
  boot-clean after the final cutover.
- Every roadmap item from R0.1 through R6.2 is complete and present in the
  active release.
- R6.0 reproducible release provenance is verified locally and against the
  exact public `release.json` in the active release.
- R6.1 indexed archive search is complete locally and live, including the
  five-browser v1 migration journey and exact public archive Worker verification.
- R6.2 transactional archive accounting is complete locally and live, including
  exact public schema-v3 Worker verification.
- Stopping point: R6.2 is deployed and verified. The next session can address
  cross-tab archive cancellation and indexed candidate-visit budgets.
  Full per-call media E2EE remains disabled until its Onyx Server signalling, replay,
  ratchet, membership, and key-confirmation lifecycle is complete.
