// Tests for IRCClient's CAP/SASL/SCRAM state machine, frame handling, and
// session resume. jsdom's WebSocket would try a real connection, so the global
// is stubbed with a controllable fake that records every sent line and lets the
// test drive open()/message()/close(). The client under test is the real thing.
//
// The SCRAM suite runs a full mutual-authentication exchange: the test plays the
// server, computing the client's expected ServerSignature with the same
// primitives, so we can prove the client (a) sends `AUTHENTICATE +` and completes
// only when the server-final `v=` verifies, and (b) refuses the connection on a
// forged server signature — the property M2 added.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IRCClient, type IRCClientOptions } from './client';
import type { IRCMessage } from './types';

// ── WebSocket fake ───────────────────────────────────────────────────────────

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  url: string;
  protocols: string[] = [];
  binaryType = 'blob';
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  throwOnSend = false;
  closeCode: number | null = null;
  closeReason = '';

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = typeof protocols === 'string' ? [protocols] : [...(protocols ?? [])];
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.throwOnSend) throw new Error('socket closing');
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: true } as CloseEvent);
  }

  // ── test drivers ──
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

// ── SCRAM server helper (mirrors the client's algorithm) ─────────────────────

const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw', key.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data.buffer as ArrayBuffer));
}

/**
 * Compute the ServerSignature the client will expect for a completed SCRAM
 * exchange, so the test can send a matching (or deliberately forged) server-final.
 */
async function serverSignature(
  password: string,
  salt: Uint8Array,
  iterations: number,
  authMessage: string,
): Promise<string> {
  const rawKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const saltedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, rawKey, 256,
  );
  const saltedPass = new Uint8Array(saltedBits);
  const serverKey = await hmac(saltedPass, enc.encode('Server Key'));
  const sig = await hmac(serverKey, enc.encode(authMessage));
  return b64(sig);
}

// ── harness ──────────────────────────────────────────────────────────────────

function lastSocket(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
}

/**
 * Poll until `cond` holds, on a wall-clock deadline. The client's SCRAM steps
 * resolve async (PBKDF2), which under full-suite load can need many event-loop
 * turns — a fixed poll count would give up prematurely, so bound by time.
 */
async function waitUntil(cond: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('waitUntil: condition never met');
}

let received: IRCMessage[];
let errors: string[];

