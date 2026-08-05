# Future Initiative: Figma Design Editing Capability Expansion

This document is the product and implementation specification for a future release of `figma-edit-mcp`. It turns the feature-gap checklist produced from the Figwright comparison into a concrete local-project design.

The goal is not to copy Figwright's tool surface. The goal is to add the useful Figma Design capabilities while preserving this project's core contract:

> **Golden Rule:** maximize **first-call correctness** (the model can compose a valid call from the tool schema and guides) and **one-round-trip recovery** (a failed call tells the model exactly how to repair it in one step).

The Figma plugin remains the trust boundary. Every write in this Initiative must continue to enforce the scope, exact-name, locked-node, instance-interior, remote-asset, permission-axis, batch-validation, and scope-root controls documented in `SAFETY.md`.

---

## Release identity

> [!IMPORTANT]
> This is a placeholder **future release**, not an assigned version. It contains five public tool renames and two public tool removals and therefore should be treated as a major API-shape release unless the project explicitly accepts a hard cutover under its existing versioning policy.

The public surface changes are:

| Change | Old tool | Future tool |
| :- | :- | :- |
| Expand | `page_info` | `page_info` with strict `SUMMARY` / `MATCHES` result modes, direct variable-binding matching, plus `USED` / `AVAILABLE` font discovery |
| Expand | `node_info` | `node_info` with one strict filter language, direct variable-binding matching, and explicit `TREE` / `MATCHES` result modes |
| Expand | `node_transform` | `node_transform` with rotation plus existing-ellipse `arcData` patches |
| Rename and expand | `node_set_auto_layout` | `node_set_layout` |
| Rename and expand | `node_set_effects` | `node_set_appearance` |
| Rename and expand | `create_frame` | `create_region` |
| Rename and expand | `instance_set_property` | `instance_set_component_properties` |
| Rename and expand | `node_group` | `node_combine` with required `GROUP` / boolean operation |
| Reshape and expand | `node_set_fill` | `node_set_fill` with canonical `fills: PaintInput[]` |
| Reshape and expand | `node_set_stroke` | `node_set_stroke` with `strokes` plus geometry |
| Remove | `instance_get_overrides` | Use `node_info` for direct-override discovery |
| Remove | `instance_set_overrides` | No equivalent source-template transfer operation |
| Add | - | `instance_swap_component` |
| Add | - | `instance_detach` |
| Add | - | `instance_remove_overrides` |
| Add | - | `node_bind_component_property` |

All other work extends existing tools without adding public names. Font discovery is an opt-in `page_info` mode, not a standalone tool. With a hard cutover, five tools are renamed, four are added, two are removed, and the release has a net increase of two tools.

**Compatibility posture:** do not expose permanent old-name aliases, aliases for removed tools, parallel legacy paint branches, or a parallel `search` predicate. They would make the model choose between two contracts for the same decision and weaken first-call correctness. Release notes and guides must provide an old-to-new tool-name table, a removed-tool migration table, old-to-new fill/stroke call-shape examples, and `node_info.filter.type` / `filter.layoutMode` migrations to strict `filter.types` / `filter.layoutModes`; every in-repo reference must change in the same release.

| Retired tool | Required migration guidance |
| :- | :- |
| `instance_set_property` | Use `instance_set_component_properties` with one exact instance and a non-empty `properties` map keyed by the identities returned in `node_info.componentProperties`. |
| `instance_get_overrides` | Use `node_info({ nodeIds: [nodeId], properties: ["mainComponent", "overrides", "componentProperties"], maxDepth: 0 })`. The read result, not a dedicated override tool, is the canonical discovery path. |
| `instance_set_overrides` | There is deliberately no one-call equivalent. Choose the operation that matches the intent: `instance_swap_component` for component identity, `instance_set_component_properties` for exposed component properties, explicit node/text/style setters for known direct edits, or `node_clone` when an independent copy of the complete source instance is acceptable. The former source-to-target hybrid transfer and its silent unsupported-field skips are removed. |
| `node_group` | Use `node_combine({ operation: "GROUP", nodes, parentId, parentNodeName, index?, name? })`. If the parent is not already present in a `page_info`/match-result path, read each input with `node_info({ nodeIds, properties: ["parent"], maxDepth: 0 })`, then read the one shared parent with `node_info({ nodeIds: [parentId], maxDepth: 1 })` to obtain its exact name and child order. The future contract no longer infers or hides the destination parent. |

---

## Source checklist and scope fidelity

This Initiative covers every complete item in the source checklist plus the explicitly approved follow-up requirements.

| # | Source item | Initiative section |
| :-: | :- | :- |
| 1 | Add search capability for `page_info` and `node_info` | Section 1 |
| 2 | Add rotation to `node_transform` | Section 2 |
| 3 | Expand `node_set_auto_layout` into `node_set_layout` with constraints | Section 3 |
| 4 | Expand `node_set_effects` into `node_set_appearance` with visibility, opacity, blend mode, and masks | Section 4 |
| 5 | Add optional `start` and `end` plus the full writable Figma text-style surface to `text_set_style` | Section 5 |
| 6 | Add `TEXT_PATH` creation to `create_text` | Section 6 |
| 7 | Add `LINE` creation to `create_shape` | Section 7 |
| 8 | Add native vector creation to `create_svg` | Section 8 |
| 9 | Add nullable `codeSyntax` updates to `variable_manage` | Section 10 |
| 10 | Rename `create_frame` to `create_region` and add `SECTION` and `SLICE` | Section 9 |
| 11 | Let `node_bind_variable` clear an explicit variable mode | Section 11 |
| 12 | Add `ADD_MODE` and `RENAME_MODE` to `variable_manage` | Section 10 |
| 13 | Let `variable_delete` delete a variable mode | Section 12 |
| 14 | Add `instance_swap_component` with `destructiveHint: true` | Section 13 |
| 15 | Add `instance_detach` with `destructiveHint: true` | Section 14 |
| 16 | Add nullable `node_bind_component_property` | Section 15 |
| 17 | Expand `node_rename` to rename the linked page when page scope permits | Section 17 |
| 18 | Return and accept canonical component `propertyId` values | Section 16.1 |
| 19 | Replace `instance_set_property` with `instance_set_component_properties`: multiple exact properties on one instance, including `VariableAlias`, with no multi-instance batching | Section 16.2 |
| 20 | Expose computed styled-text segments through `node_info` | Section 16.3 |
| 21 | Expand `node_set_fill` and `node_set_stroke` to full paint stacks and stroke geometry | Section 18.1 |
| 22 | Make `node_set_layout` broader than auto layout plus constraints | Section 3 |
| 23 | Add range-based content replacement to `text_set_content` | Section 5 |
| 24 | Expose intrinsic dimensions for imported and existing image paints | Section 18.2 |
| 25 | Add variable-collection rename to `variable_manage` | Section 10 |
| 26 | Add used-font and available-font discovery to `page_info` | Section 1 |
| 27 | Remove `instance_get_overrides`; use `node_info` as the canonical override read | Sections 14 and 16.2 |
| 28 | Remove `instance_set_overrides` and its source-template override-transfer workflow | Sections 14 and 16.2 |
| 29 | Add guarded `instance_remove_overrides` with `destructiveHint: true` | Section 14 |
| 30 | Add existing-ellipse arc editing to `node_transform` with strict radian fields and complete-call preflight | Section 2 |
| 31 | Replace `node_group` with `node_combine` and add `UNION`, `SUBTRACT`, `INTERSECT`, and `EXCLUDE` branches | Section 19 |
| 32 | Add run-aware font family/style and Text Style identity/link-state filtering to `NodeFilter` | Section 1 |
| 33 | Add exact-ID direct variable-binding filtering to `NodeFilter` as a node-centric complement to `variable_list` consumer discovery | Section 1 |

The formerly unfinished line **"Expand `variable_manage` to include"** is resolved by item 25: variable-collection rename. It no longer remains an open question.

### Explicit non-goals

- No tool may get, set, or depend on the current Figma selection.
- No implicit-current-page write behavior.
- No page creation, page deletion, or dedicated page rename tool. Page rename is deliberately absorbed into `node_rename` and is permitted only for the page that is the active page-scope root.
- No new standalone `search_nodes`, `scan_text_nodes`, `scan_nodes_by_types`, `set_visible`, `set_opacity`, `set_blend_mode`, `set_mask`, `set_constraints`, `rotate_nodes`, `create_section`, `create_slice`, `create_line`, `create_vector`, `set_variable_code_syntax`, `add_variable_mode`, or `rename_variable` tools.
- No standalone font-consumer or Text-Style-consumer search tool. Use `node_info` or `page_info` `MATCHES` with `filter.font` or `filter.textStyle`.
- No standalone variable-consumer search tool and no parallel variable-definition filter in `variable_list` in this release. Use `node_info` or `page_info` `MATCHES` with `filter.variableBinding` for scoped direct node bindings; use `variable_list({ variableId, includeConsumers })` for the broader variable-centric inventory of node, style, alias, and reaction consumers.
- No transitive alias, style-mediated, inferred-variable, prototype-reaction, or explicit/resolved-mode matching under `NodeFilter.variableBinding`. Those are not direct node bindings and must not be presented as though the node were directly bound to the queried variable.
- No standalone `get_fonts` or `font_list` tool. Used-font and available-font discovery are explicit, mutually exclusive `page_info.fontDiscovery` modes.
- No standalone `import_image`, `get_image_dimensions`, collection-rename, fill-stack, stroke-stack, or text-range tool. These capabilities extend `node_set_fill`, `node_set_stroke`, `node_info`, `variable_manage`, and the existing text tools.
- No separate `set_text_range` or multiple-range array for one text node. `text_set_content` retains its existing batch across distinct nodes, with at most one optional range per batch item.
- No compatibility aliases or hidden dispatcher routes for `instance_set_property`, `instance_get_overrides`, or `instance_set_overrides`.
- No source-template operation that swaps a target to a source instance's component and then heuristically replays arbitrary direct overrides. Callers must select the explicit component, property, node-edit, or clone operation that matches their intent.
- No multi-instance batching in `instance_set_component_properties`; one call may update multiple properties on exactly one instance.
- No selective direct-override reset in `instance_remove_overrides`; the operation removes all direct overrides from the named instance while leaving inherited overrides untouched.
- No standalone `node_set_arc` or generalized `node_set_shape_geometry` tool. Existing-ellipse arc edits are an optional, type-checked `node_transform.arcData` patch; `create_shape` remains creation-only.
- No selection-based convenience defaults copied from Figwright.
- No standalone `node_boolean_operation`, `node_union`, `node_subtract`, `node_intersect`, or `node_exclude` tools. Grouping and the four native boolean operations are required `node_combine.operation` values.
- No branch that changes `booleanOperation` on an existing `BOOLEAN_OPERATION` node. This release creates structural combinations; it does not silently reinterpret an existing result.
- No slot or page-lifecycle work beyond the instance override reset specified in Section 14.
- No general transaction or rollback system. Each handler must preflight all predictable failures before mutation and retain the existing partial-failure disclosure rules for unexpected Figma API failures.

---

## Product decisions

> [!NOTE]
> **D1 - Consolidate by user decision, not by Figma setter.** Rotation belongs to transform, constraints belong to layout, layer visibility/opacity/blending/masking belong to appearance, and mode maintenance belongs to variable management. A thin tool per property would increase tool-selection ambiguity without introducing a new model decision.

> [!NOTE]
> **D2 - Use strict mode-specific contracts.** Multi-purpose tools must publish discriminated input branches or equivalent strict refinements. Fields that do not apply to the selected action or node type are rejected at the MCP boundary, not ignored by the plugin.

> [!NOTE]
> **D3 - Preserve explicit discovery.** Match traversal scopes come from explicit page IDs, explicit root node IDs, or the connected editable scope. Creation always has an explicit and exact-name-verified parent or source node. No branch reads `figma.currentPage.selection`.

> [!NOTE]
> **D4 - Read back the result.** Every write returns the resulting values needed to verify the mutation. Success payloads must not merely say `success: true` when an exact resulting value, new node ID, canonical property key, remaining mode list, or before/after component identity is available.

> [!NOTE]
> **D5 - Validate the complete call before the first setter.** Consolidated tools can carry several fields. Handlers must resolve targets, verify names and scope, load fonts/assets, validate every supplied field and cross-field condition, and only then begin mutation. A known-invalid later field must never leave earlier fields applied.

> [!NOTE]
> **D6 - Errors are repair instructions.** New failures use the central structured-error registry. Each error identifies the failed condition, includes observed and accepted values where useful, names the discovery tool that supplies the correct identity, and gives the exact corrected call shape or prerequisite operation.

> [!NOTE]
> **D7 - Renames are hard cutovers.** `node_set_auto_layout`, `node_set_effects`, `create_frame`, `instance_set_property`, and `node_group` leave the public tool list when their replacements ship. Keeping both names would permanently charge every model call with an avoidable disambiguation decision.

> [!NOTE]
> **D8 - Text uses one optional range, not a range array.** `text_set_style` accepts paired `start` and `end` fields. One call styles either the whole node or one contiguous half-open range. Multiple independently styled ranges remain multiple calls because each range commonly carries a different styling decision and an array makes per-item error recovery less direct.

> [!NOTE]
> **D9 - Text indices are UTF-16 code-unit offsets.** This matches JavaScript and the Figma Plugin API. The plugin rejects an index that splits a surrogate pair and returns the nearest valid boundaries. It never silently rounds an index.

> [!NOTE]
> **D10 - Masking receives a propagation guard.** Changing `isMask` can change the rendering of subsequent siblings, not only the target node. A mask write is allowed only when the containing parent and all potentially affected siblings are inside the connected edit scope and the parent is a bounded group-like container.

> [!NOTE]
> **D11 - Text-path creation preserves the source path.** `create_text` clones the verified path node and converts the clone with `figma.createTextPath`. The source node is not consumed. This avoids hiding an irreversible source-node conversion inside a generally non-destructive creation tool.

> [!NOTE]
> **D12 - Variable deletion gets an explicit target discriminator.** Adding mode deletion to the current optional-field schema could turn an omitted `modeId` into collection deletion. The future schema requires `target.kind` to be `VARIABLES`, `COLLECTION`, or `MODE`.

> [!NOTE]
> **D13 - Swap, detach, and override removal remain separate tools.** They have different intent, preconditions, safety gates, identity behavior, recovery paths, and result shapes. Combining them would weaken both first-call correctness and one-round-trip recovery.

> [!NOTE]
> **D14 - Swap, detach, and override removal are explicitly destructive.** Detach permanently removes the component relationship. Swap preserves overrides heuristically and can drop incompatible data. Override removal discards every direct override on the target and has no automatic inverse. All three tools set `destructiveHint: true` even if the MCP SDK currently defaults omitted write hints conservatively.

> [!NOTE]
> **D15 - Region creation uses type-specific fields.** `FRAME`, `SECTION`, and `SLICE` share placement and dimensions, but only `FRAME` accepts frame/auto-layout fields, only `SECTION` accepts section fields, and `SLICE` is an export boundary rather than a visual container.

> [!NOTE]
> **D16 - The three prerequisites are P0 release gates.** Canonical component-property identity must land before component-property binding; exact one-instance component-property maps must land with the instance/component surface; and styled-text-segment reads must land before range-based text editing. A dependent feature is not complete while its prerequisite still requires an extra discovery round or an ambiguous display-name lookup.

> [!NOTE]
> **D17 - Page rename reuses `node_rename` and page scope.** Renaming a page is allowed only when that exact page is the connected page-scope root (`allowEditNode === "page"` and `scopeRootId === page.id`). Node scope never grants authority over its containing page, and no document-wide page-management permission is introduced.

> [!NOTE]
> **D18 - Layout means container, child, grid, and viewport behavior.** `node_set_layout` covers auto-layout containers, grid auto layout, child participation/placement, sizing bounds, constraints, clipping, overflow, and visual layout grids. The schema keeps these field groups explicit and the plugin validates their effective parent/mode state before any setter runs.

> [!NOTE]
> **D19 - Paint setters replace complete arrays.** `node_set_fill` and `node_set_stroke` accept ordered paint arrays and return the resulting arrays. They do not patch a paint by array index because paints have no stable item identity and a stale index can silently edit the wrong layer. Callers read the current array with `node_info`, modify it, and submit the complete replacement.

> [!NOTE]
> **D20 - Content replacement uses one guarded half-open range.** Each existing `text_set_content.text[]` item may replace the whole node or one `[start, end)` UTF-16 range. A ranged item carries the exact expected current substring so stale offsets fail before mutation, and duplicate node IDs remain forbidden.

> [!NOTE]
> **D21 - Image dimensions are metadata, not a new tool decision.** Image-paint writes return Figma's stored intrinsic pixel dimensions, and `node_info` can resolve the same metadata for existing image hashes on explicit request. Neither path resizes the target node implicitly.

> [!NOTE]
> **D22 - Collection rename is a `variable_manage` action.** Renaming keeps the collection ID, mode IDs, variable IDs, bindings, and aliases stable. A dedicated tool would add a selection decision without changing the underlying permission or identity model.

> [!NOTE]
> **D23 - Font discovery is an explicit `page_info` mode.** `fontDiscovery.source` is required and distinguishes page-scoped `USED` fonts from editor-session `AVAILABLE` fonts. `USED` scans exact `pageIds` or every document page when they are omitted; `AVAILABLE` calls `listAvailableFontsAsync()` and forbids `pageIds`. Font discovery is mutually exclusive with `resultMode: "MATCHES"` and its filter/property fields, ordinary `page_info` calls remain lightweight, and no branch reads the current page or selection.

> [!NOTE]
> **D24 - Component-property writes batch properties, not instances.** `instance_set_property` is replaced by `instance_set_component_properties`, whose single target carries one non-empty exact-key map. This matches the one-instance call unit accepted by Figma's native `setProperties()` API, eliminates ambiguous display-name lookup, and lets one already-decided set of property changes share one preflight and one readback. A target array or multi-instance envelope is forbidden because it would add partial-success semantics and make recovery materially harder.

> [!NOTE]
> **D25 - The dedicated override read and source-template transfer tools are removed.** `node_info` already exposes the exact direct-override manifest needed for discovery, so `instance_get_overrides` duplicates a broader canonical read. `instance_set_overrides` combines component swapping, component-property transfer, and arbitrary descendant-field replay into a hybrid whose final state depends on Figma compatibility and silent field-level skips. There is no compatibility alias or hidden equivalent; callers choose the explicit operation matching their intent.

> [!NOTE]
> **D26 - Override removal is a guarded whole-instance reset.** `instance_remove_overrides` targets exactly one named instance, compares its current direct-override manifest with the caller's expected manifest, and only then calls Figma's native `removeOverrides()`. It removes all direct overrides, never inherited overrides, and does not pretend to offer selective reset or restoration data. The stale-state guard and complete corrected retry preserve one-round-trip recovery for a destructive operation.

> [!NOTE]
> **D27 - Existing ellipse arc editing is absorbed into `node_transform`.** `arcData` is an optional strict patch that can be combined with position, size, and rotation in one call. This avoids a new tool-selection decision and supports common size-plus-arc edits, but it requires unusually explicit unit wording: `rotation` is in degrees while `arcData.startingAngle` and `endingAngle` are in radians. The handler validates the complete transform and merged arc plan before the first mutation; consolidation does not imply an API transaction.

> [!NOTE]
> **D28 - Group and boolean creation become one required structural-combine decision.** `node_group` is hard-replaced by `node_combine`, with required `operation: "GROUP" | "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE"`. Every branch consumes the same explicit ordered node list and exact parent/index plan, performs the same complete structural preflight, and returns one normalized container/child result. The combined tool takes the broadest static annotation (`destructiveHint: true`) because MCP annotations cannot vary by operation. No optional/default operation is allowed: omitting `operation` must fail rather than silently creating a plain group.

> [!NOTE]
> **D29 - Matching predicates and result shape are orthogonal.** `page_info` and `node_info` share one strict `filter` predicate with node-level `name`, `characters`, `types`, `layoutModes`, and `variableBinding` plus run-aware `font` and `textStyle`; there is no parallel public `search` object. `node_info.resultMode` explicitly selects `TREE` or `MATCHES`, while `page_info.resultMode` selects `SUMMARY` or `MATCHES`. Existing ordinary reads retain their default result modes. `MATCHES` requires a non-empty filter and is the only branch that accepts top-level `maxResults`, so output shape never changes implicitly because of a supplied predicate. When `font` and `textStyle` are combined, one text run must satisfy both; independent runs may not produce a false node-level match.

> [!NOTE]
> **D30 - Variable-binding matching is exact, direct, and node-centric.** `NodeFilter.variableBinding` accepts exact variable IDs plus optional bindable fields and matches raw direct aliases owned by the candidate node. It returns the node path, requested properties, and exact binding-location evidence needed for targeted migration or verification. It does not follow variable-alias chains, infer variables from literal values, treat a style consumer as a direct node binding, inspect prototype references, or equate collection modes with bindings. `variable_list({ variableId, includeConsumers })` remains the variable-centric impact/discovery path for node, style, alias, and reaction consumers; the two tools share direct-binding extraction but answer different questions.

---

## Priority and ownership

