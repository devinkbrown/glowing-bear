// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { SuimyakuMediaEngine } from './MediaEngine';
import { KaguraCodec, type KaguraFrame } from './kaguraFrame';
import { getDropCount, resetDropCounters } from './mediaDropCounter';
import type { MediaStreamSource } from './mediaStream';
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
  sendProtectedAudioFrame: (encoded: Uint8Array, room: string) => void;
  sendEncryptedAudioFrame: (encoded: Uint8Array, room: string) => void;
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeEngine() {
  const onError = vi.fn();
  const engine = new SuimyakuMediaEngine(callbacks({ onError }));
  const internals = engine as unknown as EngineInternals;
  const encoded = new Uint8Array([1, 2, 3, 4]);
  internals.audEnc = { encode: () => encoded };
  internals.activeRoom = 'alice'; // 1:1 room — does NOT start with '#'
  internals.tsumugiGroupKey = null;
  // Spy on the wire-emit seam so we assert the branch decision without the MAC/WS stack.
  const sendFrame = vi.fn();
  internals.sendFrame = sendFrame;
  return { engine, internals, sendFrame, encoded, onError };
}

describe('SuimyakuMediaEngine audio send path — 1:1 TSUMUGI encryption', () => {
  it('emits the ciphertext as a TSUMUGI_DATA frame on a successful 1:1 encrypt (never silence, never plaintext)', async () => {
    const { internals, sendFrame, encoded } = makeEngine();
    const ciphertext = new Uint8Array([9, 9, 9]);
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn(async () => ciphertext) }],
    ]);

    internals.sendEncryptedAudioFrame(encoded, 'alice');
    await flush();

    // The successful ciphertext MUST reach the wire (the bug discarded it via `void ct`).
    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(sendFrame).toHaveBeenCalledWith('alice', 'TSUMUGI_DATA', ciphertext);
    // And it must NOT fall through to a plaintext AUDIO frame.
    expect(sendFrame).not.toHaveBeenCalledWith('alice', 'AUDIO', expect.anything());
  });

  it('fails closed and surfaces an error when established 1:1 encryption rejects', async () => {
    const { internals, sendFrame, encoded, onError } = makeEngine();
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn(async () => { throw new Error('encrypt failed'); }) }],
    ]);

    internals.sendEncryptedAudioFrame(encoded, 'alice');
    await flush();

    expect(sendFrame).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'Audio encryption failed. The audio frame was dropped instead of being sent as plaintext.',
    );
  });

  it('sends plaintext AUDIO when no session is established (no encrypted path available yet)', async () => {
    const { internals, sendFrame, encoded } = makeEngine();
    internals.tsumugiSessions = new Map(); // no peer session

    internals.sendEncryptedAudioFrame(encoded, 'alice');
    await flush();

    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(sendFrame).toHaveBeenCalledWith('alice', 'AUDIO', encoded);
  });

  it('emits TSUMUGI_DATA from the group-key branch when a group key is established', async () => {
    const { internals, sendFrame, encoded } = makeEngine();
    const ciphertext = new Uint8Array([7, 7]);
    internals.activeRoom = '#root';
    internals.tsumugiGroupKey = { encrypt: vi.fn(async () => ciphertext) };
    internals.tsumugiSessions = new Map();

    internals.sendEncryptedAudioFrame(encoded, '#root');
    await flush();

    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(sendFrame).toHaveBeenCalledWith('#root', 'TSUMUGI_DATA', ciphertext);
  });

  it('fails closed and surfaces an error when established group encryption rejects', async () => {
    const { internals, sendFrame, encoded, onError } = makeEngine();
    internals.activeRoom = '#root';
    internals.tsumugiGroupKey = {
      encrypt: vi.fn(async () => { throw new Error('group encrypt failed'); }),
    };
    internals.tsumugiSessions = new Map();

    internals.sendEncryptedAudioFrame(encoded, '#root');
    await flush();

    expect(sendFrame).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'Audio encryption failed. The audio frame was dropped instead of being sent as plaintext.',
    );
  });

  it('does not send room audio plaintext while an established peer session awaits a group key', async () => {
    const { internals, sendFrame, encoded, onError } = makeEngine();
    internals.activeRoom = '#root';
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn() }],
    ]);

    internals.sendEncryptedAudioFrame(encoded, '#root');
    await flush();

    expect(sendFrame).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps production audio plaintext while the explicit E2EE gate is disabled', async () => {
    const { internals, sendFrame, encoded } = makeEngine();
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn(async () => new Uint8Array([9])) }],
    ]);

    internals.onAudioFrame(new Int16Array(4));
    await flush();

    expect(sendFrame).toHaveBeenCalledWith('alice', 'AUDIO', encoded);
    expect(sendFrame).not.toHaveBeenCalledWith('alice', 'TSUMUGI_DATA', expect.anything());
  });

  it('rejects direct protected-send entry while the production gate is disabled', () => {
    const { internals, sendFrame, encoded } = makeEngine();

    internals.sendProtectedAudioFrame(encoded, 'alice');

    expect(sendFrame).not.toHaveBeenCalled();
  });
});

