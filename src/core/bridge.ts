// BridgeController — the persistent direct orochi WebSocket session.
//
// Chat rides the WeeChat relay; this bridge is a SECOND, direct IRC-over-WS
// session to the orochi server that carries what the relay cannot:
//   • voice/video media (the Suimyaku engine mounts on this client)
//   • typing indicators + reaction tags (TAGMSG, both directions)
//   • cross-device read-marker sync (MARKREAD)
//   • E2EE DMs (Tsumugi envelopes over PRIVMSG + METADATA ocean.dm-key)
//
// Activation: settings.bridge.enabled AND (an orochi server was detected on
// the relay OR an endpoint is pinned via settings.bridge.wsUrl / VITE_IRC_WS).
// Detection is latched for the app session so a relay blip never tears down a
// live call. The controller reports into src/state/bridge.ts (bridgeState) and
// installs itself as that module's BridgeBackend, as the relay's
// MediaCommandSink, and as its RelayObserver.

import { createEffect, createRoot, createSignal } from 'solid-js';
import { IRCClient } from '@/lib/irc/client';
import type { IRCMessage } from '@/lib/irc/types';
import {
  parseSaslSessionTokenNotice,
  parseSessionMeshTokenNote,
  parseSessionTokenNote,
  type SaslSessionTokenNotice,
} from '@/lib/irc/parser';
import { NODES, nodeFromWssGateway, selectBestNode, type IrcNode } from '@/lib/irc/nodes';
import {
  clearSaslSessionToken,
  loadCredentials,
  saveCredentials,
  storeMeshToken,
  storeSaslSessionToken,
  storeSessionToken,
} from '@/lib/credentials';
import { deviceKeys, isEnvelope } from '@/lib/e2ee/dmCipher';
import type { BufferEntry, Reaction } from '@/types';
import {
  addLocalSystemLine,
  addReaction,
  buffersState,
  clearUnread,
  setReadMarker,
  setTyping,
} from '@/state/buffers';
import { setMediaSink, setRelayObserver } from '@/state/connection';
import { ircxState } from '@/state/ircx';
import { parseReadMarkerTimestamp, recordReadMarker } from '@/state/threads';
import { settings } from '@/state/settings';
import {
  _collectPreferenceMetadata,
  _finishPreferenceMetadataCollection,
  _preferenceTransportReady,
  _preferenceTransportUnavailable,
  _setPreferenceSyncTransport,
  initPreferenceSync,
  type PreferenceSyncTransport,
} from '@/state/preferenceSync';
import {
  _ingestEncryptedDm,
  _resetBridgeCrypto,
  _setBridgeBackend,
  _setBridgeCryptoScope,
  _setBridgeState,
  _setPeerDmKey,
  type BridgeBackend,
} from '@/state/bridge';
import {
  _attachBridgeClient,
  _setMediaAvailable,
  _setMediaTransportConnected,
  hangup as mediaHangup,
  requestRoomJoin as mediaJoinRoom,
  requestStartCall as mediaStartCall,
} from '@/state/media';

const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const DM_KEY_METADATA = 'ocean.dm-key';
const KEY_REQUEST_THROTTLE_MS = 30_000;
const BRIDGE_DISABLED_MSG =
  'voice/video requires the orochi bridge (enable in Settings → Bridge)';

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** Activation predicate: enabled AND (orochi seen on the relay OR pinned). */
export function bridgeShouldRun(enabled: boolean, orochiDetected: boolean, pinnedUrl: string): boolean {
  return enabled && (orochiDetected || pinnedUrl.trim().length > 0);
}

/** IRC server name a relay buffer belongs to ('' when indeterminable). */
export function serverNameOf(entry: BufferEntry): string {
  const vars = entry.buffer.localVars;
  const direct = vars['server'] ?? vars['network'] ?? '';
  if (direct) return direct;
  const n = entry.buffer.name ?? '';
  const serverBuf = n.match(/^irc\.server\.(.+)$/);
  if (serverBuf?.[1]) return serverBuf[1];
  const chanBuf = n.match(/^irc\.([^.]+)\./);
  if (chanBuf?.[1]) return chanBuf[1];
  return '';
}

/**
 * Our own nick on the relay's orochi connection: the `nick` local var of a
 * server buffer belonging to a detected orochi server (any server buffer when
 * detection hasn't happened, e.g. pinned-endpoint mode). Null when unknown.
 */
