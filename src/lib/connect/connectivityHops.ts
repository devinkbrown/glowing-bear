/**
 * Header connectivity chips. Kind A is relay-only, B is relay + extras,
 * C is a single first-party Onyx session (never labeled Relay).
 */

import type { SessionKind } from './sessionKind';

export type HopChipId = 'relay' | 'extras' | 'session';

export type HopsLabelKey =
  | 'connectivity.hops'
  | 'connectivity.hopsRelay'
  | 'connectivity.hopsSession';

export interface HopModel {
  show: boolean;
  chips: HopChipId[];
  hopsLabelKey: HopsLabelKey;
}

export function connectivityHops(
  kind: SessionKind,
  opts: { connected: boolean; extrasEnabled: boolean; extrasStatus: string },
): HopModel {
  if (kind === 'onyx-direct-wss') {
    return {
      show: opts.connected,
      chips: ['session'],
      hopsLabelKey: 'connectivity.hopsSession',
    };
  }
  if (kind === 'weechat-onyx') {
    const extrasVisible = opts.extrasEnabled || opts.extrasStatus !== 'off';
    return {
      show: opts.connected || extrasVisible,
      chips: ['relay', 'extras'],
      hopsLabelKey: 'connectivity.hops',
    };
  }
  return {
    show: opts.connected,
    chips: ['relay'],
    hopsLabelKey: 'connectivity.hopsRelay',
  };
}

/** Kind C is always WSS, so the padlock is shown even when relay.tls is false. */
export function showTlsPadlock(kind: SessionKind, relayTls: boolean): boolean {
  return kind === 'onyx-direct-wss' || relayTls;
}
