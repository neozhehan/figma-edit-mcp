# PRD — Typography and Font Discovery

- **Status:** Proposed
- **Release:** Version-unassigned standalone minor release
- **PRD date:** 2026-08-04
- **Source:** [Future Figma Design Editing Capability Expansion](<../Figma Design Editing Capability Expansion/prd.md>), Section 1
- **Required predecessor:** [`PRD-005-Scoped-Match-Discovery.md`](PRD-005-Scoped-Match-Discovery.md)
- **Parallel sibling:** [`PRD-007-Direct-Variable-Binding-Discovery.md`](PRD-007-Direct-Variable-Binding-Discovery.md)

> [!IMPORTANT]
> This release owns the shared typography-run extractor, font/Text Style match predicates, bounded typography evidence, and the `page_info` `USED`/`AVAILABLE` font catalog.
>
> It does not expose styled-text segments and does not change any text creation or write tool. Public styled-run reads belong to PRD-008; text mutations consume this release later but do not ship here.

## 1. Executive summary

Agents need to answer three different typography questions:

1. Which text nodes contain a run with a matching font or linked Text Style?
2. Which exact font pairs are used in selected pages, including pairs unavailable in the current editor session?
3. Which exact font pairs can the current editor session attempt to load for a future write?

These questions must not be conflated. This release extends the scoped matching foundation with run-aware `font` and `textStyle` predicates and adds two explicit `page_info.fontDiscovery` branches:

- `USED` scans exact pages or all document pages and returns aggregate usage plus an exact availability cross-check.
- `AVAILABLE` returns the live editor-session catalog and rejects page scope.

The implementation shares one typography-run extractor and one exact `{ family, style }` identity model. It evaluates combined font and Text Style predicates against the same run, caches style resolution, fails closed when name/key completeness cannot be established, and never treats style linkage as proof that effective formatting conforms to the style.

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
| `NodeFilter` | Add strict optional `font` and `textStyle` predicates |
| `NodeMatch.matchEvidence` | Add bounded font and Text Style evidence |
| `page_info` | Add strict `fontDiscovery.source: "USED" | "AVAILABLE"` branches |
| `page_info` title | Change to **Get Document and Page Information** |

The release adds and removes no tool names. It preserves PRD-005’s hard rejection of `search`, `filter.type`, and `filter.layoutMode`. It preserves ordinary `page_info` and unfiltered `node_info` behavior.

## 3. Source mapping

| Umbrella source item | This PRD |
| :- | :- |
| Checklist item 26: used-font and available-font discovery | Sections 8–10 |
| Checklist item 32: run-aware font and Text Style filtering | Sections 6–7 |
| D23: explicit `page_info` font discovery mode | Sections 8–10 |
| D29: shared strict filter and same-run typography semantics | Sections 6–7 |
| Section 1 font/Text Style filter rules | Sections 6–7 |
| Section 1 font-discovery problem, contract, outputs, and recovery | Sections 8–11 |
| Section 20 read safety and typography errors | Sections 11–12 |
| Schema requirements 17, 18, and 22 | Sections 6–10 |
| Phase 2 typography extractor, style cache, and font catalogs | Section 15 |

The base result modes, paths, traversal, counts, and non-typography predicates remain owned by PRD-005. Direct variable-binding matching remains owned by PRD-007. Public styled-segment reads remain owned by PRD-008.

## 4. Problem

Whole-node text properties are insufficient for mixed text. A node can contain several font family/style pairs and several Text Style links. Matching `fontName` or `textStyleId` only at node level can:

- miss a run that differs from the node-level value;
- falsely combine a font on one run with a Text Style on another;
- confuse style identity with effective visual conformance;
- silently omit a style when resolving its name or key fails;
- suggest a used font for writing even though it is unavailable in the current editor session.

A standalone font tool would add another selection decision and would still need page traversal already owned by `page_info`. A standalone font-consumer or Text-Style-consumer search tool would duplicate the result modes and paths already owned by PRD-005.

## 5. Goals and explicit non-goals

### Goals

