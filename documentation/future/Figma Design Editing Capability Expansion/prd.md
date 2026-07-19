# Future PRD: Figma Design Editing Capability Expansion

This document is the product and implementation specification for a future release of `figma-edit-mcp`. It turns the feature-gap checklist produced from the Figwright comparison into a concrete local-project design.

The goal is not to copy Figwright's tool surface. The goal is to add the useful Figma Design capabilities while preserving this project's core contract:

> **Golden Rule:** maximize **first-call correctness** (the model can compose a valid call from the tool schema and guides) and **one-round-trip recovery** (a failed call tells the model exactly how to repair it in one step).

The Figma plugin remains the trust boundary. Every write in this PRD must continue to enforce the scope, exact-name, locked-node, instance-interior, remote-asset, permission-axis, batch-validation, and scope-root controls documented in `SAFETY.md`.

---

## Release identity

> [!IMPORTANT]
> This is a placeholder **future release**, not an assigned version. It contains three public tool renames and therefore should be treated as a major API-shape release unless the project explicitly accepts a hard cutover under its existing versioning policy.

The public surface changes are:

| Change | Old tool | Future tool |
| :- | :- | :- |
| Rename and expand | `node_set_auto_layout` | `node_set_layout` |
| Rename and expand | `node_set_effects` | `node_set_appearance` |
| Rename and expand | `create_frame` | `create_region` |
| Add | - | `instance_swap_component` |
| Add | - | `instance_detach` |
| Add | - | `node_bind_component_property` |

All other work extends existing tools without adding public names. With a hard cutover, the release has a net increase of three tools.

**Compatibility posture:** do not expose permanent old-name aliases. Aliases would make the model choose between two tools for the same decision and weaken first-call correctness. The release notes and guides must provide an old-to-new migration table, and every in-repo reference must change in the same release.

---

## Source checklist and scope fidelity

This PRD covers every complete item in the source checklist.

| # | Source item | PRD section |
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

The source checklist also contains an unfinished line: **"Expand `variable_manage` to include"** with no named capability. That line is retained as open question Q1 and does not authorize an inferred feature.

### Explicit non-goals

- No tool may get, set, or depend on the current Figma selection.
- No implicit-current-page write behavior.
- No page creation, page deletion, or dedicated page rename tool. `node_rename` can rename a page when the page is a valid in-scope target.
- No new standalone `search_nodes`, `scan_text_nodes`, `scan_nodes_by_types`, `set_visible`, `set_opacity`, `set_blend_mode`, `set_mask`, `set_constraints`, `rotate_nodes`, `create_section`, `create_slice`, `create_line`, `create_vector`, `set_variable_code_syntax`, `add_variable_mode`, or `rename_variable` tools.
- No separate `set_text_range` or range-array API.
- No selection-based convenience defaults copied from Figwright.
- No unrelated fill/stroke, font-inventory, image-sizing, override-reset, boolean-operation, slot, or page-lifecycle work.
- No general transaction or rollback system. Each handler must preflight all predictable failures before mutation and retain the existing partial-failure disclosure rules for unexpected Figma API failures.

---

## Product decisions

> [!NOTE]
> **D1 - Consolidate by user decision, not by Figma setter.** Rotation belongs to transform, constraints belong to layout, layer visibility/opacity/blending/masking belong to appearance, and mode maintenance belongs to variable management. A thin tool per property would increase tool-selection ambiguity without introducing a new model decision.

> [!NOTE]
> **D2 - Use strict mode-specific contracts.** Multi-purpose tools must publish discriminated input branches or equivalent strict refinements. Fields that do not apply to the selected action or node type are rejected at the MCP boundary, not ignored by the plugin.

> [!NOTE]
> **D3 - Preserve explicit discovery.** Search scopes come from explicit page IDs, explicit root node IDs, or the connected editable scope. Creation always has an explicit and exact-name-verified parent or source node. No branch reads `figma.currentPage.selection`.

> [!NOTE]
> **D4 - Read back the result.** Every write returns the resulting values needed to verify the mutation. Success payloads must not merely say `success: true` when an exact resulting value, new node ID, canonical property key, remaining mode list, or before/after component identity is available.

