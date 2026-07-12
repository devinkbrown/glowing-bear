// Connection store — wires WeeRelayClient events into the state stores.
//
// Owns the relay client lifecycle (connect/disconnect/reconnect), the 15s
// ping loop and lag, oper detection, the lineAdded pipeline (TAGMSG typing/
// reactions, IRCX numerics, orochi detection, notifications), slash-command
// routing, and the seams the orochi bridge plugs into (MediaCommandSink,
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
  type StateChangedEvent,
} from '@/lib/weechat/client';
import { stripColors } from '@/lib/weechat/strip-colors';
import { notify, playSound, updateTitle } from '@/lib/notifications';
import { shouldNotify } from '@/lib/notifyDecision';
import { isChannelListNumeric, isIrcxNumeric, parseIrcxLine, buildPropEntry } from '@/lib/ircx/parser';
import { NODES, wssUrlForOrochiHost } from '@/lib/irc/nodes';
import type { BufferEntry } from '@/types';
import { settings } from './settings';
import {
  buffersState,
  upsertBuffer,
  removeBuffer,
  addLine,
  addLines,
  addLineBatch,
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
  getTotalHighlights,
  getTotalUnread,
  clearBuffers,
  clearLines,
} from './buffers';
import {
  markOrochi,
  isOrochiServer,
  isActiveOrochi,
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
} from './ircx';

const PING_INTERVAL_MS = 15_000;
const QUERY_PENDING_TIMEOUT_MS = 10_000;
const OROCHI_RE = /\borochi\b/i;
const BRIDGE_REQUIRED_MSG = 'voice/video requires the orochi bridge (enable in Settings → Bridge)';
const OROCHI_HOSTS = new Set(NODES.map((node) => node.host.toLowerCase()));

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
  /** A channel buffer opened on a server already known to be orochi (also
   * replayed for pre-existing channels the moment a server is detected). */
  onChannelBufferOpened?(serverName: string, channel: string): void;
  /** A server identified as orochi via 004 (live or from history replay). */
  onOrochiDetected?(serverName: string, wssGateway?: string): void;
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
const [lag, setLag] = createSignal(0);

/** Current relay connection state (signal accessor). */
export { connectionState };
/** Last connection error message, or null (signal accessor). */
export { connectionError };
/** Round-trip lag in ms from the 15s ping loop (signal accessor). */
export { lag };

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
// Orochi detection
// ---------------------------------------------------------------------------

function orochiGatewayFromMyinfo(message: string): string | undefined {
  const parts = stripCodes(message).split(/\s+/).filter(Boolean);
  const host = parts[1] ?? '';
  return wssUrlForOrochiHost(host) ?? undefined;
}

function isOrochiMyinfo(message: string): boolean {
  const plain = stripCodes(message);
  if (OROCHI_RE.test(plain)) return true;
  const parts = plain.split(/\s+/).filter(Boolean);
  const host = parts[1]?.toLowerCase() ?? '';
  return OROCHI_HOSTS.has(host);
}

