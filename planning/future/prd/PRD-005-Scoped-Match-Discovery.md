# PRD — Scoped Match Discovery

- **Status:** Proposed
- **Release:** Version-unassigned standalone minor release
- **PRD date:** 2026-08-04
- **Source:** [Future Figma Design Editing Capability Expansion](<../initiative/03 - Figma Design Editing Capability Expansion/initiative.md>), Section 1
- **Dependency direction:** foundation for [`PRD-006-Typography-and-Font-Discovery.md`](PRD-006-Typography-and-Font-Discovery.md), [`PRD-007-Direct-Variable-Binding-Discovery.md`](PRD-007-Direct-Variable-Binding-Discovery.md), and [`PRD-008-Styled-Text-Read-Fidelity.md`](PRD-008-Styled-Text-Read-Fidelity.md)

> [!IMPORTANT]
> This PRD owns only the base result-mode and filter-evaluation contract. It does not include typography predicates, font catalogs, direct-variable-binding predicates, or styled-text-segment output. Those are separate minor releases.
>
> This release deliberately hard-cuts the legacy singular `filter.type` and `filter.layoutMode` keys to strict plural `filter.types` and `filter.layoutModes`. It exposes no aliases, no hidden dispatcher normalization, and no parallel `search` object.

## 1. Executive summary

`node_info` already reads known roots and can prune a tree with two loose legacy predicates. `page_info` already lists pages and the top-level children of explicitly requested pages. Neither tool provides a compact, bounded, path-bearing match list for a caller that needs to discover nodes before acting.

This release introduces one strict base predicate language and makes result shape explicit:

- `node_info` selects `TREE` or `MATCHES`;
- `page_info` selects `SUMMARY` or `MATCHES`;
- `TREE` and `SUMMARY` preserve ordinary existing reads;
- `MATCHES` requires a non-empty filter and returns exact counts, deterministic document order, and ancestry paths;
- page and root scope are always explicit or derived from the connected editable scope, never from selection or an implicit current page.

The release adds no tool. It creates the traversal, schema, output, and error foundation on which later typography, variable-binding, and styled-text read releases add predicates or computed properties without inventing another search contract.

## 2. Release identity and compatibility

This work ships as one independently reviewable minor release. Its concrete version is assigned only when scheduled. At implementation time, the assigned version must replace the then-current version on every enforced release surface:

- `package.json`;
- the root `package-lock.json` release-version fields;
- `server.json` top-level and package versions;
- root `manifest.json`;
- the plugin About/handshake version embedded in the generated plugin bundle;
- the public `CHANGELOG.md`.

`check:versions` and `check:plugin` must enforce that version before tagging.

Public API effect:

| Tool | Before | After |
| :- | :- | :- |
| `node_info` | Existing recursive read; legacy singular filter keys | Strict `TREE`/`MATCHES` input union and shared base filter |
| `page_info` | Existing document/page summary read | Strict `SUMMARY`/`MATCHES` input union |

The release:

- adds no public tool name;
- removes no public tool name;
- changes no write operation;
- preserves unfiltered `node_info` tree output and ordinary `page_info` summary output except for additive schema metadata;
- intentionally rejects legacy singular filter keys;
- intentionally rejects `search`;
- does not silently select a result shape because a filter is present.

The hard filter-key cutover is accepted under this project’s release policy for this scheduled minor. If maintainers do not accept that exception when the release is scheduled, this PRD must be reclassified before implementation; aliases are not an allowed workaround.

## 3. Source mapping

| Umbrella source item | This PRD |
| :- | :- |
| Checklist item 1: search capability for `page_info` and `node_info` | Entire release |
| D2: strict mode-specific contracts | Sections 6–8 |
| D3: explicit discovery | Sections 6–9 |
| D6: errors as repair instructions | Section 10 |
| D29: matching predicates and result shape are orthogonal | Sections 6–8 |
| Section 1 problem and shared-filter foundation | Sections 4–8 |
| Section 1 base `StringMatch`, `name`, `characters`, `types`, and `layoutModes` | Section 6 |
| Section 1 result modes, traversal, counts, paths, and truncation | Sections 7–9 |
| Section 20 read safety/error rows applicable to base matching | Sections 9–10 |
| Schema requirements 1–6 and base portions of 17 | Sections 6–8 |
| Phase 2 base result dispatch and predicate evaluator | Section 13 |

