# v2.3.3 PRD: Plugin Type-Check Restoration & Safety-Contract Gap Closure

This document is the product / implementation spec for the **v2.3.3** release of `figma-edit-mcp`. It follows v2.3.2 (Safety Contract Conformance & Atomicity Hardening) and has two tracks:

1. **Type-check restoration (developer infrastructure).** Restore TypeScript type-checking for the Figma plugin source, which is currently silently disabled by a misconfigured `figma_plugin/tsconfig.json`, and add a CI gate so it cannot regress.
2. **Safety-contract gap closure (Gaps 1, 3, 5).** Close the three code-level gaps confirmed by the adversarial review of [`figma-edit-mcp-gap-details.md`](figma-edit-mcp-gap-details.md): design-system updates that skip current-name verification (Gap 1), create-tool schemas that contradict the runtime parent-name requirement (Gap 3), and a batch delete that reports success on partial failure (Gap 5). Gaps 2 and 4 from that review are documentation-only; they are handled by the README rewording already in the working tree, not by this PRD.

> **Origin.** Found during the v2.3.2 Phase 8.5 review (2026-07-06). While adding a `clearTimeout` to `createComponentInstance`, the IDE flagged `setTimeout`/`clearTimeout` as `Cannot find name`. Investigation showed this is **not local** — *no* plugin ambient global (`figma`, `console`, `setTimeout`, node types) resolves under `tsc`, because the plugin tsconfig never loads `@figma/plugin-typings`. The plugin ships via **esbuild** (which does not type-check), so the whole plugin has been shipping **without a type-safety net** and with plugin-wide spurious IDE errors. This release closes that gap.

---

## Release identity

> [!IMPORTANT]
> **This is v2.3.3.** It grants **no new editing powers** and adds no new tools. Track 1 is build/tooling + type-hygiene only, with no runtime behavior change. Track 2 **tightens** the existing safety contract: previously optional verification fields become required (`currentVariableName`; new `currentStyleName` and `collectionName`; `parentNodeName` at the schema level), and batch success semantics are corrected. Agents that omitted these fields will now receive structured `Operation Denied` errors instead of unverified writes — an intended fail-closed change, following the v2.2.0 precedent of universalizing name verification. It depends on v2.3.2 being merged first (v2.3.2 is in progress at authoring time).
>
> Version surfaces to bump follow the v2.3.2 mechanism (`package.json`, root `package-lock.json`, both `server.json` fields, root `manifest.json`, and the plugin About handshake — enforced by `check:versions` and `check:plugin`): `2.3.2 → 2.3.3`.
>
> **Versioning policy (open-questions Q5, resolved 2026-07-09: Option A).** The release stays numbered **2.3.3**, and the rule is recorded as policy rather than precedent: **fail-closed safety tightenings may ship at patch level.** The project versions the safety contract's strength; making a guarantee stricter is a fix, and the `CHANGELOG.md` entry carries the breaking-change notice for agent callers. Agents do not reason from version numbers — the guides they load at runtime ship in the same artifact as the schemas, so guide/server consistency is independent of the number chosen. Revisit only if external integrators are known to pin versions.

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
> **D3 — Add a CI type-check gate, but only after the residual is zero.** Add `check:types:plugin` (`tsc --noEmit -p figma_plugin/tsconfig.json`) to `package.json` and wire it into CI so this regression cannot recur. It must be added **only after D1/D2 bring the error count to 0** — or CI goes red on introduction. The sequencing is by condition, not position: in the phased plan the gate lands as Phase 3, ahead of the Track 2 handler edits (Phases 4–6), so those land under its protection *(wording clarified per open-questions Q6, resolved 2026-07-09: Option A — the original "added last" predates Track 2)*. The plugin build stays esbuild (fast, no type-check); the gate is a separate, additive check.

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

## Track 2 — Safety-contract gap closure (Gaps 1, 3, 5)

