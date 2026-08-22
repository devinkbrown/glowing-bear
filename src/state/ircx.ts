// IRCX / Onyx Server extension store.
//
// Tracks which servers identified as Onyx Server (gates IRCX features and bridge
// activation), channel PROPs, user profiles, ACCESS lists, bot/account tags,
// MONITOR list and the IRCX side-panel targets.

import { createStore, produce } from 'solid-js/store';
import type { PropEntry, AccessEntry, UserProfile } from '@/lib/ircx/types';
import type { OnyxServerServiceFeedback } from '@/lib/irc/serviceFeedback';
import { buffersState } from './buffers';
import { sendTo } from './connection';

export type ServicesPanel = 'nick' | 'chan' | 'memo' | null;

export interface ChannelListRow {
  channel: string;
  users: number;
  topic: string;
  modes?: string;
}

export interface ChannelListState {
  status: 'idle' | 'loading' | 'ready';
  rows: ChannelListRow[];
  query: string;
  extended: boolean;
  updatedAt: number | null;
}

export interface ServiceFeedbackEntry extends OnyxServerServiceFeedback {
  serverName: string;
  receivedAt: number;
}

export interface IrcxState {
  /** Server names that identified as Onyx Server (via 004). */
  onyxServers: Record<string, true>;
  /** Detected direct Onyx Server WSS gateways keyed by relay server name. */
  onyxGateways: Record<string, string>;
  /** Channel properties: channel -> key(UPPER) -> value. */
  channelProps: Record<string, Record<string, string>>;
  /** User profiles keyed by nick. */
  userProfiles: Record<string, UserProfile>;
  /** Access lists keyed by channel. */
  accessLists: Record<string, AccessEntry[]>;
  /** Bot nicks (lowercase). */
  botNicks: Record<string, true>;
  /** Account names: nick (lowercase) -> account. */
  accountMap: Record<string, string>;

  // Pending request tracking
  pendingPropTarget: string | null;
  pendingPropEntries: PropEntry[];
  pendingAccessChannel: string | null;
  pendingAccessEntries: AccessEntry[];

  // Active panels
  channelInfoTarget: string | null;
  userProfileTarget: string | null;
  servicesPanel: ServicesPanel;

  /** MONITOR'd nicks (lowercase). */
  monitorList: Record<string, true>;

  /** Latest LIST/LISTX result set for the channel browser. */
  channelList: ChannelListState;
  /** Bounded, session-only feedback from Onyx Server service commands. */
  serviceFeedback: ServiceFeedbackEntry[];
}

function initialState(): IrcxState {
  return {
    onyxServers: {},
    onyxGateways: {},
    channelProps: {},
    userProfiles: {},
    accessLists: {},
    botNicks: {},
    accountMap: {},
    pendingPropTarget: null,
    pendingPropEntries: [],
    pendingAccessChannel: null,
    pendingAccessEntries: [],
    channelInfoTarget: null,
    userProfileTarget: null,
    servicesPanel: null,
    monitorList: {},
    channelList: {
      status: 'idle',
      rows: [],
      query: '',
      extended: false,
      updatedAt: null,
    },
    serviceFeedback: [],
  };
}

const [state, setState] = createStore<IrcxState>(initialState());

/** Read-only IRCX store. Mutate via the exported actions only. */
export { state as ircxState };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServerBufferPtr(): string | null {
  const active = buffersState.activeBuffer;
  if (!active) return null;
  const entry = buffersState.buffers[active];
  if (!entry) return null;

  const serverName = entry.buffer.localVars['server'] ?? '';
  if (entry.buffer.localVars['type'] === 'server') return entry.buffer.id;

  for (const e of Object.values(buffersState.buffers)) {
    if (e.buffer.localVars['type'] === 'server') {
      const sn = e.buffer.localVars['server'] ?? e.buffer.localVars['network'] ?? '';
      if (sn === serverName) return e.buffer.id;
    }
  }
  return null;
}

function sendRawToServer(cmd: string): boolean {
  const ptr = getServerBufferPtr();
  if (!ptr) return false;
  return sendTo(ptr, `/quote ${cmd}`);
}

function activeServerName(): string {
  const active = buffersState.activeBuffer;
  if (!active) return '';
  const entry = buffersState.buffers[active];
  if (!entry) return '';
  return entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
}

// ---------------------------------------------------------------------------
// Onyx Server detection (API: markOnyxServer / isOnyxServer / isActiveOnyxServer)
// ---------------------------------------------------------------------------

