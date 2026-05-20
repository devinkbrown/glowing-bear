import type { StateCreator } from 'zustand';
import { ConnectionState } from '@/types';
import type { WeeChatLine, BufferEntry } from '@/types';
import {
  WeeRelayClient,
  type AuthenticatedEvent,
  type BufferClosedEvent,
  type BufferOpenedEvent,
  type BufferRenamedEvent,
  type BufferSwitchedEvent,
  type BuffersLoadedEvent,
  type HistoryLoadedEvent,
  type HotlistUpdatedEvent,
  type LineAddedEvent,
  type NickAddedEvent,
  type NicklistReceivedEvent,
  type NickRemovedEvent,
  type RelayErrorEvent,
  type StateChangedEvent,
} from '@/protocol/weechat/client';
import { notify, playSound, updateTitle } from '@/lib/notifications';
import { isIrcxNumeric, parseIrcxLine, buildPropEntry } from '@/protocol/ircx/parser';
import type { BuffersSlice } from './buffers';
import type { SettingsSlice } from './settings';
import type { VideoSlice } from './video';
import type { IrcxSlice } from './ircx';

// Helper to attach a typed CustomEvent listener and return a cleanup fn
function on<T>(target: EventTarget, name: string, handler: (detail: T) => void): () => void {
  const listener = (ev: Event) => handler((ev as CustomEvent<T>).detail);
  target.addEventListener(name, listener);
  return () => target.removeEventListener(name, listener);
}

// Strip WeeChat/IRC color and formatting codes
function stripCodes(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x19[^\x1c]?|\x1a.|\x1c|\x02|\x0f|\x11|\x16|\x1d|\x1e|\x1f/g, '')
          .replace(/\x03(\d{1,2}(,\d{1,2})?)?/g, '')
          .trim();
}

export interface ConnectionSlice {
  client: WeeRelayClient | null;
  connectionState: ConnectionState;
  error: string | null;
  lag: number;
  isOper: boolean;
  isAdmin: boolean;
  operServers: Set<string>;
  adminServers: Set<string>;

  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  sendInput: (text: string, pointer?: string) => void;
  sendTo: (bufferPointer: string, text: string) => void;
  requestHistory: (count?: number, pointer?: string) => void;
  requestNicklist: (bufferPointer: string) => void;
  setActive: (bufferPointer: string) => void;
  openQuery: (nick: string) => void;
  isOperBuffer: (bufferId: string) => boolean;
  isAdminBuffer: (bufferId: string) => boolean;
}

type CombinedSlice = ConnectionSlice & BuffersSlice & SettingsSlice & VideoSlice & IrcxSlice;

let pingInterval: ReturnType<typeof setInterval> | null = null;
let cleanups: Array<() => void> = [];
let pendingQueryNick: string | null = null;
let pendingJoinChannel: string | null = null;
let queryNickTimer: ReturnType<typeof setTimeout> | null = null;

function sendPing(get: () => CombinedSlice): void {
  const { client, connectionState } = get();
  if (client && connectionState === ConnectionState.CONNECTED) {
    client.sendPing(String(Date.now()));
  }
}

function startPing(get: () => CombinedSlice): void {
  stopPing();
  sendPing(get);
  pingInterval = setInterval(() => sendPing(get), 15000);
}