> [!NOTE]
> **D5 - Validate the complete call before the first setter.** Consolidated tools can carry several fields. Handlers must resolve targets, verify names and scope, load fonts/assets, validate every supplied field and cross-field condition, and only then begin mutation. A known-invalid later field must never leave earlier fields applied.

> [!NOTE]
> **D6 - Errors are repair instructions.** New failures use the central structured-error registry. Each error identifies the failed condition, includes observed and accepted values where useful, names the discovery tool that supplies the correct identity, and gives the exact corrected call shape or prerequisite operation.

> [!NOTE]
> **D7 - Renames are hard cutovers.** `node_set_auto_layout`, `node_set_effects`, and `create_frame` leave the public tool list when their replacements ship. Keeping both names would permanently charge every model call with an avoidable disambiguation decision.

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
> **D13 - Swap and detach remain separate tools.** They have different intent, preconditions, safety gates, identity behavior, recovery paths, and result shapes. Combining them would weaken both first-call correctness and one-round-trip recovery.

> [!NOTE]
> **D14 - Both instance operations are explicitly destructive.** Detach permanently removes the component relationship. Swap preserves overrides heuristically and can drop incompatible data. Both tools set `destructiveHint: true` even if the MCP SDK currently defaults omitted write hints conservatively.

> [!NOTE]
> **D15 - Region creation uses type-specific fields.** `FRAME`, `SECTION`, and `SLICE` share placement and dimensions, but only `FRAME` accepts frame/auto-layout fields, only `SECTION` accepts section fields, and `SLICE` is an export boundary rather than a visual container.

---

## Priority and ownership

