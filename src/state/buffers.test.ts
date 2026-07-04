// Tests for the buffers store — lines/dedup, nicklist tiers, unread counters,
// typing expiry, reactions, modes, pin/mute/ignore persistence, navigation.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Node 22+ defines an experimental localStorage global that is undefined
// without --localstorage-file and shadows any jsdom implementation. Install a
// working in-memory Storage before the store modules load and read it.
vi.hoisted(() => {
  const backing = new Map<string, string>();
  const stub = {
    get length() { return backing.size; },
    clear: () => { backing.clear(); },
    getItem: (k: string) => backing.get(k) ?? null,
    key: (i: number) => [...backing.keys()][i] ?? null,
    removeItem: (k: string) => { backing.delete(k); },
    setItem: (k: string, v: string) => { backing.set(k, String(v)); },
  } satisfies Storage;
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
});

import type { WeeChatBuffer, WeeChatLine, WeeChatNick, HotlistEntry } from '@/lib/weechat/model';
import type { BufferEntry } from '@/types';
import {
  buffersState,
  NICK_TIER_ORDER,
  getSorted,
  getTotalHighlights,
  getTotalUnread,
  findByName,
  findByShortName,
  isPinned,
  isMuted,
  isIgnored,
  hasMode,
  nextHighlighted,
  upsertBuffer,
  removeBuffer,
  clearBuffers,
  clearLines,
  addLine,
  addLines,
  addLocalSystemLine,
  setNicklist,
  addNick,
  removeNick,
  updateNick,
  setActiveBuffer,
  restoreLastBuffer,
  clearUnread,
  updateHotlist,
  setReadMarker,
  setTyping,
  pruneTyping,
  addReaction,
  applyModeChange,
  togglePin,
  toggleMute,
  addIgnore,
  removeIgnore,
} from './buffers';

const A = 'ptr-a';
const B = 'ptr-b';
const C = 'ptr-c';
const T0 = new Date('2026-01-01T12:00:00.000Z').getTime();

let lineSeq = 0;

function makeBuffer(id: string, over: Partial<WeeChatBuffer> = {}): WeeChatBuffer {
  return {
    id,
    number: 1,
    name: id,
    fullName: `irc.esh.${id}`,
    shortName: '',
    title: '',
    type: 0,
    nicksCount: 0,
    localVars: {},
    notify: 1,
    hidden: false,
    ...over,
  };
}

function makeLine(over: Partial<WeeChatLine> & { buffer: string }): WeeChatLine {
  const now = new Date(T0);
  return {
    id: `ln-${lineSeq++}`,
    date: now,
    datePrinted: now,
    displayed: true,
    highlight: false,
    tags: [],
    prefix: '',
    message: '',
    ircTags: new Map<string, string>(),
    ...over,
  };
}

function makeNick(name: string, prefix = ' ', over: Partial<WeeChatNick> = {}): WeeChatNick {
  return {
    id: `nk-${name}`,
    pointer: `nk-${name}`,
    level: 0,
    name,
    color: '',
    prefix,
    prefixColor: '',
    visible: true,
    group: false,
    ...over,
  };
}

function entry(pointer: string): BufferEntry {
  const e = buffersState.buffers[pointer];
  if (!e) throw new Error(`no buffer entry for ${pointer}`);
  return e;
}