export function markOnyxServer(serverName: string, wssGateway?: string): void {
  setState('onyxServers', serverName, true);
  if (wssGateway) setState('onyxGateways', serverName, wssGateway);
}

export function isOnyxServer(serverName?: string): boolean {
  if (!serverName) return false;
  return !!state.onyxServers[serverName];
}

/** True when the active buffer belongs to an Onyx Server. */
export function isActiveOnyxServer(): boolean {
  const name = activeServerName();
  return name !== '' && !!state.onyxServers[name];
}

// ---------------------------------------------------------------------------
// PROP
// ---------------------------------------------------------------------------

export function requestProps(target: string): boolean {
  if (!sendRawToServer(`PROP ${target} *`)) return false;
  setState({ pendingPropTarget: target, pendingPropEntries: [] });
  return true;
}

export function setProp(target: string, key: string, value: string): boolean {
  return sendRawToServer(`PROP ${target} ${key} :${value}`);
}

export function addPropEntry(entry: PropEntry): void {
  setState('pendingPropEntries', (prev) => [...prev, entry]);
}

/** Fold the pending PROP entries into channelProps or a user profile. */
export function finishPropList(target: string): void {
  // Interleave guard: the pending collector is a single shared slot, so a
  // second requestProps() retargets it (wiping the first request's entries).
  // If a DIFFERENT target is currently in flight, ignore this stale/late/
  // duplicate end — folding it would blank the newer request's props and
  // clobber its in-flight collection. A null pendingPropTarget means an
  // unrequested server-pushed list (the 818/819 numeric path), which folds
  // normally.
  if (state.pendingPropTarget !== null && state.pendingPropTarget !== target) return;

  setState(produce((s) => {
    const entries = s.pendingPropEntries.filter((e) => e.target === target);
    const isChannel = target.startsWith('#') || target.startsWith('&');

    if (isChannel) {
      // Never blank existing good props with an empty set (an end with no
      // entries — e.g. a stale slot — must not overwrite a prior fold).
      if (entries.length > 0 || !s.channelProps[target]) {
        const chanProps: Record<string, string> = {};
        for (const e of entries) chanProps[e.key.toUpperCase()] = e.value;
        s.channelProps[target] = chanProps;
      }
    } else if (entries.length > 0 || !s.userProfiles[target]) {
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
      s.userProfiles[target] = profile;
    }

    s.pendingPropTarget = null;
    s.pendingPropEntries = [];
  }));
}

export function clearPropRequest(): void {
  setState({ pendingPropTarget: null, pendingPropEntries: [] });
}

// ---------------------------------------------------------------------------
// ACCESS
// ---------------------------------------------------------------------------

export function requestAccess(channel: string): boolean {
  if (!sendRawToServer(`ACCESS ${channel} LIST`)) return false;
  setState({ pendingAccessChannel: channel, pendingAccessEntries: [] });
  return true;
}

export function addAccessEntry(entry: AccessEntry): void {
  setState('pendingAccessEntries', (prev) => [...prev, entry]);
}

export function finishAccessList(channel: string): void {
  setState(produce((s) => {
    s.accessLists[channel] = s.pendingAccessEntries.filter((e) => e.channel === channel);
    s.pendingAccessChannel = null;
    s.pendingAccessEntries = [];
  }));
}

export function clearAccessRequest(): void {
  setState({ pendingAccessChannel: null, pendingAccessEntries: [] });
}

export function addAccess(channel: string, level: string, mask: string, reason?: string): boolean {
  const cmd = reason
    ? `ACCESS ${channel} ADD ${level} ${mask} :${reason}`
    : `ACCESS ${channel} ADD ${level} ${mask}`;
  if (!sendRawToServer(cmd)) return false;
  setTimeout(() => requestAccess(channel), 500);
  return true;
}

export function removeAccess(channel: string, level: string, mask: string): boolean {
  if (!sendRawToServer(`ACCESS ${channel} DELETE ${level} ${mask}`)) return false;
  setTimeout(() => requestAccess(channel), 500);
  return true;
}

// ---------------------------------------------------------------------------
// Channel LIST / LISTX
// ---------------------------------------------------------------------------

export function requestChannelList(opts: {
  pattern?: string;
  minUsers?: string;
  maxUsers?: string;
  extended?: boolean;
} = {}): boolean {
  const pattern = opts.pattern?.trim() ?? '';
  const minUsers = opts.minUsers?.trim() ?? '';
  const maxUsers = opts.maxUsers?.trim() ?? '';
  const extended = !!opts.extended;
  const filters: string[] = [];
  if (minUsers) filters.push(`>${minUsers}`);
  if (maxUsers) filters.push(`<${maxUsers}`);
  const query = [pattern, filters.join(',')].filter(Boolean).join(' ');
  if (!sendRawToServer(extended ? 'LISTX' : `LIST${query ? ` ${query}` : ''}`)) return false;
  setState('channelList', {
    status: 'loading',
    rows: [],
    query,
    extended,
    updatedAt: null,
  });
  return true;
}

