import { describe, expect, it } from 'vitest';
import { classifyRelayClose } from './relayErrors';

const base = {
  code: 1006,
  reason: '',
  hadError: false,
  tls: true,
  authenticated: false,
  authFailed: false,
  totpRequired: false,
};

describe('classifyRelayClose', () => {
  it('returns totp_required when the relay asked for TOTP', () => {
    expect(classifyRelayClose({ ...base, totpRequired: true })).toBe('totp_required');
    expect(classifyRelayClose({ ...base, reason: 'totp required' })).toBe('totp_required');
  });

  it('returns origin_denied from an origin close reason', () => {
    expect(classifyRelayClose({ ...base, reason: 'origin not allowed' })).toBe('origin_denied');
  });

  it('returns path_404 from a missing-path close reason', () => {
    expect(classifyRelayClose({ ...base, reason: '404 not found' })).toBe('path_404');
  });

  it('does not treat mixed_content as a socket close code', () => {
    expect(classifyRelayClose(base)).not.toBe('mixed_content');
  });
});
