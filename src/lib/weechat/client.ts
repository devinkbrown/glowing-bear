import {
	ConnectionState,
	type HdataResult,
	type RelaySettings,
	type WeeChatBuffer,
	type WeeChatHotlist,
	type WeeChatLine,
	type WeeChatNick,
} from './types';
import { parseIrcv3Tags } from '@/lib/irc-classic/tags';
import { stripColors } from './strip-colors';
import { WeeRelayParser } from './parser';
import {
	hdataCmd,
	infoCmd,
	initCmd,
	inputCmd,
	nicklistCmd,
	pingCmd,
	quitCmd,
	syncCmd,
} from './serializer';

// ---------------------------------------------------------------------------
// Event detail shapes
// ---------------------------------------------------------------------------

export interface BufferOpenedEvent { buffer: WeeChatBuffer }
export interface BufferClosedEvent { id: string }
export interface BufferRenamedEvent { buffer: WeeChatBuffer }
export interface BuffersLoadedEvent { buffers: WeeChatBuffer[] }
export interface LineAddedEvent { line: WeeChatLine }
export interface HistoryLoadedEvent { lines: WeeChatLine[] }
export interface NicklistReceivedEvent { buffer: string; nicks: WeeChatNick[] }
export interface NickAddedEvent { buffer: string; nick: WeeChatNick }
export interface NickRemovedEvent { buffer: string; nickId: string }
export interface HotlistUpdatedEvent { hotlist: WeeChatHotlist[] }
export interface BufferSwitchedEvent { id: string }
export interface AuthenticatedEvent { version: string }
export interface StateChangedEvent { state: ConnectionState }
export interface RelayErrorEvent { message: string }

// stripColors imported from ./strip-colors

// ---------------------------------------------------------------------------
// hdata item → domain object converters
// ---------------------------------------------------------------------------

function itemToBuffer(item: { pointers: string[]; objects: Record<string, unknown> }): WeeChatBuffer {
	const o = item.objects;
	const ptr = item.pointers[0] ?? '0x0';

	const localVars: Record<string, string> = {};
	const lvRaw = o['local_variables'];
	if (lvRaw instanceof Map) {
		for (const [k, v] of lvRaw as Map<unknown, unknown>) {
			localVars[String(k)] = String(v);
		}
	}

	return {
		id: ptr,
		name: String(o['full_name'] ?? o['name'] ?? ''),
		fullName: String(o['full_name'] ?? ''),
		shortName: stripColors(String(o['short_name'] ?? '')),
		title: stripColors(String(o['title'] ?? '')),
		number: Number(o['number'] ?? 0),
		type: Number(o['type'] ?? 0),
		nicksCount: Number(o['nicklist_nicks_count'] ?? o['nickscount'] ?? 0),
		localVars,
		notify: Number(o['notify'] ?? 1),
		hidden: Boolean(o['hidden'] ?? false),
	};
}

