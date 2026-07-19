# v2.3.3 Implementation Task List

This document tracks the tasks required to fulfill the requirements in the [v2.3.3 PRD](file:///Users/neozhehan/Git/figma-edit-mcp/documentation/v2.3.3/prd.md). It is divided into 14 phases, covering both Track 1 (Type-check restoration) and Track 2 (Safety-contract gap closure).

**Decision status.** All open questions Q1–Q21 are resolved; [open-questions.md](file:///Users/neozhehan/Git/figma-edit-mcp/documentation/v2.3.3/reviews/open-questions.md) is the decision record. Q15 (resolved 2026-07-10, Option C): **one release, numbered 2.3.3, containing all 14 phases below** (PRD Rev 19, Release identity block). Q16–Q19 (raised 2026-07-17 by the Phase 3–4 implementation review) were resolved 2026-07-18 (PRD Revs 23–26); Q20–Q21 (raised by the follow-up review's findings P4-4/P4-8) were resolved 2026-07-18 (PRD Revs 28–29). **Nothing blocks implementation.** **Phase 3–4 review remediation landed 2026-07-18 (PRD Rev 30):** every P3/P4 finding from [reviews/Phase-3-&-4-review.md](file:///Users/neozhehan/Git/figma-edit-mcp/documentation/v2.3.3/reviews/Phase-3-%26-4-review.md) — including the P4-1 release blocker (official-SDK clients rejecting the structured-error envelope) — is fixed and verified; Phases 3 and 4 below are checked off accordingly. The suite is green at 696/696, `check:types:plugin`/`check:suppressions`/`check:versions` all pass, and the plugin bundle rebuilds byte-identical.

**New error codes introduced by this release** (seventeen plus the ratified fallback — the inventory per Q16, resolved 2026-07-18: Option A, amended by Rev 27; each follows the D9 convention — structured `{error: {code, message, details?}}`, message embeds its own recovery, playbook entry in Phase 12):
`PLUGIN_PEER_UNAVAILABLE`, `PLUGIN_PEER_AMBIGUOUS`, `CHANNEL_IN_USE`, `VERSION_MISMATCH` (Phase 9); `PAGE_LOAD_FAILED`, `PAGE_NOT_FOUND`, `TARGET_NOT_PAGE`, `PAGE_LOAD_TIMEOUT`, `DOCUMENT_SCAN_INCOMPLETE` (Phase 10); `CONNECTOR_TEMPLATE_REQUIRED` (Phase 11); `VARIABLE_NAME_MISSING`, `VARIABLE_NAME_MISMATCH`, `COLLECTION_NAME_MISSING`, `COLLECTION_NAME_MISMATCH`, `STYLE_NAME_MISSING`, `STYLE_NAME_MISMATCH`, `VARIABLE_SCOPES_MISSING` (Phase 4, D5); plus **`UNKNOWN_ERROR`**, the ratified legacy fallback for failures not thrown as coded objects (its playbook entry documents it as "no machine classification exists; the recovery is in the message text"). Codes are never derived from message prose; every coded refusal originates from the central registry of message factories (Q16). The legacy failure surface stays on the fallback pending the [v2.3.4 PRD](../v2.3.4/prd.md).

---

## Phase 1: Fix the Config (D1)
- [x] Modify `figma_plugin/tsconfig.json` to replace the broken `typeRoots` path with `"types": ["@figma/plugin-typings"]`
- [x] Confirm `lib` is set to `["es2018"]` and does **not** include `"dom"` (to avoid redeclaring globals owned by `@figma/plugin-typings`)
- [x] Include only the imported `../src/shared/nodeTypes.ts` shared file, then run `tsc --noEmit -p figma_plugin/tsconfig.json` and verify the decided configuration reports exactly **10 residual errors**. The intermediate probe before the explicit shared root reports 9.

---

## Phase 2: Triage the Residual (D2)
- [x] Resolve residual errors 1 & 2 in [componentHandlers.ts:707](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/componentHandlers.ts): Explicitly type `parentNode` (e.g., as `BaseNode`) so negative branch narrowings do not reduce to `never`.
- [x] Resolve residual errors 3 & 4 in [main.ts:194](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts): Explicitly type `parent` to prevent `never`-narrowing in `validateCloneWrite`.
- [x] Resolve residual error 5 in [connectHandlers.ts:42](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/connectHandlers.ts): Narrow/cast `scopeNode` to `PageNode` before invoking `loadAsync()`.
- [x] Resolve residual errors 6 & 7 in [nodeReaders.ts:8](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeReaders.ts) and [nodeUtils.ts:6](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/utils/nodeUtils.ts): rewrite the impossible `../../shared/nodeTypes.js` paths to `../../src/shared/nodeTypes.js`. Keep the imports type-only and scope the plugin tsconfig root to the exact imported `../src/shared/nodeTypes.ts` file, not the entire shared directory; the rewrite is emitted-JS-identical.
- [x] Resolve residual errors 8 & 9 in [exportUtils.ts:124–125](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/utils/exportUtils.ts): Add a minimal ambient declaration for `TextDecoder` (do not import `dom`; prefer the typings if a future `@figma/plugin-typings` version provides it, with a comment pointing to the PRD). Declared in `figma_plugin/types/sandbox-globals.d.ts` (covered by the tsconfig `include`), with typed parameters rather than `any`; the file omitted from `bf4a4c0` was supplied by immediate corrective commit `3f62505`.
- [x] Resolve residual error 10 in [nodeTypes.ts:40](file:///Users/neozhehan/Git/figma-edit-mcp/src/shared/nodeTypes.ts): the exact shared-file root exposes Zod 4's TS2554 for `z.record(z.unknown())`; use `z.record(z.string(), z.unknown())`. The pinned Zod runtime accepts both forms and `NodeEntrySchema` has no runtime importers, so this is runtime-equivalent.
- [x] Re-run `tsc` and reproduce the decided **10-error → 0-error** boundary with no new suppression. Per-fix transient compiler outputs were not retained in history, so no stronger durable claim is made about every intermediate count.
- [x] Guardrails (D2/D4): no `@ts-nocheck`, no `strict` relaxation, no blanket `any` casts. If any fix appears to require a runtime behavior change, **stop and escalate** — do not silently alter a live-verified code path.
- [x] Re-run `tsc --noEmit -p figma_plugin/tsconfig.json` and verify the compilation completes with **0 errors**.
- [x] Run the full unit suite after the residual fixes (`bun run test`): Track 1 edits can break static source-matching tests — the Phase 4 §3a test asserting the `loadAsync` call shape required updating for the `PageNode` cast (updated in the same change); suite green (647/647).
- [x] **Review decision 4 (accepted 2026-07-17):** at both `never`-narrowing guard sites fixed above (the `createComponent` parent check in `componentHandlers.ts` and the `validateCloneWrite` parent check in `main.ts`), add a one-sentence comment recording that the typings prove the guarded branch statically unreachable (`node.parent` is typed `(BaseNode & ChildrenMixin) | null`, so every non-null parent has `appendChild`) and that the guard is kept deliberately as runtime defense-in-depth — removing it would be a behavior change on a live-verified path (D4). Comment-only; its purpose is to stop a future cleanup from deleting the guards as dead code.
- [x] **Review decision 3 (accepted 2026-07-17) — zero-drift rework of the two alias casts:** replace `const parentNodeBase = parentNode as BaseNode` (the `createComponent` parent check) and `const parentBase = parent as BaseNode` (the `validateCloneWrite` parent check) with a zero-emitted-JS form — a type annotation on the existing declaration, or the inline-cast idiom `connectHandlers.ts` already uses — so Track 1 contributes no code-line changes to the rebuilt bundle. Re-run `tsc` (0 errors), rebuild, and confirm the `code.js` diff against the pre-v2.3.3 baseline is comment-text only. Do this **before the Phase 1–2 commit**, in the same change as the decision-4 rationale comments at the same two sites.
- [x] **Phase 1–2 adversarial closure (2026-07-18):** completion is the sequence ending at `3f62505`, not `bf4a4c0` alone: `bf4a4c0` accidentally omitted `figma_plugin/types/sandbox-globals.d.ts` and still had two TS2304 errors; `3f62505` immediately added it and established the zero-error state. Preserve the commits and record the correction rather than rewriting history. The per-fix compiler-count log was not retained, so the ledger now makes only the reproducible 10-error → 0-error boundary claim. The unrelated documentation churn already present in `bf4a4c0` is likewise recorded as historical; subsequent phase reviews use phase-scoped diffs.

---

## Phase 3: Regression Tests & Gate (D3)
- [x] Add `check:types:plugin` script pointing to `tsc --noEmit -p figma_plugin/tsconfig.json` in [package.json](file:///Users/neozhehan/Git/figma-edit-mcp/package.json). (Sequenced by condition: added only after Phase 2 reaches 0 errors.)
- [x] Wire the `check:types:plugin` gate into the GitHub Actions CI pipeline [ci.yml](file:///Users/neozhehan/Git/figma-edit-mcp/.github/workflows/ci.yml) alongside `check:plugin` / `check:versions`. The esbuild build pipeline is unchanged — the gate is additive.
- [x] Prove the gate red/green locally: temporarily reintroduce a type break (or revert the `types` config), verify `check:types:plugin` fails, then revert and confirm it passes. **Durable record (verified 2026-07-18, review P3-5):** a transient `figma_plugin/utils/zz-red-proof.ts` containing `const zzRedProof: string = 5` turned `check:types:plugin` red (TS2322 at its file:line) and its removal restored green; a transient `// @ts-nocheck` fixture likewise turned `check:suppressions` red (naming the file:line with removal guidance) and green on deletion. Note: a red-proof file must sit inside a tsconfig-included directory (`src/`, `handlers/`, `utils/`, `types/`) — a plugin-root file is outside the program (though any file *imported* from the entry graph is always type-checked).
- [x] **Review decision 2 (accepted 2026-07-17) — suppression policing beside the type gate:** the `tsc` gate stays green when a contributor adds a new suppression, so ship an enforcement check in an adjacent CI step (ratification 5: two adjacent steps satisfy the intent): `@ts-ignore` **and `@ts-nocheck`** are forbidden in `figma_plugin/**/*.ts` (review P3-2 — `@ts-nocheck` is a file-wide opt-out both gates would otherwise miss), and `@ts-expect-error` is allowed only with a meaningful same-line description (at least one alphanumeric character — bare punctuation rejected, review P3-4). Detection matches TypeScript directive-comment syntax, not substrings, and string literals are stripped first (P3-4); the checking logic is exported and covered by negative fixtures in `checkSuppressions.test.ts` (P3-3). Failure output names the offending file:line and states the fix, per the one-round-trip criterion. (`@typescript-eslint/ban-ts-comment` is the equivalent if ESLint is ever adopted.) The check passes on the current tree — every remaining suppression (49 as of 2026-07-18; two `TS2551` suppressions merged into one during the Phase 4 bind-loop rework) is a described `@ts-expect-error`, tracked for touch-it-clear-it burn-down.

---

## Phase 4: Structured Error Transport + Design-System Verification (D9/D5)
- [x] **Structured Transport Implementation (D9/Gap 11)** — do this first; the D5 errors ride on it
  - [x] Replace the `describeError` string flattening in [main.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts): every refusal and operational failure leaves the plugin dispatcher as a structured `{error: {code, message, details?}}` object. **Verified 2026-07-18:** the test-environment compat shim that forked this behavior (string in tests, object in production) was found and removed by the follow-up review; the dispatcher now unconditionally emits the structured object, confirmed by the full test suite and the official-SDK boundary suite.
  - [x] Preserve the structured error object through the UI relay and socket transport. **Verified 2026-07-18:** `ui.html`'s `command-error` handler forwards `message.error` (now the structured object) into `sendErrorResponse`, which serializes it whole via `JSON.stringify`; `socket.ts` broadcasts `data.message` unmodified. Neither layer parses or flattens the object.
  - [x] Update error handling in [figma-client.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/figma-client.ts) to stop reconstructing plain `Error`s: surface failures at the MCP boundary as `isError: true` with machine-readable `structuredContent` **plus a text fallback carrying the same code**. Codes are never reconstructed by parsing prose. **Verified 2026-07-18:** `FigmaError` carries `code`/`message`/`details`; `getStructuredError`'s substring/prefix matching over the `ERRORS` table was found and deleted — classification is now purely structural (coded object passes through; else `UNKNOWN_ERROR`).
  - [x] Define all refusal messages centrally as a registry of **message factories** — handlers pass operands in; no handler-local refusal strings (Q16). Register the code inventory listed in the header (ten operational codes, seven D5 verification codes, the `UNKNOWN_ERROR` fallback — shared inventory in `src/shared/errorCodes.ts`, parity-tested against the plugin registries). Codes are never derived from message prose: the dispatcher passes thrown coded objects through and assigns `UNKNOWN_ERROR` to everything else — no substring or prefix matching over the `ERRORS` table. Remove the client's ad-hoc `JOIN_ERROR` default (pass through the socket's real code). Verification refusals use the `Operation Denied:` prefix.
  - [x] `channel_join` pass-through (Q20, resolved 2026-07-18: Option A): every structured `error.code` reaching `channel.ts` passes into the in-band `errorCode` verbatim — unknown codes included, never collapsed to `UNKNOWN_ERROR` — with `details` preserved. Delete the prose-classification branches (`includes("timed out")`, `includes("Connection closed")`); code those two locally-generated failures at origin in `figma-client` (`CHANNEL_JOIN_FAILED` on request timeout, `PLUGIN_DISCONNECTED` on connection close). The in-band `status: "error"` envelope itself is unchanged — convergence to `isError` is the v2.3.4 PRD's Q1, not this release.
  - [x] Every new or changed message embeds its own recovery: name the cause distinctly (missing vs. mismatched vs. stale), name the read tool that supplies the correct value (`variable_list`, `style_list`, `node_info`), and say "pass it back verbatim". Acceptance check per message: an agent given only the error text and the tool list can produce the correct retry without further discovery.
- [x] **D5 Schema Updates** (Q1/Q14 mechanism: flat object shapes, no discriminated unions)
  - [x] Update [variable.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/variable.ts): `currentVariableName` required for `UPDATE_VARIABLE`; `collectionName` and `scopes` required for `CREATE_VARIABLE`. An explicitly supplied empty `scopes` array remains the caller's deliberate choice; omission is rejected.
  - [x] Update [style.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/style.ts): add `currentStyleName`, required whenever `styleId` is supplied; make `name` optional at the schema level.
  - [x] State each conditional requirement **twice in prose**: in the field description (e.g. "REQUIRED for UPDATE_VARIABLE — the variable's **current exact** name, passed back verbatim from `variable_list`") and in the top-level tool description ("UPDATE_VARIABLE requires `currentVariableName`"). **Verified 2026-07-18 against the emitted `tools/list` result** (Q21), not just raw registration config — see the boundary suite.
  - [x] Implement server-side `.superRefine()` checks in `variable.ts` and `style.ts` enforcing the conditional requirements. Each refinement error is actionable per D9: the violation, the read tool that supplies the correct value, and "pass it back verbatim". Extended (P4-2/P4-6, 2026-07-18) to reject an explicitly empty `styleId` (create/update must split on presence, not truthiness) and explicitly empty `name` on update (an object named `""` could never pass exact-name verification again).
- [x] **D5 Plugin Handler Implementation** (defense in depth — the server is not the trust boundary, AS1)
  - [x] Enforce fail-closed verification in [variableHandlers.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/variableHandlers.ts) and [styleHandlers.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/styleHandlers.ts) before any mutation: absent ⇒ reject, mismatch ⇒ reject, for `currentVariableName` (update), `collectionName` (create, same pattern as `variable_delete`), and `currentStyleName` (update by `styleId`). Extended (P4-2/P4-6): `styleId` presence (not truthiness) selects create vs. update, and empty names are rejected before any mutation at this layer too.
  - [x] Implement validate-before-mutate ordering in `UPDATE_VARIABLE`: a supplied `value` requires a valid `modeId` **before** `name`, `description`, or `scopes` are touched; an alias `value` (`type: "VARIABLE_ALIAS"`) additionally resolves its target variable via `getVariableByIdAsync` before any mutation (Q17).
  - [x] Implement validate-before-mutate ordering in `style_manage`: resolve every requested variable binding before applying `name` or properties; a PAINT-style `bindVariables` request additionally verifies the style has paints to bind **before** `name`/`description`/`properties` apply (Q17). Deep value-type validation is not attempted — the Q17 boundary rule is: pre-validate what one read can confirm; disclose what only execution can reveal. **Extended (P4-3, 2026-07-18):** an empty `bindVariables` map (`{}`) is a documented no-op — the pre-check and the execution loop now gate on the identical condition (resolved entries present), closing the gap where `{}` used to reach execution and mutate before the paints-present check fired.
  - [x] Order TEXT-style font loading per Q19 (resolved 2026-07-18, Option A): on **update**, load the target font (the supplied `properties.fontName`, else the style's actual `fontName`) before `name`/`description`/`properties` apply; on **create**, create the style, read its **actual** `fontName` (or use the supplied one), load, then write properties — inside the existing rollback guard. No hardcoded default font. A one-sentence comment at the fork records why the two paths order operations differently.
  - [x] Enforce `style_manage` `name` semantics: required on create; on update, rename **only** when `name` is explicitly provided (removes the accidental-rename side effect).
  - [x] Predictable failures return with zero mutation; an unexpected mid-update failure is reported **explicitly as partial** via a D9 error — never as a clean failure. Per Q18 (resolved 2026-07-18, Option A), the error's `details` reuses the Q9 vocabulary: `partialMutation: true`, a plain-language statement of what changed, and cheap before-values (the original `name`/`description`, already in hand from verification). A clean failure never carries the flag; the field names are shared with the Phase 6 batch failure rows.
  - [x] Replace the ambiguous `Expected`/`got` operands in the variable verification error with explicit `stored name` / `received currentVariableName` labels.
- [x] **Unit Tests**
  - [x] Transport tests: code and details preserved end to end; `isError` and `structuredContent` asserted at the **actual MCP boundary**, not only plugin-internally. **Delivered 2026-07-18** via `mcpBoundary.test.ts`: the real registered server, driven through the official SDK `Client` over `InMemoryTransport`, with client-side output-schema validation primed by `listTools()` — closing the P4-7 gap where the original transport tests stopped at a synthetic callback or a mocked `figma.ui.postMessage` and never reached the validation path that P4-1 found broken.
  - [x] `channel_join` pass-through tests (Q20): each representative join failure returns its originating code verbatim in `errorCode`; an unknown structured code passes through unchanged; no code is derived from message text.
  - [x] Schema tests via `safeParse`: omitting `currentVariableName` (update), `collectionName`/`scopes` (create), or `currentStyleName` (update by ID) is rejected with the actionable message.
  - [x] Description-marker tests (Q14 as corrected by Q21, resolved 2026-07-18: Option B): the literal "REQUIRED for …" marker is present in the **field** description, and the **tool** description states the requirement as a natural sentence naming the action and the field (e.g. "UPDATE_VARIABLE requires `currentVariableName`"); both asserted against the **emitted `tools/list` result**, not raw registration configuration.
  - [x] Plugin-level tests: missing, stale, and mismatched names fail closed and mutate nothing.
  - [x] Validate-before-mutate tests: a failing `modeId` or unresolved variable binding leaves name/description/scopes/properties unchanged; likewise an alias `value` with a dangling target, and a PAINT-style bind against a style with no paints (Q17).
  - [x] Partial-disclosure tests (Q18): a deterministic injected mid-update failure returns a D9 error whose `details` carry `partialMutation: true`, the what-changed statement, and before-values; a clean failure never carries the flag; the field names match the Phase 6 batch-row vocabulary.
  - [x] Font-order tests (Q19): a created TEXT style with text properties loads the style's **actual** default font — the mock's default is deliberately **not** Inter, so a hardcoded guess fails the test; an update loads the target font before any mutation.
  - [x] Properties-only style updates do not rename the style.
  - [x] Positive path: fully verified operations succeed.
  - [x] Update existing tests that assert on changed message text in the same change (D9). **Verified 2026-07-18:** every dispatcher test asserting on the plugin's string error (`permissionMatrix`, `atomicityAndValidation`, `phase1`, `phase2`, `componentHandlers`, `variableDelete.phase2`, `safetyContract`) migrated to `.error.message`, closing the gap where the removed compat shim had let these tests validate a code path production no longer executes.

---

## Phase 5: Explicit-Parent Conformance (D6)
- [ ] **Schema Updates**
  - [ ] Remove `.optional()` from `parentNodeName` in `create_shape`, `create_frame`, `create_text`, `create_svg`, and `create_instance` schemas in [create.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/create.ts).
  - [ ] Make `parentId` and `parentNodeName` required in the `create_component_set` schema — it loses its no-parent exception (the placement fix itself lands in Phase 8).
- [ ] **Handler Updates**
  - [ ] Reword `ERRORS.PARENT_NAME_MISMATCH` to also cover the omitted-name case (e.g. "parentNodeName is missing or does not match…"), per the D9 convention, so an agent is not steered into swapping a correct `parentId`. Keep the plugin's "missing" branch as defense in depth for older servers and non-conforming clients (Q2).
- [ ] **Unit Tests** (Q2 layer split: omission is asserted here at the schema boundary; the live *mismatch* probe is Phase 14)
  - [ ] Schema-boundary tests: all **six** tools reject calls missing the parent fields at the server parser.
  - [ ] Plugin-level tests (bypassing the server): missing and mismatched parent names still fail closed.

---

## Phase 6: Batch Contract Corrections (D7)
- [ ] **Schema & Envelope Adjustments**
  - [ ] Add `.min(1)` to all four batch arrays (`node_delete`, `text_set_content`, `annotation_set`, `instance_set_overrides` inputs).
  - [ ] Correct the registered `outputSchema` field names to the handlers' real fields (`nodesDeleted`/`nodesFailed` for `node_delete`; `replacementsApplied`/`replacementsFailed` for `text_set_content`) and add the new envelope fields (`status`, `requestedCount`, `succeededCount`, `failedCount`, `skippedCount`) so registered-callback tests can validate them and `looseOutput` can no longer mask drift.
  - [ ] Update the four batch tools' descriptions to instruct the agent to treat `partial_success` as an incomplete operation and report the failed items.
- [ ] **Three-Layer Boundary** (defined explicitly — the aggregators alone cannot deliver it)
  - [ ] Layer 1 — schema rejection: `[]`, unknown keys at any depth (recursion wired in Phase 7), or a malformed item is an MCP validation error with **no** execution envelope.
  - [ ] Layer 2 — refused before execution: dispatcher prevalidation, permission, and scope refusals return a structured D9 error (no envelope, **no mutation**) instead of a thrown string.
  - [ ] Layer 3 — accepted execution: every accepted call returns the envelope below.
- [ ] **Handler Execution Adjustments**
  - [ ] Enforce duplicate-target rejection **before any mutation** for `node_delete`, `text_set_content`, and `instance_set_overrides`, after normalizing URL/API node-ID spellings (`1-2` vs `1:2`). `annotation_set` is exempt — annotation batches may legitimately repeat a node.
  - [ ] Update `deleteMultipleNodes` in [nodeModifiers.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeModifiers.ts) to return `success: true` only when `failureCount === 0 && successCount > 0`.
  - [ ] Update all four batch aggregators to return tri-state `status` (`"success" | "partial_success" | "failed"`) derived from row outcomes, the four counts, and the invariant **`success === (status === "success")`** on every return path (early returns ⇒ `"failed"`).
  - [ ] Ensure exactly one row per input, in input order; stop-on-first handlers (e.g. text content) emit explicit `skipped` rows for unattempted items instead of omitting them.
  - [ ] Every failure/skip row carries an actionable per-item reason so a `partial_success` lets the agent retry exactly the failed items in one follow-up call.
  - [ ] **Partial-Mutation Disclosure (Q9)**
    - [ ] Confirm the exact mutate-then-fail paths during implementation: text content (font fallback before character assignment) and instance overrides (main-component swap before later override fields).
    - [ ] Failure rows on those paths carry `partialMutation: true`, a **plain-language statement of what changed**, and cheap before-values (the original `characters` string; the original `mainComponentId`) so the restoring write composes directly from the error. A clean failure never carries the flag. The fields are additive inside failure rows — no envelope shape change.
    - [ ] The field vocabulary is shared with Phase 4's non-batch disclosure (Q18) — identical field names; drift between the Phase 4 and Phase 6 shapes fails review.
- [ ] **Unit Tests**
  - [ ] `[]` batches and duplicate IDs (both `1-2` and `1:2` spellings) are rejected with no envelope and no mutation.
  - [ ] A Layer 2 refusal returns a structured error with no envelope and no mutation.
  - [ ] A simulated mid-batch `remove()` failure returns `success: false` and `status: "partial_success"`.
  - [ ] Property test across **all four** aggregators: `success === (status === "success")` holds on every return path.
  - [ ] Exactly one ordered row per input, including explicit `skipped` rows with reasons.
  - [ ] Registered-callback tests validate the corrected output field names and envelope fields.
  - [ ] Deterministic injected failures prove `partialMutation: true` appears with its before-values, and a clean failure never carries the flag.

---

## Phase 7: Annotation Repair + Recursive Strictness (D10/D8)
- [ ] **Annotation Contract Realignment (D10)**
  - [ ] Modify the `annotation_set` item schema in [annotation.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/annotation.ts): require `nodeId`, `nodeName`, and `labelMarkdown` (rejected when blank); make `categoryId` optional; remove the unsupported `annotationId` and `status` fields; define `properties` as an array of `{type}` objects matching the pinned Figma shape, with duplicate types rejected.
  - [ ] Update [annotationHandlers.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/annotationHandlers.ts): align handler logic with the updated schema; verify a supplied `categoryId` via `getAnnotationCategoryByIdAsync` **before** mutation; adopt the D7 envelope.
  - [ ] Retry identity (Q10): each result row carries per-item **before/after annotation counts**; the guides (Phase 12) teach list-before-retry after an uncertain outcome and note that identical-text duplicates remain ambiguous.
  - [ ] Correct `annotation_list`'s registered output schema to the grouped `annotatedNodes` shape the handler actually returns, preserving node ownership in both page and node modes.
  - [ ] Remove `idempotentHint` from `annotation_set` metadata (append is not idempotent).
- [ ] **Recursive Strictness (D8)**
  - [ ] Modify the central strict wrapper in [tools/index.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/index.ts) to apply `.strict()` at every object depth, not only the top level.
  - [ ] Enumerate the intentional catchalls (the polymorphic `paint`, `effects`, and `layoutGrids` style payloads) as the **only** exemptions.
- [ ] **Unit Tests**
  - [ ] A conforming annotation append succeeds end to end and is rediscovered via `annotation_list`'s corrected grouped output.
  - [ ] Legacy `annotationId`/`status` fields are **rejected, not stripped**.
  - [ ] Blank `labelMarkdown` is rejected.
  - [ ] A category mismatch fails before mutation.
  - [ ] `annotation_set` metadata no longer reports idempotent.
  - [ ] Strictness tests inject unknown keys at every object depth: rejected on every non-catchall tool; the enumerated catchalls are tested as the only exceptions.

---

## Phase 8: Containment (D11)
The guarantee is an **observable boundary**: no command may await, emit progress or a response, or terminate while a created node sits outside its verified destination. Pattern per creator: resolve and verify the destination *first*; call the implicit creator; make append/insert into the verified parent the **immediate next synchronous operation** — before any `await` or fallible property assignment; then configure inside a guarded block (`committed` flag; cleanup in `finally` only when uncommitted).
- [ ] Audit and modify each creator to that pattern:
  - [ ] `create_shape`
  - [ ] `create_frame`
  - [ ] `create_text` (insertion occurs **before** font-loading awaits and character assignment)
  - [ ] `create_svg`
  - [ ] `create_instance`
  - [ ] `create_component`
  - [ ] `node_clone` (append immediately after `clone()`, which defaults to `currentPage`)
- [ ] Modify `node_flatten` to capture and verify the source's parent and index, and pass both to `figma.flatten(nodes, parent, index)` — true zero-transient placement.
- [ ] Modify `create_component_set` to pass its (Phase 5-required) verified explicit parent directly to `combineAsVariants`.
- [ ] Fix the dead `componentId` response field in `createComponentInstance` while it is open for the audit above (Rev 20; live-verified 2026-07-17 on channel `p28j`: `InstanceNode.componentId` does not exist at runtime, so the advertised field is dropped from every response): return `componentId: component.id` from the already-resolved component — both the `componentId` and `componentKey` paths hold it — and remove the now-satisfied `@ts-expect-error`. Additive behavior fix; CHANGELOG entry lands in Phase 13.
- [ ] Hand off to Phase 12: record the unavoidable same-stack micro-transient as a residual risk in `SAFETY.md`, and word G1 as claiming the observable boundary, not literal zero-transient containment.
- [ ] **Unit Tests**
  - [ ] Mocked call-trace tests: insertion is the immediate next synchronous call after every implicit creation; `create_text` inserts before font awaits.
  - [ ] Cleanup removes uncommitted nodes on later failure, and runs **only** on failed, uncommitted attempts.
  - [ ] `create_instance` returns `componentId` equal to the resolved component's id in both the `componentId` and `componentKey` paths.

---

## Phase 9: Peer-Bound Channel (D13)
- [ ] **Peer-Bound Channel Protocol**
  - [ ] The plugin's join message carries `clientType: "plugin"` and its build version.
  - [ ] Update the socket server in [socket.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/socket.ts): assign each connection a random `peerId`; reserve a channel as **exactly one plugin peer plus one MCP session**.
  - [ ] Implement pair-only command/response routing; responses are correlated by peer, and a response from any other peer is ignored.
  - [ ] Implement the refusals: joining with zero plugin peers ⇒ `PLUGIN_PEER_UNAVAILABLE`; a second plugin ⇒ `PLUGIN_PEER_AMBIGUOUS`; a second MCP client ⇒ `CHANNEL_IN_USE`.
  - [ ] `channel_join`'s result includes `serverVersion` and `pluginVersion`; a known-unequal pair is refused with `VERSION_MISMATCH`. (Self-reported version check, not attestation — `SAFETY.md` claims it as exactly that, Phase 12.)
  - [ ] Update `resetChannel` in [figma-client.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/figma-client.ts) to perform a real socket-level leave that unbinds the pair and clears state.
  - [ ] Invalidate the binding when the bound peer disconnects; **every subsequent tool call is blocked until a successful rejoin**.
- [ ] **Scope-Ready Race Verification (Q11)**
  - [ ] Verify whether `ui.html` opens the socket before plugin-main acknowledges the committed scope. If confirmed: make the UI wait for plugin-main's acknowledgement before joining, and add a test. If it does not reproduce: record that outcome in the PRD's Provenance table.
- [ ] **Unit/Integration Tests**
  - [ ] Peer-binding states: zero plugin peers, two plugin peers, two MCP clients — each refused with its code.
  - [ ] Version mismatch refused; mismatch → detach → matching rejoin succeeds.
  - [ ] Bound-peer disconnect invalidates the binding and blocks tool calls until rejoin.
  - [ ] No cross-peer response acceptance: a response from an unbound peer never resolves a command.

---

## Phase 10: Page-Load Isolation (D14)
- [ ] **Page-Load Wrap & Isolation**
  - [ ] Wrap each page's `loadAsync()` individually across the multi-page read surface: `page_info` (pageIds), `node_info` traversals, `component_list`, `variable_list` consumer scans, and `annotation_list` by page.
  - [ ] A failing page becomes a structured per-page error (`PAGE_LOAD_FAILED` / `PAGE_NOT_FOUND` / `TARGET_NOT_PAGE`) inside a shared `coverage` object (`{complete, pageErrors: [{pageId, error}]}`) while successful pages still return their data; invariant `complete === (pageErrors.length === 0)`.
  - [ ] Single-page commands return the structured error **directly** instead of Figma's raw error string.
- [ ] **Bounded Per-Page Timeout (Q12)**
  - [ ] Implement a single bounded per-page timeout for `loadAsync()`: a hung load becomes a structured `PAGE_LOAD_TIMEOUT` page error instead of wedging the serialized command queue. The timeout value is implementation-chosen and documented as **behavior, not contract**.
  - [ ] A `loadAsync()` that settles *after* its timeout is provably ignored — the late result may not alter a returned response or authorize later work.
- [ ] **Destructive Scan Protection**
  - [ ] `variable_delete` (including collection mode and apparently empty collections) aborts **before any `remove()`** with `DOCUMENT_SCAN_INCOMPLETE` when any page could not be loaded and scanned — a page error can never mean zero consumers. Today's accidental fail-closed-by-thrown-error becomes an explicit, tested contract.
- [ ] **Unit Tests**
  - [ ] One failing page yields partial data plus `coverage.complete: false` on reads.
  - [ ] Variable and collection deletion fail closed with no mutation on incomplete coverage, including an apparently empty collection and one failing page among successes.
  - [ ] A timed-out page yields `PAGE_LOAD_TIMEOUT` while other pages return their data; a late settlement is ignored (does not alter the returned result or enable later mutation).
  - [ ] Single-page failures return structured codes, not raw Figma strings.

---

## Phase 11: Connector Repair (D12)
- [ ] **Connector Re-design (creation-only; Q13 revised hybrid — Design-file support kept)**
  - [ ] Make `create_connection` creation-only: remove the set-default and check-default modes, the `clientStorage` cache, and the silent `currentPage` auto-adoption (both scan sites, including the one inside `createConnections`).
  - [ ] Require `connectorId` **and** new `connectorName` on every call; resolve and verify (existence, exact current name, `CONNECTOR` type, in scope) **before any mutation**.
  - [ ] A call with no valid template returns the structured `CONNECTOR_TEMPLATE_REQUIRED` error whose message is the bootstrap UX: find a connector with `page_info`/`node_info` (pasting one from FigJam if the file has none) and pass its ID and exact current name.
  - [ ] Adopt the D7 envelope: per-item ordered rows, honest `status`, no unconditional `success: true`, and error rows never counted as created connections.
  - [ ] Apply D11 containment: verify the (derived) destination; insert as the immediate next synchronous operation; track every created ID; clean up uncommitted clones and cursors on later failure — a cursor created for one endpoint may not leak when the other endpoint fails.
  - [ ] Update the reaction prompt and guides to teach explicit template discovery instead of default management (guide sync itself is Phase 12).
- [ ] **Unit Tests**
  - [ ] A missing or name-mismatched template fails closed with no mutation; the bootstrap error carries its recovery.
  - [ ] Injected per-item failures clean up their clones and cursors (no leaks).
  - [ ] The aggregate never reports error rows as created connections; D7 envelope outcomes hold.
  - [ ] The Design-file clone path is covered by unit tests (the live probe is Phase 14 and fixture-dependent).

---

## Phase 12: Contract Sync (D8)
- [ ] **SAFETY.md**
  - [ ] Revise G2 to the universal existing-object rule (Q3 wording): *"No write against an existing object proceeds unless the caller-supplied current name matches the resolved object's actual name — nodes, variables, styles, and collections alike. Creation verifies the identified parent or collection instead."*
  - [ ] **Publish gate:** before publishing the revised G2, audit every write tool against the rule (the `safetyContract` mechanical diff provides most of it; the Part B matrix stays the per-tool proof).
  - [ ] Update A3, the "Name fields" bullet, and the Part B matrix rows for every changed tool (`variable_manage`, `style_manage`, the five creators, `create_component_set`, `node_flatten`, `node_clone`, `annotation_set`, the batch tools, `create_connection`, and the channel-binding surface).
  - [ ] Add G1's observable-boundary wording, the D11 same-stack micro-transient residual risk, and the D13 claim ("peer-bound, self-reported version check — not cryptographic attestation").
- [ ] **Agent guides** ([skills/figma-edit/references/](file:///Users/neozhehan/Git/figma-edit-mcp/skills/figma-edit/references/): constraints, error-playbook, tool-selection, workflows)
  - [ ] State the G2 rule in exactly **one sentence** in the guides.
  - [ ] `error-playbook.md`: add an entry for every D9 code — the ten new codes in the header plus every changed refusal (including the reworded `PARENT_NAME_MISMATCH`).
  - [ ] Teach the new batch `status` semantics (treat `partial_success` as incomplete; retry failed items), the annotation list-before-retry guidance (Q10), and explicit connector template discovery (D12).
  - [ ] D9 acceptance review per new or changed message: the correct retry is derivable from the error text and the tool list alone.
  - [ ] Mirror all guide changes to the `figma-edit://guide/*` server resources.
- [ ] **Unit Tests**
  - [ ] The `safetyContract.test.ts` mechanical diff passes in both directions after the `SAFETY.md` matrix updates.

---

## Phase 13: Version & Docs
- [ ] Bump the release version `2.3.2 → 2.3.3` on every surface the `check:versions`/`check:plugin` mechanism enforces:
  - [ ] [package.json](file:///Users/neozhehan/Git/figma-edit-mcp/package.json)
  - [ ] Root [package-lock.json](file:///Users/neozhehan/Git/figma-edit-mcp/package-lock.json)
  - [ ] **Both** version fields in [server.json](file:///Users/neozhehan/Git/figma-edit-mcp/server.json) (top-level `version` and `packages[0].version`)
  - [ ] Root [manifest.json](file:///Users/neozhehan/Git/figma-edit-mcp/manifest.json) (the versioned manifest; `figma_plugin/manifest.json` carries no version field)
  - [ ] The plugin About handshake
- [ ] Rebuild the plugin bundle using `bun run build:all`.
- [ ] Verify `check:plugin` and `check:versions` pass.
- [ ] Add the `CHANGELOG.md` entry for v2.3.3 naming **every** newly required field and breaking repair, each with a before/after example. The PRD's Compatibility posture section is the checklist: required `currentVariableName`/`currentStyleName`/`collectionName`/`scopes`; required parents on the five creators and `create_component_set`; the `annotation_set` field-set change; recursive strictness rejecting nested unknown keys; `.min(1)` and duplicate refusal on batches; corrected `node_delete`/`text_set_content` output field names; the new batch `status` field; `channel_join` version/peer fields and refusals; creation-only `create_connection` with the required name-verified template; and the additive `create_instance` `componentId` response field (Rev 20).

---

## Phase 14: Verification (Automated + Live Figma)
- [ ] Run and pass: `bun run build:all`, `bun run check:plugin`, `bun run check:versions`, `bun run check:types:plugin`, `bun run test` (full suite green: the 647+ existing tests as of v2.3.2 plus all new D5–D14 tests).
- [ ] Confirm the IDE opens the plugin source with zero spurious ambient-global diagnostics.
- [ ] **Track 1 rebuild-diff:** rebuilding `figma_plugin/code.js` after the Phase 1–2 commits produces no functional emitted-JS change (the residual fixes are types/casts/config only, confirmed via `check:plugin` rebuild + `git diff`); every other emitted-JS change must map to a deliberate D5–D14 edit, reviewed explicitly. Per review decision 3 (accepted 2026-07-17), the Track 1 expectation is strengthened from "no functional change" to **no code-line changes at all**: the Track 1 portion of the rebuild diff is comment-text only, machine-distinguishable from the deliberate D5–D14 edits.
- [ ] **Live Probes Matrix (against a live Figma document)**
  - [ ] ID-only `UPDATE_VARIABLE` call is refused.
  - [ ] `style_manage` update by ID without `currentStyleName` is refused.
  - [ ] Properties-only style update does not rename the style.
  - [ ] `CREATE_VARIABLE` without `collectionName` or `scopes` is refused.
  - [ ] `parentNodeName` omission is rejected at the server schema boundary (Phase 5 tests); a live **mismatched** `parentNodeName` returns the reworded `PARENT_NAME_MISMATCH` plugin error (Q2 layer split).
  - [ ] `[]` and duplicate-node `node_delete` batches are refused before any mutation.
  - [ ] A normal multi-item batch returns exactly one ordered row per input, with explicit `skipped` rows for unattempted items.
  - [ ] An annotation append via `annotation_set` succeeds and is rediscovered via `annotation_list`.
  - [ ] A nested `node_flatten` result stays under its original parent.
  - [ ] `create_component_set` lands under its supplied parent.
  - [ ] `create_instance`'s response includes `componentId` matching the resolved component (regression for the Phase 8 dead-field fix; baseline: the 2026-07-17 `p28j` probe showed the advertised field absent).
  - [ ] `channel_join` reports `serverVersion` and `pluginVersion` for one bound peer; an empty channel is refused with `PLUGIN_PEER_UNAVAILABLE`, a two-plugin channel with `PLUGIN_PEER_AMBIGUOUS`, a second MCP client with `CHANNEL_IN_USE`, and a known version mismatch with `VERSION_MISMATCH`.
  - [ ] `create_connection` without a valid template returns `CONNECTOR_TEMPLATE_REQUIRED`.
  - [ ] An explicit-template connection returns per-item truth. **Fixture-dependent:** requires a pasted FigJam connector in the test file; if unavailable, record the probe as blocked (per the Gap 9 precedent) rather than skipping silently.
  - [ ] **Manual plugin-UI check** (unreachable over MCP — only the UI's `validate-scope-link` path calls `parseNodeIdFromUrl`; MCP traffic is converted dash→colon server-side): paste a scope link using the percent-encoded node-id form (`node-id=1%3A2`) of a real node. If it validates, the sandbox provides `URL`: add a one-line ambient declaration beside `TextDecoder`'s and delete the suppression in `parseNodeIdFromUrl`. If it reports "Node not found" while the dash form validates, `URL` is absent: update the annotation to record the fact and defer the `decodeURIComponent` regex fix to post-release UI polish. Record the outcome in the PRD Provenance table either way.

---

## Follow-ups outside v2.3.3 scope (tracked, not scheduled)

- [ ] **Server-side type-check gap (review decision 5, accepted 2026-07-17):** open a tracked follow-up (issue or next-release PRD item) for restoring an MCP-server type-check. Recorded facts: root `tsc --noEmit -p tsconfig.json` is currently unrunnable (TS6059 — `rootDir: "src"` is violated by tests importing `figma_plugin/` sources); CI runs no server `tsc` at all (`build` is tsup, which does not type-check); the Phase 4 `.superRefine()` enforcement and dual descriptions — the Q1/Q14 first-call-correctness mechanism — therefore live in unchecked code; and the single-argument `z.record` type error in `src/shared/nodeTypes.ts` sat invisible server-side until the plugin tsconfig surfaced it. Acceptance shape: a `check:types:server` gate analogous to `check:types:plugin`. The audit itself stays out of v2.3.3 per D4 — this item exists so the gap is tracked work, not an unstated non-goal.