export function relayOwnNick(
  buffers: Record<string, BufferEntry>,
  orochiServers: ReadonlySet<string>,
): string | null {
  for (const e of Object.values(buffers)) {
    if (e.buffer.localVars['type'] !== 'server') continue;
    const sn = serverNameOf(e).toLowerCase();
    if (orochiServers.size > 0 && !orochiServers.has(sn)) continue;
    const nick = e.buffer.localVars['nick'];
    if (nick) return nick;
  }
  return null;
}

/** All channel buffers on detected orochi servers → [channelLower, ptr, name]. */
export function sweepChannelBuffers(
  buffers: Record<string, BufferEntry>,
  orochiServers: ReadonlySet<string>,
): Array<{ channel: string; ptr: string }> {
  const out: Array<{ channel: string; ptr: string }> = [];
  for (const e of Object.values(buffers)) {
    if (e.buffer.localVars['type'] !== 'channel') continue;
    const sn = serverNameOf(e).toLowerCase();
    if (!sn || !orochiServers.has(sn)) continue;
    const channel = e.buffer.localVars['channel'] ?? e.buffer.shortName ?? e.buffer.name;
    if (channel) out.push({ channel, ptr: e.buffer.id });
  }
  return out;
}

/** Relay buffer pointer for a channel opened on a named server, or null. */
export function findChannelPtr(
  buffers: Record<string, BufferEntry>,
  serverName: string,
  channel: string,
): string | null {
  const snLc = serverName.toLowerCase();
  const chLc = channel.toLowerCase();
  for (const e of Object.values(buffers)) {
    if (e.buffer.localVars['type'] !== 'channel') continue;
    if (serverNameOf(e).toLowerCase() !== snLc) continue;
    const ch = (e.buffer.localVars['channel'] ?? e.buffer.shortName ?? e.buffer.name).toLowerCase();
    if (ch === chLc) return e.buffer.id;
  }
  return null;
}

/**
 * Map an orochi target to its relay buffer pointer: channels through the
 * mirrored channel map, DM nicks through the relay's private buffers.
 */
export function resolveMappedPtr(
  channelMap: ReadonlyMap<string, string>,
  buffers: Record<string, BufferEntry>,
  target: string,
): string | null {
  const key = target.toLowerCase();
  const mapped = channelMap.get(key);
  if (mapped) return mapped;
  if (target.startsWith('#') || target.startsWith('&')) return null;
  for (const e of Object.values(buffers)) {
    const vars = e.buffer.localVars;
    if (vars['type'] !== 'private') continue;
    const ch = (vars['channel'] ?? e.buffer.shortName ?? '').toLowerCase();
    if (ch === key) return e.buffer.id;
  }
  return null;
}

/**
 * Resolve an inbound IRCv3 `draft/read-marker` MARKREAD to the threads-store
 * record it should fold into, or null when there is nothing to record — the
 * server reported no marker (null / `*`), an unparseable timestamp (fails
 * closed rather than trusting a malformed instant), or an unmapped target.
 *
 * Keyed strictly by the resolved relay buffer pointer — a SINGLE key domain, so
 * a future consumer keying by pointer never misses a value stored under a raw
 * wire name. An unmapped target is dropped (returns null): the SEND side
 * (`markRead`) is likewise mapped-only, and a consumer re-queries on buffer open
 * once the mapping exists. The monotonic no-rewind guard lives in
 * `recordReadMarker`.
 */
export function readMarkerRecord(
  channelMap: ReadonlyMap<string, string>,
  buffers: Record<string, BufferEntry>,
  target: string,
  timestamp: string | null,
): { bufferKey: string; ms: number } | null {
  if (!timestamp) return null;
  const ms = parseReadMarkerTimestamp(timestamp);
  if (ms === null) return null;
  const ptr = resolveMappedPtr(channelMap, buffers, target);
  return ptr ? { bufferKey: ptr, ms } : null;
}

/** True when (msgid, emoji, nick) is already recorded on the line's reactions. */
export function hasReaction(
  reactions: Record<string, Reaction[]> | undefined,
  msgid: string,
  emoji: string,
  nick: string,
): boolean {
  const list = reactions?.[msgid];
  if (!list) return false;
  const lower = nick.toLowerCase();
  return list.some((r) => r.emoji === emoji && r.nicks.some((n) => n.toLowerCase() === lower));
}

