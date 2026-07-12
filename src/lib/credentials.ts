/**
 * lib/credentials.ts
 * DarkBear — login credential persistence
 *
 * Storage split (by threat model):
 *   - localStorage 'darkbear:credentials' — the account password + metadata
 *     (nick / server / savedAt / activeKey). The password is stored in plain
 *     text, the same accepted tradeoff every desktop IRC client config makes;
 *     it survives across browser restarts so auto-connect keeps working.
 *   - sessionStorage 'darkbear:tokens' — the session/mesh BEARER reclaim tokens
 *     (sessionToken / meshToken / tokenExpiry), keyed by the same credential
 *     key. These are true bearer credentials that can resume/hijack a session,
 *     so they are kept in sessionStorage: they survive a reload but are cleared
 *     when the browser session ends, bounding their lifetime.
 * The public SavedCredentials shape is unchanged — read/write transparently
 * merge and split the two stores.
 *
 * Session tokens are issued by Orochi after successful SASL auth via:
 *   NOTE SESSION TOKEN :<token>
 * Saved tokens are reused with SESSION RESUME after SASL succeeds. They are
 * not SASL mechanisms and must not replace the account password.
 *
 * On mesh deployments Orochi additionally emits:
 *   NOTE SESSION MTOKEN :<token>
 * a mesh-sealed reclaim token usable to resume the session from ANY node in the
 * mesh (server.zig handleSession TOKEN). It is longer than the 32-hex local
 * token; `SESSION RESUME <mtoken>` routes through handleMeshReclaim, which either
 * reclaims a detached session held locally or redirects to the owning node.
 *
 * When no token is present (first login or expired) the password is used
 * for SASL PLAIN / SCRAM.
 */

const KEY = 'darkbear:credentials';
const TOKEN_KEY = 'darkbear:tokens';

/**
 * Conservative default lifetime for a mesh reclaim token that arrives with no
 * explicit expiry. A cross-node bearer credential must never persist unbounded;
 * this gives it a real deadline that `purgeExpiredTokens` can act on.
 */
const MESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Absolute backstop: any bearer token whose entry carries no usable
 * `tokenExpiry` is aged out this long after `savedAt`. Fail-closed guarantee —
 * a token that cannot otherwise be aged out is not kept indefinitely.
 */
const MAX_TOKEN_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SavedCredentials {
  nick: string;
  server: string;
  /** NickServ / SASL password — only set when user opted in AND no valid token */
  password?: string;
  /** Orochi-issued session resume token (local node only) */
  sessionToken?: string;
  /** Orochi-issued mesh-sealed reclaim token (resumes from any mesh node) */
  meshToken?: string;
  /** Token validity deadline — ISO string */
  tokenExpiry?: string;
  /** When these credentials were last written */
  savedAt: string;
}

interface CredentialsStore {
  version: 2;
  activeKey?: string;
  entries: Record<string, SavedCredentials>;
}

function normalizeServer(server: string): string {
  const trimmed = server.trim();
  try {
    const url = new URL(trimmed);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed.toLowerCase().replace(/\/$/, '');
  }
}

function credentialKey(server: string, nick: string): string {
  return `${normalizeServer(server)}|${nick.trim().toLowerCase()}`;
}

function isSavedCredentials(value: unknown): value is SavedCredentials {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SavedCredentials>;
  return typeof candidate.nick === 'string'
    && candidate.nick.length > 0
    && typeof candidate.server === 'string'
    && candidate.server.length > 0;
}

/** Bearer-token fields, persisted separately from the localStorage password. */
interface TokenFields {
  sessionToken?: string;
  meshToken?: string;
  tokenExpiry?: string;
}

/**
 * Read the sessionStorage bearer-token map. Best-effort: a private-mode /
 * disabled / corrupt sessionStorage degrades to no tokens (user re-auths with
 * the password) rather than throwing.
 */
