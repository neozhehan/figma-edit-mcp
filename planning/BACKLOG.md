# Backlog

This file ranks the twenty standalone PRDs in [`future/prd/`](future/prd/) into one recommended delivery order. It is a planning aid, not a commitment. Each PRD remains independently releasable and version-unassigned; a version is assigned only when a release is scheduled.

The PRD catalog numbers identify documents, not order. This file supplies the order.

For the authoritative scope, dependency, and consolidation record, see [`future/prd/README.md`](future/prd/README.md). Where this file and a PRD disagree about scope, the PRD wins.

## What this ranking does not cover

[Initiative 05 — MCP Specification Update (2026-07-28)](<future/initiative/05 - MCP Spec Update (2026-07-28)/initiative.md>) is a future **major** release and is deliberately absent from the ranking below. It cannot be ranked against the twenty minors because it is gated on an external event: no published MCP TypeScript SDK yet supports protocol `2026-07-28`, and that Initiative blocks rather than works around a non-conforming runtime.

Two things are settled about its position regardless of when the SDK lands. It does not start until PRD-004 has shipped, because its progress, cancellation, and timeout sections are an adapter over PRD-004's command protocol rather than a second design of it. And every PRD in the ranking below ships under the current protocol, so none of them waits on it.

## How the ranking was made

Four criteria, applied in this order:

1. **Hard dependencies.** A release never appears before a release it requires.
2. **Unblocking leverage.** A release that gates several others is worth more early.
3. **Value to the primary audience.** The server exists so an agent can do ordinary design work in a real file. Capabilities a designer uses every day outrank capabilities used occasionally.
4. **Risk carried by delay.** Two releases get more expensive the longer they wait, because their inventory grows with every release shipped before them. Two others prevent silent loss of a user's work.

Effort is a T-shirt estimate from the scope of each PRD, not a measured figure.

## Ranked backlog

