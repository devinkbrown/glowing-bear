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

/**
 * Toggle the split pane. Opening PINS the split to the buffer that is active
 * right now, so the two panes can diverge as soon as the main pane navigates
 * elsewhere (without this, splitBuffer stayed null, splitPtr collapsed to the
 * active buffer, and both panes always showed the same buffer). Closing clears
 * the pin.
 */
export function toggleSplit(active: string | null): void {
  if (state.splitMode === 'none') {
    setState('splitBuffer', active);
    setState('splitMode', 'vertical');
  } else {
    setState('splitMode', 'none');
    setState('splitBuffer', null);
  }
}

/** Pin a specific buffer into the split pane (Alt/middle-click a buffer), opening the split if needed. */
export function openSplitWith(pointer: string): void {
  setState('splitBuffer', pointer);
  if (state.splitMode === 'none') setState('splitMode', 'vertical');
}

export function toggleSearch(): void {
  setState('searchOpen', (v) => !v);
}

export function setSearchOpen(open: boolean): void {
  setState('searchOpen', open);
}
