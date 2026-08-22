import type { IRCMessage, StandardReply } from './types';

/**
 * Parse a single IRC line into a structured IRCMessage.
 * Handles IRCv3 message tags (@tag=val;tag2=val2 prefix).
 *
 * Grammar:
 *   ['@' tags SP] [':' prefix SP] command [SP params] [SP ':' trailing]
 */
export function parseIRCMessage(raw: string): IRCMessage {
  let pos = 0;
  const tags: Record<string, string> = {};

  // Strip \r\n and null bytes
  const line = raw.replace(/\r?\n$/, '').replace(/\x00/g, '');

  // Parse tags: @tag=val;tag2;tag3=val3 <space>
  if (line[pos] === '@') {
    pos++;
    const tagEnd = line.indexOf(' ', pos);
    const tagStr = tagEnd === -1 ? line.slice(pos) : line.slice(pos, tagEnd);
    for (const tag of tagStr.split(';')) {
      if (!tag) continue;
      const eq = tag.indexOf('=');
      if (eq === -1) {
        tags[tag] = '';
      } else {
        tags[tag.slice(0, eq)] = unescapeTagValue(tag.slice(eq + 1));
      }
    }
    pos = tagEnd === -1 ? line.length : tagEnd + 1;
  }

  // Parse prefix: :nick!user@host or :server.name
  let prefix: string | null = null;
  let nick: string | null = null;
  let host: string | null = null;

  if (line[pos] === ':') {
    pos++;
    const prefixEnd = line.indexOf(' ', pos);
    prefix = prefixEnd === -1 ? line.slice(pos) : line.slice(pos, prefixEnd);
    pos = prefixEnd === -1 ? line.length : prefixEnd + 1;

    // Extract nick and host from prefix
    const bangIdx = prefix.indexOf('!');
    if (bangIdx !== -1) {
      nick = prefix.slice(0, bangIdx);
      const atIdx = prefix.indexOf('@', bangIdx);
      host = atIdx !== -1 ? prefix.slice(atIdx + 1) : null;
    } else {
      // Could be server name or just a nick
      const atIdx = prefix.indexOf('@');
      if (atIdx !== -1) {
        nick = prefix.slice(0, atIdx);
        host = prefix.slice(atIdx + 1);
      } else {
        // A prefix without user/host can be either a server name or a bare
        // nickname. Server names normally contain a dot; bare JOIN/NICK/etc.
        // prefixes do not. Treat nick-like prefixes as nicks so membership
        // events still populate channel state on minimal IRC daemons/proxies.
        if (prefix.includes('.')) {
          nick = null;
          host = prefix;
        } else {
          nick = prefix;
          host = null;
        }
      }
    }
  }

  // Parse command
  const commandEnd = line.indexOf(' ', pos);
  const command = commandEnd === -1
    ? line.slice(pos).toUpperCase()
    : line.slice(pos, commandEnd).toUpperCase();
  pos = commandEnd === -1 ? line.length : commandEnd + 1;

  // Parse params
  const params: string[] = [];
  while (pos < line.length) {
    if (line[pos] === ':') {
      // trailing param — everything to end
      params.push(line.slice(pos + 1));
      break;
    }
    const spaceIdx = line.indexOf(' ', pos);
    if (spaceIdx === -1) {
      params.push(line.slice(pos));
      break;
    }
    params.push(line.slice(pos, spaceIdx));
    pos = spaceIdx + 1;
  }

  return { tags, prefix, nick, host, command, params, raw: line };
}

/**
 * Unescape IRCv3 tag value escape sequences in a SINGLE left-to-right pass.
 *
 * A chained `.replace()` is order-dependent and wrong: it re-scans already-
 * decoded output, so wire `\\s` (escaped backslash + literal `s`) decodes to
 * "\ " (backslash + SPACE) instead of the correct "\s". Scanning once, on each
 * backslash we consume exactly the next char and map it, so an escaped
 * backslash can never combine with the following escape char. Per spec an
 * unknown escape yields the escaped char itself (backslash dropped) and a lone
 * trailing backslash is dropped.
 */
