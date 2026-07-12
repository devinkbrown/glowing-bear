// threads store tests — reply linkage, preview sanitization, monotonic read
// markers, IRCv3 read-marker timestamp helpers, and the scroll-to-message intent.

import { beforeEach, describe, expect, it } from 'vitest';
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
  readMarkerTimestamp,
  parseReadMarkerTimestamp,
  requestScrollToMessage,
  consumeScrollRequest,
  sanitizePreview,
  resetThreads,
} from './threads';

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
