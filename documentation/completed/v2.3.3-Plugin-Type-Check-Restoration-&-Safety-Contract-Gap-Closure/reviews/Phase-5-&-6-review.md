# Phase 5 & 6 Adversarial Implementation Review

**Date:** 2026-07-18
**Target:** committed tip `c49840f` plus the current uncommitted Phase 5–6 working tree
**Requirements reviewed:** [PRD D6, D7, D9/Q16, Q9/Q18](../prd.md) and [task-list Phases 5–6](../task.md)
**Status:** **Resolved 2026-07-19** — every finding below (P5-1–P5-4, P6-1–P6-12, S1–S5) and the six 2026-07-18 ratifications are fixed under the Q22–Q26 decisions and verified. The suite is green at **726/726** (up from 699), `check:types:plugin`/`check:suppressions` pass, and the plugin bundle rebuilds idempotently.

> **Resolution note (2026-07-19).** Implemented under the recorded decisions Q22–Q26 (PRD Revs 31–35) and the two 2026-07-18 ratifications lists. Key changes: the parent-name refusal is now the coded `PARENT_NAME_MISSING`/`PARENT_NAME_MISMATCH` factory pair (Q22); `instance_set_overrides` reads the main component via `getMainComponentAsync` under `dynamic-page` (P6-1), returns the full envelope on every path including the outer catch and the two dispatcher soft-failures (P6-5), and carries the shared `nodeId`/`status`/`error` row vocabulary (Q25); the text partial-mutation disclosure carries `before: {fontName}` + `whatChanged` gated on an actual font fallback via a new `setCharacters` report out-param (Q24); duplicate targets are rejected at the schema boundary via a shared `.superRefine()` with the dispatcher check retained as one extracted defense-in-depth helper (Q23/ratification 6); all four aggregators drop their legacy count fields and derive `status`/`success` through one shared helper (Q26/ratification 4); parent descriptions adopt the D5 form (P5-4/ratification 3); and the doubled comment is gone (ratification 5). New/updated tests cover schema-boundary `[]` and duplicate rejection, the four-aggregator `success === (status === "success")` invariant, the `setCharacters` fallback report, plugin-level parent omission (with the phase2 helper's masking made opt-out), and the registered-schema envelope-only assertion. The findings below are retained as the historical record.

This document contains the findings from the adversarial review of Phases 5 and 6. This review verified each checked item against the PRD's recorded decisions and against the working-tree implementation. The Phase 3–4 findings are closed and are not repeated here.

The findings that need decisions rather than direct fixes are tracked in [open-questions.md](open-questions.md) as **Q22–Q26** (Q22 ← P5-1/S1; Q23 ← P6-6/S2; Q24 ← P6-3/S4; Q25 ← P6-9; Q26 ← P6-11), with four one-line ratifications (P6-8/S3, S5, P5-4, P6-12) recorded in that file's 2026-07-18 ratifications list. The remaining findings are remediation work under already-recorded decisions.

## Review boundary

The review inspected the uncommitted working tree (the Phase 5–6 implementation), the rebuilt plugin bundle, and the full unit suite. Facts established up front:

- `bun run test` passes **699/699** — a net gain of **3 tests** over the 696 recorded at Phase 3–4 closure, against roughly twelve checked-off unit-test items in Phases 5–6. Several checked test items have no corresponding test (see P5-2, P6-7).
- `check:types:plugin` and `check:suppressions` pass on the tree.
- `check:plugin` reports the bundle out of date, but this is an artifact of running it with uncommitted source changes (the script diffs the rebuilt bundle against the *committed* `code.js`). The rebuilt bundle is byte-identical to the working-tree `code.js`, which does contain the Phase 5–6 changes. The bundle is not stale; no finding.
- Passing unit tests do not establish Phase 6 conformance: the aggregator tests run against hand-built mocks whose behavior diverges from the live Figma API in exactly the place the new code depends on it (P6-1).

## Executive assessment

| Phase | Assessment | Release impact |
|---|---|---|
| Phase 5 — explicit-parent conformance | **Partial** | The schema tightening and the reworded error are correct and tested at the server boundary. The plugin-level omission tests claimed in the ledger do not exist, and the edited refusal was left outside the release's own structured-code regime. |
| Phase 6 — batch contract corrections | **Fail** | The envelope (status, counts, ordered rows, skipped rows) is substantially implemented and the honest-`success` fix is correct. But the Q9 partial-mutation disclosure is defective on both tools it exists for, one new code path likely breaks `instance_set_overrides` entirely at runtime under the plugin's `dynamic-page` manifest, several return paths still bypass the envelope, and five checked-off test items are missing. |

## Severity convention

- **P0 — release blocker:** the specified contract cannot be delivered, or an advertised tool stops working.
- **P1 — high:** a recorded requirement is checked off but not delivered, a disclosure can mislead the restoring write, or a defect only a live probe can catch has no live probe.
- **P2 — medium:** missing claimed tests, structurally unenforceable requirements, or material contract drift.
- **P3 — low:** wording, redundancy, or ledger inconsistency to correct before phase closure.

---

## Phase 5 findings

### P5-1 — [P2] The edited parent-name refusal is left outside the release's own structured-code regime

**Evidence.** [utils/errors.ts:22](../../../figma_plugin/utils/errors.ts) — the reworded `PARENT_NAME_MISMATCH` remains a plain string in the legacy `ERRORS` table and is thrown as `throw new Error(...)` (e.g. [componentHandlers.ts:939,953](../../../figma_plugin/handlers/componentHandlers.ts)). It therefore surfaces at the MCP boundary as `UNKNOWN_ERROR`. The same release's `REFUSALS` registry (utils/errors.ts) gives every D5 verification refusal a distinct code and splits the missing and mismatch causes (`VARIABLE_NAME_MISSING` vs `VARIABLE_NAME_MISMATCH`, and so on for collections and styles).

**Why this is a finding.** D9 says every verification refusal this release **adds or edits** follows the convention, and Rev 27 applied exactly that rule to add `VARIABLE_SCOPES_MISSING` to the inventory mid-implementation. Phase 5 edits `PARENT_NAME_MISMATCH` — the same class of refusal, name verification before a write — yet neither the PRD inventory nor the task list assigns it a code or a message factory, and the message merges the missing and mismatched causes into one sentence while D9 requires the cause to be named distinctly ("missing vs. mismatched vs. stale"). The contradiction originates in the PRD: D6's own prescribed wording ("parentNodeName is missing or does not match…") conflicts with D9's distinct-cause rule, and the implementation followed the weaker text. Note also that when `parentId` itself is the omitted field (`validateCreateComponentSetPlan` throws this error for a missing `parentId` too), the recovery sentence steers the caller to fix the wrong field — the exact failure mode the rewording was meant to end.

**Required remediation.** Decide explicitly, and record it: either (a) `PARENT_NAME_MISMATCH` joins the coded regime (a `PARENT_NAME_MISSING`/`PARENT_NAME_MISMATCH` pair from the factory registry, inventory and playbook updated), or (b) the PRD records why an edited verification refusal stays on the legacy fallback while `VARIABLE_SCOPES_MISSING` could not. Option (a) is consistent with the release's own Rev 27 precedent. Give the missing-`parentId` branch in `validateCreateComponentSetPlan` its own message.

**Acceptance criteria.** The refusal's code (or the recorded exemption) appears in the PRD inventory; Phase 12's playbook task can name it; the mismatch and omission causes are distinguishable from the error alone.

### P5-2 — [P1] The checked-off plugin-level omission tests do not exist, and a helper change actively hides the omission path

**Evidence.** The task ledger checks "Plugin-level tests (bypassing the server): **missing** and mismatched parent names still fail closed." The only plugin-level assertions in the tree are two *mismatch* tests ([phase1.test.ts:261](../../../src/mcp_server/tests/unit/figma_plugin/phase1.test.ts), [phase2.test.ts:495](../../../src/mcp_server/tests/unit/figma_plugin/phase2.test.ts)). No test drives any of the six tools through the plugin gate with `parentNodeName` (or, for `create_component_set`, `parentId`) omitted. Worse, the phase2 `sendCommand` helper was modified to **inject default `parentId`/`parentNodeName` into every call that omits them** (phase2.test.ts:130–134), so the new `!parentId || !params.parentNodeName` branch in `validateCreateComponentSetPlan` is unreachable from the entire phase2 suite.

**Impact.** The Q2 layer split makes the plugin's missing branch the only defense for older servers and non-conforming clients; it is now untested, and the test helper guarantees future regressions of that branch stay invisible.

**Required remediation.** Add plugin-gate tests that omit the parent fields for `create_component_set` and at least one representative creator, asserting the fail-closed refusal and that no creation occurred. Make the phase2 helper's default injection opt-in per test rather than unconditional.

**Acceptance criteria.** Deleting the `!parentId || !params.parentNodeName` check turns at least one test red.

### P5-3 — [P3] The creators' missing-name defense is implicit, not the "kept branch" the ledger describes

**Evidence.** `verifyParentName` ([main.ts](../../../figma_plugin/src/main.ts)) has no explicit missing-name branch; omission fails only because `undefined !== node.name`. The behavior is correct and fail-closed, but the ledger's "keep the plugin's 'missing' branch" describes a branch that exists only for `create_component_set`. Record the mechanism or add the explicit check; either way P5-2's tests are what actually protect it.

### P5-4 — [P3] Phase 5 did not adopt the release's own description conventions where they were in reach

**Evidence.** The now-required `parentNodeName` descriptions read "Name of the parent node to verify against" ([create.ts](../../../src/mcp_server/tools/create.ts)). The D5 mechanism this same release ratified (Q1/Q14/Q21) states requirements in the field description with the read tool and "pass it back verbatim" ("…passed back verbatim from `variable_list`"), and asserts descriptions against the emitted `tools/list`. Phase 5's schema tests also assert at registration level rather than against `tools/list` (v2Tools.test.ts:163–195) — safe here because requiredness is structural, but a standard the release applies inconsistently. A one-line description change ("The parent's current exact name, passed back verbatim from `node_info`") would buy the same first-call correctness D5 paid for. Missed opportunity, not a defect: D6 never mandated it.

---

## Phase 6 findings

### P6-1 — [P1, likely P0 on live confirmation] The new `mainComponent` read likely breaks `instance_set_overrides` at runtime under `dynamic-page`

**Evidence.** [componentHandlers.ts:568](../../../figma_plugin/handlers/componentHandlers.ts) — the Q9 before-value is captured as `targetInstance.mainComponent ? targetInstance.mainComponent.id : null`, a **synchronous** accessor read. The plugin manifest declares `"documentAccess": "dynamic-page"` ([figma_plugin/manifest.json:21](../../../figma_plugin/manifest.json)), under which Figma's API makes the synchronous `InstanceNode.mainComponent` getter **throw** and requires `getMainComponentAsync()`. Every other main-component access in the codebase uses the async form (componentHandlers.ts:203, 425, 512; nodeReaders.ts:477 even feature-tests for it). The read sits **outside** the per-item `try`, so the throw escapes the row machinery to the function's outer catch and the whole batch returns the envelope-less `{success:false, status:"failed", message}` (P6-5).

**Why the suite is green anyway.** The unit mocks model `mainComponent` as a plain property (`atomicityAndValidation.test.ts`, the `t1/t2/t3` fixtures), so the tests cannot observe the dynamic-page behavior. And the Phase 14 live-probe matrix contains **no `instance_set_overrides` probe at all**, so nothing between here and release would catch it (see P6-10).

**Impact.** If confirmed live, every `instance_set_overrides` call fails on its first target — a working advertised tool becomes a broken one, which is release-blocking by this project's own standard.

**Required remediation.** Replace the read with `await targetInstance.getMainComponentAsync()` (inside the guarded region), or reuse the already-resolved data where available. Add a Phase 14 live probe for `instance_set_overrides` (success path and one induced failure). Consider a mock convention where synchronous `mainComponent` access throws, mirroring the manifest.

**Acceptance criteria.** A live `instance_set_overrides` call succeeds against a dynamic-page document; the disclosure test passes with a mock whose sync accessor throws.

### P6-2 — [P1] The text disclosure stamps `partialMutation: true` on clean failures

**Evidence.** [textHandlers.ts:190](../../../figma_plugin/handlers/textHandlers.ts) — the flag, and the before-value, are attached in the aggregator's `catch` for **every** error thrown by `setTextContent`. But `setTextContent` throws on several zero-mutation paths: node deleted between prevalidation and execution, node no longer TEXT, `setCharacters` returning `false` when the characters assignment fails **without** a prior font fallback, and a fallback-font load that itself fails before any assignment ([textUtils.ts:98–152](../../../figma_plugin/utils/textUtils.ts)). All of these produce a row claiming a mutation happened. D7/Q9 is explicit — "a clean failure never carries the flag" — and the corresponding checked-off negative test ("a clean failure never carries the flag") does not exist for the batch tools.

**Impact.** The agent is told to compose a restoring write after failures that changed nothing; on the node-not-found path the row's `before.characters` is additionally the initializer `""` (line 128), so the "restore" would erase the node's text.

**Required remediation.** Attach the flag only when a mutation is known to have occurred (see P6-3 for what that actually is), and never emit a fabricated before-value. Add the negative tests.

**Acceptance criteria.** A deterministic zero-mutation failure (e.g. `setCharacters` char-assignment failure with the font load succeeding) produces a failure row with no `partialMutation`, no `before`.

### P6-3 — [P1] The text before-value restores the wrong property; the "confirm the exact paths" task was checked without the confirmation it exists for

**Evidence.** The PRD's identified mutate-then-fail path for text is "font fallback before character assignment." In `setCharacters` that path mutates **`node.fontName`** (the fallback is applied at textUtils.ts:143–145) and then fails to assign `characters` — so `characters` never changes, and the one thing that did change (`fontName`) has **no** captured before-value. The shipped row carries `before: { characters: originalText }`, which restores a property that was not mutated. The unit test papers over this by defining a mock `characters` setter that assigns and *then* throws (`atomicityAndValidation.test.ts:233–239`) — a half-assigning setter real Figma does not have — manufacturing a world where the PRD's prescribed before-value looks right.

**Why this is also a spec finding.** Q9's own prescription ("the original `characters` string") mismatches the mutation path the same paragraph names. The Phase 6 task "Confirm the exact mutate-then-fail paths during implementation" exists precisely to catch this; it is checked off with no recorded confirmation, and the implementation shipped the PRD's guess.

**Required remediation.** Record the confirmed path (fontName fallback, then character-assignment failure), carry `before: { fontName: {family, style} }` (plus `characters` only if a path that half-mutates characters is demonstrated), and state in `whatChanged` what actually changed. Amend the Q9 bullet in the PRD in the same change (D8's same-change rule).

**Acceptance criteria.** The disclosure test simulates the real path — font fallback applied, characters assignment fails atomically — and the row's before-values suffice to compose the actual restoring write.

### P6-4 — [P1] The text failure rows omit `whatChanged` — the exact vocabulary drift the ledger says fails review

**Evidence.** Phase 4's ratified shape is `{partialMutation: true, whatChanged, before}` (`withPartialDisclosure`, [utils/errors.ts:88–99](../../../figma_plugin/utils/errors.ts)); the instance rows match it (componentHandlers.ts:659–662). The text rows carry only `{partialMutation, before}` — no plain-language what-changed statement (textHandlers.ts:186–192). The checked-off item reads: "identical field names; drift between the Phase 4 and Phase 6 shapes fails review." This is that drift.

**Required remediation.** Add `whatChanged` to the text rows (with the corrected content per P6-3). Add the cross-shape test the ledger claims ("the field names match the Phase 6 batch-row vocabulary") in the direction batch→Phase-4 as well.

### P6-5 — [P1] "Envelope on every return path" is checked off, but three return paths bypass it

**Evidence.**
1. [main.ts:614](../../../figma_plugin/src/main.ts) and [main.ts:621](../../../figma_plugin/src/main.ts) — after prevalidation succeeds, a `getValidTargetInstances` or `getSourceInstanceData` soft failure returns `{success: false, message}` as a *successful command payload*: no `status`, no counts, no rows, not a structured D9 error either. Under the three-layer contract this state is unclassifiable — it is neither a Layer 2 refusal nor a Layer 3 envelope.
2. [componentHandlers.ts:701](../../../figma_plugin/handlers/componentHandlers.ts) — `setInstanceOverrides`' outer catch returns `{success: false, status: "failed", message}` with none of the four counts and no rows, violating the Layer 3 requirement that every accepted call return the counts and exactly one row per input. This is also the path P6-1 lands on, which is why its blast radius includes the envelope contract.

**Required remediation.** Convert paths (1) into structured D9 errors (they are execution-time refusals) or into full envelopes; give the outer catch the counts and rows (attributing the failure to the item being processed and `skipped` rows for the rest). Extend the checked-off "on every return path" test to actually enumerate these paths (see P6-7).

### P6-6 — [P1] The new duplicate-target refusal is a locally composed prose string that surfaces as `UNKNOWN_ERROR`

**Evidence.** [main.ts:467, 536, 590](../../../figma_plugin/src/main.ts) — `throw new Error("Operation Denied: Duplicate node ID detected: …")`, composed inline in the dispatcher, in triplicate, alongside new inline `throw new Error("Missing nodeId parameter")` strings. The dispatcher's ratified classification (Q16 rule 1) sends non-coded throws to `UNKNOWN_ERROR`; Q16 rule 2 says every coded refusal originates from the central factory registry and handlers never compose refusal text locally. The duplicate refusal is **new in this release**, so the legacy-surface exemption (the v2.3.4 deferral) does not cover it; D9's "adds or edits" rule does.

**The upstream spec gap.** The Q16 inventory contains no code for duplicate targets, and no Phase 6 task assigns one — so the playbook task in Phase 12 ("an entry for every D9 code … plus every changed refusal") has nothing to attach this refusal to. The same reasoning that added `VARIABLE_SCOPES_MISSING` in Rev 27 applies here. Separately, the Layer 2 task wording ("refusals return a structured D9 error … instead of a thrown string") is ambiguous about whether it covers the legacy prevalidation surface (deferred to v2.3.4) or only new refusals; it was checked off while the *new* refusals it unambiguously covers are plain strings.

**Required remediation.** Mint the code (e.g. `DUPLICATE_TARGET`), add a factory (message names the offending ID and both spellings rule, recovery = "remove the duplicate entry and resend the batch"), amend the inventory per the Rev 27 mechanism, and route all three sites through it. Rescope the Layer 2 task text to "new/edited refusals are coded; the legacy surface stays on `UNKNOWN_ERROR` per Q16."

**Acceptance criteria.** A duplicate batch surfaces at the MCP boundary with the minted code in `structuredContent.error.code`; grep finds no inline "Duplicate node ID" string outside the registry.

### P6-7 — [P2] Five checked-off unit-test items have no test

**Evidence.** The net test delta for both phases is +3 (696 → 699): the `create_component_set` schema test, the instance-overrides disclosure test, and one duplicate-text test. Missing entirely, though checked off:

1. **`[]` batches rejected** — no test exercises `.min(1)` on any of the four tools (no schema-boundary test, no boundary-suite case).
2. **Property test across all four aggregators** (`success === (status === "success")` on every return path) — no such test exists anywhere (`grep` for the invariant finds nothing in tests). Had it existed and genuinely enumerated return paths, it would have caught P6-5.
3. **Duplicate IDs for `node_delete` and `instance_set_overrides`** — only the text tool has a duplicate test (atomicityAndValidation.test.ts:437–468); the other two dispatcher blocks are copies, but untested copies.
4. **Registered-callback validation of the corrected output fields and envelope fields** — see P6-8; nothing validates what the callbacks return against the declared names.
5. **"A clean failure never carries the flag"** — no negative disclosure test for either batch tool (and the positive text test manufactures its scenario, P6-3).

Also partially delivered: "rejected with no envelope and **no mutation**" — the duplicate test asserts the command-error but never asserts the first (valid) item was left unmutated.

**Required remediation.** Write the five tests; make the property test enumerate return paths per aggregator (including outer catches and the main.ts soft-failure returns) rather than sampling one happy path.

### P6-8 — [P2] The "registered-callback tests so `looseOutput` can no longer mask drift" requirement is structurally unenforceable as built, and the existing samples are stale

**Evidence.** The central wrapper relaxes every registered output schema to `.partial().extend({error}).catchall(z.any())` ([tools/index.ts:55–63](../../../src/mcp_server/tools/index.ts)) — the ratified P4-1 mechanism. A schema in which every field is optional and unknown keys are accepted validates **any** object, so no schema-validation test can ever fail on field-name drift again. The only test that touches these schemas, `outputSchema.test.ts`, feeds hand-written sample payloads through exactly that relaxed validator — and its samples for all four batch tools are still the **pre-Phase-6 shapes**, including fields the handlers no longer return (`totalNodes` at line 180, `totalReplacements` at line 362, the old `instance_set_overrides` and `annotation_set` shapes at 407/440). They pass, which is the proof of vacuity.

**Why this is also a spec finding.** D9's Rev 30 note says "exact success-field conformance stays enforced by the D7 registered-callback tests," and the Phase 6 task repeats the promise — but no such tests exist for these tools, and neither the PRD nor the task list defines the only mechanism that can work post-relaxation: invoke the **real registered callback** with a mocked transport and assert the returned object's keys against the *declared* (pre-relaxation) schema shape. The requirement and the P4-1 mechanism were never reconciled.

**Required remediation.** Build the callback-driven exact-shape tests (declared-schema key set ⊆ callback return keys, and envelope fields present with correct types), update the representative samples to the real shapes, and amend the D7 bullet to name the mechanism.

### P6-9 — [P2] The "one shared contract" has per-tool row vocabularies

**Evidence.** Reason key: `error` in text/annotation/delete rows vs `message` in instance rows. Identity key: `nodeId` in three tools vs `instanceId`/`instanceName` in instance rows. The retry loop the descriptions now teach ("retry only those failed items") therefore needs per-tool knowledge to read the rows, which is what a shared contract exists to avoid. D7 says "one shared contract across all four aggregators"; the counts and `status` are shared, the rows are not. If the divergence is retained deliberately (pre-existing row shapes), record it; otherwise unify on `nodeId` + `error`.

### P6-10 — [P2] The Phase 14 live-probe matrix was not extended for the Phase 6 surface

**Evidence.** The matrix probes `node_delete` (`[]`, duplicates, ordered rows) and nothing else from Phase 6: no `instance_set_overrides` probe (the tool carrying P6-1, whose defect only manifests live), no text partial-mutation probe (the disclosure whose real path only a live font environment exercises), no `text_set_content`/`instance_set_overrides` duplicate probes. Phase 6 changed four tools; the matrix verifies one. Given this release's own lesson — the Gap 5 and Gap 9 defects were found live, not by mocks — the matrix should grow with the surface it verifies.

**Required remediation.** Add matrix rows: an `instance_set_overrides` success and induced-failure probe, a text batch with a forced mid-batch failure asserting row truthfulness, and duplicate refusals on the two unprobed tools.

### P6-11 — [P3] Aliased count fields are advertised with no signal about which is authoritative

**Evidence.** `node_delete` now advertises `nodesDeleted` and `succeededCount` (identical values), `nodesFailed` and `failedCount`; `text_set_content` likewise (`replacementsApplied`/`succeededCount`, `replacementsFailed`/`failedCount`). The duplication follows from the task's own wording (correct the old names *and* add the envelope), but nothing in the descriptions marks the legacy pair as aliases, and `annotation_set`'s legacy pair (`annotationsApplied`/`annotationsFailed`, still returned by the handler) is not advertised at all — the "schemas match handler outputs" rule applied to two tools of four. Mark the legacy fields as deprecated aliases in their descriptions (and advertise or drop annotation's), so an agent reading `tools/list` knows which vocabulary is the contract.

### P6-12 — [P3] Minor divergences worth one pass

1. The `status` derivation includes a redundant `skippedCount === 0` conjunct in three aggregators and omits it in `deleteMultipleNodes` (nodeModifiers.ts:292 vs the other three) — harmless today (skips only follow failures), but the four expressions should be one shared helper so they cannot drift.
2. `annotation_set`'s description now teaches `partial_success` retry semantics while the tool's item schema is still the Gap 6 shape no conforming call can satisfy, and `idempotentHint: true` still stands next to the new retry guidance. Both resolve in Phase 7; harmless under the single-release plan (Q15), but if phases were ever cut separately this would ship contradictory guidance. Note only.
3. The dup-check's plugin-side normalization (`replace(/-/g, ":")`) duplicates the server-side `normalizeNodeId` already applied to all three batch item arrays (figma-client.ts:400–414). Defense in depth is fine; a comment noting the server normalizes first would stop a future reader from "simplifying" the server side on the theory the plugin covers it (or vice versa).

---

## Specification findings (PRD / task-list text, independent of the implementation)

- **S1 — D6/D9 contradiction on cause distinctness.** D6 prescribes a merged missing-or-mismatch message; D9 requires distinct causes. The D5 refusal family resolves this with paired codes; the parent-name family does not. (Carried by P5-1.)
- **S2 — Inventory gap for the duplicate-target refusal.** D7 mandates the refusal; D9 mandates codes for added refusals; the Q16 inventory has no code for it and Phase 12's playbook task therefore cannot cover it. (Carried by P6-6.)
- **S3 — D7's drift-proofing promise contradicts the P4-1 relaxation.** After Rev 30, output schemas cannot fail validation on drift by construction; the "registered-callback tests" the PRD leans on are not defined anywhere in a form that could work. (Carried by P6-8.)
- **S4 — Q9's text before-value contradicts its own path analysis.** The named path mutates `fontName`; the prescribed before-value is `characters`. The confirm-during-implementation task existed to catch this and did not. (Carried by P6-3.)
- **S5 — Layer 2 task wording is over-broad.** Read literally it requires converting the legacy prevalidation throw surface this release explicitly defers to v2.3.4 (Q16). It should be scoped to new/edited refusals so it can be honestly checked off. (Carried by P6-6.)

## Ledger correction required

Under the project's own convention (the Phase 1–2 and Phase 3–4 precedents), checkboxes that describe undelivered work should be unchecked or annotated until remediation lands: Phase 5 "Plugin-level tests" (P5-2); Phase 6 "Layer 2" (P6-6), "on every return path" (P6-5), the three Q9 disclosure items (P6-2/3/4), and five of the seven unit-test items (P6-7).
