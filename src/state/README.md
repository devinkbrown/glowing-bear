# DarkBear state layer — API reference

Module-level SolidJS singletons (`createStore`/`createSignal`) + exported action
functions. No classes, no context providers. Import everything from `@/state`
(the facade re-exports all modules plus `@/types`).

Conventions:

- `xxxState` exports are **read-only Solid store proxies** — reading them in JSX
  or `createMemo`/`createEffect` is reactive. Never mutate them; call actions.
- Signal exports (`connectionState`, `connectionError`, `lag`) and derived
  helpers (`isOper`, `getSorted`, …) are **accessor functions** — call them.
- All collections are plain objects (`Record`) / arrays, never `Map`/`Set`.
- Buffers are keyed by their WeeChat **pointer** (`buffer.id`), referred to as
  `pointer` below. Pin/mute/last-buffer persistence keys on
  `buffer.fullName || buffer.name`.

---

## `@/types` (re-exported from `@/state`)

| Export | Kind | Semantics |
|---|---|---|
| `ThemeId` | type | 19 theme ids: `darkbear midnight obsidian nord gruvbox rose-pine abyss ember aurora catppuccin tokyo-night dracula solarized starfield lightning phoenix retro light custom` |
| `LocalePreference` | type | `'system'\|'en'\|'de'\|'ar'`; system resolves from `navigator.languages`, with Arabic selecting RTL layout |
| `CustomColors` / `DEFAULT_CUSTOM_COLORS` | type/const | gray950…gray50 + accent hex values for the `custom` theme |
| `RelayProfile` | type | `{ name, relay: RelaySettings, rememberPassword }` saved connection profile; password is session-only unless explicitly remembered |
| `BridgeSettings` / `DEFAULT_BRIDGE` | type/const | `{ enabled:false, wsUrl:'', account:'', password:'', autoJoinMedia:false, e2eeDms:false, e2eePolicy:'opportunistic' }`; `wsUrl:''` = auto node probing |
| `AppSettings` / `DEFAULT_SETTINGS` | type/const | full settings shape; defaults include theme `'retro'`, locale `'system'`, inline images off, archive retention `'off'`, notification quiet hours disabled (`22:00`→`07:00`, system zone), no user-defined actions, archive cap 100 MiB, and timestamp format `'24h'` |
| `SafeCommandId` / `UserCommandAction` | types | fixed safe-command registry id and a normalized named action with global or saved-profile scope plus first-use confirmation state |
| `DEFAULT_RELAY` | const | `{ host:'eshmaki.me', port:9001, tls:true, password:'', compression:true }` |
| `TypingInfo` | type | `{ state:'active'\|'paused', expiry:number }` (ms epoch) |
| `Reaction` | type | `{ emoji, nicks: string[] }` |
| `NickTier` | type | `'Operator'\|'Founder'\|'Owner'\|'Admin'\|'Op'\|'Halfop'\|'Voice'\|'Regular'` |
| `BufferEntry` | type | per-buffer state: `buffer, lines[], lineIds{}, nicks{}, nickGroups{}, unread, highlighted, lastSeen?, loading, typing{}, reactions{}, msgIndex{}, modes[]` |
| `ModalType` | type | `'connect' 'settings' 'bufferSwitcher' 'help' 'about' 'channelInfo' 'userProfile' 'services' 'channelList' 'operConsole' \| null` |
| `SplitMode` | type | `'none'\|'horizontal'\|'vertical'` |
| protocol re-exports | type | `WeeChatBuffer WeeChatLine WeeChatNick HotlistEntry RelaySettings ConnectionState` from `@/lib/weechat/model` |

---

## `state/settings.ts`

Persisted to localStorage **`darkbear_settings_v2`** (debounced 500 ms).
On first load without v2 data, migrates `darkbear_settings_v1` (theme
`midnight`→`darkbear`, dead ZNC/irssi fields dropped). `bridge` is additive —
older saves load fine. Browser persistence includes a password only after its
explicit remember toggle is enabled. The installed desktop build always strips
relay, bridge, and profile passwords from localStorage; explicitly remembered
values live in the OS credential vault's fixed `settings-v1` record, while the
same-session fallback remains in sessionStorage.
Locale persistence accepts only `system`, `en`, `de`, or `ar`; unknown imported
values safely normalize to `system`. App startup applies the resolved locale to
the root `lang` and `dir` attributes together.
Remote inline images and profile avatars are opt-in: missing or malformed stored
values normalize to false, while an explicit migrated boolean remains
authoritative. Portable export and import remove passwords and API keys. Upload
and background URLs reduce to a valid HTTP(S) origin/path or root-relative path;
bridge URLs reduce to WSS or credential-free loopback WS. All portable URLs drop
userinfo, query, and fragment data, and unsafe/invalid values fail closed.

