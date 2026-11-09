import {
  computeBlockEpidemiology, decideCoffeeRustAction, evaluateAgronomicAction, findPesticide, generateUuidV7, pointInPolygon, polygonAreaHectares,
  type CanopyLayer, type PesticideProduct, type SegmentationResult,
} from '@cropvision/domain';
import { upsertRow, type SqlExecutor } from '../db/sql-store';
import type { LatLng } from '../lib/geo';

type Clock = () => number;
const pending = (t: number) => ({ createdAt: t, updatedAt: t, deletedAt: null, syncStatus: 'PENDING' as const });

export async function startSession(exec: SqlExecutor, i: { blockId: string; workOrderId: string | null; deviceId: string; now?: Clock }) {
  const t = (i.now ?? Date.now)();
  const row = {
    id: generateUuidV7(), blockId: i.blockId, workOrderId: i.workOrderId, deviceId: i.deviceId, startedAt: t, completedAt: null,
    totalSamples: 0, diseaseIncidencePct: 0, blockSeverityIndexPct: 0, recommendationCode: null, recommendationSummary: null, ...pending(t),
  };
  await upsertRow(exec, 'scoutingSessions', row);
  return row;
}

export interface SampleInput {
  sessionId: string; checkpointId: string | null; canopyLayer: CanopyLayer; latitude: number; longitude: number;
  imuStabilityScore: number; result: SegmentationResult; imageRelativeKey: string; now?: Clock; id?: string;
}
/** Stored PENDING / LOCAL_ONLY; the WebP itself lives on disk, only its relative key is in SQLite. */
export async function recordSample(exec: SqlExecutor, i: SampleInput) {
  const t = (i.now ?? Date.now)();
  const r = i.result;
  const row = {
    id: i.id ?? generateUuidV7(), sessionId: i.sessionId, checkpointId: i.checkpointId, canopyLayer: i.canopyLayer,
    latitude: i.latitude, longitude: i.longitude, imuStabilityScore: i.imuStabilityScore,
    leafPixelCount: r.leafPixelCount, lesionPixelCount: r.lesionPixelCount, dsIndexPct: r.dsIndexPct,
    uncertaintyEntropy: r.uncertaintyEntropy, inferenceLatencyMs: r.inferenceLatencyMs, engineVersion: r.engineVersion,
    imageRelativeKey: i.imageRelativeKey, mediaSyncStatus: 'LOCAL_ONLY' as const, capturedAt: t, ...pending(t),
  };
  await upsertRow(exec, 'leafSamples', row);
  return row;
}

/** DI/BSI and the recommendation come only from @cropvision/domain (architectural law 5). */
export async function finishSession(exec: SqlExecutor, sessionId: string, now: Clock = Date.now) {
  const samples = await exec.all<{ canopy_layer: CanopyLayer; ds_index_pct: number; checkpoint_id: string | null }>(
    'SELECT canopy_layer, ds_index_pct, checkpoint_id FROM leaf_samples WHERE session_id = ? AND deleted_at IS NULL', [sessionId]);
  if (samples.length === 0) throw new Error('no samples recorded in this session');
  const session = (await exec.all<any>('SELECT * FROM scouting_sessions WHERE id = ?', [sessionId]))[0];
  const block = (await exec.all<{ tree_count: number }>('SELECT tree_count FROM blocks WHERE id = ?', [session.block_id]))[0];
  const epi = computeBlockEpidemiology(samples.map((s) => ({ canopyLayer: s.canopy_layer, dsIndexPct: s.ds_index_pct })));
  const rec = decideCoffeeRustAction({
    bsiPct: epi.blockSeverityIndexPct, diPct: epi.diseaseIncidencePct, treeCount: block?.tree_count ?? 0,
    samples: samples.map((s) => ({ checkpointId: s.checkpoint_id, dsIndexPct: s.ds_index_pct })),
  });
  const t = now();
  await exec.run(
    `UPDATE scouting_sessions SET completed_at = ?, total_samples = ?, disease_incidence_pct = ?, block_severity_index_pct = ?,
     recommendation_code = ?, recommendation_summary = ?, updated_at = ?, sync_status = 'PENDING' WHERE id = ?`,
    [t, epi.totalSamples, epi.diseaseIncidencePct, epi.blockSeverityIndexPct, rec.code, rec.summary, t, sessionId]);
  if (session.work_order_id) await exec.run("UPDATE work_orders SET status = 'COMPLETED', completed_at = ?, updated_at = ?, sync_status = 'PENDING' WHERE id = ?", [t, t, session.work_order_id]);
  return { ...epi, recommendationCode: rec.code, recommendationSummary: rec.summary, sprayVolumeLiters: rec.sprayVolumeLiters, affectedCheckpointIds: rec.affectedCheckpointIds };
}

export interface LocatedBlock { id: string; name: string; treeCount: number; expectedHarvestDate: number | null; nominalDripFlowLph: number }
/**
 * Which block are we standing in? Point-in-polygon on the offline block table.
 * Overlapping blocks (user decision 2026-11-09): the smallest containing polygon wins, measured from the
 * geometry (not the stored area column); equal areas fall back to the lower id so the answer is deterministic.
 */
export async function locateBlock(exec: SqlExecutor, p: LatLng): Promise<LocatedBlock | null> {
  const rows = await exec.all<any>('SELECT id, name, tree_count, expected_harvest_date, nominal_drip_flow_lph, boundary_geojson FROM blocks WHERE deleted_at IS NULL');
  let best: { row: any; area: number } | null = null;
  for (const b of rows) {
    try {
      const polygon = JSON.parse(b.boundary_geojson);
      if (!pointInPolygon([p.longitude, p.latitude], polygon.coordinates[0])) continue;
      const area = polygonAreaHectares(polygon);
      if (!best || area < best.area || (area === best.area && b.id < best.row.id)) best = { row: b, area };
    } catch { /* malformed boundary: skip this block */ }
  }
  if (!best) return null;
  const b = best.row;
  return { id: b.id, name: b.name, treeCount: b.tree_count, expectedHarvestDate: b.expected_harvest_date, nominalDripFlowLph: b.nominal_drip_flow_lph };
}

export type ScanVerdict =
  | { status: 'OK'; product: PesticideProduct; safeHarvestUnlockDate: number }
  | { status: 'BLOCKED'; code: 'PHI_VIOLATION_BLOCKED'; product: PesticideProduct; safeHarvestUnlockDate: number }
  | { status: 'UNKNOWN_PRODUCT' | 'NO_BLOCK' };

export function evaluateScan(i: { barcode: string; catalogue: readonly PesticideProduct[]; block: { id: string; expectedHarvestDate: number | null } | null; nowMs: number }): ScanVerdict {
  if (!i.block) return { status: 'NO_BLOCK' };
  const product = findPesticide(i.catalogue, i.barcode);
  if (!product) return { status: 'UNKNOWN_PRODUCT' };
  const v = evaluateAgronomicAction({ kind: 'PESTICIDE', nowMs: i.nowMs, block: { expectedHarvestDate: i.block.expectedHarvestDate }, product });
  return v.approved
    ? { status: 'OK', product, safeHarvestUnlockDate: v.safeHarvestUnlockDate! }
    : { status: 'BLOCKED', code: 'PHI_VIOLATION_BLOCKED', product, safeHarvestUnlockDate: v.safeHarvestUnlockDate! };
}
