// Tests for the tab-completion store — commands, nicks, channels, cycling.

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import type { WeeChatBuffer, WeeChatNick } from '@/lib/weechat/model';
import { completionState, complete, cycleCompletion, resetCompletion } from './completion';
import { clearBuffers, upsertBuffer, setNicklist } from './buffers';

const CHAN = 'ptr-chan';

function makeBuffer(id: string, over: Partial<WeeChatBuffer> = {}): WeeChatBuffer {
  return {
    id,
    number: 1,
    name: id,
    fullName: id,
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

function makeNick(name: string, over: Partial<WeeChatNick> = {}): WeeChatNick {
  return {
    id: `nk-${name}`,
    pointer: `nk-${name}`,
    level: 0,
    name,
    color: '',
    prefix: ' ',
    prefixColor: '',
    visible: true,
    group: false,
    ...over,
  };
}

function setupBuffers(): void {
  upsertBuffer(makeBuffer(CHAN, { number: 1, shortName: '#general' }));
  upsertBuffer(makeBuffer('ptr-chan2', { number: 2, shortName: '#games' }));
  upsertBuffer(makeBuffer('ptr-chan3', { number: 3, shortName: '#random' }));
  setNicklist(CHAN, [
    makeNick('alice'),
    makeNick('alfred'),
    makeNick('Bob'),
    makeNick('ops-header', { group: true }),
  ]);
}

describe('completion store', () => {
  beforeEach(() => {
    resetCompletion();
    clearBuffers();
    localStorage.clear();
    setupBuffers();
  });

  describe('command completion', () => {
    it('completes /j to the first matching command with a trailing space', () => {
      const result = complete('/j', 2, null);

      expect(result).toBe('/join ');
      expect(completionState.active).toBe(true);
      expect(completionState.candidates).toEqual(['/join', '/joinvideo', '/joinvoice']);
      expect(completionState.index).toBe(0);
    });

    it('leaves input unchanged when no command matches', () => {
      const result = complete('/zzznotacmd', 11, null);

      expect(result).toBe('/zzznotacmd');
      expect(completionState.active).toBe(false);
    });

    it('completes a slash command in the middle of text with stable prefix and suffix', () => {
      const result = complete('try /v now', 6, null);

      expect(result).toBe('try /vcall  now');
      expect(completionState.active).toBe(true);
      expect(completionState.prefix).toBe('try ');
      expect(completionState.suffix).toBe(' now');
      expect(completionState.candidates).toEqual([
        '/vcall',
        '/video',
        '/videocall',
        '/voice',
        '/voicecall',
      ]);
    });

    it('cycles command candidates forward and backward from the active command set', () => {
      complete('/jo', 3, null);

      expect(cycleCompletion(true)).toBe('/joinvideo ');
      expect(cycleCompletion(true)).toBe('/joinvoice ');
      expect(cycleCompletion(false)).toBe('/joinvideo ');
    });
  });

  describe('nick completion', () => {
    it('appends ": " when the nick is the first word of the line', () => {
      const result = complete('al', 2, CHAN);

      // Sorted case-insensitively: alfred before alice
      expect(result).toBe('alfred: ');
      expect(completionState.candidates).toEqual(['alfred', 'alice']);
    });

    it('appends a plain space when the nick is mid-sentence', () => {
      const result = complete('hi al', 5, CHAN);

      expect(result).toBe('hi alfred ');
    });

    it('matches nicks case-insensitively', () => {
      const result = complete('bo', 2, CHAN);

      expect(result).toBe('Bob: ');
    });

    it('skips nicklist group headers', () => {
      const result = complete('ops', 3, CHAN);

      expect(result).toBe('ops');
      expect(completionState.active).toBe(false);
    });

    it('preserves text after the cursor as the suffix', () => {
      const result = complete('al foo', 2, CHAN);

      expect(result).toBe('alfred:  foo');
      expect(completionState.suffix).toBe(' foo');
    });

    it('uses the cursor word as the prefix boundary when completing before punctuation', () => {
      const result = complete('hello al, meet Bob', 8, CHAN);

      expect(result).toBe('hello alfred , meet Bob');
      expect(completionState.prefix).toBe('hello ');
      expect(completionState.suffix).toBe(', meet Bob');
    });

    it('restarts completion with a new prefix instead of reusing stale cycling state', () => {
      complete('al', 2, CHAN);
      expect(cycleCompletion(true)).toBe('alice: ');

      const result = complete('bo', 2, CHAN);

      expect(result).toBe('Bob: ');
      expect(completionState.candidates).toEqual(['Bob']);
      expect(completionState.index).toBe(0);
      expect(cycleCompletion(true)).toBe('Bob: ');
    });
  });

  describe('channel completion', () => {
    it('completes #-prefixed words from buffer short names without a colon', () => {
      const result = complete('#g', 2, CHAN);

      expect(result).toBe('#games ');
      expect(completionState.candidates).toEqual(['#games', '#general']);
    });
  });

  describe('cycling', () => {
    it('cycles forward through candidates and wraps around', () => {
      complete('al', 2, CHAN);

      expect(cycleCompletion(true)).toBe('alice: ');
      expect(cycleCompletion(true)).toBe('alfred: ');
      expect(completionState.index).toBe(0);
    });

    it('cycles backward through candidates and wraps around', () => {
      complete('al', 2, CHAN);

      expect(cycleCompletion(false)).toBe('alice: ');
      expect(cycleCompletion(false)).toBe('alfred: ');
    });

    it('returns an empty string when no completion is active', () => {
      expect(cycleCompletion(true)).toBe('');
    });

    it('keeps prefix and suffix stable while cycling', () => {
      complete('hey al', 6, CHAN);

      expect(cycleCompletion(true)).toBe('hey alice ');
      expect(cycleCompletion(true)).toBe('hey alfred ');
    });
  });

  describe('resetCompletion', () => {
    it('clears all completion state', () => {
      complete('al', 2, CHAN);

      resetCompletion();

      expect(completionState.active).toBe(false);
      expect(completionState.candidates).toEqual([]);
      expect(completionState.index).toBe(0);
      expect(completionState.prefix).toBe('');
      expect(completionState.suffix).toBe('');
      expect(cycleCompletion(true)).toBe('');
    });
  });

  describe('edge cases', () => {
    it('returns empty input unchanged and clears prior completion state', () => {
      complete('al', 2, CHAN);

      const result = complete('', 0, CHAN);

      expect(result).toBe('');
      expect(completionState.active).toBe(false);
      expect(completionState.candidates).toEqual([]);
      expect(cycleCompletion(true)).toBe('');
    });

    it('returns input unchanged when the cursor is not on a word', () => {
      complete('al', 2, CHAN);

      const result = complete('hello ', 6, CHAN);

      expect(result).toBe('hello ');
      expect(completionState.active).toBe(false);
      expect(completionState.candidates).toEqual([]);
    });

    it('returns input unchanged for an unknown buffer pointer', () => {
      const result = complete('al', 2, 'ptr-nope');

      expect(result).toBe('al');
      expect(completionState.active).toBe(false);
    });

    it('clears a previous active completion when a later nick prefix has no match', () => {
      complete('al', 2, CHAN);

      const result = complete('zz', 2, CHAN);

      expect(result).toBe('zz');
      expect(completionState.active).toBe(false);
      expect(completionState.candidates).toEqual([]);
      expect(cycleCompletion(false)).toBe('');
    });
  });
});
