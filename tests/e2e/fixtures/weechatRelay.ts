import type { Page, WebSocketRoute } from '@playwright/test';

const NULL_STRING = 0xffffffff;
const CHANNEL_PTR = 'cafe';
const CHANNEL_ID = `0x${CHANNEL_PTR}`;
const CHANNEL_NAME = '#darkbear';
const QUERY_PTR = 'face';
const QUERY_ID = `0x${QUERY_PTR}`;
const SERVER_PTR = 'beef';
const SERVER_ID = `0x${SERVER_PTR}`;
const SELF_NICK = 'tester';

class BinWriter {
  private readonly bytes: number[] = [];

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  u32(value: number): this {
    this.bytes.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    );
    return this;
  }

  raw(value: Uint8Array): this {
    for (const byte of value) this.bytes.push(byte);
    return this;
  }

  ascii(value: string): this {
    for (let i = 0; i < value.length; i++) this.bytes.push(value.charCodeAt(i) & 0xff);
    return this;
  }

  type(value: string): this {
    return this.ascii(value);
  }

  str(value: string | null): this {
    if (value === null) return this.u32(NULL_STRING);
    const bytes = new TextEncoder().encode(value);
    return this.u32(bytes.length).raw(bytes);
  }

  short(value: string): this {
    return this.u8(value.length).ascii(value);
  }

  stringTable(entries: Record<string, string>): this {
    const rows = Object.entries(entries);
    this.type('str').type('str').u32(rows.length);
    for (const [key, value] of rows) this.str(key).str(value);
    return this;
  }

  stringArray(values: string[]): this {
    this.type('str').u32(values.length);
    for (const value of values) this.str(value);
    return this;
  }

  build(): Buffer {
    return Buffer.from(this.bytes);
  }
}

function frame(id: string, body: BinWriter): Buffer {
  const bodyBytes = body.build();
  const idBytes = Buffer.from(id, 'utf8');
  const total = 4 + 1 + 4 + idBytes.length + bodyBytes.length;
  const header = new BinWriter().u32(total).u8(0).u32(idBytes.length).raw(idBytes).build();
  return Buffer.concat([header, bodyBytes]);
}

function handshakeFrame(): Buffer {
  return frame(
    '_handshake',
    new BinWriter().type('htb').stringTable({
      password_hash_algo: 'pbkdf2+sha256',
      password_hash_iterations: '1000',
      nonce: '00112233445566778899aabbccddeeff',
      totp: 'off',
      compression: 'off',
    }),
  );
}

function versionFrame(): Buffer {
  return frame('_version', new BinWriter().type('inf').str('version').str('4.9.0-e2e'));
}

function buffersFrame(includeQuery: boolean, includeServer: boolean): Buffer {
  const body = new BinWriter()
    .type('hda')
    .str('buffer')
    .str(
      'number:int,full_name:str,short_name:str,title:str,type:int,' +
      'nicklist_nicks_count:int,local_variables:htb,notify:int,hidden:chr',
    )
    .u32(1 + (includeQuery ? 1 : 0) + (includeServer ? 1 : 0));
  body
    .short(CHANNEL_PTR).u32(1).str('irc.fixture.#darkbear').str(CHANNEL_NAME)
    .str('DarkBear deterministic relay').u32(0).u32(2)
    .stringTable({ plugin: 'irc', type: 'channel', server: 'fixture', channel: CHANNEL_NAME, nick: SELF_NICK })
    .u32(3).u8(0);
  if (includeQuery) {
    body
      .short(QUERY_PTR).u32(2).str('irc.fixture.alice').str('alice')
      .str('').u32(0).u32(0)
      .stringTable({ plugin: 'irc', type: 'private', server: 'fixture', channel: 'alice', nick: SELF_NICK })
      .u32(3).u8(0);
  }
  if (includeServer) {
    body
      .short(SERVER_PTR).u32(3).str('irc.fixture.server.fixture').str('fixture')
      .str('Orochi operator server').u32(0).u32(0)
      .stringTable({ plugin: 'irc', type: 'server', server: 'fixture', network: 'fixture', nick: SELF_NICK })
      .u32(3).u8(0);
  }
  return frame('_buffers', body);
}

function emptyHotlistFrame(): Buffer {
  return frame(
    '_hotlist',
    new BinWriter()
      .type('hda')
      .str('hotlist')
      .str('buffer:ptr,count:arr')
      .u32(0),
  );
}

function nicklistFrame(): Buffer {
  const body = new BinWriter()
    .type('hda')
    .str('buffer/nicklist_item')
    .str('group:chr,visible:chr,level:int,name:str,color:str,prefix:str,prefix_color:str')
    .u32(2);

  for (const [ptr, name, prefix] of [
    ['aa01', SELF_NICK, '@'],
    ['aa02', 'alice', ''],
  ] as const) {
    body
      .short(CHANNEL_PTR)
      .short(ptr)
      .u8(0)
      .u8(1)
      .u32(0)
      .str(name)
      .str('default')
      .str(prefix)
      .str('default');
  }
  return frame('_nicklist', body);
}

