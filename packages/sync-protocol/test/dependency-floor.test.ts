import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// Security floors (design/dependency-risk.md). The hub validates LAN pushes with zod and writes them with drizzle,
// so the resolved versions must stay at or above the patched releases.
const req = createRequire(import.meta.url);
const version = (pkg: string) => (req(`${pkg}/package.json`) as { version: string }).version.split('.').map(Number);
const atLeast = (v: number[], min: number[]) => {
  for (let i = 0; i < min.length; i++) if ((v[i] ?? 0) !== min[i]) return (v[i] ?? 0) > min[i]!;
  return true;
};

describe('dependency security floors', () => {
  it('zod >= 4.6.6 (GHSA-mrhx-c7xc-m3w5: memory exhaustion on oversized collections)', () => {
    expect(version('zod').join('.')).toSatisfy((v: string) => atLeast(v.split('.').map(Number), [4, 6, 6]));
  });
});
