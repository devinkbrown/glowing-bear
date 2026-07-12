// Tests for the WeeChat relay text command builders. Relay commands are plain
// text lines "(id) command args...\n" — assertions here pin the exact strings
// that go over the wire.
import { describe, it, expect } from 'vitest';
import {
	cmd,
	desyncCmd,
	hdataCmd,
	infoCmd,
	initCmd,
	inputCmd,
	nicklistCmd,
	pingCmd,
	quitCmd,
	syncCmd,
} from './serializer';

describe('cmd', () => {
	it('prefixes a non-empty id in parentheses', () => {
		expect(cmd('req1', 'info', 'version')).toBe('(req1) info version\n');
	});

	it('omits the id prefix when the id is empty', () => {
		expect(cmd('', 'sync', '*')).toBe('sync *\n');
	});

	it('filters out empty arguments', () => {
		expect(cmd('x', 'foo', '', 'bar', '')).toBe('(x) foo bar\n');
	});
});

describe('initCmd', () => {
	it('builds init with password and zlib compression', () => {
		expect(initCmd('hunter2', true)).toBe('init password=hunter2,compression=zlib\n');
	});

	it('turns compression off when disabled', () => {
		expect(initCmd('hunter2', false)).toBe('init password=hunter2,compression=off\n');
	});

	it('escapes commas in the password so they do not split init options', () => {
		expect(initCmd('pa,ss,wd', true)).toBe('init password=pa\\,ss\\,wd,compression=zlib\n');
	});

	it('leaves comma-free passwords untouched', () => {
		expect(initCmd('s3cret!with spaces', false)).toBe(
			'init password=s3cret!with spaces,compression=off\n'
		);
	});
});

describe('hdataCmd', () => {
	it('builds an hdata request with comma-joined keys', () => {
		expect(hdataCmd('_buffers', 'buffer:gui_buffers(*)', ['number', 'full_name', 'title'])).toBe(
			'(_buffers) hdata buffer:gui_buffers(*) number,full_name,title\n'
		);
	});

	it('inserts the count between path and keys when provided', () => {
		expect(
			hdataCmd('_history', 'buffer:0x1234/own_lines/last_line(-100)/data', ['message'], {
				count: 100,
			})
		).toBe('(_history) hdata buffer:0x1234/own_lines/last_line(-100)/data 100 message\n');
	});

	it('passes negative counts through (last N semantics)', () => {
		expect(hdataCmd('_history', 'buffer:gui_buffers(*)', ['date', 'message'], { count: -50 })).toBe(
			'(_history) hdata buffer:gui_buffers(*) -50 date,message\n'
		);
	});
});

describe('syncCmd / desyncCmd', () => {
	it('syncs all buffers when called with no arguments', () => {
		expect(syncCmd()).toBe('sync *\n');
	});

	it('syncs all buffers when called with an empty list', () => {
		expect(syncCmd([])).toBe('sync *\n');
	});

	it('emits one sync line per named buffer', () => {
		expect(syncCmd(['irc.libera.#weechat', 'core.weechat'])).toBe(
			'sync irc.libera.#weechat\nsync core.weechat\n'
		);
	});

	it('desyncs all buffers when called with no arguments', () => {
		expect(desyncCmd()).toBe('desync *\n');
	});

	it('emits one desync line per named buffer', () => {
		expect(desyncCmd(['irc.libera.#weechat'])).toBe('desync irc.libera.#weechat\n');
	});
});

describe('inputCmd', () => {
	it('sends text input to a buffer, preserving spaces in the text', () => {
		expect(inputCmd('irc.libera.#weechat', 'hello there world')).toBe(
			'input irc.libera.#weechat hello there world\n'
		);
	});

	it('accepts a pointer as the buffer reference', () => {
		expect(inputCmd('0x1a2b3c', '/join #test')).toBe('input 0x1a2b3c /join #test\n');
	});

	// SECURITY (H1): a newline in composer content must NEVER reach the wire as a
	// framing byte — the relay parses each `\n`-terminated line as its own
	// command, so `foo\ninput <buf> /quit` would run an attacker-chosen verb.
	it('splits multi-line text into one input command per line (no injection)', () => {
		expect(inputCmd('irc.libera.#c', 'foo\ninput core.weechat /quit')).toBe(
			'input irc.libera.#c foo\ninput irc.libera.#c input core.weechat /quit\n'
		);
	});

	it('handles CRLF and lone CR line endings without emitting a raw break', () => {
		const out = inputCmd('#c', 'a\r\nb\rc');
		expect(out).toBe('input #c a\ninput #c b\ninput #c c\n');
		// Every newline present is a command terminator, never mid-argument.
		expect(out.split('\n').filter((l) => l !== '')).toEqual([
			'input #c a',
			'input #c b',
			'input #c c',
		]);
	});

	it('skips empty lines so no bare "input <buffer>" is sent', () => {
		expect(inputCmd('#c', 'a\n\nb')).toBe('input #c a\ninput #c b\n');
		expect(inputCmd('#c', '\n\n')).toBe('');
	});

	it('strips a newline smuggled into the buffer name', () => {
		expect(inputCmd('#c\nquit', 'hi')).toBe('input #cquit hi\n');
	});
});

describe('cmd newline stripping (injection defense)', () => {
	it('strips CR/LF from every argument so no second command is smuggled', () => {
		expect(cmd('', 'input', '#c', 'hi\nquit')).toBe('input #c hiquit\n');
	});

	it('strips CR/LF from the id and command verb', () => {
		expect(cmd('a\nb', 'in\nput', 'x')).toBe('(ab) input x\n');
	});
});

describe('nicklistCmd', () => {
	it('requests the nicklist for a buffer with the given id', () => {
		expect(nicklistCmd('_nicklist', 'irc.libera.#weechat')).toBe(
			'(_nicklist) nicklist irc.libera.#weechat\n'
		);
	});
});

describe('pingCmd', () => {
	it('sends ping with the _pong correlation id and the given argument', () => {
		expect(pingCmd('1719000000000')).toBe('(_pong) ping 1719000000000\n');
	});
});

describe('infoCmd', () => {
	it('requests an info value by name', () => {
		expect(infoCmd('_version', 'version')).toBe('(_version) info version\n');
	});
});

describe('quitCmd', () => {
	it('sends a bare quit', () => {
		expect(quitCmd()).toBe('quit\n');
	});
});

describe('wire format invariants', () => {
	it('every builder output ends with exactly one newline', () => {
		const outputs = [
			initCmd('pw', true),
			syncCmd(),
			desyncCmd(),
			inputCmd('core.weechat', 'hi'),
			infoCmd('_version', 'version'),
			hdataCmd('_buffers', 'buffer:gui_buffers(*)', ['number']),
			nicklistCmd('_nicklist', 'core.weechat'),
			pingCmd('1'),
			quitCmd(),
		];

		for (const out of outputs) {
			expect(out.endsWith('\n')).toBe(true);
			expect(out.endsWith('\n\n')).toBe(false);
		}
	});
});
