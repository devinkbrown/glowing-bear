// Bridge store — status/identity of the direct Onyx Server WS session, plus the
// UI-facing bridge API: typing, reaction tags, read-marker sync, E2EE DMs.
//
// This module owns only the reactive state and the API surface. The socket
// lifecycle (IRCClient, reconnect backoff, channel mirroring, inbound message
// routing) lives in src/core/bridge.ts, which installs itself through the
// BridgeBackend seam below — so this module never imports the controller and
// the import graph stays acyclic (core → state, never the reverse).

import { createStore, produce, reconcile } from 'solid-js/store';
import { isEnvelope, openDm, sealDm } from '@/lib/e2ee/dmCipher';
import {
  dmTrustRepository,
  fingerprintDmKey,
  type DmTrustRecord,
} from '@/lib/e2ee/trustRepository';
import { settings } from './settings';
import { addLocalSystemLine, addReaction, buffersState } from './buffers';
import { recordDiagnosticEvent } from '@/lib/diagnosticsEvents';

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

export type BridgeStatus = 'off' | 'connecting' | 'ready' | 'error';

interface BridgeStateShape {
  status: BridgeStatus;
  /** Our nick on the bridge session (post-433 alias included), null when off. */
  nick: string | null;
  /** Last connection/auth error message, or null. */
  error: string | null;
  /** True when our E2EE device key exists and has been published this session. */
  e2eeReady: boolean;
}

const [bridgeState, setBridgeStateStore] = createStore<BridgeStateShape>({
  status: 'off',
  nick: null,
  error: null,
  e2eeReady: false,
});

/** Read-only bridge session state. Mutated only by the bridge controller. */
export { bridgeState };

/** Internal: controller-side state updates (src/core/bridge.ts only). */
export function _setBridgeState(partial: Partial<BridgeStateShape>): void {
  setBridgeStateStore(partial);
  if (partial.status) recordDiagnosticEvent('bridge-state', partial.status);
  // The session is the trust boundary for E2EE key/plaintext material: as soon
  // as the bridge goes 'off' (disconnect / teardown / bridge disable) drop all
  // decrypted plaintext, cached peer keys and parked envelopes so nothing
  // leaks into (or is matched against) a later, different session.
  if (partial.status === 'off') _resetBridgeCrypto();
}

// ---------------------------------------------------------------------------
// Backend seam (installed by src/core/bridge.ts)
// ---------------------------------------------------------------------------

/** What the controller exposes to this module's API functions. */
export interface BridgeBackend {
  /** True when the bridge socket is connected and past 001. */
  ready(): boolean;
  /** Our current nick on the bridge session, or null. */
  ownNick(): string | null;
  /** Onyx Server target (channel, or DM nick) for a relay buffer pointer, or null. */
  targetForBuffer(bufferPtr: string): string | null;
  sendTagmsg(target: string, tags: Record<string, string>): boolean;
  sendPrivmsg(target: string, text: string): boolean;
  sendRaw(command: string, ...params: string[]): boolean;
  /** Fire `METADATA <nick> GET ocean.dm-key` (controller throttles repeats). */
  requestPeerDmKey(nick: string): void;
  /** Run when ready — connects on demand and queues the action until 001. */
  ensureReady(action: () => void): void;
}

let backend: BridgeBackend | null = null;

/** Internal: install (or clear) the controller backend. */
export function _setBridgeBackend(b: BridgeBackend | null): void {
  backend = b;
}

const BRIDGE_REQUIRED_MSG =
  'voice/video requires the onyx-server bridge (enable in Settings → Bridge)';

/**
 * Run an action once the bridge session is ready. Connects on demand when the
 * bridge is enabled but not yet up; surfaces the settings notice when it is
 * disabled or the controller has not been initialised.
 */
export function bridgeRun(action: () => void): void {
  if (backend) {
    backend.ensureReady(action);
    return;
  }
  const target = buffersState.activeBuffer;
  if (target) addLocalSystemLine(target, BRIDGE_REQUIRED_MSG);
}

// ---------------------------------------------------------------------------
// Typing / reactions / read markers
// ---------------------------------------------------------------------------

/** Send a `@+typing=<state>` TAGMSG to the buffer's mapped Onyx Server target. */
export function sendTyping(bufferPtr: string, state: 'active' | 'paused' | 'done'): void {
  if (!backend?.ready()) return;
  const target = backend.targetForBuffer(bufferPtr);
  if (!target) return;
  backend.sendTagmsg(target, { '+typing': state });
}

