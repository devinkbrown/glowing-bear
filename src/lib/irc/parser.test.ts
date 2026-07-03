import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import {
  parseIRCMessage,
  formatIRCLine,
  parseNamesPrefix,
  parsePREFIX,
  parseCHANLIMIT,
  normalizeCase,
  selectSaslMechanism,
  parseStandardReply,
  parseSessionTokenNote,
  parseSessionMeshTokenNote,
  buildSessionResumeLine,
  parseMonitorNumeric,
} from './parser';

// Ground truth: a real two-client transcript captured live from orochi.
// NOTE: the path is resolved via fileURLToPath instead of the plain
// `new URL('...', import.meta.url)` idiom because Vite statically rewrites
// that exact pattern into an http://localhost asset URL under vitest.
const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../tests/fixtures/orochi-live-capture.txt',
);
const capture = readFileSync(FIXTURE_PATH, 'utf8');
const serverLines = capture
  .split('\n')
  .filter((l) => /^<<<[AB] /.test(l))
  .map((l) => l.replace(/^<<<[AB] /, ''));

function mustFind(predicate: (line: string) => boolean, what: string): string {
  const line = serverLines.find(predicate);
  if (!line) throw new Error(`fixture line not found: ${what}`);
  return line;
}

describe('parseIRCMessage', () => {
  it('parses tags, prefix, command, params and trailing from a full line', () => {
    // Arrange
    const raw = '@time=2026-07-03T20:38:05.726Z;msgid=17J4YRKCFKJPWSJN9YQTCGW72M :dbtA3950!webchat@host.example PRIVMSG #dbtest19036 :hello from capture A';

    // Act
    const msg = parseIRCMessage(raw);

    // Assert
    expect(msg.tags['time']).toBe('2026-07-03T20:38:05.726Z');
    expect(msg.tags['msgid']).toBe('17J4YRKCFKJPWSJN9YQTCGW72M');
    expect(msg.prefix).toBe('dbtA3950!webchat@host.example');
    expect(msg.nick).toBe('dbtA3950');
    expect(msg.host).toBe('host.example');
    expect(msg.command).toBe('PRIVMSG');
    expect(msg.params).toEqual(['#dbtest19036', 'hello from capture A']);
  });

  it('unescapes IRCv3 tag value escape sequences', () => {
    // Arrange: \s → space, \: → ';', \\ → '\', \r/\n → CR/LF
    const raw = '@label=a\\sb\\:c\\\\d;multi=one\\r\\ntwo;flag PRIVMSG #c :hi';

    // Act
    const msg = parseIRCMessage(raw);

    // Assert
    expect(msg.tags['label']).toBe('a b;c\\d');
    expect(msg.tags['multi']).toBe('one\r\ntwo');
    expect(msg.tags['flag']).toBe('');
  });

  it('treats a dotted prefix without user/host as a server name', () => {
    const msg = parseIRCMessage(':eshmaki.me 001 dbtA3950 :Welcome');

    expect(msg.prefix).toBe('eshmaki.me');
    expect(msg.nick).toBeNull();
    expect(msg.host).toBe('eshmaki.me');
  });

  it('treats a bare undotted prefix as a nick', () => {
    const msg = parseIRCMessage(':alice JOIN #chan');

    expect(msg.nick).toBe('alice');
    expect(msg.host).toBeNull();
  });

  it('extracts nick and host from a nick@host prefix without ident', () => {
    const msg = parseIRCMessage(':alice@host.example AWAY :gone');

    expect(msg.nick).toBe('alice');
    expect(msg.host).toBe('host.example');
  });

  it('uppercases the command', () => {
    expect(parseIRCMessage('privmsg #c :hi').command).toBe('PRIVMSG');
  });

  it('preserves an empty trailing param', () => {
    expect(parseIRCMessage('TOPIC #c :').params).toEqual(['#c', '']);
  });

  it('keeps colons inside the trailing param', () => {
    const msg = parseIRCMessage('PRIVMSG #c :time is 12:30 :ok');
    expect(msg.params).toEqual(['#c', 'time is 12:30 :ok']);
  });

  it('strips CRLF and NUL bytes from the raw line', () => {
    const msg = parseIRCMessage('PING :token\r\n');
    expect(msg.command).toBe('PING');
    expect(msg.params).toEqual(['token']);
    expect(msg.raw).toBe('PING :token');
  });
});

