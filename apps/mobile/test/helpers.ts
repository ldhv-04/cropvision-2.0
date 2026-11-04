import type Database from 'better-sqlite3';
import type { SqlExecutor } from '../src/db/sql-store';

/** Test stand-in for op-sqlite: same SqlExecutor contract, backed by better-sqlite3. */
export function betterSqliteExecutor(db: Database.Database): SqlExecutor {
  const self: SqlExecutor = {
    async all(sql, params = []) { return db.prepare(sql).all(...(params as any[])) as any[]; },
    async run(sql, params = []) { db.prepare(sql).run(...(params as any[])); },
    async exec(sql) { db.exec(sql); },
    async transaction(fn) {
      db.exec('BEGIN');
      try { const r = await fn(self); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
  return self;
}