| Export | Semantics |
|---|---|
| `settings` | read-only `AppSettings` store |
| `updateSettings(partial)` | shallow-merge partial (nested objects replaced wholesale) + save |
| `updateRelay(partial)` | merge into `settings.relay` + save |
| `updateBridge(partial)` | merge into `settings.bridge` + save |
| `setTheme(theme)` | set theme, save, stamp `<html data-theme>` |
| `applyTheme()` | stamp `<html data-theme>` from stored theme (startup) |
| `setCustomColors(partial)` | merge into `settings.customColors` + save |
| `preferenceSettingsSnapshot()` / `applyPreferenceSettings(value)` | strict cross-device allowlist: theme, font/motion/read-marker accessibility, and global alert controls |
| `saveProfile(name, rememberPassword?)` | snapshot current relay settings as a profile (overwrites same name); password defaults to session-only |
| `deleteProfile(name)` | remove a profile |
| `loadProfile(name)` | copy a profile's relay settings into `settings.relay` |
| `resetSettings()` | back to defaults, persisted immediately |
| `loadSettings()` | re-read from localStorage |
| `saveSettings()` | flush to localStorage now (cancels debounce) |
| `hydrateDesktopSettingsSecrets()` | before bridge startup, merge the fixed OS-vault record into settings and migrate any legacy remembered desktop values without exposing secrets to localStorage |
| `exportSettings(): string` | pretty portable JSON with passwords/API keys removed and upload/bridge/background URL userinfo/query/fragment data stripped |
| `importSettings(json): boolean` | normalize + apply the same portability redaction; false on invalid JSON |

---

## `state/buffers.ts`

| Export | Semantics |
|---|---|
| `buffersState` | read-only store: `{ buffers: Record<pointer, BufferEntry>, activeBuffer: string\|null, pinnedBuffers{}, ignoredNicks{}, mutedBuffers{}, notifyModes{}, temporaryMutes{}, readMarkerPos{} }` |
| `NICK_TIER_ORDER` | `['Operator','Founder','Owner','Admin','Op','Halfop','Voice','Regular']` — `nickGroups` key insertion order matches |

Derived helpers (call as functions; reactive when used in tracked scopes):

| Export | Semantics |
|---|---|
| `getSorted()` | all entries sorted by buffer number, pinned first |
| `getTotalHighlights()` / `getTotalUnread()` | sums across buffers |
| `findByName(name)` | match `buffer.name` or `fullName` |
| `findByShortName(name)` | match `buffer.shortName` |
| `isPinned(pointer)` / `isMuted(pointer)` | persisted flags ('db-pinned' / 'db-muted') |
| `getNotifyMode(pointer)` | effective notification tier after persisted mute and per-buffer override precedence |
| `getTemporaryMuteUntil(pointer)` / `isTemporarilyMuted(pointer)` | device-local expiring mute state without changing the synced tier |
| `isIgnored(nick)` | lowercase lookup ('db-ignored') |
| `hasMode(pointer, mode)` | channel mode letter present |
| `nextHighlighted(forward=true)` | next/prev buffer pointer with highlights, wraps; null if none |

Actions:

