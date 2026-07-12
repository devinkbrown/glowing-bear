// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';

const state = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock('@/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/state')>();
  return {
    ...actual,
    connect: state.connect,
  };
});

// The modal mounts two heavy, purely-decorative scene components — ThemeBg
// (~3.7k lines of SVG/SMIL) and AstronautBear (~900 lines) — whose synchronous
// render cost balloons under parallel CPU load and can push these tests past the
// default per-test timeout, causing a false failure. They are irrelevant to what
// is verified here (Connect-button gating + the connect dispatch), so we stub
// them to keep the mount cheap and deterministic under any load.
vi.mock('@/ui/bits/ThemeBg', () => ({ default: () => null }));
vi.mock('@/ui/bits/AstronautBear', () => ({ default: () => null }));

// Generous, load-proof safety net: even if a future child grows heavy, a real
// deadline (not the 5s default) keeps a slow-but-correct render from timing out.
const RENDER_TIMEOUT_MS = 20_000;

import { resetSettings, updateRelay } from '@/state';
import ConnectModal from './ConnectModal';

function stubMatchMedia(matches = false): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  globalThis.localStorage?.clear();
  resetSettings();
  updateRelay({ host: '', password: '', port: 9001, tls: true, compression: true });
  state.connect.mockClear();
  stubMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ConnectModal', () => {
  it('keeps Connect disabled until required fields are filled', () => {
    const { getByLabelText, getByRole } = render(() => <ConnectModal open />);
    const connect = getByRole('button', { name: /^Connect$/ });

    expect(connect).toBeDisabled();

    fireEvent.input(getByLabelText('Hostname'), { target: { value: 'relay.example.test' } });
    expect(connect).toBeDisabled();

    fireEvent.input(getByLabelText('Password'), { target: { value: 'relay-secret' } });
    expect(connect).toBeEnabled();
  }, RENDER_TIMEOUT_MS);

  it('dispatches the connect intent when the ready form is submitted', () => {
    const { getByLabelText, getByRole } = render(() => <ConnectModal open />);

    fireEvent.input(getByLabelText('Hostname'), { target: { value: 'relay.example.test' } });
    fireEvent.input(getByLabelText('Password'), { target: { value: 'relay-secret' } });
    fireEvent.click(getByRole('button', { name: /^Connect$/ }));

    expect(state.connect).toHaveBeenCalledTimes(1);
  }, RENDER_TIMEOUT_MS);
});
