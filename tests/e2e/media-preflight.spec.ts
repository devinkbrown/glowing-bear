import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

async function installDeterministicMedia(page: Page, mode: 'ready' | 'denied' | 'recover' = 'ready'): Promise<void> {
  await page.addInitScript((captureMode) => {
    let attempts = 0;
    const mediaDevices = new EventTarget() as MediaDevices;
    Object.defineProperties(mediaDevices, {
      getUserMedia: {
        value: async (constraints: MediaStreamConstraints) => {
          attempts += 1;
          (window as typeof window & { __darkbearCaptureAttempts?: () => number }).__darkbearCaptureAttempts = () => attempts;
          if (captureMode === 'denied') throw new DOMException('blocked for test', 'NotAllowedError');
          if (captureMode === 'recover') {
            const audio = constraints.audio as MediaTrackConstraints | undefined;
            const device = audio?.deviceId as ConstrainDOMString | undefined;
            if (typeof device === 'object' && device && 'exact' in device && device.exact === 'missing-mic') {
              throw new DOMException('device disconnected', 'OverconstrainedError');
            }
          }
          return new MediaStream();
        },
      },
      enumerateDevices: {
        value: async () => [
          { deviceId: 'mic-default', groupId: 'input', kind: 'audioinput', label: 'Desk microphone', toJSON() { return this; } },
          { deviceId: 'camera-default', groupId: 'input', kind: 'videoinput', label: 'Desk camera', toJSON() { return this; } },
          { deviceId: 'speaker-default', groupId: 'output', kind: 'audiooutput', label: 'Desk speakers', toJSON() { return this; } },
        ] satisfies MediaDeviceInfo[],
      },
    });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: async () => ({
          state: captureMode === 'denied' ? 'denied' : 'granted',
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return false; },
        }),
      },
    });
    if (captureMode === 'recover') {
      localStorage.setItem('darkbear_media_devices_v1', JSON.stringify({
        microphoneId: 'missing-mic', cameraId: null, speakerId: null,
      }));
    }
  }, mode);
}

async function connectRelay(page: Page): Promise<MockWeeChatRelay> {
  const relay = new MockWeeChatRelay();
  await relay.install(page);
  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  await page.getByLabel('Hostname', { exact: true }).fill('relay.test');
  await page.getByRole('button', { name: 'TLS', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('media-e2e-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();
  return relay;
}

test.describe('media preflight', () => {
  test('checks devices and the shipped codec before offering room join', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await installDeterministicMedia(page);
    await connectRelay(page);

    // Playwright WebKit cannot synthesize a usable video track. Keep its
    // browser journey audio-only; the same preflight still constructs the real
    // KaguraVis encoder, while Chromium/Firefox also exercise camera UI.
    const video = !testInfo.project.name.includes('webkit');
    const action = video ? 'Join video' : 'Join voice';
    await page.getByRole('button', { name: action }).click();
    const dialog = page.getByRole('dialog', { name: 'Media preflight' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('Encoder ready', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByText('Signal received', { exact: true })).toHaveCount(video ? 2 : 1, { timeout: 60_000 });
    await expect(dialog.getByRole('button', { name: action })).toBeEnabled();
    await expect(dialog.getByRole('combobox', { name: 'Microphone' })).toContainText('Desk microphone');
    if (video) await expect(dialog.getByRole('combobox', { name: 'Camera' })).toContainText('Desk camera');
    await expect(dialog.getByRole('combobox', { name: 'Speaker' })).toContainText('Desk speakers');

    // Axe samples composited colors. Firefox can finish the codec self-test
    // before the shared modal's 250 ms entrance animation, which makes every
    // foreground appear artificially dim while the overlay is still fading.
    // Wait for the actual rendered readiness boundary instead of sleeping.
    await expect(dialog.locator('..')).toHaveCSS('opacity', '1');

    const axe = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await testInfo.attach('media-preflight-axe-results', {
      body: JSON.stringify(axe, null, 2),
      contentType: 'application/json',
    });
    expect(axe.violations.map((violation) => violation.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('blocks the room action when microphone permission is denied', async ({ page }) => {
    await installDeterministicMedia(page, 'denied');
    await connectRelay(page);

    await page.getByRole('button', { name: 'Join voice' }).click();
    const dialog = page.getByRole('dialog', { name: 'Media preflight' });
    await expect(dialog.getByRole('alert')).toContainText('permission is blocked');
    await expect(dialog.getByText('Access blocked', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Join voice' })).toBeDisabled();
    await expect(page.getByText('connecting…', { exact: true })).toHaveCount(0);
  });

  test('drops a disconnected saved microphone and retries the system default', async ({ page }) => {
    await installDeterministicMedia(page, 'recover');
    await connectRelay(page);

    await page.getByRole('button', { name: 'Join voice' }).click();
    const dialog = page.getByRole('dialog', { name: 'Media preflight' });
    await expect(dialog.getByText('Encoder ready', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Join voice' })).toBeEnabled();
    const recovery = await page.evaluate(() => ({
      attempts: (window as typeof window & { __darkbearCaptureAttempts?: () => number }).__darkbearCaptureAttempts?.(),
      stored: JSON.parse(localStorage.getItem('darkbear_media_devices_v1') ?? '{}') as Record<string, unknown>,
    }));
    expect(recovery.attempts).toBe(2);
    expect(recovery.stored['microphoneId']).toBeNull();
  });

  test('blocks the room action when the shipped codec cannot load', async ({ page }) => {
    await installDeterministicMedia(page);
    await page.route(/opcodec_wasm\.js/, (route) => route.abort());
    await connectRelay(page);

    await page.getByRole('button', { name: 'Join voice' }).click();
    const dialog = page.getByRole('dialog', { name: 'Media preflight' });
    await expect(dialog.getByRole('alert')).toContainText('Codec self-test failed', { timeout: 30_000 });
    await expect(dialog.getByText('Unavailable', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Join voice' })).toBeDisabled();
  });
});