Umbrella Section 1’s `font`, `textStyle`, `variableBinding`, and `fontDiscovery` portions are intentionally assigned to PRD-006 and PRD-007. Umbrella Section 16.3 is assigned to PRD-008.

## 4. Problem

The existing read surface creates four problems for an agent:

1. A caller that knows a root can request a recursive tree but cannot ask for a compact flat match list with complete paths.
2. A caller that knows pages cannot apply the same recursive predicate across those pages.
3. A supplied filter can implicitly affect tree pruning without an explicit output-mode decision.
4. Legacy singular filter keys are loose enough for stale or unknown fields to be ignored instead of producing one-step recovery.

Adding standalone `search_nodes`, `scan_text_nodes`, and type-specific scan tools would multiply tool-selection decisions while repeating traversal, scope, path, count, and recovery logic. The correct boundary is one predicate evaluated by the existing canonical read tools.

## 5. Goals and explicit non-goals

### Goals

1. Publish one strict base `NodeFilter` shared by `page_info` and `node_info`.
2. Make output shape explicit with strict result-mode unions.
3. Preserve ordinary summary and unfiltered tree reads.
4. Support name, text-content, node-type, and layout-mode matching.
5. Return deterministic paths, requested properties, exact scan/match/return counts, and bounded output.
6. Complete the selected traversal even after the return cap is reached so counts remain exact.
7. Preserve explicit page/root/editable-scope semantics and eliminate any current-page or selection fallback.
8. Return structured repair guidance for every mode, filter, enum, root, page, and bound error.
9. Establish extension seams for later filter predicates without a second evaluator or result shape.

### Explicit non-goals

- No `font` or `textStyle` predicate; PRD-006 owns them.
- No used-font or available-font catalog; PRD-006 owns it.
- No `variableBinding` predicate or binding evidence; PRD-007 owns it.
- No `styledTextSegments` option; PRD-008 owns it.
- No image-dimension resolution.
- No standalone search or scan tool.
- No `search` compatibility object.
- No legacy `filter.type` or `filter.layoutMode` alias.
- No fuzzy node-type or layout-mode matching.
- No search by style, component, variable, reaction, or transitive dependency.
- No write, selection, page lifecycle, or scope expansion.
- No early traversal termination merely because `maxResults` has been filled.

## 6. Exact base filter contract

### 6.1 Public types

```ts
type StringMatch = {
  value: string;
  match?: "CONTAINS" | "EXACT"; // default "CONTAINS"
  caseSensitive?: boolean;      // default false
};

type BaseNodeFilter = {
  name?: StringMatch;
  characters?: StringMatch; // evaluated only for TEXT and TEXT_PATH
  types?: NodeType[];        // exact pinned Figma node-type literals
  layoutModes?: Array<"NONE" | "HORIZONTAL" | "VERTICAL" | "GRID">;
};
```

All objects are recursively strict. Unknown keys fail at the MCP boundary and again at the plugin boundary. A future release may add a documented predicate to `BaseNodeFilter`; callers cannot pre-send reserved fields.

### 6.2 Presence and value rules

- A filter is non-empty only when at least one of `name`, `characters`, non-empty `types`, or non-empty `layoutModes` is present.
- `StringMatch.value` must be non-empty. Whitespace is data and is not trimmed silently.
- `types` and `layoutModes`, when present, must be non-empty and duplicate-free.
- Node types and layout modes use exact case-sensitive enum literals.
- An unknown or stale enum literal returns the complete accepted set and a closest-match suggestion; the plugin does not coerce it.
- `name` and `characters` default to case-insensitive substring matching.
- `match: "EXACT"` compares the complete string after applying only the requested case-sensitivity rule.
- `characters` is eligible only on `TEXT` and `TEXT_PATH`. A non-text node is a nonmatch, not an error.
- Different predicate fields are ANDed.
- Values within `types` and within `layoutModes` are ORed.
- Every matching path uses the same predicate evaluator in `TREE` and `MATCHES` and through both public tools.
- The evaluator receives already authorized traversal roots. It must not broaden scope.