function itemToLine(item: { pointers: string[]; objects: Record<string, unknown> }): WeeChatLine {
	const o = item.objects;
	const ptr = item.pointers[item.pointers.length - 1] ?? '0x0';

	// Buffer pointer: may be in objects['buffer'] (pushed as a ptr) or pointers[0]
	const bufPtr = String(o['buffer'] ?? item.pointers[0] ?? '0x0');

	const rawDate = o['date'];
	const date = rawDate instanceof Date ? rawDate : new Date(Number(rawDate ?? 0) * 1000);
	const rawDatePrinted = o['date_printed'];
	const datePrinted = rawDatePrinted instanceof Date ? rawDatePrinted : date;

	const tagsRaw = o['tags_array'];
	const tags: string[] = Array.isArray(tagsRaw)
		? (tagsRaw as unknown[]).map(String)
		: String(tagsRaw ?? '').split(',').filter(Boolean);

	const prefix = String(o['prefix'] ?? '');
	const message = String(o['message'] ?? '');
	const highlight = Boolean(o['highlight'] ?? false);
	const displayed = o['displayed'] !== undefined ? Boolean(o['displayed']) : true;

	// nick from tags (nick_<name>)
	let nick: string | undefined;
	for (const tag of tags) {
		if (tag.startsWith('nick_')) {
			nick = tag.slice(5);
			break;
		}
	}
	if (!nick) {
		const plain = stripColors(prefix).replace(/^[.@+%~&!]/, '').trim();
		if (plain) nick = plain;
	}

	const isAction = tags.includes('irc_action') || message.startsWith('\x01ACTION');
	const isSelf = tags.includes('self_msg');
	const isNotice = tags.includes('irc_notice');
	const isJoin = tags.includes('irc_join');
	const isPart = tags.includes('irc_part');
	const isQuit = tags.includes('irc_quit');
	const isNick = tags.includes('irc_nick');
	const isTopic = tags.includes('irc_topic');
	const isMode = tags.includes('irc_mode');
	const isTagMsg = tags.includes('irc_tagmsg');
	const isWhisper = tags.includes('irc_whisper');

	// Parse IRCv3 message tags
	const ircTags = parseIrcv3Tags(tags);

	const effectiveDate = (() => {
		const st = ircTags.get('time');
		if (st) { const d = new Date(st); if (!isNaN(d.getTime())) return d; }
		return date;
	})();

	const msgid = ircTags.get('msgid');
	const replyTo = ircTags.get('+reply');
	const account = ircTags.get('account');

	return {
		id: ptr,
		buffer: bufPtr,
		date: effectiveDate,
		datePrinted,
		displayed,
		highlight,
		tags,
		prefix,
		message,
		nick,
		isAction,
		isSelf,
		isNotice,
		isJoin,
		isPart,
		isQuit,
		isNick,
		isTopic,
		isMode,
		isTagMsg,
		isWhisper,
		ircTags,
		msgid,
		replyTo,
		account,
	};
}

function itemToNick(item: { pointers: string[]; objects: Record<string, unknown> }): WeeChatNick {
	const o = item.objects;
	const ptr = item.pointers[item.pointers.length - 1] ?? '0x0';
	return {
		id: ptr,
		pointer: ptr,
		level: Number(o['level'] ?? 0),
		name: stripColors(String(o['name'] ?? '')),
		color: String(o['color'] ?? ''),
		prefix: stripColors(String(o['prefix'] ?? ' ')),
		prefixColor: stripColors(String(o['prefix_color'] ?? '')),
		visible: o['visible'] !== undefined ? Number(o['visible']) !== 0 : true,
		group: Number(o['group'] ?? 0) !== 0,
	};
}

function itemToHotlist(item: { pointers: string[]; objects: Record<string, unknown> }): WeeChatHotlist {
	const o = item.objects;
	const countRaw = o['count'];
	let count: [number, number, number, number] = [0, 0, 0, 0];
	if (Array.isArray(countRaw) && countRaw.length >= 4) {
		count = [
			Number(countRaw[0]),
			Number(countRaw[1]),
			Number(countRaw[2]),
			Number(countRaw[3]),
		];
	}
	// buffer field in hotlist hdata is a pointer value
	const bufPtr = String(o['buffer'] ?? item.pointers[0] ?? '0x0');
	return { buffer: bufPtr, count };
}

// ---------------------------------------------------------------------------
// Reconnect backoff
// ---------------------------------------------------------------------------

const RECONNECT_BASE = 1000;
const RECONNECT_MAX = 30_000;

function backoff(attempts: number): number {
	return Math.min(RECONNECT_BASE * Math.pow(2, attempts), RECONNECT_MAX);
}

// ---------------------------------------------------------------------------
// Correlation IDs for requests we initiate
// ---------------------------------------------------------------------------

