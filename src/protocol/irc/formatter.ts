// IRC text formatter — converts IRC markup to safe HTML

// Valid mIRC color range (0-15 standard, 16-98 extended)
const IRC_COLOR_MAX = 98;

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|avif)(\?[^\s]*)?$/i;
// Hosts that serve images directly even without a file extension
const IMAGE_HOSTS = /^https?:\/\/(i\.imgur\.com|i\.redd\.it|pbs\.twimg\.com|media\.discordapp\.net|cdn\.discordapp\.com|i\.ibb\.co|files\.catbox\.moe)\//i;
// Imgur short URLs: imgur.com/XXXXX (not albums/galleries)
const IMGUR_SHORT = /^https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]+)$/;
const URL_RE = /https?:\/\/[^\s\x00-\x1f<>"]+/g;

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
	const embeds: MediaEmbed[] = [];
	let m: RegExpExecArray | null;
	URL_RE.lastIndex = 0;
	while ((m = URL_RE.exec(text)) !== null) {
		const url = m[0];
		const ytMatch = YOUTUBE_RE.exec(url);
		if (ytMatch) {
			const timeM = YOUTUBE_TIME_RE.exec(ytMatch[2] ?? '');
			const start = timeM
				? (parseInt(timeM[1] ?? '0') * 3600 +
				   parseInt(timeM[2] ?? '0') * 60 +
				   parseInt(timeM[3] ?? '0'))
				: 0;
			embeds.push({ type: 'youtube', videoId: ytMatch[1], start });
			continue;
		}
		const tcMatch = TWITCH_CLIP_RE.exec(url);
		if (tcMatch) { embeds.push({ type: 'twitch_clip', clipId: tcMatch[1] }); continue; }
		const tsMatch = TWITCH_STREAM_RE.exec(url);
		if (tsMatch) { embeds.push({ type: 'twitch_stream', channelId: tsMatch[1], videoId: tsMatch[2] }); continue; }
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
	let out = escaped.replace(/`([^`\n]+)`/g, '<code class="irc-code">$1</code>');
	// Color swatches — append a tiny colored square after each hex code
	out = out.replace(HEX_COLOR_RE, (match) =>
		`${match}<span class="irc-color-swatch" style="background:${match}" aria-hidden="true"></span>`
	);
	// Channel refs — wrap in a button so MessageView can handle click
	out = out.replace(CHAN_REF_RE, (match) =>
		`<button class="irc-chan-ref" data-channel="${match}">${match}</button>`
	);
	return out;
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
	URL_RE.lastIndex = 0;

	while ((match = URL_RE.exec(text)) !== null) {
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
	fg: number | null;
	bg: number | null;
}

function openSpan(state: FormattingState): string {
	const classes: string[] = [];
	const styles: string[] = [];

	if (state.bold) classes.push('irc-bold');
	if (state.italic) classes.push('irc-italic');
	if (state.underline) classes.push('irc-underline');
	if (state.strikethrough) classes.push('irc-strikethrough');
	if (state.monospace) classes.push('irc-mono');
	if (state.fg !== null && state.fg <= IRC_COLOR_MAX) classes.push(`irc-fg-${state.fg}`);
	if (state.bg !== null && state.bg <= IRC_COLOR_MAX) classes.push(`irc-bg-${state.bg}`);

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
		state.fg !== null ||
		state.bg !== null
	);
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
		fg: null,
		bg: null
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
			state.bold = false;
			state.italic = false;
			state.underline = false;
			state.strikethrough = false;
			state.monospace = false;
			state.fg = null;
			state.bg = null;
			i++;
		} else if (code === 0x03) {
			// Color
			flushClose();
			i++;

			let fg: number | null = null;
			let bg: number | null = null;

			// Parse up to 2 digit fg
			if (i < text.length && /\d/.test(text[i])) {
				let numStr = text[i];
				i++;
				if (i < text.length && /\d/.test(text[i])) {
					numStr += text[i];
					i++;
				}
				fg = parseInt(numStr, 10);
			}

			// Parse bg after comma
			if (fg !== null && i < text.length && text[i] === ',') {
				const saved = i;
				i++; // skip comma
				if (i < text.length && /\d/.test(text[i])) {
					let numStr = text[i];
					i++;
					if (i < text.length && /\d/.test(text[i])) {
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
				state.fg = null;
				state.bg = null;
			} else {
				state.fg = fg;
				if (bg !== null) state.bg = bg;
			}

			flushOpen();
		} else if (code === 0x16) {
			// Reverse video — skip (we don't render reverse)
			i++;
		} else if (code === 0x19) {
			// WeeChat internal color attribute — strip it
			i++;
			if (i < text.length) {
				const next = text.charCodeAt(i);
				if (next === 0x1c) {
					// \x19\x1c = reset
					i++;
				} else if (next === 0x40) {
					// \x19@ + 5 chars = extended 256-color pair
					i += 6;
				} else if (next === 0x46 || next === 0x42 || next === 0x2a || next === 0x7e) {
					// \x19{F|B|*|~} + decimal color number (variable length)
					i++; // skip type byte
					while (i < text.length) {
						const cc = text.charCodeAt(i);
						if ((cc >= 0x30 && cc <= 0x39) || cc === 0x7c || cc === 0x2c) i++;
						else break;
					}
				} else if (next >= 0x30 && next <= 0x39) {
					// \x19 + 2-char basic color pair (WeeChat terminal colors, fixed width)
					i += 2; // skip exactly 2 chars
				}
				// else: unknown subcode, just consumed \x19
			}
		} else if (code === 0x1a || code === 0x1b) {
			// WeeChat attr set/remove — 1-byte opcode + 1-byte attr
			i += 2;
		} else if (code === 0x1c) {
			// WeeChat reset all
			flushClose();
			state.bold = false; state.italic = false; state.underline = false;
			state.strikethrough = false; state.monospace = false;
			state.fg = null; state.bg = null;
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
	// \x19 + subcode + spec (when \x19 survived)
	// Orphaned @ + 5-char extended pair (when \x19 was dropped)
	// Only strip when all 5 chars are digits or '|' (WeeChat color index chars)
	return text.replace(/@[\d|,]{5}/g, '');
}

/**
 * Format IRC text to safe HTML.
 * Handles IRC formatting codes, URL linkification, and optional inline images.
 */
export function formatText(text: string, inlineImages: boolean = false): string {
	// Pre-strip orphaned WeeChat extended color specs (when \x19 was lost in transit)
	const cleaned = preStripWeeColors(text);
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
	// eslint-disable-next-line no-control-regex
	return text.replace(/[\x02\x03\x0f\x11\x1d\x1e\x1f](\d{1,2}(,\d{1,2})?)?/g, '');
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
	return palette[Math.abs(hash) % palette.length];
}
