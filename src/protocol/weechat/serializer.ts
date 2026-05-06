/**
 * Serialize commands to send to the WeeChat relay.
 *
 * WeeChat relay protocol commands are plain text lines of the form:
 *   (id) command arg1 arg2 ...\n
 *
 * The id is optional; when omitted the server will not correlate the response.
 */

/**
 * Build a raw relay command string.
 * @param id  - correlation id, included as "(id) " prefix when non-empty
 * @param command - relay command verb
 * @param args - additional arguments, joined by spaces
 */
export function cmd(id: string, command: string, ...args: string[]): string {
	const prefix = id ? `(${id}) ` : '';
	const parts = [command, ...args.filter((a) => a !== '')];
	return prefix + parts.join(' ') + '\n';
}

/**
 * Send relay init to authenticate and negotiate compression.
 * Must be the first command sent after the WebSocket opens.
 */
export function initCmd(password: string, compression: boolean): string {
	// WeeChat relay expects comma-separated options for init
	const opts = [`password=${password}`, `compression=${compression ? 'zlib' : 'off'}`].join(',');
	return `init ${opts}\n`;
}

/**
 * Subscribe to buffer events. When buffers is omitted or empty, subscribes
 * to all buffers with `sync *`. Otherwise syncs each named buffer.
 */
export function syncCmd(buffers?: string[]): string {
	if (!buffers || buffers.length === 0) {
		return cmd('', 'sync', '*');
	}
	return buffers.map((b) => cmd('', 'sync', b)).join('');
}

/**
 * Unsubscribe from buffer events.
 */
export function desyncCmd(buffers?: string[]): string {
	if (!buffers || buffers.length === 0) {
		return cmd('', 'desync', '*');
	}
	return buffers.map((b) => cmd('', 'desync', b)).join('');
}

/**
 * Send text input to a WeeChat buffer (same as typing in WeeChat).
 */
export function inputCmd(buffer: string, text: string): string {
	return cmd('', 'input', buffer, text);
}

/**
 * Request a WeeChat info value by name.
 * @param id   - correlation id for the response message
 * @param name - info name, e.g. "version"
 */
export function infoCmd(id: string, name: string): string {
	return cmd(id, 'info', name);
}

/**
 * Request hdata (structured data) from WeeChat.
 *
 * @param id      - correlation id
 * @param path    - hdata path, e.g. "buffer:gui_buffers(*)" or
 *                  "buffer:0x1234/lines/line/line_data"
 * @param keys    - list of field names to return, e.g. ["number","name","title"]
 * @param options - optional count (positive = first N, negative = last N)
 */
export function hdataCmd(
	id: string,
	path: string,
	keys: string[],
	options?: { count?: number }
): string {
	let fullPath = path;
	if (options?.count !== undefined) {
		// Append count modifier to path, e.g. "buffer:gui_buffers(*) 0 100"
		// WeeChat hdata count is a separate argument after the path
		return cmd(id, 'hdata', fullPath, String(options.count), keys.join(','));
	}
	return cmd(id, 'hdata', fullPath, keys.join(','));
}

/**
 * Request the nicklist for a buffer.
 * @param id     - correlation id
 * @param buffer - buffer pointer or full name
 */
export function nicklistCmd(id: string, buffer: string): string {
	return cmd(id, 'nicklist', buffer);
}

/**
 * Cleanly terminate the relay session.
 */
export function quitCmd(): string {
	return cmd('', 'quit');
}
