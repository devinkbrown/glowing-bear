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

// The modal mounts a purely-decorative AstronautBear whose synchronous
// render cost balloons under parallel CPU load and can push these tests past the
// default per-test timeout, causing a false failure. They are irrelevant to what
// is verified here (Connect-button gating + the connect dispatch), so we stub
// them to keep the mount cheap and deterministic under any load.
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
  document.documentElement.dataset.performance = 'full';
  resetSettings();
  updateRelay({ host: '', password: '', port: 9001, tls: true, compression: true });
  state.connect.mockClear();
  stubMatchMedia();
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-performance');
  vi.unstubAllGlobals();
});

describe('ConnectModal', () => {
  it('uses the compact mark and omits scene modules on the low capability tier', () => {
    document.documentElement.dataset.performance = 'low';
    const { getByTestId, queryByTestId } = render(() => <ConnectModal open />);

    expect(getByTestId('connect-compact-mark')).toBeInTheDocument();
    expect(queryByTestId('connect-decorative-background')).toBeNull();
  });

  it('exposes the typed server picker and keeps TLS documented, not fake-connectable', () => {
    const { getByTestId, getByRole, getByText } = render(() => <ConnectModal open />);
    expect(getByTestId('connect-mode-weechat')).toBeInTheDocument();
    expect(getByTestId('connect-mode-onyx-wss')).toBeInTheDocument();
    expect(getByTestId('connect-mode-onyx-tls')).toBeEnabled();
    fireEvent.click(getByTestId('connect-mode-onyx-tls'));
    expect(getByRole('button', { name: /^Connect$/ })).toBeDisabled();
    expect(getByText(/Browsers cannot open raw TLS IRC/)).toBeInTheDocument();
    expect(getByRole('button', { name: /^How do I set this up/ })).toHaveAttribute('aria-expanded', 'false');
  }, RENDER_TIMEOUT_MS);

  it('shows Onyx WSS account fields and enables Connect without a relay', () => {
    const { getByTestId, getByLabelText, getByRole } = render(() => <ConnectModal open />);
    fireEvent.click(getByTestId('connect-mode-onyx-wss'));
    expect(getByLabelText('Endpoint')).toBeInTheDocument();
    expect(getByLabelText('Account')).toBeInTheDocument();
    const connect = getByRole('button', { name: /^Connect$/ });
    expect(connect).toBeDisabled();
    fireEvent.input(getByLabelText('Account'), { target: { value: 'kain' } });
    fireEvent.input(getByLabelText('Password'), { target: { value: 'secret' } });
    expect(connect).toBeEnabled();
  }, RENDER_TIMEOUT_MS);

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
