import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('desktop package contract', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json')) as {
    build: { frontendDist: string; beforeBuildCommand: string };
    app: {
      windows: Array<{ label: string; visible: boolean }>;
      security: { capabilities: string[]; csp: string };
    };
    plugins: { 'deep-link': { desktop: { schemes: string[] } } };
  };
  const capability = JSON.parse(read('src-tauri/capabilities/main.json')) as {
    windows: string[];
    local: boolean;
    permissions: string[];
    remote?: unknown;
  };

  it('packages the dedicated relative-asset build', () => {
    expect(config.build.frontendDist).toBe('../desktop-out');
    expect(config.build.beforeBuildCommand).toBe('pnpm build:desktop');
    expect(read('vite.config.ts')).toContain("base: desktop ? './' : '/darkbear/'");
    expect(read('index.html')).toContain('href="%BASE_URL%manifest.json"');
  });

  it('uses the verified Debian installer as the reproducible Linux default', () => {
    const linuxConfig = JSON.parse(read('src-tauri/tauri.linux.conf.json')) as {
      bundle: { targets: string[] };
    };
    expect(linuxConfig.bundle.targets).toEqual(['deb']);
    expect(read('package.json')).toContain(
      '"desktop:verify-package": "node scripts/verify-desktop-package.mjs"',
    );
    expect(read('scripts/verify-desktop-package.mjs')).toContain(
      'MimeType=x-scheme-handler/darkbear',
    );
  });

  it('keeps one bundled local window behind an explicit capability', () => {
    expect(config.app.windows).toEqual([
      expect.objectContaining({ label: 'main', visible: false }),
    ]);
    expect(config.app.security.capabilities).toEqual(['main']);
    expect(capability.windows).toEqual(['main']);
    expect(capability.local).toBe(true);
    expect(capability.remote).toBeUndefined();
  });

  it('grants only the four reviewed native interfaces', () => {
    expect(capability.permissions).toEqual([
      'core:event:default',
      'deep-link:default',
      'notification:default',
      'credential-vault',
    ]);
    expect(read('src-tauri/Cargo.toml')).not.toMatch(
      /tauri-plugin-(?:shell|fs|http|opener|process|sql|store|updater|upload)/,
    );
    expect(read('src-tauri/permissions/credential-vault.toml')).toContain(
      'commands.allow = [',
    );
  });

  it('registers only DarkBear controlled deep links', () => {
    expect(config.plugins['deep-link'].desktop.schemes).toEqual(['darkbear']);
    expect(read('src-tauri/Cargo.toml')).toContain('features = ["deep-link"]');
  });

  it('retains CSP restrictions for the native asset protocol and IPC', () => {
    const csp = config.app.security.csp;
    const browserHtml = read('index.html');
    const viteConfig = read('vite.config.ts');
    expect(csp).toContain("default-src 'self' customprotocol: asset:");
    expect(csp).toContain("connect-src 'self' ipc: http://ipc.localhost https: wss:");
    expect(csp).not.toMatch(/(?:^|[\s;])ws:(?:[\s;]|$)/);
    expect(csp).not.toMatch(/\s'unsafe-eval'(?:\s|;)/);
    expect(browserHtml).not.toMatch(/(?:^|[\s;])ws:(?:[\s;]|$)/);
    expect(browserHtml).toContain('ws://localhost:* ws://127.0.0.1:*');
    expect(viteConfig).toContain("name: 'darkbear-desktop-csp'");
    expect(viteConfig).toContain(String.raw`return html.replace(/ ws:\/\/localhost`);
  });

  it('disables the deploy-version service worker inside the installed shell', () => {
    expect(read('src/App.tsx')).toContain(
      "if (import.meta.env.DEV || isDesktopBuild || !('serviceWorker' in navigator))",
    );
  });
});