> **Origin.** The adversarial review [`figma-edit-mcp-gap-details.md`](figma-edit-mcp-gap-details.md) identified five gaps between the documented safety contract and the shipped behavior. All five were verified against source and **live** against a Figma test document (2026-07-09). Gaps 2 and 4 need only wording changes (in flight in the working tree). Gaps 1, 3, and 5 need the code changes specified here.
>
> **Open questions.** All eight questions raised by the PRD re-review are **resolved** (2026-07-09); [`open-questions.md`](open-questions.md) is retained as the decision record with options and rationale. Where each decision lives: Q1 schema mechanism → D5; Q2 Gap 3 verification split → D6 / Phase 9; Q3 G2 target wording → D8 / Phase 7; Q4 refusal-message convention → D9; Q5 versioning policy → Release identity block; Q6 D3 sequencing wording → applied to D3; Q7 `status` edge semantics → D7 / Phase 6; Q8 hard cutover → Compatibility posture. Phases 4–7 are unblocked.

### The problems (all verified in code and live)

**Gap 1 — design-system updates skip right-object verification.** Node writes require ID + current name; variable and style *updates* do not.

- `variable_manage` / `UPDATE_VARIABLE` checks `currentVariableName` **only when supplied** (`figma_plugin/handlers/variableHandlers.ts:1032`); the schema marks it optional (`src/mcp_server/tools/variable.ts:115`). Live-verified: an ID-only value update mutates the variable with no verification; a wrong name is refused only because it was volunteered.
- `style_manage` with `styleId` has **no** current-name verification at all (`figma_plugin/handlers/styleHandlers.ts:13–23`), and its **required** `name` param is applied as the *new* name on every update (`styleHandlers.ts:47`). Live-verified: an update against a stale/mistaken ID both mutates the wrong style **and renames it** to the caller's wrong belief — destroying the evidence of what it was called.
- `variable_manage` / `CREATE_VARIABLE` accepts `collectionId` with no `collectionName` verification (`variableHandlers.ts:963`), unlike `variable_delete`, which requires and verifies it.
- `SAFETY.md` **G2** claims name verification covers "every write tool" — contradicted by its own Part B matrix rows for `variable_manage` and `style_manage`, and by the live behavior above.
- Cosmetic: the verification error at `variableHandlers.ts:1033` swaps its `Expected`/`got` operands.

**Gap 3 — create-tool schemas contradict the runtime contract.** `parentNodeName` is `.optional()` in the `create_shape`/`create_frame`/`create_text`/`create_svg`/`create_instance` schemas (`src/mcp_server/tools/create.ts`), while the runtime fails closed when it is absent (`verifyParentName`, `figma_plugin/src/main.ts:151`) and `SAFETY.md` A3/A4 already document it as required. Live-verified: omitting it is refused with `PARENT_NAME_MISMATCH` — a safe but avoidable failure, made worse by the error text ("recheck to ensure correct parentId is passed in"), which misdirects the agent toward the parent *ID* when the parent *name* was simply missing.

**Gap 5 — `node_delete` reports success on partial failure.** `deleteMultipleNodes` returns `success: successCount > 0` (`figma_plugin/handlers/nodeModifiers.ts:294`). Live-verified: a batch that deleted 1 of 2 items returned `{"success":true,"nodesDeleted":1,"nodesFailed":1}`. The other three batch aggregators (`text_set_content`, `annotation_set`, `instance_set_overrides`) already require `failureCount === 0`.

### Decisions

> [!NOTE]
> **D5 — Bring design-system updates up to the node-write standard (Gap 1).** Fail closed on a missing or mismatched current name, exactly like `verifyNodeName`:
> - `UPDATE_VARIABLE`: `currentVariableName` becomes **required** — in the `variable_manage` schema and in the handler (absent ⇒ reject, mismatch ⇒ reject, before any mutation).
> - `CREATE_VARIABLE`: new **required** `collectionName`, verified against the resolved collection's name before `createVariable` (same pattern as `variable_delete`).
> - `style_manage` with `styleId`: new **required** `currentStyleName`, verified against the resolved style's name before any mutation.
> - `style_manage` `name` becomes **optional at the schema level**: the handler enforces it on create; on update it renames only when explicitly provided. This removes the accidental-rename side effect — a properties-only update no longer has to pass (and therefore overwrite) the name.
> - Fix the swapped `Expected`/`got` operands in the variable verification error.
> - **Mechanism (open-questions Q1, resolved 2026-07-09: Option B).** The schemas keep their **flat object shapes** — no discriminated union. Each conditional requirement is stated twice in prose: in the field description (e.g. "REQUIRED for UPDATE_VARIABLE — the variable's **current exact** name, passed back verbatim from `variable_list`") and in the top-level tool description ("UPDATE_VARIABLE requires `currentVariableName`"). Enforcement is layered: a server-side `.superRefine()` rejects a non-conforming call with an actionable message (the violation, the read tool that supplies the correct value, and "pass it back verbatim"), and the plugin's fail-closed checks above remain as defense in depth (AS1 — the server is not the trust boundary). Rationale: the contract's consumer is an LLM; a flat, consistent schema with the requirement stated twice maximizes first-call correctness, and a fully-controlled refinement error gives one-round-trip recovery — where a discriminated union cannot cover `style_manage` (no discriminator) and would make `variable_manage` the one structurally alien schema on the server.

