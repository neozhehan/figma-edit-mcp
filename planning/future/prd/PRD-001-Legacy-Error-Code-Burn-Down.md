# PRD — Legacy Error-Code Burn-Down

> [!IMPORTANT]
> **Release type:** standalone minor release
>
> **Version:** unassigned; assign its SemVer only after the future-release tracks are ordered
>
> **Status:** draft; Q1 must be ratified before Phase 9
>
> **Standalone extraction/revision:** 2026-08-03
>
> **Historical source index:** [`planning/v2.3.4/prd.md`](../../v2.3.4/prd.md), Track 1
>
> **Revision ledger:** [`planning/v2.3.4/release-changelog.md`](../../v2.3.4/release-changelog.md#change-1-prd-revision-history)

This release converts the plugin's known legacy, uncoded failure surface to the
structured error contract established by v2.3.3. Its outcome is that
`UNKNOWN_ERROR` stops being the code for known and classifiable failures while
remaining the honest fallback for bugs and genuinely unclassifiable values.

The release also converges the remaining local UI-relay and `channel_join`
failure surfaces on one documented MCP-boundary convention. It adds no Figma
editing capability, tool, permission, or scope behavior.

---

## Release identity and compatibility

The exact release number is intentionally unassigned. When scheduled, this PRD
must receive its own minor version and must update every version surface from
the then-current predecessor to that assigned version:

- root `package.json` and `package-lock.json`;
- both `server.json` version fields;
- root `manifest.json`;
- the plugin About handshake;
- every other surface enforced by `check:versions` and `check:plugin`.

The logical prerequisite is the v2.3.3 structured-error foundation: the
central message-factory registry, `{error:{code,message,details?}}` transport,
error playbook, and plugin type/suppression gates. The exact scheduled
predecessor may include other already-completed standalone releases, so this
document does not assume a `2.3.3 -> 2.3.4` package-version transition.

Track-specific compatibility rules are:

- the conditions under which plugin failures occur do not change;
- the thrown value changes from an `Error` string to a coded registry object;
- message text changes where legacy prose fails the v2.3.3 recovery-quality
  standard;
- `channel_join` compatibility depends on the ratified Q1 outcome;
- message changes and any boundary-envelope cutover require explicit CHANGELOG
  before/after examples because existing agents may match prose or legacy
  fields.

If a conversion appears to require moving, adding, removing, or reordering a
throw, stop and escalate. That is a behavior change, not error-code burn-down.

---

## Source-ID mapping

Historical identifiers are retained so the original revision ledger and review
records remain traceable.

| Standalone section | Historical source ID | Disposition |
| :- | :- | :- |
| Taxonomy | v2.3.4 D1 | Preserved and made the first implementation gate |
| Registry-only origination | v2.3.4 D2 | Preserved |
| Message-quality gate | v2.3.4 D3 | Preserved, including the `NAME_MISMATCH` worked example |
| Playbook parity | v2.3.4 D4 | Preserved as a review obligation; no documentation-parity CI gate |
| Code-based tests | v2.3.4 D5 | Preserved |
| Control-flow invariance and ratchet | v2.3.4 D6 | Preserved |
| Boundary convergence | v2.3.4 D7 | Preserved; `channel_join` remains Q1 |
| Open boundary decision | v2.3.4 Q1 | Preserved with both options and the original Option A recommendation |
| Implementation sequence | v2.3.4 Phases 1-10 | Preserved and made independent of the other historical tracks |

The source's withdrawn D12 creates no deliverable here. This release does not
add a CI test that asserts over prose in `SAFETY.md` or another documentation
file.

---

## Origin

The v2.3.3 Q16 resolution of 2026-07-18 chose Option A: code only the messages
that v2.3.3 added or edited and route older failures through the ratified
`UNKNOWN_ERROR` fallback. The original record deliberately deferred conversion
of the legacy surface to the next release and named `UNKNOWN_ERROR` burn-down
as its metric.

That deferral preserved message text but provided no stable classification or
code-addressable recovery. This release completes the deferred work without
changing the underlying validation and refusal control flow.

---

## Problem

### Historical implementation baseline

The following is dated source evidence, not a claim about the current checkout.
Phase 1 must re-run every inventory and commit a fresh baseline before editing.

Measured on 2026-07-30 after the v2.3.3 Phase 11 removal:

- **313** direct inline `throw new Error(...)` sites existed across **15**
  plugin TypeScript files.
- **47** of those sites wrapped central `ERRORS` strings:
  - 26 direct operands;
  - 15 `formatScopeError(ERRORS...)` operands;
  - 6 template literals interpolating `ERRORS.SCOPE_DELETED`.
- The remaining **266** composed messages ad hoc at the throw site. Two of
  these called `formatScopeError(...)` with handler-local templates and were
  correctly classified as ad hoc.
- The central error module defined **29** keys: 12 legacy `ERRORS` strings and
  17 structured `REFUSALS` factories. Handlers referenced 11 of the 12 legacy
  strings. `INVALID_TARGET_NODE_IDS` was unreferenced and is delete-not-convert
  work.

The historical direct-throw distribution was:

| Plugin file | Direct inline throws at the 2026-07-30 snapshot |
| :- | -: |
| `src/main.ts` | 76 |
| `handlers/componentHandlers.ts` | 70 |
| `handlers/variableHandlers.ts` | 41 |
| `handlers/nodeModifiers.ts` | 33 |
| `handlers/stylingHandlers.ts` | 24 |
| `handlers/styleHandlers.ts` | 22 |
| `handlers/nodeCreators.ts` | 14 |
| `handlers/layoutHandlers.ts` | 11 |
| `handlers/textHandlers.ts` | 7 |
| `handlers/prototypingHandlers.ts` | 6 |
| `handlers/annotationHandlers.ts` | 3 |
| `utils/nodeUtils.ts` | 3 |
| `utils/creatorValidation.ts` | 1 |
| `utils/exportUtils.ts` | 1 |
| `handlers/vectorHandlers.ts` | 1 |

An earlier 2026-07-18 inventory found 332 sites across 15 files and 51
central-table-backed sites. That number is retained as origin evidence only;
the decrease was expected after later v2.3.3 handler changes and deletion of
the connector handler.

### Classification is discarded at the throw

Legacy handlers turn registry strings back into ordinary `Error` instances.
The natural key is therefore discarded at origination and the MCP boundary can
only emit `UNKNOWN_ERROR`. The removed prose classifier demonstrated why the
code must be assigned at origin rather than reconstructed from message text.

### `NAME_MISMATCH` is the canonical quality failure

At the 2026-08-01 live `vgzm` snapshot, a stale-name `node_rename` produced:

```text
Error [UNKNOWN_ERROR]: Operation Denied: nodeName does not match name of nodeId. Refresh context & recheck to ensure correct nodeId is passed in.
```

The diagnostic named neither the stored nor received name, named no read tool,
and directed recovery at `nodeId` even though the name was stale. In the same
session, the repaired sibling `PARENT_NAME_MISMATCH` included both operands,
named `node_info`, and instructed the agent to pass the discovered name back
verbatim. `NAME_MISMATCH` must be converted to that recovery shape and must
drop the misleading “recheck ... correct `nodeId`” clause.

Both historical live refusals mutated nothing. The file closed at its opening
62/31/2 baseline. This evidence is historical and is not a current live replay.
The finding was recorded as C19-F3 in the v2.3.3 release changelog.

### Tests treat prose as identity

A 2026-07-18 grep found **102** unit-test assertions using `toThrow("...")` or
equivalent prose matching. This was the then-measured baseline, not a current
count. Phase 1 must remeasure the implementation baseline before conversion.

When prose is the identity contract, improving a recovery message breaks tests
and encourages contributors to preserve weak diagnostics. Stable codes should
carry identity; messages should carry actionable recovery.

### Two additional boundary conventions remain

- `src/mcp_server/tools/channel.ts` historically reported join failures inside
  a successful result with `status:"error"`, `errorCode`, and `errorMessage`,
  rather than the v2.3.3 `isError:true` plus `structuredContent.error` boundary.
- The UI relay's local dispatch catch historically forwarded only
  `error.message || "Error executing command"`, flattening local failures into
  an uncoded string indistinguishable from a plugin-authored refusal.

Consequently, agents branch on unstable prose or tool-specific envelope shape,
the playbook cannot reliably key recovery to known legacy failures, and new
handler code is tempted to copy the surrounding uncoded idiom.

---

## Goals and success definition

1. Every known, classifiable plugin failure originates through a reviewed
   central factory with a stable code.
2. Each code represents one cause-and-recovery class; operands and context live
   in structured, transport-safe `details`.
3. Every actionable message is sufficient to derive the correct next call from
   the error and tool list alone.
4. Tests use codes and structured details for identity, preserving prose checks
   only where recovery wording is itself the contract.
5. No error conversion changes when or whether a failure occurs.
6. A ratcheted gate prevents the uncoded error surface from regrowing and
   reaches zero for the release-owned legacy origins.
7. UI-local dispatch failures have their own code, and Q1 establishes one
   explicit policy for `channel_join`.
8. Every shipped code has a reviewed playbook entry and every entry names a
   real code.
9. Representative live MCP probes deliver their originating code without
   falling through to `UNKNOWN_ERROR`.

`UNKNOWN_ERROR` is not removed. It remains the required fallback for a bug or
truly unclassifiable thrown value, with the safely normalized diagnostic
preserved.

---

## Decisions

### D1 — Taxonomy before conversion

Design and review the taxonomy as an implementation artifact before converting
any site. A code represents one distinct cause with one recovery, not one throw
site. The historical 313 sites should collapse into a bounded set, expected to
be a few dozen codes, organized around classes such as:

- missing parameter;
- invalid parameter value;
- target not found;
- wrong target type;
- state precondition not met;
- scope or permission refusal;
- relayed sandbox/Figma API failure;
- UI-relay-local failure;
- internal or unclassifiable failure.

Shared causes share a code. `details` carries specifics such as `parameter`,
`nodeId`, `expectedType`, `actualType`, received/stored operands, phase, and
relevant read tool.

Failures relayed from Figma APIs use `FIGMA_API_ERROR` with the original message
preserved in `details` only when any stronger tool-specific reconciliation
proves the authoritative state is exactly the pre-state. A domain contract that
distinguishes verified success, partial mutation, unknown outcome, or timeout
remains authoritative; this conversion must not collapse those states into
`FIGMA_API_ERROR`. Messages state when a condition is not recoverable by retry
and must instead be reported.

Once shipped, codes are permanent identifiers. `UNKNOWN_ERROR` is reserved for
a bug or genuinely unclassifiable state rather than forced to zero.

### D2 — Registry-only origination

Every conversion replaces inline error construction with a call to the central
factory registry. Handlers pass operands and never compose refusal prose
locally.

The historically measured 47 central-backed sites convert first. The six
`SCOPE_DELETED` templates pass their appended operand to the factory. The two
handler-local `formatScopeError(...)` templates convert with their owning
domain. Absorb the legacy `ERRORS` string table into the factory registry and
delete unreferenced keys instead of carrying them forward.

At release, handler TypeScript contains no `throw new Error(`.

### D3 — Message-quality gate

Every converted message must:

1. name the cause distinctly;
2. name the read tool that supplies the correct value when one exists;
3. include the relevant received and authoritative operands where safe;
4. state the recovery so the next correct call is derivable from the message
   and tool list alone.

Conditions without an agent-executable recovery state that explicitly, for
example: “not recoverable by retry; report the error.” A code attached to an
unactionable message fails this gate.

`NAME_MISMATCH` is the canonical acceptance fixture. Its factory must name both
names, name `node_info`, instruct the caller to pass the discovered name back
verbatim, and omit the misleading `nodeId` recovery clause.

### D4 — Playbook parity is a review obligation

Every registry code gets one `error-playbook.md` entry, and every playbook entry
names a real code. Shared-cause codes get one entry each.

This release adds no programmatic check that asserts over prose documentation.
The taxonomy artifact is the review checklist, and each phase records the codes
and playbook rows it added. The final review must prove parity in both
directions. The absence of a CI documentation-parity gate is an accepted cost,
not evidence that parity is optional.

### D5 — Tests assert codes, not prose

Migrate prose-based assertions in the same domain phase as their throw sites.
Assert identity through `code` and relevant `details`. Assert message content
only in the focused recovery-quality tests that intentionally pin D3.

After this release, improving non-contractual wording must not break a test.

### D6 — No control-flow change; ratcheted enforcement

The same conditions fail at the same program points. Only the thrown value and,
where D3 requires it, message wording change. Review each rebuilt plugin diff
against that rule; any unrelated emitted-JavaScript change stops the phase.

Add `check:legacy-throws` beside the existing CI gates. It must:

- count `throw new Error(` under `figma_plugin/**/*.ts` against a committed
  baseline;
- establish a fresh Phase 1 baseline from the implementation checkout while
  retaining 313 as dated provenance;
- permit the baseline only to decrease;
- reach zero for the release-owned legacy surface; and
- be deliberately red-proofed by adding one representative forbidden throw,
  observing the named gate fail, restoring it, and rerunning green.

### D7 — One explicit MCP-boundary convention

UI-relay-local dispatch failures become coded `UI_RELAY_FAILURE` objects with a
safely normalized original diagnostic in `details`. A UI-side failure must be
distinguishable from a plugin-authored failure.

`describeError` survives only as guarded message extraction inside the
`UNKNOWN_ERROR` fallback. It must be total over arbitrary thrown JavaScript
values and must not itself erase an outcome.

The `channel_join` envelope is resolved by Q1 rather than silently folded into
the conversion.

---

## Scope

### In scope

1. A reviewed code-taxonomy artifact containing code names, cause/recovery
   rules, and exact `details` shapes.
2. Registry extension and conversion of every implementation-baseline legacy
   `throw new Error(` site, with the historical 47 central-backed sites first.
3. Absorption of the legacy `ERRORS` table and deletion of dead entries.
4. `FIGMA_API_ERROR` wrapping for relayed Figma failures, preserving the
   original message in `details`.
5. `UI_RELAY_FAILURE` for UI-local dispatch failures.
6. Migration of every current prose-identity error assertion to code/details,
   retaining only deliberate D3 recovery-content checks.
7. Playbook entries for every code, reviewed in both directions against the
   taxonomy artifact.
8. `check:legacy-throws`, its committed current baseline, CI integration, and
   recorded red/green proof.
9. Ratification and implementation of Q1.
10. Agent-guide updates, primarily `error-playbook.md`, with
    `constraints.md`/`workflows.md` updated where they quote changed prose and
    all content mirrored to `figma-edit://guide/*` resources.
11. Version bump to the assigned minor version on every enforced surface.
12. A CHANGELOG entry listing each changed message, representative before/after
    text, Q1's cutover or retained exception, and agent migration guidance.

### Non-goals

- No change to when an error is thrown, validation ordering, mutation logic, or
  success shapes.
- No new validation, retry, rollback, transaction, or batch-envelope behavior.
- No new tools, permissions, editing capabilities, or scope-model changes.
- No broad dependency update.
- No server-wide error redesign beyond Q1 and the existing v2.3.3 boundary
  wrapper.
- No `check:types:server` follow-up.
- No test or CI script that treats documentation prose as executable truth.

---

## Open question

### Q1 — Does `channel_join` converge on the structured-error boundary?

Historically, `channel_join` reports a failure in-band as a successful tool
result containing `status:"error"`, `errorCode`, and `errorMessage`. Other
post-v2.3.3 tool failures use `isError:true` plus
`structuredContent.error`. v2.3.3 Q20 already repaired origin-code pass-through,
so this decision concerns envelope shape only.

#### Option A — converge

`channel_join` failures use the same structured error surface as other tools.
Remove the in-band failure fields and publish a CHANGELOG before/after example.

Advantages:

- one convention for agents;
- one playbook/boundary recovery path;
- no permanent tool-specific exception.

Cost: callers reading the legacy in-band fields must migrate.

#### Option B — retain and document the dual surface

Keep the existing in-band envelope because joining may be interpreted as a
status report rather than a refusal. Document the exception explicitly in every
agent guide and boundary contract.

Cost: every client must permanently learn two failure conventions.

#### Recommendation — Option A

First-call correctness and one-round-trip recovery favor a single boundary
shape. The original hard-cutover precedent applies, and the migration cost is
bounded. This is still a recommendation, not a ratified decision. Record the
human decision before Phase 9 and update this PRD's status.

---

## Implementation plan

All phases belong to this standalone release and run in order.

### Phase 1 — Taxonomy, current inventories, registry, and gate

- Re-run the source inventories of `throw new Error(` sites and prose-identity
  assertions. Record current totals alongside, never in place of, the dated
  provenance.
- Produce and review the taxonomy artifact with exact code/details/recovery
  contracts.
- Extend the central registry for the codes this release actually uses.
- Add `check:legacy-throws` with the current baseline, wire it into CI, and
  record its red/green proof.

Exit criterion: taxonomy approved; inventories reproducible; gate proven red
and green; no production throw site converted yet.

### Phase 2 — Central-table conversion

Convert all implementation-baseline sites that wrap legacy `ERRORS` strings,
absorb the table into the registry, and delete unreferenced entries. At the
historical snapshot this was 47 sites and reduced the direct-inline remainder
from 313 to 266.

The two handler-local `formatScopeError(...)` sites remain for their owning
domain phases. `NAME_MISMATCH` is repaired with the dispatcher surface in
Phase 3, matching the original phase ownership.

### Phase 3 — Dispatcher and safety-critical guards

Convert every remaining `src/main.ts` site after Phase 2. The historical file
total was 76 before central conversion. This phase covers the scope/permission
surface and must include public-boundary tests for the repaired
`NAME_MISMATCH`, structured details, and unchanged no-mutation behavior.

### Phase 4 — Component handlers

Convert every remaining `componentHandlers.ts` site after rebasing on the
completed v2.3.3 component-handler rewrite. Historical file total: 70.

### Phase 5 — Variable and style handlers

Convert the remaining `variableHandlers.ts` and `styleHandlers.ts` sites.
Historical file totals: 41 and 22.

### Phase 6 — Node modifiers and styling handlers

Convert the remaining `nodeModifiers.ts` and `stylingHandlers.ts` sites.
Historical file totals: 33 and 24.

### Phase 7 — Creators, layout, text, and creator validation

Convert the remaining `nodeCreators.ts`, `layoutHandlers.ts`,
`textHandlers.ts`, and `creatorValidation.ts` sites. Historical combined file
total: 33.

### Phase 8 — Tail domains

Convert the remaining `prototypingHandlers.ts`, `annotationHandlers.ts`,
`vectorHandlers.ts`, `nodeUtils.ts`, and `exportUtils.ts` sites. Historical
combined file total: 14. Do not recreate the removed connector handler.
If a stronger domain-specific reaction outcome contract has landed, preserve
its classifications and convert only the legacy sites still present.

For Phases 2-8, each phase must:

- convert only the sites remaining in its stated domain;
- apply the D3 message-quality gate;
- add and review playbook entries;
- migrate that domain's prose-identity assertions;
- add direct-handler and registered-boundary adverse-path tests;
- rebuild the plugin;
- inspect emitted diffs for control-flow drift;
- decrease the ratchet and record before/after counts;
- red-proof each newly introduced regression guard where practicable.

### Phase 9 — Boundary convergence

- Ratify and implement Q1.
- Wrap UI-relay-local failures as `UI_RELAY_FAILURE`.
- Prove code and nested details survive the plugin/UI/MCP boundary safely.
- Confirm `describeError` is used only for guarded message extraction inside
  the `UNKNOWN_ERROR` fallback.
- Add before/after contract fixtures for the public boundary.

### Phase 10 — Contract sync, versioning, and release verification

- Review registry/taxonomy/playbook parity in both directions.
- Update and mirror all agent guides/resources.
- Write the complete CHANGELOG migration entry.
- Assign and apply the standalone minor version on every enforced surface.
- Run all build, generated-artifact, static, focused, boundary, and full-suite
  gates.
- Execute representative live MCP refusal probes, one per taxonomy class where
  a safe fixture is available.
- Tag only after repository checks and required live evidence are recorded.

---

## Testing and acceptance criteria

### Taxonomy and registry

- [ ] A reviewed taxonomy artifact maps every release-owned code to one cause,
  one recovery, and one exact `details` contract.
- [ ] Every implementation-baseline classifiable legacy failure originates from
  the central registry.
- [ ] No registry code is orphaned unintentionally, and dead legacy strings are
  deleted rather than converted.
- [ ] `FIGMA_API_ERROR` preserves the originating message in `details` and its
  authored message states the applicable recovery.
- [ ] Every code has one reviewed playbook entry and every playbook entry names
  a real code.

### Ratchet and control flow

- [ ] The dated 313-site metric remains documented as historical evidence; a
  fresh implementation baseline is committed separately.
- [ ] `check:legacy-throws` is wired into CI and reaches zero for
  `throw new Error(` under `figma_plugin/**/*.ts`.
- [ ] The gate has a recorded named red failure and restored-green run.
- [ ] Per-phase source and emitted-plugin diffs show only error origination,
  safe transport, and approved message changes; throw conditions and ordering
  are unchanged.
- [ ] Deliberately injected uncoded failures still reach the public boundary as
  `UNKNOWN_ERROR` with a safely normalized diagnostic.

### Tests and transport

- [ ] The current prose-identity assertion inventory is zero after migration,
  except for explicitly enumerated D3 recovery-content fixtures.
- [ ] Identity assertions use `code`; operand/context assertions use `details`.
- [ ] `NAME_MISMATCH` names both operands, names `node_info`, says “pass it back
  verbatim,” omits the misleading `nodeId` clause, and mutates nothing.
- [ ] `UI_RELAY_FAILURE` is distinguishable from plugin-authored failures.
- [ ] The ratified Q1 shape is asserted through the registered MCP callback,
  including exact `isError` and `structuredContent` behavior when Option A is
  chosen.

### Documentation and release artifacts

- [ ] Agent guides and `figma-edit://guide/*` resources agree with the shipped
  codes and Q1 behavior.
- [ ] The CHANGELOG lists every changed message and includes representative
  before/after examples plus migration guidance.
- [ ] The assigned minor version is consistent across every enforced surface.
- [ ] Historical evidence is labeled by date/channel and never described as a
  new live verification.

### Required repository verification

- [ ] `bun run build:all`
- [ ] `bun run check:generated`
- [ ] `bun run check:plugin`
- [ ] `bun run check:versions`
- [ ] `bun run check:types:plugin`
- [ ] `bun run check:suppressions`
- [ ] `bun run check:legacy-throws`
- [ ] focused direct-handler and registered-boundary suites
- [ ] full repository suite

Exact pass/assertion counts must be recorded from the release checkout. A
socket-startup failure in a restricted environment is reported separately and
must not be mislabeled as either product regression or full-suite green.

### Required live evidence

Run a small, safe set of representative refusals over the official MCP boundary
against a dedicated Figma document:

- at least one refusal from every taxonomy class with an authorable fixture;
- the repaired `NAME_MISMATCH` path;
- UI/local relay failure only if it can be induced safely;
- `channel_join` failure under the ratified Q1 envelope.

For every probe, record the request class, returned `code`, boundary shape,
recovery fields, and before/after document state. `UNKNOWN_ERROR` must not appear
for a known representative class. Fixture-unavailable cases are recorded as
blocked rather than simulated. Repository/mock evidence must not be described
as live Figma behavior.

---

## Rollout

1. Merge only after the v2.3.3 structured-error prerequisites are present in
   the scheduled predecessor.
2. Land Phases 1-9 in order, one reviewable domain commit per conversion phase.
3. Assign the release's minor version only after cross-PRD sequencing is final.
4. Publish explicit migration notes for message changes and Q1.
5. Tag only after all applicable repository gates pass and required live
   evidence is recorded.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Taxonomy proves wrong after stable codes ship | Medium | Review D1 before conversion; group by cause/recovery; keep specifics in `details`; split `FIGMA_API_ERROR` where recovery differs |
| A conversion silently changes control flow on a live-verified path | Low-Medium | Per-phase source/emitted diff review, direct-handler and registered-boundary adverse tests, stop-and-escalate rule |
| A 15-file, historically 313-site diff becomes unreviewable | Medium | Central batch followed by one commit per domain; monotonic ratchet with recorded counts |
| Message rewrites break agents matching prose | Medium | Stable codes, playbook recovery, and complete CHANGELOG before/after migration examples |
| Migrating the historically measured prose assertions introduces coverage gaps | Low-Medium | Remeasure the implementation baseline; migrate alongside each domain; preserve focused D3 wording tests and the injected-fallback fixture |
| The scheduled predecessor does not contain the final v2.3.3 handler baseline | Medium | Hard prerequisite and Phase 1 rebase; require the completed component rewrite and removed connector handler rather than recreating superseded files |
| The implementation baseline drifts before scheduling | Medium | Treat all counts as dated provenance; rebaseline in Phase 1 and explain every delta before conversion |
| Playbook growth reduces usefulness | Low | One row per cause/recovery code rather than per throw site; taxonomy review caps unnecessary fragmentation |
| Q1 remains unresolved and Phase 9 cannot define compatibility | Medium | Human-ratify Q1 before Phase 9 begins; recommendation remains Option A |

---

## Provenance

All measurements below are historical snapshots. They establish why the work
exists and how the original plan was sized; implementation must re-verify them.

| Evidence | Verified at | Historical finding and use |
| :- | :- | :- |
| Rebased inline direct-throw count | `rg -n 'throw new Error\(' figma_plugin --glob '*.ts'`, 2026-07-30 after v2.3.3 Phase 11 | 313 sites across 15 files; original ratchet baseline |
| Rebased central-table overlap | Operand classification of those sites, 2026-07-30 | 47 central-backed sites: 26 direct `ERRORS`, 15 `formatScopeError(ERRORS...)`, 6 `SCOPE_DELETED` templates; two handler-local `formatScopeError` calls belonged to the 266 ad-hoc sites |
| Historical pre-rebase count | Equivalent grep, 2026-07-18 | 332 sites across 15 files and 51 central-backed; retained as origin evidence only |
| Legacy registry shape | `figma_plugin/utils/errors.ts`, 2026-07-30 | 29 definitions: 12 legacy strings plus 17 factories; 11 legacy strings referenced; `INVALID_TARGET_NODE_IDS` dead |
| Prose-based assertions | `toThrow(` search under `src/mcp_server/tests`, 2026-07-18 | 102 prose-matching assertions under the original grep method; remeasure before implementation |
| `NAME_MISMATCH` quality | Live channel `vgzm`, dedicated *MCP Test* file, 2026-08-01 | Returned `UNKNOWN_ERROR` with neither operand/read tool and misdirected `nodeId` recovery; sibling `PARENT_NAME_MISMATCH` showed the required shape; neither refusal mutated the document |
| Server-side legacy envelope | `src/mcp_server/tools/channel.ts`, 2026-07-18 | Join failures were successful in-band results with `status:"error"` and `errorCode`; Q1 owns the envelope decision |
| UI-relay flattening | `figma_plugin/ui.html` dispatch catch, 2026-07-18 | Local failures were reduced to `error.message \|\| "Error executing command"` and lost classification |
| Deferral decision | v2.3.3 Q16 Option A / original PRD Rev 23, 2026-07-18 | Legacy failures remained on the ratified fallback and their conversion was explicitly deferred, with `UNKNOWN_ERROR` burn-down as the metric |

Two correction chains must remain visible when these measurements are cited:

- an early 43-site central-overlap reading missed the six
  `ERRORS.SCOPE_DELETED` template sites; Rev 6 then reported 49 by also counting
  two handler-local `formatScopeError(...)` calls; Rev 7 established the final
  dated classification of 47 central-backed plus 266 ad-hoc sites;
- an early registry reading of 28 definitions (13 legacy plus 15 factories)
  predated later v2.3.3 registry changes; the rebased 2026-07-30 snapshot was 29
  definitions (12 legacy plus 17 factories).

Historical live-channel facts are reported evidence, not reverified-current Figma
behavior. The authoritative verbatim revision ledger remains in the source
release changelog and must not be renumbered, reordered, or rewritten when this
standalone PRD is revised.

---

## References

- [v2.3.4 compatibility index](../../v2.3.4/prd.md)
- [Verbatim v2.3.4 revision ledger](../../v2.3.4/release-changelog.md#change-1-prd-revision-history)
- [v2.3.3 safety-contract PRD](<../../completed/v2.3.3-Plugin-Type-Check-Restoration-&-Safety-Contract-Gap-Closure/prd.md>)
- [v2.3.3 release changelog](<../../completed/v2.3.3-Plugin-Type-Check-Restoration-&-Safety-Contract-Gap-Closure/release-changelog.md>)
- [`figma_plugin/utils/errors.ts`](../../../figma_plugin/utils/errors.ts)
- [`figma_plugin/src/main.ts`](../../../figma_plugin/src/main.ts)
- [`figma_plugin/ui.html`](../../../figma_plugin/ui.html)
- [`src/mcp_server/tools/channel.ts`](../../../src/mcp_server/tools/channel.ts)
- [`skills/figma-edit/references/error-playbook.md`](../../../skills/figma-edit/references/error-playbook.md)
