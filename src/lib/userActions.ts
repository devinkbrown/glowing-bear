import type { SafeCommandId } from '@/types';

export const MAX_USER_ACTIONS = 50;
export const MAX_USER_ACTION_COMMAND_LENGTH = 2_048;

export type UserActionArgumentKind = 'channel' | 'target' | 'nick' | 'text' | 'optional-text';

export interface UserActionArgument {
  id: string;
  label: string;
  placeholder: string;
  kind: UserActionArgumentKind;
}

export interface SafeCommandDefinition {
  id: SafeCommandId;
  label: string;
  description: string;
  template: string;
  arguments: readonly UserActionArgument[];
}

const arg = (
  id: string,
  label: string,
  placeholder: string,
  kind: UserActionArgumentKind,
): UserActionArgument => ({ id, label, placeholder, kind });

export const SAFE_COMMANDS: readonly SafeCommandDefinition[] = [
  { id: 'join', label: 'Join channel', description: 'Join an IRC channel.', template: '/join {channel}', arguments: [arg('channel', 'Channel', '#darkbear', 'channel')] },
  { id: 'query', label: 'Open query', description: 'Open a direct-message buffer.', template: '/query {nick}', arguments: [arg('nick', 'Nick', 'alice', 'nick')] },
  { id: 'whois', label: 'Whois', description: 'Request public IRC identity details.', template: '/whois {nick}', arguments: [arg('nick', 'Nick', 'alice', 'nick')] },
  { id: 'message', label: 'Send message', description: 'Send a message to a nick or channel.', template: '/msg {target} {message}', arguments: [arg('target', 'Target', '#darkbear or alice', 'target'), arg('message', 'Message', 'Message text', 'text')] },
  { id: 'notice', label: 'Send notice', description: 'Send an IRC NOTICE to a nick or channel.', template: '/notice {target} {message}', arguments: [arg('target', 'Target', '#darkbear or alice', 'target'), arg('message', 'Message', 'Notice text', 'text')] },
  { id: 'me', label: 'Send action', description: 'Send a /me action to the active buffer.', template: '/me {message}', arguments: [arg('message', 'Action', 'waves', 'text')] },
  { id: 'away', label: 'Set away', description: 'Set or clear your away message.', template: '/away {message?}', arguments: [arg('message', 'Away message (optional)', 'Back later', 'optional-text')] },
  { id: 'nick', label: 'Change nick', description: 'Request a new IRC nickname.', template: '/nick {nick}', arguments: [arg('nick', 'Nick', 'new-nick', 'nick')] },
  { id: 'monitor-add', label: 'Monitor nick', description: 'Add a nick to IRCv3 MONITOR.', template: '/monitor add {nick}', arguments: [arg('nick', 'Nick', 'alice', 'nick')] },
  { id: 'monitor-del', label: 'Stop monitoring', description: 'Remove a nick from IRCv3 MONITOR.', template: '/monitor del {nick}', arguments: [arg('nick', 'Nick', 'alice', 'nick')] },
] as const;

const SAFE_COMMAND_IDS = new Set<SafeCommandId>(SAFE_COMMANDS.map((command) => command.id));
const SAFE_TOKEN = /^[^\s,:/\x00-\x1f]{1,100}$/u;
const SAFE_TARGET = /^[#&]?[^\s,/\x00-\x1f]{1,100}$/u;

export function isSafeCommandId(value: unknown): value is SafeCommandId {
  return typeof value === 'string' && SAFE_COMMAND_IDS.has(value as SafeCommandId);
}

export function safeCommandDefinition(id: SafeCommandId): SafeCommandDefinition {
  const definition = SAFE_COMMANDS.find((command) => command.id === id);
  if (!definition) throw new Error(`Unknown safe command: ${id}`);
  return definition;
}

function cleanArgument(argument: UserActionArgument, value: unknown): string | null {
  if (typeof value !== 'string') return argument.kind === 'optional-text' ? '' : null;
  const cleaned = value.replace(/[\r\n]+/g, ' ').trim();
  if (argument.kind === 'optional-text') return cleaned.slice(0, 1_600);
  if (!cleaned) return null;
  if (argument.kind === 'text') return cleaned.slice(0, 1_600);
  if (argument.kind === 'channel') {
    const channel = cleaned.startsWith('#') || cleaned.startsWith('&') ? cleaned : `#${cleaned}`;
    return SAFE_TARGET.test(channel) ? channel : null;
  }
  if (argument.kind === 'target') return SAFE_TARGET.test(cleaned) ? cleaned : null;
  return SAFE_TOKEN.test(cleaned) ? cleaned : null;
}

export type SafeCommandExpansion =
  | { ok: true; command: string }
  | { ok: false; reason: string };

/** Expand one allowlisted command; raw templates or command names never enter. */
export function expandSafeCommand(
  id: SafeCommandId,
  values: Readonly<Record<string, string>>,
): SafeCommandExpansion {
  const definition = safeCommandDefinition(id);
  const cleaned: Record<string, string> = {};
  for (const argument of definition.arguments) {
    const value = cleanArgument(argument, values[argument.id]);
    if (value === null) return { ok: false, reason: `${argument.label} is invalid.` };
    cleaned[argument.id] = value;
  }

  let command: string;
  switch (id) {
    case 'join': command = `/join ${cleaned['channel']}`; break;
    case 'query': command = `/query ${cleaned['nick']}`; break;
    case 'whois': command = `/whois ${cleaned['nick']}`; break;
    case 'message': command = `/msg ${cleaned['target']} ${cleaned['message']}`; break;
    case 'notice': command = `/notice ${cleaned['target']} ${cleaned['message']}`; break;
    case 'me': command = `/me ${cleaned['message']}`; break;
    case 'away': command = cleaned['message'] ? `/away ${cleaned['message']}` : '/away'; break;
    case 'nick': command = `/nick ${cleaned['nick']}`; break;
    case 'monitor-add': command = `/monitor add ${cleaned['nick']}`; break;
    case 'monitor-del': command = `/monitor del ${cleaned['nick']}`; break;
    default: {
      const exhaustive: never = id;
      return { ok: false, reason: `Unsupported command: ${String(exhaustive)}` };
    }
  }
  if (command.length > MAX_USER_ACTION_COMMAND_LENGTH) {
    return { ok: false, reason: `Command exceeds ${MAX_USER_ACTION_COMMAND_LENGTH} characters.` };
  }
  return { ok: true, command };
}
