/**
 * Map a typed connect failure to one form reveal. The connect card already
 * shows the error + a single next action; this opens the field the user
 * needs to change.
 */

import type { RelayFailureCode } from '@/lib/weechat/relayErrors';

export type DiagnoseReveal = 'totp' | 'advanced' | 'tls' | null;
export type FieldAttention = 'totp' | 'path' | 'origin' | 'tls' | null;

export function diagnoseReveal(code: RelayFailureCode | null | undefined): DiagnoseReveal {
  if (code === 'totp_required') return 'totp';
  if (code === 'path_404' || code === 'origin_denied') return 'advanced';
  if (code === 'mixed_content') return 'tls';
  return null;
}

/** Which control to light up for a typed failure. */
export function fieldAttention(code: RelayFailureCode | null | undefined): FieldAttention {
  if (code === 'totp_required') return 'totp';
  if (code === 'path_404') return 'path';
  if (code === 'origin_denied') return 'origin';
  if (code === 'mixed_content') return 'tls';
  return null;
}
