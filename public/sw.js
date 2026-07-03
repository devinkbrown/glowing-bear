/* DarkBear service worker.
 *
 * Caching: deliberately a cache-killer — delete every cache on install and
 * activate, and never intercept fetches. Stale cache-first service workers
 * have silently frozen clients on old builds before; DarkBear opts out of SW
 * caching entirely and lets normal HTTP caching do its job.
 *
 * Push: renders Orochi Web Push notifications (WEBPUSH SUBSCRIBE flow) and
 * focuses/opens the app on click.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', () => {
  return;
});

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
    data = {
      title: `Message from ${data.from}`,
      body: data.text ?? '',
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
