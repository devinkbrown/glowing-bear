/**
 * Narrow desktop-runtime seam.
 *
 * Protocol, state, rendering, media, and persistence remain web code. Only the
 * capabilities that justify an installed shell are imported here, and every
 * native module is loaded lazily so the browser bundle never executes Tauri
 * IPC. The native capability file grants access to this bundled local window
 * only; remote frames receive no IPC authority.
 */

export const isDesktopBuild = import.meta.env.MODE === 'desktop';
export const appBaseUrl = isDesktopBuild ? './' : '/darkbear/';

export function appAsset(path: string): string {
  return `${appBaseUrl}${path.replace(/^\/+/, '')}`;
}

export function isDesktopRuntime(): boolean {
  return isDesktopBuild
    && typeof window !== 'undefined'
    && '__TAURI_INTERNALS__' in window;
}

export type DesktopVaultRecord = 'settings-v1' | 'credentials-v1';

export async function desktopVaultGet(record: DesktopVaultRecord): Promise<string | null> {
  if (!isDesktopRuntime()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string | null>('credential_vault_get', { record });
  } catch {
    return null;
  }
}

export async function desktopVaultSet(record: DesktopVaultRecord, payload: string): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('credential_vault_set', { record, payload });
    return true;
  } catch {
    return false;
  }
}

export async function desktopVaultDelete(record: DesktopVaultRecord): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('credential_vault_delete', { record });
    return true;
  } catch {
    return false;
  }
}

const MAX_DEEP_LINK_TARGET_LENGTH = 256;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Parse the only accepted native URL shape:
 *   darkbear://open/buffer?target=<relay buffer id or full name>
 *
 * Deep links are untrusted command-line/OS input. Reject credentials, extra
 * parameters, fragments, control characters, and every non-navigation path.
 */
export function parseDesktopDeepLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'darkbear:' || url.hostname !== 'open') return null;
    if (url.username || url.password || url.port || url.hash) return null;
    if (url.pathname !== '/buffer') return null;
    const keys = [...url.searchParams.keys()];
    if (keys.length !== 1 || keys[0] !== 'target') return null;
    const target = url.searchParams.get('target') ?? '';
    if (!target || target.length > MAX_DEEP_LINK_TARGET_LENGTH) return null;
    if (target.trim() !== target || CONTROL_CHARACTER.test(target)) return null;
    return target;
  } catch {
    return null;
  }
}

function dispatchDeepLinks(values: readonly string[]): void {
  for (const value of values) {
    const target = parseDesktopDeepLink(value);
    if (!target) continue;
    window.dispatchEvent(new CustomEvent<string>('jump-to-buffer', { detail: target }));
  }
}

/** Register current-launch and already-running deep-link delivery. */
export function setupDesktopDeepLinks(): () => void {
  if (!isDesktopRuntime()) return () => undefined;
  let active = true;
  let unlisten: (() => void) | undefined;

  void import('@tauri-apps/plugin-deep-link').then(async ({ getCurrent, onOpenUrl }) => {
    if (!active) return;
    unlisten = await onOpenUrl((urls) => {
      if (active) dispatchDeepLinks(urls);
    });
    const current = await getCurrent();
    if (active && current) dispatchDeepLinks(current);
  }).catch(() => undefined);

  return () => {
    active = false;
    unlisten?.();
  };
}

/** Return null outside the installed shell so callers can use the Web API. */
export async function requestDesktopNotificationPermission(): Promise<boolean | null> {
  if (!isDesktopRuntime()) return null;
  try {
    const notifications = await import('@tauri-apps/plugin-notification');
    if (await notifications.isPermissionGranted()) return true;
    return await notifications.requestPermission() === 'granted';
  } catch {
    return false;
  }
}

/** Send a native OS notification without exposing message data to another API. */
export async function sendDesktopNotification(options: {
  title: string;
  body: string;
}): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  try {
    const notifications = await import('@tauri-apps/plugin-notification');
    if (!await notifications.isPermissionGranted()) return false;
    notifications.sendNotification(options);
    return true;
  } catch {
    return false;
  }
}
