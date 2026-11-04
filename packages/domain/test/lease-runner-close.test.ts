import { describe, expect, it, vi } from 'vitest';
import { LeaseRunner } from '../src/lease-runner';
import { SimulatedIrrigationController } from '../src/simulated-irrigation';

describe('LeaseRunner closes the valve even when the first abort fails', () => {
  it('retries abortLease and still persists the terminal state', async () => {
    vi.useFakeTimers();
    const ctrl = new SimulatedIrrigationController();
    let calls = 0;
    const real = ctrl.abortLease.bind(ctrl);
    ctrl.abortLease = async (id: string) => { if (++calls === 1) throw new Error('serial down'); return real(id); };
    const saved: string[] = [];
    const runner = new LeaseRunner(ctrl, (l) => { saved.push(l.status); });
    const lease = await runner.issue({ blockId: 'b', mode: 'DRIP_IRRIGATION', maxDurationSec: 600, maxVolumeLiters: 100 } as any);
    await runner.abort(lease.id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(saved.at(-1)).toMatch(/ABORTED|EXPIRED/);
    vi.useRealTimers();
  });
});

describe('LeaseRunner silence watchdog (opt-in)', () => {
  it('aborts a lease whose telemetry went silent, and closes the valve', async () => {
    const ctrl = new SimulatedIrrigationController(); // silent: no autoRun
    let t = 0;
    const saved: string[] = [];
    const runner = new LeaseRunner(ctrl, (l) => { saved.push(l.status); }, () => t, 30);
    const lease = await runner.issue({ blockId: 'b', mode: 'DRIP_IRRIGATION', maxDurationSec: 600, maxVolumeLiters: 100 } as any);
    t = 29_000; runner.tick(); expect(runner.get(lease.id)).toBeDefined();
    t = 31_000; runner.tick();
    expect(runner.get(lease.id)).toBeUndefined();
    expect(saved.at(-1)).toBe('ABORTED_FLOW_FAULT');
  });
});
