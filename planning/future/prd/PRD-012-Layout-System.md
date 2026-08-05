# PRD — Layout System

- **Status:** Proposed
- **Release:** Version-unassigned standalone minor release with an accepted hard cutover
- **PRD date:** 2026-08-04
- **Source:** [Figma Design Editing Capability Expansion, Section 3](../initiative/03%20-%20Figma%20Design%20Editing%20Capability%20Expansion/initiative.md#3-node_set_layout-container-child-grid-and-viewport-layout-p0)
- **Compatibility posture:** Hard-replace `node_set_auto_layout` with `node_set_layout`; no compatibility alias

> [!IMPORTANT]
> This release owns the complete layout decision: horizontal/vertical/wrapping/grid containers, direct-child participation and placement, sizing bounds, constraints, clipping, overflow, and literal visual grids. Every supplied field is checked against one computed effective target/parent state before the first setter.

## 1. Executive summary

Replace the narrowly named `node_set_auto_layout` tool with `node_set_layout`. Existing flat auto-layout field names keep their behavior, while the new contract adds grid auto layout, child layout participation, min/max sizing, constraints, clipping, overflow direction, and strict literal layout-grid replacement.

The release accepts a hard tool-name cutover. `node_set_auto_layout` is removed from schemas, registration, dispatch, generated output, prompts, guides, tests, and `SAFETY.md` in the same release. No alias remains.

Layout fields are highly state-dependent. The plugin must compute effective target mode, effective parent mode, proposed grid bounds/occupancy, sizing compatibility, constraint activity, and field support using current state plus the complete request. Predictable invalidity aborts the entire call before any layout setter can reflow children.

## 2. Release identity and source mapping

| Source requirement | Disposition in this release |
| :- | :- |
| Source checklist item 3, rename/expand auto layout with constraints | Complete |
| Source checklist item 22, broader container/child/grid/viewport layout | Complete |
| Product decisions D1, D2, D5, and D18 | Preserved for this scope |
| Section 3 exact contract | Complete |
| Section 20 `node_set_layout` safety row | Owned here |
| Schema requirements 1–7 and layout portions of requirement 12 | Owned here |
| Phase 3 layout bullet | Expanded below |
| Layout schema, handler, safety, and live tests | Owned here |

Public-surface arithmetic:

- tools added by name: `node_set_layout`;
- tools removed by name: `node_set_auto_layout`;
- net tool-count change: 0;
- permanent compatibility aliases: 0.

The project explicitly accepts this hard cutover in a minor release. The concrete version remains unassigned until scheduling and must then be synchronized across all enforced surfaces.

## 3. Problem

The existing tool covers basic horizontal/vertical auto layout. Figma's writable layout model spans several coupled state domains:

- container mode, wrapping, padding, alignment, gaps, and sizing;
- grid row/column counts and track definitions;
- a direct child's participation, sizing, positioning, growth, alignment, grid anchor, and span;
- min/max size bounds and constraints;
- clipping, prototype overflow, and visual layout grids.

Publishing these as unrelated setters would force the caller to sequence one layout decision across tools and make transient invalid states more likely. Applying fields sequentially without complete validation is unsafe because an early mode/count/sizing setter can immediately reflow children before a later incompatibility is discovered.

## 4. Goals

1. Expose one strict layout tool organized around the user's layout decision.
2. Preserve current valid auto-layout fields and behavior under the new name.
3. Support horizontal, vertical, wrapping, and grid container modes.
4. Support direct-child sizing, participation, positioning, alignment, and grid placement.
5. Support min/max sizing, active constraints, clipping, overflow, and literal visual grids.
6. Compute and validate complete effective target/parent/grid state before mutation.
7. Refuse occupied-grid shrink and child collisions with exact blocking operands.
8. Apply fields in a deterministic dependency order and return exact resulting state.
9. Reconcile unexpected partial layout mutation without rollback claims.
10. Remove every old-name route/reference in the same release.

## 5. Explicit non-goals

- No compatibility alias for `node_set_auto_layout`.
- No separate tools for constraints, grids, clipping, overflow, child placement, or bounds.
- No implicit current-page, current-selection, or inferred-parent behavior.
- No shared grid-style linking; use `node_apply_style`.
- No silent ignore of fields that are inactive in the effective mode.
- No partial grid-track patching; supplied arrays describe complete tracks for the effective count.
- No hidden child reparenting.
- No general transaction or automatic rollback.
- No transform, PAGE rename, appearance, paint, text, creation, structural-combine, variable, component, or instance work.

## 6. Exact public contract

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
      count: number | "AUTO";
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

  clipsContent?: boolean;
  overflowDirection?: "NONE" | "HORIZONTAL" | "VERTICAL" | "BOTH";
  layoutGrids?: LayoutGridInput[];
};
```

## 7. Schema rules

- The top level and all nested objects/unions are strict. Unknown keys fail and are not stripped.
- At least one mutable field is required.
- Empty `grid` and `gridChild` objects fail.
- `GridTrackInput` and `LayoutGridInput` are discriminated strict unions; fields for another branch fail.
- Numeric inputs are finite.
- Counts, indices, and spans use integer constraints where specified.
- `layoutGrow` is exactly `0 | 1`.
- Positive/null size-bound semantics are explicit.
- `constraints` always supplies both axes.
- `gridChild.position`, when present, supplies both row and column.
- Layout-grid `count` accepts a positive integer or the literal `"AUTO"`; output never serializes Figma `Infinity` as JSON `null`.
- At least-one-field, mutual exclusion, and mode-dependent refinements run at the MCP boundary and again in the plugin because schema validation is not a safety boundary.

## 8. Effective-state preflight

The plugin computes one proposed state from the current target, current parent, and complete request. No setter runs until every supplied field passes.

### 8.1 Common target and property support

- Resolve and exact-name-verify the target.
- Apply existing node-write permission, scope, lock, remote-state, instance-interior, and scope-root controls.
- Resolve the direct parent when any parent-dependent field is supplied.
- Verify every requested property exists on the target.
- Compute effective `layoutMode`, `layoutWrap`, target sizing, bounds, positioning, parent mode/sizing, grid counts/tracks, and child occupancy.

### 8.2 Container flow

- `layoutMode: "GRID"` and `grid` require both `AutoLayoutMixin` and `GridLayoutMixin`.
- Grid mode is refused on unsupported slot/container types.
- Horizontal/vertical flow fields are rejected in effective `NONE` or `GRID` mode.
- `counterAxisAlignContent` and non-null `counterAxisSpacing` require effective `WRAP`.
- `BASELINE` requires effective horizontal auto layout.
- Padding, spacing, and other numeric domains must satisfy Figma's pinned ranges.

### 8.3 Grid container

- `grid` requires effective `layoutMode: "GRID"`.
- Row and column counts are positive integers.
- Row and column gaps are non-negative.
- A supplied row/column track array length exactly equals the corresponding effective count.
- `FIXED` requires positive pixel `value`.
- `FLEX` optionally accepts a positive fractional-unit `value`.
- `HUG` forbids `value`.
- Before reducing counts, inspect all child anchors/spans. If occupied cells would fall outside new bounds, refuse with blocking child identities/cells and the minimum valid counts before changing either count.

### 8.4 Grid child

- The target must be a direct child of an effective `GRID` parent.
- Position indices are zero-based and in bounds.
- Row/column are paired.
- Spans are positive integers.
- The complete proposed rectangle must fit within effective grid bounds.
- Check the proposed rectangle for overlap using the pinned Figma occupancy behavior before position/span setters.
- Return blocking child identities and occupied rectangles on collision.

### 8.5 Auto-layout child participation and sizing

- `layoutPositioning`, `layoutGrow`, and `layoutAlign` require a direct child of a horizontal/vertical auto-layout parent.
- Publish only `STRETCH` and `INHERIT` for `layoutAlign`.
- `HUG` applies only where Figma supports it, including auto-layout containers/text.
- `FILL` applies only to direct auto-layout children.
- Incompatible `HUG`, `FILL`, grow, stretch, and parent-sizing combinations fail with effective parent state and the exact field to change.

### 8.6 Bounds and constraints

- Min/max fields apply only to auto-layout containers and their direct children.
- Positive number sets a bound; `null` clears it.
- Validate complete effective `minWidth <= maxWidth` and `minHeight <= maxHeight` after applying all requested changes.
- Constraints require `ConstraintMixin`.
- Both axes are assigned together.
- Constraints are active only outside parent-controlled flow or when `layoutPositioning: "ABSOLUTE"` is already effective or included in the same request.

### 8.7 Viewport and visual grids

- `clipsContent` and `layoutGrids` require a frame-like node exposing those properties.
- `overflowDirection` requires `FramePrototypingMixin`.
- `layoutGrids` is a complete literal array replacement; `[]` clears.
- Return resulting `gridStyleId` so a literal override of a linked style is visible.
- Resolve every layout-grid alias before mutation and require a compatible FLOAT variable.
- Preserve aliases in round-trip output.
- Map input `count: "AUTO"` to Figma `Infinity`; serialize `Infinity` back to `"AUTO"`.

## 9. Deterministic mutation and readback

After complete preflight, apply groups in this dependency order:

1. layout mode;
2. container sizing and flow;
3. grid counts and track definitions;
4. child participation and placement;
5. bounds and constraints;
6. clipping, overflow, and visual grids.

No ordering choice weakens preflight: all fields are validated before group 1.

### 9.1 Success output

Return:

- target `{ id, name, type }`;
- direct parent `{ id, name, type, layoutMode }` when relevant;
- effective layout mode and wrapping state;
- exact resulting values for every supplied field;
- for `grid`, complete resulting row/column counts, gaps, and tracks;
- for `gridChild`, resulting anchor, spans, and alignments;
- resulting bounds/constraints;
- resulting clipping/overflow/layout grids and `gridStyleId` where relevant;
- `noOp` when the complete requested state already matches;
- optional `partialMutation`, `failedFieldGroup`, `before`, `requested`, and `resulting` for reconciled native failures.

`node_set_layout` is an absolute setter and carries:

```ts
{
  idempotentHint: true,
  openWorldHint: true
}
```

Annotations are advisory; plugin checks are authoritative.

### 9.2 Unexpected native failure

If a setter throws after mutation begins:

1. stop later field groups;
2. read back every requested layout field plus effective parent/grid state;
3. compare against the pre-call snapshot and requested state;
4. report applied groups/fields and their before/resulting values;
5. set `partialMutation: true` when state changed;
6. identify `failedFieldGroup`;
7. do not silently retry or claim rollback.

## 10. Structured error contract

The final central taxonomy may consolidate factories, but callers must distinguish at least:

| Condition | Required details/recovery |
| :- | :- |
| Unsupported mutable property | Target ID/name/type, field, required mixin/capability, corrected call without the field |
| Invalid/inactive layout mode | Current/requested/effective mode, incompatible fields, accepted fields for that mode |
| Invalid parent layout state | Parent identity, current/effective mode/sizing, child field that requires another state, exact prerequisite/change |
| Invalid grid track | Axis/index, branch, supplied value, expected domain, corrected track |
| Track/count mismatch | Effective count, supplied track count, complete corrected array requirement |
| Occupied grid shrink | Blocking child IDs/names/rectangles and minimum row/column counts |
| Invalid grid-child position/span | Proposed rectangle, effective bounds, zero-based wording, corrected bounds |
| Grid-child collision | Target rectangle and every blocking child/rectangle |
| Incompatible sizing/grow/align | Target and parent effective state, conflicting fields, exact field/state to change |
| Invalid min/max bounds | Complete effective min/max values and valid relation |
| Inactive constraints | Parent state, positioning state, and corrected call including `ABSOLUTE` where legal |
| Invalid wrapping field | Effective wrap/mode and required state |
| Viewport/layout-grid unsupported | Target type, missing capability, accepted target classes |
| Invalid layout-grid alias | Alias ID, field/index, resolved variable type/status, required FLOAT type |
| Unexpected partial mutation | Failed group plus exact before/requested/resulting layout state |

Every refusal includes machine-usable operands and accepted values. When a deterministic one-step correction exists, return complete corrected arguments rather than prose alone.

## 11. Safety contract

`SAFETY.md` must remove `node_set_auto_layout` and add `node_set_layout` with:

- existing node-write scope, exact-name, lock, instance-interior, scope-root, and permission checks;
- target and parent mixin/property checks;
- complete effective-mode and effective-parent validation;
- grid bounds and occupancy preflight;
- child rectangle collision checks;
- sizing/grow/align compatibility;
- min/max relation checks;
- active-constraint checks;
- viewport and grid-style-link visibility;
- variable-alias type checks;
- no setter before complete predictable validation.

The registered-tool/safety-row consistency test must fail if either the retired row remains or the new row is missing.

## 12. Dependencies and exclusions

### Required baseline

- Existing `node_set_auto_layout` behavior and fixtures to migrate.
- Existing exact-node write stack and direct parent resolution.
- Existing variable-alias resolution and `node_apply_style` alternative.
- Pinned typings/runtime support for grid auto layout, grid-child placement, sizing bounds, constraints, clipping, overflow, and layout grids.

### Independence

This release does not require transform, PAGE rename, appearance, paint, text, creation, structural-combine, variable-management, or component/instance releases. It may share `node.ts`, dispatcher, and layout-related helpers with them, but no recovery instruction or acceptance criterion refers to an unshipped adjacent capability.

## 13. Implementation areas and phases

### Primary files

- `src/mcp_server/tools/node.ts`
- `src/mcp_server/tools/index.ts` or current tool inventory
- `figma_plugin/src/main.ts`
- `figma_plugin/handlers/layoutHandlers.ts`
- shared strict layout/grid schema and effective-state validator modules
- central error definitions/playbook
- `src/mcp_server/tests/unit/tools/`
- `src/mcp_server/tests/unit/figma_plugin/`
- `SAFETY.md`
- `skills/figma-edit/references/` and corresponding resource sources
- generated `figma_plugin/code.js`

### Phase 0 — Revalidate scheduled baseline and pinned API

- Inventory old tool registration, schema, fields, handler behavior, safety row, prompts, docs, tests, and generated references.
- Verify every enum/mixin/property and native grid method against the scheduled typings and live Figma.
- Probe any undocumented occupancy/index/setter behavior needed by the exact validator.

### Phase 1 — Strict schemas and migration contract

- Add `GridTrackInput`, `LayoutGridInput`, and complete strict `NodeSetLayoutInput`.
- Add top-level/nested non-empty and cross-field refinements.
- Add central recovery-bearing errors.
- Add emitted-schema red tests.
- Publish old-name migration using unchanged existing field names.

### Phase 2 — Effective-state engine

- Resolve target/parent and snapshot all relevant state.
- Compute effective request state without mutation.
- Add property/mixin, mode, sizing, constraints, grid bounds, occupancy, and alias validation.
- Add complete error detail operands.

### Phase 3 — Deterministic handler and reconciliation

- Implement dependency-ordered field groups.
- Normalize layout/grid readback including `Infinity` ↔ `"AUTO"`.
- Add no-op detection.
- Add post-error readback and exact partial-mutation disclosure.

### Phase 4 — Hard-cutover cleanup

- Remove `node_set_auto_layout` from registration, command/client unions, dispatch, handler exports, prompts, docs, `SAFETY.md`, tests, and generated output.
- Prove there is no alias or hidden route.

### Phase 5 — Documentation and release closure

- Synchronize guides/resource mirrors/changelog/version.
- Regenerate plugin output.
- Run focused/full repository gates and live matrix.

## 14. Verification requirements

### 14.1 Emitted-schema and MCP-boundary tests

- `node_set_layout` emits every exact field and strict nested union.
- At least one mutation field is required.
- Empty `grid`/`gridChild`, unknown keys, invalid enums, non-finite values, and invalid integer/range domains fail.
- Track branches enforce required/forbidden `value` fields.
- `count` uses integer or `"AUTO"`, never JSON `null`.
- Constraints require both axes and grid position requires both coordinates.
- Old tool name is absent; tool count is unchanged.
- Idempotent/open-world annotations are asserted.

### 14.2 Handler tests

- Existing horizontal/vertical fixtures migrate without behavior or field-name changes.
- Horizontal, vertical, wrap, and grid container success.
- Mode transitions with jointly supplied dependent fields.
- Grid counts, gaps, complete tracks, shrink bounds, and occupied-cell refusal.
- Grid-child positions, spans, alignments, out-of-bounds, and collision refusal.
- Child `FILL`/`HUG`, absolute positioning, grow/align, and parent-sizing compatibility.
- Min/max set/clear and complete effective inequality checks.
- Active/inactive constraints.
- Clipping, overflow, and literal layout-grid set/clear/readback.
- Alias resolution/type checks and identity-preserving output.
- `Infinity`/`"AUTO"` normalization.
- Mixed valid/invalid requests produce zero mutation.
- Deterministic setter group order.
- Injected failure in every group reports exact applied/before/resulting state and stops later groups.
- Repeating the same absolute call returns a no-op/idempotent result.

### 14.3 Safety and retired-route tests

- Scope, name, lock, instance-interior, scope-root, parent, and permission checks remain plugin-side.
- Invalid effective parent/mode/grid state cannot partially apply another field.
- Grid shrink and collision failures happen before any setter.
- No handler reads current selection or depends on implicit current page.
- `node_set_auto_layout` is absent from registration, command/client unions, dispatch, handler exports, prompts, generated bundle, docs, tests, and safety rows.
- Registered writes and `SAFETY.md` are bidirectionally synchronized.

### 14.4 Live Figma matrix

Verify in a real Figma Design file:

1. migrated horizontal and vertical auto layout;
2. wrapping and wrap-only alignment/spacing;
3. grid creation/configuration with all track branches;
4. grid count expansion and occupied-cell shrink refusal;
5. direct grid-child anchor/span/alignment and collision refusal;
6. direct auto-layout child `FILL`, `HUG`, grow, align, and absolute positioning;
7. min/max set and clear;
8. constraints in active and inactive parent states;
9. clipping and every overflow direction supported by the host;
10. literal GRID/ROWS/COLUMNS layout-grid replacement, style-link readback, aliases, and `AUTO` count normalization;
11. a multi-field invalid request with verified zero mutation;
12. exact resulting state through follow-up reads.

Mocks and typings alone do not establish host layout/reflow behavior.

## 15. Documentation, generated output, and version gates

Before release:

- Update `README.md`, `SAFETY.md`, `CHANGELOG.md`, tool-selection, workflows, constraints, and error playbook.
- Update matching `figma-edit://guide/*` resources.
- Publish the hard-cutover rename table and representative old/new calls.
- Explain container versus child fields, effective parent state, zero-based grid placement, literal grids versus shared styles, and complete-array semantics.
- Document `AUTO`/Infinity normalization and partial-mutation limitations.
- Regenerate `figma_plugin/code.js`; do not hand-edit it.
- Update emitted tool snapshots, tool counts, permission/safety matrices, old-name absence checks, and generated output.
- Assign and synchronize the scheduled version across every surface enforced by the current version/plugin gates.
- Run server/plugin type checks, generated-file checks, suppression checks, plugin build verification, version checks, focused suites, and the full unit suite.

