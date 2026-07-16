/**
 * Serialize commands to send to the WeeChat relay.
 *
 * WeeChat relay protocol commands are plain text lines of the form:
 *   (id) command arg1 arg2 ...\n
 *
 * The id is optional; when omitted the server will not correlate the response.
 */

import { canDecodeRelayCompression } from './parser';

/**
 * Strip CR and LF from a relay command token. The relay protocol frames each
 * command on a bare `\n`, so any embedded newline in a token would split one
 * command into several — an injection vector when the token is user content
 * (buffer name or input text). Newlines are never valid inside a token, so we
 * drop them rather than encode them.
 */
function stripNewlines(token: string): string {
	return token.replace(/[\r\n]/g, '');
}

/**
 * Build a raw relay command string.
 * @param id  - correlation id, included as "(id) " prefix when non-empty
 * @param command - relay command verb
 * @param args - additional arguments, joined by spaces
 *
 * Every token is stripped of CR/LF so no argument can smuggle a second relay
 * command past the `\n` framing.
 */
export function cmd(id: string, command: string, ...args: string[]): string {
	const prefix = id ? `(${stripNewlines(id)}) ` : '';
	const parts = [stripNewlines(command), ...args.filter((a) => a !== '').map(stripNewlines)];
	return prefix + parts.join(' ') + '\n';
}

/**
 * Send relay init to authenticate and negotiate compression.
 * Must be the first command sent after the WebSocket opens.
 *
 * This is the LEGACY plaintext-password path: the password crosses the wire in
 * the clear (protected only by TLS). Prefer the `handshake` + `password_hash`
 * flow below; this remains the fallback for relays too old to speak `handshake`.
 */
export function initCmd(
	password: string,
	compression: boolean,
	canDecode: boolean = canDecodeRelayCompression(),
): string {
	// WeeChat relay expects comma-separated options for init. This line is built
	// directly (not via cmd()), so it must strip CR/LF itself: a raw newline in
	// the password would split `init` into a second attacker-chosen relay command
	// past the `\n` framing (the same injection class cmd()/inputCmd guard). A
	// newline is never valid inside a relay password token, so we drop it. Literal
	// commas must then be escaped as "\," per the relay protocol, or the password
	// is truncated and the remainder parsed as a bogus option.
	const escaped = stripNewlines(password).replace(/,/g, '\\,');
	// Only request zlib when the user enabled it AND this browser can DECODE it.
	// Requesting compression we cannot inflate (older iOS Safari/WebViews lacking
	// DecompressionStream) makes the relay send frames the decode path throws on,
	// dropping the connection right after auth. Fail closed to uncompressed.
	const effective = compression && canDecode;
	const opts = [`password=${escaped}`, `compression=${effective ? 'zlib' : 'off'}`].join(',');
	return `init ${opts}\n`;
}

// ---------------------------------------------------------------------------
// handshake / password_hash authentication (WeeChat relay ≥ 2.9)
//
// Instead of shipping the plaintext password (legacy `init password=…`), the
// client negotiates a hash algorithm with the server via `handshake`, then
// derives a salted hash of the password and sends only that hash in
// `init password_hash=…`. The password itself never crosses the wire.
//
// Wire grammar reminder: relay options are separated by `,`; a LIST *inside*
// one option value is separated by `:` (NOT `,`). Getting that separator wrong
// silently breaks negotiation, so it is pinned by tests.
// ---------------------------------------------------------------------------

/** Password-hash algorithms defined by the relay protocol. */
export type PasswordHashAlgo =
	| 'plain'
	| 'sha256'
	| 'sha512'
	| 'pbkdf2+sha256'
	| 'pbkdf2+sha512';

/**
 * Hash algorithms this client can compute, strongest first. The server picks
 * the strongest it also supports from the list we advertise. We never advertise
 * `plain` — if we cannot hash we fall back to the legacy `init` path instead.
 */