| # | PRD | Effort | Requires | Why here |
| :- | :- | :- | :- | :- |
| 1 | [PRD-005 — Scoped Match Discovery](future/prd/PRD-005-Scoped-Match-Discovery.md) | M | — | An agent cannot act on a node it cannot find. This gates PRD-006, 007, 008, 009, 014, and 015, and it is read-only, so shipping it first adds no mutation surface for PRD-004 to migrate later. |
| 2 | [PRD-004 — Timeout, Liveness, and Mutation-Outcome Integrity](future/prd/PRD-004-Timeout-Liveness-and-Mutation-Outcome-Integrity.md) | XL | — | The only release that stops a timed-out write from being retried blind. Its migration inventory covers every tool, so its cost rises with every release shipped before it. Ship it before the write surface grows. It is also the stated precondition for Initiative 05. |
| 3 | [PRD-013 — Appearance and Masking](future/prd/PRD-013-Appearance-and-Masking.md) | M | — | Visibility, opacity, blend mode, and masks are basic properties with no write path today. Independently schedulable. |
| 4 | [PRD-012 — Layout System](future/prd/PRD-012-Layout-System.md) | L | — | Auto layout is how modern Figma files are built. The current tool covers a fraction of it. Independently schedulable. |
| 5 | [PRD-006 — Typography and Font Discovery](future/prd/PRD-006-Typography-and-Font-Discovery.md) | M | 005 | Gates PRD-014 and PRD-016. Also fixes the case where an agent writes a font the editor session cannot load. |
| 6 | [PRD-008 — Styled-Text Read Fidelity](future/prd/PRD-008-Styled-Text-Read-Fidelity.md) | M | 005, 006 | Gates PRD-014 and PRD-015, and owns the canonical paint read shape that both consume. |
| 7 | [PRD-014 — Range-Safe Text Editing](future/prd/PRD-014-Range-Safe-Text-Editing.md) | L | 006, 008 | Whole-node content replacement currently collapses mixed styling. This is the first release that can edit part of a text node safely. |
| 8 | [PRD-015 — Paint, Stroke, and Image Metadata](future/prd/PRD-015-Paint-Stroke-and-Image-Metadata.md) | L | 008, 014 | Gradients, multiple fills, and real stroke geometry are ordinary design work and are unreachable today. |
| 9 | [PRD-009 — Transform and Ellipse Geometry](future/prd/PRD-009-Transform-and-Ellipse-Geometry.md) | S | 005 | Rotation is a small, obvious gap with a good value-to-effort ratio. Pull it forward opportunistically if a slot opens after PRD-005. |
| 10 | [PRD-020 — Instance Relationship Lifecycle](future/prd/PRD-020-Instance-Relationship-Lifecycle.md) | M | — | Swapping and detaching instances is common component work. It must ship before PRD-019, which names `instance_swap_component` in its migration guidance. |
| 11 | [PRD-018 — Canonical Component-Property Identity and Binding](future/prd/PRD-018-Canonical-Component-Property-Identity-and-Binding.md) | M | — | Property selection by display name is ambiguous whenever two properties share a name. Recommended before PRD-019 for consistent terminology. |
| 12 | [PRD-019 — Exact Instance State, Property Writes, and Override Reset](future/prd/PRD-019-Exact-Instance-State-Property-Writes-and-Override-Reset.md) | L | 020 (hard), 018 (recommended) | Replaces the heuristic override-transfer surface. It is the largest cutover in the component area, so it follows the two releases that supply its migration targets. |
| 13 | [PRD-017 — Variable Metadata and Mode Lifecycle](future/prd/PRD-017-Variable-Metadata-and-Mode-Lifecycle.md) | M | — | Completes the variable maintenance lifecycle. Valuable for design-system files, less so for ordinary editing. Independently schedulable. |
| 14 | [PRD-002 — Figma Typings Bump and SHADER Effects](future/prd/PRD-002-Figma-Typings-Bump-and-Shader-Effects.md) | S | — | Small, and it gates PRD-003. Its evidence is from 2026-07-26 and Gate R0 must revalidate it before any work starts. |
| 15 | [PRD-003 — Lossless Prototype Reaction Reads and Conflict-Safe Localized Updates](future/prd/PRD-003-Lossless-Prototype-Reaction-Reads-and-Conflict-Safe-Localized-Updates.md) | M | 002 | `reaction_list` silently drops `CHANGE_TO` reactions and `reaction_update` overwrites the whole array, which can destroy a concurrent edit by a person. The severity is high; the surface is narrow, which is why it sits here rather than higher. |
| 16 | [PRD-016 — Native Node Creation](future/prd/PRD-016-Native-Node-Creation.md) | L | 006, 009 | Adds text paths, lines, raw vectors, sections, and slices. Real gaps, but each is reachable today through a workaround more often than the items above. |
| 17 | [PRD-011 — Structural Combine](future/prd/PRD-011-Structural-Combine.md) | M | — | Boolean operations are useful, but implementation is blocked on live probes of native ordering and insertion behavior. Schedule it after the probe work is funded. |
| 18 | [PRD-007 — Direct Variable-Binding Discovery](future/prd/PRD-007-Direct-Variable-Binding-Discovery.md) | M | 005 | A narrow query that `variable_list` already answers less precisely. Worth doing, rarely urgent. |
| 19 | [PRD-001 — Legacy Error-Code Burn-Down](future/prd/PRD-001-Legacy-Error-Code-Burn-Down.md) | L | — | Improves recovery everywhere, but it is a large mechanical conversion whose site count shrinks with every capability release that rewrites a handler. Doing it late is cheaper. Its 2026-07-30 baseline of 313 sites must be re-measured before work starts, and Q1 must be ratified. |
| 20 | [PRD-010 — Scoped Page Rename](future/prd/PRD-010-Scoped-Page-Rename.md) | XS | — | One authority added to one existing tool. Low value, but small enough to slot into any release window as filler. |

## Delivery waves

The ranking groups into four waves. Within a wave the order is a preference, not a constraint, except where the dependency column says otherwise.

**Wave 1 — Foundation and integrity (1–2).** Discovery first, then the command protocol. After this wave an agent can find what it needs and can trust what a write result tells it.

**Wave 2 — The everyday editing surface (3–9).** Appearance, layout, typography reads, text editing, paint, and rotation. This wave closes most of the gap between what the server can do and what a designer does in an ordinary session.

**Wave 3 — Components, instances, and variables (10–13).** Swap and detach, canonical property identity, the instance cutover, and the variable mode lifecycle. Ordered so that each cutover has its migration target already shipped.

**Wave 4 — Long tail and cleanup (14–20).** Typings, reactions, creation branches, structural combine, binding discovery, error-code conversion, and page rename.

## Scheduling constraints

These constraints hold regardless of the ranking above.

