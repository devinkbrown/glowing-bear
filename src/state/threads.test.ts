// threads store tests — reply linkage, preview sanitization, monotonic read
// markers, IRCv3 read-marker timestamp helpers, and the scroll-to-message intent.

import { beforeEach, describe, expect, it } from 'vitest';
import type { WeeChatLine } from '@/lib/weechat/model';
import {
  threadsState,
  setPendingReply,
  clearPendingReply,
  pendingReplyFor,
  recordLinePreview,
  replyPreviewFor,
  recordReadMarker,
  clearReadMarker,
  readMarkerFor,
  exportReadState,
  applyReadState,
  readMarkerTimestamp,
  parseReadMarkerTimestamp,
  requestScrollToMessage,
  consumeScrollRequest,
  sanitizePreview,
  resolveThreadRoot,
  buildThreadView,
  threadUnreadCount,
  openThread,
  closeThread,
  markThreadRead,
  threadReadThroughFor,
  resetThreads,
} from './threads';

function line(id: string, msgid: string, replyTo?: string, nick = 'alice', ms = 1000): WeeChatLine {
  const date = new Date(ms);
  return {
    id, buffer: '0xb', date, datePrinted: date, displayed: true, highlight: false,
    tags: [], prefix: nick, message: id, nick, ircTags: new Map(), msgid, replyTo,
  };
}

beforeEach(() => {
  resetThreads();
});

