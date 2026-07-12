// IRC text formatter — converts IRC markup to safe HTML

// Valid mIRC color range (0-15 standard, 16-98 extended)
const IRC_COLOR_MAX = 98;

/**
 * Hard input cap for the live render/embed path.
 *
 * A relay line is fully attacker-controlled. formatText and extractEmbeds run a
 * battery of regexes (some mildly super-linear, e.g. YOUTUBE_RE) on the main
 * thread, and message rows re-run on scroll remount, so an uncapped multi-KB
 * line is a main-thread DoS. Every entry point truncates to this bound BEFORE
 * any pass. Chosen to comfortably exceed any legitimate IRC line.
 */
export const MAX_FORMAT_LENGTH = 4000;

// Non-URL, single-char marker appended when a line is truncated at the cap.
const TRUNCATION_MARKER = '…';

/** Truncate attacker-controlled input to the hard cap before any parse pass. */
function capInput(text: string): string {
	if (text.length <= MAX_FORMAT_LENGTH) return text;
	return text.slice(0, MAX_FORMAT_LENGTH) + TRUNCATION_MARKER;
}

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|avif)(\?[^\s]*)?$/i;
// Hosts that serve images directly even without a file extension
const IMAGE_HOSTS = /^https?:\/\/(i\.imgur\.com|i\.redd\.it|pbs\.twimg\.com|media\.discordapp\.net|cdn\.discordapp\.com|i\.ibb\.co|files\.catbox\.moe)\//i;
// Imgur short URLs: imgur.com/XXXXX (not albums/galleries)
const IMGUR_SHORT = /^https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]+)$/;
const URL_RE_SRC = /https?:\/\/[^\s\x00-\x1f<>"]+/;

// ── Embed detection regexps ───────────────────────────────────────────────────
const YOUTUBE_RE = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})([^)\s]*)?/i;
const YOUTUBE_TIME_RE = /[?&]t=(?:(\d+)h)?(?:(\d+)m)?(\d+)s?/;
const TWITCH_CLIP_RE = /clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/i;
const TWITCH_STREAM_RE = /(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]+)(?:\/video\/(\d+))?/i;
const VIDEO_EXT = /\.(mp4|webm|mov|ogv|gifv)(\?[^\s]*)?$/i;
const AUDIO_EXT = /\.(mp3|ogg|flac|wav|m4a|aac|opus)(\?[^\s]*)?$/i;

export type MediaEmbed =
	| { type: 'youtube';       videoId: string; start: number }
	| { type: 'twitch_clip';   clipId: string }
	| { type: 'twitch_stream'; channelId: string; videoId?: string }
	| { type: 'video';         url: string }
	| { type: 'audio';         url: string };

/** Extract rich media embeds from a message string (for rendering below the line). */
export function extractEmbeds(text: string): MediaEmbed[] {
	const capped = capInput(text);
	const embeds: MediaEmbed[] = [];
	let m: RegExpExecArray | null;
	const urlRe = new RegExp(URL_RE_SRC.source, 'g');
	while ((m = urlRe.exec(capped)) !== null) {
		const url = m[0];
		const ytMatch = YOUTUBE_RE.exec(url);
		if (ytMatch) {
			const timeM = YOUTUBE_TIME_RE.exec(ytMatch[2] ?? '');
			const start = timeM
				? (parseInt(timeM[1] ?? '0') * 3600 +
				   parseInt(timeM[2] ?? '0') * 60 +
				   parseInt(timeM[3] ?? '0'))
				: 0;
			embeds.push({ type: 'youtube', videoId: ytMatch[1]!, start });
			continue;
		}
		const tcMatch = TWITCH_CLIP_RE.exec(url);
		if (tcMatch) { embeds.push({ type: 'twitch_clip', clipId: tcMatch[1]! }); continue; }
		const tsMatch = TWITCH_STREAM_RE.exec(url);
		if (tsMatch) { embeds.push({ type: 'twitch_stream', channelId: tsMatch[1]!, videoId: tsMatch[2] }); continue; }
		if (VIDEO_EXT.test(url)) { embeds.push({ type: 'video', url }); continue; }
		if (AUDIO_EXT.test(url)) { embeds.push({ type: 'audio', url }); continue; }
	}
	return embeds;
}

