import { expect, test, type Page } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

async function openRelay(page: Page, password: string): Promise<void> {
  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  await page.getByLabel('Hostname', { exact: true }).fill('relay.test');
  await page.getByRole('button', { name: 'TLS', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
}

test('terminates rejected authentication with an actionable error', async ({ page }) => {
  const relay = new MockWeeChatRelay({ rejectAuthentication: true });
  await relay.install(page);
  await openRelay(page, 'known-wrong-password');

  const error = page.getByRole('alert').filter({ hasText: 'Authentication failed' });
  await expect(error).toContainText('relay rejected the password', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled();
  await expect.poll(() => relay.connectionCount, { timeout: 15_000 }).toBe(3);
  await expect.poll(() => relay.connectionCount, { timeout: 2_000 }).toBe(3);

  expect(relay.commands.filter((command) => command.startsWith('init password_hash=')).length).toBe(2);
  expect(relay.commands.filter((command) => command.startsWith('init password=')).length).toBe(1);
});

test('recovers when the relay drops during send without duplicating the optimistic line', async ({ page }) => {
  const relay = new MockWeeChatRelay();
  await relay.install(page);
  await openRelay(page, 'relay-loss-secret');
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  const composer = page.locator('textarea.composer-textarea');
  relay.dropNextInput();
  await composer.fill('queued across relay loss');
  await composer.press('Enter');
  await expect(page.getByText('queued across relay loss', { exact: true })).toHaveCount(1);

  await expect.poll(() => relay.connectionCount, { timeout: 10_000 }).toBe(2);
  await expect.poll(
    () => relay.commands.filter((command) => command.startsWith('init password_hash=')).length,
    { timeout: 10_000 },
  ).toBe(2);
  await expect(page.getByText('queued across relay loss', { exact: true })).toHaveCount(1);

  await composer.fill('confirmed after recovery');
  await composer.press('Enter');
  await expect(page.getByText('confirmed after recovery', { exact: true })).toHaveCount(1);
  expect(relay.commands.filter((command) => command === 'input 0xcafe queued across relay loss')).toHaveLength(1);
  expect(relay.commands.filter((command) => command === 'input 0xcafe confirmed after recovery')).toHaveLength(1);
});

test('keeps a Services secret until the relay socket accepts dispatch', async ({ page }) => {
  const relay = new MockWeeChatRelay({ includeServer: true });
  await relay.install(page);
  await openRelay(page, 'relay-loss-secret');
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  relay.sendServerIncoming(
    'tester onyx.test onyx-0.1.0 iowx bklmnt',
    'onyx.test',
    ['irc_004'],
  );
  const composer = page.locator('textarea.composer-textarea');
  await composer.fill('/services');
  await composer.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Services' });
  const password = panel.getByPlaceholder('Password').first();
  await panel.getByPlaceholder('Account name').fill('darkbear');
  await password.fill('keep-this-secret-for-retry');

  relay.suspendConnections();
  await relay.disconnectLatest();
  const reconnecting = page.getByTestId('connectivity-status');
  await expect(reconnecting).toContainText('Reconnecting');

  await panel.getByRole('button', { name: 'Register' }).click();
  await expect(password).toHaveValue('keep-this-secret-for-retry');
  await expect(panel.getByText('Relay is not connected. Your input was kept for retry.')).toBeVisible();
  expect(relay.commands).not.toContain(
    'input 0xbeef /quote REGISTER darkbear * keep-this-secret-for-retry',
  );

  relay.resumeConnections();
  // Automatic reconnect may win the race before a manual Retry click (notably
  // in WebKit), which detaches the button mid-action. Waiting for the status to
  // clear proves the same recovery path without coupling to that race.
  await expect(reconnecting).toBeHidden({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Register' }).click();
  await expect.poll(() => relay.commands.includes(
    'input 0xbeef /quote REGISTER darkbear * keep-this-secret-for-retry',
  )).toBe(true);
  await expect(password).toHaveValue('');
});

test('keeps the main composer draft until the relay socket accepts dispatch', async ({ page }) => {
  const relay = new MockWeeChatRelay();
  await relay.install(page);
  await openRelay(page, 'relay-loss-secret');
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  const composer = page.locator('textarea.composer-textarea');
  await composer.fill('keep this composer draft');

  relay.suspendConnections();
  await relay.disconnectLatest();
  const reconnecting = page.getByTestId('connectivity-status');
  await expect(reconnecting).toContainText('Reconnecting');

  await composer.press('Enter');
  await expect(composer).toHaveValue('keep this composer draft');
  await expect(page.getByText('Relay is not connected. Your message was kept for retry.')).toBeVisible();
  expect(relay.commands).not.toContain('input 0xcafe keep this composer draft');

  relay.resumeConnections();
  await expect(reconnecting).toBeHidden({ timeout: 15_000 });
  await composer.press('Enter');
  await expect.poll(() => relay.commands.includes('input 0xcafe keep this composer draft')).toBe(true);
  await expect(composer).toHaveValue('');
});

test('keeps a thread draft until the relay socket accepts dispatch', async ({ page }) => {
  const relay = new MockWeeChatRelay();
  await relay.install(page);
  await openRelay(page, 'relay-loss-secret');
  await expect(page.getByText('Welcome from the deterministic relay', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Open message thread' }).first().click();
  const panel = page.getByRole('dialog', { name: 'Message thread' });
  const composer = panel.getByPlaceholder('Reply in thread…');
  await composer.fill('keep this thread draft');

  relay.suspendConnections();
  await relay.disconnectLatest();
  const reconnecting = page.getByTestId('connectivity-status');
  await expect(reconnecting).toContainText('Reconnecting');

  await panel.getByRole('button', { name: 'Send thread reply' }).click();
  await expect(composer).toHaveValue('keep this thread draft');
  expect(relay.commands).not.toContain('input 0xcafe keep this thread draft');

  relay.resumeConnections();
  await expect(reconnecting).toBeHidden({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Send thread reply' }).click();
  await expect.poll(() => relay.commands.includes('input 0xcafe keep this thread draft')).toBe(true);
  await expect(composer).toHaveValue('');
});

test('restores a rejected notification reply into the originating composer', async ({ page }) => {
  const relay = new MockWeeChatRelay();
  await relay.install(page);
  await openRelay(page, 'relay-loss-secret');
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  relay.suspendConnections();
  await relay.disconnectLatest();
  const reconnecting = page.getByTestId('connectivity-status');
  await expect(reconnecting).toContainText('Reconnecting');

  await page.evaluate(async () => {
    const modulePath = '/darkbear/src/state/connection.ts';
    const connection = await import(/* @vite-ignore */ modulePath) as {
      currentNotificationConnectionScope(): string;
    };
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'darkbear-notification-action',
        action: 'reply',
        bufferId: '0xcafe',
        target: '#darkbear',
        connectionScope: connection.currentNotificationConnectionScope(),
        reply: 'keep this notification reply',
      },
    }));
  });
  const composer = page.locator('textarea.composer-textarea');
  await expect(composer).toHaveValue('keep this notification reply');
  expect(relay.commands).not.toContain('input 0xcafe keep this notification reply');

  relay.resumeConnections();
  await expect(reconnecting).toBeHidden({ timeout: 15_000 });
  await composer.press('Enter');
  await expect.poll(() => relay.commands.includes('input 0xcafe keep this notification reply')).toBe(true);
  await expect(composer).toHaveValue('');
});
