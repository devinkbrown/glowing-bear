import type { Page, WebSocketRoute } from '@playwright/test';
import type { PreferenceMetadataEntry } from '../../../src/lib/preferences/sync';

/** Deterministic direct Orochi account session for preference-sync journeys. */
export class MockOrochiAccount {
  readonly commands: string[] = [];
  readonly saslMechanisms: string[] = [];
  readonly metadata = new Map<string, string>();
  readonly peerKeys = new Map<string, string>();
  private nick = 'darkbear';
  private readonly sockets: WebSocketRoute[] = [];
  private readonly mechanisms = new WeakMap<WebSocketRoute, 'PLAIN' | 'SESSION-TOKEN'>();
  private readonly saslSessionToken = 'sst_0123456789abcdef0123456789abcdef';

  get connectionCount(): number {
    return this.sockets.length;
  }

  constructor(initial: readonly PreferenceMetadataEntry[] = []) {
    for (const entry of initial) this.metadata.set(entry.key, entry.value);
  }

  async install(page: Page): Promise<void> {
    await page.routeWebSocket(/wss?:\/\/orochi\.test\/irc/, (socket) => this.attach(socket));
  }

  private attach(socket: WebSocketRoute): void {
    this.sockets.push(socket);
    socket.onMessage((payload) => {
      if (typeof payload !== 'string') return;
      for (const raw of payload.split(/\r?\n/).filter(Boolean)) {
        const command = raw.trim();
        this.commands.push(command);
        this.respond(socket, command);
      }
    });
  }

  async disconnectLatest(code = 1012, reason = 'fixture restart'): Promise<void> {
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error('No Orochi account connection is active');
    await socket.close({ code, reason });
  }

  sendMediaEvent(verb: string, channel: string, ...params: string[]): void {
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error('No Orochi account connection is active');
    this.send(socket, `:orochi.test EVENT ${this.nick} MEDIA ${verb} ${channel}${params.length ? ` ${params.join(' ')}` : ''}`);
  }

  sendMediaEventBurst(events: readonly {
    verb: string;
    channel: string;
    params: readonly string[];
  }[]): void {
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error('No Orochi account connection is active');
    const lines = events.map(({ verb, channel, params }) =>
      `:orochi.test EVENT ${this.nick} MEDIA ${verb} ${channel}${params.length ? ` ${params.join(' ')}` : ''}`,
    );
    this.send(socket, lines.join('\r\n'));
  }

  sendMediaDatagram(data: Uint8Array): void {
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error('No Orochi account connection is active');
    socket.send(Buffer.from(data));
  }

  setPeerKey(nick: string, publicKey: string): void {
    this.peerKeys.set(nick.toLowerCase(), publicKey);
  }

  sendPeerKey(nick: string, publicKey: string): void {
    this.setPeerKey(nick, publicKey);
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error('No Orochi account connection is active');
    this.send(socket, `:orochi.test METADATA ${nick} ocean.dm-key * :${publicKey}`);
  }

  private send(socket: WebSocketRoute, line: string): void {
    socket.send(`${line}\r\n`);
  }

