import {
  NOTIFICATION_ACTION_MESSAGE,
  notificationActionMessage,
  normalizeNotificationTarget,
  type NotificationActionMessage,
} from '@/lib/notificationPolicy';
import { buffersState, clearUnread, muteTemporarily, setActiveBuffer } from './buffers';
import { markRead } from './bridge';
import { currentNotificationConnectionScope, sendInput } from './connection';
import { restoreComposerDraft } from './drafts';

const PENDING_ACTION_KEY = 'darkbear_pending_notification_action_v1';
const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_VOLATILE_REPLIES = 20;
// Reply plaintext received from the exact scoped service-worker client is kept
// only in this tab's memory while relay buffers rehydrate. It is never written
// to sessionStorage; once the stable target resolves it is sent or restored to
// the normal persisted composer draft.
let volatileReplies: NotificationActionMessage[] = [];

function resolveBuffer(reference: string | undefined): string | null {
  if (!reference) return null;
  if (buffersState.buffers[reference]) return reference;
  const wanted = normalizeNotificationTarget(reference);
  if (!wanted) return null;
  for (const entry of Object.values(buffersState.buffers)) {
    const aliases = [
      entry.buffer.id,
      entry.buffer.fullName,
      entry.buffer.name,
      entry.buffer.shortName,
      entry.buffer.localVars['channel'],
    ];
    if (aliases.some((alias) => normalizeNotificationTarget(alias) === wanted)) {
      return entry.buffer.id;
    }
  }
  return null;
}

/** Apply one trusted, schema-checked action from a browser notification. */
export function applyNotificationAction(value: unknown): boolean {
  const action = notificationActionMessage(value);
  if (!action) return false;
  const currentScope = currentNotificationConnectionScope();
  // Scoped foreground actions belong to the relay profile that created the
  // notification. Never let pointer reuse or a same-named buffer on another
  // account consume them. Reply plaintext always requires this binding.
  if (action.connectionScope && action.connectionScope !== currentScope) return false;
  if (action.action === 'reply' && (!action.connectionScope || action.connectionScope !== currentScope)) {
    return false;
  }
  const pointer = resolveBuffer(action.bufferId) ?? resolveBuffer(action.target);
  if (!pointer) return false;

  switch (action.action) {
    case 'open':
      setActiveBuffer(pointer);
      return true;
    case 'mark-read':
      clearUnread(pointer);
      markRead(pointer);
      return true;
    case 'mute-1h':
      muteTemporarily(pointer, ONE_HOUR_MS);
      return true;
    case 'reply':
      setActiveBuffer(pointer);
      if (!action.reply) return true;
      if (sendInput(action.reply, pointer)) return true;
      // The exact originating tab received this one-shot reply from the
      // service worker, but its relay socket rejected dispatch. Move the text
      // into the normal persisted composer draft instead of consuming it.
      return restoreComposerDraft(buffersState.buffers[pointer], action.reply);
  }
}

export function queueNotificationAction(value: unknown): void {
  const action = notificationActionMessage(value);
  if (!action) return;
  if (action.action === 'reply' && action.reply && action.connectionScope) {
    volatileReplies = [...volatileReplies, action].slice(-MAX_VOLATILE_REPLIES);
  }
  if (typeof sessionStorage === 'undefined') return;
  // Never persist inline reply plaintext. If its target is not hydrated yet,
  // retain only the intent to open that conversation.
  const queued: NotificationActionMessage = action.action === 'reply'
    ? { ...action, action: 'open', reply: undefined }
    : action;
  try {
    sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(queued));
  } catch { /* private mode: action remains best-effort */ }
}

export function flushPendingNotificationAction(): boolean {
  let applied = false;
  if (volatileReplies.length > 0) {
    const unresolved: NotificationActionMessage[] = [];
    for (const action of volatileReplies) {
      if (applyNotificationAction(action)) applied = true;
      else unresolved.push(action);
    }
    volatileReplies = unresolved;
  }
  if (typeof sessionStorage === 'undefined') return applied;
  try {
    const raw = sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return applied;
    const queuedApplied = applyNotificationAction(JSON.parse(raw) as unknown);
    if (queuedApplied) sessionStorage.removeItem(PENDING_ACTION_KEY);
    return applied || queuedApplied;
  } catch {
    sessionStorage.removeItem(PENDING_ACTION_KEY);
    return applied;
  }
}

/** Test-only reset for tab-memory reply recovery. */
export function _resetNotificationActionsForTests(): void {
  volatileReplies = [];
}

/** Consume the non-sensitive action query generated when no app client exists. */
export function notificationActionFromUrl(url: string): NotificationActionMessage | null {
  try {
    const parsed = new URL(url);
    const action = parsed.searchParams.get('notificationAction');
    return notificationActionMessage({
      type: NOTIFICATION_ACTION_MESSAGE,
      action,
      bufferId: parsed.searchParams.get('notificationBuffer') ?? undefined,
      target: parsed.searchParams.get('notificationTarget') ?? undefined,
    });
  } catch {
    return null;
  }
}

export function clearNotificationActionUrl(): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('notificationAction')) return;
  url.searchParams.delete('notificationAction');
  url.searchParams.delete('notificationBuffer');
  url.searchParams.delete('notificationTarget');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