const ID_VERSION = '_version';
const ID_BUFFERS = '_buffers';
const ID_HOTLIST = '_hotlist';
const ID_HISTORY = '_history';
const ID_NICKLIST = '_nicklist';

// ---------------------------------------------------------------------------
// WeeRelayClient
// ---------------------------------------------------------------------------

export class WeeRelayClient extends EventTarget {
	private ws: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempts = 0;
	private _wsHadError = false;
	// Set to true once we've successfully authenticated. Used to suppress
	// the misleading TLS-cert error on background/network reconnects.
	private _wasAuthenticated = false;

	// Binary accumulation buffers — WeeChat relay frames may span multiple
	// WebSocket messages, and a single WebSocket message may contain more than
	// one relay frame.
	private pendingChunks: Uint8Array[] = [];
	private pendingLength = 0;

	private parser = new WeeRelayParser();
	private cleanDisconnect = false;

	// Track recently dispatched line IDs to catch protocol-level duplicates
	private recentLineIds = new Set<string>();
	private recentLineTimer: ReturnType<typeof setTimeout> | null = null;

	state: ConnectionState = ConnectionState.DISCONNECTED;
	settings: RelaySettings;

	// Local caches (convenience — consumers may prefer their own store)
	buffers: Map<string, WeeChatBuffer> = new Map();
	nicks: Map<string, WeeChatNick[]> = new Map(); // keyed by buffer pointer

