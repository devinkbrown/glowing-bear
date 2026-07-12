// Tests for WeeRelayClient's binary frame accumulation and event routing.
//
// jsdom's WebSocket would try to actually connect, so the global is stubbed
// with a controllable fake. The fake exposes test drivers (open(), message())
// to simulate server behavior; the client under test is the real thing.
//
// Relay frames are built with a small binary writer (mirrors parser.test.ts):
//   frame = u32 total length (BE) | u8 compression=0 | str id | objects...
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeRelayClient } from './client';
import type { BuffersLoadedEvent, NickAddedEvent, NickRemovedEvent } from './client';
import { ConnectionState, type RelaySettings } from './types';

const NULL_STRING = 0xffffffff;
const textEncoder = new TextEncoder();

// ── binary frame helpers ─────────────────────────────────────────────────────

class BinWriter {
	private bytes: number[] = [];

	u8(v: number): this {
		this.bytes.push(v & 0xff);
		return this;
	}

	u32(v: number): this {
		this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
		return this;
	}

	raw(data: Uint8Array): this {
		for (const b of data) this.bytes.push(b);
		return this;
	}

	ascii(s: string): this {
		for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i) & 0xff);
		return this;
	}

	typ(t: string): this {
		return this.ascii(t);
	}

	str(s: string | null): this {
		if (s === null) return this.u32(NULL_STRING);
		const bytes = textEncoder.encode(s);
		this.u32(bytes.length);
		return this.raw(bytes);
	}

	/** u8 length-prefixed ASCII (ptr payloads). */
	short(s: string): this {
		this.u8(s.length);
		return this.ascii(s);
	}

	build(): Uint8Array {
		return Uint8Array.from(this.bytes);
	}
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

/** _version info reply — completes authentication. */
function versionFrame(version = '4.2.1'): ArrayBuffer {
	return frame('_version', new BinWriter().typ('inf').str('version').str(version));
}

/** _pong reply carrying a str argument. */
function pongFrame(arg: string): ArrayBuffer {
	return frame('_pong', new BinWriter().typ('str').str(arg));
}

/** _buffers hda reply with two buffers (core.weechat + irc.libera.#weechat). */
function buffersFrame(): ArrayBuffer {
	const body = new BinWriter()
		.typ('hda')
		.str('buffer')
		.str('number:int,full_name:str,short_name:str,title:str,local_variables:htb')
		.u32(2)
		// item 1
		.short('aa11')
		.u32(1)
		.str('core.weechat')
		.str('weechat')
		.str('WeeChat 4.2.1')
		.typ('str').typ('str').u32(1).str('plugin').str('core')
		// item 2
		.short('bb22')
		.u32(2)
		.str('irc.libera.#weechat')
		.str('#weechat')
		.str('Welcome to #weechat')
		.typ('str').typ('str').u32(1).str('channel').str('#weechat');
	return frame('_buffers', body);
}

// Field spec for a `_nicklist_diff` hda item. `_diff`, `group` and `visible`
// are all WeeChat `chr` fields — the relay serializes each as a single Int8
// *char code* (parser.ts readInt8), NOT an ASCII string. `_diff` in particular
// carries '+'/'-'/'*' as codes 43/45/42, which is exactly the byte the client
// must normalize before comparing.
const NICKLIST_DIFF_KEYS =
	'_diff:chr,group:chr,visible:chr,level:int,name:str,color:str,prefix:str,prefix_color:str';

interface NickDiffEntry {
	bufPtr: string; // pointer hex WITHOUT the 0x prefix, e.g. 'bb22'
	nickPtr: string;
	diff: '+' | '-' | '*';
	name: string;
	prefix?: string;
}

/**
 * `_nicklist_diff` hda reply. hpath is `buffer/nicklist_item`, so each item
 * carries two pointers ([buffer, nick]); routeNicklistDiff keys on pointers[0]
 * and itemToNick ids the nick off the last pointer. The leading `_diff` chr is
 * emitted as a raw byte (u8) so the decode path sees the real Int8 char code.
 */