| Section | Capability | Priority | Primary implementation areas |
| :-: | :- | :-: | :- |
| 1 | Search in `page_info` / `node_info` | P0 | `src/mcp_server/tools/page.ts`, `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/nodeReaders.ts` |
| 2 | Transform rotation | P0 | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/nodeModifiers.ts` |
| 3 | Layout and constraints | P0 | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/layoutHandlers.ts`, dispatcher gates |
| 4 | Appearance and mask containment | P0 | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/stylingHandlers.ts`, dispatcher gates |
| 5 | Full text style and one range | P0 | `src/mcp_server/tools/text.ts`, `figma_plugin/handlers/textHandlers.ts` |
| 6-9 | Missing node creation paths | P1 | `src/mcp_server/tools/create.ts`, `figma_plugin/handlers/nodeCreators.ts`, `vectorHandlers.ts` |
| 10-12 | Variable maintenance | P0 | `src/mcp_server/tools/variable.ts`, `figma_plugin/handlers/variableHandlers.ts` |
| 13-15 | Instance/component operations | P0 | `src/mcp_server/tools/instance.ts`, `component.ts`, `figma_plugin/handlers/componentHandlers.ts` |
| 16 | Safety, docs, generated output, rollout | P0 | `SAFETY.md`, guides/resources, tests, generated `figma_plugin/code.js` |

---

## 1. Search in `page_info` and `node_info` (P0)

### Problem

`node_info` can recursively return known roots and currently filters only exact `type` and `layoutMode` values. It cannot directly find nodes by name substring or text content, and it returns a pruned tree rather than a compact flat match list. `page_info` lists pages and, for explicit IDs, top-level children; it cannot search across selected pages.

Figwright addresses these jobs with three tools: `search_nodes`, `scan_text_nodes`, and `scan_nodes_by_types`. The local project can cover all three decisions without adding three names.

### Contract

Add a shared strict `search` object to both read tools:

```ts
type NodeSearch = {
  name?: {
    value: string;
    match?: "CONTAINS" | "EXACT"; // default CONTAINS
    caseSensitive?: boolean;       // default false
  };
  characters?: {
    value: string;
    match?: "CONTAINS" | "EXACT"; // TEXT and TEXT_PATH only
    caseSensitive?: boolean;       // default false
  };
  types?: string[];                 // exact Figma node-type names
  maxResults?: number;              // integer 1..500, default 100
};
```

Rules:

- At least one of `name`, `characters`, or non-empty `types` is required.
- Different predicates are ANDed. Values within `types` are ORed.
- Empty query strings and empty type arrays are rejected.
- Unknown node-type strings are rejected with the accepted enum values and a closest-match suggestion.
- `search` and the legacy `filter` object cannot appear in the same `node_info` call. Search predicates belong in `search`; `filter` remains available only for the existing pruned-tree read mode.
- Search is recursive and returns a flat match list in document order.
- `truncated: true` is a successful bounded result, not an error.
- Search results always include `id`, `name`, `type`, and `path`. Requested `properties` are included only for matching nodes.

### `node_info` search scope

```ts
node_info({
  nodeIds?: string[],       // explicit subtree roots
  search: NodeSearch,
  properties?: string[],
  maxDepth?: number,
  concurrencyLimit?: number
})
```

- If `nodeIds` is omitted, use the connected editable scope root exactly as ordinary `node_info` does.
- A node-read-only session with no roots and no editable scope returns a structured error instructing the model to obtain roots from `page_info`; it must not fall back to the current page.
- Multiple roots are deduplicated by ID. A descendant included under two requested roots appears once, under the first root in request order.
- Existing non-search `node_info` behavior and its `nodes` tree output remain available.

Search-mode output:

```ts
{
  matches: Array<{
    id: string;
    name: string;
    type: string;
    path: Array<[type: string, id: string, name: string]>;
    properties?: Record<string, unknown>;
  }>;
  matchCount: number;
  truncated: boolean;
  scannedNodeCount: number;
  missingNodeIds?: string[];
}
```

### `page_info` search scope

```ts
page_info({
  pageIds?: string[],       // omitted means every page
  search: NodeSearch,
  properties?: string[]
})
```

- `pageIds` limits the scan to exact pages. Omission means document-wide search, not current page.
- Dynamic-page access loads pages one at a time and emits progress before yielding, following the existing page-scan timeout discipline.
- A failed page load fails closed for a result that claims document completeness. The error reports completed and failed page IDs so the model can retry only failed pages.
- Results are grouped by page while preserving document order.

Search-mode output:

```ts
{
  pages: Array<{
    pageId: string;
    pageName: string;
    matches: NodeSearchMatch[];
  }>;
  matchCount: number;
  truncated: boolean;
  scannedPageCount: number;
  scannedNodeCount: number;
  missingPageIds?: string[];
}
```

### Coverage equivalence

| Desired job | Consolidated call |
| :- | :- |
| Name search | `node_info({ search: { name: { value: "Button" } } })` |
| Type scan | `node_info({ search: { types: ["COMPONENT", "COMPONENT_SET"] } })` |
| Text scan | `node_info({ search: { types: ["TEXT"] }, properties: ["characters", "fontSize", "fontName"] })` |
| Text-content search | `node_info({ search: { characters: { value: "Checkout" } }, properties: ["characters"] })` |
| Cross-page search | same predicates through `page_info` |

### Acceptance criteria

- Search never reads current selection and never silently uses current page.
- Name matching is case-insensitive substring by default.
- A search combining name, characters, and types applies AND semantics correctly.
- A result capped by `maxResults` reports `truncated: true` and exact scan counts.
- Direct `node_info` tree reads remain byte-for-byte compatible except for additive output-schema fields.
- Schema descriptions explain when to choose `page_info` versus `node_info` search.

---

## 2. Rotation in `node_transform` (P0)

### Contract

Add one optional absolute field:

```ts
rotation?: number; // Figma degrees, normalized readback in [-180, 180]
```

Rules:

- The call must include at least one of `x`, `y`, `width`, `height`, or `rotation`.
- `rotation` is absolute, not a delta, matching the existing absolute transform semantics.
- Rotation uses Figma's top-left pivot behavior. Arbitrary pivot-point matrix transforms are out of scope.
- The handler verifies that the target exposes a writable numeric `rotation` property before mutation.
- Existing auto-layout-controlled `x`/`y` checks apply only when those fields are supplied. A rotation-only call must not fail because position is layout-controlled unless Figma itself disallows rotation for that node.
- Read back `rotation` with `x`, `y`, `width`, and `height`.

Example:

```json
{
  "nodeId": "10:24",
  "nodeName": "Arrow",
  "rotation": 45
}
```

### Acceptance criteria

- Rotation-only, transform-only, and combined calls work.
- An empty transform fails at schema validation with the accepted field list.
- Unsupported node types fail before any position or size field is changed.
- Repeating the same call is idempotent.

---

## 3. `node_set_layout`: auto layout plus constraints (P0)

### Rename and contract

Replace `node_set_auto_layout` with `node_set_layout`. Preserve all current auto-layout fields and add:

```ts
constraints?: {
  horizontal: "MIN" | "CENTER" | "MAX" | "STRETCH" | "SCALE";
  vertical: "MIN" | "CENTER" | "MAX" | "STRETCH" | "SCALE";
};
```

Both constraint axes are required because Figma assigns the `constraints` object as a pair. Optional single-axis updates would force the plugin to infer the omitted axis from live state and make a call's meaning less visible in the schema.

Rules:

- At least one layout or constraints field is required.
- Auto-layout container fields retain their current type and state checks.
- `constraints` is accepted only on nodes implementing Figma's `ConstraintMixin`.
- If the parent auto-layout currently controls the child and constraints would be inactive, reject before mutation. The error reports the parent ID/name and explains that the node must be outside auto layout or absolutely positioned before constraints can affect it.
- A call may set both the target frame's auto-layout properties and its own constraints relative to its parent. All fields are preflighted before either group is applied.
- The output returns every supplied field's resulting value.

This release does not add grid auto layout, `layoutPositioning`, `layoutGrow`, `layoutAlign`, min/max dimensions, clipping, overflow, or visual layout-grid editing. Those are separate capabilities, not prerequisites for basic constraints.

### Acceptance criteria

- Existing valid `node_set_auto_layout` fixtures migrate to `node_set_layout` with unchanged behavior.
- Constraint enums are explicit in the published JSON schema.
- A target without `constraints` support fails before any auto-layout fields in the same request mutate.
- The error for inactive constraints names the controlling parent and the exact recovery choices.

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

## 5. `text_set_style`: one optional range and full writable text surface (P0)

### Range contract

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

Return the applied range, character length, loaded fonts, and resulting values for every requested property. This makes the result sufficient to verify index and font behavior without an immediate second read.

### Acceptance criteria

- Whole-node behavior remains compatible for all currently supported fields.
- A range styles only `[start, end)`.
- Partial range parameters, out-of-bounds values, reversed ranges, and surrogate-splitting boundaries each return a specific repair message.
- Mixed-font text preloads every affected font before any write.
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

## 10. `variable_manage`: code syntax and mode maintenance (P0)

### Action surface

The future action enum is:

```text
CREATE_COLLECTION
CREATE_VARIABLE
UPDATE_VARIABLE
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

