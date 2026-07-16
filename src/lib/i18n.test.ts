// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  activeLocale,
  applyLocalePreference,
  formatDate,
  formatNumber,
  localeDirection,
  resolveLocale,
  t,
} from './i18n';

describe('locale infrastructure', () => {
  afterEach(() => applyLocalePreference('en'));

  it('resolves supported system languages and falls back to English', () => {
    expect(resolveLocale('system', ['ar-SA', 'en-US'])).toBe('ar');
    expect(resolveLocale('system', ['de-DE'])).toBe('de');
    expect(resolveLocale('system', ['ja-JP'])).toBe('en');
    expect(resolveLocale('ar', ['en-US'])).toBe('ar');
  });

  it('updates root language and direction with complete translated messages', () => {
    applyLocalePreference('ar');

    expect(activeLocale()).toBe('ar');
    expect(localeDirection()).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(t('composer.replyingTo', { target: 'سارة' })).toBe('رد على سارة');
  });

  it('formats numbers and dates through the active locale', () => {
    applyLocalePreference('de');
    const date = new Date(2026, 6, 16, 13, 5);

    expect(formatNumber(1234.5)).toContain('1.234');
    expect(formatDate(date, { hour: '2-digit', minute: '2-digit' })).toMatch(/13:05/);
  });
});
