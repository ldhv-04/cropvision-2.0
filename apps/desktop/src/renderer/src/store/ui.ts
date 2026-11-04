import { create } from 'zustand';

export type Tab = 'map' | 'scouting' | 'orders' | 'irrigation';
interface UiState {
  tab: Tab; selectedBlockId: string | null; selectedSessionId: string | null;
  setTab(t: Tab): void; selectBlock(id: string | null): void; selectSession(id: string | null): void;
}
export const useUi = create<UiState>((set) => ({
  tab: 'map', selectedBlockId: null, selectedSessionId: null,
  setTab: (tab) => set({ tab }),
  selectBlock: (selectedBlockId) => set({ selectedBlockId }),
  selectSession: (selectedSessionId) => set({ selectedSessionId }),
}));
