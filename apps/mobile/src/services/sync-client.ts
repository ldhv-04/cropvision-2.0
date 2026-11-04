import { runSyncCycle, type SyncResult } from '@cropvision/sync-protocol';
import { SqliteSyncStore, type SqlExecutor } from '../db/sql-store';
import { HttpSyncTransport, type TransportDeps } from './http-transport';

/** One full cycle against a hub: pull config → push metadata → stream images → mark SYNCED. */
export function syncWithHub(baseUrl: string, exec: SqlExecutor, deps: TransportDeps & { deviceId: string }): Promise<SyncResult> {
  return runSyncCycle(new HttpSyncTransport(baseUrl.replace(/\/+$/, ''), deps), new SqliteSyncStore(exec, deps.deviceId));
}