| Constraint | Source |
| :- | :- |
| PRD-006, 007, 008, and 009 require PRD-005. | Each PRD's front matter |
| PRD-008 requires PRD-006. PRD-014 requires PRD-006 and PRD-008. PRD-015 requires PRD-008 and PRD-014. | PRD-008, PRD-014, PRD-015 |
| PRD-016 requires PRD-006 and PRD-009. PRD-012 and PRD-014 are optional helper reuse. | PRD-016 §5 |
| PRD-020 must ship before PRD-019. PRD-020 must not depend on PRD-019, or the two form a cycle. | PRD-019 § Scheduling dependency; PRD-020 § Schedule |
| PRD-003 must follow PRD-002 so its write schemas target the final declaration pin. | PRD-003 § Executive summary |
| PRD-002 cannot start until Gate R0 revalidates its 2026-07-26 evidence. | PRD-002 §5 |
| PRD-011 cannot close without live probes of native combine and ungroup behavior. | PRD-011 § Status |
| PRD-013 cannot close without live mask-propagation evidence on the pinned host. | PRD-013 § Status |
| PRD-001 cannot pass Phase 9 until Q1 is ratified. | PRD-001 § Status |
| Initiative 05 cannot start until PRD-004 has shipped, and cannot start at all until a published MCP TypeScript SDK supports protocol `2026-07-28`. | Initiative 05 § Scheduling precondition and § SDK release gate |
| Every PRD re-runs a Phase 0 baseline audit against the actual scheduled predecessor. No PRD assumes it follows any particular release. | All PRDs |

## Open items to resolve before scheduling

These are cross-document questions. None of them belongs to a single PRD, so each needs a decision outside the PRD set. They are recorded here so they are not rediscovered at implementation time. [`backlog-conflict.md`](backlog-conflict.md) holds the detailed record for each one, including what every document says and what has to be decided.

1. **The aggregate compatibility decision.** Eleven of the twenty releases contain a public hard cutover, and each one declares, on its own, that the project accepts a hard cutover in a minor release. No document owns the cumulative migration cost or the versioning question that follows from eleven breaking minors. PRD-005 and PRD-008 each state that they must be reclassified if maintainers do not accept the exception. Decide the policy once, for the whole set.
2. **Who owns `PaintInput`.** PRD-008 defines it as a strict read union whose IMAGE branch accepts only a hash. PRD-015 restates the same name as a write union whose IMAGE branch also accepts URL and base64. PRD-014 puts the same widening in a derived `TextPaintInput` instead, and names the source type `ImageSourceInput` where PRD-015 names it `ImageSource`. All three PRDs require one shared, unforked family. Pick one shape and one set of names before PRD-008 is implemented.
3. **`variable_delete` has two owners.** PRD-017 hard-cuts its input shape and adds a mode-deletion branch with a document-wide consumer scan. PRD-004 rebuilds it around page orchestration and a receipt written before the first removal. Neither PRD references the other. Whichever ships second inherits rework.
4. **`variable_list` internals have two owners.** PRD-007 replaces its direct-node consumer scan with a shared extractor. PRD-017 expands its readback and collection identity. The PRD catalog says PRD-017 need not wait for PRD-007.
5. **The `node_info` traversal core has two owners.** PRD-005 adds a predicate evaluator that must complete the selected scope to keep counts exact. PRD-004 converts the same traversal to a chunked, cancellable walker with time-based heartbeats. The two contracts are compatible, but they must be designed together rather than discovered by the second implementer.
6. **`NodeMatch.matchEvidence` has no owner.** PRD-006 and PRD-007 each add a category to it. PRD-005, which defines `NodeMatch`, does not declare the field. The two extensions use disjoint keys and PRD-007 defines the shared truncation rule, so the merge works; it should still be written down in PRD-005.
7. **The `swap_overrides_instances` prompt outlives its purpose.** PRD-020 adds `instance_swap_component` and explicitly leaves the legacy prompt and its tools untouched until PRD-019 removes them. Between the two releases, the prompt teaches the old override-transfer recipe for the exact intent the new tool serves. Decide whether PRD-020 revises the prompt text or accepts the overlap.
8. **Adjacent write contracts do not cross-reference each other.** PRD-011 reorders siblings while PRD-013 authorizes a mask against a sibling range. PRD-013 writes `visible` literally while PRD-018 can bind `visible` to a component property. PRD-009 sets rotation while PRD-012 owns auto-layout participation. None of these is a contradiction today, but no PRD states the combined rule.
