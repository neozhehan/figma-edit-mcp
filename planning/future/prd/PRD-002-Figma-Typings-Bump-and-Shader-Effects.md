# PRD — Figma Typings Bump and SHADER Effects

- **Status:** Proposed; implementation is blocked on the pre-implementation revalidation gate
- **Release:** Version-unassigned standalone minor release
- **Standalone extraction/revision:** 2026-08-03
- **Source index:** [v2.3.4 Track 2 / D8 / Phase T2](<../initiative/01 - Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing/initiative.md>)
- **Historical decision ledger:** [v2.3.4 release changelog, Change 1](<../initiative/01 - Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing/release-changelog.md#change-1-prd-revision-history>)

> [!IMPORTANT]
> This PRD is the standalone successor to Track 2 of the original v2.3.4 PRD. It is not assigned the version `2.3.4` and it must not share a release with the legacy-error or prototype-reaction tracks.
>
> The source evidence was measured on 2026-07-26 against `@figma/plugin-typings` 1.125.0 and 1.131.0. Those measurements are historical evidence, not a claim about the current published typings, current repository baseline, or current Figma runtime. No implementation may begin until Gate R0 revalidates them.

## 1. Executive summary

The repository pins Figma plugin declarations. The source investigation found that the live Figma runtime already accepted a `SHADER` effect that the pinned declarations could not express. The strict `style_manage` effect union therefore improved first-call validation while making an existing runtime capability unreachable.

This minor release updates the exact `@figma/plugin-typings` pin from `1.125.0` to `1.131.0`, after revalidating that source decision, follows the existing parity test when the `Effect` union changes, adds the corresponding `SHADER` and `noiseSizeVector` authoring contracts, regenerates every typings-derived node-field artifact, and reviews the resulting public read-surface change independently.

The release preserves the project’s Golden Rule:

- First-call correctness: the schema admits exactly the supported effect variants and fields.
- One-round-trip recovery: malformed calls fail at a precise field with actionable guidance.
- No accept-and-discard path: every validated value reaches the Figma setter without silent stripping.

## 2. Release identity

This work ships as one independently reviewable **minor release**. The concrete version is assigned only when the release is scheduled. At implementation time, every enforced version surface moves from the then-current repository version to that assigned minor version:

- `package.json`;
- the root `package-lock.json` release-version fields;
- both version fields in `server.json`;
- the root `manifest.json`;
- the plugin About handshake/bundle surface enforced by `check:plugin`.

`check:versions` and `check:plugin` must enforce the assigned version before tagging.

This release:

- adds no MCP tool;
- changes no permission, scope, name-verification, or mutation-safety gate;
- moves no dependency except `@figma/plugin-typings`;
- restores schema reachability for a runtime-supported effect;
- may add typings-derived fields to the `node_info` read surface;
- does not claim that a type declaration alone proves live Figma behavior.

The implementation baseline must contain the merged v2.3.3 type, generated-artifact, effect-parity, structured-error, and plugin-bundle gates on which this work depends. If the scheduled baseline no longer contains equivalent mechanisms, Gate R0 blocks the release until the PRD is revised.

## 3. Problem and historical evidence

The original Track 2 investigation measured the following on 2026-07-26:

- `package.json` pinned `@figma/plugin-typings` 1.125.0, while 1.131.0 was then the published version selected for evaluation.
- `ShaderEffect` was absent from 1.125.0 and joined the `Effect` union in 1.131.0 with the shape `{ type: "SHADER", visible: boolean, id: string, properties?: Record<string, ShaderPropertyValue> }`.
- A live `style_manage` validation failure on channel `zgkx` listed `SHADER` with a required `id` among the Figma runtime’s accepted variants.
- Across those two declaration snapshots, the source review found `noiseSizeVector?: Vector` added to the `NOISE` and `TEXTURE` effect bases and no other change to the pre-existing effect variants.
- The plugin source type-checked with zero errors against a temporarily substituted 1.131.0 declaration file.
- The existing Q35 effect-parity test went red on the additional `Effect` union member, as designed.
- `scripts/gen-node-fields.ts` derives committed node-field artifacts from the typings. A pin change can therefore change which node properties `node_info` exposes.

The consequence was a schema/runtime mismatch: an agent could neither author a `SHADER` effect nor safely round-trip a style containing one through the strict effect-writing contract.

These observations justify this work, but they do not waive revalidation. Published packages, declarations, generator output, repository code, and the runtime may have changed since the evidence was collected.

## 4. Goals and non-goals

### Goals

1. Revalidate and pin `@figma/plugin-typings` `1.131.0`; selecting another target requires an explicit PRD revision.
2. Make every `Effect` variant in that pin explicit in the strict write schema.
3. Add an API-faithful `SHADER` branch with a required `id` and lossless `properties` forwarding.
4. Add the revalidated `noiseSizeVector` surface to `NOISE` and `TEXTURE` without stripping or rewriting it.
5. Regenerate and review every typings-derived artifact as its own public-surface change.
6. Prove the effect-parity lever fails on the pin change alone and passes only after the schema catches up.
7. Preserve rejection of unknown effect types; future variants continue to arrive through a deliberate typings bump.
8. Record exact repository evidence separately from live Figma evidence.

### Explicit non-goals

- No fallback effect branch accepting arbitrary unknown `type` values.
- No loosening of any known effect variant to a broad catchall.
- No broader dependency sweep.
- No new shader-creation, shader-import, or shader-discovery tool unless Gate R0 proves the existing read surface cannot supply a usable `id` and a separately approved PRD expands scope.
- No manual edits to generated node-field artifacts.
- No unrelated source refactor or runtime behavior change to satisfy new TypeScript errors.
- No reaction-schema implementation; the reaction PRD consumes the selected typings version but owns its own contract.
- No claim that mock acceptance establishes live Figma storage or read-back behavior.

## 5. Gate R0 — pre-implementation revalidation

> [!CAUTION]
> Gate R0 is a release blocker. Its evidence must be reviewed before changing the dependency pin or production schema.

- [ ] Record the current repository release version, `@figma/plugin-typings` pin, lockfile resolution, Bun/TypeScript versions, and clean baseline gate results.
- [ ] Query the authoritative package registry and official Figma declarations to confirm the planned `1.131.0` target. Record its tarball/integrity identity and publication date. If another target is proposed, stop and revise this PRD before implementation.
- [ ] Diff the pinned and target declarations for `Effect`, every effect variant, `ShaderEffect`, `ShaderPropertyValue`, `Vector`, and any alias or interface those declarations transitively reference.
- [ ] Re-run the reaction declaration comparison for `Reaction`, `Action`, `Trigger`, `Transition`, and `VariableData` so the downstream reaction PRD receives an explicit changed/unchanged result.
- [ ] Run the generator on the unchanged baseline and inventory every output it owns. Then run it against the target and record exact additions, removals, and semantic changes in each generated artifact.
- [ ] Re-measure the complete input-catchall inventory from current schemas and handlers. The source PRD called the shader property map the “fourth” entry; that ordinal is not carried forward without a fresh inventory.
- [ ] Prove that the open `SHADER.properties` record survives schema parsing, normalization, socket serialization, plugin-boundary validation, and setter construction without field stripping.
- [ ] Run `check:types:plugin` against the installed target. Classify every new diagnostic. Fix type-expression gaps at source without suppressions; stop and revise this PRD if a fix requires an unplanned behavior change.
- [ ] Prove the effect-parity test is green on the baseline, red on the pin change alone, and green only after the target schema is implemented. Record the named failing test and exact counts.
- [ ] Determine how an agent can discover or reuse a valid shader `id` through the shipped read surface. If no usable ID is observable in a real test document, record live verification as fixture-unavailable and decide explicitly whether authoring support is useful without new discovery scope.
- [ ] Classify the generated node-field delta as additive, removal/breaking, or behaviorally ambiguous. Any removal or broad unexpected expansion stops the minor release for compatibility review.
- [ ] Obtain explicit human approval of the target version, declaration diff, generated diff, catchall inventory, shader-ID discovery result, and any revised schema details.

Gate R0 produces dated evidence; it does not mutate production files.

## 6. Product decisions and exact contract

The `T2-D*` labels below are local subdivisions of historical source decision v2.3.4 D8; they do not reuse or replace the umbrella ledger's D1–D6 identifiers.

### T2-D1 — The exact pin and parity test are the forward-compatibility mechanism

Move `@figma/plugin-typings` from `1.125.0` to the revalidated `1.131.0` target. Update `package.json` and `package-lock.json` together. Floating ranges are forbidden. A different target requires a reviewed PRD revision because it can change both the effect and generated-node-field contracts.

The `Effect`-union parity test must read the installed target declarations and fail when a declared variant is missing from the write schema. It may not be bypassed by hard-coding an expected count independent of the declarations or by adding an arbitrary fallback branch.

Future variants follow the same standing rule: bump the pin, observe the parity failure, review the declaration/runtime delta, and add an explicit branch.

### T2-D2 — `SHADER` is a strict effect variant with an open properties record

Add `SHADER` to `EFFECT_TYPES` and to the target effect union with a branch equivalent to:

```ts
{
  type: "SHADER";
  id: string;
  visible?: boolean;
  properties?: Record<string, unknown>;
}
```

Requirements:

- `id` is a required string. Figma requires the field and the server cannot synthesize a safe default.
- `visible` follows the handler-default convention used by the other effect variants: omission is accepted only if the implementation supplies the documented default without changing an explicitly supplied value.
- `properties` is deliberately an open record because its definition-ID keys and polymorphic `ShaderPropertyValue` members are not enumerated by this release.
- Parsed properties, including unknown definition IDs and supported nested values such as variable bindings, reach the setter unchanged.
- `normalizeEffects` must not remove, rewrite, or default `id` or `properties`.
- A missing `id` fails at the precise schema path with a corrective message.

The property map is added as the fourth entry in the source D8 catchall inventory, subject to Gate R0 confirming that ordinal on the scheduled baseline. Its membership rationale is that dynamic keys/values are required by Figma and the handler forwards them untouched.

### T2-D3 — `NOISE` and `TEXTURE` expose the target vector field honestly

Add `noiseSizeVector?: Vector` to the `NOISE` and `TEXTURE` write branches, matching the `1.131.0` declarations. The field is optional and must pass through normalization without truncation, rewriting, or stripping.

### T2-D4 — Generated node-field changes are public-surface changes

Run the repository’s generator through its established package script and commit every output it owns. Review the target diff separately from hand-written effect-schema changes.

At the drafting baseline, `scripts/gen-node-fields.ts` writes
`figma_plugin/utils/nodeFields.generated.ts`,
`src/mcp_server/tools/bindableFields.generated.ts`, and
`skills/figma-edit/references/node-fields.md`. Gate R0 must confirm that inventory
from the generator itself rather than treating this list as permanent.

For every added or removed field, record:

- the originating Figma declaration;
- whether it affects “all,” data, bindable, guide, or other generated inventories;
- whether `node_info` can read it;
- whether any generated mutation/binding surface becomes newly reachable;
- tests or live evidence appropriate to that field;
- the commit-message and CHANGELOG wording.

Generated removals and unexpected behavior changes are release blockers. Generated files are never edited to make the gate green.

### T2-D5 — No general unknown-effect escape hatch

The schema continues to reject an effect `type` outside the selected declaration union. A fallback union member would weaken normal validation into competing branches and could reopen the previous accept-and-discard failure. This release does not add one.

Read surfaces may remain open where their contract requires runtime observability, but write acceptance stays tied to the exact pin.

### T2-D6 — Type diagnostics cannot smuggle in behavior changes

The dependency is declaration-only for the plugin build; no new runtime package import is introduced. If the target exposes TypeScript errors, fix genuine type-expression/path/ambient gaps at source with no suppression. Any required control-flow, validation-order, permission, scope, or mutation change stops implementation and requires an explicit PRD revision.

The generated diff, effect-schema diff, and any type-only repair must remain separable in review.

## 7. Scope of work

### In scope

1. Gate R0 and its reviewed evidence record.
2. Exact `@figma/plugin-typings` pin and lockfile update.
3. Revalidated `SHADER` schema, normalization, and boundary support.
4. Revalidated `noiseSizeVector` support for `NOISE` and `TEXTURE`.
5. Effect-union and catchall-inventory parity updates.
6. Regeneration and independent review of every typings-derived artifact.
7. Focused schema, normalizer, declaration-parity, generator, tool-boundary, and bundle tests.
8. Agent-guide and tool-description updates needed to compose `SHADER` correctly.
9. CHANGELOG disclosure of the dependency pin, effect support, exact generated field delta, and any compatibility limitation.
10. Assigned-minor version updates on every enforced version surface.
11. Dedicated-file live verification or an explicit fixture-unavailable result.

### Out of scope

The explicit non-goals in Section 4 are release constraints. In particular, this release does not add a second effect API, a generic unknown-variant path, unrelated dependency updates, or hidden manual changes to generated output.

## 8. Compatibility and release posture

- `SHADER` and `noiseSizeVector` authoring are additive schema capabilities.
- A generated `node_info` field addition is an additive read-surface change but still requires disclosure and review.
- Any generated field removal, changed meaning, newly writable/bindable field with unreviewed safety implications, or effect-schema regression is not silently accepted as a minor change.
- Existing effect variants must retain their current accepted inputs, defaults, normalization, and output behavior unless the revalidated target proves the old contract invalid and a PRD revision approves the change.
- Existing unknown effect types remain rejected.
- No permission or scope behavior changes.
- The later prototype-reaction release may depend on this pin; this release does not depend on reaction work.

## 9. Implementation plan

### Phase 0 — Close Gate R0

- [ ] Produce the complete revalidation record.
- [ ] Resolve every blocker and obtain explicit approval.
- [ ] Update the proposed target and schema clauses here if the evidence differs from the historical 1.131.0 findings.

### Phase 1 — Establish the baseline

- [ ] Run and record clean focused/full/type/generated/bundle gates before mutation.
- [ ] Capture baseline generator outputs and effect-parity results.
- [ ] Inventory current effect branches, catchalls, normalizers, and public tool metadata.

### Phase 2 — Pin bump and intentional red

- [ ] Update only `package.json` and `package-lock.json` to the approved `1.131.0` target.
- [ ] Run the generator and preserve the unedited generated diff for review.
- [ ] Run `check:types:plugin`.
- [ ] Run the Q35 parity test and record its expected named failure on the newly declared variant or field.
- [ ] Stop if the failure does not prove the intended lever or if unrelated behavior changes are required.

### Phase 3 — Effect contract

- [ ] Add `SHADER` to `EFFECT_TYPES`, the strict union branch, and the open, losslessly forwarded properties record.
- [ ] Add the revalidated `noiseSizeVector` branches.
- [ ] Update `normalizeEffects` without changing other variants.
- [ ] Update the current catchall inventory with the measured count and rationale.
- [ ] Restore the parity and focused schema/normalizer suites to green.

### Phase 4 — Generated surface, documentation, and version

- [ ] Review every generated-file delta independently and add focused coverage.
- [ ] Update tool descriptions, agent guides, and generated guide output through their established source/generator path.
- [ ] Add the public CHANGELOG entry with exact dependency and field deltas.
- [ ] Assign and update the minor version across all enforced surfaces.
- [ ] Rebuild the committed plugin bundle.

### Phase 5 — Verification and release closure

- [ ] Run every repository gate in Section 10.
- [ ] Red-proof the new production invariants.
- [ ] Run the dedicated-file live matrix without rebuilding during the bound live session.
- [ ] Record fixture-unavailable items honestly and reconcile the test document exactly.
- [ ] Tag only after every non-live acceptance item is green and the live evidence status is explicit.

## 10. Verification requirements

### Repository verification

- `check:types:plugin` reports zero errors against the installed target.
- `check:generated` passes after regeneration, and the committed outputs equal a fresh generator run.
- The effect-parity test is:
  1. green on the baseline;
  2. red on the approved pin change alone;
  3. green after the explicit schema update.
- A `SHADER` effect with a valid `id` is accepted, survives `normalizeEffects` by deep structural equality, crosses the registered MCP callback, and reaches the plugin setter unchanged.
- A missing `id` is rejected at the exact path.
- Representative `properties` values, including a variable-binding-shaped value, round-trip without field stripping.
- `NOISE` and `TEXTURE` accept the revalidated vector form and preserve it unchanged.
- Every pre-existing effect variant retains focused accept/reject fixtures.
- An unknown effect `type` remains rejected; no fallback branch is present.
- On the planned `1.125.0` → `1.131.0` baseline, the catchall-inventory assertion contains exactly four entries after adding `SHADER.properties` and proves each membership rationale. A different revalidated baseline count requires an explicit PRD revision rather than a silent test update.
- Generator tests cover the exact field additions/removals and any newly reachable bindable field.
- No new suppression, broad `any`, or arbitrary effect fallback is introduced.
- `EFFECT_TYPES`, registered tool metadata, and generated manifests expose the new schema.

Run at minimum:

- `bun run build:all`;
- `bun run check:plugin`;
- `bun run check:versions`;
- `bun run check:types:plugin`;
- `bun run check:generated`;
- `bun run check:suppressions`;
- the focused effect/parity/generator tests;
- the full test suite;
- `git diff --check`.

### Regression red-proofing

For each new production invariant, deliberately break the exact protected line, record the named test failure and exact count, restore the line, and rerun green. At minimum red-proof:

1. removal of `SHADER` from the effect union;
2. making `id` optional;
3. stripping a nested shader property during normalization;
4. bypassing effect-declaration parity;
5. accepting an unknown effect type;
6. making one generated output stale;
7. stripping `noiseSizeVector` during normalization.

A test that remains green after its protected line is broken is not accepted as a regression guard.

### Live Figma verification

Use a dedicated Figma Design test file and a fresh channel:

1. Record repository/package/plugin versions, tool inventory, channel, file identity, and opening document counts.
2. Discover with `page_info` then `node_info`; pass names back verbatim.
3. Locate an existing shader through an available read surface and record the exact source of its `id`. Do not invent an ID.
4. Use `style_manage` to write an EFFECT style containing that `SHADER` effect.
5. Read the authoritative style back and prove the same `id` and every supplied supported property are present.
6. Where authorable fixtures exist, exercise `noiseSizeVector` and verify authoritative read-back.
7. Probe representative newly generated `node_info` fields on node types that actually expose them.
8. Restore or delete every disposable artifact and reconcile the exact opening state.

If the document/runtime exposes no shader ID or authorable vector fixture, record that row as `fixture-unavailable`. Repository/mock tests remain evidence for the encoded contract only; they do not become live-host proof.

## 11. Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| The historical 1.131.0 target is stale or no longer the right upgrade | High until R0 | Re-query the authoritative registry and diff the exact selected declarations before implementation. |
| The target surfaces new plugin TypeScript errors | Low in the historical 1.131.0 probe; unknown now | Run the type gate during R0; fix type-expression gaps with no suppression and stop on behavior-changing fallout. |
| Generated node fields change `node_info` output | Medium | Review every generated artifact separately; name every addition/removal; block removals and unreviewed mutation/binding reachability. |
| A multi-version declaration jump includes unrelated API drift | Medium | Diff transitive declarations, pin exactly one target, and keep all unrelated dependencies fixed. |
| `SHADER.properties` open record admits values Figma later rejects | Medium | Preserve the source D8 exception narrowly, forward it untouched, document the Figma-origin rejection path, and do not generalize it to other effect branches. |
| A shader ID cannot be discovered through the shipped tool surface | Medium | Revalidate discovery before implementation; record fixture-unavailable honestly or create a separately approved discovery PRD. |
| Figma accepts the setter payload but normalizes or drops it on read-back | Medium | Require authoritative live read-back; acceptance alone is not successful support. |
| Generated guide or bindable-field outputs are missed | Medium | Inventory the generator’s complete output set during R0 and require a fresh-output equality check. |

## 12. Acceptance gate

The release is complete only when:

1. Gate R0 is complete, dated, and explicitly approved.
2. One exact target typings version and one standalone minor release version are assigned.
3. Only `@figma/plugin-typings` moves in the dependency graph.
4. The complete declaration diff, generator-output inventory, catchall inventory, and shader-ID discovery result are recorded.
5. `EFFECT_TYPES` and the strict effect union contain `SHADER` with a required `id` and an open properties record that survives every boundary unchanged.
6. `NOISE` and `TEXTURE` expose the revalidated vector field without stripping or rewriting it.
7. Unknown effect variants remain rejected.
8. The effect-parity lever has recorded baseline-green, bump-only-red, and restored-green evidence.
9. Plugin type-check, generated, bundle, version, suppression, focused, full-suite, and diff gates pass.
10. Every named new regression is red-proofed against its exact production line.
11. Every generated field addition/removal is reviewed, tested as appropriate, and disclosed; no breaking removal or unreviewed write/binding reachability remains.
12. Tool metadata, guides, and the public CHANGELOG describe the exact accepted call and generated-field delta.
13. Live `SHADER` write/read-back evidence succeeds, or the missing authorable fixture is recorded explicitly without a success claim.
14. Live and repository/mock evidence are reported separately with exact document cleanup reconciliation.
15. No permission, scope, name-verification, or unrelated effect behavior changes.
16. The source-ID mapping below has no unassigned Track 2 requirement.

## 13. Historical provenance

The following rows preserve the original Track 2 evidence boundary. They must be refreshed by Gate R0 before implementation.

| Source item | Verified at | Historical finding |
| :- | :- | :- |
| Pinned versus published typings | `package.json` plus `npm view @figma/plugin-typings`, 2026-07-26 | Pinned 1.125.0; evaluated published version 1.131.0. |
| `ShaderEffect` origin | 1.125.0 versus 1.131.0 `plugin-api-standalone.d.ts`, 2026-07-26 | Absent in 1.125.0; present in 1.131.0 and added to `Effect`. |
| Runtime ahead of pin | Live `style_manage` validation error, channel `zgkx`, 2026-07-26 | Runtime listed `SHADER` with required `id` among accepted variants. |
| Existing effect-variant delta | Per-interface declaration diff, 2026-07-26 | The source review found only additive `noiseSizeVector?: Vector` on `NOISE` and `TEXTURE`. |
| Type-gate impact | `tsc --noEmit -p figma_plugin/tsconfig.json` against a temporarily substituted 1.131.0 declaration, 2026-07-26 | Zero errors; the installed dependency/lockfile was restored afterward. |
| Q35 parity lever | Existing effect-parity test under substituted declarations, 2026-07-26 | Went red on the eighth `Effect` union member. |
| Generated coupling | Package generation scripts and generated-file headers, 2026-07-26 | Typings drive committed node-field output and can change `node_info` readability. |

The unchanged historical revision ledger records this scope as [Rev 2](<../initiative/01 - Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing/release-changelog.md#change-1-prd-revision-history>). Later ledger entries may mention Track 2 only as a dependency of prototype-reaction work; they do not expand this release.

## 14. Source-ID mapping

| Original v2.3.4 source | Standalone destination |
| :- | :- |
| Track list item 2 and Origin (Track 2) | Sections 1–3 |
| “Track 2 — the pinned typings are behind the runtime” | Sections 3 and 13 |
| D8 — bump, `SHADER`/`noiseSizeVector`, catchall inventory, no escape hatch | Sections 5–8 |
| Scope item 9 | Section 7 |
| Track 2 explicit non-goals | Sections 4 and 7 |
| Phase ordering statement for T2 | Sections 8–9; this release has no dependency on the former Track 1 |
| Phase T2 | Section 9 |
| Testing: isolated diff, type/generated/parity requirements | Section 10 |
| Live `SHADER` probe and fixture-unavailable rule | Section 10 |
| Rollout/tag condition | Sections 9–12 |
| Three Track 2 risk rows | Section 11 |
| Seven Track 2 provenance rows | Section 13 |
| Release identity/version surfaces shared by the source release | Section 2 |
| Source Rev 2 history | Section 13 and the unchanged ledger |

The [source initiative](<../initiative/01 - Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing/initiative.md>) remains the historical source pointer after the split. The [release ledger](<../initiative/01 - Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing/release-changelog.md>) is historical evidence and is not rewritten or renumbered by this standalone PRD.
