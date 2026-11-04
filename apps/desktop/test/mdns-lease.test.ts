import { afterEach, describe, expect, it } from 'vitest';
import { Bonjour } from 'bonjour-service';
import { encodeLeaseFrame, verifyLeaseFrame, createLease } from '@cropvision/domain';
import { advertiseHub } from '../src/main/mdns-broadcaster';
import { LeaseManager } from '../src/main/lease-manager';
import { SimulatedIrrigationController } from '@cropvision/domain';
import { openDb } from '../src/main/db';
import { blocks, irrigationLeases } from '@cropvision/schema';

describe('mDNS (AC-15)', () => {
  it('advertises _cropvision-hub._tcp with TXT version/farmName/hubId', async () => {
    const adv = advertiseHub({ port: 45678, farmName: 'Trang trại A', hubId: 'hub-xyz' });
    const browser = new Bonjour();
    try {
      const svc = await new Promise<any>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('mDNS service not discovered in 8 s')), 8000);
        browser.find({ type: 'cropvision-hub' }, (s) => { clearTimeout(t); resolve(s); });
      });
      expect(svc.type).toBe('cropvision-hub');
      expect(svc.protocol).toBe('tcp');
      expect(svc.port).toBe(45678);
      expect(svc.txt).toMatchObject({ version: '2.0.0', farmName: 'Trang trại A', hubId: 'hub-xyz' });
    } finally {
      browser.destroy();
      await adv.stop();
    }
  }, 15000);
});

let ctx: ReturnType<typeof openDb>;
function setup() {
  ctx = openDb(':memory:');
  ctx.db.insert(blocks).values({
    id: 'b1', name: 'B', cropVariety: 'ROBUSTA', growthStage: 'RIPENING', treeCount: 10, areaHectares: 1, boundaryGeoJson: '{}',
    createdAt: 1, updatedAt: 1,
  }).run();
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => { t += ms; } };
  const ctrl = new SimulatedIrrigationController();
  const mgr = new LeaseManager(ctx.db, ctrl, clock.now);
  return { mgr, ctrl, clock };
}
const req = { blockId: 'b1', mode: 'DRIP_IRRIGATION' as const, maxDurationSec: 600, maxVolumeLiters: 100 };
afterEach(() => ctx?.sqlite.close());

describe('Irrigation lease manager (AC-11)', () => {
  it('issues a CRC-framed lease, activates it and persists ISSUED→ACTIVE', async () => {
    const { mgr, ctrl } = setup();
    const lease = await mgr.issue(req);
    expect(lease.status).toBe('ACTIVE');
    expect(ctrl.frames).toHaveLength(1);
    expect(verifyLeaseFrame(ctrl.frames[0]!)).toBe(true);
    expect(ctx.db.select().from(irrigationLeases).get()).toMatchObject({ id: lease.id, status: 'ACTIVE', maxDurationSec: 600 });
  });

  it('completes when telemetry reaches the volume and tells hardware to close the valve', async () => {
    const { mgr, ctrl } = setup();
    const l = await mgr.issue(req);
    ctrl.emit(l.id, { elapsedSec: 100, pressureBar: 2.5, volumeLiters: 100 });
    expect(mgr.get(l.id)?.status).toBe('COMPLETED');
    expect(ctrl.aborted).toContain(l.id);
    expect(ctx.db.select().from(irrigationLeases).get()?.status).toBe('COMPLETED');
  });

  it('aborts on pressure fault', async () => {
    const { mgr, ctrl } = setup();
    const l = await mgr.issue(req);
    ctrl.emit(l.id, { elapsedSec: 5, pressureBar: 4.2, volumeLiters: 1 });
    expect(mgr.get(l.id)?.status).toBe('ABORTED_PRESSURE_FAULT');
    expect(ctrl.aborted).toContain(l.id);
  });

  it('watchdog expires a silent lease at max duration (fail-safe without telemetry)', async () => {
    const { mgr, ctrl, clock } = setup();
    const l = await mgr.issue(req);
    clock.advance(599_000); mgr.tick();
    expect(mgr.get(l.id)?.status).toBe('ACTIVE');
    clock.advance(2_000); mgr.tick();
    expect(mgr.get(l.id)?.status).toBe('EXPIRED');
    expect(ctrl.aborted).toContain(l.id);
  });

  it('rejects unbounded requests and unknown blocks; abort is idempotent', async () => {
    const { mgr } = setup();
    await expect(mgr.issue({ ...req, maxDurationSec: 0 })).rejects.toThrow();
    await expect(mgr.issue({ ...req, blockId: 'nope' })).rejects.toThrow(/block/i);
    const l = await mgr.issue(req);
    await mgr.abort(l.id); await mgr.abort(l.id);
    expect(mgr.get(l.id)?.status).toBe('EXPIRED');
  });

  it('after a restart, leases left ACTIVE in the DB are closed (we lost control of them)', async () => {
    const { mgr, ctrl } = setup();
    const l = await mgr.issue(req);
    const fresh = new LeaseManager(ctx.db, ctrl, () => 2_000_000);
    await fresh.recoverAfterRestart();
    expect(ctx.db.select().from(irrigationLeases).get()?.status).toBe('EXPIRED');
    expect(ctrl.aborted).toContain(l.id);
  });
});

it('createLease frames use the domain encoder', () => {
  expect(verifyLeaseFrame(encodeLeaseFrame(createLease({ id: 'x', blockId: 'b', mode: 'DRIP_IRRIGATION', maxDurationSec: 1, maxVolumeLiters: 1, issuedAt: 0 })))).toBe(true);
});
