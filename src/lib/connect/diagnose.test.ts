import { describe, expect, it } from 'vitest';
import { diagnoseReveal, fieldAttention } from './diagnose';

describe('diagnoseReveal', () => {
  it('opens TOTP for totp_required', () => {
    expect(diagnoseReveal('totp_required')).toBe('totp');
  });

  it('opens Advanced for path and origin failures', () => {
    expect(diagnoseReveal('path_404')).toBe('advanced');
    expect(diagnoseReveal('origin_denied')).toBe('advanced');
  });

  it('points mixed_content at the TLS toggle', () => {
    expect(diagnoseReveal('mixed_content')).toBe('tls');
  });

  it('leaves the form closed for other codes', () => {
    expect(diagnoseReveal('auth_rejected')).toBeNull();
    expect(diagnoseReveal(null)).toBeNull();
  });
});

describe('fieldAttention', () => {
  it('maps typed failures onto one designed control', () => {
    expect(fieldAttention('totp_required')).toBe('totp');
    expect(fieldAttention('path_404')).toBe('path');
    expect(fieldAttention('origin_denied')).toBe('origin');
    expect(fieldAttention('mixed_content')).toBe('tls');
    expect(fieldAttention('auth_rejected')).toBeNull();
  });
});
