# Phase 3 & 4 Adversarial Implementation Review

**Date:** 2026-07-18  
**Target:** branch `v2.3.3-Plugin-Type-Check-Restoration-&-Safety-Contract-Gap-Closure`, committed tip `3f62505`, plus the current uncommitted Phase 3–4 working tree  
**Requirements reviewed:** [PRD D3, D5, and D9](../prd.md) and [task-list Phases 3–4](../task.md)  
**Status:** Open — Phase 3 is partial; Phase 4 is not release-ready

This document contains the unresolved findings from the adversarial review of Phases 3 and 4. The Phase 1–2 findings have been closed separately in the PRD, task ledger, and plugin tsconfig and are intentionally omitted here.

## Review boundary

The review inspected three distinct states so an older running MCP process could not contaminate the result:

1. The current TypeScript working tree, which contains the Phase 3–4 implementation.
2. The rebuilt `figma_plugin/code.js`, which matches the current plugin source.
3. A newly launched local `dist/server.js` exercised through the pinned official MCP SDK `Client` and `McpServer` boundary.

Several already-running MCP processes predate the Phase 4 build and are stale. They were not used for the protocol reproduction below. The fresh post-Phase-4 build still reports version `2.3.2` because the version bump is scheduled for Phase 13; the version string alone therefore does not identify the implementation level.

## Executive assessment

| Phase | Assessment | Release impact |
|---|---|---|
| Phase 3 — type and suppression gates | **Partial** | The type gate is wired and green, but the suppression gate is untracked, bypassable with `@ts-nocheck`, and untested. |
| Phase 4 — structured errors and D5 verification | **Fail** | The plugin-side relay largely works, but official MCP clients reject structured errors for 26 of 46 tools. Several edge cases also bypass verification or permit predictable partial mutation. |

Passing unit tests do not establish Phase 4 conformance. The current full suite passes 669/669, while the required official MCP boundary still fails.

## Severity convention

- **P0 — release blocker:** the specified contract cannot be delivered to a conforming client.
- **P1 — high:** a safety gate can be bypassed, a predictable failure can mutate state, or required CI coverage can be omitted.
- **P2 — medium:** incomplete centralization, ambiguous edge semantics, or material test/contract drift.
- **P3 — low:** evidence, wording, or task-ledger inconsistency that should be corrected before phase closure.

---

## Phase 3 findings

### P3-1 — [P1] The suppression checker is untracked

**Evidence.** [package.json](../../../package.json) lines 70–71 and [ci.yml](../../../.github/workflows/ci.yml) lines 33–37 invoke `check:suppressions`, but [scripts/check-suppressions.ts](../../../scripts/check-suppressions.ts) is reported as `??` by `git status`.

**Impact.** A commit that omits the untracked file leaves CI calling a nonexistent script. The gate appears implemented in the working tree but is not deliverable from a clean checkout.

**Required remediation.** Add the checker to version control with the package and workflow changes.

**Acceptance criteria.**

- `git ls-files --error-unmatch scripts/check-suppressions.ts` succeeds.
- A clean checkout can run `bun run check:suppressions`.
- CI reaches and passes the suppression step.

### P3-2 — [P1] `@ts-nocheck` bypasses both Phase 3 gates

**Evidence.** [check-suppressions.ts](../../../scripts/check-suppressions.ts) lines 34–55 detects only `@ts-ignore` and `@ts-expect-error`. TypeScript honors `// @ts-nocheck` as a file-wide opt-out, so a contributor can disable checking for an entire plugin file while both `check:types:plugin` and the current suppression script remain green.

**Impact.** This reintroduces the exact lost-safety-net condition Track 1 is intended to prevent.

**Required remediation.** Explicitly forbid `@ts-nocheck` with file:line diagnostics and actionable removal guidance.

**Acceptance criteria.**

- A fixture containing `// @ts-nocheck` exits nonzero and names its file and line.
- The output instructs the contributor to remove the directive and fix the underlying errors.
- The current conforming plugin tree remains green.

### P3-3 — [P2] The checker has no executable negative tests

**Evidence.** The repository test suite contains no regression test for `check-suppressions` or `check:suppressions`. CI runs the checker only against today’s conforming tree.

**Impact.** A future change that makes the checker always succeed, stops recursive traversal, or removes the required recovery text will not fail CI.

**Required remediation.** Extract the checking logic for unit testing or execute the script against isolated fixtures.

**Acceptance fixtures.**