function stopPing(): void {
  if (pingInterval !== null) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// Resolve own IRC nick for a buffer
function ownNick(entry: BufferEntry, buffers: Map<string, BufferEntry>): string {
  const localNick = entry.buffer.localVars['nick'] ?? '';
  const remoteNick = entry.buffer.localVars['channel'] ?? '';
  const serverName = entry.buffer.localVars['server'] ?? '';

  if (!localNick || (remoteNick && localNick === remoteNick)) {
    for (const e of buffers.values()) {
      if (
        e.buffer.localVars['server'] === serverName &&
        !e.buffer.localVars['type'] &&
        e.buffer.localVars['nick']
      ) {
        return e.buffer.localVars['nick'];
      }
    }
  }
  return localNick;
}

function ircServerName(entry: BufferEntry): string {
  const n = entry.buffer.name ?? '';
  const serverBuf = n.match(/^irc\.server\.(.+)$/);
  if (serverBuf) return serverBuf[1];
  const chanBuf = n.match(/^irc\.([^.]+)\./);
  if (chanBuf) return chanBuf[1];
  return entry.buffer.localVars?.['server'] ?? entry.buffer.localVars?.['network'] ?? '';
}

function serverPtrForEntry(entry: BufferEntry, buffers: Map<string, BufferEntry>): string | null {
  if (entry.buffer.localVars['type'] === 'server') return entry.buffer.id;
  const srvName = ircServerName(entry);
  if (!srvName) return null;
  for (const e of buffers.values()) {
    if (e.buffer.localVars['type'] === 'server' && ircServerName(e) === srvName) return e.buffer.id;
  }
  return null;
}

function detectOperFromLine(
  line: WeeChatLine,
  entry: BufferEntry,
  get: () => CombinedSlice,
  set: (partial: Partial<ConnectionSlice>) => void,
): void {
  const btype = entry.buffer.localVars['type'] ?? '';
  const isServerBuf = btype === 'server';
  const plain = stripCodes(line.message);

  // 381 RPL_YOUREOPER
  if (line.tags.includes('irc_381') || (isServerBuf && /authenticated via/i.test(plain))) {
    const roleMatch = plain.match(/[—–\-]\s*(.+)$/);
    const role = roleMatch ? roleMatch[1] : plain;
    setOperForEntry(entry, true, /admin/i.test(role), get, set);
    return;
  }

  // 221 RPL_UMODEIS
  if (isServerBuf && (line.tags.includes('irc_221') || /^\+[a-zA-Z]{2,}$/.test(plain))) {
    const modeMatch = plain.match(/\+([a-zA-Z]+)/);
    if (modeMatch) {
      const modes = modeMatch[1];
      if (/[oO]/.test(modes)) {
        setOperForEntry(entry, true, /[aA]/.test(modes), get, set);
      }
    }
    return;
  }

  // User mode changes
  if (line.tags.includes('irc_mode') && isServerBuf && !/[#&]/.test(plain)) {
    const own = ownNick(entry, get().buffers);
    if (own && plain.includes(own)) {
      if (/\+[oOaA]/.test(plain)) {
        setOperForEntry(entry, true, /\+[aA]/.test(plain), get, set);
      }
      if (/-[oOaA]/.test(plain)) {
        setOperForEntry(entry, false, false, get, set);
      }
    }
  }
}

function setOperForEntry(
  entry: BufferEntry,
  oper: boolean,
  admin: boolean,
  get: () => CombinedSlice,
  set: (partial: Partial<ConnectionSlice>) => void,
): void {
  const srvPtr = serverPtrForEntry(entry, get().buffers);
  if (!srvPtr) return;
  const state = get();
  if (oper) {
    const ops = new Set([...state.operServers, srvPtr]);
    const adms = admin ? new Set([...state.adminServers, srvPtr]) : state.adminServers;
    set({ operServers: ops, adminServers: adms, isOper: true, isAdmin: state.isAdmin || admin });
  } else {
    const ops = new Set(state.operServers); ops.delete(srvPtr);
    const adms = new Set(state.adminServers); adms.delete(srvPtr);
    set({ operServers: ops, adminServers: adms, isOper: ops.size > 0, isAdmin: adms.size > 0 });
  }
}

export const createConnectionSlice: StateCreator<CombinedSlice, [], [], ConnectionSlice> = (set, get) => ({
  client: null,
  connectionState: ConnectionState.DISCONNECTED,
  error: null,
  lag: 0,
  isOper: false,
  isAdmin: false,
  operServers: new Set(),
  adminServers: new Set(),

  connect: () => {
    // Tear down existing
    get().disconnect();

    const { settings } = get();
    const client = new WeeRelayClient({ ...settings.relay });
    set({ client, error: null });

    cleanups = [
      on<StateChangedEvent>(client, 'stateChanged', ({ state }) => {
        set({ connectionState: state });
        if (state === ConnectionState.CONNECTED) {
          set({ error: null });
          startPing(get);
        } else if (state === ConnectionState.RECONNECTING) {
          set({ error: null });
          stopPing();
        } else if (state === ConnectionState.DISCONNECTED) {
          stopPing();
          set({ isOper: false, isAdmin: false, operServers: new Set(), adminServers: new Set() });
        }
      }),

      on<RelayErrorEvent>(client, 'error', ({ message }) => {
        set({ error: message });
      }),

      on<AuthenticatedEvent>(client, 'authenticated', () => {
        set({ error: null });
      }),

      on<BuffersLoadedEvent>(client, 'buffersLoaded', ({ buffers }) => {
        for (const b of buffers) get().upsertBuffer(b);
        get().restoreLastBuffer();
        // Request nicklist for all channels so they're populated on first load
        for (const b of buffers) {
          if (b.localVars['type'] === 'channel') {
            client.requestNicklist(b.id);
          }
        }
      }),

      on<BufferOpenedEvent>(client, 'bufferOpened', ({ buffer }) => {
        get().upsertBuffer(buffer);
        if (buffer.localVars['type'] !== 'server') {
          client.requestHistory(buffer.id, 100);
        }
        // Auto-switch to pending query
        if (buffer.localVars['type'] === 'private' && pendingQueryNick) {
          const channel = (buffer.localVars['channel'] ?? '').toLowerCase();
          const short = (buffer.shortName || buffer.name).toLowerCase();
          if (channel === pendingQueryNick || short === pendingQueryNick) {
            pendingQueryNick = null;
            get().setActiveBuffer(buffer.id);
          }
        }
        // Auto-switch to joined channel
        if (buffer.localVars['type'] === 'channel' && pendingJoinChannel) {
          const channel = (buffer.localVars['channel'] ?? '').toLowerCase();
          const short = (buffer.shortName || buffer.name).toLowerCase();
          if (channel === pendingJoinChannel || short === pendingJoinChannel) {
            pendingJoinChannel = null;
            get().setActiveBuffer(buffer.id);
          }
        }
      }),

      on<BufferSwitchedEvent>(client, 'bufferSwitched', ({ id }) => {
        if (get().buffers.has(id)) get().setActiveBuffer(id);
      }),

      on<BufferClosedEvent>(client, 'bufferClosed', ({ id }) => {
        get().removeBuffer(id);
      }),

      on<BufferRenamedEvent>(client, 'bufferRenamed', ({ buffer }) => {
        get().upsertBuffer(buffer);
      }),

      on<LineAddedEvent>(client, 'lineAdded', ({ line }) => {
        // TAGMSGs
        if (line.isTagMsg) {
          const entry = get().buffers.get(line.buffer);
          if (entry) {
            const typingState = line.ircTags.get('+typing');
            if (typingState && line.nick) {
              get().setTyping(line.buffer, line.nick, typingState as 'active' | 'paused' | 'done');
            }
            const reactEmoji = line.ircTags.get('+react');
            const reactTarget = line.ircTags.get('+reply') ?? line.replyTo;
            if (reactEmoji && reactTarget && line.nick) {
              get().addReaction(line.buffer, reactTarget, reactEmoji, line.nick);
            }
          }
          return;
        }

        // IRCX numeric interception
        if (isIrcxNumeric(line.tags)) {
          const parsed = parseIrcxLine(line);
          if (parsed) {
            switch (parsed.type) {
              case 'prop':
                get().addPropEntry(buildPropEntry(parsed));
                break;
              case 'prop_end':
                get().finishPropList(parsed.target);
                break;
              case 'access_start':
                break;
              case 'access_entry':
              case 'access_add':
              case 'access_delete':
                get().addAccessEntry(parsed.entry);
                break;
              case 'access_end':
                get().finishAccessList(parsed.channel);
                break;
            }
          }
        }

        // Bot tag detection
        if (line.ircTags.has('bot') && line.nick) {
          get().markBot(line.nick);
        }

        // Account tag detection
        if (line.account && line.nick) {
          get().setAccount(line.nick, line.account);
        }

        // Ophion server detection via RPL_MYINFO (004)
        if (line.tags.includes('irc_004')) {
          const plain = stripCodes(line.message);
          if (/\bophion\b/i.test(plain)) {
            const bufEntry = get().buffers.get(line.buffer);
            if (bufEntry) {
              const sn = bufEntry.buffer.localVars['server'] ?? bufEntry.buffer.localVars['network'] ?? '';
              if (sn) get().markOphion(sn);
            }
          }
        }

        const entry = get().buffers.get(line.buffer);
        if (!entry) return;

        // Oper detection
        detectOperFromLine(line, entry, get, (partial) => set(partial as Partial<CombinedSlice>));

        if (!line.displayed) return;

        // Channel mode tracking
        if (line.tags.includes('irc_mode')) {
          const modeMatch = line.message.match(/([+-][a-zA-Z]+(?:[+-][a-zA-Z]+)*)/);
          if (modeMatch) get().applyModeChange(line.buffer, modeMatch[1]);
        }

        // LADON MEDIA lines — two forms:
        //
        // 1. Direct server MEDIA notification (irc_media tag):
        //    prefix = server/nick, message = "#channel SUBTYPE :payload"
        //    Handles ROSTER, STATS, VIDEO_KEYREQ from ophion server.
        //
        // 2. WeeChat error echo (old MEDIA signaling, DM calls):
        //    message = 'command "MEDIA" not found: ":nick!u@h MEDIA target TYPE :payload"'
        if (line.tags.includes('irc_media')) {
          const plain = stripCodes(line.message);
          // Try direct server form: "#channel SUBTYPE :payload" or "nick SUBTYPE :payload"
          const direct = plain.match(/^([#&\w][^\s]*)\s+(\S+)(?:\s+:?(.*))?$/);
          if (direct) {
            const [, channel, subtype, payload = ''] = direct;
            get().handleServerMedia(channel, subtype, payload);
          }
          return;
        }
        {
          const plain = stripCodes(line.message);
          // WeeChat error echo for peer-sent MEDIA (DM call signaling)
          const errMatch = plain.match(/command "MEDIA" not found: ":((\S+?)!\S+)\s+MEDIA\s+(\S+)\s+(\S+)(?:\s+:?(.*?))?"$/i);
          if (errMatch) {
            const [, , fromNick, target, type, payload = ''] = errMatch;
            if (fromNick && target && type) {
              get().handleVideoLine(fromNick, target, type.toUpperCase(), payload);
            }
            return;
          }
        }

        // Clear typing on regular message
        if (line.nick) get().setTyping(line.buffer, line.nick, 'done');

        get().addLine(line.buffer, line, get().settings.highlightWords);

        // Notifications
        if (line.highlight && get().settings.notifications && !get().isMuted(line.buffer)) {
          const bufName = entry.buffer.shortName || entry.buffer.name;
          const entryType = entry.buffer.localVars['type'];
          const title = entryType === 'private' ? `Message from ${bufName}` : `Highlight in ${bufName}`;
          const plain = stripCodes(line.message);
          notify(title, plain, undefined, line.buffer);
          if (get().settings.notificationSound) playSound();
        }

        updateTitle(get().getTotalHighlights(), get().getTotalUnread());
      }),

      on<HistoryLoadedEvent>(client, 'historyLoaded', ({ lines }) => {
        if (lines.length === 0) {
          const active = get().activeBuffer;
          if (active) get().setLoading(active, false);
          return;
        }
        const bufPtr = lines[0].buffer;
        const hasExisting = (get().buffers.get(bufPtr)?.lines.length ?? 0) > 0;
        get().setLoading(bufPtr, false);
        get().addLines(bufPtr, [...lines].reverse(), hasExisting);

        // Scan history for oper status
        const entry = get().buffers.get(bufPtr);
        const bufType = entry?.buffer.localVars['type'] ?? '';
        if (entry && bufType === 'server') {
          const srvPtr = entry.buffer.id;
          if (!get().operServers.has(srvPtr)) {
            for (const line of lines) {
              detectOperFromLine(line, entry, get, (partial) => set(partial as Partial<CombinedSlice>));
              if (get().operServers.has(srvPtr)) break;
            }
          }
        }
      }),

      on<NicklistReceivedEvent>(client, 'nicklistReceived', ({ buffer: bufPtr, nicks }) => {
        get().setNicklist(bufPtr, nicks);
      }),

      on<NickAddedEvent>(client, 'nickAdded', ({ buffer: bufPtr, nick }) => {
        get().addNick(bufPtr, nick);
      }),

      on<NickRemovedEvent>(client, 'nickRemoved', ({ buffer: bufPtr, nickId }) => {
        get().removeNick(bufPtr, nickId);
      }),

      on<HotlistUpdatedEvent>(client, 'hotlistUpdated', ({ hotlist }) => {
        get().updateHotlist(hotlist);
        updateTitle(get().getTotalHighlights(), get().getTotalUnread());
      }),

      // Pong
      on<{ arg: string }>(client, 'pong', ({ arg }) => {
        const sent = parseInt(arg ?? '', 10);
        if (!isNaN(sent)) set({ lag: Date.now() - sent });
      }),
    ];

    // Wire LADON media send function to the active IRC server buffer.
    get().setVideoSendFn((text: string) => {
      const serverBuf = get().getVideoServerBuffer();
      if (serverBuf) get().sendTo(serverBuf, text);
    });

    client.connect();
  },

  disconnect: () => {
    stopPing();
    if (queryNickTimer) { clearTimeout(queryNickTimer); queryNickTimer = null; }
    pendingQueryNick = null;
    pendingJoinChannel = null;
    // Tear down active call
    if (get().callState !== 'idle') get().hangup();
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    const { client } = get();
    if (client) {
      client.disconnect(true);
      set({ client: null });
    }
    set({ connectionState: ConnectionState.DISCONNECTED });
    get().clearBuffers();
    get().clearIrcx();
  },

  reconnect: () => {
    const { client } = get();
    if (client) {
      stopPing();
      client.disconnect(false);
      client.connect();
    } else {
      get().connect();
    }
  },

  sendInput: (text, pointer) => {
    const target = pointer ?? get().activeBuffer;
    const { client } = get();
    if (!client || !target || !text.trim()) return;

    // Local LADON media commands.
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      if (cmd === '/call' || cmd === '/videocall') {
        const nick = parts[1];
        if (nick) get().startCall(nick, true);
        return;
      }
      if (cmd === '/vcall' || cmd === '/voicecall') {
        const nick = parts[1];
        if (nick) get().startCall(nick, false);
        return;
      }
      if (cmd === '/joinvoice' || cmd === '/voice') {
        const channel = parts[1] ?? get().buffers.get(target)?.buffer.localVars['channel'];
        if (channel) get().joinRoom(channel, true);
        return;
      }
      if (cmd === '/joinvideo' || cmd === '/video') {
        const channel = parts[1] ?? get().buffers.get(target)?.buffer.localVars['channel'];
        if (channel) get().joinRoom(channel, false);
        return;
      }
      if (cmd === '/clear') {
        get().clearLines(target);
        return;
      }
      if (cmd === '/media') {
        const [, mediaTarget, type, ...rest] = parts;
        if (mediaTarget && type) get().sendLadonMedia(mediaTarget, type, rest.join(' ') || '{}');
        return;
      }
      if (cmd === '/hangup' || cmd === '/hup') {
        get().hangup();
        return;
      }
      // IRCX client-side commands (ophion servers only)
      if (get().isActiveOphion()) {
        if (cmd === '/whisper' || cmd === '/w') {
          const channel = get().buffers.get(target)?.buffer.localVars['channel'];
          if (channel && parts[1]) {
            const nick = parts[1];
            const msg = parts.slice(2).join(' ');
            if (msg) get().sendWhisper(channel, nick, msg);
          }
          return;
        }
        if (cmd === '/prop') {
          const propTarget = parts[1];
          if (propTarget) {
            if (parts.length === 2) {
              get().requestProps(propTarget);
            } else if (parts.length >= 4) {
              get().setProp(propTarget, parts[2], parts.slice(3).join(' '));
            } else if (parts.length === 3) {
              get().requestProps(propTarget);
            }
          }
          return;
        }
        if (cmd === '/access') {
          const ch = parts[1];
          if (ch) get().requestAccess(ch);
          return;
        }
        if (cmd === '/chaninfo') {
          const ch = parts[1] ?? get().buffers.get(target)?.buffer.localVars['channel'];
          if (ch) get().openChannelInfo(ch);
          return;
        }
        if (cmd === '/profile') {
          const nick = parts[1];
          if (nick) get().openUserProfile(nick);
          return;
        }
        if (cmd === '/services') {
          get().openServicesPanel('nick');
          return;
        }
        if (cmd === '/pushset') {
          if (parts[1] && parts[2]) {
            get().sendPushSet(parts[1], parts.slice(2).join(' '));
          }
          return;
        }
      }
      // MONITOR works on any IRCv3 server
      if (cmd === '/monitor') {
        if (parts[1]?.toLowerCase() === 'add' && parts[2]) {
          get().monitorAdd(parts[2]);
        } else if (parts[1]?.toLowerCase() === 'del' && parts[2]) {
          get().monitorRemove(parts[2]);
        }
        return;
      }
    }

    // Optimistic local echo for non-commands (IRC buffers only)
    if (!text.startsWith('/') && !text.startsWith('\x01')) {
      const existing = get().buffers.get(target);
      if (existing?.lines.some(l => l.id.startsWith('_opt_') && l.message === text)) {
        return;
      }
      const entry = get().buffers.get(target);
      const entryType = entry?.buffer.localVars['type'] ?? '';
      const isIrcBuf = entryType === 'channel' || entryType === 'private' || entryType === 'server';
      const nick = entry && isIrcBuf ? ownNick(entry, get().buffers) : '';
      if (nick && entry) {
        get().addLine(target, {
          id: `_opt_${Date.now()}`,
          buffer: get().activeBuffer!,
          date: new Date(),
          datePrinted: new Date(),
          displayed: true,
          highlight: false,
          tags: ['self_msg'],
          prefix: nick,
          message: text,
          nick,
          isAction: false,
          isSelf: true,
          isNotice: false,
          isJoin: false,
          isPart: false,
          isQuit: false,
          isNick: false,
          isTopic: false,
          isMode: false,
          isTagMsg: false,
          isWhisper: false,
          ircTags: new Map(),
          msgid: undefined,
          replyTo: undefined,
          account: undefined,
        }, []);
      }
    }

    if (text.startsWith('/')) {
      const joinMatch = text.match(/^\/join\s+([^\s]+)/i);
      if (joinMatch) {
        let ch = joinMatch[1];
        if (!ch.startsWith('#') && !ch.startsWith('&')) ch = '#' + ch;
        pendingJoinChannel = ch.toLowerCase();
      }
    }

    get().sendTo(target, text);
  },

  sendTo: (bufferPointer, text) => {
    const { client } = get();
    if (!client) return;
    client.sendInput(bufferPointer, text);
  },

  requestHistory: (count = 100, pointer) => {
    const target = pointer ?? get().activeBuffer;
    const { client } = get();
    if (!client || !target) return;
    get().setLoading(target, true);

    // Request (existing + count) lines from the end so that after dedup
    // we receive `count` lines older than what we already have.
    const existing = get().buffers.get(target);
    const haveCount = existing?.lines.filter(l => !l.id.startsWith('_opt_')).length ?? 0;
    client.requestHistory(target, haveCount + count);
  },

  requestNicklist: (bufferPointer) => {
    const { client } = get();
    if (!client) return;
    client.requestNicklist(bufferPointer);
  },

  setActive: (bufferPointer) => {
    get().setActiveBuffer(bufferPointer);
    const { client } = get();
    if (client) {
      client.sendInput(bufferPointer, '/buffer set hotlist -1');
    }
  },

  openQuery: (nick) => {
    const lc = nick.toLowerCase();
    for (const entry of get().buffers.values()) {
      const vars = entry.buffer.localVars ?? {};
      if (vars['type'] === 'private') {
        const ch = (vars['channel'] ?? '').toLowerCase();
        const short = (entry.buffer.shortName ?? '').toLowerCase();
        const name = (entry.buffer.name ?? '').toLowerCase();
        if (ch === lc || short === lc || name.endsWith('.' + lc)) {
          get().setActiveBuffer(entry.buffer.id);
          return;
        }
      }
    }
    pendingQueryNick = lc;
    get().sendInput(`/query ${nick}`);
    if (queryNickTimer) clearTimeout(queryNickTimer);
    queryNickTimer = setTimeout(() => {
      queryNickTimer = null;
      if (pendingQueryNick === lc) pendingQueryNick = null;
    }, 10000);
  },

  isOperBuffer: (bufferId) => {
    if (!get().isOper) return false;
    const entry = get().buffers.get(bufferId);
    if (!entry) return get().isOper;
    const ptr = serverPtrForEntry(entry, get().buffers);
    return ptr ? get().operServers.has(ptr) : get().isOper;
  },

  isAdminBuffer: (bufferId) => {
    if (!get().isAdmin) return false;
    const entry = get().buffers.get(bufferId);
    if (!entry) return get().isAdmin;
    const ptr = serverPtrForEntry(entry, get().buffers);
    return ptr ? get().adminServers.has(ptr) : get().isAdmin;
  },
});
