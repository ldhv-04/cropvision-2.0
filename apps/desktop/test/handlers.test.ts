import { beforeEach, describe, expect, it } from 'vitest';
import { pointInPolygon } from '@cropvision/domain';
import { openDb } from '../src/main/db';
import { createHandlers } from '../src/main/ipc-handlers';
import { LeaseManager } from '../src/main/lease-manager';
import { SimulatedIrrigationController } from '@cropvision/domain';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const poly = { type: 'Polygon' as const, coordinates: [[[108, 12], [108.01, 12], [108.01, 12.006], [108, 12.006], [108, 12]]] };
let h: ReturnType<typeof createHandlers>;
beforeEach(() => {
  const ctx = openDb(':memory:');
  const ctrl = new SimulatedIrrigationController();
  h = createHandlers({ db: ctx.db, leases: new LeaseManager(ctx.db, ctrl, () => NOW), hubInfo: () => ({ port: 1, hubId: 'h', farmName: 'f', addresses: [], mdns: false }), now: () => NOW });
});
const mkBlock = (over = {}) => h.saveBlock({ name: 'Lô A', cropVariety: 'ROBUSTA', growthStage: 'FRUIT_DEVELOPMENT', treeCount: 500, boundary: poly, expectedHarvestDate: NOW + 20 * DAY, ...over });

describe('desktop handlers (AC-17 logic)', () => {
  it('saveBlock stores the polygon, computes area and rejects invalid input', async () => {
    const b = await mkBlock();
    expect(b.areaHectares).toBeGreaterThan(70);
    expect(b.syncStatus).toBe('PENDING');
    expect(await h.listBlocks()).toHaveLength(1);
    await expect(mkBlock({ treeCount: -1 })).rejects.toThrow();
    await expect(mkBlock({ boundary: { type: 'Polygon', coordinates: [[[0, 0]]] } })).rejects.toThrow();
  });

  it('generateCheckpoints writes N inside points, replacing the old route', async () => {
    const b = await mkBlock();
    await h.generateCheckpoints(b.id, 10);
    const cps = await h.generateCheckpoints(b.id, 5);
    expect(cps).toHaveLength(5);
    cps.forEach((c) => expect(pointInPolygon([c.longitude, c.latitude], poly.coordinates[0]!)).toBe(true));
    expect(await h.listCheckpoints(b.id)).toHaveLength(5);
  });

  it('deleteBlock is a soft delete (kept for sync)', async () => {
    const b = await mkBlock();
    await h.deleteBlock(b.id);
    expect(await h.listBlocks()).toHaveLength(0);
  });

  it('work orders: create, list, change status', async () => {
    const b = await mkBlock();
    const w = await h.createWorkOrder({ blockId: b.id, orderType: 'SCOUTING', title: 'Khảo sát', scheduledDate: NOW, instructions: { points: 10 } });
    expect(JSON.parse(w.instructionsJson)).toEqual({ points: 10 });
    await h.setWorkOrderStatus(w.id, 'COMPLETED');
    expect((await h.listWorkOrders())[0]).toMatchObject({ status: 'COMPLETED' });
  });

  it('PHI ledger: pesticide beyond the harvest window is blocked and not stored', async () => {
    const b = await mkBlock();
    const log = { blockId: b.id, actionCategory: 'PESTICIDE' as const, productName: 'X', activeIngredient: 'a', quantityApplied: 2, unit: 'LITER' as const, totalCostVnd: 100_000, preHarvestIntervalDays: 30, executedAt: NOW };
    await expect(h.addLog(log)).rejects.toThrow(/PHI_VIOLATION_BLOCKED/);
    expect(await h.listLogs()).toHaveLength(0);
    const ok = await h.addLog({ ...log, preHarvestIntervalDays: 10 });
    expect(ok.safeHarvestUnlockDate).toBe(NOW + 10 * DAY);
  });

  it('non-pesticide logs are accepted; cost summary sums per block; PHI status flags a harvest lock', async () => {
    const b = await mkBlock();
    await h.addLog({ blockId: b.id, actionCategory: 'FERTILIZER', productName: 'NPK', quantityApplied: 50, unit: 'KG', totalCostVnd: 500_000, preHarvestIntervalDays: 0, executedAt: NOW });
    await h.addLog({ blockId: b.id, actionCategory: 'PESTICIDE', productName: 'Y', quantityApplied: 1, unit: 'LITER', totalCostVnd: 250_000, preHarvestIntervalDays: 7, executedAt: NOW });
    expect(await h.costSummary()).toEqual([{ blockId: b.id, blockName: 'Lô A', totalCostVnd: 750_000 }]);
    const [st] = await h.phiStatus();
    expect(st).toMatchObject({ blockId: b.id, harvestLockedUntil: NOW + 7 * DAY, conflictsWithExpectedHarvest: false });
  });

  it('fertigation plan + lease issue/list/abort', async () => {
    const b = await mkBlock();
    const plan = await h.planFertigation({ treeCount: 500, dripFlowLph: 4, waterPerTreeLiters: 2, fertilizerGramsPerTree: 30, injectorRateLph: 100 });
    expect(plan.phases[2]!.durationSec).toBe(900);
    const l = await h.issueLease({ blockId: b.id, ...plan.lease });
    expect(l.status).toBe('ACTIVE');
    expect(await h.listLeases()).toHaveLength(1);
    await h.abortLease(l.id);
    expect((await h.listLeases())[0]!.status).toBe('EXPIRED');
  });

  it('sessions list is empty at start; media URLs use cv-media:// (no base64)', async () => {
    expect(await h.listSessions()).toEqual([]);
    expect(h.mediaUrl('2026-11/s 1.webp')).toBe('cv-media://media/2026-11/s%201.webp');
  });
});
