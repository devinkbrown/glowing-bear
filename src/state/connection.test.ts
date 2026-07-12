// Tests for the connection store — the lineAdded pipeline, oper/orochi
// detection, slash-command routing and bridge seams, driven WITHOUT a socket.
//
// WeeRelayClient is mocked with an EventTarget-based fake so connect() wires
// its listeners onto an instance we can dispatch CustomEvents at, and every
// outbound call (sendInput, requestHistory, ...) is a spy.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

const relayMock = vi.hoisted(() => ({ instances: [] as unknown[] }));

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

vi.mock('@/lib/weechat/client', () => {
  class FakeRelayClient extends EventTarget {
    settings: unknown;
    connect = vi.fn();
    disconnect = vi.fn();
    sendPing = vi.fn();
    sendInput = vi.fn();
    requestHistory = vi.fn();
    requestNicklist = vi.fn();
    constructor(settings: unknown) {
      super();
      this.settings = settings;
      relayMock.instances.push(this);
    }
  }
  return { WeeRelayClient: FakeRelayClient };
});

vi.mock('@/lib/notifications', () => ({
  notify: vi.fn(),
  playSound: vi.fn(),
  updateTitle: vi.fn(),
  clearTitle: vi.fn(),
  requestPermission: vi.fn(async () => false),
}));

import { ConnectionState } from '@/lib/weechat/model';
import type { RelaySettings, WeeChatBuffer, WeeChatLine, WeeChatNick } from '@/lib/weechat/model';
import { notify } from '@/lib/notifications';
import {
  connect,
  disconnect,
  sendInput,
  setMediaSink,
  setRelayObserver,
  connectionState,
  connectionError,
  lag,
  isOper,
  isAdmin,
  isOperBuffer,
  requestHistory,
  setActive,
  openQuery,
  type MediaCommandSink,
} from './connection';
import { buffersState, upsertBuffer, setActiveBuffer, addLine } from './buffers';
import { ircxState, isOrochiServer, markOrochi } from './ircx';
import type { BufferEntry } from '@/types';

interface FakeClient extends EventTarget {
  settings: RelaySettings;
  connect: Mock;
  disconnect: Mock;
  sendPing: Mock;
  sendInput: Mock;
  requestHistory: Mock;
  requestNicklist: Mock;
}

function lastClient(): FakeClient {
  const c = relayMock.instances[relayMock.instances.length - 1];
  if (!c) throw new Error('no relay client constructed');
  return c as FakeClient;
}

function emit<T>(client: FakeClient, name: string, detail: T): void {
  client.dispatchEvent(new CustomEvent<T>(name, { detail }));
}

const SRV = 'ptr-srv';
const CHAN = 'ptr-chan';
let lineSeq = 0;

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

function makeLine(over: Partial<WeeChatLine> & { buffer: string }): WeeChatLine {
  const now = new Date();
  return {
    id: `ln-${lineSeq++}`,
    date: now,
    datePrinted: now,
    displayed: true,
    highlight: false,
    tags: [],
    prefix: '',
    message: '',
    ircTags: new Map<string, string>(),
    ...over,
  };
}

function serverBuffer(): WeeChatBuffer {
  return makeBuffer(SRV, {
    number: 1,
    name: 'irc.server.esh',
    localVars: { type: 'server', server: 'esh', nick: 'kain' },
  });
}

function channelBuffer(): WeeChatBuffer {
  return makeBuffer(CHAN, {
    number: 2,
    name: 'irc.esh.#general',
    shortName: '#general',
    localVars: { type: 'channel', server: 'esh', channel: '#general', nick: 'kain' },
  });
}

/** connect() then upsert a server + channel buffer (server buffer active). */
function connectWithBuffers(): FakeClient {
  connect();
  const c = lastClient();
  upsertBuffer(serverBuffer());
  upsertBuffer(channelBuffer());
  return c;
}

function entry(pointer: string): BufferEntry {
  const e = buffersState.buffers[pointer];
  if (!e) throw new Error(`no buffer entry for ${pointer}`);
  return e;
}

