// IRCv3 message tag parsing utilities

const WEECHAT_INTERNAL = /^(irc_|notify_|nick_|log\d|self_msg$)/;

/**
 * Parse IRCv3 key=value tags out of WeeChat's tags_array.
 * WeeChat includes raw IRC message tags alongside its own internal tags.
 */
export function parseIrcv3Tags(tags: string[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const tag of tags) {
		if (WEECHAT_INTERNAL.test(tag)) continue;
		const eq = tag.indexOf('=');
		if (eq > 0) {
			map.set(tag.slice(0, eq), decodeTagValue(tag.slice(eq + 1)));
		} else if (tag.length > 0) {
			map.set(tag, '');
		}
	}
	return map;
}

/**
 * Decode IRCv3 tag value escape sequences in a SINGLE left-to-right pass.
 *
 * Chained `.replace()` re-scans decoded output and mis-decodes an escaped
 * backslash followed by an escape char (wire `\\s` → "\ " instead of "\s").
 * Scanning once, each backslash consumes exactly the next char. Unknown escape
 * → the literal char; a lone trailing backslash is dropped.
 */
function decodeTagValue(v: string): string {
	let out = '';
	for (let i = 0; i < v.length; i++) {
		const c = v[i]!;
		if (c !== '\\') {
			out += c;
			continue;
		}
		const next = v[i + 1];
		if (next === undefined) break;
		i++;
		switch (next) {
			case ':': out += ';'; break;
			case 's': out += ' '; break;
			case 'r': out += '\r'; break;
			case 'n': out += '\n'; break;
			case '\\': out += '\\'; break;
			default: out += next; break;
		}
	}
	return out;
}
