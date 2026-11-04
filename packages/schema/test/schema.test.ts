import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as tables from '../src/tables';
import { createTablesSql } from '../src/migrations';

const all = Object.values(tables).filter((t) => is(t, SQLiteTable)) as unknown as SQLiteTable[];

describe('schema', () => {
  it('AC-03 defines the 7 spec tables', () => {
    expect(all.map(getTableName).sort()).toEqual(
      ['agronomic_logs', 'blocks', 'irrigation_leases', 'leaf_samples', 'scouting_checkpoints', 'scouting_sessions', 'work_orders'],
    );
  });

  it('AC-03 every table has text primary key id and the 4 system columns', () => {
    for (const t of all) {
      const cols = getTableColumns(t);
      expect(cols.id?.primary, getTableName(t)).toBe(true);
      expect(cols.id?.dataType).toBe('string');
      for (const c of ['createdAt', 'updatedAt', 'deletedAt', 'syncStatus']) expect(cols, `${getTableName(t)}.${c}`).toHaveProperty(c);
    }
  });

  it('AC-03 DDL applies on SQLite and matches drizzle columns (drift guard)', () => {
    const db = new Database(':memory:');
    db.exec(createTablesSql);
    for (const t of all) {
      const dbCols = db.prepare(`PRAGMA table_info(${getTableName(t)})`).all().map((r: any) => r.name).sort();
      const defCols = Object.values(getTableColumns(t)).map((c) => c.name).sort();
      expect(dbCols, getTableName(t)).toEqual(defCols);
    }
  });
});
