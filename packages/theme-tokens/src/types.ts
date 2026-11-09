/** shadcn/ui variable names, in the order shadcn's Figma kit lists them. `radius` is a length, all others colours. */
export const SHADCN_TOKENS = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring', 'radius',
] as const;

export const TELEMETRY_TONES = ['healthy', 'warning', 'critical', 'hydraulic'] as const;
export const TELEMETRY_TOKENS = TELEMETRY_TONES.flatMap((t) => [`${t}-fill`, `${t}-bg`, `${t}-border`] as const);

export type ShadcnToken = (typeof SHADCN_TOKENS)[number];
export type TelemetryTone = (typeof TELEMETRY_TONES)[number];
export type TelemetryToken = `${TelemetryTone}-${'fill' | 'bg' | 'border'}`;

export interface ContrastTargets { text: number; onFill: number; nonText: number }

export interface Palette {
  id: string;
  name: string;
  description: string;
  order: number;
  scheme: 'light' | 'dark';
  contrastTargets: ContrastTargets;
  shadcn: Record<ShadcnToken, string>;
  telemetry: Record<TelemetryToken, string>;
}