function makeClient(overrides: Partial<IRCClientOptions> = {}) {
  received = [];
  errors = [];
  return new IRCClient({
    url: 'wss://test.invalid',
    nick: 'kain',
    password: 'hunter2',
    onMessage: (m) => received.push(m),
    onError: (e) => errors.push(e),
    ...overrides,
  });
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('outbound acknowledgement', () => {
  it('returns true only when the open socket accepts the frame', () => {
    const onRaw = vi.fn();
    const c = makeClient({ onRaw });
    c.connect();
    const ws = lastSocket();

    expect(c.sendRaw('PRIVMSG', '#room', 'before open')).toBe(false);
    expect(c.tagmsg('#room', { '+draft/react': '👍' })).toBe(false);
    expect(onRaw).not.toHaveBeenCalledWith('PRIVMSG #room :before open', 'out');

    ws.open();
    ws.sent.length = 0;
    onRaw.mockClear();
    expect(c.sendRaw('PRIVMSG', '#room', 'accepted')).toBe(true);
    expect(ws.sent).toEqual(['PRIVMSG #room accepted\r\n']);
    expect(onRaw).toHaveBeenCalledWith('PRIVMSG #room accepted', 'out');

    expect(c.tagmsg('#room', { '+draft/react': '👍' })).toBe(true);
    expect(ws.sent.at(-1)).toBe('@+draft/react=👍 TAGMSG #room\r\n');

    ws.throwOnSend = true;
    expect(c.sendRaw('PRIVMSG', '#room', 'raced close')).toBe(false);
    expect(c.tagmsg('#room', { '+draft/react': '👍' })).toBe(false);
    expect(onRaw).not.toHaveBeenCalledWith('PRIVMSG #room :raced close', 'out');
  });
});

// ── framing ───────────────────────────────────────────────────────────────────

describe('frame handling', () => {
  it('passes the exact server-authored 001 message to the connected callback', () => {
    const onConnected = vi.fn();
    const c = makeClient({ onConnected });
    c.connect();
    lastSocket().open();
    lastSocket().message(':onyx.test 001 kain :Welcome');

    expect(onConnected).toHaveBeenCalledWith(expect.objectContaining({
      command: '001',
      prefix: 'onyx.test',
      params: ['kain', 'Welcome'],
    }));
  });

  it('handles a CRLF-less frame (Onyx Server omits the trailing newline)', () => {
    const c = makeClient();
    expect(c.loggedIn).toBe(false);
    c.connect();
    lastSocket().open();
    lastSocket().message(':eshmaki.me 001 kain :Welcome'); // no CRLF
    expect(received.map((m) => m.command)).toContain('001');
  });

  it('processes several CRLF-separated messages batched in one frame', () => {
    const c = makeClient();
    c.connect();
    lastSocket().message(':s NOTICE * :one\r\n:s NOTICE * :two\r\n');
    const notices = received.filter((m) => m.command === 'NOTICE');
    expect(notices).toHaveLength(2);
  });

  it('a malformed line does not abort the rest of the frame', () => {
    const c = makeClient();
    c.connect();
    // First segment is empty (skipped); PING must still be answered.
    lastSocket().open();
    lastSocket().sent.length = 0;
    lastSocket().message('\r\nPING :tok');
    expect(lastSocket().sent).toContain('PONG tok\r\n');
  });

  it('routes ArrayBuffer media frames to binary subscribers', () => {
    const onBinary = vi.fn();
    const subscriber = vi.fn();
    const c = makeClient({ onBinary });
    c.binaryHandlers.add(subscriber);
    c.connect();
    lastSocket().message(new Uint8Array([1, 2, 3]).buffer);
    expect(onBinary).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(subscriber).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  });

  it('converts Blob media frames without parsing them as IRC text', async () => {
    const onBinary = vi.fn();
    const c = makeClient({ onBinary });
    c.connect();
    lastSocket().message(new Blob([new Uint8Array([4, 5, 6])]));
    await vi.waitFor(() => expect(onBinary).toHaveBeenCalledWith(new Uint8Array([4, 5, 6])));
    expect(received).toHaveLength(0);
  });
});

// ── CAP / SASL selection ───────────────────────────────────────────────────────

describe('WebSocket subprotocols', () => {
  it('offers onyx.irc-media.v1 then text.ircv3.net', () => {
    const c = makeClient();
    c.connect();
    expect(lastSocket().protocols).toEqual(['onyx.irc-media.v1', 'text.ircv3.net']);
  });
});

describe('CAP negotiation', () => {
  it('waits for the final multiline CAP LS before requesting accumulated caps', () => {
    // Arrange
    const c = makeClient();
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.sent.length = 0;

    // Act: first CAP LS segment is explicitly continued with "*".
    ws.message(':s CAP * LS * :sasl=PLAIN draft/multiline=max-bytes=1024,max-lines=8');

    // Assert: no request is sent until the terminating LS segment arrives.
    expect(ws.sent).toEqual([]);
    expect(c.capValues.get('draft/multiline')).toBe('max-bytes=1024,max-lines=8');

    // Act
    ws.message(':s CAP * LS :message-tags server-time');

    // Assert
    const req = ws.sent.find((l) => l.startsWith('CAP REQ '));
    expect(req).toBeDefined();
    expect(req).toContain('sasl');
    expect(req).toContain('draft/multiline');
    expect(req).toContain('message-tags');
    expect(req).toContain('server-time');
  });

  it('requests sasl then begins SCRAM when the server offers it', () => {
    const c = makeClient();
    c.connect();
    lastSocket().open();
    lastSocket().message(':s CAP * LS :sasl=SCRAM-SHA-256,PLAIN message-tags');
    expect(lastSocket().sent.some((l) => /^CAP REQ .*sasl/.test(l))).toBe(true);
    lastSocket().message(':s CAP * ACK :sasl');
    expect(lastSocket().sent).toContain('AUTHENTICATE SCRAM-SHA-256\r\n');
  });

  it('does not request sasl when no credentials are configured', () => {
    const c = makeClient({ password: undefined });
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.message(':s CAP * LS :sasl=PLAIN message-tags');
    // We may request other caps (message-tags) but never sasl / AUTHENTICATE.
    expect(ws.sent.some((l) => l.includes('AUTHENTICATE'))).toBe(false);
    expect(ws.sent.some((l) => /^CAP REQ .*sasl/.test(l))).toBe(false);
    // Once the requested caps are ACKed, negotiation ends cleanly.
    ws.message(':s CAP * ACK :message-tags');
    expect(ws.sent).toContain('CAP END\r\n');
  });
});

// ── SCRAM mutual authentication (M2) ───────────────────────────────────────────

describe('SCRAM-SHA-256 mutual auth', () => {
  const PASSWORD = 'hunter2';
  const SALT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const ITER = 4096;

  /**
   * Drive the client to the point where it has sent client-first, leaving the
   * client-first AUTHENTICATE payload as the sole entry in ws.sent.
   */
  function toClientFirst(c: IRCClient): FakeWebSocket {
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.message(':s CAP * LS :sasl=SCRAM-SHA-256');
    ws.message(':s CAP * ACK :sasl');
    ws.sent.length = 0;
    ws.message('AUTHENTICATE +'); // client sends client-first synchronously
    return ws;
  }

  const clientFirstPayload = (ws: FakeWebSocket): string =>
    ws.sent[0]!.replace(/^AUTHENTICATE /, '').trim();

  /** Given the client-first AUTHENTICATE payload, build the server-first message. */
  function serverFirstFor(clientFirstB64: string): { serverFirst: string; clientFirstBare: string } {
    const decoded = atob(clientFirstB64); // "n,,n=kain,r=<nonce>"
    const clientFirstBare = decoded.replace(/^n,,/, '');
    const clientNonce = clientFirstBare.split('r=')[1]!;
    const serverNonce = clientNonce + 'SRVNONCE';
    const serverFirst = `r=${serverNonce},s=${b64(SALT)},i=${ITER}`;
    return { serverFirst, clientFirstBare };
  }

  it('completes with AUTHENTICATE + when the server signature verifies', async () => {
    const c = makeClient();
    const ws = toClientFirst(c);

    const { serverFirst, clientFirstBare } = serverFirstFor(clientFirstPayload(ws));

    ws.sent.length = 0;
    ws.message(`AUTHENTICATE ${btoa(serverFirst)}`);
    await waitUntil(() => ws.sent.length > 0); // client-final proof

    const serverNonce = serverFirst.split('r=')[1]!.split(',')[0]!;
    const clientFinalBare = `c=biws,r=${serverNonce}`;
    const authMessage = `${clientFirstBare},${serverFirst},${clientFinalBare}`;
    const sig = await serverSignature(PASSWORD, SALT, ITER, authMessage);

    ws.sent.length = 0;
    ws.message(`AUTHENTICATE ${btoa(`v=${sig}`)}`);
    await waitUntil(() => ws.sent.includes('AUTHENTICATE +\r\n'));
    expect(errors).toHaveLength(0);
    expect(ws.closeCode).toBeNull();
  });

  it('refuses the connection on a forged server signature (no AUTHENTICATE +)', async () => {
    const c = makeClient();
    const ws = toClientFirst(c);

    const { serverFirst } = serverFirstFor(clientFirstPayload(ws));

    ws.sent.length = 0;
    ws.message(`AUTHENTICATE ${btoa(serverFirst)}`);
    await waitUntil(() => ws.sent.length > 0); // client-final proof sent

    ws.sent.length = 0;
    // A signature the client did NOT compute — an impostor server.
    const forged = b64(new Uint8Array(32).fill(0x42));
    ws.message(`AUTHENTICATE ${btoa(`v=${forged}`)}`);

    await waitUntil(() => ws.closeCode !== null);
    expect(ws.closeCode).toBe(4003);
    expect(ws.sent).not.toContain('AUTHENTICATE +\r\n');
    expect(errors.some((e) => /signature mismatch/i.test(e))).toBe(true);
  });

  it('aborts when the server-final carries an e= error', async () => {
    const c = makeClient();
    const ws = toClientFirst(c);
    const { serverFirst } = serverFirstFor(clientFirstPayload(ws));
    ws.sent.length = 0;
    ws.message(`AUTHENTICATE ${btoa(serverFirst)}`);
    await waitUntil(() => ws.sent.length > 0);

    ws.sent.length = 0;
    ws.message(`AUTHENTICATE ${btoa('e=invalid-proof')}`);
    await waitUntil(() => ws.closeCode !== null);
    expect(ws.closeCode).toBe(4003);
    expect(ws.sent).not.toContain('AUTHENTICATE +\r\n');
  });
});

// ── passwordless account re-entry ─────────────────────────────────────────────

describe('SASL SESSION-TOKEN', () => {
  const token = 'sst_0123456789abcdef0123456789abcdef';

  it('authenticates with the account-bound token before replaying a password', () => {
    const c = makeClient({
      nick: 'display-nick',
      account: 'alice',
      saslSessionToken: token,
    });
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.sent.length = 0;

    ws.message(':s CAP * LS :sasl=SESSION-TOKEN,PLAIN');
    ws.message(':s CAP * ACK :sasl');
    expect(ws.sent).toContain('AUTHENTICATE SESSION-TOKEN\r\n');

    ws.message('AUTHENTICATE +');
    expect(ws.sent).toContain(`AUTHENTICATE ${btoa(`alice\0${token}`)}\r\n`);
    ws.message(':s 903 display-nick :SASL authentication successful');
    expect(c.loggedIn).toBe(true);
    expect(c.currentNick).toBe('display-nick');
  });

  it('clears a rejected token and retries with the password mechanism', () => {
    const rejected = vi.fn();
    const c = makeClient({
      saslSessionToken: token,
      onSaslSessionTokenRejected: rejected,
    });
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.sent.length = 0;

    ws.message(':s CAP * LS :sasl=SESSION-TOKEN,PLAIN');
    ws.message(':s CAP * ACK :sasl');
    ws.message('AUTHENTICATE +');
    ws.sent.length = 0;
    ws.message(':s 904 kain :SASL authentication failed');

    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected).toHaveBeenCalledWith(true);
    expect(ws.sent).toContain('AUTHENTICATE PLAIN\r\n');
    ws.message('AUTHENTICATE +');
    expect(ws.sent).toContain(`AUTHENTICATE ${btoa('\0kain\0hunter2')}\r\n`);
  });

  it('fails closed when a rejected token has no password fallback', () => {
    const rejected = vi.fn();
    const c = makeClient({
      password: undefined,
      saslSessionToken: token,
      onSaslSessionTokenRejected: rejected,
    });
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.message(':s CAP * LS :sasl=SESSION-TOKEN,PLAIN');
    ws.message(':s CAP * ACK :sasl');
    ws.message('AUTHENTICATE +');
    ws.sent.length = 0;
    ws.message(':s 904 kain :SASL authentication failed');

    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected).toHaveBeenCalledWith(false);
    expect(ws.closeCode).toBe(4003);
    expect(ws.sent).not.toContain('CAP END\r\n');
    expect(errors.some((error) => /enter the account password/i.test(error))).toBe(true);
  });
});

