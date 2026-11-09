import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadPalettesFromDir } from '../src/compile.ts';
import { auditContrast, contrastRatio } from '../src/contrast.ts';

const palettes = loadPalettesFromDir(fileURLToPath(new URL('../palettes', import.meta.url)));
const get = (id: string) => palettes.find((p) => p.id === id)!;
const find = (id: string, fg: string, bg: string) => auditContrast(get(id)).find((r) => r.fg === fg && r.bg === bg)!;

describe('contrastRatio (WCAG 2.x)', () => {
  it('is 21 for black on white and 1 for equal colours, order-independent', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('auditContrast (AC-T5)', () => {
  it('tactical-daylight body text meets the plan law of 10:1', () => {
    const r = find('tactical-daylight', 'foreground', 'background');
    expect(r.ratio).toBeGreaterThanOrEqual(10);
    expect(r.pass).toBe(true);
    expect(find('tactical-daylight', 'card-foreground', 'card').pass).toBe(true);
  });

  it('flags the plan-specified tactical-daylight muted text (9.83:1) below its own 10:1 law', () => {
    const r = find('tactical-daylight', 'muted-foreground', 'background');
    expect(r.ratio).toBeCloseTo(9.83, 1);
    expect(r).toMatchObject({ kind: 'text', target: 10, pass: false });
  });

  it('flags white on the dark-palette destructive red (3.76:1) below WCAG AA', () => {
    const r = find('agri-command-dark', 'destructive-foreground', 'destructive');
    expect(r.ratio).toBeCloseTo(3.76, 1);
    expect(r).toMatchObject({ kind: 'onFill', pass: false });
  });

  it('flags the near-invisible dark border (1.31:1) as a non-text failure', () => {
    expect(find('agri-command-dark', 'border', 'background')).toMatchObject({ kind: 'nonText', pass: false });
  });

  it('high-noon-monochrome meets every target, text at >= 14:1', () => {
    const rows = auditContrast(get('high-noon-monochrome'));
    expect(rows.filter((r) => !r.pass)).toEqual([]);
    for (const r of rows.filter((x) => x.kind === 'text')) expect(r.ratio).toBeGreaterThanOrEqual(14);
  });

  it('checks badge text (telemetry fill on its tinted bg), compositing rgba bgs over the page background', () => {
    const dark = find('agri-command-dark', 'telemetry.warning-fill', 'telemetry.warning-bg');
    expect(dark.kind).toBe('onFill');
    // #F59E0B over (amber @ 12 % on #0B0F17)
    expect(dark.ratio).toBeGreaterThan(7);
    expect(dark.ratio).toBeLessThan(10);
    expect(find('tactical-daylight', 'telemetry.critical-fill', 'telemetry.critical-bg').ratio).toBeCloseTo(contrastRatio('#B91C1C', '#FEE2E2'), 5);
  });

  it('checks white/black legibility on solid telemetry fills used by mobile pills', () => {
    const r = auditContrast(get('tactical-daylight')).find((x) => x.bg === 'telemetry.warning-fill')!;
    expect(r.fg).toBe('#FFFFFF');
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
  });
});
