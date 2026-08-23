// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';

const state = vi.hoisted(() => ({
  connect: vi.fn(),
  errorCode: null as string | null,
  error: null as string | null,
}));

vi.mock('@/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/state')>();
  return {
    ...actual,
    connect: state.connect,
    connectionErrorCode: () => state.errorCode,
    connectionError: () => state.error,
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

function stubMatchMedia(matches: boolean | ((query: string) => boolean) = false): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: typeof matches === 'function' ? matches(query) : matches,
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
  state.errorCode = null;
  state.error = null;
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
    expect(getByTestId('connect-tls-empty')).toBeInTheDocument();
    expect(getByText('Not available here')).toBeInTheDocument();
    expect(getByText(/Browsers cannot open raw TLS IRC/)).toBeInTheDocument();
    expect(getByRole('button', { name: /^How do I set this up/ })).toHaveAttribute('aria-expanded', 'false');
  }, RENDER_TIMEOUT_MS);

  it('sets a product line under the title so the card reads as a login, not a leftover form', () => {
    const { getByRole, getByTestId } = render(() => <ConnectModal open />);
    expect(getByRole('heading', { name: 'DarkBear', level: 1 })).toBeInTheDocument();
    expect(getByTestId('connect-product-line')).toHaveTextContent('IRC, in the browser.');
  }, RENDER_TIMEOUT_MS);

  it('shows Onyx WSS account fields and enables Connect without a relay', () => {
    const { getByTestId, getByLabelText, getByRole } = render(() => <ConnectModal open />);
    fireEvent.click(getByTestId('connect-mode-onyx-wss'));
    expect(getByLabelText('Endpoint')).toBeInTheDocument();
    expect(getByLabelText('Nick')).toBeInTheDocument();
    expect(getByLabelText('Account')).toBeInTheDocument();
    const connect = getByRole('button', { name: /^Connect$/ });
    expect(connect).toBeDisabled();
    fireEvent.input(getByLabelText('Nick'), { target: { value: 'kain' } });
    fireEvent.input(getByLabelText('Account'), { target: { value: 'kain' } });
    fireEvent.input(getByLabelText('Password'), { target: { value: 'secret' } });
    expect(connect).toBeEnabled();
    fireEvent.click(connect);
    expect(state.connect).toHaveBeenCalledTimes(1);
  }, RENDER_TIMEOUT_MS);

  it('keeps Connect disabled until required fields are filled', () => {
    const { getByLabelText, getByRole } = render(() => <ConnectModal open />);
    const connect = getByRole('button', { name: /^Connect$/ });

    expect(connect).toBeDisabled();
    expect(connect.className).toContain('login-cta-idle');

    fireEvent.input(getByLabelText('Hostname'), { target: { value: 'relay.example.test' } });
    expect(connect).toBeDisabled();

    fireEvent.input(getByLabelText('Password'), { target: { value: 'relay-secret' } });
    expect(connect).toBeEnabled();
    expect(connect.className).toContain('login-cta-ready');
  }, RENDER_TIMEOUT_MS);

  it('keeps the theme picker and setup drawer off the first-run card', () => {
    const { getByRole, queryByLabelText, queryByTestId } = render(() => <ConnectModal open />);
    expect(getByRole('radiogroup', { name: 'Server type' })).toBeInTheDocument();
    expect(queryByLabelText('Open settings')).toBeNull();
    expect(queryByTestId('setup-drawer')).toBeNull();
  }, RENDER_TIMEOUT_MS);

  it('shows Onyx TOTP and account remember copy, not WeeChat TOTP, on first-party Onyx', () => {
    const { getByTestId, getByText, queryByText } = render(() => <ConnectModal open />);
    fireEvent.click(getByTestId('connect-mode-onyx-wss'));
    expect(getByText('Onyx TOTP (IDENTIFY)')).toBeInTheDocument();
    expect(getByText('Remember account password on this device')).toBeInTheDocument();
    expect(queryByText('WeeChat TOTP')).toBeNull();
    expect(queryByText('Remember extras password on this device')).toBeNull();
  }, RENDER_TIMEOUT_MS);

  it('dispatches the connect intent when the ready form is submitted', () => {
    const { getByLabelText, getByRole } = render(() => <ConnectModal open />);

    fireEvent.input(getByLabelText('Hostname'), { target: { value: 'relay.example.test' } });
    fireEvent.input(getByLabelText('Password'), { target: { value: 'relay-secret' } });
    fireEvent.click(getByRole('button', { name: /^Connect$/ }));

    expect(state.connect).toHaveBeenCalledTimes(1);
  }, RENDER_TIMEOUT_MS);

  it('uses the compact mark on a short viewport so the mascot never crowds the password', () => {
    stubMatchMedia((query) => query.includes('max-height'));
    const { getByTestId, getByLabelText } = render(() => <ConnectModal open />);

    expect(getByTestId('connect-compact-mark')).toBeInTheDocument();
    expect(getByLabelText('Password')).toBeInTheDocument();
  }, RENDER_TIMEOUT_MS);

  it('submits a ready WeeChat form with Ctrl+Enter', () => {
    const { getByLabelText } = render(() => <ConnectModal open />);

    fireEvent.input(getByLabelText('Hostname'), { target: { value: 'relay.example.test' } });
    fireEvent.input(getByLabelText('Password'), { target: { value: 'relay-secret' } });
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

    expect(state.connect).toHaveBeenCalledTimes(1);
  }, RENDER_TIMEOUT_MS);

  it('shows only the selected mode hint under the segmented picker', () => {
    const { getByTestId, queryByText } = render(() => <ConnectModal open />);
    expect(getByTestId('connect-mode-hint')).toHaveTextContent('Your WeeChat, in the browser.');
    expect(queryByText('First-party Onyx: one socket for chat and media.')).toBeNull();

    fireEvent.click(getByTestId('connect-mode-onyx-wss'));
    expect(getByTestId('connect-mode-hint')).toHaveTextContent('First-party Onyx: one socket for chat and media.');
    expect(queryByText('Your WeeChat, in the browser.')).toBeNull();
    expect(getByTestId('connect-mode-weechat')).toHaveAttribute('aria-checked', 'false');
    expect(getByTestId('connect-mode-onyx-wss')).toHaveAttribute('aria-checked', 'true');
  }, RENDER_TIMEOUT_MS);

  it('keeps TLS as a quiet pressed toggle, not a second primary CTA', () => {
    const { getByRole } = render(() => <ConnectModal open />);
    const tls = getByRole('button', { name: 'TLS' });
    expect(tls).toHaveAttribute('aria-pressed', 'true');
    expect(tls.className).toContain('login-tls-on');
    expect(tls.className).not.toMatch(/emerald/);
  }, RENDER_TIMEOUT_MS);

  it('designs totp, path, origin, and mixed-content as titled attention states', () => {
    state.errorCode = 'totp_required';
    state.error = 'This relay requires a TOTP code.';
    const totp = render(() => <ConnectModal open />);
    expect(totp.getByTestId('connect-alert-title')).toHaveTextContent('One-time password');
    expect(totp.getByTestId('connect-totp-panel')).toHaveClass('login-totp-attention');
    totp.unmount();

    state.errorCode = 'path_404';
    state.error = 'No WebSocket at this path.';
    const path = render(() => <ConnectModal open />);
    expect(path.getByTestId('connect-alert-title')).toHaveTextContent('Wrong path');
    expect(path.getByTestId('connect-path-attention')).toHaveAttribute('id', 'c-path');
    path.unmount();

    state.errorCode = 'origin_denied';
    state.error = 'The relay rejected this page origin.';
    const origin = render(() => <ConnectModal open />);
    expect(origin.getByTestId('connect-alert-title')).toHaveTextContent('Origin blocked');
    expect(origin.getByTestId('connect-origin-attention')).toBeInTheDocument();
    origin.unmount();

    state.errorCode = 'mixed_content';
    state.error = 'This HTTPS page cannot open an unencrypted remote WebSocket.';
    const mixed = render(() => <ConnectModal open />);
    expect(mixed.getByTestId('connect-alert-title')).toHaveTextContent('Needs TLS');
    expect(mixed.getByTestId('connect-tls-attention')).toBeInTheDocument();
  }, RENDER_TIMEOUT_MS);
});