/** Last-resort bridge identity when neither relay nick nor account exist. */
export function randomGuestNick(): string {
  return `darkbear${Math.floor(1000 + Math.random() * 9000)}`;
}

export function isSecureBridgeTransport(url: string): boolean {
  try { return new URL(url).protocol === 'wss:'; } catch { return false; }
}

/** Plain WS is reserved for credential-free local development only. */
export function isLoopbackBridgeTransport(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'ws:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

export const INSECURE_BRIDGE_TRANSPORT_ERROR =
  'Orochi bridge requires wss://; ws:// is allowed only for unauthenticated loopback endpoints.';

/**
 * Production endpoints must use WSS. The sole exception is a loopback WS
 * endpoint with no password or bearer/reclaim credential attached.
 */
export function bridgeTransportAllowed(url: string, hasCredentials: boolean): boolean {
  if (isSecureBridgeTransport(url)) return true;
  if (hasCredentials) return false;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
  } catch {
    return false;
  }
  return isLoopbackBridgeTransport(url);
}

// ---------------------------------------------------------------------------
// Controller state
// ---------------------------------------------------------------------------

let initialized = false;
let client: IRCClient | null = null;
let welcomed = false;
let starting = false;
let generation = 0;
let backoffMs = BACKOFF_MIN_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentUrl = '';
let pendingSaslSessionToken: SaslSessionTokenNotice | null = null;
let bridgeReauthRequired = false;
/** Exact raw IRC prefix authenticated by this connection's 001 / SASL success. */
let authenticatedServerPrefix: string | null = null;

/** Detected orochi server names (lowercased), latched for the app session. */
const orochiServers = new Set<string>();
const orochiGateways = new Set<string>();
const [orochiDetected, setOrochiDetected] = createSignal(false);

/** channelLower → relay buffer pointer (inbound mapping). */
const chanToPtr = new Map<string, string>();
/** channelLower → original-case channel name (for JOINs). */
const chanNames = new Map<string, string>();
/** relay buffer pointer → channel name (outbound mapping). */
const ptrToChan = new Map<string, string>();

/** Media actions queued while the on-demand connect is still registering. */
const pendingActions: Array<() => void> = [];

/** nick(lower) → last `METADATA GET ocean.dm-key` timestamp (throttle). */
const keyRequests = new Map<string, number>();

function pinnedUrl(): string {
  return settings.bridge.wsUrl.trim() || (import.meta.env.VITE_IRC_WS ?? '').trim();
}

// ---------------------------------------------------------------------------
// Channel mirroring
// ---------------------------------------------------------------------------

function trackChannel(channel: string, ptr: string): void {
  const lc = channel.toLowerCase();
  const known = chanToPtr.has(lc);
  chanToPtr.set(lc, ptr);
  chanNames.set(lc, channel);
  ptrToChan.set(ptr, channel);
  if (!known && welcomed && client && !client.sessionSyncActive) client.join(channel);
}

function noteOrochiServer(serverName: string, wssGateway?: string): void {
  orochiServers.add(serverName.toLowerCase());
  if (wssGateway) orochiGateways.add(wssGateway);
  setOrochiDetected(true);
  for (const { channel, ptr } of sweepChannelBuffers(buffersState.buffers, orochiServers)) {
    trackChannel(channel, ptr);
  }
}

function noteChannelBuffer(serverName: string, channel: string): void {
  // The observer only fires for known-orochi servers, so latch detection too.
  orochiServers.add(serverName.toLowerCase());
  setOrochiDetected(true);
  const ptr = findChannelPtr(buffersState.buffers, serverName, channel);
  if (ptr) trackChannel(channel, ptr);
}

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

function resolveIdentityNick(): string {
  const relayNick = relayOwnNick(buffersState.buffers, orochiServers);
  if (relayNick) return relayNick;
  const account = settings.bridge.account.trim();
  if (account) return account;
  return randomGuestNick();
}

