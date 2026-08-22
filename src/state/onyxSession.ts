/**
 * Kind C — first-party Onyx WSS as the chat backbone.
 *
 * One IRCClient is chat + media. No WeeRelayClient, no second extras socket.
 * Buffers are keyed `onyx:<server>:<target>` so the existing sidebar/composer
 * keep working without WeeChat pointers.
 */

import { IRCClient } from '@/lib/irc/client';
import type { IRCMessage } from '@/lib/irc/types';
import {
  parseSaslSessionTokenNotice,
  parseSessionMeshTokenNote,
  parseSessionTokenNote,
  parseStandardReply,
} from '@/lib/irc/parser';
import type { WeeChatLine, WeeChatNick } from '@/lib/weechat/model';
import {
  addLine,
  addNick,
  buffersState,
  removeNick,
  setActiveBuffer,
  setNicklist,
  upsertBuffer,
} from './buffers';
import { settings } from './settings';
import {
  loadCredentials,
  saveCredentials,
  storeMeshToken,
  storeSaslSessionToken,
  storeSessionToken,
} from '@/lib/credentials';
import { makeOnyxBuffer, onyxBufferId, onyxBufferTarget } from '@/lib/onyx/bufferAdapter';
import { setActiveIrcSession } from './ircSession';
import {
  _attachBridgeClient,
  _setMediaAvailable,
  _setMediaTransportConnected,
} from './media';

export interface OnyxSessionDial {
  url: string;
  nick: string;
  account?: string;
  password?: string;
  saslSessionToken?: string;
  sessionToken?: string;
  meshToken?: string;
  identifyTotp?: string;
  rememberPassword?: boolean;
}

let client: IRCClient | null = null;
let serverName = 'onyx';
let ourNick = '';
let bufferSerial = 1;
const pendingNames = new Map<string, WeeChatNick[]>();
let authenticatedServerPrefix: string | null = null;
let welcomed = false;

export function getOnyxSessionClient(): IRCClient | null {
  return client;
}

export function isOnyxSessionActive(): boolean {
  return client !== null;
}

export function startOnyxSession(
  dial: OnyxSessionDial,
  hooks: {
    onReady: (server: string) => void;
    onDisconnected: (reason: string) => void;
    onError: (err: string) => void;
  },
): void {
  stopOnyxSession();
  serverName = hostFromWss(dial.url);
  ourNick = dial.nick;
  welcomed = false;
  authenticatedServerPrefix = null;

  const c = new IRCClient({
    url: dial.url,
    nick: dial.nick,
    account: dial.account || dial.nick,
    password: dial.password,
    saslSessionToken: dial.saslSessionToken,
    sessionToken: dial.sessionToken,
    meshToken: dial.meshToken,
    identifyTotp: dial.identifyTotp,
    onMessage: (msg) => onSessionMessage(msg),
    onConnected: (welcome) => {
      welcomed = true;
      if (welcome.prefix) authenticatedServerPrefix = welcome.prefix;
      const fromWelcome = welcome.prefix?.replace(/[^\w.-]/g, '') || serverName;
      if (fromWelcome) serverName = fromWelcome;
      ourNick = c.currentNick;
      ensureServerBuffer();
      if (dial.account && dial.password && !dial.password.startsWith('sst_')) {
        saveCredentials({
          nick: ourNick,
          server: dial.url,
          password: dial.password,
          rememberPassword: dial.rememberPassword,
        });
      }
      c.sendRaw('EVENT', 'ADD', 'MEDIA', '*');
      _setMediaAvailable(true);
      _setMediaTransportConnected(true);
      hooks.onReady(serverName);
    },
    onDisconnected: (reason) => {
      welcomed = false;
      _setMediaAvailable(false);
      _setMediaTransportConnected(false);
      hooks.onDisconnected(reason);
    },
    onError: hooks.onError,
    onNickChanged: (nick) => { ourNick = nick; },
  });

  client = c;
  setActiveIrcSession(c);
  _attachBridgeClient(c);
  ensureServerBuffer();
  c.connect();
}

