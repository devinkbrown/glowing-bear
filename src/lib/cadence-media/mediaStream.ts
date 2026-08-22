// Media stream routing for the WS media plane.
//
// A relayed Kagura datagram carries a `stream_id` but no sender identity (the
// Onyx Server SFU forwards verbatim). We make `stream_id` a DETERMINISTIC public
// function of (channel, nick, kind) so a receiver can map an inbound datagram
// back to a roster participant with no server cooperation. This id is a routing
// label only — authenticity comes from the per-stream MAC, not from this value.

export type MediaStreamKind = 'audio' | 'video';

/**
 * FNV-1a (32-bit) over UTF-8 of "channel\0nick\0kind", with channel/nick lowered
 * for case-insensitive IRC identity. Sender and receiver are the same JS, so the
 * exact hash only needs to agree with itself.
 */
export function mediaStreamId(channel: string, nick: string, kind: MediaStreamKind): number {
  const bytes = new TextEncoder().encode(`${channel.toLowerCase()}\0${nick.toLowerCase()}\0${kind}`);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface MediaStreamSource {
  nick: string;
  kind: MediaStreamKind;
}

/**
 * Resolves an inbound datagram's `stream_id` to its sender by precomputing the
 * id for every roster participant's audio + video streams. Rebuild via
 * `setRoster` whenever the call roster changes (MEDIA JOIN/LEAVE).
 */
export class MediaStreamRouter {
  private channel = '';
  private map = new Map<number, MediaStreamSource>();

  setRoster(channel: string, nicks: readonly string[]): void {
    this.channel = channel;
    this.map.clear();
    for (const nick of nicks) {
      this.map.set(mediaStreamId(channel, nick, 'audio'), { nick, kind: 'audio' });
      this.map.set(mediaStreamId(channel, nick, 'video'), { nick, kind: 'video' });
    }
  }

  /** Add a single participant's streams without rebuilding the whole map. */
  addParticipant(nick: string): void {
    if (!this.channel) return;
    this.map.set(mediaStreamId(this.channel, nick, 'audio'), { nick, kind: 'audio' });
    this.map.set(mediaStreamId(this.channel, nick, 'video'), { nick, kind: 'video' });
  }

  removeParticipant(nick: string): void {
    if (!this.channel) return;
    this.map.delete(mediaStreamId(this.channel, nick, 'audio'));
    this.map.delete(mediaStreamId(this.channel, nick, 'video'));
  }

  resolve(streamId: number): MediaStreamSource | null {
    return this.map.get(streamId >>> 0) ?? null;
  }

  clear(): void {
    this.channel = '';
    this.map.clear();
  }
}