| Export | Semantics |
|---|---|
| `upsertBuffer(b)` | create/replace entry; first buffer becomes active |
| `removeBuffer(pointer)` | delete; re-picks active if needed |
| `clearBuffers()` | wipe all buffers + active |
| `clearLines(pointer)` | wipe lines/ids/msgIndex + unread counters |
| `addLine(pointer, line, highlightWords)` | append one live line. Dedup uses only stable relay line IDs and IRC `msgid`; repeated authored text is retained. Confirmed echoes replace their exact `_opt_` optimistic placeholder. `highlightWords` (case-insensitive substrings) mark the line highlighted before insert. Bumps unread/highlighted when buffer inactive and `line.displayed`. Trims to 5000 lines (indexes rebuilt). Ignored nicks are suppressed. Accepted non-local records are queued to the archive Worker when archive retention is enabled. |
| `addLineBatch(pointer, lines, highlightWords)` | append a live burst with the same filtering, deduplication, highlight, unread, trim, and archive behavior as sequential `addLine` calls, using one reactive store write |
| `addLines(pointer, lines, prepend=false, preserveMsgid?)` | bulk insert (history); stable line-ID/`msgid` dedupe retains repeated text, trims to 5000, and rebuilds both indexes. A targeted deep-history fetch retains a centered 5000-line window around `preserveMsgid`; accepted records are queued to the enabled archive Worker. |
| `addLocalSystemLine(pointer, text)` | client-only notice line (`_sys_` id, tag `darkbear_system`, prefix `--`) |
| `setNicklist(pointer, nicks)` | replace nicklist, rebuild `nickGroups` |
| `addNick(pointer, nick)` / `removeNick(pointer, nickIdOrName)` / `updateNick(pointer, old, new)` | incremental nicklist edits, rebuild groups |
| `setActiveBuffer(pointer)` | activate + `clearUnread` + persist 'db-last-buffer' |
| `restoreLastBuffer()` | re-activate persisted last buffer if it exists |
| `clearUnread(pointer)` | zero counters, stamp `lastSeen` |
| `updateHotlist(items)` | map WeeChat hotlist → `unread = count[1]+count[2]+count[3]`, `highlighted = count[3]`; skips active buffer |
| `setLoading(pointer, bool)` | history-loading flag |
| `setReadMarker(pointer)` | `readMarkerPos[pointer] = lines.length` |
| `setTyping(pointer, nick, 'active'\|'paused'\|'done')` | active expires 30 s, paused 8 s, done removes |
| `pruneTyping(pointer)` | drop expired typing entries (poll from typing UI) |
| `addReaction(pointer, msgid, emoji, nick)` | dedup nick per emoji |
| `applyModeChange(pointer, '+nt-m')` | fold +/− letters into `entry.modes` |
| `togglePin(pointer)` / `toggleMute(pointer)` | persisted by full name |
| `setNotifyMode(pointer, mode)` / `cycleNotifyMode(pointer)` | set or advance the persisted `all` / `mentions` / `mute` notification tier |
| `muteTemporarily(pointer, durationMs)` / `clearTemporaryMute(pointer)` / `pruneTemporaryMutes()` | persist, clear, or prune an expiring device-local buffer mute |
| `notificationMuteSnapshot()` | full/short-name alias policy for closed-tab service-worker push suppression |
| `exportBufferPreferences()` / `applyBufferPreferences(value)` | stable-name replacement snapshot for pins, mutes, and notification tiers |
| `addIgnore(nick)` / `removeIgnore(nick)` | persisted lowercase |

---

## `state/connection.ts`

| Export | Semantics |
|---|---|
| `connectionState()` | signal: `ConnectionState` |
| `connectionError()` | signal: last error message or null |
| `lag()` | signal: ping RTT ms (15 s ping loop while connected) |
| `relayDiagnostics()` | redacted signal: lifecycle phase, transport/protocol/auth/compression capabilities, server version, handshake support, and bounded reconnect metadata |
| `currentNotificationConnectionScope()` | opaque binding used to accept actionable notification replies only for the current relay profile/session |
| `historyReceipt()` | latest history-response metadata `{ bufferPtr, returnedCount, nonce }`; contains no message content |
| `isOper()` / `isAdmin()` | true if oper/admin on any server (via 381 / 221 / self umode ±o,O,a,A; also scanned from server-buffer history) |
| `isOperBuffer(pointer)` / `isAdminBuffer(pointer)` | oper/admin on the server this buffer belongs to |
| `connect()` | tear down + create `WeeRelayClient` from `settings.relay`, wire all events, connect |
| `disconnect()` | full teardown: ping loop, listeners, client, oper state, buffers, ircx |
| `reconnect()` | force-drop socket and re-dial (or `connect()` if no client) |
| `sendInput(text, pointer?)` | route user input (default: active buffer) and return whether the action was handled or an authenticated open relay socket accepted it. Handles: `/clear` (local); media commands → `MediaCommandSink` (`/call /videocall` = video DM call, `/vcall /voicecall` = voice DM call, `/joinvoice /voice` = voice room, `/joinvideo /video` = video room, `/hangup /hup`) — without a sink, prints a local "requires the Orochi bridge" notice; IRCX commands on Orochi servers only (`/whisper /w`, `/prop`, `/access`, `/chaninfo`, `/profile`, `/services`, `/pushset`); `/monitor add\|del <nick>` anywhere. Accepted plain messages get an optimistic `_opt_` local echo; an accepted `/join` arms auto-switch. Rejected sends create neither state. Everything else goes to the relay. |
| `sendTo(pointer, text)` | raw input to a buffer via the relay; returns `true` only when the authenticated, open WebSocket accepted the serialized command |
| `requestHistory(count=100, pointer?)` | sets loading; requests existing+count lines so dedup nets `count` older lines |
| `requestHistoryTotal(total, pointer?)` | requests an absolute history total, independent of the bounded in-memory window; used by targeted archive/thread jumps |
| `requestNicklist(pointer)` | relay nicklist fetch |
| `setActive(pointer)` | `setActiveBuffer` + clear WeeChat hotlist (`/buffer set hotlist -1`) |
| `openQuery(nick)` | focus existing private buffer or `/query` and auto-switch when it opens (10 s window) |