// ── session resume (prefers the mesh token) ────────────────────────────────────

describe('session resume', () => {
  it('requests a fresh token only after SASL success and 001, then forwards NOTE TOKEN', () => {
    // Arrange
    const c = makeClient();
    c.connect();
    const ws = lastSocket();
    ws.open();

    // Act: SASL success happens before registration.
    ws.message(':s CAP * LS :sasl=PLAIN');
    ws.message(':s CAP * ACK :sasl');
    ws.message(':s 903 kain :SASL authentication successful');
    expect(c.loggedIn).toBe(true);

    // Assert: SESSION commands are post-registration only.
    expect(ws.sent.some((line) => line.startsWith('SESSION '))).toBe(false);

    // Act
    ws.sent.length = 0;
    ws.message(':s 001 kain :Welcome');
    ws.message(':eshmaki.me NOTE SESSION TOKEN :tok-abc123');

    // Assert
    expect(ws.sent).toContain('SESSION TOKEN\r\n');
    expect(ws.sent).not.toContain('SESSION RESUME tok-abc123\r\n');
    expect(received.some((m) =>
      m.command === 'NOTE' &&
      m.params[0] === 'SESSION' &&
      m.params[1] === 'TOKEN' &&
      m.params[2] === 'tok-abc123'
    )).toBe(true);
  });

  it('resumes with a token persisted from a prior NOTE TOKEN on the next client', () => {
    // Arrange
    const c = makeClient({ sessionToken: 'tok-abc123' });
    c.connect();
    const ws = lastSocket();
    ws.open();

    // Act
    ws.message(':s CAP * LS :sasl=PLAIN');
    ws.message(':s CAP * ACK :sasl');
    ws.message(':s 903 kain :SASL authentication successful');
    ws.sent.length = 0;
    ws.message(':s 001 kain :Welcome');

    // Assert
    expect(ws.sent.indexOf('SESSION RESUME tok-abc123\r\n')).toBeLessThan(
      ws.sent.indexOf('SESSION TOKEN\r\n'),
    );
  });

  it('prefers the mesh token over the local token on 001 after login', () => {
    const c = makeClient({ sessionToken: 'LOCAL', meshToken: 'MESH' });
    c.connect();
    const ws = lastSocket();
    ws.open();
    // Simulate a completed SASL so _loggedIn is set (903 during SASL).
    ws.message(':s CAP * LS :sasl=SCRAM-SHA-256');
    ws.message(':s CAP * ACK :sasl');
    ws.message(':s 903 kain :SASL authentication successful');
    ws.sent.length = 0;
    ws.message(':s 001 kain :Welcome');
    expect(ws.sent).toContain('SESSION RESUME MESH\r\n');
    expect(ws.sent).not.toContain('SESSION RESUME LOCAL\r\n');
  });

  it('falls back to the local token when no mesh token is held', () => {
    const c = makeClient({ sessionToken: 'LOCAL' });
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.message(':s CAP * LS :sasl=SCRAM-SHA-256');
    ws.message(':s CAP * ACK :sasl');
    ws.message(':s 903 kain :ok');
    ws.sent.length = 0;
    ws.message(':s 001 kain :Welcome');
    expect(ws.sent).toContain('SESSION RESUME LOCAL\r\n');
  });
});

