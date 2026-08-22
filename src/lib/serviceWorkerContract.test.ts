import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const deploySource = readFileSync(resolve(process.cwd(), 'deploy.sh'), 'utf8');
const stampSource = readFileSync(resolve(process.cwd(), 'scripts/stamp-release.mjs'), 'utf8');

interface WorkerWindowClient {
  id: string;
  url: string;
  visibilityState: 'hidden' | 'visible';
  focused: boolean;
  postMessage: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
}

interface WorkerHarness {
  clients: Map<string, WorkerWindowClient>;
  now: { value: number };
  openWindow: ReturnType<typeof vi.fn>;
  showNotification: ReturnType<typeof vi.fn>;
  registerScope: (client: WorkerWindowClient, scope: string) => Promise<unknown>;
  clickNotification: (input: {
    action?: string;
    reply?: string;
    data?: Record<string, unknown>;
  }) => Promise<void>;
  push: (data: Record<string, unknown>) => Promise<void>;
}

function workerClient(id: string, url: string, options: Partial<Pick<WorkerWindowClient, 'visibilityState' | 'focused'>> = {}): WorkerWindowClient {
  return {
    id,
    url,
    visibilityState: options.visibilityState ?? 'visible',
    focused: options.focused ?? false,
    postMessage: vi.fn(),
    navigate: vi.fn(async () => undefined),
    focus: vi.fn(async () => undefined),
  };
}

function workerHarness(
  initialClients: WorkerWindowClient[],
  indexedDB = new IDBFactory(),
): WorkerHarness {
  const listeners = new Map<string, (event: unknown) => void>();
  const clients = new Map(initialClients.map((client) => [client.id, client]));
  const now = { value: 1_700_000_000_000 };
  class WorkerDate extends Date {
    static override now(): number {
      return now.value;
    }
  }
  const openWindow = vi.fn(async () => undefined);
  const showNotification = vi.fn(async () => undefined);
  const workerSelf = {
    location: { origin: 'https://example.test' },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    clients: {
      get: vi.fn(async (id: string) => clients.get(id) ?? null),
      claim: vi.fn(),
      openWindow,
      matchAll: vi.fn(async () => [...clients.values()]),
    },
    registration: { showNotification },
    skipWaiting: vi.fn(),
  };
  runInNewContext(source, {
    self: workerSelf,
    URL,
    Map,
    Set,
    Promise,
    Date: WorkerDate,
    Intl,
    indexedDB,
  });
  const messageListener = listeners.get('message');
  const clickListener = listeners.get('notificationclick');
  const pushListener = listeners.get('push');
  if (!messageListener || !clickListener || !pushListener) {
    throw new Error('service worker did not register notification handlers');
  }

  return {
    clients,
    now,
    openWindow,
    showNotification,
    async registerScope(client, scope) {
      let completion: Promise<unknown> | undefined;
      let acknowledgement: unknown;
      messageListener({
        data: { type: 'darkbear-notification-client-scope', scope },
        source: client,
        ports: [{ postMessage: (value: unknown) => { acknowledgement = value; } }],
        waitUntil: (value: Promise<unknown>) => { completion = value; },
      });
      await completion;
      return acknowledgement;
    },
    async clickNotification(input) {
      let completion: Promise<unknown> | undefined;
      clickListener({
        action: input.action ?? '',
        reply: input.reply,
        notification: { data: input.data ?? {}, close: vi.fn() },
        waitUntil: (value: Promise<unknown>) => { completion = value; },
      });
      await completion;
    },
    async push(data) {
      let completion: Promise<unknown> | undefined;
      pushListener({
        data: { json: () => data, text: () => '' },
        waitUntil: (value: Promise<unknown>) => { completion = value; },
      });
      await completion;
    },
  };
}

