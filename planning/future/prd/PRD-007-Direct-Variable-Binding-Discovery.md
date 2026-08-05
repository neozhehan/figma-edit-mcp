# PRD — Direct Variable-Binding Discovery

- **Status:** Proposed
- **Release:** Version-unassigned standalone minor release
- **PRD date:** 2026-08-04
- **Source:** [Future Figma Design Editing Capability Expansion](<../initiative/03 - Figma Design Editing Capability Expansion/initiative.md>), Section 1
- **Required predecessor:** [`PRD-005-Scoped-Match-Discovery.md`](PRD-005-Scoped-Match-Discovery.md)
- **Parallel sibling:** [`PRD-006-Typography-and-Font-Discovery.md`](PRD-006-Typography-and-Font-Discovery.md)

> [!IMPORTANT]
> This release answers one node-centric question: “Which nodes in this exact page/root scope directly own an alias to one of these exact variable IDs, and in which normalized binding field?”
>
> It is not a complete variable dependency graph. `variable_list(...includeConsumers...)` remains the broader variable-centric inventory for node, style, alias, and prototype-reaction consumers. Both paths must share one direct-binding extractor so their overlapping node results cannot disagree.

## 1. Executive summary

The existing variable consumer read starts from variable identities and returns a broad impact inventory. It cannot combine direct variable use with a rooted node query, node type, name, text, typography, requested node properties, or document paths.

This release adds one strict `NodeFilter.variableBinding` predicate to the scoped match foundation. It:

- accepts exact variable IDs and optional exact bindable fields;
- matches raw direct aliases owned by a candidate node;
- covers scalar, array, paint/effect/grid, text-range, and component-property binding branches;
- returns deterministic normalized binding locations;
- preserves a raw-ID match even when the variable object is deleted, unavailable, remote, or otherwise unresolvable;
- shares extraction with the direct-node portion of `variable_list` consumer scanning;
- explicitly excludes styles, transitive aliases, inferred values, reactions, and mode maps.

The release adds no tool and changes no variable or node write.

## 2. Release identity

This work ships as one independently reviewable minor release after PRD-005. Its concrete version is assigned only when scheduled. The assigned version must be synchronized across:

- `package.json`;
- root `package-lock.json` release-version fields;
- both `server.json` version fields;
- root `manifest.json`;
- plugin About/handshake bundle output;
- `CHANGELOG.md`.

`check:versions` and `check:plugin` must enforce the assigned version before tagging.

Public API effect:

| Surface | Change |
| :- | :- |
| `NodeFilter` | Add strict `variableBinding` |
| `NodeMatch.matchEvidence` | Add exact direct-binding evidence and complete unique count |
| `variable_list` internals | Replace any parallel direct-node extraction with the shared extractor; public broader categories remain |

No existing tool name or base result mode changes. PRD-005’s hard rejection of legacy singular keys and `search` remains. If PRD-006 is already present, its typography fields and evidence remain additive and unchanged.

## 3. Source mapping

| Umbrella source item | This PRD |
| :- | :- |
| Checklist item 33: exact-ID direct variable-binding filtering | Entire release |
| D29: shared strict filter and explicit result modes | Inherited from PRD-005; extended in Sections 6–8 |
| D30: exact, direct, node-centric variable matching | Sections 4–10 |
| Section 1 `VariableBindingField`, filter, and location schemas | Sections 6–8 |
| Section 1 extraction, raw-ID, enrichment, conjunction, and evidence rules | Sections 7–10 |
| Section 1 parity with `variable_list` | Sections 9 and 16 |
| Section 20 direct-binding safety/errors | Sections 10–11 |
| Schema requirements 23–24 | Sections 6–8 |
| Phase 2 shared direct-binding extractor and evidence | Section 14 |

Variable maintenance, mode changes, collection rename, and binding writes belong to later releases and are excluded here.

## 4. Problem

Agents need both of these workflows:

1. Start from a variable and inventory every kind of consumer across a page or document.
2. Start from a page or node subtree and find nodes that directly bind one of several exact variables, optionally combined with other node predicates.

`variable_list({ variableId, includeConsumers })` serves the first. It includes broader style, alias, and reaction consumers, but it does not return the scoped node paths and composable match results required by the second.