1. Add exact, run-aware font and Text Style predicates to the shared `NodeFilter`.
2. Require a combined font/Text Style match to occur on one effective run.
3. Return exact bounded match evidence and complete unique counts.
4. Preserve raw Text Style IDs and distinguish linked, unlinked, resolved, and unresolved states.
5. Resolve style names/keys only when required and cache each ID once per command.
6. Fail closed when a name/key traversal cannot establish complete results.
7. Add explicit `USED` and `AVAILABLE` font-discovery branches to `page_info`.
8. Keep used and available font identities exact and separate.
9. Provide deterministic usage counts, availability flags, ordering, bounds, and scope metadata.
10. Establish one live font catalog and candidate helper for later write releases without changing writes now.

### Explicit non-goals

- No `styledTextSegments` public request or output; PRD-008 owns it.
- No `text_set_style`, `text_set_content`, or `create_text` change.
- No font installation, download, activation, substitution, or fallback.
- No standalone `get_fonts`, `font_list`, font-consumer, or Text-Style-consumer tool.
- No assertion that a linked Text Style’s effective formatting equals its definition.
- No fuzzy style identity for ID or key branches.
- No document-wide style inventory unrelated to text-node consumers.
- No direct variable-binding predicate or evidence.
- No general search alias and no changes to PRD-005’s base mode contract.
- No implicit current-page or selection scope.

## 6. Exact typography filter contract

### 6.1 Types

PRD-005’s `StringMatch` is reused unchanged:

```ts
type StringMatch = {
  value: string;
  match?: "CONTAINS" | "EXACT";
  caseSensitive?: boolean;
};

type FontFilter = {
  family?: StringMatch;
  style?: StringMatch;
};

type TextStyleFilter =
  | { by: "ID"; id: string }
  | { by: "KEY"; key: string }
  | { by: "NAME"; name: StringMatch }
  | { by: "LINK_STATE"; state: "LINKED" | "UNLINKED" };

type TypographyNodeFilterExtension = {
  font?: FontFilter;
  textStyle?: TextStyleFilter;
};
```

The shared `NodeFilter` becomes PRD-005’s base fields plus these optional fields. It remains recursively strict and must contain at least one base or typography predicate.

### 6.2 Font rules

- `font` must contain at least one of `family` or `style`.
- Empty strings are rejected under the inherited `StringMatch` rules.
- When both are present, one effective run must satisfy both.
- Family and style use the exact requested `CONTAINS`/`EXACT` and case-sensitivity semantics.
- Matching uses the effective pair stored on the run.
- A used pair need not appear in the current `AVAILABLE` catalog to match.
- Used-but-unavailable fonts remain discoverable.
- `font` applies only to `TEXT` and `TEXT_PATH`; other nodes are nonmatches.

### 6.3 Text Style rules

- `TextStyleFilter` is a strict discriminated union.
- `by: "ID"` requires a non-empty raw style ID and compares it exactly.
- `by: "KEY"` requires a non-empty exact library key.
- `by: "NAME"` requires one strict `StringMatch`; duplicate style names all match.
- `by: "LINK_STATE"` requires exactly `LINKED` or `UNLINKED`.
- Fields from another branch are rejected, not stripped.
- An empty `textStyleId` is unlinked. A non-empty raw ID is linked even if its object cannot currently be resolved.
- ID and link-state matching never require style-object resolution.
- Key and name matching resolve the linked style with `getStyleByIdAsync()` and require the resolved object type to be `TEXT`.
- Text Style name is a discovery value, not an identity. Every result returns the exact matching ID and, when resolved, key/name/remote metadata.
- A link is identity evidence only. Output and documentation must not claim the node visually conforms to the linked style.

### 6.4 Effective-run extraction

The release owns one internal effective-run extractor:

```ts
type TypographyRun = {
  start: number;
  end: number;
  fontName?: { family: string; style: string };
  textStyleId?: string;
};
```

Rules:

- For uniform non-empty or empty text with concrete node-level values, represent the node as one effective run.
- If any field required by the active predicates is `figma.mixed`, call `getStyledTextSegments()` once with the minimal union of required fields.
- Do not request unused segment fields.
- The extractor supports both `TEXT` and `TEXT_PATH`.
- A combined `font` and `textStyle` filter is evaluated against each run as a conjunction.
- A font match on run A and Text Style match on run B does not match the node.
- Base node predicates from PRD-005 are evaluated before expensive style resolution.
- Resolve only style IDs on candidate runs that already satisfy all cheaper node and font predicates.
- Resolve each distinct non-empty style ID at most once per command.
- Reuse the extractor for `node_info`, `page_info MATCHES`, and `page_info USED`; PRD-008 may consume the same primitive but owns its public segment serializer.

### 6.5 Resolution completeness

- If `by: "KEY"` or `by: "NAME"` requires a style object and any candidate run’s linked style cannot be resolved or resolves to a non-`TEXT` style, fail closed.
- The error reports unresolved/non-text IDs, completed pages/roots, and the exact narrower retry.
- When the caller already knows the raw ID, the error also gives the complete `by: "ID"` call, which remains complete without resolution.
- A resolution failure during `by: "ID"` or link-state matching does not erase a match; those branches do not resolve.

## 7. Typography match evidence

When a typography predicate is supplied, every matching node includes the corresponding evidence category:

```ts
type TextStyleEvidence =
  | { state: "UNLINKED" }
  | {
      state: "LINKED";
      id: string;
      resolved: false;
    }
  | {
      state: "LINKED";
      id: string;
      resolved: true;
      key: string;
      name: string;
      remote: boolean;
    };

type TypographyMatchEvidence = {
  fontNames?: Array<{ family: string; style: string }>;
  matchedFontNameCount?: number;
  textStyles?: TextStyleEvidence[];
  matchedTextStyleCount?: number;
  evidenceTruncated?: boolean;
};
```

Rules:

- `font` requires both `fontNames` and `matchedFontNameCount`.
- `textStyle` requires both `textStyles` and `matchedTextStyleCount`.
- Omit an evidence category when its predicate was not supplied.
- Evidence contains only values that caused the node to match.
- Font pairs are unique by exact `{ family, style }`.
- Text Style evidence is unique by unlinked state or exact linked ID.
- Preserve first effective-run order.
- Return at most 50 entries per category.
- Counts cover every unique matching entry even when the array is capped.
- Set `evidenceTruncated: true` when either requested category exceeds its cap.
- A combined predicate returns both categories, and both derive from runs that individually satisfied the complete typography conjunction.

The generic path, property, result-count, and traversal contract remains exactly as specified by PRD-005.

## 8. Exact `page_info.fontDiscovery` contract

### 8.1 Input branches

PRD-005’s `SUMMARY` and `MATCHES` branches remain unchanged. This release adds:

```ts
type PageFontDiscoveryInput =
  | {
      pageIds?: string[]; // omitted means every document page
      resultMode?: never;
      filter?: never;
      properties?: never;
      maxResults?: never;
      fontDiscovery: {
        source: "USED";
        query?: string;
        maxResults?: number; // integer 1..500, default 100
      };
    }
  | {
      pageIds?: never;
      resultMode?: never;
      filter?: never;
      properties?: never;
      maxResults?: never;
      fontDiscovery: {
        source: "AVAILABLE";
        query?: string;
        maxResults?: number; // integer 1..500, default 100
      };
    };
```

The emitted `page_info` input is one exclusive four-way union:

1. default/explicit `SUMMARY`;
2. explicit `MATCHES`;
3. `fontDiscovery.source: "USED"`;
4. `fontDiscovery.source: "AVAILABLE"`.

Rules common to both font branches:

- `fontDiscovery.source` is required.
- `USED` and `AVAILABLE` cannot be combined.
- `fontDiscovery` is mutually exclusive with `resultMode`, `filter`, match-only `properties`, and top-level `maxResults`.
- `query`, when supplied, must be non-empty and performs a case-insensitive substring match across family and style.
- `fontDiscovery.maxResults` is an integer `1..500`, default `100`.
- Results are deduplicated by exact `{ family, style }`, deterministically ordered, and accompanied by exact match/return counts and `truncated`.
- The cap limits only returned pairs; traversal/counting completes.
- Ordinary `page_info` calls perform no font traversal or catalog call.
- Read annotations remain `readOnlyHint: true` and `openWorldHint: true`.

