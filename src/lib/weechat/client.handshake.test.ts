// Tests for WeeRelayClient's `handshake` + `password_hash` auth flow and its
// legacy-`init` fallback, driven against a controllable fake WebSocket.
//
// Two relays are simulated:
//   • a modern relay that answers `handshake` with a `_handshake` hashtable
//     → the client must authenticate with `init password_hash=…` and NEVER
//       send the plaintext password;
//   • a pre-2.9 relay that silently ignores `handshake` (no reply)
//     → the client must fall back to legacy `init password=…` after a timeout.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeRelayClient } from './client';
import { ConnectionState, type RelaySettings } from './types';

const NULL_STRING = 0xffffffff;
const textEncoder = new TextEncoder();

class BinWriter {
	private bytes: number[] = [];
	u8(v: number): this { this.bytes.push(v & 0xff); return this; }
	u32(v: number): this {
		this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
		return this;
	}
	raw(data: Uint8Array): this { for (const b of data) this.bytes.push(b); return this; }
	ascii(s: string): this { for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i) & 0xff); return this; }
	typ(t: string): this { return this.ascii(t); }
	str(s: string | null): this {
		if (s === null) return this.u32(NULL_STRING);
		const bytes = textEncoder.encode(s);
		this.u32(bytes.length);
		return this.raw(bytes);
	}
	build(): Uint8Array { return Uint8Array.from(this.bytes); }
}

function frame(id: string | null, body: BinWriter): ArrayBuffer {
	const bodyBytes = body.build();
	const idBytes = id === null ? null : textEncoder.encode(id);
	const total = 4 + 1 + 4 + (idBytes?.length ?? 0) + bodyBytes.length;
	const w = new BinWriter();
	w.u32(total).u8(0);
	if (idBytes === null) w.u32(NULL_STRING);
	else w.u32(idBytes.length).raw(idBytes);
	w.raw(bodyBytes);
	return w.build().buffer as ArrayBuffer;
}

/** Build a `_handshake` hashtable (str→str) reply frame. */
function handshakeFrame(entries: Record<string, string>): ArrayBuffer {
	const keys = Object.entries(entries);
	const body = new BinWriter().typ('htb').typ('str').typ('str').u32(keys.length);
	for (const [k, v] of keys) body.str(k).str(v);
	return frame('_handshake', body);
}

/** `_version` info reply — completes authentication. */
function versionFrame(version = '4.4.0'): ArrayBuffer {
	return frame('_version', new BinWriter().typ('inf').str('version').str(version));
}

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

	onopen: ((ev: Event) => void) | null = null;
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;
	onclose: ((ev: CloseEvent) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		FakeWebSocket.instances.push(this);
	}
	send(data: string): void { this.sent.push(data); }
	close(code = 1000, reason = ''): void {
		this.readyState = FakeWebSocket.CLOSED;
		this.onclose?.({ code, reason, wasClean: true } as CloseEvent);
	}
	open(): void {
		this.readyState = FakeWebSocket.OPEN;
		this.onopen?.(new Event('open'));
	}
	message(data: unknown): void { this.onmessage?.({ data } as MessageEvent); }
	error(): void { this.onerror?.(new Event('error')); }
}

const SETTINGS: RelaySettings = {
	host: 'relay.test',
	port: 9001,
	tls: false,
	password: 'hunter2',
	compression: false,
};