	constructor(settings: RelaySettings) {
		super();
		this.settings = { ...settings };
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	connect(): void {
		if (
			this.state === ConnectionState.CONNECTING ||
			this.state === ConnectionState.AUTHENTICATING ||
			this.state === ConnectionState.CONNECTED
		) {
			return;
		}

		this.cleanDisconnect = false;
		this.setState(ConnectionState.CONNECTING);

		const scheme = this.settings.tls ? 'wss' : 'ws';
		const url = `${scheme}://${this.settings.host}:${this.settings.port}/weechat`;

		let ws: WebSocket;
		try {
			ws = new WebSocket(url);
		} catch (err) {
			this.emitError(`WebSocket creation failed: ${String(err)}`);
			this.setState(ConnectionState.ERROR);
			this.scheduleReconnect();
			return;
		}

		ws.binaryType = 'arraybuffer';
		this.ws = ws;

		ws.onopen = () => {
			console.debug('[relay] WebSocket open →', url);
			this.setState(ConnectionState.AUTHENTICATING);
			// Send init then immediately ask for version — version response
			// confirms the password was accepted.
			this.send(initCmd(this.settings.password, this.settings.compression));
			this.send(infoCmd(ID_VERSION, 'version'));
		};

		ws.onmessage = (ev: MessageEvent) => {
			if (!(ev.data instanceof ArrayBuffer)) return;
			this.accumulateFrame(ev.data);
		};

		ws.onerror = (ev) => {
			// Browser WebSocket API doesn't expose error details; onclose fires next.
			// We store a flag so onclose can emit a better message.
			console.debug('[relay] WebSocket error event', ev);
			this._wsHadError = true;
		};

		ws.onclose = (ev: CloseEvent) => {
			console.debug('[relay] WebSocket close', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
			const hadError = this._wsHadError;
			this._wsHadError = false;
			this.ws = null;
			this.resetAccumulator();
			if (this.cleanDisconnect) {
				this.setState(ConnectionState.DISCONNECTED);
				return;
			}
			if (ev.code === 1000 && !hadError) {
				this.setState(ConnectionState.DISCONNECTED);
			} else {
				// Build a helpful error message from the close event.
				// If we've already authenticated once, TLS/network errors are likely
				// background-tab disconnects — don't show the self-signed cert advice.
				let msg: string | null = null;
				if (hadError && this.settings.tls && !this._wasAuthenticated) {
					msg = `TLS connection to ${this.settings.host}:${this.settings.port} failed — ` +
						`if using a self-signed certificate, open https://${this.settings.host}:${this.settings.port} ` +
						`in a new tab, accept the certificate warning, then try connecting again`;
				} else if (hadError && !this._wasAuthenticated) {
					msg = `Could not connect to ${this.settings.host}:${this.settings.port} — ` +
						`check the host/port and that the WeeChat relay is running`;
				} else if (this.state === ConnectionState.AUTHENTICATING) {
					msg = 'Authentication failed — check your relay password';
				} else if (ev.reason && !this._wasAuthenticated) {
					msg = `Disconnected: ${ev.reason} (code ${ev.code})`;
				}
				// Only emit error if there's a meaningful message.
				// Reconnects after working sessions are silent.
				if (msg) this.emitError(msg);
				this.setState(ConnectionState.RECONNECTING);
				this.scheduleReconnect();
			}
		};
	}

	disconnect(clean = true): void {
		this.cleanDisconnect = clean;
		this.cancelReconnect();
		if (this.ws) {
			if (clean) {
				try { this.send(quitCmd()); } catch { /* already closing */ }
			}
			this.ws.close(1000, clean ? 'client disconnect' : 'forced');
			this.ws = null;
		}
		this.resetAccumulator();
		this.recentLineIds.clear();
		if (this.recentLineTimer) {
			clearTimeout(this.recentLineTimer);
			this.recentLineTimer = null;
		}
		this.setState(ConnectionState.DISCONNECTED);
	}

	send(text: string): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		try { this.ws.send(text); } catch { /* closing race */ }
	}

	sendPing(arg: string): void {
		this.send(pingCmd(arg));
	}

	sendInput(buffer: string, text: string): void {
		this.send(inputCmd(buffer, text));
	}

	requestHistory(buffer: string, count = 100): void {
		const path = `buffer:${buffer}/own_lines/last_line(-${count})/data`;
		this.send(
			hdataCmd(
				ID_HISTORY,
				path,
				['date', 'displayed', 'highlight', 'tags_array', 'prefix', 'message'],
			)
		);
	}

	requestAllHistory(count = 50): void {
		const path = `buffer:gui_buffers(*)/own_lines/last_line(-${count})/data`;
		this.send(
			hdataCmd(
				ID_HISTORY,
				path,
				['date', 'displayed', 'highlight', 'tags_array', 'prefix', 'message'],
			)
		);
	}

	requestNicklist(buffer: string): void {
		this.send(nicklistCmd(ID_NICKLIST, buffer));
	}

	// -----------------------------------------------------------------------
	// Post-auth bootstrap
	// -----------------------------------------------------------------------

	private onAuthenticated(version: string): void {
		this._wasAuthenticated = true;
		this.reconnectAttempts = 0;
		this.setState(ConnectionState.CONNECTED);
		this.dispatch('authenticated', { version } satisfies AuthenticatedEvent);

		// Fetch all open buffers
		this.send(
			hdataCmd(
				ID_BUFFERS,
				'buffer:gui_buffers(*)',
				[
					'number',
					'full_name',
					'short_name',
					'title',
					'type',
					'nicklist_nicks_count',
					'local_variables',
					'notify',
					'hidden',
				]
			)
		);

		// Fetch hotlist (unread counts)
		this.send(
			hdataCmd(
				ID_HOTLIST,
				'hotlist:gui_hotlist(*)',
				['buffer', 'count']
			)
		);

		// Fetch last 50 lines for every open buffer in one shot (one round-trip)
		this.requestAllHistory(50);

		// Subscribe to all live events
		this.send(syncCmd());
	}

	// -----------------------------------------------------------------------
	// Binary frame accumulation
	// -----------------------------------------------------------------------

	private accumulateFrame(data: ArrayBuffer): void {
		this.pendingChunks.push(new Uint8Array(data));
		this.pendingLength += data.byteLength;
		this.drainPending();
	}

	private drainPending(): void {
		for (;;) {
			// Need at least 4 bytes to read the relay message length field
			if (this.pendingLength < 4) break;

			const hdr = this.peekBytes(4);
			const msgLen =
				((hdr[0]! << 24) | (hdr[1]! << 16) | (hdr[2]! << 8) | hdr[3]!) >>> 0;

			if (msgLen < 5 || msgLen > 67108864) {
				this.resetAccumulator();
				this.emitError(`Received malformed relay frame (length=${msgLen}), dropping buffer`);
				break;
			}

			if (this.pendingLength < msgLen) break; // wait for more data

			const msgBytes = this.consumeBytes(msgLen);
			// Parse is async (decompression); fire-and-forget
			void this.parseAndRoute(msgBytes.buffer as ArrayBuffer);
		}
	}

	private resetAccumulator(): void {
		this.pendingChunks = [];
		this.pendingLength = 0;
	}

	private peekBytes(n: number): Uint8Array {
		const out = new Uint8Array(n);
		let written = 0;
		for (const chunk of this.pendingChunks) {
			if (written >= n) break;
			const take = Math.min(chunk.length, n - written);
			out.set(chunk.subarray(0, take), written);
			written += take;
		}
		return out;
	}

	private consumeBytes(n: number): Uint8Array {
		const out = new Uint8Array(n);
		let written = 0;
		while (written < n && this.pendingChunks.length > 0) {
			const chunk = this.pendingChunks[0]!;
			const take = Math.min(chunk.length, n - written);
			out.set(chunk.subarray(0, take), written);
			written += take;
			if (take === chunk.length) {
				this.pendingChunks.shift();
			} else {
				this.pendingChunks[0] = chunk.subarray(take);
			}
		}
		this.pendingLength -= n;
		return out;
	}

	private async parseAndRoute(data: ArrayBuffer): Promise<void> {
		let msg;
		try {
			msg = await this.parser.parse(data);
		} catch (err) {
			this.emitError(`Relay parse error: ${String(err)}`);
			return;
		}
		try {
			this.handleMessage(msg);
		} catch (err) {
			this.emitError(`Relay dispatch error (id=${msg.id}): ${String(err)}`);
		}
	}

	// -----------------------------------------------------------------------
	// Message routing
	// -----------------------------------------------------------------------

	private handleMessage(msg: { id: string; objects: Array<{ type: string; value: unknown }> }): void {
		switch (msg.id) {
			case ID_VERSION:
				for (const obj of msg.objects) {
					if (obj.type === 'inf') {
						const inf = obj.value as { name: string; value: string };
						this.onAuthenticated(inf.value);
						return;
					}
				}
				this.onAuthenticated('unknown');
				return;

			case ID_BUFFERS:
				this.routeBufferList(msg.objects);
				return;

			case ID_HOTLIST:
				this.routeHotlist(msg.objects);
				return;

			case ID_HISTORY:
				this.routeHistory(msg.objects);
				return;

			case ID_NICKLIST:
				this.routeNicklist(msg.objects, false);
				return;

			case '_buffer_opened':
				this.routeBufferOpened(msg.objects);
				return;

			case '_buffer_closing':
			case '_buffer_closed':
				this.routeBufferClosed(msg.objects);
				return;

			case '_buffer_renamed':
			case '_buffer_title_changed':
			case '_buffer_localvar_added':
			case '_buffer_localvar_changed':
			case '_buffer_localvar_removed':
				this.routeBufferUpdated(msg.objects);
				return;

			case '_buffer_line_added':
				this.routeLineAdded(msg.objects);
				return;

			case '_nicklist':
				this.routeNicklist(msg.objects, false);
				return;

			case '_nicklist_diff':
				this.routeNicklistDiff(msg.objects);
				return;

			case '_hotlist':
				this.routeHotlist(msg.objects);
				return;

			case '_buffer_switch':
				this.routeBufferSwitch(msg.objects);
				return;

			case '_pong':
				for (const obj of msg.objects) {
					if (obj.value != null) {
						this.dispatch('pong', { arg: String(obj.value) });
						break;
					}
				}
				return;

			case '_upgrade':
			case '_upgrade_ended':
				// WeeChat is restarting; close and let the reconnect loop handle it
				this.ws?.close();
				return;

			default:
				// Unhandled / future message types — silently ignored
				return;
		}
	}

	// -----------------------------------------------------------------------
	// Object-level routers
	// -----------------------------------------------------------------------

	private routeBufferList(objects: Array<{ type: string; value: unknown }>): void {
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			for (const item of hda.items) {
				const buf = itemToBuffer(item);
				this.buffers.set(buf.id, buf);
			}
		}
		this.dispatch('buffersLoaded', {
			buffers: Array.from(this.buffers.values()),
		} satisfies BuffersLoadedEvent);
	}

