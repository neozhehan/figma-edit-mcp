# Server Reorganization Implementation Plan

## Goal Description
Refactor `src/mcp_server/server.ts` to improve maintainability and code organization. Currently, `server.ts` is over 2,800 lines long and contains both server setup and tool definitions. We will split the tool definitions into modular files within `src/mcp_server/tools/` and update `server.ts` to register these tools. This aligns with the structure recommended in `documentation/cttf_comparative_analysis.md`.

## User Review Required
> [!NOTE]
> This is a pure refactor. No functionality changes are intended.
> `src/mcp_server/tools.ts` currently exists and contains a few tools. These will be integrated into the new structure.

## Proposed Changes

### 1. Directory Structure

We will create a specific `tools` directory and modularize the tool definitions by category. We will also introduce a `tests` directory for unit tests.

```
src/mcp_server/
├── server.ts          (Entry point, drastically reduced)
├── tools/             (New directory)
│   ├── index.ts       (Aggregator for registering all tools)
│   ├── creation.ts    (Shape and object creation)
│   ├── modification.ts(Node transforms and naming)
│   ├── styling.ts     (Fills, strokes, effects)
│   ├── text.ts        (Text manipulation)
│   ├── layout.ts      (Auto-layout, padding, alignment)
│   ├── components.ts  (Components and instances)
│   ├── variables.ts   (Variables and modes)
│   ├── annotations.ts (Annotations)
│   ├── prototyping.ts (Reactions and connectors)
│   ├── document.ts    (Info, pages, search)
│   └── assets.ts      (Export)
```

```
tests/
├── setup.ts           (Jest setup)
└── unit/
    └── tools/
        ├── creation.test.ts
        ├── modification.test.ts
        ├── styling.test.ts
        ├── text.test.ts
        ├── layout.test.ts
        ├── components.test.ts
        ├── variables.test.ts
        ├── annotations.test.ts
        ├── prototyping.test.ts
        ├── document.test.ts
        └── assets.test.ts
```

### 2. File Implementation Details

#### [MODIFY] [server.ts](src/mcp_server/server.ts)
- Remove all inline `server.tool(...)` calls.
- Import `registerAllTools` from `./tools/index.js`.
- Call `registerAllTools(server)`.

#### [MODIFY] [package.json](package.json)
- Add `jest`, `ts-jest`, `@types/jest` to devDependencies.
- Add `test` script: `jest`.

#### [NEW] [jest.config.js](jest.config.js)
- Configure Jest to use `ts-jest` for TypeScript files.
- Map `src/*` paths if necessary.

#### [DELETE] [tools.ts](src/mcp_server/tools.ts)
- This file content will be distributed to `document.ts` and `creation.ts`.

#### [NEW] [src/mcp_server/tools/index.ts](src/mcp_server/tools/index.ts)
- Exports `registerAllTools(server: McpServer)`.
- Imports register functions from all sub-modules and calls them.

#### [NEW] [src/mcp_server/tools/creation.ts](src/mcp_server/tools/creation.ts)
- `create_rectangle`
- `create_frame`
- `create_node_from_svg`
- `create_connections` (Note: comparative analysis puts this in Prototyping, we will verify)

#### [NEW] [src/mcp_server/tools/modification.ts](src/mcp_server/tools/modification.ts)
- `move_node`
- `resize_node`
- `set_node_name`
- `delete_multiple_nodes`
- `clone_node`
- `set_selections`

#### [NEW] [src/mcp_server/tools/styling.ts](src/mcp_server/tools/styling.ts)
- `set_fill_color`
- `set_stroke_color`
- `set_corner_radius`
- `set_effects`
- `get_styles`
- `create_style`
- `apply_style`

#### [NEW] [src/mcp_server/tools/text.ts](src/mcp_server/tools/text.ts)
- `create_text`
- `set_text_content`
- `set_multiple_text_contents`
- `scan_text_nodes`

#### [NEW] [src/mcp_server/tools/layout.ts](src/mcp_server/tools/layout.ts)
- `set_layout_mode`
- `set_padding`
- `set_axis_align`
- `set_layout_sizing`
- `set_item_spacing`

#### [NEW] [src/mcp_server/tools/components.ts](src/mcp_server/tools/components.ts)
- `get_local_components`
- `create_component`
- `create_component_instance`
- `get_instance_overrides`
- `set_instance_overrides`

#### [NEW] [src/mcp_server/tools/variables.ts](src/mcp_server/tools/variables.ts)
- `get_variables`
- `get_node_variables`
- `set_bound_variable`
- `manage_variables`

#### [NEW] [src/mcp_server/tools/annotations.ts](src/mcp_server/tools/annotations.ts)
- `get_annotations`
- `set_multiple_annotations`

#### [NEW] [src/mcp_server/tools/prototyping.ts](src/mcp_server/tools/prototyping.ts)
- `get_reactions`
- `set_default_connector`
- `create_connections`

#### [NEW] [src/mcp_server/tools/document.ts](src/mcp_server/tools/document.ts)
- `get_document_info`
- `get_page_info`
- `get_nodes_info`
- `scan_nodes_by_types`
- `join_channel`

#### [NEW] [src/mcp_server/tools/assets.ts](src/mcp_server/tools/assets.ts)
- `export_node_as_image`

#### [NEW] [tests/unit/tools/*.test.ts](tests/unit/tools/)
- Create corresponding test files for each tool module.
- Mock `sendCommandToFigma` to verify tools call it with correct parameters.
- Verify that tools return correct Zod schemas.

## Verification Plan

### Automated Tests
1. Run `npm install` to install new dependencies.
2. Run `npm test` to execute the new Jest test suite.
   - Verify all tests pass.
   - Ensure coverage for tool definitions.
3. Run `npm run build` to ensure no typescript errors.
4. Run `npm run start` to ensure server starts up.
