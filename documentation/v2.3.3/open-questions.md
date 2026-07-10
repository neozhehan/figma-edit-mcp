# v2.3.3 Open Questions

> **Closed, 2026-07-09.** All eight questions are resolved and recorded in [`prd.md`](prd.md) (Q1 → D5; Q2 → D6/Phase 9; Q3 → D8/Phase 7; Q4 → D9; Q5 → Release identity; Q6 → D3; Q7 → D7/Phase 6; Q8 → Compatibility posture). This file is retained as the decision record — each entry keeps its options, pros and cons, and the adopted resolution.

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