/**
 * React to a message: `@+draft/react=<emoji>;+draft/reply=<msgid> TAGMSG`,
 * then apply the reaction locally only after the socket accepts the frame
 * (buffers.addReaction dedupes the nick per emoji, so the relay/bridge echo
 * cannot double it).
 */
export function sendReactionTag(bufferPtr: string, msgid: string, emoji: string): void {
  if (!backend?.ready()) return;
  const target = backend.targetForBuffer(bufferPtr);
  if (!target) return;
  const accepted = backend.sendTagmsg(target, { '+draft/react': emoji, '+draft/reply': msgid });
  if (!accepted) return;
  const nick = backend.ownNick() ?? bridgeState.nick;
  if (nick) addReaction(bufferPtr, msgid, emoji, nick);
}

/**
 * Publish a read marker for the buffer's mapped target (cross-device read
 * sync via IRCv3 draft/read-marker). Call on buffer activation.
 */
export function markRead(bufferPtr: string): void {
  if (!backend?.ready()) return;
  const target = backend.targetForBuffer(bufferPtr);
  if (!target) return;
  backend.sendRaw('MARKREAD', target, `timestamp=${new Date().toISOString()}`);
}

// ---------------------------------------------------------------------------
// E2EE DMs (Tsumugi static-static envelopes over PRIVMSG)
// ---------------------------------------------------------------------------

/** nick (lowercased) → published device public key (METADATA ocean.dm-key). */
const [peerKeys, setPeerKeys] = createStore<Record<string, string>>({});

export type DmTrustStatus = 'unavailable' | 'loading' | 'unverified' | 'verified' | 'changed';

export interface DmPeerSecurity {
  nick: string;
  status: DmTrustStatus;
  currentFingerprint: string | null;
  pinnedFingerprint: string | null;
  verifiedAt: number | null;
}

const EMPTY_DM_SECURITY: DmPeerSecurity = {
  nick: '',
  status: 'unavailable',
  currentFingerprint: null,
  pinnedFingerprint: null,
  verifiedAt: null,
};

/** Reactive, session-observed key state. Verified pins themselves persist in IndexedDB. */
const [dmSecurity, setDmSecurity] = createStore<Record<string, DmPeerSecurity>>({});
let bridgeCryptoScope = '';
let peerKeyVersion = 0;
const peerKeyVersions = new Map<string, number>();

/** Current peer security state; safe to read from tracked Solid computations. */
export function dmSecurityFor(nick: string): DmPeerSecurity {
  return dmSecurity[nick.toLowerCase()] ?? { ...EMPTY_DM_SECURITY, nick };
}

/** Internal: scope trust pins to the authenticated Onyx Server endpoint and account. */
export function _setBridgeCryptoScope(scope: string | null): void {
  bridgeCryptoScope = scope?.trim() ?? '';
  for (const [nick, key] of Object.entries(peerKeys)) void resolvePeerSecurity(nick, key);
}

function applyResolvedPeerSecurity(
  nick: string,
  key: string,
  fingerprint: string | null,
  pinned: DmTrustRecord | null,
): void {
  const current = peerKeys[nick];
  if (current !== key) return;
  const status: DmTrustStatus = !fingerprint
    ? 'unavailable'
    : !pinned
      ? 'unverified'
      : pinned.publicKey === key
        ? 'verified'
        : 'changed';
  setDmSecurity(nick, {
    nick,
    status,
    currentFingerprint: fingerprint,
    pinnedFingerprint: pinned?.fingerprint ?? null,
    verifiedAt: pinned?.verifiedAt ?? null,
  });
}

async function resolvePeerSecurity(nick: string, key: string): Promise<void> {
  const version = ++peerKeyVersion;
  peerKeyVersions.set(nick, version);
  setDmSecurity(nick, {
    nick,
    status: 'loading',
    currentFingerprint: null,
    pinnedFingerprint: null,
    verifiedAt: null,
  });
  const fingerprint = await fingerprintDmKey(key);
  const scope = bridgeCryptoScope;
  const pinned = scope ? await dmTrustRepository.get(scope, nick) : null;
  if (peerKeyVersions.get(nick) !== version || peerKeys[nick] !== key) return;
  applyResolvedPeerSecurity(nick, key, fingerprint, pinned);
}