### 8.2 `USED` behavior

- Explicit `pageIds` select those exact pages.
- Omitted `pageIds` means every document page, never current page.
- Load pages one at a time and emit progress under the existing scan discipline.
- Traverse `TEXT` and `TEXT_PATH`.
- Uniform text contributes one effective segment.
- Mixed text is segmented by the shared extractor using only `fontName`.
- `textNodeCount` counts a pair once per containing text node even when several runs use it.
- `segmentCount` counts every corresponding effective run.
- Each `pageUsage` entry applies those same definitions within one page.
- Call `listAvailableFontsAsync()` live once for the command and mark each used pair `available` by exact family-and-style equality.
- Sort by descending `textNodeCount`, then descending `segmentCount`, then family, then style.
- A requested page-load failure fails closed. Do not return an apparently complete inventory.
- The error reports completed, failed, and pending page IDs and gives an exact retry.

### 8.3 `AVAILABLE` behavior

- Call `listAvailableFontsAsync()` live.
- Return exact family/style pairs accessible to the current editor session.
- Reject `pageIds`; availability is not page-scoped.
- Return `scope: "EDITOR_SESSION"`.
- State explicitly that the result cannot install, download, activate, or license a missing font.
- Sort by family, then style.

## 9. Font-discovery outputs

```ts
type FontName = {
  family: string; // non-empty
  style: string;  // non-empty
};

type PageFontDiscoveryResult =
  | {
      source: "USED";
      scope: { kind: "PAGES"; pageIds: string[] };
      fonts: Array<{
        fontName: FontName;
        textNodeCount: number;
        segmentCount: number;
        pageUsage: Array<{
          pageId: string;
          textNodeCount: number;
          segmentCount: number;
        }>;
        available: boolean;
      }>;
      matchedCount: number;
      returnedCount: number;
      truncated: boolean;
      scannedPageCount: number;
      scannedNodeCount: number;
    }
  | {
      source: "AVAILABLE";
      scope: "EDITOR_SESSION";
      fonts: Array<{ fontName: FontName }>;
      matchedCount: number;
      returnedCount: number;
      truncated: boolean;
    };
```

Additional output rules:

- `scope.pageIds` contains the exact successfully scanned pages in document order.
- `pageUsage` is ordered by document page order and omits zero-use pages for that pair.
- `matchedCount` counts exact pairs after `query`.
- `returnedCount` equals `fonts.length`.
- `truncated` is exactly `matchedCount > returnedCount`.
- Counts and availability apply to the complete selected scope, not only returned pairs.

## 10. Shared catalog and downstream recovery seam

This release owns one internal available-font catalog helper used by:

- `page_info AVAILABLE`;
- the `USED` availability cross-check;
- later exact-font write validation.

The helper:

- calls `listAvailableFontsAsync()` at most once per command;
- normalizes exact non-empty `{ family, style }` pairs;
- deduplicates exact pairs;
- provides styles available in an exact family;
- provides bounded close-family candidates without choosing one;
- never substitutes a font;
- keeps editor-session scope explicit.

This release tests that candidate generation is deterministic, but it does not add `FONT_NOT_AVAILABLE` behavior to any write tool. Later write PRDs must consume the helper and own their write-specific error/readback contract.

## 11. Safety, scope, and completeness

- The plugin remains the trust boundary.
- `node_info` typography predicates traverse only PRD-005-authorized roots.
- `page_info MATCHES` typography predicates traverse only selected pages or all pages under its explicit omission rule.
- `USED` follows the same explicit-page/all-document rule.
- `AVAILABLE` is editor-session scoped and forbids page IDs.
- No branch reads current selection or uses current page as an implicit scope.
- Name/key Text Style matching fails closed if required resolution is incomplete.
- Used-font page scans fail closed if a requested page cannot load.
- Font catalog failure does not become an empty catalog.
- The MCP boundary and plugin both validate strict branch exclusions, non-empty queries, exact enum values, and bounds.
- Typography evidence never exposes a node outside the authorized traversal scope.
- Style names and font strings are discovery data, not write authority.

