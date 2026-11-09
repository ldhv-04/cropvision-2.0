// Tactical Daylight HMI rules (design/ui-spec.md UI-04). Pure: no React Native imports, so every rule is unit-tested in Node.
import { CANOPY_WEIGHTS, DAY_MS, SPRAY_LITERS_PER_TREE, type CanopyLayer } from '@cropvision/domain';
import { getPalette, readableOn, type Palette, type TelemetryTone } from '@cropvision/theme-tokens';
import type { GateState } from '../services/camera-gate.logic';

export const TOUCH_MIN = 56;
export const BORDER = 2;

export function hmiColors(p: Palette) {
  const t = p.telemetry, c = p.shadcn;
  return {
    bg: c.background, card: c.card, ink: c.foreground, muted: c['muted-foreground'], surface: c.muted,
    border: c.border, input: c.input,
    primary: c.primary, onPrimary: c['primary-foreground'],
    secondary: c.secondary, onSecondary: c['secondary-foreground'],
    danger: c.destructive, onDanger: c['destructive-foreground'],
    healthy: t['healthy-fill'], warning: t['warning-fill'], critical: t['critical-fill'], hydraulic: t['hydraulic-fill'],
  };
}
export type HmiColors = ReturnType<typeof hmiColors>;

/** Solid, high-contrast pill: green when the hub answers, amber when the phone works offline. */
export function lanBanner(p: Palette, s: { reachable: boolean; pendingSamples: number }) {
  const tone: TelemetryTone = s.reachable ? 'healthy' : 'warning';
  const fill = p.telemetry[`${tone}-fill`];
  return {
    tone, fill, ink: readableOn(fill),
    text: s.reachable ? `● TRẠM ĐÃ KẾT NỐI - ĐỒNG BỘ (${s.pendingSamples} MẪU)` : '○ CHẾ ĐỘ NGOẠI TUYẾN - LƯU SQLITE CỤC BỘ',
  };
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok'>>;
/** True when the hub handshake answers within `timeoutMs`; never throws. */
export async function probeHub(url: string, fetchImpl: FetchLike = fetch, timeoutMs = 1500): Promise<boolean> {
  if (!url) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return (await fetchImpl(`${url.replace(/\/+$/, '')}/api/v1/handshake`, { signal: ctrl.signal })).ok; }
  catch { return false; }
  finally { clearTimeout(timer); }
}

type OrderType = 'SCOUTING' | 'IRRIGATION' | 'FERTIGATION' | 'SPRAYING' | 'PRUNING';
const ORDER_TONE: Record<OrderType, TelemetryTone> = { SCOUTING: 'healthy', SPRAYING: 'critical', IRRIGATION: 'hydraulic', FERTIGATION: 'hydraulic', PRUNING: 'warning' };
export const orderStripe = (p: Palette, type: string) => p.telemetry[`${ORDER_TONE[type as OrderType] ?? 'hydraulic'}-fill`];

const parse = (json: string): Record<string, unknown> => { try { return JSON.parse(json) ?? {}; } catch { return {}; } };
const vn = (n: number) => String(n).replace('.', ',');
export function orderSummary(o: { order_type: string; instructions_json: string }, checkpointCount: number): string {
  const i = parse(o.instructions_json);
  switch (o.order_type) {
    case 'SCOUTING': return checkpointCount ? `Khảo sát ${checkpointCount} điểm chữ Z` : 'Khảo sát tự do (lô chưa có tuyến Z)';
    case 'SPRAYING': return typeof i.sprayVolumeLiters === 'number' ? `Phun ${Math.round(i.sprayVolumeLiters)} L dung dịch (${vn(SPRAY_LITERS_PER_TREE)} L/cây)` : 'Phun thuốc theo khuyến nghị';
    case 'FERTIGATION': return 'Châm phân Venturi 2,5 bar';
    case 'IRRIGATION': return 'Tưới nhỏ giọt theo lease';
    case 'PRUNING': return 'Tỉa cành tầng thấp, thông thoáng tán';
    default: return o.order_type;
  }
}

