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

/** Decode IRCv3 tag value escape sequences */
function decodeTagValue(v: string): string {
	return v
		.replace(/\\:/g, ';')
		.replace(/\\s/g, ' ')
		.replace(/\\\\/g, '\\')
		.replace(/\\r/g, '\r')
		.replace(/\\n/g, '\n');
}
