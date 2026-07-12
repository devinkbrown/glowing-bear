// Tests for stripColors — removal of WeeChat \x19/\x1a/\x1b/\x1c codes and
// classic IRC formatting toggles, leaving plain printable text.
import { describe, it, expect } from 'vitest';
import { stripColors } from './strip-colors';

describe('stripColors plain text', () => {
	it('passes plain text through unchanged', () => {
		expect(stripColors('hello world')).toBe('hello world');
	});

	it('trims surrounding whitespace (documented behavior)', () => {
		expect(stripColors('  padded  ')).toBe('padded');
	});

	it('returns an empty string for empty input', () => {
		expect(stripColors('')).toBe('');
	});
});

describe('stripColors \\x19 WeeChat color codes', () => {
	it('strips a basic color pair (\\x19 + digits)', () => {
		expect(stripColors('\x1901hello')).toBe('hello');
	});

	it('strips a basic color mid-string', () => {
		expect(stripColors('a\x1904b')).toBe('ab');
	});

	it('strips digit runs with pipe separators', () => {
		expect(stripColors('\x1905|04text')).toBe('text');
	});

	it('strips the \\x19\\x1c reset pair', () => {
		expect(stripColors('a\x19\x1cb')).toBe('ab');
	});

	it('strips an extended color pair (\\x19@ + 5 chars)', () => {
		expect(stripColors('\x19@00214deep')).toBe('deep');
	});

	it('handles a truncated extended color at end of string without crashing', () => {
		expect(stripColors('x\x19@01')).toBe('x');
	});

	it('strips an F (foreground) spec with basic color', () => {
		expect(stripColors('\x19F05text')).toBe('text');
	});

	it('strips an F spec with extended color', () => {
		expect(stripColors('\x19F@00214text')).toBe('text');
	});

	it('strips a B (background) spec', () => {
		expect(stripColors('\x19B02text')).toBe('text');
	});

	it('strips a * (fg+bg) spec with comma-separated pair', () => {
		expect(stripColors('\x19*05,08text')).toBe('text');
	});

	it('strips a * spec with two extended colors', () => {
		expect(stripColors('\x19*@00214,@00120text')).toBe('text');
	});

	it('strips a ~ (bar) spec', () => {
		expect(stripColors('\x19~08bar')).toBe('bar');
	});

	it('strips an E (emphasis) marker that carries no color spec', () => {
		expect(stripColors('\x19Etext')).toBe('text');
	});

	it('consumes only \\x19 for an unknown subcode, keeping the character', () => {
		expect(stripColors('\x19Zkeep')).toBe('Zkeep');
	});

	it('handles a trailing \\x19 at end of string without crashing', () => {
		expect(stripColors('abc\x19')).toBe('abc');
	});

	it('strips a realistic colored nick prefix', () => {
		// e.g. "@kain" where the sigil and nick are colored separately
		expect(stripColors('\x19F05@\x19F14kain')).toBe('@kain');
	});
});

describe('stripColors \\x1a attributes and \\x1c reset', () => {
	it('strips \\x1a plus its one attribute byte', () => {
		expect(stripColors('a\x1a\x01b')).toBe('ab');
	});

	it('strips \\x1a followed by a printable attribute character', () => {
		expect(stripColors('\x1a*bold')).toBe('bold');
	});

	it('handles a trailing \\x1a at end of string without crashing', () => {
		expect(stripColors('x\x1a')).toBe('x');
	});

	it('strips a bare \\x1c reset-all', () => {
		expect(stripColors('a\x1cb')).toBe('ab');
	});
});

describe('stripColors ANSI escapes', () => {
	it('strips simple SGR sequences', () => {
		expect(stripColors('\x1b[31mred\x1b[0m')).toBe('red');
	});

	it('strips 256-color SGR sequences', () => {
		expect(stripColors('\x1b[38;5;196mhot\x1b[m')).toBe('hot');
	});

	it('consumes a lone escape byte, keeping the following character', () => {
		expect(stripColors('a\x1bb')).toBe('ab');
	});

	it('handles an unterminated sequence at end of string without crashing', () => {
		expect(stripColors('x\x1b[123')).toBe('x');
	});
});

describe('stripColors IRC formatting', () => {
	it('strips bold, italic, and underline toggles', () => {
		expect(stripColors('\x02bold\x02 \x1ditalic\x1d \x1funder\x1f')).toBe('bold italic under');
	});

	it('strips reset, monospace, reverse, and strikethrough toggles', () => {
		expect(stripColors('\x16rev\x0f\x11mono\x1e\x1estrike')).toBe('revmonostrike');
	});

	it('strips a one-digit IRC color', () => {
		expect(stripColors('\x034red')).toBe('red');
	});

	it('strips a two-digit IRC color', () => {
		expect(stripColors('\x0304red')).toBe('red');
	});

	it('strips foreground,background IRC colors', () => {
		expect(stripColors('\x034,7text')).toBe('text');
		expect(stripColors('\x0304,07text')).toBe('text');
	});

	it('strips a bare \\x03 color reset, keeping following text', () => {
		expect(stripColors('a\x03b')).toBe('ab');
	});

	it('keeps a comma that is not followed by background digits', () => {
		expect(stripColors('\x033,hi')).toBe(',hi');
	});

	it('strips IRC hex colors', () => {
		expect(stripColors('\x04ff6600,001122hex')).toBe('hex');
	});
});

describe('stripColors output hygiene', () => {
	// Every weird sequence must come out with all handled control bytes gone.
	const HANDLED_CONTROL = /[\x02\x03\x0f\x11\x16\x19\x1a\x1b\x1c\x1d\x1e\x1f]/;

	const fixtures: string[] = [
		'\x1901hello \x19F05world\x19\x1c!',
		'\x19@00214a\x19*@00214,@00120b\x19~03c',
		'\x1a\x01set \x1a\x02unset \x1cclear',
		'\x1b[1;32mgreen\x1b[0m and \x02bold\x0f',
		'\x0304,07colored\x03 plain',
		'\x19F@00214\x19B05mixed spec soup\x19E',
		'nick\x1928: message body',
		'\x19', // lone prefix at end
		'\x19@', // truncated extended
		'\x1b[', // truncated ANSI
		'\x03', // bare IRC color
		'\x19*05,', // fg+bg with missing bg
	];

	it.each(fixtures.map((f, i) => [i, f] as const))(
		'fixture %i yields output with no handled control bytes',
		(_i, fixture) => {
			const out = stripColors(fixture);
			expect(out).not.toMatch(HANDLED_CONTROL);
		}
	);

	it('preserves the readable words of a heavily formatted line', () => {
		const line = '\x19F05\x02kain\x02\x19\x1c: \x1b[31mdeploy\x1b[0m \x0303done\x03 \x19@00214ok';
		expect(stripColors(line)).toBe('kain: deploy done ok');
	});
});

describe('stripColors hostile input', () => {
	it('strips a pathological run of WeeChat color prefixes without hanging', () => {
		const run = '\x19F05'.repeat(2048);

		const out = stripColors(`${run}done`);

		expect(out).toBe('done');
	});

	it('makes progress through incomplete composite WeeChat color specs', () => {
		const line = `start${'\x19*05,'.repeat(512)}end`;

		const out = stripColors(line);

		expect(out).toBe('startend');
	});

	it('handles long unterminated ANSI sequences as bounded skips', () => {
		const ansiPayload = '123456789012345VISIBLE';

		const out = stripColors(`a\x1b[${ansiPayload}`);

		expect(out).toBe('aVISIBLE');
	});
});