| Section | Capability | Priority | Primary implementation areas |
| :-: | :- | :-: | :- |
| 1 | Filtering and match discovery in `page_info` / `node_info`, including direct variable bindings, plus font discovery in `page_info` | P0 | `src/mcp_server/tools/page.ts`, `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/nodeReaders.ts`, shared variable-binding extractor |
| 2 | Transform rotation and existing-ellipse arc geometry | P0 | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/nodeModifiers.ts`, shared `ArcData` schema/validator |
| 3 | Container, child, grid, and viewport layout | P0 | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/layoutHandlers.ts`, dispatcher gates |
| 4 | Appearance and mask containment | P0 | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/stylingHandlers.ts`, dispatcher gates |
| 5 | Full text style plus guarded range content replacement | P0 | `src/mcp_server/tools/text.ts`, `figma_plugin/handlers/textHandlers.ts` |
| 6-9 | Missing node creation paths | P1 | `src/mcp_server/tools/create.ts`, `figma_plugin/handlers/nodeCreators.ts`, `vectorHandlers.ts` |
| 10-12 | Variable maintenance | P0 | `src/mcp_server/tools/variable.ts`, `figma_plugin/handlers/variableHandlers.ts` |
| 13-15 | Instance/component operations, including guarded override removal | P0 | `src/mcp_server/tools/instance.ts`, `component.ts`, `figma_plugin/handlers/componentHandlers.ts` |
| 16 | Required prerequisites: canonical property IDs, exact one-instance property maps, styled text segments | P0 | component/instance/node read tools and handlers |
| 17 | Page rename through `node_rename` | P0 | `src/mcp_server/tools/node.ts`, `figma_plugin/src/main.ts`, `nodeModifiers.ts` |
| 18 | Paint stacks, stroke geometry, and image dimensions | P0 | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/stylingHandlers.ts`, `nodeReaders.ts` |
| 19 | Group and boolean structural combinations | P0 | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/nodeModifiers.ts`, dispatcher structural gates |
| 20 | Safety, docs, generated output, rollout | P0 | `SAFETY.md`, guides/resources, tests, generated `figma_plugin/code.js` |

---

## 1. Filtering and match discovery in `page_info` / `node_info` and font discovery in `page_info` (P0)

### Problem

`node_info` can recursively return known roots and currently filters only exact `type` and `layoutMode` values. It cannot directly find nodes by name substring, text content, typography identity, or direct variable binding, and it returns a pruned tree rather than a compact flat match list. `page_info` lists pages and, for explicit IDs, top-level children; it cannot search across selected pages.

Figwright addresses these jobs with three tools: `search_nodes`, `scan_text_nodes`, and `scan_nodes_by_types`. The local project can cover all three decisions without adding three names.

The local `variable_list({ variableId, includeConsumers })` already starts from one or more exact variable IDs and returns a broader variable-centric inventory, including node, style, alias, and prototype-reaction consumers. It does not provide rooted subtree matching, combine variable use with other node predicates, return document paths/requested node properties, or produce the pruned-tree result needed for targeted migration. `NodeFilter.variableBinding` complements that read rather than replacing it.

### Contract

Replace the loose legacy filter shape with one shared strict predicate object:

```ts
type StringMatch = {
  value: string;
  match?: "CONTAINS" | "EXACT"; // default CONTAINS
  caseSensitive?: boolean;       // default false
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
  variableIds: string[]; // exact non-empty IDs; OR semantics
  fields?: VariableBindingField[]; // strict non-empty enum; OR semantics
};

type VariableBindingLocation =
  | {
      source: "NODE";
      field: Exclude<VariableBindingField, "componentProperties">;
    }
  | {
      source: "COMPONENT_PROPERTY_DEFINITION";
      field: "componentProperties";
      propertyId: string; // exact canonical property key
    }
  | {
      source: "INSTANCE_COMPONENT_PROPERTY";
      field: "componentProperties";
      propertyId: string; // exact canonical property key
    };

type NodeFilter = {
  name?: StringMatch;
  characters?: StringMatch; // TEXT and TEXT_PATH only
  font?: FontFilter; // effective font on at least one text run
  textStyle?: TextStyleFilter; // linked Text Style identity on at least one text run
  variableBinding?: VariableBindingFilter; // direct aliases owned by the node
  types?: NodeType[]; // exact Figma node-type names
  layoutModes?: Array<"NONE" | "HORIZONTAL" | "VERTICAL" | "GRID">;
};
```

Rules:

- `filter` is optional only for `node_info` `TREE` mode. Whenever it is present, at least one of `name`, `characters`, `font`, `textStyle`, `variableBinding`, non-empty `types`, or non-empty `layoutModes` is required.
- `font` is strict and requires at least one of `family` or `style`. If both are supplied, the same effective text run must satisfy both. Exact family/style matching should be explicit for identity-sensitive follow-up edits; `CONTAINS` remains useful for discovery such as every style containing `"Bold"`.
- Font matching uses the effective family/style stored on the run and does not require the pair to appear in `AVAILABLE` font discovery. Used-but-unavailable fonts remain searchable so missing-font audits are possible.
- `textStyle` is a strict discriminated union. `ID` compares the raw non-empty `textStyleId`; `KEY` compares the exact resolved library key; `NAME` uses `StringMatch`; and `LINK_STATE` distinguishes a non-empty style link from an unlinked empty ID. Fields from another branch are rejected.
- `font` and `textStyle` apply only to `TEXT` and `TEXT_PATH`. A node matches when at least one effective run satisfies every supplied run-aware predicate. If both predicates are present, a font on one run and a Text Style on another cannot satisfy the filter.
- For uniform non-empty or empty text, use the concrete node-level `fontName` and `textStyleId` as one effective run. If either required field is `figma.mixed`, call `getStyledTextSegments()` once with the minimal union of `fontName` and `textStyleId` needed by the filter.
- Resolve distinct non-empty style IDs at most once per command with `getStyleByIdAsync()` when `KEY` or `NAME` matching requires the `TextStyle` object. Resolve only candidate runs that already satisfy node-level predicates and any supplied font predicate; require resolved type `TEXT`. `ID` and `LINK_STATE` matching do not require resolution.
- A `KEY` or `NAME` traversal that cannot resolve a candidate run's linked style fails closed because silently treating it as a nonmatch would claim false completeness. The error reports unresolved IDs and completed scope and directs an ID-aware caller to the exact `by: "ID"` shape.
- Text Style name matching is discovery, not identity: duplicate names all match and every result returns the exact IDs/keys that matched. Text Style linkage also does not assert visual conformance; direct formatting can differ while the run retains the same `textStyleId`.
- `variableBinding` is strict. `variableIds` is required, non-empty, and duplicate-free; every ID is an exact case-sensitive identity obtained from `variable_list` or a prior `node_info.properties.boundVariables` read. `fields`, when present, is non-empty and duplicate-free. Names, keys, collection names, resolved values, and link-state shortcuts are not accepted as variable identities in this release.
- A node satisfies `variableBinding` when at least one raw direct alias has a `variableId` in `variableIds` and, when `fields` is present, its normalized field is in `fields`. Values within each array are ORed; the identity and field conditions are ANDed.
- Direct-binding extraction covers the candidate node's complete `boundVariables` shape, including scalar node fields, text-field alias arrays, fills, strokes, effects, layout grids, text-range fills, and component-property maps. It also normalizes direct `componentPropertyDefinitions[*].boundVariables.defaultValue` and `componentProperties[*].boundVariables.value` references into the two explicit component-property location branches.
- If a supported binding-bearing branch cannot be read or normalized, fail closed rather than returning an apparently complete result. The structured error reports the affected node/location and completed scope, and gives a narrower `node_info` retry. This completeness rule applies to binding extraction, not optional variable-object enrichment.
- Matching compares raw alias IDs and therefore remains exact even if `getVariableByIdAsync()` cannot resolve a deleted, unavailable, or remote variable object. Resolve each distinct matched ID at most once per command only to enrich evidence; resolution failure produces `resolved: false` evidence and never converts an exact raw-ID match into a nonmatch or an incomplete-result failure.
- `variableBinding` does not follow `Variable.valuesByMode` alias chains, styles bound to the variable, nodes that merely consume such a style, `inferredVariables`, reaction/action expressions, or `explicitVariableModes`/`resolvedVariableModes`. Use `variable_list({ variableId, includeConsumers: "page" | "document", pageId? })` for the broader variable-centric node/style/alias/reaction inventory. An exact variable value or rename updates through the stable binding ID without requiring this filter; the filter is for impact inspection, targeted rebinding, and post-migration verification.
- `variableBinding` is a node-level predicate. When combined with `font` or `textStyle`, the candidate node must satisfy both predicate groups, but the contract does not claim that the binding and typography match occur on the same text run. Callers needing range-level binding context request styled-text segments after locating the node.
- Different predicates are ANDed. Values within `types`, `layoutModes`, `variableBinding.variableIds`, and `variableBinding.fields` are ORed.
- Empty query strings and empty arrays are rejected.
- Unknown node-type or layout-mode strings are rejected with accepted enum values and a closest-match suggestion.
- The public schemas do not expose a parallel `search` field. Unknown-key validation rejects it and directs the caller to `resultMode: "MATCHES"` plus `filter`.
- Matching is recursive and uses one predicate evaluator for filtered trees and match lists in both tools.
- `maxResults` controls returned match output, not predicate evaluation. It is top-level, valid only with `resultMode: "MATCHES"`, and is an integer from 1 through 500 with a default of 100.
- Match traversal completes the selected scope so `matchedCount`, `returnedCount`, and scan counts remain exact. `truncated` means `matchedCount > returnedCount`; it is a successful bounded result, not an error.
- Match results always include `id`, `name`, `type`, and `path`. Requested `properties` are included only for matching nodes. A font, Text Style, or variable-binding predicate also adds `matchEvidence` containing the exact font pairs, style identities, or direct variable-binding locations that caused the match. Evidence is deduplicated in first traversal order, reports exact unique counts, is capped at 50 entries per category, and sets `evidenceTruncated: true` when any complete category exceeds that cap.
- When `filter.font` is supplied, every matching node requires both `fontNames` and `matchedFontNameCount`. When `filter.textStyle` is supplied, it requires both `textStyles` and `matchedTextStyleCount`. Omit the unrelated evidence category unless its predicate was also supplied.
- When `filter.variableBinding` is supplied, every matching node requires `variableBindings` and `matchedVariableBindingCount`. A binding entry is unique by `{ variableId, location }`; the exact count covers all matching entries even when the returned evidence is capped. Omit variable evidence when the predicate was not supplied.
- This hard-cutover release replaces legacy `filter.type` and `filter.layoutMode` with strict plural `filter.types` and `filter.layoutModes`; no aliases or silently ignored filter keys remain.

### `node_info` result modes

```ts
type NodeInfoInput =
  | {
      resultMode?: "TREE"; // default
      nodeIds?: string[];
      filter?: NodeFilter;
      properties?: string[];
      maxDepth?: number;
      concurrencyLimit?: number;
      maxResults?: never;
    }
  | {
      resultMode: "MATCHES";
      nodeIds?: string[];
      filter: NodeFilter;
      properties?: string[];
      maxDepth?: number;
      concurrencyLimit?: number;
      maxResults?: number; // integer 1..500, default 100
    };
```

- `TREE` without a filter preserves the existing recursive subtree read and `nodes` output.
- `TREE` with a filter returns a pruned hierarchy. A nonmatching ancestor remains when it leads to a matching descendant; requested properties and `matchEvidence` are attached only to matching nodes.
- `MATCHES` returns only matching nodes as a flat list in document order. Paths preserve the ancestry that a flat result omits.
- If `nodeIds` is omitted in either branch, use the connected editable scope root exactly as ordinary `node_info` does.
- A node-read-only session with no roots and no editable scope returns a structured error instructing the model to obtain roots from `page_info`; it must not fall back to the current page.
- Multiple roots are deduplicated by ID. A descendant included under two requested roots appears once, under the first root in request order.
- Existing unfiltered `TREE` behavior and its `nodes` output remain byte-for-byte compatible except for additive output-schema fields.

`MATCHES` output:

```ts
{
  matches: Array<{
    id: string;
    name: string;
    type: string;
    path: Array<[type: string, id: string, name: string]>;
    properties?: Record<string, unknown>;
    matchEvidence?: {
      fontNames?: Array<{ family: string; style: string }>;
      matchedFontNameCount?: number;
      textStyles?: Array<
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
          }
      >;
      matchedTextStyleCount?: number;
      variableBindings?: Array<
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
          }
      >;
      matchedVariableBindingCount?: number;
      evidenceTruncated?: boolean;
    };
  }>;
  matchedCount: number;
  returnedCount: number;
  truncated: boolean;
  scannedNodeCount: number;
  missingNodeIds?: string[];
}
```

### `page_info` result modes

```ts
type PageInfoReadInput =
  | {
      resultMode?: "SUMMARY"; // default
      pageIds?: string[];
      filter?: never;
      properties?: never;
      maxResults?: never;
    }
  | {
      resultMode: "MATCHES";
      pageIds?: string[]; // omitted means every page
      filter: NodeFilter;
      properties?: string[];
      maxResults?: number; // integer 1..500, default 100
    };
```

- `SUMMARY` preserves existing `page_info()` and `page_info({ pageIds })` behavior. It performs no recursive match traversal and forbids filter/match-only fields.
- In `MATCHES`, `pageIds` limits traversal to exact pages. Omission means document-wide matching, not current page.
- Because `page_info` and `node_info` share `NodeFilter`, cross-page `MATCHES` supports the same font, Text Style, and direct variable-binding predicates and returns the same per-node evidence; it does not introduce a second identity-filter contract.
- Dynamic-page access loads pages one at a time and emits progress before yielding, following the existing page-scan timeout discipline.
- A failed page load fails closed for a result that claims document completeness. The error reports completed and failed page IDs so the model can retry only failed pages.
- Returned matches are capped globally across the selected pages in document order, then grouped by page. Omit page groups with no returned matches.

`MATCHES` output:

```ts
{
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
}
```

### Coverage equivalence

| Desired job | Consolidated call |
| :- | :- |
| Pruned hierarchy | `node_info({ resultMode: "TREE", filter: { types: ["FRAME"], layoutModes: ["HORIZONTAL"] } })` |
| Name search | `node_info({ resultMode: "MATCHES", filter: { name: { value: "Button" } } })` |
| Type scan | `node_info({ resultMode: "MATCHES", filter: { types: ["COMPONENT", "COMPONENT_SET"] } })` |
| Text scan | `node_info({ resultMode: "MATCHES", filter: { types: ["TEXT"] }, properties: ["characters", "fontSize", "fontName"] })` |
| Text-content search | `node_info({ resultMode: "MATCHES", filter: { characters: { value: "Checkout" } }, properties: ["characters"] })` |
| Font-family/style search | `node_info({ resultMode: "MATCHES", filter: { font: { family: { value: "Inter", match: "EXACT" }, style: { value: "Bold", match: "CONTAINS" } } } })` |
| Exact Text Style consumers | `node_info({ resultMode: "MATCHES", filter: { textStyle: { by: "ID", id: "S:123" } } })` |
| Unstyled text audit | `node_info({ resultMode: "MATCHES", filter: { textStyle: { by: "LINK_STATE", state: "UNLINKED" } } })` |
| Direct consumers of exact variables | `node_info({ resultMode: "MATCHES", filter: { variableBinding: { variableIds: ["VariableID:123", "VariableID:456"] } } })` |
| Fill consumers of an exact variable | `node_info({ resultMode: "MATCHES", filter: { variableBinding: { variableIds: ["VariableID:123"], fields: ["fills"] } }, properties: ["fills", "boundVariables"] })` |
| Variable migration inside one component subtree | `node_info({ resultMode: "MATCHES", nodeIds: ["123:456"], filter: { variableBinding: { variableIds: ["VariableID:old"] } }, properties: ["boundVariables"] })` |
| Cross-page search | same `resultMode: "MATCHES"` plus `filter` through `page_info` |

### Filtering and matching acceptance criteria

- Neither result mode reads current selection or silently uses current page.
- Name matching is case-insensitive substring by default.
- A filter combining node-level predicates applies the documented AND/OR semantics identically in tree and match-result traversal.
- Uniform, empty, and mixed text nodes apply font and Text Style predicates correctly. Combined font/style predicates match one run, never two unrelated runs.
- Font evidence returns the exact deduplicated family/style pairs and unique count that matched. Text Style evidence returns the exact unique count plus linked IDs and, when resolved, name/key/remote metadata; unlinked matches are explicit.
- Text Style ID and link-state matching remain complete without style-object resolution. Name/key matching fails closed on unresolved style IDs, and duplicate style names return every exact matching identity.
- A Text Style match means “linked to this identity,” never “effective properties equal the style object.”
- Variable-binding matching uses exact raw IDs, optional exact field narrowing, and complete direct-binding extraction across ordinary node fields plus component-property definitions/values. It returns deterministic structured locations and remains complete when optional variable-object enrichment is unavailable.
- A variable-binding match means “this node directly owns this alias at this location.” It never means the variable is reached transitively through another variable, a shared style, an inferred literal value, a prototype reference, or a collection mode.
- For the same page or document scope and IDs, `NodeFilter.variableBinding` and the direct-binding portion of `variable_list` consumer scanning use one shared extractor and cannot disagree. `variable_list` continues to add style, alias, and reaction consumer categories that `NodeFilter` deliberately excludes.
- `node_info` emits a strict `TREE`/`MATCHES` union; `page_info` emits a strict `SUMMARY`/`MATCHES` union plus the two font branches.
- `MATCHES` requires a non-empty filter. `TREE` forbids `maxResults`; `SUMMARY` forbids `filter`, `properties`, and `maxResults`.
- The removed `search` field and legacy singular filter keys fail with a complete corrected-call example.
- A result capped by `maxResults` reports exact `matchedCount`, `returnedCount`, scan counts, and `truncated: true`.
- Ordinary unfiltered `node_info` tree reads and `page_info` summary reads remain byte-for-byte compatible except for additive output-schema fields.
- Schema descriptions explain `TREE` versus `MATCHES`, `SUMMARY` versus `MATCHES`, and when page-wide versus rooted matching is appropriate.

### Font-discovery problem

Text editing requires two font sets that must not be conflated:

1. **Used fonts** are exact family/style pairs present in text on one or more document pages. They help preserve existing typography and detect inconsistent or unavailable faces.
2. **Available fonts** are exact family/style pairs that Figma exposes to the current editor session and can attempt to load for a write. A font may be used in the file but unavailable now, or available without being used.

Figwright's `get_fonts` covers only used fonts on an implicit current page. This project instead makes the source and scope explicit and keeps discovery within the existing document/page read surface.

`filter.font` answers a different question: which exact text nodes contain a matching effective font run? It returns node identities and bounded match evidence through `TREE`/`MATCHES`. `fontDiscovery.source: "USED"` returns an aggregate page-scoped inventory, while `AVAILABLE` returns assignable editor-session pairs. Tool descriptions and guides must keep these three decisions distinct.

### Font-discovery contract

Add two strict, opt-in branches to the future `page_info` mode union:

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

Rules:

- `fontDiscovery.source` is required. `USED` and `AVAILABLE` are different result branches, not flags that can be combined.
- `fontDiscovery` is mutually exclusive with `resultMode`, `filter`, match-only `properties`, and top-level `maxResults`.
- Ordinary `page_info()` and `page_info({ pageIds })` retain their existing lightweight behavior. Neither font list is computed or returned without `fontDiscovery`.
- `query`, when present, must be non-empty and performs a case-insensitive substring match across family and style.
- Results are normalized, deduplicated by exact `{ family, style }` pair, deterministically sorted, bounded by `maxResults`, and accompanied by exact match/return counts and `truncated`. `maxResults` limits only the returned pair array; it does not short-circuit traversal or make usage/ranking counts partial.
- Existing read annotations remain `readOnlyHint: true` and `openWorldHint: true`.

`USED` behavior:

- Scan only the exact `pageIds`, or every document page when `pageIds` is omitted. Omission never means the current page.
- Load pages one at a time and emit progress under the existing page-scan timeout discipline.
- Traverse `TEXT` and `TEXT_PATH` nodes. Uniform text contributes one segment; mixed text is segmented with `getStyledTextSegments(["fontName"])`.
- Count a pair once per containing text node in `textNodeCount`, even when it occurs in several runs. Count every corresponding styled run in `segmentCount`. Apply the same definitions to each `pageUsage` entry.
- Cross-check every used pair against a live `listAvailableFontsAsync()` catalog and return `available: boolean` from exact family-and-style equality.
- Sort by descending `textNodeCount`, then descending `segmentCount`, then family and style.
- Fail closed if any requested page cannot be loaded. The structured error reports completed and failed page IDs instead of returning an apparently complete inventory.

`AVAILABLE` behavior:

- Call `listAvailableFontsAsync()` live and return exact family/style pairs accessible in the current editor session.
- Return `scope: "EDITOR_SESSION"` and explicitly state that the result cannot install or download a missing font.
- Reject `pageIds`; availability is not page-scoped.
- Sort by family and style.

### Font-discovery outputs

```ts
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

The broadened `page_info` title must be **Get Document and Page Information**. Its description must name `SUMMARY` reads, `MATCHES` traversal, used-font discovery, and available-font discovery, and must explain the `USED` versus `AVAILABLE` distinction at tool-selection time.

### Text-write integration and recovery

- Every text creation, content, and style path validates and loads the exact requested `{ family, style }` pair before the first setter. A supplied `fontName` is never silently replaced with Inter, another style, or a close family.
- The existing `create_text` behavior when no font is supplied remains separately and explicitly documented: `fontWeight` maps to an Inter style, and omission of both fields requests Inter Regular. Those explicit defaults must still load successfully; failure does not authorize another fallback.
- `FONT_NOT_AVAILABLE` returns the requested pair, exact styles available in that family, bounded close-family candidates, and the exact recovery call `page_info({ fontDiscovery: { source: "AVAILABLE", query: ... } })`.
- When exactly one correction is unambiguous, the error also returns the complete corrected write arguments. Otherwise it supplies concrete candidates without choosing for the caller.
- Mode-conflict and invalid-scope errors include the complete corrected `page_info` branch for one-step retry.

### Font-discovery acceptance criteria

- Emitted JSON Schema exposes mutually exclusive `SUMMARY`, `MATCHES`, `USED`, and `AVAILABLE` branches with correct required and forbidden fields.
- Ordinary direct `page_info` calls do no catalog or document traversal work beyond their existing behavior.
- `USED` never reads `figma.currentPage`; omitted `pageIds` means all document pages and explicit IDs constrain the scan exactly.
- Uniform and mixed-font nodes produce the specified distinct-node, segment, and per-page counts.
- The live exact-pair availability cross-check distinguishes used-but-unavailable fonts from assignable fonts.
- `AVAILABLE` rejects page scope, declares editor-session scope, and never claims to install a font.
- Filtering, deduplication, ordering, bounds, counts, and truncation are deterministic in both branches.
- A page-load failure cannot produce an apparently complete `USED` result and reports a one-step retry over failed page IDs.
- An unavailable requested font never silently falls back and returns candidates plus a corrected discovery call.
- The capability adds no public tool, and `page_info` retains its read-only/open-world annotations.

---

## 2. Rotation and existing-ellipse arcs in `node_transform` (P0)

### Contract

Expand the existing transform with one optional absolute rotation field and one optional ellipse-only arc patch:

```ts
type ArcData = {
  startingAngle: number;
  endingAngle: number;
  innerRadius: number;
};

type ArcDataPatch = {
  startingAngle?: number; // radians; 0 = right/x-axis
  endingAngle?: number;   // radians; clockwise from startingAngle
  innerRadius?: number;   // 0..1
};

type NodeTransformInput = {
  nodeId: string;
  nodeName: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;      // Figma degrees
  arcData?: ArcDataPatch; // existing ELLIPSE only
};
```

Rules:

