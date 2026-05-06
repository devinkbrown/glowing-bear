import type { HdataItem, HdataResult, WeeChatMessage, WeeChatObject, WeeChatType } from './types';

// Cursor-based reader over a DataView for clean sequential parsing
class Reader {
	private view: DataView;
	private offset: number;

	constructor(buffer: ArrayBuffer, offset = 0) {
		this.view = new DataView(buffer);
		this.offset = offset;
	}

	get pos(): number {
		return this.offset;
	}

	readUint8(): number {
		const v = this.view.getUint8(this.offset);
		this.offset += 1;
		return v;
	}

	readInt8(): number {
		const v = this.view.getInt8(this.offset);
		this.offset += 1;
		return v;
	}

	readUint32(): number {
		const v = this.view.getUint32(this.offset, false);
		this.offset += 4;
		return v;
	}

	readInt32(): number {
		const v = this.view.getInt32(this.offset, false);
		this.offset += 4;
		return v;
	}

	readBytes(n: number): Uint8Array {
		const slice = new Uint8Array(this.view.buffer, this.offset, n);
		this.offset += n;
		// Return a copy so the original buffer can be GC'd if needed
		return slice.slice();
	}

	readAscii(n: number): string {
		const bytes = this.readBytes(n);
		let s = '';
		for (let i = 0; i < bytes.length; i++) {
			s += String.fromCharCode(bytes[i]);
		}
		return s;
	}

	// 4-byte length-prefixed UTF-8 string. 0xFFFFFFFF means null (returns empty string).
	readStr(): string {
		const len = this.readUint32();
		if (len === 0xffffffff) return '';
		if (len === 0) return '';
		const bytes = this.readBytes(len);
		return new TextDecoder().decode(bytes);
	}

	// Like readStr but returns null for 0xFFFFFFFF
	readStrNullable(): string | null {
		const len = this.readUint32();
		if (len === 0xffffffff) return null;
		if (len === 0) return '';
		const bytes = this.readBytes(len);
		return new TextDecoder().decode(bytes);
	}

	// 4-byte length-prefixed raw bytes. 0xFFFFFFFF means null (returns null).
	readBuf(): Uint8Array | null {
		const len = this.readUint32();
		if (len === 0xffffffff) return null;
		if (len === 0) return new Uint8Array(0);
		return this.readBytes(len);
	}

	// 1-byte length prefix + ASCII digits
	readShortStr(): string {
		const len = this.readUint8();
		return this.readAscii(len);
	}

	// 3-char type tag
	readType(): WeeChatType {
		return this.readAscii(3) as WeeChatType;
	}

	remaining(): number {
		return this.view.byteLength - this.offset;
	}
}

// Decompress a zlib-wrapped deflate payload using DecompressionStream
async function decompress(data: Uint8Array): Promise<ArrayBuffer> {
	const stream = new DecompressionStream('deflate');
	const writer = stream.writable.getWriter();
	const reader = stream.readable.getReader();

	const chunks: Uint8Array[] = [];

	const readAll = async (): Promise<void> => {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
	};

	const readPromise = readAll();
	// Copy into a fresh ArrayBuffer to satisfy TypeScript's strict ArrayBufferView constraint
	const copy = new Uint8Array(data.byteLength);
	copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
	await writer.write(copy as unknown as Uint8Array<ArrayBuffer>);
	await writer.close();
	await readPromise;

	const total = chunks.reduce((n, c) => n + c.length, 0);
	const out = new Uint8Array(total);
	let pos = 0;
	for (const chunk of chunks) {
		out.set(chunk, pos);
		pos += chunk.length;
	}
	return out.buffer;
}

export function parseObject(r: Reader): WeeChatObject {
	const type = r.readType();
	const value = parseValue(r, type);
	return { type, value };
}

