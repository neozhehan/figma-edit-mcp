# Phase 5 & 6 Adversarial Critique

**Original review:** 2026-07-19

**Closure recheck:** 2026-07-24

**First remediation record:** 2026-07-25 — R1–R9 were marked closed; the later same-day functional recheck below supersedes that blanket status by reopening R2/R3 and adding R10.

**Base target:** `0416059` (`v2.3.3-Plugin-Type-Check-Restoration-&-Safety-Contract-Gap-Closure`)

**Latest recheck target:** the current 2026-07-25 working tree containing the fourth-recheck R14–R15 remediation.

**Requirements reviewed:** [PRD D6/D7 and implementation plan](../prd.md), [task-list Phases 5–6](../task.md)

**Second-recheck remediation:** 2026-07-25 — R2, R3, and R10 addressed; see [2026-07-25 second-recheck remediation](#2026-07-25-second-recheck-remediation-r2r3r10) and [prd.md](../prd.md) Rev 43.

**Third-recheck remediation:** 2026-07-25 — R11, R12, and R13 fixed; see [2026-07-25 third recheck and remediation](#2026-07-25-third-recheck-and-remediation-r11r12r13) and [prd.md](../prd.md) Rev 44.

**Fourth-recheck remediation:** 2026-07-25 — R14 and R15 fixed; see [2026-07-25 fourth recheck and remediation](#2026-07-25-fourth-recheck-and-remediation-r14r15) and [prd.md](../prd.md) Rev 45.

**Current assessment (2026-07-25, after fourth-recheck remediation):** **No reproduced, non-deferred functional defect remains in Phase 5 or Phase 6.** Phase 5 remains clean. Phase 6 rejects same-object removed targets/scope roots before swapping (R11), captures a mandatory authoritative `mainComponentId` without stale/null evidence (R12), produces a nonblank actionable failure row for arbitrary thrown values across all four aggregators (R13), and treats both user notifications and progress delivery—including hostile delivery-error diagnostics—as best-effort so telemetry cannot erase or corrupt a post-mutation D7 envelope (R14/R15). The live `before` schema description matches Rev 43's diagnostic-evidence contract. Explicitly accepted or later-owned limitations remain unchanged: R1's test-stub-only mixed-font capture degradation, R3's permissive top-level output schema/runtime-validator deferral, R5's Phase 7 recursive strictness, and R10's missing restore write surface.

*Superseded assessment after the third remediation:* its no-gap statement was disproved by post-swap notification failure and hostile progress-error probes. The fourth-recheck section is authoritative.

*Superseded assessment after the second remediation:* the earlier statement that no functional gap remained was disproved by deterministic removed-target, stale/null main-component capture, and degenerate-throw probes. It is retained only through the historical Rev 43 sections below.

*Pre-remediation assessment (2026-07-25, second recheck):* Phase 5 has no remaining reproduced functional defect. Phase 6 still has three non-deferred functional/contract gaps: R2 is reopened because target revalidation is followed by awaited work that permits fresh drift before `swapComponent()`; R3 is reopened because the registered output boundary still accepts legacy-only and contract-invalid results; and new R10 records that Q9/Q24's promised one-round-trip restoring write cannot be composed through any exposed write tool. R1 remains an explicitly accepted best-effort residual, and R5's recursive nested strictness is explicitly deferred to Phase 7; neither is counted in this non-deferred open set. Test-only and documentation-only debt is retained in the historical findings but is not classified as an unimplemented functional gap here.

> **Correction of the 2026-07-22 resolution note.** That note stated that all thirteen findings were fixed and verified at 741/741 tests. The 2026-07-24 closure audit re-ran the full suite at **766/766**, inspected the current callbacks and schemas, and drove the adverse paths directly. The green suite is real, but the blanket closure statement is not: two release-relevant runtime/contract defects still reproduce (R1/R2 below), the callback and path-matrix gates remain structurally incomplete (R3/R4), and several documentation or regression-test acceptance items remain unfinished. The old resolution claim is superseded by this recheck. *(The first 2026-07-25 remediation record later marked R1–R9 closed; the second recheck below supersedes that blanket closure for R2/R3 and adds R10.)*

## 2026-07-25 third recheck and remediation (R11/R12/R13)

The Rev 43 implementation and its 794 passing tests were re-audited as claims. Three new deterministic adverse paths reproduced against both source and the rebuilt bundle. All three were Phase 6 behavior already promised by D7/Q9/Q25, and no later phase owned them.

| Finding | Reproduced defect | Remediation and durable acceptance |
|---|---|---|
| R11 — same-object removal after resolution | A valid target used as the editable scope root set `removed = true` during its awaited main-component read; the final predicate omitted Figma's `removed` flag, called `swapComponent()`, and returned success. | `checkTargetPredicates` rejects `removed === true` for the target and scope root. Dispatcher tests remove each inside the awaited window and assert a command error plus zero swaps. |
| R12 — stale or fabricated instance before-value | Main-component IDs were captured serially for the whole batch. A later target's await changed target 1 from `main-A` to `main-B`, yet a later failure reported `before.mainComponentId: "main-A"`. A thrown capture was swallowed as `null`, after which the swap still ran. | Batch preflight requires every main component to be readable. Target 0 is captured authoritatively and followed by a whole-batch synchronous recheck before the first swap; later targets are captured immediately before their final synchronous gate/swap. Thrown, null, or invalid captures fail before that target swaps. Regressions prove zero swaps and exact `main-B` evidence. |
| R13 — handler failures violate the Q25 row schema | `node_delete` and `annotation_set` copied `error.message`; empty `Error`s or non-`Error` throws yielded blank/undefined row reasons. The new schema then rejected the accepted execution's result, replacing its D7 envelope with an output-validation error. The same assumption existed in text/instance catches. | All four aggregators use the shared hardened `describeError()`. It is nonblank for empty/whitespace errors, strings, `null`/`undefined`, null-prototype objects, and hostile renderers. Real-handler results for empty `Error`, raw string, and `null` validate against every registered batch schema. |

### R11 — removed references are not equivalent to live nodes

Figma's pinned `BaseNode` contract retains stored node objects after removal and exposes `removed` for exactly this check. Rev 43 treated object truthiness plus ID/type/name/scope/lock as the complete predicate set. That was incomplete when the target itself was the editable scope root: ID equality satisfied scope membership even after removal, so no existing predicate failed.

**Resolved:** the synchronous use-time predicate now checks target and scope-root removal before identity/scope/lock evaluation. Because the check runs after each relevant await and immediately before mutation, the removed reference cannot reach `swapComponent()`.

### R12 — hoisting async reads closed one TOCTOU window but made evidence stale

The Rev 43 hoist correctly enabled a whole-batch gate after all awaited reads, but incorrectly reused those early IDs as Q9 before-values. Predicate stability does not imply main-component stability: changing an instance's main component leaves its ID, type, name, ancestry, and lock state intact. Catching a failed read and substituting `null` additionally converted "unknown" into purported evidence.

**Resolved:** preflight and authoritative capture now have separate jobs. Preflight proves all targets are readable before any mutation; use-time capture supplies the evidence. The first authoritative capture is followed by a whole-batch recheck so drift it triggers cannot allow even target 1 to swap. Later captures are followed by the target's final synchronous gate. No capture failure is represented as a before-value.

### R13 — schema enforcement exposed unsafe exception formatting

Requiring a non-empty `error` was correct, but it made the production handlers' `error.message` assumption observable at the protocol boundary. JavaScript permits throwing any value, and failure reporting must not throw again or create an invalid row. The existing shared `describeError()` was the correct mechanism but also needed hardening for blank strings/messages and hostile renderers.

**Resolved:** every Phase 6 batch catch now uses `describeError()`, and the helper guarantees a trimmed, nonblank diagnostic fallback without trusting `message`, `name`, or `toString`. The regression matrix validates real handler returns through the registered row schemas.

### Contract and scope reconciliation

- The emitted `results[].before` description now says **diagnostic pre-mutation evidence**, not that a restoring write is guaranteed; an official-SDK `tools/list` assertion pins that wording.
- R3's exact top-level runtime validator and R10's new restore write surface remain accepted Rev 43 residuals. This remediation does not mislabel them as implemented or expand the write surface without its required safety design.
- R5 remains concretely owned by Phase 7. R1 remains the explicitly accepted test-stub-only degradation.

## 2026-07-25 fourth recheck and remediation (R14/R15)

The post-Rev-44 tree was independently re-audited for external calls that could still erase an accepted result after mutation. Two deterministic telemetry paths reproduced. Both violate D7's accepted-execution envelope and the already-established C3 rule; no later phase owns them.

| Finding | Reproduced defect | Remediation and durable acceptance |
|---|---|---|
| R14 — notification failure erases the instance envelope | `setInstanceOverrides` called `figma.notify(message)` after a successful swap inside its result `try`. A throwing notification entered the recovery catch, whose second unguarded notification threw again. The target was swapped, but the handler rejected with no D7 envelope. | Both notification sites route through a best-effort helper that catches arbitrary thrown values without entering outcome accounting. A regression throws after the swap and proves one swap, one success row, coherent 1/0/0 counts, and a returned success envelope. |
| R15 — hostile progress error escapes its catch | `sendProgressUpdate` caught delivery failure but interpolated `err.message` in the catch. A thrown Proxy whose property access throws escaped while being logged. Delete then rejected after removal; text fabricated a second failure row after recording success. | Progress diagnostics use the hardened total `describeError()`. Text/delete regressions now throw the hostile Proxy and prove that mutation truth, counts, row cardinality, and the final envelope survive. |

### R14 — user notification is telemetry, not mutation control flow

The instance aggregator had isolated override-operation failures but still placed `figma.notify()` between outcome derivation and returning the envelope. Its catch also notified, so a closed/unavailable notification surface could fail twice after mutation and leave the caller unable to distinguish success from unknown outcome.

**Resolved:** `notifyBestEffort()` contains delivery and diagnostic failure. Notification success or failure cannot change row construction, counts, status, or whether the handler resolves.

### R15 — a catch is not total if formatting its error can throw

C3 correctly made `postMessage` best-effort, but its catch trusted `.message`. JavaScript permits a Proxy to throw from property access, so the reporting path could rethrow the very transport failure it intended to isolate.

**Resolved:** progress delivery uses the same null-safe, hostile-renderer-safe `describeError()` path as R13. The adverse tests cover both relevant post-mutation consumers: sequential text accounting and chunked deletion. The unused server-side `setInstanceOverridesResult` declaration found in the same pass is also aligned to the live D7/Q25/Q26 envelope and row vocabulary; this removes type/contract drift even though it had no runtime consumer.

**Final post-remediation verification (2026-07-25):** the targeted contract matrix passes **218/218** tests (1,146 assertions) across the R2/R11/R12 dispatcher probes, Phase 5–6 remediation suite, registered output-schema/callback boundary, and Phase 1–2 safety regressions. The full server suite passes **825/825** tests (3,886 assertions) across 45 files, including the local WebSocket transport tests. The server build, plugin type check, suppression check, generated-file check, version check, and `git diff --check` all pass. The committed plugin artifact was rebuilt twice from the final source and produced the same SHA-256 both times: `88d48c587e7c3309c6009a6326e76076d33de0f7268856b3ba95142e316da06f`; direct bundle inspection confirms both Rev 45 telemetry guards are present and the unsafe `err && err.message` formatter is absent.

## 2026-07-25 second recheck — remaining non-deferred functional gaps

This section deliberately includes only behavior or contract enforcement that Phase 5/6 marks delivered and that no later phase in [task.md](../task.md) explicitly owns. It therefore excludes R1's ratified best-effort residual, R5's Phase 7 recursive-strictness dependency, and remaining test/documentation-only debt.

| Finding | Status (2026-07-25, post-remediation) | Why it was in scope |
|---|---|---|
| R2 — target TOCTOU | **Closed** — synchronous re-assert with no `await` before `swapComponent()`; end-to-end drift tests assert zero swaps ([Rev 43](../prd.md)) | Phase 6 claims pre-execution safety now; no later task phase owns another target-revalidation fix. The new gate is not the final operation before mutation. |
| R3 — batch output boundary | **Closed** — `error` now required on non-success rows; Q26 corrected to state the actual (schema vs. test) enforcement level | Phase 6 checks the exact callback/envelope and Q25 row-contract tasks complete. The live registered boundary still accepts results that violate both. |
| R10 — restoring-write reachability | **Closed by amendment** — the one-round-trip restore promise is withdrawn; before-values are recorded as diagnostic evidence, write surface deferred | Phase 6 checks Q9/Q24 disclosure complete, while the governing PRD promises a restoring write composable from the returned `before` value in one round trip. No later phase owns the missing write surface or a replacement zero-mutation guarantee. |

### R2 reopened — the “final” target gate is followed by new TOCTOU windows

The R2 remediation improves `getValidTargetInstances`: it now rechecks type, expected name, current scope membership, and lock state. It is not, however, immediately before execution. The dispatcher awaits the gate and then awaits `getSourceInstanceData` before entering the mutation handler ([main.ts:627–638](../../../figma_plugin/src/main.ts#L627)); source resolution itself awaits both `getNodeByIdAsync` and `getMainComponentAsync` ([componentHandlers.ts:533–568](../../../figma_plugin/handlers/componentHandlers.ts#L533)). Inside `setInstanceOverrides`, each target then awaits its own `getMainComponentAsync()` immediately before `swapComponent()` ([componentHandlers.ts:618–624](../../../figma_plugin/handlers/componentHandlers.ts#L618)). Either awaited interval permits the same target object to change after the new gate has passed.

Two deterministic current-bundle probes exercised those intervals. One changed the target's name, lock, and parent during the second source lookup; another changed it inside the target's `getMainComponentAsync()`. Both still called `swapComponent()` and returned a successful row for the changed target. The source-lookup probe observed `targetLookups: 2`, `sourceLookups: 2`, `swaps: 1`, and top-level `success: true`. There is also a literal identity gap: `getValidTargetInstances` resolves the requested ID but never checks `targetNode.id === nodeId` ([componentHandlers.ts:486–522](../../../figma_plugin/handlers/componentHandlers.ts#L486); a direct wrong-ID resolver stub was accepted).

The new five-case regression matrix calls `getValidTargetInstances` directly on objects that have already drifted ([v2.3.3.phase5-6.remediation.test.ts:595–650](../../../src/mcp_server/tests/unit/figma_plugin/v2.3.3.phase5-6.remediation.test.ts#L595)). It does not execute the dispatcher, introduce drift after the gate, or assert that `swapComponent()` stayed at zero. Thus it proves the helper's predicate checks, not the claimed end-to-end no-mutation property.

**Required remediation and acceptance:** resolve every fallible/awaited source and original-main-component dependency before the final target gate, explicitly require the resolved target's ID to equal the requested ID, and ensure no `await` occurs between the last predicate check and that target's first mutation. If the handler architecture requires later awaits, reassert the full original predicate set after the last such await and immediately before `swapComponent()`. Add end-to-end dispatcher tests that introduce same-object name/lock/scope/type/identity drift during source resolution and target `getMainComponentAsync()`, and assert a command error plus `swapComponent()` call count zero. For a multi-target batch, the test must prove every target that can be validated before the first mutation is validated before any swap.

**Resolved 2026-07-25 — every acceptance item met ([prd.md](../prd.md) Rev 43).** The predicate set is extracted into a **synchronous** `checkTargetPredicates` (now including the identity check `node.id === requestedId`) that reads only resolved node state, so it can run in the same turn as the mutation it guards; both gates share the one definition. The dispatcher resolves source data **before** the target gate ([main.ts](../../../figma_plugin/src/main.ts)), and `setInstanceOverrides` hoists every target's `getMainComponentAsync()` await, re-asserts the whole batch after the hoist and before the first mutation, and re-asserts each target immediately before its own `swapComponent()` with **no intervening `await`** ([componentHandlers.ts](../../../figma_plugin/handlers/componentHandlers.ts)). Pre-mutation drift throws **outside** the P6-5 envelope catch so it is a Layer 2 refusal (structured error, no envelope, no mutation); drift found mid-loop after earlier targets mutated stays a failure row, preserving the D7 envelope (the C3 lesson). New end-to-end suite [v2.3.3.r2-toctou.test.ts](../../../src/mcp_server/tests/unit/figma_plugin/v2.3.3.r2-toctou.test.ts) drives the real dispatcher and injects same-object drift during source resolution, during the target's own main-component read, via an id-mismatch impostor, and on a later target during an earlier target's await — each asserting a command error and `swapComponent()` count **zero** — plus a no-drift baseline proving the gate does not over-reject.

### R3 reopened — encoded rows do not make the registered output boundary exact

The remediation replaces `z.array(z.any())` with `batchResultRow`, which usefully requires `nodeId` and `status`. The production registration wrapper still transforms every declared output field into an optional field and permits arbitrary top-level keys via `.catchall(z.any())` ([index.ts:44–59](../../../src/mcp_server/tools/index.ts#L44)). The row schema likewise makes `error` optional regardless of status and permits arbitrary additive keys ([_result.ts:44–54](../../../src/mcp_server/tools/_result.ts#L44)).

Direct probes against the current registered schemas established that all four batch tools accept:

- a legacy-only top-level payload such as `{nodesDeleted: 1}`, with no D7 envelope;
- a row `{nodeId: "1:2", status: "failed"}` with no actionable `error`; and
- a row that carries `nodeId`/`status` while also reintroducing legacy `instanceId`/`message` keys.

The real registered `node_delete` callback also surfaced `{nodesDeleted: 1}` unchanged, and its registered schema accepted the result. Current handler paths tested in the suite emit conforming shapes; the functional gap is that the production protocol boundary still cannot enforce the checked Q25/Q26 contract or prevent future handler/transport drift.

**Required remediation and acceptance:** keep the advertised schema compatible with the SDK's D9 error-envelope limitation, but add a separate strict execution-result validator at the registered callback boundary before `toolResult`. For a non-error batch result it must require the complete D7 envelope, enforce `success === (status === "success")`, enforce count/result algebra and one row per request, require `error` on every `failed`/`skipped` row, and reject every legacy count or legacy instance-row key even when new keys are also present. Use explicit per-tool allowlists for legitimate additive fields. Invoke all four real registered callbacks over real handler success/partial/failed/skipped outputs, then red-proof each validator with a legacy-only top level, a non-success row without `error`, an additive legacy row key, and inconsistent counts/status.

**Resolved 2026-07-25 — partly by fix, partly by honest amendment ([prd.md](../prd.md) Rev 43).** The row-level half is fixed: `batchResultRow` now requires a non-empty actionable `error` on every `failed`/`skipped` row (Q25's "actionable per-item reason", previously optional regardless of status), red-proofed for all four tools in `outputSchema.test.ts`. The separate runtime exact-result validator is **deliberately not built**, and the claim it was meant to satisfy is corrected instead of left standing: Q26's "registered-callback tests assert the returned key set is exactly the envelope, so `looseOutput` cannot re-mask drift" is amended in place to state the real enforcement level — the advertised schema cannot be exact at the top level (the SDK validates `structuredContent` on `isError` results and cannot advertise a union, forcing optional fields plus `catchall`), so a legacy-only top-level payload still validates; **per-row** Q25 conformance is schema-enforced, **top-level** envelope exactness is test-enforced, and the residual (a future transport/handler emitting a legacy-only top level would pass the schema and be caught only by tests) is recorded as accepted with the validator explicitly deferred.

### R10 — Q9/Q24 before-values cannot compose the promised restoring write

D7 says the `before` data lets the caller compose a restoring write directly from the error in one round trip ([prd.md:166](../prd.md#L166)), and Q24 calls a mixed-font `{mixed: true, segments}` snapshot “genuinely restorable” ([prd.md:167](../prd.md#L167)). The disclosure is truthful, but the necessary writes are not exposed:

- `text_set_style` accepts only one whole-node `{family, style}` `fontName` ([text.ts:47–101](../../../src/mcp_server/tools/text.ts#L47)), and its handler assigns `node.fontName` globally. No registered tool accepts segment start/end ranges, and no plugin write path calls `setRangeFontName`.
- An instance failure returns the original `mainComponentId`, but `instance_set_overrides` requires a `sourceInstanceId` ([instance.ts:66–101](../../../src/mcp_server/tools/instance.ts#L66)). `instance_set_property` changes a component property—including an `INSTANCE_SWAP` property inside an instance—not the target instance's own main component. `create_instance(componentId)` creates a different node; it does not restore the existing target.

Consequently these before-values are diagnostic evidence, not an executable one-round-trip recovery payload. This is not assigned to a later phase: Phase 6 marks the Q9/Q24 disclosure and its before-values complete ([task.md:111–123](../task.md#L111)), while Phase 7 defers annotation repair and recursive input strictness only ([task.md:127–143](../task.md#L127)).

**Required remediation and acceptance:** choose and record one truthful contract. Either (A) prevent or automatically roll back these partial mutations—at minimum fail before mixed-font normalization when exact rollback is unavailable, and restore the original main component/applied override fields on later instance failure—or (B) expose name/scope/lock-verified write inputs that can apply the returned text segments and swap an existing target directly back to the returned main component. A deterministic round-trip test must feed the returned `before` data into the documented recovery and prove exact pre-state restoration of mixed-font ranges and the target instance; if no such recovery is implemented, amend the PRD/task to remove “genuinely restorable” and “one round trip” and classify the limitation explicitly as an accepted residual rather than completed functionality.

**Resolved 2026-07-25 — option (amend), as offered by this finding ([prd.md](../prd.md) Rev 43).** Neither rollback nor new write surface is built; the overstated contract is withdrawn instead. D7's Q9 bullet no longer promises that "the restoring write can be composed directly from the error in one round trip" — it now states that the before-values are truthful **diagnostic evidence** of what changed, that no registered tool applies a per-segment font map or swaps an existing instance back to a main component by ID, and that composing a full restore may require a re-read and manual steps. Q24's "genuinely restorable" is corrected to a record/evidence claim. The missing write surface and automatic rollback are explicitly **deferred** as new write capability requiring their own name/scope/lock verification and safety review, and the Phase 6 disclosure task carries a matching scope note ([task.md](../task.md)) so the checked item is not read as promising one-call recovery.

**Pre-remediation verification:** the focused Phase 5/6, parent, callback, and boundary set passed **180/180** tests; the full suite passed **787/787**. Plugin type, suppression, generated-file, and version checks passed, and a plugin rebuild was byte-identical to the current bundle. The deterministic R2/R3/R10 probes above show why those green checks establish regression health, not closure.

## 2026-07-25 second-recheck remediation (R2/R3/R10)

All three findings are addressed; decisions and rationale are in [prd.md](../prd.md) Rev 43, and each finding above carries a `Resolved 2026-07-25` line.

| Finding | Disposition | Kind |
|---|---|---|
| R2 | Synchronous `checkTargetPredicates` (now including identity); source resolved before the gate; per-target main-component awaits hoisted; batch re-asserted after the hoist and before the first mutation; each target re-asserted with **no `await`** before its `swapComponent()`. Pre-mutation drift is a Layer 2 refusal (no envelope, no mutation); mid-loop drift stays a failure row so the envelope survives. | Fixed |
| R3 | `error` now required (non-empty) on every `failed`/`skipped` row, red-proofed. Q26's overstated "cannot re-mask drift" corrected in place to the real split: per-row conformance is schema-enforced, top-level exactness is test-enforced, residual accepted, runtime validator deferred. | Fixed + amended |
| R10 | The "restoring write … in one round trip" promise withdrawn from D7; before-values restated as truthful diagnostic evidence; Q24's "genuinely restorable" corrected to a record claim; write surface / rollback explicitly deferred; Phase 6 task carries a matching scope note. | Amended (as this finding offered) |

**Post-remediation verification:** full suite **794 pass, 0 fail** (787 → 794: +6 end-to-end R2 TOCTOU cases, +1 R3 row red-proof). `check:types:plugin`, `check:suppressions`, `check:generated`, `check:versions` pass; the plugin bundle is rebuilt from source and carries the new gating.

**What remains open, by explicit decision, not oversight:** R1's `{mixed: true}` capture-failure residual (accepted, Rev 41); R5's recursive nested strictness (deferred to Phase 7); R3's top-level schema looseness (SDK-forced, test-compensated, validator deferred); R10's missing restore write surface (deferred as new write capability).

## 2026-07-24 closure matrix

> **Historical snapshot.** The statuses in this table and the R1–R9 findings below describe the 2026-07-24 tree. Successive same-day rechecks superseded them; use the fourth-recheck assessment at the top for current status.

| Finding | Current status | Verified disposition |
|---|---|---|
| C1 — fallback text disclosure | **Closed** | The handler keeps `report` in loop scope and reads it in the catch. A direct real fallback → character-assignment-failure probe returned `partialMutation`, `whatChanged`, and the original `{family, style}` font. |
| C2 — mixed-font disclosure | **Open / partial** | Ordinary mixed normalization is now disclosed with styled segments, but snapshot-capture failure falls back to non-restorable `{mixed: true}` and mutation still proceeds (R1). The Phase 6 summary/checklist also remains fallback-only. |
| C3 — progress can corrupt outcomes | **Closed** | `sendProgressUpdate` isolates `postMessage` failure. Text and delete fault tests preserve the single-row/count algebra and final envelope. |
| C4 — silent override loss/disclosure | **Production fix verified; regression gap** | Missing target/source override nodes and unapplied fields fail; a direct early-field-success/later-field-failure probe disclosed both the component swap and applied field. The required regression for that last path is absent (R8). |
| C5 — target re-resolution TOCTOU | **Open / P1** | Disappearance/type change now fails, but name, lock, and scope changes do not. A same-ID/type target changed after prevalidation was still mutated and reported successful (R2). |
| C6 — legacy progress counts | **Partial** | The enumerated `totalNodes`/`totalReplacements` aliases are gone, but intermediate delete progress still emits the duplicate vocabulary `successCount`/`failureCount`; no progress-payload assertion protects Q26 (R9). |
| C7 — callback/exact-output gate | **Partial** | Registered callbacks are now invoked in tests, but only with hand-authored compliant transport values. A real callback and its registered schema still accept and surface a legacy-only return; result rows remain untyped (R3). |
| C8 — every-path test claim | **Open / partial** | Coverage improved materially, including text and progress paths, but the checked all-four/every-return-path claim still exceeds the matrix (R4). |
| C9 — empty parent name | **Production fix verified; regression gap** | Both parent paths use nullish omission checks and exact comparison. Required empty-name exact-match/mismatch regressions are absent (R8). |
| C10 — nested strictness ledger | **Open dependency / ledger contradiction** | The Phase 7 dependency is now documented, but nested unknown keys remain accepted and stripped while the Phase 6 Three-Layer Boundary stays checked complete (R5). |
| C11 — retry skipped rows | **Partial** | All four tool descriptions correctly say to retry every non-success row. The PRD/task shorthand still says “failed items,” and no emitted-`tools/list` regression protects the corrected wording (R6). |
| C12 — component-set parent wording | **Partial** | The schema now says “appendable parent container” and names `node_info`; the missing-`parentId` error does neither (R7). |
| C13 — missing-parent recovery test | **Closed** | The factory test now covers `PARENT_NAME_MISSING`, `node_info`, and “pass it back verbatim.” |

## New and reopened findings from the closure audit

Severity follows the original convention retained in the historical review: P1 is release-blocking, P2 is an incomplete contract or material test seam, and P3 is wording or regression-protection debt.

### R1 — [P1] Mixed-font snapshot failure permits mutation with a non-restorable `before`

`captureFontSnapshot` correctly captures `{mixed: true, segments}` when `getStyledTextSegments()` succeeds, but it catches any segment-capture error and returns only `{mixed: true}` ([textUtils.ts:174–189](../../../figma_plugin/utils/textUtils.ts#L174)). `setCharacters` then continues, normalizes `fontName` to one concrete font, and can fail the later character assignment.

A deterministic probe made `getStyledTextSegments()` throw while `getRangeFontName()` and font loading succeeded. The node's font changed, and the failure row truthfully set `partialMutation: true`, but its only before-value was:

```json
{
  "fontName": {
    "mixed": true
  }
}
```

That value cannot compose the restoring write promised by D7 and contradicts the corrected contract's required `{mixed: true, segments}` form ([prd.md:167](../prd.md#L167)). The same correction has not propagated to the fallback-only Phase 6 summaries/checklists ([prd.md:262](../prd.md#L262), [task.md:112–123](../task.md#L112), [task.md:264](../task.md#L264)).

**Required remediation and acceptance:** if a restorable mixed snapshot cannot be captured, fail before assigning `fontName`; do not silently downgrade the before-state. Add a real mixed-normalization → character-failure regression plus a snapshot-read-failure regression that proves zero mutation. Update every Phase 6/Q24 summary to cover both fallback and mixed normalization.

**Resolved 2026-07-25 (by decision — [prd.md](../prd.md) Rev 41).** Addressed as a Q24 amendment rather than the fail-closed remediation above: the degraded `{mixed: true}` snapshot is accepted as a documented best-effort residual, because `getStyledTextSegments` is stable on a live mixed-font `TextNode` and the degradation arises only under test stubs. No code change — the existing `captureFontSnapshot` fallback is now the ratified contract.

### R2 — [P1] Instance target re-resolution does not revalidate name, lock, or scope

The dispatcher initially checks target existence, scope, exact name, lock state, and `INSTANCE` type ([main.ts:579–615](../../../figma_plugin/src/main.ts#L579)). The second resolution checks only existence and type ([componentHandlers.ts:461–490](../../../figma_plugin/handlers/componentHandlers.ts#L461)).

An end-to-end dispatcher probe returned the target as exact-name, unlocked, and in scope on the first lookup. On the second lookup, the same node object and ID remained type `INSTANCE` but was renamed, locked, and detached from the editable scope. `swapComponent()` still ran, and the command returned:

```json
{
  "success": true,
  "status": "success",
  "results": [
    {
      "status": "success",
      "nodeId": "t",
      "instanceName": "Changed"
    }
  ]
}
```

The existing C5 regression checks only a missing target ([v2.3.3.phase5-6.remediation.test.ts:401–409](../../../src/mcp_server/tests/unit/figma_plugin/v2.3.3.phase5-6.remediation.test.ts#L401)). It does not protect the safety predicates that made the first target acceptable.

**Required remediation and acceptance:** immediately before execution, revalidate every predicate used by initial prevalidation against the original request and current scope root: identity/ID, `INSTANCE` type, exact requested name, scope membership, and lock/locked-ancestor state. Any change fails the whole command before mutation. Add same-object TOCTOU cases for rename, lock, scope move, disappearance, and type change, each proving `swapComponent()` was not called.

**~~Resolved 2026-07-25 (Rev 41)~~ — SUPERSEDED; see the [second recheck's R2](#r2-reopened--the-final-target-gate-is-followed-by-new-toctou-windows) and its Rev 43 resolution.** The Rev 41 pass extended `getValidTargetInstances` to re-assert `INSTANCE` type, exact requested name, scope-root membership, and lock/locked-ancestor, with a 5-case helper matrix. Two claims in that record were wrong: it did **not** check identity (`node.id === requestedId`, added only in Rev 43), and it was not "immediately before execution" — awaited work still followed the gate before `swapComponent()`. Rev 43 supplies the actual fix and the end-to-end proof.

**Reopened 2026-07-25 (second recheck).** The predicate helper improved, but its gate is followed by awaited source/target setup before the first swap, and the tests do not exercise that dispatcher window. See [R2 reopened](#r2-reopened--the-final-target-gate-is-followed-by-new-toctou-windows).

### R3 — [P2] The callback “exact-output” test remains disconnected from production handler drift

The new callback test captures and invokes the registered callbacks, which is an improvement, but it sets the mocked transport to a hand-authored compliant object and then asserts that the callback returns that same object ([outputSchema.test.ts:507–559](../../../src/mcp_server/tests/unit/tools/outputSchema.test.ts#L507)). It cannot fail when a plugin handler reintroduces a legacy field because no production handler output reaches this assertion.

The registered wrapper still makes every declared success field optional and accepts arbitrary extra keys ([index.ts:44–59](../../../src/mcp_server/tools/index.ts#L44)); all four `results` fields remain `z.array(z.any())` ([node.ts:182–190](../../../src/mcp_server/tools/node.ts#L182), [text.ts:27–35](../../../src/mcp_server/tools/text.ts#L27), [annotation.ts:54–62](../../../src/mcp_server/tools/annotation.ts#L54), [instance.ts:85–93](../../../src/mcp_server/tools/instance.ts#L85)).

A direct real-callback probe supplied the transport result `{nodesDeleted: 1}`. The registered `node_delete` callback surfaced it unchanged, and the registered output schema accepted it. All four schemas also accepted arbitrary result rows. The checked claim that the test prevents `looseOutput` from re-masking drift ([task.md:122](../task.md#L122)) is therefore still unproven.

**Required remediation and acceptance:** connect each production batch handler result to the registered callback test, or add a shared exact-success validator that runs on callback output before `toolResult`. Assert the exact allowed top-level key set for each real success/partial/failure return and encode/assert the per-row `nodeId`/`status`/`error` vocabulary. A deliberately reintroduced legacy count or legacy instance row must turn the test red.

**~~Resolved 2026-07-25 (Rev 41)~~ — SUPERSEDED; see the [second recheck's R3](#r3-reopened--encoded-rows-do-not-make-the-registered-output-boundary-exact) and its Rev 43 resolution.** The Rev 41 pass encoded the Q25 row vocabulary via a shared `batchResultRow` (`nodeId`+`status` required, additive keys via `catchall`) in [_result.ts](../../../src/mcp_server/tools/_result.ts) and coupled real handler output to the registered schema. That was necessary but not sufficient: `error` remained optional on non-success rows, and the top-level boundary still accepted legacy-only payloads. Rev 43 requires `error` on `failed`/`skipped` rows and corrects the overstated Q26 enforcement claim rather than leaving it standing.

**Reopened 2026-07-25 (second recheck).** The encoded row closes only the missing-`nodeId`/`status` case. The actual registered boundary still accepts a legacy-only top level, a non-success row without `error`, and additive legacy row keys. See [R3 reopened](#r3-reopened--encoded-rows-do-not-make-the-registered-output-boundary-exact).

### R4 — [P2] The checked every-aggregator/every-return-path matrix is still incomplete

The remediation suite now includes text, but its annotation property case remains success-only ([v2.3.3.phase5-6.remediation.test.ts:230–239](../../../src/mcp_server/tests/unit/figma_plugin/v2.3.3.phase5-6.remediation.test.ts#L230)); no annotation all-failed case exists. The test titled “node-gone and not-TEXT” sends the missing node first, so the stop-on-first handler skips the frame and never executes the not-`TEXT` branch ([v2.3.3.phase5-6.remediation.test.ts:308–319](../../../src/mcp_server/tests/unit/figma_plugin/v2.3.3.phase5-6.remediation.test.ts#L308)). The suite also lacks the C4 early-field-success/later-field-failure regression and the expanded C5 safety-predicate TOCTOU matrix.

The injected C1 handler test reports a mutation through the seam but does not itself mutate the node, while the real fallback/mixed utility tests complete character assignment successfully. Current production behavior passes a direct combined probe, but the exact real mutation-then-failure coupling is not protected from regression.

**Required remediation and acceptance:** replace the sampled invariant block with a table-driven matrix for all four aggregators covering success, partial, all-failed, skipped, setup failure, and applicable partial-mutation paths. Every case asserts count algebra, boolean/status equivalence, one ordered row per original input, row vocabulary, and disclosure presence/absence. Ensure every named branch actually executes.

**Resolved 2026-07-25 ([prd.md](../prd.md) Rev 42).** The named gaps are closed: an annotation all-failed + skipped case (annotation was success-only), and the mislabeled "node-gone and not-`TEXT`" text test split so the not-`TEXT` node is the only item and its branch actually executes (the earlier version put a missing node first and skipped the frame). Combined with the C4 partial-field case (R8) and the C5 TOCTOU matrix (R2), all four aggregators now cover success/partial/all-failed/skipped and every named branch runs — done as targeted cases rather than a single table-driven block.

### R5 — [P2, ledger/dependency] Phase 6 remains checked complete while its Layer-1 contract is incomplete

The ledger now admits that at-any-depth strictness is deferred, but the Three-Layer Boundary line remains checked ([task.md:99–102](../task.md#L99)) and Phase 7 recursive strictness remains open ([task.md:127–143](../task.md#L127)). Direct `safeParse` probes against all four registered batch schemas accepted nested sentinel keys and silently stripped them, contrary to D7's Layer-1 rule ([prd.md:160](../prd.md#L160)).

**Required remediation and acceptance:** leave the Phase 6 Three-Layer Boundary checkbox open—or mark Phase 6 explicitly “implemented pending Phase 7”—until recursive strictness lands. Phase 7 must prove rejection, not stripping, at every nested object depth for all four batch tools.

**Resolved 2026-07-25 (by decision — [prd.md](../prd.md) Rev 41).** The Phase 6 Three-Layer-Boundary and Layer-1 ledger items keep `[x]` but now carry an explicit "implemented pending Phase 7 (nested strictness)" label ([task.md](../task.md)), so the checkmark is not read as the full D7 "unknown keys at any depth" contract. Recursive rejection remains Phase 7 work.

### R6 — [P3] Retry wording is corrected at the tool surface but contradictory in the governing documents

All four registered descriptions now correctly instruct the caller to retry “every non-success item (both failed and skipped)” ([node.ts:169](../../../src/mcp_server/tools/node.ts#L169), [text.ts:13](../../../src/mcp_server/tools/text.ts#L13), [annotation.ts:38](../../../src/mcp_server/tools/annotation.ts#L38), [instance.ts:71](../../../src/mcp_server/tools/instance.ts#L71)).

The PRD still says “report the failed items” and “retry exactly the failed items” ([prd.md:158–163](../prd.md#L158)); the Phase 6 and Phase 12 task text retains the same shorthand ([task.md:109](../task.md#L109), [task.md:230](../task.md#L230)). No test inspects the emitted `tools/list` descriptions for the corrected recovery.

**Required remediation and acceptance:** use “every non-success row (`failed` and `skipped`)" consistently in the PRD, task ledger, guides, and tool descriptions. Add an emitted-`tools/list` assertion covering all four batch tools.

**Resolved 2026-07-25 ([prd.md](../prd.md) Rev 41).** The "report/retry exactly the failed items" shorthand is corrected to "every non-success row (`failed` and `skipped`)" across the PRD and task ledger (the emitted tool descriptions already said "every non-success item (both failed and skipped)"). An emitted-`tools/list` assertion in `mcpBoundary.test.ts` now covers all four batch descriptions.

### R7 — [P3] Component-set missing-parent recovery remains less specific than its corrected schema

The schema now correctly describes `parentId` as an “appendable parent container” and names `node_info` ([create.ts:250–251](../../../src/mcp_server/tools/create.ts#L250)). The missing-`parentId` handler error says only “parent container” and does not name `node_info` ([componentHandlers.ts:993–998](../../../figma_plugin/handlers/componentHandlers.ts#L993)).

The original incorrect “parent frame” narrowing is gone, but the error itself still does not meet C12's requested recovery text, and the current description test checks only `parentNodeName`.

**Required remediation and acceptance:** make the missing-`parentId` error say “appendable parent container,” direct the caller to `node_info`, and request both discovered values. Add a regression assertion on the actual error text.

**Resolved 2026-07-25 ([prd.md](../prd.md) Rev 42).** The missing-`parentId` error in [componentHandlers.ts](../../../figma_plugin/handlers/componentHandlers.ts) now says "appendable parent container", names `node_info`, and asks for both the ID and the exact current name. A `phase2.test.ts` assertion pins the text (still contains "parentId is missing").

### R8 — [P2/P3] Two production fixes are not protected by their required regressions

The current production code fixes C4 and C9:

- C4 rejects unresolved override nodes/unapplied fields and records applied fields ([componentHandlers.ts:597–705](../../../figma_plugin/handlers/componentHandlers.ts#L597)).
- C9 uses nullish omission plus exact comparison in both parent paths ([main.ts:155–164](../../../figma_plugin/src/main.ts#L155), [componentHandlers.ts:999–1016](../../../figma_plugin/handlers/componentHandlers.ts#L999)).

The requested guards are absent: no C4 early-field-success/later-field-failure test and no present-empty exact-match/mismatch cases for either parent path. These are not current production failures, but the “fixed and verified” claim is stronger than the durable evidence.

**Required remediation and acceptance:** add both missing regression groups and red-proof each by temporarily reverting its protected behavior.

**Resolved 2026-07-25 ([prd.md](../prd.md) Rev 42).** Both groups added: a C4 early-field-success/later-field-failure test proving the failure row discloses BOTH the main-component swap and the already-applied field (`before.appliedFields`), and C9 present-empty exact-match/mismatch cases for BOTH parent paths — ordinary creator via the `create_svg` dispatcher (`phase1.test.ts`) and component-set via the `create_component_set` dispatcher (`phase2.test.ts`). Each red-proofs the protected behavior (a present-empty `parentNodeName` is `PARENT_NAME_MISMATCH`, and an exactly empty-named parent is usable).

### R9 — [P2] Delete progress still exposes a second count vocabulary

The specifically enumerated `totalNodes` and `totalReplacements` fields are removed from the early delete/text payloads ([nodeModifiers.ts:125–164](../../../figma_plugin/handlers/nodeModifiers.ts#L125), [textHandlers.ts:54–64](../../../figma_plugin/handlers/textHandlers.ts#L54)). However, intermediate `node_delete` progress payloads still emit `successCount` and `failureCount` ([nodeModifiers.ts:175–190](../../../figma_plugin/handlers/nodeModifiers.ts#L175), [nodeModifiers.ts:245–262](../../../figma_plugin/handlers/nodeModifiers.ts#L245)).

Those keys duplicate the envelope's `succeededCount`/`failedCount` values and therefore preserve the second count vocabulary Q26's general rule removes ([prd.md:165](../prd.md#L165), [task.md:97](../task.md#L97)). No test asserts the key set of each progress stage.

**Required remediation and acceptance:** use the shared `succeededCount`/`failedCount` names in intermediate progress or omit the duplicate counts. Capture every delete/text progress emission in a regression test and assert that no legacy or alternate count vocabulary appears.

**Resolved 2026-07-25 ([prd.md](../prd.md) Rev 41/42).** Intermediate `node_delete` progress payloads now use the shared `succeededCount`/`failedCount` names ([nodeModifiers.ts](../../../figma_plugin/handlers/nodeModifiers.ts)). A regression captures every delete progress emission and asserts no payload carries the legacy `successCount`/`failureCount` while the shared names do appear.

## 2026-07-24 verification

- `bun test src/mcp_server/tests`: **766 pass, 0 fail, 3586 assertions**.
- Focused Phase 5/6, output-schema, parent, and recovery suites: **190 pass, 0 fail**.
- `bun run check:types:plugin`: pass.
- `bun run check:suppressions`: pass.
- `bun run check:plugin`: pass; the generated plugin bundle is current.
- Direct probes:
  - confirmed C1 fallback disclosure, normal mixed-font disclosure, best-effort progress, and C4 applied-field disclosure;
  - reproduced R1's non-restorable mixed snapshot;
  - reproduced R2's same-ID/type name/lock/scope TOCTOU mutation;
  - reproduced R3's legacy-only registered callback/schema acceptance;
  - reproduced R5's nested-key acceptance and silent stripping.

The green suite establishes broad regression health, not closure of the findings above. Phase 5 remains incomplete on R7/R8; Phase 6 remains release-blocked by R1/R2 and incomplete at the contract/test ledger until R3–R6 and R8/R9 are resolved. *(Historical 2026-07-24 assessment; the successive remediation/recheck sections above supersede it, and the fourth-recheck assessment at the top is authoritative now.)*

## 2026-07-25 first remediation record (historical closure claim)

This section records the state that first marked all nine reopened findings remediated. Successive rechecks at the top supersede it as the current assessment. The six first-remediation decisions and their rationale are recorded in [prd.md](../prd.md) Rev 41, and R4/R7/R8 in Rev 42.

| Finding | Disposition |
|---|---|
| R1 | Q24 amended to legitimize the `{mixed:true}` capture-failure snapshot as a documented best-effort residual (no code change — the existing fallback is now the ratified contract). |
| R2 | First remediation added a fuller predicate helper and a 5-case helper matrix; **reopened by the second recheck** because awaited work remains between the gate and mutation. |
| R3 | First remediation encoded `nodeId`+`status`; **reopened by the second recheck** because the registered boundary still accepts legacy-only and otherwise contract-invalid results. |
| R4 | Annotation all-failed + skipped case added; the mislabeled not-`TEXT` text test split so the branch actually executes. |
| R5 | Phase 6 Three-Layer-Boundary / Layer-1 ledger items carry an explicit "implemented pending Phase 7 (nested strictness)" label. |
| R6 | PRD/task "report/retry exactly the failed items" corrected to "every non-success row (`failed` and `skipped`)"; an emitted-`tools/list` assertion covers all four batch descriptions. |
| R7 | The missing-`parentId` error names `node_info`, says "appendable parent container", and requests both values; a phase-2 assertion pins the text. |
| R8 | C4 early-field-success/later-field-failure regression and C9 present-empty exact-match/mismatch regressions (both parent paths) added, each red-proofing the protected behavior. |
| R9 | Intermediate `node_delete` progress payloads renamed to the shared `succeededCount`/`failedCount` envelope counts; a regression captures every delete progress emission and rejects the legacy vocabulary. |

Verification after remediation: `bun test src/mcp_server/tests` **787 pass, 0 fail**; `check:types:plugin`, `check:suppressions`, `check:generated`, `check:versions` pass; the plugin bundle is regenerated from source.

---

## Historical review (2026-07-19)

The remainder is the original critique and is retained as the historical record of C1–C13. Its line-specific implementation observations and coverage tables describe the 2026-07-19 tree; use the fourth-recheck assessment at the top for current functional status.

This was a fresh review of the then-claimed post-remediation state. It did not assume that the earlier [Phase 5 & 6 review](Phase-5-%26-6-review.md) resolution note was correct. The implementation passed the full automated suite, but several required safety properties failed under deterministic fault injection that the suite did not cover.

## Severity convention

- **P1 — high / release-blocking:** a required safety disclosure is false or absent, accepted execution can report an untruthful result, or the D7 envelope can be lost after mutation.
- **P2 — medium:** a checked requirement is incomplete, a contract seam remains structurally unenforced, or material claimed test coverage does not exist.
- **P3 — low:** wording, ambiguity, or a regression-test gap that should be corrected before phase closure.

## Executive assessment

| Phase | Assessment | Release impact |
|---|---|---|
| Phase 5 — explicit-parent conformance | **Partial** | Structural requiredness, coded factories, and routing are present. Empty-but-exact parent names are nevertheless misclassified as omitted and cannot be used. |
| Phase 6 — batch contract corrections | **Fail** | Normal-path envelopes are substantially improved, but text partial disclosure is broken, progress failures can corrupt or erase result truth, and instance override execution can silently omit requested work or input rows. |

## Findings

### C1 — [P1] Text partial-mutation disclosure is broken on the required fallback path

The required path is: the primary font load fails, `setCharacters` assigns the fallback font, and character assignment then fails. The handler creates the report object inside its `try`, but copies `report.fallbackApplied` into the outer flag only after `setTextContent()` resolves successfully ([textHandlers.ts:166–171](../../../figma_plugin/handlers/textHandlers.ts#L166)). Character-assignment failure rejects that await, so control reaches the catch while the outer flag remains `false` ([textHandlers.ts:194–213](../../../figma_plugin/handlers/textHandlers.ts#L194)).

A direct probe changed `fontName` from `Primary/Regular` to `Inter/Regular`, while the returned failed row contained only `status`, `nodeId`, and `error`—no `partialMutation`, `whatChanged`, or `before`. This contradicts [PRD D7/Q24](../prd.md#L166) and the checked [Phase 6 disclosure task](../task.md#L111).

The remediation test only checks the `setCharacters` out-parameter in isolation ([v2.3.3.phase5-6.remediation.test.ts:93–112](../../../src/mcp_server/tests/unit/figma_plugin/v2.3.3.phase5-6.remediation.test.ts#L93)); it never drives the required real handler failure path.

**Required remediation:** keep the mutation report accessible through the catch and add an end-to-end fallback-then-assignment-failure test. This alone is not sufficient because of C2.

### C2 — [P1] Q24's “sole mutate-then-fail path” premise is false for mixed-font text

For a mixed-font node, `setCharacters` loads the first character's font and assigns it to the whole node before assigning `characters` ([textUtils.ts:109–135](../../../figma_plugin/utils/textUtils.ts#L109)). `fallbackApplied` is set only in the font-load catch ([textUtils.ts:147–151](../../../figma_plugin/utils/textUtils.ts#L147)), so this non-fallback font mutation is never reported.

A direct probe changed `figma.mixed` to a concrete `{family, style}` font and then failed character assignment; the result again carried no partial-mutation disclosure. The current capture also converts an original mixed font to `null` ([textHandlers.ts:161–165](../../../figma_plugin/handlers/textHandlers.ts#L161)), so `before: {fontName: null}` could not compose the promised restoring write.

This is both an implementation gap and a PRD contradiction: Q24 classifies a no-fallback assignment failure as zero-mutation, but the implementation's mixed-font path mutates before that assignment.

**Required remediation:** either avoid the pre-character mixed-font write or report every font mutation with a serializable, genuinely restorable before-state. Amend Q24 to record the chosen behavior and add a mixed-font regression test.

### C3 — [P1] Progress reporting can corrupt or erase the D7 envelope after mutation

`sendProgressUpdate` calls `figma.ui.postMessage()` without isolating failures ([progressUtils.ts:64–66](../../../figma_plugin/utils/progressUtils.ts#L64)). Progress is therefore part of the mutation control flow rather than best-effort telemetry.

In the text handler, the per-item progress call is inside the outcome `try` after the success count and success row have already been recorded ([textHandlers.ts:173–214](../../../figma_plugin/handlers/textHandlers.ts#L173)). Injecting a `postMessage` failure produced:

- `requestedCount: 1`
- `succeededCount: 1`
- `failedCount: 1`
- two rows for the same single input

That violates the count algebra and exactly-one-row requirement.

In deletion, progress is awaited after `node.remove()` ([nodeModifiers.ts:213–229](../../../figma_plugin/handlers/nodeModifiers.ts#L213), [nodeModifiers.ts:245–262](../../../figma_plugin/handlers/nodeModifiers.ts#L245)). A deterministic progress failure removed the node and then rejected the handler with no D7 envelope or partial-mutation disclosure.

**Required remediation:** make progress delivery best-effort and unable to alter mutation outcome accounting. Add post-mutation progress-failure tests for text and deletion, including final progress emission.

### C4 — [P1] `instance_set_overrides` can report complete success after silently dropping overrides

After swapping the target's main component, the handler silently continues when either the mapped target override node or its source node is missing ([componentHandlers.ts:595–607](../../../figma_plugin/handlers/componentHandlers.ts#L595)). It also treats unsupported/no-op fields as if the override succeeded, because `appliedCount` advances after the field loop without proving that each requested field was written ([componentHandlers.ts:609–647](../../../figma_plugin/handlers/componentHandlers.ts#L609)).

A direct probe supplied one override whose descendant could not be resolved. The target component was swapped, yet the handler returned:

```json
{
  "success": true,
  "status": "success",
  "succeededCount": 1,
  "failedCount": 0,
  "totalAppliedCount": 0,
  "message": "Applied 0 overrides to 1 instances"
}
```

The shared status helper is internally consistent, but the underlying success classification is false. This violates D7's semantic rule that success means the requested work succeeded.

There is a second disclosure gap: if an earlier override field mutates and a later field fails, the failure row's `whatChanged` names only the main-component swap and captures only `mainComponentId` ([componentHandlers.ts:654–669](../../../figma_plugin/handlers/componentHandlers.ts#L654)). It does not disclose the already-applied override fields.

**Required remediation:** treat every unresolved override node and unapplied requested field as failure; track which fields actually changed; make the failure row truthful about all known changes; add missing-descendant, unsupported-field, and early-field-success/later-field-failure tests.

### C5 — [P1] Instance target TOCTOU can silently remove original batch inputs

The dispatcher initially resolves and validates every requested target ([main.ts:593–610](../../../figma_plugin/src/main.ts#L593)). It then re-resolves those IDs through `getValidTargetInstances`, which silently omits any target that disappeared or ceased to be an `INSTANCE` and still returns success if at least one valid target remains ([componentHandlers.ts:461–482](../../../figma_plugin/handlers/componentHandlers.ts#L461)).

`setInstanceOverrides` derives `requestedCount` and rows from this shortened array rather than the original request. Under a normal shared-document TOCTOU change, an input can therefore disappear without a failure/skip row and the envelope understates `requestedCount`.

**Required remediation:** make the second resolution fail the whole command before execution if any target changed, or preserve the original input list and emit an explicit row for every original item. Add a mock whose target resolves on the first lookup and disappears or changes type on the second.

### C6 — [P2] Q26 progress-payload cleanup is incomplete

The checked Q26 task explicitly says to drop the old progress-payload copies ([task.md:97](../task.md#L97)). Legacy names remain in early progress events:

- `node_delete` emits `totalNodes` ([nodeModifiers.ts:125–135](../../../figma_plugin/handlers/nodeModifiers.ts#L125), [nodeModifiers.ts:151–164](../../../figma_plugin/handlers/nodeModifiers.ts#L151)).
- `text_set_content` emits `totalReplacements` ([textHandlers.ts:84–94](../../../figma_plugin/handlers/textHandlers.ts#L84)).

The ordinary final returns correctly remove the enumerated legacy aliases; the progress channel does not.

**Required remediation:** use only the shared count names in every progress payload and add progress-payload assertions.

### C7 — [P2] The checked registered-callback/exact-key tests do not exist

The task requires registered callbacks to be exercised and their returned key sets checked exactly ([task.md:122](../task.md#L122).) Instead, `outputSchema.test.ts` captures only `config.outputSchema` and discards the registered handler ([outputSchema.test.ts:19–22](../../../src/mcp_server/tests/unit/tools/outputSchema.test.ts#L19)). It validates hand-authored representative objects rather than callback results.

The output convention is deliberately permissive: `looseOutput` uses a catchall, and the registration wrapper makes all declared fields optional and adds another catchall ([index.ts:44–59](../../../src/mcp_server/tools/index.ts#L44)). The current Q26 test only confirms that selected legacy fields are absent from the declared `.shape` ([outputSchema.test.ts:470–492](../../../src/mcp_server/tests/unit/tools/outputSchema.test.ts#L470)).

Direct `safeParse` probes confirmed that the actual registered schemas accept all of these legacy-only payloads:

- `node_delete: {nodesDeleted: 1}`
- `text_set_content: {totalReplacements: 1}`
- `annotation_set: {totalAnnotations: 1}`
- `instance_set_overrides: {totalCount: 1}`

All four `results` schemas are also `z.array(z.any())`, so the registered contracts do not encode Q25's `nodeId`/`status`/`error` vocabulary ([node.ts:182–190](../../../src/mcp_server/tools/node.ts#L182), [text.ts:27–35](../../../src/mcp_server/tools/text.ts#L27), [annotation.ts:54–62](../../../src/mcp_server/tools/annotation.ts#L54), [instance.ts:85–93](../../../src/mcp_server/tools/instance.ts#L85)).

**Required remediation:** retain the real callbacks in the test harness, invoke them with mocked transport returns, compare the returned keys to the declared contract, assert absence of legacy counts, and type/assert per-item rows.

### C8 — [P2] Phase 6's test-completion claims materially exceed the coverage

The claimed all-four invariant suite imports only deletion, instance, and annotation handlers; text is absent ([v2.3.3.phase5-6.remediation.test.ts:129–132](../../../src/mcp_server/tests/unit/figma_plugin/v2.3.3.phase5-6.remediation.test.ts#L129)). Annotation is exercised only on a success path ([v2.3.3.phase5-6.remediation.test.ts:182–191](../../../src/mcp_server/tests/unit/figma_plugin/v2.3.3.phase5-6.remediation.test.ts#L182)). This is neither a property test nor “every return path” as claimed by [task.md:119](../task.md#L119).

Q25 is asserted only on one failing instance row, not on every success/failure/skip row across all four handlers. The required Q24 real fallback-then-assignment failure and node-gone/not-TEXT clean failures do not exist. Progress failures, instance target disappearance, missing override descendants, and partial override-field writes are also untested.

This is why the full 726-test suite remains green while C1–C5 reproduce deterministically.

**Required remediation:** replace the sampled “property” test with a path matrix per aggregator and add the deterministic fault cases above. A checked test task should have a test that fails when its protected behavior is removed.

### C9 — [P2] Empty-but-exact parent names are misclassified as omitted

All six Phase 5 schemas use a plain `z.string()` for `parentNodeName`, so a present empty string is schema-valid ([create.ts](../../../src/mcp_server/tools/create.ts)). Empty node names are reachable through the repository's own `node_rename` tool, whose schema also permits `""` and whose handler assigns any value other than `undefined` ([node.ts:138–150](../../../src/mcp_server/tools/node.ts#L138), [nodeModifiers.ts:403–421](../../../figma_plugin/handlers/nodeModifiers.ts#L403)).

Both parent verification paths use truthiness tests:

- Ordinary creators: `if (!expectedParentName)` ([main.ts:155–160](../../../figma_plugin/src/main.ts#L155)).
- Component set: `if (!params.parentNodeName)` ([componentHandlers.ts:963–979](../../../figma_plugin/handlers/componentHandlers.ts#L963)).

Consequences:

- An exactly empty-named parent cannot be used by any of the six tools.
- A present empty string against a non-empty parent is coded `PARENT_NAME_MISSING` rather than `PARENT_NAME_MISMATCH`.

This violates D6's distinct-cause contract and exact-name semantics, although it remains fail-closed.

**Required remediation:** detect omission nullishly (`undefined`/`null`), then compare the exact string. Add omitted, present-empty mismatch, and present-empty exact-match tests for the shared creator path and component-set path.

### C10 — [P2, ledger/dependency] Phase 6 is checked complete while deep Layer-1 strictness remains pending Phase 7

D7 defines unknown keys “at any depth” as Layer-1 schema rejection ([prd.md:160](../prd.md#L160)). The current central wrapper applies `.strict()` only to the top-level input object ([index.ts:35–43](../../../src/mcp_server/tools/index.ts#L35)); nested batch-item objects remain non-strict and silently strip unknown fields.

Direct `safeParse` probes against the actual registered schemas accepted nested unknown keys for all four batch tools. The Phase 6 task itself acknowledges that recursive wiring is deferred to unfinished Phase 7 ([task.md:100](../task.md#L100)).

This is primarily a ledger/status contradiction rather than misassigned implementation work: either Phase 6 should remain “implemented pending Phase 7 dependency,” or the Three-Layer Boundary checkbox should remain open until Phase 7 lands.

### C11 — [P3] Recovery wording is ambiguous about skipped rows

All four batch descriptions include the required partial-success warning, but each says to report “failed/skipped” items and then “retry only those failed items”; for example [node.ts:169](../../../src/mcp_server/tools/node.ts#L169). Skipped rows were never attempted, so following the sentence literally leaves part of the requested operation undone.

The ambiguity also exists in the PRD's shorthand around “retry exactly the failed items,” despite the contract introducing a separate `skipped` status.

**Required remediation:** say “retry every non-success row (`failed` and `skipped`)” or explicitly define “failed items” as including both statuses. Test the emitted `tools/list` description.

### C12 — [P3] Component-set parent recovery incorrectly narrows the valid parent to a frame

The schema and missing-parent error both say “parent frame” ([create.ts:250](../../../src/mcp_server/tools/create.ts#L250), [componentHandlers.ts:960](../../../figma_plugin/handlers/componentHandlers.ts#L960)). The handler actually accepts any verified appendable container by checking for `appendChild` ([componentHandlers.ts:981–987](../../../figma_plugin/handlers/componentHandlers.ts#L981)).

This can make callers assume valid page/group/component/section parents are unsupported.

**Required remediation:** use “appendable parent container” in the schema and error, and point to `node_info` for discovery.

### C13 — [P3] `PARENT_NAME_MISSING` recovery text is correct but not regression-tested

The factory correctly names `node_info` and tells the caller to pass the name back verbatim ([errors.ts:87–94](../../../figma_plugin/utils/errors.ts#L87)). The detailed recovery assertions cover `PARENT_NAME_MISMATCH` but not `PARENT_NAME_MISSING`; plugin omission tests assert only the code.

Dropping the read tool or verbatim instruction would therefore leave the D9 one-round-trip recovery requirement broken while the suite stayed green.

**Required remediation:** parameterize the recovery-content test across both parent factories.

## Phase 5 coverage

| Phase 5 task | Result | Notes |
|---|---|---|
| Five creator schemas require `parentId` and `parentNodeName` | **Partial** | Structural requiredness passes; C9 blocks exact empty names. |
| `create_component_set` requires both fields | **Partial** | Requiredness passes; C9 and C12 apply. |
| Central coded `PARENT_NAME_MISSING`/`PARENT_NAME_MISMATCH` pair and inventory | **Pass** | Factories and nineteen-code inventory are present. |
| Ordinary creator throw sites route through factories | **Pass with edge defect** | Shared helper is correctly routed; its truthiness semantics cause C9. |
| Component-set parent throw sites route through factories | **Pass with edge defect** | Missing/mismatch routing is present; C9 affects classification. |
| Missing/mismatch fail closed without mutation | **Pass on covered cases** | Representative creator and component-set tests exist. |
| Six field descriptions teach `node_info`/verbatim | **Pass** | Description test exists. |
| Recovery wording protected by tests | **Partial** | C13. |

## Phase 6 coverage

| Phase 6 task | Result | Notes |
|---|---|---|
| `.min(1)` on all four batch arrays | **Pass** | Boundary tests cover all four. |
| Normalized duplicate rejection for delete/text/instance | **Pass** | Schema rejection and plugin defense exist. |
| Annotation duplicate exemption | **Pass** | Boundary test exists. |
| Partial-success description | **Partial** | Present, but C11 is ambiguous and untested. |
| Three-layer boundary | **Fail/partial** | C3, C5, and C10 violate or defer parts of it. |
| Honest delete partial success | **Pass on ordinary execution** | Shared helper returns false/`partial_success`; C3 can still erase the envelope. |
| Shared status/count helper and boolean invariant | **Pass mechanically** | C4 shows incorrect outcome classification can still feed the correct algebra. |
| Exactly one ordered row per original input | **Fail** | C3 duplicates a text row; C5 drops instance rows. |
| Actionable non-success reasons | **Partial** | Ordinary rows carry errors; C4 silently treats missing work as success. |
| Shared `nodeId`/`status`/`error` row vocabulary | **Pass on ordinary handler rows** | Not encoded in registered schemas and incompletely tested (C7/C8). |
| Text partial-mutation disclosure | **Fail** | C1 and C2. |
| Instance partial-mutation disclosure | **Partial** | Main swap is captured; prior override-field mutations are not fully disclosed (C4). |
| No legacy final return-count aliases | **Pass** | Ordinary final handlers use shared envelope counts. |
| No legacy progress-payload copies | **Fail** | C6. |
| Registered-callback exact-output tests | **Fail/missing** | C7. |
| All-four/every-path invariant tests | **Fail/missing** | C8. |

## Verification performed

- `bun test src/mcp_server/tests`: **726 pass, 0 fail, 3396 assertions**.
- Targeted Phase 5–6 suites: pass.
- `bun run check:types:plugin`: pass.
- `bun run check:suppressions`: pass.
- Direct deterministic probes reproduced:
  - fallback-font mutation with no partial disclosure;
  - mixed-font mutation with no partial disclosure;
  - one text input producing two rows after a progress failure;
  - a deleted node followed by an envelope-less progress exception;
  - a swapped instance reporting success after applying zero requested overrides;
  - registered output schemas accepting legacy-only payloads.

The green suite therefore does not establish Phase 6 conformance. The Phase 5–6 task header and prior review resolution note should not claim that every finding is fixed until C1–C10 are remediated and the missing fault-path tests land.
