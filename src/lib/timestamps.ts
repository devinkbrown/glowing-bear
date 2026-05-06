export type TimestampFormat = '12h' | '24h' | 'off' | 'relative';

/**
 * Format a Date for display in the chat log.
 */
export function formatTimestamp(date: Date, format: TimestampFormat): string {
	if (format === 'off') return '';

	const h = date.getHours();
	const m = String(date.getMinutes()).padStart(2, '0');

	if (format === '24h') {
		return `${String(h).padStart(2, '0')}:${m}`;
	}

	// 12h
	const ampm = h >= 12 ? 'PM' : 'AM';
	const h12 = h % 12 || 12;
	return `${h12}:${m} ${ampm}`;
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

	if (diffSec < 10) return 'just now';
	if (diffSec < 60) return `${diffSec} seconds ago`;

	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;

	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return diffHr === 1 ? '1 hour ago' : `${diffHr} hours ago`;

	const diffDay = Math.floor(diffHr / 24);
	if (diffDay < 7) return diffDay === 1 ? 'yesterday' : `${diffDay} days ago`;

	const diffWk = Math.floor(diffDay / 7);
	if (diffWk < 5) return diffWk === 1 ? '1 week ago' : `${diffWk} weeks ago`;

	const diffMo = Math.floor(diffDay / 30);
	if (diffMo < 12) return diffMo === 1 ? '1 month ago' : `${diffMo} months ago`;

	const diffYr = Math.floor(diffDay / 365);
	return diffYr === 1 ? '1 year ago' : `${diffYr} years ago`;
}

/**
 * Full date+time string for hover tooltips.
 */
export function formatFullTimestamp(date: Date): string {
	return date.toLocaleString();
}
