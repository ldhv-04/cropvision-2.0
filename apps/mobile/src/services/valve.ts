import { LeaseRunner, SimulatedIrrigationController, type Lease } from '@cropvision/domain';
import { upsertRow, type SqlExecutor } from '../db/sql-store';

/**
 * Phone-side irrigation: same LeaseRunner as the desktop. Hardware port = in-app simulator until a BLE
 * IIrrigationController exists (needs the ESP32 board, see docs/work/cropvision/UNVERIFIED.md).
 * Lease rows are written PENDING so they sync to the desktop ledger.
 */
export function createValveService(exec: SqlExecutor, onChange: (l: Lease) => void) {
  const controller = new SimulatedIrrigationController({ flowLph: 600, pressureBar: 2.5, everyMs: 1000, speedup: 10 });
  const runner = new LeaseRunner(controller, async (l) => {
    const { pressureSamples: _p, ...row } = l;
    await upsertRow(exec, 'irrigationLeases', { ...row, createdAt: l.issuedAt, updatedAt: Date.now(), deletedAt: null, syncStatus: 'PENDING' });
    onChange(l);
  }, Date.now, 30); // abort if telemetry goes silent for 30 s
  runner.start();
  return { runner, controller, stop: () => runner.stop() };
}
