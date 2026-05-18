# Component Property Enhancement — Review Recommendations

This document captures the gaps, pitfalls, and contradictions identified while comparing [component_property_enhancement.md](component_property_enhancement.md) against the current codebase. Each item below is actionable and should be addressed (or explicitly waived) before implementation begins.

---

## 1. Correct the file references in the plan ✅ Adopted

The plan implies `get_nodes_info` lives near the other component code, but it actually lives in [src/mcp_server/tools/document.ts:74](../src/mcp_server/tools/document.ts#L74), not [src/mcp_server/tools/components.ts](../src/mcp_server/tools/components.ts). The plugin-side dispatch is in [figma_plugin/src/main.ts:461-472](../figma_plugin/src/main.ts#L461-L472).

**Action:** Update Section 1 of the plan to reference `document.ts` and the correct dispatch location so the implementer doesn't edit the wrong file.

**Resolution:** Section 1 of [component_property_enhancement.md](component_property_enhancement.md) now includes a "File locations" callout listing the four relevant paths (MCP tool registration, plugin command dispatch, plugin handler, filter function), and the requirement bullets reference the specific files to edit.

---

## 2. Plumb the new `fields` parameter end-to-end ✅ Adopted

The plan adds `fields` to the MCP tool schema but never describes how the value reaches the plugin. The full path requires changes at five layers:

1. The MCP tool schema in [src/mcp_server/tools/document.ts](../src/mcp_server/tools/document.ts) — add the `fields` zod definition.
2. The `sendCommandToFigma("get_nodes_info", { nodeIds, fields })` call in the same file — currently only passes `nodeIds`.
3. The `case "get_nodes_info"` branch in [figma_plugin/src/main.ts:461](../figma_plugin/src/main.ts#L461) — currently calls `getNodesInfo(params.nodeIds)`, dropping `fields`.
4. The signature of `getNodesInfo` in [figma_plugin/handlers/nodeReaders.ts:92](../figma_plugin/handlers/nodeReaders.ts#L92) — accept and forward `fields`.
5. The signature of `filterFigmaNode` in [figma_plugin/utils/nodeUtils.ts:12](../figma_plugin/utils/nodeUtils.ts#L12) — accept `fields` and use it in place of the hardcoded property selection.

**Action:** Enumerate these five touch-points in Section 1 of the plan so nothing is silently missed.

**Resolution:** Section 1 of [component_property_enhancement.md](component_property_enhancement.md) now contains an explicit "End-to-End Plumbing" subsection that enumerates all five layers with file paths, line numbers, and the specific change required at each layer. The dispatch step also covers the implicit scope-root call path so `fields` is honored when no `nodeIds` are supplied.

---

## 3. Decide whether `readMyDesign` gets the same `fields` treatment ✅ Adopted (deleted)

`readMyDesign` ([figma_plugin/handlers/nodeReaders.ts:126](../figma_plugin/handlers/nodeReaders.ts#L126)) shares the same export-and-filter pattern as `getNodesInfo`. If only `getNodesInfo` is updated, the two readers will diverge in capability and surprise callers.

**Action:** Either extend `fields` support to `readMyDesign` as well, or state explicitly in the plan that it is intentionally left alone.

**Resolution:** Investigation showed `readMyDesign` had no corresponding MCP tool registration — the plugin command `read_my_design` was unreachable from any client (and its removal had already been planned in [completed/tool_rationalization_plan.md](completed/tool_rationalization_plan.md) but never executed plugin-side). Deleted in four places:
- Function definition removed from [figma_plugin/handlers/nodeReaders.ts](../figma_plugin/handlers/nodeReaders.ts).
- Re-export removed from [figma_plugin/handlers/index.ts](../figma_plugin/handlers/index.ts).
- Import removed from [figma_plugin/src/main.ts:10](../figma_plugin/src/main.ts#L10).
- `case "read_my_design"` dispatch removed from [figma_plugin/src/main.ts](../figma_plugin/src/main.ts).

---

## 4. Delete the dead duplicate `filterFigmaNode` ✅ Adopted (deleted)

There are two `filterFigmaNode` implementations:

- [figma_plugin/utils/nodeUtils.ts:12](../figma_plugin/utils/nodeUtils.ts#L12) — actually used by the plugin.
- [src/mcp_server/utils.ts:45](../src/mcp_server/utils.ts#L45) — orphaned; the server never calls it because filtering happens plugin-side before the data crosses the wire.

The plan only references the plugin copy, but leaving the dead copy in place invites future contributors to edit the wrong one.

**Action:** Delete the orphaned copy in [src/mcp_server/utils.ts](../src/mcp_server/utils.ts) as part of this change.

**Resolution:** Confirmed no production caller — only the test file referenced it. Deleted in two places:
- Function removed from [src/mcp_server/utils.ts](../src/mcp_server/utils.ts).
- `import { ... filterFigmaNode }` and the entire `describe('filterFigmaNode', ...)` block removed from [src/mcp_server/tests/utils.test.ts](../src/mcp_server/tests/utils.test.ts).

**Follow-up:** `rgbaToHex` in [src/mcp_server/utils.ts:31](../src/mcp_server/utils.ts#L31) is now also dead — its only consumer was the deleted `filterFigmaNode` (the plugin has its own `rgbaToHex` in [colorUtils.ts](../figma_plugin/utils/colorUtils.ts)). Tracked as item #19 below.

---

## 5. Acknowledge that the new default for `get_nodes_info` is a breaking change ✅ Adopted

Today the tool always returns rich data (fills, characters, style, etc.). The plan changes the default to `id` and `name` only. This will silently break callers that depend on the rich payload, including:

- The `join_channel` flow at [src/mcp_server/tools/document.ts:231-235](../src/mcp_server/tools/document.ts#L231-L235), which reads `scopeNode.document?.name` (still works, but worth confirming).
- Existing tests/fixtures that expect the rich shape.
- Any LLM-driven flow that calls `get_nodes_info` with no `fields` and then inspects styling.

**Action:** Call out the regression risk in the plan, audit current callers, and migrate them to pass an explicit `fields` array.

**Resolution:** Two parts:

1. **`join_channel` migration encoded in the plan.** Section 1 of [component_property_enhancement.md](component_property_enhancement.md) now contains a "Migrate `join_channel`" subsection that updates the initial-connection call to request `fields: ["absoluteBoundingBox", "layoutMode"]` — giving the agent canvas dimensions and auto-layout context in the same round-trip without inflating token cost. Heavier styling/text fields are intentionally excluded.

2. **Repo-wide audit complete.** All `get_nodes_info` / `getNodesInfo` references were classified. Affected callers needing fix:

   | Caller | Fix tracked in |
   |---|---|
   | `swap_overrides_instances` prompt — [components.ts:325](../src/mcp_server/tools/components.ts#L325) | Item #6 |
   | `design_strategy` prompt — [document.ts:323](../src/mcp_server/tools/document.ts#L323) | Item #6 (expanded) |
   | Text-replacement prompt — [text.ts:383](../src/mcp_server/tools/text.ts#L383) | Item #6 (expanded) |
   | Test assertion — [document.test.ts:84](../src/mcp_server/tests/unit/tools/document.test.ts#L84) | Item #20 |
   | Test assertion — [document.test.ts:101](../src/mcp_server/tests/unit/tools/document.test.ts#L101) | Item #20 |

   Confirmed unaffected (still works under id+name+type+children default): the prototyping prompt at [prototyping.ts:247](../src/mcp_server/tools/prototyping.ts#L247) (asks for names/types only), `DRAGME.md` lines 121/127/132/957 (name-lookup or setup-test usage), [readme.md:228](../readme.md#L228) (generic description), and `.claude/settings.local.json` (permission allowlist).

   Out of scope: `documentation/legacy/`, `documentation/completed/`.

---

## 6. Update LLM-facing prompts that invoke `get_nodes_info` ✅ Adopted

Three prompts instruct the model to call `get_nodes_info` for purposes that need richer data than the new default returns. Each will silently produce a useless verification step (only id+name back) unless addressed.

| Prompt | Location | Disposition |
|---|---|---|
| `swap_overrides_instances` | [src/mcp_server/tools/components.ts:325](../src/mcp_server/tools/components.ts#L325) | **Update** — replace "Verify results with `get_nodes_info()`" with `get_nodes_info(nodeIds, fields: ["componentProperties", "characters", "overrides"])`. **Also fix stale example** at [components.ts:317-321](../src/mcp_server/tools/components.ts#L317-L321): the prompt shows `set_instance_overrides({ sourceInstanceId, targetNodeIds: [...] })` but the current API takes `targetNodes: [{ nodeId, nodeName }, ...]` (see [components.ts:184-194](../src/mcp_server/tools/components.ts#L184-L194) — `nodeName` is required for write-side name verification). Update the example to match. |
| `design_strategy` | [src/mcp_server/tools/document.ts:266-351](../src/mcp_server/tools/document.ts#L266-L351) | **Remove entirely** — see plan Section 1. Generic best-practices prompt whose only operational instruction relevant here was the misleading verification step. Removal tracked in [component_property_enhancement.md](component_property_enhancement.md). |
| `text_replacement_strategy` | [src/mcp_server/tools/text.ts:383](../src/mcp_server/tools/text.ts#L383) | **Update** — change `get_nodes_info(nodeIds: ["node-id"])  // optional` to `get_nodes_info(nodeIds: ["node-id"], fields: ["characters", "style"])` |

**Confirmed unaffected:** The prototyping prompt at [prototyping.ts:247](../src/mcp_server/tools/prototyping.ts#L247) asks for "names, types" only — both are returned by default, no change needed.

**Action:** Update the two retained prompts and remove `design_strategy` when implementing the `fields` feature.

**Resolution:** All three changes applied:
- [src/mcp_server/tools/components.ts](../src/mcp_server/tools/components.ts) — `swap_overrides_instances` prompt updated: verification step now passes `fields: ["componentProperties", "characters", "overrides"]`, and the `set_instance_overrides` example now shows the correct `targetNodes: [{ nodeId, nodeName }, ...]` shape.
- [src/mcp_server/tools/text.ts](../src/mcp_server/tools/text.ts) — `text_replacement_strategy` prompt updated: optional `get_nodes_info` call now requests `fields: ["characters", "style"]`.
- [src/mcp_server/tools/document.ts](../src/mcp_server/tools/document.ts) — `server.prompt("design_strategy", ...)` registration deleted (lines 265-351 in the original file).

**Caveat:** The `fields` parameter referenced in the updated prompts is dormant guidance until items #1 and #2 are implemented — current zod schema silently strips unknown keys, so agents calling with `fields: [...]` today still get the old rich-payload back. No regression; the guidance becomes operationally accurate once the plumbing lands.

---

## 7. Commit to a single source of field names ✅ Adopted

The plan's field list mixes Plugin API names and REST API names (e.g., `transitionNodeID` is REST-style; `layoutGrow`/`layoutAlign` are child-level Plugin-API fields; `cornerRadius` can be `figma.mixed` in Plugin API but per-corner in REST). Since the plan calls for `node.exportAsync({ format: "JSON_REST_V1" })`, the source of truth is REST.

**Action:** State explicitly that `fields` values must match keys present in the `JSON_REST_V1` document object. Remove or relabel fields that don't apply at the level callers expect (for example, note that `layoutAlign` / `layoutGrow` are properties of *children* of an auto-layout container, not of the container itself).

**Resolution:** Updated Section 1 of [component_property_enhancement.md](component_property_enhancement.md) to explicitly state that field names must exactly match keys in the `JSON_REST_V1` format, and added a note clarifying that `layoutAlign` and `layoutGrow` apply to the children inside an auto-layout container.

---

## 8. Specify recursion semantics for the `fields` filter ✅ Adopted

When `fields=['componentPropertyDefinitions']` is requested on a COMPONENT_SET, what happens to children that don't have that key? What about deeply-nested children of mixed types?

**Action:** Document the rules:
- Always include `id`, `name`, and `type` on every node.
- Silently skip fields that are absent on a given node.
- Always recurse into `children` regardless of whether `children` appears in `fields`.

**Resolution:** Added a "Recursion and Filtering Semantics" block in Section 1 of [component_property_enhancement.md](component_property_enhancement.md) detailing the rules for including mandatory fields, silently skipping absent fields, and unconditionally recursing into `children`.

---

## 9. Re-categorize `overrides` in the field list ✅ Adopted

The plan groups `overrides` under "Component Properties," but on an INSTANCE node `overrides` is a flat array of all per-node overrides (text content, fills, properties, etc.) — not specifically component-property data.

**Action:** Move `overrides` into its own group in Section 1, or rename the "Component Properties" bucket to "Instance Data."

**Resolution:** Created a separate "Instance Data" group for `overrides` in Section 1 of [component_property_enhancement.md](component_property_enhancement.md).

---

## 10. Add read-only and scope checks to both new write tools ✅ Adopted

Every existing write command in [figma_plugin/src/main.ts](../figma_plugin/src/main.ts) follows the pattern:

```ts
if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
if (!(await checkScopeAccess(params?.nodeId))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
if (!(await verifyNodeName(params?.nodeId, params?.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);
```

The plan only mentions `nodeName` verification for `set_component_instance_property` and `manage_component_property`. Without `state.readOnly` and `checkScopeAccess`, the new tools would silently bypass the editable-scope safety model — a significant security/consistency gap.

**Action:** Update Sections 2 and 3 of the plan to specify the same three-step gating used by every other write command.

**Resolution:** Added a "Security / Validation" bullet point to the Implementation Strategy sections of both `set_component_instance_property` and `manage_component_property` in [component_property_enhancement.md](component_property_enhancement.md), explicitly requiring the standard three-step gating.

---

## 11. Define how `propertyName` is resolved ✅ Adopted

The Figma Plugin API uses different `propertyName` formats depending on the call:

- `addComponentProperty(name, type, defaultValue)` — takes the **human-readable** name and Figma generates the `#id` suffix.
- `editComponentProperty(qualifiedName, ...)` and `deleteComponentProperty(qualifiedName)` — require the **qualified** name (e.g., `"Show Icon#5:0"`).
- `instance.setProperties({ [qualifiedName]: value })` — also requires the qualified name for non-VARIANT properties.

The plan uses `propertyName` uniformly, which silently breaks for EDIT, DELETE, and `setProperties` calls.

**Action:** Pick one of the following and document it:
- **Option A (caller responsibility):** Require the caller to pass the qualified name for EDIT/DELETE/setProperties; document this in the parameter description.
- **Option B (server responsibility):** Accept the human-readable name everywhere, look up `componentPropertyDefinitions` on the main component to resolve to the qualified name, and call the Plugin API with the resolved value.

Option B is more ergonomic but requires a definition lookup on every call.

**Resolution:** Applied Option B (server responsibility). Updated Sections 2 and 3 in [component_property_enhancement.md](component_property_enhancement.md) to instruct the plugin handler to accept the human-readable `propertyName` and automatically look up the qualified name (e.g. `"Show Icon#5:0"`) by matching it against the keys in `node.componentPropertyDefinitions` (for components) or `node.componentProperties` (for instances).

---

## 12. Pre-validate that `propertyName` exists ✅ Adopted

If a caller passes a typo'd `propertyName`, the Plugin API throws an opaque error. Both new tools should fetch `componentPropertyDefinitions` (or `componentProperties` for instances) and return a structured error listing the available property names when the lookup fails.

**Action:** Add a pre-check step to both Section 2 and Section 3 of the plan.

**Resolution:** Updated the Implementation Strategy in Sections 2 and 3 of [component_property_enhancement.md](component_property_enhancement.md) to include a "Property Name Resolution & Pre-Validation" step. This step now explicitly requires checking if the property exists before editing or deleting (and throwing a structured error with available properties if it doesn't), as well as checking for duplicates before adding a new property.

---

## 13. Clarify INSTANCE_SWAP value semantics ✅ Adopted

Both new tools accept a `value` / `defaultValue` of `string | boolean`. For INSTANCE_SWAP properties specifically, the string must be a component **key** (the stable library identifier returned by `component.key`) — not a node ID, not a component name, not a path.

**Action:** Update the parameter descriptions in Sections 2 and 3 to state this requirement explicitly so callers don't pass a node ID and get a confusing error.

**Resolution:** Updated the parameter descriptions for `value` (in Section 2) and `defaultValue` (in Section 3) within [component_property_enhancement.md](component_property_enhancement.md) to explicitly state that INSTANCE_SWAP properties require a component `key`, not a node ID.

---

## 14. Remove `VARIANT` from `manage_component_property`'s `ADD` enum ✅ Adopted

The Figma Plugin API's `addComponentProperty(name, type, defaultValue)` only supports `BOOLEAN | TEXT | INSTANCE_SWAP`. Variant properties are created exclusively via `combineAsVariants` — see existing usage in [figma_plugin/handlers/componentHandlers.ts:682](../figma_plugin/handlers/componentHandlers.ts#L682).

Listing `VARIANT` in the ADD enum is a contradiction that will fail at runtime.

**Action:** Either drop `VARIANT` from the `propertyType` enum entirely, or carve out a distinct code path in the plan that documents the `combineAsVariants`-only restriction and routes ADD-with-VARIANT through a different API.

**Resolution:** Dropped `VARIANT` from the `propertyType` parameter in Section 3 of [component_property_enhancement.md](component_property_enhancement.md) and added a note explaining that variants are created implicitly via the `create_component_set` tool.

---

## 15. Add `newDefaultValue` to the `manage_component_property` schema ✅ Adopted

The plan's implementation strategy for EDIT references `newDefaultValue`:

> For `EDIT`: Use `node.editComponentProperty(propertyName, { name: newPropertyName, defaultValue: newDefaultValue })`.

But `newDefaultValue` is missing from the declared parameter list. Without it, EDIT can rename a property but cannot change its default.

**Action:** Add `newDefaultValue: string | boolean (optional)` to the parameter schema in Section 3.

**Resolution:** Added `newDefaultValue` to the parameter schema in Section 3 of [component_property_enhancement.md](component_property_enhancement.md), including a note that it requires a component `key` for `INSTANCE_SWAP` properties.

---

## 16. Add `preferredValues` to the `manage_component_property` schema ✅ Adopted

`editComponentProperty` accepts a `preferredValues` field (an array of preferred component keys) that's commonly needed when configuring INSTANCE_SWAP properties. The plan omits it.

**Action:** Add an optional `preferredValues: string[]` parameter (relevant for INSTANCE_SWAP add/edit) to Section 3.

**Resolution:** Added `preferredValues` to the parameter schema in Section 3 of [component_property_enhancement.md](component_property_enhancement.md), and updated the implementation strategy to pass it into both `addComponentProperty` and `editComponentProperty`.

---

## 17. Add unit tests for all three changes ✅ Adopted

The repo already has [src/mcp_server/tests/unit/tools/components.test.ts](../src/mcp_server/tests/unit/tools/components.test.ts) as a template. The plan does not mention tests at all.

**Action:** Add a "Tests" subsection covering, at minimum:
- `get_nodes_info` with no `fields` returns only `id`, `name`, `type`.
- `get_nodes_info` with `fields: ['fills', 'componentProperties']` returns those keys when present and skips them when absent.
- `set_component_instance_property` happy path and "property not found" error path.
- Each `manage_component_property` action (`ADD`, `EDIT`, `DELETE`) with a mocked plugin response.

**Resolution:** Added a dedicated "Testing Strategy" section (Section 4) to [component_property_enhancement.md](component_property_enhancement.md) covering unit tests for `get_nodes_info` fields filtering, the `set_component_instance_property` tool, and the `manage_component_property` tool.

---

## 18. Confirm whether new params need wiring in `figma-client.ts` ✅ Adopted

[src/mcp_server/figma-client.ts:273-291](../src/mcp_server/figma-client.ts#L273-L291) has explicit per-field forwarding logic for `sourceInstanceId`, `targetNodes`, etc. New params (`fields`, `propertyName`, `value`, `action`, `propertyType`, etc.) may need similar plumbing depending on how the client serializes commands.

**Action:** Have the implementer verify each new parameter passes through `figma-client.ts` correctly during implementation, and add explicit handling if any are dropped or transformed.

**Resolution:** Reviewed `src/mcp_server/figma-client.ts`. The `sendCommandToFigma` function copies all incoming parameters (`const normalizedParams = { ...(params as any) };`) and spreads them directly into the request payload (`...normalizedParams`). The per-field logic mentioned only applies to ID normalization, so new standard parameters will automatically pass through. No structural changes are needed in `figma-client.ts`.

---

## 19. Delete the orphaned `rgbaToHex` in server `utils.ts` ✅ Adopted

Surfaced as a follow-up while adopting #4. After removing `filterFigmaNode` from [src/mcp_server/utils.ts](../src/mcp_server/utils.ts), `rgbaToHex` at [src/mcp_server/utils.ts:31](../src/mcp_server/utils.ts#L31) has no production caller — its only consumer was the deleted `filterFigmaNode`. The plugin has its own copy in [figma_plugin/utils/colorUtils.ts](../figma_plugin/utils/colorUtils.ts), so removing the server copy doesn't affect the plugin.

**Action:** Delete `rgbaToHex` from [src/mcp_server/utils.ts](../src/mcp_server/utils.ts), drop the import and the `describe('rgbaToHex', ...)` block from [src/mcp_server/tests/utils.test.ts](../src/mcp_server/tests/utils.test.ts).

**Resolution:** Deleted `rgbaToHex` from `src/mcp_server/utils.ts` and removed the corresponding tests from `src/mcp_server/tests/utils.test.ts` as planned.

---

## 20. Update existing `get_nodes_info` and `join_channel` test assertions ✅ Adopted

The existing `get_nodes_info` and `join_channel` unit tests (and possibly plugin tests) likely assert that all fields (like `fills`, `strokes`) are returned by default. Under the new plan, the default behavior changes drastically (returning only `id`, `name`, `type`, `children`).

**Action:** When implementing items #2 and #5, update existing assertions in `document.test.ts` to match the new call shapes. Add a new assertion that verifies `fields` is forwarded when explicitly provided.

**Resolution:** Added a note to the Testing Strategy section in [component_property_enhancement.md](component_property_enhancement.md) reminding the implementer to update the existing `get_nodes_info` and `join_channel` test assertions to match the new default behavior. Updated specific lines (84 and 101) in `document.test.ts` to expect the new parameter schema rather than the old empty/default ones.

---

## 21. Deprecate `get_page_info` as redundant with expanded `get_nodes_info`

Surfaced during the read-tool overlap audit. Once `get_nodes_info` returns `id`/`name`/`type` plus a recursive children map by default, `get_page_info` ([src/mcp_server/tools/document.ts:38](../src/mcp_server/tools/document.ts#L38)) becomes a near-exact special case: `get_nodes_info(nodeIds: [pageId])` produces essentially the same payload.

Two minor differences need handling before removal:

- **`targetPage.loadAsync()`** — `get_page_info` calls this before reading children ([nodeReaders.ts:53-56](../figma_plugin/handlers/nodeReaders.ts#L53-L56)). `get_nodes_info` doesn't. The fix is to add a PAGE-type check inside `getNodesInfo` and call `loadAsync` when needed.
- **`isCurrent: boolean`** — Unique to `get_page_info`. Either expose it as a derivable flag in `get_nodes_info` for PAGE nodes, or document that callers should compare `id` to `get_document_info().currentPageId`.

**Confirmed NOT redundant** during the same audit (kept because each adds resolution/filtering value beyond raw fields):

- `get_node_variables` — resolves variable IDs to names and explicit-mode IDs to mode/collection names.
- `get_reactions` — filters out `CHANGE_TO`, computes hierarchical `path`, returns only nodes with reactions, reports progress.
- `get_annotations` — resolves annotation category metadata (color, label, isPreset); supports a page-wide mode.
- `scan_nodes_by_types` / `scan_text_nodes` — search/filter operations distinct from raw retrieval.
- `get_components` — returns library/file-level metadata (`key`, `remote`, `pageId`) that aren't node properties.
- `get_instance_overrides` — captures opaque override state for `set_instance_overrides`.
- `get_document_info`, `get_styles`, `get_variables` — document-level resources, not node-specific.

**Action:** Track as a separate cleanup PR rather than bundled into the property-enhancement work — deprecation ripples through prompts, docs, and any agent muscle memory. Sequence: (a) implement #1/#2 first so `get_nodes_info` is fully capable, (b) handle the `loadAsync` / `isCurrent` carve-outs, (c) remove `get_page_info` from MCP tool registration, plugin dispatch, plugin handler, and any prompt references.

---

## Summary of Must-Fix Items Before Implementation

The most impactful items, in priority order:

1. **#10** — Add read-only and scope checks (security/consistency).
2. **#14** — Remove invalid `VARIANT` from ADD enum (will fail at runtime).
3. **#11** — Resolve the `propertyName` qualified-vs-human-readable ambiguity (will fail at runtime).
4. **#2** — Plumb `fields` end-to-end (feature won't work otherwise).
5. **#5** — Acknowledge and migrate the breaking default of `get_nodes_info`.
6. **#15, #16** — Fill in missing `manage_component_property` schema fields.
7. **#13** — Document INSTANCE_SWAP value semantics.

The remaining items are cleanup, clarification, and test coverage — important but not blocking correctness.