- The call must include at least one of `x`, `y`, `width`, `height`, `rotation`, or `arcData`.
- `arcData` is recursively strict and must contain at least one of its three fields. Unknown keys and `{}` are rejected at the MCP boundary.
- All numeric inputs must be finite. Width and height remain positive. `innerRadius` is constrained to `0..1` in both schema and plugin validation.
- `rotation` is absolute, not a delta, matching the existing absolute transform semantics.
- The tool and field descriptions must state the unit split directly: `rotation` uses **degrees**; `arcData.startingAngle` and `endingAngle` use **radians**. Include concrete constants (`Math.PI` = approximately `3.14159`, `2 * Math.PI` = approximately `6.28319`) and never infer degrees from a large-looking arc value or silently convert/normalize before Figma.
- Rotation uses Figma's top-left pivot behavior. Arbitrary pivot-point matrix transforms are out of scope.
- The handler verifies that the target exposes a writable numeric `rotation` property before mutation.
- When `arcData` is present, require the exact target type `ELLIPSE` before any mutation. When it is absent, all existing transform-compatible node types remain eligible.
- Read the target's current complete `arcData`, merge only supplied patch fields, validate the merged object, then assign the complete object once. Omitted arc fields preserve their current values and never reset to creation defaults.
- Reuse one strict arc-field schema and value validator with `create_shape`. Creation retains explicit defaults of `0`, `2 * Math.PI`, and `0`; existing-node editing always merges over live state. Do not share those different omission semantics accidentally.
- Existing auto-layout-controlled `x`/`y` checks apply only when those fields are supplied. A rotation-only call must not fail because position is layout-controlled unless Figma itself disallows rotation for that node.
- Resolve the target, verify scope/name/locks, snapshot all requested state, validate support for every supplied affine field, validate auto-layout effects, and validate the merged arc before the first setter. A wrong target type or invalid arc patch must not partially apply a valid move, resize, or rotation.
- After preflight, use one deterministic and tested mutation order: resize, rotation, `x`/`y`, then one complete `arcData` assignment. Setting `x`/`y` after resize/rotation preserves their meaning as requested final absolute coordinates; arc geometry does not resize the ellipse bounds.
- This is a consolidated call, not an API transaction. If an unexpected Figma failure occurs after any mutation, read back all transform and arc state and return `partialMutation: true`, `failedFieldGroup`, and exact `before`, `requested`, and `resulting` values. Do not silently retry or claim rollback.
- Read back `rotation` with `x`, `y`, `width`, and `height`. When `arcData` was supplied, also return `previousArcData` and Figma's exact resulting `arcData`.
- `node_info({ nodeIds: [nodeId], properties: ["arcData"], maxDepth: 0 })` remains the canonical independent verification read.

Annotations remain:

```ts
{
  idempotentHint: true,
  openWorldHint: true
}
```

Output:

```ts
{
  id: string;
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number; // Figma-normalized degrees
  previousArcData?: ArcData;
  arcData?: ArcData; // Figma readback; present when requested
  warnings?: string[];
  partialMutation?: boolean;
  failedFieldGroup?: "RESIZE" | "ROTATION" | "POSITION" | "ARC_DATA";
}
```

Combined example: `rotation` is `45` degrees while the arc ends at `Math.PI` radians.

```json
{
  "nodeId": "10:24",
  "nodeName": "Progress ring",
  "width": 240,
  "height": 240,
  "rotation": 45,
  "arcData": {
    "startingAngle": 0,
    "endingAngle": 3.141592653589793,
    "innerRadius": 0.65
  }
}
```

### Acceptance criteria

- Position/size-only, rotation-only, arc-only, and combined size/rotation/arc calls work.
- An empty transform fails at schema validation with the accepted field list.
- An empty or unknown-key arc patch fails at schema validation; invalid radius and non-finite values fail before mutation.
- `arcData` on a non-ellipse returns `ARC_TARGET_NOT_ELLIPSE` before any valid position, size, or rotation field changes. Error details include the observed type, required type, and exact prerequisite `node_info({ resultMode: "MATCHES", filter: { types: ["ELLIPSE"] }, properties: ["arcData"] })`. When at least one non-arc mutation remains, also include a complete valid transform-only retry with `arcData` omitted; never emit an empty transform retry for an arc-only failure.
- Omitted arc fields retain their live values, including in combined resize/rotation calls.
- Degree rotation and radian arc angles are independently asserted in emitted-schema descriptions and handler tests.
- Unsupported transform capabilities fail before any position, size, rotation, or arc field is changed.
- An injected unexpected failure discloses exact partial state and the failed field group.
- Repeating the same call is idempotent.

---

## 3. `node_set_layout`: container, child, grid, and viewport layout (P0)

### Rename and contract

Replace `node_set_auto_layout` with `node_set_layout`. Preserve its current flat auto-layout fields and broaden the tool to the following writable layout groups:

```ts
type GridTrackInput =
  | { type: "HUG" }
  | { type: "FLEX"; value?: number }
  | { type: "FIXED"; value: number };

type LayoutGridInput =
  | {
      pattern: "GRID";
      sectionSize: number;
      visible?: boolean;
      color?: RGBA;
      boundVariables?: { sectionSize?: VariableAlias };
    }
  | {
      pattern: "ROWS" | "COLUMNS";
      alignment: "MIN" | "MAX" | "STRETCH" | "CENTER";
      gutterSize: number;
      count: number | "AUTO"; // "AUTO" maps to Figma's Infinity value
      sectionSize?: number;
      offset?: number;
      visible?: boolean;
      color?: RGBA;
      boundVariables?: {
        sectionSize?: VariableAlias;
        count?: VariableAlias;
        offset?: VariableAlias;
        gutterSize?: VariableAlias;
      };
    };

type NodeSetLayoutInput = {
  nodeId: string;
  nodeName: string;

  // Auto-layout container fields. Existing fields keep their current names.
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
  layoutWrap?: "NO_WRAP" | "WRAP";
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "MAX" | "CENTER" | "BASELINE";
  counterAxisAlignContent?: "AUTO" | "SPACE_BETWEEN";
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  itemSpacing?: number;
  counterAxisSpacing?: number | null;
  itemReverseZIndex?: boolean;
  strokesIncludedInLayout?: boolean;

  // Sizing and participation in a parent auto-layout container.
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
  layoutPositioning?: "AUTO" | "ABSOLUTE";
  layoutGrow?: 0 | 1;
  layoutAlign?: "STRETCH" | "INHERIT";
  minWidth?: number | null;
  maxWidth?: number | null;
  minHeight?: number | null;
  maxHeight?: number | null;

  constraints?: {
    horizontal: "MIN" | "CENTER" | "MAX" | "STRETCH" | "SCALE";
    vertical: "MIN" | "CENTER" | "MAX" | "STRETCH" | "SCALE";
  };

  // Grid auto-layout container and direct-child placement.
  grid?: {
    rowCount?: number;
    columnCount?: number;
    rowGap?: number;
    columnGap?: number;
    rowSizes?: GridTrackInput[];
    columnSizes?: GridTrackInput[];
  };
  gridChild?: {
    position?: { row: number; column: number };
    rowSpan?: number;
    columnSpan?: number;
    horizontalAlign?: "MIN" | "CENTER" | "MAX" | "AUTO";
    verticalAlign?: "MIN" | "CENTER" | "MAX" | "AUTO";
  };

  // Frame/container viewport and visual-grid fields.
  clipsContent?: boolean;
  overflowDirection?: "NONE" | "HORIZONTAL" | "VERTICAL" | "BOTH";
  layoutGrids?: LayoutGridInput[]; // [] clears literal layout grids
};
```

### State and cross-field rules

- At least one mutable field is required; empty `grid` and `gridChild` objects are rejected.
- Every supplied property must exist on the target. The handler computes the effective mode from current state plus the request, validates every field group and parent relationship, and only then calls the first setter.
- `layoutMode: "GRID"` and `grid` require a node implementing both `AutoLayoutMixin` and `GridLayoutMixin`. Grid mode is refused on unsupported slot/container types.
- `grid` requires the effective `layoutMode` to be `GRID`. Counts are positive integers, gaps are non-negative, and a supplied track array must exactly match the effective row/column count. `FIXED` tracks require a positive pixel `value`; `FLEX` may carry a positive fractional-unit value; `HUG` forbids `value`.
- Before shrinking a grid, inspect child anchors and spans. If occupied cells would fall outside the new bounds, fail with the blocking child IDs/names and minimum valid counts before changing either count.
- `gridChild` requires a direct child of a `GRID` parent. `position.row` and `position.column` are paired, indices are zero-based and in bounds, spans are positive integers, and the complete proposed rectangle is checked for bounds and overlap before calling `setGridChildPosition` or span setters.
- `layoutPositioning`, `layoutGrow`, and `layoutAlign` require a direct child of a horizontal/vertical auto-layout parent. Only non-deprecated `STRETCH` and `INHERIT` values are published for `layoutAlign`.
- `layoutSizingHorizontal`/`layoutSizingVertical` retain their current Figma applicability rules: `HUG` is for auto-layout containers/text, and `FILL` is for direct auto-layout children. Incompatible `HUG`/`FILL`, grow, stretch, and parent sizing combinations fail with the effective parent mode and the exact field to change.
- Min/max fields apply only to auto-layout containers and their direct children. A positive number sets a bound and `null` clears it. Validate `minWidth <= maxWidth` and `minHeight <= maxHeight` against the complete effective values.
- Both constraint axes remain required because Figma assigns `constraints` as one pair. Constraints require `ConstraintMixin` and are active only outside parent-controlled flow or when `layoutPositioning: "ABSOLUTE"` is already effective or included in the same call.
- `counterAxisAlignContent` and non-null `counterAxisSpacing` require effective wrapping. `BASELINE` requires horizontal auto layout. Fields specific to horizontal/vertical flow are rejected in `NONE` or `GRID` mode.
- `clipsContent` and `layoutGrids` require a frame-like node with those properties. `overflowDirection` requires `FramePrototypingMixin`. Literal `layoutGrids` replacement returns the resulting `gridStyleId` so any style-link effect is visible; shared grid-style linking remains the responsibility of `node_apply_style`. Serialize Figma's `count: Infinity` back as `count: "AUTO"`, never JSON `null`.
- Preserve strict layout-grid variable aliases in round-trip reads. Resolve every supplied alias and require a compatible FLOAT variable before replacing the grid array.
- Mutation order follows dependencies after complete preflight: mode, container sizing/flow, grid counts/tracks, child participation/placement, bounds/constraints, then clipping/overflow/visual grids. Unexpected Figma failures return the fields already applied and their before-values under the existing partial-mutation contract.

### Output

Return the target and parent identity, effective layout mode, and resulting values for every supplied field. Grid output includes complete row/column counts, gaps, track definitions, and the target child's resolved anchors/spans when `gridChild` was supplied.

### Acceptance criteria

- Existing valid `node_set_auto_layout` fixtures migrate to `node_set_layout` without changing field names or behavior.
- Horizontal, vertical, wrapping, and grid auto-layout calls publish explicit state-dependent schemas and errors.
- Child `FILL`/`HUG`, absolute positioning, grow/align, bounds, and constraints are independently and jointly editable where Figma supports them.
- Grid count reduction and child placement collisions are refused before any layout mutation and identify the blocking cells/nodes.
- Clipping, overflow, and literal layout-grid replacement read back exact resulting values.
- A target or parent-state mismatch fails before another valid layout field in the same request mutates.

---

## 4. `node_set_appearance`: effects, visibility, opacity, blend, mask (P0)

### Rename and contract

Replace `node_set_effects` with `node_set_appearance`:

```ts
type NodeSetAppearanceInput = {
  nodeId: string;
  nodeName: string;
  effects?: Effect[];       // [] clears effects
  visible?: boolean;
  opacity?: number;         // 0..1
  blendMode?: BlendMode;
  isMask?: boolean;
  maskType?: "ALPHA" | "VECTOR" | "LUMINANCE";
};
```

`BlendMode` is a published enum, not a free string:

```text
PASS_THROUGH, NORMAL, DARKEN, MULTIPLY, LINEAR_BURN, COLOR_BURN,
LIGHTEN, SCREEN, LINEAR_DODGE, COLOR_DODGE, OVERLAY, SOFT_LIGHT,
HARD_LIGHT, DIFFERENCE, EXCLUSION, HUE, SATURATION, COLOR, LUMINOSITY
```

Rules:

- At least one mutable field is required.
- Omitted fields remain unchanged. `effects: []` clears effects.
- `visible: false` removes the layer from rendering and hit-testing/layout behavior where Figma applies visibility semantics. It is not treated as opacity zero.
- `opacity: 0` keeps the layer present but transparent. The schema description explicitly distinguishes this from `visible: false`.
- The target must expose each supplied property. Unsupported properties are rejected as a complete-call preflight.
- `maskType` without `isMask` is accepted only when the target is already a mask. Otherwise the error says to include `isMask: true` in the same call.

### Mask containment guard

For any call that changes `isMask` or `maskType`:

1. Resolve the target and its parent before mutation.
2. Require a parent with children and a bounded group-like type: `GROUP`, `FRAME`, `COMPONENT`, `COMPONENT_SET`, or `SECTION`.
3. Require the parent itself to be inside editable scope. Checking only the target is insufficient because mask propagation reaches siblings.
4. Reject targets inside an `INSTANCE` interior.
5. When enabling a mask, require at least one subsequent sibling in the parent's `children` array. Return the affected sibling IDs/names in the success result.
6. When disabling or changing an existing mask, identify the currently affected sibling range before mutation and require it to be in scope.
7. Preserve all non-target `componentPropertyReferences`, variables, styles, and appearance fields.

The containment failure must use explicit mask wording, for example:

```text
MASK_NOT_CONTAINED: Changing isMask on "Mask Shape" would affect sibling layers
outside the connected scope because its parent "Page 1" is not in scope. Group the
mask and intended content inside the editable scope, then retry node_set_appearance.
```

### Output

```ts
{
  id: string;
  name: string;
  appearance: {
    effects?: Effect[];
    visible?: boolean;
    opacity?: number;
    blendMode?: BlendMode;
    isMask?: boolean;
    maskType?: MaskType;
  };
  maskAffectedNodes?: Array<{ id: string; name: string }>;
}
```

### Acceptance criteria

- Invalid opacity, blend, and mask enum values fail at the MCP boundary.
- A later invalid field cannot leave an earlier appearance field applied.
- A mask scoped only to itself cannot affect out-of-scope siblings.
- `visible: false` and `opacity: 0` produce distinct readbacks and remain independently editable.
- Existing effect normalization and effect-style guidance survive the rename.

---

## 5. Text ranges: full style surface and content replacement (P0)

### Style range contract

Add paired optional fields:

```ts
start?: number; // inclusive UTF-16 code-unit offset
end?: number;   // exclusive UTF-16 code-unit offset
```

Rules:

- `start` and `end` must be supplied together or both omitted.
- With no range, supplied range-capable properties apply to the full character span and node-level properties apply to the node.
- With a range, `0 <= start < end <= characters.length`.
- A boundary that splits a UTF-16 surrogate pair is rejected with the nearest valid lower and upper offsets.
- An empty text node cannot receive a range. Node-level properties may still be set where Figma permits them.
- If a range is supplied with a node-only property, reject the complete request before mutation and list the range-capable fields.
- The handler loads every current font used in the affected range plus any requested replacement font before the first text setter.
- An explicit replacement `fontName` is validated and loaded as the exact family/style pair. If it is unavailable, return `FONT_NOT_AVAILABLE` with catalog candidates and do not substitute a default or nearby font.

### Range-based content replacement in `text_set_content`

Keep the existing batch tool and make each `text[]` item a strict union:

```ts
type TextContentItem =
  | {
      nodeId: string;
      nodeName: string;
      characters: string; // replace the complete node content
    }
  | {
      nodeId: string;
      nodeName: string;
      start: number;       // inclusive UTF-16 offset
      end: number;         // exclusive UTF-16 offset; may equal start for insertion
      expectedText: string; // must equal current characters.slice(start, end)
      characters: string;   // replacement; "" deletes the range
      inheritStyleFrom?: "BEFORE" | "AFTER";
    };
```

Rules:

- Whole-node and ranged fields are mutually exclusive. `start`, `end`, and `expectedText` are all required for the ranged branch; no item accepts only part of that group.
- Ranged content uses `0 <= start <= end <= characters.length`. Unlike style ranges, `start === end` is valid and inserts text.
- Offsets use UTF-16 code units and neither boundary may split a surrogate pair. Errors return the nearest valid offsets.
- Before loading fonts or mutating, compare `expectedText` code-unit-for-code-unit with the current `[start, end)` substring. `TEXT_RANGE_CONTENT_MISMATCH` returns the actual substring, current character length, bounded context before/after the range, and the exact retry patch using the observed substring. It names `node_info({ nodeIds: [nodeId], properties: ["characters"], maxDepth: 0 })` when the caller should reconsider stale offsets instead of accepting the patch blindly.
- `characters: ""` with `start < end` deletes. `characters: ""` with `start === end` is a successful no-op. `inheritStyleFrom` is forbidden when no characters are inserted.
- Inserted text receives one existing neighboring style through Figma's `insertCharacters` `useStyle` argument. If omitted, choose `BEFORE` when `start > 0`, otherwise `AFTER`; an empty node uses its node-level text style. An explicitly requested unavailable side fails before mutation and names the available choice.
- A replacement does not infer multiple styles from the removed range. The inserted span has the selected neighboring style; callers use `text_set_style` for deliberate mixed styling after replacement.
- Support both `TEXT` and `TEXT_PATH`. Load all fonts needed by the affected range and selected inheritance side for every batch item before the first content mutation.
- Preserve the current batch rule that each node ID appears at most once. Multiple ranges on one node require separate calls so offsets and failure recovery stay unambiguous.
- Resolve all nodes, scope/name/lock checks, node types, ranges, expected substrings, inheritance sides, and fonts for the complete batch before applying item one. Predictable invalidity in item N must not mutate items 1..N-1.
- After preflight, use the native range APIs rather than rebuilding the whole string. For a non-empty insertion/replacement, call `insertCharacters(start, characters, useStyle)` first so the original neighboring style still exists, then delete the shifted original range `[start + characters.length, end + characters.length)`. A pure deletion calls `deleteCharacters(start, end)`. This preserves unaffected styled runs and makes a rare second-step failure leave duplicate content rather than silently lose the original. Any such failure returns `partialMutation: true`, the original full text/range, and the exact resulting text; it must never appear as an ordinary clean failure.

Per-item success output:

```ts
{
  nodeId: string;
  nodeName: string;
  mode: "WHOLE" | "RANGE";
  replacedRange: { start: number; end: number };
  insertedRange: { start: number; end: number };
  originalText: string;      // complete pre-write text
  replacedText: string;      // prior substring
  characters: string;        // inserted content
  resultingText: string;
  resultingLength: number;
  inheritStyleFrom?: "BEFORE" | "AFTER";
  noOp: boolean;
}
```

### Writable property matrix

The future schema supports the following Figma-writable text properties. Existing fields remain; additions are marked by capability rather than by implementation history.

| Property | Whole `TEXT` | Range `TEXT` | `TEXT_PATH` | Notes |
| :- | :-: | :-: | :-: | :- |
| `fontName` | Yes | Yes | Yes | `{family, style}`; load before write |
| `fontSize` | Yes | Yes | Yes | minimum 1 |
| `textCase` | Yes | Yes | Yes | explicit enum |
| `letterSpacing` | Yes | Yes | Yes | pixels or percent |
| `hyperlink` | Yes | Yes | Yes | URL/NODE target or `null` to clear |
| `fills` | Yes | Yes | Yes | strict Figma paint array; `[]` clears |
| `textStyleId` | Yes | Yes | Yes | string, or `null` to unlink |
| `fillStyleId` | Yes | Yes | Yes | string, or `null` to unlink |
| `textDecoration` | Yes | Yes | No | NONE/UNDERLINE/STRIKETHROUGH |
| `textDecorationStyle` | Yes | Yes | No | SOLID/WAVY/DOTTED |
| `textDecorationOffset` | Yes | Yes | No | AUTO or pixels/percent |
| `textDecorationThickness` | Yes | Yes | No | AUTO or pixels/percent |
| `textDecorationColor` | Yes | Yes | No | AUTO or one solid paint |
| `textDecorationSkipInk` | Yes | Yes | No | boolean |
| `lineHeight` | Yes | Yes | No | AUTO, pixels, or percent |
| `listOptions` | Yes | Yes | No | NONE/ORDERED/UNORDERED |
| `listSpacing` | Yes | Yes | No | non-negative number |
| `indentation` | Yes | Yes | No | non-negative nesting level/value accepted by Figma |
| `paragraphIndent` | Yes | Yes | No | number |
| `paragraphSpacing` | Yes | Yes | No | number |
| `textAlignHorizontal` | Yes | No | Yes | LEFT/CENTER/RIGHT/JUSTIFIED |
| `textAlignVertical` | Yes | No | Yes | TOP/CENTER/BOTTOM |
| `textAutoResize` | Yes | No | No | NONE/WIDTH_AND_HEIGHT/HEIGHT; deprecated TRUNCATE is not accepted |
| `textTruncation` | Yes | No | No | DISABLED/ENDING |
| `maxLines` | Yes | No | No | integer >=1 or `null` |
| `hangingPunctuation` | Yes | No | No | boolean |
| `hangingList` | Yes | No | No | boolean |
| `leadingTrim` | Yes | No | No | NONE/CAP_HEIGHT |
| `autoRename` | Yes | No | Yes | boolean |

Cross-field validation:

- Decoration detail fields require `textDecoration: "UNDERLINE"` in the same call or an existing underlined target range.
- `maxLines` is meaningful only with `textTruncation: "ENDING"`; otherwise reject with the required companion field.
- `textAutoResize: "WIDTH_AND_HEIGHT"` and truncation/max-line combinations are validated against Figma's documented compatibility.
- `textStyleId` and direct style fields may be sent together, but apply the style ID first and direct fields second so the literal fields are the final requested values. The output discloses the resulting style link.
- `fills` uses a strict paint schema shared with style handling. Unknown paint keys are rejected rather than stripped.

Not writable through this tool:

- `fontWeight` and `fontStyle` are read-only Plugin API properties; callers choose a concrete `fontName.style` instead.
- `openTypeFeatures`, `textStyleOverrides`, and computed mixed values have no corresponding general setter in the pinned API.
- `characters` remains the responsibility of `text_set_content`.
- Variable bindings remain the responsibility of `node_bind_variable`.

### Supporting text-path compatibility

Because this release can create `TEXT_PATH`, both `text_set_style` and `text_set_content` must accept `TEXT_PATH` targets where the Figma API supports the requested property. A `TEXT_PATH` request containing an unsupported property is rejected before any compatible property is changed.

### Output

For `text_set_style`, return the applied range, character length, loaded fonts, and resulting values for every requested property. For `text_set_content`, retain the batch summary and return the per-item whole/range result above. Both results must be sufficient to verify index, content, and font behavior without an immediate second read.

### Acceptance criteria

