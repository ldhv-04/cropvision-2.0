export const MODULES = [
  { id: 'gis', icon: 'Map', label: 'Bản đồ GIS', hint: 'GIS Spatial Command' },
  { id: 'scouting', icon: 'ScanSearch', label: 'Khảo sát', hint: 'Scouting & Leaf Inspector' },
  { id: 'hydraulic', icon: 'Droplets', label: 'Tưới & Châm phân', hint: 'Hydraulic & Venturi Dispatch' },
  { id: 'ledger', icon: 'ShieldAlert', label: 'Việc & Vật tư', hint: 'Agronomic & PHI Ledger' },
  { id: 'studio', icon: 'Cpu', label: 'Thiết lập', hint: 'Edge & Hardware Studio' },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];
export type Shortcut = { type: 'module'; id: ModuleId } | { type: 'command' };

interface KeyLike { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }

/** Alt+1..5 switch modules, Ctrl/Cmd+K opens the command dialog. Anything else is left to the focused control. */
export function resolveShortcut(e: KeyLike): Shortcut | null {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') return { type: 'command' };
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const m = MODULES[Number(e.key) - 1];
    if (m && /^[1-9]$/.test(e.key)) return { type: 'module', id: m.id };
  }
  return null;
}
