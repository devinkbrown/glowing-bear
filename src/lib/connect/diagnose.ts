/**
 * Map a typed connect failure to one form reveal. The connect card already
 * shows the error + a single next action; this opens the field the user
 * needs to change.
 */

import type { RelayFailureCode } from '@/lib/weechat/relayErrors';

export type DiagnoseReveal = 'totp' | 'advanced' | 'tls' | null;

export function diagnoseReveal(code: RelayFailureCode | null | undefined): DiagnoseReveal {
  if (code === 'totp_required') return 'totp';
  if (code === 'path_404' || code === 'origin_denied') return 'advanced';
  if (code === 'mixed_content') return 'tls';
  return null;
}
