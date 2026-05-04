# Component Property Enhancement — Step-by-Step Implementation Plan

This document breaks down the implementation of the Component Property Enhancement plan into a concrete, step-by-step checklist based on the final merged requirements from `component_property_enhancement.md` and `component_property_enhancement_recommendations.md`.

## Phase 1: Cleanup and Dead Code Removal

1. **Remove orphaned `rgbaToHex` and `filterFigmaNode` functions from the server**
   - **File:** `src/mcp_server/utils.ts`
   - **Action:** Delete the `rgbaToHex` and `filterFigmaNode` function implementations.
   - **File:** `src/mcp_server/tests/utils.test.ts`
   - **Action:** Remove **only** `rgbaToHex` and `filterFigmaNode` from the import statement on line 1, leaving `normalizeNodeId` and `normalizeNodeIds` intact. Delete the `describe('rgbaToHex', ...)` and `describe('filterFigmaNode', ...)` test blocks.
   - **Verification:** Run `grep -r "rgbaToHex\|filterFigmaNode" src/mcp_server/` and confirm no results remain. Run the test suite to confirm no regressions.

2. **Remove the `design_strategy` prompt**
   - **File:** `src/mcp_server/tools/document.ts`
   - **Action:** Delete the `server.prompt("design_strategy", ...)` registration block. Check for any dangling cross-references to it in the codebase.
   - **Test:** In `src/mcp_server/tests/unit/tools/document.test.ts`, after `registerDocumentTools` runs, capture all calls to the mocked `server.prompt` and assert that no call's first argument equals `"design_strategy"`. Guards against accidental re-introduction.

## Phase 2: Enhance `get_nodes_info` Tool

