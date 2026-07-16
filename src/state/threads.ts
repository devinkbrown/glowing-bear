// Threads store — reply affordance state + IRCv3 draft/read-marker state.
//
// Two concerns, one small immutable slice (solid-js/store singleton, read by
// member access, mutated only through the exported actions):
//
//   1. Reply linkage — a per-buffer "pending reply target" the composer will
//      thread against (set when the user clicks Reply on a line), plus a bounded
//      msgid → preview map so a "replying to …" indicator can resolve the parent
//      line's text. All preview text is sanitized to a single, length-capped
//      line here and rendered by consumers as a Solid TEXT node (auto-escaped) —
//      never fed to innerHTML.
//
//   2. Read markers — the IRCv3 `draft/read-marker` position per buffer (epoch
//      ms), recorded from an inbound MARKREAD or a local mark, monotonic so a
//      reordered frame never rewinds the marker.
//
// The wire side (MARKREAD send/receive) lives in src/lib/irc/client.ts; the
// bridge/connection wiring that folds an inbound MARKREAD into recordReadMarker
// and drives the composer off pendingReply is a separate slice (see README).

import { createStore } from 'solid-js/store';
import type { WeeChatLine } from '@/lib/weechat/model';

/** The message a pending composer reply will thread against. */
export interface ReplyTarget {
  /** msgid of the parent message (becomes the outgoing +draft/reply value). */
  msgid: string;
  /** Nick of the parent author, for the composer's "replying to <nick>" chip. */
  nick: string;
  /** Sanitized, single-line, length-capped plain-text preview of the parent. */
  preview: string;
}

/** A request to scroll the message list to a given msgid (nonce retriggers). */
export interface ScrollRequest {
  msgid: string;
  /** Bumped on every request so re-requesting the same msgid still reacts. */
  nonce: number;
}

/** The optional thread panel selection, stable across relay pointer churn. */
export interface ActiveThread {
  /** Current pointer when opened; used as a fast path while connected. */
  bufferPtr: string;
  /** Stable full buffer name used to re-resolve the pointer after reconnect. */
  bufferKey: string;
  /** Root msgid for the derived thread graph. */
  rootMsgid: string;
}

/** A thread derived entirely from the canonical loaded timeline. */
export interface ThreadView {
  root: WeeChatLine | undefined;
  replies: WeeChatLine[];
  participants: string[];
  latestTimestamp: number;
}

export interface ThreadsState {
  /** bufferPtr → the reply the composer is currently threading against. */
  pendingReply: Record<string, ReplyTarget | undefined>;
  /** msgid → sanitized preview, for resolving a "replying to …" indicator. */
  replyPreview: Record<string, string | undefined>;
  /** buffer key → read-marker position (epoch ms). */
  readMarkers: Record<string, number | undefined>;
  /** Latest scroll-to-message request, consumed by the message list. */
  scrollRequest: ScrollRequest | null;
  /** Optional thread side-panel selection. */
  activeThread: ActiveThread | null;
  /** Stable thread key → latest reply timestamp the user dismissed as read. */
  threadReadThrough: Record<string, number | undefined>;
}

/** Max length of a stored/emitted reply preview, in characters. */
const PREVIEW_MAX = 120;

/**
 * IRCv3 server-time / read-marker timestamp: `YYYY-MM-DDThh:mm:ss[.fff]Z`,
 * always UTC. Kept strict so a malformed marker fails closed rather than
 * silently coercing to an epoch.
 */
const SERVER_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

const [state, setState] = createStore<ThreadsState>({
  pendingReply: {},
  replyPreview: {},
  readMarkers: {},
  scrollRequest: null,
  activeThread: null,
  threadReadThrough: {},
});

/** Read-only threads store. Mutate via the exported actions only. */
export { state as threadsState };

let scrollNonce = 0;

/**
 * Collapse a raw message body to a single trimmed line and cap its length, so a
 * preview can never carry a newline (which would break layout) or grow
 * unbounded. Returned as plain text; the consumer renders it as a text node.
 */
