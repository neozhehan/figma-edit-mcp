# Backlog conflicts

This file records every conflict found by reviewing the twenty standalone PRDs in [`future/prd/`](future/prd/) against each other on 2026-08-04. [`BACKLOG.md`](BACKLOG.md) summarizes these as open items; this file is the detailed record.

No two PRDs propose contradictory product behavior. The catalog has already been de-conflicted at that level: every hard-cut rename has exactly one owner, and the cumulative tool arithmetic reconciles at five renames, four additions, two removals, and a net increase of two tools. What remains are shared contracts with more than one owner, ordering assumptions that cost rework, and one policy question that no single PRD can answer.

Each conflict below states what each document says, why the two positions cannot both stand, and what has to be decided. None of these is a defect in a single PRD. Each needs a decision recorded outside the PRD that discovers it.

## Summary

| # | Conflict | Documents | Severity |
| :- | :- | :- | :- |
| 1 | `PaintInput` is defined three ways | PRD-008, PRD-014, PRD-015 | High |
| 2 | `variable_delete` has two owners | PRD-004, PRD-017 | High |
| 3 | PRD-004's migration matrix targets tools that later releases delete or reshape | PRD-004, PRD-014, PRD-017, PRD-019 | High |
| 4 | The `node_info` traversal core has two owners | PRD-004, PRD-005 | Medium |
| 5 | `variable_list` internals have two owners | PRD-007, PRD-017 | Medium |
| 6 | The `swap_overrides_instances` prompt competes with the new swap tool | PRD-019, PRD-020 | Medium |
| 7 | `NodeMatch.matchEvidence` has no owner | PRD-005, PRD-006, PRD-007 | Low |
| 8 | Eleven hard cutovers, each accepted in isolation | Eleven PRDs | High, policy |
| 9 | The `node_info` read surface has four owners | PRD-002, PRD-005, PRD-008, PRD-015, PRD-019 | Medium |
| 10 | Adjacent write contracts do not cross-reference each other | PRD-009, PRD-011, PRD-012, PRD-013, PRD-018 | Low |

## 1. `PaintInput` is defined three ways

**What each document says.**

[PRD-008](future/prd/PRD-008-Styled-Text-Read-Fidelity.md) claims ownership of the canonical paint shape. Its §10.2 union gives the IMAGE branch `source: { kind: "HASH"; imageHash: string }` and nothing else. §3 states that the later paint-write release "must import and extend the same canonical types/helpers; it must not redefine the read format." §12 states that a later write release may accept URL and base64 sources "but read output remains the exact hash-bearing branches above." Its SOLID branch and gradient stops use `boundVariables?: { color: CanonicalVariableAlias }`.

[PRD-014](future/prd/PRD-014-Range-Safe-Text-Editing.md) §RTE-D2 imports that type as `CanonicalPaintInput = PaintInput`, then builds a separate `TextPaintInput` that removes the IMAGE `source` field and re-adds a widened one named `ImageSourceInput`. `PaintInput` itself is left unchanged. Its non-goals forbid "a second paint grammar" and any "text-only paint normalizer."

[PRD-015](future/prd/PRD-015-Paint-Stroke-and-Image-Metadata.md) restates the whole union under the same name `PaintInput`, with the IMAGE branch declared as `source: ImageSource`, where `ImageSource` is URL, BASE64, or HASH. It uses `VariableAlias` where PRD-008 uses `CanonicalVariableAlias`. Its predecessor note says PRD-015 "must not fork a second serializer or change the already-published read union silently" and that it "reuses" PRD-014's extension "rather than defining a competing branch."

**Why this conflicts.**

Three positions cannot all hold. After PRD-015 ships, either `PaintInput` is a strict read union that only ever carries a hash, in which case PRD-015's own `node_set_fill` input type is wrong, or it is a widened write union, in which case PRD-008's published read type has been changed by a later release and PRD-014's `TextPaintInput` is a redundant derivation that removes and re-adds a field the base branch already has. PRD-015 also cannot be reusing PRD-014's extension, because PRD-014 deliberately kept that extension out of `PaintInput`. The two source-type names differ as well, so a literal reuse is not possible without renaming one of them.

**What has to be decided.**

Fix one shape and one set of names before PRD-008 is implemented, because PRD-008 is the release that publishes the type. Either declare `PaintInput` a read-only union with a separate named write union that widens the IMAGE branch, or declare one union used for both directions and state in PRD-008 that read output is a documented subset of it. Then align `ImageSource` against `ImageSourceInput` and `VariableAlias` against `CanonicalVariableAlias`.

