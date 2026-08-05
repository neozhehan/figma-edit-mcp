# Standalone Future PRDs

This folder contains the canonical, scope-specific PRDs extracted from the former v2.3.4 and v2.3.5 umbrella plans and from the future Figma Design Editing Capability Expansion plan. Each numbered `PRD-*` file is sized and written as one independently releasable **minor release**. Exact version numbers remain unassigned until the releases are scheduled. Intentional public hard cutovers are permitted where the owning PRD says so.

> [!IMPORTANT]
> The original [`v2.3.4`](../../v2.3.4/prd.md) and [`v2.3.5`](../../v2.3.5/prd.md) paths remain compatibility indexes for path-level historical links. Their companion release changelogs remain the unchanged historical ledgers; they are not redistributed among the new PRDs. Pre-split deep-heading links are served by the commit permalinks recorded below, not recreated on the indexes.

## Canonical PRDs

| Standalone PRD | Source scope | Release boundary | Dependencies |
| :- | :- | :- | :- |
| [`PRD-001-Legacy-Error-Code-Burn-Down.md`](PRD-001-Legacy-Error-Code-Burn-Down.md) | v2.3.4 Track 1 | Convert the legacy plugin failure surface, unify the error boundary, and finish the code-first recovery contract without changing throw conditions. | The v2.3.3 structured-error registry, transport, playbook, and plugin gates. |
| [`PRD-002-Figma-Typings-Bump-and-Shader-Effects.md`](PRD-002-Figma-Typings-Bump-and-Shader-Effects.md) | v2.3.4 Track 2 | Bump the pinned Figma declarations, review every generated-field change, and restore strict `SHADER` effect authoring. | The v2.3.3 effect-union parity mechanism. |
| [`PRD-003-Lossless-Prototype-Reaction-Reads-and-Conflict-Safe-Localized-Updates.md`](PRD-003-Lossless-Prototype-Reaction-Reads-and-Conflict-Safe-Localized-Updates.md) | v2.3.4 Track 3 | Make reaction reads complete and coverage-bearing, then hard-cut reaction writes over to one state-checked localized operation. | The v2.3.3 reaction baseline and the completed typings/`SHADER` minor release. It performs its own reviewed taxonomy extension for domain-specific and required shared factories if the general burn-down release has not landed. |
| [`PRD-004-Timeout-Liveness-and-Mutation-Outcome-Integrity.md`](PRD-004-Timeout-Liveness-and-Mutation-Outcome-Integrity.md) | All v2.3.5 workstreams | Ship the one shared identity, progress, timeout-policy, receipt, deduplication, and mutation-reconciliation protocol. | Rebase its tool inventory over any earlier minor releases; preserve stronger tool-specific outcome contracts. |
| [`PRD-005-Scoped-Match-Discovery.md`](PRD-005-Scoped-Match-Discovery.md) | Capability Expansion §1 core | Add strict `TREE`/`MATCHES` and `SUMMARY`/`MATCHES` reads with the base match predicate and bounded results. | Current explicit-root read and page-load safety contracts. |
| [`PRD-006-Typography-and-Font-Discovery.md`](PRD-006-Typography-and-Font-Discovery.md) | Capability Expansion §1 typography/font branches | Add run-aware font/Text Style matching and explicit used/available font discovery. | PRD-005. |
| [`PRD-007-Direct-Variable-Binding-Discovery.md`](PRD-007-Direct-Variable-Binding-Discovery.md) | Capability Expansion §1 variable-binding branch | Add exact-ID direct variable-binding matching and shared direct-consumer extraction. | PRD-005. |
| [`PRD-008-Styled-Text-Read-Fidelity.md`](PRD-008-Styled-Text-Read-Fidelity.md) | Capability Expansion §16.3 plus read-side paint normalization | Expose bounded styled-text segments with UTF-16 boundaries and write-ready identity-preserving values. | PRD-005 and PRD-006; PRD-007 is an optional sibling for shared variable-identity utilities. |
| [`PRD-009-Transform-and-Ellipse-Geometry.md`](PRD-009-Transform-and-Ellipse-Geometry.md) | Capability Expansion §2 | Add rotation and existing-ellipse arc edits under one complete transform preflight. | PRD-005 for the exact `MATCHES` recovery call. |
| [`PRD-010-Scoped-Page-Rename.md`](PRD-010-Scoped-Page-Rename.md) | Capability Expansion §17 | Permit `node_rename` only for the exact connected page-scope root. | Current page-scope identity contract. |
| [`PRD-011-Structural-Combine.md`](PRD-011-Structural-Combine.md) | Capability Expansion §19 | Hard-replace grouping with explicit group/boolean structural combination. | Release-blocking pinned-API structural probes. |
| [`PRD-012-Layout-System.md`](PRD-012-Layout-System.md) | Capability Expansion §3 | Hard-replace basic auto layout with one complete container/child/grid/viewport layout contract. | Current layout permission and exact-target gates. |
| [`PRD-013-Appearance-and-Masking.md`](PRD-013-Appearance-and-Masking.md) | Capability Expansion §4 | Hard-replace effects with complete appearance editing and guarded mask propagation. | Current styling and bounded-scope gates. |
| [`PRD-014-Range-Safe-Text-Editing.md`](PRD-014-Range-Safe-Text-Editing.md) | Capability Expansion §5 | Add full writable text styling and guarded range content replacement for text and text paths. | PRD-006 and PRD-008. |
| [`PRD-015-Paint-Stroke-and-Image-Metadata.md`](PRD-015-Paint-Stroke-and-Image-Metadata.md) | Capability Expansion §18 | Add canonical paint stacks, stroke geometry, and intrinsic image metadata. | PRD-008 and PRD-014. |
| [`PRD-016-Native-Node-Creation.md`](PRD-016-Native-Node-Creation.md) | Capability Expansion §§6–9 | Add text-path, line, native-vector, frame/section/slice creation under one placement/cleanup contract. | PRD-006 and PRD-009; conditionally reuse compatible PRD-012/014 helpers when already shipped. |
| [`PRD-017-Variable-Metadata-and-Mode-Lifecycle.md`](PRD-017-Variable-Metadata-and-Mode-Lifecycle.md) | Capability Expansion §§10–12 | Add code syntax, collection rename, complete mode maintenance, explicit-mode clearing, and mode deletion. | No future capability PRD is a hard predecessor; schedule after PRD-007 only when sharing its direct-consumer utilities is useful. |
| [`PRD-018-Canonical-Component-Property-Identity-and-Binding.md`](PRD-018-Canonical-Component-Property-Identity-and-Binding.md) | Capability Expansion §§15 and 16.1 | Make canonical property IDs authoritative and add exact binding/unbinding. | Current component-definition reads. |
| [`PRD-019-Exact-Instance-State-Property-Writes-and-Override-Reset.md`](PRD-019-Exact-Instance-State-Property-Writes-and-Override-Reset.md) | Capability Expansion §§14 and 16.2 | Canonicalize instance reads, hard-replace property writes, remove retired override tools, and add guarded override reset. | PRD-020 is the hard scheduled predecessor so the cutover's swap migration already exists; PRD-018 is recommended for shared identity terminology. |
| [`PRD-020-Instance-Relationship-Lifecycle.md`](PRD-020-Instance-Relationship-Lifecycle.md) | Capability Expansion §§13–14 relationship branches | Add explicit component swap and safe instance detach. | Current instance/component safety baseline; it must not depend on PRD-019's public cutover. |