// ── Inline annotation patterns ────────────────────────────────────────────────
// Hex color: #RRGGBB or #RGB at a word boundary, not preceded by alphanumeric or #
const HEX_COLOR_RE = /(?<![a-zA-Z0-9#])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
// IRC channel reference: #channel or ##channel (preceded by space/start)
const CHAN_REF_RE = /(?:^|(?<=[\s,;]))(##?[a-zA-Z][a-zA-Z0-9_.-]*)/g;

/** Add inline color swatches, channel refs, and code spans to an already-escaped text segment. */
function annotateText(escaped: string): string {
	// Inline code: `code` → <code>
	const withCode = escaped.replace(/`([^`\n]+)`/g, '<code class="irc-code">$1</code>');

	return withCode
		.split(/(<[^>]+>)/g)
		.map((part) => {
			if (part.startsWith('<') && part.endsWith('>')) return part;

			// Color swatches — append a tiny colored square after each hex code
			let out = part.replace(HEX_COLOR_RE, (match) =>
				`${match}<span class="irc-color-swatch" style="background:${match}" aria-hidden="true"></span>`
			);
			// Channel refs — wrap in a button so MessageView can handle click
			out = out.replace(CHAN_REF_RE, (match) =>
				`<button class="irc-chan-ref" data-channel="${match}">${match}</button>`
			);
			return out;
		})
		.join('');
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

interface Token {
	type: 'text' | 'url' | 'image';
	value: string;
	display?: string; // original URL shown as link text (for rewritten URLs like imgur)
}

/**
 * Split text into URL and non-URL tokens (before HTML escaping).
 */
function tokenizeUrls(text: string): Token[] {
	const tokens: Token[] = [];
	let lastIdx = 0;
	let match: RegExpExecArray | null;
	const urlRe = new RegExp(URL_RE_SRC.source, 'g');

	while ((match = urlRe.exec(text)) !== null) {
		if (match.index > lastIdx) {
			tokens.push({ type: 'text', value: text.slice(lastIdx, match.index) });
		}
		const url = match[0];
		const imgurMatch = IMGUR_SHORT.exec(url);
		if (imgurMatch) {
			// Rewrite imgur.com/XXXXX → i.imgur.com/XXXXX.jpg for inline display
			tokens.push({ type: 'image', value: `https://i.imgur.com/${imgurMatch[1]}.jpg`, display: url });
		} else if (IMAGE_EXTENSIONS.test(url) || IMAGE_HOSTS.test(url)) {
			tokens.push({ type: 'image', value: url });
		} else {
			tokens.push({ type: 'url', value: url });
		}
		lastIdx = match.index + url.length;
	}
	if (lastIdx < text.length) {
		tokens.push({ type: 'text', value: text.slice(lastIdx) });
	}
	return tokens;
}

interface FormattingState {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strikethrough: boolean;
	monospace: boolean;
	reverse: boolean;
	fg: number | null;
	bg: number | null;
	fgHex: string | null;
	bgHex: string | null;
}

function openSpan(state: FormattingState): string {
	const classes: string[] = [];
	const styles: string[] = [];

	if (state.bold) classes.push('irc-bold');
	if (state.italic) classes.push('irc-italic');
	if (state.underline) classes.push('irc-underline');
	if (state.strikethrough) classes.push('irc-strikethrough');
	if (state.monospace) classes.push('irc-mono');

	const fg = state.reverse ? state.bg : state.fg;
	const bg = state.reverse ? state.fg : state.bg;
	const fgHex = state.reverse ? state.bgHex : state.fgHex;
	const bgHex = state.reverse ? state.fgHex : state.bgHex;

	if (fg !== null && fg <= IRC_COLOR_MAX) classes.push(`irc-fg-${fg}`);
	if (bg !== null && bg <= IRC_COLOR_MAX) classes.push(`irc-bg-${bg}`);
	if (fgHex !== null) styles.push(`color:${fgHex}`);
	if (bgHex !== null) styles.push(`background-color:${bgHex}`);
	if (state.reverse && fg === null && bg === null && fgHex === null && bgHex === null) {
		classes.push('irc-reverse');
	}

	if (classes.length === 0 && styles.length === 0) return '';

	let tag = '<span';
	if (classes.length > 0) tag += ` class="${classes.join(' ')}"`;
	if (styles.length > 0) tag += ` style="${styles.join(';')}"`;
	tag += '>';
	return tag;
}