type ReceiveInternals = EngineInternals & {
  activeRoom: string | null;
  dispatchFrame: ReturnType<typeof vi.fn>;
  dispatchDecodedFrame: (frame: KaguraFrame, src: MediaStreamSource, room: string) => void;
  decryptProtectedAudio: (nick: string, channel: string, ciphertext: Uint8Array) => void;
  decryptEncryptedAudio: (nick: string, channel: string, ciphertext: Uint8Array) => void;
  allowInboundPlaintextAudioWithProtection: () => boolean;
  sendTsumugiHandshake: (target: string) => Promise<void>;
  ensureTsumugiIdentity: ReturnType<typeof vi.fn>;
  registry: {
    getOrCreate: ReturnType<typeof vi.fn>;
    decodeAudio: ReturnType<typeof vi.fn>;
  };
};

const audioFrame = (bandId = 64): KaguraFrame => ({
  bandId,
  streamId: 1,
  sequence: 1,
  timestamp: 1,
  keyframe: false,
  codec: KaguraCodec.kaguravoxAudio,
  payload: new Uint8Array([1, 2, 3]),
});

const b64 = (bytes = new Uint8Array([1, 2, 3])) =>
  btoa(String.fromCharCode(...bytes));

describe('SuimyakuMediaEngine production Audio E2EE gate and inbound downgrade guard', () => {
  it('rejects TSUMUGI_DATA at the final sendFrame seam while disabled', () => {
    resetDropCounters();
    const engine = new SuimyakuMediaEngine(callbacks());
    const internals = engine as unknown as ReceiveInternals;

    internals.sendFrame('#root', 'TSUMUGI_DATA', new Uint8Array([1]));

    expect(getDropCount('tsumugi-disabled-send')).toBe(1);
  });

  it('does not initialize or accept TSUMUGI controls while the production gate is disabled', async () => {
    const onTsumugiState = vi.fn();
    const engine = new SuimyakuMediaEngine(callbacks({ onTsumugiState }));
    const internals = engine as unknown as ReceiveInternals;
    const ensureIdentity = vi.fn();
    internals.ensureTsumugiIdentity = ensureIdentity;

    await internals.sendTsumugiHandshake('bob');
    engine.handleMediaMessage('bob', 'alice', 'TSUMUGI_HANDSHAKE', b64());
    await flush();

    expect(ensureIdentity).not.toHaveBeenCalled();
    expect(internals.tsumugiSessions.size).toBe(0);
    expect(onTsumugiState).not.toHaveBeenCalled();
  });

  it('drops TSUMUGI control and binary data while the production gate is disabled', async () => {
    const engine = new SuimyakuMediaEngine(callbacks());
    const internals = engine as unknown as ReceiveInternals;
    const groupDecrypt = vi.fn(async () => new Uint8Array([9]));
    const dispatchFrame = vi.fn();
    internals.activeRoom = '#root';
    internals.tsumugiGroupKey = { encrypt: vi.fn(), decrypt: groupDecrypt } as never;
    internals.dispatchFrame = dispatchFrame;

    engine.handleMediaMessage('bob', '#root', 'TSUMUGI_DATA', b64());
    internals.dispatchDecodedFrame(audioFrame(66), { nick: 'bob', kind: 'audio' }, '#root');
    await flush();

    expect(groupDecrypt).not.toHaveBeenCalled();
    expect(dispatchFrame).not.toHaveBeenCalled();
  });

  it('keeps every legacy plaintext-audio ingress working with stale keys while disabled', () => {
    const engine = new SuimyakuMediaEngine(callbacks());
    const internals = engine as unknown as ReceiveInternals;
    const dispatchFrame = vi.fn();
    internals.dispatchFrame = dispatchFrame;
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn() }],
    ]);

    engine.handleMediaMessage('bob', '#root', 'AUDIO', b64());
    engine.handleMediaMessage('bob', '#root', 'AUDIO_FRAME/bob', b64());
    engine.handleMediaMessage('bob', '#root', 'MCHUNK/AUDIO/bob/1/1/1', b64());
    engine.handleMediaMessage('bob', '#root', 'VOICE_DATA', b64());

    expect(dispatchFrame).toHaveBeenCalledTimes(4);
  });

  it('keeps normal binary audio working with stale keys while disabled', () => {
    const engine = new SuimyakuMediaEngine(callbacks());
    const internals = engine as unknown as ReceiveInternals;
    const decodeAudio = vi.fn();
    const getOrCreate = vi.fn(() => ({}));
    internals.registry = { getOrCreate, decodeAudio };
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn() }],
    ]);

    internals.dispatchDecodedFrame(audioFrame(), { nick: 'bob', kind: 'audio' }, '#root');

    expect(getOrCreate).toHaveBeenCalledOnce();
    expect(decodeAudio).toHaveBeenCalledOnce();
  });

  it('preserves plaintext audio before any protection is established', () => {
    const engine = new SuimyakuMediaEngine(callbacks());
    const internals = engine as unknown as ReceiveInternals;
    const dispatchFrame = vi.fn();
    internals.dispatchFrame = dispatchFrame;

    engine.handleMediaMessage('bob', '#root', 'AUDIO', b64());

    expect(dispatchFrame).toHaveBeenCalledWith('bob', '#root', 'AUDIO', new Uint8Array([1, 2, 3]));
  });

  it('retains a fail-closed plaintext guard for the future enabled protection path', () => {
    const engine = new SuimyakuMediaEngine(callbacks());
    const internals = engine as unknown as ReceiveInternals;
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn() }],
    ]);

    expect(internals.allowInboundPlaintextAudioWithProtection()).toBe(false);
  });

  it('drops every chunked TSUMUGI control/data name or alias instead of generic dispatch', () => {
    const engine = new SuimyakuMediaEngine(callbacks());
    const internals = engine as unknown as ReceiveInternals;
    const dispatchFrame = vi.fn();
    internals.dispatchFrame = dispatchFrame;
    const names = [
      'TSUMUGI_DATA',
      'TSUMUGI_DATA_FRAME',
      'TSUMUGI-DATA',
      'TSUMUGI_HANDSHAKE',
      'TSUMUGI_RATCHET',
      'TSUMUGI_GROUP_KEY',
      'TSUMUGI_GROUPKEY',
    ];

    names.forEach((name, index) => {
      engine.handleMediaMessage('bob', '#root', `MCHUNK/${name}/bob/${index + 1}/1/1`, b64());
    });

    expect(dispatchFrame).not.toHaveBeenCalled();
  });

  it('rejects the direct protected-decrypt entry while disabled', async () => {
    const engine = new SuimyakuMediaEngine(callbacks());
    const internals = engine as unknown as ReceiveInternals;
    const peerDecrypt = vi.fn(async () => new Uint8Array([9]));
    internals.activeRoom = 'alice';
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn(), decrypt: peerDecrypt } as never],
    ]);

    internals.decryptProtectedAudio('bob', 'alice', new Uint8Array([7]));
    await flush();

    expect(peerDecrypt).not.toHaveBeenCalled();
  });

  it('selects one explicit decrypt mode without group-to-pairwise fallback', async () => {
    const engine = new SuimyakuMediaEngine(callbacks());
    const internals = engine as unknown as ReceiveInternals;
    const groupDecrypt = vi.fn(async () => { throw new Error('bad group frame'); });
    const peerDecrypt = vi.fn(async () => new Uint8Array([9]));
    internals.activeRoom = '#root';
    internals.tsumugiGroupKey = { decrypt: groupDecrypt } as never;
    internals.tsumugiSessions = new Map([
      ['bob', { established: true, encrypt: vi.fn(), decrypt: peerDecrypt } as never],
    ]);

    internals.decryptEncryptedAudio('bob', '#root', new Uint8Array([7]));
    await flush();

    expect(groupDecrypt).toHaveBeenCalledOnce();
    expect(peerDecrypt).not.toHaveBeenCalled();
  });
});