## Consolidation decisions

| Candidate overlap | Disposition | Reason |
| :- | :- | :- |
| v2.3.4 Track 1 and Track 2 | Separate | Error conversion is a no-control-flow-change migration; the typings bump changes generated read fields and the strict effect schema. They share release mechanics, not a product contract. |
| v2.3.4 Track 1 and Track 3 | Separate | Both extend the error registry, but the reaction release can own its six domain codes. Combining a 313-site mechanical conversion with a reaction API hard cutover would defeat independent review and rollback. |
| v2.3.4 Track 2 and Track 3 | Separate, ordered | Reaction write schemas consume the final pinned declarations, so Track 3 follows Track 2. That is a dependency seam rather than overlapping scope. |
| Reaction outcome handling and v2.3.5 receipts | Separate, stronger contract preserved | Reaction setters have authoritative tool-specific reconciliation. The later general protocol explicitly defers to stronger tool contracts and adds transport/session receipt handling around them. |
| v2.3.5 liveness and mutation-outcome workstreams | **Combined** | Command identity keys progress, terminal routing, duplicate suppression, and receipt lookup. Progress drives timeout evidence; timeout classification depends on mutation boundaries and receipts. Splitting those pieces would make neither release independently safe. |

## v2.3.4 migration crosswalk

The source identifiers below remain stable historical references in the unchanged [v2.3.4 revision ledger](../../v2.3.4/release-changelog.md#change-1-prd-revision-history). The standalone PRDs retain those source identifiers in their mapping sections even when they introduce local section names.

| Source material | Canonical disposition |
| :- | :- |
| Track 1 origin, problem statement, 313-site inventory, per-file baseline, `NAME_MISMATCH`, prose-test baseline, channel envelope, and UI-relay findings | `PRD-001-Legacy-Error-Code-Burn-Down.md` |
| D1–D7 and Q1 | `PRD-001-Legacy-Error-Code-Burn-Down.md` |
| Scope items 1–8; numbered Phases 1–10 | `PRD-001-Legacy-Error-Code-Burn-Down.md` |
| Track 1 test/rollout requirements; risks 1–7; provenance rows for throw counts, registry, prose assertions, message quality, boundary, relay, and deferral | `PRD-001-Legacy-Error-Code-Burn-Down.md` |
| Track 2 origin and pinned-typings problem | `PRD-002-Figma-Typings-Bump-and-Shader-Effects.md` |
| D8; scope item 9; Phase T2 | `PRD-002-Figma-Typings-Bump-and-Shader-Effects.md` |
| Track 2 non-goals, tests/live probe, risks, and seven provenance rows | `PRD-002-Figma-Typings-Bump-and-Shader-Effects.md` |
| Track 3 origin and reaction read/write problem | `PRD-003-Lossless-Prototype-Reaction-Reads-and-Conflict-Safe-Localized-Updates.md` |
| D9–D11; scope items 10–12; Phase T3 steps 1–5 | `PRD-003-Lossless-Prototype-Reaction-Reads-and-Conflict-Safe-Localized-Updates.md` |
| Track 3 non-goals, full direct-handler/SDK/live matrices, risks, and reaction provenance rows | `PRD-003-Lossless-Prototype-Reaction-Reads-and-Conflict-Safe-Localized-Updates.md` |
| Shared release identity, version-surface duties, v2.3.3 dependency, evidence boundary, documentation/manifest/CHANGELOG duties, and repository gates | Restated in every standalone PRD to make each release independently schedulable. |
| D12 | Historical only. It was withdrawn on 2026-08-02; no code or CI check over documentation is a deliverable. |
| Combined final revision-history pointer | Preserved here and in each child PRD as a link to the unchanged umbrella ledger. |

## v2.3.5 migration crosswalk

Significant overlap keeps all v2.3.5 work in `PRD-004-Timeout-Liveness-and-Mutation-Outcome-Integrity.md`.

| Source material | Internal workstream in the canonical PRD |
| :- | :- |
| Timeout topology; T3; D1–D4; clean/read branch of D6; shared D8 behavior | Command identity, progress transport, and timeout policy |
| T1, T2a, T5; scan portion of T2; read/cancellation portions of D6–D8 | Page-aware and chunked long-command execution |
| Mutation portion of T2; T4; T6; D5; mutation/status portions of D6–D8 | Mutation receipts and outcome integrity |
| T7 | Preserved verifier history and evidence prerequisite; not unimplemented product scope |
| Complete tool migration matrix | Preserved as the release-wide migration inventory |
| Repository and live verification requirements | Preserved as release-wide gates, including exact-line red proofs and evidence-class separation |
| Phases 1–5 | Preserved in order; Phase 3 intentionally crosses page, join, and mutation boundaries |
| Compatibility posture and all five rejected alternatives | Preserved release-wide |
| Acceptance items 1–7 | Preserved as the original indivisible acceptance gate; standalone readiness, versioning, and scheduled-baseline gates are added transparently as items 8–10 |

## Figma Design Editing Capability Expansion crosswalk

The source [`Figma Design Editing Capability Expansion/prd.md`](<../Figma Design Editing Capability Expansion/prd.md>) remains the historical umbrella specification. PRD-005 through PRD-020 are the canonical implementation documents. The umbrella's implementation phases are not release boundaries: each child owns its applicable contract scaffolding, safety/error work, documentation, generated output, versioning, repository gates, and live evidence.

| Umbrella source | Canonical PRD |
| :- | :- |
| Section 1 base result modes, core node predicates, bounded matches, paths, and default-read preservation | PRD-005 |
| Section 1 font and Text Style predicates plus used/available font discovery | PRD-006 |
| Section 1 exact-ID direct variable-binding predicate and `variable_list` direct-consumer parity | PRD-007 |
| Section 16.3 styled-text segments; Section 18.1 read-side `PaintInput` normalization needed by segment fills | PRD-008 |
| Section 2 and D27 transform rotation/existing-ellipse arc contract | PRD-009 |
| Section 17 and D17 exact page-scope rename | PRD-010 |
| Section 19 and D28 structural combine contract | PRD-011 |
| Section 3 and D18 complete layout contract | PRD-012 |
| Section 4 and D10 appearance/mask containment contract | PRD-013 |
| Section 5, D8, D9, and D20 range-safe style/content writes and existing `TEXT_PATH` compatibility | PRD-014 |
| Section 18, D19, and D21 canonical paint/stroke writes and image metadata | PRD-015 |
| Sections 6–9, D11, and D15 missing node-creation branches | PRD-016 |
| Sections 10–12, D12, and D22 variable metadata and mode lifecycle | PRD-017 |
| Section 15 plus Section 16.1 canonical component-property identity and binding | PRD-018 |
| Section 16.2 plus Section 14 override-read/reset work and the retired instance-tool cutover | PRD-019 |
| Section 13 plus the detach branch of Section 14 | PRD-020 |
| Section 20; schema requirements; applicable implementation/test/success/risk/provenance rows | Distributed into every owning child PRD; never deferred to a final synchronization release |

Decision ownership remains traceable after the split:

| Umbrella decisions | Owning PRD(s) |
| :- | :- |
| D1–D6, the Golden Rule, and the plugin trust boundary | Every child, narrowed to its own user decision, explicit discovery, readback, complete preflight, and structured recovery |
| D7 hard-cut renames | PRD-011 (`node_group`), PRD-012 (`node_set_auto_layout`), PRD-013 (`node_set_effects`), PRD-016 (`create_frame`), and PRD-019 (`instance_set_property`) |
| D8, D9, and D20 | PRD-014 |
| D10 | PRD-013 |
| D11 and D15 | PRD-016 |
| D12 and D22 | PRD-017 |
| D13 and D14 | PRD-019 and PRD-020, with separate public tools preserved |
| D16 prerequisite gates | PRD-008 before PRD-014; PRD-018 identity before binding; PRD-019 exact instance map with its instance surface |
| D17 | PRD-010 |
| D18 | PRD-012 |
| D19 and D21 | PRD-015 |
| D23 | PRD-006 |
| D24–D26 | PRD-019 |
| D27 | PRD-009 |
| D28 | PRD-011 |
| D29 | PRD-005 owns the result/predicate boundary; PRD-006 and PRD-007 add the strict typography and variable-binding predicate branches |
| D30 | PRD-007 |

### Capability-release consolidation decisions

| Candidate overlap | Disposition | Reason |
| :- | :- | :- |
| Base matching, typography, direct variable bindings, and styled-text reads | Separate, ordered | They answer different user decisions. PRD-005 establishes stable evaluator/result interfaces so later releases extend focused modules without reloading the entire reader implementation. |
| Transform, PAGE rename, structural combine, layout, and appearance | Separate | A shared `node.ts` registration file is implementation overlap only; authority, mutation preflight, readback, and live fixtures differ. |
| Text reads, ranged writes, and whole-node paint writes | Separate, ordered | PRD-008 owns canonical read-side paint normalization; PRD-014 adds the safe ranged-write recovery; PRD-015 then adds whole-node replacement without inventing an interim shape or future recovery path. |
| `TEXT_PATH`, `LINE`, native `VECTOR`, and region creation | Combined | They share the creation registrar, explicit-parent/source preflight, parent-first placement, cleanup-on-failure, and live creation fixtures. |
| Variable metadata and mode maintenance | Combined | Exact collection/mode identity and deletion recovery span add, rename, explicit clear, consumer scan, and delete. |
| Component-property identity and binding | Combined, internally ordered | Binding is not first-call-correct until add/edit returns the canonical key accepted by edit/delete/bind. |
| Exact instance property writes and override reset | Combined | Both require one canonical `node_info` state serializer and stale-state/partial-mutation comparison. |
| Instance swap and detach | Combined as a release, separate as tools | They share relationship-resolution and live-instance fixtures but retain distinct safety gates, annotations, identity behavior, and result shapes. |

The dependency spine is:

```text
PRD-005 -> PRD-006 -> PRD-008 -> PRD-014 -> PRD-015
    +----> PRD-007 - - optional utility reuse - -> PRD-008
    +----> PRD-009

PRD-006 + PRD-009 -> PRD-016
PRD-012 + PRD-014 - - optional helper reuse - -> PRD-016
PRD-007 - - recommended utility reuse - -> PRD-017
PRD-020 -> PRD-019
PRD-018 - - recommended terminology reuse - -> PRD-019

PRD-010, PRD-011, and PRD-013 are independently schedulable.
```

Across PRD-005 through PRD-020, the cumulative public-tool arithmetic remains identical to the umbrella source: five hard-cut renames, four additions, two removals, and a net increase of two tools. Each release records only its own delta against its scheduled predecessor; no child claims the aggregate delta as its release-local tool count.

## Historical source record

The pre-split umbrella documents are preserved in Git at commit [`40d39e8bb48edacade40111e1d00b8bf82b7a5d8`](https://github.com/neozhehan/figma-edit-mcp/tree/40d39e8bb48edacade40111e1d00b8bf82b7a5d8):

| Source | Pre-split SHA-256 |
| :- | :- |
| [`planning/v2.3.4/prd.md`](https://github.com/neozhehan/figma-edit-mcp/blob/40d39e8bb48edacade40111e1d00b8bf82b7a5d8/planning/v2.3.4/prd.md) | `8072fce97bada96801b6ddea5eaf04229a6aded650411ff976d449e1cced58a2` |
| [`planning/v2.3.5/prd.md`](https://github.com/neozhehan/figma-edit-mcp/blob/40d39e8bb48edacade40111e1d00b8bf82b7a5d8/planning/v2.3.5/prd.md) | `26293c5a46fa856c67846fc53ebe771e1567d92541fafd7e72d80d0f0afa60cf` |
| [`planning/future/Figma Design Editing Capability Expansion/prd.md`](https://github.com/neozhehan/figma-edit-mcp/blob/40d39e8bb48edacade40111e1d00b8bf82b7a5d8/planning/future/Figma%20Design%20Editing%20Capability%20Expansion/prd.md) | `23cc718af794f8ec981244979f50b042229a5125d0e8b8000a4f17399cf39d77` |

This crosswalk is migration evidence maintained by review. It is not a request for a test or CI script that parses Markdown.
