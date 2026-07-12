/* DarkBear service worker.
 *
 * Caching: still a cache-killer for everything EXCEPT one small, versioned
 * app-shell cache. Stale cache-first service workers have silently frozen
 * clients on old builds before, so the fetch handler is strictly network-FIRST
 * and only ever touches top-level navigations: while online it always serves
 * the fresh network response (and refreshes the shell copy); the cached shell
 * is served ONLY when the network fails. API, relay (WS), media, and static
 * assets are never intercepted or cached — they always hit the network.
 * install/activate purge every OTHER cache, and index.html's asset-version
 * script nukes the shell cache + unregisters the SW on every deploy, so the
 * offline shell can never outlive a build.
 *
 * Push: renders Orochi Web Push notifications (WEBPUSH SUBSCRIBE flow) and
 * focuses/opens the app on click.
 */

// Bump SHELL_CACHE when the app-shell caching strategy changes; any cache with
// a different name is treated as stale and deleted on install/activate.
const SHELL_CACHE = 'darkbear-shell-v1';
const SHELL_URL = '/darkbear/';

// Delete every cache except the current app-shell cache (the cache-killer).
function purgeStaleCaches() {
  return caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))),
  );
}

// Precache the app shell. `cache: 'reload'` bypasses the HTTP cache so the shell
// is fresh at install; failure (e.g. offline at install) is swallowed — the
// fetch handler self-heals the shell on the next successful navigation.
function precacheShell() {
  return caches
    .open(SHELL_CACHE)
    .then((cache) => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
    .catch(() => {});
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(purgeStaleCaches().then(precacheShell));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(purgeStaleCaches().then(() => self.clients.claim()));
});

// Network-first app-shell fallback. Navigations only; never caches anything but
// the shell, and never serves a cached response while the network is reachable.
function navigateWithShellFallback(request) {
  return fetch(request)
    .then((response) => {
      // Refresh the offline shell from a good same-origin response. Because this
      // is network-first, a stale cached shell is never served while online.
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy)).catch(() => {});
      }
      return response;
    })
    .catch(() =>
      caches
        .open(SHELL_CACHE)
        .then((cache) => cache.match(SHELL_URL))
        .then((cached) => cached ?? Response.error()),
    );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // App-shell only: top-level same-origin GET navigations. Everything else is
  // passed straight through to the network — no interception, no caching.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(navigateWithShellFallback(request));
});

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
