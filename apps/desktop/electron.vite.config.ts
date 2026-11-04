import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Workspace packages ship TypeScript sources, so they are bundled; real npm deps (better-sqlite3, fastify, ...) stay external.
const bundled = ['@cropvision/schema', '@cropvision/domain', '@cropvision/sync-protocol'];

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: bundled })] },
  preload: { plugins: [externalizeDepsPlugin({ exclude: bundled })] },
  renderer: { plugins: [react()] },
});
