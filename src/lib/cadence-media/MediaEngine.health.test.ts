// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseIRCMessage } from '@/lib/irc/parser';
import { CadenceMediaEngine } from './MediaEngine';
import type { IRCMessage } from '@/lib/irc/types';
import type { CadenceCallHealth, CadenceMediaCallbacks } from './types';

type FakeClient = {
  currentNick: string;
  binaryHandlers: Set<(data: Uint8Array) => void>;
  extraMessageHandlers: Set<(msg: IRCMessage) => void>;
  sendRaw: ReturnType<typeof vi.fn>;
  sendBinary: ReturnType<typeof vi.fn>;
};

function callbacks(overrides: Partial<CadenceMediaCallbacks> = {}): CadenceMediaCallbacks {
  return {
    onCallState: vi.fn(),
    onPeerLeft: vi.fn(),
    onLocalStream: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

function harness(overrides: Partial<CadenceMediaCallbacks> = {}) {
  const seenHealth: CadenceCallHealth[] = [];
  const cbs = callbacks({ onCallHealth: (health) => seenHealth.push(health), ...overrides });
  const engine = new CadenceMediaEngine(cbs);
  const client: FakeClient = {
    currentNick: 'me',
    binaryHandlers: new Set(),
    extraMessageHandlers: new Set(),
    sendRaw: vi.fn(),
    sendBinary: vi.fn(),
  };
  engine.setClient(client as never);
  engine.setTransportConnected(true);
  const internal = engine as unknown as {
    activeRoom: string | null;
    callState: string;
    localKind: string | null;
    localStream: MediaStream | null;
    lastLossRate: number;
    measuredBps: number;
    reportAbr(force: boolean): void;
  };
  internal.activeRoom = '#root';
  internal.callState = 'in_call';

  const deliver = (line: string) => {
    const msg = parseIRCMessage(line);
    for (const handler of client.extraMessageHandlers) handler(msg);
  };
  return { engine, client, cbs, internal, seenHealth, deliver };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CadenceMediaEngine call health', () => {
  it('keeps one participant pipeline when reconnect roster events repeat', () => {
    const { engine, deliver } = harness();
    deliver(':onyx.test EVENT me MEDIA JOIN #root alice video');
    deliver(':onyx.test EVENT me MEDIA JOIN #root alice video');
    deliver(':onyx.test EVENT me MEDIA ROSTER #root alice video');
    expect(engine.getPeers().size).toBe(1);
  });

  it('applies bitrate changes with hysteresis and recovers one tier at a time', () => {
    const onNetworkQuality = vi.fn();
    const { deliver } = harness({ onNetworkQuality });
    const poor = ':onyx.test EVENT me MEDIA MEDIA_STATS #root :{"suggested_bps":100000}';
    deliver(poor);
    expect(onNetworkQuality).not.toHaveBeenCalled();
    deliver(poor);
    expect(onNetworkQuality).toHaveBeenLastCalledWith(1, 100_000);

    const good = ':onyx.test EVENT me MEDIA MEDIA_STATS #root :{"suggested_bps":400000}';
    for (let i = 0; i < 3; i++) deliver(good);
    expect(onNetworkQuality).toHaveBeenCalledTimes(1);
    deliver(good);
    expect(onNetworkQuality).toHaveBeenLastCalledWith(0, 400_000);
  });

  it('reports measured loss through Onyx Server MEDIA ABR', () => {
    const { client, internal } = harness();
    internal.lastLossRate = 0.12;
    internal.measuredBps = 240_000;
    internal.reportAbr(false);
    expect(client.sendRaw).toHaveBeenCalledWith(
      'MEDIA', 'ABR', '#root', '240', '240', '12', '0', '0',
    );
  });

  it('preserves capture across a short bridge drop and re-announces exactly once', () => {
    vi.useFakeTimers();
    const { engine, client, internal, seenHealth } = harness();
    const stop = vi.fn();
    internal.localKind = 'voice';
    internal.localStream = { getTracks: () => [{ stop }] } as unknown as MediaStream;

    engine.setTransportConnected(false);
    expect(stop).not.toHaveBeenCalled();
    expect(seenHealth.at(-1)?.status).toBe('reconnecting');

    engine.setTransportConnected(true);
    engine.setTransportConnected(true);
    vi.advanceTimersByTime(500);
    expect(client.sendRaw.mock.calls.filter((args) => args[0] === 'MEDIA' && args[1] === 'JOIN')).toHaveLength(1);
    expect(client.sendRaw).toHaveBeenCalledWith('MEDIA', 'ROSTER', '#root');
    expect(stop).not.toHaveBeenCalled();
  });

  it('releases capture when the reconnect grace period expires', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const { engine, internal } = harness({ onError });
    const stop = vi.fn();
    internal.localKind = 'voice';
    internal.localStream = { getTracks: () => [{ stop }] } as unknown as MediaStream;

    engine.setTransportConnected(false);
    vi.advanceTimersByTime(20_000);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(engine.getCallState().callState).toBe('idle');
    expect(onError).toHaveBeenCalledWith('Media bridge did not recover in time');
  });
});
