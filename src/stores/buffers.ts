import type { StateCreator } from 'zustand';
import type {
  WeeChatBuffer,
  WeeChatLine,
  WeeChatNick,
  WeeChatHotlist,
  BufferEntry,
  TypingEntry,
  Reaction,
} from '@/types';

const MAX_LINES = 5000;

// Ordered privilege tiers -- checked against nick.prefix.trim()
const PREFIX_TIERS: { chars: Set<string>; label: string }[] = [
  { chars: new Set(['.', '~', 'q']), label: 'Owner' },
  { chars: new Set(['&', 'a']),      label: 'Admin' },
  { chars: new Set(['@', 'o']),      label: 'Op' },
  { chars: new Set(['%', 'h']),      label: 'Halfop' },
  { chars: new Set(['+', 'v']),      label: 'Voice' },
];

function makeEntry(buffer: WeeChatBuffer): BufferEntry {
  return {
    buffer,
    lines: [],
    nicks: new Map(),
    nickGroups: new Map(),
    unread: 0,
    highlighted: 0,
    lastSeen: undefined,
    loading: false,
    typing: new Map(),
    reactions: new Map(),
    msgIndex: new Map(),
    modes: new Set(),
  };
}

function buildNickGroups(nicks: Map<string, WeeChatNick>): Map<string, WeeChatNick[]> {
  const buckets = new Map<string, WeeChatNick[]>();
  for (const nick of nicks.values()) {
    if (nick.group) continue;         // skip group headers
    if (!nick.visible) continue;       // skip invisible nicks
    const p = nick.prefix.trim();
    const tier = PREFIX_TIERS.find(t => t.chars.has(p));
    const label = tier?.label ?? 'Regular';
    let arr = buckets.get(label);
    if (!arr) { arr = []; buckets.set(label, arr); }
    arr.push(nick);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }
  const ordered = new Map<string, WeeChatNick[]>();
  for (const tier of PREFIX_TIERS) {
    const arr = buckets.get(tier.label);
    if (arr?.length) ordered.set(tier.label, arr);
  }
  const regular = buckets.get('Regular');
  if (regular?.length) ordered.set('Regular', regular);
  return ordered;
}

// Load persisted sets from localStorage
function loadSet(key: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveSet(key: string, set: Set<string>): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify([...set]));
  }
}

export interface BuffersSlice {
  buffers: Map<string, BufferEntry>;
  activeBuffer: string | null;
  pinnedBuffers: Set<string>;
  ignoredNicks: Set<string>;
  mutedBuffers: Set<string>;
  readMarkerPos: Map<string, number>;

  // Derived helpers
  getSorted: () => BufferEntry[];
  getTotalHighlights: () => number;
  getTotalUnread: () => number;
  findByName: (name: string) => BufferEntry | undefined;
  findByShortName: (name: string) => BufferEntry | undefined;
  isPinned: (pointer: string) => boolean;
  isMuted: (pointer: string) => boolean;
  isIgnored: (nick: string) => boolean;
  hasMode: (pointer: string, mode: string) => boolean;

  // Actions
  upsertBuffer: (b: WeeChatBuffer) => void;
  removeBuffer: (pointer: string) => void;
  addLine: (pointer: string, line: WeeChatLine, highlightWords: string[]) => void;
  addLines: (pointer: string, lines: WeeChatLine[], prepend?: boolean) => void;
  setNicklist: (pointer: string, nicks: WeeChatNick[]) => void;
  addNick: (pointer: string, nick: WeeChatNick) => void;
  removeNick: (pointer: string, nickId: string) => void;
  updateNick: (pointer: string, oldName: string, newName: string) => void;
  setActiveBuffer: (pointer: string) => void;
  restoreLastBuffer: () => void;
  clearUnread: (pointer: string) => void;
  updateHotlist: (items: WeeChatHotlist[]) => void;
  setLoading: (pointer: string, loading: boolean) => void;
  setTyping: (pointer: string, nick: string, state: 'active' | 'paused' | 'done') => void;
  pruneTyping: (pointer: string) => void;
  addReaction: (pointer: string, msgid: string, emoji: string, nick: string) => void;
  applyModeChange: (pointer: string, modeStr: string) => void;
  setReadMarker: (pointer: string) => void;
  togglePin: (pointer: string) => void;
  toggleMute: (pointer: string) => void;
  addIgnore: (nick: string) => void;
  removeIgnore: (nick: string) => void;
  nextHighlighted: (forward?: boolean) => string | null;
  clearBuffers: () => void;
}

