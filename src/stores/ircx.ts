import type { StateCreator } from 'zustand';
import type { PropEntry, AccessEntry, UserProfile } from '@/protocol/ircx/types';
import type { ConnectionSlice } from './connection';
import type { BuffersSlice } from './buffers';

export interface IrcxSlice {
  // Ophion server detection: server names that identified as ophion
  ophionServers: Set<string>;
  // Channel properties: channel -> Map<key, value>
  channelProps: Map<string, Map<string, string>>;
  // User profiles: nick -> UserProfile
  userProfiles: Map<string, UserProfile>;
  // Access lists: channel -> AccessEntry[]
  accessLists: Map<string, AccessEntry[]>;
  // Bot nicks tracked per server buffer
  botNicks: Set<string>;
  // Account names: nick -> account
  accountMap: Map<string, string>;

  // Pending request tracking
  pendingPropTarget: string | null;
  pendingPropEntries: PropEntry[];
  pendingAccessChannel: string | null;
  pendingAccessEntries: AccessEntry[];

  // Active panels
  channelInfoTarget: string | null;
  userProfileTarget: string | null;
  servicesPanel: 'nick' | 'chan' | 'memo' | null;

  // Actions - Ophion detection
  markOphion: (serverName: string) => void;
  isOphionServer: (serverName?: string) => boolean;
  isActiveOphion: () => boolean;

  // Actions - PROP
  requestProps: (target: string) => void;
  setProp: (target: string, key: string, value: string) => void;
  addPropEntry: (entry: PropEntry) => void;
  finishPropList: (target: string) => void;
  clearPropRequest: () => void;

  // Actions - ACCESS
  requestAccess: (channel: string) => void;
  addAccessEntry: (entry: AccessEntry) => void;
  finishAccessList: (channel: string) => void;
  clearAccessRequest: () => void;
  addAccess: (channel: string, level: string, mask: string, reason?: string) => void;
  removeAccess: (channel: string, level: string, mask: string) => void;

  // Actions - Bot mode
  markBot: (nick: string) => void;
  unmarkBot: (nick: string) => void;
  isBot: (nick: string) => boolean;

  // Actions - Account
  setAccount: (nick: string, account: string) => void;
  getAccount: (nick: string) => string | undefined;

  // Actions - Panels
  openChannelInfo: (channel: string) => void;
  closeChannelInfo: () => void;
  openUserProfile: (nick: string) => void;
  closeUserProfile: () => void;
  openServicesPanel: (panel: 'nick' | 'chan' | 'memo') => void;
  closeServicesPanel: () => void;

  // Actions - Services (ophion direct verbs: ACCOUNT, CHANNEL, MEMO)
  sendAccount: (cmd: string) => void;
  sendChannel: (cmd: string) => void;
  sendMemo: (cmd: string) => void;

  // Actions - Whisper
  sendWhisper: (channel: string, nick: string, message: string) => void;

  // Actions - MONITOR
  monitorAdd: (nick: string) => void;
  monitorRemove: (nick: string) => void;
  monitorList: Set<string>;

  // Actions - PUSHSET
  sendPushSet: (key: string, value: string) => void;

  // Cleanup
  clearIrcx: () => void;
}

type CombinedSlice = IrcxSlice & ConnectionSlice & BuffersSlice;

function getServerBufferPtr(get: () => CombinedSlice): string | null {
  const active = get().activeBuffer;
  if (!active) return null;
  const entry = get().buffers.get(active);
  if (!entry) return null;

  const serverName = entry.buffer.localVars['server'] ?? '';
  if (entry.buffer.localVars['type'] === 'server') return entry.buffer.id;

  for (const e of get().buffers.values()) {
    if (e.buffer.localVars['type'] === 'server') {
      const sn = e.buffer.localVars['server'] ?? e.buffer.localVars['network'] ?? '';
      if (sn === serverName) return e.buffer.id;
    }
  }
  return null;
}

function sendRawToServer(get: () => CombinedSlice, cmd: string): void {
  const ptr = getServerBufferPtr(get);
  if (!ptr) return;
  get().sendTo(ptr, `/quote ${cmd}`);
}

function activeServerName(get: () => CombinedSlice): string {
  const active = get().activeBuffer;
  if (!active) return '';
  const entry = get().buffers.get(active);
  if (!entry) return '';
  return entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
}