- Whole-node behavior remains compatible for all currently supported fields.
- A range styles only `[start, end)`.
- A content range replaces only `[start, end)`, supports insertion and deletion, and preserves content and styled runs outside that range.
- A stale `expectedText`, duplicate target, invalid inheritance side, or invalid range is refused during whole-batch preflight before any item mutates.
- Partial range parameters, out-of-bounds values, reversed ranges, and surrogate-splitting boundaries each return a specific repair message.
- Mixed-font text preloads every affected font before any write.
- An unavailable explicit `fontName` returns the requested pair, candidate pairs, and a corrected `page_info.fontDiscovery` call without mutating text.
- Every published schema property has a handler path and every handler-supported property appears in the schema.
- `TEXT_PATH` accepts only its API-supported subset.

---

## 6. `create_text` with `TEXT_PATH` (P1)

### Contract

Turn `create_text` into two strict branches selected by `type`:

```ts
type CreateTextInput =
  | {
      type: "TEXT";
      parentId: string;
      parentNodeName: string;
      x: number;
      y: number;
      text: string;
      name?: string;
      fontName?: FontName;
      fontWeight?: number; // existing Inter-weight convenience, 100..900
      fontSize?: number;
      fontColor?: RGBA;
    }
  | {
      type: "TEXT_PATH";
      pathNodeId: string;
      pathNodeName: string;
      parentId: string;       // must be the source path's current parent
      parentNodeName: string;
      startSegment: number;
      startPosition: number;
      text: string;
      name?: string;
      fontName?: FontName;
      fontWeight?: number; // existing Inter-weight convenience, 100..900
      fontSize?: number;
      fontColor?: RGBA;
    };
```

For one compatibility release, omitted `type` may normalize to `TEXT`; the published description must identify that default. New examples always include the discriminator.

`fontWeight` preserves the current creation contract by mapping the numeric value to an Inter style. It is mutually exclusive with explicit `fontName`; when neither is supplied, creation keeps the current Inter Regular default. This creation convenience does not imply that `fontWeight` is directly writable through `text_set_style`.

An explicit `fontName` must be loaded as that exact family/style pair. If it is unavailable, creation returns `FONT_NOT_AVAILABLE` and never falls back to `fontWeight`, Inter Regular, or a nearby catalog entry. The documented `fontWeight` and no-font branches are explicit defaults, not fallback behavior; their resolved Inter pair must also load successfully before creation.

### Text-path behavior

- Resolve and exact-name-verify `pathNodeId`.
- Resolve and exact-name-verify `parentId`, require it to be appendable and in scope, and require it to equal the source path's current parent.
- Accept only vector-like source types supported by Figma text paths: `VECTOR`, `RECTANGLE`, `ELLIPSE`, `POLYGON`, `STAR`, or `LINE`.
- Require `startSegment` to be a non-negative integer and `startPosition` in `[0, 1]`.
- Reject a locked source, a source in an instance interior, or a source whose parent is outside editable scope.
- Clone the source under the same verified parent, then call `figma.createTextPath` on the clone.
- The source path's position and geometry determine placement; `x`, `y`, `width`, and `height` are not accepted in the `TEXT_PATH` branch. `parentId` is verification data, not a request to reparent the clone.
- Load the requested/default font before setting characters.
- If conversion or text initialization fails, remove the clone and leave the source untouched.

Output:

```ts
{
  id: string;
  name: string;
  type: "TEXT_PATH";
  sourcePathId: string;
  sourcePreserved: true;
  parentId: string;
  startSegment: number;
  startPosition: number;
}
```

Consuming the original path is out of scope. A caller that intentionally wants only the text path can delete the source in a separate, explicit destructive decision.

### Acceptance criteria

- Ordinary text creation remains unchanged after normalization.
- Text-path creation never changes or removes the named source.
- A failed conversion cleans up the clone.
- Source type, scope, lock, parent, and segment errors occur before cloning.
- An unavailable explicit or resolved default font fails before creation and returns candidate pairs plus an exact `page_info({ fontDiscovery: { source: "AVAILABLE", ... } })` recovery call.

---

## 7. `create_shape` with `LINE` (P1)

### Contract

Add a strict `LINE` branch instead of forcing line semantics through rectangle dimensions:

```ts
{
  type: "LINE";
  parentId: string;
  parentNodeName: string;
  x: number;
  y: number;
  length: number;            // > 0
  rotation?: number;         // absolute Figma degrees, default 0
  name?: string;
  strokeColor?: RGBA;
  strokeWeight?: number;     // > 0
}
```

Rules:

- The `LINE` branch calls `figma.createLine()`, then `resize(length, 0)` as required by the Plugin API.
- `fillColor`, `arcData`, `pointCount`, `innerRadius`, `width`, and `height` are rejected for `LINE`.
- Existing rectangle/ellipse/polygon/star branches retain their fields.
- Parent-first placement and cleanup-on-failure rules remain in force.
- Arrowheads, stroke dash/cap/join editing, and arbitrary two-endpoint geometry are out of scope. Rotation supplies the line angle.

### Acceptance criteria

- A line is a native `LINE` node, not a thin rectangle or flattened SVG.
- Invalid shape-specific field combinations fail in schema validation.
- The output reports `type`, `length`, `rotation`, and resulting stroke values.

---

## 8. `create_svg` with native `VECTOR` creation (P1)

### Contract

Keep the public tool name but publish two explicit source branches:

```ts
type CreateSvgOrVectorInput =
  | {
      sourceType: "SVG";
      svg: string;
      parentId: string;
      parentNodeName: string;
      name?: string;
      x?: number;
      y?: number;
    }
  | {
      sourceType: "VECTOR_PATHS";
      vectorPaths: Array<{
        windingRule: "EVENODD" | "NONZERO";
        data: string;
      }>;
      parentId: string;
      parentNodeName: string;
      name?: string;
      x?: number;
      y?: number;
    };
```

Rules:

- `VECTOR_PATHS` calls `figma.createVector()` and assigns a non-empty `vectorPaths` array.
- Creating an empty invisible vector is rejected.
- SVG markup and vector paths are mutually exclusive.
- Raw `VectorNetwork` authoring is out of scope for this release. It is substantially more complex and deserves a separately validated schema if needed later.
- The handler resolves and verifies the parent before creation, appends immediately, and removes the created node on any later failure.
- Output reports the actual node type because `figma.createNodeFromSvg` can return a container while native vector creation always returns `VECTOR`.

The tool description must say that `SVG` imports markup and may create a hierarchy, while `VECTOR_PATHS` creates one editable native vector node. This distinction is the reason the branches are explicit.

### Acceptance criteria

- Both branches reject fields belonging to the other branch.
- Vector path data rejected by Figma is returned as a structured API error with the failing path index where recoverable.
- Native vector output is a single `VECTOR` node with the requested parent and name.

---

## 9. `create_region`: `FRAME`, `SECTION`, and `SLICE` (P1)

### Rename and contract

Replace `create_frame` with a discriminated `create_region` tool.

Common fields:

```ts
type RegionBase = {
  regionType: "FRAME" | "SECTION" | "SLICE";
  parentId: string;
  parentNodeName: string;
  x: number;
  y: number;
  width: number;  // > 0
  height: number; // > 0
  name?: string;
};
```

Type-specific fields:

| Region type | Additional supported fields | Rejected fields |
| :- | :- | :- |
| `FRAME` | Existing fill, stroke, stroke weight, layout mode/wrap, padding, alignment, sizing, spacing | `sectionContentsHidden` |
| `SECTION` | `fillColor?`, `sectionContentsHidden?` | stroke and every auto-layout field |
| `SLICE` | none | fill, stroke, children/layout, `sectionContentsHidden` |

Semantics:

- `FRAME` is a visual container and preserves current defaults and full initial auto-layout configuration.
- `SECTION` is an organizational container created with `figma.createSection()`.
- `SLICE` is a non-visual export region created with `figma.createSlice()`; it is not a frame and cannot contain children.
- Parent scope/name/lock/instance-interior checks happen before creation for every type.
- The handler verifies that the selected parent can legally contain the selected region type before mutation where the Plugin API exposes enough information; Figma remains the final arbiter for undocumented parent restrictions.
- Every branch uses parent-first placement and cleanup on failure.

Output:

```ts
{
  id: string;
  name: string;
  type: "FRAME" | "SECTION" | "SLICE";
  parentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sectionContentsHidden?: boolean;
}
```

### Acceptance criteria

- Existing `create_frame` examples migrate by adding `regionType: "FRAME"` and changing the tool name.
- Frame-only fields cannot be silently ignored for section or slice.
- Slice output is discoverable and exportable through existing read/export tools.
- No branch defaults to current page.

---

## 10. `variable_manage`: code syntax, collection rename, and mode maintenance (P0)

### Action surface

The future action enum is:

```text
CREATE_COLLECTION
CREATE_VARIABLE
UPDATE_VARIABLE
RENAME_COLLECTION
ADD_MODE
RENAME_MODE
```

Each action is a strict branch. Fields from another action are rejected rather than stripped.

### Nullable `codeSyntax`

Add this optional field to `CREATE_VARIABLE` and `UPDATE_VARIABLE`:

```ts
codeSyntax?: {
  WEB?: string | null;
  ANDROID?: string | null;
  iOS?: string | null;
};
```

Semantics:

- Omitted platform: leave unchanged.
- Non-empty string: call `setVariableCodeSyntax(platform, value)`.
- `null`: call `removeVariableCodeSyntax(platform)`.
- The object must contain at least one platform.
- Empty or whitespace-only strings are rejected; callers use `null` to remove.
- Unknown platform keys fail at the MCP boundary.
- `variable_list` must include each variable's current `codeSyntax` so the write is discoverable and verifiable.
- The success result returns the complete resulting `codeSyntax` object, not only the submitted patch.

For `CREATE_VARIABLE`, code syntax is applied after creation. If it fails, remove the newly created variable so the failed call does not leave an unintended asset.

### `RENAME_COLLECTION`

```ts
{
  action: "RENAME_COLLECTION";
  collectionId: string;
  collectionName: string; // current exact name from variable_list
  name: string;           // requested new name
}
```

Rules:

- Resolve by `collectionId`, then exact-name-verify `collectionName` before mutation. A mismatch returns the authoritative current name and the exact corrected retry.
- `variable_list` remains the discovery/readback path and must expose each collection's ID, exact name, key, `remote`, `isExtension`, mode IDs/names, and variable IDs.
- Require a non-empty, non-whitespace `name`. Omitted fields from other actions are forbidden by the strict branch.
- Reject remote collections with the existing source-library recovery. Local extended collections may be renamed because their local collection identity is writable; their inherited modes/variables remain unchanged.
- Renaming does not recreate or migrate the collection. Its collection ID/key, mode IDs, variable IDs, explicit-mode assignments, variable bindings, aliases, and values remain stable.
- If `name === collectionName`, return a successful no-op.
- If another collection already has `name`, allow the rename when Figma allows it because the ID remains authoritative, but return `duplicateNameWarning` with the colliding collection IDs/names. Future writes still require ID plus exact name.

Output:

```ts
{
  action: "RENAME_COLLECTION";
  collectionId: string;
  oldName: string;
  name: string;
  key: string;
  remote: false;
  isExtension: boolean;
  modes: Array<{ modeId: string; name: string }>;
  variableIds: string[];
  noOp: boolean;
  duplicateNameWarning?: Array<{ collectionId: string; name: string }>;
}
```

### `ADD_MODE`

```ts
{
  action: "ADD_MODE";
  collectionId: string;
  collectionName: string;
  name: string;
}
```

- Require exact current collection name from `variable_list`.
- Reject remote and extended collections that cannot add modes.
- Return the new `modeId`, name, collection identity, and complete resulting mode list.
- Convert Figma plan-limit failures into a structured error that reports the current mode count and explains that the file's Figma plan must allow another mode. Do not suggest a lossy workaround automatically.

### `RENAME_MODE`

```ts
{
  action: "RENAME_MODE";
  collectionId: string;
  collectionName: string;
  modeId: string;
  currentModeName: string;
  name: string;
}
```

- Verify collection ID/name, mode ID/current name, local ownership, and non-empty new name before mutation.
- A duplicate mode name is rejected if Figma would make mode identification ambiguous.
- Return old and new names plus the complete resulting mode list.

### Existing action tightening

- `UPDATE_VARIABLE` with `value` must require `modeId`; it must not silently choose a default mode.
- `UPDATE_VARIABLE` continues to require `currentVariableName`.
- Setting name, description, scopes, value, and code syntax in one call is allowed only after all fields and referenced mode/alias identities are preflighted.

### Acceptance criteria

- Every action's required fields and forbidden fields are visible in the emitted JSON schema.
- `null` removes one code-syntax platform without clearing omitted platforms.
- Collection rename preserves all collection, mode, variable, alias, and binding IDs and is visible in the next `variable_list` call.
- Add/rename mode calls verify exact current names.
- Plan-limit, wrong-mode, and remote-collection failures each provide a one-step recovery.

---

## 11. Clear explicit variable modes in `node_bind_variable` (P0)

### Contract

Change:

```ts
explicitVariableModes?: Record<string, string>;
```

to:

```ts
explicitVariableModes?: Record<string, string | null>;
```

Semantics:

- String value: resolve the collection and mode, verify the mode belongs to that collection, then call `setExplicitVariableModeForCollection(collection, modeId)`.
- `null`: resolve the collection and call `clearExplicitVariableModeForCollection(collection)`.
- Omitted collection: leave its explicit mode unchanged.
- `bindVariables` retains its existing variable-ID-or-null behavior.
- At least one of `bindVariables` or `explicitVariableModes` must contain an entry.
- Return the target's complete resulting `boundVariables` and `explicitVariableModes` readback.

Example:

```json
{
  "nodeId": "10:24",
  "nodeName": "Card",
  "explicitVariableModes": {
    "VariableCollectionId:1:2": null
  }
}
```

### Acceptance criteria

- Clearing an absent override is a successful no-op and reports the inherited/default mode state.
- A mode from the wrong collection fails before any other binding in the call mutates.
- Schema wording distinguishes variable unbinding (`bindVariables[field]: null`) from explicit-mode clearing (`explicitVariableModes[collectionId]: null`).

---

## 12. Delete a variable mode with `variable_delete` (P0)

### Future discriminated schema

```ts
type VariableDeleteInput = {
  target:
    | {
        kind: "VARIABLES";
        variables: Array<{ variableId: string; variableName: string }>;
      }
    | {
        kind: "COLLECTION";
        collectionId: string;
        collectionName: string;
      }
    | {
        kind: "MODE";
        collectionId: string;
        collectionName: string;
        modeId: string;
        modeName: string;
      };
};
```

This replaces the current optional `variableIds`/`collectionId` XOR shape. The `target.kind` discriminator prevents a missing mode field from being interpreted as collection deletion.

### Mode-deletion safety

Before `collection.removeMode(modeId)`:

1. Verify variable-edit permission.
2. Resolve and exact-name-verify the local collection.
3. Resolve and exact-name-verify the mode within that collection.
4. Reject deletion of the collection's only remaining mode.
5. Scan the document for nodes whose `explicitVariableModes[collectionId]` points to the mode.
6. If consumers exist, reject the delete and return their IDs/names plus the exact recovery: clear each override with `node_bind_variable` and retry.
7. Report that values stored for every variable in the deleted mode will be permanently removed. This is intrinsic to the requested operation and is not represented as a recoverable consumer.

If the deleted mode was the collection's default and Figma chooses a new default, the success result must report both old and new `defaultModeId` and the complete remaining mode list.

`variable_delete` retains `destructiveHint: true`.

### Output

```ts
{
  deleted: {
    kind: "VARIABLES" | "COLLECTION" | "MODE";
    ids: string[];
    names: string[];
  };
  collectionId?: string;
  remainingModes?: Array<{ modeId: string; name: string }>;
  previousDefaultModeId?: string;
  defaultModeId?: string;
}
```

### Acceptance criteria

- No input shape can accidentally switch from mode deletion to collection deletion.
- Wrong mode names and last-mode deletion fail before mutation.
- Explicit-mode consumers produce a complete actionable refusal.
- Existing variable and collection deletion behavior survives under the new discriminator.

---

## 13. New `instance_swap_component` tool (P0)

### Purpose

Change an existing instance's main component while preserving compatible overrides using Figma's `instance.swapComponent(component)` heuristic. This is materially better than delete-and-recreate because the instance keeps its ID, parent position, layer order, prototype connections, and compatible overrides.

### Contract

```ts
type InstanceSwapComponentInput = {
  nodeId: string;
  nodeName: string;
  component:
    | {
        source: "LOCAL";
        componentId: string;
        componentName: string;
      }
    | {
        source: "LIBRARY";
        componentKey: string;
        componentName: string;
      };
};
```

Rules:

- Resolve and exact-name-verify the target `INSTANCE`.
- Local target must resolve to a local `COMPONENT`, not a `COMPONENT_SET`; verify its exact name.
- Library target imports by stable key, then verifies the returned component name against `componentName` before swapping.
- Remote components are valid swap destinations because the tool mutates the local instance, not the remote definition.
- A nested instance target is allowed: it is the direct override target. Ordinary instance-interior structural writes remain blocked.
- Swapping the connected scope-root instance is allowed because the instance ID and node identity remain stable.
- Detect an already-matching component and return a no-op without invoking Figma's heuristic again.
- Snapshot the old component identity, component properties, and available override metadata before mutation. Compare with post-swap state and report retained, changed, and no-longer-addressable override keys where observable.

Annotations:

```ts
{
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true
}
```

Output:

```ts
{
  instanceId: string; // unchanged
  instanceName: string;
  previousComponent: { id?: string; key?: string; name: string };
  component: { id: string; key?: string; name: string; remote: boolean };
  noOp: boolean;
  overrideSummary: {
    before: number;
    after: number;
    retainedKeys?: string[];
    missingKeys?: string[];
  };
  warnings?: string[];
}
```

The tool must not claim that every override was preserved. Figma documents preservation as a heuristic that may change.

### Acceptance criteria

- Exactly one local/library component branch is accepted.
- Wrong instance or destination names fail before swap.
- The instance ID, parent, and index remain unchanged.
- Incompatible override loss is disclosed where observable.
- `destructiveHint` is asserted in tool-list tests.

---

## 14. New destructive instance tools: detach and override removal (P0)

### Detach purpose

Call `instance.detachInstance()` to replace a component instance with a plain frame whose layers can be edited directly.

### Detach contract

```ts
{
  nodeId: string;
  nodeName: string;
}
```

Safety rules:

- Resolve and exact-name-verify an `INSTANCE` target. An instance of a remote library component is allowed because the mutation applies to the local instance, not its main component definition.
- Apply node permission, scope, lock, and remote-definition-independent checks.
- Reject the connected scope root because detach can replace the instance with a new frame identity and invalidate the scope anchor.
- Reject any instance with an ancestor of type `INSTANCE`. Figma documents that detaching a nested instance also detaches all ancestor instances; one target ID must never authorize that wider structural mutation.
- Reject locked descendants if detach would make their component protection disappear under the project's locked-layer policy.
- Snapshot target parent/index and verify the returned frame remains in the same in-scope position.

Annotations:

```ts
{
  destructiveHint: true,
  openWorldHint: true
}
```

Do not set `idempotentHint: true`; retrying the old instance ID after success is not the same operation.

Output:

```ts
{
  previousInstanceId: string;
  frameId: string;
  frameName: string;
  type: "FRAME";
  parentId: string;
  index: number;
}
```

There is no `instance_attach` inverse in the Figma Plugin API. The nearest alternative is to create a new instance from a component and explicitly migrate desired content, so the tool description must state that detachment is permanent.

### Detach acceptance criteria

- Top-level in-scope instance detachment succeeds and returns the new frame identity.
- Scope-root and nested-instance detachment are refused before mutation with distinct recovery messages.
- `destructiveHint` is asserted in tool-list tests.
- The handler does not silently detach ancestor instances.

### Override-removal purpose

Call `instance.removeOverrides()` to remove every direct override from exactly one existing instance while preserving its node ID, placement, component relationship, and inherited overrides. This is a whole-instance destructive reset, not a selective property reset and not an inverse of `instance_set_component_properties`.

`instance_get_overrides` is removed. The canonical prerequisite read is:

```ts
node_info({
  nodeIds: [nodeId],
  properties: ["mainComponent", "overrides", "componentProperties"],
  maxDepth: 0
});
```

For an `INSTANCE`, `node_info` must return the exact direct `overrides` manifest as `{ id, overriddenFields }[]`; inherited overrides are not included in that array. The read also returns enough main-component and component-property identity to help the caller distinguish a direct override reset from a component swap or property write.

### Override-removal contract

```ts
type InstanceOverrideManifestEntry = {
  id: string;
  overriddenFields: string[];
};

type InstanceRemoveOverridesInput = {
  nodeId: string;
  nodeName: string;
  expectedOverrides: InstanceOverrideManifestEntry[];
};
```

Rules:

- `nodeId` identifies exactly one target; no `targets`, `instances`, or other multi-instance branch is accepted.
- The input has no source field. `null` is not a reset sentinel for any retired `instance_set_overrides` route; the dedicated tool name and destructive annotation carry that intent explicitly.
- Resolve and exact-name-verify one in-scope `INSTANCE` before reading or mutating override state.
- Reject a locked target or any locked descendant before the native call. Override removal can propagate through text, visibility, component-property, or nested-main-component state, so checking only the outer instance is insufficient to preserve the project's locked-layer guarantee.
- An instance of a remote component is eligible because the operation mutates the local instance, not the remote definition.
- The explicit target may be a nested instance. Native `removeOverrides()` affects only that named instance's direct overrides and does not detach or reset ancestor instances.
- The target may be the connected scope root because its ID, hierarchy, and component relationship remain stable.
- Validate the expected manifest before comparison: all strings are non-empty, every `overriddenFields` array is non-empty, and duplicate entry IDs or duplicate fields within an entry are rejected. Every current entry ID must resolve to the target itself or one of its descendants; an escaping/unresolvable ID is a Figma-state invariant error. Canonicalize valid expected and current manifests by sorting entries by `id` and sorting each field set. Ordering differences alone must not cause a stale-state refusal; duplicate data returned by Figma is an invariant error, not something to hide through deduplication.
- Compare the current direct manifest with `expectedOverrides` exactly before mutation. A mismatch returns `INSTANCE_OVERRIDES_CHANGED`, the current canonical manifest, and complete corrected `instance_remove_overrides` arguments. No setter may run on this path.
- The manifest precondition detects added/removed overridden nodes and fields, not a value change to a field that was already overridden. The tool description and guide must disclose this residual limitation and instruct callers to use a fresh `node_info` read immediately before a destructive reset. The operation's intent remains "remove these direct override fields regardless of their current values."
- An expected empty manifest matching an empty current manifest is a successful no-op and does not call `removeOverrides()`.
- After all checks pass, call native `removeOverrides()` exactly once and read the direct manifest back. All resulting direct overrides must be reported; do not infer success from the absence of an exception alone. A non-empty result is `INSTANCE_OVERRIDE_REMOVAL_MISMATCH`, with before/resulting manifests and partial-mutation disclosure rather than a false success.
- No selective node, field, or component-property reset is accepted. Inherited overrides remain untouched.
- The removed manifest is an audit summary only. It does not contain discarded values and cannot restore them.
- If the native call throws unexpectedly, read the current manifest again. Return the original and observed manifests and set `partialMutation: true` when they differ; do not claim rollback or silently retry.

