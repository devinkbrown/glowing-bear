import { activeLocale, formatDate, formatRelative, t } from './i18n';

export type TimestampFormat = '12h' | '24h' | 'off' | 'relative';

/**
 * Format a Date for display in the chat log.
 */
export function formatTimestamp(date: Date, format: TimestampFormat): string {
	if (format === 'off') return '';
	if (format === 'relative') return relativeTime(date);

	if (format === '24h') {
		return formatDate(date, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
	}

	return formatDate(date, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Parse an IRCv3 server-time tag value (ISO 8601) into a Date.
 * Returns null if the value is absent or unparseable.
 */
export function parseServerTime(tag: string): Date | null {
	if (!tag) return null;
	const d = new Date(tag);
	if (isNaN(d.getTime())) return null;
	return d;
}

/**
 * Format a date relative to now, e.g. "2 minutes ago", "just now".
 */
export function relativeTime(date: Date): string {
	const now = Date.now();
	const diffMs = now - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);

	if (diffSec < 10) return t('time.justNow');
	if (diffSec < 60) return formatRelative(-diffSec, 'second');

	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return formatRelative(-diffMin, 'minute');

	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return formatRelative(-diffHr, 'hour');

	const diffDay = Math.floor(diffHr / 24);
	if (diffDay < 7) return formatRelative(-diffDay, 'day', diffDay === 1 ? 'auto' : 'always');

	const diffWk = Math.floor(diffDay / 7);
	if (diffWk < 5) return formatRelative(-diffWk, 'week');

	const diffMo = Math.floor(diffDay / 30);
	if (diffMo < 12) return formatRelative(-diffMo, 'month');

	const diffYr = Math.floor(diffDay / 365);
	return formatRelative(-diffYr, 'year');
}

/**
 * Full date+time string for hover tooltips.
 */
export function formatFullTimestamp(date: Date): string {
	return date.toLocaleString(activeLocale());
}