export const createIrcxSlice: StateCreator<CombinedSlice, [], [], IrcxSlice> = (set, get) => ({
  ophionServers: new Set(),
  channelProps: new Map(),
  userProfiles: new Map(),
  accessLists: new Map(),
  botNicks: new Set(),
  accountMap: new Map(),

  pendingPropTarget: null,
  pendingPropEntries: [],
  pendingAccessChannel: null,
  pendingAccessEntries: [],

  channelInfoTarget: null,
  userProfileTarget: null,
  servicesPanel: null,
  monitorList: new Set(),

  // Ophion detection
  markOphion: (serverName) => {
    set(state => {
      const next = new Set(state.ophionServers);
      next.add(serverName);
      return { ophionServers: next };
    });
  },

  isOphionServer: (serverName) => {
    if (!serverName) return false;
    return get().ophionServers.has(serverName);
  },

  isActiveOphion: () => {
    const name = activeServerName(get);
    return name !== '' && get().ophionServers.has(name);
  },

  // PROP
  requestProps: (target) => {
    set({ pendingPropTarget: target, pendingPropEntries: [] });
    sendRawToServer(get, `PROP ${target} *`);
  },

  setProp: (target, key, value) => {
    sendRawToServer(get, `PROP ${target} ${key} :${value}`);
  },

  addPropEntry: (entry) => {
    set(state => ({
      pendingPropEntries: [...state.pendingPropEntries, entry],
    }));
  },

  finishPropList: (target) => {
    set(state => {
      const entries = state.pendingPropEntries.filter(e => e.target === target);
      const isChannel = target.startsWith('#') || target.startsWith('&');

      if (isChannel) {
        const props = new Map(state.channelProps);
        const chanProps = new Map<string, string>();
        for (const e of entries) chanProps.set(e.key.toUpperCase(), e.value);
        props.set(target, chanProps);
        return {
          channelProps: props,
          pendingPropTarget: null,
          pendingPropEntries: [],
        };
      }

      // User profile
      const profiles = new Map(state.userProfiles);
      const profile: UserProfile = { nick: target };
      for (const e of entries) {
        const k = e.key.toUpperCase();
        switch (k) {
          case 'URL': profile.url = e.value; break;
          case 'GENDER': profile.gender = e.value; break;
          case 'PICTURE': profile.picture = e.value; break;
          case 'LOCATION': profile.location = e.value; break;
          case 'BIO': profile.bio = e.value; break;
          case 'REALNAME': profile.realname = e.value; break;
          case 'EMAIL': profile.email = e.value; break;
          case 'NO-VIDEO': profile.noVideo = e.value === 'true' || e.value === '1'; break;
        }
      }
      profiles.set(target, profile);
      return {
        userProfiles: profiles,
        pendingPropTarget: null,
        pendingPropEntries: [],
      };
    });
  },

  clearPropRequest: () => set({ pendingPropTarget: null, pendingPropEntries: [] }),

  // ACCESS
  requestAccess: (channel) => {
    set({ pendingAccessChannel: channel, pendingAccessEntries: [] });
    sendRawToServer(get, `ACCESS ${channel} LIST`);
  },

  addAccessEntry: (entry) => {
    set(state => ({
      pendingAccessEntries: [...state.pendingAccessEntries, entry],
    }));
  },

  finishAccessList: (channel) => {
    set(state => {
      const lists = new Map(state.accessLists);
      lists.set(channel, state.pendingAccessEntries.filter(e => e.channel === channel));
      return {
        accessLists: lists,
        pendingAccessChannel: null,
        pendingAccessEntries: [],
      };
    });
  },

  clearAccessRequest: () => set({ pendingAccessChannel: null, pendingAccessEntries: [] }),

  addAccess: (channel, level, mask, reason) => {
    const cmd = reason
      ? `ACCESS ${channel} ADD ${level} ${mask} :${reason}`
      : `ACCESS ${channel} ADD ${level} ${mask}`;
    sendRawToServer(get, cmd);
    setTimeout(() => get().requestAccess(channel), 500);
  },

  removeAccess: (channel, level, mask) => {
    sendRawToServer(get, `ACCESS ${channel} DELETE ${level} ${mask}`);
    setTimeout(() => get().requestAccess(channel), 500);
  },

  // Bot
  markBot: (nick) => {
    set(state => {
      const next = new Set(state.botNicks);
      next.add(nick.toLowerCase());
      return { botNicks: next };
    });
  },

  unmarkBot: (nick) => {
    set(state => {
      const next = new Set(state.botNicks);
      next.delete(nick.toLowerCase());
      return { botNicks: next };
    });
  },

  isBot: (nick) => get().botNicks.has(nick.toLowerCase()),

  // Account
  setAccount: (nick, account) => {
    set(state => {
      const next = new Map(state.accountMap);
      if (account === '*' || account === '') {
        next.delete(nick.toLowerCase());
      } else {
        next.set(nick.toLowerCase(), account);
      }
      return { accountMap: next };
    });
  },

  getAccount: (nick) => get().accountMap.get(nick.toLowerCase()),

  // Panels
  openChannelInfo: (channel) => set({ channelInfoTarget: channel }),
  closeChannelInfo: () => set({ channelInfoTarget: null }),
  openUserProfile: (nick) => {
    set({ userProfileTarget: nick });
    get().requestProps(nick);
  },
  closeUserProfile: () => set({ userProfileTarget: null }),
  openServicesPanel: (panel) => set({ servicesPanel: panel }),
  closeServicesPanel: () => set({ servicesPanel: null }),

  // Services (ophion direct verbs)
  sendAccount: (cmd) => {
    sendRawToServer(get, `ACCOUNT ${cmd}`);
  },
  sendChannel: (cmd) => {
    sendRawToServer(get, `CHANNEL ${cmd}`);
  },
  sendMemo: (cmd) => {
    sendRawToServer(get, `MEMO ${cmd}`);
  },

  // Whisper
  sendWhisper: (channel, nick, message) => {
    sendRawToServer(get, `WHISPER ${channel} ${nick} :${message}`);
  },

  // Monitor
  monitorAdd: (nick) => {
    set(state => {
      const next = new Set(state.monitorList);
      next.add(nick.toLowerCase());
      return { monitorList: next };
    });
    sendRawToServer(get, `MONITOR + ${nick}`);
  },

  monitorRemove: (nick) => {
    set(state => {
      const next = new Set(state.monitorList);
      next.delete(nick.toLowerCase());
      return { monitorList: next };
    });
    sendRawToServer(get, `MONITOR - ${nick}`);
  },

  // PUSHSET
  sendPushSet: (key, value) => {
    sendRawToServer(get, `PUSHSET ${key} ${value}`);
  },

  clearIrcx: () => set({
    ophionServers: new Set(),
    channelProps: new Map(),
    userProfiles: new Map(),
    accessLists: new Map(),
    botNicks: new Set(),
    accountMap: new Map(),
    pendingPropTarget: null,
    pendingPropEntries: [],
    pendingAccessChannel: null,
    pendingAccessEntries: [],
    channelInfoTarget: null,
    userProfileTarget: null,
    servicesPanel: null,
    monitorList: new Set(),
  }),
});
