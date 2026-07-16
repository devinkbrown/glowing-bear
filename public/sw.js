/* DarkBear service worker.
 *
 * The release cache contains only immutable build/public assets selected by
 * scripts/stamp-release.mjs plus the standalone offline page. index.html is
 * deliberately NEVER cached: navigations are network-only and fall back to the
 * purpose-built offline document, so a flaky connection cannot strand a client
 * on stale HTML whose hashed chunks no longer exist. API responses, uploads,
 * relay/media traffic, archives, drafts, transcripts, and decrypted content are
 * outside the allowlist and never enter Cache Storage.
 *
 * Push renders Orochi Web Push notifications (WEBPUSH SUBSCRIBE flow) and
 * focuses/opens the app on click.
 */

const DEPLOY_VERSION = 'development'; // __DARKBEAR_DEPLOY_VERSION__
const PRECACHE_JSON = '["/darkbear/offline.html","/darkbear/offline.js","/darkbear/favicon.svg"]'; // __DARKBEAR_PRECACHE_JSON__
const PRECACHE_URLS = Object.freeze(JSON.parse(PRECACHE_JSON));
const RELEASE_CACHE_PREFIX = 'darkbear-release-';
const RELEASE_CACHE_NAME = `${RELEASE_CACHE_PREFIX}${DEPLOY_VERSION}`;
const OFFLINE_URL = '/darkbear/offline.html';
const CLIENT_VERSION_MESSAGE = 'darkbear-client-version';
const MAX_RELEASE_CACHES = 4;
const clientVersions = new Map();

function releaseCacheName(version) {
  return `${RELEASE_CACHE_PREFIX}${version}`;
}

function validDeployVersion(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
}

async function releaseCacheNames() {
  return (await caches.keys())
    .filter((name) => name.startsWith(RELEASE_CACHE_PREFIX))
    .sort((left, right) => right.localeCompare(left));
}

async function installReleaseCache() {
  await caches.delete(RELEASE_CACHE_NAME);
  const cache = await caches.open(RELEASE_CACHE_NAME);
  const requests = PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }));
  await cache.addAll(requests);
}

async function pruneReleaseCaches() {
  const names = await releaseCacheNames();
  const keep = new Set([RELEASE_CACHE_NAME]);
  for (const name of names) {
    if (keep.size >= MAX_RELEASE_CACHES) break;
    keep.add(name);
  }
  await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
}

async function clientDeployVersion(clientId) {
  const remembered = clientVersions.get(clientId);
  if (validDeployVersion(remembered)) return remembered;
  if (!clientId) return null;
  try {
    const client = await self.clients.get(clientId);
    const version = client ? new URL(client.url).searchParams.get('dbv') : null;
    if (validDeployVersion(version)) return version;
  } catch {
    // A client may disappear between the fetch and this lookup.
  }
  return null;
}

async function matchReleaseAsset(request, clientId) {
  const names = await releaseCacheNames();
  const preferredVersion = await clientDeployVersion(clientId);
  const ordered = [];
  if (preferredVersion) ordered.push(releaseCacheName(preferredVersion));
  ordered.push(RELEASE_CACHE_NAME, ...names);
  for (const name of [...new Set(ordered)]) {
    const cached = await caches.match(request, { cacheName: name, ignoreSearch: true });
    if (cached) return cached;
  }
  return null;
}

function isReleaseAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/darkbear/assets/')) return true;
  return PRECACHE_URLS.some((entry) => new URL(entry, self.location.origin).pathname === url.pathname);
}

async function offlineResponse() {
  const offline = await caches.match(OFFLINE_URL, {
    cacheName: RELEASE_CACHE_NAME,
    ignoreSearch: true,
  });
  return offline || new Response('DarkBear is offline.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function navigateNetworkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.status < 500) return response;
  } catch {
    // Network failure falls through to the static, non-interactive shell.
  }
  return offlineResponse();
}

self.addEventListener('install', (event) => {
  event.waitUntil(installReleaseCache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(pruneReleaseCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigateNetworkFirst(request));
    return;
  }

  const url = new URL(request.url);
  if (!isReleaseAsset(url)) return;
  event.respondWith(
    matchReleaseAsset(request, event.clientId).then((cached) => cached || fetch(request))
  );
});

