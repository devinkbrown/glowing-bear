import { describe, expect, it } from 'vitest';
import {
	ConnectionState,
	DEFAULT_RELAY,
	type HotlistEntry,
	type RelaySettings,
	type WeeChatBuffer,
	type WeeChatHotlist,
	type WeeChatLine,
	type WeeChatNick,
} from './model';

function typed<T>(value: T): T {
	return value;
}

describe('ConnectionState', () => {
	it('exports the relay connection lifecycle values used by callers', () => {
		expect(ConnectionState.DISCONNECTED).toBe('disconnected');
		expect(ConnectionState.CONNECTING).toBe('connecting');
		expect(ConnectionState.AUTHENTICATING).toBe('authenticating');
		expect(ConnectionState.CONNECTED).toBe('connected');
		expect(ConnectionState.RECONNECTING).toBe('reconnecting');
		expect(ConnectionState.ERROR).toBe('error');
	});

	it('does not expose extra runtime states', () => {
		expect(Object.values(ConnectionState)).toEqual([
			'disconnected',
			'connecting',
			'authenticating',
			'connected',
			'reconnecting',
			'error',
		]);
	});
});

describe('DEFAULT_RELAY', () => {
	it('exports the default WeeChat relay settings', () => {
		expect(DEFAULT_RELAY).toStrictEqual({
			host: 'eshmaki.me',
			port: 9001,
			tls: true,
			password: '',
			compression: true,
			path: 'weechat',
		});
	});

	it('satisfies the RelaySettings shape including empty boundary values', () => {
		const settings = typed<RelaySettings>({
			host: '',
			port: 0,
			tls: false,
			password: '',
			compression: false,
			path: '',
		});

		expect(settings).toStrictEqual({
			host: '',
			port: 0,
			tls: false,
			password: '',
			compression: false,
			path: '',
		});
	});
});

describe('WeeChat domain model types', () => {
	it('accepts an empty/minimal buffer row', () => {
		const buffer = typed<WeeChatBuffer>({
			id: '',
			number: 0,
			name: '',
			fullName: '',
			shortName: '',
			title: '',
			type: 0,
			nicksCount: 0,
			localVars: {},
			notify: 0,
			hidden: false,
		});

		expect(buffer.localVars).toStrictEqual({});
		expect(buffer.hidden).toBe(false);
	});

	it('keeps already-decoded line metadata without throwing on hostile-looking text', () => {
		const line = typed<WeeChatLine>({
			id: 'line-1',
			buffer: '0x1',
			date: new Date(0),
			datePrinted: new Date(1),
			displayed: true,
			highlight: false,
			tags: ['irc_privmsg', 'notify_message'],
			prefix: 'mallory',
			message: 'hello\r\n/quit',
			nick: 'mallory',
			isAction: false,
			isSelf: false,
			isNotice: false,
			isJoin: false,
			isPart: false,
			isQuit: false,
			isNick: false,
			isTopic: false,
			isMode: false,
			isTagMsg: false,
			isWhisper: false,
			ircTags: new Map([
				['msgid', 'abc\\sdef'],
				['account', ''],
			]),
			msgid: 'abc\\sdef',
			replyTo: '',
			account: '',
		});

		expect(line.message).toBe('hello\r\n/quit');
		expect(line.ircTags.get('msgid')).toBe('abc\\sdef');
		expect(line.account).toBe('');
	});

	it('accepts nick rows and hotlist aliases at their tuple boundaries', () => {
		const nick = typed<WeeChatNick>({
			id: 'nick-1',
			pointer: '0x2',
			level: 0,
			name: '',
			color: '',
			prefix: '',
			prefixColor: '',
			visible: false,
			group: true,
		});
		const hotlist = typed<WeeChatHotlist>({
			buffer: '0x1',
			count: [0, 0, 0, 0],
		});
		const entry = typed<HotlistEntry>(hotlist);

		expect(nick.visible).toBe(false);
		expect(entry.count).toEqual([0, 0, 0, 0]);
	});
});