export function stopOnyxSession(): void {
  const c = client;
  if (!c) return;
  client = null;
  welcomed = false;
  authenticatedServerPrefix = null;
  pendingNames.clear();
  setActiveIrcSession(null);
  _attachBridgeClient(null);
  _setMediaAvailable(false);
  _setMediaTransportConnected(false);
  c.destroy();
}

export function sendOnyxInput(bufferId: string, text: string): boolean {
  const c = client;
  if (!c || !text.trim()) return false;
  const target = targetOfBuffer(bufferId);
  if (text.startsWith('/')) {
    return dispatchSlash(c, bufferId, target, text);
  }
  if (!target || target === '*') return c.sendRaw('PRIVMSG', ourNick, text);
  return c.privmsg(target, text);
}

export function requestOnyxHistory(bufferId: string, count = 100): void {
  const c = client;
  const target = targetOfBuffer(bufferId);
  if (!c || !target || target === '*') return;
  if (!c.negotiatedCaps.has('draft/chathistory')) return;
  const existing = buffersState.buffers[bufferId];
  const oldest = existing?.lines.find((l) => l.msgid)?.msgid;
  if (oldest) {
    c.sendRaw('CHATHISTORY', 'BEFORE', target, `msgid=${oldest}`, String(count));
  } else {
    c.sendRaw('CHATHISTORY', 'LATEST', target, '*', String(count));
  }
}

function dispatchSlash(
  c: IRCClient,
  bufferId: string,
  target: string | null,
  text: string,
): boolean {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!match?.[1]) return false;
  const cmd = match[1].toLowerCase();
  const arg = (match[2] ?? '').trim();

  if (cmd === 'quote') {
    return arg ? c.send(`${arg}\r\n`) : false;
  }
  if (cmd === 'join') {
    const ch = arg.split(/\s+/)[0];
    if (!ch) return false;
    const name = ch.startsWith('#') || ch.startsWith('&') ? ch : `#${ch}`;
    c.join(name);
    return true;
  }
  if (cmd === 'part') {
    const ch = arg.split(/\s+/)[0] || target;
    if (!ch || ch === '*') return false;
    c.part(ch);
    return true;
  }
  if (cmd === 'query' || cmd === 'msg') {
    const [nick, ...rest] = arg.split(/\s+/);
    if (!nick) return false;
    ensureQueryBuffer(nick);
    const body = rest.join(' ');
    if (body) return c.privmsg(nick, body);
    setActiveBuffer(onyxBufferId(serverName, nick));
    return true;
  }
  if (cmd === 'me') {
    if (!target || target === '*') return false;
    return c.privmsg(target, `\x01ACTION ${arg}\x01`);
  }
  if (cmd === 'notice') {
    const [to, ...rest] = arg.split(/\s+/);
    if (!to) return false;
    c.notice(to, rest.join(' '));
    return true;
  }
  if (cmd === 'topic') {
    if (!target || target === '*') return false;
    c.topic(target, arg || undefined);
    return true;
  }
  if (cmd === 'nick' && arg) {
    c.nick(arg.split(/\s+/)[0]!);
    return true;
  }
  void bufferId;
  return c.send(`${text.slice(1)}\r\n`);
}

