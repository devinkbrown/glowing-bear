import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

test('saves and pivots incident views, confirms destructive targets, audits, and exports redacted JSON', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const relay = new MockWeeChatRelay({ includeServer: true });
  await relay.install(page);

  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  await page.getByLabel('Hostname', { exact: true }).fill('relay.test');
  await page.getByRole('button', { name: 'TLS', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('operator-relay-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  relay.sendServerIncoming('You are now an IRC operator — staff', 'onyx.test', ['irc_381']);
  relay.sendServerIncoming('@onyx_server.io/category=CONNECT;onyx_server.io/severity=notice :onyx.test EVENT oper USER CONNECT alice!u@10.0.0.1 account=private-account');
  relay.sendServerIncoming('@onyx_server.io/category=OPER_ACTION;onyx_server.io/severity=warn :onyx.test EVENT oper MEMBER JOIN #darkbear alice');

  await page.keyboard.press('Control+k');
  await expect(page.getByText('Toggle oper console', { exact: true })).toBeVisible();
  await page.getByText('Toggle oper console', { exact: true }).click();
  const workspace = page.getByTestId('operator-incident-workspace');
  await expect(workspace).toBeVisible();
  await expect(workspace.getByText('Correlated Event Timeline (2/2)')).toBeVisible();

  await workspace.getByRole('checkbox', { name: 'CONNECT', exact: true }).check();
  await workspace.getByRole('checkbox', { name: 'OPER_ACTION', exact: true }).check();
  await workspace.getByLabel('Incident view name').fill('Alice response');
  await workspace.getByLabel('Event feed query').fill('alice');
  await workspace.getByRole('button', { name: 'Save view' }).click();
  await expect(workspace.getByRole('button', { name: 'Alice response', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await workspace.getByRole('button', { name: 'alice', exact: true }).first().click();
  await expect(workspace.getByRole('button', { name: 'Clear incident pivot alice' })).toBeVisible();
  await expect(workspace.getByText('Correlated Event Timeline (2/2)')).toBeVisible();

  const axe = await new AxeBuilder({ page })
    .include('[data-testid="operator-incident-workspace"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('operator-incident-axe-results', {
    body: JSON.stringify(axe, null, 2),
    contentType: 'application/json',
  });
  expect(axe.violations.map((violation) => violation.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);

  await workspace.getByLabel('KILL target nick').fill('alice');
  await workspace.getByLabel('KILL reason').fill('token=incident-secret');
  await workspace.getByRole('button', { name: 'Review KILL' }).click();
  const destructive = workspace.getByRole('button', { name: 'Send destructive command' });
  await expect(destructive).toBeDisabled();
  await workspace.getByLabel('Type alice to confirm').fill('Alice');
  await expect(destructive).toBeDisabled();
  await workspace.getByLabel('Type alice to confirm').fill('alice');
  await destructive.click();
  await expect.poll(() => relay.commands.includes('input 0xbeef /quote KILL alice :token=incident-secret')).toBe(true);
  await expect(workspace.getByText('KILL alice :token=<redacted>', { exact: true })).toBeVisible();

  const persistedAudit = await page.evaluate(() => localStorage.getItem('darkbear_operator_audit_v1') ?? '');
  expect(persistedAudit).toContain('KILL alice :token=<redacted>');
  expect(persistedAudit).not.toContain('incident-secret');

  const downloadPromise = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Export redacted JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^darkbear-incident-.*\.json$/);
  const stream = await download.createReadStream();
  let exported = '';
  for await (const chunk of stream) exported += chunk.toString();
  expect(exported).toContain('"pivot": "alice"');
  expect(exported).toContain('KILL alice :token=<redacted>');
  expect(exported).not.toContain('10.0.0.1');
  expect(exported).not.toContain('private-account');
  expect(exported).not.toContain('incident-secret');
  expect(browserErrors).toEqual([]);
});
