// Tests for the WeeChat relay binary protocol decoder (WeeRelayParser).
//
// Frames are built byte-by-byte with BinWriter so every test states its wire
// layout explicitly:
//   frame  = u32 total-length (BE) | u8 compression | str id | objects...
//   object = 3-char ascii type tag | type-specific payload
//   str    = u32 length + UTF-8 bytes (0xFFFFFFFF length = null)
//   lon/ptr/tim = u8 length + ASCII payload
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { WeeRelayParser } from './parser';
import type { HdataResult, WeeChatMessage } from './types';

const NULL_STRING = 0xffffffff;
const textEncoder = new TextEncoder();

// ── binary construction helpers ─────────────────────────────────────────────

class BinWriter {
	private bytes: number[] = [];

	u8(v: number): this {
		this.bytes.push(v & 0xff);
		return this;
	}

	/** Big-endian unsigned 32-bit. Also correct for signed values (two's complement). */
	u32(v: number): this {
		this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
		return this;
	}

	/** Big-endian signed 32-bit — same bytes as u32 via two's complement. */
	i32(v: number): this {
		return this.u32(v);
	}

	raw(data: Uint8Array | number[]): this {
		for (const b of data) this.bytes.push(b & 0xff);
		return this;
	}

	ascii(s: string): this {
		for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i) & 0xff);
		return this;
	}

	/** 3-char object type tag (chr/int/lon/str/...). */
	typ(t: string): this {
		if (t.length !== 3) throw new Error(`type tag must be 3 chars: ${t}`);
		return this.ascii(t);
	}

	/** u32 length-prefixed UTF-8 string; null encodes as length 0xFFFFFFFF. */
	str(s: string | null): this {
		if (s === null) return this.u32(NULL_STRING);
		const bytes = textEncoder.encode(s);
		this.u32(bytes.length);
		return this.raw(bytes);
	}

	/** u32 length-prefixed raw buffer; null encodes as length 0xFFFFFFFF. */
	buf(b: Uint8Array | null): this {
		if (b === null) return this.u32(NULL_STRING);
		this.u32(b.length);
		return this.raw(b);
	}

	/** u8 length-prefixed ASCII — the wire shape of lon, ptr and tim payloads. */
	short(s: string): this {
		this.u8(s.length);
		return this.ascii(s);
	}

	build(): Uint8Array {
		return Uint8Array.from(this.bytes);
	}
}

/**
 * Assemble a complete uncompressed relay frame around `body` (object bytes):
 * u32 total length, u8 compression=0, length-prefixed id (null = 0xFFFFFFFF).
 */
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

function rawFrame(declaredLength: number, compression: number, idLen: number, body: Uint8Array): ArrayBuffer {
	const w = new BinWriter();
	w.u32(declaredLength).u8(compression).u32(idLen).raw(body);
	return w.build().buffer as ArrayBuffer;
}

const parser = new WeeRelayParser();

async function parseFrame(id: string | null, body: BinWriter): Promise<WeeChatMessage> {
	return parser.parse(frame(id, body));
}

/** Parse a single-object frame and return that object's decoded value. */
async function decodeOne(body: BinWriter): Promise<unknown> {
	const msg = await parseFrame(null, body);
	expect(msg.objects).toHaveLength(1);
	return msg.objects[0]!.value;
}

// ── primitive types ──────────────────────────────────────────────────────────

