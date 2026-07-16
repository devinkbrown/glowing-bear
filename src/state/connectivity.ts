import { createSignal } from 'solid-js';

function currentBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

const [browserOnline, setBrowserOnline] = createSignal(currentBrowserOnline());
export { browserOnline };

/**
 * Track only browser transport reachability. Relay authentication/reconnect
 * remains owned by state/connection.ts; keeping the signals separate lets the
 * UI explain "offline" without mislabeling a reachable relay error.
 */
export function setupBrowserConnectivity(): () => void {
  const sync = () => setBrowserOnline(currentBrowserOnline());
  sync();
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  return () => {
    window.removeEventListener('online', sync);
    window.removeEventListener('offline', sync);
  };
}
