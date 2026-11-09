import { PALETTES } from './palettes.generated';
import type { Palette } from './types';

export type PaletteId = (typeof PALETTES)[number]['id'];
const all: readonly Palette[] = PALETTES;

export function getPalette(id: string): Palette {
  const p = all.find((x) => x.id === id);
  if (!p) throw new Error(`unknown palette "${id}" (known: ${all.map((x) => x.id).join(', ')})`);
  return p;
}

export interface ThemeStorage { get(key: string): string | null; set(key: string, value: string): void }
export interface ThemeController {
  list(): readonly Palette[];
  current(): Palette;
  set(id: string): void;
  subscribe(fn: (p: Palette) => void): () => void;
}

const KEY = 'cropvision.theme';
const quiet = <T>(fn: () => T): T | null => { try { return fn(); } catch { return null; } };

/** Runtime palette switcher. Storage is optional and best-effort (private mode / blocked storage never breaks theming). */
export function createThemeController(opts: { initial?: string; storage?: ThemeStorage } = {}): ThemeController {
  const stored = opts.storage ? quiet(() => opts.storage!.get(KEY)) : null;
  const valid = (id: string | null | undefined) => (id && all.some((p) => p.id === id) ? id : null);
  let current = getPalette(valid(stored) ?? opts.initial ?? all[0]!.id);
  const subs = new Set<(p: Palette) => void>();
  return {
    list: () => all,
    current: () => current,
    set(id) {
      current = getPalette(id);
      if (opts.storage) quiet(() => opts.storage!.set(KEY, id));
      for (const fn of subs) fn(current);
    },
    subscribe(fn) { subs.add(fn); return () => void subs.delete(fn); },
  };
}

/** Puts `.theme-<id>` on a DOM root (CSS variables come from css-variables.css), removing any other palette class. */
export function applyThemeClass(root: { classList: { add(c: string): void; remove(...c: string[]): void } }, id: string): void {
  getPalette(id);
  root.classList.remove(...all.map((p) => `theme-${p.id}`));
  root.classList.add(`theme-${id}`);
}
