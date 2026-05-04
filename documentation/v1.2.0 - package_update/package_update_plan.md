# Package Update Implementation Plan

This document outlines a phased approach to updating the dependencies in the `figma-edit-mcp` project. By isolating major version updates from minor patches, we can easily identify and resolve any breaking changes.

> **Package manager policy:** Bun is the **default and exclusive** package manager for this project. All install / remove / run commands MUST use `bun`. References to `npm` are deprecated and should be removed wherever they appear (scripts, docs, CI). The only lockfile of record is [bun.lock](../../bun.lock); `package-lock.json` is to be deleted.

## General Verification Steps
After every phase, the following verification steps MUST be run to ensure the project remains stable:
1. **Type Checking / Build**: `bun run build:all` (Ensures the MCP server and Figma Plugin compile successfully).
2. **Unit Tests**: `bun test` (Runs the Bun test suite to verify logical correctness).

## Clean-Reinstall Step (major-phase prerequisite)
Before the **first install command** of every **major-version phase** (Phases 3, 4, and 5), purge `node_modules` to eliminate stale transitives from the previous phase — especially around dual ESM/CJS packages like `uuid` where leftover artifacts can mask resolution failures:

```sh
rm -rf node_modules && bun install
```

`bun.lock` is **preserved** (not deleted) so exact-pin manifests still resolve deterministically. Run the general verification steps once after the clean reinstall and before applying the phase's bump, so any regression can be attributed to the bump rather than to ambient state.

---

## Phase 0: Pre-flight — Bun-only migration
Before any dependency bumps, normalise the toolchain so every later phase runs through Bun.

**Tasks:**
- [x] **Delete `package-lock.json`** at the repo root (Bun owns the lockfile).
- [x] **Update `package.json` scripts** to remove every `npm` invocation:
  - `build:all`: `npm run build && npm run plugin:build` → `bun run build && bun run plugin:build`
  - `pub:release`: `bun run build && npm publish` → `bun run build && bun publish`
  - Any other future scripts must also use `bun run` / `bun x` rather than `npm run` / `npx`.
- [x] **Repin floating versions** in `package.json` to **exact** versions (no `^`, `~`, or `latest`), matching the style of the existing `"@modelcontextprotocol/sdk": "1.13.1"` and `"zod": "3.22.4"` pins.
  - **What to pin to:** the version **currently installed** for each package, as reported by `bun pm ls --all` (or read directly from [bun.lock](../../bun.lock)). Phase 0 must NOT bump versions — it only freezes the current state. Subsequent phases perform the actual upgrades.
  - **Packages to repin:** `uuid`, `ws`, `@types/bun`, `bun-types`, `typescript`, `@figma/plugin-typings`, `esbuild`, `tsup`. (`@modelcontextprotocol/sdk` and `zod` are already exact-pinned and need no change in Phase 0.)
  - **Why:** Floating ranges (`latest`, `^x.y.z`) let `bun install` resolve to different versions on different machines, defeating the phased-bump plan. Security-patch bumps are handled later by review-gated Renovate/Dependabot PRs, not silent drift.
- [x] **Reinstall from clean state**: `rm -rf node_modules && bun install`.
- [x] **Verify**: `bun run build:all` and `bun test` both succeed.
- [x] **Commit** the lockfile + script changes as a discrete commit before Phase 1.

---

## Phase 1: Housekeeping & Minor Updates
This phase removes unused dependencies and safely updates packages that only have minor or patch version bumps. To keep blame narrow when something breaks, the work is split into three independently-verified slices.

### Phase 1a — Housekeeping (remove orphaned deps)
- [x] **Uninstall `ts-morph`**: `bun remove ts-morph`
- [x] **Verify**: Run the general verification steps.

### Phase 1b — Runtime minors
- [x] **Update `ws`**: `bun add ws@8.20.0`
- [x] **Verify**: Run the general verification steps.

### Phase 1c — Dev-dependency minors
- [x] **Update dev deps**:
  - Run: `bun add -d @figma/plugin-typings@1.125.0 tsup@8.5.1 @types/bun@1.3.13 bun-types@1.3.13`
  - Note: `esbuild` is **not** included here — it is handled in Phase 2.
