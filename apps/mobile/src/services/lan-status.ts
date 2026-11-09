import { useCallback, useEffect, useState } from 'react';
import type { SqlExecutor } from '../db/sql-store';
import { probeHub } from '../lib/hmi';
import { syncWithHub } from './sync-client';
import { sampleMediaUri, uploadWebp } from './media';

const PROBE_EVERY_MS = 15_000;

/** Hub reachability (handshake probe of the saved hub URL), pending sample count and a one-tap sync for the LAN banner. */
export function useLanStatus(exec: SqlExecutor, deviceId: string, onSynced: () => void) {
  const [reachable, setReachable] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const hubUrl = useCallback(async () => (await exec.all<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'hubUrl'"))[0]?.value ?? '', [exec]);

  useEffect(() => {
    let live = true;
    const check = async () => {
      const [ok, rows] = await Promise.all([hubUrl().then((u) => probeHub(u)), exec.all<{ n: number }>("SELECT count(*) AS n FROM leaf_samples WHERE sync_status = 'PENDING'")]);
      if (live) { setReachable(ok); setPending(rows[0]?.n ?? 0); }
    };
    void check();
    const t = setInterval(check, PROBE_EVERY_MS);
    return () => { live = false; clearInterval(t); };
  }, [exec, hubUrl, tick]);

  const syncNow = useCallback(async () => {
    setBusy(true);
    try {
      await syncWithHub(await hubUrl(), exec, { deviceId, mediaUri: (id) => sampleMediaUri(exec, id), upload: uploadWebp });
      onSynced();
    } catch { /* banner flips to offline on the next probe; details live on the Sync tab */ }
    finally { setBusy(false); setTick((n) => n + 1); }
  }, [exec, deviceId, hubUrl, onSynced]);

  return { reachable, pending, busy, syncNow, refresh: useCallback(() => setTick((n) => n + 1), []) };
}
