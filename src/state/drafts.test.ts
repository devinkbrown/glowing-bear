// Tests for the drafts store — per-buffer composer drafts + input history,
// their debounced persistence, the reload round-trip, and the growth bounds.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BufferEntry } from '@/types';

// Node 22+ defines an experimental localStorage global that is undefined
// without --localstorage-file and shadows any jsdom implementation. Install a
// working in-memory Storage before the store module loads and reads it.
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

import {
  draftsState,
  getDraft,
  setDraft,
  clearDraft,
  pushHistory,
  flushDrafts,
  _resetDrafts,
  HISTORY_LIMIT,
  MAX_DRAFTS,
  composerDraftRestoration,
  restoreComposerDraft,
} from './drafts';

const DRAFTS_KEY = 'darkbear:drafts:v1';
const HISTORY_KEY = 'darkbear:inputhistory:v1';

describe('drafts store', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetDrafts();
  });

  it('stores and reads a draft by key', () => {
    setDraft('#chan', 'half-written message');
    expect(getDraft('#chan')).toBe('half-written message');
    expect(draftsState.drafts['#chan']).toBe('half-written message');
  });

  it('empty text clears the draft', () => {
    setDraft('#chan', 'x');
    setDraft('#chan', '');
    expect(getDraft('#chan')).toBe('');
    expect('#chan' in draftsState.drafts).toBe(false);
  });

  it('clearDraft removes a stored draft', () => {
    setDraft('#chan', 'sent then cleared');
    clearDraft('#chan');
    expect(getDraft('#chan')).toBe('');
  });

  it('ignores an empty key', () => {
    setDraft('', 'orphan');
    expect(Object.keys(draftsState.drafts)).toHaveLength(0);
  });

  it('flush persists drafts under the versioned key', () => {
    setDraft('#chan', 'persist me');
    flushDrafts();
    const raw = localStorage.getItem(DRAFTS_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toEqual({ '#chan': 'persist me' });
  });

  it('restores external text without replacing a draft and persists immediately', () => {
    const entry = {
      buffer: { fullName: 'irc.test.#darkbear', name: 'irc.test.#darkbear' },
    } as BufferEntry;
    setDraft('irc.test.#darkbear', 'existing draft');

    expect(restoreComposerDraft(entry, 'failed inline reply')).toBe(true);

    const expected = 'existing draft\nfailed inline reply';
    expect(getDraft('irc.test.#darkbear')).toBe(expected);
    expect(composerDraftRestoration()).toMatchObject({
      key: 'irc.test.#darkbear',
      text: expected,
    });
    expect(JSON.parse(localStorage.getItem(DRAFTS_KEY) as string)).toEqual({
      'irc.test.#darkbear': expected,
    });
  });

  it('a draft round-trips across a simulated reload', async () => {
    setDraft('#room', 'unsent draft text');
    flushDrafts();

    // Reload: re-execute the module against the same (persisted) localStorage.
    vi.resetModules();
    const fresh = await import('./drafts');
    expect(fresh.getDraft('#room')).toBe('unsent draft text');
    expect(fresh.draftsState.drafts['#room']).toBe('unsent draft text');
  });

  it('records submitted inputs newest-first', () => {
    pushHistory('first');
    pushHistory('second');
    expect(draftsState.history[0]).toBe('second');
    expect(draftsState.history[1]).toBe('first');
  });

  it('trims and ignores blank history entries', () => {
    pushHistory('   ');
    pushHistory('  hello  ');
    expect(draftsState.history).toEqual(['hello']);
  });

  it('caps input history at HISTORY_LIMIT', () => {
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) pushHistory(`cmd-${i}`);
    expect(draftsState.history).toHaveLength(HISTORY_LIMIT);
    // Newest is the last pushed, oldest kept entry is bounded.
    expect(draftsState.history[0]).toBe(`cmd-${HISTORY_LIMIT + 24}`);
  });

  it('history round-trips across a simulated reload', async () => {
    pushHistory('one');
    pushHistory('two');
    flushDrafts();

    vi.resetModules();
    const fresh = await import('./drafts');
    expect(fresh.draftsState.history).toEqual(['two', 'one']);
  });

  it('bounds the number of stored drafts (no unbounded growth)', () => {
    for (let i = 0; i < MAX_DRAFTS + 30; i++) setDraft(`#buf-${i}`, `text-${i}`);
    expect(Object.keys(draftsState.drafts).length).toBe(MAX_DRAFTS);
    // Oldest-inserted keys were evicted; the most recent survive.
    expect(getDraft(`#buf-${MAX_DRAFTS + 29}`)).toBe(`text-${MAX_DRAFTS + 29}`);
    expect(getDraft('#buf-0')).toBe('');
  });

  it('persists only the two draft keys — no secret material', () => {
    setDraft('#chan', 'draft');
    pushHistory('/msg someone hi');
    flushDrafts();
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    expect(keys.sort()).toEqual([DRAFTS_KEY, HISTORY_KEY].sort());
  });

  it('_resetDrafts wipes both containers and their persisted keys', () => {
    setDraft('#chan', 'x');
    pushHistory('y');
    flushDrafts();
    _resetDrafts();
    expect(Object.keys(draftsState.drafts)).toHaveLength(0);
    expect(draftsState.history).toHaveLength(0);
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
  });
});