describe('WeeRelayParser primitives', () => {
	it('decodes chr as a signed 8-bit integer', async () => {
		expect(await decodeOne(new BinWriter().typ('chr').u8(65))).toBe(65);
	});

	it('decodes chr 0xFF as -1 (signed)', async () => {
		expect(await decodeOne(new BinWriter().typ('chr').u8(0xff))).toBe(-1);
	});

	it('decodes int as big-endian signed 32-bit', async () => {
		expect(await decodeOne(new BinWriter().typ('int').i32(2147483647))).toBe(2147483647);
	});

	it('decodes negative int values', async () => {
		expect(await decodeOne(new BinWriter().typ('int').i32(-123456))).toBe(-123456);
	});

	it('decodes lon from its ASCII decimal payload', async () => {
		expect(await decodeOne(new BinWriter().typ('lon').short('1234567890'))).toBe(1234567890);
	});

	it('decodes negative lon values', async () => {
		expect(await decodeOne(new BinWriter().typ('lon').short('-42'))).toBe(-42);
	});

	it('decodes a UTF-8 str including multi-byte characters and emoji', async () => {
		expect(await decodeOne(new BinWriter().typ('str').str('héllo 🐻 çà'))).toBe('héllo 🐻 çà');
	});

	it('decodes an empty str (length 0) as ""', async () => {
		expect(await decodeOne(new BinWriter().typ('str').str(''))).toBe('');
	});

	it('decodes a null str (length 0xFFFFFFFF) as null', async () => {
		expect(await decodeOne(new BinWriter().typ('str').str(null))).toBeNull();
	});

	it('decodes buf content as a Uint8Array copy', async () => {
		const value = await decodeOne(new BinWriter().typ('buf').buf(new Uint8Array([1, 2, 3])));
		expect(value).toBeInstanceOf(Uint8Array);
		expect(Array.from(value as Uint8Array)).toEqual([1, 2, 3]);
	});

	it('decodes an empty buf as a zero-length Uint8Array', async () => {
		const value = await decodeOne(new BinWriter().typ('buf').buf(new Uint8Array(0)));
		expect(value).toBeInstanceOf(Uint8Array);
		expect((value as Uint8Array).length).toBe(0);
	});

	it('decodes a null buf (length 0xFFFFFFFF) as null', async () => {
		expect(await decodeOne(new BinWriter().typ('buf').buf(null))).toBeNull();
	});

	it('renders ptr as 0x-prefixed hex', async () => {
		expect(await decodeOne(new BinWriter().typ('ptr').short('1a2b3c4d5e'))).toBe('0x1a2b3c4d5e');
	});

	it('renders an empty ptr as the null pointer 0x0', async () => {
		expect(await decodeOne(new BinWriter().typ('ptr').short(''))).toBe('0x0');
	});

	it('decodes tim as a Date from the unix-seconds payload', async () => {
		const value = await decodeOne(new BinWriter().typ('tim').short('1321993456'));
		expect(value).toBeInstanceOf(Date);
		expect((value as Date).getTime()).toBe(1321993456 * 1000);
	});
});

// ── hashtable ────────────────────────────────────────────────────────────────

describe('WeeRelayParser htb', () => {
	it('decodes a str→str hashtable into a Map', async () => {
		// htb = key type + value type + u32 count + count × (key, value)
		const body = new BinWriter()
			.typ('htb').typ('str').typ('str').u32(2)
			.str('plugin').str('irc')
			.str('channel').str('#weechat');

		const map = (await decodeOne(body)) as Map<unknown, unknown>;

		expect(map).toBeInstanceOf(Map);
		expect(map.size).toBe(2);
		expect(map.get('plugin')).toBe('irc');
		expect(map.get('channel')).toBe('#weechat');
	});

	it('decodes an int→str hashtable', async () => {
		const body = new BinWriter()
			.typ('htb').typ('int').typ('str').u32(1)
			.i32(7).str('seven');

		const map = (await decodeOne(body)) as Map<unknown, unknown>;

		expect(map.get(7)).toBe('seven');
	});

	it('rejects a hashtable whose count exceeds the collection limit', async () => {
		const body = new BinWriter().typ('htb').typ('str').typ('str').u32(100001);

		await expect(parseFrame(null, body)).rejects.toThrow(/htb count exceeds limit/);
	});
});

// ── info / array ─────────────────────────────────────────────────────────────

