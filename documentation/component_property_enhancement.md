# Component Property Enhancements

This document outlines the implementation plan for enhancing the Figma MCP server to fully support component property reading, writing, and management.

## 1. Enhance `get_nodes_info` Tool

Currently, `get_nodes_info` returns a large amount of hardcoded styling and structure data, but filters out component properties, auto-layout, and prototyping data. We will make this tool dynamic.

> **File locations** (note: despite this being part of the component-property enhancement, `get_nodes_info` lives with the document tools, not the component tools):
> - MCP tool registration: [src/mcp_server/tools/document.ts:74](../src/mcp_server/tools/document.ts#L74)
> - Plugin command dispatch: [src/figma_plugin/src/main.ts:461-472](../src/figma_plugin/src/main.ts#L461-L472) (`case "get_nodes_info"`)
> - Plugin handler: `getNodesInfo` in [src/figma_plugin/handlers/nodeReaders.ts:92](../src/figma_plugin/handlers/nodeReaders.ts#L92)
> - Filter function: `filterFigmaNode` in [src/figma_plugin/utils/nodeUtils.ts:12](../src/figma_plugin/utils/nodeUtils.ts#L12)

**Behavior Requirements:**
- The `get_nodes_info` MCP tool must accept an optional `fields` array of strings. **Crucially, these field names must exactly match the keys present in the `JSON_REST_V1` node export format**, as that is the source of truth for the returned data. Supported fields include:
  - **Component Properties**: `componentPropertyDefinitions`, `componentProperties`
  - **Instance Data**: `overrides`
  - **Layout & Positioning**: `layoutMode`, `itemSpacing`, `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `absoluteBoundingBox`
    - *(Note: `layoutAlign` and `layoutGrow` are properties of the **children** inside an auto-layout container, not the container itself. If you need them, you must request them on the children.)*
  - **Styling**: `fills`, `strokes`, `cornerRadius`, `opacity`, `blendMode`, `effects`
  - **Text**: `characters`, `style`
  - **Prototyping**: `transitionNodeID`, `transitionDuration`, `transitionEasing`
  - **Metadata**: `visible`, `locked`
- By default, if the `fields` array is empty or not provided, the tool must only return `id`, `name` and `type` for each requested `nodeId` (significantly improving performance and token usage).
- **Recursion and Filtering Semantics**:
  - The filter is applied to the raw REST API data extracted via `node.exportAsync({ format: "JSON_REST_V1" })`.
  - Always include `id`, `name`, and `type` on every node.
  - Silently skip requested fields that are absent on a given node (e.g., if `componentPropertyDefinitions` is requested, it will appear on COMPONENT_SET nodes but be omitted on regular children).
  - Always recurse into `children` regardless of whether `children` appears in `fields`.

**End-to-End Plumbing — all five layers must be updated:**

The `fields` parameter must flow from MCP client → MCP server → WebSocket → plugin UI → plugin sandbox → handler → filter. Missing any one layer silently drops the parameter and the feature appears broken.

1. **MCP tool schema** ([src/mcp_server/tools/document.ts:74](../src/mcp_server/tools/document.ts#L74)) — add the optional `fields: z.array(z.string()).optional()` zod definition alongside `nodeIds`.
2. **MCP-to-plugin command** (same file, around line 87) — change `sendCommandToFigma("get_nodes_info", { nodeIds })` to `sendCommandToFigma("get_nodes_info", { nodeIds, fields })` so the value is forwarded over the wire.
3. **Plugin command dispatch** ([src/figma_plugin/src/main.ts:461-472](../src/figma_plugin/src/main.ts#L461-L472)) — the `case "get_nodes_info"` branch currently calls `getNodesInfo(params.nodeIds)`, dropping `fields`. Change to pass `fields` through (e.g., `getNodesInfo(params.nodeIds, params.fields)`). Also forward `fields` for the implicit scope-root call (`getNodesInfo([state.scopeRootId], params?.fields)`).
4. **Plugin handler signature** ([src/figma_plugin/handlers/nodeReaders.ts:92](../src/figma_plugin/handlers/nodeReaders.ts#L92)) — extend `getNodesInfo(nodeIds)` to `getNodesInfo(nodeIds, fields)` and forward `fields` into each `filterFigmaNode(...)` call.
5. **Filter function signature** ([src/figma_plugin/utils/nodeUtils.ts:12](../src/figma_plugin/utils/nodeUtils.ts#L12)) — extend `filterFigmaNode(node)` to `filterFigmaNode(node, fields)`, replace the hardcoded property selection with a fields-driven include list, and pass `fields` through to recursive `children` calls.

**Migrate `join_channel` to request useful initial-connection fields:**

The `join_channel` flow at [src/mcp_server/tools/document.ts:231](../src/mcp_server/tools/document.ts#L231) calls `get_nodes_info({})` to identify the editable scope. Under the new default it would only receive `id`, `name`, `type` plus a recursive children map. To give the agent useful orientation in the initial round-trip without inflating token cost, also request:

- **`absoluteBoundingBox`** — canvas dimensions and position; tells the agent whether it's editing a 375×812 mobile screen or a 1440×3000 marketing page.
- **`layoutMode`** — auto-layout vs. free-positioning; fundamentally changes how new children should be added (`appendChild` order vs. explicit x/y).

Update the call to:

```ts
const scopeResult = await sendCommandToFigma("get_nodes_info", {
    fields: ["absoluteBoundingBox", "layoutMode"]
});
```

Heavier fields (`fills`, `strokes`, `effects`, `style`, `characters`, `componentProperties`, `overrides`) are intentionally excluded from the initial fetch — they multiply across recursed children and the agent can request them on demand via follow-up `get_nodes_info(nodeIds, fields)` calls.

**Remove the `design_strategy` prompt:**

Delete the `design_strategy` MCP prompt registered at [src/mcp_server/tools/document.ts:266-351](../src/mcp_server/tools/document.ts#L266-L351). It's a static block of generic "best practices for working with Figma designs" — login-screen examples, naming conventions, layout-hierarchy advice — most of which is either common knowledge to a capable LLM or covered more authoritatively elsewhere (e.g., `DRAGME.md`). Its one operational instruction relevant to this work — *"Verify each creation with `get_nodes_info()`"* — would become misleading under the new default and isn't worth maintaining a 90-line prompt to preserve.

Removal scope:
- Delete the `server.prompt("design_strategy", ...)` registration from [src/mcp_server/tools/document.ts](../src/mcp_server/tools/document.ts).
- Audit other prompts/docs for cross-references and remove or update them.

**Delete the orphaned `rgbaToHex` utility:**

The server-side `rgbaToHex` is dead code: its only consumer was the previously-deleted `filterFigmaNode`, and the plugin uses its own copy in [src/figma_plugin/utils/colorUtils.ts](../src/figma_plugin/utils/colorUtils.ts). Three concrete removals:

1. Delete the `rgbaToHex` function definition at [src/mcp_server/utils.ts:31-43](../src/mcp_server/utils.ts#L31-L43).
2. Remove `rgbaToHex` from the import statement at [src/mcp_server/tests/utils.test.ts:1](../src/mcp_server/tests/utils.test.ts#L1) (leave `normalizeNodeId` and `normalizeNodeIds`).
3. Delete the entire `describe('rgbaToHex', ...)` block at [src/mcp_server/tests/utils.test.ts:30-40](../src/mcp_server/tests/utils.test.ts#L30-L40).

After removal, run the test suite to confirm no residual references and verify nothing else imports `rgbaToHex` from `src/mcp_server/utils.ts` (a quick `grep -r "rgbaToHex" src/mcp_server/` should return no results).

---

## 2. `set_component_instance_property` Tool

A new tool focused purely on setting property values on component instances (not to be confused with the bulk-cloning behavior of `set_instance_overrides`).

**Requirements:**
- **Purpose**: Set a specific property value (boolean toggle, text override, instance swap, or variant selection) on an instance.
- **Parameters**:
  - `nodeId` (string, required): ID of the instance node.
  - `nodeName` (string, required): Name of the instance node for verification.
  - `propertyName` (string, required): The human-readable name of the component property to change (e.g., "State", "Show Icon"). The plugin will automatically resolve this to the qualified name.
  - `value` (string | boolean, required): The new value for the property. **Note: For INSTANCE_SWAP properties on a local component, this must be the component's node ID; for an unimported library component, first import it via `figma.importComponentByKeyAsync(key)` to obtain a local node ID, then pass that ID.**
- **Implementation Strategy**:
  - **Security / Validation**: In `main.ts` routing, apply the standard three-step gating before dispatching to the handler: `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName`.
  - **Property Name Resolution & Pre-Validation**: Accept the human-readable `propertyName` from the caller. Match it against the keys in `instance.componentProperties` to find the exact qualified name (e.g., `"Show Icon#5:0"`). If the property name is not found, return a structured error listing the available valid property names.
  - Figma Plugin Handler: Find the instance node, verify it's an `INSTANCE`, and call `instance.setProperties({ [qualifiedName]: value })`.
  - MCP Tool: Register in `components.ts` and route the command in `main.ts`.

---

## 3. `manage_component_property` Tool

A new tool focused on defining, editing, and deleting component properties on Main Components or Component Sets.

**Requirements:**
- **Purpose**: Perform CRUD operations on property definitions for main components or variant sets.
- **Parameters**:
  - `nodeId` (string, required): ID of the `COMPONENT` or `COMPONENT_SET`.
  - `nodeName` (string, required): Name of the node for verification.
  - `action` (enum, required): `ADD`, `EDIT`, or `DELETE`.
  - `propertyName` (string, required): The human-readable name of the property to affect. The plugin will automatically resolve this to the qualified name for EDIT and DELETE actions.
  - `newPropertyName` (string, optional): For the `EDIT` action, to rename the property.
  - `propertyType` (enum, required for `ADD`): `BOOLEAN`, `TEXT`, or `INSTANCE_SWAP`. (Note: `VARIANT` properties are created implicitly via the `create_component_set` tool and cannot be added here).
  - `defaultValue` (string | boolean, optional): Default value for the property (required for `ADD`). **Note: For INSTANCE_SWAP properties, this must be a component **node ID** (a local node id for local components; for library components, first import via `figma.importComponentByKeyAsync(key)` to obtain a local node id). The Figma plugin API for `addComponentProperty` rejects raw library keys here.**
  - `newDefaultValue` (string | boolean, optional): For the `EDIT` action, to change the default value of the property. **Note: For INSTANCE_SWAP properties, this must be a component node ID (same constraint as `defaultValue`).**
  - `preferredValues` (`Array<{ type: "COMPONENT" | "COMPONENT_SET", key: string }>`, optional): Preferred values for `INSTANCE_SWAP` properties during `ADD` or `EDIT`. Each entry must be a `{ type, key }` object — `key` is the library key (`component.key`). The Figma plugin API rejects bare strings here.
- **Implementation Strategy**:
  - **Security / Validation**: In `main.ts` routing, apply the standard three-step gating before dispatching to the handler: `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName`.
  - **Property Name Resolution & Pre-Validation**: 
    - For `EDIT` and `DELETE`, accept the human-readable `propertyName` and match it against the keys in `node.componentPropertyDefinitions` to find the exact qualified name. If the property name is not found, return a structured error listing the available valid property names.
    - For `ADD`, pre-validate that the human-readable `propertyName` does not already exist in `node.componentPropertyDefinitions` to prevent duplicate property errors.
  - Add a handler in `componentHandlers.ts`.
  - For `ADD`: Use `node.addComponentProperty(propertyName, propertyType, defaultValue, { preferredValues })`. (This API natively accepts the human-readable name).
  - For `EDIT`: Use `node.editComponentProperty(qualifiedName, { name: newPropertyName, defaultValue: newDefaultValue, preferredValues })`.
  - For `DELETE`: Use `node.deleteComponentProperty(qualifiedName)`.
  - MCP Tool: Register in `components.ts` and route the command in `main.ts`.

---

## 4. Testing Strategy

To maintain the high test coverage of the codebase, add unit tests for all new and modified functionality:

- **`get_nodes_info` fields filtering** (e.g., `src/figma_plugin/utils/nodeUtils.test.ts`):
  - Test for positive hits (requested fields are correctly extracted).
  - Test silent dropping of missing fields on nodes that do not possess them.
  - Test mandatory inclusion of `id`, `name`, `type`, and unconditional recursion into `children`.
  - **Important:** Existing assertions in [src/mcp_server/tests/unit/tools/document.test.ts](../src/mcp_server/tests/unit/tools/document.test.ts) must be updated to match the new call shapes once the `fields` plumbing (item #2) and the `join_channel` migration (item #5) land. Concretely:
    - **[document.test.ts:80](../src/mcp_server/tests/unit/tools/document.test.ts#L80)** — currently `expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: ["node-1"] })`. Update to expect `{ nodeIds: ["node-1"], fields: undefined }` (or whatever shape the new schema produces when `fields` is omitted).
    - **[document.test.ts:84](../src/mcp_server/tests/unit/tools/document.test.ts#L84)** — currently `expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: undefined })`. Update to expect `{ nodeIds: undefined, fields: undefined }`.
    - **[document.test.ts:101](../src/mcp_server/tests/unit/tools/document.test.ts#L101)** — currently `expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", {})`. Update to expect `{ fields: ["absoluteBoundingBox", "layoutMode"] }` to match the migrated `join_channel` discovery call.
  - **Add a new positive assertion** that explicitly verifies `fields` is forwarded when supplied — e.g., call the tool with `{ nodeIds: ["node-1"], fields: ["fills", "componentProperties"] }` and assert `sendCommandToFigma` was called with that exact payload. This guards against future regressions where someone re-introduces the parameter-dropping bug at any of the five plumbing layers.

- **`set_component_instance_property` tool** (e.g., `src/figma_plugin/handlers/componentHandlers.test.ts`):
  - Test successful value updates for various property types.
  - Test that an invalid/missing `propertyName` throws a structured error.
  - Verify that the standard security gates (`readOnly`, `checkScopeAccess`, `verifyNodeName`) correctly block unauthorized calls.

- **`manage_component_property` tool** (e.g., `src/figma_plugin/handlers/componentHandlers.test.ts`):
  - Test `ADD` operation (including pre-validation to reject duplicate property names).
  - Test `EDIT` operation (including pre-validation to throw on missing properties, and verifying updates to name, defaultValue, and preferredValues).
  - Test `DELETE` operation (including pre-validation to throw on missing properties).
