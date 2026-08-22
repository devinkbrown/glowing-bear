// @vitest-environment jsdom
//
// Wire-level tests for the onyx-server bridge controller's INBOUND message
// handling. Lines are taken verbatim from the live wire transcript
// (tests/fixtures/onyx-live-capture.txt), parsed with the production
// parser, and delivered through the bridge IRCClient's extraMessageHandlers
// fan-out — the exact path production messages take.
//
// Complements src/core/bridge.test.ts (pure helpers) — no overlap: these
// tests exercise onBridgeMessage routing + the relay-observer channel map.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { parseIRCMessage } from '@/lib/irc/parser';
import type { IRCClientOptions, IRCEventHandler } from '@/lib/irc/client';
import type { WeeChatBuffer, WeeChatLine } from '@/lib/weechat/model';
import {
  PREFERENCE_MANIFEST_KEY,
  createPreferenceDocument,
  encodePreferenceMetadata,
} from '@/lib/preferences/sync';

// ── fakes + capture harness ─────────────────────────────────────────────────

interface FakeBridgeClient {
  opts: IRCClientOptions;
  extraMessageHandlers: Set<IRCEventHandler>;
  currentNick: string;
  connect: Mock;
  destroy: Mock;
  join: Mock;
  tagmsg: Mock;
  privmsg: Mock;
  sendRaw: Mock;
  setSaslSessionToken: Mock;
  negotiatedCaps: Set<string>;
  loggedIn: boolean;
  sessionSyncActive: boolean;
}

interface RelayObserverShape {
  onOnyxServerDetected?: (serverName: string) => void;
  onChannelBufferOpened?: (serverName: string, channel: string) => void;
}

const harness = vi.hoisted(() => ({
  clients: [] as unknown[],
  observer: null as unknown,
  sessionKind: 'weechat-onyx' as string,
}));

vi.mock('@/lib/irc/client', () => {
  class IRCClient {
    opts: IRCClientOptions;
    extraMessageHandlers = new Set<IRCEventHandler>();
    currentNick: string;
    connect = vi.fn();
    destroy = vi.fn();
    join = vi.fn();
    tagmsg = vi.fn();
    privmsg = vi.fn(() => true);
    sendRaw = vi.fn(() => true);
    setSaslSessionToken = vi.fn();
    negotiatedCaps = new Set(['draft/metadata-2']);
    loggedIn = true;
    sessionSyncActive = false;
    constructor(opts: IRCClientOptions) {
      this.opts = opts;
      this.currentNick = opts.nick;
      harness.clients.push(this);
    }
  }
  return { IRCClient };
});

vi.mock('@/state/connection', () => ({
  setRelayObserver: vi.fn((obs: unknown) => {
    harness.observer = obs;
  }),
  setMediaSink: vi.fn(),
  sendTo: vi.fn(),
  sessionKind: () => harness.sessionKind,
}));

vi.mock('@/state/media', () => ({
  _attachBridgeClient: vi.fn(),
  _setMediaAvailable: vi.fn(),
  _setMediaTransportConnected: vi.fn(),
  hangup: vi.fn(),
  requestRoomJoin: vi.fn(),
  requestStartCall: vi.fn(),
}));

vi.mock('@/lib/credentials', () => ({
  clearSaslSessionToken: vi.fn(),
  loadCredentials: vi.fn(() => null),
  saveCredentials: vi.fn(),
  storeSessionToken: vi.fn(),
  storeMeshToken: vi.fn(),
  storeSaslSessionToken: vi.fn(),
}));

vi.mock('@/lib/irc/nodes', () => ({
  NODES: [{ id: 'mock', host: 'auto.invalid', wss: 'wss://auto.invalid' }],
  nodeFromWssGateway: vi.fn((wss: string, id = 'detected') => ({ id, host: 'detected.invalid', wss })),
  selectBestNode: vi.fn(() => Promise.resolve({ wss: 'wss://auto.invalid' })),
}));

