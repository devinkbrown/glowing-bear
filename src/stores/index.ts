import { create } from 'zustand';
import { createSettingsSlice, type SettingsSlice } from './settings';
import { createBuffersSlice, type BuffersSlice } from './buffers';
import { createConnectionSlice, type ConnectionSlice } from './connection';
import { createVideoSlice, type VideoSlice } from './video';
import { createCompletionSlice, type CompletionSlice } from './completion';
import { createUISlice, type UISlice } from './ui';
import { createIrcxSlice, type IrcxSlice } from './ircx';

export type AppStore = SettingsSlice & BuffersSlice & ConnectionSlice & VideoSlice & CompletionSlice & UISlice & IrcxSlice;

export const useStore = create<AppStore>()((...a) => ({
  ...createSettingsSlice(...a),
  ...createBuffersSlice(...a),
  ...createConnectionSlice(...(a as Parameters<typeof createConnectionSlice>)),
  ...createVideoSlice(...(a as Parameters<typeof createVideoSlice>)),
  ...createCompletionSlice(...(a as Parameters<typeof createCompletionSlice>)),
  ...createUISlice(...a),
  ...createIrcxSlice(...(a as Parameters<typeof createIrcxSlice>)),
}));

// Re-export slice types for convenience
export type { SettingsSlice } from './settings';
export type { BuffersSlice } from './buffers';
export type { ConnectionSlice } from './connection';
export type { VideoSlice } from './video';
export type { CompletionSlice } from './completion';
export type { UISlice, ModalType } from './ui';
export type { IrcxSlice } from './ircx';