/** Pin the currently observed peer key after the user compares its fingerprint. */
export async function verifyPeerDmKey(nick: string): Promise<boolean> {
  const peer = nick.toLowerCase();
  const key = peerKeys[peer];
  const scope = bridgeCryptoScope;
  if (!key || !scope) return false;
  const version = ++peerKeyVersion;
  peerKeyVersions.set(peer, version);
  const fingerprint = await fingerprintDmKey(key);
  if (!fingerprint || peerKeyVersions.get(peer) !== version ||
      peerKeys[peer] !== key || bridgeCryptoScope !== scope) return false;
  const verifiedAt = Date.now();
  const saved = await dmTrustRepository.put({
    scope,
    peer,
    publicKey: key,
    fingerprint,
    verifiedAt,
  });
  if (!saved || peerKeyVersions.get(peer) !== version ||
      peerKeys[peer] !== key || bridgeCryptoScope !== scope) return false;
  setDmSecurity(peer, {
    nick: peer,
    status: 'verified',
    currentFingerprint: fingerprint,
    pinnedFingerprint: fingerprint,
    verifiedAt,
  });
  return true;
}

/** Remove the local trust pin without changing the peer's published key. */
export async function forgetPeerDmTrust(nick: string): Promise<boolean> {
  const peer = nick.toLowerCase();
  const scope = bridgeCryptoScope;
  if (!scope) return false;
  const removed = await dmTrustRepository.delete(scope, peer);
  const key = peerKeys[peer];
  if (removed && key) void resolvePeerSecurity(peer, key);
  return removed;
}

/**
 * Decrypted plaintext overlays keyed BOTH ways:
 *   `m:<msgid>`      — matches relay lines carrying the msgid tag
 *   `c:<ciphertext>` — matches by exact envelope text (echoes, history)
 */
const [overlays, setOverlays] = createStore<Record<string, string>>({});

/**
 * Retention window for decrypted-DM plaintext held in memory this session.
 * Mirrors buffers' MAX_LINES: even inside one long-lived tab the overlay index
 * (and the attempted-envelope guard) must not grow without bound, or decrypted
 * plaintext of every DM ever seen stays resident for the tab's whole life.
 */
const MAX_OVERLAYS = 5000;

/**
 * Envelopes we already tried against every known key (avoid re-scheduling),
 * as an insertion-ordered Map so it can be FIFO-bounded — a decrypt that FAILS
 * (no matching key) still records the cipher here, so an unbounded set would
 * leak one entry per undecryptable envelope for the life of the session.
 */
const attemptedCiphers = new Map<string, true>();

/** FIFO record of stored overlays so the oldest plaintext is evicted at the cap. */
const overlayOrder: Array<{ keys: string[]; cipher: string }> = [];

/** Mark an envelope as attempted, evicting the oldest guard entry past the cap. */
function markAttempted(cipher: string): void {
  if (attemptedCiphers.has(cipher)) return;
  attemptedCiphers.set(cipher, true);
  if (attemptedCiphers.size > MAX_OVERLAYS) {
    const oldest = attemptedCiphers.keys().next().value;
    if (oldest !== undefined) attemptedCiphers.delete(oldest);
  }
}

/** peer (lowercased) → encrypted DMs parked until their key arrives. */
const pendingByPeer = new Map<string, Array<{ msgid?: string; cipher: string }>>();
const MAX_PENDING_PER_PEER = 200;

/**
 * Internal: wipe all per-session E2EE state — cached peer device keys, both
 * decrypted-plaintext overlay indexes, the attempted-envelope guard set, and
 * any envelopes parked awaiting a key. Called from `_setBridgeState` whenever
 * the session drops to 'off' so decrypted plaintext never outlives the
 * conversation and stale peer keys cannot bleed across a reconnect or a switch
 * to a different relay/bridge server.
 */
export function _resetBridgeCrypto(): void {
  setPeerKeys(reconcile({}));
  setDmSecurity(reconcile({}));
  peerKeyVersions.clear();
  setOverlays(reconcile({}));
  overlayOrder.length = 0;
  attemptedCiphers.clear();
  pendingByPeer.clear();
}

/** Internal (tests only): live sizes of the bounded per-session crypto state. */
export function _bridgeCryptoSizes(): {
  overlayKeys: number;
  overlayRecords: number;
  attempted: number;
  peerKeys: number;
  pendingPeers: number;
} {
  return {
    overlayKeys: Object.keys(overlays).length,
    overlayRecords: overlayOrder.length,
    attempted: attemptedCiphers.size,
    peerKeys: Object.keys(peerKeys).length,
    pendingPeers: pendingByPeer.size,
  };
}

/** True when the peer's E2EE device key is known (reactive). */
export function canE2ee(nick: string): boolean {
  return peerKeys[nick.toLowerCase()] !== undefined;
}

/** Ask Onyx Server for the peer's current published device key. */
export function refreshPeerDmKey(nick: string): void {
  if (backend?.ready() && nick.trim()) backend.requestPeerDmKey(nick);
}

