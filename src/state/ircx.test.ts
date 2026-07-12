// Tests for the IRCX / orochi extension store — orochi flags, PROP/ACCESS
// list assembly, bot/account tags, panels, MONITOR, and raw /quote plumbing.
//
// The connection module is mocked so sendTo can be spied without a relay.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Node 22+ defines an experimental localStorage global that is undefined
// without --localstorage-file and shadows any jsdom implementation. Install a
// working in-memory Storage before the store modules load and read it.
vi.hoisted(() => {
  const backing = new Map<string, string>();
  const stub = {
    get length() { return backing.size; },
    clear: () => { backing.clear(); },
    getItem: (k: string) => backing.get(k) ?? null,
    key: (i: number) => [...backing.keys()][i] ?? null,
    removeItem: (k: string) => { backing.delete(k); },
    setItem: (k: string, v: string) => { backing.set(k, String(v)); },
  } satisfies Storage;
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
});

import type { WeeChatBuffer } from '@/lib/weechat/model';
import type { AccessEntry, PropEntry } from '@/lib/ircx/types';

vi.mock('./connection', () => ({ sendTo: vi.fn() }));

import { sendTo } from './connection';
import { clearBuffers, upsertBuffer, setActiveBuffer } from './buffers';
import {
  ircxState,
  markOrochi,
  isOrochiServer,
  isActiveOrochi,
  requestProps,
  setProp,
  addPropEntry,
  finishPropList,
  clearPropRequest,
  requestAccess,
  addAccessEntry,
  finishAccessList,
  clearAccessRequest,
  addAccess,
  removeAccess,
  requestChannelList,
  addChannelListRow,
  finishChannelList,
  clearChannelList,
  markBot,
  unmarkBot,
  isBot,
  setAccount,
  getAccount,
  openChannelInfo,
  closeChannelInfo,
  openUserProfile,
  closeUserProfile,
  openServicesPanel,
  closeServicesPanel,
  sendAccount,
  sendChannel,
  sendMemo,
  sendWhisper,
  monitorAdd,
  monitorRemove,
  sendPushSet,
  clearIrcx,
} from './ircx';

const sendToMock = vi.mocked(sendTo);

const SRV = 'ptr-srv';
const CHAN = 'ptr-chan';

function makeBuffer(id: string, over: Partial<WeeChatBuffer> = {}): WeeChatBuffer {
  return {
    id,
    number: 1,
    name: id,
    fullName: id,
    shortName: '',
    title: '',
    type: 0,
    nicksCount: 0,
    localVars: {},
    notify: 1,
    hidden: false,
    ...over,
  };
}

/** Server buffer + channel buffer on server 'esh'; channel is active. */
function setupServerAndChannel(): void {
  upsertBuffer(makeBuffer(SRV, {
    number: 1,
    name: 'irc.server.esh',
    localVars: { type: 'server', server: 'esh' },
  }));
  upsertBuffer(makeBuffer(CHAN, {
    number: 2,
    name: 'irc.esh.#general',
    shortName: '#general',
    localVars: { type: 'channel', server: 'esh', channel: '#general' },
  }));
  setActiveBuffer(CHAN);
}

function accessEntry(over: Partial<AccessEntry> = {}): AccessEntry {
  return {
    channel: '#general',
    level: 'GRANT',
    mask: '*!*@trusted.host',
    setter: 'kain',
    duration: 3600,
    reason: 'trusted',
    ...over,
  };
}