Annotations:

```ts
{
  destructiveHint: true,
  openWorldHint: true
}
```

Do not set `idempotentHint: true`. Reusing the original non-empty `expectedOverrides` after a successful reset must produce a stale-state refusal because it no longer describes the target.

Output:

```ts
{
  instanceId: string;
  instanceName: string;
  removedOverrides: InstanceOverrideManifestEntry[];
  overrides: InstanceOverrideManifestEntry[];
  noOp: boolean;
  partialMutation?: boolean;
}
```

### Override-removal acceptance criteria

- A matching direct manifest is removed with one native call, and readback proves the resulting direct manifest.
- Inherited overrides remain inherited and are not reported as removed.
- Remote-component instances, nested explicit targets, and a scope-root instance follow the explicit eligibility rules above.
- A locked target or locked descendant is refused before `removeOverrides()` even when the direct manifest itself names only an unlocked ancestor.
- An empty matching manifest succeeds as a no-op without calling the native setter.
- A malformed, duplicate, or stale expected manifest fails before mutation and gives one complete corrected retry when current state is available.
- The emitted schema has one exact target and no multi-instance or selective-reset branch.
- `destructiveHint` is asserted in tool-list tests and the description states that removed values are not recoverable from the result.

---

## 15. New `node_bind_component_property` tool (P0)

### Purpose

Bind a component property's canonical key to the field it controls on a sublayer inside a main component:

- `BOOLEAN` -> `visible`
- `TEXT` -> `characters`
- `INSTANCE_SWAP` -> `mainComponent`

Passing `null` removes the binding from that field.

### Contract

```ts
{
  nodeId: string;
  nodeName: string;
  field: "visible" | "characters" | "mainComponent";
  propertyId: string | null; // complete canonical name#id key, or null to unbind
}
```

Rules:

- Exact-name-verify the sublayer target and require it to be inside a local `COMPONENT` or a component variant owned by a local `COMPONENT_SET`.
- Reject a target inside a component instance. A nested `INSTANCE` node inside a main component is allowed as the direct target of `mainComponent` binding; its interior is not edited.
- `characters` requires `TEXT` or API-compatible text sublayer support.
- `mainComponent` requires `INSTANCE`.
- `visible` requires a scene node exposing that field.
- For a non-null `propertyId`, resolve the canonical property definition from the owning component/set and validate the property type-to-field mapping.
- Preserve every other entry in `componentPropertyReferences`.
- `null` removes only the selected field. Removing an absent binding is a successful no-op.
- Remote component definitions are read-only and rejected with the existing remote-asset guard.

### Canonical property-ID prerequisite

Section 16.1 is a hard prerequisite for this tool. `component_manage_property` must return canonical keys from `ADD`/`EDIT`, and edit/delete operations must accept those same keys. `node_info` continues to expose `componentPropertyDefinitions` as the recovery read for existing properties.

Output:

```ts
{
  nodeId: string;
  nodeName: string;
  owner: { id: string; name: string; type: "COMPONENT" | "COMPONENT_SET" };
  field: "visible" | "characters" | "mainComponent";
  propertyId: string | null;
  componentPropertyReferences: Record<string, string> | null;
  noOp: boolean;
}
```

Annotations include `idempotentHint: true`.

### Acceptance criteria

- Property type and field mismatch is rejected before assignment and names the correct field.
- Binding and unbinding preserve unrelated references.
- Canonical `propertyId` is available directly from `component_manage_property` success.
- Remote owners and instance-interior targets are refused by plugin-side gates.

---

## 16. Required prerequisites (P0)

These three capabilities are required parts of this release, not optional follow-ups. They make the dependent tools discoverable and exact enough to satisfy the Golden Rule.

### 16.1 Canonical component `propertyId` values end to end

#### Problem

Figma identifies non-variant component properties by canonical keys such as `Label#12:34`. The current handlers search by the human-readable prefix, call `addComponentProperty()` or `editComponentProperty()`, and discard the canonical key those APIs return. That creates three problems:

- a newly added property cannot be bound without another `node_info` call;
- duplicate display names make edit/delete selection ambiguous;
- renaming can change the canonical key, but the caller does not receive the replacement identity.

#### Contract changes

`component_manage_property` uses action-specific identity rules:

```ts
type ComponentManagePropertyInput =
  | {
      action: "ADD";
      nodeId: string;
      nodeName: string;
      propertyName: string;
      propertyType: "BOOLEAN" | "TEXT" | "INSTANCE_SWAP";
      defaultValue: string | boolean | VariableAlias;
      preferredValues?: InstanceSwapPreferredValue[];
    }
  | {
      action: "EDIT";
      nodeId: string;
      nodeName: string;
      propertyId: string; // complete canonical name#id key
      newPropertyName?: string;
      newDefaultValue?: string | boolean | VariableAlias;
      preferredValues?: InstanceSwapPreferredValue[];
    };
```

`component_delete_property` becomes:

```ts
{
  nodeId: string;
  nodeName: string;
  propertyId: string; // complete canonical name#id key
}
```

Rules:

- `propertyName` creates a new definition; `propertyId` selects an existing definition.
- `EDIT` and delete require the exact canonical key from a prior success result or `node_info({ properties: ["componentPropertyDefinitions"] })`.
- Do not split on `#` and choose the first matching display name for edit/delete.
- Capture the string returned by `addComponentProperty()` and `editComponentProperty()`.
- An edit result includes both `previousPropertyId` and the authoritative resulting `propertyId`; a rename may change the key.
- Delete returns the deleted canonical key and property definition snapshot.
- A stale key fails with the current valid canonical keys and the exact `node_info` recovery call.
- Because this release is already a hard-cutover API release, edit/delete do not retain the ambiguous display-name selector.

Success shapes:

```ts
// ADD
{
  action: "ADD";
  propertyId: string;
  propertyName: string;
  definition: ComponentPropertyDefinition;
}

// EDIT
{
  action: "EDIT";
  previousPropertyId: string;
  propertyId: string;
  propertyName: string;
  definition: ComponentPropertyDefinition;
}
```

Acceptance criteria:

- Add returns the exact API-returned key in the same call.
- Edit and delete target only exact canonical keys.
- A rename returns the replacement key and does not report the stale key as current.
- `node_bind_component_property` can consume an add/edit result directly without another discovery call.
- Component-property schema, handler, output, and guide terminology consistently call the complete `name#id` key `propertyId`.

### 16.2 Exact one-instance `instance_set_component_properties` maps

#### Problem

The current `instance_set_property` tool accepts one human-readable `propertyName` with a string/boolean value, scans `instance.componentProperties`, strips suffixes after `#`, and selects the first display-name match. It cannot express several already-decided property updates in one call and cannot pass Figma's supported `VariableAlias` value. The singular name also obscures that Figma's native `setProperties()` operation accepts a map for one instance.

#### Contract

Remove `instance_set_property` and replace it with this hard-cutover tool:

```ts
type InstancePropertyValue =
  | string
  | boolean
  | { type: "VARIABLE_ALIAS"; id: string };

type InstanceSetComponentPropertiesInput = {
  nodeId: string;
  nodeName: string;
  properties: Record<string, InstancePropertyValue>;
};
```

Rules:

- The input and alias object are recursively strict. `properties` must contain at least one entry.
- One call targets exactly one instance. Reject `targets`, `instances`, an array-valued target, or any other multi-instance batch envelope at the MCP boundary. The plural tool name refers to properties, not instances.
- The emitted title/description must say "set one or more exposed component properties on one exact instance" and contrast this tool with component-definition management and direct descendant overrides.
- Resolve and exact-name-verify one in-scope, unlocked `INSTANCE` through the existing instance-write stack before mutation.
- Map keys are exact keys from `instance.componentProperties`: canonical `name#id` keys for `BOOLEAN`, `TEXT`, and `INSTANCE_SWAP`, and Figma's exact bare names for `VARIANT` properties.
- `node_info({ nodeIds: [nodeId], properties: ["mainComponent", "componentProperties"], maxDepth: 0 })` is the canonical discovery call. Do not accept a display-name selector or strip canonical suffixes.
- Preflight every key and value against the same target snapshot before calling any setter. For semantic failures, report every predictable invalid map entry together rather than forcing one failure/retry cycle per entry.
- Resolve each `VARIABLE_ALIAS` ID and validate that the alias can be assigned to the selected property type where the pinned API exposes that constraint. Figma remains the final arbiter for constraints the Plugin API does not expose.
- Apply the exact map with one native `instance.setProperties(properties)` call after preflight. Unspecified properties retain their current values.
- Preserve the native values expected by `setProperties()`. In particular, do not reinterpret an `INSTANCE_SWAP` property value as a library key when the native contract expects a component node ID.
- Detect a map whose requested literal/alias states already match and return a no-op without invoking the native setter.
- Read `componentProperties` back after the native call and return both the previous and resulting state for every requested exact key.
- One native call reduces predictable partial-application risk but is not documented as an API transaction. If it throws unexpectedly, read back every requested key, compare it with the pre-call snapshot, and return `partialMutation: true` plus `before`, `requested`, and `resulting` values when any state changed. Do not silently retry or claim rollback.
- `instance_get_overrides` and `instance_set_overrides` are removed in the same hard cutover. `node_info` replaces the former read. The latter's source-template hybrid has no exact replacement; its former component swap, component-property update, direct node edit, and clone intents must use the explicit tools listed in the release migration table.

Annotations:

```ts
{
  idempotentHint: true,
  openWorldHint: true
}
```

Output:

```ts
{
  instanceId: string;
  instanceName: string;
  updatedProperties: Record<string, {
    type: "BOOLEAN" | "TEXT" | "INSTANCE_SWAP" | "VARIANT";
    requested: InstancePropertyValue;
    before: ComponentProperties[string];
    resulting: ComponentProperties[string];
  }>;
  componentProperties: ComponentProperties;
  noOp: boolean;
  partialMutation?: boolean;
}
```

Acceptance criteria:

- One exact call can update multiple property types.
- Every call contains one and only one instance target; no partial-success multi-instance result exists.
- Exact `name#id` keys are never reduced to display names.
- A `VariableAlias` reaches `setProperties()` intact after validation.
- One invalid map entry prevents the entire map from being submitted.
- A semantic validation error reports all invalid entries, the current exact property map, and complete corrected arguments wherever the correction is deterministic.
- Omitted properties retain their prior values, and requested properties include exact before/resulting readback.
- An unexpected native failure discloses any observed drift instead of promising atomicity.
- `instance_set_property`, `instance_get_overrides`, and `instance_set_overrides` are absent from `tools/list`, dispatcher commands, prompts, client command unions, guides, safety rows, and generated output.

### 16.3 Styled-text segments through `node_info`

#### Problem

Range styling is not safely composable from whole-node values. Before choosing `start`/`end` and replacement styles, the model needs to see existing run boundaries and the properties that vary across them. The current read path internally calls `getStyledTextSegments(["fontName"])` only for font loading and does not expose segments to MCP callers.

#### Contract

Add this optional computed-read request to `node_info`:

```ts
styledTextSegments?: {
  fields: Array<
    | "fontSize"
    | "fontName"
    | "fontWeight"
    | "fontStyle"
    | "textDecoration"
    | "textDecorationStyle"
    | "textDecorationOffset"
    | "textDecorationThickness"
    | "textDecorationColor"
    | "textDecorationSkipInk"
    | "textCase"
    | "lineHeight"
    | "letterSpacing"
    | "fills"
    | "textStyleId"
    | "fillStyleId"
    | "listOptions"
    | "listSpacing"
    | "indentation"
    | "paragraphIndent"
    | "paragraphSpacing"
    | "hyperlink"
    | "boundVariables"
    | "textStyleOverrides"
    | "openTypeFeatures"
  >;
  start?: number;       // paired, inclusive UTF-16 offset
  end?: number;         // paired, exclusive UTF-16 offset
  maxSegments?: number; // integer 1..1000, default 250
};
```

Rules:

- `fields` is non-empty, deduplicated in first-occurrence order, and emitted as an enum-backed JSON schema.
- Each returned segment always includes `characters`, `start`, and `end` in addition to requested fields.
- `start` and `end` follow the same paired, bounds, and surrogate-boundary rules as `text_set_style`.
- Use `TextNode.getStyledTextSegments(fields, start?, end?)`; do not reconstruct runs by repeatedly calling individual range getters.
- Support `TEXT` and `TEXT_PATH`, but reject requested fields that the target text type cannot expose.
- The option works in ordinary `TREE` reads and `MATCHES` results. Non-text nodes omit the computed property.
- Preserve variable alias identity as `{ type: "VARIABLE_ALIAS", id, name? }`; resolving a display name must not discard the ID needed for a later write.
- Normalize paint-valued segment fields with the same write-ready `PaintInput` serializer specified in Section 18.1.
- `maxSegments` bounds output. A truncated result reports the full segment count and tells the caller to retry with a narrower character range.

Per-node output under `properties`:

```ts
styledTextSegments: {
  segments: Array<{
    characters: string;
    start: number;
    end: number;
    [requestedField: string]: unknown;
  }>;
  totalSegmentCount: number;
  returnedSegmentCount: number;
  truncated: boolean;
}
```

This is the canonical discovery path before partial-range `text_set_style` or `text_set_content`. It does not add a separate text-scan or font tool.

Acceptance criteria:

- Mixed font, fill, hyperlink, list, style-ID, and variable-binding runs expose correct UTF-16 boundaries.
- Requested fields determine segmentation exactly as Figma's API does.
- Segment reads work for explicit roots and `MATCHES` results without using current selection/page.
- Invalid ranges and unsupported TEXT_PATH fields return actionable read errors.
- A model can take a returned segment's `start`/`end` and text and use them unchanged in `text_set_style` or as the guarded range/`expectedText` for `text_set_content`.

---

## 17. Rename the scoped page through `node_rename` (P0)

### Purpose and contract

`node_rename` remains the single rename command. Its existing input is sufficient:

```ts
{
  nodeId: string;
  nodeName: string; // current exact name
  name: string;     // new exact name
}
```

Add an explicit `PAGE` branch with these rules:

- Resolve the target before the generic node-write mutation.
- If the target type is `PAGE`, require `state.allowEditNode === "page"`.
- Require `state.scopeRootId === target.id`; only the page linked as the active editable scope can be renamed.
- Exact-name-verify `nodeName` against the page's current name from `page_info` or the connect payload.
- Require a non-empty new page name.
- Reject page-divider nodes; page-divider lifecycle/naming is out of scope.
- A node-scoped connection cannot rename its containing page, even though the page is an ancestor of the editable node.
- A page-scoped connection cannot rename another page.
- Renaming the scope page is allowed because its stable ID remains the scope anchor; reconnect is not required.
- Ordinary in-scope node rename behavior remains unchanged.

Output adds target type and scope continuity:

```ts
{
  id: string;
  type: string;
  oldName: string;
  name: string;
  scopeRootPreserved: boolean; // true for PAGE branch
}
```

Use a distinct `PAGE_RENAME_REQUIRES_PAGE_SCOPE` error when a page target lacks exact page scope. Its recovery says to reconnect with that page link; it must not suggest widening scope programmatically.

### Acceptance criteria

- The linked page can be renamed with its exact current name.
- Node scope, read-only mode, and a different page scope each refuse page rename before mutation.
- The page ID and active scope root remain unchanged after success.
- The new page name appears in the next `page_info` and connect payload.
- No page create/delete/reorder capability is introduced.

---

## 18. Paint stacks, stroke geometry, and image dimensions (P0)

### 18.1 Expand `node_set_fill` and `node_set_stroke`

#### Shared strict paint input

Both tools use one generated, recursively strict paint union. Common `visible`, `opacity` (`0..1`), and `blendMode` fields are available on every branch:

```ts
type ImageSource =
  | { kind: "URL"; url: string }
  | { kind: "BASE64"; bytesBase64: string }
  | { kind: "HASH"; imageHash: string };

type PaintInput =
  | {
      type: "SOLID";
      color: RGB;
      boundVariables?: { color: VariableAlias };
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    }
  | {
      type:
        | "GRADIENT_LINEAR"
        | "GRADIENT_RADIAL"
        | "GRADIENT_ANGULAR"
        | "GRADIENT_DIAMOND";
      gradientTransform: Transform;
      gradientStops: Array<{
        position: number;
        color: RGBA;
        boundVariables?: { color: VariableAlias };
      }>;
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    }
  | {
      type: "IMAGE";
      source: ImageSource;
      scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
      imageTransform?: Transform;
      scalingFactor?: number;
      rotation?: 0 | 90 | 180 | 270;
      filters?: {
        exposure?: number;
        contrast?: number;
        saturation?: number;
        temperature?: number;
        tint?: number;
        highlights?: number;
        shadows?: number;
      };
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    }
  | {
      type: "VIDEO";
      videoHash: string; // reuse an existing hash; this release does not import video
      scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
      videoTransform?: Transform;
      scalingFactor?: number;
      rotation?: 0 | 90 | 180 | 270;
      filters?: ImageFilters;
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    }
  | {
      type: "PATTERN";
      sourceNodeId: string;
      sourceNodeName: string;
      tileType: "RECTANGULAR" | "HORIZONTAL_HEXAGONAL" | "VERTICAL_HEXAGONAL";
      scalingFactor: number;
      spacing: { x: number; y: number };
      horizontalAlignment: "START" | "CENTER" | "END";
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    };
```

Validation rules:

- Color channels, gradient-stop positions, opacity, and every image-filter value are finite and within their Figma ranges. Gradient stops contain at least two entries and are ordered by non-decreasing position.
- `Transform` is exactly two rows of three finite numbers. Unknown paint keys fail at the MCP boundary rather than passing through to Figma.
- `imageTransform`/`videoTransform` apply only to `CROP`; `scalingFactor` applies only to `TILE` and must be positive; rotation is accepted only where Figma supports it.
- `URL` and `BASE64` create a new Figma image; `HASH` resolves an existing image with `figma.getImageByHash`. A missing/invalid source fails before the target paint array is assigned.
- VIDEO accepts only a non-empty existing `videoHash`; no video import or hash-discovery path is added. Figma remains the final validator because the pinned Plugin API has no `getVideoByHash` equivalent.
- Pattern scaling is positive and spacing vectors are finite. Pattern sources are resolved and exact-name-verified inside the connected scope, then applied through `setFillsAsync`/`setStrokesAsync` so Figma loads the source correctly. A pattern source is read but never mutated.
- Strict `boundVariables.color` is accepted on solid paints and gradient stops so a complete array can round-trip bindings without data loss. Resolve every alias ID before mutation and require a COLOR variable. `node_bind_variable` remains the preferred simpler tool for changing an ordinary node fill/stroke binding; paint aliases exist here for lossless stack replacement and gradient-stop bindings.
- Paint readback is normalized to the same write-ready union: an IMAGE returns `source: { kind: "HASH", imageHash }` rather than URL/base64 data, and a PATTERN resolves `sourceNodeName` alongside `sourceNodeId`. Apply this normalizer consistently to write results, `node_info` `fills`/`strokes`, and styled-text-segment fills. Read-only metadata is emitted separately and never mixed into `PaintInput`.

#### `node_set_fill`

The future canonical input is:

```ts
{
  nodeId: string;
  nodeName: string;
  fills: PaintInput[]; // ordered complete replacement; [] clears
}
```

Rules:

- The legacy mutually exclusive `r/g/b/a`, `image`, and `clear` fields leave the public schema in this major-shape release. A single solid or image is represented as a one-element `fills` array.
- The target must implement `MinimalFillsMixin`; `figma.mixed` text fills are not treated as a concrete array.
- On a `TEXT` node with mixed range fills, reject whole-node fill replacement with `TEXT_HAS_MIXED_FILLS` and direct the caller to `node_info.styledTextSegments` plus ranged `text_set_style`. This prevents accidental destruction of intentional per-range color.
- Resolve and validate every image/pattern source and every paint before assigning any fill. Use `setFillsAsync` when the stack contains a pattern; otherwise assign the complete immutable array once.
- Return the complete canonical resulting fill array and resulting `fillStyleId`, making any literal-override effect on a linked style visible.

#### `node_set_stroke`

```ts
{
  nodeId: string;
  nodeName: string;
  strokes?: PaintInput[]; // ordered complete replacement; [] clears
  strokeWeight?: number;  // uniform, >= 0
  individualStrokeWeights?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  strokeCap?:
    | "NONE"
    | "ROUND"
    | "SQUARE"
    | "ARROW_LINES"
    | "ARROW_EQUILATERAL"
    | "DIAMOND_FILLED"
    | "TRIANGLE_FILLED"
    | "CIRCLE_FILLED";
  strokeJoin?: "MITER" | "BEVEL" | "ROUND";
  strokeMiterLimit?: number;
  dashPattern?: number[]; // [] returns to a solid stroke
}
```

Rules:

- At least one stroke field is required. Omitted fields remain unchanged.
- `strokeWeight` and `individualStrokeWeights` are mutually exclusive. The individual form requires all four sides, all weights are finite and non-negative, and unsupported node types fail before paint replacement.
- `strokeAlign`, `strokeJoin`, and `dashPattern` require `MinimalStrokesMixin`; `strokeCap` and `strokeMiterLimit` require `GeometryMixin`. `strokeMiterLimit` requires an effective `MITER` join.
- Every dash/gap value is finite and non-negative. The plugin returns Figma's normalized pattern rather than assuming the submitted array is unchanged.
- As with fills, preflight every source and geometry field before mutation and use `setStrokesAsync` for pattern paints. When both paints and geometry are supplied, submit the paint array first so an API-only VIDEO hash refusal cannot leave geometry fields applied.
- Return the complete resulting strokes, style ID, uniform/mixed or per-side weights, align, cap, join, miter limit, and dash pattern.

Variable-width profiles, dynamic/brush strokes, custom brush loading, and video import are not included in this requirement. They have separate asset-loading and destructive-interaction semantics and must not be implied by the general `PaintInput`/stroke-geometry wording above.

#### Paint acceptance criteria

