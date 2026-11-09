import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Security floors (design/dependency-risk.md). The hub validates LAN pushes with zod and writes them with drizzle,
// so the resolved versions must stay at or above the patched releases.
const req = createRequire(import.meta.url);
/** Version of the copy this package really resolves; walks up from the entry file (drizzle-orm does not export ./package.json). */
function version(pkg: string): number[] {
  let dir = dirname(req.resolve(pkg));
  while (!existsSync(join(dir, 'package.json')) || JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name !== pkg) dir = dirname(dir);
  return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version.split('.').map(Number);
}
const atLeast = (v: number[], min: number[]) => {
  for (let i = 0; i < min.length; i++) if ((v[i] ?? 0) !== min[i]) return (v[i] ?? 0) > min[i]!;
  return true;
};

describe('dependency security floors', () => {
  it('zod >= 4.6.6 (GHSA-mrhx-c7xc-m3w5: memory exhaustion on oversized collections)', () => {
    expect(version('zod').join('.')).toSatisfy((v: string) => atLeast(v.split('.').map(Number), [4, 6, 6]));
  });

  it('drizzle-orm >= 0.45.2 (GHSA-gpj5-g38j-94v9: SQL injection via escaped identifiers)', () => {
    expect(version('drizzle-orm').join('.')).toSatisfy((v: string) => atLeast(v.split('.').map(Number), [0, 45, 2]));
  });

  it('vitest >= 4.1.12 (GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8; drops vulnerable tinypool)', () => {
    expect(version('vitest').join('.')).toSatisfy((v: string) => atLeast(v.split('.').map(Number), [4, 1, 12]));
  });

  it('one drizzle-orm instance: sync-protocol and @cropvision/schema resolve the same copy', () => {
    const schemaReq = createRequire(req.resolve('@cropvision/schema'));
    expect(req.resolve('drizzle-orm')).toBe(schemaReq.resolve('drizzle-orm'));
  });
});
