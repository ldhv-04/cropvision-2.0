import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { eq } from 'drizzle-orm';
import { leafSamples, blocks, scoutingSessions } from '@cropvision/schema';
import { SCHEMA_VERSION, handshakeSchema, pullResponseSchema, pushResponseSchema } from '@cropvision/sync-protocol';
import { openDb } from '../src/main/db';
import { createHub, type Hub } from '../src/main/lan-server';

const now = 1_700_000_000_000;
const block = (over: object = {}) => ({
  id: 'b1', name: 'Lô 1', cropVariety: 'ROBUSTA', growthStage: 'FRUIT_DEVELOPMENT', treeCount: 100, areaHectares: 1,
  boundaryGeoJson: '{}', expectedHarvestDate: null, nominalDripFlowLph: 4, createdAt: 1, updatedAt: now, deletedAt: null, syncStatus: 'PENDING', ...over,
}) as any;
const session = (over: object = {}) => ({
  id: 'ss1', blockId: 'b1', workOrderId: null, deviceId: 'd', startedAt: now, completedAt: now, totalSamples: 1, diseaseIncidencePct: 100,
  blockSeverityIndexPct: 10, recommendationCode: null, recommendationSummary: null, createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'PENDING', ...over,
}) as any;
const sample = (over: object = {}) => ({
  id: 's1', sessionId: 'ss1', checkpointId: null, canopyLayer: 'LOW', latitude: 12, longitude: 108, imuStabilityScore: 0.2,
  leafPixelCount: 100, lesionPixelCount: 10, dsIndexPct: 10, uncertaintyEntropy: 0, inferenceLatencyMs: 1, engineVersion: 'hsv-1.0.0',
  imageRelativeKey: '2026-11/s1.webp', mediaSyncStatus: 'LOCAL_ONLY', capturedAt: now, createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'PENDING', ...over,
}) as any;
const push = (o: object = {}) => ({ deviceId: 'd', scoutingSessions: [], leafSamples: [], agronomicLogs: [], workOrders: [], irrigationLeases: [], ...o });
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(32, 7)]);

let dir: string, hub: Hub, ctx: ReturnType<typeof openDb>;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cv-hub-'));
  ctx = openDb(join(dir, 'db.sqlite'));
  hub = await createHub({ ...ctx, mediaDir: join(dir, 'media'), hubId: 'hub-1', farmName: 'Farm' });
  ctx.db.insert(blocks).values(block()).run();
});
afterEach(async () => { await hub.close(); ctx.sqlite.close(); rmSync(dir, { recursive: true, force: true }); });

