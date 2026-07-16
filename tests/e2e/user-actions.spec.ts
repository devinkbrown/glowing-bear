import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

test('creates a profile-scoped safe action, reviews it, and runs the exact IRC command', async ({ page }, testInfo) => {
  const relay = new MockWeeChatRelay();
  await relay.install(page);
  await page.addInitScript(() => {
    const relay = { host: 'relay.test', port: 9001, tls: false, password: '', compression: true };
    localStorage.setItem('darkbear_settings_v2', JSON.stringify({
      relay,
      profiles: [{ name: 'relay-test', relay, rememberPassword: false }],
    }));
  });

  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  await page.getByLabel('Password', { exact: true }).fill('action-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).first().click();
  await page.getByText('Advanced', { exact: true }).filter({ visible: true }).first().click();
  const settings = page.getByTestId('user-action-settings');
  await settings.getByLabel('Action name').fill('Who is Alice');
  await settings.getByLabel('Safe command').selectOption('whois');
  await settings.getByLabel('Action profile scope').selectOption('profile:relay-test');
  await settings.getByRole('button', { name: 'Add action' }).click();
  await expect(settings.getByText('Who is Alice', { exact: true })).toBeVisible();
  await expect(settings.getByText('/whois {nick}', { exact: true }).first()).toBeVisible();

  const settingsAxe = await new AxeBuilder({ page })
    .include('[data-testid="user-action-settings"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('user-action-settings-axe-results', {
    body: JSON.stringify(settingsAxe, null, 2),
    contentType: 'application/json',
  });
  expect(settingsAxe.violations.map((violation) => violation.id), JSON.stringify(settingsAxe.violations, null, 2)).toEqual([]);
  await page.getByRole('button', { name: 'Close preferences' }).filter({ visible: true }).click();

  await page.keyboard.press('Control+k');
  await page.getByLabel('Search buffers and actions').fill('Who is Alice');
  await page.getByText('Who is Alice', { exact: true }).click();
  const runner = page.getByRole('dialog', { name: 'Run Who is Alice' });
  await expect(runner).toBeVisible();
  await runner.getByLabel('Nick').fill('alice /quit');
  await expect(runner.getByRole('button', { name: 'Confirm and run' })).toBeDisabled();
  await runner.getByLabel('Nick').fill('alice');
  await expect(runner.getByText('/whois alice', { exact: true })).toBeVisible();
  await expect(runner.getByText(/First use: review the exact command/)).toBeVisible();
  // Axe evaluates the composited color. The runner can become interactive
  // before the shared modal's entrance fade reaches full opacity, which makes
  // every otherwise-accessible child look artificially dim.
  await expect(runner.locator('..')).toHaveCSS('opacity', '1');

  const runnerAxe = await new AxeBuilder({ page })
    .include('[data-testid="user-action-runner"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('user-action-runner-axe-results', {
    body: JSON.stringify(runnerAxe, null, 2),
    contentType: 'application/json',
  });
  expect(runnerAxe.violations.map((violation) => violation.id), JSON.stringify(runnerAxe.violations, null, 2)).toEqual([]);

  await runner.getByRole('button', { name: 'Confirm and run' }).click();
  await expect.poll(() => relay.commands.includes('input 0xcafe /whois alice')).toBe(true);
  await expect(runner).toBeHidden();

  await page.keyboard.press('Control+k');
  await page.getByLabel('Search buffers and actions').fill('Who is Alice');
  await page.getByText('Who is Alice', { exact: true }).click();
  const confirmedRunner = page.getByRole('dialog', { name: 'Run Who is Alice' });
  await confirmedRunner.getByLabel('Nick').fill('alice');
  await expect(confirmedRunner.getByRole('button', { name: 'Run command' })).toBeEnabled();
  await expect(confirmedRunner.getByText(/First use:/)).toBeHidden();
  await confirmedRunner.getByRole('button', { name: 'Cancel' }).click();

  const stored = await page.evaluate(() => localStorage.getItem('darkbear_settings_v2') ?? '');
  expect(stored).toContain('Who is Alice');
  expect(stored).not.toContain('action-secret');
  expect(browserErrors).toEqual([]);
});