## 14. New `instance_detach` tool (P0)

### Purpose

Call `instance.detachInstance()` to replace a component instance with a plain frame whose layers can be edited directly.

### Contract

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

### Acceptance criteria

- Top-level in-scope instance detachment succeeds and returns the new frame identity.
- Scope-root and nested-instance detachment are refused before mutation with distinct recovery messages.
- `destructiveHint` is asserted in tool-list tests.
- The handler does not silently detach ancestor instances.

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

The current `component_manage_property` handler calls `addComponentProperty` and `editComponentProperty` but discards their returned canonical `name#id` key. This release must capture and return it as `propertyId` for both `ADD` and `EDIT`. An edit can return a changed canonical key; the output is authoritative.

`node_info` already exposes `componentPropertyDefinitions` when requested and remains the recovery read for existing properties.

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

## 16. Cross-cutting safety and error contract (P0)

### Gate matrix additions

`SAFETY.md` must add or replace rows as follows:

| Tool | Required plugin-side controls beyond type-specific validation |
| :- | :- |
| `node_transform` | Existing node-write stack; rotation support check |
| `node_set_layout` | Existing auto-layout stack; constraint support and inactive-constraint check |
| `node_set_appearance` | Node-write stack; per-field support; mask parent-in-scope, bounded-container, sibling-impact, and instance-interior guards |
| `text_set_style` | Node-write stack; TEXT/TEXT_PATH compatibility; complete font/range preflight |
| `create_text` TEXT_PATH | Source scope+name+lock; source parent scope; no instance interior; clone cleanup |
| `create_shape` LINE | Existing creation parent stack; LINE branch checks |
| `create_svg` VECTOR_PATHS | Existing creation parent stack; vector-path validation and cleanup |
| `create_region` | Creation parent stack; per-region parent/type checks and cleanup |
| `variable_manage` modes/code syntax | Variable permission; exact current asset names; remote block |
| `variable_delete` MODE | Variable permission; exact names; remote block; explicit-mode consumer scan |
| `instance_swap_component` | Node-write stack; INSTANCE target; destination identity; nested target allowed; remote destination allowed |
| `instance_detach` | Node-write stack; scope-root block; nested-instance block; structural lock checks |
| `node_bind_component_property` | Node-write stack; local owner; canonical property/type/field checks; instance-interior block |