function onSessionMessage(msg: IRCMessage): void {
  if (!client) return;
  ingestTokens(msg);

  switch (msg.command) {
    case '005': {
      const network = client.isupport.NETWORK;
      if (network && network !== 'IRCXNet') serverName = network;
      break;
    }
    case 'JOIN': {
      const channel = msg.params[0] ?? '';
      if (!channel) break;
      const nick = msg.nick ?? '';
      const buf = ensureChannelBuffer(channel);
      if (nick) addNick(buf, nickEntry(nick));
      if (sameNick(nick, ourNick) && client.negotiatedCaps.has('draft/chathistory')) {
        client.sendRaw('CHATHISTORY', 'LATEST', channel, '*', '100');
      }
      break;
    }
    case 'PART':
    case 'KICK': {
      const channel = msg.params[0] ?? '';
      const nick = msg.command === 'KICK' ? (msg.params[1] ?? '') : (msg.nick ?? '');
      const buf = onyxBufferId(serverName, channel);
      if (nick) removeNick(buf, nick);
      appendLine(buf, {
        nick: msg.nick ?? nick,
        message: msg.params.at(-1) ?? '',
        isPart: msg.command === 'PART',
        tags: [`irc_${msg.command.toLowerCase()}`],
        msgid: msg.tags['msgid'],
        time: msg.tags['time'],
      });
      break;
    }
    case 'PRIVMSG':
    case 'NOTICE':
      ingestPrivmsg(msg);
      break;
    case '353': {
      const channel = msg.params[2] ?? msg.params[1] ?? '';
      const names = (msg.params.at(-1) ?? '').split(/\s+/).filter(Boolean);
      const buf = ensureChannelBuffer(channel);
      const list = pendingNames.get(buf) ?? [];
      for (const raw of names) {
        const nick = raw.replace(/^[@+%~&*!]+/, '');
        const prefix = raw.slice(0, raw.length - nick.length);
        if (nick) list.push(nickEntry(nick, prefix));
      }
      pendingNames.set(buf, list);
      break;
    }
    case '366': {
      const channel = msg.params[1] ?? '';
      const buf = onyxBufferId(serverName, channel);
      const list = pendingNames.get(buf);
      if (list) {
        setNicklist(buf, list);
        pendingNames.delete(buf);
      }
      break;
    }
    case '332': {
      const channel = msg.params[1] ?? '';
      const topic = msg.params[2] ?? '';
      const buf = ensureChannelBuffer(channel);
      const existing = buffersState.buffers[buf]?.buffer;
      if (existing) upsertBuffer({ ...existing, title: topic });
      break;
    }
    default:
      if (/^\d{3}$/.test(msg.command) || msg.command === 'ERROR') {
        appendLine(onyxBufferId(serverName, '*'), {
          nick: '',
          message: msg.params.slice(1).join(' ') || msg.raw,
          tags: [`irc_${msg.command}`],
          msgid: msg.tags['msgid'],
          time: msg.tags['time'],
        });
      }
      break;
  }
}

function ingestPrivmsg(msg: IRCMessage): void {
  const dest = msg.params[0] ?? '';
  const text = msg.params[1] ?? '';
  if (!dest) return;
  const from = msg.nick ?? '';
  const isChannel = dest.startsWith('#') || dest.startsWith('&');
  const isSelf = sameNick(from, ourNick);
  const queryPeer = isChannel ? dest : (isSelf ? dest : from);
  const buf = isChannel ? ensureChannelBuffer(dest) : ensureQueryBuffer(queryPeer);
  const action = text.startsWith('\x01ACTION ') && text.endsWith('\x01');
  appendLine(buf, {
    nick: from,
    message: action ? text.slice(8, -1) : text,
    isSelf,
    isNotice: msg.command === 'NOTICE',
    isAction: action,
    tags: [msg.command === 'NOTICE' ? 'irc_notice' : 'irc_privmsg'],
    msgid: msg.tags['msgid'],
    time: msg.tags['time'],
    account: msg.tags['account'],
    replyTo: msg.tags['+draft/reply'] ?? msg.tags['draft/reply'],
  });
}

function ingestTokens(msg: IRCMessage): void {
  const reply = parseStandardReply(msg);
  if (reply && reply.command === 'SESSION' && (
    reply.code === 'RESUME_CREDENTIAL_PRESERVED' ||
    reply.code === 'ORIGIN_UNREACHABLE' ||
    reply.code === 'TEMPORARILY_UNAVAILABLE'
  )) {
    return;
  }
  if (msg.command === 'NOTICE' && welcomed && authenticatedServerPrefix && msg.prefix === authenticatedServerPrefix) {
    const sasl = parseSaslSessionTokenNotice(msg);
    if (sasl) {
      storeSaslSessionToken(sasl.token, sasl.expiresAt, sasl.account);
      client?.setSaslSessionToken(sasl.token);
      return;
    }
  }
  if (msg.command !== 'NOTE' || !welcomed) return;
  if (authenticatedServerPrefix && msg.prefix !== authenticatedServerPrefix) return;
  const token = parseSessionTokenNote(msg);
  if (token) {
    storeSessionToken(token);
    return;
  }
  const mtoken = parseSessionMeshTokenNote(msg);
  if (mtoken) storeMeshToken(mtoken);
}

