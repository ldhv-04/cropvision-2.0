import { activateLease, applyTelemetry, createLease, encodeLeaseFrame, isTerminal, type Lease, type LeaseInput, type LeaseStatus, type Telemetry } from './irrigation-lease';
import { generateUuidV7 } from './uuid';
import type { IIrrigationController } from './ports';

export type LeaseRequest = Omit<LeaseInput, 'id' | 'issuedAt'>;
/** Called synchronously on every state change; persistence is the caller's concern (SQLite on desktop and phone). */
export type PersistLease = (lease: Lease) => void | Promise<void>;

/**
 * Runs bounded irrigation leases against a hardware port (SPEC phase 4). Fail-safe rules:
 *  - the valve is told to close on EVERY terminal state, before the row is written;
 *  - a watchdog (`tick`) expires any lease that stops reporting once maxDurationSec has elapsed;
 *  - a manual abort is stored as EXPIRED (A12: the schema has no ABORTED_BY_USER).
 */
const CLOSE_RETRIES = 5, CLOSE_RETRY_MS = 500;

export class LeaseRunner {
  private active = new Map<string, { lease: Lease; activatedAt: number; lastTelemetryAt: number }>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private ctrl: IIrrigationController, private persist: PersistLease, private now: () => number = Date.now,
    /** Abort when no telemetry arrives for this long. Opt-in only because the desktop simulator is silent; REQUIRED when wiring real hardware. */
    private silenceTimeoutSec?: number) {
    ctrl.onTelemetry((id, t) => this.onTelemetry(id, t));
  }

  start(tickMs = 1000) { this.timer = setInterval(() => this.tick(), tickMs); }
  stop() { if (this.timer) clearInterval(this.timer); }

  async issue(req: LeaseRequest): Promise<Lease> {
    const lease = activateLease(createLease({ ...req, id: generateUuidV7(), issuedAt: this.now() }));
    this.active.set(lease.id, { lease, activatedAt: this.now(), lastTelemetryAt: this.now() });
    this.save(lease);
    try {
      await this.ctrl.issueLease(lease, encodeLeaseFrame(lease));
    } catch (e) {
      this.finish(lease, 'EXPIRED');
      throw e;
    }
    return lease;
  }

  async abort(id: string): Promise<void> {
    const e = this.active.get(id);
    if (e) this.finish(e.lease, 'EXPIRED');
  }

  /** Active leases only. */
  get(id: string): Lease | undefined { return this.active.get(id)?.lease; }

  tick(): void {
    for (const { lease, activatedAt, lastTelemetryAt } of [...this.active.values()]) {
      if ((this.now() - activatedAt) / 1000 >= lease.maxDurationSec) this.finish(lease, 'EXPIRED');
      else if (this.silenceTimeoutSec !== undefined && (this.now() - lastTelemetryAt) / 1000 >= this.silenceTimeoutSec) this.finish(lease, 'ABORTED_FLOW_FAULT');
    }
  }

  private onTelemetry(id: string, t: Telemetry) {
    const e = this.active.get(id);
    if (!e) return;
    const next = applyTelemetry(e.lease, t, this.now());
    if (isTerminal(next.status)) this.finish(next, next.status);
    else { this.active.set(id, { ...e, lease: next, lastTelemetryAt: this.now() }); this.save(next); }
  }

  private finish(lease: Lease, status: LeaseStatus) {
    this.active.delete(lease.id);
    this.closeValve(lease.id, 0); // close the valve first, retrying: the DB must not say COMPLETED while the valve is open
    this.save({ ...lease, status, completedAt: lease.completedAt ?? this.now() });
  }

  private closeValve(id: string, attempt: number) {
    const retry = () => { if (attempt < CLOSE_RETRIES) setTimeout(() => this.closeValve(id, attempt + 1), CLOSE_RETRY_MS * 2 ** attempt); };
    try { void Promise.resolve(this.ctrl.abortLease(id)).catch(retry); } catch { retry(); }
  }

  private save(l: Lease) { void Promise.resolve(this.persist(l)).catch(() => undefined); }
}
