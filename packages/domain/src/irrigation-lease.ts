export type LeaseMode = 'DRIP_IRRIGATION' | 'VENTURI_FERTIGATION';
export type LeaseStatus = 'ISSUED' | 'ACTIVE' | 'COMPLETED' | 'ABORTED_PRESSURE_FAULT' | 'ABORTED_FLOW_FAULT' | 'EXPIRED';
const TERMINAL: readonly LeaseStatus[] = ['COMPLETED', 'ABORTED_PRESSURE_FAULT', 'ABORTED_FLOW_FAULT', 'EXPIRED'];

export const DEFAULT_MIN_PRESSURE_BAR = 2.0;
export const DEFAULT_MAX_PRESSURE_BAR = 3.5;
export const VENTURI_TARGET_BAR = 2.5;
export const VENTURI_BAND_BAR: readonly [number, number] = [2.3, 2.7];
export const FLUSH_SEC = 900;
/** No flow at all this long after activation is a flow fault. */
export const NO_FLOW_GRACE_SEC = 60;
/** Delivered volume beyond max by more than this ratio is a flow fault. */
export const OVERSHOOT_RATIO = 1.05;

export interface Lease {
  id: string; blockId: string; mode: LeaseMode; status: LeaseStatus;
  maxDurationSec: number; maxVolumeLiters: number;
  minPressureBar: number; maxPressureBar: number; requiredPressureBar: number;
  actualVolumeLiters: number; averagePressureBar: number | null; pressureSamples: number;
  issuedAt: number; completedAt: number | null;
}
export interface LeaseInput {
  id: string; blockId: string; mode: LeaseMode; maxDurationSec: number; maxVolumeLiters: number; issuedAt: number;
  minPressureBar?: number; maxPressureBar?: number; requiredPressureBar?: number;
}
export interface Telemetry { elapsedSec: number; pressureBar: number; volumeLiters: number }

export function createLease(i: LeaseInput): Lease {
  const min = i.minPressureBar ?? DEFAULT_MIN_PRESSURE_BAR, max = i.maxPressureBar ?? DEFAULT_MAX_PRESSURE_BAR;
  if (![i.maxDurationSec, i.maxVolumeLiters, min, max].every(Number.isFinite)) throw new RangeError('lease bounds must be finite numbers');
  if (!(i.maxDurationSec > 0) || !(i.maxVolumeLiters > 0)) throw new RangeError('lease must be bounded by duration and volume');
  if (!(min > 0) || !(max > min)) throw new RangeError('invalid pressure bounds');
  return {
    id: i.id, blockId: i.blockId, mode: i.mode, status: 'ISSUED',
    maxDurationSec: i.maxDurationSec, maxVolumeLiters: i.maxVolumeLiters,
    minPressureBar: min, maxPressureBar: max, requiredPressureBar: i.requiredPressureBar ?? VENTURI_TARGET_BAR,
    actualVolumeLiters: 0, averagePressureBar: null, pressureSamples: 0, issuedAt: i.issuedAt, completedAt: null,
  };
}

export function activateLease(l: Lease): Lease {
  if (l.status !== 'ISSUED') throw new Error(`cannot activate a lease in ${l.status}`);
  return { ...l, status: 'ACTIVE' };
}

/** Pure transition. Terminal states are final. shortcut: pressure is checked from the first sample (no ramp-up grace); add one if hardware needs it. */
export function applyTelemetry(l: Lease, t: Telemetry, nowMs: number = Date.now()): Lease {
  if (l.status !== 'ACTIVE') return l;
  // Garbage telemetry must never keep a valve open: every comparison below is false for NaN, so fail safe first.
  if (![t.elapsedSec, t.pressureBar, t.volumeLiters].every(Number.isFinite)) return { ...l, status: 'ABORTED_PRESSURE_FAULT', completedAt: nowMs };
  const samples = l.pressureSamples + 1;
  const next: Lease = {
    ...l, actualVolumeLiters: t.volumeLiters, pressureSamples: samples,
    averagePressureBar: ((l.averagePressureBar ?? 0) * l.pressureSamples + t.pressureBar) / samples,
  };
  const end = (status: LeaseStatus): Lease => ({ ...next, status, completedAt: nowMs });
  if (t.pressureBar < l.minPressureBar || t.pressureBar > l.maxPressureBar) return end('ABORTED_PRESSURE_FAULT');
  if (t.volumeLiters > l.maxVolumeLiters * OVERSHOOT_RATIO) return end('ABORTED_FLOW_FAULT');
  if (t.elapsedSec >= NO_FLOW_GRACE_SEC && t.volumeLiters <= 0) return end('ABORTED_FLOW_FAULT');
  if (t.volumeLiters >= l.maxVolumeLiters) return end('COMPLETED');
  if (t.elapsedSec >= l.maxDurationSec) return end('EXPIRED');
  return next;
}

export const isTerminal = (s: LeaseStatus) => TERMINAL.includes(s);

