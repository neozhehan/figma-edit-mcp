# v2.3.3 Open Questions

> **Status.** Q1–Q8 (resolved 2026-07-09) are recorded in [`prd.md`](prd.md) (Q1 → D5; Q2 → D6; Q3 → D8; Q4 → D9; Q5 → Release identity; Q6 → D3; Q7 → D7; Q8 → Compatibility posture); their entries keep the options, pros and cons, and adopted resolutions. **Reopened 2026-07-10:** the follow-up adversarial review ([`revised-prd.md`](revised-prd.md)) made prescriptions that PRD Rev 11 deliberately did **not** adopt; each is tracked as Q9–Q15 below. Q9–Q14 were resolved the same day (PRD Revs 12–18; Q13 via a revised hybrid after live verification on channel `90vr`; Q14 reaffirming Q1 against the reversal); Q15 (release sizing) was resolved 2026-07-10 as **Option C** — a single v2.3.3 release containing every phase of the PRD (PRD Rev 19). **All fifteen questions are resolved; implementation is unblocked.** Rev 11 also corrected Q7's factual premise — see the note on that entry. **Reopened 2026-07-17:** the adversarial review of the Phase 3–4 *implementation* (working tree, pre-commit) found four gaps where the PRD under-specifies the fix; they are tracked as **Q16–Q19 below**. **All four were resolved 2026-07-18** (Q16: Option A; Q17: Option B; Q18: Option A; Q19: Option A) — Q16 in `prd.md` D9's code-inventory note (Rev 23) and the task-list header, with the legacy-error conversion it defers now specified by the [v2.3.4 PRD](../../v2.3.4/prd.md); Q17 in `prd.md` D5's pre-check-scope bullet (Rev 24); Q18 in `prd.md` D5's partial-disclosure bullet and D7's shared-vocabulary note (Rev 25); Q19 in `prd.md` D5's font-loading-order bullet (Rev 26). **Reopened again 2026-07-18:** the follow-up adversarial review of the Phase 3–4 implementation ([Phase-3-&-4-review.md](Phase-3-&-4-review.md)) raised two findings that need decisions rather than direct fixes — its P4-4 (`channel_join` envelope vs. the recorded v2.3.4 Q1 deferral) and P4-8 (an internal PRD contradiction on the dual-description marker) — tracked as **Q20–Q21 below**. The review's remaining findings are remediation work under the already-resolved decisions, not new questions. **Both were resolved 2026-07-18** — Q20 (Option A) in `prd.md` D9's `channel_join` pass-through note (Rev 28), with the split recorded in the [v2.3.4 PRD](../../v2.3.4/prd.md)'s Q1 context; Q21 (Option B) as the in-place correction of D5's Q14 sentence (Rev 29), with the marker tests upgraded to assert the emitted `tools/list`. **All twenty-one questions are resolved; Phase 4 closes when the review's remediation findings land.** They gate the finalization of Phase 4 (and Q16 gated the Phase 12 playbook), not the start of any other phase. A set of one-line ratifications from the same review is recorded at the end of this file.

This file records the unresolved decisions in [`prd.md`](prd.md) Track 2 (safety-contract gap closure). Each question lists the viable options with pros and cons, and a recommendation. The questions come from an adversarial re-review of the PRD against the source and against live plugin behavior (2026-07-09). Resolve each one by recording the decision in the PRD (new D-note or an edit to D5–D8) and deleting or checking off the entry here.

All recommendations apply one shared criterion: the primary consumer of this contract is an LLM. Prefer the option that maximizes **first-call correctness** (the model composes a correct call from the schema and guides alone) and **one-round-trip recovery** (when a call fails, the error itself tells the model how to fix it in one step). Q1 defines the criterion in full; the other recommendations apply it.

## Summary

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| Q1 | How do the schemas express conditional requiredness for the new D5 fields? | Phase 4 | ✅ **Resolved: Option B** (2026-07-09) — recorded as the D5 mechanism bullet in `prd.md` |
| Q2 | Phase 9's Gap 3 probe conflates schema rejection with the plugin error | Phase 9 | ✅ **Resolved: Option A** (2026-07-09) — recorded in `prd.md` D6 and Phase 9 |
| Q3 | What does SAFETY.md G2 say after the fix? | Phase 7 | ✅ **Resolved: Option A** (2026-07-09) — recorded in `prd.md` D8 and Phase 7 |
| Q4 | Which error-string convention do the new refusals use? | Phase 4 | ✅ **Resolved: Option A** (2026-07-09) — recorded as `prd.md` decision D9 |
| Q5 | Is a breaking tightening acceptable under a patch version number? | Phase 8 | ✅ **Resolved: Option A** (2026-07-09) — recorded in `prd.md`'s Release identity block |
| Q6 | D3 says the CI gate is "added last", but it is now Phase 3 of 9 | none (wording) | ✅ **Resolved: Option A** (2026-07-09) — D3 reworded in `prd.md` |
| Q7 | D7 edge semantics: `status` on early returns, formulas for the other aggregators | Phase 6 | ✅ **Resolved: Option A** (2026-07-09) — recorded in `prd.md` D7 and Phase 6 |
| Q8 | Confirm: hard cutover with no deprecation window | Phase 8 | ✅ **Resolved: Option A** (2026-07-09) — confirmed in `prd.md`'s Compatibility posture |
| Q9 | Batch envelopes: adopt the full effect-state algebra and content digests? | future D7 scope | ✅ **Resolved: Option B** (2026-07-10) — recorded in `prd.md` D7 and Phase 6; algebra and digests rejected |
| Q10 | Annotation retry identity: JCS/SHA-256 payload digests? | future D10 scope | ✅ **Resolved: Option B** (2026-07-10) — counts + list-before-retry confirmed in `prd.md` D10; digests rejected |
| Q11 | Channel identity: protocol digests, nonces, scope fingerprints? | future D13 scope | ✅ **Resolved: Option B** (2026-07-10) — D13 lite confirmed; digests rejected until evidence; race check → Phase 9 |
| Q12 | Page scans: pinned scheduler constants and heartbeat cadence? | future D14 scope | ✅ **Resolved: Option B** (2026-07-10) — bounded per-page timeout adopted in `prd.md` D14/Phase 10; constants rejected |
| Q13 | Connectors (Gap 9): verify-and-fix, full redesign, or leave as is? | Phase 11 | ✅ **Resolved: revised hybrid** (2026-07-10) — explicit-template core adopted, FigJam-only rejected; recorded in `prd.md` D12/Phase 11 |
| Q14 | Does the emitted-`tools/list` argument overturn Q1's Option B? | **Phase 4** | ✅ **Resolved: Option A** (2026-07-10) — Q1 reaffirmed, reversal rejected; recorded in `prd.md` D5 |
| Q15 | One release or two, and under which version number? | **before implementation** | ✅ **Resolved: Option C** (2026-07-10) — Single v2.3.3 release |
| Q16 | Which error codes exist? Inventory and granularity for the D5 refusals and fallbacks | **Phase 4 finalization, Phase 12** | ✅ **Resolved: Option A** (2026-07-18) — recorded in `prd.md` D9 (Rev 23); legacy conversion deferred to the [v2.3.4 PRD](../../v2.3.4/prd.md) |
| Q17 | How far does "validate the complete plan before the first write" go? | **Phase 4 finalization** | ✅ **Resolved: Option B** (2026-07-18) — recorded in `prd.md` D5 (Rev 24); alias-target and paints-present pre-checks added, value-type simulation rejected |
| Q18 | What shape does "reported explicitly as partial" take on non-batch tools? | **Phase 4 finalization** (vocabulary shared with Phase 6) | ✅ **Resolved: Option A** (2026-07-18) — recorded in `prd.md` D5 and D7 (Rev 25); the Q9 fields inside `error.details`, rollback rejected |
| Q19 | Font-loading order for new TEXT styles: real font or hardcoded default? | **Phase 4 finalization** | ✅ **Resolved: Option A** (2026-07-18) — recorded in `prd.md` D5 (Rev 26); hoist for updates only, creates read the real font, Inter guess rejected |
| Q20 | `channel_join` failures: how much of the P4-4 fix lands in v2.3.3? | **Phase 4 closure** (review P4-4) | ✅ **Resolved: Option A** (2026-07-18) — recorded in `prd.md` D9 (Rev 28); codes at origin, verbatim pass-through; envelope convergence stays with v2.3.4 Q1 |
| Q21 | Which dual-description wording is the contract, and where is it asserted? | **Phase 4 closure** (review P4-8) | ✅ **Resolved: Option B** (2026-07-18) — recorded in `prd.md` D5 (Rev 29); D5's example wording ratified, Q14 sentence corrected, tests assert emitted `tools/list` |

---

## Q1 — Conditional requiredness in the D5 schemas

**Status: ✅ resolved, 2026-07-09 — Option B adopted.** The decision is recorded in [`prd.md`](prd.md) as the D5 mechanism bullet: flat schemas (no discriminated union), the requirement stated in both the field description and the top-level tool description, server-side `.superRefine()` with actionable errors, and the plugin's fail-closed check retained as defense in depth. Phase 4 references it. The options and rationale below are kept for the record.

**Context.** D5 says the new verification fields are "required — in the schema and in the handler". But the fields are only conditionally required, and a flat Zod object cannot express that:

- `variable_manage` is one flat object with an `action` enum. `currentVariableName` applies only to `UPDATE_VARIABLE`; `collectionName` applies only to `CREATE_VARIABLE`.
- `style_manage` has no discriminator at all. `currentStyleName` is required only when `styleId` is present; `name` is required only on create.