describe('WeeRelayParser inf and arr', () => {
	it('decodes inf as a name/value pair', async () => {
		const body = new BinWriter().typ('inf').str('version').str('4.2.1');

		expect(await decodeOne(body)).toEqual({ name: 'version', value: '4.2.1' });
	});

	it('decodes inl as a named infolist with stringified item variables', async () => {
		const body = new BinWriter()
			.typ('inl')
			.str('buffer')
			.u32(2)
			.u32(2)
			.str('name').typ('str').str('core.weechat')
			.str('number').typ('int').i32(1)
			.u32(1)
			.str('short_name').typ('str').str('#weechat');

		expect(await decodeOne(body)).toEqual({
			name: 'buffer',
			items: [
				{ name: 'core.weechat', number: '1' },
				{ short_name: '#weechat' },
			],
		});
	});

	it('decodes an arr of str, preserving null entries', async () => {
		const body = new BinWriter()
			.typ('arr').typ('str').u32(3)
			.str('abc').str(null).str('def');

		expect(await decodeOne(body)).toEqual(['abc', null, 'def']);
	});

	it('decodes an arr of int', async () => {
		const body = new BinWriter().typ('arr').typ('int').u32(3).i32(1).i32(-2).i32(3);

		expect(await decodeOne(body)).toEqual([1, -2, 3]);
	});

	it('decodes an empty arr', async () => {
		expect(await decodeOne(new BinWriter().typ('arr').typ('int').u32(0))).toEqual([]);
	});

	it('rejects an array whose count exceeds the collection limit', async () => {
		const body = new BinWriter().typ('arr').typ('int').u32(100001);

		await expect(parseFrame(null, body)).rejects.toThrow(/arr count exceeds limit/);
	});
});

// ── hdata ────────────────────────────────────────────────────────────────────

describe('WeeRelayParser hda', () => {
	it('decodes a realistic buffer hdata with two items', async () => {
		// Reply shape for: hdata buffer:gui_buffers(*) number,name,local_variables
		// hda = hpath str + "key:type,..." str + u32 count
		//       + count × (one ptr per hpath element, then each keyed value)
		const body = new BinWriter()
			.typ('hda')
			.str('buffer')
			.str('number:int,name:str,local_variables:htb')
			.u32(2)
			// item 1: core.weechat
			.short('111a2b')
			.i32(1)
			.str('core.weechat')
			.typ('str').typ('str').u32(1).str('plugin').str('core')
			// item 2: irc.libera.#weechat
			.short('222f3d')
			.i32(2)
			.str('irc.libera.#weechat')
			.typ('str').typ('str').u32(2)
			.str('plugin').str('irc')
			.str('channel').str('#weechat');

		const hda = (await decodeOne(body)) as HdataResult;

		expect(hda.hpath).toBe('buffer');
		expect(hda.keys).toEqual({ number: 'int', name: 'str', local_variables: 'htb' });
		expect(hda.count).toBe(2);
		expect(hda.items).toHaveLength(2);

		const first = hda.items[0]!;
		expect(first.pointers).toEqual(['0x111a2b']);
		expect(first.objects['number']).toBe(1);
		expect(first.objects['name']).toBe('core.weechat');
		expect((first.objects['local_variables'] as Map<unknown, unknown>).get('plugin')).toBe('core');

		const second = hda.items[1]!;
		expect(second.pointers).toEqual(['0x222f3d']);
		expect(second.objects['number']).toBe(2);
		expect(second.objects['name']).toBe('irc.libera.#weechat');
		const lv = second.objects['local_variables'] as Map<unknown, unknown>;
		expect(lv.get('channel')).toBe('#weechat');
	});

	it('reads one pointer per hpath element for chained paths', async () => {
		// hpath "buffer/lines/line/line_data" → 4 pointers per item
		const body = new BinWriter()
			.typ('hda')
			.str('buffer/lines/line/line_data')
			.str('message:str')
			.u32(1)
			.short('aaa1').short('bbb2').short('ccc3').short('ddd4')
			.str('hello there');

		const hda = (await decodeOne(body)) as HdataResult;

		expect(hda.items[0]!.pointers).toEqual(['0xaaa1', '0xbbb2', '0xccc3', '0xddd4']);
		expect(hda.items[0]!.objects['message']).toBe('hello there');
	});

	it('renders empty item pointers as 0x0', async () => {
		const body = new BinWriter()
			.typ('hda').str('buffer').str('number:int').u32(1)
			.short('') // NULL pointer
			.i32(9);

		const hda = (await decodeOne(body)) as HdataResult;

		expect(hda.items[0]!.pointers).toEqual(['0x0']);
	});

	it('handles an empty keys string as zero keys per item', async () => {
		const body = new BinWriter()
			.typ('hda').str('buffer').str('').u32(1)
			.short('1234');

		const hda = (await decodeOne(body)) as HdataResult;

		expect(hda.keys).toEqual({});
		expect(hda.items[0]!.objects).toEqual({});
	});

	it('rejects an hdata whose count exceeds the collection limit', async () => {
		const body = new BinWriter().typ('hda').str('buffer').str('number:int').u32(200000);

		await expect(parseFrame(null, body)).rejects.toThrow(/hda count exceeds limit/);
	});
});