Update the corresponding read rows in [`SAFETY.md`](../../../SAFETY.md) and preserve the registered-tool-to-safety-row consistency gate.

## 12. Structured errors and one-step recovery

Required distinct conditions:

| Condition | Required recovery content |
| :- | :- |
| `FONT_FILTER_EMPTY` | Accepted `family`/`style` shape and complete corrected call |
| `TEXT_STYLE_FILTER_INVALID` | Selected/observed branch fields, exact four branches, corrected call |
| `TEXT_STYLE_ID_EMPTY` | Exact non-empty ID requirement |
| `TEXT_STYLE_KEY_EMPTY` | Exact non-empty key requirement |
| `TEXT_STYLE_RESOLUTION_INCOMPLETE` | Unresolved IDs, completed scope, narrower retry, and raw-ID alternative |
| `TEXT_STYLE_TYPE_INVALID` | Style ID, observed type, required `TEXT`, raw-ID alternative where useful |
| `FONT_DISCOVERY_SOURCE_REQUIRED` | Exact `USED` and `AVAILABLE` calls |
| `FONT_DISCOVERY_MODE_CONFLICT` | Supplied conflicting fields and complete corrected branch |
| `FONT_DISCOVERY_SCOPE_INVALID` | Rejected page IDs for `AVAILABLE` or malformed `USED` scope |
| `FONT_DISCOVERY_QUERY_EMPTY` | Non-empty requirement |
| `FONT_DISCOVERY_LIMIT_INVALID` | Integer range `1..500` |
| `USED_FONT_SCAN_INCOMPLETE` | Completed/failed/pending pages and exact retry |
| `FONT_CATALOG_UNAVAILABLE` | Editor-session catalog failure without false empty result |

Errors use the central registry, carry machine-usable `details`, and name `page_info`/`node_info` recovery calls rather than prose-only advice.

## 13. Documentation and generated-contract requirements

The broadened `page_info` title must be **Get Document and Page Information**. Its description must name:

- ordinary `SUMMARY` reads;
- scoped `MATCHES`;
- page-scoped/all-document `USED` discovery;
- editor-session `AVAILABLE` discovery.

Update:

- `README.md`;
- [`SAFETY.md`](../../../SAFETY.md);
- all four [`figma-edit` references](../../../skills/figma-edit/references/);
- mirrored MCP resources;
- `page_info` and `node_info` tool descriptions/examples;
- `CHANGELOG.md`;
- generated `manifest.json`;
- generated `figma_plugin/code.js`.

Guidance must distinguish:

- node-level font matching from aggregate used-font inventory;
- used fonts from assignable fonts;
- Text Style ID/key/name/link state;
- style linkage from visual conformance;
- duplicate style names from exact identity;
- exact pair matching from fallback or substitution;
- page scope from editor-session scope.

## 14. Implementation context and owned files

Primary production areas:

- `src/mcp_server/tools/page.ts`;
- `src/mcp_server/tools/node.ts`;
- the shared filter/result modules introduced by PRD-005;
- `figma_plugin/handlers/nodeReaders.ts`;
- a shared typography-run and font-catalog module;
- `figma_plugin/src/main.ts` only where branch dispatch/output serialization requires it.

Primary tests:

- MCP boundary, strict-input, and output-schema suites;
- `getNodesInfo` unit/integration/benchmark coverage;
- page traversal/progress tests;
- current-page-elimination coverage;
- safety/permission consistency tests.

The implementation must extend, not copy, PRD-005’s predicate evaluator and match serializer. PRD-008 must consume the typography-run primitive without moving ownership of public segment serialization into this release.

## 15. Phased implementation

### Phase 0 — baseline and dependency gate

- Confirm PRD-005 is released and its schema/traversal tests are green.
- Recheck the pinned Figma typings for `TEXT`, `TEXT_PATH`, `FontName`, `textStyleId`, `getStyledTextSegments`, `getStyleByIdAsync`, and `listAvailableFontsAsync`.
- Record ordinary read and base-match baselines.
- Inventory every current font-loading/catalog helper to prevent parallel semantics.

### Phase 1 — strict schemas and error registry

