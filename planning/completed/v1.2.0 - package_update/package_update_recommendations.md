# Package Update Plan — Review Findings

This document captures gaps, pitfalls, and contradictions identified in [package_update_plan.md](package_update_plan.md), cross-referenced against [package_update.md](package_update.md) and the actual state of the repository.

## Critical gaps

### 1. ~~MCP SDK + Zod v4 compatibility is not assessed~~ ✅ Resolved
[package.json](../../package.json) pins `@modelcontextprotocol/sdk@1.13.1`. That SDK version's tool-registration API is built around Zod v3 schema types. Phase 4 ("Audit Schemas") only mentions auditing `src/mcp_server/tools/*.ts`, but the real failure mode is at the SDK boundary — `server.tool(name, schema, handler)` may reject Zod v4 schemas or strip `.describe()` metadata.

**Recommendation:** Bump `@modelcontextprotocol/sdk` in the same phase as Zod. Pair the Zod v4 upgrade with an SDK bump to a version whose tool-registration API accepts Zod v4 schemas, so the two changes succeed or fail together rather than leaving the SDK pinned to a Zod-v3-era contract.

### 2. ~~Bun vs npm tooling mismatch~~ ✅ Resolved
The project uses Bun: [bun.lock](../../bun.lock) is present, and scripts in [package.json](../../package.json) call `bun run` / `bun test`. The plan originally used `npm install` exclusively, which would update `package-lock.json` but leave `bun.lock` stale and out of sync.

**Resolution:** Bun is now declared the default and exclusive package manager for this project. `npm` references are deprecated and being removed throughout. A new **Phase 0** in [package_update_plan.md](package_update_plan.md) handles:
- Deleting `package-lock.json`.
- Replacing every `npm` invocation in `package.json` scripts (`build:all`, `pub:release`) with `bun run` / `bun publish` equivalents.
- Repinning floating versions before reinstalling from a clean `bun install`.

All subsequent phases now use `bun add` / `bun add -d` / `bun remove` and verify via `bun run build:all` and `bun test`. [package_update.md](package_update.md) carries a matching Tooling Note.

## Contradictions with assessment / actual state

### 3. ~~Version deltas in the assessment don't match `package.json`~~ ✅ Resolved
[package_update.md](package_update.md) lists current versions like `uuid: 11.1.0`, `ws: 8.18.1`, `@types/bun: 1.2.5`, but the manifest declares:
- `"uuid": "latest"`
- `"ws": "latest"`
- `"@types/bun": "latest"`
- `"typescript": "^5.0.0"`

**Resolution:** Repin the manifest to concrete versions (no `^` or `~`), matching the existing style of `"@modelcontextprotocol/sdk": "1.13.1"` and `"zod": "3.22.4"`. Floating ranges are rejected because:
1. `"latest"` lets `bun install` pull a different version on each machine, making the plan's "from → to" deltas unenforceable.
2. The lockfile alone is not a durable guarantee — any regeneration (lock drift, merge conflict, `--force`) re-resolves `"latest"` to whatever exists at that moment.
3. Security-patch bumps are better handled by Renovate/Dependabot PRs (review gate) than by silent drift through floating ranges.

This work is folded into **Phase 0** of [package_update_plan.md](package_update_plan.md), which now repins all targeted runtime and dev dependencies to exact versions before any upgrade phase runs.

### 4. ~~`typescript: "^5.0.0"` will not move to 6.x with a plain reinstall~~ ✅ Resolved
Phase 2 explicitly pins `typescript@6.0.3`, but the manifest's `^5.0.0` caret would let future fresh installs regress to 5.x.

**Resolution:** Covered by **Phase 0** in [package_update_plan.md](package_update_plan.md), which now requires every dependency this plan touches — including `typescript` — to be repinned to an **exact** version with no `^` or `~`. The caret on `typescript` is dropped as part of that pre-flight step, so by the time Phase 2 runs `bun add -d typescript@6.0.3`, the manifest is already free of floating-range hazards.

## Pitfalls in phasing

### 5. ~~Phase 1 groups too many changes~~ ✅ Resolved
Uninstalling `ts-morph`, 5 minor dev-dep bumps, and `ws` all landed in one verification step. If `build:all` had broken, the offending package would have been ambiguous.

**Resolution:** Phase 1 in [package_update_plan.md](package_update_plan.md) is now split into three independently-verified slices:
- **Phase 1a** — Housekeeping: remove `ts-morph`, then verify.
- **Phase 1b** — Runtime minors: bump `ws`, then verify.
- **Phase 1c** — Dev-dependency minors: bump `@figma/plugin-typings`, `tsup`, `@types/bun`, `bun-types` together (homogeneous, low-risk type-only bumps), then verify.
- **Phase 1d** — `esbuild` is removed from the safe-minors group entirely and tracked separately (see Item 6).

### 6. ~~`esbuild 0.27 → 0.28` is not a safe minor~~ ✅ Resolved
esbuild's stated policy treats every 0.x bump as potentially breaking. It drives [figma_plugin/build.js](../../figma_plugin/build.js) and shouldn't be lumped with patch-level updates without a changelog scan.

