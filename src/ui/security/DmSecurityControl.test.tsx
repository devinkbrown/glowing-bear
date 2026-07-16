// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toB64url } from '@/lib/e2ee/dmCipher';
import {
  _resetBridgeCrypto,
  _setBridgeCryptoScope,
  _setPeerDmKey,
} from '@/state/bridge';
import { resetSettings, updateBridge } from '@/state/settings';
import DmSecurityControl from './DmSecurityControl';

function peerKey(): string {
  const raw = new Uint8Array(65);
  raw[0] = 0x04;
  crypto.getRandomValues(raw.subarray(1));
  return toB64url(raw);
}

beforeEach(() => {
  resetSettings();
  _resetBridgeCrypto();
  _setBridgeCryptoScope(`wss://ui-${Date.now()}.example/irc\nme`);
});

afterEach(() => cleanup());

describe('DmSecurityControl', () => {
  it('never claims encryption when DM E2EE is disabled', () => {
    const { getByLabelText, getByText } = render(() => <DmSecurityControl peer="alice" />);
    expect(getByLabelText('DM security: Unprotected')).toBeInTheDocument();
    fireEvent.click(getByLabelText('DM security: Unprotected'));
    expect(getByText(/messages use the relay plaintext path/i)).toBeInTheDocument();
  });

  it('shows a comparable fingerprint and verifies it explicitly', async () => {
    updateBridge({ e2eeDms: true });
    _setPeerDmKey('alice', peerKey());
    const { findByLabelText, getByText } = render(() => <DmSecurityControl peer="alice" />);

    const trigger = await findByLabelText('DM security: Encrypted · unverified');
    fireEvent.click(trigger);
    expect(getByText('Current fingerprint').nextElementSibling?.textContent)
      .toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){15}$/);
    fireEvent.click(getByText('Mark fingerprint verified'));

    expect(await findByLabelText('DM security: Encrypted · verified')).toBeInTheDocument();
  });
});
