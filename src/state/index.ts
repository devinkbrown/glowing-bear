// State facade — re-exports every store and action.
//
// Components import from '@/state'; see src/state/README.md for the full
// API contract.

export * from './settings';
export * from './buffers';
export * from './connection';
export * from './connectivity';
export * from './ircx';
export * from './completion';
export * from './ui';
export * from './bridge';
export * from './drafts';
export * from './threads';
export * from './activity';
export * from './preferenceSync';
export * from './notificationActions';
export * from './userActions';
export * from './operatorIncidents';
export * from './uploads';

// Media exports are re-exported by name: `toggleMute()` (media) collides with
// buffers' `toggleMute(pointer)`, so the facade aliases it to `toggleMicMute`.
// Import from '@/state/media' directly for the exact media contract names.
export {
  mediaState,
  joinRoom,
  leaveRoom,
  startCall,
  acceptCall,
  requestRoomJoin,
  requestStartCall,
  requestAcceptCall,
  rejectCall,
  hangup,
  toggleMute as toggleMicMute,
  toggleDeafen,
  toggleCamera,
  toggleScreenShare,
  setMinimized,
  setTranscriptOpen,
  setSpotlight,
  sendRoomReaction,
  peerStream,
  selfPreviewStream,
} from './media';
export type { CallState, MediaPeer } from './media';

// App-level types (AppSettings, BufferEntry, ModalType, protocol re-exports…)
export * from '../types';

import { applyTheme } from './settings';
import { connect, disconnect } from './connection';

/**
 * App startup convenience: apply the persisted theme to <html data-theme>
 * and open the relay connection.
 */
export function connectAll(): void {
  applyTheme();
  connect();
}

/**
 * App shutdown convenience: tear down the relay connection (also clears
 * buffers, IRCX state, and oper status).
 */
export function disconnectAll(): void {
  disconnect();
}
