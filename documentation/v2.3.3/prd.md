# v2.3.3 PRD: Plugin Type-Check Restoration & Drift Prevention

This document is the product / implementation spec for the **v2.3.3** release of `figma-edit-mcp`. It follows v2.3.2 (Safety Contract Conformance & Atomicity Hardening) and is a small, focused **developer-infrastructure** release: it restores TypeScript type-checking for the Figma plugin source, which is currently silently disabled by a misconfigured `figma_plugin/tsconfig.json`, and adds a CI gate so it cannot regress.

> **Origin.** Found during the v2.3.2 Phase 8.5 review (2026-07-06). While adding a `clearTimeout` to `createComponentInstance`, the IDE flagged `setTimeout`/`clearTimeout` as `Cannot find name`. Investigation showed this is **not local** — *no* plugin ambient global (`figma`, `console`, `setTimeout`, node types) resolves under `tsc`, because the plugin tsconfig never loads `@figma/plugin-typings`. The plugin ships via **esbuild** (which does not type-check), so the whole plugin has been shipping **without a type-safety net** and with plugin-wide spurious IDE errors. This release closes that gap.

---

## Release identity

> [!IMPORTANT]
> **This is v2.3.3**, a **patch** release. It contains **no** MCP tool changes, no new editing powers, no MCP schema changes, and no runtime behavior changes to shipped code paths. It is a build/tooling + type-hygiene release. It depends on v2.3.2 being merged first (v2.3.2 is in progress at authoring time).
>
> Version surfaces to bump follow the v2.3.2 mechanism (`package.json`, root `package-lock.json`, both `server.json` fields, root `manifest.json`, and the plugin About handshake — enforced by `check:versions` and `check:plugin`): `2.3.2 → 2.3.3`.

---

## The problem

**The bug.** `figma_plugin/tsconfig.json` declares:

```json
"typeRoots": ["../../node_modules/@figma"]
```

The tsconfig lives at `figma_plugin/tsconfig.json`, so `../../node_modules` resolves to the **parent of the repository** (`<repo>/../node_modules`), which does not exist. The repo's actual dependency tree is at `<repo>/node_modules` (one level up from `figma_plugin/`, i.e. `../node_modules`). As a result `@figma/plugin-typings` is **never loaded**, and every plugin ambient global is unresolved.

**Consequences.**

- **No type safety on the most safety-critical code in the project.** The plugin dispatcher (`figma_plugin/src/main.ts`) and handlers enforce the entire safety contract (scope, name verification, locked/instance guards, batch atomicity). Today a wrong Figma API call, a typo'd property, or a bad narrowing in that code is caught only at runtime (or live testing), never by `tsc`.
- **Plugin-wide spurious IDE errors.** `tsserver` reports the same unresolved globals, so contributors see red squiggles on `figma`, `console`, `setTimeout`, etc. across every plugin file — training the team to ignore IDE diagnostics on exactly the code where they matter most.
- **It is invisible to CI.** The plugin is bundled with **esbuild** (`figma_plugin/build.js`), which performs no type-checking, and there is **no `tsc` step** for the plugin anywhere in `package.json`, `figma_plugin/build.js`, or `.github/workflows/ci.yml`. So nothing surfaces the breakage.

**Not a runtime bug.** The shipped plugin works — the globals (`figma`, `console`, `setTimeout`, `clearTimeout`, `TextDecoder`, …) all exist in the Figma plugin sandbox at runtime, and esbuild bundles the source unchanged. This is a **lost safety net**, not a live defect. The v2.3.2 live testing confirms the affected code paths behave correctly.

---

## Evidence (empirical, 2026-07-06)

Ground-truth measured against the real plugin source (`bunx tsc --noEmit` with probe configs):

| Config | `tsc` errors | Interpretation |
| :- | :-: | :- |
| **Current** (`typeRoots: ["../../node_modules/@figma"]`) | ~309 | @figma typings never load; every `figma`/`console`/`setTimeout`/type-name unresolved |
| **Naive path fix** (`typeRoots: ["../node_modules/@figma"]`) | **309** | *Still broken.* Correcting the path alone does **not** load the typings — the one-line fix a maintainer would try first is insufficient |
| `types: ["@figma/plugin-typings"]` **+ `lib: [es2018, dom]`** | 14 | Types load, but **`dom` conflicts** with the Figma typings — duplicate/redeclared `console`, `fetch`, `Navigation` (TS2451/TS2300). `dom` is the wrong lib |
| **`types: ["@figma/plugin-typings"]`, no `dom`, `shared/` included** *(decided fix)* | **9** | Typings load cleanly; the 9 residual errors are genuine type-safety gaps to triage (below) |

