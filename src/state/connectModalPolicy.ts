// The connect modal follows the relay connection state:
//   • once CONNECTED, close it if it is the open modal (so the app is usable)
//   • once DISCONNECTED, open it if nothing else is open (so the user can retry)
//   • otherwise (CONNECTING / AUTHENTICATING / RECONNECTING / ERROR) leave the
//     modal as-is — the ConnectModal shows its own progress state.
//
// A regression here (dropping the CONNECTED→close case) leaves the modal
// covering the whole app after a successful connect, which reads as
// "the connect dialog doesn't work". App.tsx drives this in a createEffect.

import { ConnectionState } from '@/lib/weechat/model';
import type { ModalType } from '@/types';

export type ConnectModalAction = 'open' | 'close' | 'none';

export interface ConnectModalPolicyOptions {
  /** First-party Onyx WSS reached 001 without a WeeChat relay. */
  firstPartyReady?: boolean;
  /** First-party Onyx WSS is dialing — keep the connect card visible. */
  firstPartyConnecting?: boolean;
}

export function connectModalAction(
  state: ConnectionState,
  activeModal: ModalType,
  opts: ConnectModalPolicyOptions = {},
): ConnectModalAction {
  if (state === ConnectionState.CONNECTED || opts.firstPartyReady) {
    return activeModal === 'connect' ? 'close' : 'none';
  }
  if (opts.firstPartyConnecting) return 'none';
  if (state === ConnectionState.DISCONNECTED) {
    return activeModal === null ? 'open' : 'none';
  }
  return 'none';
}