Gap 3's lesson is that the schema is what teaches the model what to supply. Whichever option is chosen must not recreate the same mismatch for the D5 fields.

**Evaluation criterion.** The consumer of these schemas is an LLM. "Best" here means: the model composes a correct call on the first try (reasoning), and when a call fails, the error tells the model how to recover in one round trip (troubleshooting). The options trade these off differently: Option A prevents more errors; Option B makes the errors that happen cheap to recover from.

**Option A — discriminated union on the existing discriminator.** Restructure `variable_manage` as `z.discriminatedUnion("action", [...])` with one branch per action; each branch marks its own fields required.

- Pros: the requirement is machine-visible in the emitted JSON Schema (each branch carries its own `required` array), so the model is taught the contract structurally, not just told in prose. Validation fails at the earliest boundary. Each action's parameter set becomes self-documenting, which also removes today's "(for UPDATE_VARIABLE)" description noise. Error quality is acceptable: a discriminated union selects the branch by `action` first, so a missing field reports against the intended branch only (a terse `"Required"` at the field path), not the "all branches failed" mess of a plain union.
- Cons: a larger schema diff, and shared fields (`name`, `value`, `scopes`, …) get duplicated across branches, which triples the maintenance surface. zod-to-JSON-Schema emits the union as `anyOf`, which some MCP clients render poorly — and it would make `variable_manage` the one structurally alien schema among this server's ~40 flat tool objects, which is itself a reasoning cost. The default `"Required"` error is accurate but not instructive (it names the field, not the recovery). Critically, this option does not generalize: `style_manage` has no discriminator, so it would degrade to a plain `z.union` keyed on `styleId` presence, whose "invalid union" errors are the worst failure mode you can hand a model — the two tools would end up with different mechanisms.

**Option B — flat object + `.superRefine()` cross-field checks, requirement stated twice in prose.** Keep the flat shape; add refinements such as "if `action === "UPDATE_VARIABLE"` then `currentVariableName` must be present"; state the requirement in **both** the field description ("REQUIRED for UPDATE_VARIABLE — the variable's current name, passed back verbatim from `variable_list`") and the top-level tool description ("UPDATE_VARIABLE requires `currentVariableName`").

- Pros: easiest for the model to reason about — models read descriptions as carefully as structural constraints, the flat shape matches every other tool on this server, and stating the requirement twice makes first-call omissions rare in practice. Best-in-class troubleshooting: the superRefine error text is fully controlled, so it can carry the violation, the recovery tool, and the recovery step in one message ("currentVariableName is required for UPDATE_VARIABLE. Read the current name with variable_list and pass it back verbatim.") — exactly the error-playbook philosophy. One mechanism works identically for both tools, discriminator or not. Enforcement still happens server-side, before anything crosses the socket.
- Cons: refinements do not survive conversion to JSON Schema, so the machine-readable contract still says "optional" — a client that renders only the schema structure and ignores descriptions will not surface the requirement. First-call omissions stay possible; they fail fast with a good message rather than being prevented. This is a softer version of the mismatch Gap 3 fixes, mitigated (not eliminated) by the dual-description convention.

**Option C — description text + handler enforcement only.** Match the existing `create_component_set` precedent: the description says "required if X", and the plugin fails closed.

- Pros: smallest possible diff; the plugin (the trust boundary) remains the single enforcement point.
- Cons: recreates Gap 3 verbatim for the new fields: schema says optional, runtime requires. The failure costs a full socket round trip and the plugin error cannot know it came from an omitted-versus-mismatched field as cheaply as the server can. Produces avoidable failed calls, which the review demonstrated live.

**Recommendation.** Option B, for both tools. The deciding criterion is the consumer: an LLM reasons most reliably over a flat, consistent schema with the requirement stated in prose (twice), and recovers fastest from a custom error that embeds the fix. Option A's structural enforcement is worth less than it appears — it cannot cover `style_manage` at all, its default errors are terser than superRefine's custom ones, and it buys first-call prevention at the cost of a schema shape models and clients handle less well. Keep the plugin's fail-closed check as well (defense in depth, per AS1 — the server is not the trust boundary). Record in the PRD that conditional requiredness is: dual descriptions + superRefine with actionable errors (server) + fail-closed verification (plugin), uniformly for `variable_manage` and `style_manage`.

---

## Q2 — Phase 9's Gap 3 probe conflates two outcomes

**Status: ✅ resolved, 2026-07-09 — Option A adopted.** Recorded in [`prd.md`](prd.md): D6 gained a verification-split note (the "missing" branch of the reworded error stays as defense in depth; omission is tested at the schema boundary in Phase 5, mismatch is probed live in Phase 9), and Phase 9's probe list was updated to the two separate assertions. The options and rationale below are kept for the record.

**Context.** Phase 9 says: "create-tool call omitting `parentNodeName` rejected at the schema with the clearer error live." After D6 those are two different, mutually exclusive observations: once the schema requires the field, an omitted `parentNodeName` is rejected by the MCP validation layer and never reaches the plugin. The reworded `PARENT_NAME_MISMATCH` message's "missing" branch is unreachable from a conforming client; only the *mismatch* branch is observable live.

**Option A — split the probe.** (1) A server-side test asserts each create tool rejects a call missing `parentNodeName` at the schema boundary. (2) A live probe sends a *mismatched* `parentNodeName` and asserts the reworded plugin error. Keep the "missing or does not match" wording in the plugin as defense in depth for non-conforming or older clients.

- Pros: each layer is tested where it actually enforces; no unreachable claim in the verification plan; the plugin keeps its belt-and-braces wording at zero cost.
- Cons: slightly more test surface.

**Option B — keep one live probe, bypass the schema.** Drive the plugin over the raw socket without MCP validation to hit the missing-name branch directly.

- Pros: exercises the plugin's own defense in depth.
- Cons: needs bypass tooling; tests a path conforming clients cannot reach; more work for less relevant coverage.

**Option C — drop the "missing" branch from the reworded error.** Since conforming clients can no longer omit the field, keep the message mismatch-only.

- Pros: simpler message.
- Cons: older MCP server versions and non-conforming clients can still omit the field; the plugin is the trust boundary and should stay accurate on its own. The extra words cost nothing.

**Recommendation.** Option A. Under the shared criterion, the two layers do different jobs and the split probe tests each for its job: D6's schema requirement delivers first-call correctness (a conforming model cannot omit the field), and the reworded plugin error delivers one-round-trip recovery for the reachable failure — a *mismatched* name. That error's text should follow Q4's convention and embed the recovery step: re-read the parent's current name with `node_info` and pass it back verbatim.

---

## Q3 — Target wording for SAFETY.md G2

**Status: ✅ resolved, 2026-07-09 — Option A adopted.** Recorded in [`prd.md`](prd.md): D8 gained the target wording ("No write against an existing object proceeds unless the caller-supplied current name matches the resolved object's actual name — nodes, variables, styles, and collections alike. Creation verifies the identified parent or collection instead."), gated on the Phase 7 audit of every write tool against the rule; the agent guides state the rule in exactly one sentence. The options and rationale below are kept for the record.

**Context.** D8 lists fixing G2's "every write tool" claim as a task without giving the replacement text. Today the claim is false (the review proved it against G2's own Part B matrix). After D5 it becomes *nearly* true: creation has no existing object to verify (and `CREATE_VARIABLE` verifies the collection instead), so an unqualified "every write tool" would still be imprecise.

**Option A — strengthen G2 to a universal rule over existing objects.** For example: "No write against an existing object proceeds unless the caller-supplied current name matches the resolved object's actual name — nodes, variables, styles, and collections alike. Creation verifies the identified parent or collection instead." Point to the Part B matrix as the per-tool proof.

- Pros: the strongest honest claim, and it matches the post-D5 reality. One crisp rule is what the guarantee list is for; the mechanically-diffed matrix carries the per-tool detail.
- Cons: it must be exactly right — an audit of every write tool against the rule is required before publishing (the same overclaim happening twice would be embarrassing). The creation clause needs care.

**Option B — scope G2 to enumerated categories.** "Node writes, destructive design-system writes, and design-system updates require current-name verification," listing the tools.

- Pros: explicit and auditable; harder to overclaim by accident.
- Cons: verbose; the list drifts as tools are added; a weaker headline than the project can now honestly make.

**Recommendation.** Option A, with the audit folded into Phase 7 (the safetyContract mechanical diff already provides most of it). The shared criterion favors A directly: an agent internalizes one rule better than a membership list. "Any write to an existing object needs its current name" produces correct first calls even on tools the agent has not used before, whereas an enumerated list invites wrong guesses at its boundary. The agent guides should state the rule in exactly one sentence; the Part B matrix carries the per-tool proof for auditors.

---

## Q4 — Error-string convention for the new refusals

**Status: ✅ resolved, 2026-07-09 — Option A adopted.** Recorded in [`prd.md`](prd.md) as new decision **D9**: `Operation Denied:` prefix, centrally defined strings, an error-playbook entry per refusal, and every message embeds its own recovery (distinct cause, the read tool that supplies the correct value, "pass it back verbatim"), with the per-message acceptance check. D9 governs the D5 verification errors, the D5-mechanism superRefine messages, and D6's reworded parent-name error. The options and rationale below are kept for the record.