- `@ts-ignore` → failure with file:line and replacement guidance.
- `@ts-nocheck` → failure with file:line and removal guidance.
- Bare `@ts-expect-error` → failure with same-line-description guidance.
- Described `@ts-expect-error` → success.
- A directive in a nested plugin directory → detected.
- Diagnostics contain the one-round-trip contributor fix required by D3.

### P3-4 — [P2] Substring matching does not identify directives reliably

**Evidence.** [check-suppressions.ts](../../../scripts/check-suppressions.ts) lines 35 and 43 use `line.includes`. This can reject harmless string literals containing `@ts-ignore`. Lines 45–49 accept any nonempty suffix, including punctuation such as `-`, as a description.

**Impact.** The gate can produce false positives while accepting descriptions that provide no useful explanation.

**Required remediation.** Match TypeScript directive-comment syntax rather than arbitrary substrings and require meaningful description text.

**Acceptance criteria.**

- A string literal containing `"@ts-ignore"` does not fail.
- Real line-comment and block-comment directives are detected.
- `// @ts-expect-error -` fails.
- Existing descriptions such as `TS2339: Property ...` pass.

### P3-5 — [P3] Phase 3 evidence and documentation are stale

**Evidence.**

- Phase 3 remains unchecked in [task.md](../task.md), despite the scripts and CI wiring existing.
- The task text records 50 suppressions; the current tree contains 49.
- [prd.md](../prd.md) and [task.md](../task.md) say the checks share the “same CI step,” while [open-questions.md](open-questions.md) ratifies the implemented adjacent-step layout.
- The red/green type-gate proof is reproducible locally but is not recorded durably.

**Required remediation.** Record the verified red/green commands, avoid a brittle “current count,” use “adjacent/beside” consistently, and check Phase 3 items only after P3-1 through P3-4 pass.

---

## Phase 4 findings

### P4-1 — [P0] Official MCP clients reject the structured-error envelope

**Evidence.** The production wrapper in [tools/index.ts](../../../src/mcp_server/tools/index.ts) lines 41–64 catches errors and returns:

```json
{
  "isError": true,
  "structuredContent": {
    "error": { "code": "...", "message": "...", "details": {} }
  }
}
```

Tools such as `style_manage` advertise a success-only output schema requiring `id`, `name`, and `type` in [style.ts](../../../src/mcp_server/tools/style.ts) lines 125–129. The pinned official SDK client validates every present `structuredContent` against that advertised output schema, including error results.

A fresh `dist/server.js` process exposed 46 tools and the new `currentStyleName` input. Calling `style_manage` through the official SDK produced:

```text
CALL_ERROR -32602 MCP error -32602: Structured content does not match the tool's output schema:
data must have required property 'id',
data must have required property 'name',
data must have required property 'type'
```

Twenty-six of the 46 emitted tools have required success fields and are affected. `variable_manage` appears to work only because its output fields happen to be optional.

**Impact.** The caller receives protocol error `-32602`, not the intended D9 code, message, or details. The central Phase 4 deliverable therefore fails at the exact boundary the task requires.

**Required remediation.** Make every advertised tool output schema accept the common structured-error envelope while retaining its success schema. If the implementation cannot do so under the pinned SDK, revise the PRD’s transport contract explicitly rather than silently dropping `structuredContent`.

**Acceptance criteria.**

- A test uses the official SDK `Client`, linked transport, registered production server, and real output schemas.
- A thrown `STYLE_NAME_MISMATCH` arrives as `isError: true`, retains its code/details in `structuredContent`, and carries the same code in the text fallback.
- The test enumerates all registered tools and proves every advertised output schema accepts the common error envelope.
- No error result is converted to `-32602` output-schema failure.

### P4-2 — [P1] An explicitly supplied empty `styleId` becomes a create operation

**Evidence.** [style.ts](../../../src/mcp_server/tools/style.ts) lines 107–116 and [styleHandlers.ts](../../../figma_plugin/handlers/styleHandlers.ts) lines 12–18 choose create/update with truthiness. This input passes schema validation:

```ts
{ type: "PAINT", styleId: "", name: "Accidental creation" }
```

The plugin then reaches the create branch at `styleHandlers.ts` line 77.

**Impact.** Malformed update intent bypasses `currentStyleName` verification and creates a new global style. This contradicts “whenever `styleId` is supplied.”

**Required remediation.** Reject empty IDs at the schema boundary and use presence checks (`styleId !== undefined`) in both server and plugin layers.

**Acceptance criteria.** `styleId: ""` is rejected with zero mutation, while an omitted `styleId` remains the create path.

### P4-3 — [P1] An empty PAINT binding map can mutate before a predictable failure

