import { ENVELOPE_PREFIX, LOCKED_PLACEHOLDER } from './e2ee/dmCipher';
import {
	NOTIFICATION_POLICY_MESSAGE,
	type NotificationPolicySnapshot,
} from './notificationPolicy';
import {
	appAsset,
	isDesktopRuntime,
	requestDesktopNotificationPermission,
	sendDesktopNotification,
} from './desktop';
export { claimAlertDelivery, setAlertCoordinatorActive } from './tabAlertCoordinator';

const ICON = appAsset('favicon.svg');
const NOTIFY_TIMEOUT = 5000;
const TITLE_BASE = 'DarkBear';
export const NOTIFICATION_CLIENT_SCOPE_MESSAGE = 'darkbear-notification-client-scope';
export const NOTIFICATION_CLIENT_SCOPE_ACK = 'darkbear-notification-client-scope-ack';
const CLIENT_SCOPE_ACK_TIMEOUT = 1500;
let documentNotificationClientScope: string | null = null;

function notificationClientScope(): string | null {
	if (documentNotificationClientScope) return documentNotificationClientScope;
	try {
		const random = globalThis.crypto?.getRandomValues(new Uint8Array(24));
		if (!random) return null;
		documentNotificationClientScope = Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('');
		return documentNotificationClientScope;
	} catch {
		// Never substitute a predictable identifier for document routing.
		return null;
	}
}

/** Bind this document's opaque notification scope to its exact WindowClient. */
export async function registerNotificationClientScope(): Promise<string | null> {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
	if (typeof MessageChannel === 'undefined') return null;
	const scope = notificationClientScope();
	if (!scope) return null;
	try {
		const registration = await navigator.serviceWorker.ready;
		const worker = navigator.serviceWorker.controller ?? registration.active;
		if (!worker) return null;
		return await new Promise<string | null>((resolve) => {
			const channel = new MessageChannel();
			let settled = false;
			const finish = (value: string | null) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				channel.port1.close();
				resolve(value);
			};
			const timeout = setTimeout(() => finish(null), CLIENT_SCOPE_ACK_TIMEOUT);
			channel.port1.onmessage = (event: MessageEvent<unknown>) => {
				const reply = event.data as { type?: unknown; ok?: unknown } | null;
				finish(reply?.type === NOTIFICATION_CLIENT_SCOPE_ACK && reply.ok === true ? scope : null);
			};
			channel.port1.start();
			try {
				worker.postMessage(
					{ type: NOTIFICATION_CLIENT_SCOPE_MESSAGE, scope },
					[channel.port2],
				);
			} catch {
				finish(null);
			}
		});
	} catch {
		return null;
	}
}

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
			if (_audioCtx.state === 'suspended') void _audioCtx.resume().catch(() => {});
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
	const desktopPermission = await requestDesktopNotificationPermission();
	if (desktopPermission !== null) return desktopPermission;
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

export function notify(
	title: string,
	body: string,
	icon?: string,
	bufferId?: string,
	target?: string,
	connectionScope?: string,
): void {
	if (typeof window === 'undefined') return;
	// Don't notify when the window is focused
	if (typeof document !== 'undefined' && document.hasFocus()) return;

	const safeBody = safeNotificationBody(body);
	if (isDesktopRuntime()) {
		void sendDesktopNotification({ title, body: safeBody });
		return;
	}
	if (!('Notification' in window) || Notification.permission !== 'granted') return;
	const fallback = () => {
		try {
			const n = new Notification(title, {
				body: safeBody,
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
	};

	// Service-worker notifications can expose actions; the constructor fallback
	// preserves click-to-open on browsers/pages without an active controller.
	if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
		void showActionableNotification(title, safeBody, icon, bufferId, target, connectionScope)
			.then((shown) => { if (!shown) fallback(); });
		return;
	}
	fallback();
}

async function showActionableNotification(
	title: string,
	body: string,
	icon?: string,
	bufferId?: string,
	target?: string,
	connectionScope?: string,
): Promise<boolean> {
	try {
		const registration = await navigator.serviceWorker.ready;
		const clientScope = await registerNotificationClientScope();
		const actionable = clientScope !== null &&
			typeof connectionScope === 'string' &&
			/^[a-zA-Z0-9_-]{32,128}$/.test(connectionScope);
		const options = {
			body,
			icon: icon ?? ICON,
			badge: ICON,
			tag: bufferId ? `darkbear-buffer-${bufferId}` : title,
			renotify: true,
			data: actionable
				? { url: '/darkbear/', bufferId, target, connectionScope, clientScope }
				: { url: '/darkbear/' },
			actions: actionable
				? [
					{ action: 'open', title: 'Open' },
					{ action: 'mark-read', title: 'Mark read' },
					{ action: 'mute-1h', title: 'Mute 1 hour' },
					// `type`/`placeholder` are currently implemented only on some
					// platforms; unsupported members are ignored by other browsers.
					{ action: 'reply', title: 'Reply', type: 'text', placeholder: 'Reply…' },
				]
				: [{ action: 'open', title: 'Open' }],
		};
		await registration.showNotification(title, options as unknown as NotificationOptions);
		return true;
	} catch {
		return false;
	}
}

/** Persist the foreground policy into the production service worker for push. */
export async function syncNotificationPolicy(policy: NotificationPolicySnapshot): Promise<void> {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	if (!navigator.serviceWorker.controller) return;
	try {
		const registration = await navigator.serviceWorker.ready;
		const recipients = new Set<ServiceWorker>();
		if (navigator.serviceWorker.controller) recipients.add(navigator.serviceWorker.controller);
		if (registration.active) recipients.add(registration.active);
		for (const worker of recipients) {
			worker.postMessage({ type: NOTIFICATION_POLICY_MESSAGE, policy });
		}
	} catch {
		// A missing/unready worker must never interfere with foreground alerts.
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