export function sanitizePreview(text: string): string {
  const oneLine = text.replace(/[\r\n\t\f\v]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return oneLine.length > PREVIEW_MAX ? `${oneLine.slice(0, PREVIEW_MAX - 1)}…` : oneLine;
}

// ── Reply linkage ────────────────────────────────────────────────────────────

/** Set the buffer's pending reply target (preview is sanitized on the way in). */
export function setPendingReply(bufferPtr: string, target: ReplyTarget): void {
  if (!bufferPtr || !target.msgid) return;
  setState('pendingReply', bufferPtr, { ...target, preview: sanitizePreview(target.preview) });
}

/** Clear the buffer's pending reply target (e.g. after send or on cancel). */
export function clearPendingReply(bufferPtr: string): void {
  setState('pendingReply', bufferPtr, undefined);
}

/** The buffer's pending reply target, or undefined. */
export function pendingReplyFor(bufferPtr: string): ReplyTarget | undefined {
  return state.pendingReply[bufferPtr];
}

/**
 * Remember a sanitized preview for `msgid`, so a later message carrying
 * `+draft/reply=<msgid>` can render "replying to <that text>". Bounded by how
 * often a reply is composed, not by traffic.
 */
export function recordLinePreview(msgid: string, text: string): void {
  if (!msgid) return;
  setState('replyPreview', msgid, sanitizePreview(text));
}

/** The stored preview for `msgid`, or undefined if none was recorded. */
export function replyPreviewFor(msgid: string): string | undefined {
  return state.replyPreview[msgid];
}

// ── Thread graph + panel state ───────────────────────────────────────────────

function threadKey(bufferKey: string, rootMsgid: string): string {
  return `${bufferKey}\0${rootMsgid}`;
}

/**
 * Resolve the oldest loaded ancestor for a line. If an ancestor is outside the
 * loaded window, its msgid becomes the root target so the panel can fetch it.
 */
export function resolveThreadRoot(
  line: WeeChatLine,
  msgIndex: Readonly<Record<string, WeeChatLine | undefined>>,
): string | null {
  const initial = line.replyTo || line.msgid;
  if (!initial) return null;
  let root: string = initial;
  const seen = new Set<string>();
  while (!seen.has(root)) {
    seen.add(root);
    const parent: WeeChatLine | undefined = msgIndex[root];
    if (!parent?.replyTo) break;
    root = parent.replyTo;
  }
  return root;
}

/**
 * Build a transitive, chronological reply view from loaded timeline lines.
 * Nested replies remain in the root thread even when they target another reply.
 */
export function buildThreadView(lines: readonly WeeChatLine[], rootMsgid: string): ThreadView {
  const root = lines.find((line) => line.msgid === rootMsgid);
  const includedParents = new Set<string>([rootMsgid]);
  const includedLines = new Set<string>();
  const replies: WeeChatLine[] = [];
  let changed = true;

  while (changed) {
    changed = false;
    for (const line of lines) {
      if (!line.replyTo || !includedParents.has(line.replyTo) || includedLines.has(line.id)) continue;
      includedLines.add(line.id);
      replies.push(line);
      if (line.msgid) includedParents.add(line.msgid);
      changed = true;
    }
  }

  const position = new Map(lines.map((line, index) => [line.id, index]));
  replies.sort((a, b) =>
    a.date.getTime() - b.date.getTime() ||
    (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
  );

  const participants: string[] = [];
  const seenNicks = new Set<string>();
  for (const line of root ? [root, ...replies] : replies) {
    const nick = line.nick?.trim();
    const normalized = nick?.toLowerCase();
    if (!nick || !normalized || seenNicks.has(normalized)) continue;
    seenNicks.add(normalized);
    participants.push(nick);
  }
  const latestTimestamp = Math.max(
    0,
    root?.date.getTime() ?? 0,
    ...replies.map((line) => line.date.getTime()),
  );
  return { root, replies, participants, latestTimestamp };
}

/** Count non-self replies newer than the last dismissed/read instant. */
export function threadUnreadCount(view: ThreadView, readThrough: number | undefined): number {
  const boundary = readThrough ?? 0;
  return view.replies.filter((line) => !line.isSelf && line.date.getTime() > boundary).length;
}

/** Open or replace the optional thread panel selection. */
export function openThread(bufferPtr: string, bufferKey: string, rootMsgid: string): void {
  if (!bufferPtr || !bufferKey || !rootMsgid) return;
  setState('activeThread', { bufferPtr, bufferKey, rootMsgid });
}

/** Close the optional thread panel. */
export function closeThread(): void {
  setState('activeThread', null);
}

/** Record the latest reply timestamp dismissed/read for one stable thread. */
export function markThreadRead(bufferKey: string, rootMsgid: string, timestamp: number): void {
  if (!bufferKey || !rootMsgid || !Number.isFinite(timestamp)) return;
  const key = threadKey(bufferKey, rootMsgid);
  const current = state.threadReadThrough[key];
  if (current === undefined || timestamp > current) setState('threadReadThrough', key, timestamp);
}

/** Latest dismissed/read timestamp for one stable thread. */
export function threadReadThroughFor(bufferKey: string, rootMsgid: string): number | undefined {
  return state.threadReadThrough[threadKey(bufferKey, rootMsgid)];
}

// ── Read markers ─────────────────────────────────────────────────────────────

/**
 * Record a read-marker position for `bufferKey` (epoch ms). Monotonic: a
 * reordered or stale MARKREAD can never rewind the marker below where it is.
 */
export function recordReadMarker(bufferKey: string, ms: number): void {
  if (!bufferKey || !Number.isFinite(ms)) return;
  const cur = state.readMarkers[bufferKey];
  if (cur === undefined || ms > cur) setState('readMarkers', bufferKey, ms);
}

/** Clear the read marker for `bufferKey`. */
export function clearReadMarker(bufferKey: string): void {
  setState('readMarkers', bufferKey, undefined);
}

/** The read-marker position (epoch ms) for `bufferKey`, or undefined. */
export function readMarkerFor(bufferKey: string): number | undefined {
  return state.readMarkers[bufferKey];
}

/** Canonical stable-name read positions for account preference sync. */
export function exportReadState(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [bufferKey, timestamp] of Object.entries(state.readMarkers)
    .sort(([a], [b]) => a.localeCompare(b))) {
    if (timestamp !== undefined && Number.isSafeInteger(timestamp) && timestamp >= 0) {
      out[bufferKey] = timestamp;
    }
  }
  return out;
}

/** Merge read positions monotonically so sync can never move a marker back. */
export function applyReadState(value: Record<string, number>): void {
  const merged: Record<string, number | undefined> = { ...state.readMarkers };
  for (const [bufferKey, timestamp] of Object.entries(value)) {
    if (!bufferKey || !Number.isSafeInteger(timestamp) || timestamp < 0) continue;
    merged[bufferKey] = Math.max(merged[bufferKey] ?? 0, timestamp);
  }
  setState('readMarkers', merged);
}

/** Format an epoch-ms instant as an IRCv3 read-marker timestamp (UTC). */
export function readMarkerTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Parse an IRCv3 read-marker timestamp to epoch ms, or null when malformed.
 * Fails closed on anything that is not a well-formed UTC server-time string.
 */
export function parseReadMarkerTimestamp(iso: string): number | null {
  if (!SERVER_TIME_RE.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

// ── Scroll-to-message intent ─────────────────────────────────────────────────

/** Request the message list scroll to `msgid` (e.g. from a reply indicator). */
export function requestScrollToMessage(msgid: string): void {
  if (!msgid) return;
  scrollNonce += 1;
  setState('scrollRequest', { msgid, nonce: scrollNonce });
}

/** Take and clear the pending scroll request, if any. */
export function consumeScrollRequest(): ScrollRequest | null {
  const req = state.scrollRequest;
  if (req) setState('scrollRequest', null);
  return req;
}

/** Test-only: reset every threads field to empty. */
export function resetThreads(): void {
  setState({
    pendingReply: {},
    replyPreview: {},
    readMarkers: {},
    scrollRequest: null,
    activeThread: null,
    threadReadThrough: {},
  });
  scrollNonce = 0;
}
