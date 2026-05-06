import { create } from 'zustand';
import { createSettingsSlice, type SettingsSlice } from './settings';
import { createBuffersSlice, type BuffersSlice } from './buffers';
import { createConnectionSlice, type ConnectionSlice } from './connection';
import { createVideoSlice, type VideoSlice } from './video';
import { createCompletionSlice, type CompletionSlice } from './completion';
import { createUISlice, type UISlice } from './ui';

export type AppStore = SettingsSlice & BuffersSlice & ConnectionSlice & VideoSlice & CompletionSlice & UISlice;

export const useStore = create<AppStore>()((...a) => ({
  ...createSettingsSlice(...a),
  ...createBuffersSlice(...a),
  ...createConnectionSlice(...(a as Parameters<typeof createConnectionSlice>)),
  ...createVideoSlice(...(a as Parameters<typeof createVideoSlice>)),
  ...createCompletionSlice(...(a as Parameters<typeof createCompletionSlice>)),
  ...createUISlice(...a),
}));

// Sync ICE servers when TURN settings change
let _prevTurnKey = '';
useStore.subscribe((state) => {
  const key = `${state.settings.turnUrl}|${state.settings.turnUsername}|${state.settings.turnCredential}`;
  if (key !== _prevTurnKey) {
    _prevTurnKey = key;
    state.updateIceServers();
  }
});

// Sync webrtc-signal cap when video calls toggled
let _prevVideoEnabled: boolean | null = null;
useStore.subscribe((state) => {
  const enabled = state.settings.enableVideoCalls;
  if (_prevVideoEnabled !== null && enabled !== _prevVideoEnabled && state.client) {
    const cmd = enabled ? '/quote CAP REQ webrtc-signal' : '/quote CAP REQ -webrtc-signal';
    for (const [, entry] of state.buffers) {
      if (entry.buffer.localVars['type'] === 'server') {
        state.client.sendInput(entry.buffer.id, cmd);
      }
    }
    if (enabled) {
      const fn = state.videoSendFn;
      if (fn) fn('/quote PROP * no-video :');
    } else {
      const fn = state.videoSendFn;
      if (fn) fn('/quote PROP * no-video :1');
    }
  }
  _prevVideoEnabled = enabled;
});

// Re-export slice types for convenience
export type { SettingsSlice } from './settings';
export type { BuffersSlice } from './buffers';
export type { ConnectionSlice } from './connection';
export type { VideoSlice } from './video';
export type { CompletionSlice } from './completion';
export type { UISlice, ModalType } from './ui';
