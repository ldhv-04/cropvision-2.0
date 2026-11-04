import { describe, expect, it } from 'vitest';
import { generateScoutingCheckpoints, pointInPolygon } from '../src/transect';

const rect = { type: 'Polygon' as const, coordinates: [[[108.0, 12.0], [108.01, 12.0], [108.01, 12.006], [108.0, 12.006], [108.0, 12.0]]] };
// concave "L" shape
const L = { type: 'Polygon' as const, coordinates: [[[108.0, 12.0], [108.01, 12.0], [108.01, 12.002], [108.002, 12.002], [108.002, 12.01], [108.0, 12.01], [108.0, 12.0]]] };

describe('Z-transect (AC-07)', () => {
  for (const n of [5, 10]) {
    it(`returns ${n} ordered points inside a rectangle`, () => {
      const pts = generateScoutingCheckpoints(rect, n);
      expect(pts).toHaveLength(n);
      pts.forEach((p, i) => { expect(p.sequenceOrder).toBe(i + 1); expect(pointInPolygon([p.longitude, p.latitude], rect.coordinates[0]!)).toBe(true); });
    });
    it(`keeps ${n} points inside a concave polygon`, () => {
      const pts = generateScoutingCheckpoints(L, n);
      expect(pts).toHaveLength(n);
      pts.forEach((p) => expect(pointInPolygon([p.longitude, p.latitude], L.coordinates[0]!)).toBe(true));
    });
  }
  it('defaults to 5 and follows a Z (top row west→east, diagonal, bottom row west→east)', () => {
    const pts = generateScoutingCheckpoints(rect);
    expect(pts).toHaveLength(5);
    const first = pts[0]!, second = pts[1]!, last = pts[4]!;
    expect(second.longitude).toBeGreaterThan(first.longitude);
    expect(first.latitude).toBeGreaterThan(last.latitude); // starts north, ends south
  });
  it('rejects bad input', () => {
    expect(() => generateScoutingCheckpoints(rect, 0)).toThrow();
    expect(() => generateScoutingCheckpoints({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] } as any, 5)).toThrow();
  });
});

import { polygonAreaHectares } from '../src/transect';
describe('polygonAreaHectares', () => {
  it('≈ 0.01° x 0.006° at 12°N is about 73 ha', () => {
    // 1113 m * 662 m ≈ 73.7 ha
    expect(polygonAreaHectares(rect)).toBeGreaterThan(72);
    expect(polygonAreaHectares(rect)).toBeLessThan(75);
  });
  it('is orientation independent', () => {
    const rev = { ...rect, coordinates: [[...rect.coordinates[0]!].reverse()] };
    expect(polygonAreaHectares(rev)).toBeCloseTo(polygonAreaHectares(rect), 6);
  });
});
