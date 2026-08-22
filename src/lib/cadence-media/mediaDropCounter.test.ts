import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DROP_WARN_INTERVAL,
  bumpDrop,
  getDropCount,
  resetDropCounters,
  setDropReporterDevForTest,
  shouldWarnAt,
  snapshotDrops,
} from './mediaDropCounter';

afterEach(() => {
  resetDropCounters();
  setDropReporterDevForTest(null);
  vi.restoreAllMocks();
});

describe('mediaDropCounter', () => {
  it('increments a reason counter and returns the new count', () => {
    expect(getDropCount('mac-append')).toBe(0);
    expect(bumpDrop('mac-append')).toBe(1);
    expect(bumpDrop('mac-append')).toBe(2);
    expect(getDropCount('mac-append')).toBe(2);
  });

  it('keys counters independently by label', () => {
    bumpDrop('tsumugi-peer-decrypt');
    bumpDrop('tsumugi-peer-decrypt');
    bumpDrop('mackey-import');
    expect(getDropCount('tsumugi-peer-decrypt')).toBe(2);
    expect(getDropCount('mackey-import')).toBe(1);
    expect(snapshotDrops()).toEqual({
      'tsumugi-peer-decrypt': 2,
      'mackey-import': 1,
    });
  });

  it('never throws and stays a plain counter (production-safe)', () => {
    setDropReporterDevForTest(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < DROP_WARN_INTERVAL + 5; i++) bumpDrop('audioctx-close');
    expect(getDropCount('audioctx-close')).toBe(DROP_WARN_INTERVAL + 5);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns only in dev, only on interval crossings, and only once per crossing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setDropReporterDevForTest(false);
    for (let i = 0; i < DROP_WARN_INTERVAL; i++) bumpDrop('mac-append');
    expect(warn).not.toHaveBeenCalled(); // gated off in production

    setDropReporterDevForTest(true);
    // Already at the interval; the next crossing is at 2 * interval.
    for (let i = getDropCount('mac-append'); i < 2 * DROP_WARN_INTERVAL - 1; i++) {
      bumpDrop('mac-append');
    }
    expect(warn).not.toHaveBeenCalled();
    bumpDrop('mac-append'); // crosses 2 * interval
    expect(warn).toHaveBeenCalledTimes(1);
    bumpDrop('mac-append'); // just past the crossing — no repeat
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('shouldWarnAt fires exactly on positive interval multiples', () => {
    expect(shouldWarnAt(0)).toBe(false);
    expect(shouldWarnAt(1)).toBe(false);
    expect(shouldWarnAt(DROP_WARN_INTERVAL)).toBe(true);
    expect(shouldWarnAt(DROP_WARN_INTERVAL + 1)).toBe(false);
    expect(shouldWarnAt(2 * DROP_WARN_INTERVAL)).toBe(true);
  });
});
