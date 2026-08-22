import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeeChatBuffer } from '@/lib/weechat/model';
import { NOTIFICATION_ACTION_MESSAGE } from '@/lib/notificationPolicy';
import {
  buffersState,
  clearBuffers,
  getTemporaryMuteUntil,
  upsertBuffer,
} from './buffers';

vi.mock('./bridge', () => ({ markRead: vi.fn() }));
vi.mock('./connection', () => ({
  currentNotificationConnectionScope: vi.fn(() => 'a'.repeat(48)),
  sendInput: vi.fn(),
}));

import { markRead } from './bridge';
import { currentNotificationConnectionScope, sendInput } from './connection';
import { clearDraftsAndHistory, getDraft } from './drafts';
import {
  _resetNotificationActionsForTests,
  applyNotificationAction,
  flushPendingNotificationAction,
  notificationActionFromUrl,
  queueNotificationAction,
} from './notificationActions';

const BUFFER = 'ptr-alice';

function privateBuffer(): WeeChatBuffer {
  return {
    id: BUFFER,
    number: 1,
    name: 'irc.esh.alice',
    fullName: 'irc.esh.alice',
    shortName: 'Alice',
    title: '',
    type: 0,
    nicksCount: 0,
    localVars: { type: 'private', channel: 'Alice' },
    notify: 1,
    hidden: false,
  };
}

const action = (name: 'open' | 'mark-read' | 'mute-1h' | 'reply', extra = {}) => ({
  type: NOTIFICATION_ACTION_MESSAGE,
  action: name,
  bufferId: BUFFER,
  connectionScope: 'a'.repeat(48),
  ...extra,
});

describe('notification actions', () => {
  beforeEach(() => {
    clearBuffers();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(sendInput).mockReturnValue(true);
    vi.mocked(currentNotificationConnectionScope).mockReturnValue('a'.repeat(48));
    _resetNotificationActionsForTests();
    clearDraftsAndHistory();
    upsertBuffer(privateBuffer());
  });

  it('opens by pointer or a case-insensitive Onyx Server target alias', () => {
    expect(applyNotificationAction(action('open'))).toBe(true);
    expect(buffersState.activeBuffer).toBe(BUFFER);
    clearBuffers();
    upsertBuffer(privateBuffer());
    expect(applyNotificationAction({
      type: NOTIFICATION_ACTION_MESSAGE,
      action: 'open',
      target: 'ALICE',
    })).toBe(true);
    expect(buffersState.activeBuffer).toBe(BUFFER);
  });

  it('restores a rejected inline reply to the originating composer draft', () => {
    vi.mocked(sendInput).mockReturnValueOnce(false);

    expect(applyNotificationAction(action('reply', { reply: 'keep this reply' }))).toBe(true);
    expect(sendInput).toHaveBeenCalledWith('keep this reply', BUFFER);
    expect(getDraft('irc.esh.alice')).toBe('keep this reply');
    expect(buffersState.activeBuffer).toBe(BUFFER);
  });

  it('marks read, applies a one-hour mute, and sends an inline reply', () => {
    expect(applyNotificationAction(action('mark-read'))).toBe(true);
    expect(markRead).toHaveBeenCalledWith(BUFFER);

    const before = Date.now();
    expect(applyNotificationAction(action('mute-1h'))).toBe(true);
    expect(getTemporaryMuteUntil(BUFFER)).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);

    expect(applyNotificationAction(action('reply', { reply: 'hello\nthere' }))).toBe(true);
    expect(sendInput).toHaveBeenCalledWith('hello there', BUFFER);
    expect(buffersState.activeBuffer).toBe(BUFFER);
  });

  it('queues unresolved actions but never stores reply plaintext', () => {
    clearBuffers();
    queueNotificationAction(action('reply', { reply: 'private words' }));
    expect(sessionStorage.getItem('darkbear_pending_notification_action_v1')).not.toContain('private words');
    expect(flushPendingNotificationAction()).toBe(false);

    upsertBuffer(privateBuffer());
    expect(flushPendingNotificationAction()).toBe(true);
    expect(sendInput).toHaveBeenCalledWith('private words', BUFFER);
    expect(buffersState.activeBuffer).toBe(BUFFER);
    expect(sessionStorage.getItem('darkbear_pending_notification_action_v1')).toBeNull();
  });

  it('keeps an unresolved reply only in tab memory until its stable target hydrates', () => {
    clearBuffers();
    vi.mocked(sendInput).mockReturnValue(false);
    queueNotificationAction({
      type: NOTIFICATION_ACTION_MESSAGE,
      action: 'reply',
      bufferId: 'stale-pointer',
      target: 'irc.esh.alice',
      connectionScope: 'a'.repeat(48),
      reply: 'hydrate me safely',
    });

    expect(sessionStorage.getItem('darkbear_pending_notification_action_v1')).not.toContain('hydrate me safely');
    expect(flushPendingNotificationAction()).toBe(false);
    upsertBuffer(privateBuffer());
    expect(flushPendingNotificationAction()).toBe(true);
    expect(getDraft('irc.esh.alice')).toBe('hydrate me safely');
  });

  it('does not send a scoped reply after switching relay profiles', () => {
    vi.mocked(currentNotificationConnectionScope).mockReturnValue('b'.repeat(48));
    const stale = action('reply', { reply: 'old profile reply' });

    expect(applyNotificationAction(stale)).toBe(false);
    queueNotificationAction(stale);
    expect(sendInput).not.toHaveBeenCalled();
    expect(getDraft('irc.esh.alice')).toBe('');

    vi.mocked(currentNotificationConnectionScope).mockReturnValue('a'.repeat(48));
    expect(flushPendingNotificationAction()).toBe(true);
    expect(sendInput).toHaveBeenCalledWith('old profile reply', BUFFER);
  });

  it('parses only allowlisted action query parameters', () => {
    expect(notificationActionFromUrl('https://example.test/darkbear/?notificationAction=mute-1h&notificationTarget=Alice'))
      .toMatchObject({ action: 'mute-1h', target: 'Alice' });
    expect(notificationActionFromUrl('https://example.test/darkbear/?notificationAction=delete'))
      .toBeNull();
  });
});
