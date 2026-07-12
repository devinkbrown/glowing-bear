// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { SuimyakuMediaEngine } from './MediaEngine';
import type { SuimyakuMediaCallbacks } from './types';

function callbacks(overrides: Partial<SuimyakuMediaCallbacks> = {}): SuimyakuMediaCallbacks {
  return {
    onCallState: vi.fn(),
    onPeerLeft: vi.fn(),
    onLocalStream: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

/** Minimal mutable view of the private engine internals the audio send path reads. */
type EngineInternals = {
  activeRoom: string | null;
  audEnc: { encode: (i16: Int16Array) => Uint8Array } | null;
  tsumugiGroupKey: { encrypt: (pt: Uint8Array) => Promise<Uint8Array> } | null;
  tsumugiSessions: Map<string, { established: boolean; encrypt: (pt: Uint8Array) => Promise<Uint8Array> }>;
  sendFrame: (channel: string, ftype: string, data: Uint8Array) => void;
  onAudioFrame: (i16: Int16Array) => void;
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeEngine() {
  const engine = new SuimyakuMediaEngine(callbacks());
  const internals = engine as unknown as EngineInternals;
  const encoded = new Uint8Array([1, 2, 3, 4]);
  internals.audEnc = { encode: () => encoded };
  internals.activeRoom = 'alice'; // 1:1 room — does NOT start with '#'
  internals.tsumugiGroupKey = null;
  // Spy on the wire-emit seam so we assert the branch decision without the MAC/WS stack.
  const sendFrame = vi.fn();
  internals.sendFrame = sendFrame;
  return { engine, internals, sendFrame, encoded };
}

describe('SuimyakuMediaEngine audio send path — 1:1 TSUMUGI encryption', () => {
  it('emits the ciphertext as a TSUMUGI_DATA frame on a successful 1:1 encrypt (never silence, never plaintext)', async () => {
    const { internals, sendFrame } = makeEngine();
    const ciphertext = new Uint8Array([9, 9, 9]);
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn(async () => ciphertext) }],
    ]);

    internals.onAudioFrame(new Int16Array(4));
    await flush();

    // The successful ciphertext MUST reach the wire (the bug discarded it via `void ct`).
    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(sendFrame).toHaveBeenCalledWith('alice', 'TSUMUGI_DATA', ciphertext);
    // And it must NOT fall through to a plaintext AUDIO frame.
    expect(sendFrame).not.toHaveBeenCalledWith('alice', 'AUDIO', expect.anything());
  });

  it('falls back to a plaintext AUDIO frame only when the 1:1 encrypt rejects', async () => {
    const { internals, sendFrame, encoded } = makeEngine();
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn(async () => { throw new Error('encrypt failed'); }) }],
    ]);

    internals.onAudioFrame(new Int16Array(4));
    await flush();

    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(sendFrame).toHaveBeenCalledWith('alice', 'AUDIO', encoded);
    expect(sendFrame).not.toHaveBeenCalledWith('alice', 'TSUMUGI_DATA', expect.anything());
  });

  it('sends plaintext AUDIO when no session is established (no encrypted path available yet)', async () => {
    const { internals, sendFrame, encoded } = makeEngine();
    internals.tsumugiSessions = new Map(); // no peer session

    internals.onAudioFrame(new Int16Array(4));
    await flush();

    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(sendFrame).toHaveBeenCalledWith('alice', 'AUDIO', encoded);
  });

  it('emits TSUMUGI_DATA from the group-key branch when a group key is established', async () => {
    const { internals, sendFrame } = makeEngine();
    const ciphertext = new Uint8Array([7, 7]);
    internals.activeRoom = '#root';
    internals.tsumugiGroupKey = { encrypt: vi.fn(async () => ciphertext) };
    internals.tsumugiSessions = new Map();

    internals.onAudioFrame(new Int16Array(4));
    await flush();

    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(sendFrame).toHaveBeenCalledWith('#root', 'TSUMUGI_DATA', ciphertext);
  });
});