Bridge seams:

| Export | Semantics |
|---|---|
| `MediaCommandSink` | `{ startCall(nick, video), joinRoom(channel, video), hangup() }` |
| `setMediaSink(sink \| null)` | install the bridge's media command sink |
| `RelayObserver` | `{ onChannelBufferOpened?(serverName, channel), onOrochiDetected?(serverName, wssGateway?) }` |
| `setRelayObserver(obs \| null)` | install the bridge's relay observer |

Observer timing: `onOrochiDetected` fires when a 004 names Orochi, or when the
004 server host is a known Orochi node (live line or server-buffer history
replay).
Immediately after detection, `onChannelBufferOpened` is replayed for every
channel buffer already open on that server; afterwards it fires for each new
channel buffer opened on a known Orochi server. Orochi detection also gates
the IRCX slash commands above.

Internal pipeline (for reference): lineAdded handles TAGMSG `+typing`/`+react`
(never rendered), IRCX numerics 801–825/915–919 plus LIST 322/323 and LISTX
812/817 → ircx store, `bot`/`account`
tags, 004 Orochi detection, oper detection, channel-mode tracking, typing
clear, `addLine`, highlight notifications (`notify` + optional sound, permanent
and temporary buffer mutes plus global/scheduled DND applied), and document-title
unread badges. Services feedback from a server buffer is parsed only when its
source is the configured server name or a dotted server host; user-authored
notices in that buffer cannot enter the feedback store.

---

## `state/connectivity.ts`

Browser reachability is deliberately separate from relay connection state: an
offline device, relay authentication error, and bounded relay reconnect are not
presented as the same failure.

| Export | Semantics |
|---|---|
| `browserOnline()` | reactive `navigator.onLine !== false` transport hint; accessor, not persisted |
| `setupBrowserConnectivity()` | synchronize the initial value, subscribe to browser `online`/`offline`, and return a complete listener cleanup |

`ConnectivityStatus` combines this signal with `connectionState()` and redacted
relay diagnostics. Offline takes precedence; an online relay reconnect exposes
attempt/delay detail and calls the existing `reconnect()` action.

---

## `state/notificationActions.ts`

Browser and service-worker notification actions enter through one allowlisted
message shape. Buffer pointers, full names, short names, and Orochi targets are
resolved case-insensitively; unresolved closed-tab actions wait in
`sessionStorage` until buffers hydrate. Inline reply plaintext is never queued.
A foreground document receives reply actions only after its random opaque scope
is acknowledged and bound by the service worker to that exact `WindowClient`.
Reply plaintext is posted only to that live, unexpired document;
missing/ambiguous scopes and closed documents open a clean `/darkbear/` URL.
Unscoped server push is Open-only and carries no conversation/action metadata.
If the exact recipient's relay rejects the reply, the text is restored to that
conversation's normal composer draft.

| Export | Semantics |
|---|---|
| `applyNotificationAction(value)` | execute open, mark-read, one-hour mute, or bounded reply against a resolved buffer |
| `queueNotificationAction(value)` / `flushPendingNotificationAction()` | retain and retry only non-sensitive unresolved action intent |
| `notificationActionFromUrl(url)` / `clearNotificationActionUrl()` | consume the service worker's closed-client query contract and remove it from browser history |

---

## `state/userActions.ts`

User-defined palette actions select only from the typed registry in
`lib/userActions.ts`; persisted data never supplies executable templates.
Actions are visible only when their global or saved-profile scope matches the
active relay endpoint. The runner expands validated, newline-free arguments to
one bounded IRC command and records first-use confirmation only after socket
acceptance; rejection leaves the reviewed action open for retry.

| Export | Semantics |
|---|---|
| `visibleUserActions()` | normalized actions valid for the current relay profile |
| `createUserAction(input)` / `deleteUserAction(id)` / `clearUserActions()` | maintain the capped device-local action list |
| `beginUserAction(id)` / `closeUserAction()` / `activeUserAction()` | own the reviewed runner selection without storing argument values |
| `runUserAction(id, values)` | expand through the fixed safe registry, send the exact command, and mark first use confirmed |

---

## `state/threads.ts`

Reply and thread state stays separate from message ownership: the buffer
timeline remains canonical, and thread views are derived from loaded
`msgid`/reply-parent links.