**Key insight:** the fix is *not* the `typeRoots` path. `@figma/plugin-typings` must be loaded via **`types: ["@figma/plugin-typings"]`**, and the `dom` lib must **not** be added (the Figma typings supply `console`/`fetch`/timers/`Navigation` themselves and collide with `dom`).

---

## Decisions

> [!NOTE]
> **D1 — Load the Figma typings via `types`, not `typeRoots`; do not add `dom`.** Replace the broken `typeRoots` with `"types": ["@figma/plugin-typings"]`. Keep `lib: ["es2018"]` (no `dom` — it redeclares globals the Figma typings own). This is the configuration empirically shown to load the typings with the fewest residual errors (9).

> [!NOTE]
> **D2 — Fix the residual 9, do not suppress them.** The 9 remaining errors are real type gaps, not noise. Fix each at the source (narrowing, casts, module resolution, one ambient global) rather than blanket-suppressing with `// @ts-nocheck` or loosening `strict`. `strict` stays on. See the triage table.

> [!NOTE]
> **D3 — Add a CI type-check gate, but only after the residual is zero.** Add `check:types:plugin` (`tsc --noEmit -p figma_plugin/tsconfig.json`) to `package.json` and wire it into CI so this regression cannot recur. It must be added **last** — after D1/D2 bring the error count to 0 — or CI goes red on introduction. The plugin build stays esbuild (fast, no type-check); the gate is a separate, additive check.

> [!NOTE]
> **D4 — Scope guard: plugin only.** This release fixes the *plugin* tsconfig and its residual errors. It does **not** re-audit the MCP-server tsconfig (`./tsconfig.json`), refactor plugin code beyond what the 9 errors require, or change any runtime behavior. If fixing a residual error would require a behavior change, stop and escalate rather than silently altering a live-verified code path.

---

## Residual error triage (the 9)

All measured with the decided fix (`types: ["@figma/plugin-typings"]`, no `dom`). **None is a confirmed runtime bug** — each is a type-expression gap that `tsc` correctly flags once it can finally see the code.

| # | Location | Error | Class | Disposition |
| :- | :- | :- | :- | :- |
| 1–2 | `handlers/componentHandlers.ts:707` (`.name`, `.type`) | TS2339 `Property … does not exist on type 'never'` | Narrowing artifact after `if (!("appendChild" in parentNode))` | Type `parentNode` explicitly (e.g. `BaseNode`) so the negative branch narrows to a real type, not `never`. Runtime is correct (live-verified). |
| 3–4 | `src/main.ts:194` (`.name`, `.type`) | TS2339 `… on type 'never'` | Same narrowing artifact in `validateCloneWrite`'s `!("appendChild" in parent)` branch | Same fix (explicit `BaseNode` typing / cast). |
| 5 | `handlers/connectHandlers.ts:42` | TS2339 `Property 'loadAsync' does not exist on type 'BaseNode'` | Invariant not expressed in types (`allowEditNode === "page"` ⟹ `scopeNode` is a `PageNode`) | Narrow/cast to `PageNode` before `loadAsync()`. No behavior change. |
| 6–7 | `handlers/nodeReaders.ts:8`, `utils/nodeUtils.ts:6` | TS2307 `Cannot find module '../../shared/nodeTypes.js'` | Module resolution — esbuild resolves the `.js`→`.ts` shared import; `tsc` under the current config does not | Sort module resolution (add `shared/` to `include` and/or set `moduleResolution`/`allowImportingTsExtensions` appropriately). Config-only. |
| 8–9 | `utils/exportUtils.ts:124–125` | TS2304 `Cannot find name 'TextDecoder'` | Sandbox global not declared by `@figma/plugin-typings` or `es2018` | Add a minimal ambient declaration for `TextDecoder` (the Figma sandbox provides it at runtime). Do **not** pull in `dom`. |

