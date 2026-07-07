# Adversarial Peer Review: v2.x.0 PRD (Graph-Based Operational Plans)

**Review date:** 2026-07-05. Verified against the working tree (`package.json` 2.3.2, v2.3.2 phases 1–7 committed) and a **live Figma session** (document "MCP Test", page scope, channel `tnay`).

## Overview

The core product direction is sound and well-motivated: D1 (graph, not stack/tree), D3 (server owns drafts, plugin owns safety), D5 (structured refs, not string interpolation), D6/D7 (digest-bound approval rendered and enforced by the plugin, not the LLM) are the right calls, and the PRD correctly resists the temptation to mirror document state server-side.

However, the review found: a **stale baseline** — the PRD is written against v2.3.1 but v2.3.2 is already implemented and changed facts the PRD relies on; a **wire-protocol claim that cannot work as written** (§7 progress reporting); **two unreconciled status vocabularies** at the heart of the P0 design; a **contradiction between immediate-execution-on-approval and the approval-invalidation list**; several **undefined load-bearing terms** ("non-recoverable failure", `skippedSteps`, canonicalization); a **verified incomplete effect model** (§3 omits `node_flatten`/`node_ungroup`/`node_group`); and an overall pattern of **overclaiming closure** (D11 "no open product decisions remain" is not true by the PRD's own text). One incidental live finding is a currently-shipping bug in `variable_delete` unrelated to this PRD (Part 3).

None of this invalidates the feature. Most findings are resolvable with decision blocks in the v2.3.2 house style. The PRD is **not implementation-ready** until F1–F6 are resolved.

---

## Part 1 — Claim-by-claim verification

### §11 provenance table

| PRD claim | Verified at | Verdict |
| :- | :- | :- |
| `package.json` reads `2.3.1` "(verified)" | `package.json:3` reads **`2.3.2`** | ❌ **STALE** — see F1 |
| Test expects 46 registered tools | `src/mcp_server/tests/unit/tools/v2Tools.test.ts:23-25` | ✅ Confirmed |
| `withStrictInputSchemas` centrally rejects unknown keys | `src/mcp_server/tools/index.ts:30,49` | ✅ Confirmed |
| `FigmaCommand` is an explicit union | `src/mcp_server/figma-client.ts:67` | ✅ Confirmed |
| Commands serialized through `state.commandQueue` | `figma_plugin/src/main.ts:307` | ✅ Confirmed |
| Shared guard helpers exist for reuse | `main.ts:123` (`validateSingleNodeWrite`), `main.ts:139` (`validateParentWrite`) | ✅ Confirmed |
| Referenced file paths (`figma_plugin/handlers/`, `figma_plugin/utils/progressUtils.ts`, `figma_plugin/ui.html`) | all exist | ✅ Confirmed |
| §9 build item: `tests/unit/tools/v2Tools.test.ts` | actual path is `src/mcp_server/tests/unit/tools/v2Tools.test.ts` (§11 has it right; §9 does not) | ⚠️ Path error |

### Technical assumptions tested live (channel `tnay`, 2026-07-05)

| Assumption | Method | Verdict |
| :- | :- | :- |
| §3 effect model: `create_component` replaces the source frame with a new node ID | Code (`componentHandlers.ts:690-758`: new node created, children moved, `node.remove()`) **and live**: frame `1224:61` → component `1225:63` | ✅ Confirmed live |
| §3 example graph: a fill variable bound to the frame **survives** `create_component` (the example binds before converting) | Live: bound `prdtest/bg` to frame fill, converted; component `1225:63` carries `boundVariables.fills → VariableID:1225:62` | ✅ Confirmed live — the canonical example is sound |
| Example arg names match real schemas (`create_text.text`, `create_frame.layoutMode`, …) | Tool schemas | ✅ Confirmed |
| Channel-disconnect invalidation (§6) will be exercised in practice | Incidental: a spontaneous disconnect + forced rejoin occurred **within a ~30-second live session** | ⚠️ See F8 |

---

## Part 2 — Findings

### F1. BLOCKER — The baseline is stale: v2.3.2 shipped underneath this PRD, and it changed facts the PRD depends on

The PRD self-identifies as grounded on v2.3.1 and asserts `package.json` reads `2.3.1` "(verified)". The tree is at **2.3.2**, with all v2.3.2 phases committed (`documentation/v2.3.2-safety-contract-conformance-&-atomicity-hardening/`). This is not just a version-string nit — v2.3.2 materially moved the ground the plan layer builds on:

1. **The two-phase plan/mutate pattern already exists.** v2.3.2 D4 introduced dispatcher-owned prevalidation via an exported `validateCreateComponentSetPlan(params, scopeRoot)` plan phase feeding a mutate-only handler. This is *architecturally the seed of §5 live verification* — a validation pass over a multi-target operation, resolved once, with references carried into mutation. The PRD's §5 implementation note ("reuse `validateSingleNodeWrite`…") should name this pattern as the template and generalize it, instead of appearing to invent per-plan validation from scratch.
2. **Guard stacks changed.** v2.3.2 D3 extended `node_clone` (destination-parent scope — cloning the scope root is now *denied*), wired the missing locked/instance gates for `node_set_effects` and `create_svg`, and made creation handlers clean up orphans. §5's bullet "validate step-specific constraints **from v2.3.1**" and the API-notice guard list are stale; every reference should re-anchor to the v2.3.2 safety matrix and `SAFETY.md` Part B (which is now mechanically token-diffed by tests per v2.3.2 D9/OQ4 — the new plan gates must be added to that contract table or CI will fail).
3. **The atomicity vocabulary already exists.** v2.3.2 D5 defines the project's atomicity contract: *prevalidation aborts before mutation; residual TOCTOU-class failures degrade to ordinary reported errors per R1/R5; no general transactions*. D8's "no true rollback" is the same policy — it should cite D5/R1/R5 and inherit its "qualified claim" discipline instead of restating it in new words.
4. **Release identity:** "if no other minor release intervenes" — a patch release already intervened; re-anchor the baseline paragraph and §11 table to v2.3.2.

**Required fix:** re-ground the PRD on v2.3.2 (§ baseline, API notice, §5, D8, §11), and add a provenance row for the D4 plan-phase precedent.

### F2. DESIGN HOLE — §7's progress reporting cannot work as written

§7: "Emit progress updates using the existing `sendProgressUpdate` pattern." Verified against `src/mcp_server/figma-client.ts:206-236`: progress messages are **dropped unless their `id` matches a pending request** (`pendingRequests.has(requestId)`), where they reset that request's 60s inactivity timeout. But plan execution begins *after user approval, minutes after the `SUBMIT` request resolved* with `awaiting_user`. At execution time there is **no pending request** for progress to attach to; every progress frame — and the final execution result frame — arrives with an id nobody is waiting for and is silently discarded.

The PRD half-covers the result side (the plugin "stores a step-by-step report, retrievable through `STATUS`"), but the progress claim is broken, and the pull-based consequence is never stated. Options that need an explicit decision:

- (a) `STATUS` long-polls (becomes the pending request that progress frames attach to);
- (b) a new unsolicited plugin→server event type plus a server-side workflow-state cache (a real wire-protocol change — note §11's own observation that `FigmaCommand` is a deliberate closed union);
- (c) plugin stores everything; `STATUS` is a cheap snapshot poll; drop the progress-update claim from §7.

Any of these is fine; pretending the existing pattern covers it is not.

### F3. DESIGN HOLE — Two status vocabularies, no mapping, two sources of truth

§1 defines `PlanStatus`: `draft → static_validated → submitted_for_review → approved → executing → executed / failed / discarded`. §6 defines `PlanWorkflowStatus`: `not_submitted | verifying | awaiting_user | approved | rejected | executing | executed | failed | stale | failed_verification`. Unanswered:

- `rejected`, `stale`, `failed_verification` have **no home in `PlanStatus`**. What is the server-side status of a plan the user rejected? (`draft` again? A missing `rejected` state?)
- `submitted_for_review` vs `awaiting_user` — same state, two names, or is one server-view and one plugin-view? Say so.
- **How does the server plan store learn transitions at all?** The plugin owns approval/execution; the server owns the draft. With no push channel (F2), the server's `PlanStatus` can only change when the LLM happens to call `STATUS`. That makes §1's lifecycle a *cache*, not a state machine — the PRD should say which store is authoritative for which states.
- **Server restart during execution:** the plan store is process-memory (§1) while the plugin keeps executing and stores the report. After restart, `STATUS` has no `planId` — the execution result is permanently orphaned. Either the plugin's stored report must be retrievable by digest/channel without a server-side plan record, or the PRD should state the result is lost and the user's document is the only record. (Related: §1's lifecycle diagram is ambiguous as ASCII — the `executing/failed/discarded` rows don't say which states they branch from. Make transitions explicit.)

### F4. CONTRADICTION — Immediate execution on approval vs. the approval-invalidation list

§6 approval mechanics step 8: on approval the plugin "**immediately** runs final validation, and executes." But §6's invalidation list then enumerates events that invalidate *approval* — channel change, plugin reconnect, scope/permission change — which can only occur in a window between approval and execution that the immediate-execution design **eliminates**. Two of the items are also the same event: per `SAFETY.md` AS5, scope and permission axes are fixed at connect and can only change *via* reconnect.

Either (a) execution is immediate — then the list is really *submission*-invalidation (events between `SUBMIT` and the user's decision), and should be renamed and trimmed; or (b) approval and execution can be separated (deferred/scheduled execution) — then the PRD must spec the window, its timeout, and re-validation on entry. The current text specs both halves of two different designs. Also unspecified: what happens if the user simply **closes the review UI without deciding** (approval-pending timeout? plan stuck in `awaiting_user` forever?).

### F5. UNDEFINED SEMANTICS — "stop on first non-recoverable step failure" and `skippedSteps`

D8 and §7 say execution "stops on first **non-recoverable** step failure." *Recoverable is never defined.* Two very different engines hide behind this word:

- If **no** failure is recoverable: say "stop on first failure"; `skippedSteps` = every not-yet-executed step. Simple, matches v2.3.2's stop-on-first-failure batch rule.
- If **some** failures are recoverable (warnings? per-item batch partials?): the engine must decide whether *independent branches* of the DAG continue after a failure, which requires dependency-aware skip propagation (skip the failed step's transitive dependents, run the rest). `PlanExecutionResult.skippedSteps` only makes distinct sense in this design — which the PRD never describes.

Pick one, define the failure taxonomy, and give `skippedSteps` a precise definition. Note the interaction with batch-item commands (`node_delete` is documented as *not* stop-on-first-failure for its own items — is a partially-failed batch step a failed step?).

### F6. IMPLEMENTATION TRAP — The digest is under-specified and its strongest stated use is theater

D6/§7 hinge on a "canonical digest," but:

1. **No canonicalization algorithm.** The digest must be computed by the server (Node/Bun) and *recomputed by the plugin* (Figma's sandboxed JS VM). Canonical JSON across runtimes — key ordering, float rendering (`0.1`, `1e-7`), unicode normalization — is a classic cross-runtime hash-mismatch trap. Specify the canonical form (e.g., JCS/RFC 8785 subset) or don't recompute.
2. **No hash primitive in the plugin.** The plugin sandbox has no Web Crypto, and the plugin codebase currently contains zero hashing (verified by grep). Recomputing a digest plugin-side means bundling a pure-JS SHA-256 or delegating to the UI iframe. Neither is mentioned.
3. **What does recomputation defend against?** The plugin verifies/renders/approves/executes **its own stored copy**, received once at `SUBMIT`. There is no second transfer between approval and execution for a digest check to protect. The digest's real value — a stable audit identifier, and binding approval across *resubmissions* so the server can't swap plan A's approval onto plan B — is worth stating; "recompute the canonical digest before execution" as currently written verifies plugin memory against itself.
4. **Digesting derived data.** D6 includes *risk flags* in the digest. Risk flags are computed from the graph; if server and plugin ever derive them differently, the digest mismatches spuriously. Digest the inputs (steps, args, edges, channel, scope snapshot); *derive* the flags. Similarly, the scope snapshot in the digest is redundant with the live re-validation that already runs at submit/approval/execution — decide which mechanism is authoritative for scope drift and say so.

### F7. OVERSOLD — The safety benefits are opt-in, and the PRD's Benefits table doesn't survive its own D10

D10 keeps every direct write tool fully available. Therefore a confused, malicious, or prompt-injected agent — precisely the actor the review layer is designed to catch — **simply won't use plans**. In the shipped release, the *enforced* safety delta over v2.3.2 is zero; the plan layer only helps when the agent voluntarily cooperates. That is a legitimate incremental-release choice (and the "approval-required mode" follow-up is the right eventual fix), but the Benefits table sells "Reduced accidental edits," "User approval," and "Human-designer control" without this caveat, and §8's SAFETY.md update lists only "the human approves a bad plan" as residual risk. **Add the bigger one: the agent can bypass the plan layer entirely; the layer's guarantees are conditional on agent cooperation until approval-required mode exists.** Relatedly, "Auditability" is overstated for an in-memory store that evaporates on restart (§1) with persistence explicitly a non-goal — qualify it.

The 17-row Benefits table generally reads as a Gish gallop: "More predictable LLM behavior" is asserted without evidence (a counter-hypothesis — that repairing a half-stale graph via `REPLACE_STEP` against step IDs invented turns ago is *harder* for an LLM than retrying one failed call — is equally plausible and unaddressed), and "Batching and latency opportunities" is contradicted by the MVP design (see F8). Five or six rows are load-bearing; trimming the rest would strengthen the document.

### F8. MISSING CONSIDERATION — Multiplayer and the widened TOCTOU window; invalidation frequency

The word "multiplayer" (or any acknowledgment that other humans edit the file concurrently) appears nowhere in the PRD. The plan workflow **widens** the discovery→mutation gap from seconds (direct calls) to *minutes* (draft → validate → submit → human reads a review panel → approve). The PRD handles the *correctness* side thoroughly (revalidation at submit/approval/execution — good), but never the *frequency/UX* side: in a busy file, stale-name and moved-node invalidations will hit plans far more often than direct calls, and the only documented recovery is full resubmission + full re-review. Live datapoint from this review: a spontaneous channel disconnect occurred within a ~30-second session; under §6 that alone invalidates approval. Expect invalidation to be the *common case* for non-trivial plans and design for it: cheap re-verify-and-re-present (delta review: "2 of 14 steps changed"), not a from-scratch loop. Without this, the feature risks being correct but unusable for exactly the large plans it targets. This also directly undercuts the "Batching and latency opportunities" benefit — the MVP batches nothing (execution stays serialized per §11/`commandQueue`) and adds review latency.

### F9. VERIFIED GAP — The §3 effect model omits three allowlisted ref-invalidating commands

The state-effect contracts list `node_delete`, `create_component`, `node_rename`, `node_insert_child`, `variable_delete`/`style_delete` — but not:

| Command | Verified effect | Where |
| :- | :- | :- |
| `node_flatten` | `figma.flatten([node])` **destroys the source node** and returns a **new** node ID | `nodeModifiers.ts:505-507` |
| `node_ungroup` | the group node **ceases to exist**; children reparent | `nodeModifiers.ts:487-489` |
| `node_group` | a **new** group node is created; member nodes reparent | (same family) |

All three are in the §2 allowlist and are exactly analogous to the `create_component` invalidation the PRD *does* model (and which this review confirmed live). As written, §3/§9's validation tests will pass while a use-after-flatten or use-after-ungroup plan validates cleanly and fails (or worse, hits the wrong node) at execution. Add all three to the effect model and to the §3 test list.

### F10. CONTRACT WEAKNESS — `planned.` refs reintroduce the unverified-name pathway

`<stepId>.planned.<field>` lets a later step consume a value (e.g. a name) that **no live node has ever carried** — precisely the fabricated/stale-name failure mode that name verification exists to catch, now laundered through the ref system. "Use sparingly" is guidance, not a contract. Either: enumerate exactly which fields are planned-referenceable and where (plausibly only `name` on creation steps, for display); define the rule when actual ≠ planned at execution; or **cut `planned.` from the MVP** — the example graph and every §9 test work without it.

### F11. HAND-WAVE — Placeholder substitution against real Zod schemas

§4: validate step args "after replacing refs with type-compatible placeholders." Generating a placeholder that satisfies an arbitrary Zod schema is not a small utility: regex-constrained strings, enums, unions, numeric bounds, and cross-field refinements (e.g. bind-ordering guardrails from v2.3.1) will produce both **false failures** (placeholder violates a refinement a real value would satisfy) and **false passes** (placeholder satisfies what the real ref value won't). Scope the claim honestly: literal fields validate fully; ref-bearing fields validate shape/type only, refinements involving them downgrade to warnings; full validation happens live. Say this in §4 rather than implying static validation is schema-complete.

### F12. SELF-CONTRADICTION RISK — `params?: Record<string, unknown>` is the mushy contract the PRD warns against

§2 (correctly) warns: "Do not place every action's fields at the top level as optional fields; that would make the contract mushy." The proposed input — `{ action, planId?, params?: Record<string, unknown> }` — is mushy one level down: the **advertised MCP inputSchema tells the client and the LLM nothing** about any action's fields; all strictness lives in hidden server-side per-action schemas the model discovers only by failing. This cuts against the repo's core design bet (strict visible schemas → agent self-correction). Two alternatives deserve a decision block: (a) a JSON-Schema discriminated union (`anyOf` keyed on `action`) so per-action fields are visible in the published schema; (b) splitting into 2–3 tools along lifecycle seams (edit/submit/status). Note also that the existing house style (`variable_manage`, `style_manage`) *does* use top-level optional fields with an action discriminator — the PRD rejects the established pattern without acknowledging it's the established pattern.

### F13. UNBOUNDED — Plan-store limits are invoked but never defined

§1: "the MVP can keep them in process memory **with limits**" — no limits are ever stated. Needed numbers: max steps per plan, max plans per channel/process, max total bytes (a single `node_set_fill.image.bytesBase64` can be multi-MB, and it sits in every draft revision), max plan-payload size over the wire at `SUBMIT` (one giant WebSocket frame), and an eviction/expiry policy consistent with §1's "drafts remain until explicitly discarded" (which, as written, guarantees unbounded growth in a long-lived server).

### F14. UNHANDLED — Executor death mid-plan

Figma plugins terminate when the user closes the plugin, the tab, or the file. If that happens between step 3 and step 4 of an approved 10-step plan: partial mutation (no rollback, per D8), the stored step report dies with the plugin, and the server's `STATUS` can only say `executing` forever. The PRD covers step *failure* exhaustively and executor *death* not at all — and with human-scale review delays (F8), plugin lifetime overlapping execution is not exotic. Minimum viable answer: document it as a residual risk with recovery guidance (re-discover document state, build a repair plan); better: plugin persists the in-progress report to `figma.clientStorage` so a reopened plugin can answer `STATUS`.

### F15. SECURITY — LLM-authored strings inside the authoritative review surface

D9 makes the plugin render the review "from the canonical graph, not from text supplied by the LLM" — but the canonical graph's `title`, `goal`, `reason`, and `group` fields **are text supplied by the LLM**, displayed in the trusted UI adjacent to plugin-derived facts. A step named `cleanup`, grouped under "Housekeeping", with reason "Remove unused placeholders (safe, reversible)" wrapping `node_delete` of 40 nodes is exactly the social-engineering shape the review exists to stop — now with the plugin's own UI lending it authority. Require: visual separation of *agent claims* (reason/goal/title, styled as quoted, untrusted) from *plugin-verified facts* (counts, targets, risk flags); length caps on all free-text fields; and the destructive-step list rendered from the graph, never suppressed or renamed by `group`.

### F16. MISSING — No friction gradient in approval UX

A 3-step recolor and a 60-step plan flagged `destructive + global_asset_edit + large_batch` get the same single Approve button. Consent fatigue is the known failure mode of every review dialog; risk flags that only *display* don't resist it. Consider for MVP: a plan-size cap (forcing decomposition into reviewable units), and a stronger confirmation tier when `destructive` or `global_asset_edit` is present (e.g., expand-before-approve, or type-to-confirm the scope root name). At minimum, record the decision *not* to add friction as an accepted risk in SAFETY.md.

### F17. OVERCLAIM — D11 "No open product decisions remain for this PRD"

False by the PRD's own text. Open as of this review: F2 (progress transport), F3 (status model + authority), F4 (immediate vs. deferred execution), F5 (failure taxonomy / skip semantics), F6 (canonicalization + hash primitive + digest contents), F12 (schema visibility), F13 (limits), F14 (executor death), F10 (`planned.` refs). The v2.3.2 PRD's discipline — decision blocks with options/pros/cons, and explicitly-tracked OQs driven to closure across revisions — is the house standard this document should follow instead of asserting closure in the first revision.

### F18. Errata (small, factual)

1. §9 build item path: `tests/unit/tools/v2Tools.test.ts` → `src/mcp_server/tests/unit/tools/v2Tools.test.ts` (§11 is correct).
2. §2 annotations: "MCP annotations cannot express 'not mutating now, but may trigger a later approved mutation'" — MCP annotations are *hints*; the correct spec is to state the values (`readOnlyHint: false`, `destructiveHint: true`, `openWorldHint` as applicable) plus the description sentence, not to assert inexpressibility.
3. §4/§6 give prose error strings but define no structured `PLAN_*` error codes, contrary to the repo's error-code discipline (`READ_ONLY_MODE`, `VARIABLE_EDITS_DISABLED`, …) that AGENTS.md and the error playbook are built on. Define the code family; §8 already promises error-playbook entries that will need them.
4. §1 lifecycle diagram: make the transition sources explicit (which states can reach `failed`/`discarded`; only `approved` reaches `executing`).
5. §1 scope snapshot type `allowEditNode: false | "page" | "node"` — confirm against the actual connect payload contract (`SAFETY.md` §14 / AS5) rather than inventing a parallel type.

---

## Part 3 — Incidental live findings (outside this PRD's scope; action needed)

### 3.1 `variable_delete` is currently broken in any document containing variant components (shipping bug, v2.3.2)

During test cleanup, both `variable_delete` paths (`variableIds` and `collectionId`) failed **before any deletion** with:

> `in get_componentPropertyDefinitions: Can only get component property definitions of a component set or non-variant component`

Root cause (verified): the full-document consumer scan at `figma_plugin/handlers/variableHandlers.ts:182-183` reads `node.componentPropertyDefinitions` on **every** `COMPONENT` node; Figma throws for a variant component (a `COMPONENT` child of a `COMPONENT_SET`). "MCP Test" contains `MyTestComponentSet` (`1217:40`), so every `variable_delete` in that document crashes. Reproduced twice. Fix: skip when `node.parent?.type === "COMPONENT_SET"` (or guard with try/catch). Ironic footnote: §7 of this PRD cites the "v2.3.0 `variable_delete` responsiveness principle" as prior art while the tool is currently broken in realistic documents — worth a fast patch.

**Cleanup debt from this review:** because of this bug, the test collection **"PRD Review Test"** (variable `prdtest/bg`, `VariableID:1225:62`) could not be deleted via MCP and remains in "MCP Test". The test frame/component was deleted. Please remove the collection manually (or after fixing 3.1).

### 3.2 Transport fragility datapoint

Two MCP calls issued concurrently produced `Unable to establish connection to Figma after 10 seconds` and a dropped channel requiring rejoin — inside a ~30-second session. Relevant to F8 (invalidation frequency) and, independently, suggests the client/relay does not gracefully serialize concurrent tool calls.

### 3.3 Positive confirmations

The §3 example graph is executable as designed: bind-then-convert preserves the variable binding across `create_component` (confirmed live), and the example's argument names match the real tool schemas.

---

## Verdict

The feature is worth building and the trust-boundary instincts (D3, D6, D7, D9) are right. The PRD is **not ready to implement**: it must be re-grounded on v2.3.2 (F1), the wire-protocol and state-model holes closed with explicit decisions (F2–F4), load-bearing terms defined (F5, F6), and the honest limits of the MVP's safety story recorded in SAFETY.md (F7, F14, F16). Recommended process: adopt the v2.3.2 revision discipline — convert F2–F6, F10, F12–F14 into decision blocks with options, and track anything genuinely unresolved as numbered OQs instead of declaring closure in revision 1.
