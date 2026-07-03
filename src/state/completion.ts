// Tab-completion store — command, nick, and channel completion with cycling.

import { createStore } from 'solid-js/store';
import { buffersState } from './buffers';

/** Slash commands offered by completion. */
export const COMMANDS = [
  '/access', '/away', '/back', '/ban', '/call', '/chaninfo', '/clear', '/close',
  '/deop', '/devoice', '/hangup', '/help', '/ignore', '/invite',
  '/join', '/joinvideo', '/joinvoice', '/kick', '/list', '/me', '/mode',
  '/monitor', '/msg', '/nick', '/notice', '/op', '/part',
  '/profile', '/prop', '/pushset',
  '/query', '/quit', '/reconnect', '/server', '/services', '/topic',
  '/unban', '/vcall', '/video', '/videocall', '/voice', '/voicecall',
  '/whisper', '/whois',
] as const;

export interface CompletionState {
  active: boolean;
  candidates: string[];
  index: number;
  prefix: string;
  suffix: string;
}

const [state, setState] = createStore<CompletionState>({
  active: false,
  candidates: [],
  index: 0,
  prefix: '',
  suffix: '',
});

/** Read-only completion store. */
export { state as completionState };

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

/**
 * Start a completion for the word before the cursor. Returns the new input
 * value (unchanged when there are no candidates).
 */
export function complete(input: string, cursorPos: number, bufferPointer: string | null): string {
  const beforeCursor = input.slice(0, cursorPos);
  const afterCursor = input.slice(cursorPos);

  const wordMatch = beforeCursor.match(/(\S+)$/);
  const word = wordMatch?.[1];
  if (!word) {
    resetCompletion();
    return input;
  }

  wordStart = beforeCursor.length - word.length;
  isFirst = wordStart === 0;

  const lc = word.toLowerCase();
  let candidates: string[] = [];

  if (word.startsWith('/')) {
    candidates = COMMANDS.filter((c) => c.toLowerCase().startsWith(lc));
  } else if (bufferPointer) {
    const entry = buffersState.buffers[bufferPointer];
    if (entry) {
      const nickCandidates: string[] = [];
      for (const nick of Object.values(entry.nicks)) {
        if (!nick.group && nick.name.toLowerCase().startsWith(lc)) {
          nickCandidates.push(nick.name);
        }
      }
      nickCandidates.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      const chanCandidates: string[] = [];
      if (lc.startsWith('#') || lc.startsWith('&')) {
        for (const e of Object.values(buffersState.buffers)) {
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

  const firstCandidate = candidates[0];
  if (!firstCandidate) {
    resetCompletion();
    return input;
  }

  const prefix = input.slice(0, wordStart);
  setState({
    active: true,
    candidates,
    index: 0,
    prefix,
    suffix: afterCursor,
  });

  return buildResult(prefix, firstCandidate, afterCursor, isFirst);
}

/**
 * Cycle through the active completion's candidates. Returns the new input
 * value, or '' when no completion is active.
 */
export function cycleCompletion(forward: boolean): string {
  if (!state.active || state.candidates.length === 0) return '';

  const len = state.candidates.length;
  const nextIndex = forward
    ? (state.index + 1) % len
    : (state.index - 1 + len) % len;

  setState('index', nextIndex);
  const candidate = state.candidates[nextIndex];
  if (candidate === undefined) return '';
  return buildResult(state.prefix, candidate, state.suffix, isFirst);
}

export function resetCompletion(): void {
  setState({
    active: false,
    candidates: [],
    index: 0,
    prefix: '',
    suffix: '',
  });
  wordStart = 0;
  isFirst = false;
}