	private routeHotlist(objects: Array<{ type: string; value: unknown }>): void {
		const hotlist: WeeChatHotlist[] = [];
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			for (const item of hda.items) {
				hotlist.push(itemToHotlist(item));
			}
		}
		this.dispatch('hotlistUpdated', { hotlist } satisfies HotlistUpdatedEvent);
	}

	private routeHistory(objects: Array<{ type: string; value: unknown }>): void {
		// Group lines by buffer pointer so each dispatch carries one buffer's lines.
		// This handles both single-buffer and all-buffers (*) hdata responses.
		const byBuffer = new Map<string, WeeChatLine[]>();
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			for (const item of hda.items) {
				const line = itemToLine(item);
				let arr = byBuffer.get(line.buffer);
				if (!arr) { arr = []; byBuffer.set(line.buffer, arr); }
				arr.push(line);
			}
		}
		for (const lines of byBuffer.values()) {
			this.dispatch('historyLoaded', { lines } satisfies HistoryLoadedEvent);
		}
	}

	private routeBufferOpened(objects: Array<{ type: string; value: unknown }>): void {
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			for (const item of hda.items) {
				const buf = itemToBuffer(item);
				this.buffers.set(buf.id, buf);
				this.dispatch('bufferOpened', { buffer: buf } satisfies BufferOpenedEvent);
			}
		}
	}

	private routeBufferClosed(objects: Array<{ type: string; value: unknown }>): void {
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			for (const item of hda.items) {
				const id = item.pointers[0] ?? '0x0';
				this.buffers.delete(id);
				this.nicks.delete(id);
				this.dispatch('bufferClosed', { id } satisfies BufferClosedEvent);
			}
		}
	}

	private routeBufferUpdated(objects: Array<{ type: string; value: unknown }>): void {
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			for (const item of hda.items) {
				const update = itemToBuffer(item);
				const existing = this.buffers.get(update.id);
				// Push events (localvar_added, _buffer_renamed, etc.) only carry the
				// changed fields; itemToBuffer fills missing ones with '' / 0.  Merge
				// over the existing record so fields absent from the push are preserved.
				const buf: typeof update = existing ? {
					...existing,
					name:       update.name       || existing.name,
					fullName:   update.fullName   || existing.fullName,
					shortName:  update.shortName  || existing.shortName,
					title:      update.title      !== '' ? update.title : existing.title,
					number:     update.number     || existing.number,
					type:       update.type       || existing.type,
					nicksCount: update.nicksCount || existing.nicksCount,
					localVars:  Object.keys(update.localVars).length > 0
					              ? update.localVars : existing.localVars,
					notify:     update.notify,
					hidden:     update.hidden,
				} : update;
				this.buffers.set(buf.id, buf);
				this.dispatch('bufferRenamed', { buffer: buf } satisfies BufferRenamedEvent);
			}
		}
	}

	private routeLineAdded(objects: Array<{ type: string; value: unknown }>): void {
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			for (const item of hda.items) {
				const line = itemToLine(item);
				// Skip if we already dispatched this exact line ID recently
				if (this.recentLineIds.has(line.id)) {
					console.debug('[relay] duplicate lineAdded suppressed:', line.id, line.message?.slice(0, 40));
					continue;
				}
				this.recentLineIds.add(line.id);
				// Auto-prune the set every 10s
				if (!this.recentLineTimer) {
					this.recentLineTimer = setTimeout(() => {
						this.recentLineIds.clear();
						this.recentLineTimer = null;
					}, 10000);
				}
				this.dispatch('lineAdded', { line } satisfies LineAddedEvent);
			}
		}
	}

	private routeNicklist(
		objects: Array<{ type: string; value: unknown }>,
		_isDiff: boolean
	): void {
		// Full nicklist: group by buffer pointer (first pointer in each item)
		const byBuffer = new Map<string, WeeChatNick[]>();
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			for (const item of hda.items) {
				const bufPtr = item.pointers[0] ?? '0x0';
				let list = byBuffer.get(bufPtr);
				if (!list) { list = []; byBuffer.set(bufPtr, list); }
				list.push(itemToNick(item));
			}
		}
		for (const [bufPtr, nicks] of byBuffer) {
			this.nicks.set(bufPtr, nicks);
			this.dispatch('nicklistReceived', { buffer: bufPtr, nicks } satisfies NicklistReceivedEvent);
		}
	}

	private routeNicklistDiff(objects: Array<{ type: string; value: unknown }>): void {
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			for (const item of hda.items) {
				const bufPtr = item.pointers[0] ?? '0x0';
				const diffType = String(item.objects['_diff'] ?? '');
				const nick = itemToNick(item);

				if (diffType === '+') {
					let list = this.nicks.get(bufPtr);
					if (!list) { list = []; this.nicks.set(bufPtr, list); }
					list.push(nick);
					this.dispatch('nickAdded', { buffer: bufPtr, nick } satisfies NickAddedEvent);
				} else if (diffType === '-') {
					const list = this.nicks.get(bufPtr);
					if (list) {
						const idx = list.findIndex((n) => n.id === nick.id);
						if (idx !== -1) list.splice(idx, 1);
					}
					this.dispatch('nickRemoved', { buffer: bufPtr, nickId: nick.id } satisfies NickRemovedEvent);
				} else {
					// '*' = changed — update in place
					const list = this.nicks.get(bufPtr);
					if (list) {
						const idx = list.findIndex((n) => n.id === nick.id);
						if (idx !== -1) { list[idx] = nick; } else { list.push(nick); }
					}
					// Emit as nickAdded so consumers can re-render
					this.dispatch('nickAdded', { buffer: bufPtr, nick } satisfies NickAddedEvent);
				}
			}
		}
	}

	private routeBufferSwitch(objects: Array<{ type: string; value: unknown }>): void {
		for (const obj of objects) {
			if (obj.type !== 'hda') continue;
			const hda = obj.value as HdataResult;
			const first = hda.items[0];
			if (first) {
				const id = first.pointers[0] ?? '0x0';
				this.dispatch('bufferSwitched', { id } satisfies BufferSwitchedEvent);
			}
			return;
		}
	}

	// -----------------------------------------------------------------------
	// Reconnect scheduling
	// -----------------------------------------------------------------------

	private scheduleReconnect(): void {
		this.cancelReconnect();
		const delay = backoff(this.reconnectAttempts);
		this.reconnectAttempts += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	private cancelReconnect(): void {
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	private setState(s: ConnectionState): void {
		if (this.state === s) return;
		this.state = s;
		this.dispatch('stateChanged', { state: s } satisfies StateChangedEvent);
	}

	private emitError(message: string): void {
		this.dispatch('error', { message } satisfies RelayErrorEvent);
	}

	private dispatch<T>(name: string, detail: T): void {
		this.dispatchEvent(new CustomEvent<T>(name, { detail }));
	}
}