## 2. `variable_delete` has two owners

**What each document says.**

[PRD-017](future/prd/PRD-017-Variable-Metadata-and-Mode-Lifecycle.md) hard-cuts `variable_delete` to a required discriminated `target` object covering `VARIABLES`, `COLLECTION`, and `MODE`. The old top-level shape must fail at the MCP boundary. The new MODE branch performs a document-wide explicit-mode consumer scan and fails closed with `DOCUMENT_SCAN_INCOMPLETE`.

[PRD-004](future/prd/PRD-004-Timeout-Liveness-and-Mutation-Outcome-Integrity.md) treats `variable_delete` as one of its central cases. Its consolidation rationale names it as the command that "crosses both page orchestration and the receipt-before-mutation boundary." Finding T2 sizes its page-load exposure, and the migration matrix requires progress before the first page await, progress around every load and traversal, a receipt recorded before the first `remove()`, and no concurrent page loads.

**Why this conflicts.**

Both releases rewrite the same handler for different reasons, and neither cites the other. PRD-017's exclusion list rules out "general timeout/receipt protocol changes," which acknowledges that PRD-004's domain exists but does not resolve the overlap. If PRD-004 ships first, PRD-017 rewrites the input shape and adds a new long-running scan branch that must be retro-fitted with progress reporting and receipt handling. If PRD-017 ships first, PRD-004's finding and matrix row describe an input shape that no longer exists, and its page-orchestration work must cover a mode-consumer scan its evidence never measured.

**What has to be decided.**

Choose the order, then amend the later PRD's Phase 0 to state explicitly what it inherits. PRD-017's mode-consumer scan is a new document-wide traversal and belongs in PRD-004's inventory if PRD-017 goes first.

## 3. PRD-004's migration matrix targets tools that later releases delete or reshape

**What each document says.**

PRD-004's §7 tool migration matrix assigns required migrations to `node_info`, `variable_delete`, `channel_join`, `annotation_set`, `instance_set_overrides`, `text_set_content`, `node_delete`, `annotation_list`, `reaction_list`, `node_export_visual`, `style_list`, `component_list`, and `variable_list`. Its release identity says the implementation baseline may include earlier standalone releases and that Phase 1 revalidates the command and tool inventory "rather than assuming no intervening release."

[PRD-019](future/prd/PRD-019-Exact-Instance-State-Property-Writes-and-Override-Reset.md) removes `instance_set_overrides` entirely, with no compatibility route. PRD-017 reshapes `variable_delete`. [PRD-014](future/prd/PRD-014-Range-Safe-Text-Editing.md) adds a ranged branch to `text_set_content`. [PRD-005](future/prd/PRD-005-Scoped-Match-Discovery.md) rewrites `node_info` traversal. [PRD-003](future/prd/PRD-003-Lossless-Prototype-Reaction-Reads-and-Conflict-Safe-Localized-Updates.md) rewrites `reaction_list` output.

**Why this conflicts.**

PRD-004 requires receipt-before-first-swap work for `instance_set_overrides`, a tool PRD-019 deletes. If PRD-004 precedes PRD-019, that work is discarded. Its rows for `variable_delete`, `text_set_content`, `node_info`, and `reaction_list` all describe handlers that other releases are rewriting. The rebase clause makes this survivable but does not make it free, and the matrix as written implies an inventory that only matches the current checkout.

**What has to be decided.**

If PRD-004 is scheduled early, drop the `instance_set_overrides` row and record that the tool is scheduled for removal, or accept the rework explicitly. If it is scheduled late, plan for a materially different matrix than the one written.

## 4. The `node_info` traversal core has two owners

**What each document says.**

PRD-005 adds a predicate evaluator and two result modes. `maxResults` caps returned matches but not traversal, traversal completes the selected scope after the cap is filled so `matchedCount` stays exact, and no result reports exact totals after an incomplete page traversal. §8.2 requires pages to load one at a time, progress before yielding "under the existing page-scan timeout discipline," and a fail-closed error listing completed, failed, and unattempted page IDs.

PRD-004's finding T1 requires converting the same deep traversal to an iterative chunked walker that yields, with time-based heartbeats inside the current root and stage progress around export and property work. Its cancellation rules allow a read to stop between chunks and return cancelled coverage.

**Why this conflicts.**