**Evidence.** The Q17 precheck in [styleHandlers.ts](../../../figma_plugin/handlers/styleHandlers.ts) lines 56–66 runs only when `Object.keys(bindVariables).length > 0`. Execution at lines 154–163 enters for any object, including `{}`. For an existing PAINT style with no paints, a requested rename can occur before execution throws “no paints.”

**Impact.** A schema-valid, predictable failure mutates the style first and is then reported as partial. Q17 requires predictable failures to return with zero mutation.

**Required remediation.** Define empty-map semantics explicitly and make precheck and execution conditions identical: either `{}` is a no-op, or any supplied binding object triggers the paints-present precheck.

**Acceptance criteria.** An empty map against a paintless style either succeeds without writes as a documented no-op or fails before name/description/properties change; it must never become a predictable partial mutation.

### P4-4 — [P1] `channel_join` still parses prose, loses codes, and returns a normal result

**Evidence.** [channel.ts](../../../src/mcp_server/tools/channel.ts) lines 73–92 preserves only `CHANNEL_NOT_FOUND`, derives other codes through `message.includes(...)`, and catches the failure into `toolResult({status: "error"})`. Unrecognized structured codes fall back to `UNKNOWN_ERROR`; `isError` is absent.

**Impact.** Existing and future socket codes such as `PLUGIN_PEER_UNAVAILABLE`, `PLUGIN_PEER_AMBIGUOUS`, `CHANNEL_IN_USE`, and `VERSION_MISMATCH` are destroyed. This violates code pass-through, the no-prose-parsing rule, and D9 MCP error semantics.

**Required remediation.** Preserve structured `error.code`, `message`, and `details` unchanged and allow the production wrapper to create the MCP error result. Phase 9 may add new join codes, but Phase 4 must make the transport generic now.

**Acceptance criteria.** A real SDK call for each representative join failure returns `isError: true`, the original code/details, and no code classification derived from message text.

### P4-5 — [P2] The Q16 central message-factory inventory is incomplete

**Evidence.** [errors.ts](../../../figma_plugin/utils/errors.ts) lines 30–42 stores the ten operational messages as plain strings; only the seven D5 verification messages at lines 54–83 are factories. `UNKNOWN_ERROR` is hardcoded separately in the plugin, `figma-client`, tool wrapper, and channel tool. Refinement refusal text is also authored locally in `variable.ts` and `style.ts`.

**Impact.** The implementation does not provide the ratified single registry of message factories, cannot prove exact inventory coverage, and permits wording/code drift between layers.

**Required remediation.** Create one typed inventory for the ten operational codes, seven D5 codes, and `UNKNOWN_ERROR`; handlers and refinements pass operands into it rather than authoring refusal strings locally.

**Acceptance criteria.** An inventory test proves every ratified code exists exactly once, produces its required recovery-bearing message, and is the source used by all coded throws/refinements.

### P4-6 — [P2] Empty exact names are treated as absent and can self-lock a style

**Evidence.** Falsy checks appear in [variable.ts](../../../src/mcp_server/tools/variable.ts) around line 137, [style.ts](../../../src/mcp_server/tools/style.ts) around line 108, and the corresponding plugin handlers. Yet [styleHandlers.ts](../../../figma_plugin/handlers/styleHandlers.ts) lines 112–114 allows an update to assign `name = ""` when explicitly supplied.

After that rename, passing the exact current name `currentStyleName: ""` is rejected as `STYLE_NAME_MISSING`, preventing further MCP updates to that style.

**Impact.** The implementation conflates absent with present-but-empty, contradicting the exact-name passback contract and creating an object the same tool cannot address.

**Required remediation.** Use property-presence/`undefined` checks independently from exact equality. If empty target names are not supported product behavior, reject them consistently before mutation instead.

**Acceptance criteria.** The chosen empty-name policy is documented and symmetric across schema and plugin layers; no successful update can create an object that exact-name verification cannot subsequently address.

### P4-7 — [P2] Required boundary coverage is absent and the Phase 4 test file is untracked

**Evidence.** [v2.3.3.phase4.test.ts](../../../src/mcp_server/tests/unit/figma_plugin/v2.3.3.phase4.test.ts) is untracked. Its transport test invokes a synthetic wrapped callback without a success `outputSchema`; its dispatcher test stops at mocked `figma.ui.postMessage`. Neither path reaches registered production schemas through the official SDK client.

The file’s 22 tests pass, and the full suite passes 669/669, while P4-1 still reproduces.

**Impact.** The required test can be omitted from a commit, and its current seams give false confidence about the actual MCP contract.