function hasFormatting(state: FormattingState): boolean {
	return (
		state.bold ||
		state.italic ||
		state.underline ||
		state.strikethrough ||
		state.monospace ||
		state.reverse ||
		state.fg !== null ||
		state.bg !== null ||
		state.fgHex !== null ||
		state.bgHex !== null
	);
}

function isHexDigit(ch: string | undefined): boolean {
	return ch !== undefined && /^[0-9a-fA-F]$/.test(ch);
}

function parseHexColor(text: string, start: number): { value: string | null; next: number } {
	let value = '';
	let next = start;

	while (next < text.length && value.length < 6 && isHexDigit(text[next])) {
		value += text[next];
		next++;
	}

	if (value.length !== 6) {
		return { value: null, next };
	}

	return { value: `#${value.toLowerCase()}`, next };
}

function isWeeAttr(ch: string | undefined): boolean {
	return ch !== undefined && '%.*!/_|'.includes(ch);
}

function parseWeeColorSpec(text: string, start: number): { value: number | null; next: number } {
	if (start >= text.length) return { value: null, next: start };

	let next = start;
	if (text[start] === '@') {
		next++;
		while (next < text.length && isWeeAttr(text[next])) next++;
		const digitsStart = next;
		while (next < text.length && /\d/.test(text[next]!) && next - digitsStart < 5) next++;
		const digits = text.slice(digitsStart, next);
		return { value: digits.length === 5 ? parseInt(digits, 10) : null, next };
	}

	while (next < text.length && isWeeAttr(text[next])) next++;
	let digits = '';
	while (next < text.length && /\d/.test(text[next]!) && digits.length < 2) {
		digits += text[next];
		next++;
	}

	while (next < text.length && text[next] === '|') {
		next++;
		while (next < text.length && /\d/.test(text[next]!)) next++;
	}

	return { value: digits ? parseInt(digits, 10) : null, next };
}

const WEECHAT_STANDARD_COLOR_HEX: readonly (string | null)[] = [
	null,      // default
	'#000000', // black
	'#555555', // dark gray
	'#aa0000', // dark red
	'#ff5555', // light red
	'#00aa00', // dark green
	'#55ff55', // light green
	'#aa5500', // brown
	'#ffff55', // yellow
	'#0000aa', // dark blue
	'#5555ff', // light blue
	'#aa00aa', // dark magenta
	'#ff55ff', // light magenta
	'#00aaaa', // dark cyan
	'#55ffff', // light cyan
	'#aaaaaa', // gray
	'#ffffff', // white
];

const WEECHAT_OPTION_COLOR_HEX: Record<number, string | null> = {
	0: '#64748b',
	1: null,
	2: '#64748b',
	3: '#94a3b8',
	4: '#ff5555',
	5: '#ff55ff',
	6: '#f59e0b',
	7: '#55ff55',
	8: '#ff5555',
	9: '#94a3b8',
	10: '#94a3b8',
	11: '#60a5fa',
	12: '#60a5fa',
	13: '#5eead4',
	14: '#55ffff',
	15: '#ffffff',
	16: '#55ffff',
	27: '#55ffff',
	28: '#16a34a',
	29: '#ffff55',
	30: '#ff55ff',
	31: '#f97316',
	32: '#55ff55',
	33: '#60a5fa',
	38: '#64748b',
	39: '#ffff55',
	40: '#94a3b8',
	41: '#94a3b8',
	42: '#f97316',
	43: '#64748b',
	44: '#94a3b8',
	45: '#ef4444',
	46: '#22c55e',
};

