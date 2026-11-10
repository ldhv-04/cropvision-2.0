# Dependency security status

Plan: `/home/terminator/.claude/plans/cozy-sparking-rivest.md` (approved 2026-11-09). Check: `pnpm audit`.

## Fixed (2026-11-09)
| Advisory | Package | Now | Guard |
|---|---|---|---|
| GHSA-mrhx-c7xc-m3w5 (high, memory exhaustion; reachable via LAN push validation) | zod (sync-protocol, desktop) | 4.6.7 | `packages/sync-protocol/test/dependency-floor.test.ts` |
| GHSA-gpj5-g38j-94v9 (high, SQL identifier injection; not reachable: identifiers come from the static schema) | drizzle-orm (schema, sync-protocol, desktop) | 0.45.4 | same file |
| GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr (critical, tinypool), GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8 (moderate, @vitest/mocker) | vitest (dev only) | 5.1.0 everywhere | same file |
| libvips CVEs (high) | sharp (desktop thumbnails, added by the UI work) | 0.35.5 | — |

## Accepted (build/dev tooling, no upstream fix on 2026-11-09)
| Advisory | Path | Why accepted | Re-check when |
|---|---|---|---|
| GHSA-mrhx-c7xc-m3w5 (high) zod 3.25.76 | `expo > @expo/cli` | Only in the Expo CLI on the developer machine; the app and hub use zod 4. Latest @expo/cli 55.0.37 still pins zod ^3.25.76. | a new `@expo/cli` 55.x / Expo SDK |
| GHSA-3g3m-2fjr-6pw4 (moderate) glob 13.0.6 | `expo > @expo/cli` | Dev CLI only; forcing glob 14 is a major bump under Expo CLI. | same |
| GHSA-gcqx-w48m-w2h4 (low) deepmerge 4.3.1 | `expo > @expo/config` | Build-time config merge of our own files; no patched release exists. | a deepmerge fix or Expo update |
| GHSA-g3hv-75wg-m249 (moderate) minimatch 9.0.9 / 10.2.6 | `electron-builder > app-builder-lib` | Packaging only, patterns come from our own build config; latest electron-builder 26.18.0 still requires minimatch ^10.2.5. | a new electron-builder release |

`pnpm.overrides` to force these majors was rejected: it risks breaking `expo start`/`expo export` and desktop packaging for tools that never run in the field.

## Known, unchanged
drizzle-orm resolves to two copies with the same version (desktop's React 18 peer-set vs schema/sync-protocol's React 19 via the optional `op-sqlite → react-native` peer). This was already the case before the upgrade; all tests and the real-Electron e2e pass.
