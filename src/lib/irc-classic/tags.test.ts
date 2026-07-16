import { describe, it, expect } from 'vitest';

import { parseIrcv3Tags, replyParentFromTags } from './tags';

describe('parseIrcv3Tags', () => {
  it('extracts IRCv3 key=value tags from a mixed WeeChat tags_array', () => {
    const tags = parseIrcv3Tags([
      'irc_privmsg',
      'notify_message',
      'nick_alice',
      'time=2026-07-03T20:38:05.726Z',
      'msgid=17J4YRKCFKJPWSJN9YQTCGW72M',
      'account=alice',
      'log1',
    ]);

    expect(tags.get('time')).toBe('2026-07-03T20:38:05.726Z');
    expect(tags.get('msgid')).toBe('17J4YRKCFKJPWSJN9YQTCGW72M');
    expect(tags.get('account')).toBe('alice');
    expect(tags.size).toBe(3);
  });

  it('filters weechat-internal irc_* tags including numerics like irc_818', () => {
    const tags = parseIrcv3Tags(['irc_818', 'irc_numeric', 'irc_tagmsg']);
    expect(tags.size).toBe(0);
  });

  it('normalizes WeeChat relay irc_tag_ entries to their IRCv3 keys', () => {
    const tags = parseIrcv3Tags([
      'irc_privmsg',
      'irc_tag_msgid=mid-1',
      'irc_tag_+draft/reply=root-1',
      'irc_tag_time=2026-07-16T12:00:00.000Z',
    ]);

    expect(tags.get('msgid')).toBe('mid-1');
    expect(tags.get('+draft/reply')).toBe('root-1');
    expect(tags.get('time')).toBe('2026-07-16T12:00:00.000Z');
    expect(tags.has('irc_privmsg')).toBe(false);
  });

  it('filters notify_*, nick_*, logN, and self_msg tags', () => {
    const tags = parseIrcv3Tags(['notify_highlight', 'nick_dbtA3950', 'log4', 'log12', 'self_msg']);
    expect(tags.size).toBe(0);
  });

  it('keeps client-only +tags such as +typing and +draft/react', () => {
    const tags = parseIrcv3Tags(['irc_tagmsg', '+typing=active', '+draft/react=👍', '+draft/reply=MSGID1']);

    expect(tags.get('+typing')).toBe('active');
    expect(tags.get('+draft/react')).toBe('👍');
    expect(tags.get('+draft/reply')).toBe('MSGID1');
  });

  it('prefers +draft/reply while accepting the legacy +reply spelling', () => {
    expect(replyParentFromTags(new Map([['+draft/reply', 'current'], ['+reply', 'legacy']]))).toBe('current');
    expect(replyParentFromTags(new Map([['+reply', 'legacy']]))).toBe('legacy');
    expect(replyParentFromTags(new Map())).toBeUndefined();
  });

  it('stores value-less non-internal tags with an empty value', () => {
    const tags = parseIrcv3Tags(['bot']);
    expect(tags.get('bot')).toBe('');
  });

  it('unescapes tag value escape sequences', () => {
    const tags = parseIrcv3Tags([
      'label=hello\\sworld',
      'note=semi\\:colon',
      'path=a\\\\b',
      'crlf=x\\r\\ny',
    ]);

    expect(tags.get('label')).toBe('hello world');
    expect(tags.get('note')).toBe('semi;colon');
    expect(tags.get('path')).toBe('a\\b');
    expect(tags.get('crlf')).toBe('x\r\ny');
  });

  it('decodes an escaped backslash before an escape char in a single pass (M1)', () => {
    // Wire `\\s` must decode to "\s", not the chained-replace bug's "\ ".
    const tags = parseIrcv3Tags(['k=\\\\s', 'j=abc\\', 'u=a\\qb']);
    expect(tags.get('k')).toBe('\\s');
    expect(tags.get('j')).toBe('abc'); // lone trailing backslash dropped
    expect(tags.get('u')).toBe('aqb'); // unknown escape → literal char
  });

  it('returns an empty map for an empty tags_array', () => {
    expect(parseIrcv3Tags([]).size).toBe(0);
  });
});

describe('parseIrcv3Tags hostile input', () => {
  it('drops an unterminated escape instead of carrying a dangling backslash', () => {
    const tags = parseIrcv3Tags(['payload=abc\\']);

    expect(tags.get('payload')).toBe('abc');
  });

  it('decodes every IRCv3 escaped delimiter in a single left-to-right pass', () => {
    const tags = parseIrcv3Tags(['payload=space\\ssemi\\:cr\\rnl\\nslash\\\\end']);

    expect(tags.get('payload')).toBe('space semi;cr\rnl\nslash\\end');
  });

  it('preserves empty values separately from value-less tags', () => {
    const tags = parseIrcv3Tags(['empty=', 'flag']);

    expect(tags.get('empty')).toBe('');
    expect(tags.get('flag')).toBe('');
    expect(tags.size).toBe(2);
  });

  it('keeps the last value for duplicate keys', () => {
    const tags = parseIrcv3Tags(['dup=first', 'dup=second']);

    expect(tags.get('dup')).toBe('second');
    expect(tags.size).toBe(1);
  });

  it('decodes an oversized tag value without creating extra keys', () => {
    const value = `start\\s${'x'.repeat(131072)}\\:end`;

    const tags = parseIrcv3Tags([`big=${value}`]);

    expect(tags.size).toBe(1);
    expect(tags.get('big')).toBe(`start ${'x'.repeat(131072)};end`);
  });
});