function xterm256Color(index: number): string | null {
	if (index < 0 || index > 255) return null;
	if (index < 8) return ANSI_NORMAL[index] ?? null;
	if (index < 16) return ANSI_BRIGHT[index - 8] ?? null;
	if (index >= 232) {
		const c = 8 + (index - 232) * 10;
		const hex = c.toString(16).padStart(2, '0');
		return `#${hex}${hex}${hex}`;
	}

	const n = index - 16;
	const component = (value: number) => (value === 0 ? 0 : 55 + value * 40);
	const r = component(Math.floor(n / 36));
	const g = component(Math.floor((n % 36) / 6));
	const b = component(n % 6);
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const ANSI_NORMAL: readonly string[] = [
	'#000000', '#cd0000', '#00cd00', '#cdcd00',
	'#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
];

const ANSI_BRIGHT: readonly string[] = [
	'#7f7f7f', '#ff0000', '#00ff00', '#ffff00',
	'#5c5cff', '#ff00ff', '#00ffff', '#ffffff',
];

function rgbColor(r: number, g: number, b: number): string | null {
	if (
		!Number.isInteger(r) || !Number.isInteger(g) || !Number.isInteger(b) ||
		r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255
	) {
		return null;
	}
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function applyAnsiSgr(state: FormattingState, params: number[]): void {
	const codes = params.length > 0 ? params : [0];
	for (let i = 0; i < codes.length; i++) {
		const code = codes[i] ?? 0;
		if (code === 0) resetFormattingState(state);
		else if (code === 1) state.bold = true;
		else if (code === 3) state.italic = true;
		else if (code === 4) state.underline = true;
		else if (code === 7) state.reverse = true;
		else if (code === 9) state.strikethrough = true;
		else if (code === 22) state.bold = false;
		else if (code === 23) state.italic = false;
		else if (code === 24) state.underline = false;
		else if (code === 27) state.reverse = false;
		else if (code === 29) state.strikethrough = false;
		else if (code === 39) {
			state.fg = null;
			state.fgHex = null;
		} else if (code === 49) {
			state.bg = null;
			state.bgHex = null;
		} else if (code >= 30 && code <= 37) {
			state.fg = null;
			state.fgHex = ANSI_NORMAL[code - 30] ?? null;
		} else if (code >= 40 && code <= 47) {
			state.bg = null;
			state.bgHex = ANSI_NORMAL[code - 40] ?? null;
		} else if (code >= 90 && code <= 97) {
			state.fg = null;
			state.fgHex = ANSI_BRIGHT[code - 90] ?? null;
		} else if (code >= 100 && code <= 107) {
			state.bg = null;
			state.bgHex = ANSI_BRIGHT[code - 100] ?? null;
		} else if ((code === 38 || code === 48) && i + 2 < codes.length) {
			const target = code;
			const mode = codes[++i];
			let color: string | null = null;
			if (mode === 5) {
				color = xterm256Color(codes[++i] ?? -1);
			} else if (mode === 2 && i + 3 < codes.length) {
				color = rgbColor(codes[++i] ?? -1, codes[++i] ?? -1, codes[++i] ?? -1);
			}
			if (color) {
				if (target === 38) {
					state.fg = null;
					state.fgHex = color;
				} else {
					state.bg = null;
					state.bgHex = color;
				}
			}
		}
	}
}

function setForegroundColor(state: FormattingState, value: number | null): void {
	if (value === null) return;
	if (value >= 0 && value <= IRC_COLOR_MAX) {
		state.fg = value;
		state.fgHex = null;
		return;
	}

	const hex = xterm256Color(value);
	if (hex) {
		state.fg = null;
		state.fgHex = hex;
	}
}

function setWeeForegroundColor(state: FormattingState, value: number | null): void {
	if (value === null) return;
	const hex = WEECHAT_STANDARD_COLOR_HEX[value] ?? xterm256Color(value);
	state.fg = null;
	state.fgHex = hex;
}

function setWeeBackgroundColor(state: FormattingState, value: number | null): void {
	if (value === null) return;
	const hex = WEECHAT_STANDARD_COLOR_HEX[value] ?? xterm256Color(value);
	state.bg = null;
	state.bgHex = hex;
}

function setWeeOptionColor(state: FormattingState, value: number | null): void {
	if (value === null) return;
	const hex: string | null = Object.prototype.hasOwnProperty.call(WEECHAT_OPTION_COLOR_HEX, value)
		? (WEECHAT_OPTION_COLOR_HEX[value] ?? null)
		: xterm256Color(value);
	state.fg = null;
	state.fgHex = hex;
}

function resetFormattingState(state: FormattingState): void {
	state.bold = false;
	state.italic = false;
	state.underline = false;
	state.strikethrough = false;
	state.monospace = false;
	state.reverse = false;
	state.fg = null;
	state.bg = null;
	state.fgHex = null;
	state.bgHex = null;
}

function resetColorState(state: FormattingState): void {
	state.fg = null;
	state.bg = null;
	state.fgHex = null;
	state.bgHex = null;
}

/**
 * Apply IRC color/formatting codes to a plain text segment.
 * Returns HTML string (text in the segment is already HTML-escaped).
 */
function applyIrcFormatting(text: string): string {
	const state: FormattingState = {
		bold: false,
		italic: false,
		underline: false,
		strikethrough: false,
		monospace: false,
		reverse: false,
		fg: null,
		bg: null,
		fgHex: null,
		bgHex: null
	};

	let output = '';
	let i = 0;
	let spanOpen = false;

	const flushClose = () => {
		if (spanOpen) {
			output += '</span>';
			spanOpen = false;
		}
	};

	const flushOpen = () => {
		if (hasFormatting(state)) {
			const tag = openSpan(state);
			if (tag) {
				output += tag;
				spanOpen = true;
			}
		}
	};

	while (i < text.length) {
		const ch = text[i];
		const code = text.charCodeAt(i);

		if (code === 0x01 || code === 0x07) {
			// \x01 = CTCP delimiter, \x07 = BEL — strip silently
			i++;
		} else if (code === 0x02) {
			// Bold
			flushClose();
			state.bold = !state.bold;
			flushOpen();
			i++;
		} else if (code === 0x1d) {
			// Italic
			flushClose();
			state.italic = !state.italic;
			flushOpen();
			i++;
		} else if (code === 0x1f) {
			// Underline
			flushClose();
			state.underline = !state.underline;
			flushOpen();
			i++;
		} else if (code === 0x1e) {
			// Strikethrough
			flushClose();
			state.strikethrough = !state.strikethrough;
			flushOpen();
			i++;
		} else if (code === 0x11) {
			// Monospace
			flushClose();
			state.monospace = !state.monospace;
			flushOpen();
			i++;
		} else if (code === 0x0f) {
			// Reset all
			flushClose();
			resetFormattingState(state);
			i++;
		} else if (code === 0x03) {
			// Color
			flushClose();
			i++;

			let fg: number | null = null;
			let bg: number | null = null;

			// Parse up to 2 digit fg
			if (i < text.length && /\d/.test(text[i]!)) {
				let numStr = text[i]!;
				i++;
				if (i < text.length && /\d/.test(text[i]!)) {
					numStr += text[i];
					i++;
				}
				fg = parseInt(numStr, 10);
			}

			// Parse bg after comma
			if (fg !== null && i < text.length && text[i] === ',') {
				const saved = i;
				i++; // skip comma
				if (i < text.length && /\d/.test(text[i]!)) {
					let numStr = text[i]!;
					i++;
					if (i < text.length && /\d/.test(text[i]!)) {
						numStr += text[i];
						i++;
					}
					bg = parseInt(numStr, 10);
				} else {
					// No bg number after comma — backtrack
					i = saved;
				}
			}

			if (fg === null) {
				// \x03 with no numbers = reset color
				resetColorState(state);
			} else {
				state.fg = fg;
				state.fgHex = null;
				if (bg !== null) state.bg = bg;
				if (bg !== null) state.bgHex = null;
			}

			flushOpen();
		} else if (code === 0x04) {
			// Hex color: \x04RRGGBB[,RRGGBB]
			flushClose();
			i++;

			const parsedFg = parseHexColor(text, i);
			i = parsedFg.next;

			let parsedBg: { value: string | null; next: number } | null = null;
			if (parsedFg.value !== null && i < text.length && text[i] === ',') {
				const saved = i;
				i++;
				parsedBg = parseHexColor(text, i);
				if (parsedBg.value !== null) {
					i = parsedBg.next;
				} else {
					i = saved;
				}
			}

			if (parsedFg.value === null) {
				resetColorState(state);
			} else {
				state.fgHex = parsedFg.value;
				state.fg = null;
				if (parsedBg?.value != null) {
					state.bgHex = parsedBg.value;
					state.bg = null;
				}
			}

			flushOpen();
		} else if (code === 0x16) {
			// Reverse video
			flushClose();
			state.reverse = !state.reverse;
			flushOpen();
			i++;
		} else if (code === 0x19) {
			// WeeChat relay color attributes, often translated from IRC/mIRC colors.
			flushClose();
			i++;
			if (i < text.length) {
				const next = text.charCodeAt(i);
				if (next === 0x1c) {
					// \x19\x1c = reset
					resetFormattingState(state);
					i++;
				} else if (next === 0x40) {
					// \x19@ + 5 chars = extended 256-color pair
					const fg = parseWeeColorSpec(text, i);
					setForegroundColor(state, fg.value);
					i = fg.next;
				} else if (next === 0x46 || next === 0x42 || next === 0x2a || next === 0x7e ||
				           next === 0x21 || next === 0x5f || next === 0x25) {
					// \x19{F|B|*|~|!|_|%} + color spec. F/B/* affect message text;
					// the other variants are UI chrome colors and are skipped.
					const kind = text[i];
					i++;
					const fg = parseWeeColorSpec(text, i);
					i = fg.next;
					if (kind === 'F') setWeeForegroundColor(state, fg.value);
					else if (kind === 'B') setWeeBackgroundColor(state, fg.value);
					else if (kind === '*') {
						setWeeForegroundColor(state, fg.value);
						if (i < text.length && (text[i] === ',' || text[i] === '~')) {
							i++;
							const bg = parseWeeColorSpec(text, i);
							setWeeBackgroundColor(state, bg.value);
							i = bg.next;
						}
					}
				} else if (next === 0x45) {
					// \x19E = emphasis marker with no color spec.
					i++;
				} else if (next >= 0x30 && next <= 0x39) {
					// \x19 + STD is a WeeChat color option, not an IRC palette index.
					const fg = parseWeeColorSpec(text, i);
					setWeeOptionColor(state, fg.value);
					i = fg.next;
				}
				// else: unknown subcode, just consumed \x19
			}
			flushOpen();
		} else if (code === 0x1a) {
			// WeeChat attr set/remove — 1-byte opcode + 1-byte attr
			i += 2;
		} else if (code === 0x1b) {
			// ANSI SGR, used by the WeeChat relay unless colors=weechat is requested.
			if (i + 1 < text.length && text[i + 1] === '[') {
				const start = i + 2;
				let end = start;
				while (end < text.length && text[end] !== 'm' && end - start < 64) end++;
				if (end < text.length && text[end] === 'm') {
					flushClose();
					const params = text
						.slice(start, end)
						.split(/[;:]/)
						.map((part) => (part === '' ? 0 : Number(part)))
						.filter((value) => Number.isFinite(value));
					applyAnsiSgr(state, params);
					flushOpen();
					i = end + 1;
				} else {
					i++;
				}
			} else {
				i++;
			}
		} else if (code === 0x1c) {
			// WeeChat reset all
			flushClose();
			resetFormattingState(state);
			i++;
		} else {
			output += ch;
			i++;
		}
	}

	flushClose();
	return output;
}

/**
 * Pre-strip bare WeeChat extended color specs that appear when the \x19
 * control byte has been dropped by the relay or TextDecoder.
 * Patterns: \x19@ + 5 chars (already handled in applyIrcFormatting when \x19 is present)
 *           but when \x19 is absent, the leftover `@NNNNN` is literal.
 * `@` + exactly 5 ascii chars in WeeChat's encoding range [0x20-0x7e] is safe to strip.
 */
function preStripWeeColors(text: string): string {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		const validWeeSpec =
			text[i - 1] === '\x19' ||
			(i >= 2 && text[i - 2] === '\x19' && 'FB*~!_%'.includes(text[i - 1]!));
		const orphanedExtended =
			text[i] === '@' &&
			!validWeeSpec &&
			i + 5 < text.length &&
			/^\d{5}$/.test(text.slice(i + 1, i + 6));
		if (orphanedExtended) {
			i += 5;
			continue;
		}
		out += text[i];
	}
	return out;
}

/**
 * Format IRC text to safe HTML.
 * Handles IRC formatting codes, URL linkification, and optional inline images.
 */
export function formatText(text: string, inlineImages: boolean = false): string {
	// Cap attacker-controlled input before any parse pass (main-thread DoS guard).
	const capped = capInput(text);
	// Pre-strip orphaned WeeChat extended color specs (when \x19 was lost in transit)
	const cleaned = preStripWeeColors(capped);
	// First tokenize by URLs (before escaping)
	const tokens = tokenizeUrls(cleaned);
	let result = '';

	for (const token of tokens) {
		if (token.type === 'text') {
			// Escape HTML, apply IRC formatting, then annotate swatches/channel refs
			const escaped = escapeHtml(token.value);
			result += annotateText(applyIrcFormatting(escaped));
		} else if (token.type === 'url') {
			const escapedUrl = escapeHtml(token.value);
			result += `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="irc-link">${escapedUrl}</a>`;
		} else if (token.type === 'image') {
			const escapedUrl = escapeHtml(token.value);
			const escapedDisplay = escapeHtml(token.display ?? token.value);
			if (inlineImages) {
				result += `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="irc-link irc-image-link"><img src="${escapedUrl}" alt="${escapedDisplay}" class="irc-inline-image" loading="lazy" /></a>`;
			} else {
				result += `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="irc-link">${escapedDisplay}</a>`;
			}
		}
	}

	return result;
}

/**
 * Strip all IRC formatting codes from text (for notifications, etc.)
 */
export function stripFormatting(text: string): string {
	return text
		.replace(/\x19\x1c/g, '')
		.replace(/\x19@[%.*!/_|]*\d{0,5}/g, '')
		.replace(/\x19[FB*~!_%](?:@[%.*!/_|]*\d{5}|[%.*!/_|]*\d{0,2}(?:\|\d+)*)(?:[,~](?:@[%.*!/_|]*\d{5}|\d{0,2}(?:\|\d+)*))?/g, '')
		.replace(/\x19E/g, '')
		.replace(/\x19[%.*!/_|]*\d{0,2}(?:[|,~]\d+)*/g, '')
		.replace(/\x19/g, '')
		.replace(/\x1b\[[0-9;:]*m/g, '')
		.replace(/\x1b/g, '')
		.replace(/\x04[0-9a-fA-F]{0,6}(?:,[0-9a-fA-F]{6})?/g, '')
		.replace(/\x03\d{0,2}(?:,\d{1,2})?/g, '')
		.replace(/[\x02\x0f\x11\x16\x1d\x1e\x1f]/g, '');
}

/**
 * Generate a consistent color index (0-15, avoiding dark colors on dark bg) from a nick string.
 */
export function nickColor(nick: string): string {
	// Use colors that are visible on dark background: avoid 0 (white on white), 1 (black)
	const palette = [
		'#ff6b6b', // red-ish
		'#ffd93d', // yellow
		'#6bcb77', // green
		'#4d96ff', // blue
		'#ff9f43', // orange
		'#a29bfe', // lavender
		'#fd79a8', // pink
		'#55efc4', // mint
		'#74b9ff', // sky blue
		'#e17055', // coral
		'#00cec9', // teal
		'#fdcb6e', // amber
		'#6c5ce7', // violet
		'#fab1a0', // peach
		'#81ecec', // cyan
		'#dfe6e9' // light gray
	];

	let hash = 0;
	for (let i = 0; i < nick.length; i++) {
		hash = ((hash << 5) - hash + nick.charCodeAt(i)) | 0;
	}
	return palette[Math.abs(hash) % palette.length]!;
}
