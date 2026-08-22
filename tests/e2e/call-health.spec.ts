import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { CadenceCodec, encodeCadenceFrame } from '../../src/lib/cadence-media/cadenceFrame';
import { mediaStreamId } from '../../src/lib/cadence-media/mediaStream';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockOnyxAccount } from './fixtures/onyxAccount';
import { MockWeeChatRelay } from './fixtures/weechatRelay';
import { installCallMedia } from './fixtures/callMedia';

function audioFrame(sequence: number): Uint8Array {
  return encodeCadenceFrame({
    bandId: 64,
    streamId: mediaStreamId('#darkbear', 'alice', 'audio'),
    sequence,
    timestamp: Date.now(),
    keyframe: false,
    codec: CadenceCodec.cadencevoxAudio,
    payload: new Uint8Array([1, 2, 3, 4]),
  });
}

test('surfaces loss, repairs reordering, and preserves one call pipeline across Onyx Server reconnect', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const relay = new MockWeeChatRelay();
  const account = new MockOnyxAccount();
  await Promise.all([relay.install(page), account.install(page), installCallMedia(page)]);
  await page.addInitScript(() => {
    localStorage.setItem('darkbear_settings_v2', JSON.stringify({
      bridge: {
        enabled: true,
        wsUrl: 'wss://onyx.test/irc',
        account: 'call-account',
        password: 'call-secret',
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
  await page.getByLabel('Password', { exact: true }).fill('relay-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Join voice' }).click();
  const preflight = page.getByRole('dialog', { name: 'Media preflight' });
  await expect(preflight.getByText('Encoder ready', { exact: true })).toBeVisible({ timeout: 60_000 });
  await preflight.getByRole('button', { name: 'Join voice' }).click();

  const call = page.getByLabel('Active media call');
  await expect(call).toBeVisible();
  await expect(call.getByLabel('Call health: Healthy')).toBeVisible();
  await expect(call.getByRole('button', { name: /^alice/ })).toHaveCount(1);

  await call.getByLabel('Call health: Healthy').click();
  account.sendMediaDatagram(audioFrame(100));
  account.sendMediaDatagram(audioFrame(102));
  await expect(call.getByText('33.3%', { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(call.getByText(/Packet loss or encoder pressure detected|Call quality reduced/)).toBeVisible();

  account.sendMediaDatagram(audioFrame(101));
  await expect(call.getByText('0.0%', { exact: true })).toBeVisible({ timeout: 5_000 });

  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Active media call"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('call-health-axe-results', {
    body: JSON.stringify(axe, null, 2),
    contentType: 'application/json',
  });
  expect(axe.violations.map((violation) => violation.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);

  await account.disconnectLatest();
  await expect(call.getByRole('status')).toContainText('Onyx Server bridge interrupted');
  await expect.poll(() => account.connectionCount, { timeout: 10_000 }).toBe(2);
  await expect.poll(() => account.saslMechanisms).toEqual(['PLAIN', 'SESSION-TOKEN']);
  await expect.poll(
    () => account.commands.filter((command) => command === 'MEDIA JOIN #darkbear voice').length,
    { timeout: 10_000 },
  ).toBe(2);
  await expect(call.getByLabel('Call health: Healthy')).toBeVisible();
  await expect(call.getByRole('button', { name: /^alice/ })).toHaveCount(1);
  expect(browserErrors).toEqual([]);
});