- One call can set ordered multi-paint solid/gradient/image/pattern stacks, and an empty array clears the stack.
- Invalid paint N prevents paints 0..N-1 and all stroke geometry fields from mutating.
- Existing image hashes can be reused without retransmitting bytes; URL/base64 branches retain current format, size, CORS, and auto-resize recovery guidance.
- Uniform and per-side stroke weights no longer default or clear omitted values accidentally.
- Fill/stroke readback round-trips through `node_info` into the strict write schema except for explicitly read-only metadata and excluded advanced stroke/video-import features.

### 18.2 Expose intrinsic image dimensions

#### Write results

For every `IMAGE` paint resolved by `node_set_fill` or `node_set_stroke`, call `Image.getSizeAsync()` before target mutation and return:

```ts
imageDimensions: Array<{
  paintField: "fills" | "strokes";
  paintIndex: number;
  imageHash: string;
  intrinsicSize: { width: number; height: number }; // Figma-stored pixels
  aspectRatio: number; // width / height
  sourceSize?: { width: number; height: number }; // decoded pre-resize upload
  wasResized: boolean;
}>;
```

`intrinsicSize` always means the dimensions of the image resource Figma actually stores and renders. When the MCP server downsizes oversized base64 PNG/JPEG input, `sourceSize` reports the decoded pre-resize dimensions and `wasResized` is true. For URL and reused-hash inputs, omit `sourceSize` unless it is independently known; never label guessed dimensions as intrinsic.

#### Existing-image reads

Add this optional flag to `node_info`:

```ts
resolveImageDimensions?: boolean;
```

Rules:

- The flag requires `properties` to include `fills`, `strokes`, or both. Otherwise schema/refinement failure gives the exact corrected request.
- For each returned node, inspect IMAGE paints only, deduplicate hashes for API calls, resolve with `figma.getImageByHash`, and await `getSizeAsync()`.
- Add the same `paintField`, `paintIndex`, `imageHash`, `intrinsicSize`, and `aspectRatio` entries under that node's `properties.imageDimensions`. Do not include image bytes.
- The flag works in direct `TREE` and `MATCHES` results without consulting current selection/page. It follows the selected result mode's caps and concurrency limits.
- A missing/unloadable hash does not fabricate zero dimensions. Return it under `unresolvedImageHashes` with an actionable per-hash reason while preserving dimensions that did resolve.
- Dimensions are metadata only. Neither read nor paint write resizes, crops, or transforms the target node. The caller may use the returned size/aspect ratio in a subsequent explicit `node_transform` call.

#### Image-dimension acceptance criteria

- New URL/base64 images and reused hashes return positive integer intrinsic width/height from `getSizeAsync()`.
- Auto-resized base64 input distinguishes original source dimensions from stored intrinsic dimensions.
- Existing fill and stroke image paints expose identical dimensions through `node_info`.
- Repeated hashes are resolved once per command but retain every paint-index reference in output.
- Missing image resources produce explicit unresolved entries and never silently report guessed or node-frame dimensions.

---

## 19. `node_combine`: group and boolean structural operations (P0)

### Purpose and hard cutover

Replace `node_group` with one explicit structural-combine tool. `GROUP`, `UNION`, `SUBTRACT`, `INTERSECT`, and `EXCLUDE` all create a new container under an exact parent and reparent the supplied nodes into it. Boolean combinations preserve editable child nodes; they are not the lossy geometry conversion performed by `node_flatten`.

The rename is a hard cutover. There is no `node_group` alias and no standalone boolean tool. Existing group callers add `operation: "GROUP"` plus the exact shared parent identity; the new contract never infers a parent or operation from selection, current page, node order, or omission.

### Discovery and migration workflow

Use the parent tuple from a prior `page_info` `MATCHES` result or `node_info` `MATCHES` result when available. For callers that have only the input IDs/names, the exact selection-independent discovery sequence is:

1. Call `node_info({ nodeIds, properties: ["parent"], maxDepth: 0 })`. Require every returned `properties.parent` ID to be identical and non-null.
2. Call `node_info({ nodeIds: [parentId], maxDepth: 1 })`. The root entry supplies `parentNodeName`; its immediate `children` supply the current sibling order needed to choose or omit `index`.
3. Pass the discovered identities back verbatim. A structured match-result path tuple is authoritative; do not parse a human-formatted path string or choose a parent/index from current page or selection state.

This is discovery before mutation, not write-failure recovery. Once `node_combine` is called, any parent mismatch error must include the observed exact parent identities so one corrected retry or explicit reparent prerequisite does not require another read.

### Contract

```ts
type NodeCombineOperation =
  | "GROUP"
  | "UNION"
  | "SUBTRACT"
  | "INTERSECT"
  | "EXCLUDE";

type NodeCombineInput = {
  operation: NodeCombineOperation;
  nodes: Array<{
    nodeId: string;
    nodeName: string;
  }>;
  parentId: string;
  parentNodeName: string;
  index?: number; // native parent insertion index; omit to append
  name?: string;
};
```

Schema rules:

- The object and every node item are recursively strict.
- `operation` is always required. It has no default, and no legacy omission path may imply `GROUP`.
- `nodes` contains at least two entries for every operation and rejects duplicate IDs at the MCP boundary. Although Figma can technically group one node, the future tool retains the current project's meaningful-combination minimum.
- `parentId` and every `nodeId` are required non-empty strings. `parentNodeName` and every `nodeName` are required verbatim strings and may be empty only when the corresponding live Figma name is empty; do not trim or normalize exact-name operands. Optional result `name` follows the existing grouping/rename string policy rather than introducing a stricter combine-only rule.
- `index`, when supplied, is a non-negative integer. Plugin validation applies the exact upper bound established by the pinned live index probe.

### Complete structural preflight

Before invoking any native combine API:

- Resolve every input and the parent, then validate the complete plan. A predictable failure for any item aborts with zero mutation.
- Exact-name-verify every node and the parent. Enforce node permission and scope for all identities.
- Require an appendable, in-scope, unlocked parent that is not an `INSTANCE` and is not inside an instance.
- Require every input to be reparentable by Figma, unlocked, outside instance interiors, and not the connected scope root. Reject `DOCUMENT`, `PAGE`, removed/unavailable nodes, and any other node class the pinned API cannot combine.
- Require every input's current parent to equal `parentId`. The first release does not hide cross-parent reparenting. A mixed/wrong-parent refusal lists each actual `{ parentId, parentName }`, identifies the desired shared parent, and supplies exact `node_insert_child` prerequisite calls where that recovery is legal.
- Reject the parent itself as an input, any ancestor/descendant pair, duplicate logical identities, and any cycle-producing plan before the native call.
- Snapshot each input's parent, sibling index, absolute transform/bounds, and ID. Snapshot the destination parent's child order so post-operation placement can be verified.
- Validate `index` against the parent child list using the exact semantics established by the pinned native probe. Omission means append/topmost exactly as the native API does; do not invent a UI-relative default.
- Preserve the supplied `nodes` order verbatim in the native argument. Input order is structural data, especially for `SUBTRACT`, and must never be sorted by ID, name, x/y, or current sibling index.

### Recovery-bearing errors

Structural refusals use stable codes and return complete repair operands:

| Condition | Required `details` and recovery |
| :- | :- |
| Missing/invalid `operation` | Accepted five-value enum and a corrected call skeleton; never guess `GROUP` |
| Duplicate input | Every duplicate ID and request index plus `correctedNodes` with later duplicates removed; if fewer than two unique nodes remain, state that another explicit node is required |
| Unsupported/non-reparentable input | Offending request index, ID, exact name/type, accepted types for the selected operation, and the nearest safe alternative where one exists |
| Ancestor/descendant or parent-as-input conflict | Both request indexes and exact identities, their relationship, and an explicit statement that the hierarchy must be restructured before retrying |
| Wrong/mixed parent | Desired parent identity, every input's observed parent identity, and ordered `node_insert_child` prerequisite calls when scope and hierarchy checks prove those calls legal |
| Invalid `index` | Supplied value, pinned interpretation, current parent child count/order, valid inclusive range, and a corrected nearest-boundary call |
| Name, scope, lock, instance, or scope-root refusal | Offending request index/role (`INPUT` or `PARENT`), exact observed identity/state, and the existing central recovery instruction |
| Native invariant drift or partial mutation | Complete `before` and `resulting` parent/index/child state, any newly observed container, `partialMutation: true`, and no claim that an automatic rollback occurred |

An error must not merely report "cannot combine nodes." When multiple predictable inputs are invalid, validate the full plan and return all independently actionable item failures in request order unless revealing a later check would violate scope policy.

### Native operation and ordering probe

After preflight, call exactly one native API:

| `operation` | Native API | Result type |
| :- | :- | :- |
| `GROUP` | `figma.group(nodes, parent, index?)` | `GROUP` |
| `UNION` | `figma.union(nodes, parent, index?)` | `BOOLEAN_OPERATION` |
| `SUBTRACT` | `figma.subtract(nodes, parent, index?)` | `BOOLEAN_OPERATION` |
| `INTERSECT` | `figma.intersect(nodes, parent, index?)` | `BOOLEAN_OPERATION` |
| `EXCLUDE` | `figma.exclude(nodes, parent, index?)` | `BOOLEAN_OPERATION` |

Before release, run a live probe against pinned `@figma/plugin-typings`/Figma behavior for all five operations and lock these observations in tests and tool descriptions:

- whether resulting child order exactly follows the supplied array;
- which supplied position acts as the visual base for `SUBTRACT`;
- whether `index` is interpreted against the pre-operation parent list and how indices spanning consumed children resolve;
- whether child IDs and absolute placement remain stable for every branch.

The native order/index probe is release-blocking. Do not document a subtract base or placement rule from UI convention or inference. If pinned behavior cannot preserve a deterministic caller-visible ordering contract, stop the release and revise this section rather than silently reorder inputs.

Set `name` only after the native call returns. Then read back the result type, `booleanOperation` where applicable, parent/index, actual child order, IDs, names, and absolute placement. A mismatch against a pinned invariant is an explicit failure/warning contract, never hidden normalization. If naming or readback throws after the structural call succeeds, report the created container and resulting hierarchy as a partial mutation; do not present the call as an ordinary zero-mutation failure.

One native call reduces predictable partial-mutation risk but is not a transaction guarantee. If it throws unexpectedly, inspect all input parent/index/transform state and any observable new container, then return `partialMutation`, `before`, `resulting`, and `whatChanged`. Do not attempt an unverified automatic rollback.

### Output

```ts
{
  id: string;
  name: string;
  type: "GROUP" | "BOOLEAN_OPERATION";
  operation: NodeCombineOperation;
  booleanOperation?: "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE";
  parentId: string;
  index: number;
  children: Array<{
    id: string;
    name: string;
    index: number;
  }>;
  childCount: number;
  partialMutation?: boolean;
  warnings?: string[];
}
```

The returned `operation` is always present. `booleanOperation` is present only for `BOOLEAN_OPERATION`; returning it for `GROUP`, or omitting it for a boolean result, is a contract failure.

Annotations:

```ts
{
  destructiveHint: true,
  openWorldHint: true
}
```

Do not set `idempotentHint: true`. Repeating the same call after success consumes nodes whose parent has changed and is a different structural operation. The destructive hint applies to `GROUP` as well as boolean branches because the combined public tool has one static annotation and every branch changes hierarchy and z-order.

### Ungroup compatibility probe

The pinned typings allow `figma.ungroup(node: SceneNode & ChildrenMixin)`, which includes both `GROUP` and `BOOLEAN_OPERATION`, but the current local handler hard-rejects every type except `GROUP`.

- Live-verify that ungrouping each boolean result preserves child IDs, absolute placement, and expected sibling order.
- If the probe passes, expand `node_ungroup` in the same release to accept `GROUP | BOOLEAN_OPERATION`, return promoted children in resulting order, and document it as the structural inverse nearest to `node_combine`.
- If the probe fails, keep `node_ungroup` restricted to `GROUP` and explicitly state that boolean combinations have no verified MCP inverse. Do not claim reversibility from the broad TypeScript signature alone.
- In either case, retain `node_ungroup` scope-root, scope, exact-name, lock, and instance-interior gates and add result-type-specific tests.

Changing `booleanOperation` directly on an existing `BOOLEAN_OPERATION` remains out of scope. A caller that wants a different operation must use a verified ungroup/recombine workflow when available; the server does not silently rebuild the node behind a property setter.

### Acceptance criteria

- Emitted schema requires one of the five operation values, at least two unique exact node identities, and an exact parent; omission never defaults to `GROUP`.
- The `GROUP` branch replaces current grouping behavior and returns a normalized result without retaining `node_group` registration or dispatch.
- All four boolean branches invoke the matching native API once after the same complete structural preflight.
- Duplicate, missing, wrong-name, locked, out-of-scope, scope-root, instance-interior, unsupported, ancestor-related, mixed-parent, wrong-parent, and invalid-index calls produce zero mutation and actionable per-item details.
- The supplied node order reaches the native call unchanged, and pinned live tests define actual child order, subtract base, parent index, ID, and placement behavior.
- The documented two-read `node_info` workflow yields the exact shared parent name and current sibling order without consulting current page or selection.
- GROUP and boolean results preserve input child IDs and report actual result type, operation, parent/index, and child order.
- The static destructive/no-idempotent annotation policy is asserted in `tools/list` tests.
- Unexpected native drift or partial mutation is disclosed with exact before/resulting structural state.
- `node_flatten` remains a separate explicitly lossy alternative, and tool-selection guidance distinguishes flatten, combine, and ungroup.

---

## 20. Cross-cutting safety and error contract (P0)

### Gate matrix additions

`SAFETY.md` must add or replace rows as follows:

The existing `instance_get_overrides`, `instance_set_overrides`, `instance_set_property`, and `node_group` rows must be removed rather than retained as aliases. The registered-tool-to-safety-row consistency test must fail if any retired command remains in either direction.

| Tool | Required plugin-side controls beyond type-specific validation |
| :- | :- |
| `page_info` matching/font discovery | Existing explicit-page/all-document read rules; strict `SUMMARY`/`MATCHES`/font-mode exclusion; non-empty match filter; same-run typography matching; exact raw-ID direct variable-binding matching; cached Text Style/variable enrichment; bounded match/evidence output; one-page-at-a-time loading and fail-closed completeness for `USED`; editor-session scope for `AVAILABLE` |
| `node_info` filtering/computed metadata | Existing explicit-root/read-scope rules; strict `TREE`/`MATCHES` dispatch; same-run font/Text Style matching; exact raw-ID direct variable-binding and field matching; shared complete binding extraction; raw-ID/link-state behavior; cached and type-checked Text Style resolution with fail-closed name/key completeness; bounded match evidence; styled-field/range validation and cap; image-dimension flag/property dependency; bounded hash resolution |
| `node_transform` | Existing node-write stack; complete affine-support/layout preflight; rotation support check; `arcData` requires exact ELLIPSE type, current-state merge, strict radians/radius validation, and zero predictable mutation before the entire combined plan passes |
| `node_rename` PAGE | Existing node-write and exact-name stack; target must be the exact active page-scope root; reject node scope, another page's scope, and page dividers |
| `node_set_layout` | Node-write stack; target/parent mixin checks; effective-mode validation; grid bounds/occupancy preflight; active-constraint, sizing, viewport, and style-link checks |
| `node_set_fill` | Node-write stack; complete strict paint validation; image/hash/pattern-source resolution; pattern source scope+name; mixed-text-fill guard |
| `node_set_stroke` | Node-write stack; complete strict paint/source validation; uniform/individual weight exclusion; per-property mixin checks |
| `node_set_appearance` | Node-write stack; per-field support; mask parent-in-scope, bounded-container, sibling-impact, and instance-interior guards |
| `text_set_style` | Node-write stack; TEXT/TEXT_PATH compatibility; complete font/range preflight |
| `text_set_content` range | Existing whole-batch node-write stack; unique targets; TEXT/TEXT_PATH; paired UTF-16 range; exact expected substring; inheritance/font preflight before item one |
| `create_text` TEXT_PATH | Source scope+name+lock; source parent scope; no instance interior; clone cleanup |
| `create_shape` LINE | Existing creation parent stack; LINE branch checks |
| `create_svg` VECTOR_PATHS | Existing creation parent stack; vector-path validation and cleanup |
| `create_region` | Creation parent stack; per-region parent/type checks and cleanup |
| `variable_manage` collection/modes/code syntax | Variable permission; exact current asset names; remote block; stable collection/mode/variable identity readback |
| `variable_delete` MODE | Variable permission; exact names; remote block; explicit-mode consumer scan |
| `instance_swap_component` | Node-write stack; INSTANCE target; destination identity; nested target allowed; remote destination allowed |
| `instance_detach` | Node-write stack; scope-root block; nested-instance block; structural lock checks |
| `instance_remove_overrides` | Node-write stack; one exact INSTANCE target; locked-subtree and override-ID containment checks; canonical direct-manifest validation and stale comparison; nested/scope-root target allowed; remote component definition allowed because only the local instance mutates |
| `component_manage_property` | Existing local component/set write stack; exact canonical `propertyId` for EDIT; authoritative API-returned key captured after ADD/EDIT |
| `component_delete_property` | Existing local component/set write stack; exact canonical `propertyId`; definition snapshot captured before deletion |
| `instance_set_component_properties` | Existing instance write stack; exactly one INSTANCE target; every exact-map key/value and `VariableAlias` preflighted before one native setter call; post-error drift readback |
| `node_bind_component_property` | Node-write stack; local owner; canonical property/type/field checks; instance-interior block |
| `node_combine` | Full structural node-write stack for every input; exact in-scope appendable parent; at least two unique reparentable nodes; same-parent, scope-root, lock, instance-interior, ancestor/cycle, supplied-order, and parent-index preflight before one native group/boolean call |
| `node_ungroup` compatibility expansion | Retain its existing exact-name, scope-root, scope, lock, and instance-interior gates; accept `BOOLEAN_OPERATION` only if the pinned live probe verifies child identity, absolute placement, and sibling order, otherwise retain the current `GROUP`-only contract |

### Structured error requirements

New conditions need stable central codes. The final taxonomy may consolidate causes, but it must distinguish at least:

- match filter missing, match root unavailable, result-mode/filter mismatch, conflicting `page_info` modes, invalid font filter, invalid Text Style filter branch, invalid/duplicate/empty variable-binding IDs or fields, incomplete direct-binding extraction, unresolved/non-TEXT style identity during name/key matching, invalid font-discovery scope, and incomplete used-font page scan;
- requested font unavailable, including its exact family/style pair and bounded assignable candidates;
- styled-text field unavailable, range invalid, segment limit invalid, or image-dimension property dependency missing;
- image source/hash invalid, image dimensions unavailable, pattern source outside scope, or paint branch invalid;
- page rename attempted without the exact target page as the active page-scope root;
- unsupported mutable property;
- empty/invalid ellipse arc patch, arc target not ELLIPSE, non-finite arc angle, radius outside `0..1`, or unexpected combined-transform partial mutation;
- invalid/inactive constraints, invalid parent layout state, incompatible sizing bounds, invalid grid tracks, or occupied grid cells;
- mask not contained and mask has no affected sibling;
- incomplete, invalid, surrogate-splitting, stale-content, or unavailable-inheritance text range;
- property unavailable on `TEXT_PATH`;
- invalid text-path source or segment;
- region field not applicable to selected type;
- variable collection name mismatch/remote rename and variable mode not found, still in use, last remaining, or plan-limited;
- nested detach and scope-root detach;
- malformed/duplicate expected override manifest, override ID outside the target, locked override subtree, direct override state changed, or override removal readback mismatch;
- component destination mismatch;
- component-property owner missing, canonical property ID stale, or type/field mismatch;
- unknown exact instance-property key, invalid property value, incompatible variable alias, forbidden multi-instance shape, or native property-map drift;
- combine operation missing/unsupported, duplicate or non-reparentable input, ancestor conflict, wrong/mixed parent, parent identity mismatch, invalid insertion index, pinned order/subtract-base invariant mismatch, or unexpected native structural partial mutation.

Every refusal includes a `details` object with machine-usable operands and accepted values. Example:

```ts
{
  code: "TEXT_RANGE_SPLITS_SURROGATE",
  message: "text_set_style start=5 splits a UTF-16 surrogate pair in 'Title'. Use start=4 or start=6 and retry.",
  details: {
    nodeId: "10:24",
    suppliedStart: 5,
    lowerBoundary: 4,
    upperBoundary: 6
  }
}
```

### Annotation policy

| Tool class | Annotation requirement |
| :- | :- |
| Reads | `readOnlyHint: true` |
| Absolute setters/binders | `idempotentHint: true` |
| Creation | no idempotent hint; `openWorldHint: true` |
| `instance_set_component_properties` | `idempotentHint: true`, `openWorldHint: true` |
| `instance_swap_component` | explicit `destructiveHint: true`, `idempotentHint: true` |
| `instance_detach` | explicit `destructiveHint: true`, no idempotent hint |
| `instance_remove_overrides` | explicit `destructiveHint: true`, no idempotent hint |
| `variable_delete` | retain explicit `destructiveHint: true` |
| `node_combine` | explicit `destructiveHint: true`, `openWorldHint: true`, no idempotent hint for every operation including `GROUP` |

MCP annotations are advisory, not enforcement. Plugin-side guards remain authoritative.

---

## Schema design requirements

