import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForAssetVersionReady } from './fixtures/appReady';
import { MockWeeChatRelay } from './fixtures/weechatRelay';

async function dispatchCompositionKey(
  target: Locator,
  key: string,
  options: { ctrlKey?: boolean; value?: string } = {},
): Promise<void> {
  await target.evaluate((element, eventOptions) => {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart', {
      bubbles: true,
      data: eventOptions.value ?? '',
    }));
    if (eventOptions.value !== undefined) {
      input.value = eventOptions.value;
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        data: eventOptions.value,
        inputType: 'insertCompositionText',
        isComposing: true,
      }));
    }
    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey: eventOptions.ctrlKey ?? false,
      isComposing: true,
      key: eventOptions.key,
    }));
  }, { ...options, key });
}

async function finishComposition(target: Locator, value = ''): Promise<void> {
  await target.evaluate((element, data) => {
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data }));
  }, value);
}

async function bootArabic(page: Page, relay: MockWeeChatRelay): Promise<string[]> {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('darkbear_settings_v2', JSON.stringify({ locale: 'ar' }));
  });
  await relay.install(page);
  await page.goto('/darkbear/', { waitUntil: 'domcontentloaded' });
  await waitForAssetVersionReady(page);
  return browserErrors;
}

test.describe('localization and input composition', () => {
  test('keeps Arabic RTL layout and IME text intact from connect through chat', async ({ page }, testInfo) => {
    const relay = new MockWeeChatRelay({ includeServer: true });
    const browserErrors = await bootArabic(page, relay);

    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const host = page.getByLabel('اسم المضيف', { exact: true });
    await expect(host).toBeVisible();

    const connect = page.getByRole('button', { name: 'اتصال', exact: true });
    const password = page.locator('#c-pass');
    await dispatchCompositionKey(host, 'Enter', { ctrlKey: true, value: 'relay.test' });
    await expect(host).toHaveValue('relay.test');
    expect(relay.connectionCount).toBe(0);
    await finishComposition(host, 'relay.test');

    await page.getByRole('button', { name: 'خيارات متقدمة' }).click();
    await page.getByRole('button', { name: 'استخدام كلمة مرور لمرة واحدة' }).click();
    const totpDigit = page.getByLabel('الرقم 1 من كلمة المرور لمرة واحدة');
    await dispatchCompositionKey(totpDigit, 'ArrowRight');
    await expect(totpDigit).toBeFocused();
    await finishComposition(totpDigit);

    const bridgeToggle = page.getByRole('button', { name: 'تفعيل جسر Orochi' });
    await bridgeToggle.click();
    const bridgeAccount = page.getByLabel('حساب الجسر');
    const bridgePassword = page.getByLabel('كلمة مرور الجسر');
    await dispatchCompositionKey(bridgeAccount, 'Enter', { ctrlKey: true, value: 'مستخدم-اختبار' });
    await expect(bridgeAccount).toHaveValue('مستخدم-اختبار');
    expect(relay.connectionCount).toBe(0);
    await finishComposition(bridgeAccount, 'مستخدم-اختبار');
    await dispatchCompositionKey(bridgePassword, 'Enter', { ctrlKey: true, value: 'سر-الجسر' });
    await expect(bridgePassword).toHaveValue('سر-الجسر');
    expect(relay.connectionCount).toBe(0);
    await finishComposition(bridgePassword, 'سر-الجسر');
    await bridgeToggle.click();

    await dispatchCompositionKey(password, 'Enter', { ctrlKey: true, value: 'سر-اختبار' });

    await expect(password).toHaveValue('سر-اختبار');
    await expect(connect).toBeEnabled();
    expect(relay.connectionCount).toBe(0);

    await finishComposition(password, 'سر-اختبار');
    await connect.click();
    await expect(page.getByText('#darkbear', { exact: true }).first()).toBeVisible();
    relay.sendServerIncoming(
      'tester orochi.test orochi-0.1.0 iowx bklmnt',
      'orochi.test',
      ['irc_004'],
    );

    const composer = page.locator('textarea.composer-textarea');
    await expect(composer).toHaveAttribute('placeholder', 'رسالة...');
    await dispatchCompositionKey(composer, 'Enter', { value: 'こんにちは世界' });

    await expect(composer).toHaveValue('こんにちは世界');
    expect(relay.commands).not.toContain('input 0xcafe こんにちは世界');

    // Global shortcuts must also stand down while the input method owns the
    // keyboard. A composing Ctrl+K must not steal focus into the command palette.
    await dispatchCompositionKey(composer, 'k', { ctrlKey: true });
    await expect(page.getByRole('combobox', { name: 'البحث في المحادثات والإجراءات' })).toHaveCount(0);

    await finishComposition(composer, 'こんにちは世界');
    await composer.press('Enter');
    await expect.poll(() => relay.commands.includes('input 0xcafe こんにちは世界')).toBe(true);

    await page.keyboard.press('Control+K');
    const palette = page.getByRole('combobox', { name: 'البحث في المحادثات والإجراءات' });
    await expect(palette).toBeVisible();
    await expect(page.getByRole('option', { name: /فتح الإعدادات/ })).toBeVisible();
    await dispatchCompositionKey(palette, 'Enter');
    await expect(palette).toBeVisible();
    await finishComposition(palette);
    await palette.press('Escape');
    await expect(palette).toBeHidden();

    await page.keyboard.press('Control+F');
    const messageSearch = page.getByPlaceholder('البحث في الرسائل...');
    await expect(messageSearch).toBeVisible();
    await dispatchCompositionKey(messageSearch, 'Escape', { value: 'بحث تجريبي' });
    await expect(messageSearch).toHaveValue('بحث تجريبي');
    await expect(messageSearch).toBeVisible();
    await finishComposition(messageSearch, 'بحث تجريبي');
    await messageSearch.press('Escape');
    await expect(messageSearch).toBeHidden();

    await composer.fill('/services');
    await composer.press('Enter');
    const services = page.getByRole('dialog', { name: 'الخدمات' });
    await expect(services).toBeVisible();
    const accountServicesTab = services.getByRole('tab', { name: 'الحساب' });
    const channelServicesTab = services.getByRole('tab', { name: 'القناة' });
    await accountServicesTab.focus();
    await accountServicesTab.press('ArrowLeft');
    await expect(channelServicesTab).toBeFocused();
    await expect(channelServicesTab).toHaveAttribute('aria-selected', 'true');
    await channelServicesTab.press('ArrowRight');
    await expect(accountServicesTab).toBeFocused();
    const servicesScroll = services.getByTestId('services-scroll-region');
    const serviceWidth = await servicesScroll.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(serviceWidth.scrollWidth).toBeLessThanOrEqual(serviceWidth.clientWidth);
    await services.getByRole('tab', { name: 'مذكرة' }).click();
    await expect(services.getByRole('heading', { name: 'إرسال مذكرة' })).toBeVisible();
    await expect(services.getByLabel('الرسالة...')).toBeVisible();
    await services.evaluate(async (dialog) => {
      const animations = (dialog.parentElement ?? dialog).getAnimations({ subtree: true });
      await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    });
    const servicesAxe = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await testInfo.attach('arabic-orochi-services-axe-results', {
      body: JSON.stringify(servicesAxe, null, 2),
      contentType: 'application/json',
    });
    expect(
      servicesAxe.violations.map((violation) => violation.id),
      JSON.stringify(servicesAxe.violations, null, 2),
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(services).toBeHidden();

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await testInfo.attach('arabic-rtl-axe-results', {
      body: JSON.stringify(axe, null, 2),
      contentType: 'application/json',
    });
    const axeFailures = axe.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({ html: node.html, target: node.target })),
    }));
    expect(axeFailures, JSON.stringify(axeFailures, null, 2)).toEqual([]);

    await page.keyboard.press('Control+K');
    await page.getByRole('option', { name: /فتح الإعدادات/ }).click();
    const localeSelect = page.getByTestId('locale-select');
    await expect(localeSelect).toBeVisible();
    await localeSelect.selectOption('de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByText('Einstellungen', { exact: true }).first()).toBeVisible();
    await localeSelect.selectOption('ar');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const viewportFits = await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(viewportFits).toBe(true);
    expect(browserErrors).toEqual([]);
  });
});