describe('deploy-safe offline shell contract', () => {
  it('stamps a bounded release cache and never precaches interactive HTML', () => {
    expect(source).toContain("const RELEASE_CACHE_PREFIX = 'darkbear-release-'");
    expect(source).toContain('const MAX_RELEASE_CACHES = 4');
    expect(source).toContain("const OFFLINE_URL = '/darkbear/offline.html'");
    expect(source).toContain("const response = await fetch(request, { cache: 'no-store' })");
    expect(source).toContain('if (response.status < 500) return response;');
    expect(source).not.toMatch(/PRECACHE_JSON[^\n]*index\.html/);
    expect(stampSource).toContain("const NEVER_CACHE = new Set(['index.html', 'sw.js', 'robots.txt'])");
    expect(stampSource).toContain('singleQuotedJavaScriptString(JSON.stringify(precacheUrls))');
    expect(stampSource).not.toContain('JSON.stringify(JSON.stringify(precacheUrls))');
  });

  it('intercepts only navigations and an explicit same-origin release-asset allowlist', () => {
    expect(source).toContain("if (request.mode === 'navigate')");
    expect(source).toContain("url.pathname.startsWith('/darkbear/assets/')");
    expect(source).toContain('if (!isReleaseAsset(url)) return;');
    expect(source).toContain('await cache.addAll(requests)');
    expect(source).not.toMatch(/cache\.put\(/);
  });

  it('retains rollback caches and selects a client deploy version without purging other caches', () => {
    expect(source).toContain("const CLIENT_VERSION_MESSAGE = 'darkbear-client-version'");
    expect(source).toContain("new URL(client.url).searchParams.get('dbv')");
    expect(source).toContain('if (keep.size >= MAX_RELEASE_CACHES) break;');
    expect(source).not.toContain('purgeAllCaches');
    expect(source).not.toMatch(/caches\.keys\(\)[\s\S]{0,160}map\(\(key\)/);
  });

  it('keeps deploy identity stable without unregistering workers or clearing caches', () => {
    expect(indexSource).toContain("window.history.replaceState(window.history.state, '', url.toString())");
    expect(indexSource).not.toContain('.unregister()');
    expect(indexSource).not.toContain('caches.delete');
    expect(deploySource).toContain('node scripts/stamp-release.mjs "$STAGING" "$VERSION"');
    expect(deploySource).toContain("const DEPLOY_VERSION = '$version'");
  });

  it('binds each atomic release to source and built-artifact provenance', () => {
    expect(deploySource).toContain('SOURCE_DIGEST="$(node "$PROVENANCE" source-digest "$ROOT")"');
    expect(deploySource).toContain('source changed during build; refusing to publish mixed provenance');
    expect(deploySource).toContain('ARTIFACT_DIGEST="$(node "$PROVENANCE" digest "$STAGING")"');
    expect(deploySource).toContain('${TREE_STATE}-${ARTIFACT_DIGEST:0:12}');
    expect(deploySource).toContain('node "$PROVENANCE" write "$STAGING" "$VERSION"');
    expect(deploySource).toContain('node "$PROVENANCE" verify "$dir" "$version"');
    expect(deploySource).toContain("new URL(process.argv[1]).origin)' \"$PUBLIC_URL\"");
    expect(deploySource).toContain('new URL("release.json", base).href');
    expect(deploySource).toContain('if [[ -s "$previous_target/release.json" ]]');
    expect(deploySource).toContain('node "$PROVENANCE" verify "$previous_target" "$previous_version"');
    expect(deploySource).toContain('verify_public "$previous_version" "$previous_release"');
    expect(deploySource).toContain('verify_public "$VERSION" "$FINAL/release.json"');
  });

  it('keeps every executable inline bootstrap covered by the source CSP', () => {
    const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(indexSource)?.[1] ?? '';
    const scripts = [...indexSource.matchAll(/<script(?![^>]*src=)(?![^>]*type="text\/plain")[^>]*>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBe(2);
    for (const script of scripts) {
      const hash = createHash('sha256').update(script[1] ?? '').digest('base64');
      expect(csp).toContain(`'sha256-${hash}'`);
    }
  });
});

describe('service-worker notification contract', () => {
  it('persists DND policy and checks it before displaying Onyx Server push', () => {
    expect(source).toContain("const POLICY_DB = 'darkbear-notification-policy-v1'");
    expect(source).toContain("if (event.data?.type === POLICY_MESSAGE)");
    expect(source).toContain('if (!policyAllows(policy, payload.target || payload.bufferId)) return;');
  });

  it('delivers reply plaintext only to the exact scope among two relay tabs', async () => {
    const relayA = workerClient('relay-a', 'https://example.test/darkbear/?relay=one');
    const relayB = workerClient('relay-b', 'https://example.test/darkbear/?relay=two', { focused: true });
    const harness = workerHarness([relayA, relayB]);
    const scopeA = 'a'.repeat(48);
    const scopeB = 'b'.repeat(48);

    await expect(harness.registerScope(relayA, scopeA)).resolves.toEqual({
      type: 'darkbear-notification-client-scope-ack',
      ok: true,
    });
    await expect(harness.registerScope(relayB, scopeB)).resolves.toEqual({
      type: 'darkbear-notification-client-scope-ack',
      ok: true,
    });
    await harness.clickNotification({
      action: 'reply',
      reply: 'private reply words',
      data: {
        url: '/darkbear/',
        bufferId: 'ptr-relay-a',
        target: 'Alice',
        connectionScope: 'c'.repeat(48),
        clientScope: scopeA,
      },
    });

    expect(relayA.postMessage).toHaveBeenCalledWith({
      type: 'darkbear-notification-action',
      action: 'reply',
      bufferId: 'ptr-relay-a',
      target: 'Alice',
      connectionScope: 'c'.repeat(48),
      reply: 'private reply words',
    });
    expect(relayA.focus).toHaveBeenCalledOnce();
    expect(relayB.postMessage).not.toHaveBeenCalled();
    expect(harness.openWindow).not.toHaveBeenCalled();
  });

  it('invalidates the prior document scope when the same WindowClient re-registers', async () => {
    const client = workerClient('relay-a', 'https://example.test/darkbear/');
    const harness = workerHarness([client]);
    const staleScope = 'c'.repeat(48);
    const currentScope = 'd'.repeat(48);
    await harness.registerScope(client, staleScope);
    await harness.registerScope(client, currentScope);

    await harness.clickNotification({
      action: 'reply',
      reply: 'must not leave this event',
      data: { clientScope: staleScope, bufferId: 'ptr-old' },
    });

    expect(client.postMessage).not.toHaveBeenCalled();
    expect(harness.openWindow).toHaveBeenCalledWith('https://example.test/darkbear/');
  });

  it('fails closed to a clean app open for expired and missing clients', async () => {
    const expiredClient = workerClient('expired', 'https://example.test/darkbear/');
    const expiredHarness = workerHarness([expiredClient]);
    const expiredScope = 'e'.repeat(48);
    await expiredHarness.registerScope(expiredClient, expiredScope);
    expiredHarness.now.value += 30 * 60 * 1000 + 1;
    await expiredHarness.clickNotification({
      action: 'reply',
      reply: 'expired secret',
      data: {
        url: '/darkbear/?notificationAction=reply&notificationBuffer=ptr-old',
        clientScope: expiredScope,
        bufferId: 'ptr-old',
        target: 'Alice',
      },
    });
    expect(expiredClient.postMessage).not.toHaveBeenCalled();
    expect(expiredHarness.openWindow).toHaveBeenCalledWith('https://example.test/darkbear/');

    const closedClient = workerClient('closed', 'https://example.test/darkbear/');
    const closedHarness = workerHarness([closedClient]);
    const closedScope = 'f'.repeat(48);
    await closedHarness.registerScope(closedClient, closedScope);
    closedHarness.clients.delete(closedClient.id);
    await closedHarness.clickNotification({
      action: 'reply',
      reply: 'closed secret',
      data: { clientScope: closedScope, bufferId: 'ptr-closed' },
    });
    expect(closedClient.postMessage).not.toHaveBeenCalled();
    expect(closedHarness.openWindow).toHaveBeenCalledWith('https://example.test/darkbear/');
  });

  it('restores a verified scope after worker restart without selecting another tab', async () => {
    const indexedDB = new IDBFactory();
    const client = workerClient('relay-a', 'https://example.test/darkbear/');
    const firstWorker = workerHarness([client], indexedDB);
    const scope = 'g'.repeat(48);
    await firstWorker.registerScope(client, scope);

    const restartedWorker = workerHarness([client], indexedDB);
    await restartedWorker.clickNotification({
      action: 'mark-read',
      data: { clientScope: scope, bufferId: 'ptr-a' },
    });

    expect(client.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'mark-read',
      bufferId: 'ptr-a',
    }));
    expect(restartedWorker.openWindow).not.toHaveBeenCalled();
  });

  it('keeps unscoped server push open-only and strips routing metadata', async () => {
    const client = workerClient('relay-a', 'https://example.test/darkbear/');
    const harness = workerHarness([client]);
    await harness.push({
      title: 'Message',
      body: 'hello',
      bufferId: 'ptr-secret',
      target: 'Alice',
      clientScope: 'h'.repeat(48),
      url: '/darkbear/?notificationAction=reply&notificationBuffer=ptr-secret',
    });

    expect(harness.showNotification).toHaveBeenCalledOnce();
    const options = harness.showNotification.mock.calls[0]?.[1] as {
      actions?: Array<{ action: string }>;
      data?: Record<string, unknown>;
    };
    expect(options.actions).toEqual([{ action: 'open', title: 'Open' }]);
    expect(options.data).toEqual({ url: '/darkbear/' });
    expect(options.data).not.toHaveProperty('clientScope');

    await harness.clickNotification({ action: 'reply', reply: 'push secret', data: options.data });
    expect(client.postMessage).not.toHaveBeenCalled();
    expect(harness.openWindow).toHaveBeenCalledWith('https://example.test/darkbear/');
  });
});