Without one shared extractor, the two reads can disagree about direct node consumers because Figma exposes bindings through several shapes:

- scalar node fields;
- text-field alias arrays;
- paints, effects, and layout grids;
- styled text-range fills;
- component-property definition defaults;
- instance component-property values.

Matching names, values, collection modes, or resolved values would be ambiguous. Exact raw variable IDs are the only identity accepted here.

## 5. Goals and explicit non-goals

### Goals

1. Add strict exact-ID direct-binding matching to the shared `NodeFilter`.
2. Permit optional narrowing to exact supported binding fields.
3. Cover every supported binding-bearing scalar, array, map, paint/effect/grid, text, and component-property branch in the pinned typings.
4. Normalize deterministic locations while preserving canonical component property keys.
5. Match raw IDs before optional variable-object enrichment.
6. Preserve matches when enrichment fails.
7. Fail closed when a supported binding branch cannot be read or normalized.
8. Emit bounded deterministic evidence and complete unique counts.
9. Share one extractor with `variable_list`’s direct-node consumer pass.
10. State the boundary between node-centric direct matching and the broader variable-centric inventory.

### Explicit non-goals

- No variable-definition matching by name, key, collection, mode, type, value, or resolved value.
- No transitive traversal through `Variable.valuesByMode` aliases.
- No node match merely because a shared style bound to the variable is applied.
- No inferred-variable or literal-value equivalence.
- No prototype reaction/action expression matching.
- No `explicitVariableModes` or `resolvedVariableModes` matching.
- No style, alias, reaction, or mode consumer category in `NodeFilter`.
- No standalone variable-consumer search tool.
- No change to variable create/update/delete/bind/unbind behavior.
- No variable collection or mode maintenance.
- No range- or paint-index-addressable write operation.
- No claim that this output is a complete dependency graph.

## 6. Exact schema contract

### 6.1 Bindable field type

```ts
type VariableBindingField =
  | VariableBindableNodeField
  | VariableBindableTextField
  | "fills"
  | "strokes"
  | "effects"
  | "layoutGrids"
  | "componentProperties"
  | "textRangeFills";

type VariableBindingFilter = {
  variableIds: string[];             // required, exact, non-empty
  fields?: VariableBindingField[];   // optional, non-empty when supplied
};

type VariableBindingNodeFilterExtension = {
  variableBinding?: VariableBindingFilter;
};
```

`VariableBindableNodeField` and `VariableBindableTextField` literals are generated from the scheduled release’s exact pinned `@figma/plugin-typings`. The explicit aggregate fields above are appended to that generated allowlist. The generated schema, plugin allowlist, docs, and parity tests must come from one source.

### 6.2 Strictness and identity rules

- `variableBinding` requires `variableIds`.
- `variableIds` must be non-empty and duplicate-free.
- Every ID must be a non-empty exact case-sensitive string.
- `fields`, when supplied, must be non-empty and duplicate-free.
- Every field must be an exact enum literal from the scheduled pinned allowlist.
- Unknown keys fail at the MCP boundary and plugin boundary.
- No name, key, collection, value, mode, alias-traversal, inferred, reaction, or link-state key is accepted.
- Within `variableIds`, values are ORed.
- Within `fields`, values are ORed.
- Identity and field conditions are ANDed.
- `variableBinding` is ANDed with every other supplied `NodeFilter` predicate under PRD-005.
- When combined with PRD-006 typography predicates, the node must satisfy both groups, but the contract does not assert that the variable binding belongs to the same text run as the typography match.

### 6.3 Discovery sources

Exact variable IDs come from:

- `variable_list`;
- a prior `node_info` read that returns raw `boundVariables`;
- a prior exact variable mutation result.

Names and keys shown during enrichment are not valid substitutes for `variableIds`.

## 7. Direct-binding extraction contract

### 7.1 Normalized locations

```ts
type VariableBindingLocation =
  | {
      source: "NODE";
      field: Exclude<VariableBindingField, "componentProperties">;
    }
  | {
      source: "COMPONENT_PROPERTY_DEFINITION";
      field: "componentProperties";
      propertyId: string; // exact canonical map key
    }
  | {
      source: "INSTANCE_COMPONENT_PROPERTY";
      field: "componentProperties";
      propertyId: string; // exact canonical map key
    };
```