  private respond(socket: WebSocketRoute, command: string): void {
    const ping = /^PING(?: :)?(.+)$/.exec(command);
    if (ping?.[1]) {
      this.send(socket, `PONG :${ping[1]}`);
      return;
    }
    if (command.startsWith('NICK ')) {
      this.nick = command.slice('NICK '.length).trim() || this.nick;
      return;
    }
    if (command === 'CAP LS 302') {
      this.send(socket, `:orochi.test CAP ${this.nick} LS :sasl=SESSION-TOKEN,PLAIN draft/metadata-2`);
      return;
    }
    if (command.startsWith('CAP REQ ')) {
      this.send(socket, `:orochi.test CAP ${this.nick} ACK :sasl draft/metadata-2`);
      return;
    }
    const mechanism = /^AUTHENTICATE (PLAIN|SESSION-TOKEN)$/.exec(command)?.[1] as
      | 'PLAIN'
      | 'SESSION-TOKEN'
      | undefined;
    if (mechanism) {
      this.mechanisms.set(socket, mechanism);
      this.saslMechanisms.push(mechanism);
      this.send(socket, 'AUTHENTICATE +');
      return;
    }
    if (command.startsWith('AUTHENTICATE ')) {
      const activeMechanism = this.mechanisms.get(socket);
      const payload = command.slice('AUTHENTICATE '.length);
      let account = this.nick;
      try {
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        if (activeMechanism === 'SESSION-TOKEN') {
          const [authcid, token] = decoded.split('\0');
          if (!authcid || token !== this.saslSessionToken) {
            this.send(socket, `:orochi.test 904 ${this.nick} :SASL authentication failed`);
            return;
          }
          account = authcid;
        } else {
          account = decoded.split('\0')[1] || this.nick;
        }
      } catch {
        this.send(socket, `:orochi.test 904 ${this.nick} :SASL authentication failed`);
        return;
      }
      this.send(socket, `:orochi.test 903 ${this.nick} :SASL authentication successful`);
      if (activeMechanism === 'PLAIN') {
        this.send(
          socket,
          `:orochi.test NOTICE ${this.nick} :SESSIONTOKEN ${account} ${this.saslSessionToken} expires=4102444800`,
        );
      }
      return;
    }
    if (command === 'CAP END') {
      this.send(socket, `:orochi.test 001 ${this.nick} :Welcome to Orochi`);
      return;
    }
    if (command === 'METADATA * LIST') {
      for (const [key, value] of this.metadata) {
        this.send(socket, `:orochi.test 761 ${this.nick} * ${key} secret :${value}`);
      }
      this.send(socket, `:orochi.test 762 ${this.nick} :end of metadata`);
      return;
    }
    const peerKeyGet = /^METADATA (\S+) GET ocean\.dm-key$/.exec(command);
    if (peerKeyGet?.[1]) {
      const peer = peerKeyGet[1];
      const value = this.peerKeys.get(peer.toLowerCase());
      if (value) this.send(socket, `:orochi.test 761 ${this.nick} ${peer} ocean.dm-key * :${value}`);
      else this.send(socket, `:orochi.test 766 ${this.nick} ${peer} ocean.dm-key :key not set`);
      return;
    }
    const mediaJoin = /^MEDIA JOIN (\S+) (voice|video|screen)$/.exec(command);
    if (mediaJoin?.[1] && mediaJoin[2]) {
      this.send(socket, `:orochi.test EVENT ${this.nick} MEDIA JOIN ${mediaJoin[1]} ${this.nick} ${mediaJoin[2]}`);
      return;
    }
    const mediaOffer = /^MEDIA OFFER (\S+) /.exec(command);
    if (mediaOffer?.[1]) {
      const key = Buffer.alloc(32, 7).toString('base64');
      this.send(socket, `:orochi.test EVENT ${this.nick} MEDIA MACKEY ${mediaOffer[1]} ${key}`);
      return;
    }
    const mediaRoster = /^MEDIA ROSTER (\S+)$/.exec(command);
    if (mediaRoster?.[1]) {
      this.send(socket, `:orochi.test EVENT ${this.nick} MEDIA ROSTER ${mediaRoster[1]} alice voice`);
      return;
    }
    const mediaAbr = /^MEDIA ABR (\S+) \d+ \d+ (\d+) \d+ \d+$/.exec(command);
    if (mediaAbr?.[1]) {
      const keyframe = Number(mediaAbr[2] ?? 0) >= 3 ? 'true' : 'false';
      this.send(socket, `:orochi.test EVENT ${this.nick} MEDIA ABR ${mediaAbr[1]} action=decrease bitrate=240 fec=1 keyframe=${keyframe} spatial<=0 temporal<=0`);
      return;
    }
    const set = /^METADATA \* SET (\S+)(?: secret (.+))?$/.exec(command);
    if (!set?.[1]) return;
    const key = set[1];
    const value = set[2];
    if (value === undefined) this.metadata.delete(key);
    else this.metadata.set(key, value);
    this.send(socket, `:orochi.test 761 ${this.nick} * ${key} secret :${value ?? ''}`);
  }
}
