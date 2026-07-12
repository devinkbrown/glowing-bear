// Tests for the WeeChat relay `handshake` + `password_hash` auth builders.
//
// The exact wire format is pinned against the WeeChat relay protocol source
// (relay-auth.c) and the official protocol doc. The known-answer vector below
// was independently recomputed with Python hashlib from the doc's example:
//
//   password     = "test"
//   server nonce = 85b1ee00695a5b254e14f4885538df0d   (16 bytes)
//   client nonce = a4b73207f5aae4                     (7 bytes)
//   salt         = server_nonce ++ client_nonce
//
// Getting any of this wrong locks users out of their relay, so it is tested
// end-to-end, not asserted from memory.
import { describe, it, expect } from 'vitest';
import {
	computePasswordHashValue,
	handshakeCmd,
	initHashCmd,
	MAX_PBKDF2_ITERATIONS,
	parseHandshakeReply,
	SUPPORTED_HASH_ALGOS,
	type HandshakeResult,
} from './serializer';

function hex(s: string): Uint8Array {
	const out = new Uint8Array(s.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
	return out;
}

const SERVER_NONCE_HEX = '85b1ee00695a5b254e14f4885538df0d';
const CLIENT_NONCE_HEX = 'a4b73207f5aae4';
const SALT_HEX = SERVER_NONCE_HEX + CLIENT_NONCE_HEX;

describe('handshakeCmd', () => {
	it('advertises supported algos colon-separated with zlib+off when compression on', () => {
		// CRITICAL: within one option value the list separator is ':' — the ','
		// only separates options. A ',' here would make the relay read
		// "sha256" then a bogus "compression=…" algo and silently fall back.
		expect(handshakeCmd(true)).toBe(
			'handshake password_hash_algo=pbkdf2+sha512:pbkdf2+sha256:sha512:sha256,compression=zlib:off\n',
		);
	});

	it('offers only off compression when compression is disabled', () => {
		expect(handshakeCmd(false)).toBe(
			'handshake password_hash_algo=pbkdf2+sha512:pbkdf2+sha256:sha512:sha256,compression=off\n',
		);
	});

	it('never advertises zstd (the parser cannot decode zstd frames)', () => {
		expect(handshakeCmd(true)).not.toContain('zstd');
	});

	it('never advertises the plain algo (no plaintext when handshake is available)', () => {
		expect(handshakeCmd(true)).not.toContain('plain');
		expect(SUPPORTED_HASH_ALGOS).not.toContain('plain');
	});
});

describe('parseHandshakeReply', () => {
	function reply(entries: Record<string, string>): Map<unknown, unknown> {
		return new Map(Object.entries(entries));
	}

	it('parses a pbkdf2 reply into algo, iterations and decoded server nonce', () => {
		const r = parseHandshakeReply(
			reply({
				password_hash_algo: 'pbkdf2+sha256',
				password_hash_iterations: '100000',
				nonce: SERVER_NONCE_HEX,
				totp: 'off',
				compression: 'zlib',
			}),
		);
		expect(r).not.toBeNull();
		expect(r!.algo).toBe('pbkdf2+sha256');
		expect(r!.iterations).toBe(100000);
		expect(r!.compression).toBe('zlib');
		expect(r!.totp).toBe(false);
		expect([...r!.serverNonce]).toEqual([...hex(SERVER_NONCE_HEX)]);
	});

	it('parses a sha reply with no iterations (iterations default 0)', () => {
		const r = parseHandshakeReply(
			reply({ password_hash_algo: 'sha512', nonce: SERVER_NONCE_HEX, totp: 'on' }),
		);
		expect(r!.algo).toBe('sha512');
		expect(r!.iterations).toBe(0);
		expect(r!.totp).toBe(true);
	});

	it('returns null when the server agreed on no algorithm (empty string)', () => {
		expect(parseHandshakeReply(reply({ password_hash_algo: '', nonce: SERVER_NONCE_HEX }))).toBeNull();
	});

	it('returns null for an algorithm we do not support', () => {
		expect(
			parseHandshakeReply(reply({ password_hash_algo: 'bcrypt', nonce: SERVER_NONCE_HEX })),
		).toBeNull();
	});

	it('returns null for a pbkdf2 reply with no positive iteration count', () => {
		expect(
			parseHandshakeReply(
				reply({ password_hash_algo: 'pbkdf2+sha256', password_hash_iterations: '0', nonce: SERVER_NONCE_HEX }),
			),
		).toBeNull();
	});

	it('rejects an absurd pbkdf2 iteration count (main-thread DoS guard) → fall back', () => {
		// A hostile relay advertising billions of iterations would freeze the tab
		// inside deriveBits; reject to legacy fallback rather than honour it.
		expect(
			parseHandshakeReply(
				reply({
					password_hash_algo: 'pbkdf2+sha256',
					password_hash_iterations: '2000000000',
					nonce: SERVER_NONCE_HEX,
				}),
			),
		).toBeNull();
	});

	it('accepts the maximum honoured iteration count at the boundary', () => {
		const r = parseHandshakeReply(
			reply({
				password_hash_algo: 'pbkdf2+sha256',
				password_hash_iterations: String(MAX_PBKDF2_ITERATIONS),
				nonce: SERVER_NONCE_HEX,
			}),
		);
		expect(r).not.toBeNull();
		expect(r!.iterations).toBe(MAX_PBKDF2_ITERATIONS);
	});

	it('throws (fails closed) on a malformed / non-hex nonce', () => {
		expect(() =>
			parseHandshakeReply(reply({ password_hash_algo: 'sha256', nonce: 'xyz' })),
		).toThrow();
	});
});

describe('computePasswordHashValue — known-answer vectors', () => {
	it('sha256: value = sha256:<salt>:<SHA256(salt||password)>', async () => {
		const value = await computePasswordHashValue(
			'test',
			'sha256',
			0,
			hex(SERVER_NONCE_HEX),
			hex(CLIENT_NONCE_HEX),
		);
		expect(value).toBe(
			`sha256:${SALT_HEX}:2c6ed12eb0109fca3aedc03bf03d9b6e804cd60a23e1731fd17794da423e21db`,
		);
	});

	it('pbkdf2+sha256: value = pbkdf2+sha256:<salt>:<iters>:<PBKDF2(...)>', async () => {
		const value = await computePasswordHashValue(
			'test',
			'pbkdf2+sha256',
			100000,
			hex(SERVER_NONCE_HEX),
			hex(CLIENT_NONCE_HEX),
		);
		expect(value).toBe(
			`pbkdf2+sha256:${SALT_HEX}:100000:ba7facc3edb89cd06ae810e29ced85980ff36de2bb596fcf513aaab626876440`,
		);
	});

	// sha512 vectors independently cross-checked against Node's crypto
	// (createHash('sha512') / pbkdf2Sync(...,'sha512')) — the WeeChat doc ships
	// no sha512 example, so these guard the digest size (dklen=64) and salt order.
	it('sha512: value = sha512:<salt>:<SHA512(salt||password)>', async () => {
		const value = await computePasswordHashValue('test', 'sha512', 0, hex(SERVER_NONCE_HEX), hex(CLIENT_NONCE_HEX));
		expect(value).toBe(
			`sha512:${SALT_HEX}:0a1f0172a542916bd86e0cbceebc1c38ed791f6be246120452825f0d74ef1078c79e9812de8b0ab3dfaf598b6ca14522374ec6a8653a46df3f96a6b54ac1f0f8`,
		);
	});

	it('pbkdf2+sha512: derives a 64-byte key with dklen=64', async () => {
		const value = await computePasswordHashValue(
			'test',
			'pbkdf2+sha512',
			50000,
			hex(SERVER_NONCE_HEX),
			hex(CLIENT_NONCE_HEX),
		);
		expect(value).toBe(
			`pbkdf2+sha512:${SALT_HEX}:50000:cf0f78242a458e20d290483e92e91bbbda4b0c13475daae1e8877fdcde3b4150e52d30de6383dbd560befd064616c2d684ab7f3b27dc139ab0f1ec0acb6a8145`,
		);
	});

	it('lowercase hex only', async () => {
		const value = await computePasswordHashValue('Str0ng!', 'sha256', 0, hex(SERVER_NONCE_HEX), hex(CLIENT_NONCE_HEX));
		expect(value).toBe(value.toLowerCase());
	});
});

describe('initHashCmd', () => {
	const HS: HandshakeResult = {
		algo: 'pbkdf2+sha256',
		iterations: 100000,
		serverNonce: hex(SERVER_NONCE_HEX),
		compression: 'zlib',
		totp: false,
	};

	it('builds init password_hash=… and NEVER leaks the plaintext password', async () => {
		const line = await initHashCmd('hunter2', HS);
		expect(line.startsWith('init password_hash=pbkdf2+sha256:')).toBe(true);
		expect(line.endsWith('\n')).toBe(true);
		expect(line).not.toContain('hunter2');
		expect(line).not.toContain('password=hunter2');
	});

	it('echoes the server-provided iteration count in the hash value', async () => {
		const line = await initHashCmd('hunter2', HS);
		// pbkdf2 format: password_hash=algo:salt:ITERS:hash
		expect(line).toContain(':100000:');
	});

	it('emits a salt strictly longer than the server nonce and prefixed by it', async () => {
		const line = await initHashCmd('hunter2', HS);
		const saltHex = line.split('password_hash=')[1]!.split(':')[1]!;
		// relay_auth_check_salt requires salt longer than the server nonce and
		// beginning with it — i.e. we appended a real client nonce.
		expect(saltHex.length).toBeGreaterThan(SERVER_NONCE_HEX.length);
		expect(saltHex.startsWith(SERVER_NONCE_HEX)).toBe(true);
	});

	it('generates a fresh client nonce each call (salts differ)', async () => {
		const a = await initHashCmd('hunter2', HS);
		const b = await initHashCmd('hunter2', HS);
		expect(a).not.toBe(b);
	});

	it('appends a totp option (comma-separated) when a code is supplied', async () => {
		const line = await initHashCmd('hunter2', HS, '123456');
		expect(line).toContain(',totp=123456\n');
	});
});
