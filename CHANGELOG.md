# Changelog

> **Note:** `1.5.0` is the first version published to NPM. Versions `1.3.0` and `1.4.0` were development milestones tagged in this repository but never released to the registry. The entries below are retained for traceability of the breaking changes that landed before the first published release.

## [Unreleased] — v2.2.0 (in progress)
### Changed
- **Tool inputs are now strict — unknown/misspelled parameter keys are rejected, not silently dropped.** Previously Zod stripped unrecognized keys, so an agent that sent a wrong key (e.g. `node_info({ properties })` when the param was `fields`) had it silently discarded and the tool ran as if the argument were omitted — succeeding while ignoring intent. Every tool now registers a strict input schema; a wrong key fails with `Unrecognized key(s): …`. (PRD §18.)
- **`node_info`: input parameter renamed `fields` → `properties`** (breaking) so the input name matches the response key and internal payload, removing the mismatch that induced the above hallucination. Pass `node_info({ nodeIds, properties: [...] })`. (PRD §18.)

### Fixed
- **`node_bind_variable` was non-functional through the MCP path (production-breaking).** The tool's schema sends `bindVariables` / `explicitVariableModes` **maps**, but the plugin handler (`setBoundVariable`) read a flat `{ field, variableId, collectionId, modeId }` shape it never received — so every real call threw `Must provide either (field + variableId) or (collectionId + modeId)`. The handler now consumes the maps directly: `bindVariables` binds/unbinds node properties (fills/strokes via paint binding, `null` to unbind), and `explicitVariableModes` resolves each collection id to its node before calling `setExplicitVariableModeForCollection` (the Plugin API rejects a raw collection id under dynamic-page mode). Regression tests now drive the real MCP map shapes so the drift cannot recur. (PRD §17; found during live verification.)

## [2.0.0]
### Breaking changes
This release completely overhauls the Model Context Protocol tool API to use a clean, standardized two-level namespace (`group_action`, 46 tools across 11 taxonomy groups). Tool routing, parameters, schemas, and return formats have been restructured to optimize for agentic consumption.

#### Consolidations and Splits:
- **`create_shape`**: Consolidated `create_rectangle`, `create_ellipse`, and `create_polygon_star` into a single tool. Star point counts now use native Figma StarNode pointCount semantics (no division/even-parity throw). Rectangle shapes now properly support solid fills and stroke colors.
- **`node_transform`**: Consolidated `move_node` and `resize_node` into a single tool. Supports partial updates for any subset of `x`, `y`, `width`, and `height`.
- **`node_info`**: Consolidated `get_node_variables` into `node_info` fields (`boundVariables`, `explicitVariableModes`). Library object references and style IDs resolve to structured `{id, name}` objects. Node-reference fields (e.g. `parent`, `mainComponent`, `instances`, `exposedInstances`, `stuckNodes`, `attachedConnectors`) are serialized to string IDs or arrays of IDs to prevent host-object serialization issues (caught via live verification).
- **`component_delete_property`**: Split out the destructive deletion action from `manage_component_property` (now `component_manage_property`) into a separate tool for tighter security boundaries.
- **`style_delete`**: Added a net-new tool to complete the style lifecycle, allowing safe style detach.

