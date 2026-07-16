import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';

test.describe('automated accessibility gate', () => {
  test('connect entry has no detectable WCAG A/AA violations', async ({ page }, testInfo) => {
    await page.goto('/darkbear/');
    await waitForAssetVersionReady(page);
    await expect(page.getByRole('heading', { name: 'DarkBear', level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    await testInfo.attach('axe-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });
    expect(results.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    }))).toEqual([]);
  });
});