// Real buffers store, with the bridge-facing actions wrapped so call counts
// are observable (behaviour is unchanged — the wrappers delegate).
vi.mock('@/state/buffers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/state/buffers')>();
  return {
    ...actual,
    setTyping: vi.fn(actual.setTyping),
    addReaction: vi.fn(actual.addReaction),
    clearUnread: vi.fn(actual.clearUnread),
    setReadMarker: vi.fn(actual.setReadMarker),
  };
});

// ── live capture fixture (ground truth for message shapes) ──────────────────

const capture = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/onyx-live-capture.txt'),
  'utf8',
);

/** First server→client line of the capture containing `needle`. */
function serverLine(needle: string): string {
  for (const raw of capture.split('\n')) {
    const m = /^<<<[AB] (.+)$/.exec(raw);
    if (m?.[1]?.includes(needle)) return m[1];
  }
  throw new Error(`fixture line not found: ${needle}`);
}

const REACT_MSGID = '17J4YRKCFKJPWSJN9YQTCGW72M';
const FAKE_KEY = 'BFakePeerDeviceKeyB64';

// ── relay-side fixtures ──────────────────────────────────────────────────────

function makeBuffer(
  id: string,
  number: number,
  localVars: Record<string, string>,
  name: string,
): WeeChatBuffer {
  return {
    id,
    number,
    name,
    fullName: name,
    shortName: localVars['channel'] ?? '',
    title: '',
    type: 0,
    nicksCount: 0,
    localVars,
    notify: 0,
    hidden: false,
  };
}

function makeLine(id: string, buffer: string, nick: string, message: string): WeeChatLine {
  const now = new Date();
  return {
    id,
    buffer,
    date: now,
    datePrinted: now,
    displayed: true,
    highlight: false,
    tags: [],
    prefix: nick,
    message,
    nick,
    ircTags: new Map(),
  };
}

// ── per-test world setup ─────────────────────────────────────────────────────

interface Ctx {
  client: FakeBridgeClient;
  buffers: typeof import('@/state/buffers');
  bridge: typeof import('@/state/bridge');
  credentials: typeof import('@/lib/credentials');
  media: typeof import('@/state/media');
  deliver: (line: string) => void;
}

async function setup(options: {
  sessionSyncActive?: boolean;
  deferWelcome?: boolean;
} = {}): Promise<Ctx> {
  // vi.resetModules() re-evaluates UNMOCKED modules only — mocked modules
  // (and the real buffers store wrapped inside the @/state/buffers mock)
  // persist across tests. Clear mock call histories and store state
  // explicitly or assertions bleed between tests.
  vi.resetModules();
  vi.clearAllMocks();
  harness.clients.length = 0;
  harness.observer = null;
  harness.sessionKind = 'weechat-onyx';
  if (typeof localStorage !== 'undefined') localStorage.clear();

  const settings = await import('@/state/settings');
  settings.updateBridge({ enabled: true, wsUrl: 'wss://bridge.test.invalid', account: 'kain' });

  const buffers = await import('@/state/buffers');
  buffers.clearBuffers(); // the wrapped real store persists across tests
  const bridge = await import('@/state/bridge');
  const credentials = await import('@/lib/credentials');
  vi.mocked(credentials.loadCredentials).mockReturnValue(null);
  const media = await import('@/state/media');
  const core = await import('@/core/bridge');
  core.initBridge();

  const client = harness.clients[0] as FakeBridgeClient | undefined;
  if (!client) throw new Error('bridge did not dial its IRCClient');
  client.sessionSyncActive = options.sessionSyncActive ?? false;
  if (!options.deferWelcome) {
    client.opts.onConnected?.(
      parseIRCMessage(`:onyx.test 001 ${client.currentNick} :Welcome to Onyx Server`),
    );
  }

  // Relay world: server buffer + channel buffer + DM query on an Onyx Server server.
  buffers.upsertBuffer(
    makeBuffer('0xsrv', 1, { type: 'server', server: 'eshmaki', nick: 'kain' }, 'irc.server.eshmaki'),
  );
  buffers.upsertBuffer(
    makeBuffer('0xchan', 2, { type: 'channel', server: 'eshmaki', channel: '#dbtest19036' }, 'irc.eshmaki.#dbtest19036'),
  );
  buffers.upsertBuffer(
    makeBuffer('0xdm', 3, { type: 'private', server: 'eshmaki', channel: 'trev' }, 'irc.eshmaki.trev'),
  );
  (harness.observer as RelayObserverShape | null)?.onOnyxServerDetected?.('eshmaki');

  const deliver = (line: string) => {
    const msg = parseIRCMessage(line);
    for (const handler of client.extraMessageHandlers) handler(msg);
  };

  return { client, buffers, bridge, credentials, media, deliver };
}