function readTokenMap(): Record<string, TokenFields> {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, TokenFields> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const t = value as Partial<TokenFields>;
      const fields: TokenFields = {};
      if (typeof t.sessionToken === 'string') fields.sessionToken = t.sessionToken;
      if (typeof t.meshToken === 'string') fields.meshToken = t.meshToken;
      if (typeof t.tokenExpiry === 'string') fields.tokenExpiry = t.tokenExpiry;
      if (fields.sessionToken || fields.meshToken) out[key] = fields;
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist the sessionStorage bearer-token map, removing the key when empty. */
function writeTokenMap(map: Record<string, TokenFields>): void {
  try {
    if (Object.keys(map).length === 0) sessionStorage.removeItem(TOKEN_KEY);
    else sessionStorage.setItem(TOKEN_KEY, JSON.stringify(map));
  } catch { /* private mode / quota — degrade to no persisted tokens */ }
}

/** Parse the localStorage credential blob (password + metadata; tokens may be
 * present inline only in a pre-split legacy blob). Returns the store plus
 * whether legacy inline tokens were seen, so the caller can migrate them out. */
function parseLocalStore(): { store: CredentialsStore; hadInlineTokens: boolean } | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as unknown;

  const hasInlineToken = (c: SavedCredentials): boolean =>
    Boolean(c.sessionToken || c.meshToken || c.tokenExpiry);

  if (
    parsed
    && typeof parsed === 'object'
    && (parsed as { version?: unknown }).version === 2
    && (parsed as { entries?: unknown }).entries
    && typeof (parsed as { entries: unknown }).entries === 'object'
  ) {
    const entries: Record<string, SavedCredentials> = {};
    let hadInlineTokens = false;
    for (const [key, value] of Object.entries((parsed as CredentialsStore).entries)) {
      if (isSavedCredentials(value)) {
        entries[key] = value;
        if (hasInlineToken(value)) hadInlineTokens = true;
      }
    }
    return {
      store: {
        version: 2,
        activeKey: typeof (parsed as CredentialsStore).activeKey === 'string'
          ? (parsed as CredentialsStore).activeKey
          : undefined,
        entries,
      },
      hadInlineTokens,
    };
  }

  // Legacy single-credential object.
  if (isSavedCredentials(parsed)) {
    const key = credentialKey(parsed.server, parsed.nick);
    return {
      store: { version: 2, activeKey: key, entries: { [key]: parsed } },
      hadInlineTokens: hasInlineToken(parsed),
    };
  }

  return null;
}

function readStore(): CredentialsStore | null {
  if (typeof window === 'undefined') return null;
  const parsed = parseLocalStore();
  if (!parsed) return null;

  const { store, hadInlineTokens } = parsed;
  const tokens = readTokenMap();
  // sessionStorage is authoritative for token fields when present; otherwise a
  // legacy inline token on the entry survives this read and is migrated below.
  for (const [key, creds] of Object.entries(store.entries)) {
    const t = tokens[key];
    if (t) {
      store.entries[key] = {
        ...creds,
        sessionToken: t.sessionToken,
        meshToken:    t.meshToken,
        tokenExpiry:  t.tokenExpiry,
      };
    }
  }

  // One-time migration: a pre-split blob carried tokens in localStorage. Writing
  // now moves them into sessionStorage and strips them from localStorage.
  if (hadInlineTokens) writeStore(store);
  return store;
}

/** Split a merged store: password + metadata → localStorage, bearer tokens →
 * sessionStorage. */
function writeStore(store: CredentialsStore): void {
  const tokenMap: Record<string, TokenFields> = {};
  const stripped: CredentialsStore = {
    version: 2,
    activeKey: store.activeKey,
    entries: {},
  };
  for (const [key, creds] of Object.entries(store.entries)) {
    const { sessionToken, meshToken, tokenExpiry, ...rest } = creds;
    stripped.entries[key] = rest;
    if (sessionToken || meshToken) tokenMap[key] = { sessionToken, meshToken, tokenExpiry };
  }
  localStorage.setItem(KEY, JSON.stringify(stripped));
  writeTokenMap(tokenMap);
}

/**
 * Effective expiry deadline (ms) for an entry's bearer token. Prefers an
 * explicit `tokenExpiry`; falls back to `savedAt + MAX_TOKEN_AGE_MS` so a token
 * with no recorded expiry still ages out. A missing/invalid timestamp yields a
 * past deadline (fail-closed: purge rather than keep an unbounded token).
 */
function tokenDeadlineMs(creds: SavedCredentials): number {
  if (creds.tokenExpiry) {
    const explicit = new Date(creds.tokenExpiry).getTime();
    if (Number.isFinite(explicit)) return explicit;
  }
  const saved = new Date(creds.savedAt).getTime();
  return (Number.isFinite(saved) ? saved : 0) + MAX_TOKEN_AGE_MS;
}

function purgeExpiredTokens(store: CredentialsStore): boolean {
  let changed = false;
  const now = Date.now();
  for (const [key, creds] of Object.entries(store.entries)) {
    if (!creds.sessionToken && !creds.meshToken) continue;
    if (now > tokenDeadlineMs(creds)) {
      store.entries[key] = {
        ...creds,
        sessionToken: undefined,
        meshToken: undefined,
        tokenExpiry: undefined,
      };
      changed = true;
    }
  }
  return changed;
}

/** Load credentials from localStorage. Returns null when nothing is saved. */
export function loadCredentials(server?: string, nick?: string): SavedCredentials | null {
  if (typeof window === 'undefined') return null;
  try {
    const store = readStore();
    if (!store) return null;
    if (purgeExpiredTokens(store)) writeStore(store);

    const key = server && nick ? credentialKey(server, nick) : store.activeKey;
    const creds = key ? store.entries[key] : Object.values(store.entries)[0];
    return creds ?? null;
  } catch {
    return null;
  }
}

