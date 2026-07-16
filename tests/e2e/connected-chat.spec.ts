import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

async function connect(page: import('@playwright/test').Page, relay: MockWeeChatRelay): Promise<string[]> {
  const browserErrors: string[] = [];
  await relay.install(page);
  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.getByLabel('Hostname', { exact: true }).fill('relay.test');
  await page.getByRole('button', { name: 'TLS', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('e2e-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();
  return browserErrors;
}

async function assertServicesAccessible(page: Page, testInfo: TestInfo, tab: string): Promise<void> {
  await page.getByRole('dialog', { name: 'Services' }).evaluate(async (dialog) => {
    // The entrance opacity animation lives on the dialog's overlay parent,
    // while the audited content is the child dialog itself.
    const animations = (dialog.parentElement ?? dialog).getAnimations({ subtree: true });
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
  const axe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach(`orochi-services-${tab}-axe-results`, {
    body: JSON.stringify(axe, null, 2),
    contentType: 'application/json',
  });
  expect(axe.violations.map((violation) => violation.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);
}

async function expectFocusWithin(panel: import('@playwright/test').Locator): Promise<void> {
  await expect.poll(() => panel.evaluate((element) => element.contains(document.activeElement))).toBe(true);
}

test.describe('connected relay chat', () => {
  test('authenticates with a password hash, hydrates a channel, and confirms a sent message', async ({ page }) => {
    const relay = new MockWeeChatRelay();
    const browserErrors = await connect(page, relay);
    await expect(page.getByText('Welcome from the deterministic relay', { exact: true })).toBeVisible();

    const composer = page.locator('textarea.composer-textarea');
    await expect(composer).toBeEnabled();
    await composer.fill('hello from Playwright');
    await composer.press('Enter');

    await expect(page.getByText('hello from Playwright', { exact: true })).toHaveCount(1);
    await expect.poll(() => relay.commands.some((command) =>
      command === 'input 0xcafe hello from Playwright',
    )).toBe(true);

    expect(relay.commands.some((command) => command.startsWith('(_handshake) handshake '))).toBe(true);
    expect(relay.commands.some((command) => command.startsWith('init password_hash=pbkdf2+sha256:'))).toBe(true);
    expect(relay.commands.join('\n')).not.toContain('e2e-secret');
    expect(relay.commands.some((command) => command.startsWith('init password='))).toBe(false);
    const persistedSecrets = await page.evaluate(() => ({
      local: Object.values(localStorage).join('\n'),
      session: Object.values(sessionStorage).join('\n'),
    }));
    expect(persistedSecrets.local).not.toContain('e2e-secret');
    expect(persistedSecrets.session).toContain('e2e-secret');
    expect(browserErrors).toEqual([]);
  });

  test('reconnects after a relay restart without duplicating history', async ({ page }) => {
    const relay = new MockWeeChatRelay();
    const browserErrors = await connect(page, relay);
    const welcome = page.getByText('Welcome from the deterministic relay', { exact: true });
    await expect(welcome).toHaveCount(1);

    await relay.disconnectLatest();
    await expect.poll(() => relay.connectionCount, { timeout: 10_000 }).toBe(2);
    await expect.poll(
      () => relay.commands.filter((command) => command.startsWith('init password_hash=')).length,
      { timeout: 10_000 },
    ).toBe(2);

    await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();
    await expect(welcome).toHaveCount(1);

    const composer = page.locator('textarea.composer-textarea');
    await composer.fill('sent after reconnect');
    await composer.press('Enter');
    await expect(page.getByText('sent after reconnect', { exact: true })).toHaveCount(1);
    await expect.poll(() => relay.commands.includes('input 0xcafe sent after reconnect')).toBe(true);
    expect(browserErrors).toEqual([]);
  });

  test('opens the optional thread view and sends from its scoped composer', async ({ page }, testInfo) => {
    const relay = new MockWeeChatRelay();
    const browserErrors = await connect(page, relay);
    await expect(page.getByText('Welcome from the deterministic relay', { exact: true })).toBeVisible();

    const opener = page.getByRole('button', { name: 'Open message thread' }).first();
    await opener.click();
    const panel = page.getByLabel('Message thread', { exact: true });
    await expect(panel).toBeVisible();
    const close = panel.getByRole('button', { name: 'Close thread panel' });
    const composer = panel.getByPlaceholder('Reply in thread…');
    await expect(close).toBeFocused();
    await expect(page.locator('main')).toHaveAttribute('inert', '');

    // The disabled send control is skipped, so backwards traversal from the
    // first control lands on the thread composer and forwards traversal wraps.
    await close.press('Shift+Tab');
    await expect(composer).toBeFocused();
    await composer.press('Tab');
    await expect(close).toBeFocused();
    await page.locator('textarea.composer-textarea').evaluate((element) => element.focus());
    await expectFocusWithin(panel);
    await expect(panel.getByText('Welcome from the deterministic relay', { exact: true })).toBeVisible();
    await expect(panel.getByText('0 replies · 1 participant', { exact: true })).toBeVisible();

    relay.sendIncoming('live tagged thread reply', 'bob', '1001');
    await expect(panel.getByText('live tagged thread reply', { exact: true })).toBeVisible();
    await expect(panel.getByText('1 reply · 2 participants', { exact: true })).toBeVisible();
    await expect(panel.getByText('1 unread', { exact: true })).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .include('[aria-label="Message thread"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await testInfo.attach('thread-axe-results', {
      body: JSON.stringify(axe, null, 2),
      contentType: 'application/json',
    });
    expect(axe.violations.map((violation) => violation.id)).toEqual([]);

    await composer.fill('thread composer journey');
    await composer.press('Enter');
    await expect.poll(() => relay.commands.includes('input 0xcafe thread composer journey')).toBe(true);
    await expect(page.getByText('thread composer journey', { exact: true })).toHaveCount(1);

    await close.click();
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    expect(browserErrors).toEqual([]);
  });

  test('collects a reply in activity and keeps an archive-scoped saved note', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('darkbear_settings_v2', JSON.stringify({ archiveRetention: '7d' }));
    });
    const relay = new MockWeeChatRelay();
    const browserErrors = await connect(page, relay);

    await page.getByRole('button', { name: 'Save message' }).first().click();
    relay.sendIncoming('activity reply proof', 'bob', '1001');

    const opener = page.getByRole('button', { name: 'Activity', exact: true }).filter({ visible: true }).first();
    await opener.click();
    const panel = page.getByLabel('Activity and saved messages', { exact: true });
    await expect(panel).toBeVisible();
    const close = panel.getByRole('button', { name: 'Close activity panel' });
    await expect(close).toBeFocused();
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await close.press('Shift+Tab');
    await expectFocusWithin(panel);
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.locator('textarea.composer-textarea').evaluate((element) => element.focus());
    await expectFocusWithin(panel);
    await expect(panel.getByRole('button', { name: /Reply.*activity reply proof/ })).toBeVisible();
    await panel.getByRole('tab', { name: 'Saved (1)' }).click();
    const note = panel.getByLabel('Note for Welcome from the deterministic relay');
    await note.fill('review this later');
    await note.blur();
    await expect(note).toHaveValue('review this later');

    await close.click();
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    expect(browserErrors).toEqual([]);
  });

  test('maps Orochi service replies into the server-scoped services log', async ({ page }, testInfo) => {
    const relay = new MockWeeChatRelay({ includeServer: true });
    const browserErrors = await connect(page, relay);

    relay.sendServerIncoming(
      'tester orochi.test orochi-0.1.0 iowx bklmnt',
      'orochi.test',
      ['irc_004'],
    );
    relay.sendServerIncoming(
      'FAIL REGISTER ACCOUNT_EXISTS :Account already exists',
      'orochi.test',
      ['irc_fail'],
    );
    relay.sendServerIncoming(
      'SESSIONTOKEN tester sst_0123456789abcdef0123456789abcdef expires=1784217600',
      'orochi.test',
      ['irc_notice'],
    );

    const composer = page.locator('textarea.composer-textarea');
    await composer.fill('/services');
    await composer.press('Enter');

    const panel = page.getByRole('dialog', { name: 'Services' });
    await expect(panel).toBeVisible();
    const log = panel.getByRole('log', { name: 'Recent service replies' });
    await expect(log.getByText('Account already exists', { exact: true })).toBeVisible();
    await expect(log.getByText('REGISTER', { exact: true })).toBeVisible();
    await expect(panel.getByText(/sst_0123456789abcdef/)).toHaveCount(0);

    await assertServicesAccessible(page, testInfo, 'account');

    const servicesScroll = panel.getByTestId('services-scroll-region');
    const accountTab = panel.getByRole('tab', { name: 'Account' });
    const channelTab = panel.getByRole('tab', { name: 'Channel' });
    const memoTab = panel.getByRole('tab', { name: 'Memo' });
    await expect(accountTab).toHaveAttribute('aria-selected', 'true');
    await expect(accountTab).toHaveAttribute('tabindex', '0');
    await expect(panel.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', await accountTab.getAttribute('id') ?? '');

    await accountTab.focus();
    await accountTab.press('ArrowRight');
    await expect(channelTab).toBeFocused();
    await expect(channelTab).toHaveAttribute('aria-selected', 'true');
    await channelTab.press('End');
    await expect(memoTab).toBeFocused();
    await memoTab.press('Home');
    await expect(accountTab).toBeFocused();

    if (testInfo.project.name.startsWith('mobile-')) {
      const dimensions = await servicesScroll.evaluate((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        overflowY: getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
      }));
      expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      expect(dimensions.overflowY).toBe('auto');
      if (testInfo.project.name === 'mobile-webkit') {
        // Playwright does not expose swipe gestures for mobile WebKit. Preserve
        // a real wheel-input assertion in mobile Chromium and independently
        // prove WebKit owns a native overflow:auto scroll range here.
        await servicesScroll.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      } else {
        await servicesScroll.hover({ position: { x: 24, y: Math.max(24, dimensions.clientHeight - 32) } });
        await page.mouse.wheel(0, 2_000);
      }
      await expect.poll(() => servicesScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      const danger = panel.getByRole('heading', { name: 'Danger Zone' }).first();
      await expect(danger).toBeInViewport();
      await accountTab.click();
      await expect.poll(() => servicesScroll.evaluate((element) => element.scrollTop)).toBe(0);
    }

    relay.sendServerIncoming(
      'TOTP: two-factor authentication is disabled',
      'orochi.test',
      ['irc_notice'],
    );
    await expect(log.getByText('TOTP', { exact: true })).toBeVisible();
    await expect(log.getByText('TOTP: two-factor authentication is disabled', { exact: true })).toBeVisible();

    await channelTab.click();
    await assertServicesAccessible(page, testInfo, 'channel');
    await memoTab.click();
    await assertServicesAccessible(page, testInfo, 'memo');
    await panel.getByPlaceholder('Recipient account').fill('alice');
    await panel.getByPlaceholder('Message...').fill('first line\n/quote DROP alice\tsecond line');
    await panel.getByRole('button', { name: 'Send' }).click();
    await expect.poll(() => relay.commands.includes(
      'input 0xbeef /quote TEGAMI SEND alice :first line /quote DROP alice second line',
    )).toBe(true);
    await expect(panel.getByPlaceholder('Message...')).toHaveValue('');

    await accountTab.click();
    await panel.getByPlaceholder('Account name').fill('darkbear');
    const servicePassword = panel.getByPlaceholder('Password').first();
    await servicePassword.fill('ephemeral-service-secret');
    await panel.getByRole('button', { name: 'Register' }).click();
    await expect.poll(() => relay.commands.includes(
      'input 0xbeef /quote REGISTER darkbear * ephemeral-service-secret',
    )).toBe(true);
    await expect(servicePassword).toHaveValue('');

    await panel.getByRole('button', { name: 'Clear' }).click();
    await expect(panel.getByRole('log', { name: 'Recent service replies' })).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  });
});
