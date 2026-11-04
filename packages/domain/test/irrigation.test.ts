import { describe, expect, it } from 'vitest';
import { crc32, createLease, applyTelemetry, activateLease, encodeLeaseFrame, verifyLeaseFrame, planVenturiFertigation, countRiskHours } from '../src/irrigation-lease';

const base = { id: 'l1', blockId: 'b1', mode: 'DRIP_IRRIGATION' as const, maxDurationSec: 600, maxVolumeLiters: 100, issuedAt: 1000 };

describe('crc32', () => {
  it('matches the standard check value', () => expect(crc32('123456789')).toBe(0xcbf43926));
});

describe('lease state machine (AC-11)', () => {
  it('rejects unbounded or invalid leases', () => {
    expect(() => createLease({ ...base, maxDurationSec: 0 })).toThrow();
    expect(() => createLease({ ...base, maxVolumeLiters: -1 })).toThrow();
    expect(() => createLease({ ...base, minPressureBar: 3, maxPressureBar: 2 })).toThrow();
  });
  it('ISSUED → ACTIVE → COMPLETED when volume reached', () => {
    let l = createLease(base);
    expect(l.status).toBe('ISSUED');
    l = activateLease(l);
    expect(l.status).toBe('ACTIVE');
    l = applyTelemetry(l, { elapsedSec: 100, pressureBar: 2.5, volumeLiters: 50 });
    expect(l.status).toBe('ACTIVE');
    l = applyTelemetry(l, { elapsedSec: 200, pressureBar: 2.5, volumeLiters: 100 });
    expect(l.status).toBe('COMPLETED');
  });
  it('aborts on pressure fault', () => {
    const l = applyTelemetry(activateLease(createLease(base)), { elapsedSec: 10, pressureBar: 3.6, volumeLiters: 1 });
    expect(l.status).toBe('ABORTED_PRESSURE_FAULT');
    expect(applyTelemetry(activateLease(createLease(base)), { elapsedSec: 10, pressureBar: 1.9, volumeLiters: 1 }).status).toBe('ABORTED_PRESSURE_FAULT');
  });
  it('aborts on flow fault (no flow after 60 s, or >5% overshoot)', () => {
    expect(applyTelemetry(activateLease(createLease(base)), { elapsedSec: 61, pressureBar: 2.5, volumeLiters: 0 }).status).toBe('ABORTED_FLOW_FAULT');
    expect(applyTelemetry(activateLease(createLease(base)), { elapsedSec: 30, pressureBar: 2.5, volumeLiters: 106 }).status).toBe('ABORTED_FLOW_FAULT');
  });
  it('expires at max duration', () => {
    expect(applyTelemetry(activateLease(createLease(base)), { elapsedSec: 600, pressureBar: 2.5, volumeLiters: 10 }).status).toBe('EXPIRED');
  });
  it('terminal states are final and cannot be activated', () => {
    const done = applyTelemetry(activateLease(createLease(base)), { elapsedSec: 600, pressureBar: 2.5, volumeLiters: 10 });
    expect(() => activateLease(done)).toThrow();
    expect(applyTelemetry(done, { elapsedSec: 700, pressureBar: 2.5, volumeLiters: 99 }).status).toBe('EXPIRED');
  });
  it('averages pressure across telemetry', () => {
    let l = activateLease(createLease(base));
    l = applyTelemetry(l, { elapsedSec: 1, pressureBar: 2.0, volumeLiters: 1 });
    l = applyTelemetry(l, { elapsedSec: 2, pressureBar: 3.0, volumeLiters: 2 });
    expect(l.averagePressureBar).toBeCloseTo(2.5, 6);
  });
});

describe('CRC32 lease frame', () => {
  it('round-trips and detects tampering', () => {
    const frame = encodeLeaseFrame(createLease(base));
    const parsed = JSON.parse(frame);
    expect(parsed).toMatchObject({ lease_id: 'l1', block_id: 'b1', max_duration_sec: 600, max_volume_liters: 100, min_pressure_bar: 2, max_pressure_bar: 3.5 });
    expect(typeof parsed.crc32).toBe('number');
    expect(verifyLeaseFrame(frame)).toBe(true);
    expect(verifyLeaseFrame(frame.replace('"max_volume_liters":100', '"max_volume_liters":999'))).toBe(false);
  });
});

describe('Venturi plan (AC-10)', () => {
  const input = { treeCount: 1000, dripFlowLph: 4, waterPerTreeLiters: 2, fertilizerGramsPerTree: 30, injectorRateLph: 200 };
  it('computes water, fertilizer, and 3 phases with a 900 s flush', () => {
    const p = planVenturiFertigation(input);
    expect(p.totalWaterLiters).toBe(2000);
    expect(p.totalFertilizerKg).toBe(30);
    expect(p.phases.map((x) => x.phase)).toEqual(['A_PREWET_STABILIZE', 'B_INJECTION', 'C_FLUSH']);
    expect(p.phases[2]!.durationSec).toBe(900);
    expect(p.phases[0]).toMatchObject({ minPressureBar: 2.3, maxPressureBar: 2.7, targetPressureBar: 2.5 });
    expect(p.phases[1]!.durationSec).toBe(1800); // 2000 L / (1000 trees * 4 L/h) = 0.5 h
    expect(p.lease.requiredPressureBar).toBe(2.5);
    expect(p.lease.maxDurationSec).toBe(p.phases.reduce((s, x) => s + x.durationSec, 0));
  });
  it('rejects bad inputs', () => {
    expect(() => planVenturiFertigation({ ...input, dripFlowLph: 0 })).toThrow();
    expect(() => planVenturiFertigation({ ...input, fertilizerGramsPerTree: -1 })).toThrow();
  });
});

describe('microclimate risk hours', () => {
  it('counts readings meeting thresholds', () => {
    const r = [
      { tempC: 22, humidityPct: 95 }, { tempC: 22, humidityPct: 60 }, { tempC: 35, humidityPct: 95 }, { tempC: 24, humidityPct: 92 },
    ];
    expect(countRiskHours(r, { minHumidityPct: 90, minTempC: 20, maxTempC: 28 })).toBe(2);
  });
});

describe('review hardening (fail safe on garbage input)', () => {
  it('rejects non-finite lease bounds', () => {
    expect(() => createLease({ ...base, maxVolumeLiters: Infinity })).toThrow(RangeError);
    expect(() => createLease({ ...base, maxDurationSec: NaN })).toThrow(RangeError);
  });
  it('NaN telemetry aborts an ACTIVE lease instead of leaving it running', () => {
    const active = activateLease(createLease(base));
    expect(applyTelemetry(active, { elapsedSec: 1, pressureBar: NaN, volumeLiters: 1 }, 5).status).toBe('ABORTED_PRESSURE_FAULT');
    expect(applyTelemetry(active, { elapsedSec: 1, pressureBar: 2.5, volumeLiters: undefined as unknown as number }, 5).status).toBe('ABORTED_PRESSURE_FAULT');
  });
});