### 6.3 Removed shapes

These inputs fail:

```ts
{ filter: { type: "FRAME" } }
{ filter: { layoutMode: "HORIZONTAL" } }
{ search: { name: "Button" } }
```

The error supplies a complete corrected call:

```ts
{
  resultMode: "MATCHES",
  filter: {
    types: ["FRAME"],
    layoutModes: ["HORIZONTAL"]
  }
}
```

There is no compatibility window and no server or plugin normalization for the removed keys.

## 7. `node_info` contract

### 7.1 Input union

```ts
type NodeInfoInput =
  | {
      resultMode?: "TREE"; // default
      nodeIds?: string[];
      filter?: BaseNodeFilter;
      properties?: string[];
      maxDepth?: number;
      concurrencyLimit?: number;
      maxResults?: never;
    }
  | {
      resultMode: "MATCHES";
      nodeIds?: string[];
      filter: BaseNodeFilter;
      properties?: string[];
      maxDepth?: number;
      concurrencyLimit?: number;
      maxResults?: number; // integer 1..500, default 100
    };
```

Branch rules:

- Omitted `resultMode` means `TREE`.
- `TREE` without a filter is the existing recursive subtree read.
- `TREE` with a filter returns a pruned hierarchy.
- `MATCHES` requires a non-empty filter and returns a flat list.
- `TREE` forbids `maxResults`; it never truncates by match count.
- Existing validation for `nodeIds`, `properties`, `maxDepth`, and `concurrencyLimit` remains in force.
- Empty or duplicate `nodeIds` follow the canonical current `node_info` validation and deduplication policy; multiple roots are deduplicated by ID in first request order.
- A descendant reachable through more than one requested root appears once under the first root in request order.

### 7.2 Root semantics

- Explicit `nodeIds` select exact read roots and are subject to the existing read-scope contract.
- When `nodeIds` is omitted, use the connected editable scope root exactly as ordinary `node_info` does.
- A read-only session with neither explicit roots nor an editable scope fails with a structured error that tells the caller to obtain exact roots from `page_info`.
- No branch reads `figma.currentPage` or `figma.currentPage.selection`.
- Missing explicit node IDs are reported through `missingNodeIds` under the existing partial-read policy; they do not cause a current-page fallback.

### 7.3 `TREE` semantics

- Without a filter, current serialized nodes and output ordering remain byte-for-byte compatible except for additive output-schema metadata.
- With a filter, a matching node is retained.
- A nonmatching ancestor is retained only when it leads to a matching descendant.
- A branch with no match is omitted.
- Requested `properties` are serialized only on matching nodes; path-preserving ancestors do not gain those properties.
- `maxDepth` limits traversal exactly as it does in the existing tree read. Counts are not added to the legacy tree result in this release.

### 7.4 `MATCHES` output

```ts
type NodeMatch = {
  id: string;
  name: string;
  type: string;
  path: Array<[type: string, id: string, name: string]>;
  properties?: Record<string, unknown>;
};

type NodeMatchesResult = {
  matches: NodeMatch[];
  matchedCount: number;
  returnedCount: number;
  truncated: boolean;
  scannedNodeCount: number;
  missingNodeIds?: string[];
};
```

Rules:

- Matches are emitted in deterministic document traversal order.
- `path` includes the ancestry required to locate the node from its selected root and ends with the matching node.
- Every match includes `id`, `name`, `type`, and `path`.
- `properties` is present only when requested properties produce output.
- `maxResults` caps returned match objects, not traversal.
- Traversal completes the selected scope after the cap is filled.
- `matchedCount` is the complete number of matches in the successfully traversed scope.
- `returnedCount` equals `matches.length`.
- `truncated` is exactly `matchedCount > returnedCount`.
- `scannedNodeCount` counts each deduplicated candidate node once.
- A bounded result is successful, not an error.