function connectTo(url: string): void {
  pendingSaslSessionToken = null;
  bridgeReauthRequired = false;
  authenticatedServerPrefix = null;
  const nick = resolveIdentityNick();
  const account = settings.bridge.account.trim();
  const password = settings.bridge.password;
  const creds = loadCredentials(url, nick);
  const hasCredentials = Boolean(
    password || creds?.saslSessionToken || creds?.sessionToken || creds?.meshToken,
  );
  if (!bridgeTransportAllowed(url, hasCredentials)) {
    currentUrl = '';
    pendingActions.length = 0;
    _setBridgeState({ status: 'error', error: INSECURE_BRIDGE_TRANSPORT_ERROR });
    return;
  }
  currentUrl = url;
  const secureTransport = isSecureBridgeTransport(url);
  const tokenMatchesAccount = Boolean(
    secureTransport && creds?.saslSessionToken &&
    (!account || !creds.saslAccount || creds.saslAccount.toLowerCase() === account.toLowerCase()),
  );
  const saslSessionToken = tokenMatchesAccount ? creds?.saslSessionToken : undefined;
  const authAccount = saslSessionToken ? (creds?.saslAccount || account || nick) : account;
  const usePassword = Boolean(account && password);

  const c = new IRCClient({
    url,
    nick,
    account: authAccount || undefined,
    realname: `${nick} (DarkBear bridge)`,
    password: usePassword ? password : undefined,
    saslSessionToken,
    sessionToken: creds?.sessionToken,
    meshToken: creds?.meshToken,
    // The primary handler is unused — everything routes through the
    // extraMessageHandlers fan-out (shared with the media engine).
    onMessage: () => {},
    onConnected: onWelcome,
    onDisconnected: onDrop,
    onError: (err) => { _setBridgeState({ error: err }); },
    onSaslSessionTokenRejected: (willRetryWithPassword) => {
      clearSaslSessionToken(url, nick);
      bridgeReauthRequired = !willRetryWithPassword;
    },
    onNickChanged: (n) => { _setBridgeState({ nick: n }); },
    onReadMarker: foldReadMarker,
  });
  c.extraMessageHandlers.add(onBridgeMessage);
  client = c;
  _setBridgeState({ status: 'connecting', nick });
  // The media engine registers its own EVENT MEDIA + binary
  // handlers on this client — it consumes the media planes itself.
  _attachBridgeClient(c);
  c.connect();
}

async function startBridge(): Promise<void> {
  const pinned = pinnedUrl();
  if (client) {
    if (!pinned || currentUrl === pinned) return; // already running
    // Pinned endpoint changed — swap sessions.
    teardownClient();
    _setBridgeCryptoScope(null);
    _resetBridgeCrypto();
  }
  if (starting) return;
  starting = true;
  const gen = ++generation;
  _setBridgeState({ status: 'connecting', error: null });
  let url = pinned;
  if (!url) {
    try {
      const detected = [...orochiGateways]
        .map((wss, i) => nodeFromWssGateway(wss, `detected-${i}`))
        .filter((node): node is IrcNode => node !== null);
      url = (await selectBestNode([...detected, ...NODES])).wss;
    } catch {
      url = '';
    }
  }
  starting = false;
  if (gen !== generation || client) return; // stopped or superseded meanwhile
  if (!url) {
    _setBridgeState({ status: 'error', error: 'no bridge endpoint available' });
    return;
  }
  connectTo(url);
}

function teardownClient(): void {
  welcomed = false;
  authenticatedServerPrefix = null;
  _preferenceTransportUnavailable();
  if (client) {
    client.extraMessageHandlers.delete(onBridgeMessage);
    _attachBridgeClient(null);
    client.destroy();
    client = null;
  }
  _setMediaAvailable(false);
}

function stopBridge(): void {
  generation++;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  backoffMs = BACKOFF_MIN_MS;
  pendingActions.length = 0;
  teardownClient();
  _setBridgeCryptoScope(null);
  _setBridgeState({ status: 'off', error: null, e2eeReady: false });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = backoffMs;
  backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    // Fresh dial on the same client/identity; a bridge disable in the
    // meantime tears the client down and this becomes a no-op.
    client?.connect();
  }, delay);
}

function serverPrefix(msg: IRCMessage): string | null {
  const prefix = msg.prefix;
  // Compare the raw prefix. Do not use parser nick/host classification here:
  // that classification's dotted-name heuristic is for display, not trust.
  if (!prefix || prefix.includes('!') || prefix.includes('@')) return null;
  return prefix;
}

function targetsCurrentNick(msg: IRCMessage): boolean {
  const target = msg.params[0];
  return Boolean(target && client && target.toLowerCase() === client.currentNick.toLowerCase());
}

