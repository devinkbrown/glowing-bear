import type { StateCreator } from 'zustand';
import type { BuffersSlice } from './buffers';

const COMMANDS = [
  '/away', '/back', '/ban', '/clear', '/close',
  '/deop', '/devoice', '/help', '/ignore', '/invite',
  '/join', '/kick', '/list', '/me', '/mode',
  '/msg', '/nick', '/notice', '/op', '/part',
  '/query', '/quit', '/reconnect', '/server', '/topic',
  '/unban', '/voice', '/whois',
] as const;

export interface CompletionSlice {
  completionActive: boolean;
  completionCandidates: string[];
  completionIndex: number;
  completionPrefix: string;
  completionSuffix: string;

  complete: (input: string, cursorPos: number, bufferPointer: string | null) => string;
  cycleCompletion: (forward: boolean) => string;
  resetCompletion: () => void;
}

type CombinedSlice = CompletionSlice & BuffersSlice;

let originalWord = '';
let wordStart = 0;
let isFirst = false;

function buildResult(prefix: string, completion: string, afterCursor: string, first: boolean): string {
  const isNick =
    !completion.startsWith('/') &&
    !completion.startsWith('#') &&
    !completion.startsWith('&') &&
    !completion.startsWith('+');

  if (isNick && first) {
    return `${prefix}${completion}: ${afterCursor}`;
  }
  return `${prefix}${completion} ${afterCursor}`;
}

export const createCompletionSlice: StateCreator<CombinedSlice, [], [], CompletionSlice> = (set, get) => ({
  completionActive: false,
  completionCandidates: [],
  completionIndex: 0,
  completionPrefix: '',
  completionSuffix: '',

  complete: (input, cursorPos, bufferPointer) => {
    const beforeCursor = input.slice(0, cursorPos);
    const afterCursor = input.slice(cursorPos);

    const wordMatch = beforeCursor.match(/(\S+)$/);
    if (!wordMatch) {
      get().resetCompletion();
      return input;
    }

    const word = wordMatch[1];
    wordStart = beforeCursor.length - word.length;
    originalWord = word;
    isFirst = wordStart === 0;

    const lc = word.toLowerCase();
    let candidates: string[] = [];

    if (word.startsWith('/')) {
      candidates = COMMANDS.filter(c => c.toLowerCase().startsWith(lc));
    } else if (bufferPointer) {
      const entry = get().buffers.get(bufferPointer);
      if (entry) {
        const nickCandidates: string[] = [];
        for (const [, nick] of entry.nicks) {
          if (!nick.group && nick.name.toLowerCase().startsWith(lc)) {
            nickCandidates.push(nick.name);
          }
        }
        nickCandidates.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        const chanCandidates: string[] = [];
        if (lc.startsWith('#') || lc.startsWith('&')) {
          for (const e of get().buffers.values()) {
            const sn = e.buffer.shortName;
            if (sn && sn.toLowerCase().startsWith(lc)) {
              chanCandidates.push(sn);
            }
          }
          chanCandidates.sort();
        }

        candidates = [...nickCandidates, ...chanCandidates];
      }
    }

    if (candidates.length === 0) {
      get().resetCompletion();
      return input;
    }

    const prefix = input.slice(0, wordStart);
    set({
      completionActive: true,
      completionCandidates: candidates,
      completionIndex: 0,
      completionPrefix: prefix,
      completionSuffix: afterCursor,
    });

    return buildResult(prefix, candidates[0], afterCursor, isFirst);
  },

  cycleCompletion: (forward) => {
    const { completionActive, completionCandidates, completionIndex, completionPrefix, completionSuffix } = get();
    if (!completionActive || completionCandidates.length === 0) return '';

    let nextIndex: number;
    if (forward) {
      nextIndex = (completionIndex + 1) % completionCandidates.length;
    } else {
      nextIndex = (completionIndex - 1 + completionCandidates.length) % completionCandidates.length;
    }

    set({ completionIndex: nextIndex });
    return buildResult(completionPrefix, completionCandidates[nextIndex], completionSuffix, isFirst);
  },

  resetCompletion: () => {
    set({
      completionActive: false,
      completionCandidates: [],
      completionIndex: 0,
      completionPrefix: '',
      completionSuffix: '',
    });
    originalWord = '';
    wordStart = 0;
    isFirst = false;
  },
});
