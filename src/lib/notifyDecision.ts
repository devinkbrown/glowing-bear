// Per-channel notification tier decision (roadmap P3.4).
//
// The single source of truth for *whether* an incoming line should raise an
// alert, given the buffer's chosen tier. Kept pure and DOM-free so the whole
// decision table can be pinned exhaustively by a unit test — the delivery edge
// (`notify`/`playSound` in connection.ts) stays thin and just obeys the verdict.
//
// Tiers:
//   'all'      — alert on any displayed message (when notifications are enabled)
//   'mentions' — alert only when the line is a highlight (mention / DM)
//   'mute'     — never alert
//
// `globalEnabled` mirrors `settings.notifications`: with notifications turned
// off nothing fires regardless of tier, matching the pre-P3.4 guard.

export type NotifyMode = 'all' | 'mentions' | 'mute';

/** The three tiers in cycle order (all → mentions → mute → all). */
export const NOTIFY_MODES: readonly NotifyMode[] = ['all', 'mentions', 'mute'];

/**
 * The default tier for a buffer that has never been configured. 'mentions' is
 * byte-for-byte the pre-P3.4 behavior (highlight-only OS notification), so it
 * ships as a zero-behavior-change default; users opt a channel UP to 'all'.
 */
export const DEFAULT_NOTIFY_MODE: NotifyMode = 'mentions';

/** Minimal line shape the decision depends on — only the highlight flag. */
export interface NotifyLine {
  readonly highlight: boolean;
}

/**
 * Decide whether an incoming line should raise a notification.
 *
 * Pure: no clock, no store, no DOM. Total over `NotifyMode` — the switch is
 * exhaustive, so adding a tier is a compile error until this table handles it.
 */
export function shouldNotify(mode: NotifyMode, line: NotifyLine, globalEnabled: boolean): boolean {
  if (!globalEnabled) return false;
  switch (mode) {
    case 'mute':
      return false;
    case 'mentions':
      return line.highlight;
    case 'all':
      return true;
    default: {
      // Exhaustiveness guard: unreachable unless a tier is added without a case.
      const _never: never = mode;
      return _never;
    }
  }
}

/** Next tier in the cycle, wrapping all → mentions → mute → all. */
export function nextNotifyMode(mode: NotifyMode): NotifyMode {
  switch (mode) {
    case 'all':
      return 'mentions';
    case 'mentions':
      return 'mute';
    case 'mute':
      return 'all';
    default: {
      const _never: never = mode;
      return _never;
    }
  }
}
