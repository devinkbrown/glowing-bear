import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENVELOPE_PREFIX, LOCKED_PLACEHOLDER } from './e2ee/dmCipher';
import { ENCRYPTED_BODY, notify, safeNotificationBody } from './notifications';

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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
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
});
