// -------------------------------------------------------------------
// Media drop counter — observability for silently-swallowed rejections
//
// The media send/receive/teardown paths are studded with fire-and-forget
// promises whose rejection is genuinely non-fatal for any single frame:
// a MAC append that fails drops one loss-tolerant frame, a peer decrypt that
// fails drops one packet, an AudioContext.close() on teardown may reject
// harmlessly. Historically these were `.catch(() => {})` — invisible. A
// *systemic* failure (every MAC dropping, every datagram failing, no MAC key
// ever importing) therefore looked identical to healthy operation.
//
// This module keeps production behavior byte-identical (the catch is still
// non-throwing and non-fatal) but records each swallowed rejection under a
// short reason label so a systemic failure is diagnosable. It is side-effect
// free in production apart from a bounded in-memory counter Map; any console
// output is gated behind Vite's DEV flag and throttled so it can never become
// per-frame spam.
// -------------------------------------------------------------------

/** Warn (dev only) each time a reason's cumulative drop count crosses a
 *  multiple of this. Chosen high enough that a healthy loss-tolerant stream
 *  (the odd dropped frame) never warns, but a systemic failure surfaces. */
export const DROP_WARN_INTERVAL = 300;

const dropCounts = new Map<string, number>();
const warnedAt = new Map<string, number>();

/** Test-only override for the dev flag; `null` = defer to import.meta.env.DEV. */
let devOverride: boolean | null = null;

function isDevEnv(): boolean {
  if (devOverride !== null) return devOverride;
  // vite/client types provide `import.meta.env.DEV`; read defensively so a
  // realm without import.meta.env (e.g. a non-Vite worker) simply stays quiet.
  try {
    return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

/**
 * Record one swallowed media rejection under `reason`, returning the new
 * cumulative count. Never throws — safe to call from any `.catch`. In dev it
 * emits a throttled warning when a reason crosses DROP_WARN_INTERVAL, so a
 * systemic failure (a counter climbing fast) becomes visible without spamming.
 */
export function bumpDrop(reason: string): number {
  const next = (dropCounts.get(reason) ?? 0) + 1;
  dropCounts.set(reason, next);
  if (isDevEnv() && shouldWarnAt(next)) {
    const last = warnedAt.get(reason) ?? 0;
    if (next > last) {
      warnedAt.set(reason, next);
      console.warn(`[cadence-media] ${next} swallowed rejections at "${reason}"`);
    }
  }
  return next;
}

/** Pure throttle policy — warn only on exact interval crossings. */
export function shouldWarnAt(count: number): boolean {
  return count > 0 && count % DROP_WARN_INTERVAL === 0;
}

/** Current cumulative drop count for a reason label (0 if never seen). */
export function getDropCount(reason: string): number {
  return dropCounts.get(reason) ?? 0;
}

/** Immutable snapshot of all drop counters, for diagnostics/inspection. */
export function snapshotDrops(): Record<string, number> {
  return Object.fromEntries(dropCounts);
}

/** Reset all counters. Intended for tests. */
export function resetDropCounters(): void {
  dropCounts.clear();
  warnedAt.clear();
}

/** Test seam: force the dev gate on/off, or pass `null` to defer to the env. */
export function setDropReporterDevForTest(value: boolean | null): void {
  devOverride = value;
}
