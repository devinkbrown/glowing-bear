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
| `CustomColors` / `DEFAULT_CUSTOM_COLORS` | type/const | gray950…gray50 + accent hex values for the `custom` theme |
| `RelayProfile` | type | `{ name, relay: RelaySettings }` saved connection profile |
| `BridgeSettings` / `DEFAULT_BRIDGE` | type/const | `{ enabled:false, wsUrl:'', account:'', password:'', autoJoinMedia:false }`; `wsUrl:''` = auto node probing |
| `AppSettings` / `DEFAULT_SETTINGS` | type/const | full settings shape; defaults: theme `'retro'`, uploadUrl `'https://eshmaki.me/upload'`, tenorApiKey set, timestampFormat `'24h'`, etc. |
| `DEFAULT_RELAY` | const | `{ host:'eshmaki.me', port:9001, tls:true, password:'', compression:true }` |
| `TypingInfo` | type | `{ state:'active'\|'paused', expiry:number }` (ms epoch) |
| `Reaction` | type | `{ emoji, nicks: string[] }` |
| `NickTier` | type | `'Owner'\|'Admin'\|'Op'\|'Halfop'\|'Voice'\|'Regular'` |
| `BufferEntry` | type | per-buffer state: `buffer, lines[], lineIds{}, nicks{}, nickGroups{}, unread, highlighted, lastSeen?, loading, typing{}, reactions{}, msgIndex{}, modes[]` |
| `ModalType` | type | `'connect' 'settings' 'bufferSwitcher' 'help' 'about' 'channelInfo' 'userProfile' 'services' 'channelList' 'operConsole' \| null` |
| `SplitMode` | type | `'none'\|'horizontal'\|'vertical'` |
| protocol re-exports | type | `WeeChatBuffer WeeChatLine WeeChatNick HotlistEntry RelaySettings ConnectionState` from `@/lib/weechat/model` |

---

## `state/settings.ts`

Persisted to localStorage **`darkbear_settings_v2`** (debounced 500 ms).
On first load without v2 data, migrates `darkbear_settings_v1` (theme
`midnight`→`darkbear`, dead ZNC/irssi fields dropped). `bridge` is additive —
older saves load fine.

| Export | Semantics |
|---|---|
| `settings` | read-only `AppSettings` store |
| `updateSettings(partial)` | shallow-merge partial (nested objects replaced wholesale) + save |
| `updateRelay(partial)` | merge into `settings.relay` + save |
| `updateBridge(partial)` | merge into `settings.bridge` + save |
| `setTheme(theme)` | set theme, save, stamp `<html data-theme>` |
| `applyTheme()` | stamp `<html data-theme>` from stored theme (startup) |
| `setCustomColors(partial)` | merge into `settings.customColors` + save |
| `saveProfile(name)` | snapshot current relay settings as a profile (overwrites same name) |
| `deleteProfile(name)` | remove a profile |
| `loadProfile(name)` | copy a profile's relay settings into `settings.relay` |
| `resetSettings()` | back to defaults, persisted immediately |
| `loadSettings()` | re-read from localStorage |
| `saveSettings()` | flush to localStorage now (cancels debounce) |
| `exportSettings(): string` | pretty JSON of the full settings |
| `importSettings(json): boolean` | parse + `updateSettings`; false on invalid JSON |

---

## `state/buffers.ts`

| Export | Semantics |
|---|---|
| `buffersState` | read-only store: `{ buffers: Record<pointer, BufferEntry>, activeBuffer: string\|null, pinnedBuffers{}, ignoredNicks{}, mutedBuffers{}, readMarkerPos{} }` |
| `NICK_TIER_ORDER` | `['Owner','Admin','Op','Halfop','Voice','Regular']` — `nickGroups` key insertion order matches |

Derived helpers (call as functions; reactive when used in tracked scopes):

| Export | Semantics |
|---|---|
| `getSorted()` | all entries sorted by buffer number, pinned first |
| `getTotalHighlights()` / `getTotalUnread()` | sums across buffers |
| `findByName(name)` | match `buffer.name` or `fullName` |
| `findByShortName(name)` | match `buffer.shortName` |
| `isPinned(pointer)` / `isMuted(pointer)` | persisted flags ('db-pinned' / 'db-muted') |
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
| `addLine(pointer, line, highlightWords)` | append one live line. Dedup: line-id set, then nick+message content scan (last 10 lines, 3 s window). Confirmed echoes replace their `_opt_` optimistic placeholder. `highlightWords` (case-insensitive substrings) mark the line highlighted before insert. Bumps unread/highlighted when buffer inactive and `line.displayed`. Trims to 5000 lines (indexes rebuilt). Ignored nicks suppressed. |
| `addLines(pointer, lines, prepend=false)` | bulk insert (history); id + 3 s-bucket content dedup; trims to 5000 |
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
| `addIgnore(nick)` / `removeIgnore(nick)` | persisted lowercase |