`propertyId` is the complete raw component-property map key such as `Label#12:34`. This read does not depend on a later component-property write release; it serializes the canonical key already present in Figma’s definition/value maps.

The source umbrella calls these “exact binding locations,” but the published location schema does not include paint indexes, effect indexes, grid indexes, or text ranges. This PRD therefore defines “exact” narrowly and truthfully: exact variable ID plus exact normalized owning field, and exact component property key when applicable. Multiple occurrences of one variable in one normalized field collapse to one evidence entry. A caller that needs occurrence-level context must request the relevant property or, for styled text, use PRD-008.

### 7.2 Covered branches

For every candidate node, the shared extractor examines all supported raw direct-alias locations:

- scalar entries of `SceneNode.boundVariables`;
- array-valued text binding fields;
- direct paint bindings within `fills` and `strokes`;
- direct effect bindings;
- direct layout-grid bindings;
- direct text-range fill bindings;
- `componentPropertyDefinitions[*].boundVariables.defaultValue`;
- `componentProperties[*].boundVariables.value`.

The extractor normalizes each alias to:

```ts
type DirectBindingRecord = {
  variableId: string;
  location: VariableBindingLocation;
};
```

### 7.3 Inclusion rules

- A direct alias is a raw `{ type: "VARIABLE_ALIAS", id }` reference owned by the candidate node or one of the explicitly listed component-property maps.
- Compare `id` directly with requested `variableIds`.
- Do not resolve the variable before matching.
- Normalize a field to the exact published `VariableBindingField`.
- Preserve first traversal/property order.
- Deduplicate by exact `{ variableId, location }`.
- A node matches when at least one deduplicated record satisfies both identity and optional field conditions.

### 7.4 Exclusion rules

The extractor must not traverse or infer:

- aliases stored in `Variable.valuesByMode`;
- variables bound to a style that the node consumes;
- variables inferred from literal values;
- `inferredVariables`;
- prototype reactions or action expressions;
- `explicitVariableModes`;
- `resolvedVariableModes`;
- collection mode IDs;
- nested node descendants as though the parent owned their bindings.

Descendants are independently evaluated by PRD-005 traversal.

### 7.5 Completeness

- If a supported binding-bearing branch exists but cannot be read or normalized, fail closed.
- The error names the node, location/branch, completed traversal scope, and a narrower `node_info` retry.
- Do not silently skip an unknown alias-shaped record.
- An optional variable-object resolution failure is not an extraction failure and does not erase the raw-ID record.
- The extractor must have a pinned-typings parity test so a new binding-bearing branch fails review rather than disappearing.

## 8. Match evidence contract

```ts
type VariableBindingEvidence =
  | {
      variableId: string;
      resolved: false;
      location: VariableBindingLocation;
    }
  | {
      variableId: string;
      resolved: true;
      name: string;
      key: string;
      collectionId: string;
      remote: boolean;
      location: VariableBindingLocation;
    };

type VariableBindingMatchEvidence = {
  variableBindings: VariableBindingEvidence[];
  matchedVariableBindingCount: number;
  evidenceTruncated?: boolean;
};
```

Rules:

- Every match produced with `filter.variableBinding` includes `variableBindings` and `matchedVariableBindingCount`.
- Evidence contains only records satisfying requested IDs and optional fields.
- Match first by raw ID and location.
- Resolve each distinct matched variable ID at most once per command with `getVariableByIdAsync()`.
- Resolution is enrichment only.
- When resolution succeeds, require a valid variable object and return exact name, key, collection ID, and remote state.
- When it fails, emit `resolved: false`; retain the match.
- Evidence preserves extractor order.
- Return at most 50 evidence entries per node.
- `matchedVariableBindingCount` covers all unique matching `{ variableId, location }` records.
- Set `evidenceTruncated: true` when the complete unique set exceeds 50 or when another installed evidence category is truncated.
- Omit variable-binding evidence when the predicate was not supplied.

PRD-005’s match paths, requested properties, global result cap, traversal completion, and exact result counts remain unchanged.

## 9. `variable_list` parity and complementary roles

The release replaces any separate direct-node consumer scan inside `variable_list` with the same extractor used by `NodeFilter.variableBinding`.

For an equal page/document scope and the same exact variable IDs:

- the set of direct node bindings and normalized locations must be identical;
- ordering and deduplication must be deterministic;
- raw-ID matches must survive enrichment failure in both paths.

The public outputs remain purpose-specific:

| Question | Canonical read |
| :- | :- |
| Which nodes under these roots/pages directly bind these IDs, optionally combined with other node predicates? | `node_info` or `page_info MATCHES` with `filter.variableBinding` |
| What consumes this variable across node, style, alias, and reaction categories? | `variable_list({ variableId, includeConsumers })` |

`variable_list` retains its separate style, alias, and prototype-reaction passes. `NodeFilter` does not import those categories. Docs and outputs may say “direct node bindings”; they must not say “all consumers” or “complete dependency graph.”

## 10. Safety, scope, and readback

- This release is read-only and retains `readOnlyHint: true`.
- Existing explicit root/page/editable-scope rules from PRD-005 remain authoritative.
- The plugin validates exact IDs, fields, strict objects, and supported binding branches.
- No branch reads current selection or uses current page implicitly.
- The extractor only reads candidate nodes already authorized by traversal.
- Optional enrichment may call the open-world variable API and retains `openWorldHint: true`.
- A remote variable may be enriched but is never mutated.
- Deleted/unavailable variable objects can still produce exact unresolved evidence from raw aliases.
- A malformed supported branch cannot produce a false-complete match result.
- Paths and enriched names do not grant write authority; later writes still require exact tool-specific scope/name/permission gates.

Update the `page_info`, `node_info`, and `variable_list` read rows in [`SAFETY.md`](../../../SAFETY.md) and their consistency tests.

## 11. Structured errors and recovery

Required distinct conditions:

| Condition | Required details and repair |
| :- | :- |
| `VARIABLE_BINDING_IDS_REQUIRED` | Accepted shape and complete corrected call |
| `VARIABLE_BINDING_ID_EMPTY` | Index and exact non-empty requirement |
| `VARIABLE_BINDING_ID_DUPLICATE` | Duplicate ID/indexes and deduplicated corrected call |
| `VARIABLE_BINDING_FIELDS_EMPTY` | Accepted field list and omission alternative |
| `VARIABLE_BINDING_FIELD_INVALID` | Rejected value, pinned accepted list, closest suggestion |
| `VARIABLE_BINDING_FIELD_DUPLICATE` | Duplicate value/indexes and corrected call |
| `VARIABLE_BINDING_FILTER_UNKNOWN_KEY` | Exact key/path and accepted keys |
| `DIRECT_BINDING_EXTRACTION_INCOMPLETE` | Node, branch/location, completed scope, narrower retry |
| `DIRECT_BINDING_SHAPE_INVALID` | Observed alias-shaped value without silent skip |

Variable enrichment failure is not an error for this predicate. It is represented as `resolved: false`.

Every refusal uses the central structured-error registry, supplies machine-usable operands, and includes a complete retry when one is unambiguous.

## 12. Documentation requirements

Update:

- `README.md`;
- [`SAFETY.md`](../../../SAFETY.md);
- [`constraints.md`](../../../skills/figma-edit/references/constraints.md);
- [`error-playbook.md`](../../../skills/figma-edit/references/error-playbook.md);
- [`workflows.md`](../../../skills/figma-edit/references/workflows.md);
- [`tool-selection.md`](../../../skills/figma-edit/references/tool-selection.md);
- mirrored MCP resources;
- `node_info`, `page_info`, and `variable_list` descriptions/examples;
- `CHANGELOG.md`;
- generated manifest and plugin bundle.

Guides must show:

- one/multiple exact ID matching;
- field narrowing;
- combining variable binding with base predicates;
- combining it with typography when PRD-006 is installed;
- raw unresolved evidence;
- component-property locations;
- rooted versus page-wide matching;
- when to choose `variable_list`;
- explicit exclusions for styles, alias chains, inferred values, reactions, and modes;
- the normalized-field, not occurrence-index, meaning of `location`.

## 13. Implementation context and owned files

Primary production areas:

- shared filter/result modules introduced by PRD-005;
- `src/mcp_server/tools/node.ts`;
- `src/mcp_server/tools/page.ts`;
- `src/mcp_server/tools/variable.ts`;
- `src/mcp_server/tools/bindableFields.generated.ts`;
- `figma_plugin/handlers/nodeReaders.ts`;
- `figma_plugin/handlers/variableHandlers.ts`;
- one shared recursive direct-binding extractor and serializer.

