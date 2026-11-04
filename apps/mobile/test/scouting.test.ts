import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { initMobileSchema, upsertRow, type SqlExecutor } from '../src/db/sql-store';
import { finishSession, recordSample, startSession, locateBlock, evaluateScan } from '../src/services/scouting';
import { betterSqliteExecutor } from './helpers';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const poly = { type: 'Polygon', coordinates: [[[108, 12], [108.01, 12], [108.01, 12.006], [108, 12.006], [108, 12]]] };
let exec: SqlExecutor;
beforeEach(async () => {
  exec = betterSqliteExecutor(new Database(':memory:'));
  await initMobileSchema(exec);
  const sys = { createdAt: NOW, updatedAt: NOW, deletedAt: null, syncStatus: 'SYNCED' };
  await upsertRow(exec, 'blocks', { id: 'b1', name: 'Lô 1', cropVariety: 'ROBUSTA', growthStage: 'RIPENING', treeCount: 1000, areaHectares: 70, boundaryGeoJson: JSON.stringify(poly), expectedHarvestDate: NOW + 20 * DAY, nominalDripFlowLph: 4, ...sys });
  await upsertRow(exec, 'blocks', { id: 'b2', name: 'Lô xa', cropVariety: 'ARABICA', growthStage: 'RIPENING', treeCount: 10, areaHectares: 1, boundaryGeoJson: JSON.stringify({ type: 'Polygon', coordinates: [[[109, 13], [109.01, 13], [109.01, 13.01], [109, 13.01], [109, 13]]] }), expectedHarvestDate: null, nominalDripFlowLph: 4, ...sys });
});

const seg = (ds: number) => ({ leafPixelCount: 1000, lesionPixelCount: ds * 10, dsIndexPct: ds, uncertaintyEntropy: 0.2, inferenceLatencyMs: 3, engineVersion: 'hsv-1.0.0' });
const sample = (sessionId: string, ds: number, layer: 'TOP' | 'MID' | 'LOW', checkpointId: string | null = null) =>
  recordSample(exec, { sessionId, checkpointId, canopyLayer: layer, latitude: 12.003, longitude: 108.005, imuStabilityScore: 0.4, result: seg(ds), imageRelativeKey: `2026-11/x.webp`, now: () => NOW });

describe('scouting session (phase 3)', () => {
  it('samples are stored PENDING with LOCAL_ONLY media; ids are UUIDv7', async () => {
    const s = await startSession(exec, { blockId: 'b1', workOrderId: null, deviceId: 'phone', now: () => NOW });
    const r = await sample(s.id, 10, 'LOW');
    expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    const [row] = await exec.all('select sync_status, media_sync_status, ds_index_pct from leaf_samples');
    expect(row).toEqual({ sync_status: 'PENDING', media_sync_status: 'LOCAL_ONLY', ds_index_pct: 10 });
  });

  it('finishSession computes DI/BSI with canopy weights and the rust recommendation', async () => {
    const s = await startSession(exec, { blockId: 'b1', workOrderId: null, deviceId: 'phone', now: () => NOW });
    await sample(s.id, 20, 'LOW'); await sample(s.id, 20, 'MID'); await sample(s.id, 0, 'TOP'); await sample(s.id, 0, 'TOP');
    const done = await finishSession(exec, s.id, () => NOW + 1000);
    expect(done.totalSamples).toBe(4);
    expect(done.diseaseIncidencePct).toBe(50);
    expect(done.blockSeverityIndexPct).toBeCloseTo((1.2 * 20 + 1.0 * 20) / (1.2 + 1 + 0.8 + 0.8), 9);
    expect(done.recommendationCode).toBe('LOCALIZED_SPOT_SPRAY');
    const [row] = await exec.all('select sync_status, completed_at, recommendation_code from scouting_sessions');
    expect(row).toEqual({ sync_status: 'PENDING', completed_at: NOW + 1000, recommendation_code: 'LOCALIZED_SPOT_SPRAY' });
  });

  it('finishSession refuses an empty session', async () => {
    const s = await startSession(exec, { blockId: 'b1', workOrderId: null, deviceId: 'phone', now: () => NOW });
    await expect(finishSession(exec, s.id, () => NOW)).rejects.toThrow(/no samples/i);
  });

  it('completes the linked work order', async () => {
    await upsertRow(exec, 'workOrders', { id: 'w1', blockId: 'b1', orderType: 'SCOUTING', status: 'OPEN', title: 't', instructionsJson: '{}', scheduledDate: NOW, completedAt: null, createdAt: NOW, updatedAt: NOW, deletedAt: null, syncStatus: 'SYNCED' });
    const s = await startSession(exec, { blockId: 'b1', workOrderId: 'w1', deviceId: 'phone', now: () => NOW });
    await sample(s.id, 1, 'MID');
    await finishSession(exec, s.id, () => NOW + 5);
    expect(await exec.all('select status, sync_status from work_orders')).toEqual([{ status: 'COMPLETED', sync_status: 'PENDING' }]);
  });
});

describe('chemical scanner (AC-22)', () => {
  const catalogue = [{ name: 'DEMO Fungicide', activeIngredient: 'x', phiDays: 30, barcodes: ['8930000000011'] }];
  it('finds the block that contains the GPS fix', async () => {
    expect((await locateBlock(exec, { latitude: 12.003, longitude: 108.005 }))?.id).toBe('b1');
    expect(await locateBlock(exec, { latitude: 0, longitude: 0 })).toBeNull();
  });
  it('red alert when the PHI would pass the expected harvest date, green otherwise', async () => {
    const b1 = (await locateBlock(exec, { latitude: 12.003, longitude: 108.005 }))!;
    const red = evaluateScan({ barcode: '8930000000011', catalogue, block: b1, nowMs: NOW });
    expect(red).toMatchObject({ status: 'BLOCKED', code: 'PHI_VIOLATION_BLOCKED' }); // 30 d > 20 d to harvest
    const b2 = (await exec.all<any>("select * from blocks where id = 'b2'"))[0];
    const green = evaluateScan({ barcode: '8930000000011', catalogue, block: { id: 'b2', expectedHarvestDate: b2.expected_harvest_date }, nowMs: NOW });
    expect(green.status).toBe('OK');
  });
  it('unknown barcode and unknown block are explicit, not silently OK', async () => {
    expect(evaluateScan({ barcode: '000', catalogue, block: { id: 'b1', expectedHarvestDate: NOW }, nowMs: NOW }).status).toBe('UNKNOWN_PRODUCT');
    expect(evaluateScan({ barcode: '8930000000011', catalogue, block: null, nowMs: NOW }).status).toBe('NO_BLOCK');
  });
});

describe('sync mark does not lose edits made during a cycle', () => {
  it('a session edited after collectPending stays PENDING', async () => {
    const { SqliteSyncStore } = await import('../src/db/sql-store');
    const store = new SqliteSyncStore(exec, 'phone');
    const s = await startSession(exec, { blockId: 'b1', workOrderId: null, deviceId: 'phone', now: () => NOW });
    const pushed = await store.collectPending();
    expect(pushed.scoutingSessions.map((r: any) => r.id)).toContain(s.id);
    await exec.run("UPDATE scouting_sessions SET total_samples = 9, updated_at = ?, sync_status = 'PENDING' WHERE id = ?", [NOW + 5, s.id]); // edited mid-cycle
    await store.markSynced([s.id]);
    const row = (await exec.all<{ sync_status: string }>('SELECT sync_status FROM scouting_sessions WHERE id = ?', [s.id]))[0];
    expect(row?.sync_status).toBe('PENDING');
  });
});
