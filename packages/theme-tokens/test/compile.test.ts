import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SHADCN_TOKENS, TELEMETRY_TOKENS, compileCss, compileFigmaTokens, compileTs, loadPalettesFromDir, validatePalette } from '../src/compile.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const palettes = loadPalettesFromDir(`${root}palettes`);
const byId = Object.fromEntries(palettes.map((p) => [p.id, p]));

describe('palette files (AC-T2)', () => {
  it('ships the three plan palettes, desktop default first', () => {
    expect(palettes.map((p) => p.id)).toEqual(['agri-command-dark', 'tactical-daylight', 'high-noon-monochrome']);
  });

  it('keeps the exact plan values for agri-command-dark', () => {
    const p = byId['agri-command-dark']!;
    expect(p.shadcn.background).toBe('#0B0F17');
    expect(p.shadcn.card).toBe('#111622');
    expect(p.shadcn.primary).toBe('#16A34A');
    expect(p.shadcn.radius).toBe('0.375rem');
    expect(p.telemetry['critical-bg']).toBe('rgba(239, 68, 68, 0.15)');
  });

  it('keeps the exact plan values for tactical-daylight', () => {
    const p = byId['tactical-daylight']!;
    expect(p.shadcn.background).toBe('#FAF9F5');
    expect(p.shadcn.foreground).toBe('#090D16');
    expect(p.shadcn.border).toBe('#94A3B8');
    expect(p.shadcn.radius).toBe('0.5rem');
    expect(p.telemetry['hydraulic-border']).toBe('#2563EB');
  });
});

describe('validatePalette (AC-T4)', () => {
  const good = () => structuredClone(byId['tactical-daylight']!) as any;

  it('rejects a palette missing a shadcn token, naming palette and token', () => {
    const p = good(); delete p.shadcn.ring;
    expect(() => validatePalette(p)).toThrow(/tactical-daylight.*ring/);
  });

  it('rejects a palette missing a telemetry token', () => {
    const p = good(); delete p.telemetry['warning-fill'];
    expect(() => validatePalette(p)).toThrow(/tactical-daylight.*warning-fill/);
  });

  it('requires #RRGGBB for shadcn colours so Tailwind opacity modifiers work', () => {
    const p = good(); p.shadcn.card = 'rgba(0,0,0,0.5)';
    expect(() => validatePalette(p)).toThrow(/card/);
  });

  it('accepts rgba() for telemetry but rejects garbage', () => {
    const p = good(); p.telemetry['healthy-bg'] = 'rgba(34, 197, 94, 0.12)';
    expect(() => validatePalette(p)).not.toThrow();
    p.telemetry['healthy-bg'] = 'greenish';
    expect(() => validatePalette(p)).toThrow(/healthy-bg/);
  });
});

describe('compileCss (AC-T1)', () => {
  const css = compileCss(palettes);

  it('puts the first palette on :root and every palette on .theme-<id>', () => {
    expect(css).toMatch(/:root,\s*\.theme-agri-command-dark\s*\{/);
    expect(css).toMatch(/\.theme-tactical-daylight\s*\{/);
    expect(css).toMatch(/\.theme-high-noon-monochrome\s*\{/);
  });

  it('emits every token as a CSS variable in every block, plus rgb channels for shadcn colours', () => {
    const blocks = css.split('}').filter((b) => b.includes('{'));
    expect(blocks).toHaveLength(3);
    for (const b of blocks) {
      for (const t of SHADCN_TOKENS) expect(b).toContain(`--${t}:`);
      for (const t of TELEMETRY_TOKENS) expect(b).toContain(`--telemetry-${t}:`);
    }
    expect(css).toContain('--background: #0B0F17;');
    expect(css).toContain('--background-rgb: 11 15 23;');
    expect(css).toContain('color-scheme: dark;');
    expect(css).toContain('color-scheme: light;');
  });
});

describe('compileFigmaTokens (AC-T1)', () => {
  it('produces one W3C token set per palette with $value/$type', () => {
    const f = compileFigmaTokens(palettes) as any;
    expect(f.$metadata.tokenSetOrder).toEqual(palettes.map((p) => p.id));
    expect(f['tactical-daylight'].shadcn.primary).toEqual({ $value: '#0F3D26', $type: 'color' });
    expect(f['tactical-daylight'].shadcn.radius).toEqual({ $value: '0.5rem', $type: 'borderRadius' });
    expect(f['agri-command-dark'].telemetry['warning-bg']).toEqual({ $value: 'rgba(245, 158, 11, 0.12)', $type: 'color' });
  });
});

describe('generated files are in sync with palettes/ (AC-T3)', () => {
  it.each([
    ['src/css-variables.css', () => compileCss(palettes)],
    ['src/palettes.generated.ts', () => compileTs(palettes)],
    ['figma/shadcn-ui-kit-tokens.json', () => JSON.stringify(compileFigmaTokens(palettes), null, 2) + '\n'],
  ])('%s matches the compiler output (run `pnpm --filter @cropvision/theme-tokens compile`)', (file, gen) => {
    expect(readFileSync(`${root}${file}`, 'utf8')).toBe(gen());
  });
});
