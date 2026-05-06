export interface ParsedCommand {
	command: string;   // lowercase, with leading slash, e.g. "/join"
	args: string[];    // whitespace-split arguments
	raw: string;       // original input text, unchanged
}

/**
 * Parse a line of input.  Returns a ParsedCommand when the input starts with '/',
 * null otherwise (plain chat text).
 */
export function parseInput(text: string): ParsedCommand | null {
	const trimmed = text.trimStart();
	if (!trimmed.startsWith('/')) return null;

	// Split on first space to separate command from arguments
	const spaceIdx = trimmed.indexOf(' ');
	const cmdPart = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
	const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

	const command = cmdPart.toLowerCase();
	// Split rest into args, preserving quoted strings as single tokens
	const args = rest.length > 0 ? splitArgs(rest) : [];

	return { command, args, raw: text };
}

/**
 * Split an argument string on whitespace, respecting double-quoted spans.
 * Unmatched quotes are treated as regular text.
 */
function splitArgs(s: string): string[] {
	const args: string[] = [];
	let current = '';
	let inQuote = false;

	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === '"') {
			inQuote = !inQuote;
		} else if (ch === ' ' && !inQuote) {
			if (current.length > 0) {
				args.push(current);
				current = '';
			}
		} else {
			current += ch;
		}
	}
	if (current.length > 0) args.push(current);
	return args;
}

// Commands that are handled entirely client-side (not forwarded to WeeChat)
const CLIENT_SIDE = new Set(['/clear', '/close', '/help', '/reconnect']);

// Help text for client-side commands
const HELP: Record<string, string> = {
	'/away':      '/away [message] — Set away with optional message',
	'/back':      '/back — Remove away status',
	'/ban':       '/ban <nick|mask> — Ban a user from the channel',
	'/clear':     '/clear — Clear the current buffer\'s visible messages',
	'/close':     '/close — Close the current buffer (sends /part if in a channel)',
	'/deop':      '/deop <nick> — Remove channel op from a user',
	'/devoice':   '/devoice <nick> — Remove voice from a user',
	'/help':      '/help [command] — Show help',
	'/ignore':    '/ignore <nick|mask> — Ignore a user (WeeChat-side)',
	'/invite':    '/invite <nick> <channel> — Invite a user to a channel',
	'/join':      '/join <channel> [key] — Join a channel',
	'/kick':      '/kick <nick> [reason] — Kick a user from the channel',
	'/list':      '/list [filter] — List channels',
	'/me':        '/me <action> — Send a CTCP ACTION',
	'/mode':      '/mode [target] [modes] [params] — Set channel or user modes',
	'/msg':       '/msg <target> <message> — Send a private message',
	'/nick':      '/nick <newnick> — Change your nickname',
	'/notice':    '/notice <target> <message> — Send a NOTICE',
	'/op':        '/op <nick> — Give channel op to a user',
	'/part':      '/part [channel] [reason] — Leave a channel',
	'/query':     '/query <nick> — Open a private message window',
	'/quit':      '/quit [reason] — Disconnect from the server',
	'/reconnect': '/reconnect — Reconnect to the relay',
	'/server':    '/server <host> [port] [tls] — Connect to a different server',
	'/topic':     '/topic [new topic] — View or set channel topic',
	'/unban':     '/unban <nick|mask> — Unban a user',
	'/voice':     '/voice <nick> — Give voice to a user',
	'/whois':     '/whois <nick> — Request WHOIS information'
};

export interface CommandHandlerContext {
	activeBuffer: string | null;
	sendInput: (buf: string, text: string) => void;
	clearBuffer?: (buf: string) => void;
	closeBuffer?: (buf: string) => void;
	reconnect?: () => void;
	addSystemLine?: (text: string) => void;
}

/**
 * Handle a parsed command.
 *
 * Client-side commands (/clear, /close, /help, /reconnect) are executed
 * directly using the supplied context callbacks.  All other commands are
 * forwarded verbatim to WeeChat via sendInput so that WeeChat's own command
 * handler can process them — this avoids duplicating WeeChat's logic.
 */
export function handleCommand(
	cmd: ParsedCommand,
	activeBuffer: string | null,
	sendInput: (buf: string, text: string) => void,
	ctx?: Partial<CommandHandlerContext>
): void {
	const buf = activeBuffer;

	switch (cmd.command) {
		case '/clear': {
			if (buf && ctx?.clearBuffer) ctx.clearBuffer(buf);
			return;
		}

		case '/close': {
			if (buf && ctx?.closeBuffer) ctx.closeBuffer(buf);
			return;
		}

		case '/reconnect': {
			if (ctx?.reconnect) ctx.reconnect();
			return;
		}

		case '/help': {
			const target = cmd.args[0]
				? (cmd.args[0].startsWith('/') ? cmd.args[0] : `/${cmd.args[0]}`).toLowerCase()
				: '';

			if (target && HELP[target]) {
				ctx?.addSystemLine?.(HELP[target]);
			} else if (target) {
				ctx?.addSystemLine?.(`No help for ${target}`);
			} else {
				ctx?.addSystemLine?.('Available commands:');
				for (const line of Object.values(HELP)) {
					ctx?.addSystemLine?.(line);
				}
			}
			return;
		}

		default: {
			// Forward everything else to WeeChat as raw input.
			// WeeChat's relay `input` command passes the text directly to the
			// buffer's input handler, including commands like /join, /part, etc.
			if (buf) {
				sendInput(buf, cmd.raw.trimStart());
			}
			return;
		}
	}
}

// List of all known commands (used for tab completion)
export const COMMANDS = Object.keys(HELP) as (keyof typeof HELP)[];