// ── frame envelope ───────────────────────────────────────────────────────────

describe('WeeRelayParser frame envelope', () => {
	it('parses a full _buffers frame: length, compression, id and objects', async () => {
		const body = new BinWriter()
			.typ('hda').str('buffer').str('number:int,full_name:str').u32(1)
			.short('deadbeef')
			.i32(1)
			.str('core.weechat');
		const bytes = frame('_buffers', body);

		const msg = await parser.parse(bytes);

		expect(msg.length).toBe(bytes.byteLength);
		expect(msg.compression).toBe(0);
		expect(msg.id).toBe('_buffers');
		expect(msg.objects).toHaveLength(1);
		expect(msg.objects[0]!.type).toBe('hda');
		const hda = msg.objects[0]!.value as HdataResult;
		expect(hda.items[0]!.objects['full_name']).toBe('core.weechat');
	});

	it('parses a frame without an id (0xFFFFFFFF marker) as id ""', async () => {
		const msg = await parseFrame(null, new BinWriter().typ('int').i32(5));

		expect(msg.id).toBe('');
	});

	it('parses multiple objects from one frame in order', async () => {
		const body = new BinWriter()
			.typ('int').i32(42)
			.typ('str').str('answer')
			.typ('ptr').short('abc123');

		const msg = await parseFrame('_multi', body);

		expect(msg.objects.map((o) => o.type)).toEqual(['int', 'str', 'ptr']);
		expect(msg.objects.map((o) => o.value)).toEqual([42, 'answer', '0xabc123']);
	});

	it('rejects an unknown object type tag', async () => {
		const body = new BinWriter().typ('zzz').u32(0);

		await expect(parseFrame(null, body)).rejects.toThrow(/Unknown WeeChat type/);
	});

	it('rejects truncated input instead of decoding garbage', async () => {
		// str declares 100 bytes but the frame ends after 3
		const w = new BinWriter().typ('str').u32(100).ascii('abc');
		const bytes = frame(null, w);

		await expect(parser.parse(bytes)).rejects.toThrow();
	});
});

// ── hostile input hardening ─────────────────────────────────────────────────

