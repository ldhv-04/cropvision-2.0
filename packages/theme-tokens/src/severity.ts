import type { TelemetryTone } from './types';

/** BSI/DS cut-offs; the test pins them to `decideCoffeeRustAction` in @cropvision/domain. */
export const SEVERITY_WARNING_PCT = 5;
export const SEVERITY_CRITICAL_PCT = 15;

export type SeverityTone = Exclude<TelemetryTone, 'hydraulic'>;

/** Non-finite input is critical: a broken reading must never render green. */
export function severityTone(pct: number): SeverityTone {
  if (!Number.isFinite(pct) || pct >= SEVERITY_CRITICAL_PCT) return 'critical';
  return pct >= SEVERITY_WARNING_PCT ? 'warning' : 'healthy';
}

export const SEVERITY_BANDS = [
  { tone: 'healthy', label: 'BSI < 5%', code: 'CULTURAL_CONTROL_ONLY' },
  { tone: 'warning', label: '5% ≤ BSI < 15%', code: 'LOCALIZED_SPOT_SPRAY' },
  { tone: 'critical', label: 'BSI ≥ 15%', code: 'BLOCK_WIDE_INTERVENTION' },
] as const satisfies readonly { tone: SeverityTone; label: string; code: string }[];
