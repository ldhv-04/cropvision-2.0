import { open, type DB } from '@op-engineering/op-sqlite';
import { initMobileSchema, type SqlExecutor } from './sql-store';

function wrap(db: Pick<DB, 'execute'>, tx?: { commit?: never }): Omit<SqlExecutor, 'transaction'> {
  return {
    async all(sql, params = []) { return (await db.execute(sql, params as any[])).rows as any[]; },
    async run(sql, params = []) { await db.execute(sql, params as any[]); },
    // op-sqlite runs one statement per execute(); our DDL script is a list of ';'-terminated statements without ';' inside literals.
    async exec(sql) { for (const s of sql.split(';')) if (s.trim()) await db.execute(s.trim()); },
  };
}

let cached: Promise<SqlExecutor> | undefined;
/** Opens (once) the phone's SQLite and applies the shared schema from @cropvision/schema. */
export function getDb(): Promise<SqlExecutor> {
  cached ??= (async () => {
    const db = open({ name: 'cropvision.sqlite' });
    const exec: SqlExecutor = {
      ...wrap(db),
      async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>) {
        let out!: T;
        await db.transaction(async (tx) => { out = await fn({ ...wrap(tx), transaction: () => { throw new Error('nested transaction'); } }); });
        return out;
      },
    };
    await initMobileSchema(exec);
    return exec;
  })();
  return cached;
}
