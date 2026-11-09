import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { applyThemeClass, createThemeController, type ThemeController, type ThemeStorage } from './controller';
import type { Palette } from './types';

interface ThemeValue { palette: Palette; palettes: readonly Palette[]; setTheme(id: string): void }
const Ctx = createContext<ThemeValue | null>(null);

/**
 * Works in React DOM and React Native. Pass `applyTo` (e.g. document.documentElement) on the web so the
 * `.theme-<id>` class switches the CSS variables; React Native reads `palette` values directly.
 */
export function ThemeProvider(props: {
  children: ReactNode; controller?: ThemeController; initial?: string; storage?: ThemeStorage;
  applyTo?: { classList: { add(c: string): void; remove(...c: string[]): void } };
}) {
  const { controller: given, initial, storage, applyTo } = props;
  const controller = useMemo(() => given ?? createThemeController({ initial, storage }), [given, initial, storage]);
  const palette = useSyncExternalStore(controller.subscribe, controller.current, controller.current);
  useEffect(() => { if (applyTo) applyThemeClass(applyTo, palette.id); }, [applyTo, palette.id]);
  const value = useMemo(() => ({ palette, palettes: controller.list(), setTheme: controller.set }), [palette, controller]);
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}