- [x] **Verify**: Run the general verification steps.

---

## Phase 2: `esbuild` Update
esbuild's stated versioning policy treats every 0.x bump as potentially breaking, so `0.27.2 → 0.28.0` is given its own phase rather than being grouped with safe minors. esbuild drives the Figma plugin build via [src/figma_plugin/build.js](../../src/figma_plugin/build.js); a silent API change there would not necessarily surface in `bun run build:all` exit status without inspection.

**Tasks:**
- [x] **Scan the changelog** for `esbuild` 0.27 → 0.28 ahead of the bump. Flag any of: removed/renamed build options, default behavior changes (e.g. `format`, `platform`, `target`, `loader` defaults), changes to plugin API or output file naming.
- [x] **Update esbuild**: `bun add -d esbuild@0.28.0`
- [x] **Audit `src/figma_plugin/build.js`**: confirm every option passed to `esbuild.build(...)` is still valid under 0.28; reconcile any flagged changes from the changelog scan.
- [x] **Verify build output**: run `bun run plugin:build` and inspect the generated plugin bundle (size, entry shape) for unexpected diffs vs. the pre-bump output.
- [x] **Verify**: Run the general verification steps.

---

## Phase 3: TypeScript Major Update
TypeScript 6.0 introduces stricter type-checking rules and removes deprecated features. Beyond user-code type errors, the bump can also break tooling indirectly — peer-dep mismatches, stale ambient typings, or removed `lib.*` declarations.

**Tasks:**
- [x] **Clean reinstall** (see "Clean-Reinstall Step" above): `rm -rf node_modules && bun install`, then run the general verification steps to confirm a clean baseline before bumping.
- [x] **Pre-bump compatibility check** — confirm the toolchain accepts TS 6 *before* installing:
  - [x] **`tsup@8.5.1` peer-dep**: verify its declared `peerDependencies` / `peerDependenciesMeta` accept `typescript@6.x` (check `node_modules/tsup/package.json` after Phase 1c, or its release notes).
  - [x] **`@figma/plugin-typings@1.125.0`**: confirm its `.d.ts` declarations still parse under TS 6 (no usage of removed syntax / deprecated `lib` references).
  - [x] **[tsconfig.json](../../tsconfig.json) `lib` entries** (`lib.dom`, `lib.es*` and any others): confirm each is still shipped by `typescript@6.0.3` — TS majors occasionally drop the lowest `lib.es*` targets.
- [x] **Update TypeScript**:
  - Run: `bun add -d typescript@6.0.3`
- [x] **Verify & Fix**: Run `bun run build:all`.
  - Fix any type errors that arise from the stricter compiler rules in TypeScript 6.0.
  - If `tsup` emits peer-dep warnings, treat them as blockers and resolve before continuing.
- [x] **Verify Tests**: Run `bun test`.

---

## Phase 4: UUID Major Update
`uuid` from v11 to v14 contains major updates, which might include changes to module resolution (ESM vs CommonJS) or internal API changes.

**Tasks:**
- [x] **Clean reinstall** (see "Clean-Reinstall Step" above): `rm -rf node_modules && bun install`, then run the general verification steps. This is especially important here because `uuid`'s ESM/CJS surface has churned across major versions and stale transitives are a common source of false-negative resolution failures.
- [x] **Update UUID**:
  - Run: `bun add uuid@14.0.0`
- [x] **Verify Imports**: Check `src/mcp_server/figma-client.ts` to ensure imports like `import { v4 as uuidv4 } from 'uuid';` are still resolving correctly.
- [x] **Verify**: Run the general verification steps. Fix any module resolution issues if they occur.

---

## Phase 5: Zod + MCP SDK Major Update
Zod v4 includes major structural changes and potentially tighter parsing rules. Since this project heavily relies on Zod for MCP tool input schemas, this is the most critical update. The `@modelcontextprotocol/sdk` is bumped in the same phase because its tool-registration API is built around Zod schema types — pinning the SDK to a Zod-v3-era contract while moving to Zod v4 risks breaking schema acceptance.