#### Complete Old to New Tool Mapping Table:
| Old Name | New Name | Group |
|---|---|---|
| `get_pages_info` | `page_info` | page |
| `get_nodes_info` | `node_info` | node |
| `get_node_variables` | *Folded into `node_info`* | node |
| `move_node` | `node_transform` | node |
| `resize_node` | `node_transform` | node |
| `set_node_name` | `node_rename` | node |
| `delete_multiple_nodes` | `node_delete` | node |
| `clone_node` | `node_clone` | node |
| `set_selections` | `node_select` | node |
| `group_nodes` | `node_group` | node |
| `ungroup_nodes` | `node_ungroup` | node |
| `flatten_node` | `node_flatten` | node |
| `insert_child` | `node_insert_child` | node |
| `set_auto_layout` | `node_set_auto_layout` | node |
| `set_fill_color` | `node_set_fill` | node |
| `set_stroke` | `node_set_stroke` | node |
| `set_corner_radius` | `node_set_corner_radius` | node |
| `set_effects` | `node_set_effects` | node |
| `apply_style` | `node_apply_style` | node |
| `set_bound_variable` | `node_bind_variable` | node |
| `export_node_as_image` | `node_export_visual` | node |
| `create_rectangle` | `create_shape` | create |
| `create_ellipse` | `create_shape` | create |
| `create_polygon_star` | `create_shape` | create |
| `create_frame` | `create_frame` | create |
| `create_text` | `create_text` | create |
| `create_node_from_svg` | `create_svg` | create |
| `create_component` | `create_component` | create |
| `create_component_instance` | `create_instance` | create |
| `create_component_set` | `create_component_set` | create |
| `create_connections` | `create_connection` | create |
| `get_styles` | `style_list` | style |
| `manage_style` | `style_manage` | style |
| *(None - Net New)* | `style_delete` | style |
| `set_multiple_text_contents` | `text_set_content` | text |
| `set_text_style` | `text_set_style` | text |
| `get_components` | `component_list` | component |
| `manage_component_property` (ADD/EDIT) | `component_manage_property` | component |
| `manage_component_property` (DELETE) | `component_delete_property` | component |
| `set_component_instance_property` | `instance_set_property` | instance |
| `get_instance_overrides` | `instance_get_overrides` | instance |
| `set_instance_overrides` | `instance_set_overrides` | instance |
| `get_variables` | `variable_list` | variable |
| `manage_variables` | `variable_manage` | variable |
| `delete_variables` | `variable_delete` | variable |
| `get_annotations` | `annotation_list` | annotation |
| `set_multiple_annotations` | `annotation_set` | annotation |
| `get_reactions` | `reaction_list` | reaction |
| `update_reactions` | `reaction_update` | reaction |
| `join_channel` | `channel_join` | channel |

#### Additional Improvements:
- **Rich Schema & Annotations**: Every tool now exposes explicit Zod input/output schemas with descriptions on all properties, and carries annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) for better client integration and Smithery publish score.
- **Dynamic Server Metadata**: Server reads name and version from `package.json` dynamically to avoid version drift.
- **Local Resources**: Exposed 4 offline operational guide resources under `figma-edit://guide/*` with an eager initialization instructions breadcrumb.
- **Runtime-agnostic socket client**: The Figma WebSocket client now uses the runtime's native `WebSocket` (bun, Node ≥22) and falls back to the `ws` package only on older Node. Fixes an endless connect/disconnect reconnect loop when the server was launched under **bun** (the `ws` client rejected its own `101` upgrade — "Unexpected server response: 101").
- **Clean shutdown / no orphaned processes**: The server now exits when its stdio host disconnects (stdin EOF) or on `SIGINT`/`SIGTERM`, and the reconnect timer is `unref()`d. Previously, MCP server instances lingered after the host quit and spun the reconnect loop forever, accumulating across host restarts.

## [1.5.3]
### CLI & Socket Bugfixes
- Rewrote WebSocket server in `src/socket.ts` to run on native Node.js HTTP and `ws` instead of `Bun.serve`, removing the dependency on Bun runtime for standard users.
- Updated `npx` socket server instructions in `README.md` to use `-y` and `--package figma-edit-mcp` so secondary binaries can be resolved directly from the registry without 404 errors.

## [1.5.2]
### Registry Integration
- Added required `mcpName` field to `package.json` to enable successful verification when publishing to the official Model Context Protocol registry.

## [1.5.1]
### CLI & Socket Enhancements
- Added support for the `--host` CLI flag and `FIGMA_EDIT_MCP_SOCKET_HOST` environment variable to configure the WebSocket bridge's bound hostname (enables WSL and remote connections).
- Updated WebSocket bridge logs to output the bound hostname and port dynamically.

### Documentation & Quick Start
- Overhauled `README.md` to prioritize NPM-first/registry-based consumption via `npx` / `npm install`.
- Moved local contributor setup instructions and clone-specific workflows to `CONTRIBUTING.md`.
- Updated the Windows + WSL guide to leverage the new `--host` binding option.