export type FieldFlow = 'scouting' | 'scan' | 'valve';
export function launchTarget(type: string): FieldFlow | null {
  if (type === 'SCOUTING') return 'scouting';
  if (type === 'SPRAYING') return 'scan';
  if (type === 'IRRIGATION' || type === 'FERTIGATION') return 'valve';
  return null;
}

// Reticle colours are the plan's exact values, taken from the palettes that define them.
const SHAKE = getPalette('tactical-daylight').shadcn.destructive; // #DC2626
const STEADY = getPalette('agri-command-dark').telemetry['healthy-fill']; // #22C55E, bright over a camera feed
export function reticleState(g: GateState) {
  if (g.isStable) return { color: STEADY, width: 2, banner: null, shutterEnabled: true };
  return {
    color: SHAKE, width: 4, shutterEnabled: false,
    banner: g.lockReason === 'CALIBRATING' ? 'ĐANG HIỆU CHUẨN CẢM BIẾN' : `GIỮ CHẶT TAY - ĐANG RUNG (${g.stabilityScore.toFixed(1)} m/s²)`,
  };
}

const LAYER_NAME: Record<CanopyLayer, string> = { LOW: 'TẦNG DƯỚI', MID: 'TẦNG GIỮA', TOP: 'TẦNG TRÊN' };
/** Coffee rust starts in the low canopy, so LOW is first and the default. */
export const CANOPY_OPTIONS = (['LOW', 'MID', 'TOP'] as const).map((layer) => ({ layer, label: `${LAYER_NAME[layer]} x${CANOPY_WEIGHTS[layer].toFixed(1)}` }));
export const DEFAULT_CANOPY: CanopyLayer = 'LOW';

const two = (n: number) => String(n).padStart(2, '0');
export function checkpointProgress(visited: number, total: number): string {
  if (!total) return `CHỤP TỰ DO · ${visited} MẪU`;
  if (visited >= total) return `ĐÃ ĐỦ ${two(total)} / ${two(total)} ĐIỂM`;
  return `ĐIỂM CHỐT ${two(visited + 1)} / ${two(total)}`;
}

export const GAUGE = { min: 0, max: 4, optimal: [2.3, 2.7] as const };
const frac = (bar: number) => Math.min(1, Math.max(0, (bar - GAUGE.min) / (GAUGE.max - GAUGE.min)));
export function pressureGauge(bar: number | null | undefined) {
  const band = [frac(GAUGE.optimal[0]), frac(GAUGE.optimal[1])] as const;
  if (bar == null || !Number.isFinite(bar)) return { needle: 0, band, zone: 'NO_DATA' as const };
  const zone = bar < GAUGE.optimal[0] ? 'LOW' as const : bar > GAUGE.optimal[1] ? 'HIGH' as const : 'OPTIMAL' as const;
  return { needle: frac(bar), band, zone };
}

export const KNOB = 56;
export const ACTUATE_AT = 0.92;
/** Fraction of the knob's travel along the track (0..1). */
export const slideProgress = (dx: number, trackWidth: number, knob = KNOB) => Math.min(1, Math.max(0, dx / Math.max(1, trackWidth - knob)));
export const shouldActuate = (progress: number) => progress >= ACTUATE_AT;

export const fmtDMY = (ms: number) => { const d = new Date(ms); return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`; };

/** Data for the full-screen PHI lockout; null unless the scan is blocked. */
export function phiLockout(v: { status: string; safeHarvestUnlockDate?: number }, expectedHarvestDate: number | null | undefined) {
  if (v.status !== 'BLOCKED' || v.safeHarvestUnlockDate == null || expectedHarvestDate == null) return null;
  return { harvest: fmtDMY(expectedHarvestDate), safe: fmtDMY(v.safeHarvestUnlockDate), overDays: Math.ceil((v.safeHarvestUnlockDate - expectedHarvestDate) / DAY_MS) };
}
