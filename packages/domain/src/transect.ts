export type Position = [number, number]; // [lng, lat]
export interface GeoJsonPolygon { type: 'Polygon'; coordinates: number[][][] }
export interface GeneratedCheckpoint { sequenceOrder: number; latitude: number; longitude: number }

export function pointInPolygon(pt: readonly number[], ring: readonly (readonly number[])[]): boolean {
  const [x, y] = pt as [number, number];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number], [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type P = [number, number];
const distToSeg = (p: P, a: P, b: P) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

/**
 * Z-shaped scouting route: north edge west→east, diagonal to the south-west, south edge west→east.
 * Works in a local metric projection (A7); points that fall outside a concave polygon are pulled
 * toward the deepest interior point until they are inside.
 */
export function generateScoutingCheckpoints(polygon: GeoJsonPolygon, count = 5): GeneratedCheckpoint[] {
  const ring = polygon?.coordinates?.[0];
  if (polygon?.type !== 'Polygon' || !ring || ring.length < 4) throw new RangeError('GeoJSON Polygon with >= 4 positions required');
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new RangeError('count must be an integer in 1..100');

  const lat0 = ring.reduce((s, p) => s + p[1]!, 0) / ring.length;
  const lng0 = ring.reduce((s, p) => s + p[0]!, 0) / ring.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320, ky = 110_540;
  const proj = (p: readonly number[]): P => [(p[0]! - lng0) * kx, (p[1]! - lat0) * ky];
  const unproj = (p: P): Position => [p[0] / kx + lng0, p[1] / ky + lat0];
  const poly = ring.map(proj);
  const inside = (p: P) => pointInPolygon(p, poly);

  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const ix = (maxX - minX) * 0.1, iy = (maxY - minY) * 0.1;
  const [x0, x1, y0, y1] = [minX + ix, maxX - ix, minY + iy, maxY - iy];
  const route: P[] = [[x0, y1], [x1, y1], [x0, y0], [x1, y0]];

  // deepest interior point on a coarse grid
  let anchor: P = poly[0]!, best = -1;
  for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) {
    const c: P = [minX + ((maxX - minX) * i) / 30, minY + ((maxY - minY) * j) / 30];
    if (!inside(c)) continue;
    let d = Infinity;
    for (let k = 0; k < poly.length - 1; k++) d = Math.min(d, distToSeg(c, poly[k]!, poly[k + 1]!));
    if (d > best) { best = d; anchor = c; }
  }

  const lens = [0, 1, 2].map((i) => Math.hypot(route[i + 1]![0] - route[i]![0], route[i + 1]![1] - route[i]![1]));
  const total = lens[0]! + lens[1]! + lens[2]!;
  const at = (d: number): P => {
    for (let i = 0; i < 3; i++) {
      if (d <= lens[i]! || i === 2) {
        const t = lens[i]! === 0 ? 0 : Math.min(1, d / lens[i]!);
        return [route[i]![0] + t * (route[i + 1]![0] - route[i]![0]), route[i]![1] + t * (route[i + 1]![1] - route[i]![1])];
      }
      d -= lens[i]!;
    }
    return route[3]!;
  };
  const pull = (p: P): P => {
    if (inside(p)) return p;
    const lerp = (t: number): P => [p[0] + t * (anchor[0] - p[0]), p[1] + t * (anchor[1] - p[1])];
    let lo = 0;
    for (let s = 1; s <= 200; s++) {
      const t = s / 200;
      if (inside(lerp(t))) {
        let hi = t;
        for (let b = 0; b < 30; b++) { const m = (lo + hi) / 2; if (inside(lerp(m))) hi = m; else lo = m; }
        const nudged = lerp(Math.min(1, hi + 0.02));
        return inside(nudged) ? nudged : lerp(hi);
      }
      lo = t;
    }
    return anchor;
  };

  return Array.from({ length: count }, (_, i) => {
    const [lng, lat] = unproj(pull(at(count === 1 ? total / 2 : (total * i) / (count - 1))));
    return { sequenceOrder: i + 1, latitude: lat, longitude: lng };
  });
}

/** Shoelace area on the same local metric projection, in hectares. */
export function polygonAreaHectares(polygon: GeoJsonPolygon): number {
  const ring = polygon.coordinates[0];
  if (polygon.type !== 'Polygon' || !ring || ring.length < 4) throw new RangeError('GeoJSON Polygon with >= 4 positions required');
  const lat0 = ring.reduce((s, p) => s + p[1]!, 0) / ring.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320, ky = 110_540;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i]![0]! * kx * ring[i + 1]![1]! * ky - ring[i + 1]![0]! * kx * ring[i]![1]! * ky;
  return Math.abs(a / 2) / 10_000;
}