/** Persist credentials. Pass password=undefined for guest sessions. */
export function saveCredentials(opts: {
  nick: string;
  server: string;
  password?: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const store: CredentialsStore = readStore() ?? { version: 2, entries: {} };
    purgeExpiredTokens(store);
    const key = credentialKey(opts.server, opts.nick);
    const existing = store.entries[key];
    const preserveToken = existing
      && normalizeServer(existing.server) === normalizeServer(opts.server)
      && existing.nick.trim().toLowerCase() === opts.nick.trim().toLowerCase()
      && existing.password === opts.password;
    const creds: SavedCredentials = {
      nick:         opts.nick,
      server:       opts.server,
      password:     opts.password,
      sessionToken: preserveToken ? existing.sessionToken : undefined,
      meshToken:    preserveToken ? existing.meshToken : undefined,
      tokenExpiry:  preserveToken ? existing.tokenExpiry : undefined,
      savedAt:      new Date().toISOString(),
    };
    store.entries[key] = creds;
    store.activeKey = key;
    writeStore(store);
    // Also keep legacy key so the nick field stays pre-filled
    localStorage.setItem('darkbear:saved-nick', opts.nick);
  } catch { /* quota */ }
}

/**
 * Store a session token received from Orochi.
 * expiresAt is a Unix timestamp (seconds).
 * canonicalNick — if provided, overwrites the stored nick with the account
 *   name so future auto-connects use the real nick, not a '_'-suffixed alias.
 */
export function storeSessionToken(token: string, expiresAt?: number, canonicalNick?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readStore();
    if (!store) return; // Only store tokens when we have base credentials
    purgeExpiredTokens(store);
    const activeKey = store.activeKey ?? Object.keys(store.entries)[0];
    if (!activeKey) return;
    const existing = store.entries[activeKey];
    if (!existing) return;
    // Preserve any existing bound (e.g. a co-resident mesh token's server
    // expiry) rather than erasing it when this call carries no expiresAt; the
    // savedAt backstop still bounds a token that never had one.
    const expiry = expiresAt
      ? new Date(expiresAt * 1000).toISOString()
      : existing.tokenExpiry;
    const nick = canonicalNick ?? existing.nick;
    const creds: SavedCredentials = {
      ...existing,
      nick,
      sessionToken: token,
      tokenExpiry:  expiry,
    };
    const nextKey = credentialKey(existing.server, nick);
    if (nextKey !== activeKey) delete store.entries[activeKey];
    store.entries[nextKey] = creds;
    store.activeKey = nextKey;
    writeStore(store);
    // Keep legacy nick key in sync
    if (canonicalNick) localStorage.setItem('darkbear:saved-nick', canonicalNick);
  } catch { /* quota */ }
}

/** Clear stored session token (e.g. after 401 / failed reuse). */
export function clearSessionToken(server?: string, nick?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readStore();
    if (!store) return;
    const key = server && nick ? credentialKey(server, nick) : store.activeKey;
    if (!key || !store.entries[key]) return;
    store.entries[key] = { ...store.entries[key], sessionToken: undefined, meshToken: undefined, tokenExpiry: undefined };
    writeStore(store);
  } catch { /* quota */ }
}

/**
 * Store a mesh-sealed reclaim token received from Orochi via
 * `NOTE SESSION MTOKEN`. Unlike the local session token, this one is usable to
 * reclaim/redirect the session from ANY node in the mesh, so it survives a
 * reconnect that lands on a different node. Persisted against the active
 * credential entry; a no-op when no base credentials exist (guest sessions).
 *
 * expiresAt is a Unix timestamp (seconds). When omitted the token is recorded
 * with a conservative default TTL — a cross-node bearer credential must never
 * persist without a bound.
 */
export function storeMeshToken(token: string, expiresAt?: number): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readStore();
    if (!store) return; // Only store tokens when we have base credentials
    purgeExpiredTokens(store);
    const activeKey = store.activeKey ?? Object.keys(store.entries)[0];
    if (!activeKey) return;
    const existing = store.entries[activeKey];
    if (!existing) return;
    const expiry = expiresAt
      ? new Date(expiresAt * 1000).toISOString()
      : existing.tokenExpiry ?? new Date(Date.now() + MESH_TOKEN_TTL_MS).toISOString();
    store.entries[activeKey] = { ...existing, meshToken: token, tokenExpiry: expiry };
    writeStore(store);
  } catch { /* quota */ }
}

/** Wipe all stored credentials (logout / forget me). */
export function clearCredentials(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('darkbear:saved-nick');
  } catch { /* ignore */ }
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

/**
 * Return the SASL secret (password) for a connect attempt, or undefined for a
 * guest/token-only session.
 *
 * The session token is intentionally NOT returned here: it is not a SASL
 * secret. It is supplied separately to IRCClient as `sessionToken` and replayed
 * via `SESSION RESUME` only after SASL has already succeeded (Orochi's SESSION
 * command requires a registered, logged-in connection).
 */
export function getAuthSecret(creds: SavedCredentials): string | undefined {
  return creds.password;
}
