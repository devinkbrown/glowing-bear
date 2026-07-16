import { expect, test, type Page } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

async function connect(page: Page, relay: MockWeeChatRelay): Promise<string[]> {
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

async function openAdvancedSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Preferences' }).filter({ visible: true })).toBeVisible();
  await page.getByText('Advanced', { exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByText('Local Archive', { exact: true })).toBeVisible();
}

async function archiveRecords(page: Page): Promise<Array<Record<string, unknown>>> {
  return await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('darkbear-archive-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const request = db.transaction('messages', 'readonly').objectStore('messages').getAll();
        request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

async function seedLegacyArchive(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('darkbear-archive-v1', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('messages', { keyPath: 'key' });
        store.createIndex('byTimestamp', 'timestamp');
        store.createIndex('byBufferTimestamp', ['bufferKey', 'timestamp']);
        store.createIndex('bySender', 'sender');
        store.createIndex('byMsgid', 'msgid');
        store.createIndex('byReplyParent', 'replyParent');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const text = 'legacy v1 searchable archive proof';
      const tx = db.transaction('messages', 'readwrite');
      tx.objectStore('messages').put({
        key: 'irc.test.#darkbear\0legacy-line',
        bufferKey: 'irc.test.#darkbear',
        bufferName: '#darkbear',
        lineId: 'legacy-line',
        timestamp: Date.now() - 1_000,
        sender: 'legacy-bear',
        text,
        normalizedText: `legacy-bear ${text}`,
        msgid: 'legacy-msgid',
        replyParent: '',
        hasLink: false,
        hasFile: false,
        isMention: false,
        isUnread: false,
        sizeBytes: text.length,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}

test.describe('local archive worker', () => {
  test('indexes only after opt-in, searches IndexedDB, and wipes when disabled', async ({ page }) => {
    const relay = new MockWeeChatRelay();
    const browserErrors = await connect(page, relay);
    await seedLegacyArchive(page);

    await openAdvancedSettings(page);
    const retention = page.getByLabel('Archive retention');
    await expect(retention).toHaveValue('off');
    await retention.selectOption('7d');
    await expect(retention).toHaveValue('7d');
    await expect(page.getByText('1 messages · 0.0 MiB', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close preferences' }).filter({ visible: true }).click();

    const phrase = 'worker indexed archive proof';
    const composer = page.locator('textarea.composer-textarea');
    await composer.fill(phrase);
    await composer.press('Enter');
    await expect(page.getByText(phrase, { exact: true })).toHaveCount(1);

    await expect.poll(async () => (await archiveRecords(page)).length).toBe(2);
    const records = await archiveRecords(page);
    expect(records.some((record) => record.text === phrase)).toBe(true);
    expect(records.some((record) => record.text === 'legacy v1 searchable archive proof')).toBe(true);
    expect(JSON.stringify(records)).not.toContain('e2e-secret');
    expect(JSON.stringify(records)).not.toContain('relay.test');

    await page.keyboard.press('Control+f');
    await page.getByPlaceholder('Search messages...').fill('"legacy v1 searchable archive proof"');
    const archivedResults = page.getByLabel('Archived message results');
    await expect(archivedResults.getByRole('button').filter({ hasText: 'legacy v1 searchable archive proof' })).toBeVisible();
    await page.getByPlaceholder('Search messages...').fill('"worker indexed archive proof"');
    await expect(archivedResults.getByRole('button').filter({ hasText: phrase })).toBeVisible();
    await page.keyboard.press('Escape');

    await openAdvancedSettings(page);
    await page.getByLabel('Archive retention').selectOption('off');
    await expect(page.getByText('0 messages · 0.0 MiB', { exact: true })).toBeVisible();
    await expect.poll(async () => (await archiveRecords(page)).length).toBe(0);
    expect(browserErrors).toEqual([]);
  });
});
