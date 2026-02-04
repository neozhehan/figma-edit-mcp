# Implementation Plan: Figma Plugin Enhancements

This plan outlines the steps required to implement the enhancements detailed in the [Plugin Enhancement Recommendations](plugin_enhancement.md).

## Phase 1: Core Data & Quick Wins

### 1. Refactor Document Info Tools
**Goal**: Split `get_document_info` into metadata-only and add `get_page_info`.

*   [x] **Server**: Update [src/mcp_server/server.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/server.ts)
    *   Modify `get_document_info` output schema (remove `children`).
    *   Add `get_page_info` tool definition.
*   [x] **Plugin**: Update [src/figma_plugin/handlers/nodeReaders.js](file:///Users/neozhehan/Git/figma-edit-mcp/src/figma_plugin/handlers/nodeReaders.js)
    *   Refactor `getDocumentInfo` to return only document metadata (all pages list).
    *   Implement `getPageInfo` to return page content.
*   [x] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add `get_page_info` to `handleCommand` switch.

### 2. Rename & Enhance Component Getter
**Goal**: Rename `get_local_components` to `get_components` and add filtering/scoping.

*   [ ] **Server**: Update [src/mcp_server/server.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/server.ts)
    *   Add `get_components` tool definition (parameters: `filter`, `scope`).
    *   Deprecate `get_local_components`.
*   [ ] **Plugin**: Update [src/figma_plugin/handlers/componentHandlers.js](file:///Users/neozhehan/Git/figma-edit-mcp/src/figma_plugin/handlers/componentHandlers.js)
    *   Implement `getComponents` with `scope` (default: 'current_page') and `filter` ('local'/'remote').
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add `get_components` to `handleCommand` switch.
    *   Maintain `get_local_components` route for backward compatibility (optional, or mark as deprecated).

### 3. Consolidate Connector Tools
**Goal**: Merge `set_default_connector` into `create_connections`.

*   [ ] **Server**: Update [src/mcp_server/server.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/server.ts)
    *   Update `create_connections` schema to accept `connectorId`.
    *   Deprecate `set_default_connector`.
*   [ ] **Plugin**: Update [src/figma_plugin/handlers/connectorHandlers.js](file:///Users/neozhehan/Git/figma-edit-mcp/src/figma_plugin/handlers/connectorHandlers.js)
    *   Refactor `createConnections` to handle optional `connectorId` (set as default template).
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Update `create_connections` validation logic to check `connectorId`.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName` are applied to `connectorId` (if provided).

## Phase 2: Major Consolidations & Enhancements

### 4. Unified Text Styling
**Goal**: Replace 9 separate text tools with `set_text_style`.

*   [ ] **Server**: Update [src/mcp_server/server.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/server.ts)
    *   Add `set_text_style` tool definition with all optional styling parameters.
    *   Deprecate individual text tools (`set_font_size`, `set_font_weight`, etc.).
*   [ ] **Plugin**: Create/Update [src/figma_plugin/handlers/textHandlers.js](file:///Users/neozhehan/Git/figma-edit-mcp/src/figma_plugin/handlers/textHandlers.js)
    *   Implement `setTextStyle` with conditional font loading.
    *   **Strict Handler**: Ensure missing parameters are treated as noops.
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add `set_text_style` to `handleCommand` switch.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName` are implemented.

### 5. Unified Auto-Layout
**Goal**: Replace 5 layout tools with `set_auto_layout`.

*   [ ] **Server**: Update [src/mcp_server/server.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/server.ts)
    *   Add `set_auto_layout` tool definition.
    *   Deprecate `set_layout_mode`, `set_padding`, etc.
*   [ ] **Plugin**: Create/Update [src/figma_plugin/handlers/layoutHandlers.js](file:///Users/neozhehan/Git/figma-edit-mcp/src/figma_plugin/handlers/layoutHandlers.js)
    *   Implement `setAutoLayout`.
    *   **Strict Handler**: Ensure missing parameters are treated as noops.
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add `set_auto_layout` to `handleCommand` switch.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName` are implemented.

## Phase 3: New Capabilities

### 6. Shape Creation
**Goal**: Add `create_ellipse` and `create_polygon_star`.

*   [ ] **Server**: Update [src/mcp_server/server.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/server.ts)
    *   Display `create_ellipse` and `create_polygon_star` tools.
*   [ ] **Plugin**: Update [src/figma_plugin/handlers/nodeCreators.js](file:///Users/neozhehan/Git/figma-edit-mcp/src/figma_plugin/handlers/nodeCreators.js)
    *   Implement `createEllipse` (supports arcs/donuts).
    *   Implement `createPolygonStar` (unified polygon/star logic).
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Register new commands in switch.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess` (on parent), and `verifyParentName` are implemented.

### 7. Node Organization
**Goal**: Add grouping, ungrouping, flattening, reparenting.

*   [ ] **Server**: Update [src/mcp_server/server.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/server.ts)
    *   Add `group_nodes`, `ungroup_nodes`, `flatten_node`, `insert_child`.
*   [ ] **Plugin**: Create [src/figma_plugin/handlers/nodeModifiers.js](file:///Users/neozhehan/Git/figma-edit-mcp/src/figma_plugin/handlers/nodeModifiers.js)
    *   Implement logic for all 4 tools.
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Register commands.
    *   Add validation logic for `group_nodes` (ensure same parent).
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName`/`verifyParentName` are implemented for all inputs.

### 8. Component Variants
**Goal**: Add `create_component_set`.

*   [ ] **Server**: Update [src/mcp_server/server.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/server.ts)
    *   Add `create_component_set` tool with `properties` and `componentSetName`.
*   [ ] **Plugin**: Update [src/figma_plugin/handlers/componentHandlers.js](file:///Users/neozhehan/Git/figma-edit-mcp/src/figma_plugin/handlers/componentHandlers.js)
    *   Implement `createComponentSet`.
    *   Add logic to auto-rename components based on `properties` and `propertyValues`.
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add validation for property array length matching.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName` are applied to all input components and parent.
