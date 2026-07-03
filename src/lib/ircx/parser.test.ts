import { describe, it, expect } from 'vitest';

import {
  parseIrcxLine,
  isIrcxNumeric,
  buildPropEntry,
  type IrcxParsed,
  type ParsedProp,
  type ParsedAccessEntry,
  type ParsedEvent,
  type ParsedError,
} from './parser';
import type { WeeChatLine } from '@/lib/weechat/model';

/** Build a minimal WeeChatLine carrying an irc_<numeric> tag and a rendered message. */
function wline(tags: string[], message: string): WeeChatLine {
  return {
    id: 'line-1',
    buffer: 'buf-1',
    date: new Date(0),
    datePrinted: new Date(0),
    displayed: true,
    highlight: false,
    tags,
    prefix: '',
    message,
    ircTags: new Map(),
  };
}

function parse(numeric: string, message: string): IrcxParsed | null {
  return parseIrcxLine(wline([`irc_${numeric}`, 'irc_numeric'], message));
}

describe('parseIrcxLine — 818/819 PROP', () => {
  it('parses an 818 prop entry with the trailing colon marker (fixture shape)', () => {
    const parsed = parse('818', '#dbtest19036 SUBJECT :capture subject') as ParsedProp;

    expect(parsed.type).toBe('prop');
    expect(parsed.target).toBe('#dbtest19036');
    expect(parsed.key).toBe('SUBJECT');
    expect(parsed.value).toBe('capture subject');
  });

  it('parses an 818 prop entry when the relay stripped the colon', () => {
    const parsed = parse('818', '#dbtest19036 SUBJECT capture subject') as ParsedProp;

    expect(parsed.type).toBe('prop');
    expect(parsed.target).toBe('#dbtest19036');
    expect(parsed.key).toBe('SUBJECT');
    expect(parsed.value).toBe('capture subject');
  });

  it('parses a two-token 818 as a prop with an empty value', () => {
    const parsed = parse('818', '#chan OID') as ParsedProp;

    expect(parsed.type).toBe('prop');
    expect(parsed.key).toBe('OID');
    expect(parsed.value).toBe('');
  });

  it('parses the 819 end-of-properties marker in both renderings', () => {
    expect(parse('819', '#dbtest19036 :End of properties')).toEqual({
      type: 'prop_end',
      target: '#dbtest19036',
    });
    expect(parse('819', '#dbtest19036 End of properties')).toEqual({
      type: 'prop_end',
      target: '#dbtest19036',
    });
  });

  it('builds a PropEntry from a parsed prop', () => {
    const parsed = parse('818', '#chan TOPIC :hello') as ParsedProp;
    expect(buildPropEntry(parsed)).toEqual({ target: '#chan', key: 'TOPIC', value: 'hello' });
  });
});

describe('parseIrcxLine — 801-805 ACCESS', () => {
  it('parses an 801 add ack: three tokens plus trailing, setter empty, duration 0', () => {
    const parsed = parse('801', '#dbtest19036 VOICE *!*@capture.example :ACCESS entry added') as ParsedAccessEntry;

    expect(parsed.type).toBe('access_add');
    expect(parsed.entry).toEqual({
      channel: '#dbtest19036',
      level: 'VOICE',
      mask: '*!*@capture.example',
      setter: '',
      duration: 0,
      reason: 'ACCESS entry added',
    });
  });

  it('parses an 801 add ack when the relay stripped the trailing colon', () => {
    const parsed = parse('801', '#dbtest19036 VOICE *!*@capture.example ACCESS entry added') as ParsedAccessEntry;

    expect(parsed.type).toBe('access_add');
    expect(parsed.entry.channel).toBe('#dbtest19036');
    expect(parsed.entry.level).toBe('VOICE');
    expect(parsed.entry.mask).toBe('*!*@capture.example');
    expect(parsed.entry.setter).toBe('');
    expect(parsed.entry.duration).toBe(0);
  });

  it('parses an 802 delete ack', () => {
    const parsed = parse('802', '#dbtest19036 VOICE *!*@capture.example :ACCESS entry deleted') as ParsedAccessEntry;

    expect(parsed.type).toBe('access_delete');
    expect(parsed.entry.mask).toBe('*!*@capture.example');
    expect(parsed.entry.reason).toBe('ACCESS entry deleted');
  });

  it('parses the fixture 804 full entry: <channel> <level> <mask> <set_by> <duration>', () => {
    const parsed = parse('804', '#dbtest19036 VOICE *!*@capture.example dbtA3950 0') as ParsedAccessEntry;

    expect(parsed.type).toBe('access_entry');
    expect(parsed.entry).toEqual({
      channel: '#dbtest19036',
      level: 'VOICE',
      mask: '*!*@capture.example',
      setter: 'dbtA3950',
      duration: 0,
      reason: '',
    });
  });

  it('parses an 804 entry with a non-zero duration', () => {
    const parsed = parse('804', '#chan DENY *!*@bad.example ops 42') as ParsedAccessEntry;

    expect(parsed.entry.setter).toBe('ops');
    expect(parsed.entry.duration).toBe(42);
  });

  it('uppercases the access level', () => {
    const parsed = parse('804', '#chan voice *!*@x setter 0') as ParsedAccessEntry;
    expect(parsed.entry.level).toBe('VOICE');
  });

  it('returns null for an access line with fewer than three tokens', () => {
    expect(parse('804', '#chan VOICE')).toBeNull();
  });

  it('parses 803 access-list start and 805 end', () => {
    expect(parse('803', '#dbtest19036 :ACCESS list begins')).toEqual({
      type: 'access_start',
      channel: '#dbtest19036',
    });
    expect(parse('805', '#dbtest19036 :End of ACCESS list')).toEqual({
      type: 'access_end',
      channel: '#dbtest19036',
    });
  });
});

