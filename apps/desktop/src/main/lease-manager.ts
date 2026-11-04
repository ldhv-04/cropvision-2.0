import { eq, inArray } from 'drizzle-orm';
import { blocks, irrigationLeases } from '@cropvision/schema';
import { LeaseRunner, type IIrrigationController, type Lease, type LeaseRequest } from '@cropvision/domain';
import type { Db } from './db';

export type { LeaseRequest };

/** Desktop host of the shared LeaseRunner: adds block validation, SQLite persistence and restart recovery. */
export class LeaseManager {
  private runner: LeaseRunner;

  constructor(private db: Db, private ctrl: IIrrigationController, private now: () => number = Date.now) {
    this.runner = new LeaseRunner(ctrl, (l) => this.persist(l), now);
  }

  start(tickMs?: number) { this.runner.start(tickMs); }
  stop() { this.runner.stop(); }
  tick() { this.runner.tick(); }

  async issue(req: LeaseRequest): Promise<Lease> {
    if (!this.db.select({ id: blocks.id }).from(blocks).where(eq(blocks.id, req.blockId)).get()) throw new Error('block not found');
    return this.runner.issue(req);
  }
  abort(id: string) { return this.runner.abort(id); }

  get(id: string): Lease | undefined {
    const row = this.db.select().from(irrigationLeases).where(eq(irrigationLeases.id, id)).get();
    return row ? ({ ...row, pressureSamples: 0 } as Lease) : undefined;
  }
  list() { return this.db.select().from(irrigationLeases).all().sort((a, b) => b.issuedAt - a.issuedAt); }

  /** Leases left ACTIVE by a previous process are closed: we no longer control them. */
  async recoverAfterRestart(): Promise<void> {
    const open = this.db.select().from(irrigationLeases).where(inArray(irrigationLeases.status, ['ISSUED', 'ACTIVE'])).all();
    for (const row of open) {
      this.db.update(irrigationLeases).set({ status: 'EXPIRED', completedAt: this.now(), updatedAt: this.now(), syncStatus: 'PENDING' }).where(eq(irrigationLeases.id, row.id)).run();
      await this.ctrl.abortLease(row.id).catch(() => undefined);
    }
  }

  private persist(l: Lease) {
    const { pressureSamples: _ignored, ...row } = l;
    const t = this.now();
    this.db.insert(irrigationLeases).values({ ...row, createdAt: l.issuedAt, updatedAt: t, syncStatus: 'PENDING' })
      .onConflictDoUpdate({ target: irrigationLeases.id, set: { ...row, updatedAt: t, syncStatus: 'PENDING' } }).run();
  }
}
