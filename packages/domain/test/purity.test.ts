import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

describe('AC-02 packages/* stay environment-agnostic', () => {
  it('no node builtins or react-native imports in any packages/*/src', () => {
    const bad = readdirSync(root).flatMap((p) => {
      try { return walk(join(root, p, 'src')); } catch { return []; }
    }).filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) =>
      /from\s+['"](node:[^'"]+|fs|path|os|crypto|child_process|react-native[^'"]*)['"]|require\(['"](fs|path|react-native)/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