export const SUPPORTED_HASH_ALGOS: readonly PasswordHashAlgo[] = [
	'pbkdf2+sha512',
	'pbkdf2+sha256',
	'sha512',
	'sha256',
];

/**
 * Compression modes we can DECODE. The relay parser only handles uncompressed
 * (byte 0) and zlib-deflate (byte 1) frames — it cannot decode zstd — so we
 * MUST NOT advertise zstd here or the server would send frames we cannot read.
 * (zstd support is a follow-up gated on parser zstd decode.)
 */
export const SUPPORTED_COMPRESSION = ['zlib', 'off'] as const;

/**
 * Upper bound on the PBKDF2 iteration count we will honour from a relay. Web
 * Crypto's `deriveBits` runs on the main thread with no cancellation, so a
 * hostile relay advertising e.g. 2_000_000_000 iterations would freeze the tab
 * for minutes. WeeChat's own default is 100_000; this leaves generous headroom
 * for a security-conscious operator while rejecting abuse to the legacy path.
 * (Same fail-closed posture as the relay frame's 5..64MB length cap.)
 */
export const MAX_PBKDF2_ITERATIONS = 1_000_000;

/**
 * Build the `handshake` command. Advertises the hash algorithms we support and
 * the compression modes we can decode.
 *
 * @param compression the user's compression preference.
 * @param canDecode   whether this browser can actually DECODE a zlib frame.
 *   Defaults to the live capability probe; injectable for tests.
 *
 * We advertise `zlib:off` ONLY when the user enabled compression AND the browser
 * can decode it — otherwise `off`. Advertising `zlib` to a relay when we cannot
 * inflate its frames makes it compress to an incapable client, and the first
 * compressed frame after auth throws in the decode path and drops the connection
 * (the mobile "connects then spins then fails" regression). Fail closed to `off`.
 */
export function handshakeCmd(
	compression: boolean,
	canDecode: boolean = canDecodeRelayCompression(),
): string {
	const algos = SUPPORTED_HASH_ALGOS.join(':');
	const effective = compression && canDecode;
	const comp = effective ? SUPPORTED_COMPRESSION.join(':') : 'off';
	const opts = `password_hash_algo=${algos},compression=${comp}`;
	// The command MUST carry the `_handshake` id: WeeChat echoes the request id on
	// the reply, and the client only routes the reply to onHandshakeReply when its
	// id === '_handshake' (ID_HANDSHAKE). Sending an empty id makes the reply come
	// back with no id, so it is never matched — the secure password_hash auth then
	// never runs and the client mis-falls-through (verified against WeeChat 4.9.0:
	// with the id the full password_hash handshake authenticates in ~0.4s).
	return cmd('_handshake', 'handshake', opts);
}

/** Parsed, validated fields from the server's `_handshake` reply. */
export interface HandshakeResult {
	algo: PasswordHashAlgo;
	iterations: number;
	/** Server nonce as raw bytes (decoded from the reply's hex string). */
	serverNonce: Uint8Array;
	compression: string;
	totp: boolean;
}

function hexToBytes(hex: string): Uint8Array {
	// Reject odd-length / non-hex so a malformed nonce fails closed rather than
	// producing a truncated-but-plausible salt.
	if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
		throw new Error(`invalid hex nonce: ${JSON.stringify(hex)}`);
	}
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

function bytesToHex(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += b.toString(16).padStart(2, '0');
	return s;
}

/**
 * Interpret the string→string hashtable carried by the `_handshake` reply.
 * Returns null (rather than throwing) when the server did not agree on a hash
 * algorithm we support, so the caller can fall back to the legacy path.
 */