/** Internal: record a decrypted plaintext under both overlay keys. */
export function _storeDecryptedOverlay(
  msgid: string | undefined,
  cipher: string,
  plaintext: string,
): void {
  const keys: string[] = [];
  setOverlays(produce((o) => {
    if (msgid) { o[`m:${msgid}`] = plaintext; keys.push(`m:${msgid}`); }
    o[`c:${cipher}`] = plaintext; keys.push(`c:${cipher}`);
  }));
  overlayOrder.push({ keys, cipher });
  // Bound the session-resident plaintext: evict oldest records past the window.
  while (overlayOrder.length > MAX_OVERLAYS) {
    const old = overlayOrder.shift()!;
    setOverlays(produce((o) => { for (const k of old.keys) delete o[k]; }));
    // Drop the guard too so a still-visible envelope can cleanly re-decrypt
    // (decryptedFor re-schedules only when the cipher is not marked attempted).
    attemptedCiphers.delete(old.cipher);
  }
}

async function decryptWith(peerKey: string, msgid: string | undefined, cipher: string): Promise<void> {
  const plain = await openDm(peerKey, cipher);
  if (plain != null) _storeDecryptedOverlay(msgid, cipher, plain);
}

async function tryDecryptWithKnownKeys(msgid: string | undefined, cipher: string): Promise<void> {
  for (const key of Object.values(peerKeys)) {
    const plain = await openDm(key, cipher);
    if (plain != null) {
      _storeDecryptedOverlay(msgid, cipher, plain);
      return;
    }
  }
}

/**
 * Plaintext overlay for a message line. Reactive: returns the decrypted text
 * when known (by msgid first, then by exact ciphertext), else null. A yet
 * unseen envelope schedules a one-shot background decrypt against every known
 * peer key (covers relay-delivered history the bridge never saw as PRIVMSG) —
 * tracked callers re-run when the overlay lands.
 */
export function decryptedFor(msgid: string | undefined, text: string): string | null {
  if (msgid) {
    const byId = overlays[`m:${msgid}`];
    if (byId !== undefined) return byId;
  }
  const byCipher = overlays[`c:${text}`];
  if (byCipher !== undefined) return byCipher;
  if (isEnvelope(text) && !attemptedCiphers.has(text)) {
    markAttempted(text);
    void tryDecryptWithKnownKeys(msgid, text);
  }
  return null;
}

/** Internal: peer key learned (or cleared) via METADATA — flush parked DMs. */
export function _setPeerDmKey(nick: string, keyB64: string | null): void {
  const lc = nick.toLowerCase();
  if (!keyB64) {
    setPeerKeys(produce((o) => { delete o[lc]; }));
    setDmSecurity(produce((o) => { delete o[lc]; }));
    peerKeyVersions.delete(lc);
    return;
  }
  setPeerKeys(lc, keyB64);
  void resolvePeerSecurity(lc, keyB64);
  const parked = pendingByPeer.get(lc);
  if (parked) {
    pendingByPeer.delete(lc);
    for (const p of parked) void decryptWith(keyB64, p.msgid, p.cipher);
  }
}

/**
 * Internal: inbound encrypted DM from the bridge socket. Decrypts immediately
 * when the peer key is cached, else parks it and requests the key — the
 * METADATA reply flushes the parked queue.
 */
export function _ingestEncryptedDm(peerNick: string, msgid: string | undefined, cipher: string): void {
  if (!isEnvelope(cipher)) return;
  const lc = peerNick.toLowerCase();
  const key = peerKeys[lc];
  if (key) {
    void decryptWith(key, msgid, cipher);
    return;
  }
  const parked = pendingByPeer.get(lc) ?? [];
  if (parked.length < MAX_PENDING_PER_PEER) parked.push({ msgid, cipher });
  pendingByPeer.set(lc, parked);
  backend?.requestPeerDmKey(peerNick);
}

/**
 * Seal plaintext for the peer and send it as a PRIVMSG over the bridge.
 * Returns false when impossible (bridge not ready, E2EE disabled, peer key
 * unknown — a key fetch is kicked off — or sealing failed).
 */
export async function sendE2eeDm(nick: string, text: string): Promise<boolean> {
  if (!backend?.ready() || !settings.bridge.e2eeDms) return false;
  const key = peerKeys[nick.toLowerCase()];
  if (!key) {
    backend.requestPeerDmKey(nick);
    return false;
  }
  const envelope = await sealDm(key, text);
  if (!envelope || !backend.ready()) return false;
  if (!backend.sendPrivmsg(nick, envelope)) return false;
  // Our own echo (relay or bridge) carries only ciphertext — overlay it now.
  _storeDecryptedOverlay(undefined, envelope, text);
  return true;
}