describe('parseIrcxLine — 806-810/825 EVENT', () => {
  it('parses the fixture 806 add ack into event_add with type and mask', () => {
    const parsed = parse('806', 'MEDIA * :Event added') as ParsedEvent;

    expect(parsed.type).toBe('event_add');
    expect(parsed.eventType).toBe('MEDIA');
    expect(parsed.mask).toBe('*');
  });

  it('parses an 806 ack when the relay stripped the trailing colon', () => {
    const parsed = parse('806', 'MEDIA * Event added') as ParsedEvent;

    expect(parsed.type).toBe('event_add');
    expect(parsed.eventType).toBe('MEDIA');
    expect(parsed.mask).toBe('*');
  });

  it('parses the fixture 807 delete ack (no mask on the wire)', () => {
    const parsed = parse('807', 'MEDIA :Event removed') as ParsedEvent;

    expect(parsed.type).toBe('event_delete');
    expect(parsed.eventType).toBe('MEDIA');
    expect(parsed.mask).toBeUndefined();
  });

  it('parses 808 as the start of the event list', () => {
    expect(parse('808', ':Start of event list')).toEqual({ type: 'event_start' });
  });

  it('parses the fixture 809 list entry with category and mask', () => {
    const parsed = parse('809', 'MEDIA * :Event subscription') as ParsedEvent;

    expect(parsed.type).toBe('event_list');
    expect(parsed.eventType).toBe('MEDIA');
    expect(parsed.mask).toBe('*');
  });

  it('parses 810 as the end of the event list', () => {
    expect(parse('810', ':End of event list')).toEqual({ type: 'event_end' });
  });

  it('parses 825 as an event change', () => {
    expect(parse('825', 'whatever')).toEqual({ type: 'event_change' });
  });
});

describe('parseIrcxLine — 913/915-919 errors', () => {
  it('parses an error with the trailing colon marker', () => {
    const parsed = parse('913', '#chan :No access') as ParsedError;

    expect(parsed).toEqual({
      type: 'ircx_error',
      numeric: '913',
      target: '#chan',
      message: 'No access',
    });
  });

  it('parses an error when the relay stripped the colon', () => {
    const parsed = parse('918', '#chan Permission denied') as ParsedError;

    expect(parsed.numeric).toBe('918');
    expect(parsed.target).toBe('#chan');
    expect(parsed.message).toBe('Permission denied');
  });

  it('maps each error numeric 915-919 to ircx_error', () => {
    for (const numeric of ['915', '916', '917', '918', '919']) {
      const parsed = parse(numeric, '#chan :boom') as ParsedError;
      expect(parsed.type).toBe('ircx_error');
      expect(parsed.numeric).toBe(numeric);
      expect(parsed.message).toBe('boom');
    }
  });

  it('returns null for 914, which is not an IRCX numeric', () => {
    expect(parse('914', '#chan :nope')).toBeNull();
  });
});

describe('parseIrcxLine — general behavior', () => {
  it('returns null for lines without an irc_<numeric> tag', () => {
    expect(parseIrcxLine(wline(['irc_privmsg', 'notify_message'], 'hello'))).toBeNull();
  });

  it('returns null for non-IRCX numerics', () => {
    expect(parse('353', '= #chan :nick1 nick2')).toBeNull();
  });

  it('strips IRC formatting codes from the rendered message before parsing', () => {
    const parsed = parse('818', '\x02#chan\x02 \x0304SUBJECT\x03 :styled value') as ParsedProp;

    expect(parsed.target).toBe('#chan');
    expect(parsed.key).toBe('SUBJECT');
    expect(parsed.value).toBe('styled value');
  });
});

describe('isIrcxNumeric boundaries', () => {
  it.each([
    ['irc_800', false],
    ['irc_801', true],
    ['irc_825', true],
    ['irc_826', false],
    ['irc_913', true],
    ['irc_914', false],
    ['irc_919', true],
    ['irc_920', false],
  ])('%s → %s', (tag, expected) => {
    expect(isIrcxNumeric([tag])).toBe(expected);
  });

  it('returns false when no numeric tag is present', () => {
    expect(isIrcxNumeric(['irc_privmsg', 'notify_message'])).toBe(false);
    expect(isIrcxNumeric([])).toBe(false);
  });
});