describe('bridge transport guard', () => {
  it('fails before dialing when remote WS would expose authentication or reclaim credentials', async () => {
    vi.resetModules();
    vi.clearAllMocks();
    harness.clients.length = 0;
    harness.observer = null;
    harness.sessionKind = 'weechat-onyx';
    if (typeof localStorage !== 'undefined') localStorage.clear();
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();

    const settings = await import('@/state/settings');
    settings.updateBridge({
      enabled: true,
      wsUrl: 'ws://bridge.test.invalid',
      account: 'kain',
      password: 'not-for-plaintext',
    });
    const credentials = await import('@/lib/credentials');
    vi.mocked(credentials.loadCredentials).mockReturnValue({
      nick: 'kain',
      server: 'ws://bridge.test.invalid',
      saslSessionToken: 'sst_secret',
      sessionToken: 'logical-secret',
      meshToken: 'mesh-secret',
      savedAt: new Date(0).toISOString(),
    });
    const bridge = await import('@/state/bridge');
    const core = await import('@/core/bridge');

    core.initBridge();

    expect(harness.clients).toHaveLength(0);
    expect(bridge.bridgeState).toMatchObject({
      status: 'error',
      error: core.INSECURE_BRIDGE_TRANSPORT_ERROR,
    });
  });
});

// ── welcome ──────────────────────────────────────────────────────────────────

