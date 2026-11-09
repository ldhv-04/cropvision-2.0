import { describe, expect, it, vi } from 'vitest';
import { PALETTES, applyThemeClass, createThemeController, getPalette } from '../src/index';

describe('palette registry', () => {
  it('exposes the compiled palettes and finds one by id', () => {
    expect(PALETTES.map((p) => p.id)).toEqual(['agri-command-dark', 'tactical-daylight', 'high-noon-monochrome']);
    expect(getPalette('tactical-daylight').shadcn.background).toBe('#FAF9F5');
    expect(() => getPalette('nope')).toThrow(/unknown palette "nope"/);
  });
});

describe('createThemeController (AC-T6)', () => {
  it('starts on the requested palette and lists all palettes', () => {
    const c = createThemeController({ initial: 'tactical-daylight' });
    expect(c.current().id).toBe('tactical-daylight');
    expect(c.list().map((p) => p.id)).toHaveLength(3);
  });

  it('defaults to the first palette', () => {
    expect(createThemeController().current().id).toBe('agri-command-dark');
  });

  it('switches and notifies subscribers until they unsubscribe', () => {
    const c = createThemeController();
    const fn = vi.fn();
    const off = c.subscribe(fn);
    c.set('high-noon-monochrome');
    expect(c.current().id).toBe('high-noon-monochrome');
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ id: 'high-noon-monochrome' }));
    off();
    c.set('tactical-daylight');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown id and keeps the current palette', () => {
    const c = createThemeController();
    expect(() => c.set('pink')).toThrow(/unknown palette "pink"/);
    expect(c.current().id).toBe('agri-command-dark');
  });

  it('persists the choice and restores it, ignoring a stale stored id', () => {
    const store = new Map<string, string>();
    const storage = { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => void store.set(k, v) };
    createThemeController({ storage }).set('tactical-daylight');
    expect(createThemeController({ storage }).current().id).toBe('tactical-daylight');
    store.set('cropvision.theme', 'deleted-palette');
    expect(createThemeController({ storage }).current().id).toBe('agri-command-dark');
  });

  it('survives a storage that throws (private mode)', () => {
    const storage = { get: () => { throw new Error('denied'); }, set: () => { throw new Error('denied'); } };
    const c = createThemeController({ storage });
    expect(() => c.set('tactical-daylight')).not.toThrow();
    expect(c.current().id).toBe('tactical-daylight');
  });
});

describe('applyThemeClass (AC-T6)', () => {
  it('leaves exactly one theme-* class on the root and keeps unrelated classes', () => {
    const classes = new Set(['app', 'theme-agri-command-dark']);
    const root = { classList: { add: (c: string) => void classes.add(c), remove: (...c: string[]) => c.forEach((x) => classes.delete(x)) } };
    applyThemeClass(root, 'tactical-daylight');
    expect([...classes].sort()).toEqual(['app', 'theme-tactical-daylight']);
  });
});