## [1.5.0]
### Release
- First release published to NPM as [`figma-edit-mcp`](https://www.npmjs.com/package/figma-edit-mcp).

### Repository
- Detached the repository from its upstream fork network so the project can be indexed by search engines and listed as a standalone project.
- README rewrites and `fork` reference sweep.
- GitHub topics tightened and engagement features (Issues, Discussions) enabled.
- Submitted to MCP directories (Smithery, MCP.so, Glama, GitHub MCP Registry).

### Packaging & Build
- `package.json` metadata expanded (`description`, `keywords`, `repository`, `homepage`, `bugs`, `author`, `license`, `engines`).
- Removed `main` and `module` fields to optimize for binary distribution.
- Added `prepublishOnly` script.
- Expanded `files` array to ensure all necessary runtime and documentation files are distributed.
- Exposed a second binary, `figma-edit-mcp-socket`, for the standalone WebSocket server implementation.
- Added `--version`, `--help`, and `--port` CLI flags to both binaries.
- Updated `tsup.config.ts` to target `node20`, emit ESM-only bundles, set `dts: false`, and automatically inject shebang banners (`#!/usr/bin/env node`).

### Architecture & Developer Experience
- Moved the Figma plugin source code layout from `src/figma_plugin` to the `figma_plugin` directory.
- Agent documentation updated: `DRAGME.md` retired; new `AGENTS.md` and `CLAUDE.md` files added.
- Added `CONTRIBUTING.md`.
- Enhanced `bun integrate` with `--local` and `--port` flags.
- Added a contributor-only banner warning on `scripts/setup.sh`.

### CI/CD & Supply Chain
- GitHub Actions rewritten: `ci.yml` and `publish.yml` pipelines established.
- Pinned Bun to `v1.3.0` across environments for maximum stability.
- Configured NPM 2FA requirement for secure publishing operations.

### Cleanup
- Swept development artifacts including `test_output.txt` and stale `v1.4.0` drafts.
- Removed obsolete `Dockerfile` and `bun-types` dependencies.
- Trimmed unused/obsolete `pub:release` scripts.
- Cleaned up the `LICENSE` file by removing redundant prefixes.

## [1.4.0]
### Breaking changes
- Connect payload `node` block: removed `containingPageId`, `containingPageName`, `parentNodeId`, `parentNodeName` (introduced in v1.3.0). Replaced by a structured `path` array of `[type, id, name]` 3-tuples representing the full ancestor chain from the containing page to the immediate parent.
- `get_nodes_info` parameter `properties` renamed to `fields`.
- `get_nodes_info` response shape changed from a flat list to a recursive `children` tree mirroring the Figma document structure. Non-requested properties are omitted entirely rather than returned as `null`.
- `scan_nodes_by_types` removed. Migration: `get_nodes_info({ nodeIds, filter: { type: [...] } })`.
- `scan_text_nodes` removed. Migration: `get_nodes_info({ nodeIds, filter: { type: "TEXT" }, fields: ["characters"] })`.

### New
- `get_nodes_info` supports deep recursive traversal with a `filter` parameter (prunes the traversal tree, retaining only matching nodes and their ancestors) and a `maxDepth` parameter (caps recursion depth).
- `descendantCount` added to both page-scope and node-scope payloads, and to top-level/boundary nodes in `get_nodes_info`.
- `progress_update` streaming events for all potentially slow traversal operations (`get_nodes_info` at depth, large `get_pages_info` requests) to prevent client timeouts.

For the full specification, see [get_nodes_info_update_spec.md](./documentation/completed/v1.4.0%20-%20get_nodes_info_update/get_nodes_info_update_spec.md).

## [1.3.0]
### Breaking changes
- \`get_document_info\` removed (no deprecation period; clients receive tool-not-found if they call it).
- \`get_page_info\` renamed to \`get_pages_info\` with new parameter shape (\`pageIds?: string[]\` replacing \`pageId?: string\`) and new response shape.
- \`join_channel\` response shape changed from prose to JSON with \`status\` / \`channel\` / \`editableScopeType\` envelope.
- Removed fields from connect/page payloads: \`childCount\`, \`currentPageId\`, \`currentPageName\`, \`isCurrent\`, root \`type: "DOCUMENT"\`.

### New
- \`editableScopeType\` discriminator.
- \`get_pages_info\` streaming with progress events.
- Structured connect-flow error codes (\`CHANNEL_NOT_FOUND\` / \`CHANNEL_JOIN_FAILED\` / \`PLUGIN_DISCONNECTED\` / \`SCOPE_DELETED\` / \`SCOPE_INVALID\` / \`DOCUMENT_LOAD_FAILED\` / \`UNKNOWN_ERROR\`).

For the full specification, see [read_tools_update.md](./documentation/completed/v1.3.0%20-%20read_tools_update/read_tools_update.md).