describe('bridge welcome', () => {
  it('subscribes the MEDIA event plane, reports ready, and mirrors relay channels', async () => {
    const { client, bridge, media } = await setup();
    // >>>A EVENT ADD MEDIA * in the capture — the client-side subscription.
    expect(client.sendRaw).toHaveBeenCalledWith('EVENT', 'ADD', 'MEDIA', '*');
    expect(bridge.bridgeState.status).toBe('ready');
    expect(vi.mocked(media._setMediaAvailable)).toHaveBeenCalledWith(true);
    expect(vi.mocked(media._setMediaTransportConnected)).toHaveBeenCalledWith(true);
    // The mirrored relay channel gets JOINed on this session.
    expect(client.join).toHaveBeenCalledWith('#dbtest19036');
  });

  it('lets Onyx Server session-sync restore channels without a competing JOIN storm', async () => {
    const { client } = await setup({ sessionSyncActive: true });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('reports transient bridge loss and recovery to the mounted media engine', async () => {
    const { client, media } = await setup();
    vi.mocked(media._setMediaTransportConnected).mockClear();

    client.opts.onDisconnected?.('socket lost');
    expect(vi.mocked(media._setMediaTransportConnected)).toHaveBeenCalledWith(false);

    client.opts.onConnected?.(
      parseIRCMessage(`:onyx.test 001 ${client.currentNick} :Welcome to Onyx Server`),
    );
    expect(vi.mocked(media._setMediaTransportConnected)).toHaveBeenLastCalledWith(true);
  });

  it('stops reconnecting when a token-only account needs a password again', async () => {
    const { client, bridge } = await setup();
    client.opts.onSaslSessionTokenRejected?.(false);
    client.opts.onDisconnected?.('SASL session token rejected');

    expect(client.destroy).toHaveBeenCalledOnce();
    expect(bridge.bridgeState).toMatchObject({
      status: 'error',
      error: 'Onyx Server session expired. Enter the account password to reconnect.',
    });
  });

  it('gates account preference sync on metadata capability and applies a complete LIST', async () => {
    const { client, deliver } = await setup();
    expect(client.sendRaw).toHaveBeenCalledWith('METADATA', '*', 'LIST');

    const remote = createPreferenceDocument({
      appearance: { theme: 'nord' },
      accessibility: {
        fontFamily: 'serif', fontSize: 18, sceneMotion: 'reduced', readMarker: false,
      },
      notifications: { enabled: false, sound: true, readOnFocus: false },
      buffers: { 'irc.eshmaki.#dbtest19036': { pinned: true, notify: 'all' } },
      read: { '#dbtest19036': 1_700_000_000_000 },
    }, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 1000, 10);
    for (const entry of encodePreferenceMetadata(remote)) {
      deliver(`:eshmaki.me 761 ${client.currentNick} * ${entry.key} secret :${entry.value}`);
    }
    deliver(`:eshmaki.me 762 ${client.currentNick} :end of metadata`);

    const settings = await import('@/state/settings');
    const preferenceSync = await import('@/state/preferenceSync');
    expect(settings.settings.theme).toBe('nord');
    expect(settings.settings.fontSize).toBe(18);
    expect(preferenceSync.preferenceSyncState.status).toBe('synced');
  });

  it('publishes an initial account snapshot with secret visibility after an empty LIST', async () => {
    const { client, deliver } = await setup();
    deliver(`:eshmaki.me 762 ${client.currentNick} :end of metadata`);

    const publish = client.sendRaw.mock.calls.find((args) =>
      args[0] === 'METADATA' && args[1] === '*' && args[2] === 'SET' &&
      args[3] === PREFERENCE_MANIFEST_KEY,
    );
    expect(publish?.[4]).toBe('secret');
    expect(new TextEncoder().encode(String(publish?.[5] ?? '')).byteLength).toBeLessThanOrEqual(512);
  });
});

describe('outbound delivery acknowledgement', () => {
  it('propagates direct reply acceptance and rejection from the IRC socket', async () => {
    const { client } = await setup();
    (harness.observer as RelayObserverShape).onChannelBufferOpened?.('eshmaki', '#dbtest19036');
    const { sendReply } = await import('@/core/bridge');

    client.sendRaw.mockReturnValueOnce(true);
    expect(sendReply('0xchan', 'accepted reply', 'parent-msgid')).toBe(true);
    expect(client.sendRaw).toHaveBeenLastCalledWith(
      '@+draft/reply=parent-msgid PRIVMSG',
      '#dbtest19036',
      'accepted reply',
    );

    client.sendRaw.mockReturnValueOnce(false);
    expect(sendReply('0xchan', 'retain reply', 'parent-msgid')).toBe(false);
  });

  it('only applies a local reaction when the direct TAGMSG reaches the socket', async () => {
    const { client, bridge, buffers } = await setup();
    (harness.observer as RelayObserverShape).onChannelBufferOpened?.('eshmaki', '#dbtest19036');

    client.tagmsg.mockReturnValueOnce(false);
    bridge.sendReactionTag('0xchan', 'rejected-msgid', '👍');
    expect(client.tagmsg).toHaveBeenLastCalledWith(
      '#dbtest19036',
      { '+draft/react': '👍', '+draft/reply': 'rejected-msgid' },
    );
    expect(buffers.buffersState.buffers['0xchan']?.reactions['rejected-msgid']).toBeUndefined();

    client.tagmsg.mockReturnValueOnce(true);
    bridge.sendReactionTag('0xchan', 'accepted-msgid', '🚀');
    expect(buffers.buffersState.buffers['0xchan']?.reactions['accepted-msgid']).toEqual([
      { emoji: '🚀', nicks: [client.currentNick] },
    ]);
  });
});

// ── typing TAGMSG ────────────────────────────────────────────────────────────

describe('typing TAGMSG', () => {
  it('maps the live +typing=active channel TAGMSG onto the relay buffer', async () => {
    const { deliver, buffers } = await setup();
    const line = serverLine('+typing=active');
    expect(line).toContain('TAGMSG #dbtest19036'); // wire fact from the capture
    deliver(line);
    expect(vi.mocked(buffers.setTyping)).toHaveBeenCalledWith('0xchan', 'dbtB351', 'active');
    expect(buffers.buffersState.buffers['0xchan']?.typing['dbtB351']?.state).toBe('active');
  });

  it('keys DM typing by the SENDER nick (relay query buffers)', async () => {
    const { client, deliver, buffers } = await setup();
    deliver(`@+typing=active :trev!webchat@host.invalid TAGMSG ${client.currentNick}`);
    expect(vi.mocked(buffers.setTyping)).toHaveBeenCalledWith('0xdm', 'trev', 'active');
  });

  it('ignores our own typing echo', async () => {
    const { client, deliver, buffers } = await setup();
    deliver(`@+typing=active :${client.currentNick}!webchat@host.invalid TAGMSG #dbtest19036`);
    expect(vi.mocked(buffers.setTyping)).not.toHaveBeenCalled();
  });
});

// ── reaction TAGMSG ──────────────────────────────────────────────────────────

describe('reaction TAGMSG', () => {
  it('applies the live +draft/react;+draft/reply TAGMSG once', async () => {
    const { deliver, buffers } = await setup();
    deliver(serverLine('+draft/react'));
    expect(vi.mocked(buffers.addReaction)).toHaveBeenCalledTimes(1);
    expect(buffers.buffersState.buffers['0xchan']?.reactions[REACT_MSGID]).toEqual([
      { emoji: '👍', nicks: ['dbtB351'] },
    ]);
  });

  it('dedupes the CHATHISTORY replay of the same react TAGMSG', async () => {
    const { deliver, buffers } = await setup();
    const line = serverLine('+draft/react');
    deliver(line);
    deliver(line); // the capture re-delivers this exact line inside BATCH chathistory
    expect(vi.mocked(buffers.addReaction)).toHaveBeenCalledTimes(1);
    const reactions = buffers.buffersState.buffers['0xchan']?.reactions[REACT_MSGID];
    expect(reactions).toHaveLength(1);
    expect(reactions?.[0]?.nicks).toEqual(['dbtB351']);
  });

  it('handles the bare +react/+reply tag variant', async () => {
    const { deliver, buffers } = await setup();
    deliver(
      `@time=2026-07-03T20:38:05.727Z;msgid=BARE1;+react=🔥;+reply=${REACT_MSGID} ` +
        ':dbtB351!webchat@host.invalid TAGMSG #dbtest19036',
    );
    expect(buffers.buffersState.buffers['0xchan']?.reactions[REACT_MSGID]).toEqual([
      { emoji: '🔥', nicks: ['dbtB351'] },
    ]);
  });
});

// ── MARKREAD ─────────────────────────────────────────────────────────────────

describe('MARKREAD', () => {
  it('prefix-less MARKREAD echo clears unread and places the read marker', async () => {
    const { deliver, buffers } = await setup();
    const line = serverLine('MARKREAD #dbtest19036');
    expect(line.startsWith(':')).toBe(false); // wire fact: the echo arrives PREFIX-LESS

    buffers.addLine('0xchan', makeLine('l1', '0xchan', 'dbtA3950', 'hello from capture A'), []);
    expect(buffers.buffersState.buffers['0xchan']?.unread).toBe(1);

    deliver(line);
    expect(buffers.buffersState.buffers['0xchan']?.unread).toBe(0);
    expect(buffers.buffersState.readMarkerPos['0xchan']).toBe(1);
  });

  it('is a no-op for "*" targets, unmapped targets, and "*" markers', async () => {
    const { deliver, buffers } = await setup();
    buffers.addLine('0xchan', makeLine('l1', '0xchan', 'dbtA3950', 'hello from capture A'), []);

    expect(() => {
      deliver('MARKREAD * timestamp=2026-07-03T20:38:05.728Z');
      deliver('MARKREAD #unmapped timestamp=2026-07-03T20:38:05.728Z');
      deliver('MARKREAD #dbtest19036 *');
    }).not.toThrow();

    expect(vi.mocked(buffers.clearUnread)).not.toHaveBeenCalled();
    expect(buffers.buffersState.buffers['0xchan']?.unread).toBe(1);
    expect(buffers.buffersState.readMarkerPos['0xchan']).toBeUndefined();
  });

  it("ignores another user's MARKREAD", async () => {
    const { deliver, buffers } = await setup();
    buffers.addLine('0xchan', makeLine('l1', '0xchan', 'dbtA3950', 'hello from capture A'), []);
    deliver(':trev!webchat@host.invalid MARKREAD #dbtest19036 timestamp=2026-07-03T20:38:05.728Z');
    expect(buffers.buffersState.buffers['0xchan']?.unread).toBe(1);
    expect(vi.mocked(buffers.setReadMarker)).not.toHaveBeenCalled();
  });
});

// ── PRIVMSG routing ──────────────────────────────────────────────────────────

describe('PRIVMSG routing', () => {
  it('ignores plain channel PRIVMSGs (the relay owns display)', async () => {
    const { deliver, buffers, client } = await setup();
    deliver(serverLine('PRIVMSG #dbtest19036 :hello from capture A'));
    expect(buffers.buffersState.buffers['0xchan']?.lines).toHaveLength(0);
    expect(client.sendRaw).not.toHaveBeenCalledWith('METADATA', 'dbtA3950', 'GET', 'ocean.dm-key');
  });

  it('routes a TSUMUGI1 DM envelope into the encrypted-ingest path', async () => {
    const { deliver, client } = await setup();
    deliver(
      `@time=2026-07-03T20:38:05.730Z;msgid=DM01 :trev!webchat@host.invalid PRIVMSG ${client.currentNick} :TSUMUGI1 QUJDREVG`,
    );
    // No cached peer key → the ingest path parks the DM and fetches the key.
    expect(client.sendRaw).toHaveBeenCalledWith('METADATA', 'trev', 'GET', 'ocean.dm-key');
  });

  it('keeps channel-target envelopes out of the DM path', async () => {
    const { deliver, client } = await setup();
    deliver(':trev!webchat@host.invalid PRIVMSG #dbtest19036 :TSUMUGI1 QUJDREVG');
    expect(client.sendRaw).not.toHaveBeenCalledWith('METADATA', 'trev', 'GET', 'ocean.dm-key');
  });
});

// ── METADATA peer keys ───────────────────────────────────────────────────────

describe('METADATA peer keys', () => {
  it('761 RPL_KEYVALUE caches the peer dm-key (case-insensitive)', async () => {
    const { deliver, client, bridge } = await setup();
    expect(bridge.canE2ee('trev')).toBe(false);
    deliver(`:eshmaki.me 761 ${client.currentNick} trev ocean.dm-key * :${FAKE_KEY}`);
    expect(bridge.canE2ee('trev')).toBe(true);
    expect(bridge.canE2ee('TREV')).toBe(true);
  });

  it('766 ERR_KEYNOTSET clears the cached key', async () => {
    const { deliver, client, bridge } = await setup();
    deliver(`:eshmaki.me 761 ${client.currentNick} trev ocean.dm-key * :${FAKE_KEY}`);
    expect(bridge.canE2ee('trev')).toBe(true);
    deliver(`:eshmaki.me 766 ${client.currentNick} trev ocean.dm-key :key not set`);
    expect(bridge.canE2ee('trev')).toBe(false);
  });

  it('metadata-notify push caches the key too', async () => {
    const { deliver, bridge } = await setup();
    deliver(`:eshmaki.me METADATA trev ocean.dm-key * :${FAKE_KEY}`);
    expect(bridge.canE2ee('trev')).toBe(true);
  });

  it('ignores non-dm-key metadata (fixture ocean.display-name reply)', async () => {
    const { deliver, bridge } = await setup();
    deliver(serverLine('761 dbtB351 dbtA3950'));
    expect(bridge.canE2ee('dbtA3950')).toBe(false);
  });
});

// ── NOTE routing ─────────────────────────────────────────────────────────────

describe('NOTE routing', () => {
  it('stores NOTE SESSION TOKEN', async () => {
    const { deliver, credentials } = await setup();
    deliver(':onyx.test NOTE SESSION TOKEN :tok-abc123');
    expect(vi.mocked(credentials.storeSessionToken)).toHaveBeenCalledWith('tok-abc123');
  });

  it('rejects session reclaim tokens from any prefix except the authenticated server', async () => {
    const { deliver, credentials } = await setup();

    deliver(':mallory!user@host NOTE SESSION TOKEN :tok-user');
    deliver(':unrelated.example NOTE SESSION TOKEN :tok-other-server');
    deliver(':mallory!user@host NOTE SESSION MTOKEN :mesh-user');

    expect(vi.mocked(credentials.storeSessionToken)).not.toHaveBeenCalled();
    expect(vi.mocked(credentials.storeMeshToken)).not.toHaveBeenCalled();
  });

  it('passes EVENT MEDIA lines through untouched', async () => {
    const { deliver, credentials } = await setup();
    expect(() => {
      deliver(serverLine('EVENT dbtA3950 MEDIA MACKEY #dbtest19036'));
      deliver(serverLine('EVENT dbtA3950 MEDIA ROSTER #dbtest19036 dbtA3950 voice main'));
      deliver(serverLine('EVENT dbtA3950 MEDIA JOIN #dbtest19036 dbtA3950 voice'));
    }).not.toThrow();
    expect(vi.mocked(credentials.storeSessionToken)).not.toHaveBeenCalled();
  });
});

describe('SASL SESSION-TOKEN routing', () => {
  it('accepts the pre-001 token after authenticated SASL-success protocol evidence', async () => {
    const { deliver, client, credentials } = await setup({ deferWelcome: true });
    const token = 'sst_0123456789abcdef0123456789abcdef';

    deliver(`:mallory!user@evil.example NOTICE ${client.currentNick} :SESSIONTOKEN kain ${token} expires=1784217600`);
    expect(client.setSaslSessionToken).not.toHaveBeenCalled();
    expect(vi.mocked(credentials.storeSaslSessionToken)).not.toHaveBeenCalled();

    // IRCClient marks loggedIn before fanning the real 903 out to the bridge.
    deliver(`:onyx.test 903 ${client.currentNick} :SASL authentication successful`);
    deliver(`:onyx.test NOTICE ${client.currentNick} :SESSIONTOKEN kain ${token} expires=1784217600`);

    expect(client.setSaslSessionToken).toHaveBeenCalledWith(token);
    expect(vi.mocked(credentials.storeSaslSessionToken)).toHaveBeenCalledWith(
      token,
      1_784_217_600,
      'kain',
    );
  });

  it('stores a bounded credential only from the exact server identity learned from 001', async () => {
    const { deliver, client, credentials } = await setup();
    const token = 'sst_0123456789abcdef0123456789abcdef';
    deliver(`:onyx.test NOTICE ${client.currentNick} :SESSIONTOKEN kain ${token} expires=1784217600`);

    expect(client.setSaslSessionToken).toHaveBeenCalledWith(token);
    expect(vi.mocked(credentials.storeSaslSessionToken)).toHaveBeenCalledWith(
      token,
      1_784_217_600,
      'kain',
    );
  });

  it('rejects matching token text from user and unrelated server prefixes', async () => {
    const { deliver, client, credentials } = await setup();
    const token = 'sst_0123456789abcdef0123456789abcdef';
    const text = `SESSIONTOKEN kain ${token} expires=1784217600`;

    deliver(`:mallory!user@evil.example NOTICE ${client.currentNick} :${text}`);
    deliver(`:onyx.test!user@evil.example NOTICE ${client.currentNick} :${text}`);
    deliver(`:onyx.test.evil NOTICE ${client.currentNick} :${text}`);
    deliver(`:onyx.test NOTICE somebody-else :${text}`);

    expect(client.setSaslSessionToken).not.toHaveBeenCalled();
    expect(vi.mocked(credentials.storeSaslSessionToken)).not.toHaveBeenCalled();
  });
});

describe('kind C first-party session', () => {
  it('does not start a second extras client', async () => {
    vi.resetModules();
    vi.clearAllMocks();
    harness.clients.length = 0;
    harness.observer = null;
    harness.sessionKind = 'onyx-direct-wss';
    if (typeof localStorage !== 'undefined') localStorage.clear();

    const settings = await import('@/state/settings');
    settings.updateBridge({ enabled: true, wsUrl: 'wss://bridge.test.invalid', account: 'kain' });
    await import('@/state/bridge');
    const core = await import('@/core/bridge');
    core.initBridge();

    expect(harness.clients).toHaveLength(0);
  });
});
