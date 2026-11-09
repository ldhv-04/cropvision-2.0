// Run: pnpm --filter @cropvision/theme-tokens compile   (vite-node; the contrast audit runs in the tests)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileCss, compileFigmaTokens, compileTs, loadPalettesFromDir } from './compile.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const palettes = loadPalettesFromDir(`${root}palettes`);
writeFileSync(`${root}src/css-variables.css`, compileCss(palettes));
writeFileSync(`${root}src/palettes.generated.ts`, compileTs(palettes));
writeFileSync(`${root}figma/shadcn-ui-kit-tokens.json`, JSON.stringify(compileFigmaTokens(palettes), null, 2) + '\n');

console.log(`compiled ${palettes.length} palettes: ${palettes.map((p) => p.id).join(', ')}`);
