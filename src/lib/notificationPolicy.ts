export const NOTIFICATION_POLICY_MESSAGE = 'darkbear-notification-policy';
export const NOTIFICATION_ACTION_MESSAGE = 'darkbear-notification-action';

export type NotificationAction = 'open' | 'mark-read' | 'mute-1h' | 'reply';

export interface QuietHoursSchedule {
  enabled: boolean;
  start: string;
  end: string;
  /** IANA zone name, or `system` to follow the browser's current zone. */
  timeZone: string;
}

export interface NotificationPolicySnapshot {
  enabled: boolean;
  snoozedUntil: number;
  quietHours: QuietHoursSchedule;
  mutedTargets: string[];
  temporaryMutes: Record<string, number>;
}

export interface NotificationActionMessage {
  type: typeof NOTIFICATION_ACTION_MESSAGE;
  action: NotificationAction;
  bufferId?: string;
  target?: string;
  /** Opaque tab-local relay profile/session binding. */
  connectionScope?: string;
  reply?: string;
}

const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_REPLY_LENGTH = 2_000;

export function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && CLOCK_TIME.test(value);
}

export function isValidTimeZone(value: unknown): value is string {
  if (value === 'system') return true;
  if (typeof value !== 'string' || value.length === 0 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function resolvedTimeZone(value: string): string {
  return value === 'system' || !isValidTimeZone(value) ? systemTimeZone() : value;
}

function clockMinutes(value: string): number | null {
  if (!isClockTime(value)) return null;
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function zonedMinutes(now: Date, timeZone: string): number {
  if (timeZone === 'system') return now.getHours() * 60 + now.getMinutes();
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: resolvedTimeZone(timeZone),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24;
    const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    return hours * 60 + minutes;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

/** True when `now` falls inside the schedule, including overnight ranges. */
export function quietHoursActive(schedule: QuietHoursSchedule, now = new Date()): boolean {
  if (!schedule.enabled) return false;
  const start = clockMinutes(schedule.start);
  const end = clockMinutes(schedule.end);
  if (start === null || end === null || start === end) return false;
  const current = zonedMinutes(now, schedule.timeZone);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

export function normalizeNotificationTarget(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase().slice(0, 256) : '';
}

/**
 * One pure delivery gate shared by the foreground app and the service-worker
 * contract. Existing all/mentions/mute tiers run before this policy; this layer
 * only adds global DND and expiring target mutes.
 */
export function notificationPolicyAllows(
  policy: NotificationPolicySnapshot,
  target?: string,
  now = Date.now(),
): boolean {
  if (!policy.enabled || policy.snoozedUntil > now) return false;
  if (quietHoursActive(policy.quietHours, new Date(now))) return false;
  const normalized = normalizeNotificationTarget(target);
  if (!normalized) return true;
  if (policy.mutedTargets.some((item) => normalizeNotificationTarget(item) === normalized)) return false;
  return !((policy.temporaryMutes[normalized] ?? 0) > now);
}

export function untilTomorrow(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

export function notificationActionMessage(value: unknown): NotificationActionMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (item.type !== NOTIFICATION_ACTION_MESSAGE) return null;
  if (item.action !== 'open' && item.action !== 'mark-read' &&
      item.action !== 'mute-1h' && item.action !== 'reply') return null;
  const message: NotificationActionMessage = {
    type: NOTIFICATION_ACTION_MESSAGE,
    action: item.action,
  };
  if (typeof item.bufferId === 'string' && item.bufferId) message.bufferId = item.bufferId.slice(0, 256);
  if (typeof item.target === 'string' && item.target) message.target = item.target.slice(0, 256);
  if (typeof item.connectionScope === 'string' && /^[a-zA-Z0-9_-]{32,128}$/.test(item.connectionScope)) {
    message.connectionScope = item.connectionScope;
  }
  if (typeof item.reply === 'string' && item.reply.trim()) {
    message.reply = item.reply.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_REPLY_LENGTH);
  }
  return message;
}