export const createBuffersSlice: StateCreator<BuffersSlice, [], [], BuffersSlice> = (set, get) => ({
  buffers: new Map(),
  activeBuffer: null,
  pinnedBuffers: loadSet('db-pinned'),
  ignoredNicks: loadSet('db-ignored'),
  mutedBuffers: loadSet('db-muted'),
  readMarkerPos: new Map(),

  // -- Derived helpers --

  getSorted: () => {
    const { buffers, pinnedBuffers } = get();
    const all = Array.from(buffers.values()).sort((a, b) => a.buffer.number - b.buffer.number);
    const getFullName = (e: BufferEntry) => e.buffer.fullName || e.buffer.name;
    const pinned = all.filter(e => pinnedBuffers.has(getFullName(e)));
    const rest = all.filter(e => !pinnedBuffers.has(getFullName(e)));
    return [...pinned, ...rest];
  },

  getTotalHighlights: () => {
    let total = 0;
    for (const entry of get().buffers.values()) total += entry.highlighted;
    return total;
  },

  getTotalUnread: () => {
    let total = 0;
    for (const entry of get().buffers.values()) total += entry.unread;
    return total;
  },

  findByName: (name) => {
    for (const entry of get().buffers.values()) {
      if (entry.buffer.name === name || entry.buffer.fullName === name) return entry;
    }
    return undefined;
  },

  findByShortName: (name) => {
    for (const entry of get().buffers.values()) {
      if (entry.buffer.shortName === name) return entry;
    }
    return undefined;
  },

  isPinned: (pointer) => {
    const entry = get().buffers.get(pointer);
    if (!entry) return false;
    return get().pinnedBuffers.has(entry.buffer.fullName || entry.buffer.name);
  },

  isMuted: (pointer) => {
    const entry = get().buffers.get(pointer);
    if (!entry) return false;
    return get().mutedBuffers.has(entry.buffer.fullName || entry.buffer.name);
  },

  isIgnored: (nick) => get().ignoredNicks.has(nick.toLowerCase()),

  hasMode: (pointer, mode) => get().buffers.get(pointer)?.modes.has(mode) ?? false,

  // -- Actions --

  upsertBuffer: (b) => {
    set(state => {
      const next = new Map(state.buffers);
      const existing = next.get(b.id);
      if (existing) {
        next.set(b.id, { ...existing, buffer: b });
      } else {
        next.set(b.id, makeEntry(b));
      }
      return {
        buffers: next,
        activeBuffer: state.activeBuffer ?? b.id,
      };
    });
  },

  removeBuffer: (pointer) => {
    set(state => {
      const next = new Map(state.buffers);
      next.delete(pointer);
      let active = state.activeBuffer;
      if (active === pointer) {
        const first = next.keys().next().value;
        active = first ?? null;
      }
      return { buffers: next, activeBuffer: active };
    });
  },

  addLine: (pointer, line, highlightWords) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      // Suppress ignored nicks
      if (line.nick && state.ignoredNicks.has(line.nick.toLowerCase())) return state;

      // Deduplicate: skip if a line with this ID already exists
      if (!line.id.startsWith('_opt_') && entry.lines.some(l => l.id === line.id)) return state;

      // Content-based dedup: skip if a recent line has identical nick+message
      // (catches cases where same message arrives with different pointer IDs)
      if (!line.id.startsWith('_opt_') && line.message && entry.lines.length > 0) {
        const tail = entry.lines;
        const cutoff = line.date.getTime() - 3000;
        for (let i = tail.length - 1; i >= Math.max(0, tail.length - 10); i--) {
          const l = tail[i];
          if (l.date.getTime() < cutoff) break;
          if (l.id.startsWith('_opt_')) continue;
          if (l.nick === line.nick && l.message === line.message) return state;
        }
      }

      const msgIndex = new Map(entry.msgIndex);
      if (line.msgid) msgIndex.set(line.msgid, line);

      // Replace optimistic placeholder on confirmed echo
      let base = entry.lines;
      if (!line.id.startsWith('_opt_')) {
        const optIdx = base.findIndex(l =>
          l.id.startsWith('_opt_') && l.message === line.message &&
          (line.isSelf || l.nick === line.nick)
        );
        if (optIdx !== -1) base = base.filter((_, i) => i !== optIdx);
      }

      let newLines = [...base, line];
      if (newLines.length > MAX_LINES) newLines = newLines.slice(-MAX_LINES);

      // Client-side highlight words
      if (!line.highlight && line.message && highlightWords.length > 0) {
        const lcMsg = line.message.toLowerCase();
        for (const word of highlightWords) {
          const lc = word.trim().toLowerCase();
          if (lc && lcMsg.includes(lc)) {
            line = { ...line, highlight: true };
            break;
          }
        }
      }

      let unread = entry.unread;
      let highlighted = entry.highlighted;
      if (state.activeBuffer !== pointer && line.displayed && !line.id.startsWith('_opt_')) {
        unread += 1;
        if (line.highlight) highlighted += 1;
      }

      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, lines: newLines, msgIndex, unread, highlighted });
      return { buffers: next };
    });
  },

  addLines: (pointer, lines, prepend = false) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;

      const existingIds = new Set(entry.lines.map(l => l.id));
      const existingContent = new Set<string>();
      for (const l of entry.lines) {
        if (l.id.startsWith('_opt_') || !l.nick || !l.message) continue;
        existingContent.add(`${l.nick}\0${l.message}\0${Math.floor(l.date.getTime() / 3000)}`);
      }
      const seenInBatch = new Set<string>();
      const fresh = lines.filter(l => {
        if (existingIds.has(l.id)) return false;
        if (seenInBatch.has(l.id)) return false;
        seenInBatch.add(l.id);
        if (l.nick && l.message) {
          const bucket = Math.floor(l.date.getTime() / 3000);
          const key = `${l.nick}\0${l.message}\0${bucket}`;
          if (existingContent.has(key) ||
              existingContent.has(`${l.nick}\0${l.message}\0${bucket - 1}`) ||
              existingContent.has(`${l.nick}\0${l.message}\0${bucket + 1}`)) return false;
          existingContent.add(key);
        }
        return true;
      });
      if (fresh.length === 0) return state;

      let newLines: WeeChatLine[];
      if (prepend) {
        newLines = [...fresh, ...entry.lines];
        if (newLines.length > MAX_LINES) newLines = newLines.slice(0, MAX_LINES);
      } else {
        newLines = [...entry.lines, ...fresh];
        if (newLines.length > MAX_LINES) newLines = newLines.slice(-MAX_LINES);
      }

      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, lines: newLines });
      return { buffers: next };
    });
  },

  setNicklist: (pointer, nicks) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const newNicks = new Map(nicks.map(n => [n.name, n]));
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, nicks: newNicks, nickGroups: buildNickGroups(newNicks) });
      return { buffers: next };
    });
  },

  addNick: (pointer, nick) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const newNicks = new Map(entry.nicks);
      newNicks.set(nick.name, nick);
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, nicks: newNicks, nickGroups: buildNickGroups(newNicks) });
      return { buffers: next };
    });
  },

  removeNick: (pointer, nickId) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const newNicks = new Map(entry.nicks);
      for (const [name, nick] of newNicks) {
        if (nick.id === nickId || nick.name === nickId) {
          newNicks.delete(name);
          break;
        }
      }
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, nicks: newNicks, nickGroups: buildNickGroups(newNicks) });
      return { buffers: next };
    });
  },

  updateNick: (pointer, oldName, newName) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const nick = entry.nicks.get(oldName);
      if (!nick) return state;
      const newNicks = new Map(entry.nicks);
      newNicks.delete(oldName);
      newNicks.set(newName, { ...nick, name: newName });
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, nicks: newNicks, nickGroups: buildNickGroups(newNicks) });
      return { buffers: next };
    });
  },

  setActiveBuffer: (pointer) => {
    set({ activeBuffer: pointer });
    get().clearUnread(pointer);
    const entry = get().buffers.get(pointer);
    if (entry && typeof localStorage !== 'undefined') {
      localStorage.setItem('db-last-buffer', entry.buffer.fullName || entry.buffer.name);
    }
  },

  restoreLastBuffer: () => {
    if (typeof localStorage === 'undefined') return;
    const name = localStorage.getItem('db-last-buffer');
    if (!name) return;
    const entry = get().findByName(name);
    if (entry) get().setActiveBuffer(entry.buffer.id);
  },

  clearUnread: (pointer) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, unread: 0, highlighted: 0, lastSeen: new Date() });
      return { buffers: next };
    });
  },

  updateHotlist: (items) => {
    set(state => {
      const next = new Map(state.buffers);
      for (const item of items) {
        const entry = next.get(item.buffer);
        if (!entry || item.buffer === state.activeBuffer) continue;
        const messages = item.count[1] + item.count[2];
        const highlights = item.count[3];
        next.set(item.buffer, { ...entry, unread: messages + highlights, highlighted: highlights });
      }
      return { buffers: next };
    });
  },

  setLoading: (pointer, loading) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, loading });
      return { buffers: next };
    });
  },

  setTyping: (pointer, nick, typingState) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const typing = new Map(entry.typing);
      if (typingState === 'done') {
        typing.delete(nick);
      } else {
        const expiry = typingState === 'active' ? Date.now() + 30000 : Date.now() + 8000;
        typing.set(nick, { state: typingState, expiry });
      }
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, typing });
      return { buffers: next };
    });
  },

  pruneTyping: (pointer) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const now = Date.now();
      const typing = new Map(entry.typing);
      let changed = false;
      for (const [nick, info] of typing) {
        if (info.expiry < now) { typing.delete(nick); changed = true; }
      }
      if (!changed) return state;
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, typing });
      return { buffers: next };
    });
  },

  addReaction: (pointer, msgid, emoji, nick) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const reactions = new Map(entry.reactions);
      let list = reactions.get(msgid) ? [...reactions.get(msgid)!] : [];
      let r = list.find(x => x.emoji === emoji);
      if (!r) { r = { emoji, nicks: [] }; list = [...list, r]; }
      if (!r.nicks.includes(nick)) r = { ...r, nicks: [...r.nicks, nick] };
      list = list.map(x => x.emoji === emoji ? r! : x);
      reactions.set(msgid, list);
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, reactions });
      return { buffers: next };
    });
  },

  applyModeChange: (pointer, modeStr) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const modes = new Set(entry.modes);
      let adding = true;
      for (const ch of modeStr) {
        if (ch === '+') { adding = true; continue; }
        if (ch === '-') { adding = false; continue; }
        if (/[a-zA-Z]/.test(ch)) {
          if (adding) modes.add(ch); else modes.delete(ch);
        }
      }
      const next = new Map(state.buffers);
      next.set(pointer, { ...entry, modes });
      return { buffers: next };
    });
  },

  setReadMarker: (pointer) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const next = new Map(state.readMarkerPos);
      next.set(pointer, entry.lines.length);
      return { readMarkerPos: next };
    });
  },

  togglePin: (pointer) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const name = entry.buffer.fullName || entry.buffer.name;
      const next = new Set(state.pinnedBuffers);
      if (next.has(name)) next.delete(name); else next.add(name);
      saveSet('db-pinned', next);
      return { pinnedBuffers: next };
    });
  },

  toggleMute: (pointer) => {
    set(state => {
      const entry = state.buffers.get(pointer);
      if (!entry) return state;
      const name = entry.buffer.fullName || entry.buffer.name;
      const next = new Set(state.mutedBuffers);
      if (next.has(name)) next.delete(name); else next.add(name);
      saveSet('db-muted', next);
      return { mutedBuffers: next };
    });
  },

  addIgnore: (nick) => {
    set(state => {
      const next = new Set(state.ignoredNicks);
      next.add(nick.toLowerCase());
      saveSet('db-ignored', next);
      return { ignoredNicks: next };
    });
  },

  removeIgnore: (nick) => {
    set(state => {
      const next = new Set(state.ignoredNicks);
      next.delete(nick.toLowerCase());
      saveSet('db-ignored', next);
      return { ignoredNicks: next };
    });
  },

  nextHighlighted: (forward = true) => {
    const sorted = get().getSorted();
    if (!sorted.length) return null;
    const active = get().activeBuffer;
    const cur = sorted.findIndex(e => e.buffer.id === active);
    const step = forward ? 1 : -1;
    for (let i = 1; i <= sorted.length; i++) {
      const idx = ((cur + step * i) % sorted.length + sorted.length) % sorted.length;
      if (sorted[idx].highlighted > 0) return sorted[idx].buffer.id;
    }
    return null;
  },

  clearBuffers: () => set({ buffers: new Map(), activeBuffer: null }),
});