function lineFrame(id: '_history' | '_buffer_line_added', options: {
  bufferPtr?: string;
  linePtr: string;
  message: string;
  nick: string;
  self?: boolean;
  highlight?: boolean;
  replyTo?: string;
  tags?: string[];
}): Buffer {
  const nowSeconds = Math.floor(Date.now() / 1000).toString();
  const tags = [
    'irc_privmsg',
    `nick_${options.nick}`,
    `irc_tag_msgid=${options.linePtr}`,
    ...(options.replyTo ? [`irc_tag_+draft/reply=${options.replyTo}`] : []),
    ...(options.self ? ['self_msg'] : []),
    ...(options.tags ?? []),
  ];
  const body = new BinWriter()
    .type('hda')
    .str('buffer/lines/line/line_data')
    .str('date:tim,date_printed:tim,displayed:chr,highlight:chr,tags_array:arr,prefix:str,message:str')
    .u32(1)
    .short(options.bufferPtr ?? CHANNEL_PTR)
    .short('1000')
    .short(options.linePtr)
    .short(options.linePtr)
    .short(nowSeconds)
    .short(nowSeconds)
    .u8(1)
    .u8(options.highlight === true ? 1 : 0)
    .stringArray(tags)
    .str(options.nick)
    .str(options.message);
  return frame(id, body);
}

function emptyHistoryFrame(): Buffer {
  return frame(
    '_history',
    new BinWriter()
      .type('hda')
      .str('buffer/lines/line/line_data')
      .str('date:tim,date_printed:tim,displayed:chr,highlight:chr,tags_array:arr,prefix:str,message:str')
      .u32(0),
  );
}

export class MockWeeChatRelay {
  readonly commands: string[] = [];
  private readonly sockets: WebSocketRoute[] = [];
  private readonly rejectedSockets = new WeakSet<WebSocketRoute>();
  private historySent = false;
  private nextLine = 2000;
  private dropInput = false;
  private connectionsSuspended = false;

  constructor(private readonly options: {
    includeQuery?: boolean;
    includeServer?: boolean;
    rejectAuthentication?: boolean;
  } = {}) {}

  get connectionCount(): number {
    return this.sockets.length;
  }

  async install(page: Page): Promise<void> {
    await page.routeWebSocket(/wss?:\/\/relay\.test:9001\/weechat/, (socket) => {
      this.attach(socket);
    });
  }

  private attach(socket: WebSocketRoute): void {
    this.sockets.push(socket);
    if (this.connectionsSuspended) {
      void socket.close({ code: 1012, reason: 'fixture connections suspended' });
      return;
    }
    socket.onMessage((payload) => {
      if (this.rejectedSockets.has(socket)) return;
      if (typeof payload !== 'string') return;
      for (const command of payload.split('\n').filter(Boolean)) {
        this.commands.push(command);
        if (this.options.rejectAuthentication === true && command.startsWith('init ')) {
          this.rejectedSockets.add(socket);
          void socket.close({ code: 1008, reason: 'fixture authentication rejection' });
          break;
        }
        this.respond(socket, command);
      }
    });
  }

  async disconnectLatest(code = 1012, reason = 'fixture restart'): Promise<void> {
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error('No relay connection is active');
    await socket.close({ code, reason });
  }

  suspendConnections(): void {
    this.connectionsSuspended = true;
  }

  resumeConnections(): void {
    this.connectionsSuspended = false;
  }

  dropNextInput(): void {
    this.dropInput = true;
  }

  sendIncoming(message: string, nick: string, replyTo?: string, highlight = false): void {
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error('No relay connection is active');
    this.nextLine += 1;
    socket.send(lineFrame('_buffer_line_added', {
      linePtr: this.nextLine.toString(16),
      message,
      nick,
      highlight,
      replyTo,
    }));
  }

  sendServerIncoming(message: string, nick = 'orochi.test', tags: string[] = []): void {
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error('No relay connection is active');
    this.nextLine += 1;
    socket.send(lineFrame('_buffer_line_added', {
      bufferPtr: SERVER_PTR,
      linePtr: this.nextLine.toString(16),
      message,
      nick,
      tags,
    }));
  }

  private respond(socket: WebSocketRoute, command: string): void {
    if (command.startsWith('(_handshake) handshake ')) {
      socket.send(handshakeFrame());
      return;
    }
    if (command === '(_version) info version') {
      socket.send(versionFrame());
      return;
    }
    if (command.startsWith('(_buffers) hdata ')) {
      socket.send(buffersFrame(this.options.includeQuery === true, this.options.includeServer === true));
      return;
    }
    if (command.startsWith('(_hotlist) hdata ')) {
      socket.send(emptyHotlistFrame());
      return;
    }
    if (command.startsWith('(_history) hdata ')) {
      if (!this.historySent) {
        this.historySent = true;
        socket.send(lineFrame('_history', {
          linePtr: '1001',
          message: 'Welcome from the deterministic relay',
          nick: 'alice',
        }));
      } else {
        socket.send(emptyHistoryFrame());
      }
      return;
    }
    if (command.startsWith('(_nicklist) nicklist ')) {
      socket.send(nicklistFrame());
      return;
    }
    const input = /^input (0x[0-9a-f]+) (.+)$/i.exec(command);
    if (input && this.dropInput) {
      this.dropInput = false;
      const socket = this.sockets.at(-1);
      if (socket) void socket.close({ code: 1012, reason: 'fixture dropped during send' });
      return;
    }
    if (input?.[1] === CHANNEL_ID && input[2]) {
      this.nextLine += 1;
      socket.send(lineFrame('_buffer_line_added', {
        linePtr: this.nextLine.toString(16),
        message: input[2],
        nick: SELF_NICK,
        self: true,
      }));
      return;
    }
    if (input?.[1] === QUERY_ID && input[2]) {
      this.nextLine += 1;
      socket.send(lineFrame('_buffer_line_added', {
        bufferPtr: QUERY_PTR,
        linePtr: this.nextLine.toString(16),
        message: input[2],
        nick: SELF_NICK,
        self: true,
      }));
    }
    if (input?.[1] === SERVER_ID && input[2]) return;
  }
}