function onWelcome(welcome: IRCMessage): void {
  const c = client;
  if (!c) return;
  // IRCClient invokes this callback only from its 001 handler. Bind the exact
  // raw prefix so user-authored NOTICEs cannot mint stored bearer credentials.
  if (welcome.command === '001' && targetsCurrentNick(welcome)) {
    authenticatedServerPrefix = serverPrefix(welcome);
  }
  welcomed = true;
  backoffMs = BACKOFF_MIN_MS;
  const trustAccount = settings.bridge.account.trim() || c.currentNick;
  _setBridgeCryptoScope(`${currentUrl}\n${trustAccount.toLowerCase()}`);
  _setBridgeState({ status: 'ready', error: null, nick: c.currentNick });
  _setMediaAvailable(true);
  _setMediaTransportConnected(true);

  // Live voice/video presence rides the IRCX EVENT plane (membership-gated
  // server-side, so `*` only yields calls in channels we are in).
  c.sendRaw('EVENT', 'ADD', 'MEDIA', '*');

  publishDeviceKey(c);
  _preferenceTransportReady(
    c.negotiatedCaps.has('draft/metadata-2') && c.loggedIn,
  );

  // Persist credentials so Orochi session tokens (NOTE SESSION TOKEN/MTOKEN)
  // have a home; tokens only ever arrive on SASL-authenticated sessions.
  const account = settings.bridge.account.trim();
  if (account && settings.bridge.password) {
    saveCredentials({
      nick: c.currentNick,
      server: currentUrl,
      password: settings.bridge.password,
      rememberPassword: settings.rememberBridgePassword,
    });
  }
  if (pendingSaslSessionToken) {
    storeSaslSessionToken(
      pendingSaslSessionToken.token,
      pendingSaslSessionToken.expiresAt,
      pendingSaslSessionToken.account,
    );
    pendingSaslSessionToken = null;
  }

  // With Orochi session-sync, the server restores channel membership and
  // history after authentication. A client-side JOIN storm races that replay
  // and can duplicate NAMES/history; only mirror explicitly on older servers.
  if (!c.sessionSyncActive) {
    for (const name of chanNames.values()) c.join(name);
  }

  // Flush media actions queued during the on-demand connect.
  const queued = pendingActions.splice(0, pendingActions.length);
  for (const action of queued) {
    try {
      action();
    } catch {
      /* one queued action must not starve the rest */
    }
  }
}

function onDrop(reason: string): void {
  welcomed = false;
  authenticatedServerPrefix = null;
  _setMediaAvailable(false);
  if (!client) return; // intentional teardown
  _setMediaTransportConnected(false);
  if (bridgeReauthRequired) {
    teardownClient();
    _setBridgeState({
      status: 'error',
      error: 'Orochi session expired. Enter the account password to reconnect.',
    });
    return;
  }
  _setBridgeState({ status: 'connecting', error: reason || null });
  scheduleReconnect();
}

function publishDeviceKey(c: IRCClient): void {
  if (!settings.bridge.e2eeDms) {
    _setBridgeState({ e2eeReady: false });
    return;
  }
  void deviceKeys().then((keys) => {
    if (!keys || client !== c) return;
    c.sendRaw('METADATA', '*', 'SET', DM_KEY_METADATA, keys.publicB64);
    _setBridgeState({ e2eeReady: true });
  });
}

// ---------------------------------------------------------------------------
// Inbound message routing (extraMessageHandlers on the bridge IRCClient)
// ---------------------------------------------------------------------------

function ownNickLower(): string {
  return (client?.currentNick ?? '').toLowerCase();
}

function handleTagmsg(msg: IRCMessage): void {
  const target = msg.params[0];
  const nick = msg.nick;
  if (!target || !nick) return;
  const isChannel = target.startsWith('#') || target.startsWith('&');
  // DM TAGMSGs target US — the relay buffer is keyed by the SENDER's nick.
  const bufTarget = isChannel ? target : nick;
  const ptr = resolveMappedPtr(chanToPtr, buffersState.buffers, bufTarget);
  if (!ptr) return;
  const fromSelf = nick.toLowerCase() === ownNickLower();

  const typing = msg.tags['+typing'];
  if (!fromSelf && (typing === 'active' || typing === 'paused' || typing === 'done')) {
    setTyping(ptr, nick, typing);
  }

  const emoji = msg.tags['+draft/react'] ?? msg.tags['+react'];
  const replyId = msg.tags['+draft/reply'] ?? msg.tags['+reply'];
  if (emoji && replyId) {
    // Dedupe: the relay may deliver the same TAGMSG (and our own optimistic
    // add already landed) — skip when (msgid, emoji, nick) is present.
    const entry = buffersState.buffers[ptr];
    if (!hasReaction(entry?.reactions, replyId, emoji, nick)) {
      addReaction(ptr, replyId, emoji, nick);
    }
  }
}