**Required remediation.** Track the test file and replace/add an official SDK boundary suite. Retain focused plugin tests, but do not label them end-to-end transport coverage.

**Acceptance criteria.** A clean checkout runs the tracked boundary tests and fails under the current success-only error schemas, then passes after P4-1 is corrected.

### P4-8 — [P2] The Q14 dual-description assertion is weaker than the task requires

**Evidence.** Field descriptions contain the literal `REQUIRED for …` marker, but top-level descriptions use different lowercase wording in [variable.ts](../../../src/mcp_server/tools/variable.ts) line 74 and [style.ts](../../../src/mcp_server/tools/style.ts) line 90. The Phase 4 test asserts those weaker strings against raw registration configuration rather than the emitted `tools/list` result.

**Impact.** The implementation is semantically understandable, but the literal CI guarantee ratified for Q14 is not enforced at the consumer-visible boundary.

**Required remediation.** Put the agreed marker in both field and top-level descriptions and test the emitted tool metadata.

**Acceptance criteria.** `tools/list` contains the literal `REQUIRED for …` text in both locations for every conditional requirement.

### P4-9 — [P3] The Phase 4 task ledger contradicts the ratified contract

**Evidence.** [task.md](../task.md) says “six D5 verification codes” in the Phase 4 factory task while its header and PRD correctly list seven, including `VARIABLE_SCOPES_MISSING`. Its Phase 4 handler links point to nonexistent `figma_plugin/src/handlers/...` paths rather than `figma_plugin/handlers/...`.

**Required remediation.** Correct the inventory count and handler links when the findings above are added to Phase 4. Leave Phase 4 unchecked until its actual-boundary acceptance tests pass.

---

## Confirmed implementation strengths

These paths were inspected and should be preserved while fixing the findings:

- The plugin dispatcher emits a structured error object in `figma_plugin/src/main.ts`.
- The UI relay and socket source preserve that object rather than flattening it.
- `figma-client` preserves a structured code and details in `FigmaError`.
- Normal missing/mismatched D5 verification cases fail closed.
- `UPDATE_VARIABLE` validates `modeId` and alias targets before mutation on the ordinary path.
- Nonempty style bindings resolve before mutation, and the intended PAINT no-paints check exists.
- TEXT-style update/create font ordering follows Q19.
- Properties-only style updates do not rename on the normal path.
- Unexpected mid-update failures can carry the Q18 partial-disclosure fields.
- Plugin type checking passes with zero errors.

The P4-1 failure is at the final MCP schema-validation boundary; it does not negate the useful plugin/UI/client work underneath it.

## Required sequencing

1. Close P3-1 through P3-4 so subsequent runtime work lands under enforceable gates.
2. Fix P4-1 before relying on D9 errors anywhere else; all later safety phases depend on this transport.
3. Fix `channel_join` pass-through and central error-factory inventory.
4. Resolve ID/name/binding presence semantics and add their adversarial zero-mutation tests.
5. Add the official SDK boundary suite, track all new files, and strengthen emitted-description tests.
6. Reconcile Phase 3–4 task status and wording.
7. Repeat the boundary suite in Phase 14 along with the full build/type/test verification.

These are unmet requirements of the existing phases, not new release scope. They should be added as blocking closure tasks under Phases 3 and 4, with final protocol verification repeated in Phase 14; a new numbered implementation phase is not necessary.

## Verification record

| Check | Result |
|---|---|
| `bun run check:types:plugin` | Pass, 0 errors |
| `bun run check:suppressions` | Pass against current tree, but incomplete for P3-2/P3-4 |
| Phase 4 focused test file | 22 pass |
| Full unit suite | 669 pass, 0 fail, 3,063 assertions |
| Repeated plugin rebuild | Byte-identical output |
| Fresh post-Phase-4 official SDK call | **Fail: `-32602` output-schema mismatch** |
| `git diff --check` | Pass |

## Closure definition

Phases 3 and 4 are ready to check off only when:

- every P1/P2/P3 finding above has a tracked remediation or an explicit PRD decision rejecting it;
- the suppression checker’s negative fixtures pass from a clean checkout;
- all registered tools can deliver the common D9 error envelope through the official SDK boundary;
- empty ID, empty-name, and empty-binding adversarial cases cannot bypass verification or produce an undisclosed/predictable partial mutation;
- no error code is derived from prose or lost by `channel_join`;
- the central code/factory inventory is exact and executable;
- the full suite, plugin type gate, suppression gate, plugin rebuild check, and Phase 14 boundary verification are green.
