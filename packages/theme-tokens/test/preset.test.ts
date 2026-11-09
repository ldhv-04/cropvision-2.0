import { describe, expect, it } from 'vitest';
import preset from '../src/tailwind.preset';
import { SHADCN_TOKENS, TELEMETRY_TONES } from '../src/index';

const colors = preset.theme.extend.colors as Record<string, any>;

describe('tailwind preset (AC-T7)', () => {
  it('maps every shadcn colour to its rgb channel variable so opacity modifiers (bg-card/95) work', () => {
    expect(colors.background).toBe('rgb(var(--background-rgb) / <alpha-value>)');
    expect(colors.card).toEqual({ DEFAULT: 'rgb(var(--card-rgb) / <alpha-value>)', foreground: 'rgb(var(--card-foreground-rgb) / <alpha-value>)' });
    expect(colors.border).toBe('rgb(var(--border-rgb) / <alpha-value>)');
    const flat = JSON.stringify(colors);
    for (const t of SHADCN_TOKENS.filter((x) => x !== 'radius')) expect(flat).toContain(`--${t}-rgb`);
  });

  it('adds telemetry tones as text/bg/border colours', () => {
    for (const t of TELEMETRY_TONES)
      expect(colors.telemetry[t]).toEqual({ DEFAULT: `var(--telemetry-${t}-fill)`, bg: `var(--telemetry-${t}-bg)`, border: `var(--telemetry-${t}-border)` });
  });

  it('derives radii from --radius like shadcn', () => {
    expect(preset.theme.extend.borderRadius).toEqual({ lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' });
  });

  it('uses JetBrains Mono first for font-mono (tabular telemetry)', () => {
    expect(preset.theme.extend.fontFamily.mono[0]).toBe('"JetBrains Mono"');
  });

  it('removes large decorative shadows (Impeccable law 1)', () => {
    const s = preset.theme.extend.boxShadow as Record<string, string>;
    for (const k of ['md', 'lg', 'xl', '2xl']) expect(s[k]).toBe('none');
  });
});
