import { expect, test, type Page } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

const IMAGE_URL = 'https://images.example.test/darkbear-inline-privacy.png';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function connect(page: Page, relay: MockWeeChatRelay): Promise<void> {
  await relay.install(page);
  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  await page.getByLabel('Hostname', { exact: true }).fill('relay.test');
  await page.getByRole('button', { name: 'TLS', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('inline-image-privacy');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();
}

test('does not request inline images by default and fetches them only after explicit opt-in', async ({ page }) => {
  const relay = new MockWeeChatRelay();
  let imageRequests = 0;
  await page.route(IMAGE_URL, async (route) => {
    imageRequests += 1;
    await route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG });
  });
  await connect(page, relay);

  relay.sendIncoming(IMAGE_URL, 'alice');
  const imageLink = page.getByRole('link', { name: IMAGE_URL });
  await expect(imageLink).toBeVisible();
  await expect(page.locator(`img[src="${IMAGE_URL}"]`)).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect(imageRequests).toBe(0);

  await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Toggle Images', exact: true }).click();
  await page.keyboard.press('Escape');

  const inlineImage = page.locator(`img[src="${IMAGE_URL}"]`);
  await expect(inlineImage).toBeVisible();
  await expect(inlineImage).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect.poll(() => imageRequests).toBe(1);
});
