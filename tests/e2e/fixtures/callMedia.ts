import type { Page } from '@playwright/test';

/** Deterministic microphone/permission surface for real browser call journeys. */
export async function installCallMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    (window as typeof window & { __darkbearCallContexts?: AudioContext[] }).__darkbearCallContexts = contexts;
    const mediaDevices = new EventTarget() as MediaDevices;
    Object.defineProperties(mediaDevices, {
      getUserMedia: {
        value: async () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const destination = context.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          contexts.push(context);
          return destination.stream;
        },
      },
      enumerateDevices: {
        value: async () => [
          { deviceId: 'call-mic', groupId: 'input', kind: 'audioinput', label: 'Call microphone', toJSON() { return this; } },
          { deviceId: 'call-speaker', groupId: 'output', kind: 'audiooutput', label: 'Call speakers', toJSON() { return this; } },
        ] satisfies MediaDeviceInfo[],
      },
    });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: async () => ({
          state: 'granted',
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return false; },
        }),
      },
    });
  });
}