// E2EE DM envelope prefix (see src/lib/e2ee/dmCipher.ts ENVELOPE_PREFIX). The
// server never holds DM plaintext, so a pushed DM `text` is the ciphertext
// envelope; the SW cannot decrypt it. Keep this in lockstep with dmCipher.ts.
const E2EE_ENVELOPE_PREFIX = 'TSUMUGI1 ';
const ENCRYPTED_BODY = 'New encrypted message';
const POLICY_DB = 'darkbear-notification-policy-v1';
const POLICY_STORE = 'policy';
const CLIENT_SCOPE_STORE = 'notification-client-scopes';
const POLICY_KEY = 'active';
const POLICY_MESSAGE = 'darkbear-notification-policy';
const ACTION_MESSAGE = 'darkbear-notification-action';
const CLIENT_SCOPE_MESSAGE = 'darkbear-notification-client-scope';
const CLIENT_SCOPE_ACK = 'darkbear-notification-client-scope-ack';
const CLIENT_SCOPE_TTL_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const notificationClientScopes = new Map();

function defaultPolicy() {
  return {
    enabled: true,
    snoozedUntil: 0,
    quietHours: { enabled: false, start: '22:00', end: '07:00', timeZone: 'system' },
    mutedTargets: [],
    temporaryMutes: {},
  };
}

function openPolicyDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(POLICY_DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(POLICY_STORE)) {
        request.result.createObjectStore(POLICY_STORE);
      }
      if (!request.result.objectStoreNames.contains(CLIENT_SCOPE_STORE)) {
        request.result.createObjectStore(CLIENT_SCOPE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readPolicy() {
  try {
    const db = await openPolicyDb();
    return await new Promise((resolve) => {
      const request = db.transaction(POLICY_STORE, 'readonly').objectStore(POLICY_STORE).get(POLICY_KEY);
      request.onsuccess = () => resolve(normalizePolicy(request.result));
      request.onerror = () => resolve(defaultPolicy());
    });
  } catch {
    return defaultPolicy();
  }
}

async function writePolicy(value) {
  try {
    const db = await openPolicyDb();
    const normalized = normalizePolicy(value);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(POLICY_STORE, 'readwrite');
      tx.objectStore(POLICY_STORE).put(normalized, POLICY_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Policy sync is best-effort; foreground policy remains authoritative.
  }
}

function validNotificationClientScope(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{32,128}$/.test(value);
}

async function persistNotificationClientScope(clientId, scope, registeredAt) {
  try {
    const db = await openPolicyDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CLIENT_SCOPE_STORE, 'readwrite');
      tx.objectStore(CLIENT_SCOPE_STORE).put({ clientId, scope, registeredAt }, clientId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // The in-memory registration still protects this worker lifetime. If the
    // worker restarts, lookup fails closed rather than guessing another tab.
  }
}

async function persistedNotificationClientScopes() {
  try {
    const db = await openPolicyDb();
    return await new Promise((resolve) => {
      const request = db.transaction(CLIENT_SCOPE_STORE, 'readonly')
        .objectStore(CLIENT_SCOPE_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function forgetNotificationClientScope(clientId) {
  notificationClientScopes.delete(clientId);
  try {
    const db = await openPolicyDb();
    await new Promise((resolve) => {
      const tx = db.transaction(CLIENT_SCOPE_STORE, 'readwrite');
      tx.objectStore(CLIENT_SCOPE_STORE).delete(clientId);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
  } catch {
    // Stale metadata is harmless: every read checks age and the live Client ID.
  }
}

async function registerNotificationClientScope(source, scope) {
  if (!source || typeof source.id !== 'string' || !isDarkBearWindowClient(source)) return false;
  if (!validNotificationClientScope(scope)) return false;
  for (const [clientId, record] of notificationClientScopes) {
    if (clientId !== source.id && record.scope === scope) return false;
  }
  const persisted = await persistedNotificationClientScopes();
  if (persisted.some((record) => record?.clientId !== source.id && record?.scope === scope)) {
    return false;
  }
  const registeredAt = Date.now();
  // A new document registers a new opaque scope; a re-registration for the
  // same WindowClient ID atomically replaces its prior scope.
  notificationClientScopes.set(source.id, { scope, registeredAt });
  await persistNotificationClientScope(source.id, scope, registeredAt);
  return true;
}

async function notificationClientForScope(scope, now = Date.now()) {
  if (!validNotificationClientScope(scope)) return null;
  let matched = null;
  for (const [clientId, record] of notificationClientScopes) {
    if (record.scope === scope) {
      matched = { clientId, ...record };
      break;
    }
  }
  if (!matched) {
    const records = await persistedNotificationClientScopes();
    const matches = records.filter((record) =>
      record && record.scope === scope && typeof record.clientId === 'string');
    // Duplicate persisted bindings are ambiguous, so never guess which tab was
    // the originator even though a cryptographic scope collision is unlikely.
    if (matches.length !== 1) return null;
    [matched] = matches;
  }
  if (!matched || !Number.isFinite(matched.registeredAt) ||
      now - matched.registeredAt < 0 || now - matched.registeredAt > CLIENT_SCOPE_TTL_MS) {
    if (matched?.clientId) await forgetNotificationClientScope(matched.clientId);
    return null;
  }
  let client = null;
  try {
    client = await self.clients.get(matched.clientId);
  } catch {
    // The document may close between notification display and click.
  }
  if (!isDarkBearWindowClient(client)) {
    await forgetNotificationClientScope(matched.clientId);
    return null;
  }
  return client;
}

function normalizeTarget(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase().slice(0, 256) : '';
}

function normalizePolicy(value) {
  const source = value && typeof value === 'object' ? value : {};
  const quiet = source.quietHours && typeof source.quietHours === 'object' ? source.quietHours : {};
  const temporaryMutes = {};
  if (source.temporaryMutes && typeof source.temporaryMutes === 'object') {
    for (const [target, until] of Object.entries(source.temporaryMutes)) {
      const normalized = normalizeTarget(target);
      if (normalized && Number.isFinite(until) && until > Date.now()) temporaryMutes[normalized] = until;
    }
  }
  return {
    enabled: source.enabled !== false,
    snoozedUntil: Number.isFinite(source.snoozedUntil) ? source.snoozedUntil : 0,
    quietHours: {
      enabled: quiet.enabled === true,
      start: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(quiet.start) ? quiet.start : '22:00',
      end: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(quiet.end) ? quiet.end : '07:00',
      timeZone: typeof quiet.timeZone === 'string' ? quiet.timeZone.slice(0, 100) : 'system',
    },
    mutedTargets: Array.isArray(source.mutedTargets)
      ? source.mutedTargets.map(normalizeTarget).filter(Boolean).slice(0, 2_000)
      : [],
    temporaryMutes,
  };
}

function zonedMinutes(now, timeZone) {
  if (timeZone === 'system') return now.getHours() * 60 + now.getMinutes();
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24;
    const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    return hours * 60 + minutes;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

function quietHoursActive(schedule, now) {
  if (!schedule.enabled) return false;
  const [startHour, startMinute] = schedule.start.split(':').map(Number);
  const [endHour, endMinute] = schedule.end.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (start === end) return false;
  const current = zonedMinutes(now, schedule.timeZone);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function policyAllows(policy, target, now = Date.now()) {
  if (!policy.enabled || policy.snoozedUntil > now) return false;
  if (quietHoursActive(policy.quietHours, new Date(now))) return false;
  const normalized = normalizeTarget(target);
  if (!normalized) return true;
  if (policy.mutedTargets.includes(normalized)) return false;
  return !(policy.temporaryMutes[normalized] > now);
}

function safeAppUrl(value) {
  try {
    const url = new URL(value || '/darkbear/', self.location.origin);
    return url.origin === self.location.origin && url.pathname.startsWith('/darkbear/')
      ? url.href
      : new URL('/darkbear/', self.location.origin).href;
  } catch {
    return new URL('/darkbear/', self.location.origin).href;
  }
}

function notificationPayload(raw) {
  let data = raw && typeof raw === 'object' ? { ...raw } : {};
  if (data.type === 'dm' && data.from) {
    const text = typeof data.text === 'string' ? data.text : '';
    const body = text.startsWith(E2EE_ENVELOPE_PREFIX) ? ENCRYPTED_BODY : text;
    data = {
      ...data,
      title: `Message from ${data.from}`,
      body,
      tag: `darkbear-dm-${data.from}`,
      url: '/darkbear/',
      target: data.target ?? data.from,
    };
  }
  return {
    title: typeof data.title === 'string' ? data.title : 'DarkBear',
    body: typeof data.body === 'string' ? data.body : '',
    tag: typeof data.tag === 'string' ? data.tag : 'darkbear-notification',
    url: safeAppUrl(data.url),
    bufferId: typeof data.bufferId === 'string' ? data.bufferId.slice(0, 256) : '',
    target: typeof data.target === 'string' ? data.target.slice(0, 256) : '',
  };
}

async function showDarkBearNotification(data) {
  const options = {
    body: data.body,
    icon: '/darkbear/favicon.svg',
    badge: '/darkbear/favicon.svg',
    tag: data.tag,
    renotify: true,
    // Server push has no page-authenticated scope. Keep it open-only and carry
    // no conversation or action-routing metadata into the notification.
    data: { url: '/darkbear/' },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Open' },
    ],
  };
  try {
    await self.registration.showNotification(data.title, options);
  } catch {
    // Some engines reject NotificationAction even when it contains only Open.
    delete options.actions;
    await self.registration.showNotification(data.title, options);
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === CLIENT_SCOPE_MESSAGE) {
    const port = event.ports?.[0];
    if (!port || typeof port.postMessage !== 'function') return;
    event.waitUntil(
      registerNotificationClientScope(event.source, event.data.scope)
        .then((ok) => port.postMessage({ type: CLIENT_SCOPE_ACK, ok }))
        .catch(() => port.postMessage({ type: CLIENT_SCOPE_ACK, ok: false }))
    );
    return;
  }
  if (event.data?.type === CLIENT_VERSION_MESSAGE) {
    const version = event.data.version;
    if (validDeployVersion(version) && event.source?.id) {
      clientVersions.set(event.source.id, version);
    }
    return;
  }
  if (event.data?.type === POLICY_MESSAGE) {
    event.waitUntil(writePolicy(event.data.policy));
  }
});

// ── Push notifications ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? '' };
  }
  event.waitUntil(
    (async () => {
      const payload = notificationPayload(data);
      const policy = await readPolicy();
      if (!policyAllows(policy, payload.target || payload.bufferId)) return;
      await showDarkBearNotification(payload);
    })()
  );
});

function isDarkBearWindowClient(client, origin = self.location.origin) {
  if (!client || typeof client.url !== 'string') return false;
  try {
    const url = new URL(client.url);
    return url.origin === origin &&
      (url.pathname === '/darkbear/' || url.pathname.startsWith('/darkbear/'));
  } catch {
    return false;
  }
}

function cleanAppUrl() {
  return new URL('/darkbear/', self.location.origin).href;
}

async function muteTargetForOneHour(target) {
  const normalized = normalizeTarget(target);
  if (!normalized) return;
  const policy = await readPolicy();
  policy.temporaryMutes[normalized] = Date.now() + ONE_HOUR_MS;
  await writePolicy(policy);
}

// ── Notification actions: deliver only to the exact registered document ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};
  const requestedAction = event.action || 'open';
  const action = ['open', 'mark-read', 'mute-1h', 'reply'].includes(requestedAction)
    ? requestedAction
    : 'open';
  const target = data.target || data.bufferId || '';
  event.waitUntil(
    (async () => {
      const client = await notificationClientForScope(data.clientScope);
      if (!client) {
        // A push notification, closed/reloaded document, expired registration,
        // or malformed scope must never be rerouted to another DarkBear tab.
        await self.clients.openWindow(cleanAppUrl());
        return;
      }
      if (action === 'mute-1h') await muteTargetForOneHour(target);
      const message = {
        type: ACTION_MESSAGE,
        action,
        bufferId: data.bufferId || undefined,
        target: data.target || undefined,
        connectionScope: data.connectionScope || undefined,
        reply: action === 'reply' && typeof event.reply === 'string' ? event.reply : undefined,
      };
      client.postMessage(message);
      if (action === 'open' || action === 'reply') {
        await client.focus();
      }
    })()
  );
});