/**
 * Fold an inbound IRCv3 `draft/read-marker` MARKREAD (via the client's
 * onReadMarker callback, which pre-validates the timestamp) into the threads
 * store's per-buffer read-marker position. MARKREAD is account-scoped — the
 * server only echoes our own account's markers — so every one we receive is
 * ours to record. Separate from `handleMarkread` below, which drives the
 * unread-badge position; this owns the cross-device read-marker instant.
 */
function foldReadMarker(target: string, timestamp: string | null): void {
  const rec = readMarkerRecord(chanToPtr, buffersState.buffers, target, timestamp);
  if (rec) recordReadMarker(rec.bufferKey, rec.ms);
}

function handleMarkread(msg: IRCMessage): void {
  const target = msg.params[0];
  if (!target) return;
  // Only our own markers (server echo / other device of the same account).
  const fromSelf = !msg.nick || msg.nick.toLowerCase() === ownNickLower();
  if (!fromSelf) return;
  const param = msg.params[1] ?? '';
  if (!param || param === '*') return;
  const ptr = resolveMappedPtr(chanToPtr, buffersState.buffers, target);
  if (!ptr) return;
  clearUnread(ptr);
  setReadMarker(ptr);
}

function handlePrivmsg(msg: IRCMessage): void {
  // The relay is the display source — bridge PRIVMSGs are ignored EXCEPT
  // E2EE DM envelopes, which only this session can decrypt.
  const target = msg.params[0];
  const text = msg.params[1] ?? '';
  if (!target || !isEnvelope(text)) return;
  if (target.startsWith('#') || target.startsWith('&')) return; // DM-only
  const own = ownNickLower();
  // Inbound: sender is the peer. echo-message echo of our own send: the
  // target is the peer.
  const peer = msg.nick && msg.nick.toLowerCase() !== own ? msg.nick : target;
  if (!peer || peer.toLowerCase() === own) return;
  _ingestEncryptedDm(peer, msg.tags['msgid'], text);
}

function handleMetadataKV(target: string | undefined, key: string | undefined, value: string): void {
  if (!target || !key) return;
  if (key.toLowerCase() !== DM_KEY_METADATA) return;
  if (target.toLowerCase() === ownNickLower()) return;
  _setPeerDmKey(target, value || null);
}

