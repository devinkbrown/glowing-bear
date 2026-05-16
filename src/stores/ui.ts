import type { StateCreator } from 'zustand';

export type ModalType =
  | 'connect'
  | 'settings'
  | 'bufferSwitcher'
  | 'help'
  | 'about'
  | 'channelInfo'
  | 'userProfile'
  | 'services'
  | 'channelList'
  | null;

export interface UISlice {
  activeModal: ModalType;
  sidebarOpen: boolean;
  userListOpen: boolean;
  operPanelOpen: boolean;
  splitMode: 'none' | 'horizontal' | 'vertical';
  splitBuffer: string | null;
  searchOpen: boolean;

  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleUserList: () => void;
  setUserListOpen: (open: boolean) => void;
  toggleOperPanel: () => void;
  setSplitMode: (mode: 'none' | 'horizontal' | 'vertical') => void;
  setSplitBuffer: (pointer: string | null) => void;
  toggleSearch: () => void;
  setSearchOpen: (open: boolean) => void;
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  activeModal: 'connect',
  sidebarOpen: false,
  userListOpen: false,
  operPanelOpen: false,
  splitMode: 'none',
  splitBuffer: null,
  searchOpen: false,

  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleUserList: () => set(s => ({ userListOpen: !s.userListOpen })),
  setUserListOpen: (open) => set({ userListOpen: open }),
  toggleOperPanel: () => set(s => ({ operPanelOpen: !s.operPanelOpen })),
  setSplitMode: (mode) => set({ splitMode: mode }),
  setSplitBuffer: (pointer) => set({ splitBuffer: pointer }),
  toggleSearch: () => set(s => ({ searchOpen: !s.searchOpen })),
  setSearchOpen: (open) => set({ searchOpen: open }),
});
