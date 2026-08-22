import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockOnyxAccount } from './fixtures/onyxAccount';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

async function peerPublicKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  return Buffer.from(raw).toString('base64url');
}

test('verifies a DM fingerprint and blocks a rotated key until explicit re-trust', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const relay = new MockWeeChatRelay({ includeQuery: true });
  const account = new MockOnyxAccount();
  const firstKey = await peerPublicKey();
  const rotatedKey = await peerPublicKey();
  account.setPeerKey('alice', firstKey);
  await Promise.all([relay.install(page), account.install(page)]);
  await page.addInitScript(() => {
    localStorage.setItem('darkbear_settings_v2', JSON.stringify({
      bridge: {
        enabled: true,
        wsUrl: 'wss://onyx.test/irc',
        account: 'dm-account',
        password: 'dm-secret',
        autoJoinMedia: false,
        e2eeDms: true,
        e2eePolicy: 'verified',
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

  const buffersButton = page.getByRole('button', { name: 'Buffers', exact: true });
  if (await buffersButton.isVisible()) {
    await buffersButton.click();
    const buffersPanel = page.getByRole('dialog', { name: 'Buffers' });
    await buffersPanel.getByRole('button', { name: /^alice$/i }).click();
  } else {
    await page.getByRole('button', { name: /^alice$/i }).first().click();
  }
  const unverified = page.getByLabel('DM security: Encrypted · unverified');
  // Firefox can spend longer than the default assertion timeout resolving the
  // WebCrypto fingerprint and reading the IndexedDB trust pin when the full
  // browser matrix is under load. Synchronize on the user-visible terminal
  // state instead of racing the legitimate intermediate "Checking key" state.
  await expect(unverified).toBeVisible({ timeout: 20_000 });
  await unverified.click();
  const panel = page.getByRole('dialog', { name: 'Security details for alice' });
  await expect(panel.getByText('Current fingerprint')).toBeVisible();
  await expect(panel.locator('code')).toHaveText(/^[0-9A-F]{4}( [0-9A-F]{4}){15}$/);

  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Security details for alice"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('dm-security-axe-results', {
    body: JSON.stringify(axe, null, 2),
    contentType: 'application/json',
  });
  expect(axe.violations.map((violation) => violation.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);

  await panel.getByRole('button', { name: 'Mark fingerprint verified' }).click();
  const verified = page.getByLabel('DM security: Encrypted · verified');
  await expect(verified).toBeVisible();
  await verified.click(); // close the security panel

  const composer = page.locator('textarea.composer-textarea');
  await composer.fill('first verified secret');
  await composer.press('Enter');
  await expect.poll(() => account.commands.filter((command) =>
    command.startsWith('PRIVMSG alice :TSUMUGI1 '),
  ).length).toBe(1);
  expect(relay.commands.join('\n')).not.toContain('first verified secret');
  expect(account.commands.join('\n')).not.toContain('first verified secret');

  account.sendPeerKey('alice', rotatedKey);
  const changed = page.getByLabel('DM security: Key changed · blocked');
  await expect(changed).toBeVisible();
  await composer.fill('must remain unsent');
  await page.waitForTimeout(350);
  await composer.press('Enter');
  await expect(page.getByText(/verified device key changed/i)).toBeVisible();
  await expect(composer).toHaveValue('must remain unsent');
  expect(account.commands.filter((command) => command.startsWith('PRIVMSG alice :TSUMUGI1 '))).toHaveLength(1);
  expect(relay.commands.join('\n')).not.toContain('must remain unsent');

  await changed.click();
  await panel.getByRole('button', { name: 'Re-trust new key' }).click();
  await expect(verified).toBeVisible();
  await page.waitForTimeout(350);
  await composer.press('Enter');
  await expect.poll(() => account.commands.filter((command) =>
    command.startsWith('PRIVMSG alice :TSUMUGI1 '),
  ).length).toBe(2);
  await expect(composer).toHaveValue('');
  expect(browserErrors).toEqual([]);
});