function parseValue(r: Reader, type: WeeChatType): unknown {
	switch (type) {
		case 'chr':
			return r.readInt8();

		case 'int':
			return r.readInt32();

		case 'lon': {
			// 1-byte length + ASCII decimal digits (may be signed)
			const s = r.readShortStr();
			return parseInt(s, 10);
		}

		case 'str':
			return r.readStrNullable();

		case 'buf':
			return r.readBuf();

		case 'ptr': {
			// 1-byte length + hex digits (no 0x prefix)
			const hex = r.readShortStr();
			return hex === '' ? '0x0' : '0x' + hex;
		}

		case 'tim': {
			// 1-byte length + ASCII decimal unix timestamp
			const s = r.readShortStr();
			return new Date(parseInt(s, 10) * 1000);
		}

		case 'htb': {
			const keyType = r.readType();
			const valType = r.readType();
			const count = r.readUint32();
			const map = new Map<unknown, unknown>();
			for (let i = 0; i < count; i++) {
				const k = parseValue(r, keyType);
				const v = parseValue(r, valType);
				map.set(k, v);
			}
			return map;
		}

		case 'hda':
			return parseHdata(r);

		case 'inf': {
			const name = r.readStr();
			const value = r.readStr();
			return { name, value };
		}

		case 'inl': {
			const name = r.readStr();
			const count = r.readUint32();
			const items: Array<Record<string, string>> = [];
			for (let i = 0; i < count; i++) {
				const obj: Record<string, string> = {};
				// Each infolist item is a set of name+type+value triples
				// The count of variables in each item is preceded by the item count,
				// but WeeChat sends variable count per item as a 4-byte int
				const varCount = r.readUint32();
				for (let j = 0; j < varCount; j++) {
					const varName = r.readStr();
					const varType = r.readType();
					obj[varName] = String(parseValue(r, varType));
				}
				items.push(obj);
			}
			return { name, items };
		}

		case 'arr': {
			const arrType = r.readType();
			const count = r.readUint32();
			const items: unknown[] = [];
			for (let i = 0; i < count; i++) {
				items.push(parseValue(r, arrType));
			}
			return items;
		}

		default:
			throw new Error(`Unknown WeeChat type: ${type as string}`);
	}
}

function parseHdata(r: Reader): HdataResult {
	// hpath string, e.g. "buffer" or "buffer/lines/line/line_data"
	const hpath = r.readStr();
	// keys string, e.g. "number:int,name:str,..."
	const keysStr = r.readStr();
	const count = r.readUint32();

	// Number of pointers per item = number of path elements
	const pathParts = hpath.split('/');
	const pointerCount = pathParts.length;

	// Parse key definitions
	const keys: Record<string, WeeChatType> = {};
	const keyOrder: string[] = [];
	if (keysStr) {
		for (const pair of keysStr.split(',')) {
			const colon = pair.indexOf(':');
			if (colon === -1) continue;
			const kname = pair.slice(0, colon).trim();
			const ktype = pair.slice(colon + 1).trim() as WeeChatType;
			keys[kname] = ktype;
			keyOrder.push(kname);
		}
	}

	const items: HdataItem[] = [];
	for (let i = 0; i < count; i++) {
		const pointers: string[] = [];
		for (let p = 0; p < pointerCount; p++) {
			const hex = r.readShortStr();
			pointers.push(hex === '' ? '0x0' : '0x' + hex);
		}

		const objects: Record<string, unknown> = {};
		for (const kname of keyOrder) {
			objects[kname] = parseValue(r, keys[kname]);
		}

		items.push({ pointers, objects });
	}

	return { hpath, keys, count, items };
}

// Synchronous parse — only valid when compression=0
function parseSync(data: ArrayBuffer): WeeChatMessage {
	const r = new Reader(data);

	const length = r.readUint32();
	const compression = r.readUint8();

	// Read id string (length-prefixed, 0xFFFFFFFF = no id)
	const idLen = r.readUint32();
	let id = '';
	if (idLen !== 0xffffffff && idLen > 0) {
		id = new TextDecoder().decode(r.readBytes(idLen));
	}

	const objects: WeeChatObject[] = [];
	while (r.remaining() > 0) {
		objects.push(parseObject(r));
	}

	return { length, compression, id, objects };
}

export class WeeRelayParser {
	// parse() is async to support decompression
	async parse(data: ArrayBuffer): Promise<WeeChatMessage> {
		// Peek at compression byte (byte 4, after the 4-byte length field)
		const hdr = new DataView(data);
		const compression = hdr.getUint8(4);

		if (compression === 0) {
			return parseSync(data);
		}

		// Compression = 1: everything after the 5-byte header is zlib-deflate
		const payload = new Uint8Array(data, 5);
		const decompressed = await decompress(payload);

		// Rebuild a synthetic "uncompressed" buffer with the original 5-byte header
		// so parseSync can read length + compression=0 + id + objects.
		// We construct a new buffer: 4-byte length (updated) + 1 byte (0) + decompressed
		const total = 5 + decompressed.byteLength;
		const rebuilt = new ArrayBuffer(total);
		const rv = new DataView(rebuilt);
		rv.setUint32(0, total, false);
		rv.setUint8(4, 0); // mark as uncompressed for parseSync
		new Uint8Array(rebuilt, 5).set(new Uint8Array(decompressed));

		return parseSync(rebuilt);
	}
}