**Context.** The project's guard refusals use the `Operation Denied: …` prefix (`style_delete`, `variable_delete`, all dispatcher guards). But the existing variable-update verification error — the one whose operands D5 fixes — is handler-local and unprefixed ("Variable name verification failed. Expected …"). D5/D6 add several new refusals (`currentStyleName` missing/mismatch, `collectionName` mismatch, `currentVariableName` missing) without saying which convention they follow or where the strings live.

**Option A — adopt `Operation Denied:` everywhere, define the strings centrally, add playbook entries.** New and updated verification errors use the prefix, live alongside the other guard messages (main.ts `ERRORS` or a shared plugin constants module), and each gets an `error-playbook.md` entry with the recovery step ("read the current name, pass it back verbatim").

- Pros: one recognizable refusal grammar for agents and for the playbook; SAFETY.md's error table stays uniform; recovery guidance keys off the prefix.
- Cons: changing the existing message text can break tests that assert on it (they must be updated in the same change); central definition means the asset handlers import from a shared module they do not use today.

**Option B — keep handler-local strings; fix operands only; add playbook entries.**

- Pros: minimal diff.
- Cons: permanently two error styles for the same class of refusal; the playbook and any prefix-matching logic must handle both patterns forever.

**Recommendation.** Option A, and the shared criterion sharpens what the convention must contain: a recognizable prefix is only half the job. Every refusal must embed its own recovery so a failed call costs exactly one round trip — name the cause distinctly (missing vs. mismatched vs. stale), name the read tool that provides the correct value (`variable_list`, `style_list`, `node_info`), and say "pass it back verbatim". The repo already contains the model example — the instance-interior delete refusal names both alternatives ("Edit the main component, or use instance overrides") — and the counterexample this release fixes (`PARENT_NAME_MISMATCH` steers the agent toward the wrong field). Acceptance check for each new message: an agent given only the error text and the tool list can produce the correct retry without further discovery. The test churn is bounded and happens once.

---

## Q5 — Breaking tightening under a patch version number

**Status: ✅ resolved, 2026-07-09 — Option A adopted.** Recorded in [`prd.md`](prd.md)'s Release identity block as policy, not precedent: fail-closed safety tightenings may ship at patch level; the release stays 2.3.3; the CHANGELOG carries the breaking-change notice; revisit only if external integrators are known to pin versions. The options and rationale below are kept for the record.

**Context.** The PRD's identity block now describes deliberate fail-closed breaking changes for agent callers, but the release keeps the patch number 2.3.3, and no rationale is recorded. Project precedent cuts the other way from semver: v2.2.0 tightened permissions as a minor, v2.3.2 hardened atomicity as a patch.

**Option A — keep 2.3.3 and record the rationale.** State in the PRD that the project versions the *safety contract's strength* (tightenings may ship at patch level, following v2.3.2), and that the CHANGELOG carries the breaking-change notice.

- Pros: no renumbering churn across the five version surfaces; consistent with the project's own history; the release plumbing in the PRD already says 2.3.3 everywhere.
- Cons: semver-literal integrators who pin a minor version get behavior changes in a patch; the argument "we did it before" is not a policy.

**Option B — renumber to 2.4.0 (or split: 2.3.3 = Track 1 only, 2.4.0 = Track 2).**

- Pros: semver-honest signaling of the breaking tightening; the split variant also decouples an infrastructure release from a contract release, so either can be rolled back alone.
- Cons: renumbering touches every version surface and this PRD's identity; the split doubles release overhead for two small tracks.

**Recommendation.** Option A, with the rationale written down as policy ("fail-closed tightenings may ship at patch level") rather than as precedent. Revisit only if external integrators are known to pin versions. The shared criterion is nearly neutral here — agents do not reason from version numbers. What the criterion does require is that the guides an agent loads at runtime describe the server it is actually talking to; that is guaranteed by shipping the guides and schemas in the same artifact (already the case) and is independent of which number is chosen. Decide this one on release-management grounds.

---

## Q6 — D3's "must be added last" wording

**Status: ✅ resolved, 2026-07-09 — Option A adopted and applied.** D3 in [`prd.md`](prd.md) now sequences the gate by condition ("only after D1/D2 bring the error count to 0"), notes that it lands as Phase 3 so the Track 2 handler edits are protected by it, and marks the clarification as this resolution. The options below are kept for the record.

**Context.** D3 still says the CI type gate "must be added **last** — after D1/D2 bring the error count to 0". That was written when the release was type-check only. The gate is now Phase 3 of 9, and that is the *better* order: it protects the Phase 4–6 handler edits.

**Option A — reword to the condition.** "Added only after Phases 1–2 bring the residual to zero" (sequencing by condition, not position).

- Pros: preserves the real intent; removes the contradiction; keeps the gate protecting Track 2.
- Cons: none.

**Option B — literally move the gate to the final phase.**

- Pros: makes the current sentence true.
- Cons: the Track 2 handler edits then land without the type gate — strictly worse. Rejected.

**Recommendation.** Option A. (The shared criterion does not bear on this question — it is internal PRD wording with no agent-facing surface.)

---

## Q7 — D7 edge semantics for `status`

**Status: ✅ resolved, 2026-07-09 — Option A adopted.** Recorded in [`prd.md`](prd.md): D7 gained an edge-semantics note (shared count-derived formulas, `status` on every return path with early returns ⇒ `"failed"`, the `success === (status === "success")` invariant, actionable per-item reasons), and Phase 6 plus the testing list carry the property test. The options and rationale below are kept for the record.

> **Rev 11 correction (2026-07-10).** This entry's premise that zero-item batches were schema-unreachable was **wrong** — no batch array had `.min(1)`, and `[]` passed validation live. D7 as amended keeps the Option A invariants and adds the `.min(1)` boundary, the three-layer rejection model, and one-row-per-input semantics; see prd.md Gap 7.

**Context.** Phase 6 gives the corrected `success` formula only for `deleteMultipleNodes`. Unspecified: (a) whether the other three aggregators change anything beyond gaining `status`; (b) what `status` is on `setInstanceOverrides`' several early-return `{success:false, message}` paths, where no per-item aggregation ran; (c) the zero-item edge case.

**Option A — one shared invariant, `status` on every batch return path.** Specify: `succeeded > 0 && failed === 0 ⇒ "success"`; `succeeded > 0 && failed > 0 ⇒ "partial_success"`; `succeeded === 0 ⇒ "failed"`. Early returns where nothing was attempted are `"failed"`. The boolean is derived: `success === (status === "success")` — one testable invariant across all four aggregators. Zero-item batches are already unreachable through the schemas (non-empty arrays required); assert in the handler anyway.

- Pros: consumers can always branch on `status` without checking for its absence; one invariant, one property test; the three already-correct booleans do not change value, they just gain the field.
- Cons: touches every return path of `setInstanceOverrides`, including error paths that are awkward to unit test.

**Option B — add `status` only to the main aggregation loops.** Early returns keep their current shape.

- Pros: smallest diff.
- Cons: `status` becomes sometimes-present, so every consumer must handle its absence — which undermines the point of making partial success first-class.

**Recommendation.** Option A, extended by the shared criterion in two ways. For first-call correctness in *interpreting* results: `status` must be present on every return path so the model can branch on it without first reasoning about whether the field exists, and the batch tools' descriptions must state the tri-state contract so the model checks `status` from its first call rather than learning it from a surprise. For one-round-trip recovery: every failure entry in `results` must carry an actionable per-item reason, so a `partial_success` response lets the agent retry exactly the failed items in a single follow-up call — no re-discovery, no re-running the succeeded items. The `success === (status === "success")` invariant guarantees the model is never asked to reconcile two conflicting signals, which is the failure mode Gap 5 demonstrated live.

---

## Q8 — Confirm the hard cutover (no deprecation window)

**Status: ✅ resolved, 2026-07-09 — Option A confirmed.** The hard cutover is now an explicit decision, recorded in [`prd.md`](prd.md)'s Compatibility posture section with the rationale (a warning on a successful result is the signal agents ignore; with D5's dual descriptions and D9's self-recovering errors the migration cost is one recovery round trip per agent). The options below are kept for the record.

**Context.** The newly required fields take effect immediately; there is no transitional release where the plugin warns but still performs the unverified write.

**Option A — hard cutover (current PRD posture).** Calls missing the new fields fail with structured errors that name the missing field; the updated guides show the recovery.

- Pros: the unverified-write vulnerability closes on day one; failing closed is the safe direction; agents recover in one round trip by reading the current name.
- Cons: every existing agent configuration that updates variables or styles breaks on first use until it reads the new contract.

**Option B — one warn-only transitional release.** The plugin logs or returns a warning but still executes unverified asset writes for one version.