Primary tests:

- strict-input, MCP boundary, and output-schema suites;
- `getNodesInfo` reader tests;
- variable consumer tests;
- generated-field parity tests;
- current-page-elimination and safety consistency tests.

Do not implement one extractor in `nodeReaders.ts` and another in `variableHandlers.ts`. Both must import the same production function. Test helpers may construct fixtures but may not reimplement extraction.

## 14. Phased implementation

### Phase 0 — dependency and pinned-surface audit

- Confirm PRD-005 is released and green.
- Re-read scheduled pinned typings for all variable-bindable field unions and every `boundVariables` shape.
- Inventory current `variable_list` direct-node scanning.
- Record fixture coverage for scalar, array, paint/effect/grid, text-range, and component-property bindings.

### Phase 1 — generated field/schema and errors

- Generate the exact allowed field enum.
- Add the strict filter and location/evidence unions.
- Extend shared filter non-empty validation.
- Add central errors and emitted-schema tests.

### Phase 2 — shared extractor

- Implement complete recursive extraction and normalization.
- Add raw-ID matching, deterministic ordering, and deduplication.
- Add fail-closed handling for supported unreadable/malformed branches.
- Add typings parity coverage.

### Phase 3 — match integration and enrichment

- Extend the PRD-005 evaluator without copying traversal.
- Add optional field narrowing and cross-predicate conjunction.
- Add once-per-ID enrichment and strict resolved/unresolved evidence.
- Preserve global counts and evidence caps.

### Phase 4 — `variable_list` integration

- Replace its direct-node pass with the shared extractor.
- Preserve broader style/alias/reaction passes and public category semantics.
- Add same-scope parity tests.

### Phase 5 — synchronization and release

- Update safety, guides/resources, descriptions, examples, changelog, generated artifacts, and version surfaces.
- Run focused/full/generated/plugin/version tests, red proofs, and live probes.

## 15. Verification requirements

### 15.1 Schema tests

Assert:

- required non-empty unique IDs;
- optional non-empty unique fields;
- exact generated field enum;
- strict unknown-key rejection;
- forbidden name/key/value/collection/mode/inferred/reaction keys;
- strict resolved/unresolved evidence;
- strict three-way location union;
- component locations require `propertyId`;
- node locations forbid `propertyId`.

### 15.2 Extraction and matching tests

Cover:

- one and multiple IDs;
- with and without field narrowing;
- scalar and array node fields;
- fills, strokes, effects, layout grids, and text-range fills;
- component-property definition and instance-value maps;
- multiple occurrences collapsing by normalized location;
- local, remote, deleted, unavailable, and unresolvable IDs;
- one enrichment attempt per distinct ID;
- raw-ID matches without enrichment;
- deterministic location ordering/deduplication/caps/counts;
- base-predicate AND;
- typography conjunction is node-level, not same-run.

Negative cases must prove that aliases-in-values, style bindings, inferred variables, reactions, and explicit/resolved modes do not match.

### 15.3 `variable_list` parity tests

For the same fixture/scope/IDs:

- compare exact direct node IDs, variable IDs, and normalized locations;
- inject an unresolvable variable object and preserve both raw-ID results;
- prove style/alias/reaction categories remain only in `variable_list`;
- prove node filter output does not claim complete dependency coverage.

### 15.4 Red proofs

Record named red failures for:

- accepting a variable name instead of ID;
- silently accepting a stale field;
- skipping a supported binding branch;
- resolving before raw-ID comparison and losing a match;
- including a style-mediated or alias-chain consumer;
- divergence between filter and `variable_list` direct-node results;
- reporting occurrence-level precision not present in the schema.

Restore and rerun exact named tests green.

### 15.5 Live Figma probes

In a dedicated document:

1. Create or identify nodes with direct bindings in scalar, fill/stroke, text, grid/effect, and component-property branches where supported.
2. Match one and multiple exact IDs under one root and across two pages.
3. Narrow by field.
4. Combine with a base predicate and, if installed, a typography predicate.
5. Compare with `variable_list` direct-node consumers over the same scope.
6. Exercise an unavailable/deleted reference only if it can be created legitimately; otherwise record fixture-unavailable.