// ---- CRC32 frame sent to LoRa/MQTT hardware ----
let table: Uint32Array | undefined;
export function crc32(input: string | Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const framePayload = (p: { lease_id: string; block_id: string; max_duration_sec: number; max_volume_liters: number; min_pressure_bar: number; max_pressure_bar: number }) =>
  JSON.stringify({
    lease_id: p.lease_id, block_id: p.block_id, max_duration_sec: p.max_duration_sec,
    max_volume_liters: p.max_volume_liters, min_pressure_bar: p.min_pressure_bar, max_pressure_bar: p.max_pressure_bar,
  });

export function encodeLeaseFrame(l: Lease): string {
  const p = {
    lease_id: l.id, block_id: l.blockId, max_duration_sec: l.maxDurationSec,
    max_volume_liters: l.maxVolumeLiters, min_pressure_bar: l.minPressureBar, max_pressure_bar: l.maxPressureBar,
  };
  return JSON.stringify({ ...p, crc32: crc32(framePayload(p)) });
}

export function verifyLeaseFrame(frame: string): boolean {
  try {
    const { crc32: sum, ...p } = JSON.parse(frame);
    return typeof sum === 'number' && crc32(framePayload(p)) === sum;
  } catch { return false; }
}

// ---- Venturi fertigation plan ----
export interface VenturiInput {
  treeCount: number; dripFlowLph: number; waterPerTreeLiters: number; fertilizerGramsPerTree: number;
  injectorRateLph: number; stabilizeMaxSec?: number;
}
export interface VenturiPhase { phase: 'A_PREWET_STABILIZE' | 'B_INJECTION' | 'C_FLUSH'; durationSec: number; minPressureBar: number; maxPressureBar: number; targetPressureBar: number }
export interface VenturiPlan {
  totalWaterLiters: number; totalFertilizerKg: number; lineFlowLph: number; injectedSolutionLiters: number;
  phases: [VenturiPhase, VenturiPhase, VenturiPhase];
  lease: { mode: 'VENTURI_FERTIGATION'; maxDurationSec: number; maxVolumeLiters: number; minPressureBar: number; maxPressureBar: number; requiredPressureBar: number };
}

export function planVenturiFertigation(i: VenturiInput): VenturiPlan {
  for (const [k, v] of Object.entries({ treeCount: i.treeCount, dripFlowLph: i.dripFlowLph, waterPerTreeLiters: i.waterPerTreeLiters, injectorRateLph: i.injectorRateLph }))
    if (!(v > 0)) throw new RangeError(`${k} must be > 0`);
  if (!(i.fertilizerGramsPerTree >= 0)) throw new RangeError('fertilizerGramsPerTree must be >= 0');
  const totalWater = i.treeCount * i.waterPerTreeLiters;
  const lineFlow = i.treeCount * i.dripFlowLph;
  const injectSec = Math.round((totalWater / lineFlow) * 3600);
  const stabilizeSec = i.stabilizeMaxSec ?? 300;
  const [lo, hi] = VENTURI_BAND_BAR;
  const ph = (phase: VenturiPhase['phase'], durationSec: number): VenturiPhase => ({ phase, durationSec, minPressureBar: lo, maxPressureBar: hi, targetPressureBar: VENTURI_TARGET_BAR });
  const phases: VenturiPlan['phases'] = [ph('A_PREWET_STABILIZE', stabilizeSec), ph('B_INJECTION', injectSec), ph('C_FLUSH', FLUSH_SEC)];
  return {
    totalWaterLiters: totalWater,
    totalFertilizerKg: (i.treeCount * i.fertilizerGramsPerTree) / 1000,
    lineFlowLph: lineFlow,
    injectedSolutionLiters: (i.injectorRateLph * injectSec) / 3600,
    phases,
    lease: {
      mode: 'VENTURI_FERTIGATION', maxDurationSec: phases.reduce((s, p) => s + p.durationSec, 0),
      // water of the whole cycle: stabilize + inject + flush all run at line flow
      maxVolumeLiters: (lineFlow * phases.reduce((s, p) => s + p.durationSec, 0)) / 3600,
      minPressureBar: DEFAULT_MIN_PRESSURE_BAR, maxPressureBar: DEFAULT_MAX_PRESSURE_BAR, requiredPressureBar: VENTURI_TARGET_BAR,
    },
  };
}

// ---- microclimate risk hours ----
export interface ClimateReading { tempC: number; humidityPct: number }
export interface RiskThresholds { minHumidityPct: number; minTempC: number; maxTempC: number }
/** Thresholds are caller-supplied: they are agronomic parameters, not hard-coded facts (see UNVERIFIED.md). One reading = one hour. */
export function countRiskHours(readings: readonly ClimateReading[], t: RiskThresholds): number {
  return readings.filter((r) => r.humidityPct >= t.minHumidityPct && r.tempC >= t.minTempC && r.tempC <= t.maxTempC).length;
}
