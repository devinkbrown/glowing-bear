// Connection store — wires WeeRelayClient events into the state stores.
//
// Owns the relay client lifecycle (connect/disconnect/reconnect), the 15s
// ping loop and lag, oper detection, the lineAdded pipeline (TAGMSG typing/
// reactions, IRCX numerics, Onyx Server detection, notifications), slash-command
// routing, and the seams the Onyx Server bridge plugs into (MediaCommandSink,
// RelayObserver).

import { createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { ConnectionState } from '@/lib/weechat/model';
import type { WeeChatLine } from '@/lib/weechat/model';
import {
  WeeRelayClient,
  type AuthenticatedEvent,
  type BufferClosedEvent,
  type BufferOpenedEvent,
  type BufferRenamedEvent,
  type BufferSwitchedEvent,
  type BuffersLoadedEvent,
  type HistoryLoadedEvent,
  type HotlistUpdatedEvent,
  type LineAddedEvent,
  type NickAddedEvent,
  type NicklistReceivedEvent,
  type NickRemovedEvent,
  type RelayErrorEvent,
  type RelayDiagnostics,
  type RelayDiagnosticsChangedEvent,
  type StateChangedEvent,
} from '@/lib/weechat/client';
import { stripColors } from '@/lib/weechat/strip-colors';
import { isOnyxMyinfo, onyxGatewayFromMyinfo } from '@/lib/irc/onyxDetect';
import type { ConnectServerType } from '@/lib/connect/serverTypes';
import type { RelayFailureCode } from '@/lib/weechat/relayErrors';
import { mixedContentBlocked } from '@/lib/weechat/relayUrl';
import {
  claimAlertDelivery,
  notify,
  playSound,
  setAlertCoordinatorActive,
  updateTitle,
} from '@/lib/notifications';
import { shouldNotify } from '@/lib/notifyDecision';
import { notificationPolicyAllows } from '@/lib/notificationPolicy';
import { recordDiagnosticEvent } from '@/lib/diagnosticsEvents';
import { isChannelListNumeric, isIrcxNumeric, parseIrcxLine, buildPropEntry } from '@/lib/ircx/parser';
import { parseOnyxServiceFeedback } from '@/lib/irc/serviceFeedback';
import type { BufferEntry } from '@/types';
import { settings, updateBridge, saveSettings } from './settings';
import {
  buffersState,
  upsertBuffer,
  removeBuffer,
  addLine,
  addLines,
  addLineBatch,
  isDuplicateLine,
  addLocalSystemLine,
  setNicklist,
  addNick,
  removeNick,
  setActiveBuffer,
  restoreLastBuffer,
  updateHotlist,
  setLoading,
  setTyping,
  addReaction,
  applyModeChange,
  getNotifyMode,
  isTemporarilyMuted,
  getTotalHighlights,
  getTotalUnread,
  clearBuffers,
  clearLines,
} from './buffers';
import { threadsState } from './threads';
import { recordLineActivity } from './activity';
import {
  markOnyxServer,
  isOnyxServer,
  isActiveOnyxServer,
  addPropEntry,
  finishPropList,
  addAccessEntry,
  finishAccessList,
  addChannelListRow,
  finishChannelList,
  markBot,
  setAccount,
  requestProps,
  setProp,
  requestAccess,
  openChannelInfo,
  openUserProfile,
  openServicesPanel,
  sendWhisper,
  monitorAdd,
  monitorRemove,
  sendPushSet,
  clearIrcx,
  recordServiceFeedback,
} from './ircx';

const PING_INTERVAL_MS = 15_000;
const QUERY_PENDING_TIMEOUT_MS = 10_000;
const BRIDGE_REQUIRED_MSG = 'voice/video requires the onyx-server bridge (enable in Settings → Bridge)';

// ---------------------------------------------------------------------------
// Bridge seams
// ---------------------------------------------------------------------------

/** Injectable sink for /call, /voice, /video, /hangup — provided by the bridge. */
export interface MediaCommandSink {
  startCall(nick: string, video: boolean): void;
  joinRoom(channel: string, video: boolean): void;
  hangup(): void;
}

let mediaSink: MediaCommandSink | null = null;

/** Install (or clear with null) the bridge's media command sink. */
export function setMediaSink(sink: MediaCommandSink | null): void {
  mediaSink = sink;
}

/** Hooks the bridge uses to follow relay-side discoveries. */
export type RelayObserver = {
  /** A channel buffer opened on a server already known to be Onyx Server (also
   * replayed for pre-existing channels the moment a server is detected). */
  onChannelBufferOpened?(serverName: string, channel: string): void;
  /** A server identified as Onyx Server via 004 (live or from history replay). */
  onOnyxServerDetected?(serverName: string, wssGateway?: string): void;
};

let relayObserver: RelayObserver | null = null;

export function setRelayObserver(obs: RelayObserver | null): void {
  relayObserver = obs;
}

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

const [connectionState, setConnectionState] = createSignal<ConnectionState>(ConnectionState.DISCONNECTED);
const [connectionError, setConnectionError] = createSignal<string | null>(null);
const [connectionErrorCode, setConnectionErrorCode] = createSignal<RelayFailureCode | null>(null);
const [connectServerType, setConnectServerType] = createSignal<ConnectServerType>('weechat');
const [onyxExtrasOffered, setOnyxExtrasOffered] = createSignal(false);
const [lag, setLag] = createSignal(0);
const [historyReceipt, setHistoryReceipt] = createSignal({ bufferPtr: '', returnedCount: 0, nonce: 0 });
const [relayDiagnostics, setRelayDiagnostics] = createSignal<RelayDiagnostics>({
  phase: 'idle',
  transport: 'ws',
  protocolMode: 'none',
  authMode: 'none',
  serverVersion: '',
  compression: 'off',
  hashAlgorithm: 'none',
  totp: false,
  handshake: 'unknown',
  canDecodeCompression: false,
  reconnectReason: 'none',
  reconnectAttempt: 0,
  reconnectDelayMs: 0,
});

/** Current relay connection state (signal accessor). */
export { connectionState };
/** Last connection error message, or null (signal accessor). */
export { connectionError };
export { connectionErrorCode, connectServerType, onyxExtrasOffered, setConnectServerType };
export { isOnyxMyinfo } from '@/lib/irc/onyxDetect';

export function enableOnyxExtras(): void {
  updateBridge({ enabled: true });
  saveSettings();
  setOnyxExtrasOffered(false);
}
/** Round-trip lag in ms from the 15s ping loop (signal accessor). */
export { lag };
/** Latest relay history response metadata (no message content). */
export { historyReceipt };
/** Redacted, reactive relay lifecycle and negotiated-capability diagnostics. */
export { relayDiagnostics };

interface OperState {
  /** Server buffer pointers where we hold oper status. */
  operServers: Record<string, true>;
  /** Server buffer pointers where we hold admin status. */
  adminServers: Record<string, true>;
}

const [operState, setOperState] = createStore<OperState>({ operServers: {}, adminServers: {} });

/** True when we are oper on any connected server. */
export const isOper = (): boolean => Object.keys(operState.operServers).length > 0;
/** True when we are admin on any connected server. */
export const isAdmin = (): boolean => Object.keys(operState.adminServers).length > 0;

// ---------------------------------------------------------------------------
// Module-local plumbing
// ---------------------------------------------------------------------------

let client: WeeRelayClient | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let cleanups: Array<() => void> = [];
let pendingQueryNick: string | null = null;
let pendingJoinChannel: string | null = null;
let queryNickTimer: ReturnType<typeof setTimeout> | null = null;
let pendingHistoryTarget: string | null = null;
let historyReceiptNonce = 0;
const MAX_NOTIFICATION_PROFILE_SCOPES = 20;
const notificationProfileScopes = new Map<string, string>();
let notificationConnectionScope = '';

function newNotificationConnectionScope(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function notificationProfileKey(): string {
  const relay = settings.relay;
  // The credential remains only as an in-memory Map key; notifications expose
  // the random value, never endpoint credentials. Re-selecting the same relay
  // profile in this tab reuses its scope, while another account/profile cannot
  // consume an old inline reply even if buffer pointers/names collide.
  return JSON.stringify([
    relay.tls,
    relay.host.trim().toLocaleLowerCase(),
    relay.port,
    relay.password,
  ]);
}

function bindNotificationConnectionScope(): void {
  const key = notificationProfileKey();
  let scope = notificationProfileScopes.get(key);
  if (!scope) {
    scope = newNotificationConnectionScope();
    notificationProfileScopes.set(key, scope);
    if (notificationProfileScopes.size > MAX_NOTIFICATION_PROFILE_SCOPES) {
      const oldest = notificationProfileScopes.keys().next().value as string | undefined;
      if (oldest) notificationProfileScopes.delete(oldest);
    }
  }
  notificationConnectionScope = scope;
}

/** Opaque binding for actionable alerts created by the current relay profile. */
export function currentNotificationConnectionScope(): string {
  return notificationConnectionScope;
}

// Attach a typed CustomEvent listener and return a cleanup fn
function on<T>(target: EventTarget, name: string, handler: (detail: T) => void): () => void {
  const listener = (ev: Event) => handler((ev as CustomEvent<T>).detail);
  target.addEventListener(name, listener);
  return () => target.removeEventListener(name, listener);
}

function stripCodes(s: string): string {
  return stripColors(s);
}

function sendPing(): void {
  if (client && connectionState() === ConnectionState.CONNECTED) {
    client.sendPing(String(Date.now()));
  }
}

function startPing(): void {
  stopPing();
  sendPing();
  pingInterval = setInterval(sendPing, PING_INTERVAL_MS);
}

function stopPing(): void {
  if (pingInterval !== null) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// Resolve own IRC nick for a buffer
function ownNick(entry: BufferEntry): string {
  const localNick = entry.buffer.localVars['nick'] ?? '';
  const remoteNick = entry.buffer.localVars['channel'] ?? '';
  const serverName = entry.buffer.localVars['server'] ?? '';

  if (!localNick || (remoteNick && localNick === remoteNick)) {
    for (const e of Object.values(buffersState.buffers)) {
      const nick = e.buffer.localVars['nick'];
      if (e.buffer.localVars['server'] === serverName && !e.buffer.localVars['type'] && nick) {
        return nick;
      }
    }
  }
  return localNick;
}

function ircServerName(entry: BufferEntry): string {
  const n = entry.buffer.name ?? '';
  const serverBuf = n.match(/^irc\.server\.(.+)$/);
  if (serverBuf?.[1]) return serverBuf[1];
  const chanBuf = n.match(/^irc\.([^.]+)\./);
  if (chanBuf?.[1]) return chanBuf[1];
  return entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
}

function serverPtrForEntry(entry: BufferEntry): string | null {
  if (entry.buffer.localVars['type'] === 'server') return entry.buffer.id;
  const srvName = ircServerName(entry);
  if (!srvName) return null;
  for (const e of Object.values(buffersState.buffers)) {
    if (e.buffer.localVars['type'] === 'server' && ircServerName(e) === srvName) return e.buffer.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Oper detection
// ---------------------------------------------------------------------------

function setOperForEntry(entry: BufferEntry, oper: boolean, admin: boolean): void {
  const srvPtr = serverPtrForEntry(entry);
  if (!srvPtr) return;
  setOperState(produce((s) => {
    if (oper) {
      s.operServers[srvPtr] = true;
      if (admin) s.adminServers[srvPtr] = true;
    } else {
      delete s.operServers[srvPtr];
      delete s.adminServers[srvPtr];
    }
  }));
}

function detectOperFromLine(line: WeeChatLine, entry: BufferEntry): void {
  const btype = entry.buffer.localVars['type'] ?? '';
  const isServerBuf = btype === 'server';
  const plain = stripCodes(line.message);

  // 381 RPL_YOUREOPER
  if (line.tags.includes('irc_381') || (isServerBuf && /authenticated via/i.test(plain))) {
    const roleMatch = plain.match(/[—–-]\s*(.+)$/);
    const role = roleMatch?.[1] ?? plain;
    setOperForEntry(entry, true, /admin/i.test(role));
    return;
  }

  // 221 RPL_UMODEIS
  if (isServerBuf && (line.tags.includes('irc_221') || /^\+[a-zA-Z]{2,}$/.test(plain))) {
    const modeMatch = plain.match(/\+([a-zA-Z]+)/);
    const modes = modeMatch?.[1];
    if (modes && /[oO]/.test(modes)) {
      setOperForEntry(entry, true, /[aA]/.test(modes));
    }
    return;
  }

  // User mode changes
  if (line.tags.includes('irc_mode') && isServerBuf && !/[#&]/.test(plain)) {
    const own = ownNick(entry);
    if (own && plain.includes(own)) {
      if (/\+[oOaA]/.test(plain)) {
        setOperForEntry(entry, true, /\+[aA]/.test(plain));
      }
      if (/-[oOaA]/.test(plain)) {
        setOperForEntry(entry, false, false);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Onyx Server detection (API: markOnyxServer / isOnyxServer / onOnyxServerDetected)
// ---------------------------------------------------------------------------

function detectOnyxForEntry(entry: BufferEntry, line?: WeeChatLine): void {
  const sn = entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
  if (!sn || isOnyxServer(sn)) return;
  const gateway = line ? onyxGatewayFromMyinfo(line.message) : undefined;
  markOnyxServer(sn, gateway);
  relayObserver?.onOnyxServerDetected?.(sn, gateway);
  if (connectServerType() === 'weechat' && !settings.bridge.enabled) {
    setOnyxExtrasOffered(true);
  }
  // Replay channel-opened notifications for channels that existed before
  // detection so the bridge sees the full channel set.
  for (const e of Object.values(buffersState.buffers)) {
    if (e.buffer.localVars['type'] !== 'channel') continue;
    const esn = e.buffer.localVars['server'] ?? e.buffer.localVars['network'] ?? '';
    if (esn !== sn) continue;
    const channel = e.buffer.localVars['channel'] ?? e.buffer.shortName ?? e.buffer.name;
    relayObserver?.onChannelBufferOpened?.(sn, channel);
  }
}

// ---------------------------------------------------------------------------
// lineAdded pipeline
// ---------------------------------------------------------------------------

// WeeChat `_buffer_line_added` frames dispatch `lineAdded` synchronously. We
// coalesce a burst (netsplit rejoin / flood) per buffer across a short 16 ms
// event-loop window, so both a multi-line frame and adjacent WebSocket frames
// fold into ONE store write per buffer instead of N. The per-line side-effects
// (typing/oper/tag detection, notifications) stay synchronous; only the store
// insert and title recompute are deferred by at most one frame.
const LINE_BURST_WINDOW_MS = 16;
const pendingLines = new Map<string, WeeChatLine[]>();
let lineFlushTimer: ReturnType<typeof setTimeout> | undefined;
let titleDirty = false;

function enqueueLine(line: WeeChatLine): void {
  let arr = pendingLines.get(line.buffer);
  if (!arr) { arr = []; pendingLines.set(line.buffer, arr); }
  arr.push(line);
  titleDirty = true;
  if (!lineFlushTimer) {
    lineFlushTimer = setTimeout(flushLineBatch, LINE_BURST_WINDOW_MS);
  }
}

/** Fold every coalesced burst into one store write per buffer, then retitle. */
function flushLineBatch(): void {
  if (lineFlushTimer) clearTimeout(lineFlushTimer);
  lineFlushTimer = undefined;
  if (pendingLines.size > 0) {
    const words = settings.highlightWords;
    for (const [ptr, lines] of pendingLines) addLineBatch(ptr, lines, words);
    pendingLines.clear();
  }
  if (titleDirty) {
    titleDirty = false;
    updateTitle(getTotalHighlights(), getTotalUnread());
  }
}

/** Drop any pending coalesced lines — teardown, before buffers are cleared. */
function resetLineBatch(): void {
  if (lineFlushTimer) clearTimeout(lineFlushTimer);
  lineFlushTimer = undefined;
  pendingLines.clear();
  titleDirty = false;
}

/** Test hook: synchronously flush the coalesced line batch. */
export { flushLineBatch as _flushLineBatch };

function handleLineAdded(line: WeeChatLine): void {
  // TAGMSGs (+typing / +react) never render — route to buffer state
  if (line.isTagMsg) {
    const entry = buffersState.buffers[line.buffer];
    if (entry) {
      const typingState = line.ircTags.get('+typing');
      if (typingState && line.nick) {
        setTyping(line.buffer, line.nick, typingState as 'active' | 'paused' | 'done');
      }
      const reactEmoji = line.ircTags.get('+draft/react') ?? line.ircTags.get('+react');
      const reactTarget = line.ircTags.get('+draft/reply') ?? line.ircTags.get('+reply') ?? line.replyTo;
      if (reactEmoji && reactTarget && line.nick) {
        addReaction(line.buffer, reactTarget, reactEmoji, line.nick);
      }
    }
    return;
  }

  // Reject repeated stable relay identities before any downstream state or
  // user-visible side effect. The staged burst matters here: the first line
  // may not have reached the store yet, but it has already earned its activity,
  // service-feedback and alert effects.
  if (isDuplicateLine(line.buffer, line, pendingLines.get(line.buffer))) return;

  // IRCX numeric interception
  if (isIrcxNumeric(line.tags) || isChannelListNumeric(line.tags)) {
    const parsed = parseIrcxLine(line);
    if (parsed) {
      switch (parsed.type) {
        case 'prop':
          addPropEntry(buildPropEntry(parsed));
          break;
        case 'prop_end':
          finishPropList(parsed.target);
          break;
        case 'access_start':
          break;
        case 'access_entry':
        case 'access_add':
        case 'access_delete':
          addAccessEntry(parsed.entry);
          break;
        case 'access_end':
          finishAccessList(parsed.channel);
          break;
        case 'channel_list_row':
          addChannelListRow({
            channel: parsed.channel,
            users: parsed.users,
            topic: parsed.topic,
            modes: parsed.modes,
          });
          break;
        case 'channel_list_end':
          finishChannelList();
          break;
      }
    }
  }

  // Bot tag detection
  if (line.ircTags.has('bot') && line.nick) {
    markBot(line.nick);
  }

  // Account tag detection
  if (line.account && line.nick) {
    setAccount(line.nick, line.account);
  }

  // Onyx Server detection via RPL_MYINFO (004) or ISUPPORT NETWORK (005)
  if ((line.tags.includes('irc_004') || line.tags.includes('irc_005')) && isOnyxMyinfo(line.message)) {
    const bufEntry = buffersState.buffers[line.buffer];
    if (bufEntry) detectOnyxForEntry(bufEntry, line);
  }

  const entry = buffersState.buffers[line.buffer];
  if (!entry) return;

  // Service commands are sent to the relay's server buffer. Mirror only
  // narrowly recognised Onyx Server replies into the services panel; the parser
  // deliberately rejects unrelated notices and SESSIONTOKEN credentials.
  if (entry.buffer.localVars['type'] === 'server') {
    const serverName = entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
    // WeeChat exposes the IRC source through nick_<source> (or the rendered
    // prefix). IRC nicknames cannot contain dots, so a dotted source is a
    // server name. A local relay/network alias is not an authenticated source:
    // it may also be a perfectly valid user nickname. Never trust a
    // user-authored NOTICE merely because WeeChat rendered it in this buffer.
    const source = (line.nick ?? '').trim().toLowerCase();
    const serverSource = source.includes('.');
    if (isOnyxServer(serverName) && serverSource) {
      const feedback = parseOnyxServiceFeedback(stripCodes(line.message), line.tags);
      if (feedback) recordServiceFeedback(serverName, feedback, line.date.getTime());
    }
  }

  // Oper detection
  detectOperFromLine(line, entry);

  if (!line.displayed) return;

  // Channel mode tracking
  if (line.tags.includes('irc_mode')) {
    const modeMatch = line.message.match(/([+-][a-zA-Z]+(?:[+-][a-zA-Z]+)*)/);
    if (modeMatch?.[1]) applyModeChange(line.buffer, modeMatch[1]);
  }

  // Clear typing on regular message
  if (line.nick) setTyping(line.buffer, line.nick, 'done');

  recordLineActivity(
    entry,
    line,
    isOperBuffer(line.buffer) && line.tags.some((tag) => tag === 'irc_wallops' || tag === 'onyx_oper_alert'),
  );

  // Coalesce the store insert into the current frame's batch (flushed on a
  // microtask). The title is recomputed once per flush, not per line.
  enqueueLine(line);

  // Notifications fire per line, synchronously — they depend only on the line
  // and buffer metadata, not on the (deferred) store insertion. The per-channel
  // tier (all/mentions/mute) is decided by the pure shouldNotify table; notify()
  // itself stays focus-guarded, so this only reaches an OS alert when blurred.
  const now = Date.now();
  const policyAllows = notificationPolicyAllows({
    enabled: settings.notifications,
    snoozedUntil: settings.notificationsSnoozedUntil,
    quietHours: {
      enabled: settings.quietHoursEnabled,
      start: settings.quietHoursStart,
      end: settings.quietHoursEnd,
      timeZone: settings.quietHoursTimezone,
    },
    mutedTargets: [],
    temporaryMutes: {},
  }, undefined, now) && !isTemporarilyMuted(line.buffer, now);
  if (shouldNotify(getNotifyMode(line.buffer), line, policyAllows)) {
    if (claimAlertDelivery()) {
      const bufName = entry.buffer.shortName || entry.buffer.name;
      const entryType = entry.buffer.localVars['type'];
      const title = entryType === 'private' ? `Message from ${bufName}` : `Highlight in ${bufName}`;
      const stableTarget = entry.buffer.fullName || entry.buffer.name ||
        entry.buffer.localVars['channel'] || entry.buffer.shortName;
      notify(
        title,
        stripCodes(line.message),
        undefined,
        line.buffer,
        stableTarget,
        notificationConnectionScope,
      );
      if (settings.notificationSound) playSound();
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function connect(opts?: { totp?: string }): void {
  // Tear down existing
  disconnect();
  bindNotificationConnectionScope();
  setConnectionErrorCode(null);

  if (mixedContentBlocked(settings.relay.tls, settings.relay.host)) {
    setConnectionErrorCode('mixed_content');
    setConnectionError(
      'This page is HTTPS, so the browser blocks an unencrypted WebSocket to a remote host. Enable TLS, or connect to loopback.',
    );
    return;
  }

  const c = new WeeRelayClient({ ...settings.relay, totp: opts?.totp });
  client = c;
  setConnectionError(null);
  setRelayDiagnostics(c.diagnostics());
  let lastRelayPhase = c.diagnostics().phase;

  cleanups = [
    // Protocol event handler — untracked reads of current state are intended.
    // eslint-disable-next-line solid/reactivity
    on<StateChangedEvent>(c, 'stateChanged', ({ state }) => {
      setConnectionState(state);
      setAlertCoordinatorActive(state === ConnectionState.CONNECTED);
      recordDiagnosticEvent('relay-state', state);
      if (state === ConnectionState.CONNECTED) {
        setConnectionError(null);
        startPing();
      } else if (state === ConnectionState.RECONNECTING) {
        setConnectionError(null);
        stopPing();
      } else if (state === ConnectionState.DISCONNECTED) {
        stopPing();
        setOperState(produce((s) => { s.operServers = {}; s.adminServers = {}; }));
      }
    }),

    on<RelayErrorEvent>(c, 'error', ({ message, code }) => {
      setConnectionError(message);
      setConnectionErrorCode(code ?? null);
      recordDiagnosticEvent('relay-error');
    }),

    on<RelayDiagnosticsChangedEvent>(c, 'diagnosticsChanged', (detail) => {
      if (lastRelayPhase !== detail.phase) {
        recordDiagnosticEvent('relay-phase', detail.phase);
      }
      lastRelayPhase = detail.phase;
      setRelayDiagnostics(detail);
    }),

    on<AuthenticatedEvent>(c, 'authenticated', () => {
      setConnectionError(null);
    }),

    on<BuffersLoadedEvent>(c, 'buffersLoaded', ({ buffers }) => {
      for (const b of buffers) upsertBuffer(b);
      restoreLastBuffer();
      // Request nicklist for all channels so they're populated on first load
      for (const b of buffers) {
        if (b.localVars['type'] === 'channel') {
          c.requestNicklist(b.id);
        }
      }
    }),

    on<BufferOpenedEvent>(c, 'bufferOpened', ({ buffer }) => {
      upsertBuffer(buffer);
      if (buffer.localVars['type'] !== 'server') {
        c.requestHistory(buffer.id, 100);
      }
      // Auto-switch to pending query
      if (buffer.localVars['type'] === 'private' && pendingQueryNick) {
        const channel = (buffer.localVars['channel'] ?? '').toLowerCase();
        const short = (buffer.shortName || buffer.name).toLowerCase();
        if (channel === pendingQueryNick || short === pendingQueryNick) {
          pendingQueryNick = null;
          setActiveBuffer(buffer.id);
        }
      }
      // Auto-switch to joined channel
      if (buffer.localVars['type'] === 'channel' && pendingJoinChannel) {
        const channel = (buffer.localVars['channel'] ?? '').toLowerCase();
        const short = (buffer.shortName || buffer.name).toLowerCase();
        if (channel === pendingJoinChannel || short === pendingJoinChannel) {
          pendingJoinChannel = null;
          setActiveBuffer(buffer.id);
        }
      }
      // Bridge hook: channel buffer opened on a known Onyx Server
      if (buffer.localVars['type'] === 'channel') {
        const sn = buffer.localVars['server'] ?? buffer.localVars['network'] ?? '';
        if (sn && isOnyxServer(sn)) {
          const channel = buffer.localVars['channel'] ?? buffer.shortName ?? buffer.name;
          relayObserver?.onChannelBufferOpened?.(sn, channel);
        }
      }
    }),

    on<BufferSwitchedEvent>(c, 'bufferSwitched', ({ id }) => {
      if (buffersState.buffers[id]) setActiveBuffer(id);
    }),

    on<BufferClosedEvent>(c, 'bufferClosed', ({ id }) => {
      removeBuffer(id);
    }),

    on<BufferRenamedEvent>(c, 'bufferRenamed', ({ buffer }) => {
      upsertBuffer(buffer);
    }),

    on<LineAddedEvent>(c, 'lineAdded', ({ line }) => {
      handleLineAdded(line);
    }),

    // Protocol event handler — untracked reads of current state are intended.
    // eslint-disable-next-line solid/reactivity
    on<HistoryLoadedEvent>(c, 'historyLoaded', ({ lines }) => {
      const first = lines[0];
      if (!first) {
        const target = pendingHistoryTarget ?? buffersState.activeBuffer;
        pendingHistoryTarget = null;
        if (target) {
          setLoading(target, false);
          setHistoryReceipt({ bufferPtr: target, returnedCount: 0, nonce: ++historyReceiptNonce });
        }
        return;
      }
      const bufPtr = first.buffer;
      pendingHistoryTarget = null;
      setHistoryReceipt({ bufferPtr: bufPtr, returnedCount: lines.length, nonce: ++historyReceiptNonce });
      const before = buffersState.buffers[bufPtr];
      const hasExisting = (before?.lines.length ?? 0) > 0;
      const activeThread = threadsState.activeThread;
      const stableBufferKey = before ? (before.buffer.fullName || before.buffer.name) : '';
      const threadRoot = activeThread && (
        activeThread.bufferPtr === bufPtr || activeThread.bufferKey === stableBufferKey
      ) ? activeThread.rootMsgid : undefined;
      setLoading(bufPtr, false);
      addLines(bufPtr, [...lines].reverse(), hasExisting, threadsState.scrollRequest?.msgid ?? threadRoot);

      const entry = buffersState.buffers[bufPtr];
      const bufType = entry?.buffer.localVars['type'] ?? '';
      if (entry && bufType === 'server') {
        // Scan history for oper status
        const srvPtr = entry.buffer.id;
        if (!operState.operServers[srvPtr]) {
          for (const line of lines) {
            detectOperFromLine(line, entry);
            if (operState.operServers[srvPtr]) break;
          }
        }
        // Scan history for Onyx Server 004 (registration replay after reconnect)
        const sn = entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
        if (sn && !isOnyxServer(sn)) {
          for (const line of lines) {
            if ((line.tags.includes('irc_004') || line.tags.includes('irc_005')) && isOnyxMyinfo(line.message)) {
              detectOnyxForEntry(entry, line);
              break;
            }
          }
        }
      }
    }),

    on<NicklistReceivedEvent>(c, 'nicklistReceived', ({ buffer: bufPtr, nicks }) => {
      setNicklist(bufPtr, nicks);
    }),

    on<NickAddedEvent>(c, 'nickAdded', ({ buffer: bufPtr, nick }) => {
      addNick(bufPtr, nick);
    }),

    on<NickRemovedEvent>(c, 'nickRemoved', ({ buffer: bufPtr, nickId }) => {
      removeNick(bufPtr, nickId);
    }),

    on<HotlistUpdatedEvent>(c, 'hotlistUpdated', ({ hotlist }) => {
      updateHotlist(hotlist);
      updateTitle(getTotalHighlights(), getTotalUnread());
    }),

    on<{ arg: string }>(c, 'pong', ({ arg }) => {
      const sent = parseInt(arg ?? '', 10);
      if (!isNaN(sent)) setLag(Date.now() - sent);
    }),
  ];

  c.connect();
}

export function disconnect(): void {
  notificationConnectionScope = '';
  setAlertCoordinatorActive(false);
  stopPing();
  resetLineBatch(); // drop any coalesced burst; buffers are about to be cleared
  if (queryNickTimer) { clearTimeout(queryNickTimer); queryNickTimer = null; }
  pendingQueryNick = null;
  pendingJoinChannel = null;
  pendingHistoryTarget = null;
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  if (client) {
    client.disconnect(true);
    client = null;
  }
  setConnectionState(ConnectionState.DISCONNECTED);
  setRelayDiagnostics({
    phase: 'idle',
    transport: settings.relay.tls ? 'wss' : 'ws',
    protocolMode: 'none',
    authMode: 'none',
    serverVersion: '',
    compression: 'off',
    hashAlgorithm: 'none',
    totp: false,
    handshake: 'unknown',
    canDecodeCompression: typeof DecompressionStream !== 'undefined',
    reconnectReason: 'none',
    reconnectAttempt: 0,
    reconnectDelayMs: 0,
  });
  setOperState(produce((s) => { s.operServers = {}; s.adminServers = {}; }));
  clearBuffers();
  clearIrcx();
}

export function reconnect(): void {
  if (client) {
    stopPing();
    client.disconnect(false);
    client.connect();
  } else {
    connect();
  }
}

// ---------------------------------------------------------------------------
// Input / commands
// ---------------------------------------------------------------------------

function withMediaSink(target: string, fn: (sink: MediaCommandSink) => void): void {
  if (mediaSink) fn(mediaSink);
  else addLocalSystemLine(target, BRIDGE_REQUIRED_MSG);
}

/**
 * Send user input to a buffer (default: active buffer). Slash commands are
 * routed: /clear locally; media commands to the MediaCommandSink; IRCX
 * commands (Onyx Server only) to the ircx store; /monitor anywhere;
 * everything else to the relay. Plain messages get an optimistic local echo.
 */
export function sendInput(text: string, pointer?: string): boolean {
  const target = pointer ?? buffersState.activeBuffer;
  if (!client || !target || !text.trim()) return false;

  if (text.startsWith('/')) {
    const parts = text.split(/\s+/);
    const cmd = (parts[0] ?? '').toLowerCase();

    // Media commands — routed through the Onyx Server bridge sink
    if (cmd === '/call' || cmd === '/videocall') {
      const nick = parts[1];
      if (nick) withMediaSink(target, (sink) => sink.startCall(nick, true));
      return true;
    }
    if (cmd === '/vcall' || cmd === '/voicecall') {
      const nick = parts[1];
      if (nick) withMediaSink(target, (sink) => sink.startCall(nick, false));
      return true;
    }
    if (cmd === '/joinvoice' || cmd === '/voice') {
      const channel = parts[1] ?? buffersState.buffers[target]?.buffer.localVars['channel'];
      if (channel) withMediaSink(target, (sink) => sink.joinRoom(channel, false));
      return true;
    }
    if (cmd === '/joinvideo' || cmd === '/video') {
      const channel = parts[1] ?? buffersState.buffers[target]?.buffer.localVars['channel'];
      if (channel) withMediaSink(target, (sink) => sink.joinRoom(channel, true));
      return true;
    }
    if (cmd === '/hangup' || cmd === '/hup') {
      withMediaSink(target, (sink) => sink.hangup());
      return true;
    }
    if (cmd === '/clear') {
      clearLines(target);
      return true;
    }
    // IRCX client-side commands (Onyx Server only)
    if (isActiveOnyxServer()) {
      if (cmd === '/whisper' || cmd === '/w') {
        const channel = buffersState.buffers[target]?.buffer.localVars['channel'];
        const nick = parts[1];
        if (channel && nick) {
          const msg = parts.slice(2).join(' ');
          if (msg) return sendWhisper(channel, nick, msg);
        }
        return true;
      }
      if (cmd === '/prop') {
        const propTarget = parts[1];
        if (propTarget) {
          if (parts.length >= 4 && parts[2]) {
            return setProp(propTarget, parts[2], parts.slice(3).join(' '));
          } else {
            return requestProps(propTarget);
          }
        }
        return true;
      }
      if (cmd === '/access') {
        const ch = parts[1];
        if (ch) return requestAccess(ch);
        return true;
      }
      if (cmd === '/chaninfo') {
        const ch = parts[1] ?? buffersState.buffers[target]?.buffer.localVars['channel'];
        if (ch) openChannelInfo(ch);
        return true;
      }
      if (cmd === '/profile') {
        const nick = parts[1];
        if (nick) openUserProfile(nick);
        return true;
      }
      if (cmd === '/services') {
        openServicesPanel('nick');
        return true;
      }
      if (cmd === '/pushset') {
        const key = parts[1];
        if (key && parts[2]) {
          return sendPushSet(key, parts.slice(2).join(' '));
        }
        return true;
      }
    }
    // MONITOR works on any IRCv3 server
    if (cmd === '/monitor') {
      const sub = parts[1]?.toLowerCase();
      const nick = parts[2];
      if (sub === 'add' && nick) {
        return monitorAdd(nick);
      } else if (sub === 'del' && nick) {
        return monitorRemove(nick);
      }
      return true;
    }
  }

  // Do not mutate local state until the authenticated relay socket accepts the
  // frame. A rejected dispatch must remain retryable in the composer and must
  // not leave an optimistic line that suppresses the retry.
  if (!sendTo(target, text)) return false;

  if (text.startsWith('/')) {
    const joinMatch = text.match(/^\/join\s+([^\s]+)/i);
    if (joinMatch?.[1]) {
      let ch = joinMatch[1];
      if (!ch.startsWith('#') && !ch.startsWith('&')) ch = '#' + ch;
      pendingJoinChannel = ch.toLowerCase();
    }
  }

  // Optimistic local echo for accepted non-commands (IRC buffers only). Always
  // dispatch repeated text; an existing placeholder merely avoids rendering a
  // duplicate while the first confirmed echo is still pending.
  if (!text.startsWith('/') && !text.startsWith('\x01')) {
    const entry = buffersState.buffers[target];
    const hasMatchingOptimistic = entry?.lines.some((line) =>
      line.id.startsWith('_opt_') && line.message === text,
    );
    const entryType = entry?.buffer.localVars['type'] ?? '';
    const isIrcBuf = entryType === 'channel' || entryType === 'private' || entryType === 'server';
    const nick = entry && isIrcBuf ? ownNick(entry) : '';
    if (!hasMatchingOptimistic && nick && entry) {
      const now = new Date();
      addLine(target, {
        id: `_opt_${Date.now()}`,
        buffer: target,
        date: now,
        datePrinted: now,
        displayed: true,
        highlight: false,
        tags: ['self_msg'],
        prefix: nick,
        message: text,
        nick,
        isAction: false,
        isSelf: true,
        isNotice: false,
        isJoin: false,
        isPart: false,
        isQuit: false,
        isNick: false,
        isTopic: false,
        isMode: false,
        isTagMsg: false,
        isWhisper: false,
        ircTags: new Map(),
        msgid: undefined,
        replyTo: undefined,
        account: undefined,
      }, []);
    }
  }

  return true;
}

/** Send raw input text to a specific buffer via the relay. */
export function sendTo(bufferPointer: string, text: string): boolean {
  if (!client) return false;
  return client.sendInput(bufferPointer, text);
}

/**
 * Request `count` older lines for a buffer (default: active). Requests
 * existing + count from the end so dedup leaves `count` new older lines.
 */
export function requestHistory(count = 100, pointer?: string): void {
  const target = pointer ?? buffersState.activeBuffer;
  if (!client || !target) return;
  const existing = buffersState.buffers[target];
  const haveCount = existing?.lines.filter((l) => !l.id.startsWith('_opt_')).length ?? 0;
  requestHistoryTotal(haveCount + count, target);
}

/**
 * Request an absolute history total from the relay.
 *
 * Unlike requestHistory(), this does not derive the request from the bounded
 * in-memory line count. Archive jumps use it to reach messages older than the
 * 5,000-line render window through staged, user-initiated requests.
 */
export function requestHistoryTotal(total: number, pointer?: string): void {
  const target = pointer ?? buffersState.activeBuffer;
  if (!client || !target) return;
  const boundedTotal = Math.max(1, Math.floor(total));
  setLoading(target, true);
  pendingHistoryTarget = target;
  client.requestHistory(target, boundedTotal);
}

export function requestNicklist(bufferPointer: string): void {
  if (!client) return;
  client.requestNicklist(bufferPointer);
}

/** Activate a buffer locally and clear its WeeChat-side hotlist. */
export function setActive(bufferPointer: string): void {
  setActiveBuffer(bufferPointer);
  if (client) {
    client.sendInput(bufferPointer, '/buffer set hotlist -1');
  }
}

/** Open (or focus) a private query buffer with a nick. */
export function openQuery(nick: string): void {
  const lc = nick.toLowerCase();
  for (const entry of Object.values(buffersState.buffers)) {
    const vars = entry.buffer.localVars ?? {};
    if (vars['type'] === 'private') {
      const ch = (vars['channel'] ?? '').toLowerCase();
      const short = (entry.buffer.shortName ?? '').toLowerCase();
      const name = (entry.buffer.name ?? '').toLowerCase();
      if (ch === lc || short === lc || name.endsWith('.' + lc)) {
        setActiveBuffer(entry.buffer.id);
        return;
      }
    }
  }
  pendingQueryNick = lc;
  sendInput(`/query ${nick}`);
  if (queryNickTimer) clearTimeout(queryNickTimer);
  queryNickTimer = setTimeout(() => {
    queryNickTimer = null;
    if (pendingQueryNick === lc) pendingQueryNick = null;
  }, QUERY_PENDING_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// Oper queries
// ---------------------------------------------------------------------------

/** True when we are oper on the server this buffer belongs to. */
export function isOperBuffer(bufferId: string): boolean {
  if (!isOper()) return false;
  const entry = buffersState.buffers[bufferId];
  if (!entry) return isOper();
  const ptr = serverPtrForEntry(entry);
  return ptr ? !!operState.operServers[ptr] : isOper();
}

/** True when we are admin on the server this buffer belongs to. */
export function isAdminBuffer(bufferId: string): boolean {
  if (!isAdmin()) return false;
  const entry = buffersState.buffers[bufferId];
  if (!entry) return isAdmin();
  const ptr = serverPtrForEntry(entry);
  return ptr ? !!operState.adminServers[ptr] : isAdmin();
}
