import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createTablesSql } from '@cropvision/schema';
import * as schema from '@cropvision/schema';

export function openDb(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(createTablesSql);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
export type DbContext = ReturnType<typeof openDb>;
export type Db = DbContext['db'];
