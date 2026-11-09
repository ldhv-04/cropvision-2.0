import { TELEMETRY_TONES, type Palette, type ShadcnToken } from './types';

const luminance = (hex: string) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);

/** WCAG 2.x contrast ratio of two #RRGGBB colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on a solid fill. */
export const readableOn = (fill: string) => (contrastRatio('#FFFFFF', fill) >= contrastRatio('#000000', fill) ? '#FFFFFF' : '#000000');

export interface ContrastRow { fg: string; bg: string; kind: 'text' | 'onFill' | 'nonText'; ratio: number; target: number; pass: boolean }

const PAIRS: [ShadcnToken, ShadcnToken, ContrastRow['kind']][] = [
  ['foreground', 'background', 'text'], ['card-foreground', 'card', 'text'], ['popover-foreground', 'popover', 'text'],
  ['muted-foreground', 'background', 'text'], ['muted-foreground', 'muted', 'text'],
  ['primary-foreground', 'primary', 'onFill'], ['secondary-foreground', 'secondary', 'onFill'],
  ['accent-foreground', 'accent', 'onFill'], ['destructive-foreground', 'destructive', 'onFill'],
  ['border', 'background', 'nonText'], ['ring', 'background', 'nonText'],
];

/** Every shadcn text/fill/border pair plus black-or-white on each solid telemetry fill, against the palette's own targets. */
export function auditContrast(p: Palette): ContrastRow[] {
  const row = (fg: string, bg: string, kind: ContrastRow['kind'], fgHex: string, bgHex: string): ContrastRow => {
    const ratio = contrastRatio(fgHex, bgHex), target = p.contrastTargets[kind];
    return { fg, bg, kind, ratio, target, pass: ratio >= target };
  };
  const rows = PAIRS.map(([fg, bg, kind]) => row(fg, bg, kind, p.shadcn[fg], p.shadcn[bg]));
  for (const t of TELEMETRY_TONES) {
    const fill = p.telemetry[`${t}-fill`], ink = readableOn(fill);
    rows.push(row(ink, `telemetry.${t}-fill`, 'onFill', ink, fill));
  }
  return rows;
}
