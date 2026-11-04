import { SCHEMA_VERSION, type Handshake, type PullResponse, type PushBody, type PushResponse } from './contracts';

/** Last-Write-Wins (SPEC §4.2): incoming wins ties, so a replayed batch is idempotent. */
export function shouldApply(local: { updatedAt: number } | undefined, incoming: { updatedAt: number }): boolean {
  return !local || incoming.updatedAt >= local.updatedAt;
}

export interface SyncTransport {
  handshake(): Promise<Handshake>;
  pull(since: number): Promise<PullResponse>;
  push(body: PushBody): Promise<PushResponse>;
  /** Stream the WebP file of this sample to the hub; throws on failure. */
  putMedia(sampleId: string): Promise<void>;
}
export interface SyncStore {
  lastPullAt(): Promise<number>;
  setLastPullAt(ts: number): Promise<void>;
  /** Upsert pulled rows with shouldApply(); must not mark them PENDING. */
  applyPull(r: PullResponse): Promise<void>;
  collectPending(): Promise<PushBody>;
  markSynced(ids: string[]): Promise<void>;
  markMediaUploaded(sampleId: string): Promise<void>;
}
export interface SyncResult { pulled: number; pushed: number; mediaUploaded: number; mediaFailed: string[] }

/** Pull → push metadata → stream each missing image → mark SYNCED. A sample stays PENDING until its image is verified, so a failed upload is retried next cycle. */
export async function runSyncCycle(t: SyncTransport, s: SyncStore): Promise<SyncResult> {
  const hs = await t.handshake();
  if (hs.schemaVersion !== SCHEMA_VERSION) throw new Error(`schema version mismatch: hub ${hs.schemaVersion}, client ${SCHEMA_VERSION}`);

  const pull = await t.pull(await s.lastPullAt());
  await s.applyPull(pull);
  await s.setLastPullAt(pull.serverTime);

  const body = await s.collectPending();
  const pushed = body.scoutingSessions.length + body.leafSamples.length + body.agronomicLogs.length + body.workOrders.length + body.irrigationLeases.length;
  const res = await t.push(body);
  const missing = new Set(res.missingMediaSampleIds);
  await s.markSynced(res.acknowledgedIds.filter((id) => !missing.has(id)));

  const mediaFailed: string[] = [];
  let mediaUploaded = 0;
  for (const id of missing) {
    try {
      await t.putMedia(id);
      await s.markMediaUploaded(id);
      await s.markSynced([id]);
      mediaUploaded++;
    } catch { mediaFailed.push(id); }
  }
  return {
    pulled: pull.blocks.length + pull.scoutingCheckpoints.length + pull.workOrders.length + pull.irrigationLeases.length,
    pushed, mediaUploaded, mediaFailed,
  };
}