describe('sanitizePreview', () => {
  it('collapses newlines/tabs/runs into a single trimmed line', () => {
    expect(sanitizePreview('  hello\r\n\tworld   again  ')).toBe('hello world again');
  });

  it('caps overlong text and appends an ellipsis', () => {
    const long = 'a'.repeat(500);
    const out = sanitizePreview(long);
    expect(out.length).toBe(120);
    expect(out.endsWith('…')).toBe(true);
  });

  it('leaves the preview as plain text — no HTML is interpreted', () => {
    // Sanitization is about layout, not escaping; consumers render it as a text
    // node. The angle brackets must survive verbatim, never become markup.
    expect(sanitizePreview('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('pending reply target', () => {
  it('sets and clears a per-buffer reply target with a sanitized preview', () => {
    setPendingReply('0xb', { msgid: 'm1', nick: 'alice', preview: 'multi\nline text' });
    const t = pendingReplyFor('0xb');
    expect(t).toEqual({ msgid: 'm1', nick: 'alice', preview: 'multi line text' });

    clearPendingReply('0xb');
    expect(pendingReplyFor('0xb')).toBeUndefined();
  });

  it('keeps reply targets isolated per buffer', () => {
    setPendingReply('0xa', { msgid: 'ma', nick: 'a', preview: 'a' });
    setPendingReply('0xb', { msgid: 'mb', nick: 'b', preview: 'b' });
    expect(pendingReplyFor('0xa')?.msgid).toBe('ma');
    expect(pendingReplyFor('0xb')?.msgid).toBe('mb');
  });

  it('ignores an empty buffer ptr or msgid', () => {
    setPendingReply('', { msgid: 'm1', nick: 'a', preview: 'x' });
    setPendingReply('0xb', { msgid: '', nick: 'a', preview: 'x' });
    expect(pendingReplyFor('')).toBeUndefined();
    expect(pendingReplyFor('0xb')).toBeUndefined();
  });
});

describe('reply preview map', () => {
  it('records and resolves a preview by msgid', () => {
    recordLinePreview('m1', 'the parent message');
    expect(replyPreviewFor('m1')).toBe('the parent message');
    expect(replyPreviewFor('missing')).toBeUndefined();
  });

  it('ignores an empty msgid', () => {
    recordLinePreview('', 'x');
    expect(threadsState.replyPreview['']).toBeUndefined();
  });
});

describe('thread graph and panel state', () => {
  it('resolves the oldest loaded ancestor and stops at a missing parent', () => {
    const root = line('l1', 'root');
    const parent = line('l2', 'parent', 'root');
    const child = line('l3', 'child', 'parent');
    const index = { root, parent, child };

    expect(resolveThreadRoot(child, index)).toBe('root');
    expect(resolveThreadRoot(line('l4', 'orphan-child', 'missing'), index)).toBe('missing');
    expect(resolveThreadRoot(line('l5', '', undefined), index)).toBeNull();
  });

  it('builds transitive replies in time order with unique participants', () => {
    const root = line('root-line', 'root', undefined, 'Alice', 1000);
    const nested = line('nested-line', 'nested', 'direct', 'carol', 3000);
    const direct = line('direct-line', 'direct', 'root', 'bob', 2000);
    const other = line('other-line', 'other', undefined, 'nobody', 4000);

    const view = buildThreadView([root, nested, direct, other], 'root');

    expect(view.root).toBe(root);
    expect(view.replies.map((item) => item.msgid)).toEqual(['direct', 'nested']);
    expect(view.participants).toEqual(['Alice', 'bob', 'carol']);
    expect(view.latestTimestamp).toBe(3000);
  });

  it('tracks unread replies until the stable thread is marked read', () => {
    const root = line('root-line', 'root', undefined, 'alice', 1000);
    const old = line('old-line', 'old', 'root', 'bob', 2000);
    const self = { ...line('self-line', 'self', 'root', 'me', 2500), isSelf: true };
    const recent = line('recent-line', 'recent', 'root', 'carol', 3000);
    const view = buildThreadView([root, old, self, recent], 'root');

    expect(threadUnreadCount(view, undefined)).toBe(2);
    markThreadRead('irc.fixture.#darkbear', 'root', 2000);
    expect(threadReadThroughFor('irc.fixture.#darkbear', 'root')).toBe(2000);
    expect(threadUnreadCount(view, threadReadThroughFor('irc.fixture.#darkbear', 'root'))).toBe(1);
    markThreadRead('irc.fixture.#darkbear', 'root', 1000);
    expect(threadReadThroughFor('irc.fixture.#darkbear', 'root')).toBe(2000);
  });

  it('opens and closes a selection keyed by stable buffer name', () => {
    openThread('0xb', 'irc.fixture.#darkbear', 'root');
    expect(threadsState.activeThread).toEqual({
      bufferPtr: '0xb', bufferKey: 'irc.fixture.#darkbear', rootMsgid: 'root',
    });
    closeThread();
    expect(threadsState.activeThread).toBeNull();
  });
});

describe('read markers (monotonic)', () => {
  it('records and reads a per-buffer marker', () => {
    recordReadMarker('#chan', 1000);
    expect(readMarkerFor('#chan')).toBe(1000);
  });

  it('never rewinds below the current position', () => {
    recordReadMarker('#chan', 2000);
    recordReadMarker('#chan', 1000); // stale/reordered — must be ignored
    expect(readMarkerFor('#chan')).toBe(2000);
    recordReadMarker('#chan', 3000);
    expect(readMarkerFor('#chan')).toBe(3000);
  });

  it('rejects a non-finite timestamp', () => {
    recordReadMarker('#chan', Number.NaN);
    expect(readMarkerFor('#chan')).toBeUndefined();
  });

  it('clears a marker', () => {
    recordReadMarker('#chan', 1000);
    clearReadMarker('#chan');
    expect(readMarkerFor('#chan')).toBeUndefined();
  });

  it('exports stable keys and merges imported progress without rewinding', () => {
    recordReadMarker('irc.example.#one', 2000);
    applyReadState({ 'irc.example.#one': 1000, 'irc.example.#two': 3000 });

    expect(exportReadState()).toEqual({
      'irc.example.#one': 2000,
      'irc.example.#two': 3000,
    });
  });
});

describe('read-marker timestamp helpers', () => {
  it('round-trips epoch ms through an IRCv3 UTC timestamp', () => {
    const ms = Date.UTC(2026, 6, 12, 9, 30, 15, 500);
    const iso = readMarkerTimestamp(ms);
    expect(iso).toBe('2026-07-12T09:30:15.500Z');
    expect(parseReadMarkerTimestamp(iso)).toBe(ms);
  });

  it('parses a whole-second timestamp with no fraction', () => {
    expect(parseReadMarkerTimestamp('2026-07-12T09:30:15Z')).toBe(Date.UTC(2026, 6, 12, 9, 30, 15));
  });

  it('fails closed on a malformed or non-UTC timestamp', () => {
    expect(parseReadMarkerTimestamp('2026-07-12 09:30:15')).toBeNull();
    expect(parseReadMarkerTimestamp('2026-07-12T09:30:15+02:00')).toBeNull();
    expect(parseReadMarkerTimestamp('garbage')).toBeNull();
    expect(parseReadMarkerTimestamp('')).toBeNull();
  });
});

describe('scroll-to-message intent', () => {
  it('requests, then consumes exactly once, bumping the nonce each time', () => {
    requestScrollToMessage('m1');
    const first = consumeScrollRequest();
    expect(first?.msgid).toBe('m1');
    expect(consumeScrollRequest()).toBeNull();

    requestScrollToMessage('m1'); // same id again still reacts (nonce moved)
    const second = consumeScrollRequest();
    expect(second?.msgid).toBe('m1');
    expect(second?.nonce).toBeGreaterThan(first!.nonce);
  });

  it('ignores an empty msgid', () => {
    requestScrollToMessage('');
    expect(consumeScrollRequest()).toBeNull();
  });
});