export function addChannelListRow(row: ChannelListRow): void {
  const key = row.channel.toLowerCase();
  setState('channelList', 'rows', (prev) => {
    const idx = prev.findIndex((r) => r.channel.toLowerCase() === key);
    if (idx === -1) return [...prev, row];
    const next = prev.slice();
    next[idx] = row;
    return next;
  });
}

export function finishChannelList(): void {
  setState('channelList', 'status', 'ready');
  setState('channelList', 'updatedAt', Date.now());
}

export function clearChannelList(): void {
  setState('channelList', {
    status: 'idle',
    rows: [],
    query: '',
    extended: false,
    updatedAt: null,
  });
}

// ---------------------------------------------------------------------------
// Bot / account tags
// ---------------------------------------------------------------------------

export function markBot(nick: string): void {
  setState('botNicks', nick.toLowerCase(), true);
}

export function unmarkBot(nick: string): void {
  setState(produce((s) => { delete s.botNicks[nick.toLowerCase()]; }));
}

export function isBot(nick: string): boolean {
  return !!state.botNicks[nick.toLowerCase()];
}

/** account '*' or '' clears the mapping (logout). */
export function setAccount(nick: string, account: string): void {
  setState(produce((s) => {
    if (account === '*' || account === '') {
      delete s.accountMap[nick.toLowerCase()];
    } else {
      s.accountMap[nick.toLowerCase()] = account;
    }
  }));
}

export function getAccount(nick: string): string | undefined {
  return state.accountMap[nick.toLowerCase()];
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

export function openChannelInfo(channel: string): void {
  setState('channelInfoTarget', channel);
}

export function closeChannelInfo(): void {
  setState('channelInfoTarget', null);
}

export function openUserProfile(nick: string): void {
  setState('userProfileTarget', nick);
  requestProps(nick);
}

export function closeUserProfile(): void {
  setState('userProfileTarget', null);
}

export function openServicesPanel(panel: Exclude<ServicesPanel, null>): void {
  setState('servicesPanel', panel);
}

export function closeServicesPanel(): void {
  setState('servicesPanel', null);
}

export function recordServiceFeedback(
  serverName: string,
  feedback: OnyxServerServiceFeedback,
  receivedAt = Date.now(),
): void {
  if (!serverName) return;
  setState('serviceFeedback', (previous) => [
    ...previous,
    { ...feedback, serverName, receivedAt },
  ].slice(-24));
}

export function clearServiceFeedback(serverName?: string): void {
  if (!serverName) {
    setState('serviceFeedback', []);
    return;
  }
  setState('serviceFeedback', (previous) => previous.filter((entry) => entry.serverName !== serverName));
}

// ---------------------------------------------------------------------------
// Services (Onyx Server direct verbs: ACCOUNT, CHANNEL, MEMO)
// ---------------------------------------------------------------------------

export function sendAccount(cmd: string): boolean {
  return sendRawToServer(`ACCOUNT ${cmd}`);
}

export function sendChannel(cmd: string): boolean {
  return sendRawToServer(`CHANNEL ${cmd}`);
}

export function sendMemo(cmd: string): boolean {
  return sendRawToServer(`MEMO ${cmd}`);
}

// ---------------------------------------------------------------------------
// Whisper / MONITOR / PUSHSET
// ---------------------------------------------------------------------------

export function sendWhisper(channel: string, nick: string, message: string): boolean {
  return sendRawToServer(`WHISPER ${channel} ${nick} :${message}`);
}

export function monitorAdd(nick: string): boolean {
  if (!sendRawToServer(`MONITOR + ${nick}`)) return false;
  setState('monitorList', nick.toLowerCase(), true);
  return true;
}

export function monitorRemove(nick: string): boolean {
  if (!sendRawToServer(`MONITOR - ${nick}`)) return false;
  setState(produce((s) => { delete s.monitorList[nick.toLowerCase()]; }));
  return true;
}

export function sendPushSet(key: string, value: string): boolean {
  return sendRawToServer(`PUSHSET ${key} ${value}`);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export function clearIrcx(): void {
  setState(produce((s) => { Object.assign(s, initialState()); }));
}
