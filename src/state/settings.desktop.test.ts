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

vi.mock('@/lib/desktop', () => ({
  isDesktopBuild: true,
  isDesktopRuntime: () => true,
  desktopVaultGet: vault.get,
  desktopVaultSet: vault.set,
  desktopVaultDelete: vault.delete,
}));

import {
  hydrateDesktopSettingsSecrets,
  resetSettings,
  saveSettings,
  settings,
  updateRelay,
  updateSettings,
} from './settings';

describe('desktop settings credential repository', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vault.get.mockReset();
    vault.set.mockReset().mockResolvedValue(true);
    vault.delete.mockReset().mockResolvedValue(true);
    resetSettings();
  });

  it('hydrates remembered passwords from the OS vault and never writes them to localStorage', async () => {
    updateSettings({ rememberRelayPassword: true });
    updateRelay({ password: 'legacy-session-value' });
    saveSettings();
    vault.get.mockResolvedValue(JSON.stringify({
      version: 1,
      relayPassword: 'vault-secret',
      profilePasswords: {},
    }));

    await hydrateDesktopSettingsSecrets();

    expect(settings.relay.password).toBe('vault-secret');
    const local = JSON.parse(localStorage.getItem('darkbear_settings_v2') ?? '{}') as {
      relay?: { password?: string };
    };
    expect(local.relay?.password).toBe('');
    const session = JSON.parse(sessionStorage.getItem('darkbear_settings_secrets_v1') ?? '{}') as {
      relayPassword?: string;
    };
    expect(session.relayPassword).toBe('vault-secret');
    expect(vault.set).toHaveBeenCalledWith(
      'settings-v1',
      expect.stringContaining('vault-secret'),
    );
  });
});
