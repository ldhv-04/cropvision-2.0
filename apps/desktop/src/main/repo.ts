import { eq, gt } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  agronomicLogs, blocks, irrigationLeases, leafSamples, scoutingCheckpoints, scoutingSessions, workOrders,
} from '@cropvision/schema';
import { shouldApply, type PullResponse, type PushBody, type PushResponse } from '@cropvision/sync-protocol';
import type { Db, DbContext } from './db';

type Row = { id: string; updatedAt: number };
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

// One generic LWW upsert for every synced table; drizzle's per-table generics are not worth threading here.
function upsertLww(tx: Pick<Db, 'select' | 'insert'>, table: SQLiteTable & { id: any; updatedAt: any }, rows: readonly Row[]): string[] {
  const ids: string[] = [];
  for (const raw of rows) {
    // a device clock far in the future would win LWW forever: clamp to hub-now + 5 min of skew
    const r = { ...raw, updatedAt: Math.min(raw.updatedAt, Date.now() + MAX_CLOCK_SKEW_MS) };
    const local = (tx as any).select({ updatedAt: table.updatedAt }).from(table).where(eq(table.id, r.id)).get() as Row | undefined;
    if (shouldApply(local, r)) (tx as any).insert(table).values(r).onConflictDoUpdate({ target: table.id, set: r }).run();
    ids.push(r.id); // acked even when LWW kept the newer local copy: the sender has nothing left to retry
  }
  return ids;
}

export function pullSince(db: Db, since: number): Omit<PullResponse, 'serverTime'> {
  return {
    blocks: db.select().from(blocks).where(gt(blocks.updatedAt, since)).all(),
    scoutingCheckpoints: db.select().from(scoutingCheckpoints).where(gt(scoutingCheckpoints.updatedAt, since)).all(),
    workOrders: db.select().from(workOrders).where(gt(workOrders.updatedAt, since)).all(),
    irrigationLeases: db.select().from(irrigationLeases).where(gt(irrigationLeases.updatedAt, since)).all(),
  };
}

/** Atomic: any failing row (FK, NOT NULL, ...) rolls the whole batch back. */
export function applyPush(ctx: DbContext, body: PushBody, mediaExists: (relativeKey: string) => boolean): PushResponse & { sessionIds: string[] } {
  return ctx.sqlite.transaction(() => {
    const synced = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, syncStatus: 'SYNCED' as const }));
    const ack: string[] = [];
    ack.push(...upsertLww(ctx.db, workOrders, synced(body.workOrders)));
    ack.push(...upsertLww(ctx.db, scoutingSessions, synced(body.scoutingSessions)));
    // media status is hub-truth: VERIFIED only if the file is really here
    const samples = synced(body.leafSamples).map((s) => ({ ...s, mediaSyncStatus: mediaExists(s.imageRelativeKey) ? ('VERIFIED' as const) : ('LOCAL_ONLY' as const) }));
    ack.push(...upsertLww(ctx.db, leafSamples, samples));
    ack.push(...upsertLww(ctx.db, agronomicLogs, synced(body.agronomicLogs)));
    ack.push(...upsertLww(ctx.db, irrigationLeases, synced(body.irrigationLeases)));
    return {
      acknowledgedIds: ack,
      missingMediaSampleIds: samples.filter((s) => s.mediaSyncStatus !== 'VERIFIED').map((s) => s.id),
      sessionIds: [...new Set([...body.scoutingSessions.map((s) => s.id), ...body.leafSamples.map((s) => s.sessionId)])],
    };
  })();
}