describe('buffers store', () => {
  beforeEach(() => {
    clearBuffers();
    for (const nick of Object.keys(buffersState.ignoredNicks)) removeIgnore(nick);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buffer lifecycle', () => {
    it('upsertBuffer creates an entry and activates the first buffer', () => {
      upsertBuffer(makeBuffer(A, { number: 1 }));
      upsertBuffer(makeBuffer(B, { number: 2 }));

      expect(Object.keys(buffersState.buffers)).toEqual([A, B]);
      expect(buffersState.activeBuffer).toBe(A);
    });

    it('upsertBuffer replaces buffer metadata but keeps lines', () => {
      upsertBuffer(makeBuffer(A, { title: 'old' }));
      addLine(A, makeLine({ buffer: A, message: 'hi' }), []);

      upsertBuffer(makeBuffer(A, { title: 'new' }));

      expect(entry(A).buffer.title).toBe('new');
      expect(entry(A).lines).toHaveLength(1);
    });

    it('removeBuffer re-picks the active buffer when the active one closes', () => {
      upsertBuffer(makeBuffer(A));
      upsertBuffer(makeBuffer(B));
      setActiveBuffer(A);

      removeBuffer(A);

      expect(buffersState.buffers[A]).toBeUndefined();
      expect(buffersState.activeBuffer).toBe(B);
    });

    it('removeBuffer nulls active when the last buffer closes', () => {
      upsertBuffer(makeBuffer(A));

      removeBuffer(A);

      expect(buffersState.activeBuffer).toBeNull();
    });

    it('clearBuffers wipes everything', () => {
      upsertBuffer(makeBuffer(A));
      upsertBuffer(makeBuffer(B));

      clearBuffers();

      expect(buffersState.buffers).toEqual({});
      expect(buffersState.activeBuffer).toBeNull();
    });

    it('clearLines wipes lines, indexes and counters but keeps the buffer', () => {
      upsertBuffer(makeBuffer(A));
      upsertBuffer(makeBuffer(B));
      setActiveBuffer(A);
      addLine(B, makeLine({ buffer: B, nick: 'x', message: 'hey', msgid: 'm1', highlight: true }), []);

      clearLines(B);

      expect(entry(B).lines).toEqual([]);
      expect(entry(B).lineIds).toEqual({});
      expect(entry(B).msgIndex).toEqual({});
      expect(entry(B).unread).toBe(0);
      expect(entry(B).highlighted).toBe(0);
    });
  });

  describe('addLine dedup', () => {
    beforeEach(() => {
      upsertBuffer(makeBuffer(A));
    });

    it('drops a line with an already-seen id', () => {
      const line = makeLine({ buffer: A, id: 'dup', message: 'one' });

      addLine(A, line, []);
      addLine(A, { ...line }, []);

      expect(entry(A).lines).toHaveLength(1);
    });

    it('drops a different-id line with identical nick+message inside the 3s window', () => {
      addLine(A, makeLine({ buffer: A, nick: 'alice', message: 'same', date: new Date(T0) }), []);

      addLine(A, makeLine({ buffer: A, nick: 'alice', message: 'same', date: new Date(T0 + 1000) }), []);

      expect(entry(A).lines).toHaveLength(1);
    });

    it('keeps an identical nick+message outside the 3s window', () => {
      addLine(A, makeLine({ buffer: A, nick: 'alice', message: 'same', date: new Date(T0) }), []);

      addLine(A, makeLine({ buffer: A, nick: 'alice', message: 'same', date: new Date(T0 + 4000) }), []);

      expect(entry(A).lines).toHaveLength(2);
    });

    it('keeps same message from a different nick inside the window', () => {
      addLine(A, makeLine({ buffer: A, nick: 'alice', message: 'same', date: new Date(T0) }), []);

      addLine(A, makeLine({ buffer: A, nick: 'bob', message: 'same', date: new Date(T0 + 1000) }), []);

      expect(entry(A).lines).toHaveLength(2);
    });

    it('replaces an _opt_ optimistic placeholder with the confirmed echo', () => {
      addLine(A, makeLine({ buffer: A, id: '_opt_1', nick: 'kain', message: 'hello', isSelf: true }), []);
      expect(entry(A).lines).toHaveLength(1);

      addLine(A, makeLine({ buffer: A, id: 'real-1', nick: 'kain', message: 'hello', isSelf: true, date: new Date(T0 + 500) }), []);

      expect(entry(A).lines).toHaveLength(1);
      expect(entry(A).lines[0]?.id).toBe('real-1');
      expect(entry(A).lineIds['real-1']).toBe(true);
      expect(entry(A).lineIds['_opt_1']).toBeUndefined();
    });

    it('suppresses lines from ignored nicks', () => {
      addIgnore('Troll');

      addLine(A, makeLine({ buffer: A, nick: 'troll', message: 'spam' }), []);
      addLine(A, makeLine({ buffer: A, nick: 'TROLL', message: 'more spam' }), []);

      expect(entry(A).lines).toHaveLength(0);
      expect(isIgnored('tRoLl')).toBe(true);

      removeIgnore('troll');
      expect(isIgnored('troll')).toBe(false);
    });

    it('is a no-op for an unknown buffer', () => {
      expect(() => addLine('ptr-nope', makeLine({ buffer: 'ptr-nope', message: 'x' }), [])).not.toThrow();
    });
  });

  describe('highlight words and unread counters', () => {
    beforeEach(() => {
      upsertBuffer(makeBuffer(A, { number: 1 }));
      upsertBuffer(makeBuffer(B, { number: 2 }));
      setActiveBuffer(A);
    });

    it('marks the stored line highlighted and bumps counters when a word matches', () => {
      addLine(B, makeLine({ buffer: B, nick: 'alice', message: 'hey KAIN, ping' }), [' kain ']);

      expect(entry(B).lines[0]?.highlight).toBe(true);
      expect(entry(B).unread).toBe(1);
      expect(entry(B).highlighted).toBe(1);
      expect(getTotalHighlights()).toBe(1);
      expect(getTotalUnread()).toBe(1);
    });

    it('leaves the line unhighlighted when no word matches', () => {
      addLine(B, makeLine({ buffer: B, nick: 'alice', message: 'nothing to see' }), ['kain']);

      expect(entry(B).lines[0]?.highlight).toBe(false);
      expect(entry(B).highlighted).toBe(0);
      expect(entry(B).unread).toBe(1);
    });

    it('does not bump counters on the active buffer', () => {
      addLine(A, makeLine({ buffer: A, nick: 'alice', message: 'kain hi' }), ['kain']);

      expect(entry(A).lines[0]?.highlight).toBe(true);
      expect(entry(A).unread).toBe(0);
      expect(entry(A).highlighted).toBe(0);
    });

    it('does not count non-displayed or optimistic lines', () => {
      addLine(B, makeLine({ buffer: B, nick: 'alice', message: 'hidden', displayed: false }), []);
      addLine(B, makeLine({ buffer: B, id: '_opt_9', nick: 'kain', message: 'mine', isSelf: true }), []);

      expect(entry(B).unread).toBe(0);
    });
  });

  describe('addLines (bulk history)', () => {
    beforeEach(() => {
      upsertBuffer(makeBuffer(A));
    });

    it('prepends fresh history before existing lines, deduping ids and content', () => {
      addLine(A, makeLine({ buffer: A, id: 'live-1', nick: 'alice', message: 'live msg', date: new Date(T0 + 60_000) }), []);

      addLines(A, [
        makeLine({ buffer: A, id: 'h-1', nick: 'bob', message: 'old one', date: new Date(T0) }),
        makeLine({ buffer: A, id: 'live-1', nick: 'alice', message: 'live msg', date: new Date(T0 + 60_000) }),           // id dup
        makeLine({ buffer: A, id: 'h-dup', nick: 'alice', message: 'live msg', date: new Date(T0 + 61_000) }),            // content dup (adjacent bucket)
        makeLine({ buffer: A, id: 'h-2', nick: 'bob', message: 'old two', date: new Date(T0 + 1000) }),
      ], true);

      expect(entry(A).lines.map((l) => l.id)).toEqual(['h-1', 'h-2', 'live-1']);
      expect(entry(A).lineIds['h-1']).toBe(true);
      expect(entry(A).lineIds['h-dup']).toBeUndefined();
    });

    it('dedupes repeated ids within a single batch', () => {
      addLines(A, [
        makeLine({ buffer: A, id: 'same', message: 'x' }),
        makeLine({ buffer: A, id: 'same', message: 'x' }),
      ]);

      expect(entry(A).lines).toHaveLength(1);
    });

    it('appends when prepend is false', () => {
      addLines(A, [makeLine({ buffer: A, id: 'first', message: 'a' })]);

      addLines(A, [makeLine({ buffer: A, id: 'second', message: 'b' })]);

      expect(entry(A).lines.map((l) => l.id)).toEqual(['first', 'second']);
    });

    it('trims to MAX_LINES (5000), keeping the newest and rebuilding indexes', () => {
      const bulk: WeeChatLine[] = [];
      for (let i = 0; i < 5001; i++) {
        bulk.push(makeLine({ buffer: A, id: `bulk-${i}`, message: `m${i}`, date: new Date(T0 + i * 10_000) }));
      }

      addLines(A, bulk);

      expect(entry(A).lines).toHaveLength(5000);
      expect(entry(A).lines[0]?.id).toBe('bulk-1');
      expect(entry(A).lines[4999]?.id).toBe('bulk-5000');
      expect(entry(A).lineIds['bulk-0']).toBeUndefined();
      expect(entry(A).lineIds['bulk-1']).toBe(true);
    });

    it('addLine also trims past MAX_LINES and rebuilds lineIds', () => {
      const bulk: WeeChatLine[] = [];
      for (let i = 0; i < 5000; i++) {
        bulk.push(makeLine({ buffer: A, id: `bulk-${i}`, message: `m${i}`, date: new Date(T0 + i * 10_000) }));
      }
      addLines(A, bulk);

      addLine(A, makeLine({ buffer: A, id: 'one-more', message: 'overflow', date: new Date(T0 + 5001 * 10_000) }), []);

      expect(entry(A).lines).toHaveLength(5000);
      expect(entry(A).lines[4999]?.id).toBe('one-more');
      expect(entry(A).lineIds['bulk-0']).toBeUndefined();
      expect(entry(A).lineIds['one-more']).toBe(true);
    });
  });

  describe('addLocalSystemLine', () => {
    it('appends a client-only notice line', () => {
      upsertBuffer(makeBuffer(A));

      addLocalSystemLine(A, 'bridge required');

      const line = entry(A).lines[0];
      expect(line?.id.startsWith('_sys_')).toBe(true);
      expect(line?.message).toBe('bridge required');
      expect(line?.prefix).toBe('--');
      expect(line?.tags).toContain('darkbear_system');
    });
  });

  describe('nicklist', () => {
    beforeEach(() => {
      upsertBuffer(makeBuffer(A));
    });

    it('maps standard IRC prefixes to tiers and orders by NICK_TIER_ORDER', () => {
      setNicklist(A, [
        makeNick('reg', ' '),
        makeNick('voicer', '+'),
        makeNick('half', '%'),
        makeNick('opper', '@'),
        makeNick('adm', '&'),
        makeNick('owner1', '~'),
        makeNick('owner2', '.'),
      ]);

      const groups = entry(A).nickGroups;
      // Only non-empty tiers appear (no Operator/Founder on standard IRC),
      // and they appear in NICK_TIER_ORDER order.
      expect(Object.keys(groups)).toEqual(['Owner', 'Admin', 'Op', 'Halfop', 'Voice', 'Regular']);
      expect(groups['Owner']?.map((n) => n.name)).toEqual(['owner1', 'owner2']);
      expect(groups['Admin']?.map((n) => n.name)).toEqual(['adm']);
      expect(groups['Op']?.map((n) => n.name)).toEqual(['opper']);
      expect(groups['Halfop']?.map((n) => n.name)).toEqual(['half']);
      expect(groups['Voice']?.map((n) => n.name)).toEqual(['voicer']);
      expect(groups['Regular']?.map((n) => n.name)).toEqual(['reg']);
    });

    it('maps orochi prefixes (*!.@+) to Operator/Founder/Owner/Op/Voice in rank order', () => {
      // orochi PREFIX=(YQqov)*!.@+  → * oper, ! founder, . owner, @ op, + voice
      setNicklist(A, [
        makeNick('vic', '+'),
        makeNick('operator', '*'),
        makeNick('founder1', '!'),
        makeNick('owner1', '.'),
        makeNick('op1', '@'),
        makeNick('plain', ' '),
      ]);

      const groups = entry(A).nickGroups;
      expect(Object.keys(groups)).toEqual(['Operator', 'Founder', 'Owner', 'Op', 'Voice', 'Regular']);
      expect(groups['Operator']?.map((n) => n.name)).toEqual(['operator']);
      expect(groups['Founder']?.map((n) => n.name)).toEqual(['founder1']);
      expect(groups['Owner']?.map((n) => n.name)).toEqual(['owner1']);
      expect(groups['Op']?.map((n) => n.name)).toEqual(['op1']);
      expect(groups['Voice']?.map((n) => n.name)).toEqual(['vic']);
      expect(groups['Regular']?.map((n) => n.name)).toEqual(['plain']);
    });

    it('NICK_TIER_ORDER spans orochi + standard tiers, highest first', () => {
      expect([...NICK_TIER_ORDER]).toEqual([
        'Operator', 'Founder', 'Owner', 'Admin', 'Op', 'Halfop', 'Voice', 'Regular',
      ]);
    });

    it('sorts nicks case-insensitively inside a tier and skips headers/invisible', () => {
      setNicklist(A, [
        makeNick('Zed', ' '),
        makeNick('alice', ' '),
        makeNick('Bob', ' '),
        makeNick('header', ' ', { group: true }),
        makeNick('ghost', ' ', { visible: false }),
      ]);

      expect(entry(A).nickGroups['Regular']?.map((n) => n.name)).toEqual(['alice', 'Bob', 'Zed']);
    });

    it('omits empty tiers from nickGroups', () => {
      setNicklist(A, [makeNick('opper', '@')]);

      expect(Object.keys(entry(A).nickGroups)).toEqual(['Op']);
    });

    it('addNick inserts and rebuilds groups', () => {
      setNicklist(A, [makeNick('alice')]);

      addNick(A, makeNick('bob', '@'));

      expect(entry(A).nicks['bob']?.name).toBe('bob');
      expect(entry(A).nickGroups['Op']?.map((n) => n.name)).toEqual(['bob']);
    });

    it('removeNick removes by pointer id or by name', () => {
      setNicklist(A, [makeNick('alice'), makeNick('bob')]);

      removeNick(A, 'nk-alice'); // by nick pointer id
      removeNick(A, 'bob');      // by name

      expect(entry(A).nicks).toEqual({});
      expect(entry(A).nickGroups).toEqual({});
    });

    it('updateNick renames in place keeping prefix', () => {
      setNicklist(A, [makeNick('alice', '@')]);

      updateNick(A, 'alice', 'alicia');

      expect(entry(A).nicks['alice']).toBeUndefined();
      expect(entry(A).nicks['alicia']?.prefix).toBe('@');
      expect(entry(A).nickGroups['Op']?.map((n) => n.name)).toEqual(['alicia']);
    });
  });

  describe('active buffer and hotlist', () => {
    beforeEach(() => {
      upsertBuffer(makeBuffer(A, { number: 1 }));
      upsertBuffer(makeBuffer(B, { number: 2 }));
    });

    it('setActiveBuffer clears unread and persists db-last-buffer', () => {
      setActiveBuffer(A);
      addLine(B, makeLine({ buffer: B, nick: 'x', message: 'hi', highlight: true }), []);
      expect(entry(B).unread).toBe(1);

      setActiveBuffer(B);

      expect(buffersState.activeBuffer).toBe(B);
      expect(entry(B).unread).toBe(0);
      expect(entry(B).highlighted).toBe(0);
      expect(entry(B).lastSeen).toBeInstanceOf(Date);
      expect(localStorage.getItem('db-last-buffer')).toBe(`irc.esh.${B}`);
    });

    it('restoreLastBuffer re-activates the persisted buffer by full name', () => {
      setActiveBuffer(A);
      localStorage.setItem('db-last-buffer', `irc.esh.${B}`);

      restoreLastBuffer();

      expect(buffersState.activeBuffer).toBe(B);
    });

    it('restoreLastBuffer is a no-op when the name is unknown', () => {
      setActiveBuffer(A);
      localStorage.setItem('db-last-buffer', 'irc.esh.gone');

      restoreLastBuffer();

      expect(buffersState.activeBuffer).toBe(A);
    });

    it('updateHotlist maps counts (msgs=1+2, highlights=3) and skips the active buffer', () => {
      setActiveBuffer(A);
      const items: HotlistEntry[] = [
        { buffer: B, count: [9, 2, 3, 1] },
        { buffer: A, count: [0, 5, 5, 5] },
      ];

      updateHotlist(items);

      expect(entry(B).unread).toBe(6);      // 2 + 3 + 1
      expect(entry(B).highlighted).toBe(1); // count[3]
      expect(entry(A).unread).toBe(0);      // active skipped
      expect(entry(A).highlighted).toBe(0);
    });

    it('setReadMarker records the current line count', () => {
      addLine(A, makeLine({ buffer: A, message: 'one' }), []);
      addLine(A, makeLine({ buffer: A, message: 'two', date: new Date(T0 + 5000) }), []);

      setReadMarker(A);

      expect(buffersState.readMarkerPos[A]).toBe(2);
    });

    it('clearUnread zeroes counters and stamps lastSeen', () => {
      setActiveBuffer(A);
      addLine(B, makeLine({ buffer: B, nick: 'x', message: 'hi' }), []);

      clearUnread(B);

      expect(entry(B).unread).toBe(0);
      expect(entry(B).lastSeen).toBeInstanceOf(Date);
    });
  });

  describe('typing expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
      upsertBuffer(makeBuffer(A));
    });

    it('active typing expires after 30s', () => {
      setTyping(A, 'alice', 'active');
      expect(entry(A).typing['alice']?.state).toBe('active');

      vi.advanceTimersByTime(29_000);
      pruneTyping(A);
      expect(entry(A).typing['alice']).toBeDefined();

      vi.advanceTimersByTime(2_000);
      pruneTyping(A);
      expect(entry(A).typing['alice']).toBeUndefined();
    });

    it('paused typing expires after 8s', () => {
      setTyping(A, 'bob', 'paused');

      vi.advanceTimersByTime(7_000);
      pruneTyping(A);
      expect(entry(A).typing['bob']?.state).toBe('paused');

      vi.advanceTimersByTime(2_000);
      pruneTyping(A);
      expect(entry(A).typing['bob']).toBeUndefined();
    });

    it("'done' removes the typing entry immediately", () => {
      setTyping(A, 'alice', 'active');

      setTyping(A, 'alice', 'done');

      expect(entry(A).typing['alice']).toBeUndefined();
    });

    it('pruneTyping only drops expired entries', () => {
      setTyping(A, 'slow', 'active');   // 30s
      setTyping(A, 'quick', 'paused');  // 8s

      vi.advanceTimersByTime(10_000);
      pruneTyping(A);

      expect(entry(A).typing['slow']).toBeDefined();
      expect(entry(A).typing['quick']).toBeUndefined();
    });
  });

  describe('reactions', () => {
    beforeEach(() => {
      upsertBuffer(makeBuffer(A));
    });

    it('adds a reaction and dedupes the same nick per (msgid, emoji)', () => {
      addReaction(A, 'm1', '👍', 'alice');
      addReaction(A, 'm1', '👍', 'alice');

      expect(entry(A).reactions['m1']).toEqual([{ emoji: '👍', nicks: ['alice'] }]);
    });

    it('collects multiple nicks under one emoji and separates emojis', () => {
      addReaction(A, 'm1', '👍', 'alice');
      addReaction(A, 'm1', '👍', 'bob');
      addReaction(A, 'm1', '🔥', 'alice');
      addReaction(A, 'm2', '👍', 'carol');

      expect(entry(A).reactions['m1']).toEqual([
        { emoji: '👍', nicks: ['alice', 'bob'] },
        { emoji: '🔥', nicks: ['alice'] },
      ]);
      expect(entry(A).reactions['m2']).toEqual([{ emoji: '👍', nicks: ['carol'] }]);
    });
  });

  describe('channel modes', () => {
    beforeEach(() => {
      upsertBuffer(makeBuffer(A));
    });

    it('applies +m then -m', () => {
      applyModeChange(A, '+m');
      expect(hasMode(A, 'm')).toBe(true);

      applyModeChange(A, '-m');
      expect(hasMode(A, 'm')).toBe(false);
    });

    it('folds mixed multi-letter mode strings', () => {
      applyModeChange(A, '+nt');
      applyModeChange(A, '+m-t');

      expect(entry(A).modes).toEqual(['n', 'm']);
    });

    it('ignores duplicate adds and removals of absent modes', () => {
      applyModeChange(A, '+m+m');
      applyModeChange(A, '-z');

      expect(entry(A).modes).toEqual(['m']);
    });
  });

  describe('pin / mute persistence and sorting', () => {
    beforeEach(() => {
      upsertBuffer(makeBuffer(A, { number: 1 }));
      upsertBuffer(makeBuffer(B, { number: 2 }));
      upsertBuffer(makeBuffer(C, { number: 3 }));
    });

    it('togglePin persists full names to db-pinned and getSorted puts pinned first', () => {
      togglePin(C);

      expect(isPinned(C)).toBe(true);
      expect(JSON.parse(localStorage.getItem('db-pinned') ?? '[]')).toContain(`irc.esh.${C}`);
      expect(getSorted().map((e) => e.buffer.id)).toEqual([C, A, B]);

      togglePin(C);
      expect(isPinned(C)).toBe(false);
      expect(JSON.parse(localStorage.getItem('db-pinned') ?? '[]')).not.toContain(`irc.esh.${C}`);
      expect(getSorted().map((e) => e.buffer.id)).toEqual([A, B, C]);
    });

    it('toggleMute persists full names to db-muted', () => {
      toggleMute(B);

      expect(isMuted(B)).toBe(true);
      expect(isMuted(A)).toBe(false);
      expect(JSON.parse(localStorage.getItem('db-muted') ?? '[]')).toContain(`irc.esh.${B}`);

      toggleMute(B);
      expect(isMuted(B)).toBe(false);
    });

    it('addIgnore persists lowercase nicks to db-ignored', () => {
      addIgnore('BadGuy');

      expect(JSON.parse(localStorage.getItem('db-ignored') ?? '[]')).toContain('badguy');

      removeIgnore('badguy');
      expect(JSON.parse(localStorage.getItem('db-ignored') ?? '[]')).not.toContain('badguy');
    });
  });

  describe('lookups', () => {
    it('findByName matches name or fullName; findByShortName matches shortName', () => {
      upsertBuffer(makeBuffer(A, { name: 'irc.esh.#general', shortName: '#general' }));

      expect(findByName('irc.esh.#general')?.buffer.id).toBe(A);
      expect(findByName(`irc.esh.${A}`)?.buffer.id).toBe(A); // fullName
      expect(findByShortName('#general')?.buffer.id).toBe(A);
      expect(findByName('nope')).toBeUndefined();
    });
  });

  describe('nextHighlighted', () => {
    beforeEach(() => {
      upsertBuffer(makeBuffer(A, { number: 1 }));
      upsertBuffer(makeBuffer(B, { number: 2 }));
      upsertBuffer(makeBuffer(C, { number: 3 }));
      setActiveBuffer(B);
    });

    it('finds the next and previous highlighted buffers from the active one', () => {
      updateHotlist([
        { buffer: A, count: [0, 0, 0, 1] },
        { buffer: C, count: [0, 0, 0, 2] },
      ]);

      expect(nextHighlighted(true)).toBe(C);
      expect(nextHighlighted(false)).toBe(A);
    });

    it('wraps around the buffer list', () => {
      updateHotlist([{ buffer: A, count: [0, 0, 0, 1] }]);
      setActiveBuffer(C);

      expect(nextHighlighted(true)).toBe(A);
    });

    it('returns null when nothing is highlighted', () => {
      expect(nextHighlighted(true)).toBeNull();
      expect(nextHighlighted(false)).toBeNull();
    });
  });
});