## 16. Acceptance gate

- [ ] `node_set_layout` is the only registered layout setter and `node_set_auto_layout` is absent everywhere.
- [ ] Existing valid auto-layout calls migrate by changing only the tool name.
- [ ] The exact strict schema covers container, child, grid, sizing, constraints, clipping, overflow, and visual grids.
- [ ] One complete effective-state preflight runs before every setter.
- [ ] Grid shrink/collision and every predictable invalid state produce zero mutation with actionable operands.
- [ ] Mutation order is deterministic and resulting state is read back exactly.
- [ ] Unexpected failures disclose precise partial state without rollback claims.
- [ ] Schema, handler, safety, retired-route, injected-fault, and live tests pass.
- [ ] Docs, resources, generated output, changelog, and version surfaces are synchronized.
- [ ] No adjacent scope entered the release.

## 17. Risks and mitigations

| Risk | Mitigation |
| :- | :- |
| A mode/count change reflows children before later validation fails | Compute complete effective target/parent/grid state before setter one |
| Grid shrink strands occupied children | Scan anchors/spans and return blocking cells plus minimum valid counts |
| Child placement overlaps existing content | Validate complete rectangle/occupancy before native setters |
| `HUG`/`FILL`/grow/stretch is accepted in an incompatible parent | Return effective parent mode/sizing and exact corrective field |
| Constraints are accepted but inactive | Require active flow/absolute-position state and explain recovery |
| `Infinity` becomes JSON `null` | Canonically serialize it as `"AUTO"` and test both directions |
| Literal grids silently break style linkage | Return `gridStyleId` and document `node_apply_style` as the shared-style path |
| Hard cutover breaks callers | Complete migration table, repository-wide absence tests, no alias |
| Native layout behavior differs by plan/API | Revalidate typings, probe live behavior, and fail with structured Figma errors without fallback |
| Unexpected setter failure leaves reflowed state | Stop later groups, read back, and disclose exact partial mutation |

## 18. Source fidelity and contradictions

This PRD preserves the complete Section 3 layout surface rather than treating the umbrella's broad Phase 3 as one release. No product-contract contradiction was found in this scope.

The source leaves exact Figma numeric limits and some occupancy/native behavior to the pinned API. Those are implementation-time evidence requirements, not permission to guess. If the scheduled typings or live host cannot support a published branch deterministically, implementation stops and the PRD is revised before changing the public contract.
