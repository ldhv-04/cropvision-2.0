import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import config from '../tailwind.config';

const build = async (html: string) =>
  (await postcss([tailwind({ ...config, content: [{ raw: html, extension: 'html' }] })]).process('@tailwind utilities;', { from: undefined })).css;

describe('desktop Tailwind uses @cropvision/theme-tokens (AC-D1)', () => {
  it('scans the renderer sources', () => {
    expect(config.content).toContain('./src/renderer/**/*.{ts,tsx,html}');
  });

  it('resolves shadcn colours to token variables, with opacity modifiers', async () => {
    const css = await build('<div class="bg-card/95 text-muted-foreground border-border">');
    expect(css).toContain('background-color: rgb(var(--card-rgb) / 0.95)');
    expect(css).toMatch(/color: rgb\(var\(--muted-foreground-rgb\) \/ var\(--tw-text-opacity(, 1)?\)\)/);
  });

  it('exposes telemetry tones and JetBrains Mono tabular figures', async () => {
    const css = await build('<b class="text-telemetry-critical bg-telemetry-warning-bg font-mono tabular-nums">');
    expect(css).toContain('color: var(--telemetry-critical-fill)');
    expect(css).toContain('background-color: var(--telemetry-warning-bg)');
    expect(css).toContain('"JetBrains Mono"');
    expect(css).toContain('font-variant-numeric');
  });

  it('turns large shadows off', async () => {
    expect(await build('<div class="shadow-lg">')).not.toMatch(/0 10px 15px/);
  });
});