function flushAsync(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Poll until `pred()` holds. PBKDF2 (100k+ iterations) resolves on a Web-Crypto
 * threadpool tick whose wall-clock time varies with CPU load — a fixed count of
 * zero-delay ticks can exhaust before it resolves (flaky under full-suite load).
 * Use a real-time DEADLINE with a small delay so we wait long enough regardless
 * of load, and throw on genuine timeout rather than silently passing through.
 */
async function waitFor(pred: () => boolean, timeoutMs = 5000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (pred()) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	if (!pred()) throw new Error(`waitFor: predicate did not hold within ${timeoutMs}ms`);
}

let client: WeeRelayClient;

function connectOpen(): FakeWebSocket {
	client.connect();
	const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
	ws.open();
	return ws;
}

beforeEach(() => {
	FakeWebSocket.instances = [];
	vi.stubGlobal('WebSocket', FakeWebSocket);
	vi.spyOn(console, 'debug').mockImplementation(() => {});
	client = new WeeRelayClient(SETTINGS);
});

afterEach(() => {
	client.disconnect();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// ── modern relay: handshake → hashed init ────────────────────────────────────

describe('handshake auth against a modern relay', () => {
	it('sends handshake first and never the plaintext password', () => {
		const ws = connectOpen();
		expect(ws.sent[0]).toContain('handshake password_hash_algo=');
		expect(ws.sent.join('')).not.toContain('password=hunter2');
	});

	it('authenticates with init password_hash=… after the _handshake reply', async () => {
		const ws = connectOpen();

		ws.message(
			handshakeFrame({
				password_hash_algo: 'pbkdf2+sha256',
				password_hash_iterations: '100000',
				nonce: '85b1ee00695a5b254e14f4885538df0d',
				totp: 'off',
				compression: 'off',
			}),
		);
		await waitFor(() => ws.sent.some((s) => s.startsWith('init password_hash=')));
		expect(client.diagnostics()).toMatchObject({
			phase: 'authenticating',
			protocolMode: 'password-hash',
			hashAlgorithm: 'pbkdf2+sha256',
			compression: 'off',
			totp: false,
			handshake: 'available',
			canDecodeCompression: expect.any(Boolean),
		});

		const initLine = ws.sent.find((s) => s.startsWith('init password_hash='));
		expect(initLine).toBeDefined();
		expect(initLine).toContain('pbkdf2+sha256:');
		expect(initLine).toContain(':100000:');
		// Plaintext password must never appear on the wire.
		expect(ws.sent.join('')).not.toContain('hunter2');
		expect(ws.sent.join('')).not.toContain('password=');
		// A version request follows the hashed init.
		expect(ws.sent).toContain('(_version) info version\n');
	});

	it('reaches CONNECTED once the _version reply arrives', async () => {
		const ws = connectOpen();
		ws.message(
			handshakeFrame({
				password_hash_algo: 'pbkdf2+sha512',
				password_hash_iterations: '210000',
				nonce: '00112233445566778899aabbccddeeff',
			}),
		);
		await waitFor(() => ws.sent.some((s) => s.startsWith('init password_hash=')));
		ws.message(versionFrame('4.4.0'));
		await flushAsync();
		expect(client.state).toBe(ConnectionState.CONNECTED);
	});
});

// ── legacy relay: no _handshake reply → timeout fallback ─────────────────────

describe('legacy fallback when the relay ignores handshake', () => {
	it('falls back to legacy init password=… after the handshake timeout', () => {
		vi.useFakeTimers();
		const ws = connectOpen();

		// Handshake sent, no reply yet, no init yet.
		expect(ws.sent[0]).toContain('handshake ');
		expect(ws.sent.some((s) => s.startsWith('init'))).toBe(false);

		vi.advanceTimersByTime(3000); // HANDSHAKE_TIMEOUT

		expect(ws.sent).toContain('init password=hunter2,compression=off\n');
		expect(ws.sent).toContain('(_version) info version\n');
		expect(client.diagnostics()).toMatchObject({
			phase: 'authenticating',
			protocolMode: 'legacy-init',
			hashAlgorithm: 'none',
			handshake: 'unavailable',
		});
	});

	it('does not double-authenticate if a late _handshake arrives after fallback', async () => {
		vi.useFakeTimers();
		const ws = connectOpen();
		vi.advanceTimersByTime(3000);
		vi.useRealTimers();

		const initsAfterTimeout = ws.sent.filter((s) => s.startsWith('init')).length;
		expect(initsAfterTimeout).toBe(1);

		// A late reply must be ignored — auth already started.
		ws.message(
			handshakeFrame({ password_hash_algo: 'pbkdf2+sha256', password_hash_iterations: '100000', nonce: 'aa'.repeat(16) }),
		);
		await flushAsync();
		await flushAsync();

		expect(ws.sent.filter((s) => s.startsWith('init')).length).toBe(1);
		expect(ws.sent.filter((s) => s.startsWith('init password_hash=')).length).toBe(0);
	});
});

// ── server disagreement / malformed reply → immediate legacy fallback ────────

describe('legacy fallback on unusable handshake reply', () => {
	it('falls back when the server agreed on no algorithm (empty algo)', async () => {
		const ws = connectOpen();
		ws.message(handshakeFrame({ password_hash_algo: '', nonce: 'aa'.repeat(16) }));
		await flushAsync();
		expect(ws.sent).toContain('init password=hunter2,compression=off\n');
		expect(ws.sent.some((s) => s.startsWith('init password_hash='))).toBe(false);
	});

	it('falls back (does not crash) on a malformed nonce', async () => {
		const ws = connectOpen();
		ws.message(handshakeFrame({ password_hash_algo: 'sha256', nonce: 'nothex' }));
		await flushAsync();
		expect(ws.sent).toContain('init password=hunter2,compression=off\n');
	});
});

// ── close-mid-handshake → skip handshake on the next connect ──────────────────

describe('handshake-unsupported stickiness', () => {
	it('reports a bounded reconnect reason, attempt, and delay without the close text', () => {
		const ws = connectOpen();
		ws.error();
		ws.close(1006, 'private relay detail');

		expect(client.diagnostics()).toMatchObject({
			phase: 'reconnect-wait',
			reconnectReason: 'network',
			reconnectAttempt: 1,
			reconnectDelayMs: 1000,
		});
		expect(JSON.stringify(client.diagnostics())).not.toContain('private relay detail');
	});

	it('still retries handshake after a SINGLE mid-handshake close (no downgrade on a blip)', () => {
		const ws = connectOpen();
		expect(ws.sent[0]).toContain('handshake ');
		ws.error();
		ws.close(1006, '');

		// One strike is a transient blip — the next connect must still try handshake,
		// never silently downgrade a modern relay to plaintext.
		const ws2 = connectOpen();
		expect(ws2.sent[0]).toContain('handshake ');
		expect(ws2.sent.some((s) => s.startsWith('init password='))).toBe(false);
	});

	it('falls back to legacy init only after REPEATED mid-handshake closes', () => {
		const ws1 = connectOpen();
		ws1.error();
		ws1.close(1006, '');
		const ws2 = connectOpen();
		expect(ws2.sent[0]).toContain('handshake '); // still trying after 1 strike
		ws2.error();
		ws2.close(1006, '');

		// Second strike: now conclude the relay cannot speak handshake.
		const ws3 = connectOpen();
		expect(ws3.sent[0]).toBe('init password=hunter2,compression=off\n');
		expect(ws3.sent.some((s) => s.startsWith('handshake'))).toBe(false);
	});

	it('resets strikes only after SUCCESSFUL authentication, not on a mere _handshake reply', async () => {
		// A `_handshake` reply is NOT success — the relay can still reject the init
		// that follows. Only a fully authenticated session clears the strikes.
		const ws1 = connectOpen();
		ws1.error();
		ws1.close(1006, ''); // strike 1

		const ws2 = connectOpen();
		ws2.message(
			handshakeFrame({ password_hash_algo: 'pbkdf2+sha256', password_hash_iterations: '100000', nonce: '85b1ee00695a5b254e14f4885538df0d' }),
		);
		await waitFor(() => ws2.sent.some((s) => s.startsWith('init password_hash=')));
		// Complete authentication — THIS is what clears the strike.
		ws2.message(versionFrame('4.4.0'));
		await flushAsync();
		expect(client.state).toBe(ConnectionState.CONNECTED);

		// A later blip must not immediately downgrade (strikes were cleared, and once
		// authenticated the strike machinery is disabled entirely).
		ws2.close(1006, '');
		const ws3 = connectOpen();
		ws3.error();
		ws3.close(1006, '');
		const ws4 = connectOpen();
		expect(ws4.sent[0]).toContain('handshake ');
	});
});

// ── the infinite reconnect loop: relay replies _handshake then rejects the init ──
//
// The regression: a relay that speaks `handshake` but REJECTS the hashed
// `init password_hash` (closing the socket) never downgraded, because the strike
// counter was gated on the pre-reply window AND reset on every reply. Result:
// handshake → reply → reject → reconnect, forever, never trying legacy `init`.
describe('post-reply auth rejection downgrades and never loops', () => {
	function replyThenReject(ws: FakeWebSocket): Promise<void> {
		ws.message(
			handshakeFrame({
				password_hash_algo: 'pbkdf2+sha256',
				password_hash_iterations: '100000',
				nonce: '85b1ee00695a5b254e14f4885538df0d',
			}),
		);
		return waitFor(() => ws.sent.some((s) => s.startsWith('init password_hash='))).then(() => {
			// Relay rejects the hashed init by closing the socket pre-auth.
			ws.error();
			ws.close(1006, '');
		});
	}

	it('downgrades to legacy init after HANDSHAKE_CLOSE_STRIKES post-reply rejections', async () => {
		const ws1 = connectOpen();
		await replyThenReject(ws1); // strike 1 (post-reply)

		const ws2 = connectOpen();
		expect(ws2.sent[0]).toContain('handshake '); // still trying after 1 strike
		await replyThenReject(ws2); // strike 2 → handshakeUnsupported

		// Third attempt must go straight to legacy init — the loop is broken.
		const ws3 = connectOpen();
		expect(ws3.sent[0]).toBe('init password=hunter2,compression=off\n');
		expect(ws3.sent.some((s) => s.startsWith('handshake'))).toBe(false);
	});

	it('authenticates via legacy init when the relay accepts it after rejecting the hash', async () => {
		const ws1 = connectOpen();
		await replyThenReject(ws1);
		const ws2 = connectOpen();
		await replyThenReject(ws2); // now downgraded

		const ws3 = connectOpen();
		expect(ws3.sent[0]).toBe('init password=hunter2,compression=off\n');
		// The relay accepts legacy auth → _version → CONNECTED. No loop, no error.
		ws3.message(versionFrame('4.4.0'));
		await flushAsync();
		expect(client.state).toBe(ConnectionState.CONNECTED);
	});

	it('stops the loop with a clear error when legacy init is ALSO rejected', async () => {
		const errors: string[] = [];
		client.addEventListener('error', (e) => errors.push((e as CustomEvent<{ message: string }>).detail.message));

		const ws1 = connectOpen();
		await replyThenReject(ws1);
		const ws2 = connectOpen();
		await replyThenReject(ws2); // downgraded to legacy

		const ws3 = connectOpen();
		expect(ws3.sent[0]).toBe('init password=hunter2,compression=off\n');
		// Legacy init is ALSO rejected → both paths exhausted.
		ws3.error();
		ws3.close(1006, '');
		await flushAsync();

		// Clear, actionable error and a terminal ERROR state — not a silent loop.
		expect(errors.some((m) => /rejected the password/i.test(m))).toBe(true);
		expect(client.state).toBe(ConnectionState.ERROR);
		// No new socket was opened after the terminal failure.
		const socketsAtStop = FakeWebSocket.instances.length;
		await flushAsync();
		expect(FakeWebSocket.instances.length).toBe(socketsAtStop);
	});
});

// ── compression capability: never negotiate zlib to a client that cannot decode ─
//
// This is the mobile "connects then spins then fails" regression: with the user's
// compression setting ON but DecompressionStream ABSENT (older iOS Safari/WebViews),
// the client must negotiate UNCOMPRESSED and complete the connect — not advertise
// zlib, get compressed frames, and throw on the first one after auth.
describe('compression negotiation honours decode capability', () => {
	// Compression ON in settings — the resolved capability, not the setting, must
	// decide what actually goes on the wire.
	const COMPRESSION_ON: RelaySettings = { ...SETTINGS, compression: true };
	let realDecompressionStream: typeof DecompressionStream;

	function withDecompressionStreamAbsent(): void {
		realDecompressionStream = globalThis.DecompressionStream;
		// @ts-expect-error simulate an old browser lacking the decode API.
		delete globalThis.DecompressionStream;
	}

	afterEach(() => {
		if (realDecompressionStream) globalThis.DecompressionStream = realDecompressionStream;
	});

	it('handshake path: advertises compression=off and reaches CONNECTED without failing', async () => {
		withDecompressionStreamAbsent();
		// The client probes the (now absent) capability in its constructor.
		const c = new WeeRelayClient(COMPRESSION_ON);
		try {
			c.connect();
			const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
			ws.open();

			// The handshake command must NOT advertise zlib.
			expect(ws.sent[0]).toContain('handshake ');
			expect(ws.sent[0]).toContain('compression=off');
			expect(ws.sent[0]).not.toContain('zlib');

			// Full connect proceeds: hashed init then version → CONNECTED.
			ws.message(
				handshakeFrame({
					password_hash_algo: 'pbkdf2+sha256',
					password_hash_iterations: '100000',
					nonce: '85b1ee00695a5b254e14f4885538df0d',
					compression: 'off',
				}),
			);
			await waitFor(() => ws.sent.some((s) => s.startsWith('init password_hash=')));
			ws.message(versionFrame('4.4.0'));
			await flushAsync();

			expect(c.state).toBe(ConnectionState.CONNECTED);
		} finally {
			c.disconnect();
		}
	});

	it('legacy path: requests compression=off after the handshake timeout', () => {
		withDecompressionStreamAbsent();
		vi.useFakeTimers();
		const c = new WeeRelayClient(COMPRESSION_ON);
		try {
			c.connect();
			const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
			ws.open();
			vi.advanceTimersByTime(3000); // HANDSHAKE_TIMEOUT → legacy init

			expect(ws.sent).toContain('init password=hunter2,compression=off\n');
			expect(ws.sent.join('')).not.toContain('compression=zlib');
		} finally {
			c.disconnect();
			vi.useRealTimers();
		}
	});

	it('desktop unchanged: with DecompressionStream present, zlib is still advertised', () => {
		// No deletion — the real (present) capability must keep desktop on zlib.
		const c = new WeeRelayClient(COMPRESSION_ON);
		try {
			c.connect();
			const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
			ws.open();
			expect(ws.sent[0]).toContain('compression=zlib:off');
		} finally {
			c.disconnect();
		}
	});
});
