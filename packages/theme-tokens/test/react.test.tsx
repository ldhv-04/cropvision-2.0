import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, useTheme } from '../src/react';
import { createThemeController } from '../src/index';

function Probe() {
  const { palette, palettes } = useTheme();
  return <span>{`${palette.id}|${palettes.length}|${palette.shadcn.background}`}</span>;
}

describe('ThemeProvider / useTheme', () => {
  it('provides the controller palette to children', () => {
    const html = renderToString(<ThemeProvider controller={createThemeController({ initial: 'tactical-daylight' })}><Probe /></ThemeProvider>);
    expect(html).toContain('tactical-daylight|3|#FAF9F5');
  });

  it('builds its own controller from `initial`', () => {
    expect(renderToString(<ThemeProvider initial="high-noon-monochrome"><Probe /></ThemeProvider>)).toContain('high-noon-monochrome|3|#FFFFFF');
  });

  it('throws a clear error when used outside a provider', () => {
    expect(() => renderToString(<Probe />)).toThrow(/useTheme must be used inside <ThemeProvider>/);
  });
});
