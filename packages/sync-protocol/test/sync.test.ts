import { describe, expect, it } from 'vitest';
import { handshakeSchema, pullResponseSchema, pushBodySchema, pushResponseSchema, SCHEMA_VERSION } from '../src/contracts';
import { shouldApply, runSyncCycle, type SyncStore, type SyncTransport } from '../src/sync-engine';

const block = {
  id: '0193-a', name: 'Lô 1', cropVariety: 'ROBUSTA', growthStage: 'FRUIT_DEVELOPMENT', treeCount: 100, areaHectares: 1,
  boundaryGeoJson: '{}', expectedHarvestDate: null, nominalDripFlowLph: 4, createdAt: 1, updatedAt: 2, deletedAt: null, syncStatus: 'SYNCED',
};
const sample = {
  id: 's1', sessionId: 'ss1', checkpointId: null, canopyLayer: 'LOW', latitude: 12, longitude: 108, imuStabilityScore: 0.3,
  leafPixelCount: 100, lesionPixelCount: 10, dsIndexPct: 10, uncertaintyEntropy: 0.1, inferenceLatencyMs: 5, engineVersion: 'hsv-1.0.0',
  imageRelativeKey: '2026-11/s1.webp', mediaSyncStatus: 'LOCAL_ONLY', capturedAt: 5, createdAt: 5, updatedAt: 5, deletedAt: null, syncStatus: 'PENDING',
};

describe('contracts (AC-13)', () => {
  it('handshake', () => {
    expect(handshakeSchema.safeParse({ hubId: 'h', farmName: 'f', version: '2.0.0', schemaVersion: SCHEMA_VERSION, serverTime: 1 }).success).toBe(true);
    expect(handshakeSchema.safeParse({ hubId: 'h' }).success).toBe(false);
  });
  it('pull response validates rows', () => {
    const ok = { serverTime: 10, blocks: [block], scoutingCheckpoints: [], workOrders: [], irrigationLeases: [] };
    expect(pullResponseSchema.safeParse(ok).success).toBe(true);
    expect(pullResponseSchema.safeParse({ ...ok, blocks: [{ ...block, cropVariety: 'TEA' }] }).success).toBe(false);
  });
  it('push body validates and rejects unknown enum / missing field', () => {
    const body = { deviceId: 'd', scoutingSessions: [], leafSamples: [sample], agronomicLogs: [], workOrders: [], irrigationLeases: [] };
    expect(pushBodySchema.safeParse(body).success).toBe(true);
    expect(pushBodySchema.safeParse({ ...body, leafSamples: [{ ...sample, canopyLayer: 'ROOT' }] }).success).toBe(false);
    expect(pushBodySchema.safeParse({ ...body, leafSamples: [{ ...sample, imageRelativeKey: undefined }] }).success).toBe(false);
    expect(pushBodySchema.safeParse({ deviceId: 'd' }).success).toBe(false);
  });
  it('push response', () => {
    expect(pushResponseSchema.safeParse({ acknowledgedIds: ['a'], missingMediaSampleIds: [] }).success).toBe(true);
    expect(pushResponseSchema.safeParse({ acknowledgedIds: 'a' }).success).toBe(false);
  });
});

describe('LWW (AC-13)', () => {
  it('applies when incoming is newer or equal, skips when older, applies when no local', () => {
    expect(shouldApply(undefined, { updatedAt: 1 })).toBe(true);
    expect(shouldApply({ updatedAt: 5 }, { updatedAt: 5 })).toBe(true);
    expect(shouldApply({ updatedAt: 5 }, { updatedAt: 6 })).toBe(true);
    expect(shouldApply({ updatedAt: 6 }, { updatedAt: 5 })).toBe(false);
  });
});

function fakes(opts: { failMediaOnce?: boolean } = {}) {
  const log: string[] = [];
  let failed = !opts.failMediaOnce;
  const synced = new Set<string>();
  const t: SyncTransport = {
    async handshake() { log.push('handshake'); return { hubId: 'h', farmName: 'f', version: '2.0.0', schemaVersion: SCHEMA_VERSION, serverTime: 1 }; },
    async pull(since) { log.push(`pull:${since}`); return { serverTime: 99, blocks: [block as any], scoutingCheckpoints: [], workOrders: [], irrigationLeases: [] }; },
    async push(b) { log.push(`push:${b.leafSamples.length}`); return { acknowledgedIds: b.leafSamples.map((s) => s.id), missingMediaSampleIds: b.leafSamples.map((s) => s.id) }; },
    async putMedia(id) { if (!failed) { failed = true; throw new Error('wifi'); } log.push(`media:${id}`); },
  };
  const s: SyncStore = {
    async lastPullAt() { return 7; },
    async applyPull(r) { log.push(`apply:${r.serverTime}`); },
    async collectPending() { return { deviceId: 'd', scoutingSessions: [], leafSamples: [sample as any], agronomicLogs: [], workOrders: [], irrigationLeases: [] }; },
    async markSynced(ids) { ids.forEach((i) => synced.add(i)); log.push(`synced:${ids.join(',')}`); },
    async markMediaUploaded(id) { log.push(`mediaOk:${id}`); },
    async setLastPullAt(ts) { log.push(`since:${ts}`); },
  };
  return { t, s, log, synced };
}

describe('runSyncCycle order (AC-20 logic)', () => {
  it('handshake → pull → apply → push → mark metadata → media → mark sample synced', async () => {
    const { t, s, log } = fakes();
    const r = await runSyncCycle(t, s);
    expect(log).toEqual(['handshake', 'pull:7', 'apply:99', 'since:99', 'push:1', 'synced:', 'media:s1', 'mediaOk:s1', 'synced:s1']);
    expect(r).toEqual({ pulled: 1, pushed: 1, mediaUploaded: 1, mediaFailed: [] });
  });
  it('a failed media upload keeps that sample PENDING and does not abort the rest', async () => {
    const { t, s, synced } = fakes({ failMediaOnce: true });
    const r = await runSyncCycle(t, s);
    expect(r.mediaFailed).toEqual(['s1']);
    expect(synced.has('s1')).toBe(false);
  });
  it('refuses a hub with a different schema version', async () => {
    const { t, s } = fakes();
    t.handshake = async () => ({ hubId: 'h', farmName: 'f', version: '2.0.0', schemaVersion: SCHEMA_VERSION + 1, serverTime: 1 });
    await expect(runSyncCycle(t, s)).rejects.toThrow(/schema/i);
  });
});
