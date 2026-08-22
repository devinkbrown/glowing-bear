/**
 * Typed WeeChat relay failure codes surfaced on the connect card.
 * Each code maps to one next action — no dump of generic "connection failed".
 */

export const RELAY_FAILURE_CODES = [
  'mixed_content',
  'tls_untrusted',
  'tls_cipher',
  'origin_denied',
  'path_404',
  'auth_rejected',
  'totp_required',
  'refused',
  'proxy_idle',
  'upgrade',
  'network',
  'unknown',
] as const;

export type RelayFailureCode = (typeof RELAY_FAILURE_CODES)[number];

export function isRelayFailureCode(value: string | null | undefined): value is RelayFailureCode {
  return Boolean(value && (RELAY_FAILURE_CODES as readonly string[]).includes(value));
}

export function classifyRelayClose(opts: {
  code: number;
  reason: string;
  hadError: boolean;
  tls: boolean;
  authenticated: boolean;
  authFailed: boolean;
  totpRequired: boolean;
}): RelayFailureCode {
  if (opts.totpRequired) return 'totp_required';
  if (opts.authFailed) return 'auth_rejected';
  if (opts.code === 1012) return 'upgrade';

  const reason = opts.reason.toLowerCase();
  if (reason.includes('totp')) return 'totp_required';
  if (reason.includes('origin')) return 'origin_denied';
  if (reason.includes('404') || reason.includes('not found')) return 'path_404';
  if (reason.includes('cipher') || reason.includes('ssl_priorities')) return 'tls_cipher';
  if (opts.tls && opts.hadError && !opts.authenticated && (
    reason.includes('cert') || reason.includes('tls') || reason.includes('ssl') || opts.code === 1015
  )) {
    return 'tls_untrusted';
  }
  if (opts.code === 1006 && !opts.authenticated) return 'refused';
  if (opts.code === 1006 && opts.authenticated) return 'proxy_idle';
  if (opts.hadError) return 'network';
  return 'unknown';
}
