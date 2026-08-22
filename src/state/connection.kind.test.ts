import { describe, expect, it, vi, beforeEach } from 'vitest';

const relayMock = vi.hoisted(() => ({
  instances: [] as unknown[],
  start: vi.fn(),
  stop: vi.fn(),
}));

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
    connect = vi.fn();
    disconnect = vi.fn();
    diagnostics = vi.fn(() => ({
      phase: 'idle',
      transport: 'ws',
      protocolMode: 'none',
      authMode: 'none',
      serverVersion: '',
      compression: 'off',
      hashAlgorithm: 'none',
      totp: false,
      handshake: 'unknown',
      canDecodeCompression: false,
      reconnectReason: 'none',
      reconnectAttempt: 0,
      reconnectDelayMs: 0,
    }));
    constructor() {
      super();
      relayMock.instances.push(this);
    }
  }
  return { WeeRelayClient: FakeRelayClient };
});

vi.mock('@/state/onyxSession', () => ({
  startOnyxSession: relayMock.start,
  stopOnyxSession: relayMock.stop,
  isOnyxSessionActive: () => relayMock.start.mock.calls.length > 0,
  sendOnyxInput: vi.fn(() => true),
  requestOnyxHistory: vi.fn(),
  loadOnyxDialFromSettings: (totp?: string) => ({
    url: 'wss://eshmaki.me:8080',
    nick: 'kain',
    account: 'kain',
    password: 'secret',
    identifyTotp: totp,
  }),
  getOnyxSessionClient: () => null,
}));

vi.mock('@/lib/notifications', () => ({
  notify: vi.fn(),
  playSound: vi.fn(),
  claimAlertDelivery: vi.fn(() => true),
  setAlertCoordinatorActive: vi.fn(),
  updateTitle: vi.fn(),
  clearTitle: vi.fn(),
  requestPermission: vi.fn(async () => false),
}));

import { connect, setSessionKind } from './connection';
import { updateBridge, updateRelay } from './settings';

beforeEach(() => {
  relayMock.instances.length = 0;
  relayMock.start.mockClear();
  relayMock.stop.mockClear();
  updateRelay({ host: 'relay.example.test', password: 'relay-secret', port: 9001, tls: true });
  updateBridge({ enabled: false, wsUrl: 'wss://eshmaki.me:8080', account: 'kain', password: 'secret' });
});

describe('connect session kinds', () => {
  it('kind A constructs a WeeRelayClient and never a first-party session', () => {
    setSessionKind('weechat-generic');
    connect();
    expect(relayMock.instances).toHaveLength(1);
    expect(relayMock.start).not.toHaveBeenCalled();
  });

  it('kind C starts IrcSession and does not construct WeeRelayClient', () => {
    setSessionKind('onyx-direct-wss');
    connect({ onyxTotp: '123456', nick: 'kain' });
    expect(relayMock.instances).toHaveLength(0);
    expect(relayMock.start).toHaveBeenCalledTimes(1);
    expect(relayMock.start.mock.calls[0]![0]).toMatchObject({
      url: 'wss://eshmaki.me:8080',
      nick: 'kain',
      identifyTotp: '123456',
    });
  });
});
