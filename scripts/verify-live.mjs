import { chromium } from '@playwright/test';

const [url, expectedVersion] = process.argv.slice(2);
if (!url || !expectedVersion) {
  console.error('usage: node scripts/verify-live.mjs <url> <expected-version>');
  process.exit(2);
}

const failures = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const origin = new URL(url).origin;

  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown';
    // The asset-version bootstrap deliberately replaces the first navigation.
    // Chromium reports modules from that discarded document as ERR_ABORTED;
    // HTTP failures on the final document are still captured by response.
    if (request.url().startsWith(origin) && reason !== 'net::ERR_ABORTED') {
      failures.push(`requestfailed: ${request.method()} ${request.url()} (${reason})`);
    }
  });
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      failures.push(`response: ${response.status()} ${response.url()}`);
    }
  });

  const response = await page.goto(`${url}?dbv=${encodeURIComponent(expectedVersion)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  if (!response?.ok()) failures.push(`navigation: ${response?.status() ?? 'no response'} ${url}`);

  await page.getByRole('heading', { name: 'DarkBear', level: 1 }).waitFor({
    state: 'visible',
    timeout: 20_000,
  });
  await page.waitForLoadState('networkidle');
  const holder = await page.locator('#db-asset-version').textContent();
  if (!holder?.includes(expectedVersion)) {
    failures.push(`version: expected ${expectedVersion}, got ${holder ?? '<missing>'}`);
  }

  await context.close();
} catch (error) {
  failures.push(`smoke: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`live Playwright smoke passed: ${expectedVersion}`);
