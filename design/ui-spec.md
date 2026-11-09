# UI design system — evaluation and spec (UI-01..UI-04)

Source: `docs/prompt/design_UI_1.txt` (user plan, 2026-11-09; `docs/` is git-excluded, so this spec lives here).
User instruction: "read the UI plan, evaluate it, implement it" with TDD.
Branch: `worktree-ui-design-system`.

## 1. Evaluation of the plan

### Strengths (kept)
- Isolating colours as JSON palettes compiled to CSS variables + typed TS removes the hard-coded hex values in `apps/desktop/src/renderer/src/styles.css` and `apps/mobile/src/components/ui.tsx`.
- Telemetry colours reserved for semantic state; BSI thresholds 5 % / 15 % match the domain rule engine (`packages/domain/src/rule-engine.ts`).
- Memory-safety rules (thumbnails, virtualized lists, WebGL GeoJSON layers) target the open desktop RAM gap (UNVERIFIED U-01, 369 MB vs 250 MB).
- Fail-safe hardware UX (slide-to-actuate, always-visible stop, PHI lockout without bypass) matches the domain lease/PHI model.

### Problems found (Observed → decision)
| # | Problem | Decision |
|---|---|---|
| P1 | Two directory layouts: plan §1 (`agri-tactical.json`, `figma-bridge/`, `dist/`, `build-tokens.ts`) vs master prompt §1.1 (`agri-command-dark.json`, `figma/`, `src/`, `compile-palettes.ts`). | Follow master prompt §1.1 (the part the plan says to execute). |
| P2 | Value conflicts: desktop card `#11161F` (table) vs `#111622` (JSON); mobile card border `#CBD5E1` (table) vs `border #94A3B8` (JSON). | JSON values win ("exact values"). |
| P3 | `high-noon-monochrome` has no values, only "pure black/white + hazard red/amber"; §1 claims 14:1 contrast. | A-UI-1: define it so every text-on-surface pair is ≥ 14:1; white/black on solid hazard fills ≥ 4.5:1 (WCAG AA). |
| P4 | Plan breaks its own rules: mobile "min 10:1 text contrast" but `muted-foreground #334155` on `#FAF9F5` = 9.83:1; desktop white on `destructive #EF4444` = 3.76:1 (fails WCAG AA for 13 px text); dark `border #1E293B` on `#0B0F17` = 1.31:1 (border nearly invisible). | Keep the exact values (user said "exact"); the compiler emits a contrast audit and these pairs are listed for a user decision. Tests assert the real numbers, not a rule the palette fails. |
| P5 | `$schema` URL is markdown-mangled (`[https://…](https://…)`); one JSON holds two templates although §1.1 wants one file per palette. | Plain URL; one file per palette. |
| P6 | UI asks for data that does not exist in `packages/schema/src/tables.ts`: farm entity (Farm Selector), crop season, leaf-wetness / microclimate rust-risk hours, stored lesion masks (split-compare), LoRa serial config, AI-model adapter switching, drip-line geometry, overexposure detection. | Not invented (CLAUDE.md). Non-goals; the UI only shows real data. |
| P7 | `apps/desktop/src/renderer/tsconfig.json` does not exist (one `apps/desktop/tsconfig.json`). | Wire the existing tsconfig. |
| P8 | Heavy native deps: `sharp` (Electron rebuild), `@shopify/react-native-skia` (APK rebuild), NativeWind (Babel/Metro changes on Expo 55 / RN 0.83). | A-UI-2: no `sharp` — thumbnails via Electron `nativeImage`. No Skia — reticle is a bordered `View` (contour overlay needs mask data, P6). No NativeWind — mobile reads the typed palette object, which is all Part 3 needs. |
| P9 | 4 large steps; plan says "start with Step 1 and 2". | Delivered as UI-01..UI-04, each tested and committed separately. |