3. **Update the MCP Tool Schema**
   - **File:** `src/mcp_server/tools/document.ts`
   - **Action:** Add `fields: z.array(z.string()).optional().describe(...)` to the schema of the `get_nodes_info` tool.
   - **`.describe(...)` content:** The description must state that field names must exactly match keys in Figma's `JSON_REST_V1` node export format (the source of truth) and enumerate the supported fields by category:
     - **Component Properties:** `componentPropertyDefinitions`, `componentProperties`
     - **Instance Data:** `overrides`
     - **Layout & Positioning:** `layoutMode`, `itemSpacing`, `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `absoluteBoundingBox`
       - *Note: `layoutAlign` and `layoutGrow` are properties of the **children** inside an auto-layout container, not the container itself; request them on the children if needed.*
     - **Styling:** `fills`, `strokes`, `cornerRadius`, `opacity`, `blendMode`, `effects`
     - **Text:** `characters`, `style`
     - **Prototyping:** `transitionNodeID`, `transitionDuration`, `transitionEasing`
     - **Metadata:** `visible`, `locked`
   - **Default behavior:** When `fields` is empty or omitted, only `id`, `name`, and `type` are returned per node (plus recursive `children`). State this explicitly in the description so callers understand the new lightweight default.

4. **Plumb the `fields` parameter over the wire**
   - **File:** `src/mcp_server/tools/document.ts`
   - **Action:** In the tool handler for `get_nodes_info`, update the Figma command to include fields: `sendCommandToFigma("get_nodes_info", { nodeIds, fields })`.

5. **Forward `fields` inside the Plugin Dispatcher**
   - **File:** `src/figma_plugin/src/main.ts`
   - **Action:** In `case "get_nodes_info"`, update the function call to pass fields: `getNodesInfo(params.nodeIds, params.fields)`. Make sure to also pass `fields` in the implicit scope-root fallback path.

6. **Update Plugin Handler Signatures**
   - **File:** `src/figma_plugin/handlers/nodeReaders.ts`
   - **Action:** Update the `getNodesInfo` signature to accept `fields` and pass it down to `filterFigmaNode`.

7. **Implement Dynamic Field Filtering**
   - **File:** `src/figma_plugin/utils/nodeUtils.ts`
   - **Action:** Update `filterFigmaNode(node, fields)` logic:
     - Automatically include `id`, `name`, and `type` for every node.
     - Unconditionally recurse into `children` for structural completeness.
     - Silently skip requested fields if they are absent on the current node.
     - Only return fields specified in the `fields` array when processing the data returned from `node.exportAsync({ format: "JSON_REST_V1" })`.

8. **Update `join_channel` call context**
   - **File:** `src/mcp_server/tools/document.ts`
   - **Action:** Inside `join_channel`, update the `get_nodes_info` fetch to request layout fields: `sendCommandToFigma("get_nodes_info", { fields: ["absoluteBoundingBox", "layoutMode"] })`.

9. **Update Prompt Context for `fields`**
   - **File:** `src/mcp_server/tools/components.ts`
   - **Action:** In the `swap_overrides_instances` prompt, update the verification instruction to use `get_nodes_info(nodeIds, fields: ["componentProperties", "characters", "overrides"])`. Update the `set_instance_overrides` example to use `targetNodes: [{ nodeId, nodeName }]`.
   - **File:** `src/mcp_server/tools/text.ts`
   - **Action:** In the `text_replacement_strategy` prompt, update the optional `get_nodes_info` call to include `fields: ["characters", "style"]`.

10. **Add and Update Tests for Phase 2 Changes**

    > All new test files live under `src/mcp_server/tests/unit/figma_plugin/`, which mirrors the plugin tree but reuses the existing `bun:test` infrastructure. Plugin functions are imported via relative paths (`../../../../../figma_plugin/...`); for handlers that touch the `figma` global, mock it on `globalThis` in `beforeEach`.

    **(a) `filterFigmaNode` unit tests** — **File:** `src/mcp_server/tests/unit/figma_plugin/nodeUtils.test.ts` (new file)
    - `filterFigmaNode` is a pure function operating on plain `JSON_REST_V1` data — no `figma` global mock is required. Import it directly from `src/figma_plugin/utils/nodeUtils.ts`.
    - Add tests covering:
      - **Positive hits:** when fields like `["fills", "componentProperties"]` are requested and present on the node, they are correctly extracted into the output.
      - **Silent dropping of absent fields:** requesting a field that doesn't exist on the node (e.g., `componentPropertyDefinitions` on a regular FRAME) is omitted from output without error.
      - **Mandatory inclusion:** `id`, `name`, and `type` are always present regardless of `fields`; `children` is always recursed (with `fields` forwarded into each child) regardless of whether `children` appears in the `fields` array.

    **(b) `get_nodes_info` + `join_channel` MCP tool tests** — **File:** `src/mcp_server/tests/unit/tools/document.test.ts`
    - Update existing assertions to match the new call shapes (line numbers refer to the file's current state):
      - **Line 80** — currently `expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: ["node-1"] })`. Update to expect `{ nodeIds: ["node-1"], fields: undefined }`.
      - **Line 84** — currently `{ nodeIds: undefined }`. Update to expect `{ nodeIds: undefined, fields: undefined }`.
      - **Line 101** — currently `{}` (the `join_channel` discovery call). Update to expect `{ fields: ["absoluteBoundingBox", "layoutMode"] }` to match the migrated discovery call from Step 8.
    - **Add a new positive assertion** that calls the tool with `{ nodeIds: ["node-1"], fields: ["fills", "componentProperties"] }` and verifies `sendCommandToFigma` receives that exact payload. This guards against regressions where a future change drops `fields` at any of the five plumbing layers.

    **(c) Prompt content tests for the Step 9 rewrites**
    - **File:** `src/mcp_server/tests/unit/tools/components.test.ts` — capture the `server.prompt` mock call for `swap_overrides_instances`, invoke its handler, and assert the returned text contains both `fields: ["componentProperties", "characters", "overrides"]` and the new `targetNodes: [{ nodeId` example shape (and does **not** contain `targetNodeIds`).
    - **File:** `src/mcp_server/tests/unit/tools/text.test.ts` — capture the `server.prompt` mock call for `text_replacement_strategy`, invoke its handler, and assert the returned text contains `fields: ["characters", "style"]` and does **not** contain the old `get_nodes_info(nodeIds: ["node-id"])  // optional` form.

## Phase 3: Create `set_component_instance_property` Tool

11. **Register the MCP Tool**
    - **File:** `src/mcp_server/tools/components.ts`
    - **Action:** Add `set_component_instance_property` schema including `nodeId`, `nodeName`, `propertyName`, and `value` (`string | boolean`). Include clear descriptions for `value` when dealing with `INSTANCE_SWAP` keys.

12. **Route Command with Security Gates**
    - **File:** `src/figma_plugin/src/main.ts`
    - **Action:** Add `case "set_component_instance_property"`. Precede dispatch with security checks: `state.readOnly`, `checkScopeAccess`, and `verifyNodeName`.

13. **Implement Plugin Handler**
    - **File:** `src/figma_plugin/handlers/componentHandlers.ts`
    - **Action:** Create `setComponentInstanceProperty`.
    - Look up the node by `nodeId` and **verify `node.type === "INSTANCE"`**; throw a clear error if the node is missing or not an instance.
    - Retrieve `instance.componentProperties`. Match the incoming human-readable `propertyName` against the keys to resolve the exact qualified name (e.g., `"Show Icon#5:0"`).
    - If no match is found, throw a structured error listing the available valid property names.
    - If found, call `instance.setProperties({ [qualifiedName]: value })`.

14. **Write Tests for `set_component_instance_property`**

    **(a) MCP tool layer** — **File:** `src/mcp_server/tests/unit/tools/components.test.ts` (uses existing test infrastructure; follow the pattern of `get_components` / `create_component_set` tests in the same file)
    - Verify the tool is registered after `registerComponentTools` runs.
    - Verify that calling the tool forwards the correct command name and exact param payload (`{ nodeId, nodeName, propertyName, value }`) to `sendCommandToFigma`.
    - Cover each value type so the schema accepts each form correctly: `BOOLEAN` (true/false), `TEXT` (string), `INSTANCE_SWAP` (a component-key string), and `VARIANT` selection (a string).

    **(b) Plugin handler layer** — **File:** `src/mcp_server/tests/unit/figma_plugin/componentHandlers.test.ts` (new file; follow the `globalThis.figma` mocking pattern described in the Step 10 callout)
    - In `beforeEach`, set `globalThis.figma` to a fresh stub exposing `getNodeByIdAsync` that returns a fake instance node with `type: "INSTANCE"`, a `componentProperties` map (e.g., `{ "Show Icon#5:0": { type: "BOOLEAN", value: false } }`), and a `setProperties` spy.
    - **Happy path:** calling `setComponentInstanceProperty({ nodeId, propertyName: "Show Icon", value: true })` resolves to the qualified key `"Show Icon#5:0"` and invokes `setProperties` with `{ "Show Icon#5:0": true }`.
    - **Wrong node type:** when `getNodeByIdAsync` returns a node with `type !== "INSTANCE"`, the handler throws a clear error and does not call `setProperties`.
    - **Missing property:** when `propertyName` doesn't match any key in `instance.componentProperties`, the handler throws a structured error whose message lists the available property names.
    - **Security gates:** with `setComponentInstanceProperty` invoked through the routing in `main.ts`, each of `state.readOnly = true`, a failing `checkScopeAccess`, and a failing `verifyNodeName` independently blocks the call before the handler body runs (one test per gate).

## Phase 4: Create `manage_component_property` Tool

15. **Register the MCP Tool**
    - **File:** `src/mcp_server/tools/components.ts`
    - **Action:** Add `manage_component_property` schema with the following parameters:
      - `nodeId` (string, required), `nodeName` (string, required).
      - `action` (enum: `ADD` | `EDIT` | `DELETE`, required).
      - `propertyName` (string, required) — the human-readable name; the plugin resolves it to the qualified name for `EDIT`/`DELETE`.
      - `newPropertyName` (string, optional) — for `EDIT` only, to rename the property.
      - `propertyType` (enum: `BOOLEAN` | `TEXT` | `INSTANCE_SWAP`, **required for `ADD`**). `VARIANT` is intentionally excluded — variant properties are created implicitly via `create_component_set`.
      - `defaultValue` (string | boolean, optional, **required for `ADD`**). **For `INSTANCE_SWAP` properties, this must be a component `key` (the stable library identifier), not a node ID.**
      - `newDefaultValue` (string | boolean, optional) — for `EDIT` only, to change the default. **For `INSTANCE_SWAP` properties, this must be a component `key`.**
      - `preferredValues` (string[], optional) — array of preferred component `key`s, relevant only for `INSTANCE_SWAP` properties during `ADD` or `EDIT`.

16. **Route Command with Security Gates**
    - **File:** `src/figma_plugin/src/main.ts`
    - **Action:** Add `case "manage_component_property"`. Precede dispatch with security checks: `state.readOnly`, `checkScopeAccess`, and `verifyNodeName`.

17. **Implement Plugin Handler**
    - **File:** `src/figma_plugin/handlers/componentHandlers.ts`
    - **Action:** Create `manageComponentProperty`.
    - For **ADD**: Pre-validate that `propertyName` doesn't exist in `node.componentPropertyDefinitions`. Call `node.addComponentProperty(propertyName, propertyType, defaultValue, { preferredValues })`.
    - For **EDIT**: Match the human-readable `propertyName` in `node.componentPropertyDefinitions` to resolve the qualified name. Call `node.editComponentProperty(qualifiedName, { name: newPropertyName, defaultValue: newDefaultValue, preferredValues })`.
    - For **DELETE**: Match `propertyName` to resolve the qualified name. Call `node.deleteComponentProperty(qualifiedName)`.
    - In all actions, handle missing properties (for EDIT/DELETE) with structured errors exposing valid names.

18. **Write Tests for `manage_component_property`**

    **(a) MCP tool layer** — **File:** `src/mcp_server/tests/unit/tools/components.test.ts`
    - Verify the tool is registered after `registerComponentTools` runs.
    - Verify each action (`ADD`, `EDIT`, `DELETE`) forwards the correct command name and full param payload to `sendCommandToFigma`.
    - **Schema-level negative tests:** parsing a payload with `propertyType: "VARIANT"` is rejected (intentionally excluded per Step 15); `ADD` payloads missing `propertyType` or `defaultValue` are rejected.
    - **Schema-level positive tests:** `EDIT` payloads correctly accept the optional `newPropertyName`, `newDefaultValue`, and `preferredValues` fields and forward them through.

    **(b) Plugin handler layer** — **File:** `src/mcp_server/tests/unit/figma_plugin/componentHandlers.test.ts` (extend the file created in Step 14(b))
    - Extend the `globalThis.figma` stub from Step 14(b) so `getNodeByIdAsync` can also return a fake `COMPONENT` / `COMPONENT_SET` node with a `componentPropertyDefinitions` map and spies for `addComponentProperty`, `editComponentProperty`, and `deleteComponentProperty`.
    - **ADD:**
      - Happy path for each `propertyType` (`BOOLEAN`, `TEXT`, `INSTANCE_SWAP`); for `INSTANCE_SWAP`, verify `preferredValues` is passed through.
      - `node.addComponentProperty` is called with `(propertyName, propertyType, defaultValue, { preferredValues })`.
      - Pre-validation rejects duplicate `propertyName`s with a structured error listing the existing property names.
    - **EDIT:**
      - Verifies updates apply correctly to **name** (via `newPropertyName`), **defaultValue** (via `newDefaultValue`), and **preferredValues** — one test per mutation path, asserting `editComponentProperty` receives exactly the expected fields.
      - Pre-validation throws a structured error listing the available property names when `propertyName` doesn't exist on the node.
    - **DELETE:**
      - Happy path: `deleteComponentProperty(qualifiedName)` is called.
      - Pre-validation throws a structured error listing the available property names when `propertyName` doesn't exist.
    - **Property-name resolution:** in all three actions, verify the human-readable `propertyName` is correctly resolved to the qualified name (e.g., `"Show Icon"` → `"Show Icon#5:0"`) before being passed to the Plugin API.
    - **Security gates** *(parity with Step 14)*: `state.readOnly`, `checkScopeAccess`, and `verifyNodeName` each correctly block the call when violated, regardless of which `action` is dispatched.