**Tasks:**
- [x] **Clean reinstall** (see "Clean-Reinstall Step" above): `rm -rf node_modules && bun install`, then run the general verification steps. Required so the SDK + Zod bump runs against a clean transitive graph rather than a tree carrying remnants of Zod v3.
- [x] **Resolve the target `@modelcontextprotocol/sdk` version**:
  - Run `bun info @modelcontextprotocol/sdk version` to read the current latest published version.
  - Verify the changelog/release notes for that version explicitly state Zod v4 support; if not, walk back to the most recent version that does. Record the chosen version (e.g. `X.Y.Z`) here before proceeding.
  - Chosen SDK version: `1.29.0` (latest as of 2026-05-04; declares `"zod": "^3.25 || ^4.0"`).
- [x] **Update Zod and MCP SDK together**:
  - Run: `bun add zod@4.4.3 @modelcontextprotocol/sdk@<chosen-version>` — substitute the version recorded in the previous step. Do NOT use `@latest` in the install command, since it bypasses the exact-pin policy from Phase 0.
- [x] **Audit Schemas — codebase-specific Zod v3 → v4 migration checklist.** A scan of [src/mcp_server/tools/](../../src/mcp_server/tools/) shows the project uses only a small Zod surface: `z.string()`, `z.number()`, `z.boolean()`, `z.any()`, `.describe()`, `.optional()`, `.nullable()`, `.default()`, `.parse()`. The audit must verify each of these against v4 behavior:
  - [x] **`.optional().default(x)` ordering**: in Zod v4 the inferred input/output type and default-application semantics for chained `.optional().default()` differ from v3. Re-check every tool schema using this pattern (most input schemas do) — confirm types still flow as expected through the MCP SDK's `inputSchema` parameter.
  - [x] **`.describe()` propagation**: Zod v4 stores description metadata differently. Verify the MCP SDK still picks up `.describe()` text and surfaces it as the tool-parameter description in the registered tool list (sample one tool end-to-end via the MCP inspector or a smoke test).
  - [x] **`z.any()` inference**: confirm `z.any()` still infers as `any` (not `unknown`) at the SDK boundary; if v4 narrows this, callers relying on loose typing may need explicit casts.
  - [x] **`ZodError` shape**: any code reading parse-failure output must use `.issues` (v4) rather than `.errors` (v3). Grep the repo for `.errors` access on `ZodError` instances.
  - [x] **`.parse()` vs `.safeParse()` throw shape**: v4 throws a `ZodError` whose `.issues` formatting differs slightly; confirm any error-rendering paths still produce useful messages.
  - [x] **MCP SDK ↔ Zod-v4 bridge**: confirm the bumped `@modelcontextprotocol/sdk` accepts Zod v4 schema instances directly. If the SDK still expects `ZodTypeAny` from Zod v3, schema registration will type-error or fail at runtime — this is the hard gate for the phase.
- [x] **Verify**: Run the general verification steps.
- [x] **Run MCP Tool Tests**: Pay special attention to test output for schema validation edge cases (especially `.optional().default()` boundaries and `null` vs `undefined` handling) to ensure the tools still accept the correct inputs.

---

## Pre-Publish Tasks
Before running `bun run pub:release`:
- [x] **Bump `version` field** in [package.json](../../package.json) from `0.3.5` to `1.2.0` (this is the project's first published version; the manifest version must match the release line).
- [x] **Confirm package metadata** is publish-ready: `name`, `description`, `bin`, `files`, and `main`/`module` entries are accurate (no stale paths from the upgrade).
- [x] **Dry-run the publish**: `bun publish --dry-run` and inspect the file list and resolved version.

## Completion Checklist
- [x] Pre-flight Bun-only migration completed (no `npm` references remain in `package.json` scripts; `package-lock.json` deleted).
- [x] All 5 phases completed successfully.
- [x] `bun run build:all` completes with zero errors.
- [x] `bun test` passes 100%.
- [x] `package.json` `version` field bumped to `1.2.0`.
- [x] `bun publish --dry-run` output reviewed and accepted.
- [x] Commit all `package.json` and `bun.lock` changes.
