import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'node:url';

// Workspace packages ship TypeScript sources, so they are bundled; real npm deps (better-sqlite3, fastify, sharp, ...) stay external.
const bundled = ['@cropvision/schema', '@cropvision/domain', '@cropvision/sync-protocol'];
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// Tailwind loads its config (and the TS preset from @cropvision/theme-tokens) itself via jiti; content globs are relative to apps/desktop.

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: bundled })] },
  preload: { plugins: [externalizeDepsPlugin({ exclude: bundled })] },
  renderer: {
    plugins: [react()],
    css: { postcss: { plugins: [tailwindcss({ config: here('./tailwind.config.ts') }), autoprefixer()] } },
  },
});
