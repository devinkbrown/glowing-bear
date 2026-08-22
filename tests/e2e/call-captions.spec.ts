import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { installCallMedia } from './fixtures/callMedia';
import { MockOnyxAccount } from './fixtures/onyxAccount';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

test('navigates, styles, archives, exports, and keyboard-controls live captions', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const relay = new MockWeeChatRelay();
  const account = new MockOnyxAccount();
  await Promise.all([relay.install(page), account.install(page), installCallMedia(page)]);
  await page.addInitScript(() => {
    localStorage.setItem('darkbear_settings_v2', JSON.stringify({
      archiveRetention: '7d',
      bridge: {
        enabled: true,
        wsUrl: 'wss://onyx.test/irc',
        account: 'caption-account',
        password: 'caption-secret',
        autoJoinMedia: false,
        e2eeDms: false,
      },
    }));
  });

  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  await page.getByLabel('Hostname', { exact: true }).fill('relay.test');
  await page.getByRole('button', { name: 'TLS', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('relay-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Join voice' }).click();
  const preflight = page.getByRole('dialog', { name: 'Media preflight' });
  await expect(preflight.getByText('Encoder ready', { exact: true })).toBeVisible({ timeout: 60_000 });
  // The final encoder probe replaces the reactive action row once. Under a
  // fully-loaded Firefox matrix that replacement can land inside Playwright's
  // stability wait and leave it chasing the detached button. Dispatch the
  // already-enabled native action directly; preflight behavior itself has a
  // dedicated five-project journey, while this test is scoped to captions.
  await preflight.getByRole('button', { name: 'Join voice' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });

  const call = page.getByLabel('Active media call');
  await expect(call).toBeVisible();
  account.sendMediaEvent('CAPTION', '#darkbear', 'alice', ':First live caption');
  account.sendMediaEvent('CAPTION', '#darkbear', 'bob', ':Second live caption');
  const liveCaption = call.getByRole('status').filter({ hasText: 'Second live caption' });
  await expect(liveCaption).toBeVisible();
  await expect(liveCaption).toHaveAttribute('aria-live', 'polite');

  await call.getByRole('button', { name: 'Call transcript (2)' }).click();
  const panel = call.getByRole('dialog', { name: 'Call transcript' });
  await expect(panel).toBeVisible();
  const rows = panel.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await rows.first().focus();
  await rows.first().press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();

  await panel.getByLabel('Caption size').selectOption('large');
  await panel.getByLabel('Caption background').selectOption('translucent');
  await expect(liveCaption.getByText('Second live caption')).toHaveClass(/text-\[18px\]/);
  await expect(liveCaption).toHaveClass(/bg-black\/55/);

  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Call transcript"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('call-transcript-axe-results', {
    body: JSON.stringify(axe, null, 2),
    contentType: 'application/json',
  });
  expect(axe.violations.map((violation) => violation.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export .txt' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^darkbear-darkbear-.*\.txt$/);
  const stream = await download.createReadStream();
  let exported = '';
  for await (const chunk of stream) exported += chunk.toString();
  expect(exported).toContain('alice: First live caption');
  expect(exported).toContain('bob: Second live caption');

  await expect.poll(() => page.evaluate(async () => {
    return await new Promise<number>((resolve) => {
      const request = indexedDB.open('darkbear-archive-v1');
      request.onerror = () => resolve(0);
      request.onsuccess = () => {
        const tx = request.result.transaction('messages', 'readonly');
        const all = tx.objectStore('messages').getAll();
        all.onerror = () => resolve(0);
        all.onsuccess = () => resolve((all.result as Array<{ bufferKey?: string }>)
          .filter((record) => record.bufferKey === 'media:#darkbear').length);
      };
    });
  })).toBe(2);

  await page.keyboard.press('c');
  await expect(panel).toBeHidden();
  await page.keyboard.press('c');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.keyboard.press('d');
  await expect(call.getByLabel('Undeafen')).toBeVisible();
  await page.keyboard.press('h');
  await expect(call).toBeHidden();
  expect(browserErrors).toEqual([]);
});
