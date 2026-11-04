import { describe, expect, it } from 'vitest';
import { computeDs, computeBlockEpidemiology } from '../src/epidemiology';

describe('DS (AC-05)', () => {
  it('computes and clamps', () => {
    expect(computeDs(1000, 250)).toBe(25);
    expect(computeDs(1000, 0)).toBe(0);
    expect(computeDs(100, 150)).toBe(100);
    expect(computeDs(100, -5)).toBe(0);
  });
  it('rejects non-positive leaf area', () => {
    expect(() => computeDs(0, 1)).toThrow();
    expect(() => computeDs(-1, 1)).toThrow();
  });
});

describe('DI / BSI (AC-06)', () => {
  it('DI counts DS > 0.5 only', () => {
    const r = computeBlockEpidemiology([
      { canopyLayer: 'MID', dsIndexPct: 0.5 }, // not diseased (strict >)
      { canopyLayer: 'MID', dsIndexPct: 0.51 },
      { canopyLayer: 'TOP', dsIndexPct: 0 },
      { canopyLayer: 'LOW', dsIndexPct: 10 },
    ]);
    expect(r.diseaseIncidencePct).toBe(50);
    expect(r.totalSamples).toBe(4);
  });
  it('BSI is canopy-weighted (LOW 1.2, MID 1.0, TOP 0.8)', () => {
    const r = computeBlockEpidemiology([
      { canopyLayer: 'LOW', dsIndexPct: 10 },
      { canopyLayer: 'MID', dsIndexPct: 10 },
      { canopyLayer: 'TOP', dsIndexPct: 0 },
    ]);
    expect(r.blockSeverityIndexPct).toBeCloseTo((1.2 * 10 + 1.0 * 10) / 3.0, 10);
  });
  it('throws on empty', () => {
    expect(() => computeBlockEpidemiology([])).toThrow();
  });
});