function unescapeTagValue(val: string): string {
  let out = '';
  for (let i = 0; i < val.length; i++) {
    const c = val[i]!;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const next = val[i + 1];
    if (next === undefined) break; // lone trailing backslash → dropped
    i++;
    switch (next) {
      case ':': out += ';'; break;
      case 's': out += ' '; break;
      case 'r': out += '\r'; break;
      case 'n': out += '\n'; break;
      case '\\': out += '\\'; break;
      default: out += next; break; // unknown escape → the literal char
    }
  }
  return out;
}

/**
 * Strip CR and LF from an outbound IRC token. One frame carries one IRC message
 * with NO embedded newline; a `\r` or `\n` in a param (pasted/crafted text)
 * would split the frame and inject a second command on our own connection
 * (`hi\r\nJOIN #evil`). Newlines are never valid inside a single message, so we
 * drop them.
 */
function stripLineBreaks(token: string): string {
  return token.replace(/[\r\n]/g, '');
}

/**
 * Format a raw IRC line to send.
 * Appends \r\n. Every token (command + params) is stripped of embedded CR/LF so
 * no param can smuggle a second command past the single-message framing.
 */
export function formatIRCLine(command: string, ...params: string[]): string {
  const clean = params.map(stripLineBreaks);
  const parts = [stripLineBreaks(command), ...clean.slice(0, -1)];
  if (clean.length > 0) {
    const last = clean[clean.length - 1]!;
    // Prefix trailing param with ':' if it contains a space or starts with ':'
    if (last === '' || last.includes(' ') || last.startsWith(':')) {
      parts.push(':' + last);
    } else {
      parts.push(last);
    }
  }
  return parts.join(' ') + '\r\n';
}

/**
 * Parse NAMES list prefix characters into a Set of mode letters.
 * Prefix map: { '~': 'q', '@': 'o', '+': 'v', '%': 'h', '&': 'a' }
 */
export function parseNamesPrefix(
  prefixStr: string,
  prefixMap: Record<string, string>
): { nick: string; modes: Set<string> } {
  const modes = new Set<string>();
  let i = 0;
  while (i < prefixStr.length && prefixMap[prefixStr[i]!]) {
    modes.add(prefixMap[prefixStr[i]!]!);
    i++;
  }
  const full = prefixStr.slice(i);
  // userhost-in-names sends nick!user@host — extract just the nick
  const nick = full.split('!')[0]!;
  return { nick, modes };
}

/**
 * Parse 005 ISUPPORT PREFIX value: (qaohv)~&@%+
 * Returns a map of prefix char → mode letter and mode letter → prefix char.
 */
export function parsePREFIX(value: string): {
  modeToPrefix: Record<string, string>;
  prefixToMode: Record<string, string>;
} {
  const modeToPrefix: Record<string, string> = {};
  const prefixToMode: Record<string, string> = {};

  const match = value.match(/^\(([^)]+)\)(.+)$/);
  if (!match) return { modeToPrefix, prefixToMode };

  const modes = match[1]!;
  const prefixes = match[2]!;
  for (let i = 0; i < modes.length; i++) {
    const prefix = prefixes[i];
    modeToPrefix[modes[i]!] = prefix ?? '';
    // Guard the reverse map: when the prefix run is shorter than the mode run
    // `prefixes[i]` is undefined and would key the literal string "undefined".
    if (prefix !== undefined) prefixToMode[prefix] = modes[i]!;
  }
  return { modeToPrefix, prefixToMode };
}

export function parseCHANLIMIT(value: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of value.split(',').filter(Boolean)) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const types = part.slice(0, idx);
    const limit = Number.parseInt(part.slice(idx + 1), 10);
    if (!Number.isFinite(limit)) continue;
    for (const ch of types) out[ch] = limit;
  }
  return out;
}