## 8. `page_info` contract

### 8.1 Input union

```ts
type PageInfoInput =
  | {
      resultMode?: "SUMMARY"; // default
      pageIds?: string[];
      filter?: never;
      properties?: never;
      maxResults?: never;
    }
  | {
      resultMode: "MATCHES";
      pageIds?: string[]; // omitted means every document page
      filter: BaseNodeFilter;
      properties?: string[];
      maxResults?: number; // integer 1..500, default 100
    };
```

Branch rules:

- Omitted `resultMode` means `SUMMARY`.
- `SUMMARY` preserves both existing `page_info()` and `page_info({ pageIds })` behavior.
- `SUMMARY` performs no recursive match traversal.
- `SUMMARY` forbids `filter`, `properties`, and `maxResults`.
- `MATCHES` requires a non-empty filter.
- In `MATCHES`, explicit `pageIds` limit traversal to those exact pages.
- Omitted `pageIds` means every document page, never the current page.
- Page IDs are deduplicated in first request order.

### 8.2 Traversal and completeness

- Under dynamic-page access, load pages one at a time.
- Emit progress before yielding under the existing page-scan timeout discipline.
- A page-load failure fails closed for any result that would claim complete counts.
- The error reports completed, failed, and not-yet-attempted page IDs and gives an exact retry over failed/unattempted IDs.
- Returned matches are capped globally across selected pages in document order, not independently per page.
- Omit page result groups with no returned matches.
- A page can contribute to `matchedCount` even when all its matches fall after the return cap.

### 8.3 `MATCHES` output

```ts
type PageMatchesResult = {
  pages: Array<{
    pageId: string;
    pageName: string;
    matches: NodeMatch[];
  }>;
  matchedCount: number;
  returnedCount: number;
  truncated: boolean;
  scannedPageCount: number;
  scannedNodeCount: number;
  missingPageIds?: string[];
};
```

`matchedCount`, `returnedCount`, and `truncated` use the same definitions as `node_info`. `scannedPageCount` and `scannedNodeCount` cover the completed selected scope.

## 9. Safety, scope, and readback rules

This release is read-only, but safety remains plugin-enforced.

- `page_info` and `node_info` retain `readOnlyHint: true` and `openWorldHint: true`.
- Existing explicit-page, explicit-root, and connected-read-scope rules remain authoritative.
- The MCP schema is not a safety boundary; the plugin validates the mode union, non-empty filter, numeric bounds, enum values, and unknown keys again.
- Traversal never follows selection or an implicit current page.
- Requested properties use the existing safe field allowlist and serialization controls.
- A property read failure follows the existing structured incomplete-read policy; it is not silently converted into an absent property when that would make completeness claims false.
- No result reports exact total counts after an incomplete page traversal.
- No match result contains a node outside the authorized traversal roots.
- Paths are evidence, not authority for a later write; callers must still pass exact IDs and names through each write tool’s gates.

The [`SAFETY.md`](../../../SAFETY.md) read rows and registered-tool-to-safety-row consistency test must be updated in the same release to describe `TREE`/`MATCHES` and `SUMMARY`/`MATCHES`.

## 10. Structured errors and recovery

Every new refusal uses the central structured-error registry and returns machine-usable `details`. Exact code names may follow the registry’s naming convention, but distinct causes must remain distinguishable:

| Condition | Required details and repair |
| :- | :- |
| `MATCH_FILTER_REQUIRED` | Tool, selected mode, accepted base predicates, complete corrected call |
| `RESULT_MODE_FILTER_CONFLICT` | Supplied mode/fields, forbidden fields for that branch, corrected branch |
| `FILTER_EMPTY` | Supplied filter, accepted predicate keys |
| `FILTER_UNKNOWN_KEY` | Exact path, rejected key, accepted keys, corrected call when unambiguous |
| `FILTER_STRING_EMPTY` | Exact predicate path and non-empty requirement |
| `FILTER_ENUM_INVALID` | Exact path/value, accepted literals, closest suggestion |
| `FILTER_ARRAY_EMPTY` | Exact path and non-empty requirement |
| `FILTER_ARRAY_DUPLICATE` | Exact path, duplicate value/indexes, deduplicated corrected call |
| `MAX_RESULTS_INVALID` | Supplied value and integer range `1..500` |
| `MATCH_ROOT_UNAVAILABLE` | Requested/missing roots and exact `page_info` or narrower `node_info` recovery call |
| `PAGE_MATCH_SCAN_INCOMPLETE` | Completed, failed, and pending page IDs; exact retry call |
| `LEGACY_FILTER_KEY_REMOVED` | Rejected singular key and complete plural-key migration |
| `SEARCH_FIELD_REMOVED` | Rejected `search` shape and complete `MATCHES` plus `filter` migration |

Unknown-key failures must never be presented as successful zero-match results.

## 11. Documentation and tool-selection contract

Update, in the same release:

- `README.md`;
- [`SAFETY.md`](../../../SAFETY.md);
- [`constraints.md`](../../../skills/figma-edit/references/constraints.md);
- [`error-playbook.md`](../../../skills/figma-edit/references/error-playbook.md);
- [`workflows.md`](../../../skills/figma-edit/references/workflows.md);
- [`tool-selection.md`](../../../skills/figma-edit/references/tool-selection.md);
- the MCP resources generated or mirrored from those guides;
- tool descriptions and examples;
- `CHANGELOG.md`;
- the generated plugin bundle and tool manifest.

Documentation must explain:

- `TREE` versus `MATCHES`;
- `SUMMARY` versus `MATCHES`;
- rooted versus page-wide matching;
- omission of `pageIds` means all pages only in `page_info MATCHES`;
- omission of `nodeIds` uses the connected editable root only;
- `maxResults` bounds output, not evaluation;
- `matchedCount` versus `returnedCount`;
- paths aid discovery but do not bypass exact-name write gates;
- the one-call migration from singular to plural filter keys;
- why no standalone search tool exists.

Examples must include name search, text-content search, type scan, combined type/layout matching, pruned-tree traversal, cross-page matching, truncation, missing-root recovery, and both removed-key errors.

## 12. Implementation context and owned files

Primary production areas:

- `src/mcp_server/tools/page.ts`;
- `src/mcp_server/tools/node.ts`;
- `figma_plugin/handlers/nodeReaders.ts`;
- `figma_plugin/src/main.ts`;
- shared input/output/error helpers introduced for the result-mode unions and predicate evaluator.

Primary test and generated areas:

- `src/mcp_server/tests/unit/tools/mcpBoundary.test.ts`;
- `src/mcp_server/tests/unit/tools/outputSchema.test.ts`;
- `src/mcp_server/tests/unit/tools/strictInput.test.ts`;
- focused `node_info` reader tests under `src/mcp_server/tests/unit/figma_plugin/`;
- permission/safety consistency tests;
- `manifest.json`;
- `figma_plugin/code.js`.

Implementation should extract the base result-mode schemas, `StringMatch`, `BaseNodeFilter`, `NodeMatch`, and traversal evaluator into narrowly owned modules rather than expanding the already broad tool registrar and reader indefinitely. PRD-006 and PRD-007 must extend those modules rather than fork them.

## 13. Phased implementation

### Phase 0 — scheduled-baseline audit

- Record the assigned version and current baseline.
- Re-read the current tool schemas, handlers, safety rows, resources, generated outputs, and relevant tests.
- Record current byte shapes for ordinary `page_info()` and unfiltered `node_info`.
- Reconfirm the current pinned `NodeType` and layout-mode literals.
- Identify all in-repo singular filter examples and any hidden `search` parsing.

### Phase 1 — schema and error scaffolding

