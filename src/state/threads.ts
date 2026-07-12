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

export interface ThreadsState {
  /** bufferPtr → the reply the composer is currently threading against. */
  pendingReply: Record<string, ReplyTarget | undefined>;
  /** msgid → sanitized preview, for resolving a "replying to …" indicator. */
  replyPreview: Record<string, string | undefined>;
  /** buffer key → read-marker position (epoch ms). */
  readMarkers: Record<string, number | undefined>;
  /** Latest scroll-to-message request, consumed by the message list. */
  scrollRequest: ScrollRequest | null;
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
  setState({ pendingReply: {}, replyPreview: {}, readMarkers: {}, scrollRequest: null });
  scrollNonce = 0;
}
