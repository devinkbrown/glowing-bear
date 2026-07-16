import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { installCallMedia } from './fixtures/callMedia';
import { MockOrochiAccount } from './fixtures/orochiAccount';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

interface FrameMetrics {
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}

async function sampleFrames(page: Page, count = 90): Promise<FrameMetrics> {
  const intervals = await page.evaluate(async (sampleCount) => {
    return await new Promise<number[]>((resolve) => {
      const values: number[] = [];
      let previous = 0;
      const sample = (now: number) => {
        if (previous > 0) values.push(now - previous);
        previous = now;
        if (values.length >= sampleCount) resolve(values);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, count);
  const sorted = [...intervals].sort((a, b) => a - b);
  return {
    medianMs: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    maxMs: sorted.at(-1) ?? 0,
  };
}

async function usedHeapBytes(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  return (await cdp.send('Runtime.getHeapUsage')).usedSize;
}

async function connect(page: Page): Promise<void> {
  await page.getByLabel('Hostname', { exact: true }).fill('relay.test');
  await page.getByRole('button', { name: 'TLS', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('performance-secret');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();
}

test('keeps the animated connect scene inside its frame-time budget', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop Chromium compositor budget');
  test.setTimeout(60_000);

  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  const scene = page.getByTestId('connect-decorative-background');
  await expect(scene).toBeVisible();
  // Let lazy mascot loading and one-shot entry transitions settle; this budget
  // measures the sustained decorative scene, while asset budgets cover boot.
  await page.waitForTimeout(1_000);
  await scene.evaluate((element) => { element.style.display = 'none'; });
  const baseline = await sampleFrames(page, 60);
  await scene.evaluate((element) => { element.style.display = ''; });
  await page.waitForTimeout(250);
  const frames = await sampleFrames(page, 60);
  const medianSceneCostMs = Math.max(0, frames.medianMs - baseline.medianMs);
  const p95SceneCostMs = Math.max(0, frames.p95Ms - baseline.p95Ms);
  await testInfo.attach('animated-scene-frame-budget', {
    body: JSON.stringify({ baseline, frames, medianSceneCostMs, p95SceneCostMs }, null, 2),
    contentType: 'application/json',
  });

  // Compare sustained cadence and the upper tail against a same-page, same-host
  // control so CI scheduler contention cannot masquerade as scene paint cost.
  // Absolute rAF intervals include time when Linux deschedules the renderer;
  // incremental visible-minus-hidden cost remains attributable to this scene.
  expect(medianSceneCostMs).toBeLessThanOrEqual(50);
  expect(p95SceneCostMs).toBeLessThanOrEqual(50);
});

test('keeps low-end mobile chat and long-call state responsive and bounded', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Pixel 7 low-end capability budget');
  test.setTimeout(150_000);

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 2 });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '4g', saveData: false },
    });
    localStorage.setItem('darkbear_settings_v2', JSON.stringify({
      archiveRetention: 'off',
      bridge: {
        enabled: true,
        wsUrl: 'wss://orochi.test/irc',
        account: 'performance-account',
        password: 'performance-account-secret',
        autoJoinMedia: false,
        e2eeDms: false,
      },
    }));
  });

  const relay = new MockWeeChatRelay();
  const account = new MockOrochiAccount();
  await Promise.all([relay.install(page), account.install(page), installCallMedia(page)]);
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  await expect(page.locator('html')).toHaveAttribute('data-performance', 'low');
  await expect(page.getByTestId('connect-compact-mark')).toBeVisible();
  await expect(page.getByTestId('connect-decorative-background')).toHaveCount(0);
  await expect(page.getByTestId('decorative-theme-background')).toHaveCount(0);
  await connect(page);

  const burstStarted = Date.now();
  for (let index = 0; index < 400; index += 1) {
    relay.sendIncoming(`performance burst ${index}`, index % 2 === 0 ? 'alice' : 'bob');
  }
  const burstDispatchMs = Date.now() - burstStarted;
  await page.evaluate(() => {
    type InteractionProbe = { startedMs: number | null; elapsedMs: number | null };
    const state: InteractionProbe = { startedMs: null, elapsedMs: null };
    const targetWindow = window as Window & { __darkbearInteractionProbe?: InteractionProbe };
    targetWindow.__darkbearInteractionProbe = state;

    const observer = new MutationObserver(() => {
      if (state.startedMs === null) return;
      if (!document.querySelector('[role="combobox"][aria-label="Search buffers and actions"]')) return;
      state.elapsedMs = performance.now() - state.startedMs;
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.key.toLowerCase() !== 'k') return;
      state.startedMs = performance.now();
      document.removeEventListener('keydown', onKeyDown, true);
    };
    document.addEventListener('keydown', onKeyDown, true);
  });
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('combobox', { name: 'Search buffers and actions' });
  await expect(palette).toBeVisible({ timeout: 3_000 });
  const interactionMs = await page.evaluate(() => {
    const targetWindow = window as Window & {
      __darkbearInteractionProbe?: { elapsedMs: number | null };
    };
    return targetWindow.__darkbearInteractionProbe?.elapsedMs ?? Number.POSITIVE_INFINITY;
  });
  await palette.press('Escape');
  await expect(page.getByText('performance burst 399', { exact: true })).toBeVisible({ timeout: 8_000 });
  const burstSettledMs = Date.now() - burstStarted;

  const lowTierFrames = await sampleFrames(page, 60);
  expect(interactionMs).toBeLessThanOrEqual(3_000);
  expect(burstSettledMs).toBeLessThanOrEqual(8_000);
  expect(lowTierFrames.p95Ms).toBeLessThanOrEqual(50);

  await page.getByRole('button', { name: 'Join voice' }).click();
  const preflight = page.getByRole('dialog', { name: 'Media preflight' });
  await expect(preflight.getByText('Encoder ready', { exact: true })).toBeVisible({ timeout: 60_000 });
  await preflight.getByRole('button', { name: 'Join voice' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  const call = page.getByLabel('Active media call');
  await expect(call).toBeVisible();

  const heapBefore = await usedHeapBytes(cdp);
  account.sendMediaEventBurst(Array.from({ length: 2_000 }, (_, index) => ({
    verb: 'CAPTION',
    channel: '#darkbear',
    params: [index % 2 === 0 ? 'alice' : 'bob', `:long call caption ${index}`],
  })));
  await expect(call.getByText('long call caption 1999', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(call.getByRole('button', { name: 'Call transcript (200)' })).toBeVisible();
  const heapAfter = await usedHeapBytes(cdp);
  const heapGrowthMiB = (heapAfter - heapBefore) / (1024 * 1024);

  const metrics = {
    burstDispatchMs,
    interactionMs,
    burstSettledMs,
    lowTierFrames,
    heapBefore,
    heapAfter,
    heapGrowthMiB,
  };
  await testInfo.attach('low-end-performance-budgets', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  expect(heapGrowthMiB).toBeLessThanOrEqual(16);
  expect(browserErrors).toEqual([]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});
