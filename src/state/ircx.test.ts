// Tests for the IRCX / Onyx Server extension store — Onyx Server flags, PROP/ACCESS
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

vi.mock('./connection', () => ({ sendTo: vi.fn(() => true) }));

import { sendTo } from './connection';
import { clearBuffers, upsertBuffer, setActiveBuffer } from './buffers';
import {
  ircxState,
  markOnyxServer,
  isOnyxServer,
  isActiveOnyxServer,
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
  recordServiceFeedback,
  clearServiceFeedback,
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
    sendToMock.mockReset();
    sendToMock.mockReturnValue(true);
    setupServerAndChannel();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Onyx Server detection', () => {
    it('markOnyxServer flags a server and isOnyxServer looks it up', () => {
      expect(isOnyxServer('esh')).toBe(false);

      markOnyxServer('esh', 'wss://eshmaki.me:8080');

      expect(isOnyxServer('esh')).toBe(true);
      expect(ircxState.onyxGateways['esh']).toBe('wss://eshmaki.me:8080');
      expect(isOnyxServer('other')).toBe(false);
      expect(isOnyxServer(undefined)).toBe(false);
      expect(isOnyxServer('')).toBe(false);
    });

    it('isActiveOnyxServer is true only when the active buffer belongs to an Onyx Server', () => {
      expect(isActiveOnyxServer()).toBe(false);

      markOnyxServer('esh');
      expect(isActiveOnyxServer()).toBe(true);

      // Active buffer on a different, non-Onyx Server
      upsertBuffer(makeBuffer('ptr-other', {
        number: 3,
        localVars: { type: 'channel', server: 'freenode', channel: '#x' },
      }));
      setActiveBuffer('ptr-other');
      expect(isActiveOnyxServer()).toBe(false);
    });

    it('isActiveOnyxServer is false with no active buffer', () => {
      markOnyxServer('esh');
      clearBuffers();

      expect(isActiveOnyxServer()).toBe(false);
    });

    it('isActiveOnyxServer falls back to the active buffer network name', () => {
      clearBuffers();
      upsertBuffer(makeBuffer('ptr-network-only', {
        number: 4,
        localVars: { type: 'channel', network: 'meshnet', channel: '#mesh' },
      }));
      setActiveBuffer('ptr-network-only');
      markOnyxServer('meshnet');

      expect(isActiveOnyxServer()).toBe(true);
    });

    it('isActiveOnyxServer is false when the active buffer has no server identity', () => {
      upsertBuffer(makeBuffer('ptr-no-server-id', {
        number: 5,
        localVars: { type: 'channel', channel: '#floating' },
      }));
      setActiveBuffer('ptr-no-server-id');
      markOnyxServer('esh');

      expect(isActiveOnyxServer()).toBe(false);
    });

    it('isOnyxServer treats empty or undefined server names as non-matches', () => {
      markOnyxServer('');

      expect(isOnyxServer('')).toBe(false);
      expect(isOnyxServer(undefined)).toBe(false);
      expect(ircxState.onyxServers['']).toBe(true);
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
      expect(setProp('#general', 'TOPIC', 'hello world')).toBe(true);

      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote PROP #general TOPIC :hello world');
    });

    it('does not arm a PROP request when relay dispatch is rejected', () => {
      sendToMock.mockReturnValue(false);

      expect(requestProps('#general')).toBe(false);
      expect(ircxState.pendingPropTarget).toBeNull();
      expect(ircxState.pendingPropEntries).toEqual([]);
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

    it('interleaved requestProps(A) → requestProps(B) → finishPropList(A) does not blank B', () => {
      // A channel /prop is mid-flight when a nick /profile starts. A stale
      // prop_end for the first target must not clobber the second request.
      requestProps('#general');
      addPropEntry({ target: '#general', key: 'TOPIC', value: 'Welcome home' });

      // Second request retargets the shared collector before A's end arrives.
      requestProps('alice');
      addPropEntry({ target: 'alice', key: 'URL', value: 'https://alice.example' });

      // Late prop_end for the FIRST target — must be a no-op.
      finishPropList('#general');

      expect(ircxState.channelProps['#general']).toBeUndefined();
      expect(ircxState.pendingPropTarget).toBe('alice');
      expect(ircxState.pendingPropEntries).toEqual([
        { target: 'alice', key: 'URL', value: 'https://alice.example' },
      ]);

      // B's own end still folds correctly with its entries intact.
      finishPropList('alice');

      expect(ircxState.userProfiles['alice']).toEqual({
        nick: 'alice',
        url: 'https://alice.example',
      });
      expect(ircxState.pendingPropTarget).toBeNull();
      expect(ircxState.pendingPropEntries).toEqual([]);
    });

    it('a stale finishPropList(A) never blanks A\'s existing good props', () => {
      // A prior fold left good props for #general.
      requestProps('#general');
      addPropEntry({ target: '#general', key: 'TOPIC', value: 'Welcome home' });
      finishPropList('#general');
      expect(ircxState.channelProps['#general']).toEqual({ TOPIC: 'Welcome home' });

      // A different request is now in flight; a late duplicate end for #general
      // (its entries long gone) must leave the good props untouched.
      requestProps('bob');
      finishPropList('#general');

      expect(ircxState.channelProps['#general']).toEqual({ TOPIC: 'Welcome home' });
      expect(ircxState.pendingPropTarget).toBe('bob');
    });

    it('a duplicate finishPropList is a no-op after the request already committed', () => {
      requestProps('#general');
      addPropEntry({ target: '#general', key: 'TOPIC', value: 'Welcome home' });
      finishPropList('#general');
      expect(ircxState.channelProps['#general']).toEqual({ TOPIC: 'Welcome home' });

      // Second end for the same target — pending slot is already cleared.
      finishPropList('#general');

      expect(ircxState.channelProps['#general']).toEqual({ TOPIC: 'Welcome home' });
      expect(ircxState.pendingPropTarget).toBeNull();
      expect(ircxState.pendingPropEntries).toEqual([]);
    });
  });

  describe('ACCESS flow', () => {
    it('requestAccess arms the pending list and quotes ACCESS <chan> LIST', () => {
      expect(requestAccess('#general')).toBe(true);

      expect(ircxState.pendingAccessChannel).toBe('#general');
      expect(ircxState.pendingAccessEntries).toEqual([]);
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote ACCESS #general LIST');
    });

    it('does not arm ACCESS state or a delayed refresh after rejection', () => {
      vi.useFakeTimers();
      sendToMock.mockReturnValue(false);

      expect(requestAccess('#general')).toBe(false);
      expect(addAccess('#general', 'DENY', '*!*@bad.host')).toBe(false);
      expect(ircxState.pendingAccessChannel).toBeNull();
      expect(sendToMock).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(500);
      expect(sendToMock).toHaveBeenCalledTimes(2);
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

    it('requestChannelList can use Onyx Server LISTX', () => {
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
      expect(monitorAdd('Alice')).toBe(true);

      expect(ircxState.monitorList['alice']).toBe(true);
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote MONITOR + Alice');
    });

    it('does not change monitor state when the relay rejects the command', () => {
      sendToMock.mockReturnValue(false);

      expect(monitorAdd('Alice')).toBe(false);
      expect(ircxState.monitorList['alice']).toBeUndefined();

      sendToMock.mockReturnValue(true);
      monitorAdd('Alice');
      sendToMock.mockReturnValue(false);
      expect(monitorRemove('Alice')).toBe(false);
      expect(ircxState.monitorList['alice']).toBe(true);
    });

    it('monitorRemove untracks and quotes MONITOR -', () => {
      monitorAdd('Alice');

      monitorRemove('ALICE');

      expect(ircxState.monitorList['alice']).toBeUndefined();
      expect(sendToMock).toHaveBeenCalledWith(SRV, '/quote MONITOR - ALICE');
    });
  });

  describe('service feedback', () => {
    it('keeps a bounded session-only history and can clear one server', () => {
      for (let i = 0; i < 30; i += 1) {
        recordServiceFeedback('esh', {
          kind: 'info',
          command: 'CHANNEL',
          code: 'NOTICE',
          message: `reply ${i}`,
        }, i);
      }
      recordServiceFeedback('other', {
        kind: 'success',
        command: 'REGISTER',
        code: 'SUCCESS',
        message: 'Account registered',
      }, 31);

      expect(ircxState.serviceFeedback).toHaveLength(24);
      expect(ircxState.serviceFeedback[0]?.message).toBe('reply 7');
      expect(ircxState.serviceFeedback.at(-1)?.serverName).toBe('other');

      clearServiceFeedback('esh');
      expect(ircxState.serviceFeedback).toEqual([
        expect.objectContaining({ serverName: 'other', command: 'REGISTER' }),
      ]);

      clearServiceFeedback();
      expect(ircxState.serviceFeedback).toEqual([]);
    });
  });

  describe('raw command builders', () => {
    it('sendWhisper builds WHISPER <chan> <nick> :<msg>', () => {
      expect(sendWhisper('#general', 'alice', 'psst hello')).toBe(true);

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

      expect(sendWhisper('#general', 'alice', 'hi')).toBe(false);

      expect(sendToMock).not.toHaveBeenCalled();
    });

    it('propagates rejected relay dispatch for extension commands', () => {
      sendToMock.mockReturnValue(false);

      expect(setProp('#general', 'TOPIC', 'kept')).toBe(false);
      expect(sendWhisper('#general', 'alice', 'kept')).toBe(false);
      expect(sendPushSet('endpoint', 'kept')).toBe(false);
      expect(sendAccount('INFO')).toBe(false);
      expect(sendChannel('INFO #general')).toBe(false);
      expect(sendMemo('LIST')).toBe(false);
    });
  });

  describe('clearIrcx', () => {
    it('resets every slice of the store', () => {
      markOnyxServer('esh');
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

      expect(ircxState.onyxServers).toEqual({});
      expect(ircxState.onyxGateways).toEqual({});
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