1. All new/changed top-level and nested objects are strict. Unknown keys fail; they are never silently stripped.
2. Action/type branches are represented as discriminated unions in the emitted JSON schema where the SDK supports them. If an SDK limitation requires `superRefine`, descriptions must carry explicit `REQUIRED for ...` markers and emitted-schema tests must prove them.
3. Every multi-field setter requires at least one mutation field.
4. Mutually exclusive modes are checked at the MCP boundary and again in the plugin because schema validation is not a safety boundary.
5. Numeric limits use schema constraints: opacity, positions on a path, and ellipse `innerRadius` in `[0,1]`, positive dimensions, integer text indices/mode counts, finite transform/arc numbers, and non-empty arrays where required.
6. Enum values come from the pinned `@figma/plugin-typings` surface or a generated allowlist where drift is likely.
7. Tool descriptions explain the nearest alternatives that models commonly confuse: visible versus opacity, frame versus section versus slice, SVG versus vector paths, degree-based node rotation versus radian ellipse arc angles, component swap versus detach versus direct-override removal, component-property writes versus direct node overrides, variable unbind versus mode clear, direct node variable-binding matching versus `variable_list` impact discovery, whole-text versus range editing, intrinsic image pixels versus node size, literal paints/grids versus shared styles, node-level font matching versus aggregate/available font discovery, Text Style linkage versus effective formatting conformance, and editable group/boolean combinations versus lossy flattening.
8. `component_manage_property` and `component_delete_property` distinguish creation names (`propertyName`) from existing canonical identities (`propertyId`) in both schema names and descriptions.
9. `instance_set_component_properties` requires one `nodeId`, one `nodeName`, and one non-empty exact-key `properties` map. It exposes no display-name compatibility branch and no instance/target array. A `VARIABLE_ALIAS` object is strict and cannot carry extra keys.
10. `node_info.styledTextSegments.fields` is an enum-backed non-empty array, and its optional `start`/`end` pair cannot be supplied partially.
11. The unchanged `node_rename` input description explicitly states that a `PAGE` ID is accepted only for the exact page-scope root and gives `page_info` as the source of its current name.
12. `PaintInput`, `LayoutGridInput`, and `GridTrackInput` are discriminated strict unions. Paint-type, scale-mode, layout-mode, and track-type fields that do not apply are rejected rather than ignored.
13. `node_set_fill.fills` is always present and may be empty; `node_set_stroke` requires at least one mutation field and makes uniform and individual weights mutually exclusive.
14. The whole/range `text_set_content` item union is visible in emitted JSON schema. A ranged item requires `start`, `end`, and `expectedText` together and forbids a second range for the same target.
15. `node_info.resolveImageDimensions: true` requires `properties` to contain `fills` or `strokes`; its schema description distinguishes intrinsic image pixels from node dimensions.
16. `variable_manage.RENAME_COLLECTION` requires `collectionId`, current `collectionName`, and new `name`, while forbidding variable/mode fields.
17. `page_info` emits a strict exclusive union for default/explicit `SUMMARY`, explicit `MATCHES`, `fontDiscovery.source: "USED"`, and `fontDiscovery.source: "AVAILABLE"` modes. `MATCHES` requires a strict non-empty `filter`; `USED` permits explicit `pageIds`; `AVAILABLE` forbids them; both font branches forbid result/filter/property fields. `node_info` separately emits a strict default/explicit `TREE` versus explicit `MATCHES` union.
18. `FontName` inputs and outputs always carry an exact non-empty `{ family, style }` pair. Tool descriptions distinguish used fonts from editor-session available fonts and state that discovery cannot install a font.
19. `instance_remove_overrides.expectedOverrides` is required and is an array of strict `{ id, overriddenFields }` entries. The schema requires non-empty strings and non-empty field arrays; plugin validation rejects duplicate IDs or duplicate fields before deterministic sorting and returns the exact corrected one-target call on stale state.
20. `node_transform.arcData` is a strict non-empty patch. The emitted schema and descriptions distinguish degree `rotation` from radian `startingAngle`/`endingAngle`, constrain `innerRadius` to `0..1`, and include `arcData` in the top-level at-least-one-mutation refinement.
21. `node_combine.operation` is required with exactly five values and no default. Its schema requires at least two unique exact node identities plus one exact parent identity, makes the supplied node order semantically significant, and rejects unknown fields in the top level and every node item.
22. `NodeFilter.font` is strict and non-empty. `NodeFilter.textStyle` emits four strict discriminated branches for `ID`, `KEY`, `NAME`, and `LINK_STATE`; branch-specific fields cannot be combined. Descriptions state that font and Text Style predicates apply to one run, style names are non-unique discovery values, and linkage does not prove visual conformance.
23. `NodeFilter.variableBinding` is a strict object with required, non-empty, duplicate-free `variableIds` and optional non-empty, duplicate-free `fields`. `fields` is an enum generated from the pinned `VariableBindableNodeField` and `VariableBindableTextField` literals plus `fills`, `strokes`, `effects`, `layoutGrids`, `componentProperties`, and `textRangeFills`; unknown or stale field names fail with the accepted values and a corrected-call example. The schema accepts no name, key, value, collection, mode, inferred, reaction, alias-traversal, or link-state branch.
24. Variable-binding evidence emits strict resolved/unresolved variable branches plus a strict `NODE` / `COMPONENT_PROPERTY_DEFINITION` / `INSTANCE_COMPONENT_PROPERTY` location union. A component-property location requires its exact canonical `propertyId`; a `NODE` location forbids it. Descriptions state that ID and field arrays use OR semantics, separate `NodeFilter` predicates use AND semantics, and variable-binding conjunction with typography is node-level rather than same-run.

---

## Implementation plan

### Phase 1 - Contract scaffolding and migration map

- Ratify the future release number; the former empty `variable_manage` item is resolved as `RENAME_COLLECTION`.
- Define shared strict schemas/enums for the `page_info` and `node_info` result-mode unions, `NodeFilter`, `FontFilter`, discriminated `TextStyleFilter`, `VariableBindingFilter`, pinned bindable fields, strict binding locations, exact `FontName`, match evidence, blend mode, paints/image sources, stroke geometry, layout/grid fields, constraints, `ArcData` fields/patches, text paints/decorations, styled-text fields, region branches, variable actions/modes, canonical component-property IDs, exact instance-property values, canonical direct-override manifests, component destinations, `NodeCombineOperation`, and the explicit structural parent/index plan.
- Add old-to-new and removed-tool migration tests. Remove the five renamed old names plus `instance_get_overrides` and `instance_set_overrides` from expected tool lists; register only the four additions named in Release identity.
- Add central structured-error codes and playbook entries, including result-mode/filter mismatch, invalid font/Text Style/variable-binding predicates, incomplete Text Style name/key resolution, incomplete direct-binding extraction, font mode/scope/availability, incomplete page traversal, paint/image, grid/parent state, ellipse arc type/value/unit recovery, combined-transform partial disclosure, stale text range, collection rename, page-scope rename, exact component-property maps, malformed/stale override-manifest recovery, and structural-combine operation/input/parent/index/order/partial-mutation paths, before handlers depend on them.

### Phase 2 - Read filtering/matching and font-discovery surface

- Implement strict `TREE`/`MATCHES` and `SUMMARY`/`MATCHES` dispatch plus bounded match output in `nodeReaders.ts`.
- Replace the loose legacy filter evaluator with one shared predicate evaluator for page matching, node matching, and pruned-tree reads. Do not retain a hidden `search` route or singular `type`/`layoutMode` aliases.
- Implement one typography-run extractor shared by `filter.font`, `filter.textStyle`, used-font discovery, and styled-text reads. Use concrete node-level values for uniform/empty text and one minimal `getStyledTextSegments()` call when a required field is mixed.
- Resolve and cache each distinct Text Style ID once per command for `KEY`/`NAME` matching; validate `TEXT` type, preserve raw-ID/link-state matching without resolution, fail closed on incomplete name/key resolution, and emit bounded exact match evidence.
- Implement one recursive direct-binding extractor shared by `filter.variableBinding` and the direct-binding portion of `variable_list` consumer scanning. It must cover every pinned `boundVariables` scalar/array/map branch plus component-property definition/value bindings, normalize exact locations, preserve raw IDs, deduplicate by `{ variableId, location }`, and exclude aliases-in-values, styles, inferred variables, reactions, and mode maps.
- Match `variableBinding` by raw exact ID and optional normalized field before resolving metadata. Cache `getVariableByIdAsync()` once per distinct matched ID for evidence only; emit `resolved: false` without failing or dropping the raw-ID match when enrichment is unavailable. Apply the same 50-entry category cap and exact-count/truncation rules as typography evidence.
- Broaden the `page_info` title/description and implement its strict `SUMMARY`/`MATCHES`/`USED`/`AVAILABLE` dispatch without changing ordinary summary reads.
- Implement `USED` traversal over explicit pages or all document pages, mixed-font segmentation and exact counts, a live availability cross-check, deterministic bounds, progress, and fail-closed page-load reporting.
- Implement `AVAILABLE` with a live `listAvailableFontsAsync()` call, editor-session scope, exact-pair deduplication, filtering, deterministic ordering, counts, and truncation.
- Implement `node_info.styledTextSegments` with native `getStyledTextSegments()` calls, bounded output, and preserved variable IDs. This prerequisite must ship before Phase 4 range editing.
- Make `node_info` the canonical instance-state read: for an exact `INSTANCE` request, serialize `mainComponent`, the complete direct `{ id, overriddenFields }[]` override manifest, and exact `componentProperties` without requiring a dedicated instance reader. Canonicalize override-manifest ordering in the same shared helper used by removal preflight.
- Implement opt-in image-dimension resolution with deduplicated `getImageByHash()`/`getSizeAsync()` calls and per-hash unresolved metadata.
- Preserve existing unfiltered direct-read/tree behavior and the documented pruned-tree ancestor semantics.
- Add progress, page-load failure, font-scan completeness, exact font counts, result/evidence/font/segment truncation, typography same-run behavior, variable-binding node-level conjunction, direct-binding extraction/evidence completeness, style/variable resolution behavior, ordering, duplicate-root, UTF-16 range, image-hash deduplication, and count tests.

### Phase 3 - Core node setters

- Add rotation and the strict existing-ellipse `arcData` patch to transform. Refactor the current sequential handler into complete affine/layout/arc preflight, snapshot requested state, apply the documented deterministic order, and return exact arc readback or unexpected partial-state disclosure.
- Add the explicit PAGE branch to `node_rename`, retaining the page ID as the scope anchor and refusing every scope mode except the exact linked page scope.
- Rename and expand layout across auto-layout flow, grid containers/children, sizing/positioning/bounds, constraints, clipping, overflow, and visual grids.
- Replace the fill/stroke convenience schemas with strict complete paint stacks; add stroke geometry, source preflight, mixed-text protection, and image-dimension write results.
- Rename and expand appearance.
- Add complete-call preflight helpers and mask propagation containment.
- Hard-replace `node_group` with `node_combine`. Refactor structural dispatch into one complete plan validator, preserve caller order into exactly one matching native group/boolean call, add normalized readback, and gate release on live parent-index, child-order, subtract-base, identity, and placement probes. Expand `node_ungroup` to boolean results only if its separate live compatibility probe passes.
- Update dispatcher permission and gate matrices before enabling handler routes.

### Phase 4 - Text

- Add the paired range schema and exact property matrix.
- Add the strict whole/range union to each `text_set_content` batch item, including `expectedText`, insertion/deletion, inheritance selection, and whole-batch preflight.
- Implement UTF-16 boundary validation plus discovery and loading of every exact font pair used by or requested for the affected text runs. The page/editor font inventory contract belongs to Phase 2.
- Validate requested pairs against the same live catalog semantics as `page_info.fontDiscovery`, return `FONT_NOT_AVAILABLE` candidates, and never silently substitute another font.
- Add TEXT_PATH compatibility to `text_set_style` and `text_set_content`.
- Test every schema field against its exact handler setter and readback, including unexpected delete/insert partial-failure disclosure.

### Phase 5 - Creation

- Add LINE, VECTOR_PATHS, TEXT_PATH, SECTION, and SLICE branches.
- Reuse the strict arc-field schema and validator in `create_shape` while preserving creation defaults separately from `node_transform`'s live-state merge semantics.
- Apply parent/source verification before creation.
- Use parent-first placement and cleanup-on-failure for every new branch.
- Replace `create_frame` references with `create_region` throughout docs, prompts, safety tables, and tests.

### Phase 6 - Variables

- Refactor `variable_manage` to strict action branches.
- Add code-syntax read/write/remove behavior, collection rename, and mode add/rename.
- Extend explicit mode maps with null clear.
- Replace `variable_delete` input with the target discriminator and add mode-consumer scanning.
- Refactor `variable_list` node-consumer scanning to reuse Phase 2's direct-binding extractor while retaining its separate style, alias, and prototype-reaction passes. Document that its broader variable-centric output and `NodeFilter.variableBinding`'s scoped node-centric output intentionally differ.

### Phase 7 - Components and instances

- First, complete canonical property identity end to end: capture ADD/EDIT return keys, require exact keys for EDIT/delete, and return replacement keys after rename.
- Hard-replace `instance_set_property` with `instance_set_component_properties`: one exact instance, one non-empty exact-key map, `VariableAlias` values, all-entry semantic preflight, one native setter call, exact before/resulting readback, and no multi-instance branch.
- Remove `instance_get_overrides` and `instance_set_overrides` from MCP registration, `FigmaCommand`/client command unions, dispatcher cases, handler exports, prompts (including the source-to-target override workflow), safety inventories, tests, guides, and generated output. Do not leave an internal compatibility route.
- Add `instance_remove_overrides` with the canonical expected-manifest precondition, one-target safety gates, one native `removeOverrides()` call, resulting-manifest readback, and post-error drift disclosure.
- Only after canonical IDs are available, add component-property binding/unbinding.
- Add swap and detach as separate dispatcher routes and handlers.
- Add override-diff reporting for swap and structural containment checks for detach.

### Phase 8 - Contract synchronization and release

- Update `README.md`, `SAFETY.md`, `CHANGELOG.md`, tool-selection/workflow/constraint/error-playbook guides, and their `figma-edit://guide/*` resource mirrors.
- Publish concrete migration examples for `node_info.filter.type`/`layoutMode` to strict plural fields, `TREE` versus `MATCHES`, font and Text Style consumer matching, exact-ID `variableBinding` matching, choosing `variableBinding` versus `variable_list.includeConsumers`, the plural one-instance component-property map, the `node_info` override read, each explicit alternative to the removed source-template transfer workflow, and `node_group` to `node_combine({ operation: "GROUP", ... })`. State where no behavior-preserving one-call migration exists.
- Regenerate `figma_plugin/code.js`; do not hand-edit it.
- Update tool-count, tool-list, strict-schema, permission-matrix, safety-contract, retired-command absence, and MCP-boundary tests for four additions, two removals, five renames, and net +2 tools.
- Run server and plugin type checks, generated-file checks, suppression checks, plugin build verification, version checks, and the full unit suite.
- Run live Figma smoke tests for every new Figma API path before release.

---

## Test strategy

### Schema tests

- Snapshot emitted `tools/list` contracts, not only local Zod objects.
- Assert each discriminator's required, optional, and forbidden fields.
- Assert `page_info` `SUMMARY`/`MATCHES`/`USED`/`AVAILABLE` exclusivity and `node_info` `TREE`/`MATCHES` exclusivity, including default modes, required filters/source, forbidden branch fields, `AVAILABLE` page-scope refusal, non-empty queries, and `maxResults` bounds.
- Assert `NodeFilter` is strict and non-empty; `font` requires family or style; `textStyle` emits exact `ID`/`KEY`/`NAME`/`LINK_STATE` branches; `variableBinding` requires unique exact IDs and permits only unique pinned fields; cross-branch fields, names/keys/modes under `variableBinding`, empty identity strings/arrays, duplicates, legacy singular keys, and the removed `search` field fail with corrected-call guidance.
- Assert match output exposes bounded `matchEvidence` with exact font pairs, strict resolved/unresolved Text Style reference branches, unlinked evidence, strict resolved/unresolved variable references, exact binding-location branches, exact unique counts, and `evidenceTruncated`.
- Assert all five old renamed names and both removed override tools are absent, all four additions are registered, and the total is exactly the expected net +2 surface.
- Assert `node_transform` includes `arcData` in its top-level at-least-one refinement; the patch is strict and non-empty; radius is `0..1`; and emitted descriptions label rotation as degrees and arc angles as radians with concrete numeric constants.
- Assert nested unknown keys fail.
- Assert every paint discriminator, image-source branch, stroke weight exclusion, layout/grid state refinement, and collection-rename branch.
- Assert whole/range `text_set_content` items, required `expectedText`, and duplicate-target rejection.
- Assert canonical `propertyId` requirements for component EDIT/delete and the strict `instance_set_component_properties` shape: one target, a non-empty exact map, strict aliases, and no singular/display-name or multi-instance branch.
- Assert `instance_remove_overrides` requires one exact target plus `expectedOverrides`, accepts an empty manifest, rejects malformed manifest entries and every source/target-array field (including a `null` source sentinel), and carries the required destructive annotation.
- Assert `node_info` styled-segment fields/range/cap and the image-dimension flag's paint-property dependency.
- Assert static annotations for all three destructive instance tools and the plural component-property setter.
- Assert `node_combine` requires one of all five operations with no default, at least two unique exact node identities, an exact parent, and a valid optional integer index; assert its recursively strict shape and static destructive/open-world/no-idempotent annotations.

### Plugin handler tests

- One success, one wrong-type failure, one exact-name failure, and one no-partial-mutation failure per branch.
- Readback matches the actual target after mutation.
- Cleanup tests inject a failure after creation and prove no orphan remains.
- Filter/matching tests cover `TREE` and `MATCHES`, explicit/default roots, pruned ancestors, node-level AND/OR predicates, uniform/empty/mixed `TEXT` and `TEXT_PATH`, font family-only/style-only/combined matching, exact/contains/case-sensitive behavior, used-but-unavailable font pairs, and complete traversal/count/truncation metadata.
- Text Style filter tests cover raw ID, exact key, exact/partial duplicate names, linked/unlinked runs, local and remote styles, one-resolution-per-ID caching, resolution only after cheaper predicates identify candidate runs, unresolved/non-TEXT fail-closed behavior for name/key, raw-ID matching without resolution, same-run font/style conjunction, exact evidence ordering/deduplication/caps, and proof that linkage is not reported as visual conformance.
- Variable-binding filter tests cover one/multiple exact IDs, optional field narrowing, scalar and array node fields, fills/strokes/effects/layout grids/text-range fills, component-property definition/value maps, local/remote/unresolvable IDs, one-enrichment-attempt-per-ID caching, raw-ID matches without enrichment, deterministic location ordering/deduplication/caps, and exact match counts. Negative cases prove that aliases-in-values, shared-style bindings, inferred variables, reactions, and explicit/resolved modes do not match; combined typography tests prove the documented node-level rather than same-run conjunction.
- Shared-extractor parity tests prove that, for the same page or document scan scope and IDs, `NodeFilter.variableBinding` and the direct-binding subset of `variable_list.nodeConsumers` identify the same nodes/fields while `variable_list` alone retains style, alias, and reaction consumer categories. Rooted subtree matching remains exclusive to `NodeFilter`.
- Font-discovery tests cover `USED` and `AVAILABLE`, explicit/all-page scope, uniform and mixed runs, distinct-node/segment/page counts, exact-pair availability, filtering, deduplication, ordering, bounds, truncation, and fail-closed page loads.
- Text-font tests cover exact replacement/default pairs, missing-font candidates and corrected discovery calls, no fallback, mixed fonts, range boundaries, and TEXT_PATH subsets.
- Styled-segment/content tests cover mixed properties, UTF-16 offsets, requested-field segmentation, aliases, TEXT_PATH restrictions, truncation metadata, guarded replacement/insertion/deletion, stale expected text, inheritance sides, and whole-batch preflight.
- Layout tests cover horizontal/vertical/wrap/grid modes, grid tracks, occupied-cell shrink/collision, child placement/span, sizing/grow/align/absolute positioning, min/max bounds, active constraints, clipping, overflow, and literal layout grids.
- Paint tests cover multi-paint order, all strict paint branches, color-variable aliases, clear arrays, reused/imported images, pattern source verification, mixed text refusal, linked-style readback, full preflight, and every common stroke geometry field.
- Image tests cover stored/source dimensions, server resize, fill/stroke references, repeated-hash deduplication, missing hashes, and `TREE`/`MATCHES` `node_info` paths.
- Transform/arc tests cover position, resize, degree rotation, full/half/partial radian arcs, rings, arc-only and combined calls, live-state preservation of omitted arc fields, exact ELLIPSE enforcement, auto-layout interactions, invalid/empty patches, non-finite numbers, radius bounds, deterministic mutation order, exact readback, and injected residual failures with partial-state disclosure.
- Variable tests cover local/remote/extended collection rename and identity preservation, mode ownership, plan limits, explicit-mode consumers, and code-syntax null removal.
- Component-property tests prove ADD/EDIT return authoritative keys, rename returns a replacement key, exact-key delete targets only one definition, and stale keys return valid recovery keys.
- Instance property tests cover multiple exact property types on one instance, literal and alias values, already-matching no-op, all-invalid-entry reporting, invalid-entry preflight, preservation of omitted properties, one native call, exact readback, unexpected API-failure drift disclosure, and explicit rejection of every multi-instance shape.
- Override-removal tests cover direct versus inherited overrides, remote-component instances, nested explicit targets, scope-root targets, target/descendant locks, escaping/unresolvable override IDs, empty no-op, malformed/duplicate/stale manifests, deterministic canonicalization, one native call, non-empty-readback mismatch disclosure, and proof that no setter runs before every guard and exact comparison succeeds. Documentation tests preserve the explicit limitation that the manifest does not detect a value-only change to an already-overridden field.
- Instance lifecycle tests cover local/library swap, same-component no-op, override compatibility, nested swap, top-level detach, nested detach refusal, and scope-root detach refusal.
- Structural-combine tests cover all five operations, exact parent/index placement, supplied order and subtract-base behavior, duplicate/mixed-parent/ancestor/unsupported inputs, scope root, locks, instance interiors, input ID and absolute-placement preservation, normalized result readback, one native call, and injected post-structure naming/readback failures. Every refusal asserts its recovery-bearing `details`, multi-error request ordering, and zero predictable mutation; native partial-state tests assert exact before/resulting state. A pinned live test decides and then asserts whether `node_ungroup` accepts boolean results.
- Retired-route tests prove `instance_set_property`, `instance_get_overrides`, `instance_set_overrides`, `node_group`, and the source-to-target override prompt/handler path are absent from registration, client unions, dispatch, generated output, and user guides.
- Rename tests cover ordinary nodes plus successful page rename, read-only refusal, node-scope refusal, different-page-scope refusal, page-divider refusal, and scope-root continuity.

### Safety contract tests

- Bidirectional diff between registered write tools and `SAFETY.md` rows.
- Mask target in scope with parent out of scope is refused.
- Mask affected siblings cannot escape scope.
- Every new creation branch refuses a locked or instance-interior parent/source before creation.
- Component binding cannot mutate a remote definition or an instance interior.
- Paint pattern sources outside scope or with stale names are refused before any paint mutation.
- Invalid layout parent/mode/grid state cannot partially apply another field from the same call.
- A non-ELLIPSE target or invalid merged arc plan prevents every position, resize, and rotation mutation in the same `node_transform` call.
- Any predictable invalid ranged-content batch item prevents every item from mutating.
- A PAGE target is writable only when `allowEditNode === "page"` and `scopeRootId` equals that page ID; no generic ancestor check may broaden this rule.
- One invalid exact instance-property map entry prevents every property mutation.
- A stale override-removal manifest causes zero mutation, returns current state plus a complete corrected retry, and cannot be bypassed through a retired dispatcher command.
- `instance_set_component_properties` and `instance_remove_overrides` authorize exactly one explicit target; neither may acquire batch partial-success semantics.
- Removing overrides from a nested explicit target leaves ancestor-instance override state unchanged, and inherited overrides remain untouched.
- A locked descendant or override ID outside the named instance blocks override removal before the native call.
- Any invalid `node_combine` input or parent aborts the complete operation before the native structural call; authorization covers every explicit input and the exact parent, never current selection or an inferred parent.
- Typography and variable-binding filters inspect only nodes inside the explicit page/root/editable scope, never current page or selection. Name/key Text Style matching cannot return an apparently complete result after required style resolution fails; variable-object enrichment cannot erase an exact raw-ID binding match.
- No handler references `figma.currentPage.selection`.
- No font-discovery handler reads `figma.currentPage`; omitted `USED.pageIds` resolves from document pages.

