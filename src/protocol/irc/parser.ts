import type { IrcMessage } from './types';

/**
 * Parse a raw IRC line into an IrcMessage object.
 * Handles IRCv3 message tags, prefix, command, and params.
 */
export function parseIRC(raw: string): IrcMessage {
	const tags = new Map<string, string>();
	let prefix: string | null = null;
	let rest = raw;

	// Strip trailing \r\n
	rest = rest.replace(/\r?\n$/, '');

	// Parse IRCv3 message tags
	if (rest.startsWith('@')) {
		const spaceIdx = rest.indexOf(' ');
		if (spaceIdx === -1) {
			return { tags, prefix, command: '', params: [] };
		}
		const tagStr = rest.slice(1, spaceIdx);
		rest = rest.slice(spaceIdx + 1);

		for (const tag of tagStr.split(';')) {
			if (!tag) continue;
			const eqIdx = tag.indexOf('=');
			if (eqIdx === -1) {
				tags.set(tag, '');
			} else {
				const key = tag.slice(0, eqIdx);
				const val = unescapeTagValue(tag.slice(eqIdx + 1));
				tags.set(key, val);
			}
		}
	}

	// Parse prefix
	if (rest.startsWith(':')) {
		const spaceIdx = rest.indexOf(' ');
		if (spaceIdx === -1) {
			return { tags, prefix: rest.slice(1), command: '', params: [] };
		}
		prefix = rest.slice(1, spaceIdx);
		rest = rest.slice(spaceIdx + 1);
	}

	// Parse command and params
	const params: string[] = [];
	let command = '';

	const parts = rest.split(' ');
	command = parts[0] ?? '';
	let i = 1;
	while (i < parts.length) {
		if (parts[i].startsWith(':')) {
			// Trailing param — rest of line
			params.push(parts.slice(i).join(' ').slice(1));
			break;
		} else if (parts[i] !== '') {
			params.push(parts[i]);
		}
		i++;
	}

	return { tags, prefix, command, params };
}

/**
 * Format an IrcMessage (or partial) back into a raw IRC line.
 */
export function formatIRC(msg: Partial<IrcMessage>): string {
	const parts: string[] = [];

	if (msg.tags && msg.tags.size > 0) {
		const tagStr = Array.from(msg.tags.entries())
			.map(([k, v]) => (v ? `${k}=${escapeTagValue(v)}` : k))
			.join(';');
		parts.push(`@${tagStr}`);
	}

	if (msg.prefix) {
		parts.push(`:${msg.prefix}`);
	}

	if (msg.command) {
		parts.push(msg.command);
	}

	if (msg.params && msg.params.length > 0) {
		const lastIdx = msg.params.length - 1;
		for (let i = 0; i < lastIdx; i++) {
			parts.push(msg.params[i]);
		}
		const last = msg.params[lastIdx];
		// Trailing param: must use colon if it contains a space or starts with colon
		if (last.includes(' ') || last.startsWith(':') || last === '') {
			parts.push(`:${last}`);
		} else {
			parts.push(last);
		}
	}

	return parts.join(' ');
}

/**
 * Parse a prefix string into nick/ident/host components.
 */
export function parsePrefix(prefix: string): { nick: string; ident: string; host: string } {
	const bangIdx = prefix.indexOf('!');
	const atIdx = prefix.indexOf('@');

	if (bangIdx !== -1 && atIdx !== -1 && atIdx > bangIdx) {
		return {
			nick: prefix.slice(0, bangIdx),
			ident: prefix.slice(bangIdx + 1, atIdx),
			host: prefix.slice(atIdx + 1)
		};
	} else if (atIdx !== -1) {
		return {
			nick: prefix.slice(0, atIdx),
			ident: '',
			host: prefix.slice(atIdx + 1)
		};
	}
	return { nick: prefix, ident: '', host: '' };
}

function unescapeTagValue(val: string): string {
	return val
		.replace(/\\:/g, ';')
		.replace(/\\s/g, ' ')
		.replace(/\\\\/g, '\\')
		.replace(/\\r/g, '\r')
		.replace(/\\n/g, '\n');
}

function escapeTagValue(val: string): string {
	return val
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\:')
		.replace(/ /g, '\\s')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n');
}