function nicklistDiffFrame(entries: NickDiffEntry[]): ArrayBuffer {
	const body = new BinWriter()
		.typ('hda')
		.str('buffer/nicklist_item')
		.str(NICKLIST_DIFF_KEYS)
		.u32(entries.length);
	for (const e of entries) {
		body
			.short(e.bufPtr)
			.short(e.nickPtr)
			.u8(e.diff.charCodeAt(0)) // _diff chr — the byte under test
			.u8(0) // group chr (0 = a real nick, not a group)
			.u8(1) // visible chr
			.u32(0) // level int
			.str(e.name)
			.str('') // color
			.str(e.prefix ?? '') // prefix
			.str(''); // prefix_color
	}
	return frame('_nicklist_diff', body);
}

function concatBuffers(...parts: ArrayBuffer[]): ArrayBuffer {
	const total = parts.reduce((n, p) => n + p.byteLength, 0);
	const out = new Uint8Array(total);
	let pos = 0;
	for (const p of parts) {
		out.set(new Uint8Array(p), pos);
		pos += p.byteLength;
	}
	return out.buffer as ArrayBuffer;
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

	send(data: string): void {
		this.sent.push(data);
	}

	close(code = 1000, reason = ''): void {
		this.readyState = FakeWebSocket.CLOSED;
		this.onclose?.({ code, reason, wasClean: true } as CloseEvent);
	}

	// test drivers
	open(): void {
		this.readyState = FakeWebSocket.OPEN;
		this.onopen?.(new Event('open'));
	}

	message(data: unknown): void {
		this.onmessage?.({ data } as MessageEvent);
	}
}

// ── test harness ─────────────────────────────────────────────────────────────

const SETTINGS: RelaySettings = {
	host: 'relay.test',
	port: 9001,
	tls: false,
	password: 'hunter2',
	compression: false,
};

/** Frame parsing is async (microtask hop through parser.parse); flush it. */
function flushAsync(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function onceEvent<T>(target: EventTarget, name: string): Promise<T> {
	return new Promise((resolve) => {
		target.addEventListener(name, (ev) => resolve((ev as CustomEvent<T>).detail), { once: true });
	});
}

function collectEvents<T>(target: EventTarget, name: string): T[] {
	const out: T[] = [];
	target.addEventListener(name, (ev) => out.push((ev as CustomEvent<T>).detail));
	return out;
}

let client: WeeRelayClient;

/** connect() the client and drive the fake socket open; returns the socket. */
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
});

// ── connection & authentication ──────────────────────────────────────────────

describe('WeeRelayClient connection and authentication', () => {
	it('opens a ws:// socket and sends handshake first (no plaintext password)', () => {
		client.connect();
		const ws = FakeWebSocket.instances[0]!;
		expect(client.state).toBe(ConnectionState.CONNECTING);
		expect(ws.url).toBe('ws://relay.test:9001/weechat');
		expect(ws.binaryType).toBe('arraybuffer');

		ws.open();

		expect(client.state).toBe(ConnectionState.AUTHENTICATING);
		// New auth flow is handshake-first: the plaintext password must NOT appear
		// until/unless we fall back to legacy init (covered in client.handshake.test.ts).
		expect(ws.sent[0]).toBe(
			'(_handshake) handshake password_hash_algo=pbkdf2+sha512:pbkdf2+sha256:sha512:sha256,compression=off\n',
		);
		expect(ws.sent.join('')).not.toContain('password=hunter2');
	});

	it('fires authenticated with the server version from the _version reply', async () => {
		const ws = connectOpen();
		const authenticated = onceEvent<{ version: string }>(client, 'authenticated');

		ws.message(versionFrame('4.2.1'));

		expect((await authenticated).version).toBe('4.2.1');
		expect(client.state).toBe(ConnectionState.CONNECTED);
	});

	it('bootstraps buffers, hotlist, history and sync after authentication', async () => {
		const ws = connectOpen();

		ws.message(versionFrame());
		await flushAsync();

		const sent = ws.sent.join('');
		expect(sent).toContain('(_buffers) hdata buffer:gui_buffers(*)');
		expect(sent).toContain('(_hotlist) hdata hotlist:gui_hotlist(*)');
		expect(sent).toContain('(_history) hdata buffer:gui_buffers(*)/own_lines/last_line(-50)/data');
		expect(sent).toContain('sync *\n');
	});
});

