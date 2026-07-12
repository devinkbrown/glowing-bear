import { describe, it, expect } from 'vitest';

import { parseIRC, formatIRC, parsePrefix } from './parser';
import type { IrcMessage } from './types';

describe('parseIRC', () => {
  it('parses tags, prefix, command, and params', () => {
    const msg = parseIRC('@time=2026-07-03T20:38:05.726Z;msgid=ABC :nick!user@host PRIVMSG #chan :hello there');

    expect(msg.tags.get('time')).toBe('2026-07-03T20:38:05.726Z');
    expect(msg.tags.get('msgid')).toBe('ABC');
    expect(msg.prefix).toBe('nick!user@host');
    expect(msg.command).toBe('PRIVMSG');
    expect(msg.params).toEqual(['#chan', 'hello there']);
  });

  it('unescapes tag values', () => {
    const msg = parseIRC('@label=a\\sb\\:c\\\\d;crlf=x\\r\\ny;flag CMD');

    expect(msg.tags.get('label')).toBe('a b;c\\d');
    expect(msg.tags.get('crlf')).toBe('x\r\ny');
    expect(msg.tags.get('flag')).toBe('');
  });

  it('strips trailing CRLF', () => {
    const msg = parseIRC('PING :token\r\n');
    expect(msg.command).toBe('PING');
    expect(msg.params).toEqual(['token']);
  });

  it('keeps colons and spaces inside the trailing param', () => {
    const msg = parseIRC('PRIVMSG #c :note :with colon and  spaces');
    expect(msg.params).toEqual(['#c', 'note :with colon and  spaces']);
  });

  it('parses an empty trailing param', () => {
    expect(parseIRC('TOPIC #c :').params).toEqual(['#c', '']);
  });

  it('skips runs of extra spaces between middle params', () => {
    const msg = parseIRC('PRIVMSG  #c  :hi there');
    expect(msg.params).toEqual(['#c', 'hi there']);
  });

  it('returns an empty command for a tag-only line', () => {
    const msg = parseIRC('@only=tags');
    expect(msg.command).toBe('');
    expect(msg.params).toEqual([]);
  });

  it('returns an empty command for a prefix-only line', () => {
    const msg = parseIRC(':lonely.prefix');
    expect(msg.prefix).toBe('lonely.prefix');
    expect(msg.command).toBe('');
  });
});

describe('formatIRC', () => {
  it('formats command with middle and bare last param', () => {
    expect(formatIRC({ command: 'JOIN', params: ['#chan'] })).toBe('JOIN #chan');
    expect(formatIRC({ command: 'MODE', params: ['#chan', '+o', 'alice'] })).toBe('MODE #chan +o alice');
  });

  it('colon-prefixes a trailing param containing spaces', () => {
    expect(formatIRC({ command: 'PRIVMSG', params: ['#chan', 'hello world'] })).toBe(
      'PRIVMSG #chan :hello world',
    );
  });

  it('colon-prefixes empty and colon-leading trailing params', () => {
    expect(formatIRC({ command: 'AWAY', params: [''] })).toBe('AWAY :');
    expect(formatIRC({ command: 'PRIVMSG', params: ['#c', ':)'] })).toBe('PRIVMSG #c ::)');
  });

  it('escapes tag values', () => {
    const tags = new Map([['label', 'a b;c\\d']]);
    expect(formatIRC({ tags, command: 'CMD' })).toBe('@label=a\\sb\\:c\\\\d CMD');
  });

  it('renders value-less tags as a bare key', () => {
    const tags = new Map([['+typing', '']]);
    expect(formatIRC({ tags, command: 'TAGMSG', params: ['#chan'] })).toBe('@+typing TAGMSG #chan');
  });

  it('includes the prefix when present', () => {
    expect(formatIRC({ prefix: 'nick!user@host', command: 'QUIT', params: ['bye bye'] })).toBe(
      ':nick!user@host QUIT :bye bye',
    );
  });
});

describe('parseIRC/formatIRC round trips', () => {
  function roundTrip(msg: IrcMessage): IrcMessage {
    return parseIRC(formatIRC(msg));
  }

  it('round-trips tags with spaces, semicolons, and backslashes', () => {
    const msg: IrcMessage = {
      tags: new Map([
        ['label', 'hello world'],
        ['note', 'semi;colon'],
        ['path', 'a\\b'],
      ]),
      prefix: 'nick!user@host',
      command: 'PRIVMSG',
      params: ['#chan', 'body text'],
    };

    const back = roundTrip(msg);

    expect(back.tags.get('label')).toBe('hello world');
    expect(back.tags.get('note')).toBe('semi;colon');
    expect(back.tags.get('path')).toBe('a\\b');
    expect(back.prefix).toBe(msg.prefix);
    expect(back.command).toBe(msg.command);
    expect(back.params).toEqual(msg.params);
  });

  it('round-trips a trailing param with an internal colon', () => {
    const msg: IrcMessage = {
      tags: new Map(),
      prefix: null,
      command: 'PRIVMSG',
      params: ['#chan', 'time is 12:30 :ok'],
    };

    expect(roundTrip(msg).params).toEqual(msg.params);
  });

  it('round-trips an empty trailing param', () => {
    const msg: IrcMessage = { tags: new Map(), prefix: null, command: 'AWAY', params: [''] };
    expect(roundTrip(msg).params).toEqual(['']);
  });

  it('round-trips a single-token trailing param with a non-leading colon', () => {
    const msg: IrcMessage = { tags: new Map(), prefix: null, command: 'CMD', params: ['foo:bar'] };
    expect(roundTrip(msg).params).toEqual(['foo:bar']);
  });
});

describe('parsePrefix', () => {
  it('splits a full nick!ident@host prefix', () => {
    expect(parsePrefix('alice!webchat@host.example')).toEqual({
      nick: 'alice',
      ident: 'webchat',
      host: 'host.example',
    });
  });

  it('splits nick@host without an ident', () => {
    expect(parsePrefix('alice@host.example')).toEqual({
      nick: 'alice',
      ident: '',
      host: 'host.example',
    });
  });

  it('treats a bare token as a nick', () => {
    expect(parsePrefix('alice')).toEqual({ nick: 'alice', ident: '', host: '' });
  });

  it('treats a server name as the nick field (classic behavior)', () => {
    expect(parsePrefix('eshmaki.me')).toEqual({ nick: 'eshmaki.me', ident: '', host: '' });
  });
});
