# @cropvision/theme-tokens

Colour templates for CropVision 2.0, kept out of component code. Spec and evaluation: `design/ui-spec.md`.

| Path | What |
|---|---|
| `palettes/*.json` | Source of truth, one palette per file (shadcn/ui tokens + telemetry tokens + contrast targets). |
| `src/css-variables.css` | Generated. `:root` = first palette (agri-command-dark); every palette as `.theme-<id>`. Each colour also as `--<token>-rgb` channels. |
| `src/palettes.generated.ts` | Generated typed palettes for React Native / Skia. |
| `figma/shadcn-ui-kit-tokens.json` | Generated W3C token sets (`$value`/`$type`) for Tokens Studio / shadcn/ui Figma Kit. |
| `src/tailwind.preset.ts` | Tailwind preset mapping shadcn names to the variables. |
| `src/index.ts` | `PALETTES`, `getPalette`, `createThemeController`, `applyThemeClass`, `contrastRatio`, `auditContrast`, `readableOn`, `severityTone`. |
| `src/react.tsx` | `ThemeProvider` / `useTheme` (React DOM and React Native). |

## Add or change a palette
1. Add `palettes/<id>.json` (copy an existing one; `order` sets list position, the lowest is the CSS default).
2. `pnpm --filter @cropvision/theme-tokens compile`
3. `pnpm --filter @cropvision/theme-tokens test` — fails if a token is missing/invalid or a generated file is stale. Contrast results are in `auditContrast(palette)`.

## Figma
Import `figma/shadcn-ui-kit-tokens.json` with Tokens Studio (or a Figma Variables importer) in the shadcn/ui Figma Kit. Not verified against Figma here (no Figma access).