describe('ircx store', () => {
  beforeEach(() => {
    clearIrcx();
    clearBuffers();
    localStorage.clear();
    sendToMock.mockClear();
    setupServerAndChannel();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('orochi detection', () => {
    it('markOrochi flags a server and isOrochiServer looks it up', () => {
      expect(isOrochiServer('esh')).toBe(false);

      markOrochi('esh', 'wss://eshmaki.me:8080');

      expect(isOrochiServer('esh')).toBe(true);
      expect(ircxState.orochiGateways['esh']).toBe('wss://eshmaki.me:8080');
      expect(isOrochiServer('other')).toBe(false);
      expect(isOrochiServer(undefined)).toBe(false);
      expect(isOrochiServer('')).toBe(false);
    });

    it('isActiveOrochi is true only when the active buffer belongs to an orochi server', () => {
      expect(isActiveOrochi()).toBe(false);

      markOrochi('esh');
      expect(isActiveOrochi()).toBe(true);

      // Active buffer on a different, non-orochi server
      upsertBuffer(makeBuffer('ptr-other', {
        number: 3,
        localVars: { type: 'channel', server: 'freenode', channel: '#x' },
      }));
      setActiveBuffer('ptr-other');
      expect(isActiveOrochi()).toBe(false);
    });

    it('isActiveOrochi is false with no active buffer', () => {
      markOrochi('esh');
      clearBuffers();

      expect(isActiveOrochi()).toBe(false);
    });
  });

  describe('PROP flow', () => {
    it('requestProps arms the pending list and quotes PROP <target> * to the server buffer', () => {
      requestProps('#general');

      expect(ircxState.pendingPropTarget).toBe('#general');
      expect(ircxState.pendingPropEntries).toEqual([]);
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote PROP #general *');
    });

    it('setProp quotes PROP <target> <key> :<value>', () => {
      setProp('#general', 'TOPIC', 'hello world');

      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote PROP #general TOPIC :hello world');
    });

    it('addPropEntry accumulates and finishPropList commits channel targets to channelProps', () => {
      requestProps('#general');
      addPropEntry({ target: '#general', key: 'topic', value: 'Welcome home' });
      addPropEntry({ target: '#general', key: 'OID', value: 'abc123' });
      addPropEntry({ target: '#elsewhere', key: 'TOPIC', value: 'not ours' });

      finishPropList('#general');

      expect(ircxState.channelProps['#general']).toEqual({ TOPIC: 'Welcome home', OID: 'abc123' });
      expect(ircxState.channelProps['#elsewhere']).toBeUndefined();
      expect(ircxState.pendingPropTarget).toBeNull();
      expect(ircxState.pendingPropEntries).toEqual([]);
    });

    it('finishPropList commits nick targets to userProfiles', () => {
      const entries: PropEntry[] = [
        { target: 'alice', key: 'URL', value: 'https://alice.example' },
        { target: 'alice', key: 'BIO', value: 'hi there' },
        { target: 'alice', key: 'LOCATION', value: 'Sea of Japan' },
        { target: 'alice', key: 'NO-VIDEO', value: '1' },
        { target: 'alice', key: 'UNKNOWNKEY', value: 'ignored' },
      ];
      for (const e of entries) addPropEntry(e);

      finishPropList('alice');

      expect(ircxState.userProfiles['alice']).toEqual({
        nick: 'alice',
        url: 'https://alice.example',
        bio: 'hi there',
        location: 'Sea of Japan',
        noVideo: true,
      });
      expect(ircxState.channelProps['alice']).toBeUndefined();
    });

    it('clearPropRequest drops pending state without committing', () => {
      requestProps('#general');
      addPropEntry({ target: '#general', key: 'TOPIC', value: 'x' });

      clearPropRequest();

      expect(ircxState.pendingPropTarget).toBeNull();
      expect(ircxState.pendingPropEntries).toEqual([]);
      expect(ircxState.channelProps['#general']).toBeUndefined();
    });
  });

  describe('ACCESS flow', () => {
    it('requestAccess arms the pending list and quotes ACCESS <chan> LIST', () => {
      requestAccess('#general');

      expect(ircxState.pendingAccessChannel).toBe('#general');
      expect(ircxState.pendingAccessEntries).toEqual([]);
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote ACCESS #general LIST');
    });

    it('finishAccessList commits only entries matching the channel', () => {
      requestAccess('#general');
      const mine = accessEntry();
      const deny = accessEntry({ level: 'DENY', mask: '*!*@bad.host', duration: 0, reason: 'spam' });
      const other = accessEntry({ channel: '#other' });
      addAccessEntry(mine);
      addAccessEntry(deny);
      addAccessEntry(other);

      finishAccessList('#general');

      expect(ircxState.accessLists['#general']).toEqual([mine, deny]);
      expect(ircxState.accessLists['#other']).toBeUndefined();
      expect(ircxState.pendingAccessChannel).toBeNull();
      expect(ircxState.pendingAccessEntries).toEqual([]);
    });

    it('access entries carry the full shape (channel/level/mask/setter/duration/reason)', () => {
      addAccessEntry(accessEntry());
      finishAccessList('#general');

      expect(ircxState.accessLists['#general']?.[0]).toEqual({
        channel: '#general',
        level: 'GRANT',
        mask: '*!*@trusted.host',
        setter: 'kain',
        duration: 3600,
        reason: 'trusted',
      });
    });

    it('clearAccessRequest drops pending access state', () => {
      requestAccess('#general');
      addAccessEntry(accessEntry());

      clearAccessRequest();

      expect(ircxState.pendingAccessChannel).toBeNull();
      expect(ircxState.pendingAccessEntries).toEqual([]);
    });

    it('addAccess quotes ADD (with reason) and re-lists after 500ms', () => {
      vi.useFakeTimers();

      addAccess('#general', 'DENY', '*!*@bad.host', 'spam');

      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote ACCESS #general ADD DENY *!*@bad.host :spam');
      sendToMock.mockClear();

      vi.advanceTimersByTime(500);
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote ACCESS #general LIST');
      expect(ircxState.pendingAccessChannel).toBe('#general');
    });

    it('addAccess omits the reason clause when not given', () => {
      vi.useFakeTimers();

      addAccess('#general', 'GRANT', '*!*@ok.host');

      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote ACCESS #general ADD GRANT *!*@ok.host');
    });

    it('removeAccess quotes DELETE and re-lists after 500ms', () => {
      vi.useFakeTimers();

      removeAccess('#general', 'DENY', '*!*@bad.host');

      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote ACCESS #general DELETE DENY *!*@bad.host');
      sendToMock.mockClear();

      vi.advanceTimersByTime(500);
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote ACCESS #general LIST');
    });
  });

  describe('channel list flow', () => {
    it('requestChannelList sends LIST to the active server and marks loading', () => {
      requestChannelList({ pattern: '#d*', minUsers: '1', maxUsers: '25' });

      expect(ircxState.channelList.status).toBe('loading');
      expect(ircxState.channelList.rows).toEqual([]);
      expect(ircxState.channelList.query).toBe('#d* >1,<25');
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote LIST #d* >1,<25');
    });

    it('requestChannelList can use Orochi LISTX', () => {
      requestChannelList({ extended: true });

      expect(ircxState.channelList.extended).toBe(true);
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote LISTX');
    });

    it('dedupes rows by channel and finishChannelList marks the result ready', () => {
      addChannelListRow({ channel: '#root', users: 1, topic: 'old' });
      addChannelListRow({ channel: '#root', users: 3, topic: 'new' });
      addChannelListRow({ channel: '#chat', users: 2, topic: '' });

      finishChannelList();

      expect(ircxState.channelList.status).toBe('ready');
      expect(ircxState.channelList.rows).toEqual([
        { channel: '#root', users: 3, topic: 'new' },
        { channel: '#chat', users: 2, topic: '' },
      ]);
      expect(ircxState.channelList.updatedAt).not.toBeNull();
    });

    it('clearChannelList resets the browser state', () => {
      addChannelListRow({ channel: '#root', users: 1, topic: '' });
      finishChannelList();

      clearChannelList();

      expect(ircxState.channelList).toEqual({
        status: 'idle',
        rows: [],
        query: '',
        extended: false,
        updatedAt: null,
      });
    });
  });

  describe('bot and account tags', () => {
    it('markBot / isBot are case-insensitive; unmarkBot removes', () => {
      markBot('HelperBot');

      expect(isBot('helperbot')).toBe(true);
      expect(isBot('HELPERBOT')).toBe(true);
      expect(isBot('other')).toBe(false);

      unmarkBot('helperBOT');
      expect(isBot('HelperBot')).toBe(false);
    });

    it('setAccount maps nicks case-insensitively and * or empty clears', () => {
      setAccount('Alice', 'alice_acct');
      expect(getAccount('alice')).toBe('alice_acct');
      expect(getAccount('ALICE')).toBe('alice_acct');

      setAccount('alice', '*');
      expect(getAccount('alice')).toBeUndefined();

      setAccount('bob', 'bob_acct');
      setAccount('BOB', '');
      expect(getAccount('bob')).toBeUndefined();
    });
  });

  describe('panels', () => {
    it('openChannelInfo / closeChannelInfo set the panel target', () => {
      openChannelInfo('#general');
      expect(ircxState.channelInfoTarget).toBe('#general');

      closeChannelInfo();
      expect(ircxState.channelInfoTarget).toBeNull();
    });

    it('openUserProfile sets the target and auto-requests props', () => {
      openUserProfile('alice');

      expect(ircxState.userProfileTarget).toBe('alice');
      expect(ircxState.pendingPropTarget).toBe('alice');
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote PROP alice *');

      closeUserProfile();
      expect(ircxState.userProfileTarget).toBeNull();
    });

    it('openServicesPanel / closeServicesPanel', () => {
      openServicesPanel('memo');
      expect(ircxState.servicesPanel).toBe('memo');

      closeServicesPanel();
      expect(ircxState.servicesPanel).toBeNull();
    });
  });

  describe('MONITOR', () => {
    it('monitorAdd tracks the lowercase nick and quotes MONITOR +', () => {
      monitorAdd('Alice');

      expect(ircxState.monitorList['alice']).toBe(true);
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote MONITOR + Alice');
    });

    it('monitorRemove untracks and quotes MONITOR -', () => {
      monitorAdd('Alice');

      monitorRemove('ALICE');

      expect(ircxState.monitorList['alice']).toBeUndefined();
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote MONITOR - ALICE');
    });
  });

  describe('raw command builders', () => {
    it('sendWhisper builds WHISPER <chan> <nick> :<msg>', () => {
      sendWhisper('#general', 'alice', 'psst hello');

      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote WHISPER #general alice :psst hello');
    });

    it('sendPushSet builds PUSHSET <key> <value>', () => {
      sendPushSet('endpoint', 'https://push.example/x y');

      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote PUSHSET endpoint https://push.example/x y');
    });

    it('service verbs prefix ACCOUNT / CHANNEL / MEMO', () => {
      sendAccount('REGISTER kain hunter2');
      sendChannel('INFO #general');
      sendMemo('SEND alice hi');

      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote ACCOUNT REGISTER kain hunter2');
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote CHANNEL INFO #general');
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote MEMO SEND alice hi');
    });

    it('routes to the active buffer when it is itself the server buffer', () => {
      setActiveBuffer(SRV);

      sendWhisper('#general', 'alice', 'hi');

      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote WHISPER #general alice :hi');
    });

    it('does not send when no server buffer is resolvable', () => {
      clearBuffers();

      sendWhisper('#general', 'alice', 'hi');

      expect(sendToMock).not.toHaveBeenCalled();
    });
  });

  describe('clearIrcx', () => {
    it('resets every slice of the store', () => {
      markOrochi('esh');
      requestProps('#general');
      addPropEntry({ target: '#general', key: 'TOPIC', value: 'x' });
      requestAccess('#general');
      addAccessEntry(accessEntry());
      markBot('bot');
      setAccount('alice', 'acct');
      openChannelInfo('#general');
      openUserProfile('alice');
      openServicesPanel('nick');
      monitorAdd('alice');

      clearIrcx();

      expect(ircxState.orochiServers).toEqual({});
      expect(ircxState.orochiGateways).toEqual({});
      expect(ircxState.channelProps).toEqual({});
      expect(ircxState.userProfiles).toEqual({});
      expect(ircxState.accessLists).toEqual({});
      expect(ircxState.botNicks).toEqual({});
      expect(ircxState.accountMap).toEqual({});
      expect(ircxState.pendingPropTarget).toBeNull();
      expect(ircxState.pendingPropEntries).toEqual([]);
      expect(ircxState.pendingAccessChannel).toBeNull();
      expect(ircxState.pendingAccessEntries).toEqual([]);
      expect(ircxState.channelInfoTarget).toBeNull();
      expect(ircxState.userProfileTarget).toBeNull();
      expect(ircxState.servicesPanel).toBeNull();
      expect(ircxState.monitorList).toEqual({});
    });
  });
});
