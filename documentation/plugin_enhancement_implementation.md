# Implementation Plan: Figma Plugin Enhancements

This plan outlines the steps required to implement the enhancements detailed in the [Plugin Enhancement Recommendations](plugin_enhancement.md).

## Phase 1: Core Data & Quick Wins

### 1. Refactor Document Info Tools
**Goal**: Split `get_document_info` into metadata-only and add `get_page_info`.

*   [x] **Server**: Update [src/mcp_server/tools/document.ts](src/mcp_server/tools/document.ts)
    *   Modify `get_document_info` output schema (remove `children`).
    *   Add `get_page_info` tool definition.
*   [x] **Test**: Create/Update unit tests in `tests/unit/tools/document.test.ts`
*   [x] **Plugin**: Update [src/figma_plugin/handlers/nodeReaders.js](src/figma_plugin/handlers/nodeReaders.js)
    *   Refactor `getDocumentInfo` to return only document metadata (all pages list).
    *   Implement `getPageInfo` to return page content.
*   [x] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add `get_page_info` to `handleCommand` switch.

### 2. Rename & Enhance Component Getter
**Goal**: Rename `get_local_components` to `get_components` and add filtering/scoping.

*   [x] **Server**: Update [src/mcp_server/tools/components.ts](src/mcp_server/tools/components.ts)
    *   Add `get_components` tool definition (parameters: `filter`, `scope`).
    *   Remove `get_local_components`.
*   [x] **Test**: Create/Update unit tests in `tests/unit/tools/components.test.ts`
*   [x] **Plugin**: Update [src/figma_plugin/handlers/componentHandlers.js](src/figma_plugin/handlers/componentHandlers.js)
    *   Implement `getComponents` with `scope` (default: 'current_page') and `filter` ('local'/'remote').
    *   Remove `getLocalComponents`.
*   [x] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add `get_components` to `handleCommand` switch.
    *   Remove `get_local_components` route.

### 3. Consolidate Connector Tools
**Goal**: Merge `set_default_connector` into `create_connections`.

*   [ ] **Server**: Update [src/mcp_server/tools/prototyping.ts](src/mcp_server/tools/prototyping.ts)
    *   Update `create_connections` schema to accept `connectorId`.
    *   Deprecate `set_default_connector`.
*   [ ] **Test**: Create/Update unit tests in `tests/unit/tools/prototyping.test.ts`
*   [ ] **Plugin**: Update [src/figma_plugin/handlers/connectorHandlers.js](src/figma_plugin/handlers/connectorHandlers.js)
    *   Refactor `createConnections` to handle optional `connectorId` (set as default template).
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Update `create_connections` validation logic to check `connectorId`.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName` are applied to `connectorId` (if provided).

## Phase 2: Major Consolidations & Enhancements

### 4. Unified Text Styling
**Goal**: Replace 9 separate text tools with `set_text_style`.

*   [x] **Server**: Update [src/mcp_server/tools/text.ts](src/mcp_server/tools/text.ts)
    *   Add `set_text_style` tool definition with all optional styling parameters.
    *   Deprecate individual text tools (`set_font_size`, `set_font_weight`, etc.).
*   [x] **Test**: Create/Update unit tests in `tests/unit/tools/text.test.ts`
*   [x] **Plugin**: Create/Update [src/figma_plugin/handlers/textHandlers.js](src/figma_plugin/handlers/textHandlers.js)
    *   Implement `setTextStyle` with conditional font loading.
    *   **Strict Handler**: Ensure missing parameters are treated as noops.
*   [x] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add `set_text_style` to `handleCommand` switch.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName` are implemented.

### 5. Unified Auto-Layout
**Goal**: Replace 5 layout tools with `set_auto_layout`.

*   [ ] **Server**: Update [src/mcp_server/tools/layout.ts](src/mcp_server/tools/layout.ts)
    *   Add `set_auto_layout` tool definition.
    *   Deprecate `set_layout_mode`, `set_padding`, etc.
*   [ ] **Test**: Create/Update unit tests in `tests/unit/tools/layout.test.ts`
*   [ ] **Plugin**: Create/Update [src/figma_plugin/handlers/layoutHandlers.js](src/figma_plugin/handlers/layoutHandlers.js)
    *   Implement `setAutoLayout`.
    *   **Strict Handler**: Ensure missing parameters are treated as noops.
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add `set_auto_layout` to `handleCommand` switch.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName` are implemented.

## Phase 3: New Capabilities

### 6. Shape Creation
**Goal**: Add `create_ellipse` and `create_polygon_star`.

*   [ ] **Server**: Update [src/mcp_server/tools/creation.ts](src/mcp_server/tools/creation.ts)
    *   Display `create_ellipse` and `create_polygon_star` tools.
*   [ ] **Test**: Create/Update unit tests in `tests/unit/tools/creation.test.ts`
*   [ ] **Plugin**: Update [src/figma_plugin/handlers/nodeCreators.js](src/figma_plugin/handlers/nodeCreators.js)
    *   Implement `createEllipse` (supports arcs/donuts).
    *   Implement `createPolygonStar` (unified polygon/star logic).
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Register new commands in switch.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess` (on parent), and `verifyParentName` are implemented.

### 7. Node Organization
**Goal**: Add grouping, ungrouping, flattening, reparenting.

*   [ ] **Server**: Update [src/mcp_server/tools/modification.ts](src/mcp_server/tools/modification.ts)
    *   Add `group_nodes`, `ungroup_nodes`, `flatten_node`, `insert_child`.
*   [ ] **Test**: Create/Update unit tests in `tests/unit/tools/modification.test.ts`
*   [ ] **Plugin**: Create [src/figma_plugin/handlers/nodeModifiers.js](src/figma_plugin/handlers/nodeModifiers.js)
    *   Implement logic for all 4 tools.
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Register commands.
    *   Add validation logic for `group_nodes` (ensure same parent).
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName`/`verifyParentName` are implemented for all inputs.

### 8. Component Variants
**Goal**: Add `create_component_set`.

*   [ ] **Server**: Update [src/mcp_server/tools/components.ts](src/mcp_server/tools/components.ts)
    *   Add `create_component_set` tool with `properties` and `componentSetName`.
*   [ ] **Test**: Create/Update unit tests in `tests/unit/tools/components.test.ts`
*   [ ] **Plugin**: Update [src/figma_plugin/handlers/componentHandlers.js](src/figma_plugin/handlers/componentHandlers.js)
    *   Implement `createComponentSet`.
    *   Add logic to auto-rename components based on `properties` and `propertyValues`.
*   [ ] **Plugin**: Update `src/figma_plugin/main.js`
    *   Add validation for property array length matching.
    *   **Validation**: Ensure `state.readOnly` check, `checkScopeAccess`, and `verifyNodeName` are applied to all input components and parent.
