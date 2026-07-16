import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_ACTION_MESSAGE,
  isClockTime,
  isValidTimeZone,
  notificationActionMessage,
  notificationPolicyAllows,
  quietHoursActive,
  untilTomorrow,
  type NotificationPolicySnapshot,
} from './notificationPolicy';

const policy = (overrides: Partial<NotificationPolicySnapshot> = {}): NotificationPolicySnapshot => ({
  enabled: true,
  snoozedUntil: 0,
  quietHours: { enabled: false, start: '22:00', end: '07:00', timeZone: 'UTC' },
  mutedTargets: [],
  temporaryMutes: {},
  ...overrides,
});

describe('quietHoursActive', () => {
  it('handles an overnight window in its configured IANA timezone', () => {
    const schedule = { enabled: true, start: '22:00', end: '07:00', timeZone: 'UTC' };
    expect(quietHoursActive(schedule, new Date('2026-07-16T23:30:00Z'))).toBe(true);
    expect(quietHoursActive(schedule, new Date('2026-07-16T06:59:00Z'))).toBe(true);
    expect(quietHoursActive(schedule, new Date('2026-07-16T07:00:00Z'))).toBe(false);
  });

  it('evaluates the same instant differently across zones', () => {
    const now = new Date('2026-07-16T22:30:00Z');
    expect(quietHoursActive({ enabled: true, start: '18:00', end: '20:00', timeZone: 'America/New_York' }, now)).toBe(true);
    expect(quietHoursActive({ enabled: true, start: '18:00', end: '20:00', timeZone: 'UTC' }, now)).toBe(false);
  });

  it('treats disabled, malformed, and equal ranges as inactive', () => {
    const now = new Date('2026-07-16T23:00:00Z');
    expect(quietHoursActive({ enabled: false, start: '22:00', end: '07:00', timeZone: 'UTC' }, now)).toBe(false);
    expect(quietHoursActive({ enabled: true, start: 'bad', end: '07:00', timeZone: 'UTC' }, now)).toBe(false);
    expect(quietHoursActive({ enabled: true, start: '22:00', end: '22:00', timeZone: 'UTC' }, now)).toBe(false);
  });
});

describe('notificationPolicyAllows', () => {
  const now = Date.parse('2026-07-16T12:00:00Z');

  it('blocks disabled, snoozed, quiet-hour, permanent, and temporary targets', () => {
    expect(notificationPolicyAllows(policy({ enabled: false }), 'alice', now)).toBe(false);
    expect(notificationPolicyAllows(policy({ snoozedUntil: now + 1 }), 'alice', now)).toBe(false);
    expect(notificationPolicyAllows(policy({
      quietHours: { enabled: true, start: '11:00', end: '13:00', timeZone: 'UTC' },
    }), 'alice', now)).toBe(false);
    expect(notificationPolicyAllows(policy({ mutedTargets: ['Alice'] }), 'alice', now)).toBe(false);
    expect(notificationPolicyAllows(policy({ temporaryMutes: { alice: now + 1 } }), 'ALICE', now)).toBe(false);
  });

  it('allows an expired target mute without mutating the stored policy', () => {
    const value = policy({ temporaryMutes: { alice: now - 1 } });
    expect(notificationPolicyAllows(value, 'alice', now)).toBe(true);
    expect(value.temporaryMutes.alice).toBe(now - 1);
  });
});

describe('notification policy validation', () => {
  it('validates clock values and IANA zones', () => {
    expect(isClockTime('00:00')).toBe(true);
    expect(isClockTime('24:00')).toBe(false);
    expect(isValidTimeZone('system')).toBe(true);
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('sanitizes action messages and bounds inline replies', () => {
    const parsed = notificationActionMessage({
      type: NOTIFICATION_ACTION_MESSAGE,
      action: 'reply',
      bufferId: '0x1',
      connectionScope: 'a'.repeat(48),
      reply: `hello\r\nworld${'!'.repeat(3_000)}`,
    });
    expect(parsed?.reply).toMatch(/^hello world/);
    expect(parsed?.reply).toHaveLength(2_000);
    expect(parsed?.connectionScope).toBe('a'.repeat(48));
    expect(notificationActionMessage({
      type: NOTIFICATION_ACTION_MESSAGE,
      action: 'reply',
      connectionScope: 'predictable',
      reply: 'hello',
    })?.connectionScope).toBeUndefined();
    expect(notificationActionMessage({ type: NOTIFICATION_ACTION_MESSAGE, action: 'delete' })).toBeNull();
  });

  it('returns the next local midnight', () => {
    const now = new Date(2026, 6, 16, 12, 30);
    expect(new Date(untilTomorrow(now))).toEqual(new Date(2026, 6, 17, 0, 0));
  });
});