### Structured error requirements

New conditions need stable central codes. The final taxonomy may consolidate causes, but it must distinguish at least:

- search predicate missing and search root unavailable;
- unsupported mutable property;
- invalid or inactive constraints;
- mask not contained and mask has no affected sibling;
- incomplete, invalid, or surrogate-splitting text range;
- property unavailable on `TEXT_PATH`;
- invalid text-path source or segment;
- region field not applicable to selected type;
- variable mode not found, still in use, last remaining, or plan-limited;
- nested detach and scope-root detach;
- component destination mismatch;
- component-property owner missing, property missing, or type/field mismatch.

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
| `instance_swap_component` | explicit `destructiveHint: true`, `idempotentHint: true` |
| `instance_detach` | explicit `destructiveHint: true`, no idempotent hint |
| `variable_delete` | retain explicit `destructiveHint: true` |

MCP annotations are advisory, not enforcement. Plugin-side guards remain authoritative.

---

## Schema design requirements

1. All new/changed top-level and nested objects are strict. Unknown keys fail; they are never silently stripped.
2. Action/type branches are represented as discriminated unions in the emitted JSON schema where the SDK supports them. If an SDK limitation requires `superRefine`, descriptions must carry explicit `REQUIRED for ...` markers and emitted-schema tests must prove them.
3. Every multi-field setter requires at least one mutation field.
4. Mutually exclusive modes are checked at the MCP boundary and again in the plugin because schema validation is not a safety boundary.
5. Numeric limits use schema constraints: opacity and positions on a path in `[0,1]`, positive dimensions, integer text indices/mode counts, and non-empty arrays where required.
6. Enum values come from the pinned `@figma/plugin-typings` surface or a generated allowlist where drift is likely.
7. Tool descriptions explain the nearest alternatives that models commonly confuse: visible versus opacity, frame versus section versus slice, SVG versus vector paths, swap versus detach, variable unbind versus mode clear, and whole-text versus range styling.

---

## Implementation plan

### Phase 1 - Contract scaffolding and migration map

- Ratify the future release number and Q1.
- Define shared strict schemas/enums for search, blend mode, constraints, text paints/decorations, region branches, variable modes, and component destinations.
- Add old-to-new tool migration tests and remove the three old names from expected tool lists.
- Add central structured-error codes and playbook entries before handlers depend on them.

### Phase 2 - Read/search surface

- Implement bounded flat search in `nodeReaders.ts`.
- Reuse one predicate evaluator for page and node searches.
- Preserve existing direct-read/tree behavior.
- Add progress, page-load failure, truncation, ordering, duplicate-root, and count tests.

### Phase 3 - Core node setters

- Add rotation to transform.
- Rename and expand layout.
- Rename and expand appearance.
- Add complete-call preflight helpers and mask propagation containment.
- Update dispatcher permission and gate matrices before enabling handler routes.

### Phase 4 - Text

- Add the paired range schema and exact property matrix.
- Implement UTF-16 boundary validation and complete font discovery/loading.
- Add TEXT_PATH compatibility to `text_set_style` and `text_set_content`.
- Test every schema field against its exact handler setter and readback.

### Phase 5 - Creation