// ── frame accumulation ───────────────────────────────────────────────────────

describe('WeeRelayClient frame accumulation', () => {
	it('parses two complete frames arriving in a single WebSocket message', async () => {
		const ws = connectOpen();
		const pongs = collectEvents<{ arg: string }>(client, 'pong');

		ws.message(concatBuffers(pongFrame('first'), pongFrame('second')));
		await flushAsync();

		expect(pongs.map((p) => p.arg)).toEqual(['first', 'second']);
	});

	it('routes frames with different ids from the same message', async () => {
		const ws = connectOpen();
		const pongs = collectEvents<{ arg: string }>(client, 'pong');
		const loaded = collectEvents<BuffersLoadedEvent>(client, 'buffersLoaded');

		ws.message(concatBuffers(pongFrame('x'), buffersFrame()));
		await flushAsync();

		expect(pongs).toHaveLength(1);
		expect(loaded).toHaveLength(1);
	});

	it('reassembles one frame split across three WebSocket messages', async () => {
		const ws = connectOpen();
		const loaded = collectEvents<BuffersLoadedEvent>(client, 'buffersLoaded');

		const whole = buffersFrame();
		// Split mid-header and mid-body to exercise both boundaries
		const cut1 = 3;
		const cut2 = Math.floor(whole.byteLength / 2);

		ws.message(whole.slice(0, cut1));
		await flushAsync();
		expect(loaded).toHaveLength(0); // not even the length field is complete

		ws.message(whole.slice(cut1, cut2));
		await flushAsync();
		expect(loaded).toHaveLength(0); // length known, payload incomplete

		ws.message(whole.slice(cut2));
		await flushAsync();

		expect(loaded).toHaveLength(1);
		const buffers = loaded[0]!.buffers;
		expect(buffers).toHaveLength(2);
		expect(buffers[0]).toMatchObject({
			id: '0xaa11',
			number: 1,
			fullName: 'core.weechat',
			shortName: 'weechat',
			title: 'WeeChat 4.2.1',
			localVars: { plugin: 'core' },
		});
		expect(buffers[1]).toMatchObject({
			id: '0xbb22',
			number: 2,
			fullName: 'irc.libera.#weechat',
			localVars: { channel: '#weechat' },
		});
		// Local cache is also populated, keyed by pointer
		expect(client.buffers.get('0xbb22')?.shortName).toBe('#weechat');
	});

	it('ignores non-binary WebSocket messages', async () => {
		const ws = connectOpen();
		const errors = collectEvents<{ message: string }>(client, 'error');

		ws.message('not a frame');
		await flushAsync();

		expect(errors).toHaveLength(0);
	});
});

// ── nicklist diff (chr _diff decode) ─────────────────────────────────────────

