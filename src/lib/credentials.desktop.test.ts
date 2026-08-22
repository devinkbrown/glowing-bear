import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const makeStorage = (): Storage => {
    const backing = new Map<string, string>();
    return {
      get length() { return backing.size; },
      clear: () => { backing.clear(); },
      getItem: (key: string) => backing.get(key) ?? null,
      key: (index: number) => [...backing.keys()][index] ?? null,
      removeItem: (key: string) => { backing.delete(key); },
      setItem: (key: string, value: string) => { backing.set(key, String(value)); },
    } satisfies Storage;
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeStorage(), configurable: true, writable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: makeStorage(), configurable: true, writable: true,
  });
});

const vault = vi.hoisted(() => ({
  get: vi.fn<() => Promise<string | null>>(),
  set: vi.fn<() => Promise<boolean>>(),
  delete: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('./desktop', () => ({
  isDesktopBuild: true,
  isDesktopRuntime: () => true,
  desktopVaultGet: vault.get,
  desktopVaultSet: vault.set,
  desktopVaultDelete: vault.delete,
}));

import {
  hydrateDesktopCredentialPasswords,
  loadCredentials,
  saveCredentials,
} from './credentials';

describe('desktop Onyx Server credential repository', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vault.get.mockReset();
    vault.set.mockReset().mockResolvedValue(true);
    vault.delete.mockReset().mockResolvedValue(true);
  });

  it('merges OS-vault passwords while keeping localStorage secret-free', async () => {
    localStorage.setItem('darkbear:credentials', JSON.stringify({
      version: 2,
      activeKey: 'wss://onyx.example|kain',
      entries: {
        'wss://onyx.example|kain': {
          nick: 'kain',
          server: 'wss://onyx.example',
          rememberPassword: true,
          savedAt: '2026-07-16T00:00:00.000Z',
        },
      },
    }));
    vault.get.mockResolvedValue(JSON.stringify({
      version: 1,
      passwords: { 'wss://onyx.example|kain': 'vault-secret' },
    }));

    await hydrateDesktopCredentialPasswords();

    expect(loadCredentials('wss://onyx.example', 'kain')?.password).toBe('vault-secret');
    const local = JSON.parse(localStorage.getItem('darkbear:credentials') ?? '{}') as {
      entries?: Record<string, { password?: string }>;
    };
    expect(local.entries?.['wss://onyx.example|kain']?.password).toBeUndefined();
    const session = JSON.parse(sessionStorage.getItem('darkbear:tokens') ?? '{}') as
      Record<string, { password?: string }>;
    expect(session['wss://onyx.example|kain']?.password).toBe('vault-secret');
    expect(vault.set).toHaveBeenCalledWith(
      'credentials-v1',
      expect.stringContaining('vault-secret'),
    );

    saveCredentials({
      nick: 'kain',
      server: 'wss://onyx.example',
      password: 'replacement',
      rememberPassword: true,
    });
    expect(loadCredentials('wss://onyx.example', 'kain')?.password).toBe('replacement');
  });
});
