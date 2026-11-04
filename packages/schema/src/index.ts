export * from './tables';
export * from './types';
export * from './migrations';
// single drizzle-orm instance for consumers that only need column metadata (mobile sync)
export { getTableColumns, getTableName } from 'drizzle-orm';