describe('WeeRelayParser hostile input', () => {
	it('rejects empty input before reading a compression byte', async () => {
		const bytes = new ArrayBuffer(0);

		const act = () => parser.parse(bytes);

		await expect(act()).rejects.toThrow();
	});

	it('rejects a frame truncated before the id length field is complete', async () => {
		const bytes = Uint8Array.from([0, 0, 0, 9, 0, 0]).buffer as ArrayBuffer;

		const act = () => parser.parse(bytes);

		await expect(act()).rejects.toThrow();
	});

	it('rejects an id length that points beyond the available payload', async () => {
		const bytes = rawFrame(13, 0, 64, Uint8Array.from([0x61, 0x62, 0x63, 0x64]));

		const act = () => parser.parse(bytes);

		await expect(act()).rejects.toThrow();
	});

	it('returns an empty object list for an implausibly oversized length prefix without over-reading', async () => {
		const bytes = rawFrame(0xfffffff0, 0, NULL_STRING, new Uint8Array(0));

		const msg = await parser.parse(bytes);

		expect(msg.length).toBe(0xfffffff0);
		expect(msg.compression).toBe(0);
		expect(msg.id).toBe('');
		expect(msg.objects).toEqual([]);
	});

	it('rejects a truncated string payload with an oversized length prefix', async () => {
		const body = new BinWriter().typ('str').u32(0x7fffffff).ascii('x');
		const bytes = frame(null, body);

		const act = () => parser.parse(bytes);

		await expect(act()).rejects.toThrow();
	});

	it('rejects a malformed hdata path whose pointer list is truncated', async () => {
		const body = new BinWriter()
			.typ('hda')
			.str('buffer/lines')
			.str('message:str')
			.u32(1)
			.short('abc123');

		const act = () => parseFrame(null, body);

		await expect(act()).rejects.toThrow();
	});

	it('rejects hdata keys with an unknown value type before decoding item data', async () => {
		const body = new BinWriter()
			.typ('hda')
			.str('buffer')
			.str('message:zzz')
			.u32(1)
			.short('abc123');

		const act = () => parseFrame(null, body);

		await expect(act()).rejects.toThrow(/Unknown WeeChat type: zzz/);
	});

	it('rejects an array that declares an unknown element type', async () => {
		const body = new BinWriter().typ('arr').typ('zzz').u32(1);

		const act = () => parseFrame(null, body);

		await expect(act()).rejects.toThrow(/Unknown WeeChat type: zzz/);
	});

	it('rejects an infolist whose item count exceeds the collection limit', async () => {
		const body = new BinWriter().typ('inl').str('buffer').u32(100001);

		const act = () => parseFrame(null, body);

		await expect(act()).rejects.toThrow(/inl count exceeds limit/);
	});

	it('rejects an infolist item whose variable count exceeds the collection limit', async () => {
		const body = new BinWriter()
			.typ('inl')
			.str('buffer')
			.u32(1)
			.u32(100001);

		const act = () => parseFrame(null, body);

		await expect(act()).rejects.toThrow(/inl-vars count exceeds limit/);
	});
});

// ── compression ──────────────────────────────────────────────────────────────

describe('WeeRelayParser compressed frames', () => {
	// The payload after the 5-byte header (id + objects) is zlib-deflate when
	// compression=1. The parser rebuilds an uncompressed frame internally, so
	// decoded content must be identical to the plain encoding.
	function compressedFrame(id: string, body: BinWriter): ArrayBuffer {
		const inner = new BinWriter();
		const idBytes = textEncoder.encode(id);
		inner.u32(idBytes.length).raw(idBytes).raw(body.build());
		const deflated = deflateSync(inner.build());

		const w = new BinWriter();
		w.u32(4 + 1 + deflated.length).u8(1).raw(new Uint8Array(deflated));
		return w.build().buffer as ArrayBuffer;
	}

	it('decompresses a zlib-deflate frame and decodes its objects', async () => {
		const body = new BinWriter()
			.typ('inf').str('version').str('4.2.1')
			.typ('str').str('compressed payload 🐻');

		const msg = await parser.parse(compressedFrame('_version', body));

		expect(msg.id).toBe('_version');
		expect(msg.objects).toHaveLength(2);
		expect(msg.objects[0]!.value).toEqual({ name: 'version', value: '4.2.1' });
		expect(msg.objects[1]!.value).toBe('compressed payload 🐻');
	});

	it('round-trips a compressed hdata identically to its uncompressed form', async () => {
		const body = () =>
			new BinWriter()
				.typ('hda').str('buffer').str('number:int,name:str').u32(1)
				.short('77aa').i32(3).str('irc.server.eshmaki');

		const plain = await parseFrame('_buffers', body());
		const compressed = await parser.parse(compressedFrame('_buffers', body()));

		expect(compressed.id).toBe(plain.id);
		expect(compressed.objects).toEqual(plain.objects);
	});

	it('rejects a decompressed message that exceeds the 64MB limit', async () => {
		// 64MB + 1 of zeros deflates to a few KB; the limit check runs on the
		// decompressed size before any object parsing.
		const oversized = deflateSync(new Uint8Array(67108865 - 4)); // -4: id field counts too
		const w = new BinWriter();
		w.u32(4 + 1 + oversized.length).u8(1).raw(new Uint8Array(oversized));

		await expect(parser.parse(w.build().buffer as ArrayBuffer)).rejects.toThrow(
			/exceeds 64MB limit/
		);
	});
});