### Live smoke matrix

At minimum, verify in a real Figma Design file:

1. `TREE` and `MATCHES` filtering by name/type/text under one node and across two pages; uniform, mixed, and empty text matching by exact/partial font family/style and by local/remote Text Style ID/key/name/link state; exact-ID direct variable-binding matching with field narrowing under one subtree and across those pages; a same-run font/style negative case; a node-level variable/typography conjunction case; unresolved style/variable evidence behavior; parity with the direct-binding subset of `variable_list`; plus `USED` font inventory across those pages and an `AVAILABLE` catalog query;
2. degree rotation plus arc-only and combined resize/rotation/radian-arc edits on an existing ellipse, omitted-field preservation, wrong-type atomic refusal, and horizontal/vertical/grid layout, child placement, bounds, constraints, clipping, overflow, and layout-grid readback;
3. multi-paint solid/gradient/image/pattern fills and strokes, common stroke geometry, clear arrays, and an invalid-stack atomic refusal;
4. base64 image resize plus URL/reused-hash intrinsic dimensions on write and through `node_info`;
5. visible versus opacity behavior;
6. contained mask enable/disable and an out-of-scope refusal;
7. styled-segment discovery followed by mixed-font partial-range styling and guarded replacement/insertion/deletion, including stale-text and emoji-boundary refusals;
8. native line, vector, text path, section, and slice creation;
9. code-syntax set/remove, collection rename, mode add/rename/delete, and explicit-mode clear;
10. exact multi-property update on one instance including a `VariableAlias`, preservation of omitted properties, and one atomic invalid-map refusal;
11. direct-override manifest discovery through `node_info`, matching removal, inherited-override preservation, empty no-op, and stale-manifest refusal with corrected retry arguments;
12. local and library component swap with override inspection;
13. top-level detach and nested detach refusal;
14. component property add -> returned canonical ID -> rename/edit -> replacement ID -> bind -> unbind -> delete;
15. linked-page rename followed by `page_info`, plus node-scope and other-page-scope refusals;
16. selection-independent parent discovery followed by `GROUP`, `UNION`, `SUBTRACT`, `INTERSECT`, and `EXCLUDE` through `node_combine`, including supplied child order, subtract base, explicit parent/index placement, child ID/absolute-placement preservation, invalid-plan atomic refusal, post-structure failure disclosure, and the conditional boolean `node_ungroup` compatibility probe.

---

## Success measures

The release is complete only when:

- Every complete source-checklist item has a working, documented path.
- All three Section 16 prerequisites ship before their dependent binding, instance, and range-editing workflows are considered complete.
- The public surface adds exactly `instance_swap_component`, `instance_detach`, `instance_remove_overrides`, and `node_bind_component_property`; removes exactly `instance_get_overrides` and `instance_set_overrides`; applies the five declared hard-cutover renames; and has a net increase of two tools.
- `instance_set_property`, `instance_get_overrides`, `instance_set_overrides`, and `node_group` have no registered aliases, dispatcher routes, prompt paths, or generated-code remnants.
- `instance_set_component_properties` updates a non-empty exact property map on exactly one instance, preserves omitted properties, and gives complete correction data for every predictable invalid entry without introducing instance-batch partial success.
- `node_info` is the canonical direct-override discovery path, and `instance_remove_overrides` removes only a matching expected direct manifest from one instance while preserving inherited override state.
- Migration guidance says plainly that the removed source-template override-transfer operation has no behavior-preserving one-call replacement and directs each former intent to an explicit tool.
- `page_info` exposes strict, opt-in `USED` and `AVAILABLE` font branches while ordinary direct reads remain lightweight and compatible.
- `node_info` and `page_info` use one strict filter language with explicit result modes; font and Text Style predicates find exact text-node consumers across uniform, empty, and mixed text without cross-run false positives, while `variableBinding` finds exact direct node consumers by raw variable ID and optional field.
- Match evidence returns the exact font pairs, Text Style identities, and direct variable-binding locations needed for a follow-up decision. Style-name/key incompleteness fails closed, style linkage is never mislabeled as visual conformance, and variable-object enrichment failure never erases a raw-ID match.
- `NodeFilter.variableBinding` and `variable_list` have explicit complementary roles: rooted/composable node matching versus broader variable-centric node/style/alias/reaction impact discovery. Documentation and outputs never label the direct-binding filter as a complete dependency graph.
- `node_transform` edits existing ellipse arcs without a new public tool, preserves omitted live arc fields, keeps degree rotation distinct from radian arc angles, and applies no predictable transform mutation when arc validation fails.
- `node_combine` exposes all five required structural operations without adding a public tool, sends the explicit node order and parent/index plan unchanged to the matching native API, and returns enough resulting hierarchy to verify the operation without a second read.
- No workflow depends on current selection.
- Valid representative calls succeed on the first invocation from schema information alone.
- Every intentionally induced failure in the test matrix gives enough information for one corrected retry without another discovery call, except when live document state genuinely must be re-read.
- No invalid consolidated call partially applies a predictably invalid later field.
- Existing safety guarantees remain true and the safety matrix is synchronized.
- Tool results expose canonical IDs and resulting values needed for the next model decision.
- `node_rename` can rename only the exact linked page under page scope, without changing or invalidating the active scope root.
- Paint setters round-trip ordered common paint stacks and stroke geometry through `node_info` without hidden index mutation.
- Intrinsic image dimensions come from Figma image resources, distinguish server resizing, and never masquerade as node dimensions.
- Ranged content edits prove the current substring before mutation and preserve all content/styled runs outside the selected range.
- Collection rename leaves collection, mode, variable, alias, binding, and explicit-mode identities unchanged.
- Used-font results have explicit page scope and exact usage counts; available-font results have explicit editor-session scope; unavailable writes never silently substitute a font.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Renamed or removed tools break existing prompts/clients | High | Major/hard-cutover release, rename/removal migration tables, repo-wide reference checks, and no ambiguous aliases |
| Consolidated schemas become difficult for models | Medium | Strict discriminators, type-specific fields, examples, emitted-schema tests, explicit alternatives in descriptions |
| A mixed text node falsely matches a font from one run and a Text Style from another | High without run semantics | Evaluate every supplied typography predicate against one effective run; use one minimal styled-segment call when required fields are mixed; add explicit cross-run negative tests |
| Text Style names, unresolved objects, or direct formatting are mistaken for exact style identity/conformance | High without identity rules | Prefer exact ID/key branches, return every exact identity behind name matches, fail closed when name/key resolution is incomplete, and state that `textStyleId` linkage does not prove effective-property equality |
| A direct variable-binding match is mistaken for a complete variable dependency graph | High without a boundary | Name the predicate `variableBinding`; accept exact IDs only; return concrete binding locations; explicitly exclude alias chains, styles, inferred values, reactions, and modes; direct broader impact analysis to `variable_list.includeConsumers` |
| `node_info` and `variable_list` disagree about direct variable consumers | Medium without shared extraction | Use one recursive direct-binding extractor for both paths, normalize component-property locations once, and assert parity over every pinned binding shape |
| Unavailable variable metadata hides a real raw binding | Medium without raw-ID semantics | Match before enrichment, cache resolution only for evidence, emit `resolved: false`, and preserve exact match/count completeness |
| Models confuse degree rotation with radian ellipse arc angles | High without explicit wording | Put units in the tool and every affected field description, include `Math.PI`/`2 * Math.PI` numeric examples, assert emitted descriptions, and never guess or convert units |
| A bad arc patch partially moves, resizes, or rotates the ellipse | High without preflight | Resolve current `arcData` and validate the entire affine/layout/merged-arc plan before the first setter; disclose exact residual state after unexpected native failures |
| Used fonts are mistaken for fonts that can be assigned, or an implicit visible page changes results | High without an explicit contract | Required `USED`/`AVAILABLE` source, explicit page/editor scope in results, exact live availability cross-check, and no `currentPage` access |
| One call partially mutates before a later setter fails | Medium | Complete-call preflight, font/asset loading first, cleanup for creations, partial disclosure for residual API failures |
| A stale complete paint array overwrites a newer paint edit | Medium | Document full replacement semantics; read with `node_info`; return complete arrays; never offer ambiguous index patches |
| Whole-node fill replacement destroys mixed text colors | High without guard | Refuse mixed TEXT fills and direct callers to styled segments plus ranged text styling |
| A grid/layout change reflows children before a later validation fails | High without preflight | Compute effective mode/parent state, bounds, occupancy, and all field compatibility before the first setter |
| Ranged replacement targets stale text or inserts before shifted-original deletion fails | Medium | Required `expectedText`, whole-batch/font preflight, insert-before-delete ordering, and explicit before/result partial-failure payload |
| Image dimensions are confused with the target node's rendered size | Medium | Name output `intrinsicSize`, source it from `getSizeAsync()`, and state that resize requires `node_transform` |
| Collection rename breaks identity-based references | Low if Figma identity is preserved | Mutate only `collection.name`; assert all collection/mode/variable IDs and bindings remain unchanged in tests |
| Mask changes affect layers outside the named target | High without guard | Parent-in-scope and affected-sibling containment; no instance-interior mask edits |
| Range indices split user-perceived characters | Medium | UTF-16 contract, surrogate-pair rejection, nearest-boundary recovery details |
| "Full text support" overpromises read-only API fields | Medium | Explicit writable matrix and exclusions; schema/handler parity tests |
| Text-path creation destroys a source path | Medium without preservation | Clone then convert; source preservation fixed by contract |
| Mode deletion causes silent value/reference loss | High without guard | Explicit destructive target, exact names, last-mode check, consumer scan, before/after default reporting |
| Component swap silently loses incompatible overrides | Medium | Explicit destructive hint, before/after snapshot, no preservation guarantee, warning/diff output |
| Nested detach mutates ancestor instances | High | Hard plugin-side nested-instance refusal |
| A stale whole-instance reset discards newly added direct overrides | High without a precondition | Require the canonical expected manifest, compare before mutation, and return current state plus complete corrected retry arguments on mismatch |
| An already-overridden field changes value without changing the direct manifest | Medium | Disclose that the manifest guard protects field membership, not arbitrary field values; require a fresh `node_info` read and preserve the explicit whole-reset semantics |
| Removed override values are mistaken for recoverable reset data | High | Label the manifest as field-level audit metadata only; expose no restore claim; require a destructive hint and explicit no-inverse wording |
| The retired source-template transfer workflow leaves callers without a one-call migration | Medium | Document intent-specific replacements for component swap, exact component properties, direct node edits, and cloning; state that no exact hybrid replacement exists |
| Page rename accidentally inherits broader node-scope authority | High without an explicit branch | Require PAGE type, page permission mode, and exact scope-root ID together before mutation |
| Canonical component property selection is missing or ambiguous | Certain in current code | Return API keys from ADD/EDIT; require exact `propertyId` for EDIT/delete; include valid keys in stale-key errors |
| A bad entry in an exact instance-property map partially applies | Medium without preflight | Validate every key, type, value, and alias for the one target before making one native `setProperties()` call; read back and disclose drift on an unexpected API failure |
| Boolean input order or insertion-index semantics differ from assumptions | High if inferred | Make live pinned-API probes release-blocking; preserve the caller's array verbatim; document and assert actual child order, subtract base, and parent-index behavior |
| A native structural combine reparents some inputs before throwing | Medium | Complete predictable preflight, snapshot every input and destination position, make exactly one native call, inspect resulting hierarchy after an exception, and disclose partial mutation without an unverified rollback |
| The combined tool's destructive hint overstates an ordinary group call | Certain | Accept the conservative static annotation required by the broadest branch; make the required `operation` and tool description explain that `GROUP` preserves editable children while still changing hierarchy and z-order |
| Styled-text reads create oversized responses | Medium | Require selected fields, cap segments, report truncation, and give a narrower-range retry |
| Figma plan/API differences reject otherwise valid operations | Medium | Live smoke tests, structured `FIGMA_API_ERROR` details, no silent fallback |

---

## Provenance

The following claims were verified from code, not repository popularity metrics.

| Item | Verified source | Finding |
| :- | :- | :- |
| Local read surface | `src/mcp_server/tools/page.ts`, `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/nodeReaders.ts` | `page_info` has page-ID lookup but no used-font aggregate or available-font catalog; `node_info` has recursive reads and only type/layoutMode filter logic, with no flat name/text/font/Text-Style/direct-variable-binding consumer matching |
| Local transform/layout/appearance | `src/mcp_server/tools/node.ts`, `src/mcp_server/tools/create.ts`, corresponding plugin handlers | Transform publishes x/y/width/height only. `create_shape` can set partial `arcData` while creating an ellipse and `node_info` can read it, but no write edits `arcData` on an existing ellipse. Layout is limited to horizontal/vertical auto-layout basics and lacks constraints, grid, child participation, bounds, clipping, overflow, and visual grids; effects has no node visibility/opacity/blend/mask fields. |
| Local paint and image surface | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/stylingHandlers.ts` | Fill replaces the stack with one solid/image or clears it; stroke replaces it with one solid and exposes weights only; neither path supports strict multi-paint gradients/patterns nor returns `Image.getSizeAsync()` dimensions |
| Local text surface | `src/mcp_server/tools/text.ts`, `figma_plugin/handlers/textHandlers.ts` | Style is whole-node and publishes a subset; content batches replace complete TEXT-node strings and expose no range/expected-substring branch |
| Local creation surface | `src/mcp_server/tools/create.ts`, `nodeCreators.ts`, `vectorHandlers.ts` | No LINE, TEXT_PATH, native VECTOR_PATHS, SECTION, or SLICE branch |
| Local variable surface | `src/mcp_server/tools/variable.ts`, `variableHandlers.ts` | Actions are create collection/create variable/update variable; no collection rename, code syntax, or mode add/rename/delete; explicit mode values are strings only |
| Local variable-consumer surface | `src/mcp_server/tools/variable.ts`, `figma_plugin/handlers/variableHandlers.ts` | `variable_list` lookup accepts exact variable IDs and can scan one page or the document for node consumers while separately returning local style and variable-alias consumers; its node walk also recognizes component-property and prototype-reaction references. It does not expose rooted/composable `NodeFilter` matching, paths, requested node properties, or pruned-tree output. |
| Local component/instance surface | `src/mcp_server/tools/component.ts`, `instance.ts`, `componentHandlers.ts` | Component add/edit discards returned canonical keys; no direct swap, detach, override-removal, or component-property-reference binding tool |
| Local component-property identity | `figma_plugin/handlers/componentHandlers.ts`, `src/mcp_server/tools/component.ts` | Existing EDIT/delete inputs are display names; handlers split keys at `#`, select by readable prefix, and do not expose authoritative ADD/EDIT return keys |
| Local instance property setter | `src/mcp_server/tools/instance.ts`, `figma_plugin/handlers/componentHandlers.ts` | Accepts one display-name property with a string/boolean value, selects the first matching canonical key, and cannot submit an exact multi-property map or `VariableAlias` |
| Local override tools | `src/mcp_server/tools/instance.ts`, `figma_plugin/src/main.ts`, `figma_plugin/handlers/componentHandlers.ts` | `instance_get_overrides` returns only source/main-component IDs and a count, not the manifest promised by its description. `instance_set_overrides` accepts a source plus multiple targets, swaps each target to the source component, derives descendant IDs by string replacement, and replays selected fields with unsupported/missing paths skipped; it is not a predictable direct-override setter or reset. |
| Local styled-text discovery | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/nodeReaders.ts`, `textHandlers.ts` | `node_info` does not expose styled runs; `getStyledTextSegments(["fontName"])` is used internally only to load fonts for writes |
| Local page rename path | `src/mcp_server/tools/node.ts`, `figma_plugin/src/main.ts`, `nodeModifiers.ts` | The generic rename route assigns `node.name` after ordinary scope/name/lock validation, but its public contract and tests do not explicitly define the exact page-scope-only PAGE branch or its recovery error |
| Local structural-combine surface | `src/mcp_server/tools/node.ts`, `figma_plugin/src/main.ts`, `figma_plugin/handlers/nodeModifiers.ts`, `nodeReaders.ts` | `node_group` accepts an ordered list and optional name, infers the shared parent from the first input, has no explicit parent/index contract, and supports only grouping. Its dispatcher already requires same-parent, exact-name, scope, lock, scope-root, and instance-interior checks. Direct `node_info.properties.parent` returns the parent ID only, while a second parent-rooted read returns its exact name and immediate child order. `node_ungroup` hard-rejects every type except `GROUP`. |
| Pinned Figma API | `@figma/plugin-typings` 1.125.0 | Provides `listAvailableFontsAsync()`, whole-node and styled-segment `fontName`/`textStyleId`, `getStyledTextSegments()`, `getStyleByIdAsync()`, Text Style ID/name/key/remote metadata, the complete scalar/array/map `SceneNode.boundVariables` shape, styled-text `boundVariables`, component-property definition/value bindings, variable ID/name/key/collection/remote metadata, writable complete `EllipseNode.arcData`, degree-based node rotation, strict paint variants, async pattern paint setters, common stroke geometry, `Image.getSizeAsync`, text insert/delete and range setters, grid/container/child layout fields, mutable collection names, mode/code-syntax maintenance, exact-map `InstanceNode.setProperties()`, direct-only `InstanceNode.overrides`, `removeOverrides()`, component swap/detach, native `group`/`union`/`subtract`/`intersect`/`exclude` calls with parent/index arguments, and a broad `ungroup(SceneNode & ChildrenMixin)` signature used or probed by this Initiative |
| Figwright comparison baseline | `awdr74100/figwright` at commit `e2a30a3de38fada3ad1c058a500c4b3b81641053` | Its `get_fonts` scans text on implicit `figma.currentPage` and does not list editor-session available fonts; this Initiative keeps those concepts explicit and selection-independent while consolidating other capabilities under local safety and naming conventions |

---

## Revision history

- **Rev 1, 2026-07-18** - Initial Initiative. Converts the complete source checklist into 16 implementation sections, records three hard-cutover renames and three new tools, specifies search consolidation, mask containment, UTF-16 text ranges, source-preserving text paths, strict region/vector/line branches, variable mode lifecycle, destructive instance semantics, canonical component property IDs, testing, rollout, provenance, and the unresolved empty `variable_manage` bullet as Q1.
- **Rev 2, 2026-07-18** - Adds exact page-scope rename support to `node_rename` and promotes all three required prerequisites to explicit P0 contracts: canonical component `propertyId` round-tripping, exact/batched `instance_set_property` maps with `VariableAlias`, and styled-text segments through `node_info`. Synchronizes safety gates, errors, rollout order, tests, success measures, risks, and provenance.
- **Rev 3, 2026-07-18** - Expands fill/stroke tools to strict ordered paint stacks and common stroke geometry, broadens `node_set_layout` across container/child/grid/viewport behavior, adds guarded range content replacement, exposes intrinsic image dimensions on writes and reads, and adds collection rename to `variable_manage`. Resolves former Q1 and synchronizes safety, schemas, rollout, tests, risks, and provenance.
- **Rev 4, 2026-07-18** - Resolves font-discovery Q1 as Option A and records D23. Expands `page_info` with strict, opt-in `USED` and `AVAILABLE` modes; specifies exact scope, counts, availability checks, failure recovery, text-write integration, schema/tool descriptions, rollout, tests, success measures, risks, and provenance without adding a public tool.
- **Rev 5, 2026-07-19** - Redesigns the instance surface. Removes `instance_get_overrides` and the hybrid `instance_set_overrides`; hard-replaces `instance_set_property` with one-target, multi-property `instance_set_component_properties`; and adds guarded destructive `instance_remove_overrides`. Records D24-D26 and synchronizes release arithmetic, migration guidance, `node_info` prerequisites, safety gates, annotations, schemas, rollout, tests, success measures, risks, and provenance.
- **Rev 6, 2026-07-19** - Resolves ellipse-arc Q3 as Option B and records D27. Expands `node_transform` with a strict existing-ellipse `arcData` patch, explicit degree/radian semantics, live-state merge behavior, complete combined-call preflight, deterministic mutation order, exact readback, and residual partial-failure disclosure. Synchronizes the public surface, non-goals, safety/errors, schemas, rollout, tests, success measures, risks, and provenance without adding a public tool.
- **Rev 7, 2026-07-19** - Resolves boolean-operation Q4 as Option B and records D28. Hard-replaces `node_group` with `node_combine`, requires an explicit `GROUP`/boolean operation plus ordered nodes and exact parent/index planning, applies one complete structural preflight and normalized readback across all branches, conservatively marks the combined tool destructive, and gates release on native ordering/index/subtract-base plus boolean-ungroup probes. Synchronizes migration guidance, safety/errors, schemas, rollout, tests, success measures, risks, provenance, and the fifth rename without changing the net public-tool count.
- **Rev 8, 2026-07-21** - Tightens the adopted Q4 contract after a discovery/recovery audit. Adds the exact selection-independent `node_info` sequence for obtaining a shared parent name and sibling order, preserves verbatim exact-name behavior, specifies recovery-bearing structural error payloads and multi-error ordering, and requires partial-state disclosure when naming or readback fails after native combination.
- **Rev 9, 2026-07-23** - Replaces the separate search predicate with one strict shared `filter` and explicit output discriminators: `node_info` `TREE`/`MATCHES` and `page_info` `SUMMARY`/`MATCHES`. Moves `maxResults` to the match-result branch, hard-replaces singular legacy filter keys with plural enum-backed fields, records D29, and synchronizes page/font mode exclusion, examples, safety, errors, implementation, tests, and migration guidance.
- **Rev 10, 2026-07-24** - Adds run-aware `NodeFilter.font` and discriminated `NodeFilter.textStyle` consumer matching. Defines uniform/empty/mixed text behavior, same-run conjunction, exact ID/key/name/link-state semantics, cached fail-closed style resolution, bounded exact match evidence, linkage-versus-conformance wording, and synchronized schemas, errors, rollout, tests, success measures, risks, and provenance.
- **Rev 11, 2026-07-24** - Adds exact-ID `NodeFilter.variableBinding` as the scoped node-centric complement to `variable_list` and records D30. Defines direct raw-alias and optional field semantics, structured node/component-property locations, enrichment-without-match-dependence, evidence bounds/counts, exclusions for aliases/styles/inferred values/reactions/modes, shared-extractor parity, and synchronized safety, schemas, implementation, tests, success measures, risks, and provenance.
