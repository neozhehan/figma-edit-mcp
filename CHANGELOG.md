# Changelog

> **Note:** `1.5.0` is the first version published to NPM. Versions `1.3.0` and `1.4.0` were development milestones tagged in this repository but never released to the registry. The entries below are retained for traceability of the breaking changes that landed before the first published release.

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
- Moved the Figma plugin source code layout from `figma_plugin` directly to the `figma_plugin` directory.
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