Report exact IDs, scope, calls, normalized locations, counts, channel/document evidence, and cleanup. Mocks do not establish live Figma binding shapes.

## 16. Repository and release gates

Required:

- focused boundary/extractor/parity tests;
- `bun test`;
- `bun run check:types:plugin`;
- `bun run check:types:scripts`;
- `bun run check:suppressions`;
- `bun run check:generated`;
- `bun run build:all`;
- `bun run check:plugin`;
- `bun run check:versions`;
- generated diff review;
- live evidence or explicit fixture-unavailable disclosures.

## 17. Acceptance criteria

The release is complete only when:

1. PRD-005 is in the scheduled baseline.
2. One minor version is assigned and synchronized.
3. `NodeFilter.variableBinding` requires unique exact IDs and accepts only optional unique pinned fields.
4. Names, keys, values, collections, modes, inferred values, reactions, and alias traversal are absent from the schema.
5. One shared extractor covers every pinned supported direct-binding branch.
6. Raw IDs are matched before optional enrichment.
7. Enrichment failure yields `resolved: false` without dropping a match.
8. Supported extraction failure fails closed.
9. Evidence has strict locations, deterministic order, a 50-entry cap, complete unique counts, and correct truncation.
10. Component-property locations carry exact canonical map keys.
11. NodeFilter and `variable_list` direct-node output cannot disagree for the same scope/IDs.
12. `variable_list` retains broader style/alias/reaction categories.
13. Documentation never labels the filter a complete dependency graph.
14. Safety, errors, guides/resources, descriptions, changelog, generated manifest, plugin bundle, and version surfaces are synchronized.
15. Focused/full/generated/plugin/version gates, red proofs, and live probes are green.
16. No variable mutation, mode maintenance, style-mediated matching, transitive traversal, or occurrence-index write feature ships here.

## 18. Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| A supported binding branch is silently missed | High without parity | Pinned-typings parity, fail-closed extraction, branch fixtures |
| Enrichment failure erases a true match | Medium | Raw-ID-first comparison and strict unresolved evidence |
| Filter and `variable_list` disagree | Medium | One production extractor and same-scope parity tests |
| Direct matching is described as a dependency graph | High | Explicit output/docs boundary and negative consumer tests |
| A normalized location is mistaken for an exact paint/range occurrence | Medium | State field-level granularity and require property/segment read for occurrence context |
| Remote/deleted variables break discovery | Medium | Enrichment optional; preserve raw alias identity |
| Generated bindable fields drift | Medium | One generated allowlist and parity gate |
| Combined predicates broaden scope | Low | Evaluate only PRD-005-authorized candidate nodes |

## 19. Dependencies and exclusions

### Required predecessor

PRD-005 owns the only result modes, traversal, base predicates, paths, counts, and global caps.

### No component-write dependency

Canonical component property keys are read directly from Figma’s maps. This release does not wait for or implement component-property add/edit/delete changes.

### Sibling composition

PRD-006 is independent. If installed, the combined filter uses cross-predicate AND while preserving typography’s internal same-run rule.

### Excluded

No variable create/update/delete, binding write, mode selection, collection maintenance, styled-text output, paint write, style dependency traversal, reaction traversal, or page lifecycle work belongs here.

## 20. References

- [Umbrella capability-expansion PRD](<../initiative/03 - Figma Design Editing Capability Expansion/initiative.md>)
- [Scoped Match Discovery predecessor](PRD-005-Scoped-Match-Discovery.md)
- [Typography and Font Discovery sibling](PRD-006-Typography-and-Font-Discovery.md)
- [Styled-Text Read Fidelity](PRD-008-Styled-Text-Read-Fidelity.md)
- [Repository safety contract](../../../SAFETY.md)
- [Contributor and verification guidance](../../../CONTRIBUTING.md)
- [Figma-edit constraints](../../../skills/figma-edit/references/constraints.md)
- [Figma-edit error playbook](../../../skills/figma-edit/references/error-playbook.md)
- [Figma-edit workflows](../../../skills/figma-edit/references/workflows.md)
- [Figma-edit tool-selection guide](../../../skills/figma-edit/references/tool-selection.md)