function ensureServerBuffer(): string {
  const id = onyxBufferId(serverName, '*');
  if (!buffersState.buffers[id]) {
    upsertBuffer(makeOnyxBuffer({
      server: serverName,
      target: '*',
      type: 'server',
      nick: ourNick,
      number: bufferSerial++,
    }));
  }
  if (!buffersState.activeBuffer) setActiveBuffer(id);
  return id;
}

function ensureChannelBuffer(channel: string): string {
  ensureServerBuffer();
  const id = onyxBufferId(serverName, channel);
  if (!buffersState.buffers[id]) {
    upsertBuffer(makeOnyxBuffer({
      server: serverName,
      target: channel,
      type: 'channel',
      nick: ourNick,
      number: bufferSerial++,
    }));
  }
  return id;
}

function ensureQueryBuffer(nick: string): string {
  ensureServerBuffer();
  const id = onyxBufferId(serverName, nick);
  if (!buffersState.buffers[id]) {
    upsertBuffer(makeOnyxBuffer({
      server: serverName,
      target: nick,
      type: 'private',
      nick: ourNick,
      number: bufferSerial++,
    }));
  }
  return id;
}

function targetOfBuffer(bufferId: string): string | null {
  return onyxBufferTarget(bufferId);
}

function appendLine(bufferId: string, opts: {
  nick: string;
  message: string;
  isSelf?: boolean;
  isNotice?: boolean;
  isAction?: boolean;
  isPart?: boolean;
  tags: string[];
  msgid?: string;
  time?: string;
  account?: string;
  replyTo?: string;
}): void {
  if (!buffersState.buffers[bufferId]) return;
  const date = opts.time ? new Date(opts.time) : new Date();
  const line: WeeChatLine = {
    id: opts.msgid || `_onyx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    buffer: bufferId,
    date,
    datePrinted: date,
    displayed: true,
    highlight: false,
    tags: opts.tags,
    prefix: opts.nick,
    message: opts.message,
    nick: opts.nick || undefined,
    isAction: opts.isAction,
    isSelf: opts.isSelf,
    isNotice: opts.isNotice,
    isJoin: false,
    isPart: opts.isPart,
    isQuit: false,
    isNick: false,
    isTopic: false,
    isMode: false,
    isTagMsg: false,
    isWhisper: false,
    ircTags: new Map(Object.entries({
      ...(opts.msgid ? { msgid: opts.msgid } : {}),
      ...(opts.time ? { time: opts.time } : {}),
    })),
    msgid: opts.msgid,
    replyTo: opts.replyTo,
    account: opts.account,
  };
  addLine(bufferId, line, settings.highlightWords);
}

function nickEntry(name: string, prefix = ''): WeeChatNick {
  return {
    id: name,
    pointer: name,
    level: 0,
    name,
    color: '',
    prefix,
    prefixColor: '',
    visible: true,
  };
}

function sameNick(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

function hostFromWss(url: string): string {
  try {
    return new URL(url).hostname || 'onyx';
  } catch {
    return 'onyx';
  }
}

export function loadOnyxDialFromSettings(onyxTotp?: string): OnyxSessionDial {
  const url = settings.bridge.wsUrl.trim();
  const account = settings.bridge.account.trim();
  const password = settings.bridge.password;
  const creds = loadCredentials(url, account);
  const tokenPass = password.startsWith('sst_') ? password : undefined;
  return {
    url,
    nick: account,
    account,
    password: tokenPass ? undefined : (password || creds?.password),
    saslSessionToken: tokenPass || creds?.saslSessionToken,
    sessionToken: creds?.sessionToken,
    meshToken: creds?.meshToken,
    identifyTotp: onyxTotp,
    rememberPassword: settings.rememberBridgePassword,
  };
}