| Export | Semantics |
|---|---|
| `threadsState` | read-only store: pending composer replies, reply previews, read markers, scroll intent, optional stable thread selection, and per-thread read-through timestamps |
| `resolveThreadRoot(line, msgIndex)` | walks loaded ancestors; returns the oldest loaded or first missing ancestor msgid |
| `buildThreadView(lines, rootMsgid)` | derives root, transitive chronological replies, unique participants, and latest timestamp from canonical lines |
| `threadUnreadCount(view, readThrough)` | counts non-self replies newer than the thread's read-through timestamp |
| `openThread(pointer, bufferKey, rootMsgid)` / `closeThread()` | open/close the optional reconnect-safe thread panel selection |
| `markThreadRead(bufferKey, rootMsgid, timestamp)` / `threadReadThroughFor(...)` | monotonic local unread state keyed by stable buffer name + root msgid |
| `setPendingReply` / `clearPendingReply` / `pendingReplyFor` | per-buffer composer reply target |
| `recordLinePreview` / `replyPreviewFor` | bounded plain-text parent previews for reply indicators |
| `requestScrollToMessage` / `consumeScrollRequest` | nonce-based one-shot timeline jump intent |
| `exportReadState()` / `applyReadState(value)` | stable-name read positions; apply is monotonic and cannot rewind a marker |

`ThreadPanel` resolves a changed buffer pointer by stable name after reconnect,
loads missing ancestors through bounded absolute history requests, rebases when
a fetched parent belongs to an older root, and sends root-scoped ordinary
Orochi messages through `+draft/reply` when the direct bridge is available.
While open it behaves as a modal overlay: sibling app regions are inert, focus
is trapped inside, Escape closes it, and teardown restores the opener.
Its composer clears only when either the direct reply TAGMSG path or relay
fallback accepts the frame; otherwise the draft remains in place for retry.

---

## `state/activity.ts`

| Export | Semantics |
|---|---|
| `activityState` | private local saved messages, bounded activity items, active tab, and panel visibility |
| `sourceFromLine(entry, line)` | stable, sanitized message-source projection with no credentials/endpoints |
| `toggleSavedMessage` / `isMessageSaved` | add/remove a stable local bookmark; UI gates this on archive opt-in |
| `updateSavedNote` / `removeSavedMessage` | edit the bounded plain-text note or remove one bookmark |
| `syncSavedRetention` / `removeSavedForBuffer` / `clearSavedMessages` | keep bookmark data inside archive retention/delete/wipe boundaries |
| `recordLineActivity` | classify non-self displayed replies, DMs, mentions, and explicit operator alerts |
| `recordCallActivity` | record bounded Orochi call lifecycle events |
| `activityUnreadCount` / `markActivityRead` / `clearActivity` | inbox unread and clearing semantics independent of buffer counters |
| `openActivityPanel` / `closeActivityPanel` / `setActivityTab` | responsive activity/saved panel state (`Alt+A` opens it) |

`ActivityPanel` uses the same modal focus-isolation contract as `ThreadPanel`:
background siblings are inert, Tab cannot escape, Escape dismisses, and focus
returns to the prior opener.

---

## `state/operatorIncidents.ts`

Device-local operator workflow state. Saved Event Spine views contain only a
name, categories, severity threshold expansion, and bounded query. The client
audit records commands issued from the operator workspace after redaction; it
does not capture server traffic or arbitrary buffer messages. The pure
filter/correlation/export layer lives in `lib/operatorIncident.ts`.

| Export | Semantics |
|---|---|
| `operatorIncidentState` | up to 20 normalized saved filters and 200 newest-first redacted client command audit entries |
| `saveIncidentFilter(input)` / `deleteIncidentFilter(id)` / `clearIncidentFilters()` | replace filters by case-insensitive name, delete, or clear the local view list |
| `recordOperatorCommand(input)` | redact and retain one command only after its frame is accepted by the relay socket, including target and destructive classification |
| `clearOperatorAudit()` / `resetOperatorIncidents()` | clear audit alone or both incident stores; Forget This Device uses the full reset |

`parseEventFeedText` retains `subscription` from
`orochi.io/category` separately from the Event Spine wire `category`, and
retains the normalized severity tag. Incident export never includes the parser's
raw line or source server.
The console keeps rejected raw, broadcast, and destructive-action inputs,
restores rejected category/severity controls to their last acknowledged state,
and never records an audit entry for a frame the relay socket did not accept.

---

## `state/uploads.ts`

