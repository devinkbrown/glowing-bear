// Exhaustive decision-table pin for the per-channel notify tiers (P3.4).
// Pure function, no DOM/store — every (mode × highlight × globalEnabled) cell
// is asserted so a wrong/missing branch that suppresses a real DM or fires
// under mute is caught here, not in production.

import { describe, it, expect } from 'vitest';
import {
  shouldNotify,
  nextNotifyMode,
  NOTIFY_MODES,
  DEFAULT_NOTIFY_MODE,
  type NotifyMode,
} from './notifyDecision';

describe('shouldNotify', () => {
  it('mute never notifies (highlight or not, enabled or not)', () => {
    expect(shouldNotify('mute', { highlight: true }, true)).toBe(false);
    expect(shouldNotify('mute', { highlight: false }, true)).toBe(false);
    expect(shouldNotify('mute', { highlight: true }, false)).toBe(false);
  });

  it('mentions notifies only on a highlight line', () => {
    expect(shouldNotify('mentions', { highlight: true }, true)).toBe(true);
    expect(shouldNotify('mentions', { highlight: false }, true)).toBe(false);
  });

  it('all notifies on any message when enabled', () => {
    expect(shouldNotify('all', { highlight: true }, true)).toBe(true);
    expect(shouldNotify('all', { highlight: false }, true)).toBe(true);
  });

  it('globalEnabled=false suppresses every tier', () => {
    for (const mode of NOTIFY_MODES) {
      expect(shouldNotify(mode, { highlight: true }, false)).toBe(false);
      expect(shouldNotify(mode, { highlight: false }, false)).toBe(false);
    }
  });

  it('default tier is byte-for-byte the legacy guard: highlight fires, plain line does not', () => {
    // Legacy guard was `line.highlight && settings.notifications && !isMuted`.
    // The default tier ('mentions') reproduces it exactly: a highlight always
    // fires, a plain line never does — a zero-behavior-change default.
    expect(shouldNotify(DEFAULT_NOTIFY_MODE, { highlight: true }, true)).toBe(true);
    expect(shouldNotify(DEFAULT_NOTIFY_MODE, { highlight: false }, true)).toBe(false);
  });

  // Full truth table, spelled out cell-by-cell for auditability.
  const table: { mode: NotifyMode; highlight: boolean; enabled: boolean; expected: boolean }[] = [
    { mode: 'all', highlight: true, enabled: true, expected: true },
    { mode: 'all', highlight: false, enabled: true, expected: true },
    { mode: 'all', highlight: true, enabled: false, expected: false },
    { mode: 'all', highlight: false, enabled: false, expected: false },
    { mode: 'mentions', highlight: true, enabled: true, expected: true },
    { mode: 'mentions', highlight: false, enabled: true, expected: false },
    { mode: 'mentions', highlight: true, enabled: false, expected: false },
    { mode: 'mentions', highlight: false, enabled: false, expected: false },
    { mode: 'mute', highlight: true, enabled: true, expected: false },
    { mode: 'mute', highlight: false, enabled: true, expected: false },
    { mode: 'mute', highlight: true, enabled: false, expected: false },
    { mode: 'mute', highlight: false, enabled: false, expected: false },
  ];
  it.each(table)('shouldNotify($mode, {highlight:$highlight}, $enabled) => $expected', (row) => {
    expect(shouldNotify(row.mode, { highlight: row.highlight }, row.enabled)).toBe(row.expected);
  });
});

describe('nextNotifyMode', () => {
  it('cycles all -> mentions -> mute -> all', () => {
    expect(nextNotifyMode('all')).toBe('mentions');
    expect(nextNotifyMode('mentions')).toBe('mute');
    expect(nextNotifyMode('mute')).toBe('all');
  });

  it('is a full cycle over exactly the three tiers', () => {
    const seen = new Set<NotifyMode>();
    let m: NotifyMode = 'all';
    for (let i = 0; i < NOTIFY_MODES.length; i++) {
      seen.add(m);
      m = nextNotifyMode(m);
    }
    expect(m).toBe('all'); // wrapped back to start
    expect([...seen].sort()).toEqual([...NOTIFY_MODES].sort());
  });
});
