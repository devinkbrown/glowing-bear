import { bridgeState } from '@/state/bridge';
import { connectionError, connectionState, lag, relayDiagnostics } from '@/state/connection';
import { mediaState } from '@/state/media';
import { snapshotDrops } from '@/lib/suimyaku-media/mediaDropCounter';
import { snapshotDiagnosticEvents } from '@/lib/diagnosticsEvents';

export interface SupportBundle {
  schemaVersion: 2;
  generatedAt: string;
  app: {
    assetVersion: string;
    path: string;
    userAgent: string;
    online: boolean;
  };
  relay: {
    state: string;
    hasError: boolean;
    errorCode: DiagnosticErrorCode;
    errorId: DiagnosticErrorId;
    lagMs: number;
    phase: string;
    protocolMode: string;
    authMode: string;
    serverVersion: string;
    compression: string;
    hashAlgorithm: string;
    totp: boolean;
    handshake: string;
    canDecodeCompression: boolean;
    reconnectReason: string;
    reconnectAttempt: number;
    reconnectDelayMs: number;
  };
  bridge: {
    status: string;
    hasError: boolean;
    errorCode: DiagnosticErrorCode;
    errorId: DiagnosticErrorId;
    e2eeReady: boolean;
  };
  media: {
    available: boolean;
    callState: string;
    kind: string;
    peerCount: number;
    cameraOn: boolean;
    screenSharing: boolean;
    hasError: boolean;
    errorCode: DiagnosticErrorCode;
    errorId: DiagnosticErrorId;
    health: {
      status: string;
      tier: number;
      suggestedBps: number;
      jitterMs: number;
      lossRate: number;
      roundTripMs: number;
      encodePressure: number;
      reconnectAttempt: number;
    };
    runtime: {
      webAssembly: boolean;
      mediaDevices: boolean;
      audioWorklet: boolean;
      videoWorker: boolean;
    };
  };
  serviceWorker: {
    supported: boolean;
    controlled: boolean;
  };
  mediaDrops: Record<string, number>;
  events: ReturnType<typeof snapshotDiagnosticEvents>;
}

export type DiagnosticErrorCode =
  | 'none'
  | 'authentication'
  | 'tls'
  | 'network'
  | 'protocol'
  | 'permission'
  | 'unknown';

export type DiagnosticScope = 'relay' | 'bridge' | 'media';
export type DiagnosticErrorId =
  | 'none'
  | `DB-RLY-${'AUTH' | 'TLS' | 'NET' | 'PROTO' | 'PERM' | 'UNKNOWN'}`
  | `DB-BRG-${'AUTH' | 'TLS' | 'NET' | 'PROTO' | 'PERM' | 'UNKNOWN'}`
  | `DB-MED-${'AUTH' | 'TLS' | 'NET' | 'PROTO' | 'PERM' | 'UNKNOWN'}`;

export function diagnosticErrorCode(error: string | null): DiagnosticErrorCode {
  if (!error) return 'none';
  const value = error.toLowerCase();
  if (
    value.includes('permission') ||
    value.includes('notallowed') ||
    value.includes('denied') ||
    value.includes('media devices unavailable')
  ) return 'permission';
  if (value.includes('auth') || value.includes('password') || value.includes('sasl')) return 'authentication';
  if (value.includes('tls') || value.includes('certificate')) return 'tls';
  if (value.includes('parse') || value.includes('malformed') || value.includes('protocol')) return 'protocol';
  if (value.includes('connect') || value.includes('network') || value.includes('socket')) return 'network';
  return 'unknown';
}

const ERROR_SUFFIX: Record<Exclude<DiagnosticErrorCode, 'none'>, string> = {
  authentication: 'AUTH',
  tls: 'TLS',
  network: 'NET',
  protocol: 'PROTO',
  permission: 'PERM',
  unknown: 'UNKNOWN',
};

const SCOPE_PREFIX: Record<DiagnosticScope, string> = {
  relay: 'RLY',
  bridge: 'BRG',
  media: 'MED',
};

export function diagnosticErrorId(
  scope: DiagnosticScope,
  code: DiagnosticErrorCode,
): DiagnosticErrorId {
  if (code === 'none') return 'none';
  return `DB-${SCOPE_PREFIX[scope]}-${ERROR_SUFFIX[code]}` as DiagnosticErrorId;
}

export function assetVersion(): string {
  if (typeof document === 'undefined') return '';
  const text = document.getElementById('db-asset-version')?.textContent ?? '';
  return /'([^']+)'/.exec(text)?.[1] ?? '';
}

export function mediaRuntimeDiagnostics(): SupportBundle['media']['runtime'] {
  return {
    webAssembly: typeof WebAssembly !== 'undefined',
    mediaDevices: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    audioWorklet: typeof AudioWorkletNode !== 'undefined',
    videoWorker:
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof globalThis !== 'undefined' &&
      'MediaStreamTrackProcessor' in globalThis,
  };
}

export function buildSupportBundle(): SupportBundle {
  const relay = relayDiagnostics();
  const relayError = diagnosticErrorCode(connectionError());
  const bridgeError = diagnosticErrorCode(bridgeState.error);
  const mediaError = diagnosticErrorCode(mediaState.error);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    app: {
      assetVersion: assetVersion(),
      path: typeof location === 'undefined' ? '' : location.pathname,
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    },
    relay: {
      state: connectionState(),
      hasError: connectionError() !== null,
      errorCode: relayError,
      errorId: diagnosticErrorId('relay', relayError),
      lagMs: Math.max(0, Math.round(lag())),
      phase: relay.phase,
      protocolMode: relay.protocolMode,
      authMode: relay.authMode,
      serverVersion: relay.serverVersion,
      compression: relay.compression,
      hashAlgorithm: relay.hashAlgorithm,
      totp: relay.totp,
      handshake: relay.handshake,
      canDecodeCompression: relay.canDecodeCompression,
      reconnectReason: relay.reconnectReason,
      reconnectAttempt: relay.reconnectAttempt,
      reconnectDelayMs: relay.reconnectDelayMs,
    },
    bridge: {
      status: bridgeState.status,
      hasError: bridgeState.error !== null,
      errorCode: bridgeError,
      errorId: diagnosticErrorId('bridge', bridgeError),
      e2eeReady: bridgeState.e2eeReady,
    },
    media: {
      available: mediaState.mediaAvailable,
      callState: mediaState.callState,
      kind: mediaState.kind,
      peerCount: Object.keys(mediaState.peers).length,
      cameraOn: mediaState.cameraOn,
      screenSharing: mediaState.screenSharing,
      hasError: mediaState.error !== null,
      errorCode: mediaError,
      errorId: diagnosticErrorId('media', mediaError),
      health: {
        status: mediaState.health.status,
        tier: mediaState.health.tier,
        suggestedBps: mediaState.health.suggestedBps,
        jitterMs: mediaState.health.jitterMs,
        lossRate: mediaState.health.lossRate,
        roundTripMs: mediaState.health.roundTripMs,
        encodePressure: mediaState.health.encodePressure,
        reconnectAttempt: mediaState.health.reconnectAttempt,
      },
      runtime: mediaRuntimeDiagnostics(),
    },
    serviceWorker: {
      supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      controlled: typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller),
    },
    mediaDrops: snapshotDrops(),
    events: snapshotDiagnosticEvents(),
  };
}

export function exportSupportBundle(): string {
  return JSON.stringify(buildSupportBundle(), null, 2);
}