> [!NOTE]
> The two `never`-narrowing sites (#1–4) are in code **added and live-verified during v2.3.2** (parent-first creation cleanup, clone validation). Type-checking flags them as loosely typed, not as broken — a good demonstration of what the restored gate buys: it would have flagged these at author time.

---

## Scope & non-goals

**In scope**

1. Fix `figma_plugin/tsconfig.json` per D1 (`types`, no `dom`).
2. Resolve the 9 residual type errors per D2/the triage table.
3. Add `check:types:plugin` and wire it into CI per D3.
4. Version bump `2.3.2 → 2.3.3` across all surfaces; `CHANGELOG.md` entry.

**Explicit non-goals**

- No MCP-server tsconfig audit (`./tsconfig.json`) — separate concern (D4).
- No runtime behavior change to any shipped code path.
- No `strict` relaxation, no `@ts-nocheck`, no blanket `any` casts.
- No plugin refactor beyond the minimal edits the 9 errors require.
- No change to the esbuild build pipeline (the type gate is additive, not a replacement).

---

## Implementation plan (phased)

**Phase 1 — Fix the config (D1).** Replace `typeRoots` with `types: ["@figma/plugin-typings"]`; confirm `lib` stays `["es2018"]` (no `dom`). Re-run `tsc --noEmit -p figma_plugin/tsconfig.json` and confirm the count drops to the expected residual (~9, modulo the `shared/`-include detail).

**Phase 2 — Triage the residual (D2).** Fix all 9 per the table. After each, re-run `tsc` to confirm the count strictly decreases and no *new* errors appear. Do not proceed to a green state by suppression. If any fix appears to require a runtime behavior change, stop and escalate (D4).

**Phase 3 — Regression tests / gate (D3).**
- Add `check:types:plugin` → `tsc --noEmit -p figma_plugin/tsconfig.json` to `package.json` scripts.
- Wire it into `.github/workflows/ci.yml` (alongside `check:plugin` / `check:versions`).
- Confirm the gate is green locally and would fail if `typeRoots`/`types` were reverted or a real type error were introduced (prove it: temporarily reintroduce a break and confirm red).

**Phase 4 — Version & docs.** Bump `2.3.2 → 2.3.3` on all surfaces (`check:versions` passes); rebuild the plugin bundle so `check:plugin` passes; add the `CHANGELOG.md` v2.3.3 entry; confirm the full unit suite (`bun run test`) and existing checks stay green.

**Phase 5 — Verify.** `bun run build:all`, `bun run check:plugin`, `bun run check:versions`, `bun run check:types:plugin`, and `bun run test` all pass. IDE opens the plugin with no spurious ambient-global errors. No live Figma verification is required — this release changes no runtime behavior (the esbuild output should be byte-identical except the deliberate v2.3.2 code already present; a rebuild-diff confirms the type fixes did not alter emitted JS).

---

## Testing & rollout

- **Type gate:** `check:types:plugin` returns 0 errors and is in CI.
- **No emitted-JS drift:** rebuilding `figma_plugin/code.js` after the type fixes produces no functional change — the residual fixes are types/casts/config only. Confirm via `check:plugin` (rebuild + `git diff`); any *intended* diff must be limited to the deliberate edits, reviewed explicitly.
- **Full suite:** `bun run test` stays green (647+ tests as of v2.3.2).
- **Version:** `check:versions` green at `2.3.3`.
- **Rollout:** merge after v2.3.2; tag only after CI (now including `check:types:plugin`) passes.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| :- | :- | :- |
| A residual fix accidentally changes runtime behavior on a live-verified path | Low | D4 stop-and-escalate rule; `check:plugin` rebuild-diff catches any unexpected emitted-JS change; the fixes are types/casts/config only |
| Fixing `shared/nodeTypes.js` resolution un-masks further errors in `shared/` | Low–Med | Scope the `include` to what the plugin imports; if `shared/` itself has errors, triage or exclude with a recorded note rather than expanding scope |
| `TextDecoder` ambient declaration drifts from a future `@figma/plugin-typings` that adds it | Low | Prefer the typings if a version provides it; otherwise a one-line ambient `declare` with a comment pointing here |
| Turning on the CI gate blocks unrelated PRs if the residual isn't truly zero | Low | D3 sequencing — gate added only after Phase 2 reaches 0; prove-red/prove-green before wiring into CI |

---

## Provenance

| Item | Verified at | Finding |
| :- | :- | :- |
| Broken `typeRoots` | `figma_plugin/tsconfig.json` | `["../../node_modules/@figma"]` resolves outside the repo; `@figma/plugin-typings` never loads |
| No plugin type-check in build/CI | `package.json`, `figma_plugin/build.js`, `.github/workflows/ci.yml` | Plugin ships via esbuild only; no `tsc` step exists — breakage is invisible |
| Path fix insufficient | `tsc --noEmit` probe | Corrected `typeRoots` still yields 309 errors; typings load only via `types: [...]` |
| `dom` lib conflict | `tsc --noEmit` probe | `lib: [..., "dom"]` redeclares `console`/`fetch`/`Navigation` against the Figma typings (TS2451/TS2300) |
| Decided-fix residual = 9 | `tsc --noEmit` probe | `types: ["@figma/plugin-typings"]`, no `dom`: 4 `never`-narrowing, 1 `loadAsync`, 2 module-resolution, 2 `TextDecoder` |
| Not a runtime bug | v2.3.2 live testing (2026-07-06) | All affected paths behave correctly live; this is a lost type-safety net, not a live defect |

---

## Revision history

- **Rev 1, 2026-07-06** — initial PRD. Discovery during v2.3.2 Phase 8.5 review; empirical measurement of the fix (path-only insufficient; `types` + no-`dom` → 9 residual); triage of the 9; decision to fix-not-suppress and add a CI type-check gate sequenced after the residual reaches zero.
