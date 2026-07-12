import { describe, it, expect } from 'vitest';

import {
  parseIrcxLine,
  parseEventFeedText,
  isIrcxNumeric,
  isChannelListNumeric,
  buildPropEntry,
  type IrcxParsed,
  type ParsedProp,
  type ParsedAccessEntry,
  type ParsedEvent,
  type ParsedError,
  type ParsedChannelListRow,
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

  it('keeps extra 818 value tokens together after target and key', () => {
    const parsed = parse('818', '#chan SUBJECT value with extra relay tokens') as ParsedProp;

    expect(parsed).toEqual({
      type: 'prop',
      target: '#chan',
      key: 'SUBJECT',
      value: 'value with extra relay tokens',
    });
  });

  it('returns null for a malformed 818 with only a target', () => {
    expect(() => parse('818', '#chan')).not.toThrow();
    expect(parse('818', '#chan')).toBeNull();
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

  it('fail-safes an empty 819 marker without throwing', () => {
    expect(() => parse('819', '')).not.toThrow();
    expect(parse('819', '')).toEqual({
      type: 'prop_end',
      target: '',
    });
  });

  it('builds a PropEntry from a parsed prop', () => {
    const parsed = parse('818', '#chan TOPIC :hello') as ParsedProp;
    expect(buildPropEntry(parsed)).toEqual({ target: '#chan', key: 'TOPIC', value: 'hello' });
  });
});

describe('parseEventFeedText — live Event Spine lines', () => {
  it('parses raw MEDIA EVENT lines with source, target, channel, subject, and detail', () => {
    const parsed = parseEventFeedText(':eshmaki.me EVENT dbtA3950 MEDIA JOIN #root alice voice');

    expect(parsed).toMatchObject({
      type: 'event_feed',
      kind: 'media',
      source: 'eshmaki.me',
      target: 'dbtA3950',
      category: 'MEDIA',
      verb: 'JOIN',
      channel: '#root',
      subject: 'alice',
      detail: 'voice',
      attrs: {},
    });
  });

  it('parses OBSERVE events and key/value attributes neatly', () => {
    const parsed = parseEventFeedText(':ircx.us EVENT oper OBSERVE connect bob!u@real.host acct=bob tls=yes');

    expect(parsed).toMatchObject({
      kind: 'observe',
      source: 'ircx.us',
      target: 'oper',
      category: 'OBSERVE',
      verb: 'CONNECT',
      subject: 'bob!u@real.host',
      attrs: { acct: 'bob', tls: 'yes' },
    });
  });

  it('parses NOTE EVENT broadcasts into category, sender, and body', () => {
    const parsed = parseEventFeedText(':eshmaki.me NOTE EVENT SECURITY :oper!u@host: rotate passwords');

    expect(parsed).toMatchObject({
      kind: 'note',
      source: 'eshmaki.me',
      category: 'SECURITY',
      sender: 'oper!u@host',
      detail: 'rotate passwords',
      attrs: {},
    });
  });

  it('parses WeeChat-rendered EVENT text without a raw IRC prefix', () => {
    const parsed = parseEventFeedText('EVENT me POLICY UPDATE #root local-only=true');

    expect(parsed).toMatchObject({
      kind: 'event',
      target: 'me',
      category: 'POLICY',
      verb: 'UPDATE',
      subject: '#root',
      attrs: { 'local-only': 'true' },
    });
  });

  it('unwraps WeeChat unknown-command wrappers around tagged Orochi EVENT lines', () => {
    const parsed = parseEventFeedText('irc: command "EVENT" not found: "@orochi.io/category=CONNECT;orochi.io/severity=notice :eshmaki.me EVENT kain USER CONNECT C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5"');

    expect(parsed).toMatchObject({
      kind: 'event',
      source: 'eshmaki.me',
      target: 'kain',
      category: 'USER',
      verb: 'CONNECT',
      subject: 'C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5',
    });
  });

  it('parses bare Orochi tag prefixes when the leading @ was stripped', () => {
    const parsed = parseEventFeedText('orochi.io/category=CONNECT;orochi.io/severity=notice :eshmaki.me EVENT kain USER CONNECT C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5');

    expect(parsed).toMatchObject({
      source: 'eshmaki.me',
      target: 'kain',
      category: 'USER',
      verb: 'CONNECT',
      subject: 'C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5',
    });
  });

  it('parses bare Orochi disconnect tags with a trailing reason', () => {
    const parsed = parseEventFeedText('orochi.io/category=DISCONNECT;orochi.io/severity=notice :eshmaki.me EVENT kain USER DISCONNECT C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5 :Client quit');

    expect(parsed).toMatchObject({
      category: 'USER',
      verb: 'DISCONNECT',
      detail: 'Client quit',
    });
  });

  it('unwraps member and media Event Spine wrappers from WeeChat server-buffer errors', () => {
    expect(parseEventFeedText('irc: command "EVENT" not found: "@orochi.io/category=OPER_ACTION;orochi.io/severity=notice :eshmaki.me EVENT kain MEMBER JOIN #root C"')).toMatchObject({
      category: 'MEMBER',
      verb: 'JOIN',
      subject: '#root',
      detail: 'C',
    });

    expect(parseEventFeedText('irc: command "EVENT" not found: "@orochi.io/category=SERVICE;orochi.io/severity=notice :eshmaki.me EVENT kain MEDIA PROFILE #root C codecs=kaguravox,kaguravis fec=rs_block"')).toMatchObject({
      kind: 'media',
      category: 'MEDIA',
      verb: 'PROFILE',
      channel: '#root',
      subject: 'C',
      attrs: { codecs: 'kaguravox,kaguravis', fec: 'rs_block' },
    });
  });

  it('preserves trailing quit reasons from wrapped disconnect events', () => {
    const parsed = parseEventFeedText('irc: command "EVENT" not found: "@orochi.io/category=DISCONNECT;orochi.io/severity=notice :eshmaki.me EVENT kain USER DISCONNECT C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5 :Client quit"');

    expect(parsed).toMatchObject({
      category: 'USER',
      verb: 'DISCONNECT',
      subject: 'C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5',
      detail: 'Client quit',
    });
  });

  it('returns null for unrelated text', () => {
    expect(parseEventFeedText('ordinary server line')).toBeNull();
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

  it('parses an 804 entry with extra tokens as part of the duration field only', () => {
    const parsed = parse('804', '#chan VOICE *!*@good.example ops 15 ignored trailing text') as ParsedAccessEntry;

    expect(parsed.entry).toEqual({
      channel: '#chan',
      level: 'VOICE',
      mask: '*!*@good.example',
      setter: 'ops',
      duration: 15,
      reason: '',
    });
  });

  it('coerces malformed 804 durations to 0 without throwing', () => {
    expect(() => parse('804', '#chan VOICE *!*@good.example ops not-a-number')).not.toThrow();

    const parsed = parse('804', '#chan VOICE *!*@good.example ops not-a-number') as ParsedAccessEntry;
    expect(parsed.entry.duration).toBe(0);
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

  it('fail-safes empty 803 and 805 markers without throwing', () => {
    expect(() => parse('803', '')).not.toThrow();
    expect(() => parse('805', '')).not.toThrow();
    expect(parse('803', '')).toEqual({ type: 'access_start', channel: '' });
    expect(parse('805', '')).toEqual({ type: 'access_end', channel: '' });
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

  it('parses requester-prefixed EVENT numerics from raw Orochi shape', () => {
    const parsed = parse('806', 'dbtA3950 MEDIA #root :Event added') as ParsedEvent;

    expect(parsed.type).toBe('event_add');
    expect(parsed.eventType).toBe('MEDIA');
    expect(parsed.mask).toBe('#root');
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
    expect(parse('825', 'dbtA3950 CHANNEL #bar* :Event updated')).toEqual({
      type: 'event_change',
      eventType: 'CHANNEL',
      mask: '#bar*',
    });
  });
});

describe('parseIrcxLine — LIST/LISTX channel rows', () => {
  it('recognizes standard LIST numerics separately from IRCX numerics', () => {
    expect(isIrcxNumeric(['irc_322'])).toBe(false);
    expect(isChannelListNumeric(['irc_322'])).toBe(true);
    expect(isChannelListNumeric(['irc_817'])).toBe(true);
  });

  it('parses a standard 322 LIST row', () => {
    const parsed = parse('322', '#root 7 :Main room') as ParsedChannelListRow;

    expect(parsed).toEqual({
      type: 'channel_list_row',
      channel: '#root',
      users: 7,
      topic: 'Main room',
    });
  });

  it('parses requester-prefixed LIST rows from raw server shape', () => {
    const parsed = parse('322', 'me #root 3 :Topic text') as ParsedChannelListRow;

    expect(parsed.channel).toBe('#root');
    expect(parsed.users).toBe(3);
    expect(parsed.topic).toBe('Topic text');
  });

  it('parses Orochi LISTX 812 rows and the 817 end marker', () => {
    const parsed = parse('812', 'me #test 1 0 0 :mesh room') as ParsedChannelListRow;

    expect(parsed).toEqual({
      type: 'channel_list_row',
      channel: '#test',
      users: 1,
      modes: '0 0',
      topic: 'mesh room',
    });
    expect(parse('817', 'me :End of LISTX')).toEqual({ type: 'channel_list_end' });
  });

  it('returns null for malformed LIST and LISTX rows without channel params', () => {
    expect(() => parse('322', 'me not-a-channel 4 :bad')).not.toThrow();
    expect(() => parse('812', 'me not-a-channel 4 +nt 0 :bad')).not.toThrow();
    expect(parse('322', 'me not-a-channel 4 :bad')).toBeNull();
    expect(parse('812', 'me not-a-channel 4 +nt 0 :bad')).toBeNull();
  });

  it('coerces malformed LIST and LISTX user counts to 0', () => {
    expect(parse('322', '#root nope :Topic')).toMatchObject({
      type: 'channel_list_row',
      channel: '#root',
      users: 0,
      topic: 'Topic',
    });

    expect(parse('812', '#root nope +nt 0 :Topic')).toMatchObject({
      type: 'channel_list_row',
      channel: '#root',
      users: 0,
      modes: '+nt 0',
      topic: 'Topic',
    });
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
    ['irc_804', true],
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

  it('recognizes 321 as channel-list-only and not parsed IRCX payload', () => {
    expect(isIrcxNumeric(['irc_321'])).toBe(false);
    expect(isChannelListNumeric(['irc_321'])).toBe(true);
    expect(parse('321', 'Channel :Users Name')).toBeNull();
  });
});