- Add `FontFilter`, `TextStyleFilter`, `FontName`, evidence, and font-discovery schemas.
- Extend the shared filter non-empty refinement.
- Extend `page_info` to a strict four-way union.
- Add all error registry/playbook entries before handler routing.
- Add emitted-schema assertions for required and forbidden branch fields.

### Phase 2 — typography-run extractor and matching

- Implement the uniform/empty fast path and minimal mixed-run segmentation.
- Implement same-run conjunction.
- Add cheap-predicate ordering, style resolution cache, type check, and fail-closed completeness.
- Emit deterministic bounded evidence and exact counts.

### Phase 3 — available-font catalog

- Implement one live catalog helper, exact normalization/deduplication, ordering, querying, and candidate generation.
- Add `AVAILABLE`.
- Add catalog failure behavior and editor-session scope.

### Phase 4 — used-font inventory

- Reuse the run extractor.
- Implement explicit/all-page scans, progress, exact node/segment/page counts, live availability cross-check, ordering, bounds, and fail-closed page errors.

### Phase 5 — synchronization and release

- Update safety, resources, guides, examples, changelog, generated manifest, and plugin bundle.
- Apply the assigned version.
- Execute focused, full, generated, plugin, version, red-proof, and live gates.

## 16. Verification requirements

### 16.1 Schema tests

Assert:

- `font` requires family or style;
- all nested string predicates remain strict;
- all four Text Style branches are mutually exclusive and exact;
- the shared filter is non-empty after typography fields are added;
- `page_info` emits four mutually exclusive branches;
- `USED` permits optional page IDs;
- `AVAILABLE` forbids page IDs;
- font branches forbid result/filter/property/top-level limit fields;
- query and limits enforce their contracts.

### 16.2 Typography matching tests

Cover:

- uniform, empty, and mixed `TEXT`;
- uniform, empty, and mixed `TEXT_PATH`;
- family-only, style-only, and combined font predicates;
- exact, contains, case-sensitive, and default-case behavior;
- used-but-unavailable pairs;
- style raw ID, exact key, exact/partial name, duplicate names, linked/unlinked;
- local and remote styles;
- one resolution per distinct ID;
- resolution only after cheaper predicates;
- unresolved/non-`TEXT` fail-closed behavior for key/name;
- ID/link-state completeness without resolution;
- same-run positive and cross-run negative cases;
- evidence ordering, deduplication, caps, exact counts, and truncation.

### 16.3 Font catalog tests

Cover:

- exact-pair deduplication;
- family/style sorting;
- query over both fields;
- bounds/counts/truncation;
- explicit editor-session scope;
- page-ID rejection;
- one catalog call per command;
- deterministic candidate ordering;
- catalog failure is not an empty success.

### 16.4 Used-font tests

Cover:

- explicit one/multiple pages and omitted all-page scope;
- uniform and mixed text;
- distinct-node versus segment counts;
- per-page usage counts;
- exact availability flags;
- deterministic usage ordering;
- query, bounds, counts, and truncation;
- page-load fail-closed behavior;
- no current-page access.

### 16.5 Red proofs

Record named red failures for:

- permitting empty `font`;
- matching font and Text Style on different runs;
- treating unresolved name/key style as nonmatch;
- resolving raw-ID matching unnecessarily;
- conflating used and available pairs;
- accepting `pageIds` in `AVAILABLE`;
- returning a partial `USED` inventory as complete;
- silently choosing a font candidate.

Restore the contract and rerun exact named tests green.

### 16.6 Live probes

Use a dedicated test document with:

- uniform, empty, and mixed-font text;
- at least two different linked Text Styles, one duplicate-name case if fixtures permit;
- an unlinked run;
- a used-but-unavailable font pair if a legitimate fixture exists;
- content across two pages.

Verify matching, same-run negative behavior, ID/key/name/link-state output, `USED` counts, `AVAILABLE` scope, exact availability, and selection independence. If an unavailable-font or remote-style fixture cannot be created legitimately, record it as fixture-unavailable; do not replace it with a mock success claim.

## 17. Repository and release gates

Required:

