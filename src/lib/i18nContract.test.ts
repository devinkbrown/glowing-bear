import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('localization and international-input source contract', () => {
  it.each([
    'src/ui/input/InputBar.tsx',
    'src/ui/chat/MessageView.tsx',
    'src/ui/modals/BufferSwitcher.tsx',
    'src/ui/modals/ConnectModal.tsx',
    'src/ui/panels/ThreadPanel.tsx',
    'src/ui/panels/UserList.tsx',
    'src/ui/layout/Sidebar.tsx',
  ])('keeps IME composition protection on %s', (path) => {
    const source = read(path);
    expect(source).toContain("from '@/primitives/ime'");
    expect(source).toContain('isImeComposing(');
  });

  it('keeps locale and direction updates on the application root', () => {
    const source = read('src/App.tsx');
    expect(source).toContain('applyLocalePreference(settings.locale)');

    const i18nSource = read('src/lib/i18n.ts');
    expect(i18nSource).toContain('document.documentElement.lang = locale');
    expect(i18nSource).toContain('document.documentElement.dir = localeDirection(locale)');
  });

  it('keeps mixed-direction text isolated and mirrors structural rails in RTL', () => {
    const css = read('src/styles/global.css');
    expect(css).toContain('unicode-bidi: plaintext');
    expect(css).toContain('html[dir="rtl"] .darkbear-sidebar');
    expect(css).toContain('html[dir="rtl"] .thread-panel');
    expect(css).toContain('html[dir="rtl"] .user-list-panel');
    expect(css).toContain('html[dir="rtl"] .login-secret-toggle');
  });
});
