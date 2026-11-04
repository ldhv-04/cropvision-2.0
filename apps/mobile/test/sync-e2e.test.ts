import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { blocks, scoutingCheckpoints, workOrders } from '@cropvision/schema';
import { openDb } from '../../desktop/src/main/db';
import { createHub, type Hub } from '../../desktop/src/main/lan-server';
import { initMobileSchema, upsertRow } from '../src/db/sql-store';
import { syncWithHub } from '../src/services/sync-client';
import { betterSqliteExecutor } from './helpers';

const now = Date.now();
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x60, 0x90, 0x01, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(100_000, 9)]);
const sys = { createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'PENDING' as const };

let dir: string, hub: Hub, hubDb: ReturnType<typeof openDb>, url: string;
let mobile: Database.Database, exec: ReturnType<typeof betterSqliteExecutor>;

const upload = (failOn: Set<string> = new Set()) => async (u: string, file: string) => {
  const id = u.split('/').pop()!;
  if (failOn.has(id)) throw new Error('wifi dropped');
  const r = await fetch(u, { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: readFileSync(file) });
  if (!r.ok) throw new Error(`upload ${r.status}`);
};
const mediaUri = (id: string) => join(dir, 'phone-media', `${id}.webp`);

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cv-sync-'));
  hubDb = openDb(join(dir, 'hub.sqlite'));
  hub = await createHub({ ...hubDb, mediaDir: join(dir, 'hub-media'), hubId: 'hub-1', farmName: 'Farm' });
  url = await hub.listen(0, '127.0.0.1');
  hubDb.db.insert(blocks).values({ id: 'b1', name: 'Lô 1', cropVariety: 'ROBUSTA', growthStage: 'RIPENING', treeCount: 10, areaHectares: 1, boundaryGeoJson: '{}', ...sys, syncStatus: 'SYNCED' }).run();
  hubDb.db.insert(scoutingCheckpoints).values({ id: 'c1', blockId: 'b1', sequenceOrder: 1, latitude: 12, longitude: 108, ...sys }).run();
  hubDb.db.insert(workOrders).values({ id: 'w1', blockId: 'b1', orderType: 'SCOUTING', title: 'Khảo sát', instructionsJson: '{}', scheduledDate: now, ...sys }).run();
  mobile = new Database(':memory:');
  exec = betterSqliteExecutor(mobile);
  await initMobileSchema(exec);
});
afterEach(async () => { await hub.close(); hubDb.sqlite.close(); mobile.close(); rmSync(dir, { recursive: true, force: true }); });

async function seedSession(n: number) {
  await upsertRow(exec, 'scoutingSessions', { id: 'ss1', blockId: 'b1', workOrderId: 'w1', deviceId: 'phone', startedAt: now, completedAt: now, totalSamples: n, diseaseIncidencePct: 50, blockSeverityIndexPct: 8, recommendationCode: 'LOCALIZED_SPOT_SPRAY', recommendationSummary: 'x', ...sys });
  for (let i = 0; i < n; i++) {
    const id = `s${i}`;
    mkdirSync(dirname(mediaUri(id)), { recursive: true });
    writeFileSync(mediaUri(id), WEBP);
    await upsertRow(exec, 'leafSamples', { id, sessionId: 'ss1', checkpointId: 'c1', canopyLayer: (['TOP', 'MID', 'LOW'] as const)[i % 3]!, latitude: 12 + i * 1e-5, longitude: 108, imuStabilityScore: 0.3, leafPixelCount: 1000, lesionPixelCount: i * 10, dsIndexPct: i, uncertaintyEntropy: 0.1, inferenceLatencyMs: 4, engineVersion: 'hsv-1.0.0', imageRelativeKey: `2026-11/${id}.webp`, mediaSyncStatus: 'LOCAL_ONLY', capturedAt: now, ...sys });
  }
}

describe('mobile ⇄ real desktop hub (AC-20)', () => {
  it('pull → push → media → SYNCED: 10 photos land on the desktop in < 5 s', async () => {
    await seedSession(10);
    const t0 = Date.now();
    const r = await syncWithHub(url, exec, { deviceId: 'phone', mediaUri, upload: upload() });
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(5000);
    expect(r).toMatchObject({ pulled: 3, pushed: 11, mediaUploaded: 10, mediaFailed: [] });

    // phone got the desktop's block/checkpoint/work order
    expect((await exec.all('select id from blocks')).map((x: any) => x.id)).toEqual(['b1']);
    expect(await exec.all('select id from scouting_checkpoints')).toHaveLength(1);
    expect(await exec.all('select id from work_orders')).toHaveLength(1);
    // hub has the session, 10 samples, all VERIFIED with real files
    expect(hubDb.sqlite.prepare('select count(*) c from leaf_samples where media_sync_status = ?').get('VERIFIED')).toEqual({ c: 10 });
    for (let i = 0; i < 10; i++) expect(existsSync(join(dir, 'hub-media', '2026-11', `s${i}.webp`))).toBe(true);
    expect(hubDb.sqlite.prepare('select block_severity_index_pct b from scouting_sessions').get()).toEqual({ b: 8 });
    // phone marked everything SYNCED
    expect(await exec.all("select id from leaf_samples where sync_status != 'SYNCED'")).toEqual([]);
    expect(await exec.all("select id from scouting_sessions where sync_status != 'SYNCED'")).toEqual([]);
    console.log(`10-sample sync took ${ms} ms`);
  });

  it('a dropped upload keeps that sample PENDING and the next sync finishes it', async () => {
    await seedSession(3);
    const r1 = await syncWithHub(url, exec, { deviceId: 'phone', mediaUri, upload: upload(new Set(['s1'])) });
    expect(r1.mediaFailed).toEqual(['s1']);
    expect((await exec.all("select id from leaf_samples where sync_status = 'PENDING'")).map((x: any) => x.id)).toEqual(['s1']);

    const r2 = await syncWithHub(url, exec, { deviceId: 'phone', mediaUri, upload: upload() });
    expect(r2.mediaUploaded).toBe(1);
    expect(await exec.all("select id from leaf_samples where sync_status = 'PENDING'")).toEqual([]);
    expect(hubDb.sqlite.prepare('select count(*) c from leaf_samples where media_sync_status = ?').get('VERIFIED')).toEqual({ c: 3 });
  });

  it('is idempotent: a second sync with nothing new pushes nothing', async () => {
    await seedSession(2);
    await syncWithHub(url, exec, { deviceId: 'phone', mediaUri, upload: upload() });
    const r = await syncWithHub(url, exec, { deviceId: 'phone', mediaUri, upload: upload() });
    expect(r).toMatchObject({ pushed: 0, mediaUploaded: 0 });
  });

  it('LWW on pull: a newer local edit is not overwritten by an older hub copy', async () => {
    await syncWithHub(url, exec, { deviceId: 'phone', mediaUri, upload: upload() });
    await exec.run("update work_orders set title = 'Sửa trên điện thoại', updated_at = ?, sync_status = 'PENDING' where id = 'w1'", [now + 60_000]);
    await syncWithHub(url, exec, { deviceId: 'phone', mediaUri, upload: upload() });
    expect(hubDb.sqlite.prepare("select title from work_orders where id = 'w1'").get()).toEqual({ title: 'Sửa trên điện thoại' });
  });

  it('refuses an unreachable hub with a clear error', async () => {
    await expect(syncWithHub('http://127.0.0.1:9', exec, { deviceId: 'phone', mediaUri, upload: upload() })).rejects.toThrow();
  });
});