These are compatible in principle and PRD-005 already fails closed rather than reporting partial counts as complete. They are not independent work, though. Both rewrite the same traversal, one for correctness of counting and one for liveness and cancellation, and each describes that traversal as if it were the only party changing it. A cancelled or chunk-interrupted `MATCHES` read also needs a defined result, which PRD-005 covers for page-load failure but not for cooperative cancellation, a concept PRD-004 introduces.

**What has to be decided.**

Whichever ships second must adopt the other's invariants explicitly. Add the cancelled-read case to the `MATCHES` result contract, since PRD-005 currently has no shape for a scan that stopped on request rather than on failure.

## 5. `variable_list` internals have two owners

**What each document says.**

[PRD-007](future/prd/PRD-007-Direct-Variable-Binding-Discovery.md) replaces any parallel direct-node extraction inside `variable_list` with one shared extractor, and requires that the two paths cannot disagree about direct node consumers for the same scope and IDs.

PRD-017 expands `variable_list` readback for code syntax and complete collection identity, and makes it the required discovery and readback tool for every action in its release.

[`future/prd/README.md`](future/prd/README.md) states that no future capability PRD is a hard predecessor for PRD-017, and that it should be scheduled after PRD-007 "only when sharing its direct-consumer utilities is useful."

**Why this conflicts.**

Both releases open the same file for different reasons, and the catalog explicitly permits either order. If PRD-017 goes first, PRD-007 must retro-fit its shared extractor into code that was just rewritten, and its parity requirement then covers a reader whose output shape changed in the interim.

**What has to be decided.**

Nothing about correctness, only sequencing cost. Record the preferred order so the second implementer is not surprised.

## 6. The `swap_overrides_instances` prompt competes with the new swap tool

**What each document says.**

[PRD-020](future/prd/PRD-020-Instance-Relationship-Lifecycle.md) adds `instance_swap_component` and `instance_detach`. It states that the predecessor's `instance_set_property`, `instance_get_overrides`, and `instance_set_overrides` routes "remain callable here without behavioral changes," that this release "must distinguish the new identity-preserving swap from the legacy source-template hybrid," and that it "must not teach that hybrid as an equivalent swap." Its exclusion list rules out "removal of legacy override tools/prompts." One of its goals is to "provide complete tool-selection guidance between swap, detach, property writes, override reset, direct edits, and clone."

PRD-019 removes the `swap_overrides_instances` prompt and records the prompt count decreasing by one.

The prompt exists today at [`src/mcp_server/tools/instance.ts:107`](../src/mcp_server/tools/instance.ts). It is described as a "strategy for transferring overrides between component instances" and its body instructs the caller to use `instance_get_overrides` and then `instance_set_overrides`.

**Why this conflicts.**

Between PRD-020 and PRD-019 there is a released interval in which a registered prompt whose name contains the word "swap" recommends the legacy hybrid for the exact intent `instance_swap_component` now serves. PRD-020 cannot both leave the prompt untouched and deliver complete tool-selection guidance for swap.

**What has to be decided.**

Either PRD-020 revises the prompt text without changing the legacy tools it names, which does not violate its own non-goals, or the overlap is accepted and stated in PRD-020's guidance work.

## 7. `NodeMatch.matchEvidence` has no owner

**What each document says.**

PRD-005 §7.4 defines `NodeMatch` as `id`, `name`, `type`, `path`, and optional `properties`. There is no `matchEvidence` field and no statement reserving one.

[PRD-006](future/prd/PRD-006-Typography-and-Font-Discovery.md) lists `NodeMatch.matchEvidence` in its public API effect table and defines `TypographyMatchEvidence` with `fontNames`, `matchedFontNameCount`, `textStyles`, `matchedTextStyleCount`, and `evidenceTruncated`.

PRD-007 lists the same `NodeMatch.matchEvidence` surface and defines `VariableBindingMatchEvidence` with `variableBindings`, `matchedVariableBindingCount`, and `evidenceTruncated`.

**Why this conflicts.**

Two releases add categories to a field the base type never declares. The merge happens to work: the category keys are disjoint, and PRD-007 defines the shared truncation rule as true "when the complete unique set exceeds 50 or when another installed evidence category is truncated." Nothing states the combined shape, its placement in `TREE` mode as opposed to `MATCHES`, or which release is responsible for it.

**What has to be decided.**

Declare the optional field in PRD-005's `NodeMatch` as a documented extension point, the same way §6.1 already reserves the filter for future predicates.

## 8. Eleven hard cutovers, each accepted in isolation

**What each document says.**

Eleven releases contain a public breaking change, and each declares on its own that the project accepts it in a minor release.

