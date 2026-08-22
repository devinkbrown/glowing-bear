import { test, expect } from '@playwright/test';

// Critical flow: DarkBear boots to its pre-connect surface with a typed
// server picker. WeeChat remains the default first-class path.

test.describe('connect entry surface', () => {
  test('boots to the connect screen and exposes a wired relay-login form', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'DarkBear', level: 1 })).toBeVisible();
    await expect(page.getByText('Your WeeChat, in the browser.')).toBeVisible();

    await expect(page.getByTestId('connect-mode-weechat')).toBeVisible();
    await expect(page.getByTestId('connect-mode-onyx-wss')).toBeVisible();
    await expect(page.getByTestId('connect-mode-onyx-tls')).toBeVisible();
    await expect(page.getByTestId('connect-mode-onyx-tls')).toBeEnabled();
    await page.getByTestId('connect-mode-onyx-tls').click();
    await expect(page.getByText(/Browsers cannot open raw TLS IRC/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled();
    await page.getByTestId('connect-mode-weechat').click();

    const host = page.getByLabel('Hostname', { exact: true });
    const port = page.getByLabel('Port', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    await expect(host).toBeVisible();
    await expect(port).toBeVisible();
    await expect(password).toBeVisible();
    await expect(page.getByRole('button', { name: 'TLS', exact: true })).toBeVisible();

    const connect = page.getByRole('button', { name: 'Connect', exact: true });
    await expect(connect).toBeDisabled();

    await host.fill('relay.example.test');
    await password.fill('correct horse battery staple');
    await expect(connect).toBeEnabled();

    const setup = page.getByRole('button', { name: 'How do I set this up?' });
    await expect(setup).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('setup-drawer')).toHaveCount(0);
  });

  test('Onyx WebSocket mode shows account fields and type-matched setup', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('connect-mode-onyx-wss').click();
    await expect(page.getByLabel('Endpoint', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Account', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByText('First-party Onyx: one socket for chat and media.')).toBeVisible();

    await page.getByRole('button', { name: 'How do I set this up?' }).click();
    await expect(page.getByTestId('setup-drawer')).toBeVisible();
    await expect(page.getByTestId('setup-tab-onyx')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/wss:\/\/eshmaki.me:8080/)).toBeVisible();
    await expect(page.getByText(/No STARTTLS/)).toBeVisible();
  });
});
