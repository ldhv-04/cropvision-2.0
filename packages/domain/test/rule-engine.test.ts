import { describe, expect, it } from 'vitest';
import { decideCoffeeRustAction, checkPhi, evaluateAgronomicAction, PhiViolationError, DAY_MS } from '../src/rule-engine';

const samples = [
  { checkpointId: 'c1', dsIndexPct: 0 },
  { checkpointId: 'c2', dsIndexPct: 5 },
  { checkpointId: 'c3', dsIndexPct: 12 },
  { checkpointId: 'c4', dsIndexPct: 1 },
];

describe('decision matrix (AC-08)', () => {
  it('case 1', () => {
    const r = decideCoffeeRustAction({ bsiPct: 4.99, diPct: 14.9, treeCount: 1000, samples });
    expect(r.code).toBe('CULTURAL_CONTROL_ONLY');
    expect(r.sprayVolumeLiters).toBe(0);
  });
  it('case 2 picks DS>=5 checkpoints and 0.8 L per affected tree', () => {
    const r = decideCoffeeRustAction({ bsiPct: 5, diPct: 50, treeCount: 1000, samples });
    expect(r.code).toBe('LOCALIZED_SPOT_SPRAY');
    expect(r.affectedCheckpointIds).toEqual(['c2', 'c3']);
    expect(r.sprayVolumeLiters).toBeCloseTo(1000 * (2 / 4) * 0.8, 6);
  });
  it('case 3 boundary at 15', () => {
    expect(decideCoffeeRustAction({ bsiPct: 14.99, diPct: 90, treeCount: 10, samples }).code).toBe('LOCALIZED_SPOT_SPRAY');
    const r = decideCoffeeRustAction({ bsiPct: 15, diPct: 90, treeCount: 1000, samples });
    expect(r.code).toBe('BLOCK_WIDE_INTERVENTION');
    expect(r.sprayVolumeLiters).toBeCloseTo(800, 6);
  });
  it('assumption A10: low BSI but DI>=15 escalates to localized spray', () => {
    expect(decideCoffeeRustAction({ bsiPct: 2, diPct: 15, treeCount: 10, samples }).code).toBe('LOCALIZED_SPOT_SPRAY');
  });
});

describe('PHI lock (AC-09)', () => {
  const now = 1_700_000_000_000;
  it('blocks when now + phi days > harvest', () => {
    expect(() => checkPhi({ nowMs: now, phiDays: 10, expectedHarvestDate: now + 9 * DAY_MS })).toThrow(PhiViolationError);
    try { checkPhi({ nowMs: now, phiDays: 10, expectedHarvestDate: now + 9 * DAY_MS }); } catch (e: any) { expect(e.code).toBe('PHI_VIOLATION_BLOCKED'); }
  });
  it('allows exactly at the boundary and when no harvest date', () => {
    expect(checkPhi({ nowMs: now, phiDays: 10, expectedHarvestDate: now + 10 * DAY_MS }).safeHarvestUnlockDate).toBe(now + 10 * DAY_MS);
    expect(checkPhi({ nowMs: now, phiDays: 10, expectedHarvestDate: null }).ok).toBe(true);
  });
  it('evaluateAgronomicAction blocks a pesticide and reports the violation', () => {
    const r = evaluateAgronomicAction({
      kind: 'PESTICIDE', nowMs: now, block: { expectedHarvestDate: now + 5 * DAY_MS },
      product: { name: 'X', activeIngredient: 'a', phiDays: 14 },
    });
    expect(r.approved).toBe(false);
    expect(r.violations).toContain('PHI_VIOLATION_BLOCKED');
  });
  it('evaluateAgronomicAction approves a pesticide within PHI', () => {
    const r = evaluateAgronomicAction({
      kind: 'PESTICIDE', nowMs: now, block: { expectedHarvestDate: now + 40 * DAY_MS },
      product: { name: 'X', activeIngredient: 'a', phiDays: 14 },
    });
    expect(r.approved).toBe(true);
  });
});

describe('review hardening: bad numbers never approve a pesticide', () => {
  it('checkPhi rejects NaN / negative PHI days', () => {
    for (const phiDays of [NaN, -1, undefined as unknown as number]) expect(() => checkPhi({ nowMs: 0, phiDays, expectedHarvestDate: 10 * DAY_MS })).toThrow(RangeError);
  });
  it('decideCoffeeRustAction rejects NaN indices', () => {
    expect(() => decideCoffeeRustAction({ bsiPct: NaN, diPct: 0, treeCount: 10, samples: [] })).toThrow(RangeError);
  });
});
