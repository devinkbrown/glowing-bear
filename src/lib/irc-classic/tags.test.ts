import { describe, it, expect } from 'vitest';

import { parseIrcv3Tags } from './tags';

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

  it('returns an empty map for an empty tags_array', () => {
    expect(parseIrcv3Tags([]).size).toBe(0);
  });
});