---

## `state/connection.ts`

| Export | Semantics |
|---|---|
| `connectionState()` | signal: `ConnectionState` |
| `connectionError()` | signal: last error message or null |
| `lag()` | signal: ping RTT ms (15 s ping loop while connected) |
| `isOper()` / `isAdmin()` | true if oper/admin on any server (via 381 / 221 / self umode ±o,O,a,A; also scanned from server-buffer history) |
| `isOperBuffer(pointer)` / `isAdminBuffer(pointer)` | oper/admin on the server this buffer belongs to |
| `connect()` | tear down + create `WeeRelayClient` from `settings.relay`, wire all events, connect |
| `disconnect()` | full teardown: ping loop, listeners, client, oper state, buffers, ircx |
| `reconnect()` | force-drop socket and re-dial (or `connect()` if no client) |
| `sendInput(text, pointer?)` | route user input (default: active buffer). Handles: `/clear` (local); media commands → `MediaCommandSink` (`/call /videocall` = video DM call, `/vcall /voicecall` = voice DM call, `/joinvoice /voice` = voice room, `/joinvideo /video` = video room, `/hangup /hup`) — without a sink, prints a local "requires the orochi bridge" notice; IRCX commands on orochi servers only (`/whisper /w`, `/prop`, `/access`, `/chaninfo`, `/profile`, `/services`, `/pushset`); `/monitor add\|del <nick>` anywhere. Plain messages get an optimistic `_opt_` local echo; `/join` arms auto-switch to the joined channel. Everything else goes to the relay. |
| `sendTo(pointer, text)` | raw input to a buffer via the relay |
| `requestHistory(count=100, pointer?)` | sets loading; requests existing+count lines so dedup nets `count` older lines |
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
channel buffer opened on a known-orochi server. Orochi detection also gates
the IRCX slash commands above.

Internal pipeline (for reference): lineAdded handles TAGMSG `+typing`/`+react`
(never rendered), IRCX numerics 801–825/915–919 plus LIST 322/323 and LISTX
812/817 → ircx store, `bot`/`account`
tags, 004 orochi detection, oper detection, channel-mode tracking, typing
clear, `addLine`, highlight notifications (`notify` + optional sound, muted
buffers skipped), and document-title unread badges.

---

## `state/ircx.ts`

| Export | Semantics |
|---|---|
| `ircxState` | read-only store: `orochiServers{}, channelProps{chan:{KEY:val}}, userProfiles{nick}, accessLists{chan:[]}, botNicks{}, accountMap{}, pendingPropTarget/Entries, pendingAccessChannel/Entries, channelInfoTarget, userProfileTarget, servicesPanel, monitorList{}, channelList{}` |
| `markOrochi(serverName)` | flag a server as orochi |
| `isOrochiServer(serverName?)` | lookup |
| `isActiveOrochi()` | active buffer's server is orochi |
| `requestProps(target)` | arm pending list + `PROP <target> *` |
| `setProp(target, key, value)` | `PROP <target> <key> :<value>` |
| `addPropEntry(entry)` / `finishPropList(target)` | pending assembly → `channelProps` (targets `#`/`&`) or `userProfiles` (URL GENDER PICTURE LOCATION BIO REALNAME EMAIL NO-VIDEO) |
| `clearPropRequest()` | drop pending PROP state |
| `requestAccess(channel)` | arm pending list + `ACCESS <chan> LIST` |
| `addAccessEntry(entry)` / `finishAccessList(channel)` | pending assembly → `accessLists` |
| `clearAccessRequest()` | drop pending ACCESS state |
| `addAccess(chan, level, mask, reason?)` / `removeAccess(chan, level, mask)` | ACCESS ADD/DELETE, re-list after 500 ms |
| `requestChannelList({ pattern?, minUsers?, maxUsers?, extended? })` | arm channel browser + raw `LIST` or Orochi `LISTX` |
| `addChannelListRow(row)` / `finishChannelList()` / `clearChannelList()` | numeric `322/812` assembly → `ircxState.channelList` |
| `markBot(nick)` / `unmarkBot(nick)` / `isBot(nick)` | lowercase bot registry |
| `setAccount(nick, account)` / `getAccount(nick)` | `'*'`/`''` clears (logout) |
| `openChannelInfo(chan)` / `closeChannelInfo()` | channel info panel target |
| `openUserProfile(nick)` / `closeUserProfile()` | profile panel target (auto `requestProps`) |
| `openServicesPanel('nick'\|'chan'\|'memo')` / `closeServicesPanel()` | services panel |
| `sendAccount(cmd)` / `sendChannel(cmd)` / `sendMemo(cmd)` | orochi service verbs `ACCOUNT/CHANNEL/MEMO <cmd>` |
| `sendWhisper(chan, nick, msg)` | `WHISPER <chan> <nick> :<msg>` |
| `monitorAdd(nick)` / `monitorRemove(nick)` | track + `MONITOR +/- <nick>` |
| `sendPushSet(key, value)` | `PUSHSET <key> <value>` |
| `clearIrcx()` | reset everything (called on disconnect) |

