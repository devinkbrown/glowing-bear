import type { Page } from '@playwright/test';

/** Wait through DarkBear's one-time deploy-version cache purge and reload. */
export async function waitForAssetVersionReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const holder = document.querySelector('#db-asset-version')?.textContent ?? '';
    const version = holder.match(/'([^']*)'/)?.[1] ?? '';
    if (!version || localStorage.getItem('darkbear_asset_version') !== version) return false;
    const reloadArmed = sessionStorage.getItem(`darkbear_reload_for_${version}`) === '1';
    return !reloadArmed || new URL(window.location.href).searchParams.get('dbv') === version;
  });
}