describe('database', () => {
  it('uses WAL + synchronous NORMAL (SPEC phase 2)', () => {
    expect(ctx.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(ctx.sqlite.pragma('synchronous', { simple: true })).toBe(1);
  });
});

describe('LAN hub (AC-14)', () => {
  it('handshake reports schema version and hub identity', async () => {
    const r = await hub.app.inject('/api/v1/handshake');
    const hs = handshakeSchema.parse(r.json());
    expect(hs).toMatchObject({ hubId: 'hub-1', farmName: 'Farm', schemaVersion: SCHEMA_VERSION });
  });

  it('pull returns only the 4 desktop-owned tables, updated after `since`', async () => {
    const all = pullResponseSchema.parse((await hub.app.inject('/api/v1/sync/pull?since=0')).json());
    expect(all.blocks.map((b) => b.id)).toEqual(['b1']);
    const none = pullResponseSchema.parse((await hub.app.inject(`/api/v1/sync/pull?since=${now}`)).json());
    expect(none.blocks).toEqual([]);
    expect((await hub.app.inject('/api/v1/sync/pull?since=abc')).statusCode).toBe(400);
  });

  it('push upserts in one transaction, acks ids and lists samples with missing media', async () => {
    const r = await hub.app.inject({ method: 'POST', url: '/api/v1/sync/push', payload: push({ scoutingSessions: [session()], leafSamples: [sample()] }) });
    expect(r.statusCode).toBe(200);
    const res = pushResponseSchema.parse(r.json());
    expect(res.acknowledgedIds.sort()).toEqual(['s1', 'ss1']);
    expect(res.missingMediaSampleIds).toEqual(['s1']);
    expect(ctx.db.select().from(leafSamples).get()?.syncStatus).toBe('SYNCED');
  });

  it('push rolls back everything when one row violates a constraint', async () => {
    const r = await hub.app.inject({ method: 'POST', url: '/api/v1/sync/push', payload: push({ scoutingSessions: [session()], leafSamples: [sample({ sessionId: 'nope' })] }) });
    expect(r.statusCode).toBe(409);
    expect(ctx.db.select().from(scoutingSessions).all()).toEqual([]);
  });

  it('push rejects invalid payloads and is idempotent / LWW', async () => {
    expect((await hub.app.inject({ method: 'POST', url: '/api/v1/sync/push', payload: { deviceId: 'd' } })).statusCode).toBe(400);
    const send = (s: object) => hub.app.inject({ method: 'POST', url: '/api/v1/sync/push', payload: push({ scoutingSessions: [s] }) });
    await send(session({ recommendationCode: 'NEW', updatedAt: now + 10 }));
    await send(session({ recommendationCode: 'OLD', updatedAt: now + 5 })); // older: must not overwrite
    expect(ctx.db.select().from(scoutingSessions).get()?.recommendationCode).toBe('NEW');
  });

  it('media PUT stores the WebP, verifies, updates the row and emits SESSION_UPDATED over WebSocket', async () => {
    await hub.app.inject({ method: 'POST', url: '/api/v1/sync/push', payload: push({ scoutingSessions: [session()], leafSamples: [sample()] }) });
    const address = await hub.listen(0, '127.0.0.1');
    const ws = new WebSocket(`${address.replace('http', 'ws')}/ws`);
    const got = new Promise<any>((resolve) => ws.on('message', (m) => { const e = JSON.parse(String(m)); if (e.sampleId) resolve(e); }));
    await new Promise((r) => ws.on('open', r));

    const res = await fetch(`${address}/api/v1/media/s1`, { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: WEBP });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sampleId: 's1', bytes: WEBP.length, mediaSyncStatus: 'VERIFIED' });
    expect(readFileSync(join(dir, 'media', '2026-11', 's1.webp')).equals(WEBP)).toBe(true);
    expect(ctx.db.select().from(leafSamples).where(eq(leafSamples.id, 's1')).get()?.mediaSyncStatus).toBe('VERIFIED');
    expect(await got).toMatchObject({ type: 'SESSION_UPDATED', sessionId: 'ss1', sampleId: 's1' });
    ws.close();

    // next push no longer reports it missing
    const again = pushResponseSchema.parse((await hub.app.inject({ method: 'POST', url: '/api/v1/sync/push', payload: push({ leafSamples: [sample()] }) })).json());
    expect(again.missingMediaSampleIds).toEqual([]);
  });

  it('media PUT rejects non-webp, empty, bogus content, unknown sample and path traversal', async () => {
    await hub.app.inject({ method: 'POST', url: '/api/v1/sync/push', payload: push({ scoutingSessions: [session()], leafSamples: [sample(), sample({ id: 's2', imageRelativeKey: '../../evil.webp' })] }) });
    const put = (id: string, body: any, type = 'image/webp') => hub.app.inject({ method: 'PUT', url: `/api/v1/media/${id}`, headers: { 'content-type': type }, payload: body });
    expect((await put('s1', WEBP, 'image/png')).statusCode).toBe(415);
    expect((await put('s1', Buffer.alloc(0))).statusCode).toBe(422);
    expect((await put('s1', Buffer.from('not an image at all, sorry'))).statusCode).toBe(422);
    expect((await put('zzz', WEBP)).statusCode).toBe(404);
    expect((await put('s2', WEBP)).statusCode).toBe(400);
    expect(existsSync(join(dir, '..', 'evil.webp'))).toBe(false);
    expect(ctx.db.select().from(leafSamples).where(eq(leafSamples.id, 's1')).get()?.mediaSyncStatus).toBe('LOCAL_ONLY');
  });
});
