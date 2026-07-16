// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { updateBridge, updateRelay, updateSettings } from '@/state/settings';
import { recordDiagnosticEvent, resetDiagnosticEvents } from './diagnosticsEvents';
import {
  assetVersion,
  buildSupportBundle,
  diagnosticErrorCode,
  diagnosticErrorId,
  exportSupportBundle,
} from './diagnostics';

describe('support diagnostics', () => {
  beforeEach(() => {
    resetDiagnosticEvents();
    document.body.innerHTML = '<script type="text/plain" id="db-asset-version">var v = \'test-build\'</script>';
  });

  it('reads the non-secret deploy version and emits bounded state events', () => {
    for (let i = 0; i < 100; i++) recordDiagnosticEvent('relay-state', `state-${i}`);
    const bundle = buildSupportBundle();
    expect(assetVersion()).toBe('test-build');
    expect(bundle.events).toHaveLength(80);
    expect(bundle.events.at(-1)?.value).toBe('state-99');
    expect(bundle.schemaVersion).toBe(2);
    expect(bundle.relay.phase).toBe('idle');
    expect(bundle.relay.protocolMode).toBe('none');
  });

  it('cannot export settings, passwords, tokens, messages, or endpoints', () => {
    updateSettings({ rememberRelayPassword: true, rememberBridgePassword: true });
    updateRelay({ host: 'private-relay.example', password: 'relay-secret' });
    updateBridge({ wsUrl: 'wss://private-bridge.example', account: 'private-account', password: 'bridge-secret' });
    const json = exportSupportBundle();

    expect(json).not.toContain('relay-secret');
    expect(json).not.toContain('bridge-secret');
    expect(json).not.toContain('private-relay.example');
    expect(json).not.toContain('private-bridge.example');
    expect(json).not.toContain('private-account');
  });

  it('classifies errors without exporting their potentially sensitive text', () => {
    expect(diagnosticErrorCode('Authentication failed for private-user')).toBe('authentication');
    expect(diagnosticErrorCode('TLS certificate rejected')).toBe('tls');
    expect(diagnosticErrorCode('Relay parse error at secret-host')).toBe('protocol');
    expect(diagnosticErrorCode('NotAllowedError: microphone permission denied')).toBe('permission');
    expect(diagnosticErrorCode(null)).toBe('none');
    expect(diagnosticErrorId('relay', 'authentication')).toBe('DB-RLY-AUTH');
    expect(diagnosticErrorId('bridge', 'network')).toBe('DB-BRG-NET');
    expect(diagnosticErrorId('media', 'permission')).toBe('DB-MED-PERM');
    expect(diagnosticErrorId('relay', 'none')).toBe('none');
  });
});
