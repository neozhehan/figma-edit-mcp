# Phase 5 & 6 Adversarial Critique

**Date:** 2026-07-19  
**Target:** current working tree  
**Requirements reviewed:** [PRD D6/D7 and implementation plan](../prd.md), [task-list Phases 5–6](../task.md)  
**Assessment:** **Phase 6 should be reopened. Phase 5 is substantially implemented but still has one valid-name edge-case defect.**

> **Resolution (2026-07-22).** All thirteen findings (C1–C13) were confirmed valid and are now fixed and verified; the suite is green at **741/741** (up from 726), `check:types:plugin`/`check:suppressions` pass, and the plugin bundle rebuilds idempotently. Highlights: **C1** — the text disclosure now reads the loop-scoped `report` inside the catch (the fix the isolated test never drove); **C2** — `setCharacters` reports *every* font mutation (fallback **and** mixed-font normalization) with a serializable before-font (`{family,style}` or `{mixed, segments}`), and Q24's premise is amended; **C3** — `sendProgressUpdate` swallows `postMessage` failures so progress can never fabricate a row or erase the envelope; **C4** — unresolved override nodes and unapplied requested fields are now failures (not silent success), and the failure row discloses the swap plus every applied field; **C5** — a target that changes on re-resolution fails the whole command instead of being silently dropped; **C6** — legacy count names removed from the early progress payloads; **C9** — parent omission is nullish, so a present empty name is compared (MISMATCH), not misclassified as MISSING; **C7/C8** — real registered-callback exact-output tests and a per-aggregator fault-path matrix (including a `deps.setCharacters` injection seam that drives the text fallback deterministically, since bun's `mock.module` cannot be un-mocked per-file); **C10** — the Layer-1 ledger now states that nested/at-any-depth strictness is a Phase 7 dependency; **C11/C12/C13** — wording and a missing recovery-content test. The findings below are retained as the historical record.

This is a fresh review of the claimed post-remediation state. It does not assume that the earlier [Phase 5 & 6 review](Phase-5-%26-6-review.md) resolution note is correct. The current implementation passes the full automated suite, but several required safety properties fail under deterministic fault injection that the suite does not cover.

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
