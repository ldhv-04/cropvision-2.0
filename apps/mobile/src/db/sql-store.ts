import * as schema from '@cropvision/schema';
import { createTablesSql, getTableColumns, getTableName } from '@cropvision/schema';
import { shouldApply, type PullResponse, type PushBody, type SyncStore } from '@cropvision/sync-protocol';

/** The only database surface the sync code needs: op-sqlite in the app, better-sqlite3 in tests. */
export interface SqlExecutor {
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
  exec(sql: string): Promise<void>;
  /** `tx` must be used for every statement inside (op-sqlite runs the transaction on its own connection). */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

const TABLES = {
  blocks: schema.blocks, scoutingCheckpoints: schema.scoutingCheckpoints, workOrders: schema.workOrders,
  scoutingSessions: schema.scoutingSessions, leafSamples: schema.leafSamples, agronomicLogs: schema.agronomicLogs,
  irrigationLeases: schema.irrigationLeases,
} as const;
export type TableKey = keyof typeof TABLES;

// property name (camelCase, used in JSON) <-> column name (snake_case, used in SQL)
const colMap = (k: TableKey) => Object.entries(getTableColumns(TABLES[k])).map(([prop, c]) => [prop, c.name] as const);
const tableName = (k: TableKey) => getTableName(TABLES[k]);
const fromDb = (k: TableKey, row: Record<string, unknown>) => Object.fromEntries(colMap(k).map(([p, c]) => [p, row[c] ?? null]));

/** Foreign keys are off on the phone on purpose: rows may arrive before their parents; the hub enforces integrity (and rolls back a bad push). */
export async function initMobileSchema(exec: SqlExecutor): Promise<void> {
  await exec.exec('PRAGMA foreign_keys = OFF');
  await exec.exec(createTablesSql);
  await exec.exec('CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
}

/** Insert or replace by id (callers decide LWW). */
export async function upsertRow(exec: SqlExecutor, k: TableKey, row: Record<string, unknown>): Promise<void> {
  const cols = colMap(k);
  const names = cols.map(([, c]) => c);
  await exec.run(
    `INSERT INTO ${tableName(k)} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')}) ` +
      `ON CONFLICT(id) DO UPDATE SET ${names.filter((n) => n !== 'id').map((n) => `${n}=excluded.${n}`).join(',')}`,
    cols.map(([p]) => row[p] ?? null),
  );
}

const PUSH_ORDER: TableKey[] = ['workOrders', 'scoutingSessions', 'leafSamples', 'agronomicLogs', 'irrigationLeases'];
const PULL_ORDER: (keyof Omit<PullResponse, 'serverTime'>)[] = ['blocks', 'scoutingCheckpoints', 'workOrders', 'irrigationLeases'];

export class SqliteSyncStore implements SyncStore {
  constructor(private exec: SqlExecutor, private deviceId: string) {}

  async lastPullAt() {
    const r = await this.exec.all<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'lastPullAt'");
    return r[0] ? Number(r[0].value) : 0;
  }
  async setLastPullAt(ts: number) {
    await this.exec.run("INSERT INTO sync_meta (key, value) VALUES ('lastPullAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(ts)]);
  }

  async applyPull(r: PullResponse) {
    await this.exec.transaction(async (tx) => {
      for (const k of PULL_ORDER) {
        for (const row of r[k] as Array<Record<string, any>>) {
          const local = (await tx.all<{ updated_at: number }>(`SELECT updated_at FROM ${tableName(k)} WHERE id = ?`, [row.id]))[0];
          if (shouldApply(local && { updatedAt: local.updated_at }, row as { updatedAt: number })) await upsertRow(tx, k, { ...row, syncStatus: 'SYNCED' });
        }
      }
    });
  }

  /** updated_at of each row as pushed: markSynced must not flip a row that was edited again during the cycle. */
  private pushed = new Map<string, number>();

  async collectPending(): Promise<PushBody> {
    const out: Record<string, unknown[]> = {};
    this.pushed.clear();
    for (const k of PUSH_ORDER) {
      const rows = await this.exec.all<Record<string, any>>(`SELECT * FROM ${tableName(k)} WHERE sync_status = 'PENDING'`);
      for (const r of rows) this.pushed.set(`${k}:${r.id}`, r.updated_at);
      out[k] = rows.map((r) => fromDb(k, r));
    }
    return { deviceId: this.deviceId, ...out } as unknown as PushBody;
  }

  async markSynced(ids: string[]) {
    if (ids.length === 0) return;
    await this.exec.transaction(async (tx) => {
      for (const k of PUSH_ORDER) {
        for (const id of ids) {
          const at = this.pushed.get(`${k}:${id}`);
          if (at !== undefined) await tx.run(`UPDATE ${tableName(k)} SET sync_status = 'SYNCED' WHERE id = ? AND updated_at <= ?`, [id, at]);
        }
      }
    });
  }

  async markMediaUploaded(sampleId: string) {
    await this.exec.run("UPDATE leaf_samples SET media_sync_status = 'VERIFIED' WHERE id = ?", [sampleId]);
  }
}
