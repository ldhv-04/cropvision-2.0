import { describe, expect, it } from 'vitest';
import { createStabilityGate } from '../src/services/camera-gate.logic';
import { bearingDeg, distanceM, relativeBearing } from '../src/lib/geo';

describe('camera stability gate (AC-19)', () => {
  const still = [0, 0, 9.81] as const;
  it('is locked while calibrating until 5 samples are in', () => {
    const g = createStabilityGate();
    for (let i = 0; i < 4; i++) expect(g.push(...still).lockReason).toBe('CALIBRATING');
    expect(g.push(...still)).toMatchObject({ isStable: true, lockReason: null });
  });
  it('locks when |‖a‖−9.81| > 1.2 and reports the score in m/s²', () => {
    const g = createStabilityGate();
    for (let i = 0; i < 5; i++) g.push(...still);
    const s = g.push(0, 0, 9.81 + 1.21); // shaking hand
    expect(s.isStable).toBe(false);
    expect(s.lockReason).toBe('HAND_SHAKE');
    expect(s.stabilityScore).toBeCloseTo(1.21, 6);
  });
  it('boundary 1.2 is still stable (strictly greater locks)', () => {
    const g = createStabilityGate();
    for (let i = 0; i < 4; i++) g.push(...still);
    expect(g.push(0, 0, 9.81 + 1.2).isStable).toBe(true);
  });
  it('rolling window: a spike releases after 5 calm frames', () => {
    const g = createStabilityGate();
    for (let i = 0; i < 5; i++) g.push(...still);
    g.push(3, 4, 9.81); // magnitude √(9+16+96.2) — big delta
    for (let i = 0; i < 4; i++) expect(g.push(...still).isStable).toBe(false);
    expect(g.push(...still).isStable).toBe(true);
  });
  it('accepts sensor readings in g (expo-sensors) via pushG', () => {
    const g = createStabilityGate();
    for (let i = 0; i < 5; i++) g.pushG(0, 0, 1);
    expect(g.pushG(0, 0, 1).isStable).toBe(true);
    expect(g.pushG(0, 0, 1.5).isStable).toBe(false);
  });
});

describe('geo helpers', () => {
  it('distance ≈ 111 m per 0.001° latitude', () => {
    expect(distanceM({ latitude: 12, longitude: 108 }, { latitude: 12.001, longitude: 108 })).toBeGreaterThan(110);
    expect(distanceM({ latitude: 12, longitude: 108 }, { latitude: 12.001, longitude: 108 })).toBeLessThan(112);
  });
  it('bearing north / east / south', () => {
    const o = { latitude: 12, longitude: 108 };
    expect(bearingDeg(o, { latitude: 12.01, longitude: 108 })).toBeCloseTo(0, 3);
    expect(bearingDeg(o, { latitude: 12, longitude: 108.01 })).toBeCloseTo(90, 1);
    expect(bearingDeg(o, { latitude: 11.99, longitude: 108 })).toBeCloseTo(180, 3);
  });
  it('relative bearing wraps to -180..180', () => {
    expect(relativeBearing(350, 10)).toBe(20);
    expect(relativeBearing(10, 350)).toBe(-20);
  });
});