export function normalizeCase(value: string, casemapping: string): string {
  if (casemapping.toLowerCase() === 'ascii') return value.toLowerCase();
  return value.toLowerCase()
    .replace(/\[/g, '{')
    .replace(/\]/g, '}')
    .replace(/\\/g, '|')
    .replace(/\^/g, '~');
}

export type SaslMechanism = 'SESSION-TOKEN' | 'SCRAM-SHA-512' | 'SCRAM-SHA-256' | 'PLAIN' | 'EXTERNAL';

export function selectSaslMechanism(
  offered: string[],
  opts: { hasPassword: boolean; hasClientCert?: boolean; hasSessionToken?: boolean },
): SaslMechanism | null {
  const mechs = new Set(offered.map(m => m.toUpperCase()));
  // Never ANONYMOUS. EXTERNAL is Tauri/cert later — only when a client cert is present.
  if (mechs.has('SESSION-TOKEN') && opts.hasSessionToken) return 'SESSION-TOKEN';
  if (mechs.has('SCRAM-SHA-512') && opts.hasPassword) return 'SCRAM-SHA-512';
  if (mechs.has('SCRAM-SHA-256') && opts.hasPassword) return 'SCRAM-SHA-256';
  if (mechs.has('PLAIN') && opts.hasPassword) return 'PLAIN';
  if (mechs.has('EXTERNAL') && opts.hasClientCert) return 'EXTERNAL';
  return null;
}

/** True when SESSION resume failed but the stored token must stay (Helix/USR2). */
export function isResumeCredentialPreserved(msg: IRCMessage): boolean {
  const reply = parseStandardReply(msg);
  if (!reply || reply.command !== 'SESSION') return false;
  return reply.code === 'RESUME_CREDENTIAL_PRESERVED'
    || reply.code === 'ORIGIN_UNREACHABLE'
    || reply.code === 'TEMPORARILY_UNAVAILABLE';
}

export interface SaslSessionTokenNotice {
  account: string;
  token: string;
  expiresAt: number;
}

/**
 * Parse Onyx Server's TLS-only post-auth credential notice:
 * `:server NOTICE <nick> :SESSIONTOKEN <account> <sst_...> expires=<unix>`.
 *
 * This is deliberately distinct from `NOTE SESSION TOKEN` / `MTOKEN`, which
 * selects a logical session after authentication. The SASL token only proves
 * the account on a later registration and is accepted only with an explicit
 * finite server expiry.
 */
export function parseSaslSessionTokenNotice(msg: IRCMessage): SaslSessionTokenNotice | null {
  if (msg.command !== 'NOTICE') return null;
  const trailing = msg.params.at(-1) ?? '';
  const match = /^SESSIONTOKEN\s+(\S+)\s+(sst_[a-f\d]{32})\s+expires=(\d+)$/i.exec(trailing);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const expiresAt = Number.parseInt(match[3], 10);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return null;
  return { account: match[1], token: match[2], expiresAt };
}

export function parseStandardReply(msg: IRCMessage): StandardReply | null {
  if (msg.command !== 'NOTE' && msg.command !== 'FAIL' && msg.command !== 'WARN') return null;
  const [command, code, ...rest] = msg.params;
  if (!command) return null;
  const description = rest.length > 0 ? rest[rest.length - 1]! : '';
  const context = rest.length > 1 ? rest.slice(0, -1) : [];
  return {
    kind: msg.command,
    command: command.toUpperCase(),
    code: (code ?? '').toUpperCase(),
    context,
    description,
  };
}

/**
 * Parsed key=value fields from an `ACCOUNTINFO` reply.
 *
 * Onyx Server answers `ACCOUNTINFO` with a server NOTICE in the shape
 * `account=<name> flags=<n>` (server.zig handleAccountInfo); some deployments
 * append `email=`, `secure=on|off`, `enforce=on|off`, and `registered=`.
 * We extract only the keys the server actually sent — absent keys stay
 * undefined so the UI never displays invented values.
 */