- Define strict reusable `StringMatch` and `BaseNodeFilter` schemas.
- Define the two `node_info` and two `page_info` branches.
- Add stable central error entries before handlers depend on them.
- Add emitted-schema tests for required/forbidden fields and numeric bounds.
- Add explicit old-to-new migration fixtures.

### Phase 2 — one predicate evaluator

- Replace the loose legacy evaluator with one strict evaluator for both tools and both node result modes.
- Implement AND/OR and string semantics exactly once.
- Preserve current property serialization and depth/concurrency controls.
- Remove singular-key and `search` normalization.

### Phase 3 — `node_info` result modes

- Preserve unfiltered tree behavior.
- Implement pruned-tree ancestry.
- Implement flat matches, deterministic paths, root deduplication, exact counts, and global bounds.
- Add incomplete-root recovery without scope broadening.

### Phase 4 — `page_info` result modes

- Preserve summary behavior.
- Implement explicit/all-page recursive matching with one-page-at-a-time loading.
- Add progress, fail-closed completeness, page grouping, and global result bounds.

### Phase 5 — safety, docs, generated outputs, and version

- Synchronize safety rows, guides/resources, examples, and changelog.
- Regenerate the tool manifest and plugin bundle.
- Apply the assigned version to every enforced surface.
- Run focused, full, generated, plugin, and version gates.

## 14. Verification requirements

### 14.1 Schema and boundary tests

Prove:

- default and explicit `TREE`;
- explicit `MATCHES`;
- default and explicit `SUMMARY`;
- match filter required;
- `TREE` rejects `maxResults`;
- `SUMMARY` rejects filter/property/match fields;
- `maxResults` accepts integers `1..500` and rejects all other values;
- strict nested unknown-key rejection;
- non-empty strings and arrays;
- duplicate array rejection;
- exact enum values;
- removed singular keys and `search` return corrected calls.

### 14.2 Predicate tests

Cover:

- default contains and default case-insensitive behavior;
- exact matching;
- case-sensitive contains and exact matching;
- `TEXT` and `TEXT_PATH` character predicates;
- non-text character nonmatches;
- one and multiple node types;
- one and multiple layout modes;
- cross-field AND and within-array OR;
- empty-text and whitespace-sensitive cases;
- deterministic behavior across tree and match traversal.

### 14.3 Traversal/output tests

Cover:

- explicit root, multiple roots, omitted root with connected edit scope;
- duplicate and overlapping roots;
- pruned nonmatching ancestors;
- document-order flat results and paths;
- `maxDepth`;
- requested properties only on matches;
- exact scan/match/return counts;
- caps at `1`, default `100`, and `500`;
- complete traversal after cap;
- missing roots;
- explicit page subset and omitted all-page scope;
- page-load failure with no false-complete result;
- no current-page or selection access.

### 14.4 Red proofs

Before final green, inject and record named failures that prove:

- accepting `filter.type` breaks the migration test;
- accepting `search` breaks strict-input coverage;
- changing one output mode implicitly breaks the union test;
- stopping traversal at `maxResults` breaks exact-count tests;
- reading `figma.currentPage` breaks current-page-elimination coverage;
- returning a result after page-load failure breaks completeness coverage.

Restore the production contract and rerun the named tests green. Record exact red and green counts.

### 14.5 Live Figma probes

In a dedicated disposable test file or page:

1. Create or identify a nested hierarchy containing matching and nonmatching names, text, types, and layout modes.
2. Verify rooted `TREE` pruning and flat `MATCHES` paths.
3. Verify page matching over two explicit pages and over omitted all-page scope.
4. Verify a cap produces exact counts and deterministic first results.
5. Verify ordinary summary/tree reads retain their baseline shapes.
6. Verify no operation depends on selection by changing selection between identical calls.

Live evidence must report the exact plugin/channel, Figma document/page scope, calls, returned IDs/counts, and cleanup reconciliation. Repository mocks do not establish live Figma traversal behavior.

## 15. Repository, generated, and release gates

Required before completion:

