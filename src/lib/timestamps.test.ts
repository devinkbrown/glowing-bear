import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatFullTimestamp,
  formatTimestamp,
  parseServerTime,
  relativeTime,
} from './timestamps';
import { applyLocalePreference } from './i18n';

const NOW = new Date('2026-07-12T12:00:00.000Z');

describe('timestamps', () => {
  beforeEach(() => {
    applyLocalePreference('en');
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatTimestamp', () => {
    it('formats midnight in 24-hour and 12-hour modes', () => {
      const midnight = new Date(2026, 6, 12, 0, 5, 0);

      const time24 = formatTimestamp(midnight, '24h');
      const time12 = formatTimestamp(midnight, '12h');

      expect(time24).toBe('00:05');
      expect(time12).toBe('12:05 AM');
    });

    it('formats noon in 24-hour and 12-hour modes', () => {
      const noon = new Date(2026, 6, 12, 12, 30, 0);

      const time24 = formatTimestamp(noon, '24h');
      const time12 = formatTimestamp(noon, '12h');

      expect(time24).toBe('12:30');
      expect(time12).toBe('12:30 PM');
    });

    it('returns an empty string when timestamps are off', () => {
      const date = new Date(2026, 6, 12, 9, 15, 0);

      const formatted = formatTimestamp(date, 'off');

      expect(formatted).toBe('');
    });

    it('uses relative formatting for relative mode', () => {
      const twoMinutesAgo = new Date(NOW.getTime() - 2 * 60 * 1000);

      const formatted = formatTimestamp(twoMinutesAgo, 'relative');

      expect(formatted).toBe('2 minutes ago');
    });
  });

  describe('parseServerTime', () => {
    it('parses a valid IRCv3 server-time tag', () => {
      const parsed = parseServerTime('2026-07-12T12:34:56.789Z');

      expect(parsed?.toISOString()).toBe('2026-07-12T12:34:56.789Z');
    });

    it('returns null for empty or invalid server-time tags', () => {
      expect(parseServerTime('')).toBeNull();
      expect(parseServerTime('not-a-date')).toBeNull();
    });
  });

  describe('relativeTime', () => {
    it.each([
      [9, 'just now'],
      [10, '10 seconds ago'],
      [59, '59 seconds ago'],
      [60, '1 minute ago'],
      [2 * 60, '2 minutes ago'],
      [60 * 60, '1 hour ago'],
      [2 * 60 * 60, '2 hours ago'],
      [24 * 60 * 60, 'yesterday'],
      [3 * 24 * 60 * 60, '3 days ago'],
      [7 * 24 * 60 * 60, '1 week ago'],
      [21 * 24 * 60 * 60, '3 weeks ago'],
      [35 * 24 * 60 * 60, '1 month ago'],
      [90 * 24 * 60 * 60, '3 months ago'],
      [365 * 24 * 60 * 60, '1 year ago'],
      [2 * 365 * 24 * 60 * 60, '2 years ago'],
    ])('formats %i seconds ago as %s', (secondsAgo, expected) => {
      const date = new Date(NOW.getTime() - secondsAgo * 1000);

      const formatted = relativeTime(date);

      expect(formatted).toBe(expected);
    });
  });

  describe('formatFullTimestamp', () => {
    it('returns the platform locale date and time string', () => {
      const date = new Date('2026-07-12T12:34:56.000Z');

      const formatted = formatFullTimestamp(date);

      expect(formatted).toBe(date.toLocaleString('en'));
    });
  });

  it('uses the active locale for relative units', () => {
    applyLocalePreference('de');
    const twoMinutesAgo = new Date(NOW.getTime() - 2 * 60 * 1000);

    expect(relativeTime(twoMinutesAgo)).toBe('vor 2 Minuten');
  });
});
