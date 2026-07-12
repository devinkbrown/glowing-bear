import { afterEach, describe, expect, it, vi } from 'vitest';

import { vapidKeyToBytes, webPushSupported } from './webPush';

describe('vapidKeyToBytes', () => {
  it('decodes a normal base64url VAPID key', () => {
    const bytes = vapidKeyToBytes('SGVsbG8td29ybGQ');

    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111, 45, 119, 111, 114, 108, 100]);
  });

  it('handles url-safe characters and missing padding', () => {
    const bytes = vapidKeyToBytes('-_8');

    expect(Array.from(bytes)).toEqual([251, 255]);
  });

  it('returns an empty byte array for an empty key', () => {
    const bytes = vapidKeyToBytes('');

    expect(bytes).toHaveLength(0);
  });

  it('rejects malformed or scheme-like input instead of producing bytes', () => {
    expect(() => vapidKeyToBytes('javascript:alert(1)')).toThrow();
    expect(() => vapidKeyToBytes('</script><img src=x onerror=alert(1)>')).toThrow();
  });
});

describe('webPushSupported', () => {
  const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalServiceWorkerDescriptor) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorkerDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('returns false when required browser push APIs are absent', () => {
    expect(webPushSupported()).toBe(false);
  });

  it('returns true only when service workers, PushManager, and Notification exist', () => {
    vi.stubGlobal('PushManager', class PushManager {});
    vi.stubGlobal('Notification', class Notification {});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });

    expect(webPushSupported()).toBe(true);
  });
});
