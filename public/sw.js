/* DarkBear service worker.
 *
 * Caching: PURE CACHE-KILLER. There is NO fetch handler and NO app-shell cache.
 * Every request (navigations, JS/CSS chunks, the relay WS, media) goes straight
 * to the network with normal HTTP caching — the SW never serves a stored copy.
 * install/activate delete ALL caches and take control, so a client can never be
 * frozen on a stale build. (An earlier network-first app-shell was reverted: on
 * flaky mobile networks a failed navigation could serve a cached index.html that
 * pointed at hashed JS chunks a redeploy had removed, stranding the client on old
 * code — which read as "the app won't connect". Offline-shell is deferred until
 * it can be made deploy-safe.)
 *
 * Push: renders Orochi Web Push notifications (WEBPUSH SUBSCRIBE flow) and
 * focuses/opens the app on click.
 */

// Delete every cache (the cache-killer).
function purgeAllCaches() {
  return caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(purgeAllCaches());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(purgeAllCaches().then(() => self.clients.claim()));
});

// Intentionally NO 'fetch' handler — nothing is intercepted or served from cache.

// E2EE DM envelope prefix (see src/lib/e2ee/dmCipher.ts ENVELOPE_PREFIX). The
// server never holds DM plaintext, so a pushed DM `text` is the ciphertext
// envelope; the SW cannot decrypt it. Keep this in lockstep with dmCipher.ts.
const E2EE_ENVELOPE_PREFIX = 'TSUMUGI1 ';
const ENCRYPTED_BODY = 'New encrypted message';

// ── Push notifications ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? '' };
  }
  // Orochi's webpushNotify sends {type:'dm', from, text} (RFC 8291-encrypted
  // end to end); map it onto the generic {title, body, url} shape.
  if (data.type === 'dm' && data.from) {
    const text = typeof data.text === 'string' ? data.text : '';
    // Fail closed: an E2EE-DM envelope is ciphertext the SW can't open — never
    // surface it (or any raw blob) to an OS alert that may render on a lock
    // screen. Show a neutral body instead.
    const body = text.startsWith(E2EE_ENVELOPE_PREFIX) ? ENCRYPTED_BODY : text;
    data = {
      title: `Message from ${data.from}`,
      body,
      tag: `darkbear-dm-${data.from}`,
      url: '/darkbear/',
    };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'DarkBear', {
      body: data.body ?? '',
      icon: '/darkbear/favicon.svg',
      badge: '/darkbear/favicon.svg',
      tag: data.tag ?? 'darkbear-notification',
      renotify: !!data.tag,
      data: { url: data.url ?? '/darkbear/' },
      vibrate: [100, 50, 100],
    })
  );
});

// ── Notification click: focus or open the app ─────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/darkbear/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // No window open — open a new one
        return self.clients.openWindow(targetUrl);
      })
  );
});