export interface AccountInfoFields {
  account?: string;
  flags?: number;
  email?: string;
  secure?: boolean;
  enforce?: boolean;
  registered?: string;
}

function parseBoolToken(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (v === 'on' || v === 'true' || v === 'yes' || v === '1') return true;
  if (v === 'off' || v === 'false' || v === 'no' || v === '0') return false;
  return undefined;
}

/**
 * Parse the body of an ACCOUNTINFO reply (the NOTICE/NOTE trailing text) into
 * structured fields. Returns null when no recognised `key=value` pair is found,
 * so callers can distinguish "this was an ACCOUNTINFO reply" from unrelated
 * account-channel notices. Tolerant of ordering and extra whitespace.
 */
export function parseAccountInfo(text: string): AccountInfoFields | null {
  if (!text) return null;
  const fields: AccountInfoFields = {};
  let matched = false;
  // Match key=value where value runs to the next whitespace (values here are
  // tokens: a name, a number, on/off). Email is also a single token.
  const re = /(\w+)=([^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = m[1]!.toLowerCase();
    const value = m[2]!;
    switch (key) {
      case 'account':
        fields.account = value;
        matched = true;
        break;
      case 'flags': {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n)) {
          fields.flags = n;
          matched = true;
        }
        break;
      }
      case 'email':
        fields.email = value;
        matched = true;
        break;
      case 'secure': {
        const b = parseBoolToken(value);
        if (b !== undefined) {
          fields.secure = b;
          matched = true;
        }
        break;
      }
      case 'enforce': {
        const b = parseBoolToken(value);
        if (b !== undefined) {
          fields.enforce = b;
          matched = true;
        }
        break;
      }
      case 'registered':
        fields.registered = value;
        matched = true;
        break;
      default:
        break;
    }
  }
  return matched ? fields : null;
}

export function parseSessionTokenNote(msg: IRCMessage): string | null {
  const reply = parseStandardReply(msg);
  if (!reply || reply.kind !== 'NOTE' || reply.command !== 'SESSION' || reply.code !== 'TOKEN') return null;
  return reply.description || null;
}

/**
 * Parse `:server NOTE SESSION MTOKEN :<token>` — Onyx Server's mesh-sealed reclaim
 * token, emitted alongside the local TOKEN on mesh deployments. Usable to
 * reclaim/redirect the session from any node via `SESSION RESUME <mtoken>`.
 */
export function parseSessionMeshTokenNote(msg: IRCMessage): string | null {
  const reply = parseStandardReply(msg);
  if (!reply || reply.kind !== 'NOTE' || reply.command !== 'SESSION' || reply.code !== 'MTOKEN') return null;
  return reply.description || null;
}

export function buildSessionResumeLine(token: string): string {
  return formatIRCLine('SESSION', 'RESUME', token);
}

export function parseMonitorNumeric(msg: IRCMessage): {
  kind: 'online' | 'offline' | 'full';
  targets: string[];
  limit?: number;
  description?: string;
} | null {
  if (msg.command === '730' || msg.command === '731') {
    const targets = (msg.params[1] ?? msg.params[0] ?? '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    return { kind: msg.command === '730' ? 'online' : 'offline', targets };
  }
  if (msg.command === '734') {
    const limit = Number.parseInt(msg.params[1] ?? '', 10);
    const targetParam = msg.params.length >= 4 ? msg.params[2]! : '';
    return {
      kind: 'full',
      targets: targetParam.split(',').map(t => t.trim()).filter(Boolean),
      limit: Number.isFinite(limit) ? limit : undefined,
      description: msg.params[msg.params.length - 1] ?? '',
    };
  }
  return null;
}
