import { afterEach, describe, expect, it } from 'vitest';
import { browserOnline, setupBrowserConnectivity } from './connectivity';

const originalOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

afterEach(() => {
  if (originalOnline) Object.defineProperty(Navigator.prototype, 'onLine', originalOnline);
  delete (navigator as unknown as { onLine?: boolean }).onLine;
});

describe('browser connectivity state', () => {
  it('tracks online and offline browser events and removes its listeners', () => {
    setOnline(true);
    const cleanup = setupBrowserConnectivity();
    expect(browserOnline()).toBe(true);

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(browserOnline()).toBe(false);

    setOnline(true);
    window.dispatchEvent(new Event('online'));
    expect(browserOnline()).toBe(true);

    cleanup();
    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(browserOnline()).toBe(true);
  });
});