// ── 903 passthrough post-registration (IRCX reuse) ─────────────────────────────

describe('903 numeric gating', () => {
  it('passes 903 through to the store once registered (not treated as SASL)', () => {
    const c = makeClient({ password: undefined });
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.message(':s 001 kain :Welcome');
    received.length = 0;
    ws.message(':s 903 kain #chan :ERR_BADLEVEL');
    expect(received.some((m) => m.command === '903')).toBe(true);
  });
});

// ── reconnect ownership ──────────────────────────────────────────────────────

describe('reconnect ownership', () => {
  it('does not schedule a replacement socket on close', () => {
    // Arrange
    vi.useFakeTimers();
    const disconnected: string[] = [];
    const c = makeClient({ onDisconnected: (reason) => disconnected.push(reason) });
    c.connect();
    const ws = lastSocket();
    ws.open();

    // Act
    ws.close(1006, 'network gone');
    vi.advanceTimersByTime(60_000);

    // Assert: reconnect is owned by the store, so the client creates no new ws.
    expect(disconnected).toEqual(['network gone']);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('detaches the previous socket before opening a replacement connection', () => {
    // Arrange
    const disconnected: string[] = [];
    const c = makeClient({ onDisconnected: (reason) => disconnected.push(reason) });
    c.connect();
    const first = lastSocket();
    first.open();

    // Act
    c.connect();
    const second = lastSocket();
    second.open();
    expect(first.onclose).toBeNull();
    first.close(1006, 'stale close');
    second.close(1006, 'active close');

    // Assert
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(disconnected).toEqual(['active close']);
  });
});

// ── draft/read-marker (MARKREAD) ───────────────────────────────────────────────

describe('draft/read-marker', () => {
  const VALID_TS = '2026-07-12T09:30:15.500Z';

  /** Bring a client up with draft/read-marker negotiated (ACKed). */
  function negotiateReadMarker() {
    const c = makeClient({ password: undefined });
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.message(':s CAP * LS :draft/read-marker message-tags');
    ws.message(':s CAP * ACK :draft/read-marker message-tags');
    ws.sent.length = 0; // drop negotiation noise
    return { c, ws };
  }

  it('requests draft/read-marker when the server advertises it', () => {
    const c = makeClient({ password: undefined });
    c.connect();
    const ws = lastSocket();
    ws.open();
    ws.message(':s CAP * LS :draft/read-marker message-tags');
    const req = ws.sent.find((l) => l.startsWith('CAP REQ '));
    expect(req).toContain('draft/read-marker');
  });

  it('parses an inbound MARKREAD with a timestamp', () => {
    const markers: Array<[string, string | null]> = [];
    const c = makeClient({ password: undefined, onReadMarker: (t, ts) => markers.push([t, ts]) });
    c.connect();
    lastSocket().open();
    lastSocket().message(`:s MARKREAD #chan timestamp=${VALID_TS}`);
    expect(markers).toEqual([['#chan', VALID_TS]]);
  });

  it('reports no marker for MARKREAD <target> * or a malformed timestamp', () => {
    const markers: Array<[string, string | null]> = [];
    const c = makeClient({ password: undefined, onReadMarker: (t, ts) => markers.push([t, ts]) });
    c.connect();
    lastSocket().open();
    lastSocket().message(':s MARKREAD #chan *');
    lastSocket().message(':s MARKREAD #dm timestamp=not-a-timestamp');
    expect(markers).toEqual([['#chan', null], ['#dm', null]]);
  });

  it('sends MARKREAD only after the cap is negotiated', () => {
    const c = makeClient({ password: undefined });
    c.connect();
    lastSocket().open();
    // Cap not yet ACKed — must fail closed and send nothing.
    expect(c.setReadMarker('#chan', VALID_TS)).toBe(false);
    expect(lastSocket().sent.some((l) => l.startsWith('MARKREAD'))).toBe(false);
  });

  it('sends a well-formed MARKREAD once negotiated', () => {
    const { c, ws } = negotiateReadMarker();
    expect(c.setReadMarker('#chan', VALID_TS)).toBe(true);
    expect(ws.sent).toContain(`MARKREAD #chan timestamp=${VALID_TS}\r\n`);
  });

  it('rejects a malformed timestamp on send (fail closed)', () => {
    const { c, ws } = negotiateReadMarker();
    expect(c.setReadMarker('#chan', '2026-07-12 09:30:15')).toBe(false);
    expect(ws.sent.some((l) => l.startsWith('MARKREAD'))).toBe(false);
  });

  it('rejects an injection-bearing target and sends nothing', () => {
    const { c, ws } = negotiateReadMarker();
    expect(c.setReadMarker('#chan\r\nJOIN #evil', VALID_TS)).toBe(false);
    expect(ws.sent.some((l) => l.includes('JOIN #evil'))).toBe(false);
    expect(ws.sent.some((l) => l.startsWith('MARKREAD'))).toBe(false);
  });

  it('queries the current marker with a bare MARKREAD', () => {
    const { c, ws } = negotiateReadMarker();
    expect(c.queryReadMarker('#chan')).toBe(true);
    expect(ws.sent).toContain('MARKREAD #chan\r\n');
  });
});
