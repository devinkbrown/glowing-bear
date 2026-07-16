import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENVELOPE_PREFIX, LOCKED_PLACEHOLDER } from './e2ee/dmCipher';
import {
	ENCRYPTED_BODY,
	NOTIFICATION_CLIENT_SCOPE_ACK,
	NOTIFICATION_CLIENT_SCOPE_MESSAGE,
	notify,
	safeNotificationBody,
} from './notifications';

class FakeMessagePort {
	peer: FakeMessagePort | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	postMessage(value: unknown): void {
		queueMicrotask(() => this.peer?.onmessage?.({ data: value }));
	}
	start(): void {}
	close(): void {}
}

class FakeMessageChannel {
	port1 = new FakeMessagePort();
	port2 = new FakeMessagePort();
	constructor() {
		this.port1.peer = this.port2;
		this.port2.peer = this.port1;
	}
}

describe('safeNotificationBody — E2EE DM fail-closed', () => {
  it('replaces a TSUMUGI1 ciphertext envelope with the neutral body', () => {
    const cipher = `${ENVELOPE_PREFIX}QUJDREVGnonce-and-ciphertext`;

    expect(safeNotificationBody(cipher)).toBe(ENCRYPTED_BODY);
  });

  it('replaces the exact locked placeholder sentinel with the neutral body', () => {
    expect(safeNotificationBody(LOCKED_PLACEHOLDER)).toBe(ENCRYPTED_BODY);
  });

  it('never leaks ciphertext bytes into the returned body', () => {
    const cipher = `${ENVELOPE_PREFIX}c2VjcmV0LWNpcGhlcnRleHQ`;

    expect(safeNotificationBody(cipher)).not.toContain('c2VjcmV0');
    expect(safeNotificationBody(cipher)).not.toContain(ENVELOPE_PREFIX);
  });

  it('passes an ordinary plaintext body through untouched', () => {
    const plain = 'hey, are you around?';

    expect(safeNotificationBody(plain)).toBe(plain);
  });

  it('does not false-positive on plaintext that merely mentions the word encrypted', () => {
    const plain = 'my TSUMUGI1 build is broken'; // no leading prefix

    expect(safeNotificationBody(plain)).toBe(plain);
  });

  it('passes an empty body through untouched', () => {
    expect(safeNotificationBody('')).toBe('');
  });
});

describe('notify() — wiring feeds the body through the fail-closed guard', () => {
	const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
		if (originalServiceWorkerDescriptor) {
			Object.defineProperty(navigator, 'serviceWorker', originalServiceWorkerDescriptor);
		} else {
			Reflect.deleteProperty(navigator, 'serviceWorker');
		}
  });

	function stubNotification() {
    const bodies: string[] = [];
    class MockNotification {
      static permission = 'granted';
      onclick: (() => void) | null = null;
      constructor(_title: string, options: { body: string }) {
        bodies.push(options.body);
      }
      close() {}
    }
    vi.stubGlobal('Notification', MockNotification);
    // notify() returns early when the window is focused — simulate background.
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    return bodies;
  }

	function stubServiceWorkerScope(ok: boolean) {
		const order: string[] = [];
		const showNotification = vi.fn(async (_title: string, _options: unknown) => {
			order.push('show');
		});
		const controller = {
			postMessage: vi.fn((message: unknown, transfer: unknown[]) => {
				order.push('register');
				const request = message as { type?: unknown; scope?: unknown };
				expect(request.type).toBe(NOTIFICATION_CLIENT_SCOPE_MESSAGE);
				expect(request.scope).toMatch(/^[a-f0-9]{48}$/);
				(transfer[0] as FakeMessagePort).postMessage({
					type: NOTIFICATION_CLIENT_SCOPE_ACK,
					ok,
				});
			}),
		};
		vi.stubGlobal('MessageChannel', FakeMessageChannel);
		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true,
			value: {
				controller,
				ready: Promise.resolve({ active: controller, showNotification }),
			},
		});
		return { controller, order, showNotification };
	}

  it('renders the neutral body for an encrypted DM envelope', () => {
    const bodies = stubNotification();

    notify('Message from trev', `${ENVELOPE_PREFIX}AAAA`);

    expect(bodies).toEqual([ENCRYPTED_BODY]);
  });

  it('renders plaintext DMs as-is', () => {
    const bodies = stubNotification();

    notify('Message from trev', 'lunch at noon?');

    expect(bodies).toEqual(['lunch at noon?']);
  });

	it('uses the active service worker for open, read, mute, and reply actions', async () => {
		const bodies = stubNotification();
		const { controller, order, showNotification } = stubServiceWorkerScope(true);

		notify(
			'Highlight in #darkbear',
			'kain: ping',
			undefined,
			'0xcafe',
			'irc.orochi.#darkbear',
			'a'.repeat(48),
		);

		await vi.waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1));
		const options = showNotification.mock.calls[0]?.[1] as {
			actions?: Array<{ action: string }>;
			data?: Record<string, unknown>;
		};
		expect(options.actions?.map((action) => action.action)).toEqual([
			'open', 'mark-read', 'mute-1h', 'reply',
		]);
		expect(options.data).toMatchObject({
			url: '/darkbear/',
			bufferId: '0xcafe',
			target: 'irc.orochi.#darkbear',
			connectionScope: 'a'.repeat(48),
			clientScope: expect.stringMatching(/^[a-f0-9]{48}$/),
		});
		expect(controller.postMessage).toHaveBeenCalledOnce();
		expect(order).toEqual(['register', 'show']);
		expect(bodies).toEqual([]);
	});

	it('shows only Open with clean data when the scope registration is not acknowledged', async () => {
		const bodies = stubNotification();
		const { order, showNotification } = stubServiceWorkerScope(false);

		notify('Highlight in #darkbear', 'kain: ping', undefined, '0xsecret');

		await vi.waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1));
		const options = showNotification.mock.calls[0]?.[1] as {
			actions?: Array<{ action: string }>;
			data?: Record<string, unknown>;
		};
		expect(options.actions).toEqual([{ action: 'open', title: 'Open' }]);
		expect(options.data).toEqual({ url: '/darkbear/' });
		expect(options.data).not.toHaveProperty('bufferId');
		expect(options.data).not.toHaveProperty('clientScope');
		expect(order).toEqual(['register', 'show']);
		expect(bodies).toEqual([]);
	});
});