- Add LINE, VECTOR_PATHS, TEXT_PATH, SECTION, and SLICE branches.
- Apply parent/source verification before creation.
- Use parent-first placement and cleanup-on-failure for every new branch.
- Replace `create_frame` references with `create_region` throughout docs, prompts, safety tables, and tests.

### Phase 6 - Variables

- Refactor `variable_manage` to strict action branches.
- Add code-syntax read/write/remove behavior and mode add/rename.
- Extend explicit mode maps with null clear.
- Replace `variable_delete` input with the target discriminator and add mode-consumer scanning.

### Phase 7 - Components and instances

- Capture canonical component property IDs from add/edit.
- Add component-property binding/unbinding.
- Add swap and detach as separate dispatcher routes and handlers.
- Add override-diff reporting for swap and structural containment checks for detach.

### Phase 8 - Contract synchronization and release

- Update `README.md`, `SAFETY.md`, `CHANGELOG.md`, tool-selection/workflow/constraint/error-playbook guides, and their `figma-edit://guide/*` resource mirrors.
- Regenerate `figma_plugin/code.js`; do not hand-edit it.
- Update tool-count, tool-list, strict-schema, permission-matrix, safety-contract, and MCP-boundary tests.
- Run server and plugin type checks, generated-file checks, suppression checks, plugin build verification, version checks, and the full unit suite.
- Run live Figma smoke tests for every new Figma API path before release.

---

## Test strategy

### Schema tests

- Snapshot emitted `tools/list` contracts, not only local Zod objects.
- Assert each discriminator's required, optional, and forbidden fields.
- Assert no old renamed tool is registered and all three new tools are registered.
- Assert nested unknown keys fail.
- Assert static annotations, especially both destructive instance hints.

### Plugin handler tests

- One success, one wrong-type failure, one exact-name failure, and one no-partial-mutation failure per branch.
- Readback matches the actual target after mutation.
- Cleanup tests inject a failure after creation and prove no orphan remains.
- Font tests cover mixed fonts, replacement fonts, missing fonts, range boundaries, and TEXT_PATH subsets.
- Variable tests cover local/remote collections, mode ownership, plan limits, explicit-mode consumers, and code-syntax null removal.
- Instance tests cover local/library swap, same-component no-op, override compatibility, nested swap, top-level detach, nested detach refusal, and scope-root detach refusal.

### Safety contract tests

- Bidirectional diff between registered write tools and `SAFETY.md` rows.
- Mask target in scope with parent out of scope is refused.
- Mask affected siblings cannot escape scope.
- Every new creation branch refuses a locked or instance-interior parent/source before creation.
- Component binding cannot mutate a remote definition or an instance interior.
- No handler references `figma.currentPage.selection`.

### Live smoke matrix

At minimum, verify in a real Figma Design file:

1. name/type/text searches under one node and across two pages;
2. rotation and constraints readback;
3. visible versus opacity behavior;
4. contained mask enable/disable and an out-of-scope refusal;
5. mixed-font partial-range styling including one emoji boundary refusal;
6. native line, vector, text path, section, and slice creation;
7. code-syntax set/remove, mode add/rename/delete, and explicit-mode clear;
8. local and library component swap with override inspection;
9. top-level detach and nested detach refusal;
10. component property add -> returned canonical ID -> bind -> unbind.

---

## Success measures

The release is complete only when:

