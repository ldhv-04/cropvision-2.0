// Run: pnpm --filter @cropvision/theme-tokens contrast — prints every contrast pair below its palette target.
import { PALETTES, auditContrast } from '../src/index';

for (const p of PALETTES) {
  const below = auditContrast(p).filter((r) => !r.pass);
  console.log(`${p.id}: ${below.length ? below.map((r) => `${r.fg} on ${r.bg} ${r.ratio.toFixed(2)}:1 < ${r.target}:1`).join('; ') : 'all contrast targets met'}`);
}
