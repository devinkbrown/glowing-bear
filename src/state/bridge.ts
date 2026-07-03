// Bridge store — status/identity of the direct orochi WS session, plus the
// UI-facing bridge API: typing, reaction tags, read-marker sync, E2EE DMs.
//
// This module owns only the reactive state and the API surface. The socket
// lifecycle (IRCClient, reconnect backoff, channel mirroring, inbound message
// routing) lives in src/core/bridge.ts, which installs itself through the
// BridgeBackend seam below — so this module never imports the controller and
// the import graph stays acyclic (core → state, never the reverse).

import { createStore, produce } from 'solid-js/store';
import { isEnvelope, openDm, sealDm } from '@/lib/e2ee/dmCipher';
import { settings } from './settings';
import { addLocalSystemLine, addReaction, buffersState } from './buffers';

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
  /** Orochi target (channel, or DM nick) for a relay buffer pointer, or null. */
  targetForBuffer(bufferPtr: string): string | null;
  sendTagmsg(target: string, tags: Record<string, string>): void;
  sendPrivmsg(target: string, text: string): void;
  sendRaw(command: string, ...params: string[]): void;
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
  'voice/video requires the orochi bridge (enable in Settings → Bridge)';

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

/** Send a `@+typing=<state>` TAGMSG to the buffer's mapped orochi target. */
export function sendTyping(bufferPtr: string, state: 'active' | 'paused' | 'done'): void {
  if (!backend?.ready()) return;
  const target = backend.targetForBuffer(bufferPtr);
  if (!target) return;
  backend.sendTagmsg(target, { '+typing': state });
}

/**
 * React to a message: `@+draft/react=<emoji>;+draft/reply=<msgid> TAGMSG`,
 * then apply the reaction locally right away (buffers.addReaction dedupes the
 * nick per emoji, so the relay/bridge echo cannot double it).
 */
export function sendReactionTag(bufferPtr: string, msgid: string, emoji: string): void {
  if (!backend?.ready()) return;
  const target = backend.targetForBuffer(bufferPtr);
  if (!target) return;
  backend.sendTagmsg(target, { '+draft/react': emoji, '+draft/reply': msgid });
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

/**
 * Decrypted plaintext overlays keyed BOTH ways:
 *   `m:<msgid>`      — matches relay lines carrying the msgid tag
 *   `c:<ciphertext>` — matches by exact envelope text (echoes, history)
 */
const [overlays, setOverlays] = createStore<Record<string, string>>({});

/** Envelopes we already tried against every known key (avoid re-scheduling). */
const attemptedCiphers = new Set<string>();

/** peer (lowercased) → encrypted DMs parked until their key arrives. */
const pendingByPeer = new Map<string, Array<{ msgid?: string; cipher: string }>>();
const MAX_PENDING_PER_PEER = 200;

/** True when the peer's E2EE device key is known (reactive). */
export function canE2ee(nick: string): boolean {
  return peerKeys[nick.toLowerCase()] !== undefined;
}

/** Internal: record a decrypted plaintext under both overlay keys. */
export function _storeDecryptedOverlay(
  msgid: string | undefined,
  cipher: string,
  plaintext: string,
): void {
  setOverlays(produce((o) => {
    if (msgid) o[`m:${msgid}`] = plaintext;
    o[`c:${cipher}`] = plaintext;
  }));
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
    attemptedCiphers.add(text);
    void tryDecryptWithKnownKeys(msgid, text);
  }
  return null;
}

/** Internal: peer key learned (or cleared) via METADATA — flush parked DMs. */
export function _setPeerDmKey(nick: string, keyB64: string | null): void {
  const lc = nick.toLowerCase();
  if (!keyB64) {
    setPeerKeys(produce((o) => { delete o[lc]; }));
    return;
  }
  setPeerKeys(lc, keyB64);
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
  backend.sendPrivmsg(nick, envelope);
  // Our own echo (relay or bridge) carries only ciphertext — overlay it now.
  _storeDecryptedOverlay(undefined, envelope, text);
  return true;
}
