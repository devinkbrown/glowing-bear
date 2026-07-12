/**
 * Strip all WeeChat color/attribute codes and IRC formatting from a string.
 * Returns plain text.
 *
 * WeeChat color format after \x19:
 *   \x19\x1c          — reset
 *   \x19NN            — color option
 *   \x19@NNNNN        — extended color pair
 *   \x19{F|B|*}<colorspec>[,|~<colorspec>]
 *     where <colorspec> = @NNNNN (extended) or NN (WeeChat color)
 */
export function stripColors(s: string): string {
	let out = '';
	let i = 0;
	while (i < s.length) {
		const c = s.charCodeAt(i);
		if (c === 0x19) {
			// WeeChat color/attribute prefix
			i++;
			if (i >= s.length) break;
			const n = s.charCodeAt(i);
			if (n === 0x1c) {
				i++; // \x19\x1c = reset
			} else if (n === 0x40) {
				i = skipColorSpec(s, i); // \x19@ + optional attrs + 5-digit extended pair
			} else if (n === 0x46 || n === 0x42 || n === 0x2a || n === 0x7e ||
			           n === 0x21 || n === 0x5f || n === 0x25 || n === 0x45) {
				// \x19{F|B|*|~|!|_|%|E} + color spec
				i++;
				i = skipColorSpec(s, i);
				// For * (fg+bg), there may be a comma-separated second color spec
				if (i < s.length && (s[i] === ',' || s[i] === '~')) {
					i++;
					i = skipColorSpec(s, i);
				}
			} else if (n >= 0x30 && n <= 0x39) {
				// \x19 + two digits = WeeChat color option
				i = Math.min(i + 2, s.length);
				while (i < s.length && s[i] === '|') {
					i++;
					while (i < s.length) {
						const cc = s.charCodeAt(i);
						if (cc >= 0x30 && cc <= 0x39) i++;
						else break;
					}
				}
			}
			// else: unknown subcode — just consumed \x19
		} else if (c === 0x1a) {
			i = Math.min(i + 2, s.length); // WeeChat attr set/remove (1-byte opcode + 1-byte attr)
		} else if (c === 0x1b) {
			// ANSI escape \x1b[...m or lone WeeChat escape
			i++;
			if (i < s.length && s[i] === '[') {
				const seqStart = i;
				while (i < s.length && s[i] !== 'm' && i - seqStart < 16) i++;
				if (i < s.length && s[i] === 'm') i++;
			}
		} else if (c === 0x1c) {
			i++; // WeeChat reset all
		} else if (c === 0x02 || c === 0x0f || c === 0x11 || c === 0x16 ||
		           c === 0x1d || c === 0x1e || c === 0x1f) {
			i++; // IRC formatting toggles
		} else if (c === 0x03) {
			// IRC color — skip up to 2-digit fg, optional ,2-digit bg
			i++;
			if (i < s.length && s.charCodeAt(i) >= 0x30 && s.charCodeAt(i) <= 0x39) {
				i++;
				if (i < s.length && s.charCodeAt(i) >= 0x30 && s.charCodeAt(i) <= 0x39) i++;
				if (i < s.length && s[i] === ',') {
					const saved = i; i++;
					if (i < s.length && s.charCodeAt(i) >= 0x30 && s.charCodeAt(i) <= 0x39) {
						i++;
						if (i < s.length && s.charCodeAt(i) >= 0x30 && s.charCodeAt(i) <= 0x39) i++;
					} else { i = saved; }
				}
			}
		} else if (c === 0x04) {
			// IRC hex color — skip RRGGBB, optional ,RRGGBB
			i++;
			let seen = 0;
			while (i < s.length && seen < 6 && isHexDigit(s.charCodeAt(i))) {
				i++;
				seen++;
			}
			if (seen === 6 && i < s.length && s[i] === ',') {
				const saved = i;
				i++;
				let bgSeen = 0;
				while (i < s.length && bgSeen < 6 && isHexDigit(s.charCodeAt(i))) {
					i++;
					bgSeen++;
				}
				if (bgSeen !== 6) i = saved;
			}
		} else {
			out += s[i];
			i++;
		}
	}
	return out.trim();
}

/**
 * Skip a single WeeChat color spec:
 *   @NNNNN  — extended color (@ + 5 chars)
 *   digits  — basic color (1+ digits, optionally with | separator)
 */
function skipColorSpec(s: string, i: number): number {
	if (i < s.length && s.charCodeAt(i) === 0x40) {
		i++;
		while (i < s.length && isWeeAttr(s[i])) i++;
		let seen = 0;
		while (i < s.length && seen < 5) {
			const cc = s.charCodeAt(i);
			if (cc < 0x30 || cc > 0x39) break;
			i++;
			seen++;
		}
		return i;
	}
	while (i < s.length && isWeeAttr(s[i])) i++;
	let seen = 0;
	while (i < s.length) {
		const cc = s.charCodeAt(i);
		if (cc >= 0x30 && cc <= 0x39 && seen < 2) {
			i++;
			seen++;
		}
		else break;
	}
	while (i < s.length && s[i] === '|') {
		i++;
		while (i < s.length) {
			const cc = s.charCodeAt(i);
			if (cc >= 0x30 && cc <= 0x39) i++;
			else break;
		}
	}
	return i;
}

function isWeeAttr(ch: string | undefined): boolean {
	return ch !== undefined && '%.*!/_|'.includes(ch);
}

function isHexDigit(code: number): boolean {
	return (
		(code >= 0x30 && code <= 0x39) ||
		(code >= 0x41 && code <= 0x46) ||
		(code >= 0x61 && code <= 0x66)
	);
}
