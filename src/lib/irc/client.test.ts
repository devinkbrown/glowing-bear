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
  binaryType = 'blob';
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closeCode: number | null = null;
  closeReason = '';

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
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

  message(data: string): void {
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
  vi.unstubAllGlobals();
});

// ── framing ───────────────────────────────────────────────────────────────────

describe('frame handling', () => {
  it('handles a CRLF-less frame (Orochi omits the trailing newline)', () => {
    const c = makeClient();
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
});

// ── CAP / SASL selection ───────────────────────────────────────────────────────

describe('CAP negotiation', () => {
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

// ── session resume (prefers the mesh token) ────────────────────────────────────

describe('session resume', () => {
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