Ephemeral upload work is kept out of persisted settings and message history.
Every item retains the stable destination buffer name captured when it was
queued; switching buffers cannot move a completed URL into the wrong draft.
The typed policy, metadata sanitizers, response validation, and XHR transport
live in `lib/upload/upload.ts`. Absolute upload endpoints with URL credentials
are rejected. Fetch streams and XHR progress enforce the 64 KiB response cap
while bytes arrive and cancel immediately on overflow.

| Export | Semantics |
|---|---|
| `uploadQueueState` | reactive in-memory queue of file, destination, status, progress, accepted result, attempt count, insertion claim, and optional safe raster preview |
| `MAX_UPLOAD_QUEUE` / `MAX_CONCURRENT_UPLOADS` | hard caps of 20 retained items and two active network transfers |
| `enqueueUploads(files, bufferKey)` | validate each file, create only JPEG/PNG/WebP blob previews, retain policy failures visibly, and pump accepted work |
| `cancelUpload(id)` / `retryUpload(id)` | abort active XHR or cancel queued work; revalidate before retrying a failed/cancelled item |
| `completedUploadsForBuffer(bufferKey)` / `markUploadDrafted(id)` / `markUploadInserted(id)` | expose accepted URLs only to their original draft; distinguish a URL claimed by the composer from a containing message accepted by relay/direct transport, so rejection retains draft and retry ownership |
| `removeUpload(id)` / `clearFinishedUploads()` | explicitly discard one item, or clear inserted completions and cancellations while preserving unclaimed results and errors |
| `resetUploads()` | abort all transfers, revoke all preview object URLs, and clear the queue; Forget This Device invokes it |

---

## `state/preferenceSync.ts`

Authenticated direct sessions use the negotiated Orochi `draft/metadata-2`
capability for account-scoped non-secret preference sync. The wire codec lives
in `lib/preferences/sync.ts`: five independently stamped families merge by a
Lamport revision, timestamp, and stable WebCrypto-generated device ID. Read
positions also merge by maximum. The 512-byte metadata-value limit is enforced
with generation-tagged parts and a manifest written last; incomplete snapshots
are never applied.

| Export | Semantics |
|---|---|
| `preferenceSyncState` | reactive availability, `local-only/checking/pending/synced/error` status, detail, and last-sync time |
| `syncPreferencesNow()` | request a complete account metadata LIST when authenticated and capable |
| `forgetPreferenceSyncDevice()` | remove only this browser's device ID and cached sync document; account data remains |
| `initPreferenceSync()` | install local-change capture; called once by `core/bridge.ts` |
| `_setPreferenceSyncTransport` / `_preferenceTransport*` / `_collect*` / `_finish*` | internal bridge-controller transport and LIST reassembly seams |

Passwords, endpoints, custom CSS, archives, message text, keys/tokens, and media
device choices do not exist in the sync schema. Credential-free settings
export/import remains available when the capability or account login is absent.
Publishing checks socket-enqueue acceptance entry by entry. If any generation
part, manifest, or stale-part clear is rejected, status remains `pending`, local
settings stay authoritative, and the complete document is scheduled for retry.

---

## `state/ircx.ts`

| Export | Semantics |
|---|---|
| `ircxState` | read-only store: `orochiServers{}, channelProps{chan:{KEY:val}}, userProfiles{nick}, accessLists{chan:[]}, botNicks{}, accountMap{}, pendingPropTarget/Entries, pendingAccessChannel/Entries, channelInfoTarget, userProfileTarget, servicesPanel, monitorList{}, channelList{}` |
| `markOrochi(serverName)` | flag a server as Orochi |
| `isOrochiServer(serverName?)` | lookup |
| `isActiveOrochi()` | active buffer's server is Orochi |
| `requestProps(target)` | arm pending list + `PROP <target> *` |
| `setProp(target, key, value)` | acknowledged `PROP <target> <key> :<value>`; returns false when the relay does not accept it |
| `addPropEntry(entry)` / `finishPropList(target)` | pending assembly → `channelProps` (targets `#`/`&`) or `userProfiles` (URL GENDER PICTURE LOCATION BIO REALNAME EMAIL NO-VIDEO) |
| `clearPropRequest()` | drop pending PROP state |
| `requestAccess(channel)` | arm pending list + `ACCESS <chan> LIST` |
| `addAccessEntry(entry)` / `finishAccessList(channel)` | pending assembly → `accessLists` |
| `clearAccessRequest()` | drop pending ACCESS state |
| `addAccess(chan, level, mask, reason?)` / `removeAccess(chan, level, mask)` | acknowledged ACCESS ADD/DELETE, re-list after 500 ms only after acceptance |
| `requestChannelList({ pattern?, minUsers?, maxUsers?, extended? })` | arm channel browser + raw `LIST` or Orochi `LISTX` |
| `addChannelListRow(row)` / `finishChannelList()` / `clearChannelList()` | numeric `322/812` assembly → `ircxState.channelList` |
| `markBot(nick)` / `unmarkBot(nick)` / `isBot(nick)` | lowercase bot registry |
| `setAccount(nick, account)` / `getAccount(nick)` | `'*'`/`''` clears (logout) |
| `openChannelInfo(chan)` / `closeChannelInfo()` | channel info panel target |
| `openUserProfile(nick)` / `closeUserProfile()` | profile panel target (auto `requestProps`) |
| `openServicesPanel('nick'\|'chan'\|'memo')` / `closeServicesPanel()` | services panel |
| `sendAccount(cmd)` / `sendChannel(cmd)` / `sendMemo(cmd)` | acknowledged Orochi service verbs `ACCOUNT/CHANNEL/MEMO <cmd>` |
| `sendWhisper(chan, nick, msg)` | `WHISPER <chan> <nick> :<msg>` |
| `monitorAdd(nick)` / `monitorRemove(nick)` | track + `MONITOR +/- <nick>` |
| `sendPushSet(key, value)` | `PUSHSET <key> <value>` |
| `clearIrcx()` | reset everything (called on disconnect) |