| PRD | Cutover |
| :- | :- |
| PRD-003 | `reaction_list` and `reaction_update` input and output shapes replaced |
| PRD-005 | `filter.type`, `filter.layoutMode`, and `search` rejected with no alias |
| PRD-008 | Requested paint read output reshaped, image paints especially |
| PRD-011 | `node_group` replaced by `node_combine` |
| PRD-012 | `node_set_auto_layout` replaced by `node_set_layout` |
| PRD-013 | `node_set_effects` replaced by `node_set_appearance` |
| PRD-015 | `node_set_fill` and `node_set_stroke` legacy input branches removed |
| PRD-016 | `create_frame` replaced by `create_region`; `create_text` and `create_svg` gain required discriminators |
| PRD-017 | `variable_delete` requires a discriminated `target` |
| PRD-018 | `component_manage_property` EDIT and `component_delete_property` select only by canonical `propertyId` |
| PRD-019 | `instance_set_property` renamed; `instance_get_overrides` and `instance_set_overrides` removed; `node_info` `mainComponent` reshaped |

Two more are conditional. PRD-001 may cut over the `channel_join` boundary envelope depending on the Q1 ratification, and changes message text that agents may currently match on. PRD-002 may change generated node fields, which changes what `node_info` returns.

PRD-005 and PRD-008 each add that if maintainers do not accept the exception at scheduling time, the PRD "must be reclassified before implementation" and that aliases or duplicate shapes are not an allowed workaround.

**Why this conflicts.**

Each acceptance is locally reasonable and none of them can see the others. Taken together they commit the project to at least eleven breaking minor releases, with the migration cost falling on the same callers repeatedly, and they defer the same maintainer decision eleven times. The reclassification clauses mean the decision cannot be avoided, only postponed.

**What has to be decided.**

Make the policy call once for the whole set rather than eleven times at eleven scheduling meetings. If breaking minors are acceptable, record that decision where all eleven PRDs can cite it. If they are not, several of these PRDs need reclassification before any of them starts, and the ones with no alternative to a cutover need to be grouped into a major release.

## 9. The `node_info` read surface has four owners

**What each document says.**

PRD-005 promises that unfiltered `TREE` output stays byte-for-byte compatible "except for additive output-schema metadata."

[PRD-002](future/prd/PRD-002-Figma-Typings-Bump-and-Shader-Effects.md) states that the release "may add typings-derived fields to the `node_info` read surface," because `scripts/gen-node-fields.ts` derives committed artifacts from the pinned typings. Gate R0 requires classifying that delta as additive, breaking, or ambiguous.

PRD-008 reshapes requested `fills` and `strokes` output through one canonical serializer and calls it a deliberate read-shape hard cutover.

PRD-015 adds a `resolveImageDimensions` read option. PRD-019 reshapes the requested `mainComponent` property from a string to an object.

**Why this conflicts.**

Four releases change what `node_info` returns, in three different ways: generated field inventory, paint serialization, and a per-property shape change. Each rebaselines in its own Phase 0, which is the correct local behavior, but no document owns the read surface as a whole or tracks the accumulated change for a caller that upgrades across several releases.

**What has to be decided.**

Nothing blocking. Keep one running record of `node_info` output changes across these four releases so the changelog entries can be written against a known baseline rather than reconstructed.

## 10. Adjacent write contracts do not cross-reference each other

**What each document says.**

PRD-013 authorizes a mask change against the pre-mutation sibling range and requires every member of that range to be in scope. [PRD-011](future/prd/PRD-011-Structural-Combine.md) reorders and reparents siblings under a named parent, which is the state PRD-013's guard is computed from.

PRD-013 writes `visible` as an absolute literal value. PRD-018 adds `node_bind_component_property`, which can bind `visible` on a sublayer to a component property.

[PRD-009](future/prd/PRD-009-Transform-and-Ellipse-Geometry.md) sets absolute rotation and validates auto-layout effects during preflight. [PRD-012](future/prd/PRD-012-Layout-System.md) owns `layoutPositioning` and child participation, which determine whether that rotation is meaningful.

**Why this conflicts.**

None of these is a contradiction today, and each PRD's non-goal list correctly excludes the others' scope. What is missing is the combined rule: what a literal `visible` write means on a bound field, what a structural combine does to a mask guard computed a moment earlier, and how rotation interacts with a child that layout controls. The first caller to hit one of these will find no answer in any document.

**What has to be decided.**

Add a short cross-contract note to whichever release ships second in each pair. This is documentation work, not a schema change.