export function parseHandshakeReply(table: Map<unknown, unknown>): HandshakeResult | null {
	const get = (k: string): string => {
		const v = table.get(k);
		return typeof v === 'string' ? v : '';
	};

	const algoStr = get('password_hash_algo');
	if (!algoStr) return null; // server agreed on nothing → fall back
	if (!(SUPPORTED_HASH_ALGOS as readonly string[]).includes(algoStr)) {
		// Server named an algorithm we did not advertise / cannot compute.
		return null;
	}
	const algo = algoStr as PasswordHashAlgo;

	const nonceHex = get('nonce');
	const serverNonce = hexToBytes(nonceHex); // throws on malformed → caller catches

	// Iterations only meaningful for pbkdf2; default 0 for the sha variants.
	const iterRaw = Number(get('password_hash_iterations'));
	const iterations = Number.isFinite(iterRaw) && iterRaw > 0 ? Math.floor(iterRaw) : 0;
	if (algo.startsWith('pbkdf2')) {
		if (iterations <= 0) {
			// A pbkdf2 algo with no positive iteration count is unusable → fall back.
			return null;
		}
		if (iterations > MAX_PBKDF2_ITERATIONS) {
			// A hostile relay could advertise a huge count to freeze the main
			// thread inside deriveBits (no cancellation). Reject to legacy fallback
			// rather than honour an unbounded amount of work.
			return null;
		}
	}

	return {
		algo,
		iterations,
		serverNonce,
		compression: get('compression') || 'off',
		totp: get('totp') === 'on',
	};
}

async function sha(algo: 'SHA-256' | 'SHA-512', data: Uint8Array): Promise<Uint8Array> {
	const buf = await crypto.subtle.digest(algo, data as unknown as BufferSource);
	return new Uint8Array(buf);
}

async function pbkdf2(
	hash: 'SHA-256' | 'SHA-512',
	password: Uint8Array,
	salt: Uint8Array,
	iterations: number,
	dkBytes: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		'raw',
		password as unknown as BufferSource,
		'PBKDF2',
		false,
		['deriveBits'],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash, salt: salt as unknown as BufferSource, iterations },
		key,
		dkBytes * 8,
	);
	return new Uint8Array(bits);
}

/**
 * Compute the `password_hash=` VALUE for `init`, deterministic given all inputs.
 *
 * salt = serverNonce ++ clientNonce (raw bytes). The value carries the salt as
 * hex so the server — which knows the serverNonce it issued and now learns the
 * clientNonce — can recompute and compare.
 *
 *   sha256/sha512:        <algo>:<saltHex>:<hashHex>        hash = SHA(salt ++ password)
 *   pbkdf2+sha256/512:    <algo>:<saltHex>:<iters>:<hashHex> hash = PBKDF2(password, salt, iters)
 *
 * The optional `totp` code, when the server requires it, is appended to `init`
 * separately by the caller; it is not part of this value.
 */
export async function computePasswordHashValue(
	password: string,
	algo: PasswordHashAlgo,
	iterations: number,
	serverNonce: Uint8Array,
	clientNonce: Uint8Array,
): Promise<string> {
	const pw = new TextEncoder().encode(password);
	const salt = new Uint8Array(serverNonce.length + clientNonce.length);
	salt.set(serverNonce, 0);
	salt.set(clientNonce, serverNonce.length);
	const saltHex = bytesToHex(salt);

	switch (algo) {
		case 'sha256':
		case 'sha512': {
			const h = algo === 'sha256' ? 'SHA-256' : 'SHA-512';
			const input = new Uint8Array(salt.length + pw.length);
			input.set(salt, 0);
			input.set(pw, salt.length);
			const hash = await sha(h, input);
			return `${algo}:${saltHex}:${bytesToHex(hash)}`;
		}
		case 'pbkdf2+sha256':
		case 'pbkdf2+sha512': {
			const h = algo === 'pbkdf2+sha256' ? 'SHA-256' : 'SHA-512';
			const dkBytes = h === 'SHA-256' ? 32 : 64;
			const hash = await pbkdf2(h, pw, salt, iterations, dkBytes);
			return `${algo}:${saltHex}:${iterations}:${bytesToHex(hash)}`;
		}
		default:
			// `plain` is never advertised; refuse to build a plaintext hash value.
			throw new Error(`unsupported password_hash algo: ${algo as string}`);
	}
}