- focused schema/handler tests;
- `bun test`;
- `bun run check:types:plugin`;
- `bun run check:types:scripts`;
- `bun run check:suppressions`;
- `bun run check:generated`;
- `bun run build:all`;
- `bun run check:plugin`;
- `bun run check:versions`;
- generated diff review;
- live evidence and cleanup reconciliation.

## 18. Acceptance criteria

The release is complete only when:

1. PRD-005 is present in the scheduled baseline.
2. One minor version is assigned and synchronized.
3. `NodeFilter.font` is strict and non-empty.
4. `NodeFilter.textStyle` exposes exactly four strict branches.
5. Uniform, empty, and mixed text use one shared effective-run contract.
6. Combined font/Text Style predicates require one matching run.
7. ID/link-state matching is complete without resolution.
8. Name/key matching caches resolution, type-checks it, and fails closed on incompleteness.
9. Evidence is exact, deterministic, bounded to 50 entries per requested category, and reports complete unique counts.
10. `page_info` exposes strict `SUMMARY`, `MATCHES`, `USED`, and `AVAILABLE` branches.
11. Ordinary reads remain lightweight and compatible.
12. `USED` has explicit page/all-document scope, exact node/segment/page counts, and exact availability.
13. `AVAILABLE` has editor-session scope, rejects page IDs, and never claims installation.
14. Font results are exact-pair deduplicated, deterministic, bounded, and complete in their counts.
15. Catalog/page failures do not appear as empty or complete successes.
16. Safety, errors, guides/resources, tool descriptions, changelog, generated manifest, and plugin bundle are synchronized.
17. Focused/full/generated/plugin/version gates, red proofs, and live probes are recorded green.
18. No text write, text-path creation, public styled-segment output, variable-binding filter, or font fallback ships here.

## 19. Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Font and style predicates match different runs | High without shared runs | One effective-run conjunction and explicit negative tests |
| Unresolved styles silently hide matches | Medium | Fail closed for key/name; preserve raw-ID/link-state paths |
| Duplicate style names are treated as identity | Medium | Return every exact ID/key and document name as discovery only |
| Used fonts are mistaken for writable fonts | High | Required source, distinct scope/output, exact live availability |
| All-page scan uses current page | Medium | Explicit omission semantics and current-page red proof |
| Catalog changes during a command | Low | One snapshot per command and exact command-scoped reporting |
| Large documents exceed output bounds | High | Complete scan, bounded pairs/evidence, exact counts/truncation |
| Later writes fork font semantics | Medium | Export and test one catalog/candidate helper |

## 20. Dependencies and exclusions

### Required predecessor

PRD-005 supplies:

- result-mode unions;
- base filter validation;
- traversal roots;
- paths, counts, ordering, and truncation;
- strict legacy-key posture.

### Sibling composition

PRD-007 may land before or after this release. If present, combined typography and variable-binding predicates use PRD-005’s cross-predicate AND semantics, while typography remains same-run only within its own predicate group. Neither release may overwrite the other’s evidence fields.

### Downstream consumers

- PRD-008 reuses the run primitive for public styled-segment reads.
- Later text write/creation PRDs reuse the exact font catalog and recovery-candidate helper.

### Excluded

No mutation, font substitution, styled-segment public output, variable dependency graph, paint serialization, image metadata, or page lifecycle work belongs here.

## 21. References

- [Umbrella capability-expansion PRD](<../Figma Design Editing Capability Expansion/prd.md>)
- [Scoped Match Discovery predecessor](PRD-005-Scoped-Match-Discovery.md)
- [Direct Variable-Binding Discovery sibling](PRD-007-Direct-Variable-Binding-Discovery.md)
- [Styled-Text Read Fidelity downstream PRD](PRD-008-Styled-Text-Read-Fidelity.md)
- [Repository safety contract](../../../SAFETY.md)
- [Contributor and verification guidance](../../../CONTRIBUTING.md)
- [Figma-edit constraints](../../../skills/figma-edit/references/constraints.md)
- [Figma-edit error playbook](../../../skills/figma-edit/references/error-playbook.md)
- [Figma-edit workflows](../../../skills/figma-edit/references/workflows.md)
- [Figma-edit tool-selection guide](../../../skills/figma-edit/references/tool-selection.md)