function onBridgeMessage(msg: IRCMessage): void {
  // Orochi issues the fresh SESSIONTOKEN immediately after the pre-registration
  // 903, before 001 can arrive. At this point IRCClient has already validated
  // the SASL state transition and set loggedIn, making this exact numeric
  // prefix robust protocol evidence for the server on this socket.
  if (
    !welcomed && !authenticatedServerPrefix && msg.command === '903' &&
    client?.loggedIn && targetsCurrentNick(msg)
  ) {
    authenticatedServerPrefix = serverPrefix(msg);
  }

  if (
    msg.command === 'NOTICE' && isSecureBridgeTransport(currentUrl) &&
    authenticatedServerPrefix !== null && msg.prefix === authenticatedServerPrefix &&
    targetsCurrentNick(msg)
  ) {
    const saslToken = parseSaslSessionTokenNotice(msg);
    if (saslToken) {
      pendingSaslSessionToken = saslToken;
      client?.setSaslSessionToken(saslToken.token);
      // Existing profiles can persist immediately. First-login profiles do not
      // have a credential record until 001, so onWelcome repeats this safely.
      storeSaslSessionToken(saslToken.token, saslToken.expiresAt, saslToken.account);
      return;
    }
  }
  switch (msg.command) {
    case 'TAGMSG':
      handleTagmsg(msg);
      return;
    case 'MARKREAD':
      handleMarkread(msg);
      return;
    case 'PRIVMSG':
      handlePrivmsg(msg);
      return;
    // metadata-notify push: :server METADATA <Target> <Key> <Vis> :<Value>
    case 'METADATA':
      handleMetadataKV(msg.params[0], msg.params[1], msg.params[3] ?? '');
      return;
    // RPL_KEYVALUE (GET reply): :server 761 <me> <Target> <Key> <Vis> [:<Value>]
    case '761':
      if (_collectPreferenceMetadata(msg.params[2] ?? '', msg.params[4] ?? '')) return;
      handleMetadataKV(msg.params[1], msg.params[2], msg.params[4] ?? '');
      return;
    case '762':
      _finishPreferenceMetadataCollection();
      return;
    // ERR_KEYNOTSET — the peer has not published a key.
    case '766':
      handleMetadataKV(msg.params[1], msg.params[2], '');
      return;
    case 'NOTE': {
      // SESSION reclaim tokens are bearer credentials. Accept them only from
      // the exact server prefix bound by this socket's authenticated 001 and
      // only on WSS; a user-shaped or unrelated NOTE must never reach storage.
      if (
        !welcomed || !isSecureBridgeTransport(currentUrl) ||
        authenticatedServerPrefix === null || msg.prefix !== authenticatedServerPrefix
      ) return;
      const token = parseSessionTokenNote(msg);
      if (token) {
        storeSessionToken(token);
        return;
      }
      const mtoken = parseSessionMeshTokenNote(msg);
      if (mtoken) storeMeshToken(mtoken);
      return;
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Backend exposed to src/state/bridge.ts
// ---------------------------------------------------------------------------

const backend: BridgeBackend = {
  ready: () => welcomed && client !== null,

  ownNick: () => client?.currentNick ?? null,

  targetForBuffer(bufferPtr) {
    const chan = ptrToChan.get(bufferPtr);
    if (chan) return chan;
    const entry = buffersState.buffers[bufferPtr];
    if (!entry) return null;
    const vars = entry.buffer.localVars;
    if (vars['type'] !== 'private') return null;
    const nick = vars['channel'] ?? entry.buffer.shortName;
    if (!nick) return null;
    // Only DMs on a detected orochi server (any server in pinned-only mode).
    const sn = serverNameOf(entry).toLowerCase();
    if (orochiServers.size > 0 && !orochiServers.has(sn)) return null;
    return nick;
  },

  sendTagmsg(target, tags) {
    return client?.tagmsg(target, tags) ?? false;
  },

  sendPrivmsg(target, text) {
    return client?.privmsg(target, text) ?? false;
  },

  sendRaw(command, ...params) {
    return client?.sendRaw(command, ...params) ?? false;
  },

  requestPeerDmKey(nick) {
    if (!client || !welcomed) return;
    const lc = nick.toLowerCase();
    const last = keyRequests.get(lc) ?? 0;
    const now = Date.now();
    if (now - last < KEY_REQUEST_THROTTLE_MS) return;
    keyRequests.set(lc, now);
    client.sendRaw('METADATA', nick, 'GET', DM_KEY_METADATA);
  },

  ensureReady(action) {
    if (!settings.bridge.enabled) {
      const target = buffersState.activeBuffer;
      if (target) addLocalSystemLine(target, BRIDGE_DISABLED_MSG);
      return;
    }
    if (welcomed && client) {
      action();
      return;
    }
    pendingActions.push(action);
    void startBridge(); // on-demand connect; queue flushes on welcome
  },
};

const preferenceTransport: PreferenceSyncTransport = {
  ready: () => welcomed && client !== null,
  supported: () => Boolean(
    welcomed &&
    client?.negotiatedCaps.has('draft/metadata-2') &&
    client.loggedIn,
  ),
  list() {
    return client?.sendRaw('METADATA', '*', 'LIST') ?? false;
  },
  set(key, value) {
    // `secret` keeps even non-secret preferences account-private on the wire.
    return client?.sendRaw('METADATA', '*', 'SET', key, 'secret', value) ?? false;
  },
  clear(key) {
    return client?.sendRaw('METADATA', '*', 'SET', key) ?? false;
  },
};

// ---------------------------------------------------------------------------
// Reply linkage (direct-bridge send)
// ---------------------------------------------------------------------------

/**
 * A `+draft/reply` tag VALUE must be a single bare IRCv3 tag token — no
 * whitespace, `;`, CR/LF, or NUL — so a crafted parent msgid can never smuggle
 * a second tag or a second command. Fail closed (caller falls back to relay).
 */
const REPLY_MSGID_RE = /^[^\s;\r\n\x00]+$/;

/**
 * Build the `sendRaw` arguments for a `+draft/reply`-tagged PRIVMSG, or null
 * when the reply cannot be framed safely: an unsafe parent msgid (anything with
 * whitespace, `;`, CR/LF, or NUL — which could smuggle a second tag or command)
 * or a non-channel target. Pure and exported so the injection guard, the
 * channel-only scope, and the exact one-frame shape are unit-testable without
 * the live client.
 *
 * The tag+command ride in the first `sendRaw` token; `formatIRCLine`
 * space-joins it verbatim and strips CR/LF from every token, so the result is a
 * single well-formed frame `@+draft/reply=<id> PRIVMSG <target> :<text>`.
 */
export function replyRawArgs(
  target: string | null,
  text: string,
  replyMsgid: string,
): [string, string, string] | null {
  if (!REPLY_MSGID_RE.test(replyMsgid)) return null;
  if (!target || !(target.startsWith('#') || target.startsWith('&'))) return null;
  return [`@+draft/reply=${replyMsgid} PRIVMSG`, target, text];
}

/**
 * Send `text` to the buffer's mapped orochi channel as a PRIVMSG carrying the
 * IRCv3 `+draft/reply=<parentMsgid>` message tag, over the DIRECT bridge
 * session. Returns true when the tagged reply was sent, false when it could not
 * be — no live bridge, the buffer does not map to an orochi CHANNEL, or an
 * unsafe msgid — so the caller can fall back to the plain relay path.
 *
 * Relay-vs-direct boundary: the WeeChat relay is the message DISPLAY source but
 * its `input` command cannot carry IRCv3 message tags, so reply linkage rides
 * the direct orochi session (the relay's own weechat is joined to the same
 * channel and renders the resulting line as our echo). Scoped to channels — DM
 * echo/E2EE interplay is out of this slice. A first-class
 * `client.privmsg(target, text, tags)` wire helper belongs to the wire layer
 * (darkbear-wire); until it exists this controller frames the one tagged line
 * through `replyRawArgs` + `sendRaw`.
 */
export function sendReply(bufferPtr: string, text: string, replyMsgid: string): boolean {
  if (!welcomed || !client) return false;
  const args = replyRawArgs(backend.targetForBuffer(bufferPtr), text, replyMsgid);
  if (!args) return false;
  return client.sendRaw(...args);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Wire the bridge into the app. Call ONCE at startup (App root). Installs the
 * RelayObserver + MediaCommandSink seams on the connection store, the
 * BridgeBackend on the bridge state module, and a settings-reactive root that
 * starts/stops the direct orochi session as activation conditions change.
 */
export function initBridge(): void {
  if (initialized) return;
  initialized = true;

  setRelayObserver({
    onOrochiDetected(serverName, wssGateway) {
      noteOrochiServer(serverName, wssGateway);
    },
    onChannelBufferOpened(serverName, channel) {
      noteChannelBuffer(serverName, channel);
    },
  });

  setMediaSink({
    startCall(nick, video) {
      mediaStartCall(nick, video);
    },
    joinRoom(channel, video) {
      mediaJoinRoom(channel, video);
    },
    hangup() {
      mediaHangup();
    },
  });

  _setBridgeBackend(backend);
  _setPreferenceSyncTransport(preferenceTransport);
  initPreferenceSync();

  // Initial sweep: the relay may have detected orochi servers (and opened
  // channel buffers) before initBridge ran.
  for (const sn of Object.keys(ircxState.orochiServers)) noteOrochiServer(sn, ircxState.orochiGateways[sn]);

  // Settings are a Solid store — reactive tracking needs an owner scope.
  createRoot(() => {
    createEffect(() => {
      // Credential edits retrigger a token-expiry recovery after teardown.
      void settings.bridge.account;
      void settings.bridge.password;
      const active = bridgeShouldRun(
        settings.bridge.enabled,
        orochiDetected(),
        settings.bridge.wsUrl.trim() || (import.meta.env.VITE_IRC_WS ?? ''),
      );
      if (active) void startBridge();
      else stopBridge();
    });
  });
}