All raw sends go to the active buffer's **server buffer** via `/quote`. The
Services UI treats dispatch as successful only when `connection.sendTo()` proves
that an open relay WebSocket accepted the serialized command; otherwise it keeps
the user's input and records a content-free local retry error.
Profile/property and access-list editors likewise remain open with their values
intact on rejection; request collectors and post-write refreshes are armed only
after the corresponding IRCX frame is accepted.

---

## `state/completion.ts`

| Export | Semantics |
|---|---|
| `completionState` | read-only store: `{ active, candidates[], index, prefix, suffix }` |
| `COMMANDS` | slash-command list offered to completion |
| `complete(input, cursorPos, bufferPointer)` | start completion on the word before the cursor; `/`-words → commands, otherwise buffer nicks (and `#`/`&` channel short names); returns new input (nick at start of line gets `: ` suffix) or input unchanged |
| `cycleCompletion(forward)` | step through candidates; returns new input, `''` if inactive |
| `resetCompletion()` | clear (call when the user edits/moves) |

---

## `state/ui.ts`

| Export | Semantics |
|---|---|
| `uiState` | read-only store: `{ activeModal ('connect' initial), sidebarOpen, userListOpen, operConsoleOpen, splitMode, splitBuffer, searchOpen }` |
| `openModal(modal)` / `closeModal()` | set/clear `activeModal` |
| `toggleSidebar()` / `setSidebarOpen(bool)` | sidebar |
| `toggleUserList()` / `setUserListOpen(bool)` | user list |
| `toggleOperConsole()` / `setOperConsoleOpen(bool)` | oper console panel |
| `setSplitMode('none'\|'horizontal'\|'vertical')` | split pane mode (rendered by components) |
| `setSplitBuffer(pointer \| null)` | buffer shown in the split pane |
| `toggleSearch()` / `setSearchOpen(bool)` | search bar |

---

## `state/bridge.ts`

Status + UI API of the **Orochi bridge** — the persistent direct WSS session to
the Orochi server (typing/reactions, read-marker sync, E2EE DMs). The socket
lifecycle lives in `src/core/bridge.ts` (`initBridge()` — App calls it once);
it installs itself here through the `BridgeBackend` seam. Activation:
`settings.bridge.enabled` AND (Orochi detected on the relay OR
`settings.bridge.wsUrl` / `VITE_IRC_WS` pinned).

Production and credential-bearing endpoints require `wss://`; unauthenticated
plain `ws://` is accepted only for loopback development. The installed desktop
CSP likewise permits WSS but not generic WS. Fresh `SESSIONTOKEN` notices are
stored only when their prefix exactly matches the server authenticated by the
current SASL exchange.