/**
 * Derive the hash and build the full `init password_hash=…` command, generating
 * a fresh random client nonce. Returns the command string ready for `ws.send`.
 * The password never appears in the output — only its salted hash.
 */
export async function initHashCmd(
	password: string,
	handshake: HandshakeResult,
	totp?: string,
): Promise<string> {
	const clientNonce = crypto.getRandomValues(new Uint8Array(16));
	const value = await computePasswordHashValue(
		password,
		handshake.algo,
		handshake.iterations,
		handshake.serverNonce,
		clientNonce,
	);
	// The hash value contains ':' and hex only — no ',' — so it is a single
	// relay option and needs no comma-escaping. A TOTP code, when required, is a
	// separate option.
	const opts = totp ? `password_hash=${value},totp=${stripNewlines(totp)}` : `password_hash=${value}`;
	return `init ${opts}\n`;
}

/**
 * Subscribe to buffer events. When buffers is omitted or empty, subscribes
 * to all buffers with `sync *`. Otherwise syncs each named buffer.
 */
export function syncCmd(buffers?: string[]): string {
	if (!buffers || buffers.length === 0) {
		return cmd('', 'sync', '*');
	}
	return buffers.map((b) => cmd('', 'sync', b)).join('');
}

/**
 * Unsubscribe from buffer events.
 */
export function desyncCmd(buffers?: string[]): string {
	if (!buffers || buffers.length === 0) {
		return cmd('', 'desync', '*');
	}
	return buffers.map((b) => cmd('', 'desync', b)).join('');
}

/**
 * Send text input to a WeeChat buffer (same as typing in WeeChat).
 *
 * Multi-line input is split into one `input` command per line, exactly as if
 * the user had typed each line and pressed Enter. This preserves multi-line
 * messages while ensuring a newline in the composer content can never reach the
 * wire as a raw framing byte — otherwise `foo\ninput <buf> /quit` would send a
 * second, attacker-chosen relay command. Empty lines are skipped so we never
 * emit a bare `input <buffer>` with no text.
 */
export function inputCmd(buffer: string, text: string): string {
	const safeBuffer = stripNewlines(buffer);
	return text
		.split(/\r\n|\r|\n/)
		.filter((line) => line !== '')
		.map((line) => cmd('', 'input', safeBuffer, line))
		.join('');
}

/**
 * Request a WeeChat info value by name.
 * @param id   - correlation id for the response message
 * @param name - info name, e.g. "version"
 */
export function infoCmd(id: string, name: string): string {
	return cmd(id, 'info', name);
}

/**
 * Request hdata (structured data) from WeeChat.
 *
 * @param id      - correlation id
 * @param path    - hdata path, e.g. "buffer:gui_buffers(*)" or
 *                  "buffer:0x1234/lines/line/line_data"
 * @param keys    - list of field names to return, e.g. ["number","name","title"]
 * @param options - optional count (positive = first N, negative = last N)
 */
export function hdataCmd(
	id: string,
	path: string,
	keys: string[],
	options?: { count?: number }
): string {
	const fullPath = path;
	if (options?.count !== undefined) {
		// Append count modifier to path, e.g. "buffer:gui_buffers(*) 0 100"
		// WeeChat hdata count is a separate argument after the path
		return cmd(id, 'hdata', fullPath, String(options.count), keys.join(','));
	}
	return cmd(id, 'hdata', fullPath, keys.join(','));
}

/**
 * Request the nicklist for a buffer.
 * @param id     - correlation id
 * @param buffer - buffer pointer or full name
 */
export function nicklistCmd(id: string, buffer: string): string {
	return cmd(id, 'nicklist', buffer);
}

/**
 * Send a ping with a timestamp argument so we can measure round-trip lag.
 * The response will arrive with id "_pong".
 */
export function pingCmd(arg: string): string {
	return cmd('_pong', 'ping', arg);
}

/**
 * Cleanly terminate the relay session.
 */
export function quitCmd(): string {
	return cmd('', 'quit');
}
