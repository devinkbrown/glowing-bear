import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

test('queues, cancels, retries, sanitizes, and inserts only accepted upload URLs', async ({ page }, testInfo) => {
  const relay = new MockWeeChatRelay();
  await relay.install(page);
  let releaseSlow!: () => void;
  const slowGate = new Promise<void>((resolve) => { releaseSlow = resolve; });
  let retryAttempts = 0;
  let photoBody = '';

  await page.route('https://upload.test/upload', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const filename = /filename="([^"]+)"/.exec(body)?.[1] ?? '';
    if (filename === 'slow.txt') {
      await slowGate;
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ path: '/files/slow.txt' }),
      }).catch(() => undefined);
      return;
    }
    if (filename === 'retry.txt') {
      retryAttempts += 1;
      if (retryAttempts === 1) {
        await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'temporarily unavailable' });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ path: '/files/retry.txt' }),
      });
      return;
    }
    if (filename === 'photo.jpg') {
      photoBody = body;
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ file: { path: '/files/photo.jpg', ttl: 3600 } }),
      });
      return;
    }
    await route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, body: 'unexpected file' });
  });

  await page.addInitScript(() => {
    localStorage.setItem('darkbear_settings_v2', JSON.stringify({
      uploadUrl: 'https://upload.test',
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
  await page.getByLabel('Password', { exact: true }).fill('upload-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  const chooser = page.getByLabel('Choose files to upload');
  await chooser.setInputFiles([
    { name: 'slow.txt', mimeType: 'text/plain', buffer: Buffer.from('slow') },
    { name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
  ]);
  const queue = page.getByTestId('upload-queue');
  await expect(queue).toBeVisible();
  await expect(queue.getByText('Uploading 0%', { exact: true })).toBeVisible();
  await expect(queue.getByText(/image\/svg\+xml is not allowed/)).toBeVisible();

  const composer = page.getByPlaceholder('Message...');
  await expect(composer).toHaveValue('');
  await composer.fill('chat while uploading');
  await composer.press('Enter');
  await expect.poll(() => relay.commands.includes('input 0xcafe chat while uploading')).toBe(true);

  await queue.getByRole('button', { name: 'Cancel upload slow.txt' }).click();
  releaseSlow();
  await expect(queue.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('');

  const jpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
    0xff, 0xdb, 0x00, 0x04, 0x01, 0x02,
    0xff, 0xda, 0x00, 0x02, 0x03, 0x04,
  ]);
  await chooser.setInputFiles([
    { name: 'retry.txt', mimeType: 'text/plain', buffer: Buffer.from('retry') },
    { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpeg },
  ]);
  await expect(queue.getByText('temporarily unavailable', { exact: true })).toBeVisible();
  await expect(queue.getByText('Image metadata removed', { exact: true })).toBeVisible();
  await expect(queue.getByText('Expires in 1 hr', { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('https://upload.test/files/photo.jpg');
  expect(photoBody).not.toContain('Exif');

  await queue.getByRole('button', { name: 'Retry upload retry.txt' }).click();
  await expect(composer).toHaveValue('https://upload.test/files/photo.jpg\nhttps://upload.test/files/retry.txt');
  expect(relay.commands.some((command) => command.includes('/files/photo.jpg') || command.includes('/files/retry.txt'))).toBe(false);

  const axe = await new AxeBuilder({ page })
    .include('[data-testid="upload-queue"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('upload-queue-axe-results', {
    body: JSON.stringify(axe, null, 2),
    contentType: 'application/json',
  });
  expect(axe.violations.map((violation) => violation.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);
  expect(browserErrors.filter((message) => !message.includes('status of 503'))).toEqual([]);
});