- Every complete source-checklist item has a working, documented path.
- The only new public tools are the three instance/component operations explicitly approved in the source list.
- No workflow depends on current selection.
- Valid representative calls succeed on the first invocation from schema information alone.
- Every intentionally induced failure in the test matrix gives enough information for one corrected retry without another discovery call, except when live document state genuinely must be re-read.
- No invalid consolidated call partially applies a predictably invalid later field.
- Existing safety guarantees remain true and the safety matrix is synchronized.
- Tool results expose canonical IDs and resulting values needed for the next model decision.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Renamed tools break existing prompts/clients | High | Major/hard-cutover release, migration table, repo-wide reference check, no ambiguous aliases |
| Consolidated schemas become difficult for models | Medium | Strict discriminators, type-specific fields, examples, emitted-schema tests, explicit alternatives in descriptions |
| One call partially mutates before a later setter fails | Medium | Complete-call preflight, font/asset loading first, cleanup for creations, partial disclosure for residual API failures |
| Mask changes affect layers outside the named target | High without guard | Parent-in-scope and affected-sibling containment; no instance-interior mask edits |
| Range indices split user-perceived characters | Medium | UTF-16 contract, surrogate-pair rejection, nearest-boundary recovery details |
| "Full text support" overpromises read-only API fields | Medium | Explicit writable matrix and exclusions; schema/handler parity tests |
| Text-path creation destroys a source path | Medium without preservation | Clone then convert; source preservation fixed by contract |
| Mode deletion causes silent value/reference loss | High without guard | Explicit destructive target, exact names, last-mode check, consumer scan, before/after default reporting |
| Component swap silently loses incompatible overrides | Medium | Explicit destructive hint, before/after snapshot, no preservation guarantee, warning/diff output |
| Nested detach mutates ancestor instances | High | Hard plugin-side nested-instance refusal |
| Canonical component property key is unavailable after add/edit | Certain in current code | Capture the Figma API return value and expose `propertyId` in the same result |
| Figma plan/API differences reject otherwise valid operations | Medium | Live smoke tests, structured `FIGMA_API_ERROR` details, no silent fallback |

---

## Open questions

### Q1 - What was the unfinished `variable_manage` checklist item?

The source list contains `Expand variable_manage to include` with no capability after it.

- **Option A:** delete the empty item as an editing artifact.
- **Option B:** fill it with a specific capability before implementation.
- **Recommendation:** Option A unless the original author supplies the missing requirement. Do not infer collection rename, hidden-from-publishing, extended collections, or another variable feature from an empty line.

Q1 does not block design or implementation of the other sections, but it must be resolved before the release is declared to cover the source checklist completely.

---

## Provenance

The following claims were verified from code, not repository popularity metrics.

| Item | Verified source | Finding |
| :- | :- | :- |
| Local read surface | `src/mcp_server/tools/page.ts`, `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/nodeReaders.ts` | `page_info` has page-ID lookup; `node_info` has recursive reads and only type/layoutMode filter logic, with no flat name/text search |
| Local transform/layout/appearance | `src/mcp_server/tools/node.ts`, corresponding plugin handlers | Transform publishes x/y/width/height only; auto layout has no constraints; effects tool has no node visibility/opacity/blend/mask fields |
| Local text surface | `src/mcp_server/tools/text.ts`, `figma_plugin/handlers/textHandlers.ts` | Style is whole-node and publishes a subset; content handling is TEXT-oriented |
| Local creation surface | `src/mcp_server/tools/create.ts`, `nodeCreators.ts`, `vectorHandlers.ts` | No LINE, TEXT_PATH, native VECTOR_PATHS, SECTION, or SLICE branch |
| Local variable surface | `src/mcp_server/tools/variable.ts`, `variableHandlers.ts` | Actions are create collection/create variable/update variable; no code syntax or mode add/rename/delete; explicit mode values are strings only |
| Local component/instance surface | `src/mcp_server/tools/component.ts`, `instance.ts`, `componentHandlers.ts` | Component add/edit discards returned canonical keys; no direct swap, detach, or component-property-reference binding tool |
| Pinned Figma API | `@figma/plugin-typings` 1.125.0 | Provides `createLine`, `createVector`, `createSlice`, `createSection`, `createTextPath`, range text setters, constraints, mask fields, explicit-mode clear, mode add/rename/remove, code-syntax set/remove, `swapComponent`, and `detachInstance` |
| Figwright comparison baseline | `awdr74100/figwright` at commit `e2a30a3de38fada3ad1c058a500c4b3b81641053` | Implements the compared thin tools; this PRD consolidates selected capabilities under local safety and naming conventions rather than copying its tool count |

---

## Revision history

- **Rev 1, 2026-07-18** - Initial PRD. Converts the complete source checklist into 16 implementation sections, records three hard-cutover renames and three new tools, specifies search consolidation, mask containment, UTF-16 text ranges, source-preserving text paths, strict region/vector/line branches, variable mode lifecycle, destructive instance semantics, canonical component property IDs, testing, rollout, provenance, and the unresolved empty `variable_manage` bullet as Q1.