All raw sends go to the active buffer's **server buffer** via `/quote`.

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

Status + UI API of the **orochi bridge** — the persistent direct WS session to
the orochi server (typing/reactions, read-marker sync, E2EE DMs). The socket
lifecycle lives in `src/core/bridge.ts` (`initBridge()` — App calls it once);
it installs itself here through the `BridgeBackend` seam. Activation:
`settings.bridge.enabled` AND (orochi detected on the relay OR
`settings.bridge.wsUrl` / `VITE_IRC_WS` pinned).

| Export | Semantics |
|---|---|
| `bridgeState` | read-only store: `{ status: 'off'\|'connecting'\|'ready'\|'error', nick: string\|null, error: string\|null, e2eeReady: boolean }` |
| `sendTyping(bufferPtr, 'active'\|'paused'\|'done')` | `@+typing` TAGMSG to the buffer's mapped orochi target; no-op when bridge not ready |
| `sendReactionTag(bufferPtr, msgid, emoji)` | `@+draft/react;+draft/reply` TAGMSG + optimistic local `addReaction` (dedupe-safe) |
| `markRead(bufferPtr)` | `MARKREAD <target> timestamp=<ISO>` — cross-device read sync; call on buffer activation |
| `canE2ee(nick)` | true when the peer's `ocean.dm-key` is cached (reactive) |
| `sendE2eeDm(nick, text): Promise<boolean>` | seal (Tsumugi envelope) + PRIVMSG via the bridge; false when impossible (kicks off a key fetch) |
| `decryptedFor(msgid, text)` | plaintext overlay for a line (by msgid, then exact ciphertext); reactive — unknown envelopes get a one-shot background decrypt against known keys |
| `bridgeRun(action)` | run once the bridge is ready (connect-on-demand; settings notice when disabled) |
| `BridgeBackend` / `_setBridgeBackend` / `_set*` | internal controller seams — `src/core/bridge.ts` only |

`BridgeSettings` gained `e2eeDms: boolean` (default false) — gates device-key
publishing and encrypted composition.

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
| `mediaState` | read-only store: `{ callState, channel, kind:'voice'\|'video', callWith, startedAt, peers{}, selfMuted, selfDeafened, cameraOn, screenSharing, speakingNick, raisedHands{}, transcripts{}, liveCaption, minimized, spotlightNick, error, mediaAvailable }` |
| `joinRoom(channel, video)` / `leaveRoom()` | channel voice/video room |
| `startCall(nick, video)` / `acceptCall()` / `rejectCall()` / `hangup()` | 1:1 calls (incoming ring → `ringing_in` + ringtone) |
| `toggleMute()` / `toggleDeafen()` / `toggleCamera()` / `toggleScreenShare()` | self controls |
| `setMinimized(v)` / `setSpotlight(nick)` | overlay UI state |
| `sendRoomReaction(emoji)` | MEDIA REACT broadcast to the active room |
| `peerStream(nick)` | MediaStream for a peer tile (screen stream or cached canvas `captureStream`) |
| `selfPreviewStream()` | local camera/screen preview stream, or null |
| `_attachBridgeClient` / `_setMediaAvailable` / `_ensureMediaEngine` | internal — bridge controller only |

**Facade note:** media's `toggleMute()` collides with buffers'
`toggleMute(pointer)`, so `@/state` re-exports it as **`toggleMicMute`**;
import from `@/state/media` directly for the exact contract names.

---

## `state/index.ts`

Re-exports everything above plus `@/types` (media by explicit name — see the
facade note), and:

| Export | Semantics |
|---|---|
| `connectAll()` | `applyTheme()` + `connect()` — App startup |
| `disconnectAll()` | `disconnect()` — full teardown |
