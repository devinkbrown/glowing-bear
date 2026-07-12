// Composer drafts + input history — persisted to localStorage so unsent text
// and recalled commands survive a reload. Module-level solid-js/store singleton
// + exported action functions (no classes, no context).
//
// Persistence keys (versioned, onyx/darkbear-style):
//   darkbear:drafts:v1        — Record<draftKey, text> of unsent composer text
//   darkbear:inputhistory:v1  — string[] of submitted inputs, newest first
//
// Drafts key on the STABLE buffer identity (`fullName || name`), NOT the WeeChat
// pointer, so a draft survives the pointer churn of a reconnect/reload — the
// same reason pin/mute persist by name under the db-* keys. Both containers are
// bounded (MAX_DRAFTS / HISTORY_LIMIT) so neither grows for the tab's life, and
// writes are debounced so keystrokes don't thrash localStorage.
//
// Only user-typed composer text and submitted inputs are stored here — never any
// credential, session token, device key, or decrypted E2EE plaintext overlay.

import { createStore, produce, unwrap } from 'solid-js/store';

const DRAFTS_KEY = 'darkbear:drafts:v1';
const HISTORY_KEY = 'darkbear:inputhistory:v1';
const SAVE_DEBOUNCE_MS = 400;

/** Max recalled input-history entries kept (newest first). */
export const HISTORY_LIMIT = 100;
/** Max distinct buffers with a stored draft, to bound cross-session growth. */
export const MAX_DRAFTS = 200;

interface DraftsState {
  /** Unsent composer text, keyed by stable buffer identity (`fullName||name`). */
  drafts: Record<string, string>;
  /** Submitted inputs, newest first, capped at HISTORY_LIMIT. */
  history: string[];
}

function loadDrafts(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    let count = 0;
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0) {
        out[k] = v;
        if (++count >= MAX_DRAFTS) break;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function loadHistory(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

const [draftsState, setDraftsState] = createStore<DraftsState>({
  drafts: loadDrafts(),
  history: loadHistory(),
});

/** Read-only drafts/history store. Mutate via the exported actions only. */
export { draftsState };

// ---------------------------------------------------------------------------
// Persistence (debounced; unwrap the proxy before JSON)
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow(): void {
  if (typeof localStorage === 'undefined') return;
  const snap = unwrap(draftsState);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(snap.drafts));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(snap.history));
}

function scheduleSave(): void {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, SAVE_DEBOUNCE_MS);
}

/** Immediately flush drafts + history to localStorage (cancels the debounce). */
export function flushDrafts(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  persistNow();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Current draft text for a buffer key, or '' if none. */
export function getDraft(key: string): string {
  return draftsState.drafts[key] ?? '';
}

/**
 * Store (or, when `text` is empty, clear) the draft for a buffer key. Enforces
 * MAX_DRAFTS by dropping the oldest-inserted draft when a new key would exceed
 * the bound — the container never grows without limit.
 */
export function setDraft(key: string, text: string): void {
  if (!key) return;
  setDraftsState(produce((s) => {
    if (text) {
      if (s.drafts[key] === undefined) {
        const keys = Object.keys(s.drafts);
        if (keys.length >= MAX_DRAFTS) {
          const oldest = keys[0];
          if (oldest !== undefined) delete s.drafts[oldest];
        }
      }
      s.drafts[key] = text;
    } else {
      delete s.drafts[key];
    }
  }));
  scheduleSave();
}

/** Remove a buffer's draft (e.g. after its text is submitted). */
export function clearDraft(key: string): void {
  if (!key || draftsState.drafts[key] === undefined) return;
  setDraftsState(produce((s) => { delete s.drafts[key]; }));
  scheduleSave();
}

/** Prepend a submitted input to history (deduped-free, trimmed, capped). */
export function pushHistory(entry: string): void {
  const trimmed = entry.trim();
  if (!trimmed) return;
  setDraftsState(produce((s) => {
    s.history = [trimmed, ...s.history].slice(0, HISTORY_LIMIT);
  }));
  scheduleSave();
}

/** Test/reset hook: wipe both containers and their persisted keys. */
export function _resetDrafts(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  setDraftsState(produce((s) => { s.drafts = {}; s.history = []; }));
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(DRAFTS_KEY);
    localStorage.removeItem(HISTORY_KEY);
  }
}
