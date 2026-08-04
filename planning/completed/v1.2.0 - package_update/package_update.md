# Package Update Assessment

This document outlines the dependencies that are eligible for a version update in the `figma-edit-mcp` project, alongside an assessment of their current usage within the codebase.

## Packages to Update

### Dependencies
- **`zod`**: `3.22.4` → `4.4.3`
- **`uuid`**: `11.1.0` → `14.0.0`
- **`ws`**: `8.18.1` → `8.20.0`

### Dev Dependencies
- **`@figma/plugin-typings`**: `1.123.0` → `1.125.0`
- **`typescript`**: `5.8.2` → `6.0.3`
- **`esbuild`**: `0.27.2` → `0.28.0`
- **`tsup`**: `8.4.0` → `8.5.1`
- **`@types/bun`**: `1.2.5` → `1.3.13`
- **`bun-types`**: `1.2.5` → `1.3.13`

## Usage Assessment

An analysis of the codebase reveals that almost all of these packages are actively used:

- **`zod`**: Heavily used throughout `src/mcp_server/tools/*.ts` for defining strict schemas for MCP tool inputs.
- **`uuid` & `ws`**: Used in `src/mcp_server/figma-client.ts`, `src/mcp_server/server.ts`, and `src/socket.ts` for managing WebSocket connections to Figma.
- **`esbuild`**: Utilized by the custom build script (`figma_plugin/build.js`) to compile the Figma plugin.
- **`tsup`**: The core build tool specified in the `package.json` scripts (`build: "tsup"`) for compiling the MCP server.
- **`typescript`, `@figma/plugin-typings`, `bun-types`, `@types/bun`**: Essential for type-checking and providing the types for the Bun runtime environment and Figma plugin development.

## Recommendation for Unused Packages

### `ts-morph` (27.0.2 → 28.0.0)
A search across the entire `src/` directory shows **0 usages** of `ts-morph`. It appears to be an orphaned dependency.

**Recommendation:** Rather than updating `ts-morph`, it should be completely uninstalled from the project to reduce dependency bloat:
```bash
bun remove ts-morph
```

## Potential Risks
- Major version bumps for `zod` (v3 → v4) and `typescript` (v5 → v6) might contain breaking changes. It's recommended to test the test suite (`bun test`) after applying these updates to ensure stability.

## Tooling Note
Bun is the **default and exclusive** package manager for this project. All install / remove / update commands use `bun add`, `bun remove`, etc. — `npm` usage is deprecated and being removed throughout the project (see Phase 0 in [package_update_plan.md](package_update_plan.md)).