**Resolution:** `esbuild` has been promoted to its own top-level **Phase 2** in [package_update_plan.md](package_update_plan.md), with explicit tasks for a pre-bump changelog scan, an audit of `figma_plugin/build.js` against any API changes, and a post-bump inspection of the generated plugin bundle. Subsequent phases were renumbered: TypeScript → Phase 3, UUID → Phase 4, Zod + MCP SDK → Phase 5.

### 7. ~~TypeScript 6 may break tooling indirectly~~ ✅ Resolved
Phase 3 originally only checked for code-level type errors. It now also covers tooling-level breakage.

**Resolution:** Phase 3 in [package_update_plan.md](package_update_plan.md) now includes a pre-bump compatibility check that explicitly verifies:
- `tsup@8.5.1`'s `peerDependencies` accept `typescript@6.x` (with peer-dep warnings treated as blockers post-install).
- `@figma/plugin-typings@1.125.0`'s `.d.ts` declarations still parse under TS 6.
- The `lib` entries declared in [tsconfig.json](../../tsconfig.json) are still shipped by `typescript@6.0.3` (TS majors occasionally drop the oldest `lib.es*` targets).

## Process gaps

### 8. ~~No rollback plan~~ ⏭️ Ignored
No mention of working on a feature branch, tagging pre-upgrade, or reverting an individual phase without reverting all.

**Decision:** Ignored. All changes for v1.2.0 will be made in the current feature branch, so rollback is handled by standard branch-level revert / discard rather than per-phase tagging. No plan changes required.

### 9. ~~`node_modules` hygiene not addressed~~ ✅ Resolved
Mid-major-bump installs frequently leave stale transitives (especially around `uuid` ESM/CJS dual packages).

**Resolution:** A new **Clean-Reinstall Step** section in [package_update_plan.md](package_update_plan.md) defines `rm -rf node_modules && bun install` (preserving `bun.lock` for deterministic resolution under the exact-pin manifest) as a prerequisite for every major-version phase. The clean-reinstall task is now the first item in **Phase 3** (TypeScript), **Phase 4** (UUID), and **Phase 5** (Zod + MCP SDK), with verification run against the clean baseline *before* the bump so any regression is attributable to the bump rather than ambient state.

### 10. ~~Zod v4 breaking-change list is generic~~ ✅ Resolved
"Check for deprecated methods" was not actionable. A scan of [src/mcp_server/tools/](../../src/mcp_server/tools/) shows the project's actual Zod surface is narrow — `z.string/number/boolean/any` plus `.describe / .optional / .nullable / .default / .parse` — so several initially-flagged migrations (`.email()`, `.passthrough()`, `.strict()`, `ZodEffects`) do not apply.

**Resolution:** Phase 5 in [package_update_plan.md](package_update_plan.md) now carries a codebase-specific Zod v3 → v4 audit checklist scoped to the methods this project actually uses:
- `.optional().default(x)` ordering / inference changes (used pervasively in tool input schemas).
- `.describe()` metadata propagation through the MCP SDK boundary.
- `z.any()` inference at the SDK boundary.
- `ZodError` shape (`.issues` vs `.errors`).
- `.parse()` / `.safeParse()` throw-shape differences.
- A hard gate: confirming the bumped `@modelcontextprotocol/sdk` accepts Zod v4 schema instances directly.

### 11. ~~`npm publish` impact not addressed~~ ✅ Resolved
[package.json](../../package.json) has a `pub:release` script. `zod` is a runtime dependency, so a major bump would normally be inherited by existing consumers.

**Resolution:** v1.2.0 is the **first published version** of this project. Consequences:
- No prior consumers exist, so the Zod v3 → v4 major bump cannot break anyone downstream — the SemVer-inheritance concern that motivated this item is moot.
- Phase 0 already migrates `pub:release` from `npm publish` to `bun publish`, consistent with the Bun-only policy.
- **Open follow-up (not blocking):** [package.json](../../package.json) currently declares `"version": "0.3.5"`, but this release line is labeled v1.2.0. Before running `pub:release`, reconcile the manifest `version` field with the intended published version. Capturing here for visibility; not adding a plan task because it's a single-line manifest edit at release time.

## Summary checklist for plan revision

- [x] Add a pre-flight phase: repin floating versions in `package.json`, decide on Bun vs npm, reconcile lockfiles. *(Phase 0 added; Bun made exclusive.)*
- [x] Bump `@modelcontextprotocol/sdk` in Phase 4 alongside Zod v4 (do not leave SDK pinned at 1.13.1).
- [x] Split Phase 1 into smaller verification slices. *(Split into 1a/1b/1c, with `esbuild` carved out into 1d.)*
- [x] Move `esbuild` out of the "safe minors" group. *(Promoted to its own Phase 2; later phases renumbered.)*
- [x] Add explicit Zod v3 → v4 migration items to Phase 5. *(Codebase-scoped checklist added; phase number updated from 4 → 5 after esbuild promotion.)*
- [~] ~~Document rollback strategy (branch / commit-per-phase).~~ *Ignored — feature-branch-level revert is sufficient.*
- [x] Document publish/release intent for v1.2.0. *(First published version; no prior consumers to break. Reconcile `package.json` `version` field at release time.)*
