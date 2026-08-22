import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  createPreferenceDocument,
  decodePreferenceMetadata,
  encodePreferenceMetadata,
} from '../../src/lib/preferences/sync';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockOnyxAccount } from './fixtures/onyxAccount';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

test('merges account preferences and publishes local changes through Onyx Server metadata', async ({ page }, testInfo) => {
  const remote = createPreferenceDocument({
    appearance: { theme: 'nord' },
    accessibility: {
      fontFamily: 'system', fontSize: 17, sceneMotion: 'reduced', readMarker: true,
    },
    notifications: { enabled: true, sound: false, readOnFocus: true },
    buffers: { 'irc.fixture.#darkbear': { pinned: true, notify: 'all' } },
    read: { '#darkbear': 1_700_000_000_000 },
  }, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 1000, 10);
  const account = new MockOnyxAccount(encodePreferenceMetadata(remote));
  const relay = new MockWeeChatRelay();
  await Promise.all([account.install(page), relay.install(page)]);
  await page.addInitScript(() => {
    localStorage.setItem('darkbear_settings_v2', JSON.stringify({
      bridge: {
        enabled: true,
        wsUrl: 'wss://onyx.test/irc',
        account: 'e2e-account',
        password: 'bridge-account-secret',
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
  await page.getByLabel('Password', { exact: true }).fill('browser-only-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  await expect.poll(() => account.commands.includes('METADATA * LIST')).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('nord');

  await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /^Connection(?: Relay, profiles, bridge)?$/ })
    .filter({ visible: true }).first().click();
  await expect(page.getByText('Cross-device preferences', { exact: true })).toBeVisible();
  await expect(page.getByText('Non-secret preferences are current on this account.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync preferences now' })).toBeEnabled();

  const axe = await new AxeBuilder({ page })
    .include('[data-testid="preference-sync-status"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('preference-sync-axe-results', {
    body: JSON.stringify(axe, null, 2),
    contentType: 'application/json',
  });
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);

  await page.getByRole('button', { name: /^Appearance(?: Theme, type, layout)?$/ })
    .filter({ visible: true }).first().click();
  await page.getByText('Gruvbox', { exact: true }).first().click();
  await expect.poll(() => {
    const decoded = decodePreferenceMetadata(account.metadata);
    return decoded?.appearance.value.theme;
  }, { timeout: 5_000 }).toBe('gruvbox');

  const wire = account.commands.join('\n');
  expect(wire).toContain('METADATA * SET darkbear.pref.v1.manifest secret ');
  expect(wire).not.toContain('browser-only-secret');
  expect(wire).not.toContain('bridge-account-secret');
  expect(browserErrors).toEqual([]);
});