| Export | Semantics |
|---|---|
| `bridgeState` | read-only store: `{ status: 'off'\|'connecting'\|'ready'\|'error', nick: string\|null, error: string\|null, e2eeReady: boolean }` |
| `sendTyping(bufferPtr, 'active'\|'paused'\|'done')` | `@+typing` TAGMSG to the buffer's mapped Orochi target; no-op when bridge not ready |
| `sendReactionTag(bufferPtr, msgid, emoji)` | acknowledged `@+draft/react;+draft/reply` TAGMSG; local `addReaction` occurs only after socket acceptance, so rejection cannot create a false optimistic reaction |
| `markRead(bufferPtr)` | `MARKREAD <target> timestamp=<ISO>` — cross-device read sync; call on buffer activation |
| `canE2ee(nick)` | true when the peer's `ocean.dm-key` is cached (reactive) |
| `dmSecurityFor(nick)` | reactive peer state: unavailable/loading/unverified/verified/changed plus current and pinned fingerprints |
| `refreshPeerDmKey(nick)` | request the peer's current device key through Orochi metadata |
| `verifyPeerDmKey(nick)` / `forgetPeerDmTrust(nick)` | pin/re-trust or remove the endpoint/account-scoped local verification |
| `sendE2eeDm(nick, text): Promise<boolean>` | seal (Tsumugi envelope) + PRIVMSG via the bridge; false when impossible (kicks off a key fetch) |
| `decryptedFor(msgid, text)` | plaintext overlay for a line (by msgid, then exact ciphertext); reactive — unknown envelopes get a one-shot background decrypt against known keys |
| `bridgeRun(action)` | run once the bridge is ready (connect-on-demand; settings notice when disabled) |
| `BridgeBackend` / `_setBridgeBackend` / `_set*` | internal controller seams — `src/core/bridge.ts` only |

`BridgeSettings` includes `e2eeDms: boolean` (default false) and
`e2eePolicy: 'opportunistic'|'verified'`. A changed verified key always blocks;
the verified policy also requires a current local pin before delivery.

---

## `state/media.ts`

Voice/video call state + actions wrapping the Suimyaku media engine. The
engine mounts here; the bridge controller attaches its IRCClient
(`_attachBridgeClient`). Actions connect the bridge on demand via `bridgeRun`.

| Export | Semantics |
|---|---|
| `CallState` | `'idle'\|'ringing_in'\|'ringing_out'\|'connecting'\|'in_call'` |
| `MediaPeer` | `{ nick, hasVideo, speaking, muted, audioLevel }` |
| `MediaTranscriptEntry` | Event Spine caption/transcript item: `{ channel, nick, text, time }` |
| `mediaState` | read-only store: call/peer fields plus preflight, call health, observed-only `observedAudioKeys`, bounded caption `transcripts`, latest live caption, and transcript-panel state |
| `requestRoomJoin(channel, video)` / `requestStartCall(nick, video)` / `requestAcceptCall()` | open the required permission/device/codec gate for every user-facing call entry |
| `runMediaPreflight()` / `confirmMediaPreflight()` / `closeMediaPreflight()` | rerun, commit, or cancel the pre-call gate; confirmation is rejected until capture and codecs are ready |
| `refreshMediaDevices()` / `selectMediaDevice(kind, id)` | refresh hardware and persist local-only device choices; missing selections fall back to system defaults |
| `runMediaEchoTest()` / `mediaPreflightPreviewStream()` | isolated local echo playback and camera preview stream |
| `joinRoom(channel, video)` / `leaveRoom()` | channel voice/video room |
| `startCall(nick, video)` / `acceptCall()` / `rejectCall()` / `hangup()` | 1:1 calls (incoming ring → `ringing_in` + ringtone) |
| `toggleMute()` / `toggleDeafen()` / `toggleCamera()` / `toggleScreenShare()` | self controls |
| `setTranscriptOpen(bool)` | open/close the keyboard-navigable active-call transcript; minimizing or teardown closes it |
| `setMinimized(v)` / `setSpotlight(nick)` | overlay UI state |
| `sendRoomReaction(emoji)` | MEDIA REACT broadcast to the active room |
| `peerStream(nick)` | MediaStream for a peer tile (screen stream or cached canvas `captureStream`) |
| `selfPreviewStream()` | local camera/screen preview stream, or null |
| `_attachBridgeClient` / `_setMediaTransportConnected` / `_setMediaAvailable` / `_ensureMediaEngine` | internal — bridge controller only; transient transport loss is separate from intentional engine detach |

**Facade note:** media's `toggleMute()` collides with buffers'
`toggleMute(pointer)`, so `@/state` re-exports it as **`toggleMicMute`**;
import from `@/state/media` directly for the exact contract names.

Event Spine captions are always bounded in memory for the active call. They are
adapted into the existing Worker-backed archive only when
`settings.archiveRetention !== 'off'`; the default stores nothing, and the
existing per-buffer delete/global wipe operations own persisted caption data.
`captionSize` and `captionBackground` remain local device presentation settings.

---

## `state/index.ts`

Re-exports everything above plus `@/types` (media by explicit name — see the
facade note), and:

| Export | Semantics |
|---|---|
| `connectAll()` | `applyTheme()` + `connect()` — App startup |
| `disconnectAll()` | `disconnect()` — full teardown |
