import preset from '@cropvision/theme-tokens/tailwind-preset';

// Colours live in packages/theme-tokens/palettes; this file only says where classes are used. Paths are relative to apps/desktop.
export default {
  presets: [preset],
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
};