describe('WeeRelayClient nicklist diff decoding', () => {
	it('applies a removal (_diff="-", char code 45) to a nick that was added', async () => {
		const ws = connectOpen();
		const removed = collectEvents<NickRemovedEvent>(client, 'nickRemoved');

		// First add the nick so there is something to remove.
		ws.message(
			nicklistDiffFrame([{ bufPtr: 'bb22', nickPtr: 'cc33', diff: '+', name: 'alice' }]),
		);
		await flushAsync();
		expect(client.nicks.get('0xbb22')?.map((n) => n.name)).toEqual(['alice']);

		// Now remove it — the relay sends `_diff` as the raw byte 45, not '-'.
		ws.message(
			nicklistDiffFrame([{ bufPtr: 'bb22', nickPtr: 'cc33', diff: '-', name: 'alice' }]),
		);
		await flushAsync();

		expect(removed).toHaveLength(1);
		expect(removed[0]!.nickId).toBe('0xcc33');
		// The nick is actually gone from the cache (the shipped bug left it behind).
		expect(client.nicks.get('0xbb22')?.some((n) => n.name === 'alice')).toBe(false);
	});

	it('applies an add (_diff="+", char code 43) to the nick cache', async () => {
		const ws = connectOpen();
		const added = collectEvents<NickAddedEvent>(client, 'nickAdded');

		ws.message(
			nicklistDiffFrame([{ bufPtr: 'bb22', nickPtr: 'cc33', diff: '+', name: 'bob' }]),
		);
		await flushAsync();

		expect(added).toHaveLength(1);
		expect(added[0]!.nick.name).toBe('bob');
		expect(client.nicks.get('0xbb22')?.map((n) => n.name)).toEqual(['bob']);
	});

	it('applies an in-place update (_diff="*", char code 42) without duplicating', async () => {
		const ws = connectOpen();

		ws.message(
			nicklistDiffFrame([
				{ bufPtr: 'bb22', nickPtr: 'cc33', diff: '+', name: 'carol', prefix: ' ' },
			]),
		);
		await flushAsync();
		expect(client.nicks.get('0xbb22')).toHaveLength(1);

		// A '*' change re-sends the nick with a new prefix (e.g. it gained op).
		ws.message(
			nicklistDiffFrame([
				{ bufPtr: 'bb22', nickPtr: 'cc33', diff: '*', name: 'carol', prefix: '@' },
			]),
		);
		await flushAsync();

		const list = client.nicks.get('0xbb22');
		expect(list).toHaveLength(1); // updated in place, not appended
		expect(list?.[0]!.prefix).toBe('@');
	});
});

// ── malformed frame guards ───────────────────────────────────────────────────

describe('WeeRelayClient malformed frame guards', () => {
	it('drops the buffer and emits an error when the length field is under 5', async () => {
		const ws = connectOpen();
		const errors = collectEvents<{ message: string }>(client, 'error');

		// A relay frame can never be shorter than its own 5-byte header
		ws.message(new BinWriter().u32(4).build().buffer as ArrayBuffer);
		await flushAsync();

		expect(errors).toHaveLength(1);
		expect(errors[0]!.message).toMatch(/malformed relay frame \(length=4\)/);
	});

	it('drops the buffer and emits an error when the length exceeds 64MB', async () => {
		const ws = connectOpen();
		const errors = collectEvents<{ message: string }>(client, 'error');

		ws.message(new BinWriter().u32(67108865).build().buffer as ArrayBuffer);
		await flushAsync();

		expect(errors).toHaveLength(1);
		expect(errors[0]!.message).toMatch(/length=67108865/);
	});

	it('accepts a frame of exactly the 64MB limit header without erroring', async () => {
		const ws = connectOpen();
		const errors = collectEvents<{ message: string }>(client, 'error');

		// Header claims exactly 64MB — valid, so the client just waits for data
		ws.message(new BinWriter().u32(67108864).build().buffer as ArrayBuffer);
		await flushAsync();

		expect(errors).toHaveLength(0);
	});

	it('recovers after a malformed frame: subsequent frames still parse', async () => {
		const ws = connectOpen();
		const pongs = collectEvents<{ arg: string }>(client, 'pong');

		ws.message(new BinWriter().u32(1).build().buffer as ArrayBuffer); // garbage
		await flushAsync();
		ws.message(pongFrame('alive'));
		await flushAsync();

		expect(pongs.map((p) => p.arg)).toEqual(['alive']);
	});

	it('emits a parse error (not a crash) for a frame with a bogus object type', async () => {
		const ws = connectOpen();
		const errors = collectEvents<{ message: string }>(client, 'error');

		ws.message(frame('_junk', new BinWriter().typ('zzz').u32(0)));
		await flushAsync();

		expect(errors).toHaveLength(1);
		expect(errors[0]!.message).toMatch(/Relay parse error/);
	});
});