- Pros: gentler migration for integrators.
- Cons: the vulnerability this release exists to close stays open for the whole window; a warning attached to a *successful* result is exactly the signal agents are known to ignore (Gap 5's lesson); adds a release cycle.

**Recommendation.** Option A — confirm the hard cutover. For a safety fix, a grace period is a period in which the fix is off. The shared criterion settles this rather than softening it: a warning attached to a successful result is precisely the signal agents are known to ignore (Gap 5's lesson), so Option B buys no real migration safety for LLM callers. With Q1's dual descriptions preventing most first-call omissions and Q4's self-recovering errors, the cutover's entire migration cost is one recovery round trip per affected agent — exactly the budget the criterion allows.

---

## Q9 — Batch envelopes: how much mutation truth goes into the result?

**Status: ✅ resolved, 2026-07-10 — Option B adopted (PRD Rev 12).** Recorded in [`prd.md`](prd.md): D7's edge-semantics note gained the partial-mutation disclosure bullet (`partialMutation: true` + plain-language what-changed + before-values on text/instance failure rows; additive fields; clean failures never carry the flag), Phase 6 implements and tests it, and the full effect-state algebra and SHA-256 content digests are recorded as **rejected** on the shared criterion. The options and rationale below are kept for the record.

**Context.** D7 as amended returns `status`, counts including `skippedCount`, and one ordered row per input with actionable reasons. The follow-up review proposes going much further: a top-level `effectState: "none" | "committed" | "rolled_back" | "partial"`, a per-row `mutationState` with a closed status×state combination table and precedence rules, immutable per-row `target` descriptors, tool-specific strict `effects` objects, and SHA-256 digests of before/after text content. The underlying failure mode is real — a failed item can leave partial mutation (the follow-up review reports text font fallback before character assignment and instance swap-before-overrides; the ordering claims are partially verified) — but the proposed reporting apparatus is large.

**Option A — adopt the full algebra (revised-prd D7).**

- First-call correctness: **negative.** The result contract the model must internalize before its first batch call grows from one tri-state field to `status` × `effectState` × `mutationState` plus a closed combination table with precedence rules — more to hold, more ways to misread a valid response. Q7 chose a single derived field precisely so the model never reconciles conflicting signals.
- One-round-trip recovery: **incomplete despite the machinery.** The states tell the model *that* something changed, but a SHA-256 digest cannot tell it *what to write back* — a hash is not invertible by any consumer, least of all an LLM. Restoring still requires a follow-up read, so the text-mutation case remains a two-round-trip recovery after paying the full complexity cost.
- Other: complete post-failure truthfulness; property-testable invariants for auditors; blind retry structurally impossible; large implementation and test surface.

**Option B — minimal per-row partial-mutation disclosure.** Where a tool can demonstrably mutate and then fail (text content, instance overrides), the failure row's error details gain a `partialMutation: true` flag plus a plain-language statement of what changed, with cheap before-values where available (the original text string, the original `mainComponentId`). No top-level algebra, no digests.

- First-call correctness: **neutral.** The happy-path envelope is unchanged, so nothing new must be internalized before the first call; the disclosure fields appear only inside failure rows the model is already required to read.
- One-round-trip recovery: **strongest of the three.** The failure row carries the restoring value itself — the original string, the original `mainComponentId` — so the corrective write can be composed directly from the error. Exactly one round trip, no re-read.
- Other: not a closed algebra — per-tool fields instead of one invariant; auditors get prose, not a provable state machine; future batch tools must remember to disclose.

**Option C — nothing beyond Rev 11's D7.**

- First-call correctness: **neutral now, corrosive later.** The contract stays small but asserts something false — that `failed` implies no effect. A model that learns the documented contract composes its follow-up calls from a wrong world model.
- One-round-trip recovery: **broken in the partial-mutation case.** Q7's own guidance ("retry exactly the failed items") becomes actively harmful — retrying a half-mutated item can compound the damage — and no signal tells the model a re-read is needed. This is not a slow recovery; it is a recovery the model does not know to attempt.
- Other: zero cost.

**Recommendation.** Option B. Weighing the two criteria across the options: on first-call correctness, B is neutral, A imposes a materially heavier result contract, and C quietly falsifies the existing one. On one-round-trip recovery, B is the only option that actually achieves it — the error carries the restoring value — while A's digests still force a second round trip and C removes the recovery signal entirely. A's remaining advantage (auditable invariants) serves a consumer the shared criterion ranks secondary.

---

## Q10 — Annotation retry identity: payload digests or counts?

**Status: ✅ resolved, 2026-07-10 — Option B adopted (PRD Rev 13).** Recorded in [`prd.md`](prd.md): D10 gained a retry-identity note confirming per-item before/after counts plus list-before-retry as the contract and recording the JCS/SHA-256 payload digest as **rejected** on the shared criterion — an LLM cannot compute a hash, and in the timeout scenario the digest exists for, no digest ever reached the model; read-and-compare via `annotation_list` is one round trip within the model's native capability. The options and rationale below are kept for the record.

**Context.** D10 ships append-only annotations with per-item before/after counts and list-before-retry guidance. The follow-up review proposes a canonical `annotation-payload-v1` digest — RFC 8785 JSON Canonicalization plus SHA-256, computed on append and recomputed by `annotation_list` — so a caller can match a specific append attempt after a timeout or unknown outcome.

**Option A — adopt the JCS/SHA-256 payload digest.**

- First-call correctness: **slightly negative.** Append targets and list output grow opaque digest fields the model must understand to use the tools as documented; opaque tokens in a schema invite misuse (a model cannot compute SHA-256, so any instruction that implies computing or verifying one is uncomposable).
- One-round-trip recovery: **inert under the adopted scope.** An LLM can only *string-compare* a digest the server previously handed it. In the exact scenario the digest exists for — a timeout, where the append response never arrived — the model holds no digest to compare against; usable digest recovery presupposes the deferred `COMMAND_OUTCOME_UNKNOWN` detail machinery (Q9's full-algebra sibling). Standing alone, A does not shorten recovery by even one step.
- Other: deterministic identity for code-level consumers; canonicalization + hashing dependency inside the plugin sandbox; identical appends remain indistinguishable anyway, by the review's own admission.

**Option B — keep counts + list-before-retry (current D10).**

- First-call correctness: **neutral to positive.** A smaller, plain-shape contract with nothing opaque in it — the model composes appends and interprets results from fields it can fully read.
- One-round-trip recovery: **achieved within the model's native capability.** After an uncertain outcome, one `annotation_list` call returns labels the model literally reads and compares against what it sent — one round trip, no computation the model cannot perform.
- Other: comparison is textual rather than canonical (whitespace-different near-duplicates could confuse); identical-text duplicates stay ambiguous — exactly as under Option A.

**Recommendation.** Option B. On first-call correctness, A adds opaque schema surface with no compositional gain; on one-round-trip recovery, A is paradoxically *weaker* under the adopted scope — no digest ever reaches the model in the failure case that matters — while B's read-and-compare is one round trip using nothing but the model's ability to read text. B dominates on both criteria; A only ties if Q9's deferred machinery is adopted first, which is the wrong direction of dependency for a recovery aid.

---

## Q11 — Channel identity: how deep should the handshake go?

**Status: ✅ resolved, 2026-07-10 — Option B adopted (PRD Rev 14).** Recorded in [`prd.md`](prd.md): D13 gained a handshake-depth note confirming the lite core and recording protocol digests, nonces, and scope fingerprints as **rejected until evidence**, with the escalation trigger written down (a live same-version different-contract skew that version fields could not have caught). The unverified `ui.html` scope-ready race is adopted as a Phase 9 verification task with its fix defined (UI waits for plugin-main's scope acknowledgement before joining). The options and rationale below are kept for the record.

**Context.** D13 (lite) fixes the verified holes: plugin identity and build version in the join, one-plugin/one-MCP binding, pair-only routing, real leave/reset, fail-closed empty/ambiguous/mismatched channels. The follow-up review proposes a canonical machine-readable protocol contract with a generated JCS/SHA-256 digest compiled into both builds (`gen:protocol-digest`, `check:generated`), plugin-main scope-ready acknowledgements with nonces and revisions, and a `scopeFingerprint` over a strict scope-identity object.

**Option A — adopt the full apparatus.**

- First-call correctness: **marginal gain over lite.** The guarantee that matters to the criterion — the schema and guides the model read describe the peer that will execute — is already delivered for every *released*-version skew by D13 lite's version fields. Digests extend it only to same-version dev-build skew: a contributor-workflow hazard, not an agent-facing one.
- One-round-trip recovery: **no improvement.** `PROTOCOL_MISMATCH` and `VERSION_MISMATCH` alike are not model-recoverable — the fix is a human reinstall or rebuild. The model can relay the error in one step under either option; nonces and fingerprints add join failure modes without adding any recovery the model can execute.
- Other: mechanical skew detection for CI; a code-generation subsystem to build and maintain; still self-reported, as the review itself concedes.

**Option B — keep D13 lite; escalate only on evidence.** Add the digest machinery if and when a real incident occurs that version fields would have missed, and verify/fix the `ui.html` scope-ready race as its own small finding.

- First-call correctness: **secures the class that reaches agents.** Version fields plus the one-plugin/one-MCP binding ensure the model's schema matches the bound executor in all normal operation — and the binding is the larger first-call win: without it, a response from the *wrong* plugin silently corrupts the model's world model and poisons every subsequent call it composes.
- One-round-trip recovery: **equal to A, plus one structural improvement.** Refusals name the version pair for a one-step relay to the user — same as A. And pair-correlated responses mean every error the model recovers from provably came from the peer it addressed, so recovery guidance is never built on another peer's answer.
- Other: no new environmental failure modes; evidence-triggered escalation; same-version dev-build skew stays undetectable until it happens once; the scope-ready race remains unverified until checked.

**Recommendation.** Option B, plus promptly verifying the scope-ready race. On one-round-trip recovery the options are equivalent — both end in a one-step relay to a human. On first-call correctness, everything the criterion cares about (matching schema, bound executor, uncorrupted response attribution) is delivered by lite; A's increment protects only a contributor-side hazard, purchased with new environmental refusals for every user. When both criteria tie or favor lite, the smaller surface wins.

---

## Q12 — Page scans: pinned scheduler constants or implementation freedom?

**Status: ✅ resolved, 2026-07-10 — Option B adopted (PRD Rev 15).** Recorded in [`prd.md`](prd.md): D14 gained a scheduling-depth note adopting a single bounded per-page timeout (hung loads become structured `PAGE_LOAD_TIMEOUT` errors; the value is implementation behavior, not contract) and recording the pinned constants, concurrency caps, deadlines, and heartbeat cadence as **rejected** — all model-invisible. Phase 10 implements it with the late-settlement test (a load settling after its timeout is provably ignored). The options and rationale below are kept for the record.

**Context.** D14 (lite) isolates per-page `loadAsync` failures, adds `coverage`, and makes destructive scans fail closed explicitly. The follow-up review additionally pins `PAGE_LOAD_TIMEOUT_MS = 12_000`, `PAGE_SCAN_CONCURRENCY = 5`, `PAGE_SCAN_DEADLINE_MS = 60_000`, a 2,000 ms progress-heartbeat cadence, command-token suppression of late-settling loads, and fake-clock worst-case tests (25 pages, all timing out).

**Option A — adopt the pinned scheduler spec.**

- First-call correctness: **neutral.** Constants, concurrency caps, and heartbeat cadence are invisible in the schema and guides; they change nothing about how the model composes a call or interprets a result.
- One-round-trip recovery: **equal to B.** The model-visible artifact is the same structured `PAGE_LOAD_TIMEOUT` / `coverage` object either way; deterministic internal timing does not change the error the model receives or the recovery step it takes.
- Other: testable worst-case behavior on pathological documents; constants-as-contract must be amended whenever a real document proves them wrong; a significant fake-clock test investment for a failure profile observed only once.

**Option B — D14 lite plus one bounded per-page timeout.** A single per-page timeout (value chosen in implementation, documented as behavior rather than contract) so a hung load becomes a `PAGE_LOAD_TIMEOUT` page error; everything else stays as D14 lite.

- First-call correctness: **neutral** — nothing schema-visible differs from A.
- One-round-trip recovery: **secures its precondition.** Recovery requires an error to exist. The timeout converts a hung `loadAsync` into a structured page error with coverage, from which the model decides in one step: retry that page, or proceed on the partial data it was honestly given.
- Other: constants stay tunable without contract changes; late-settlement suppression is deferred, so a very late resolution after timeout must be proven harmless — a small residual to test.

**Option C — D14 lite as adopted, no timeout.**

- First-call correctness: **neutral.**
- One-round-trip recovery: **violated at the root.** A permanently hung load returns *nothing* — no error, no envelope, and a wedged serialized queue behind it. That is not a slow recovery; it is the absence of the signal the entire recovery convention depends on, for this call and every call queued after it.
- Other: smallest.

**Recommendation.** Option B. First-call correctness cannot separate these options — nothing model-visible differs. One-round-trip recovery decides it alone: C permits a failure with no error at all, the one state the D9 convention cannot recover from, while A adds nothing model-visible beyond B's timeout. Pay for exactly the piece that keeps every failure answerable.

---

## Q13 — Connectors (Gap 9): verify-and-fix, full redesign, or leave as is?

**Status: ✅ resolved, 2026-07-10 — revised hybrid adopted (PRD Rev 17).** Neither original option as written: verification (Rev 16) shifted the recommendation to a hybrid, adopted in [`prd.md`](prd.md) D12 and new Phase 11 — Option A's frame (tool keeps its purpose and Design-file support; FigJam-only explicitly rejected because the flagship reaction-flow use case lives in Design) with Option B's explicit-template core (creation-only; required name-verified `connectorId` + `connectorName` per call; cache and auto-adoption removed; `CONNECTOR_TEMPLATE_REQUIRED` bootstrap error; D7 envelope; D11 cleanup). Deciding evidence: the bootstrap dead-end means template discovery happens at least once regardless, so the hidden default bought nothing while costing first-call correctness on every call; and fixing the cross-file cache in place converges to the same cost as removing it. The options and rationale below are kept for the record.

**Context.** The follow-up review reports five connector defects (unscoped `currentPage` template discovery, a cross-file `clientStorage` cache, no name verification for `connectorId`, per-item failures without cleanup, and an unconditionally `success: true` aggregate) and prescribes a redesign: remove default-template management and the cache entirely, require an explicit template and page parent on every call, and restrict creation to FigJam.

> **Verification completed (2026-07-10, PRD Rev 16 — source read + live probes on channel `90vr`).** All five defects are **confirmed**, plus two the review understated: the aggregate's `count` counts error rows as created connections, and a cursor created for a start endpoint leaks when the end endpoint of the same item fails. Live in a Design file: the no-default flow, the type-only template check, and the bootstrap dead-end ("copy a connector from FigJam manually") all reproduced; the clone/cursor-leak and mixed-result probes are blocked pending a FigJam connector fixture and stand on source evidence. Option A's "verify first" step is therefore done — choosing A now means green-lighting the minimal in-shape fix; the evidence bar for B (structural hidden-state problems) is discussed in the recommendation.

**Option A — verify first, then a minimal in-shape safety fix.** Re-verify the five findings against `connectorHandlers.ts`; fix what is confirmed within the existing tool shape (add `connectorName` verification, scope-check the discovery scan, honest D7-style aggregation, per-item cleanup), and remove capabilities only if verification shows a path is unsalvageable.

- First-call correctness: **improved where it is verifiably broken.** The fix must either expose or remove the hidden default-template state: today a call's outcome can depend on a cached template that appears nowhere in the schema or guides — a first-call correctness defect by definition, because the model cannot compose correctly from state it cannot see.
- One-round-trip recovery: **restored by honest aggregation.** If the unconditional `success: true` is confirmed, connector failures are currently invisible — no error means no recovery of any length. D7-style aggregation plus D9 messages give every connector failure a recovery step.
- Other: evidence-first, matching the standard every other item in this PRD was held to; preserves capability; two-step latency — both criteria stay degraded until the follow-up lands.

**Option B — adopt the full redesign (revised-prd D12) now.**

- First-call correctness: **the strongest option on this criterion.** An explicit template and page parent on every call puts every input the outcome depends on into the arguments — the model composes entirely from what it reads, at the cost of one guided prerequisite read (template discovery) that the guides can teach.
- One-round-trip recovery: **equal to A after A's fix** — honest aggregation and structured, recovery-bearing refusals either way; B adds nothing on this axis that A's minimal fix does not.
- Other: acts on unverified findings; removes shipped default-template management by fiat — a product regression for existing FigJam workflows; the largest single-tool change in the whole proposal.

**Option C — leave connectors unchanged indefinitely.**

- First-call correctness: **degraded, knowingly.** Hidden cached state keeps steering outcomes the model cannot predict from the contract it reads.
- One-round-trip recovery: **absent in the worst case.** If the unconditional success stands, a failed connector batch tells the model nothing went wrong — and the false success then poisons the *next* first call, when the model references connectors that were never created. The two criteria fail jointly: no recovery now, wrong composition later.
- Other: zero cost.

**Recommendation.** Option A — scoped by the criteria: the verification targets the two criteria-relevant defects first (hidden default state → first-call correctness; unconditional success → recovery), and the minimal fix must close both, not merely the cheapest subset. Weighing the options: C fails both criteria outright and compounds them; B is the best pure-criteria end state but buys its first-call advantage with unverified claims and a capability removal decided by fiat; A reaches B's recovery guarantee exactly and most of its first-call guarantee once verified, deferring only the product question. If verification shows the hidden-state design is unsalvageable, adopt B's explicit-template model at that point — the criteria would then point there with evidence behind them.

---

## Q14 — Does the emitted-`tools/list` argument overturn Q1's Option B?

**Status: ✅ resolved, 2026-07-10 — Option A adopted (PRD Rev 18).** Recorded in [`prd.md`](prd.md): D5's mechanism bullet gained a reaffirmation note — the Q1 decision stands, the discriminated-union reversal (including `style_manage`'s new required `action` field) is **rejected**, CI expresses requiredness at the level the mechanism supports (`safeParse`-behavior tests plus description-marker tests), and the revisit trigger is written down (live evidence of agents omitting the twice-documented fields at a meaningful rate). Phase 4 references the reaffirmed mechanism. The options and rationale below are kept for the record.

**Context.** Q1 chose Option B (flat schemas, requirements stated twice in prose, `.superRefine()` enforcement, plugin fail-closed backstop). The follow-up review argues for reversal: refinements do not appear in the emitted `tools/list` JSON Schema, so the machine-readable contract still marks D5's fields optional, and a CI rule of the form "a required field missing from emitted `tools/list` fails CI" is unsatisfiable under Option B. Its proposal: `z.discriminatedUnion("action", …)` for `variable_manage`, plus a **new required `action` discriminator** for `style_manage`, with strict per-action members and output unions.

**Option A — reaffirm Option B, adapt the CI check.** Keep the Q1 decision; express the CI guarantee at the level Option B can support: `safeParse`-behavior tests (omission rejected, with the actionable message) plus description-content tests (the "REQUIRED for …" marker present in both field and tool descriptions).

- First-call correctness: **strong for the actual consumer.** Models weight field and tool descriptions heavily; the requirement stated twice, in a flat shape consistent with all ~40 sibling tools, is the form the primary consumer reads best. The residual gap is structural-schema-only consumers (schema-driven codegen), which the criterion explicitly ranks secondary — and enforcement is server-side pre-socket either way, so no unverified write gets through regardless.
- One-round-trip recovery: **best available.** `.superRefine()` messages are fully authored — violation, the read tool that supplies the correct value, "pass it back verbatim" — so the D9 acceptance check (correct retry derivable from the error alone) is satisfiable by construction.
- Other: the CI check tests behavior and prose rather than a JSON-Schema `required` array — softer, easier to drift; decision continuity (the tools/list limitation was known and accepted when Q1 was decided).

**Option B — adopt the reversal (revised-prd D5 mechanism).**

- First-call correctness: **gains for structural readers, mixed for LLMs, one guaranteed regression.** The `required` arrays become machine-visible — a real gain for codegen consumers. For the LLM consumer it is a wash at best: the `anyOf` union is the lone alien shape on a server of flat tools (a pattern-generalization cost), and `style_manage`'s brand-new required `action` field guarantees a first-call failure for every existing caller during migration — a certain, immediate first-call cost paid to prevent a hypothesized one.
- One-round-trip recovery: **weaker by default.** Discriminated-union validation errors report a terse `"Required"` at a path — accurate, not instructive; authoring D9-quality recovery messages inside union branches is possible but harder to build and maintain than one superRefine message.
- Other: silently-ignored per-action fields become structurally impossible; shared fields duplicate across branches; `anyOf` rendering varies across MCP clients.

**Option C — hybrid: union for `variable_manage`, Option B for `style_manage`.**

- First-call correctness: **undermined by inconsistency.** The model generalizes calling patterns across a server; two mechanisms on two sibling tools break exactly that generalization, so the hybrid's per-tool gains are offset by a cross-tool cost.
- One-round-trip recovery: **split** — superRefine-quality messages on one tool, terse union errors on the other; the model cannot learn one recovery pattern.
- Other: partial CI coverage; two mechanisms to maintain indefinitely.

**Recommendation.** Option A. This is the one question where the two criteria are the entire subject, and they point the same way: on first-call correctness, A serves the primary consumer at least as well as B while avoiding B's guaranteed migration failures and C's inconsistency penalty; on one-round-trip recovery, A is strictly strongest — authored recovery messages versus terse union errors. B's real gain, machine-checkable advertisement, protects a secondary consumer and duplicates enforcement the server already performs. Revisit only if live usage shows agents omitting the twice-documented fields at a meaningful rate — evidence that would move the first-call column toward B.

---

## Q15 — One release or two, and under which version number?

**Status: ✅ resolved, 2026-07-10 — Option C adopted**

**Context.** Q5 approved shipping the *original* Track 2 (three gaps) at patch level. Rev 11 roughly triples Track 2: D10–D14 add an annotation contract repair, recursive strictness, containment surgery across nine paths, a socket peer-binding change, and page-coverage semantics. The PRD's own risk table flags reviewability. The revised-prd's escape hatch ("if implementation cannot stay reviewable, split the release") exists but defers the decision to mid-implementation.

**Option A — split now, along the phase boundary.** Release one (v2.3.3): Phases 1–7 — type-check restoration, structured error transport, design-system verification, explicit parents, batch corrections, annotation repair, recursive strictness. Release two (v2.4.0): Phases 8–11 — containment, peer binding, page isolation, and the Q13 connector repair.

- First-call correctness: **maximized soonest.** Nearly every repair that changes what the model composes or reads — required fields advertised in the schemas, the annotation schema made usable at all, recursive strictness rejecting misremembered nested fields, output field names corrected — lives in Phases 1–7 and reaches agents a full release earlier. Phases 8–11 mostly touch execution-side guarantees (containment, binding, page coverage); the connector repair is the one model-facing contract change in the second batch, and its old contract is unusable-to-dangerous anyway (unconditional success), so delaying it costs less than delaying the Phase 1–7 repairs.
- One-round-trip recovery: **likewise front-loaded.** The entire recovery convention — structured `{error}` transport and the D9 recovery-bearing messages — ships in release one. Every week of delay under a single release is a week agents keep receiving string-flattened errors and Gap 5/6-class false signals they cannot recover from.
- Other: two release cycles, two contract-doc/guide sync passes, some CHANGELOG duplication; the containment and peer-binding holes stay open until release two — but those are the changes the model cannot observe in its contract either way.

**Option B — one release, renumbered 2.4.0.**

- First-call correctness: **identical end state, delayed.** Every schema repair the model would compose from waits on the slowest and least contract-relevant workstream (socket and page-scan surgery); agents live longest against the contract that currently lies to them.
- One-round-trip recovery: **identical end state, delayed** — same reasoning: the D9 convention and structured transport are held hostage to work that adds nothing on this axis.
- Other: one cycle; the minor bump honestly covers the full breaking surface; the reviewability risk the PRD itself flags arrives in full.

**Option C — one release at 2.3.3 (status quo per Q5).**

- First-call correctness / one-round-trip recovery: **exactly as Option B** — the delay profile is identical; only the number on the tin differs, and the model does not read version numbers (established in Q5).
- Other: no renumbering churn; Q5 policy continuity — though Q5's own rationale ("restores or strengthens a published contract") is stretched past its meaning by a redesigned envelope, removed annotation fields, and new join refusals.

**Recommendation.** Option A. Version numbers are criterion-neutral (Q5), so the two criteria reduce this question to *when the model-facing repairs ship*: A delivers essentially all of the first-call-correctness and recovery improvements in release one, while B and C deliver the same improvements later for no gain on either axis. Reviewability — the PRD's own flagged risk — points the same direction, so no trade-off remains between the criteria and the release logistics.

**Decision (2026-07-10, recorded in PRD Rev 19).** **Option C adopted** — v2.3.3 ships as a single release containing every phase of the PRD. One release cycle, one contract-doc/guide sync pass, no renumbering churn, and Q5 policy continuity outweighed the split's earlier-shipping argument; the reviewability risk is carried by the mitigations already in the PRD's risk table (per-phase commits in dependency order under the Phase 3 type gate; rebuild diffs).

---

## Q16 — Which error codes exist? Inventory and granularity for the D5 refusals and fallbacks

**Status: ✅ resolved, 2026-07-18 — Option A adopted.** Recorded in [`prd.md`](../prd.md) D9 as the code-inventory note (Rev 23), with the amended inventory in the task-list header. The ratified inventory: the ten operational codes plus the six D5 verification codes, each with a Phase 12 playbook entry, plus `UNKNOWN_ERROR` as the documented legacy fallback with its own entry. The dispatcher's prose-matching is deleted (structured object thrown ⇒ pass through; anything else ⇒ `UNKNOWN_ERROR`); every coded refusal originates from the central registry of message factories; the client's `JOIN_ERROR` default is removed in favor of the socket's real code. Converting the legacy failure surface (measured 2026-07-18: 332 inline `throw new Error` sites across 15 files, 51 of them wrapping central-table strings) is **deferred to the [v2.3.4 PRD](../../v2.3.4/prd.md)**, where `UNKNOWN_ERROR` becomes a burn-down metric. The options and rationale below are kept for the record.

**Context.** The task list's header enumerates exactly ten new codes for this release, all belonging to Phases 9–11. But D9 requires every refusal Phase 4 adds or edits to travel as `{error: {code, message, details?}}`, so the D5 verification refusals need codes too — and neither the PRD nor the task list names them. The working-tree implementation minted them ad hoc: six per-object verification codes (`VARIABLE_NAME_MISSING`/`MISMATCH`, `COLLECTION_NAME_MISSING`/`MISMATCH`, `STYLE_NAME_MISSING`/`MISMATCH` — with `COLLECTION_NAME_MISSING` thrown by the handler but absent from the central `ERRORS` registry), plus three fallback codes that appear nowhere in any decision (`UNKNOWN_ERROR`, `JOIN_ERROR`, and `OPERATION_DENIED` — the last derived by prefix-sniffing message prose, which D9 explicitly forbids: "codes are never reconstructed by parsing prose"). Every code needs a Phase 12 playbook entry, so the inventory must be ratified before the playbook can be written. The same resolution should fix the mechanism: the implementation's `getStructuredError` currently assigns codes by substring-matching thrown strings against the `ERRORS` table, and handlers throw inline object literals whose text diverges from the central entries carrying the same code.

**Option A — per-object, per-cause codes; `UNKNOWN_ERROR` ratified as the legacy fallback; prose-matching deleted.** Keep the six verification codes. Handlers throw structured objects built from a central registry of message factories (so one authored text carries the D5 stored/received operands *and* the D9 read-tool + "pass it back verbatim" recovery). Legacy uncoded throws — messages this release did not add or edit — pass through with `UNKNOWN_ERROR`, which is documented as exactly that. `OPERATION_DENIED` and every `includes`/`startsWith` mapping are deleted; `JOIN_ERROR` is either ratified for the join path or replaced by the socket's real codes.

- First-call correctness: **neutral** — codes are recovery surface, not composition surface.
- One-round-trip recovery: **strongest.** D9 says "name the cause distinctly (missing vs. mismatched vs. stale)"; a distinct code per cause lets the playbook key one entry per code and lets the model branch without reading prose. The factory mechanism ends the current split where the central text names the read tool but lacks operands and the handler text has operands but lacks the read tool.
- Other: eight-plus playbook entries in Phase 12; the task-list header's "ten codes" claim must be amended to the ratified list.

**Option B — one generic `NAME_VERIFICATION_FAILED` code with `details: {objectType, cause}`.**

- First-call correctness: **neutral.**
- One-round-trip recovery: **weaker in practice.** The message must still distinguish every cause (D9), so nothing is saved on the authoring side; meanwhile the playbook and the model key on a code that no longer identifies the failure — the distinction migrates into `details`, one level further from where agents look first.
- Other: smaller code list; less precedent alignment (the existing convention — `PARENT_NAME_MISMATCH` — is already per-cause).

**Option C — keep the implementation as is (prose-derived codes, divergent local strings).**

- Rejected on the record rather than scored: it violates D9's "codes are never reconstructed by parsing prose" verbatim, the substring matching is iteration-order dependent, and two divergent message texts share each code today.

**Recommendation.** Option A. Record the ratified inventory in the task-list header and D9, and require that every coded refusal originates from the central registry — the registry entry is the *only* definition, and handlers pass operands into it rather than composing text locally.

---

## Q17 — How far does "validate the complete plan before the first write" go?

**Status: ✅ resolved, 2026-07-18 — Option B adopted.** Recorded in [`prd.md`](../prd.md) as D5's pre-check-scope bullet (Rev 24): the letter plus the two cheap predictable checks, both before any mutation — an alias `value` on `UPDATE_VARIABLE` resolves its target variable via `getVariableByIdAsync`, and a PAINT-style `bindVariables` request verifies the style has paints before `name`/`description`/`properties` apply. Deep value-type/coercion simulation is rejected (a wrong pre-validation would refuse calls Figma accepts, and drifts with the API). The boundary rule is recorded in D5 for future tools: pre-validate what one read can confirm; disclose what only execution can reveal (disclosure shape: Q18). Phase 4's handler and test tasks carry the two checks. The options and rationale below are kept for the record.

**Context.** D5's letter names two pre-checks: a supplied `value` requires a valid `modeId` before any `UPDATE_VARIABLE` mutation, and style updates resolve every variable binding before applying `name`/properties. Both are implemented. But the review found remaining *predictable* failures that still mutate first and then throw a clean error: an alias `value` whose target variable ID does not resolve, a type-incompatible `value`, and — on the style path — a PAINT-style `bindVariables` request against a style with zero paints (the "set paints first" error is thrown only after name/description/properties have been applied). D5's own heading is "validate the complete plan before the first write" and its principle is "predictable failures return with zero mutation," so the letter and the spirit diverge.

**Option A — the letter only.** Keep the two named checks; every other late failure is handled by the Q18 partial-mutation disclosure.

- First-call correctness: **neutral.**
- One-round-trip recovery: **degraded for known-predictable cases.** A zero-mutation refusal is the cheapest recovery there is — correct the call and retry, nothing to restore. Leaving foreseeable failures in the "partial" bucket converts a zero-cost recovery into a restore-then-retry.
- Other: smallest diff; matches the PRD text literally.

**Option B — the letter plus the cheap predictable checks.** Before any mutation: resolve an alias `value`'s target (`getVariableByIdAsync`, one call), and on PAINT styles with a `bindVariables` request, check paints are non-empty (one length check). Deep value-type validation is *not* attempted; genuinely unexpected failures fall to Q18.

- First-call correctness: **neutral.**
- One-round-trip recovery: **improved where it is cheap.** The two checks close the reachable predictable-late-failure cases the review actually found, at the cost of one async read and one length check.
- Other: two small, testable additions; the boundary rule is articulable ("pre-check anything that is one read or one property check; never simulate Figma's coercion").

**Option C — full plan validation, including value-type/coercion simulation.**

- First-call correctness: **negative risk.** Replicating Figma's value coercion rules invites a new failure class — a pre-check that refuses a call Figma would have accepted — and the simulation drifts as the plugin API evolves.
- One-round-trip recovery: **no better than B** for the cases that occur.
- Other: the largest and most fragile surface for the smallest residual.

**Recommendation.** Option B, with the boundary rule recorded in D5 so future tools apply the same line: pre-validate what one read can confirm; disclose (Q18) what only execution can reveal.

---

## Q18 — What shape does "reported explicitly as partial" take on non-batch tools?

**Status: ✅ resolved, 2026-07-18 — Option A adopted.** Recorded in [`prd.md`](../prd.md) as D5's partial-disclosure bullet plus a shared-vocabulary note in D7's Q9 bullet (Rev 25): an unexpected mid-update failure on `variable_manage`/`style_manage` returns a D9 error whose `details` carries the Q9 fields — `partialMutation: true`, a plain-language statement of what changed, and cheap before-values (the original `name`/`description`, already in hand from verification); a clean failure never carries the flag. Tool-local rollback is rejected (the no-transaction posture; a failed rollback is an undisclosed partial). The field names are recorded as shared between the Phase 4 non-batch shape and the Phase 6 batch rows — drift between them fails review — and both task lists carry the deterministic injected-failure tests. The options and rationale below are kept for the record.

**Context.** The Phase 4 task requires that "an unexpected mid-update failure is reported explicitly as partial via a D9 error — never as a clean failure" for `variable_manage` and `style_manage`. Q9 defined the disclosure vocabulary — `partialMutation: true`, a plain-language statement of what changed, cheap before-values — but only for *batch failure rows*. These two tools are not batches; there is no row envelope, and the field shape for the non-batch case is defined nowhere. The working-tree implementation omitted the disclosure entirely: a style rename followed by a throwing property setter propagates the raw error as a clean failure, and the updated test suite asserts that non-compliant behavior.

**Option A — reuse the Q9 vocabulary inside `error.details`.** The refusal's `details` carries `partialMutation: true`, the plain-language statement, and before-values where cheap. The before-values *are* cheap here: the handler resolved the object and verified its current name before mutating, so the original `name` (and read `description`) are already in hand.

- First-call correctness: **neutral** — the happy path is unchanged.
- One-round-trip recovery: **achieved, with one convention.** The restoring write composes directly from the error, and the model learns a single partial-mutation vocabulary that means the same thing in a batch row (Phase 6) and a non-batch `details` object (Phase 4).
- Other: additive fields inside an error shape D9 already defines; Phase 6 and Phase 4 must agree on field names, which is the point.

**Option B — tool-local rollback: capture before-values, restore on failure, report a clean failure.**

- First-call correctness: **neutral.**
- One-round-trip recovery: **better when it works, worst when it does not.** A rollback that itself fails produces an undisclosed partial — the exact state this requirement exists to eliminate — and the PRD's posture is already chosen: the non-goals reject a rollback/transaction layer, and the Phase 4 text says *report* as partial, not restore.
- Other: contradicts the recorded posture; more code on the failure path, which is the least-tested path.

**Option C — a new dedicated non-batch shape.**

- One-round-trip recovery: **equal to A** per incident, but the model must learn two vocabularies for one concept, and the guides must teach both.
- Other: no gain over A anywhere; rejected unless Phase 6 discovers the Q9 fields cannot express something the non-batch case needs.

**Recommendation.** Option A. Record the shared field names in D7/D9 so Phase 6 and Phase 4 cannot drift, and add the deterministic injected-failure tests the Phase 4 task already lists (a mid-update failure carries the flag and before-values; a clean failure never does).

---

## Q19 — Font-loading order for new TEXT styles: real font or hardcoded default?

**Status: ✅ resolved, 2026-07-18 — Option A adopted.** Recorded in [`prd.md`](../prd.md) as D5's font-loading-order bullet (Rev 26): font loading is hoisted only for updates (the target font — the supplied `properties.fontName`, else the style's actual `fontName` — loads before any mutation); creates return to create → read the fresh style's actual `fontName` → load → write properties, inside the existing rollback guard. The hardcoded `{family: "Inter", style: "Regular"}` guess is rejected as a contract-invisible, document-dependent failure. A fork comment records why the two paths order operations differently, and the Phase 4 test task pins the mock's default font to something other than Inter so the guess cannot silently return. This was the last open question — all nineteen are resolved. The options and rationale below are kept for the record.

**Context.** To satisfy validate-before-mutate, the implementation hoisted font loading above the style-mutation block for *both* paths. On the update path that is correct and cheap (the style's real `fontName` is readable before mutation). On the create path no style exists yet to read, so the code guesses a default — `{family: "Inter", style: "Regular"}` — and loads that. If `createTextStyle()`'s actual default ever differs (older documents default to Roboto; Figma controls this, not the plugin), a create-with-text-properties call fails with an unloaded-font error where the pre-Phase-4 code succeeded, because the old code created first and loaded the style's *actual* font. The existing unit test passes only because its mock's default is Inter.

**Option A — hoist for updates only; creates read the real font.** Updates keep load-before-mutate. Creates return to: create the style, read its actual `fontName`, load it (or the explicitly supplied `properties.fontName`), then write properties — inside the existing rollback guard, which removes the fresh style on any failure.

- First-call correctness: **restored for creates on any document.** The call succeeds as composed regardless of the document's default font — no contract-invisible dependency.
- One-round-trip recovery: **neutral** — failures on either path remain structured and, for creates, roll back cleanly.
- Other: the two paths order operations differently; a one-sentence comment at the fork records why (an existing style is at risk before mutation; a fresh style is disposable under the rollback guard, so creation-before-load is safe).

**Option B — keep the Inter guess.**

- First-call correctness: **document-dependent failure the model cannot predict.** Nothing in the schema or guides tells the model that create-with-text-properties fails on documents whose default font is not Inter.
- Other: also sits badly with D4's discipline — a runtime behavior change on a live-verified path that no decision required.

**Option C — guess, then recover: try the default, and on an unloaded-font error read the real name and retry internally.**

- First-call correctness: **equal to A** in outcome.
- Other: strictly more code than A to preserve a guess A removes; the retry path exists only to compensate for the wrong initial choice.

**Recommendation.** Option A, plus updating the unit test so the mock's default font is *not* Inter — the test should fail if the guess ever returns.

---

## Q20 — `channel_join` failures: how much of the P4-4 fix lands in v2.3.3?

**Status: ✅ resolved, 2026-07-18 — Option A adopted.** Recorded in [`prd.md`](../prd.md) as D9's `channel_join` pass-through note (Rev 28): v2.3.3 fixes the Q16 violations inside the existing in-band envelope — structured codes pass through into `errorCode` verbatim (unknown codes never collapse to `UNKNOWN_ERROR`), `details` is preserved, the prose-classification branches are deleted, and the two locally-generated failures are coded at origin in `figma-client` (`CHANNEL_JOIN_FAILED` on request timeout, `PLUGIN_DISCONNECTED` on connection close). Envelope convergence to `isError` stays deferred to the [v2.3.4 PRD](../../v2.3.4/prd.md)'s Q1, whose context now records that this split reduces Q1 to the envelope question alone. Phase 4's transport tasks and tests carry the pass-through work. The options and rationale below are kept for the record.

**Context.** After the `joinErrorCode` fix, `channel.ts` preserves only `CHANNEL_NOT_FOUND`. Its other branches still classify by prose (`message.includes("timed out")`, `includes("Connection closed")`), any unrecognized structured code collapses to `UNKNOWN_ERROR`, and failures return as a *successful* tool result carrying in-band `status: "error"` + `errorCode` fields — no `isError`. Phase 9's four join codes (`PLUGIN_PEER_UNAVAILABLE`, `PLUGIN_PEER_AMBIGUOUS`, `CHANNEL_IN_USE`, `VERSION_MISMATCH`) would be destroyed on arrival. The finding bundles two different obligations: prose classification and code destruction violate Q16 *now*, while the in-band-envelope shape is exactly the question the [v2.3.4 PRD](../../v2.3.4/prd.md) records as its Q1 (convergence on the D9 `isError` boundary, recommendation Option A there, **deliberately deferred**). The review's literal remediation ("let the production wrapper create the MCP error result") would resolve v2.3.4's Q1 as a side effect of a bug fix.

**Option A — split along the recorded decision boundary.** v2.3.3 fixes the Q16 violations inside the existing envelope: every structured `error.code` passes through into `errorCode` verbatim (unknown codes included — no collapse to `UNKNOWN_ERROR`); the prose-classification branches are deleted, with the two locally-generated failures (request timeout, connection closed) getting their codes assigned **at origin** in `figma-client` (coded `FigmaError`s for the values `channel.ts` already invents: `CHANNEL_JOIN_FAILED`, `PLUGIN_DISCONNECTED`) rather than sniffed from message text; `details` is preserved. The envelope stays in-band; convergence to `isError` remains v2.3.4 Q1's question.

- First-call correctness: **preserved.** The join-result reading contract agents already know does not change mid-release; the guides keep teaching one shape.
- One-round-trip recovery: **restored where it is broken.** Codes survive verbatim, so Phase 9's refusals arrive intact and the playbook can key on them; prose-derived misclassification is gone.
- Other: honors the recorded Q1 deferral instead of resolving it by accident; if Q1 later chooses convergence, `channel_join` callers see a second (planned, CHANGELOG'd) envelope change.

**Option B — pull v2.3.4 Q1 forward and converge now.** `channel_join` failures become D9 `isError` + `structuredContent` errors like every other tool; the in-band fields are removed; v2.3.4's Q1 is recorded as resolved-by-execution.

- First-call correctness: **one convention sooner**, at the cost of a breaking envelope change for any caller reading the in-band fields, in a release whose breaking surface is already the largest ever.
- One-round-trip recovery: **equal to A** once P4-1 is fixed — the same codes arrive either way; only the wrapper differs.
- Other: depends on the P4-1 remediation landing first (the `isError` envelope is currently rejected by conforming clients for schema'd tools); collapses a documented open decision into a side effect, against this file's own discipline.

**Option C — leave `channel_join` untouched until Phase 9.**

- Rejected on inspection: Phase 9's codes would be born into a transport that destroys them, and the Q16 "codes are never derived from prose" rule is violated by shipped v2.3.3 code today.

**Recommendation.** Option A. The shared criterion cannot separate A from B on recovery, and A wins on process: it fixes every violation that exists now without deciding v2.3.4's Q1 by accident, and it keeps the envelope decision where its options and costs are already written down. Record in the v2.3.4 PRD's Q1 context that the v2.3.3 pass-through fix has landed, so Q1 reduces cleanly to the envelope question alone.

---

## Q21 — Which dual-description wording is the contract, and where is it asserted?

**Status: ✅ resolved, 2026-07-18 — Option B adopted.** Recorded in [`prd.md`](../prd.md) as the in-place correction of D5's Q14 sentence (Rev 29): the contract is the D5 example form — the literal "REQUIRED for …" marker in the field description, a natural sentence naming the action and the field in the tool description ("UPDATE_VARIABLE requires `currentVariableName`") — ratifying the wording the implementation already uses, at zero description churn. The valid half of the finding is adopted regardless: the Phase 4 marker-test task now asserts both locations against the **emitted `tools/list` result** rather than raw registration configuration. This was the last open question — all twenty-one are resolved; the follow-up review's remaining findings are remediation work under recorded decisions. The options and rationale below are kept for the record.

**Context.** The PRD contradicts itself. D5's mechanism bullet gives the tool-description example *"UPDATE_VARIABLE requires `currentVariableName`"* — which the implementation follows verbatim — while the Q14 resolution sentence says CI asserts *"the 'REQUIRED for …' text present in **both** the field and tool descriptions."* The field descriptions carry the literal `REQUIRED for …` marker; the tool descriptions carry the D5 example's plain-English form. The review holds the implementation to the Q14 literal. Separately and validly: the current marker tests assert against raw registration config, not the emitted `tools/list` metadata a client actually sees.

**Option A — the Q14 literal wins.** Tool descriptions are reworded to carry the literal `REQUIRED for …` marker in both locations; D5's example wording is corrected to match; tests assert the literal string in both places.

- First-call correctness: **no measurable gain.** Models read "UPDATE_VARIABLE requires `currentVariableName`" and "REQUIRED for UPDATE_VARIABLE — `currentVariableName`" identically; the marker is a CI-checkability token, not a comprehension aid.
- Other: churns descriptions that already work to satisfy a sentence written as a test-mechanism summary; the reworded tool description reads less naturally as prose.

**Option B — ratify D5's example; correct the Q14 sentence.** The contract is: field descriptions carry the literal `REQUIRED for …` marker; tool descriptions state the requirement as a natural sentence naming the action and the field (the D5 example form). The Q14 record is amended to say exactly what the marker test asserts at each location.

- First-call correctness: **equal to A** for the LLM consumer — the requirement is stated twice either way, and the natural-sentence form is what D5 deliberately designed for the tool-level summary.
- Other: zero description churn; one-line doc correction; the contradiction is resolved in favor of the text that carries the design rationale rather than the text that summarizes the test.

**Adopted under both options (the valid half of P4-8):** the marker tests are upgraded to assert against the **emitted `tools/list` result** — the serialized metadata a consumer actually receives — rather than raw registration configuration, for every conditional requirement.

**Recommendation.** Option B. The two options are indistinguishable on the shared criterion; B resolves the contradiction at zero churn by recognizing that Q14's sentence described the test mechanism loosely rather than prescribing wording, while D5's example was the deliberate design. The emitted-`tools/list` upgrade is the substantive fix and ships regardless.

---

## Minor ratifications from the 2026-07-17 implementation review

Small decisions from the same review that need a recorded answer but not an options analysis. Each takes effect when its Phase 4 fix lands; record dissent by editing this list.

1. **`description: ""` semantics.** The implementation changed `if (description)` to `if (description !== undefined)`, so an empty string now clears a style's description — a behavior change no decision required. **Ratify: revert to the old guard** (the non-goals' minimal-edit rule); adopting clear-on-empty-string is a candidate for a future release with its own CHANGELOG line.
2. **Empty-string current names.** The schemas treat `""` as missing (falsy check); the plugin treats it as present (`=== undefined` check) — a layer inconsistency. **Ratify: the plugin also treats `""` as missing** (fail closed, matching the schema), and the `currentStyleName: ""` test fixture is replaced with the mock's real name.
3. **`ui.html` defects.** The UI's own pending-request path stringifies object errors (`new Error(data.error)`) and its `state.pendingRequests.delete(id)` references an undefined `id` (should be `data.id`) — both pre-existing, both on the join-adjacent path Phase 9 rewrites. **Ratify: defer both to Phase 9**; this entry is the tracked record.
4. **`z.record` two-argument fixes** in `annotation.ts`/`create.ts`/`node.ts` are correct zod-4 corrections but belong to no phase. **Ratify: keep, with a provenance row** (the Rev 22 precedent for the identical fix in `src/shared/nodeTypes.ts`).
5. **CI step layout.** PRD Rev 21 says `check:suppressions` ships "in the same CI step" as the type gate; the implementation uses two adjacent steps. **Ratify: two adjacent steps satisfy the intent**; the task list's "beside" wording governs.
