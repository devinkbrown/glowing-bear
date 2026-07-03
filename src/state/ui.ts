// UI store — modals, panels, split view, search.

import { createStore } from 'solid-js/store';
import type { ModalType, SplitMode } from '@/types';

export interface UIState {
  activeModal: ModalType;
  sidebarOpen: boolean;
  userListOpen: boolean;
  operConsoleOpen: boolean;
  splitMode: SplitMode;
  /** Buffer pointer shown in the split pane, or null. */
  splitBuffer: string | null;
  searchOpen: boolean;
}

const [state, setState] = createStore<UIState>({
  activeModal: 'connect',
  sidebarOpen: false,
  userListOpen: false,
  operConsoleOpen: false,
  splitMode: 'none',
  splitBuffer: null,
  searchOpen: false,
});

/** Read-only UI store. Mutate via the exported actions only. */
export { state as uiState };

export function openModal(modal: ModalType): void {
  setState('activeModal', modal);
}

export function closeModal(): void {
  setState('activeModal', null);
}

export function toggleSidebar(): void {
  setState('sidebarOpen', (v) => !v);
}

export function setSidebarOpen(open: boolean): void {
  setState('sidebarOpen', open);
}

export function toggleUserList(): void {
  setState('userListOpen', (v) => !v);
}

export function setUserListOpen(open: boolean): void {
  setState('userListOpen', open);
}

export function toggleOperConsole(): void {
  setState('operConsoleOpen', (v) => !v);
}

export function setOperConsoleOpen(open: boolean): void {
  setState('operConsoleOpen', open);
}

export function setSplitMode(mode: SplitMode): void {
  setState('splitMode', mode);
}

export function setSplitBuffer(pointer: string | null): void {
  setState('splitBuffer', pointer);
}

export function toggleSearch(): void {
  setState('searchOpen', (v) => !v);
}

export function setSearchOpen(open: boolean): void {
  setState('searchOpen', open);
}
