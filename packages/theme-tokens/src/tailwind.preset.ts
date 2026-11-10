// Shared Tailwind preset: shadcn/ui token names -> CSS variables from css-variables.css. Plain object, no tailwind import.
import { TELEMETRY_TONES } from './types';

const c = (t: string) => `rgb(var(--${t}-rgb) / <alpha-value>)`;
const pair = (t: string) => ({ DEFAULT: c(t), foreground: c(`${t}-foreground`) });

const preset = {
  darkMode: 'class' as const,
  theme: {
    extend: {
      colors: {
        background: c('background'),
        foreground: c('foreground'),
        border: c('border'),
        input: c('input'),
        ring: c('ring'),
        card: pair('card'),
        popover: pair('popover'),
        primary: pair('primary'),
        secondary: pair('secondary'),
        muted: pair('muted'),
        accent: pair('accent'),
        destructive: pair('destructive'),
        telemetry: Object.fromEntries(TELEMETRY_TONES.map((t) => [t, {
          DEFAULT: `var(--telemetry-${t}-fill)`, bg: `var(--telemetry-${t}-bg)`, border: `var(--telemetry-${t}-border)`,
        }])),
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      // Impeccable law 1: layers separate by surface + 1px border, never by large blurred shadows.
      boxShadow: { md: 'none', lg: 'none', xl: 'none', '2xl': 'none' },
      transitionDuration: { 50: '50ms' },
    },
  },
};

export default preset;
