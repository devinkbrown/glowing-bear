import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

async function sendNotificationAction(
  page: Page,
  action: 'open' | 'mark-read' | 'mute-1h' | 'reply',
  reply?: string,
): Promise<void> {
  await page.evaluate(async ({ action, reply }) => {
    // A real actionable notification carries the opaque relay-profile binding
    // captured when it was shown. Import the already-loaded dev module so this
    // synthetic service-worker delivery exercises the same production check
    // instead of bypassing or weakening it.
    const modulePath = '/darkbear/src/state/connection.ts';
    const connection = await import(/* @vite-ignore */ modulePath) as {
      currentNotificationConnectionScope(): string;
    };
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'darkbear-notification-action',
        action,
        bufferId: '0xcafe',
        target: '#darkbear',
        connectionScope: connection.currentNotificationConnectionScope(),
        reply,
      },
    }));
  }, { action, reply });
}

async function installNotificationRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => false,
    });
    class RecordedNotification {
      static readonly permission = 'granted';
      static requestPermission(): Promise<NotificationPermission> {
        return Promise.resolve('granted');
      }

      onclick: (() => void) | null = null;

      constructor(title: string, options?: NotificationOptions) {
        const holder = window as typeof window & {
          __darkbearNotifications?: Array<{ title: string; body: string }>;
        };
        holder.__darkbearNotifications ??= [];
        holder.__darkbearNotifications.push({ title, body: options?.body ?? '' });
      }

      close(): void {}
    }
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: RecordedNotification,
    });
  });
}

async function connectPage(page: Page): Promise<void> {
  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  await page.getByLabel('Hostname', { exact: true }).fill('relay.test');
  await page.getByRole('button', { name: 'TLS', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('notification-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();
}

async function notificationCount(context: BrowserContext): Promise<number> {
  const counts = await Promise.all(context.pages().map((page) => page.evaluate(() => (
    (window as typeof window & { __darkbearNotifications?: unknown[] })
      .__darkbearNotifications?.length ?? 0
  ))));
  return counts.reduce((sum, count) => sum + count, 0);
}

test('schedules DND and handles open, read, temporary-mute, and reply actions', async ({ page }, testInfo) => {
  const relay = new MockWeeChatRelay({ includeQuery: true });
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
  await page.getByLabel('Password', { exact: true }).fill('notification-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /^Alerts(?: Notifications and recovery)?$/ })
    .filter({ visible: true }).first().click();
  const dnd = page.getByTestId('notification-dnd');
  await dnd.getByRole('switch', { name: /Scheduled quiet hours/ }).click();
  await dnd.getByLabel('Quiet starts').fill('21:30');
  await dnd.getByLabel('Quiet ends').fill('06:15');
  await dnd.getByLabel('Time zone').fill('Europe/Berlin');
  await dnd.getByRole('button', { name: 'Pause 1 hour' }).click();
  await expect(dnd.getByRole('status')).toContainText('Paused until');

  const axe = await new AxeBuilder({ page })
    .include('[data-testid="notification-dnd"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await testInfo.attach('notification-dnd-axe-results', {
    body: JSON.stringify(axe, null, 2),
    contentType: 'application/json',
  });
  expect(axe.violations.map((violation) => violation.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);

  await dnd.getByRole('button', { name: 'Resume alerts' }).click();
  await page.getByRole('button', { name: 'Close preferences' }).filter({ visible: true }).click();

  if ((page.viewportSize()?.width ?? 1024) < 1024) {
    await page.getByRole('button', { name: 'Buffers', exact: true }).filter({ visible: true }).click();
  }
  // Buffer rows expose the selection target as a native button so the sibling
  // notification control remains independently reachable to assistive tech.
  // Drive that semantic target instead of the decorative visible label.
  await page.getByRole('button', { name: 'alice', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText('Welcome from the deterministic relay', { exact: true })).toBeHidden();
  await sendNotificationAction(page, 'open');
  await expect(page.getByText('Welcome from the deterministic relay', { exact: true })).toBeVisible();

  await sendNotificationAction(page, 'mute-1h');
  await page.keyboard.press('Control+k');
  await expect(page.getByText('Resume temporary alerts — #darkbear', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await sendNotificationAction(page, 'mark-read');
  await sendNotificationAction(page, 'reply', 'reply from notification');
  await expect.poll(() => relay.commands.includes('input 0xcafe reply from notification')).toBe(true);
  await expect(page.getByText('reply from notification', { exact: true })).toHaveCount(1);
  expect(browserErrors).toEqual([]);
});

test('elects one connected tab for a highlighted-message notification', async ({ context, page }) => {
  const secondPage = await context.newPage();
  const firstRelay = new MockWeeChatRelay();
  const secondRelay = new MockWeeChatRelay();
  await Promise.all([
    installNotificationRecorder(page),
    installNotificationRecorder(secondPage),
    firstRelay.install(page),
    secondRelay.install(secondPage),
  ]);
  await Promise.all([connectPage(page), connectPage(secondPage)]);

  // Give the same-origin BroadcastChannel peers time to exchange their
  // connection state before the same highlighted line reaches both tabs.
  await expect.poll(() => firstRelay.connectionCount + secondRelay.connectionCount).toBe(2);
  await page.waitForTimeout(250);
  firstRelay.sendIncoming('one alert across two tabs', 'alice', undefined, true);
  secondRelay.sendIncoming('one alert across two tabs', 'alice', undefined, true);

  await expect.poll(() => notificationCount(context)).toBe(1);
  const records = await Promise.all(context.pages().map((candidate) => candidate.evaluate(() => (
    (window as typeof window & {
      __darkbearNotifications?: Array<{ title: string; body: string }>;
    }).__darkbearNotifications ?? []
  ))));
  expect(records.flat()).toEqual([{
    title: 'Highlight in #darkbear',
    body: 'one alert across two tabs',
  }]);
});
