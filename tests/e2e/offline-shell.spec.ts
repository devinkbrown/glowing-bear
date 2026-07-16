import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';

const OLD_CACHES = [
  '2026-07-15-120000-darkbear-old',
  '2026-07-14-120000-darkbear-old',
  '2026-07-13-120000-darkbear-old',
  '2026-07-12-120000-darkbear-old',
  '2026-07-11-120000-darkbear-old',
];

test('keeps old release assets, serves a private-data-free offline shell, and reconnects', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);

  await page.evaluate(async (versions) => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const existing = await caches.keys();
    await Promise.all(existing.filter((name) => name.startsWith('darkbear-release-')).map((name) => caches.delete(name)));

    for (const version of versions) {
      const cache = await caches.open(`darkbear-release-${version}`);
      if (version === versions[0]) {
        await cache.put(
          new Request('/darkbear/assets/old-release-proof.js'),
          new Response('old-release-asset', { headers: { 'Content-Type': 'text/javascript' } }),
        );
      }
    }
    const unrelated = await caches.open('unrelated-static-cache');
    await unrelated.put('/darkbear/unrelated-proof.txt', new Response('leave-me-alone'));

    const controlled = new Promise<void>((resolve) => {
      if (navigator.serviceWorker.controller) resolve();
      else navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
    await navigator.serviceWorker.register(`/darkbear/sw.js?offline-e2e=${Date.now()}`, { scope: '/darkbear/' });
    await navigator.serviceWorker.ready;
    await controlled;
  }, OLD_CACHES);

  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toContain('/darkbear/sw.js');
  // WebKit and Firefox expose the claimed controller immediately but do not
  // consistently route this already-loaded document's next fetch through it.
  // A real app receives the same boundary from controllerchange; reload once so
  // every engine exercises a document born under the active worker.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toContain('/darkbear/sw.js');
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).toContain('darkbear-release-development');
  expect(cacheNames).toContain(`darkbear-release-${OLD_CACHES[0]}`);
  expect(cacheNames).toContain(`darkbear-release-${OLD_CACHES[1]}`);
  expect(cacheNames).toContain(`darkbear-release-${OLD_CACHES[2]}`);
  expect(cacheNames).not.toContain(`darkbear-release-${OLD_CACHES[3]}`);
  expect(cacheNames).not.toContain(`darkbear-release-${OLD_CACHES[4]}`);
  expect(cacheNames).toContain('unrelated-static-cache');

  const oldAssetOnline = await page.evaluate(async () => (await fetch('/darkbear/assets/old-release-proof.js')).text());
  expect(oldAssetOnline).toBe('old-release-asset');

  await context.setOffline(true);
  await expect(page.getByTestId('connectivity-status')).toContainText('Offline');
  const chromiumOfflineRouting = testInfo.project.name.includes('chromium');
  if (chromiumOfflineRouting) {
    const oldAsset = await page.evaluate(async () => (await fetch('/darkbear/assets/old-release-proof.js')).text());
    expect(oldAsset).toBe('old-release-asset');
    await page.goto('/darkbear/offline-probe', { waitUntil: 'domcontentloaded' });
  } else {
    // Playwright's Firefox/WebKit offline emulation blocks at the engine
    // transport boundary before a service worker can answer navigations (and,
    // in WebKit, subresources). Their projects still exercise the same active
    // worker, cache selection/pruning, shell rendering, accessibility, and
    // online-event recovery; Chromium covers the real rejected-fetch fallback.
    await context.setOffline(false);
    await page.goto('/darkbear/offline.html', { waitUntil: 'domcontentloaded' });
  }
  await expect(page.getByRole('heading', { name: 'DarkBear is offline' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Waiting for network');
  await expect(page.getByText('No transcript, draft, decrypted message, account data, or relay response')).toBeVisible();
  await expect(page.locator('#root')).toHaveCount(0);

  const cachedPaths = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('darkbear-release-'));
    const paths = [] as string[];
    for (const name of names) {
      const requests = await (await caches.open(name)).keys();
      paths.push(...requests.map((request) => new URL(request.url).pathname));
    }
    return paths;
  });
  expect(cachedPaths).not.toContain('/darkbear/');
  expect(cachedPaths).not.toContain('/darkbear/index.html');

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('offline-shell-axe-results', {
    body: JSON.stringify(axe, null, 2),
    contentType: 'application/json',
  });
  expect(axe.violations.map((violation) => violation.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);

  if (!chromiumOfflineRouting) await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'DarkBear', level: 1 })).toBeVisible({ timeout: 30_000 });
});
