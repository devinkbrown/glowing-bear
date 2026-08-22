// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { parseIRCMessage } from '@/lib/irc/parser';
import { CadenceMediaEngine } from './MediaEngine';
import type { IRCMessage } from '@/lib/irc/types';
import type { CadenceMediaCallbacks, CadenceTranscriptEntry } from './types';

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

function attachEngine(cbs: CadenceMediaCallbacks) {
  const engine = new CadenceMediaEngine(cbs);
  const client: FakeClient = {
    currentNick: 'me',
    binaryHandlers: new Set(),
    extraMessageHandlers: new Set(),
    sendRaw: vi.fn(),
    sendBinary: vi.fn(),
  };
  engine.setClient(client as never);
  (engine as unknown as { activeRoom: string }).activeRoom = '#root';
  return { client };
}

function deliver(client: FakeClient, line: string): void {
  const msg = parseIRCMessage(line);
  for (const handler of client.extraMessageHandlers) handler(msg);
}

describe('CadenceMediaEngine EVENT MEDIA parser', () => {
  it('emits live captions and transcript replays from Event Spine media lines', () => {
    const seen: Array<{ entry: CadenceTranscriptEntry; live: boolean }> = [];
    const cbs = callbacks({
      onCaption: (entry, live) => seen.push({ entry, live }),
    });
    const { client } = attachEngine(cbs);

    deliver(client, ':eshmaki.me EVENT me MEDIA CAPTION #root alice :hello room');
    deliver(client, ':eshmaki.me EVENT me MEDIA TRANSCRIPT #root bob :earlier room');

    expect(seen).toMatchObject([
      { entry: { channel: '#root', nick: 'alice', text: 'hello room' }, live: true },
      { entry: { channel: '#root', nick: 'bob', text: 'earlier room' }, live: false },
    ]);
    expect(typeof seen[0]?.entry.time).toBe('number');
  });

  it('ignores caption events for inactive rooms', () => {
    const onCaption = vi.fn();
    const { client } = attachEngine(callbacks({ onCaption }));

    deliver(client, ':eshmaki.me EVENT me MEDIA CAPTION #else alice :not visible');

    expect(onCaption).not.toHaveBeenCalled();
  });

  it('forwards non-presence media replies to existing control handlers', () => {
    const onRoomStats = vi.fn();
    const { client } = attachEngine(callbacks({ onRoomStats }));

    deliver(client, ':eshmaki.me EVENT me MEDIA STATS #root :{"active_senders":1,"total_viewers":2,"video_fps":30,"audio_kbps":48}');

    expect(onRoomStats).toHaveBeenCalledWith('#root', {
      active_senders: 1,
      total_viewers: 2,
      video_fps: 30,
      audio_kbps: 48,
    });
  });
});