### Dependencies added (A-UI-3)
The plan names shadcn/ui, Tailwind, `@tanstack/react-virtual`, Lucide icons and Command (`cmdk`). Added to `apps/desktop` only, nothing native: `tailwindcss@3`, `postcss`, `autoprefixer`, Radix primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`, `@tanstack/react-virtual`. Revert = drop the commit.

## 2. Scope and acceptance criteria

### UI-01 `@cropvision/theme-tokens`
- AC-T1 Given `palettes/*.json`, When compiled, Then CSS has `:root` (agri-command-dark, desktop default) plus `.theme-<id>` blocks with every shadcn + telemetry token as `--<token>`, and a Tokens-Studio JSON with one set per palette.
- AC-T2 Exact plan values for agri-command-dark and tactical-daylight.
- AC-T3 Committed `src/css-variables.css`, `src/palettes.generated.ts` and `figma/shadcn-ui-kit-tokens.json` equal the compiler output (drift test).
- AC-T4 A palette missing a token or with an invalid colour is rejected, naming palette and token.
- AC-T5 Contrast audit: tactical-daylight foreground/background ≥ 10:1; high-noon-monochrome text pairs ≥ 14:1; audit flags the P4 pairs below target.
- AC-T6 Runtime switching: controller lists palettes, switches, notifies subscribers, rejects unknown ids, applies the theme class to a document root.
- AC-T7 Tailwind preset maps shadcn names to `var(--token)`, adds telemetry colours and `font-mono` = JetBrains Mono stack.

### UI-02 Desktop wiring + primitives
- AC-D1 Tailwind builds with the preset; `globals.css` imports `css-variables.css`; desktop `build` passes.
- AC-D2 Primitives Button, Badge, Card, Tabs, Dialog, Select, Command, Tooltip, Slider, ScrollArea exist and typecheck; 1 px borders; no large shadows.
- AC-D3 `cv-media://thumb/<key>` returns an image ≤ 160×160 for a stored sample, 404 for unknown keys, refuses path traversal.
- AC-D4 Severity → telemetry tone (healthy < 5 ≤ warning < 15 ≤ critical) is one tested function used by map, badges and legend.

### UI-03 Desktop workstation shell
- AC-S1 Fixed `h-screen w-screen overflow-hidden` shell: top bar (h-11), left rail (w-14, 5 modules, Alt+1..5), centre, right inspector (400 px, tabs).
- AC-S2 Top bar shows LAN hub port, addresses, mDNS state.
- AC-S3 Map module: CAD tool strip (select / draw / Z 5 / Z 10 / layer toggles), BSI legend with the 3 thresholds.
- AC-S4 Overview tab: KPI grid (BSI, DI, samples, PHI lock), rule-engine box with code + spray volume (domain `decideCoffeeRustAction`), "Issue work order" button.
- AC-S5 Samples tab: virtualized list (64 px rows), thumbnail via `cv-media://thumb`, DS % mono bold, latency ms; click opens dialog with full image.
- AC-S6 Edge studio: theme template inspector lists palettes with swatches, switches theme at runtime.
- AC-S7 Existing real-Electron e2e flows still pass.

### UI-04 Mobile tactical daylight
- AC-M1 `components/ui.tsx` colours come from `tactical-daylight` tokens; controls ≥ 56 px, border 2.
- AC-M2 LAN banner: last sync OK → emerald "● TRẠM ĐÃ KẾT NỐI - ĐỒNG BỘ (n MẪU)"; else amber "○ CHẾ ĐỘ NGOẠI TUYẾN - LƯU SQLITE CỤC BỘ" (pure function, tested).
- AC-M3 Work-order cards: 8 px left stripe by `orderType`, 20 px bold block name, full-width h-14 start button.
- AC-M4 Scouting HUD: 280 px reticle; unstable → red 4 px + "GIỮ CHẶT TAY - ĐANG RUNG (x.x m/s²)" + shutter disabled; stable → emerald 2 px (tested mapping). Canopy labels from `CANOPY_WEIGHTS`, default LOW.
- AC-M5 Valve: 0–4 bar gauge with 2.3–2.7 optimal band (tested geometry); SlideToActuate fires only past threshold (tested); emergency stop visible while ACTIVE.
- AC-M6 PHI lockout: full-screen red block with both dates in DD/MM/YYYY, no bypass control (tested formatter).

## 3. Non-goals
Farm selector, crop-season badge, leaf-wetness/microclimate hours, lesion-mask split-compare, LoRa config, AI model switcher, drip-line layer, overexposure gate, Skia contours, NativeWind, Figma import itself (file produced only), physical-device checks.

## 4. Assumptions
A-UI-1..3 above. A-UI-4: Vietnamese UI strings stay; English module names from the plan used as labels.
