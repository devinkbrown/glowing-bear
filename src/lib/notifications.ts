import { ENVELOPE_PREFIX, LOCKED_PLACEHOLDER } from './e2ee/dmCipher';

const ICON = '/darkbear/favicon.svg';
const NOTIFY_TIMEOUT = 5000;
const TITLE_BASE = 'DarkBear';

/**
 * Neutral body shown for a DM that reaches the alert path unreadable — an
 * unopened TSUMUGI1 ciphertext envelope or the locked placeholder. OS
 * notifications can render on a lock screen, so ciphertext (or a decrypt-failed
 * sentinel) must never surface there. Decrypt happens upstream; if it didn't,
 * we fail CLOSED to this string.
 */
export const ENCRYPTED_BODY = 'New encrypted message';

/**
 * Fail closed for E2EE DMs. Returns a neutral string when `body` is an
 * unreadable encrypted DM; otherwise returns the plaintext untouched. Pure and
 * DOM-free so the decision is exhaustively testable.
 */
export function safeNotificationBody(body: string): string {
	if (body.startsWith(ENVELOPE_PREFIX) || body === LOCKED_PLACEHOLDER) {
		return ENCRYPTED_BODY;
	}
	return body;
}

// iOS requires AudioContext to be created/resumed inside a user gesture.
// We unlock it on first touch/click so subsequent playSound() calls work.
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
	try {
		if (!_audioCtx) _audioCtx = new AudioContext();
		if (_audioCtx.state === 'suspended') _audioCtx.resume();
		return _audioCtx;
	} catch {
		return null;
	}
}
if (typeof window !== 'undefined') {
	const unlock = () => { getAudioCtx(); };
	window.addEventListener('touchstart', unlock, { once: true, passive: true });
	window.addEventListener('click', unlock, { once: true, passive: true });
}

let permissionGranted = false;

export async function requestPermission(): Promise<boolean> {
	if (typeof window === 'undefined' || !('Notification' in window)) return false;
	if (Notification.permission === 'granted') {
		permissionGranted = true;
		return true;
	}
	if (Notification.permission === 'denied') return false;
	const result = await Notification.requestPermission();
	permissionGranted = result === 'granted';
	return permissionGranted;
}

export function notify(title: string, body: string, icon?: string, bufferId?: string): void {
	if (typeof window === 'undefined' || !('Notification' in window)) return;
	if (Notification.permission !== 'granted') return;
	// Don't notify when the window is focused
	if (typeof document !== 'undefined' && document.hasFocus()) return;

	try {
		const n = new Notification(title, {
			body: safeNotificationBody(body),
			icon: icon ?? ICON,
			tag: title
		});
		n.onclick = () => {
			window.focus();
			if (bufferId) {
				window.dispatchEvent(new CustomEvent('jump-to-buffer', { detail: bufferId }));
			}
			n.close();
		};
		setTimeout(() => n.close(), NOTIFY_TIMEOUT);
	} catch {
		// Notifications are blocked in some secure contexts (e.g. sandboxed iframes)
	}
}

export function updateTitle(highlights: number, unread: number): void {
	if (typeof document === 'undefined') return;
	if (highlights > 0) {
		document.title = `(${highlights}) ${TITLE_BASE}`;
	} else if (unread > 0) {
		document.title = `[${unread}] ${TITLE_BASE}`;
	} else {
		document.title = TITLE_BASE;
	}
}

export function clearTitle(): void {
	if (typeof document !== 'undefined') {
		document.title = TITLE_BASE;
	}
}

export function playSound(): void {
	try {
		const ctx = getAudioCtx();
		if (!ctx) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.type = 'sine';
		osc.frequency.setValueAtTime(1000, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.12);
		gain.gain.setValueAtTime(0.25, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
		osc.start(ctx.currentTime);
		osc.stop(ctx.currentTime + 0.35);
	} catch {
		// AudioContext unavailable (e.g. sandboxed iframe)
	}
}
