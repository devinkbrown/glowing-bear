import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() { return values.size; }, clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, String(value)),
    } satisfies Storage,
  });
});

import type { BufferEntry, WeeChatLine } from '@/types';
import {
  activityState,
  activityUnreadCount,
  clearActivity,
  isMessageSaved,
  markActivityRead,
  recordLineActivity,
  removeSavedForBuffer,
  resetActivity,
  sourceFromLine,
  syncSavedRetention,
  toggleSavedMessage,
  updateSavedNote,
} from './activity';

function entry(type = 'channel'): BufferEntry {
  return {
    buffer: { id: 'p', number: 1, name: 'irc.x.#c', fullName: 'irc.x.#c', shortName: '#c', title: '', type: 0, nicksCount: 0, localVars: { type }, notify: 3, hidden: false },
    lines: [], lineIds: {}, nicks: {}, nickGroups: {}, unread: 0, highlighted: 0,
    loading: false, typing: {}, reactions: {}, msgIndex: {}, modes: [],
  };
}

function line(over: Partial<WeeChatLine> = {}): WeeChatLine {
  const date = new Date('2026-07-16T12:00:00Z');
  return { id: 'l1', buffer: 'p', date, datePrinted: date, displayed: true, highlight: false, tags: [], prefix: 'alice', message: 'hello', nick: 'alice', ircTags: new Map(), msgid: 'm1', ...over };
}

beforeEach(() => resetActivity());

describe('saved messages', () => {
  it('toggles a stable source, sanitizes notes, and removes one buffer', () => {
    const source = sourceFromLine(entry(), line());
    expect(toggleSavedMessage(source)).toBe(true);
    expect(isMessageSaved(source)).toBe(true);
    updateSavedNote(activityState.saved[0]!.id, ' private\n note ');
    expect(activityState.saved[0]!.note).toBe('private note');
    removeSavedForBuffer(source.bufferKey);
    expect(activityState.saved).toEqual([]);
  });

  it('follows off and day-based archive retention', () => {
    const recent = sourceFromLine(entry(), line({ id: 'recent', msgid: 'recent', date: new Date(9000) }));
    const old = sourceFromLine(entry(), line({ id: 'old', msgid: 'old', date: new Date(1000) }));
    toggleSavedMessage(recent);
    toggleSavedMessage(old);
    syncSavedRetention('7d', 7 * 86_400_000 + 5000);
    expect(activityState.saved.map((item) => item.msgid)).toEqual(['recent']);
    syncSavedRetention('off');
    expect(activityState.saved).toEqual([]);
  });
});

describe('activity inbox', () => {
  it('classifies reply, DM, mention and operator lines with bounded dedupe', () => {
    recordLineActivity(entry(), line({ id: 'reply', msgid: 'reply', replyTo: 'root' }));
    recordLineActivity(entry('private'), line({ id: 'dm', msgid: 'dm' }));
    recordLineActivity(entry(), line({ id: 'mention', msgid: 'mention', highlight: true }));
    recordLineActivity(entry(), line({ id: 'oper', msgid: 'oper' }), true);
    recordLineActivity(entry(), line({ id: 'reply', msgid: 'reply', replyTo: 'root' }));

    expect(activityState.items.map((item) => item.kind)).toEqual(['operator', 'mention', 'dm', 'reply']);
    expect(activityUnreadCount()).toBe(4);
    markActivityRead(activityState.items[0]!.id);
    expect(activityUnreadCount()).toBe(3);
    markActivityRead();
    expect(activityUnreadCount()).toBe(0);
    clearActivity();
    expect(activityState.items).toEqual([]);
  });

  it('ignores self, hidden, and TAGMSG lines', () => {
    recordLineActivity(entry(), line({ isSelf: true, highlight: true }));
    recordLineActivity(entry(), line({ displayed: false, highlight: true }));
    recordLineActivity(entry(), line({ isTagMsg: true, highlight: true }));
    expect(activityState.items).toEqual([]);
  });
});
