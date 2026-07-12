/**
 * lib/credentials.test.ts
 *
 * Covers the two audit fixes plus regression of the existing contract:
 *  - MEDIUM: a mesh reclaim token must never persist without a bound
 *    (conservative TTL + savedAt age-out).
 *  - LOW: bearer tokens (session/mesh) live in sessionStorage, never
 *    localStorage; the password stays in localStorage (desktop-IRC parity).
 *  - Migration: a legacy localStorage blob with inline tokens is safely
 *    migrated — tokens moved to sessionStorage, stripped from localStorage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Node 22+ defines an experimental localStorage/sessionStorage global that is
// undefined without a backing file and shadows any jsdom implementation.
// Install working in-memory Storage objects before the module under test loads.
vi.hoisted(() => {
  const makeStorage = (): Storage => {
    const backing = new Map<string, string>();
    return {
      get length() { return backing.size; },
      clear: () => { backing.clear(); },
      getItem: (k: string) => backing.get(k) ?? null,
      key: (i: number) => [...backing.keys()][i] ?? null,
      removeItem: (k: string) => { backing.delete(k); },
      setItem: (k: string, v: string) => { backing.set(k, String(v)); },
    } satisfies Storage;
  };
  Object.defineProperty(globalThis, 'localStorage', { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: makeStorage(), configurable: true, writable: true });
});

import {
  clearCredentials,
  clearSessionToken,
  getAuthSecret,
  loadCredentials,
  saveCredentials,
  storeMeshToken,
  storeSessionToken,
} from './credentials';

const LS_KEY = 'darkbear:credentials';
const SS_KEY = 'darkbear:tokens';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function lsBlob(): string {
  return localStorage.getItem(LS_KEY) ?? '';
}

describe('credentials — bearer tokens live in sessionStorage, password in localStorage', () => {
  it('keeps the password in localStorage and out of sessionStorage', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });

    expect(lsBlob()).toContain('hunter2');
    expect(sessionStorage.getItem(SS_KEY) ?? '').not.toContain('hunter2');
  });

  it('stores the session token in sessionStorage, never localStorage', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeSessionToken('sess-abc123', Math.floor(Date.now() / 1000) + 3600);

    expect(lsBlob()).not.toContain('sess-abc123');
    expect(sessionStorage.getItem(SS_KEY) ?? '').toContain('sess-abc123');

    // and it round-trips back through loadCredentials
    expect(loadCredentials('wss://irc.example/', 'kain')?.sessionToken).toBe('sess-abc123');
  });

  it('stores the mesh token in sessionStorage, never localStorage', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeMeshToken('mesh-XYZ789');

    expect(lsBlob()).not.toContain('mesh-XYZ789');
    expect(sessionStorage.getItem(SS_KEY) ?? '').toContain('mesh-XYZ789');
    expect(loadCredentials('wss://irc.example/', 'kain')?.meshToken).toBe('mesh-XYZ789');
  });

  it('getAuthSecret returns only the password, never a token (regression)', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeSessionToken('sess-abc123');
    storeMeshToken('mesh-XYZ789');
    const creds = loadCredentials('wss://irc.example/', 'kain');
    expect(creds).not.toBeNull();
    expect(getAuthSecret(creds!)).toBe('hunter2');
  });
});

describe('credentials — mesh token cannot linger without a bound (MEDIUM)', () => {
  it('records a conservative tokenExpiry for a mesh token that arrives without one', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeMeshToken('mesh-XYZ789');

    const creds = loadCredentials('wss://irc.example/', 'kain');
    expect(creds?.meshToken).toBe('mesh-XYZ789');
    expect(creds?.tokenExpiry).toBeTruthy();
    // The recorded expiry is in the future (a real deadline, not the epoch).
    expect(new Date(creds!.tokenExpiry!).getTime()).toBeGreaterThan(Date.now());
  });

  it('honors an explicit expiresAt for the mesh token when supplied', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    const exp = Math.floor(Date.now() / 1000) + 120;
    storeMeshToken('mesh-XYZ789', exp);

    const creds = loadCredentials('wss://irc.example/', 'kain');
    expect(new Date(creds!.tokenExpiry!).getTime()).toBe(exp * 1000);
  });

  it('purges a mesh token once its conservative TTL has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeMeshToken('mesh-XYZ789');

    // Jump a year forward — well past any conservative reclaim-token TTL.
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
    const creds = loadCredentials('wss://irc.example/', 'kain');
    expect(creds?.meshToken).toBeUndefined();
    expect(creds?.password).toBe('hunter2'); // password survives the token purge
    expect(sessionStorage.getItem(SS_KEY) ?? '').not.toContain('mesh-XYZ789');
  });

  it('ages out an expiry-less token (e.g. a session token stored without TTL) via savedAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeSessionToken('sess-abc123'); // no expiresAt — mirrors the live bridge call

    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
    const creds = loadCredentials('wss://irc.example/', 'kain');
    expect(creds?.sessionToken).toBeUndefined();
  });

  it('does not purge a fresh token before its bound', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeMeshToken('mesh-XYZ789');

    vi.setSystemTime(new Date('2026-01-01T01:00:00Z')); // one hour later
    expect(loadCredentials('wss://irc.example/', 'kain')?.meshToken).toBe('mesh-XYZ789');
  });
});

describe('credentials — legacy inline-token migration', () => {
  it('migrates a legacy localStorage blob with inline tokens into sessionStorage', () => {
    // Simulate the pre-fix on-disk shape: tokens stored inline in localStorage.
    const legacy = {
      version: 2,
      activeKey: 'wss://irc.example|kain',
      entries: {
        'wss://irc.example|kain': {
          nick: 'kain',
          server: 'wss://irc.example/',
          password: 'hunter2',
          sessionToken: 'legacy-sess',
          meshToken: 'legacy-mesh',
          tokenExpiry: new Date(Date.now() + 3_600_000).toISOString(),
          savedAt: new Date().toISOString(),
        },
      },
    };
    localStorage.setItem(LS_KEY, JSON.stringify(legacy));

    const creds = loadCredentials('wss://irc.example/', 'kain');
    // Tokens still usable after migration…
    expect(creds?.sessionToken).toBe('legacy-sess');
    expect(creds?.meshToken).toBe('legacy-mesh');
    // …but now stripped from localStorage and moved to sessionStorage.
    expect(lsBlob()).not.toContain('legacy-sess');
    expect(lsBlob()).not.toContain('legacy-mesh');
    expect(sessionStorage.getItem(SS_KEY) ?? '').toContain('legacy-sess');
    expect(sessionStorage.getItem(SS_KEY) ?? '').toContain('legacy-mesh');
    // Password stays put.
    expect(lsBlob()).toContain('hunter2');
  });
});

describe('credentials — clear paths', () => {
  it('clearCredentials wipes both localStorage and the sessionStorage tokens', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeMeshToken('mesh-XYZ789');
    expect(sessionStorage.getItem(SS_KEY)).not.toBeNull();

    clearCredentials();
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(sessionStorage.getItem(SS_KEY)).toBeNull();
  });

  it('clearSessionToken drops the bearer tokens but keeps the password', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeSessionToken('sess-abc123');
    storeMeshToken('mesh-XYZ789');

    clearSessionToken('wss://irc.example/', 'kain');
    const creds = loadCredentials('wss://irc.example/', 'kain');
    expect(creds?.sessionToken).toBeUndefined();
    expect(creds?.meshToken).toBeUndefined();
    expect(creds?.password).toBe('hunter2');
    expect(sessionStorage.getItem(SS_KEY) ?? '').not.toContain('sess-abc123');
  });
});

describe('credentials — fail-closed / degradation branches', () => {
  it('does not throw and yields no tokens when sessionStorage throws (private mode)', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    const boom = () => { throw new Error('SecurityError'); };
    const orig = { getItem: sessionStorage.getItem, setItem: sessionStorage.setItem, removeItem: sessionStorage.removeItem };
    sessionStorage.getItem = boom as unknown as Storage['getItem'];
    sessionStorage.setItem = boom as unknown as Storage['setItem'];
    sessionStorage.removeItem = boom as unknown as Storage['removeItem'];
    try {
      expect(() => storeMeshToken('mesh-XYZ789')).not.toThrow();
      const creds = loadCredentials('wss://irc.example/', 'kain');
      expect(creds?.password).toBe('hunter2'); // password still usable → re-auth path
      expect(creds?.meshToken).toBeUndefined(); // token could not be read/persisted
    } finally {
      Object.assign(sessionStorage, orig);
    }
  });

  it('returns null on a corrupt localStorage blob rather than throwing', () => {
    localStorage.setItem(LS_KEY, '{not valid json');
    expect(loadCredentials('wss://irc.example/', 'kain')).toBeNull();
  });

  it('purges a token whose entry has neither tokenExpiry nor a valid savedAt', () => {
    // Hand-craft a legacy blob with an inline token, no expiry, no savedAt.
    localStorage.setItem(LS_KEY, JSON.stringify({
      version: 2,
      activeKey: 'wss://irc.example|kain',
      entries: {
        'wss://irc.example|kain': {
          nick: 'kain',
          server: 'wss://irc.example/',
          password: 'hunter2',
          meshToken: 'unbounded-token',
          savedAt: 'not-a-date',
        },
      },
    }));
    const creds = loadCredentials('wss://irc.example/', 'kain');
    expect(creds?.meshToken).toBeUndefined(); // fail-closed: no valid bound ⇒ purge
    expect(creds?.password).toBe('hunter2');
  });
});

describe('credentials — token store precedence', () => {
  it('sessionStorage tokens are authoritative over a stale inline localStorage token', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({
      version: 2,
      activeKey: 'wss://irc.example|kain',
      entries: {
        'wss://irc.example|kain': {
          nick: 'kain',
          server: 'wss://irc.example/',
          password: 'hunter2',
          meshToken: 'stale-inline',
          tokenExpiry: new Date(Date.now() + 3_600_000).toISOString(),
          savedAt: new Date().toISOString(),
        },
      },
    }));
    sessionStorage.setItem(SS_KEY, JSON.stringify({
      'wss://irc.example|kain': {
        meshToken: 'fresh-session',
        tokenExpiry: new Date(Date.now() + 3_600_000).toISOString(),
      },
    }));
    expect(loadCredentials('wss://irc.example/', 'kain')?.meshToken).toBe('fresh-session');
  });
});

describe('credentials — storeSessionToken preserves a co-resident bound', () => {
  it('does not erase an existing mesh-token expiry when called without expiresAt', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    const exp = Math.floor(Date.now() / 1000) + 120;
    storeMeshToken('mesh-XYZ789', exp);
    storeSessionToken('sess-abc123'); // no expiresAt

    const creds = loadCredentials('wss://irc.example/', 'kain');
    expect(creds?.sessionToken).toBe('sess-abc123');
    expect(creds?.meshToken).toBe('mesh-XYZ789');
    expect(new Date(creds!.tokenExpiry!).getTime()).toBe(exp * 1000); // preserved, not wiped
  });
});

describe('credentials — save preserves an existing token across a same-password rewrite', () => {
  it('keeps the mesh token when saveCredentials re-runs with the same password', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeMeshToken('mesh-XYZ789');
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });

    expect(loadCredentials('wss://irc.example/', 'kain')?.meshToken).toBe('mesh-XYZ789');
  });

  it('drops the token when the password changes', () => {
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'hunter2' });
    storeMeshToken('mesh-XYZ789');
    saveCredentials({ nick: 'kain', server: 'wss://irc.example/', password: 'different' });

    expect(loadCredentials('wss://irc.example/', 'kain')?.meshToken).toBeUndefined();
  });
});