- focused boundary/schema/handler tests;
- `bun test`;
- `bun run check:types:plugin`;
- `bun run check:types:scripts`;
- `bun run check:suppressions`;
- `bun run check:generated`;
- `bun run build:all`;
- `bun run check:plugin`;
- `bun run check:versions`;
- a clean diff review proving generated files match their sources;
- live probes or an explicit fixture-unavailable statement for any unexercised live branch.

If an exact command has changed on the scheduled baseline, use its documented successor and record the substitution.

## 16. Acceptance criteria

The release is complete only when:

1. One standalone minor version is assigned and synchronized across all release surfaces.
2. `node_info` emits and enforces strict `TREE`/`MATCHES` branches.
3. `page_info` emits and enforces strict `SUMMARY`/`MATCHES` branches.
4. One strict base predicate implements the documented string, node-type, layout-mode, AND, and OR rules.
5. `MATCHES` requires a non-empty filter.
6. Ordinary unfiltered tree and summary reads preserve their baseline behavior.
7. Pruned-tree ancestry and flat paths are deterministic.
8. Exact match, return, page, and node counts remain correct after the return cap is reached.
9. Explicit page/root/edit-scope semantics are enforced without current-page or selection fallback.
10. Incomplete page traversal cannot appear complete.
11. Legacy singular keys and `search` are absent from schema, server normalization, plugin routing, examples, prompts, and generated output.
12. Every new error has a central code, machine-usable details, and a complete repair call where one is unambiguous.
13. Safety rows, guides/resources, tool descriptions, examples, generated manifest, plugin bundle, and changelog are synchronized.
14. Focused/full/generated/plugin/version gates are green.
15. Named red proofs and live traversal evidence are recorded separately.
16. No typography, font-catalog, variable-binding, styled-segment, image-metadata, or write feature has leaked into this release.

## 17. Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Hard-cut singular-key callers fail | Certain for stale callers | Complete migration examples, structured corrected calls, no ambiguous alias period |
| A result cap is mistaken for an evaluation cap | Medium | Complete traversal, exact counts, explicit `truncated`, boundary tests |
| Page-load failure produces false completeness | Medium | Fail closed and return completed/failed/pending scope |
| Tree and flat traversal drift | Medium | One evaluator and shared traversal-order tests |
| A path is mistaken for write authority | Medium | Tool descriptions retain exact ID/name and scope-gate wording |
| All-page omission is mistaken for current page | High without wording | Schema descriptions, explicit scope in output/tests, current-page red proof |
| Future predicates fork the evaluator | Medium | Export extension seams and require PRD-006/007 parity tests |
| Monolithic reader context becomes unreviewable | Medium | Extract narrow result/filter/traversal modules in this release |

## 18. Dependencies and exclusions

### Required baseline

- Existing explicit-page and explicit-root read safety.
- Existing connected editable-scope behavior.
- Existing safe property serializer and page-scan progress discipline.
- Existing structured-error registry and generated-artifact gates.

### Downstream releases

- PRD-006 extends the filter and `page_info` union with typography/font modes.
- PRD-007 extends the filter and match output with direct-variable-binding evidence.
- PRD-008 extends `node_info` with bounded styled-text computed reads.

Those releases must preserve this release’s default modes, traversal, ordering, paths, counts, hard-cut legacy-key posture, and ordinary-read compatibility.

### Explicitly excluded release work

No text write, variable write, paint write, instance/component write, creation, transform, layout, appearance, page lifecycle, image metadata, or structural mutation belongs here.

## 19. References

- [Umbrella capability-expansion PRD](<../initiative/03 - Figma Design Editing Capability Expansion/initiative.md>)
- [Repository safety contract](../../../SAFETY.md)
- [Contributor and verification guidance](../../../CONTRIBUTING.md)
- [Figma-edit constraints](../../../skills/figma-edit/references/constraints.md)
- [Figma-edit error playbook](../../../skills/figma-edit/references/error-playbook.md)
- [Figma-edit workflows](../../../skills/figma-edit/references/workflows.md)
- [Figma-edit tool-selection guide](../../../skills/figma-edit/references/tool-selection.md)
