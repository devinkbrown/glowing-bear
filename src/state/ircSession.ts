/**
 * The active first-party IRC socket (kind C session, or kind B extras).
 * Services / IRCX / MEDIA must send on this client, not `/quote` through WeeChat.
 */

import type { IRCClient } from '@/lib/irc/client';

let active: IRCClient | null = null;

export function setActiveIrcSession(client: IRCClient | null): void {
  active = client;
}

export function getActiveIrcSession(): IRCClient | null {
  return active;
}

/** Send a preformatted IRC command (no CR/LF) on the active session. */
export function sendOnIrcSession(line: string): boolean {
  const client = active;
  if (!client) return false;
  const trimmed = line.replace(/[\r\n]/g, '').trim();
  if (!trimmed) return false;
  return client.send(`${trimmed}\r\n`);
}