> [!NOTE]
> **D6 — Make create schemas match the runtime (Gap 3).** Remove `.optional()` from `parentNodeName` in the five create-tool schemas so the model is told to supply what the plugin already requires. `create_component_set` keeps its conditional shape (`parentId` itself is optional); its description and handler continue to enforce required-with-`parentId`. Reword the `PARENT_NAME_MISMATCH` error to also name the omitted-field case (e.g. "parentNodeName is missing or does not match…"), so an agent that somehow omits it is not steered into swapping a correct `parentId`.
> **Verification split (open-questions Q2, resolved 2026-07-09: Option A).** Once the schema requires the field, a conforming client can no longer reach the plugin's "missing" branch — the message keeps that branch anyway, as defense in depth for older servers and non-conforming clients. Verification therefore splits by layer: the omission case is asserted by the Phase 5 schema-boundary tests, and the Phase 9 live probe asserts the *mismatch* case against the reworded plugin error. Each layer is tested for the job it does: the schema delivers first-call correctness, the plugin error delivers one-round-trip recovery.

> [!NOTE]
> **D7 — Batch `success` means all-succeeded; partial success is first-class (Gap 5).** `deleteMultipleNodes` returns `success: true` only when `failureCount === 0`. Additionally, all four batch aggregators gain an explicit `status: "success" | "partial_success" | "failed"` field (`partial_success` = some succeeded and some failed; `failed` = none succeeded). The field is additive — `looseOutput` schemas already accept extra keys — and the batch tools' descriptions instruct the agent to treat `partial_success` as an incomplete operation and report the failed items.
> **Edge semantics (open-questions Q7, resolved 2026-07-09: Option A).** One shared contract across all four aggregators: `succeeded > 0 && failed === 0` ⇒ `"success"`; `succeeded > 0 && failed > 0` ⇒ `"partial_success"`; `succeeded === 0` ⇒ `"failed"`. Early returns where nothing was attempted (e.g. `setInstanceOverrides`' pre-aggregation failure paths) return `status: "failed"` — `status` is present on **every** batch return path, so an agent can always branch on it without first reasoning about whether the field exists. The boolean is derived, giving one testable invariant: **`success === (status === "success")`** — the model is never asked to reconcile two conflicting signals, which is the failure mode Gap 5 demonstrated live. Every failure entry in `results` carries an actionable per-item reason, so a `partial_success` response lets the agent retry exactly the failed items in a single follow-up call — no re-discovery, no re-running succeeded items. Zero-item batches are unreachable through the schemas (non-empty arrays required); the handlers assert this anyway. The three already-correct booleans keep their values — they only gain the field.

> [!NOTE]
> **D8 — Code, contract docs, and executable contract move in the same change.** Every D5–D7 change updates, in the same PR: `SAFETY.md` (G2's "every write tool" wording, A3, the Part B rows for `variable_manage`/`style_manage` and the create tools, and the "Name fields" bullet), the mechanically-diffed `src/mcp_server/tests/unit/figma_plugin/safetyContract.test.ts`, and the agent guides (`skills/figma-edit/references/constraints.md`, `error-playbook.md`, `tool-selection.md`, `workflows.md`, mirrored as the `figma-edit://guide/*` resources). A gate that exists in code but not in the manual — or vice versa — fails CI by design.
> **G2 target wording (open-questions Q3, resolved 2026-07-09: Option A).** G2 becomes a universal rule over existing objects: *"No write against an existing object proceeds unless the caller-supplied current name matches the resolved object's actual name — nodes, variables, styles, and collections alike. Creation verifies the identified parent or collection instead."* Publishing it is gated on the Phase 7 audit of every write tool against the rule (the safetyContract mechanical diff provides most of it; the Part B matrix stays the per-tool proof). The agent guides state the rule in exactly one sentence — one internalized rule produces correct first calls even on tools the agent has not used before, where an enumerated category list invites wrong guesses at its boundary.

> [!NOTE]
> **D9 — Refusal-message convention (open-questions Q4, resolved 2026-07-09: Option A).** Every verification refusal that this release adds or edits uses the `Operation Denied: …` prefix, is defined centrally alongside the other guard messages (`main.ts` `ERRORS` or a shared plugin constants module) rather than as a handler-local string, and gets an `error-playbook.md` entry. The prefix alone is half the job — each message must embed its own recovery so a failed call costs exactly one round trip: name the cause distinctly (missing vs. mismatched vs. stale), name the read tool that supplies the correct value (`variable_list`, `style_list`, `node_info`), and say "pass it back verbatim". The in-repo model is the instance-interior delete refusal, which names both alternatives ("Edit the main component, or use instance overrides"); the counterexample this release fixes is `PARENT_NAME_MISMATCH`, which steers agents toward the wrong field. Acceptance check per message: an agent given only the error text and the tool list can produce the correct retry without further discovery. Existing tests that assert on changed message text are updated in the same change. This convention governs the D5 verification errors, the D5-mechanism `.superRefine()` messages, and D6's reworded parent-name error.

### Compatibility posture

These are **deliberate breaking tightenings** for agent callers, not regressions: a call that previously performed an *unverified* global write now fails with a structured error naming the missing field, and the updated guides tell the agent how to recover (read the current name, pass it back verbatim). Gap 3's schema change is not behaviorally breaking — calls omitting `parentNodeName` already failed at runtime; they now fail earlier with a better contract. The `CHANGELOG.md` entry must call out all newly required fields and the new batch `status` field explicitly.

**Hard cutover confirmed (open-questions Q8, resolved 2026-07-09: Option A).** There is no warn-only transitional release. A warning attached to a successful result is precisely the signal agents are known to ignore (Gap 5's live lesson), so a grace period would keep the unverified-write path open while buying no real migration safety. With the D5 dual descriptions preventing most first-call omissions and the D9 self-recovering errors, the entire migration cost is one recovery round trip per affected agent — for a safety fix, a grace period is a period in which the fix is off.

---

## Scope & non-goals

**In scope**

1. Fix `figma_plugin/tsconfig.json` per D1 (`types`, no `dom`).
2. Resolve the 9 residual type errors per D2/the triage table.
3. Add `check:types:plugin` and wire it into CI per D3.
4. Gap 1: required current-name verification for variable updates (`currentVariableName`), style updates (`currentStyleName`), and variable creation (`collectionName`); rename-on-update only when `name` is explicitly provided; error-message operand fix (D5).
5. Gap 3: `parentNodeName` required in the five create-tool schemas; `PARENT_NAME_MISMATCH` message covers the omitted-name case (D6).
6. Gap 5: `node_delete` `success` true only on zero failures; tri-state `status` on all four batch aggregators; tool descriptions updated (D7).
7. Contract sync: `SAFETY.md`, `safetyContract.test.ts`, and the four agent guides updated in the same change (D8).
8. Version bump `2.3.2 → 2.3.3` across all surfaces; `CHANGELOG.md` entry naming every newly required field.

**Explicit non-goals**

- No MCP-server tsconfig audit (`./tsconfig.json`) — separate concern (D4).
- No runtime behavior change from Track 1 — its edits are types/casts/config only. The only behavior changes in this release are the D5–D7 tightenings; anything further is out of scope.
- No new tools, no new editing powers, no scope-model changes.
- No Gap 2 engineering fix: no rollback / transaction layer. Prevalidation atomicity stays the contract; the README wording correction is already in flight outside this PRD.
- No Gap 4 code change: the structural-blocked / override-allowed instance policy is intentional (`SAFETY.md` A9, R5) and stays as is.
- No `strict` relaxation, no `@ts-nocheck`, no blanket `any` casts.
- No plugin refactor beyond the minimal edits the 9 errors and the D5–D7 changes require.
- No change to the esbuild build pipeline (the type gate is additive, not a replacement).

---

## Implementation plan (phased)

**Phase 1 — Fix the config (D1).** Replace `typeRoots` with `types: ["@figma/plugin-typings"]`; confirm `lib` stays `["es2018"]` (no `dom`). Re-run `tsc --noEmit -p figma_plugin/tsconfig.json` and confirm the count drops to the expected residual (~9, modulo the `shared/`-include detail).

**Phase 2 — Triage the residual (D2).** Fix all 9 per the table. After each, re-run `tsc` to confirm the count strictly decreases and no *new* errors appear. Do not proceed to a green state by suppression. If any fix appears to require a runtime behavior change, stop and escalate (D4).

**Phase 3 — Regression tests / gate (D3).**
- Add `check:types:plugin` → `tsc --noEmit -p figma_plugin/tsconfig.json` to `package.json` scripts.
- Wire it into `.github/workflows/ci.yml` (alongside `check:plugin` / `check:versions`).
- Confirm the gate is green locally and would fail if `typeRoots`/`types` were reverted or a real type error were introduced (prove it: temporarily reintroduce a break and confirm red).

**Phase 4 — Gap 1: design-system update verification (D5).** In `src/mcp_server/tools/variable.ts` and `style.ts`: make `currentVariableName` required for `UPDATE_VARIABLE`, add required `collectionName` for `CREATE_VARIABLE`, add `currentStyleName` (required with `styleId`) to `style_manage`, and make `name` optional there — all via the D5 mechanism (flat shapes, dual descriptions, `.superRefine()` with actionable errors; no discriminated union). In `figma_plugin/handlers/variableHandlers.ts` and `styleHandlers.ts`: enforce all three fail-closed (absent ⇒ reject, mismatch ⇒ reject, before any mutation), enforce `name` required-on-create / rename-only-when-provided, and fix the swapped `Expected`/`got` operands (all new and edited messages rewritten to the D9 convention). Unit tests per change (missing, stale, and mismatched names all fail closed; verified names succeed).

**Phase 5 — Gap 3: create-schema conformance (D6).** Remove `.optional()` from `parentNodeName` in the `create_shape`/`create_frame`/`create_text`/`create_svg`/`create_instance` schemas; leave `create_component_set` conditional (handler-enforced). Reword `ERRORS.PARENT_NAME_MISMATCH` to cover the omitted-name case, per the D9 convention. Schema tests assert each create tool rejects calls missing `parentNodeName` at the schema boundary.

**Phase 6 — Gap 5: batch result semantics (D7).** `deleteMultipleNodes` returns `success: failureCount === 0 && successCount > 0`; add `status` to the four batch aggregators per the D7 edge-semantics resolution — on **every** return path, including `setInstanceOverrides`' early returns, with actionable per-item reasons in `results`; extend the affected `outputSchema`s (additive fields on `looseOutput`) and tool descriptions ("treat `partial_success` as an incomplete operation; report failed items"). Unit tests: a simulated mid-batch `remove()` failure yields `success: false`, `status: "partial_success"`; a property test asserts `success === (status === "success")` across all four aggregators.

**Phase 7 — Contract sync (D8).** Update `SAFETY.md` (G2 per the Q3 resolution — the universal existing-object rule, published only after auditing every write tool against it; A3; Part B rows for the changed tools; "Name fields" bullet), `safetyContract.test.ts` (mechanical diff must pass in both directions), and the four `skills/figma-edit/references/` guides / `figma-edit://guide/*` resources (each states the G2 rule in exactly one sentence; `error-playbook.md` gains an entry for every D9 refusal).

**Phase 8 — Version & docs.** Bump `2.3.2 → 2.3.3` on all surfaces (`check:versions` passes); rebuild the plugin bundle so `check:plugin` passes; add the `CHANGELOG.md` v2.3.3 entry, explicitly listing the newly required fields and the new `status` field; confirm the full unit suite (`bun run test`) and existing checks stay green.

**Phase 9 — Verify.** `bun run build:all`, `bun run check:plugin`, `bun run check:versions`, `bun run check:types:plugin`, and `bun run test` all pass. IDE opens the plugin with no spurious ambient-global errors. For Track 1, a rebuild-diff of the Phase 1–2 commits confirms the type fixes did not alter emitted JS. Track 2 **requires live Figma verification** — re-run the adversarial-review probes and confirm each now fails closed / reports honestly: ID-only `UPDATE_VARIABLE` refused; `style_manage`-by-ID without `currentStyleName` refused (and a properties-only update no longer renames); `CREATE_VARIABLE` without `collectionName` refused; for Gap 3, per the Q2 resolution, two separate assertions — omission of `parentNodeName` is rejected at the schema boundary (covered by the Phase 5 tests; not observable live through a conforming client) and a live call with a *mismatched* `parentNodeName` returns the reworded plugin error; duplicate-node `node_delete` batch returns `success: false`, `status: "partial_success"`.

---

## Testing & rollout

- **Type gate:** `check:types:plugin` returns 0 errors and is in CI.
- **No emitted-JS drift from Track 1:** rebuilding `figma_plugin/code.js` after the type fixes produces no functional change — the residual fixes are types/casts/config only. Confirm via `check:plugin` (rebuild + `git diff`); any *intended* diff must be limited to the deliberate D5–D7 handler edits, reviewed explicitly.
- **Fail-closed tests (D5/D6):** schema-level tests that the newly required fields are required; handler tests that missing, stale, and mismatched `currentVariableName`/`currentStyleName`/`collectionName` are rejected before any mutation; a `style_manage` update without `name` does not rename.
- **Batch semantics tests (D7):** `success` is `true` only on zero failures for all four aggregators; `status` correctly reports `success` / `partial_success` / `failed`, is present on every return path, and satisfies the property `success === (status === "success")`; failure entries in `results` carry actionable reasons.
- **Contract sync (D8):** the `safetyContract.test.ts` mechanical diff passes in both directions after the `SAFETY.md` matrix updates.
- **Refusal messages (D9):** every new or changed refusal uses the `Operation Denied:` prefix and embeds its recovery (distinct cause, the read tool, "pass it back verbatim"); review check per message: the correct retry is derivable from the error text and the tool list alone.
- **Live probes:** the five Phase 9 probes pass against a live document.
- **Full suite:** `bun run test` stays green (647+ tests as of v2.3.2, plus the new D5–D7 tests).
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
| Existing agent workflows break on the newly required fields (D5/D6) | Med | Intended fail-closed tightening (v2.2.0 precedent); structured errors name the missing field; guides/error-playbook updated in the same change (D8); `CHANGELOG.md` calls out every new requirement |
| `SAFETY.md` matrix and `safetyContract.test.ts` drift apart during the change | Low | D8 same-change rule; the bidirectional mechanical diff fails CI on any mismatch |
| New `status` field breaks outputSchema validation on older clients | Low | Additive only; `looseOutput` catchall accepts extra keys by design |
| Agents keying on `node_delete`'s old lenient `success` misread the corrected value | Low | The corrected value is the safe direction (false where formerly true); descriptions and guides explain `status` |

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
| Gap 1, variable path | `variableHandlers.ts:1032` + live probe (2026-07-09) | ID-only `UPDATE_VARIABLE` mutates unverified; a wrong `currentVariableName` is refused only when volunteered |
| Gap 1, style path | `styleHandlers.ts:13–23, 47` + live probe (2026-07-09) | Update-by-`styleId` has no current-name check; required `name` renames the style as a side effect of every update |
| Gap 1, contract contradiction | `SAFETY.md` G2 vs Part B rows | G2 claims "every write tool" verifies names; the matrix rows for `variable_manage`/`style_manage` list no name gate |
| Gap 3 | `create.ts` schemas vs `main.ts:151` + live probe (2026-07-09) | Schema-optional, runtime fail-closed; `PARENT_NAME_MISMATCH` text misdirects toward `parentId` when the name was omitted |
| Gap 5 | `nodeModifiers.ts:294` + live probe (2026-07-09) | `success: successCount > 0`; live duplicate-delete batch returned `{success:true, nodesDeleted:1, nodesFailed:1}`; the other three aggregators already require zero failures |

---

## Revision history

- **Rev 1, 2026-07-06** — initial PRD. Discovery during v2.3.2 Phase 8.5 review; empirical measurement of the fix (path-only insufficient; `types` + no-`dom` → 9 residual); triage of the 9; decision to fix-not-suppress and add a CI type-check gate sequenced after the residual reaches zero.
- **Rev 2, 2026-07-09** — added Track 2 (safety-contract gap closure). Source: the adversarial review `figma-edit-mcp-gap-details.md`, with every claim re-verified against source and live against a Figma test document. Adds D5–D8 (required current-name verification for variable/style updates and variable creation; schema-required `parentNodeName`; honest batch success semantics with tri-state `status`; same-change contract-doc sync), Phases 4–9 renumbering, and the compatibility posture for the fail-closed tightenings. Release identity updated accordingly — v2.3.3 is no longer a no-behavior-change release.
- **Rev 3, 2026-07-09** — resolved open-questions Q1 (schema mechanism for D5's conditionally required fields): **Option B** — flat schemas, requirement stated in both field and tool descriptions, server-side `.superRefine()` with actionable errors, plugin fail-closed check retained as defense in depth. Recorded as the D5 mechanism bullet; Phase 4 updated to reference it. Q2–Q8 remain open in `open-questions.md`.
- **Rev 4, 2026-07-09** — resolved open-questions Q2 (Gap 3 verification plan): **Option A** — the omission and mismatch cases are verified separately, at the layer that enforces each. Schema-boundary tests (Phase 5) cover omission; the Phase 9 live probe covers mismatch; the plugin error keeps its "missing" branch as defense in depth for non-conforming clients. Recorded in D6; Phase 9's probe list updated. Q3–Q8 remain open.
- **Rev 5, 2026-07-09** — resolved open-questions Q3 (SAFETY.md G2 target wording): **Option A** — G2 becomes the universal existing-object rule ("no write against an existing object proceeds unless the caller-supplied current name matches; creation verifies the identified parent or collection instead"), published only after the Phase 7 audit of every write tool against it. Recorded in D8; Phase 7 updated. Q4–Q8 remain open.
- **Rev 6, 2026-07-09** — resolved open-questions Q4 (refusal-message convention): **Option A**, recorded as new decision **D9** — `Operation Denied:` prefix, centrally defined, playbook entry per refusal, and every message embeds its own recovery (distinct cause, the read tool that supplies the correct value, "pass it back verbatim"); acceptance check: the correct retry is derivable from the error text and tool list alone. Phases 4, 5, 7 and the testing list reference it. Q5–Q8 remain open.
- **Rev 7, 2026-07-09** — resolved open-questions Q5 (versioning posture): **Option A** — the release stays 2.3.3, and the rationale is recorded as policy in the Release identity block: fail-closed safety tightenings may ship at patch level; the CHANGELOG carries the breaking-change notice; revisit only if external integrators pin versions. Q6–Q8 remain open.
- **Rev 8, 2026-07-09** — resolved open-questions Q6 (D3 "added last" wording): **Option A** — D3 reworded to sequence the CI type gate by condition (residual reaches zero), not position; the gate stays at Phase 3 so the Track 2 handler edits (Phases 4–6) land under its protection. Q7–Q8 remain open.
- **Rev 9, 2026-07-09** — resolved open-questions Q7 (D7 edge semantics): **Option A** — one shared contract across all four batch aggregators: `status` derived from the succeeded/failed counts, present on every return path (early returns ⇒ `"failed"`), the derived-boolean invariant `success === (status === "success")` as a property test, and actionable per-item reasons in `results`. Recorded in D7; Phase 6 and the testing list updated. Q8 remains open.
- **Rev 10, 2026-07-09** — resolved open-questions Q8 (migration posture): **Option A** — hard cutover confirmed, no warn-only transitional release; recorded in the Compatibility posture section. **All eight open questions are now resolved**; `open-questions.md` is retained as the decision record, and Phases 4–7 are unblocked.