function detectOrochiForEntry(entry: BufferEntry, line?: WeeChatLine): void {
  const sn = entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
  if (!sn || isOrochiServer(sn)) return;
  const gateway = line ? orochiGatewayFromMyinfo(line.message) : undefined;
  markOrochi(sn, gateway);
  relayObserver?.onOrochiDetected?.(sn, gateway);
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

// A single WeeChat `_buffer_line_added` frame dispatches one `lineAdded` event
// per line, synchronously. We coalesce a burst (netsplit rejoin / flood) per
// buffer and flush on a microtask, so one frame folds into ONE store write per
// buffer instead of N — identical final state, a single reactive pass. The
// per-line side-effects (typing/oper/tag detection, notifications) stay
// synchronous; only the store insert and the title recompute are deferred.
const pendingLines = new Map<string, WeeChatLine[]>();
let lineFlushScheduled = false;
let titleDirty = false;

function enqueueLine(line: WeeChatLine): void {
  let arr = pendingLines.get(line.buffer);
  if (!arr) { arr = []; pendingLines.set(line.buffer, arr); }
  arr.push(line);
  titleDirty = true;
  if (!lineFlushScheduled) {
    lineFlushScheduled = true;
    queueMicrotask(flushLineBatch);
  }
}

/** Fold every coalesced burst into one store write per buffer, then retitle. */
function flushLineBatch(): void {
  lineFlushScheduled = false;
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
  pendingLines.clear();
  lineFlushScheduled = false;
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
      const reactEmoji = line.ircTags.get('+react');
      const reactTarget = line.ircTags.get('+reply') ?? line.replyTo;
      if (reactEmoji && reactTarget && line.nick) {
        addReaction(line.buffer, reactTarget, reactEmoji, line.nick);
      }
    }
    return;
  }

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

  // Orochi server detection via RPL_MYINFO (004)
  if (line.tags.includes('irc_004') && isOrochiMyinfo(line.message)) {
    const bufEntry = buffersState.buffers[line.buffer];
    if (bufEntry) detectOrochiForEntry(bufEntry, line);
  }

  const entry = buffersState.buffers[line.buffer];
  if (!entry) return;

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

  // Coalesce the store insert into the current frame's batch (flushed on a
  // microtask). The title is recomputed once per flush, not per line.
  enqueueLine(line);

  // Notifications fire per line, synchronously — they depend only on the line
  // and buffer metadata, not on the (deferred) store insertion. The per-channel
  // tier (all/mentions/mute) is decided by the pure shouldNotify table; notify()
  // itself stays focus-guarded, so this only reaches an OS alert when blurred.
  if (shouldNotify(getNotifyMode(line.buffer), line, settings.notifications)) {
    const bufName = entry.buffer.shortName || entry.buffer.name;
    const entryType = entry.buffer.localVars['type'];
    const title = entryType === 'private' ? `Message from ${bufName}` : `Highlight in ${bufName}`;
    notify(title, stripCodes(line.message), undefined, line.buffer);
    if (settings.notificationSound) playSound();
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function connect(): void {
  // Tear down existing
  disconnect();

  const c = new WeeRelayClient({ ...settings.relay });
  client = c;
  setConnectionError(null);

  cleanups = [
    // Protocol event handler — untracked reads of current state are intended.
    // eslint-disable-next-line solid/reactivity
    on<StateChangedEvent>(c, 'stateChanged', ({ state }) => {
      setConnectionState(state);
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

    on<RelayErrorEvent>(c, 'error', ({ message }) => {
      setConnectionError(message);
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
      // Bridge hook: channel buffer opened on a known-orochi server
      if (buffer.localVars['type'] === 'channel') {
        const sn = buffer.localVars['server'] ?? buffer.localVars['network'] ?? '';
        if (sn && isOrochiServer(sn)) {
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
        const active = buffersState.activeBuffer;
        if (active) setLoading(active, false);
        return;
      }
      const bufPtr = first.buffer;
      const hasExisting = (buffersState.buffers[bufPtr]?.lines.length ?? 0) > 0;
      setLoading(bufPtr, false);
      addLines(bufPtr, [...lines].reverse(), hasExisting);

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
        // Scan history for orochi 004 (registration replay after reconnect)
        const sn = entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
        if (sn && !isOrochiServer(sn)) {
          for (const line of lines) {
            if (line.tags.includes('irc_004') && isOrochiMyinfo(line.message)) {
              detectOrochiForEntry(entry, line);
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
  stopPing();
  resetLineBatch(); // drop any coalesced burst; buffers are about to be cleared
  if (queryNickTimer) { clearTimeout(queryNickTimer); queryNickTimer = null; }
  pendingQueryNick = null;
  pendingJoinChannel = null;
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  if (client) {
    client.disconnect(true);
    client = null;
  }
  setConnectionState(ConnectionState.DISCONNECTED);
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
 * commands (orochi servers only) to the ircx store; /monitor anywhere;
 * everything else to the relay. Plain messages get an optimistic local echo.
 */
export function sendInput(text: string, pointer?: string): void {
  const target = pointer ?? buffersState.activeBuffer;
  if (!client || !target || !text.trim()) return;

  if (text.startsWith('/')) {
    const parts = text.split(/\s+/);
    const cmd = (parts[0] ?? '').toLowerCase();

    // Media commands — routed through the orochi bridge sink
    if (cmd === '/call' || cmd === '/videocall') {
      const nick = parts[1];
      if (nick) withMediaSink(target, (sink) => sink.startCall(nick, true));
      return;
    }
    if (cmd === '/vcall' || cmd === '/voicecall') {
      const nick = parts[1];
      if (nick) withMediaSink(target, (sink) => sink.startCall(nick, false));
      return;
    }
    if (cmd === '/joinvoice' || cmd === '/voice') {
      const channel = parts[1] ?? buffersState.buffers[target]?.buffer.localVars['channel'];
      if (channel) withMediaSink(target, (sink) => sink.joinRoom(channel, false));
      return;
    }
    if (cmd === '/joinvideo' || cmd === '/video') {
      const channel = parts[1] ?? buffersState.buffers[target]?.buffer.localVars['channel'];
      if (channel) withMediaSink(target, (sink) => sink.joinRoom(channel, true));
      return;
    }
    if (cmd === '/hangup' || cmd === '/hup') {
      withMediaSink(target, (sink) => sink.hangup());
      return;
    }
    if (cmd === '/clear') {
      clearLines(target);
      return;
    }
    // IRCX client-side commands (orochi servers only)
    if (isActiveOrochi()) {
      if (cmd === '/whisper' || cmd === '/w') {
        const channel = buffersState.buffers[target]?.buffer.localVars['channel'];
        const nick = parts[1];
        if (channel && nick) {
          const msg = parts.slice(2).join(' ');
          if (msg) sendWhisper(channel, nick, msg);
        }
        return;
      }
      if (cmd === '/prop') {
        const propTarget = parts[1];
        if (propTarget) {
          if (parts.length >= 4 && parts[2]) {
            setProp(propTarget, parts[2], parts.slice(3).join(' '));
          } else {
            requestProps(propTarget);
          }
        }
        return;
      }
      if (cmd === '/access') {
        const ch = parts[1];
        if (ch) requestAccess(ch);
        return;
      }
      if (cmd === '/chaninfo') {
        const ch = parts[1] ?? buffersState.buffers[target]?.buffer.localVars['channel'];
        if (ch) openChannelInfo(ch);
        return;
      }
      if (cmd === '/profile') {
        const nick = parts[1];
        if (nick) openUserProfile(nick);
        return;
      }
      if (cmd === '/services') {
        openServicesPanel('nick');
        return;
      }
      if (cmd === '/pushset') {
        const key = parts[1];
        if (key && parts[2]) {
          sendPushSet(key, parts.slice(2).join(' '));
        }
        return;
      }
    }
    // MONITOR works on any IRCv3 server
    if (cmd === '/monitor') {
      const sub = parts[1]?.toLowerCase();
      const nick = parts[2];
      if (sub === 'add' && nick) {
        monitorAdd(nick);
      } else if (sub === 'del' && nick) {
        monitorRemove(nick);
      }
      return;
    }
  }

  // Optimistic local echo for non-commands (IRC buffers only)
  if (!text.startsWith('/') && !text.startsWith('\x01')) {
    const entry = buffersState.buffers[target];
    if (entry?.lines.some((l) => l.id.startsWith('_opt_') && l.message === text)) {
      return;
    }
    const entryType = entry?.buffer.localVars['type'] ?? '';
    const isIrcBuf = entryType === 'channel' || entryType === 'private' || entryType === 'server';
    const nick = entry && isIrcBuf ? ownNick(entry) : '';
    if (nick && entry) {
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

  if (text.startsWith('/')) {
    const joinMatch = text.match(/^\/join\s+([^\s]+)/i);
    if (joinMatch?.[1]) {
      let ch = joinMatch[1];
      if (!ch.startsWith('#') && !ch.startsWith('&')) ch = '#' + ch;
      pendingJoinChannel = ch.toLowerCase();
    }
  }

  sendTo(target, text);
}

/** Send raw input text to a specific buffer via the relay. */
export function sendTo(bufferPointer: string, text: string): void {
  if (!client) return;
  client.sendInput(bufferPointer, text);
}

/**
 * Request `count` older lines for a buffer (default: active). Requests
 * existing + count from the end so dedup leaves `count` new older lines.
 */
export function requestHistory(count = 100, pointer?: string): void {
  const target = pointer ?? buffersState.activeBuffer;
  if (!client || !target) return;
  setLoading(target, true);

  const existing = buffersState.buffers[target];
  const haveCount = existing?.lines.filter((l) => !l.id.startsWith('_opt_')).length ?? 0;
  client.requestHistory(target, haveCount + count);
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