describe('formatIRCLine', () => {
  it('appends CRLF and leaves a simple last param bare', () => {
    expect(formatIRCLine('JOIN', '#chan')).toBe('JOIN #chan\r\n');
  });

  it('prefixes a trailing param containing spaces with a colon', () => {
    expect(formatIRCLine('PRIVMSG', '#chan', 'hello world')).toBe('PRIVMSG #chan :hello world\r\n');
  });

  it('prefixes empty and colon-leading trailing params', () => {
    expect(formatIRCLine('AWAY', '')).toBe('AWAY :\r\n');
    expect(formatIRCLine('PRIVMSG', '#c', ':)')).toBe('PRIVMSG #c ::)\r\n');
  });

  it('emits the bare command when there are no params', () => {
    expect(formatIRCLine('QUIT')).toBe('QUIT\r\n');
  });
});

describe('ISUPPORT parsing (005 from the live capture)', () => {
  const line005 = mustFind((l) => l.includes(' 005 '), '005 ISUPPORT');
  const msg005 = parseIRCMessage(line005);
  // params[0] = our nick, params[last] = "are supported by this server"
  const tokens = msg005.params.slice(1, -1);

  function tokenValue(key: string): string | undefined {
    const tok = tokens.find((t) => t === key || t.startsWith(`${key}=`));
    if (tok === undefined) return undefined;
    const eq = tok.indexOf('=');
    return eq === -1 ? '' : tok.slice(eq + 1);
  }

  it('parses the 005 numeric with the trailing marker as the last param', () => {
    expect(msg005.command).toBe('005');
    expect(msg005.params[msg005.params.length - 1]).toBe('are supported by this server');
  });

  it('maps PREFIX=(YQqov)*!.@+ in both directions', () => {
    const prefixValue = tokenValue('PREFIX');
    expect(prefixValue).toBe('(YQqov)*!.@+');

    const { modeToPrefix, prefixToMode } = parsePREFIX(prefixValue!);
    expect(modeToPrefix).toEqual({ Y: '*', Q: '!', q: '.', o: '@', v: '+' });
    expect(prefixToMode).toEqual({ '*': 'Y', '!': 'Q', '.': 'q', '@': 'o', '+': 'v' });
  });

  it('advertises a non-empty base64url VAPID key', () => {
    const vapid = tokenValue('VAPID');
    expect(vapid).toBeDefined();
    expect(vapid!.length).toBeGreaterThan(0);
    expect(vapid).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('advertises CHANTYPES=#& and NETWORK=IRCXNet', () => {
    expect(tokenValue('CHANTYPES')).toBe('#&');
    expect(tokenValue('NETWORK')).toBe('IRCXNet');
  });

  it('parses the fixture CHANLIMIT=#&:50 into per-type limits', () => {
    expect(parseCHANLIMIT(tokenValue('CHANLIMIT')!)).toEqual({ '#': 50, '&': 50 });
  });

  it('returns empty maps for a malformed PREFIX value', () => {
    const { modeToPrefix, prefixToMode } = parsePREFIX('nonsense');
    expect(modeToPrefix).toEqual({});
    expect(prefixToMode).toEqual({});
  });

  it('ignores malformed CHANLIMIT segments', () => {
    expect(parseCHANLIMIT('#:10,bogus,&:abc')).toEqual({ '#': 10 });
  });
});

describe('normalizeCase', () => {
  it('lowercases only under ascii casemapping (the fixture value)', () => {
    expect(normalizeCase('#Foo[]\\^', 'ascii')).toBe('#foo[]\\^');
  });

  it('folds []\\^ to {}|~ under rfc1459 casemapping', () => {
    expect(normalizeCase('Nick[a]\\b^', 'rfc1459')).toBe('nick{a}|b~');
  });
});

describe('parseNamesPrefix', () => {
  // prefix map derived from the fixture PREFIX=(YQqov)*!.@+
  const prefixMap = { '*': 'Y', '!': 'Q', '.': 'q', '@': 'o', '+': 'v' };

  it('extracts the founder prefix from the fixture NAMES entry !dbtA3950', () => {
    const { nick, modes } = parseNamesPrefix('!dbtA3950', prefixMap);
    expect(nick).toBe('dbtA3950');
    expect(modes).toEqual(new Set(['Q']));
  });

  it('collects stacked multi-prefix modes', () => {
    const { nick, modes } = parseNamesPrefix('.@+alice', prefixMap);
    expect(nick).toBe('alice');
    expect(modes).toEqual(new Set(['q', 'o', 'v']));
  });

  it('strips userhost-in-names user@host down to the nick', () => {
    const { nick, modes } = parseNamesPrefix('@alice!webchat@host.example', prefixMap);
    expect(nick).toBe('alice');
    expect(modes).toEqual(new Set(['o']));
  });

  it('returns no modes for an unprefixed nick', () => {
    const { nick, modes } = parseNamesPrefix('bob', prefixMap);
    expect(nick).toBe('bob');
    expect(modes.size).toBe(0);
  });
});

describe('selectSaslMechanism', () => {
  // The exact mechanism list orochi advertises in the capture's sasl cap.
  const offered = 'PLAIN,EXTERNAL,SCRAM-SHA-256,SCRAM-SHA-512,SCRAM-SHA-512-PLUS,SESSION-TOKEN'.split(',');

  it('prefers SCRAM-SHA-256 over PLAIN when a password is available', () => {
    expect(selectSaslMechanism(offered, { hasPassword: true })).toBe('SCRAM-SHA-256');
  });

  it('falls back to PLAIN when SCRAM-SHA-256 is not offered', () => {
    expect(selectSaslMechanism(['PLAIN', 'EXTERNAL'], { hasPassword: true })).toBe('PLAIN');
  });

  it('selects EXTERNAL only via a client cert when no password is set', () => {
    expect(selectSaslMechanism(offered, { hasPassword: false, hasClientCert: true })).toBe('EXTERNAL');
  });

  it('never picks EXTERNAL over a password-backed SCRAM', () => {
    expect(selectSaslMechanism(offered, { hasPassword: true, hasClientCert: true })).toBe('SCRAM-SHA-256');
  });

  it('returns null when no usable mechanism matches the credentials', () => {
    expect(selectSaslMechanism(offered, { hasPassword: false })).toBeNull();
    expect(selectSaslMechanism([], { hasPassword: true, hasClientCert: true })).toBeNull();
  });

  it('matches mechanism names case-insensitively', () => {
    expect(selectSaslMechanism(['scram-sha-256'], { hasPassword: true })).toBe('SCRAM-SHA-256');
  });
});

describe('parseStandardReply', () => {
  it('parses a FAIL with context params', () => {
    const msg = parseIRCMessage(':eshmaki.me FAIL ACC REG_INVALID_CALLBACK mailto:foo :Invalid callback');
    const reply = parseStandardReply(msg);

    expect(reply).toEqual({
      kind: 'FAIL',
      command: 'ACC',
      code: 'REG_INVALID_CALLBACK',
      context: ['mailto:foo'],
      description: 'Invalid callback',
    });
  });

  it('parses a WARN without context', () => {
    const msg = parseIRCMessage(':eshmaki.me WARN REHASH CERTS_EXPIRED :Certificate has expired');
    const reply = parseStandardReply(msg);

    expect(reply!.kind).toBe('WARN');
    expect(reply!.command).toBe('REHASH');
    expect(reply!.code).toBe('CERTS_EXPIRED');
    expect(reply!.context).toEqual([]);
    expect(reply!.description).toBe('Certificate has expired');
  });

  it('parses a NOTE and uppercases command and code', () => {
    const msg = parseIRCMessage(':eshmaki.me NOTE session token :abc');
    const reply = parseStandardReply(msg);

    expect(reply!.kind).toBe('NOTE');
    expect(reply!.command).toBe('SESSION');
    expect(reply!.code).toBe('TOKEN');
    expect(reply!.description).toBe('abc');
  });

  it('returns null for non-standard-reply commands', () => {
    expect(parseStandardReply(parseIRCMessage(':eshmaki.me NOTICE nick :hello'))).toBeNull();
  });

  it('returns null when the command param is missing', () => {
    expect(parseStandardReply(parseIRCMessage('FAIL'))).toBeNull();
  });
});

describe('session token NOTE parsing', () => {
  it('extracts the local token from NOTE SESSION TOKEN', () => {
    const msg = parseIRCMessage(':eshmaki.me NOTE SESSION TOKEN :sTOKENvalue123');
    expect(parseSessionTokenNote(msg)).toBe('sTOKENvalue123');
  });

  it('extracts the mesh token from NOTE SESSION MTOKEN', () => {
    const msg = parseIRCMessage(':eshmaki.me NOTE SESSION MTOKEN :mTOKENvalue456');
    expect(parseSessionMeshTokenNote(msg)).toBe('mTOKENvalue456');
  });

  it('does not cross-match TOKEN and MTOKEN codes', () => {
    const token = parseIRCMessage(':eshmaki.me NOTE SESSION TOKEN :a');
    const mtoken = parseIRCMessage(':eshmaki.me NOTE SESSION MTOKEN :b');
    expect(parseSessionMeshTokenNote(token)).toBeNull();
    expect(parseSessionTokenNote(mtoken)).toBeNull();
  });

  it('ignores FAIL SESSION TOKEN (only NOTE carries a token)', () => {
    const msg = parseIRCMessage(':eshmaki.me FAIL SESSION TOKEN :nope');
    expect(parseSessionTokenNote(msg)).toBeNull();
  });

  it('builds the matching SESSION RESUME line', () => {
    expect(buildSessionResumeLine('tok123')).toBe('SESSION RESUME tok123\r\n');
  });
});

describe('parseMonitorNumeric', () => {
  it('parses the fixture 730 online notification with a full mask target', () => {
    const line = mustFind((l) => l.includes(' 730 '), 'MONITOR 730');
    const parsed = parseMonitorNumeric(parseIRCMessage(line));

    expect(parsed!.kind).toBe('online');
    expect(parsed!.targets).toHaveLength(1);
    expect(parsed!.targets[0]).toMatch(/^dbtB351!webchat@/);
  });

  it('parses 731 offline notifications with comma-separated targets', () => {
    const msg = parseIRCMessage(':eshmaki.me 731 me :alice,bob');
    expect(parseMonitorNumeric(msg)).toEqual({ kind: 'offline', targets: ['alice', 'bob'] });
  });

  it('parses 734 monitor-list-full with limit and description', () => {
    const msg = parseIRCMessage(':eshmaki.me 734 me 128 alice :Monitor list is full');
    const parsed = parseMonitorNumeric(msg);

    expect(parsed!.kind).toBe('full');
    expect(parsed!.limit).toBe(128);
    expect(parsed!.targets).toEqual(['alice']);
    expect(parsed!.description).toBe('Monitor list is full');
  });

  it('returns null for unrelated numerics', () => {
    expect(parseMonitorNumeric(parseIRCMessage(':eshmaki.me 001 me :Welcome'))).toBeNull();
  });
});

describe('live capture sweep', () => {
  it('parses every server line from the transcript without throwing', () => {
    expect(serverLines.length).toBeGreaterThan(50);
    for (const line of serverLines) {
      const msg = parseIRCMessage(line);
      expect(msg.command, `empty command for: ${line}`).not.toBe('');
    }
  });

  it('parses the 804 ACCESS entry: <channel> <level> <mask> <set_by> <duration>', () => {
    const line = mustFind((l) => l.includes(' 804 '), '804 ACCESS entry');
    const msg = parseIRCMessage(line);

    expect(msg.command).toBe('804');
    // params[0] is our nick, then the five documented 804 params
    expect(msg.params.slice(1)).toEqual(['#dbtest19036', 'VOICE', '*!*@capture.example', 'dbtA3950', '0']);
  });

  it('parses the EVENT MEDIA line with orochi.io/ vendor tags', () => {
    const line = mustFind((l) => l.startsWith('@orochi.io/') && l.includes('MEDIA JOIN'), 'EVENT MEDIA JOIN');
    const msg = parseIRCMessage(line);

    expect(msg.tags['orochi.io/category']).toBe('SERVICE');
    expect(msg.tags['orochi.io/severity']).toBe('notice');
    expect(msg.command).toBe('EVENT');
    expect(msg.host).toBe('eshmaki.me');
    expect(msg.params).toEqual(['dbtA3950', 'MEDIA', 'JOIN', '#dbtest19036', 'dbtA3950', 'voice']);
  });

  it('parses the 761 METADATA value reply', () => {
    const line = mustFind((l) => l.includes(' 761 dbtA3950 * '), '761 METADATA SET reply');
    const msg = parseIRCMessage(line);

    expect(msg.command).toBe('761');
    expect(msg.params).toEqual(['dbtA3950', '*', 'ocean.display-name', '*', 'Capture A']);
  });

  it('parses the react TAGMSG with an emoji tag value', () => {
    const line = mustFind((l) => l.includes('+draft/react=') && l.includes('TAGMSG'), 'react TAGMSG');
    const msg = parseIRCMessage(line);

    expect(msg.command).toBe('TAGMSG');
    expect(msg.tags['+draft/react']).toBe('👍');
    expect(msg.tags['+draft/reply']).toBe('17J4YRKCFKJPWSJN9YQTCGW72M');
    expect(msg.nick).toBe('dbtB351');
    expect(msg.params).toEqual(['#dbtest19036']);
  });

  it('parses the typing TAGMSG client tag', () => {
    const line = mustFind((l) => l.includes('+typing=active') && l.includes('TAGMSG'), 'typing TAGMSG');
    const msg = parseIRCMessage(line);

    expect(msg.command).toBe('TAGMSG');
    expect(msg.tags['+typing']).toBe('active');
  });

  it('parses the prefix-less MARKREAD echo', () => {
    const line = mustFind((l) => l.startsWith('MARKREAD '), 'prefix-less MARKREAD');
    const msg = parseIRCMessage(line);

    expect(msg.prefix).toBeNull();
    expect(msg.command).toBe('MARKREAD');
    expect(msg.params).toEqual(['#dbtest19036', 'timestamp=2026-07-03T20:38:05.728Z']);
  });
});