describe('connection store', () => {
  beforeEach(() => {
    disconnect(); // clears buffers, ircx, oper state, client
    setMediaSink(null);
    setRelayObserver(null);
    localStorage.clear();
    relayMock.instances.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    disconnect();
    setMediaSink(null);
    setRelayObserver(null);
  });

  describe('lifecycle wiring', () => {
    it('connect() builds a client from settings.relay and dials it', () => {
      connect();

      const c = lastClient();
      expect(c.settings.host).toBe('eshmaki.me');
      expect(c.settings.port).toBe(9001);
      expect(c.connect).toHaveBeenCalledTimes(1);
    });

    it('tracks stateChanged, pings on connect, and surfaces errors', () => {
      connect();
      const c = lastClient();

      emit(c, 'stateChanged', { state: ConnectionState.CONNECTED });
      expect(connectionState()).toBe(ConnectionState.CONNECTED);
      expect(c.sendPing).toHaveBeenCalledTimes(1);

      emit(c, 'error', { message: 'relay says no' });
      expect(connectionError()).toBe('relay says no');

      emit(c, 'stateChanged', { state: ConnectionState.DISCONNECTED });
      expect(connectionState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('computes lag from the pong echo', () => {
      connect();
      const c = lastClient();

      emit(c, 'pong', { arg: String(Date.now() - 250) });

      expect(lag()).toBeGreaterThanOrEqual(250);
      expect(lag()).toBeLessThan(10_000);
    });

    it('buffersLoaded upserts buffers and requests nicklists for channels only', () => {
      connect();
      const c = lastClient();

      emit(c, 'buffersLoaded', { buffers: [serverBuffer(), channelBuffer()] });

      expect(Object.keys(buffersState.buffers).sort()).toEqual([CHAN, SRV].sort());
      expect(c.requestNicklist).toHaveBeenCalledTimes(1);
      expect(c.requestNicklist).toHaveBeenCalledWith(CHAN);
    });

    it('bufferOpened upserts and requests history for non-server buffers', () => {
      connect();
      const c = lastClient();

      emit(c, 'bufferOpened', { buffer: serverBuffer() });
      expect(c.requestHistory).not.toHaveBeenCalled();

      emit(c, 'bufferOpened', { buffer: channelBuffer() });
      expect(buffersState.buffers[CHAN]).toBeDefined();
      expect(c.requestHistory).toHaveBeenCalledWith(CHAN, 100);

      emit(c, 'bufferClosed', { id: CHAN });
      expect(buffersState.buffers[CHAN]).toBeUndefined();
    });

    it('nicklist events flow into the buffers store', () => {
      const c = connectWithBuffers();
      const nick: WeeChatNick = {
        id: 'nk-1', pointer: 'nk-1', level: 0, name: 'alice', color: '',
        prefix: '@', prefixColor: '', visible: true, group: false,
      };

      emit(c, 'nicklistReceived', { buffer: CHAN, nicks: [nick] });
      expect(entry(CHAN).nicks['alice']).toBeDefined();

      emit(c, 'nickRemoved', { buffer: CHAN, nickId: 'nk-1' });
      expect(entry(CHAN).nicks['alice']).toBeUndefined();

      emit(c, 'nickAdded', { buffer: CHAN, nick });
      expect(entry(CHAN).nickGroups['Op']?.[0]?.name).toBe('alice');
    });

    it('hotlistUpdated maps counts onto inactive buffers', () => {
      const c = connectWithBuffers(); // SRV active

      emit(c, 'hotlistUpdated', { hotlist: [{ buffer: CHAN, count: [0, 1, 2, 3] as [number, number, number, number] }] });

      expect(entry(CHAN).unread).toBe(6);
      expect(entry(CHAN).highlighted).toBe(3);
    });

    it('disconnect tears everything down', () => {
      const c = connectWithBuffers();
      markOrochi('esh');
      emit(c, 'lineAdded', { line: makeLine({ buffer: SRV, tags: ['irc_381'], message: 'You are now an IRC operator — staff' }) });
      expect(isOper()).toBe(true);

      disconnect();

      expect(c.disconnect).toHaveBeenCalledWith(true);
      expect(connectionState()).toBe(ConnectionState.DISCONNECTED);
      expect(buffersState.buffers).toEqual({});
      expect(ircxState.orochiServers).toEqual({});
      expect(isOper()).toBe(false);
    });
  });

  describe('orochi detection', () => {
    it('marks the server when a live 004 names orochi', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV,
        tags: ['irc_004'],
        message: 'kain eshmaki.me orochi-0.1.0 iowx bklmnt',
      }) });

      expect(isOrochiServer('esh')).toBe(true);
    });

    it('marks known Orochi hosts even when the 004 version does not name orochi', () => {
      const c = connectWithBuffers();
      const onOrochiDetected = vi.fn();
      setRelayObserver({ onOrochiDetected });

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV,
        tags: ['irc_004'],
        message: 'kain ircx.us ircd-compat-2026 iowx bklmnt',
      }) });

      expect(isOrochiServer('esh')).toBe(true);
      expect(onOrochiDetected).toHaveBeenCalledWith('esh', 'wss://ircx.us:8080');
    });

    it('does not treat non-Orochi server names as current Orochi detection', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_004'], message: 'kain host legacyd 1.0 abc',
      }) });
      expect(isOrochiServer('esh')).toBe(false);
    });

    it('does not mark on unrelated 004s or embedded substrings', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_004'], message: 'kain host ircd-hybrid-8.2 iow',
      }) });
      expect(isOrochiServer('esh')).toBe(false);

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_004'], message: 'kain host orochimarud-1.0 iow',
      }) });
      expect(isOrochiServer('esh')).toBe(false);
    });

    it('notifies the RelayObserver and replays pre-existing channel buffers', () => {
      const c = connectWithBuffers();
      const onOrochiDetected = vi.fn();
      const onChannelBufferOpened = vi.fn();
      setRelayObserver({ onOrochiDetected, onChannelBufferOpened });

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_004'], message: 'kain host orochi-0.1.0 iow',
      }) });

      expect(onOrochiDetected).toHaveBeenCalledWith('esh', 'wss://host:8080');
      expect(onChannelBufferOpened).toHaveBeenCalledWith('esh', '#general');

      // New channel buffers on a known-orochi server also notify
      emit(c, 'bufferOpened', { buffer: makeBuffer('ptr-chan2', {
        number: 3,
        name: 'irc.esh.#random',
        shortName: '#random',
        localVars: { type: 'channel', server: 'esh', channel: '#random' },
      }) });
      expect(onChannelBufferOpened).toHaveBeenCalledWith('esh', '#random');
    });

    it('detects orochi from a server-buffer history replay', () => {
      const c = connectWithBuffers();

      emit(c, 'historyLoaded', { lines: [
        makeLine({ buffer: SRV, tags: ['irc_004'], message: 'kain host orochi-0.1.0 iow' }),
        makeLine({ buffer: SRV, message: 'welcome back' }),
      ] });

      expect(isOrochiServer('esh')).toBe(true);
      expect(entry(SRV).lines).toHaveLength(2);
    });
  });

  describe('oper detection', () => {
    it('381 grants oper (not admin for a plain role)', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_381'], message: 'You are now an IRC operator — staff',
      }) });

      expect(isOper()).toBe(true);
      expect(isAdmin()).toBe(false);
      expect(isOperBuffer(SRV)).toBe(true);
      expect(isOperBuffer(CHAN)).toBe(true); // same server
    });

    it('381 grants admin when the role names admin', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_381'], message: 'You are now an IRC operator — server admin',
      }) });

      expect(isAdmin()).toBe(true);
    });

    it('221 umode reply with +o grants oper; +a adds admin', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({ buffer: SRV, tags: ['irc_221'], message: '+oiw' }) });
      expect(isOper()).toBe(true);
      expect(isAdmin()).toBe(false);

      emit(c, 'lineAdded', { line: makeLine({ buffer: SRV, tags: ['irc_221'], message: '+aoiw' }) });
      expect(isAdmin()).toBe(true);
    });

    it('a self umode -o clears oper and admin', () => {
      const c = connectWithBuffers();
      emit(c, 'lineAdded', { line: makeLine({ buffer: SRV, tags: ['irc_381'], message: 'You are now an IRC operator — admin' }) });
      expect(isAdmin()).toBe(true);

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_mode'], message: 'Mode kain [-o] by services.',
      }) });

      expect(isOper()).toBe(false);
      expect(isAdmin()).toBe(false);
    });

    it('scans server-buffer history for oper status', () => {
      const c = connectWithBuffers();

      emit(c, 'historyLoaded', { lines: [
        makeLine({ buffer: SRV, message: 'motd stuff' }),
        makeLine({ buffer: SRV, tags: ['irc_381'], message: 'You are now an IRC operator — staff' }),
      ] });

      expect(isOper()).toBe(true);
    });
  });

  describe('TAGMSG handling', () => {
    it('+typing routes to setTyping and never renders', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: CHAN,
        nick: 'alice',
        isTagMsg: true,
        tags: ['irc_tagmsg'],
        ircTags: new Map([['+typing', 'active']]),
      }) });

      expect(entry(CHAN).typing['alice']?.state).toBe('active');
      expect(entry(CHAN).lines).toHaveLength(0);
    });

    it('a regular message from a typing nick clears their typing state', () => {
      const c = connectWithBuffers();
      emit(c, 'lineAdded', { line: makeLine({
        buffer: CHAN, nick: 'alice', isTagMsg: true, tags: ['irc_tagmsg'],
        ircTags: new Map([['+typing', 'active']]),
      }) });

      emit(c, 'lineAdded', { line: makeLine({ buffer: CHAN, nick: 'alice', message: 'here it is' }) });

      expect(entry(CHAN).typing['alice']).toBeUndefined();
      expect(entry(CHAN).lines).toHaveLength(1);
    });

    it('+react/+reply routes to addReaction and never renders', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: CHAN,
        nick: 'bob',
        isTagMsg: true,
        tags: ['irc_tagmsg'],
        ircTags: new Map([['+react', '🔥'], ['+reply', 'msgid-42']]),
      }) });

      expect(entry(CHAN).reactions['msgid-42']).toEqual([{ emoji: '🔥', nicks: ['bob'] }]);
      expect(entry(CHAN).lines).toHaveLength(0);
    });
  });

  describe('IRCX numeric interception', () => {
    it('818 prop entries land in channelProps after the 819 end-of-list', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_818'], displayed: false,
        message: '#general TOPIC :Welcome home',
      }) });
      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_818'], displayed: false,
        message: '#general OID :abc123',
      }) });
      expect(ircxState.pendingPropEntries).toHaveLength(2);

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_819'], displayed: false,
        message: '#general :End of properties',
      }) });

      expect(ircxState.channelProps['#general']).toEqual({ TOPIC: 'Welcome home', OID: 'abc123' });
      expect(ircxState.pendingPropEntries).toEqual([]);
    });

    it('804 access entries land in accessLists after the 805 end-of-list', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_804'], displayed: false,
        message: '#general HOST *!*@ok.host kain 3600',
      }) });
      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_805'], displayed: false,
        message: '#general :End of access entries',
      }) });

      expect(ircxState.accessLists['#general']).toEqual([{
        channel: '#general',
        level: 'HOST',
        mask: '*!*@ok.host',
        setter: 'kain',
        duration: 3600,
        reason: '',
      }]);
    });

    it('LIST and LISTX numerics populate the channel browser', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_322'], displayed: false,
        message: 'kain #root 4 :Root channel',
      }) });
      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_812'], displayed: false,
        message: 'kain #mesh 2 0 0 :Mesh channel',
      }) });
      emit(c, 'lineAdded', { line: makeLine({
        buffer: SRV, tags: ['irc_323'], displayed: false,
        message: 'kain :End of LIST',
      }) });

      expect(ircxState.channelList.status).toBe('ready');
      expect(ircxState.channelList.rows).toEqual([
        { channel: '#root', users: 4, topic: 'Root channel', modes: undefined },
        { channel: '#mesh', users: 2, topic: 'Mesh channel', modes: '0 0' },
      ]);
      expect(entry(SRV).lines).toHaveLength(0);
    });

    it('bot and account tags are recorded from live lines', () => {
      const c = connectWithBuffers();

      emit(c, 'lineAdded', { line: makeLine({
        buffer: CHAN, nick: 'HelperBot', message: 'beep',
        ircTags: new Map([['bot', '']]),
      }) });
      emit(c, 'lineAdded', { line: makeLine({
        buffer: CHAN, nick: 'alice', message: 'hi', account: 'alice_acct',
      }) });

      expect(ircxState.botNicks['helperbot']).toBe(true);
      expect(ircxState.accountMap['alice']).toBe('alice_acct');
    });
  });

  describe('sendInput — media commands', () => {
    function sinkSpies(): MediaCommandSink & { startCall: Mock; joinRoom: Mock; hangup: Mock } {
      return { startCall: vi.fn(), joinRoom: vi.fn(), hangup: vi.fn() };
    }

    it('/call and /videocall start a video call; /vcall and /voicecall start voice', () => {
      connectWithBuffers();
      setActiveBuffer(CHAN);
      const sink = sinkSpies();
      setMediaSink(sink);

      sendInput('/call alice');
      expect(sink.startCall).toHaveBeenCalledWith('alice', true);

      sendInput('/videocall bob');
      expect(sink.startCall).toHaveBeenCalledWith('bob', true);

      sendInput('/vcall carol');
      expect(sink.startCall).toHaveBeenCalledWith('carol', false);

      sendInput('/voicecall dave');
      expect(sink.startCall).toHaveBeenCalledWith('dave', false);
    });

    it('/voice and /video join the current channel room; explicit channel wins', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);
      const sink = sinkSpies();
      setMediaSink(sink);

      sendInput('/voice');
      expect(sink.joinRoom).toHaveBeenCalledWith('#general', false);

      sendInput('/video');
      expect(sink.joinRoom).toHaveBeenCalledWith('#general', true);

      sendInput('/joinvoice #elsewhere');
      expect(sink.joinRoom).toHaveBeenCalledWith('#elsewhere', false);

      sendInput('/hangup');
      expect(sink.hangup).toHaveBeenCalledTimes(1);

      // media commands never reach the relay
      expect(c.sendInput).not.toHaveBeenCalled();
    });

    it('prints a local bridge-required notice when no sink is installed', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);

      sendInput('/call alice');

      const last = entry(CHAN).lines[entry(CHAN).lines.length - 1];
      expect(last?.message).toContain('requires the orochi bridge');
      expect(last?.tags).toContain('darkbear_system');
      expect(c.sendInput).not.toHaveBeenCalled();
    });
  });

  describe('sendInput — routing', () => {
    it('/clear wipes the buffer locally without touching the relay', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);
      addLine(CHAN, makeLine({ buffer: CHAN, nick: 'alice', message: 'old' }), []);

      sendInput('/clear');

      expect(entry(CHAN).lines).toHaveLength(0);
      expect(c.sendInput).not.toHaveBeenCalled();
    });

    it('/monitor add|del tracks the nick and quotes MONITOR to the server buffer', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);

      sendInput('/monitor add Alice');
      expect(ircxState.monitorList['alice']).toBe(true);
      expect(c.sendInput).toHaveBeenCalledWith(SRV, '/quote MONITOR + Alice');

      sendInput('/monitor del Alice');
      expect(ircxState.monitorList['alice']).toBeUndefined();
      expect(c.sendInput).toHaveBeenCalledWith(SRV, '/quote MONITOR - Alice');
    });

    it('/prop passes through to the relay on non-orochi servers', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);

      sendInput('/prop #general');

      expect(ircxState.pendingPropTarget).toBeNull();
      expect(c.sendInput).toHaveBeenCalledWith(CHAN, '/prop #general');
    });

    it('/prop is intercepted on orochi servers and quoted as PROP', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);
      markOrochi('esh');

      sendInput('/prop #general');

      expect(ircxState.pendingPropTarget).toBe('#general');
      expect(c.sendInput).toHaveBeenCalledWith(SRV, '/quote PROP #general *');
      expect(c.sendInput).not.toHaveBeenCalledWith(CHAN, '/prop #general');
    });

    it('/whisper on an orochi channel quotes WHISPER with the message', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);
      markOrochi('esh');

      sendInput('/w alice psst secret plans');

      expect(c.sendInput).toHaveBeenCalledWith(SRV, '/quote WHISPER #general alice :psst secret plans');
    });

    it('plain text gets an optimistic _opt_ echo and goes to the relay', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);

      sendInput('hello world');

      const lines = entry(CHAN).lines;
      expect(lines).toHaveLength(1);
      expect(lines[0]?.id.startsWith('_opt_')).toBe(true);
      expect(lines[0]?.isSelf).toBe(true);
      expect(lines[0]?.nick).toBe('kain');
      expect(lines[0]?.message).toBe('hello world');
      expect(c.sendInput).toHaveBeenCalledWith(CHAN, 'hello world');
    });

    it('the confirmed echo replaces the optimistic line', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);
      sendInput('hello world');

      emit(c, 'lineAdded', { line: makeLine({
        buffer: CHAN, nick: 'kain', message: 'hello world',
        tags: ['self_msg'], isSelf: true,
      }) });

      const lines = entry(CHAN).lines;
      expect(lines).toHaveLength(1);
      expect(lines[0]?.id.startsWith('_opt_')).toBe(false);
    });

    it('suppresses a resend while an identical optimistic line is pending', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);

      sendInput('hello world');
      sendInput('hello world');

      expect(entry(CHAN).lines).toHaveLength(1);
      expect(c.sendInput).toHaveBeenCalledTimes(1);
    });

    it('does nothing without a client or with blank input', () => {
      connectWithBuffers();
      setActiveBuffer(CHAN);
      const c = lastClient();

      sendInput('   ');
      expect(c.sendInput).not.toHaveBeenCalled();

      disconnect();
      sendInput('hello');
      expect(c.sendInput).not.toHaveBeenCalled();
    });

    it('/join arms auto-switch to the joined channel buffer', () => {
      const c = connectWithBuffers();
      setActiveBuffer(SRV);

      sendInput('/join #random');
      expect(c.sendInput).toHaveBeenCalledWith(SRV, '/join #random');

      emit(c, 'bufferOpened', { buffer: makeBuffer('ptr-rand', {
        number: 3,
        name: 'irc.esh.#random',
        shortName: '#random',
        localVars: { type: 'channel', server: 'esh', channel: '#random' },
      }) });

      expect(buffersState.activeBuffer).toBe('ptr-rand');
    });
  });

  describe('highlight notifications', () => {
    it('notifies on a highlighted line in an inactive, unmuted buffer', () => {
      const c = connectWithBuffers(); // SRV active

      emit(c, 'lineAdded', { line: makeLine({
        buffer: CHAN, nick: 'alice', message: 'kain: hello', highlight: true,
      }) });

      expect(vi.mocked(notify)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(notify).mock.calls[0]?.[0]).toBe('Highlight in #general');
    });
  });

  describe('helpers', () => {
    it('requestHistory asks for existing + count lines and flags loading', () => {
      const c = connectWithBuffers();
      setActiveBuffer(CHAN);
      addLine(CHAN, makeLine({ buffer: CHAN, nick: 'a', message: 'one' }), []);
      addLine(CHAN, makeLine({ buffer: CHAN, nick: 'a', message: 'two' }), []);

      requestHistory(50, CHAN);

      expect(entry(CHAN).loading).toBe(true);
      expect(c.requestHistory).toHaveBeenCalledWith(CHAN, 52);
    });

    it('setActive activates locally and clears the WeeChat hotlist', () => {
      const c = connectWithBuffers();

      setActive(CHAN);

      expect(buffersState.activeBuffer).toBe(CHAN);
      expect(c.sendInput).toHaveBeenCalledWith(CHAN, '/buffer set hotlist -1');
    });

    it('openQuery focuses an existing private buffer without hitting the relay', () => {
      const c = connectWithBuffers();
      upsertBuffer(makeBuffer('ptr-pm', {
        number: 4,
        name: 'irc.esh.alice',
        shortName: 'alice',
        localVars: { type: 'private', server: 'esh', channel: 'alice' },
      }));

      openQuery('Alice');

      expect(buffersState.activeBuffer).toBe('ptr-pm');
      expect(c.sendInput).not.toHaveBeenCalled();
    });

    it('openQuery /query-s a new nick and auto-switches when the buffer opens', () => {
      const c = connectWithBuffers();
      setActiveBuffer(SRV);

      openQuery('bob');
      expect(c.sendInput).toHaveBeenCalledWith(SRV, '/query bob');

      emit(c, 'bufferOpened', { buffer: makeBuffer('ptr-bob', {
        number: 5,
        name: 'irc.esh.bob',
        shortName: 'bob',
        localVars: { type: 'private', server: 'esh', channel: 'bob' },
      }) });

      expect(buffersState.activeBuffer).toBe('ptr-bob');
    });
  });
});
