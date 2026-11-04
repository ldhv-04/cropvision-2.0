import { planVenturiFertigation, type VenturiInput, type VenturiPlan } from './irrigation-lease';

export const DAY_MS = 86_400_000;
/** Standard coffee spray volume (SPEC §3.3). */
export const SPRAY_LITERS_PER_TREE = 0.8;
export const SPOT_DS_THRESHOLD_PCT = 5;

export type RustActionCode = 'CULTURAL_CONTROL_ONLY' | 'LOCALIZED_SPOT_SPRAY' | 'BLOCK_WIDE_INTERVENTION';
export interface RustInput {
  bsiPct: number; diPct: number; treeCount: number;
  samples: readonly { checkpointId?: string | null; dsIndexPct: number }[];
}
export interface RustDecision {
  code: RustActionCode; summary: string; affectedCheckpointIds: string[]; sprayVolumeLiters: number; chemicalRequired: boolean;
}

/**
 * SPEC §3.3. A10 (assumption): the matrix leaves BSI<5 with DI>=15 undefined; we escalate to
 * LOCALIZED_SPOT_SPRAY because high incidence means the disease is already widespread.
 */
export function decideCoffeeRustAction(i: RustInput): RustDecision {
  if (!Number.isFinite(i.bsiPct) || !Number.isFinite(i.diPct)) throw new RangeError('bsiPct and diPct must be finite numbers');
  if (i.bsiPct >= 15) {
    return { code: 'BLOCK_WIDE_INTERVENTION', chemicalRequired: true, affectedCheckpointIds: [], sprayVolumeLiters: i.treeCount * SPRAY_LITERS_PER_TREE,
      summary: 'Phun thuốc nội hấp toàn lô (kiểm tra thời gian cách ly PHI trước khi phun).' };
  }
  if (i.bsiPct >= 5 || i.diPct >= 15) {
    const hit = i.samples.filter((s) => s.dsIndexPct >= SPOT_DS_THRESHOLD_PCT);
    const fraction = i.samples.length ? hit.length / i.samples.length : 0;
    return { code: 'LOCALIZED_SPOT_SPRAY', chemicalRequired: true,
      affectedCheckpointIds: hit.flatMap((s) => (s.checkpointId ? [s.checkpointId] : [])),
      sprayVolumeLiters: i.treeCount * fraction * SPRAY_LITERS_PER_TREE,
      summary: 'Phun cục bộ tại các điểm chốt có DS >= 5%.' };
  }
  return { code: 'CULTURAL_CONTROL_ONLY', chemicalRequired: false, affectedCheckpointIds: [], sprayVolumeLiters: 0,
    summary: 'Chỉ biện pháp canh tác: tỉa cành tầng thấp bị bệnh, thông thoáng tán, tránh tưới phun trên tán.' };
}

export class PhiViolationError extends Error {
  readonly code = 'PHI_VIOLATION_BLOCKED';
  constructor(readonly safeHarvestUnlockDate: number, readonly expectedHarvestDate: number) {
    super(`PHI_VIOLATION_BLOCKED: harvest is safe only after ${new Date(safeHarvestUnlockDate).toISOString()}`);
  }
}

export interface PhiCheck { ok: true; safeHarvestUnlockDate: number; reason?: 'NO_HARVEST_DATE' }
/** A11 (assumption): a block with no expected harvest date has nothing to violate, so it is allowed but flagged. */
export function checkPhi(i: { nowMs: number; phiDays: number; expectedHarvestDate: number | null | undefined }): PhiCheck {
  if (!Number.isFinite(i.phiDays) || i.phiDays < 0 || !Number.isFinite(i.nowMs)) throw new RangeError('phiDays must be a finite number >= 0');
  const unlock = i.nowMs + i.phiDays * DAY_MS;
  if (i.expectedHarvestDate == null) return { ok: true, safeHarvestUnlockDate: unlock, reason: 'NO_HARVEST_DATE' };
  if (unlock > i.expectedHarvestDate) throw new PhiViolationError(unlock, i.expectedHarvestDate);
  return { ok: true, safeHarvestUnlockDate: unlock };
}

export interface PesticideProduct { name: string; activeIngredient: string; phiDays: number; barcodes?: string[] }
export function findPesticide(catalogue: readonly PesticideProduct[], barcodeOrName: string): PesticideProduct | undefined {
  const q = barcodeOrName.trim().toLowerCase();
  return catalogue.find((p) => p.barcodes?.includes(barcodeOrName.trim()) || p.name.toLowerCase() === q);
}

export type AgronomicActionInput =
  | { kind: 'PESTICIDE'; nowMs: number; block: { expectedHarvestDate: number | null }; product: PesticideProduct }
  | { kind: 'FERTIGATION'; nowMs: number; block: { expectedHarvestDate: number | null }; venturi: VenturiInput };

export interface AgronomicVerdict {
  approved: boolean; violations: 'PHI_VIOLATION_BLOCKED'[]; safeHarvestUnlockDate?: number; fertigation?: VenturiPlan;
}

export function evaluateAgronomicAction(a: AgronomicActionInput): AgronomicVerdict {
  if (a.kind === 'FERTIGATION') return { approved: true, violations: [], fertigation: planVenturiFertigation(a.venturi) };
  try {
    const c = checkPhi({ nowMs: a.nowMs, phiDays: a.product.phiDays, expectedHarvestDate: a.block.expectedHarvestDate });
    return { approved: true, violations: [], safeHarvestUnlockDate: c.safeHarvestUnlockDate };
  } catch (e) {
    if (e instanceof PhiViolationError) return { approved: false, violations: [e.code], safeHarvestUnlockDate: e.safeHarvestUnlockDate };
    throw e;
  }
}
