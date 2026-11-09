import { create } from 'zustand';
import type { ModuleId } from '../lib/shortcuts';

export type InspectorTab = 'overview' | 'samples' | 'leases' | 'phi';
interface UiState {
  module: ModuleId; inspectorTab: InspectorTab; commandOpen: boolean;
  selectedBlockId: string | null; selectedSessionId: string | null;
  setModule(m: ModuleId): void; setInspectorTab(t: InspectorTab): void; setCommandOpen(o: boolean): void;
  selectBlock(id: string | null): void;
  /** Selecting a session also selects its block and shows its samples in the inspector. */
  selectSession(id: string | null, blockId?: string): void;
}
export const useUi = create<UiState>((set) => ({
  module: 'gis', inspectorTab: 'overview', commandOpen: false, selectedBlockId: null, selectedSessionId: null,
  setModule: (module) => set({ module }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  selectBlock: (selectedBlockId) => set((s) => (s.selectedBlockId === selectedBlockId ? {} : { selectedBlockId, selectedSessionId: null })),
  selectSession: (selectedSessionId, blockId) =>
    set((s) => ({ selectedSessionId, selectedBlockId: blockId ?? s.selectedBlockId, inspectorTab: selectedSessionId ? 'samples' : s.inspectorTab })),
}));
