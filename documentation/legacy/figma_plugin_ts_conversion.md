# Figma Plugin TypeScript Conversion Plan

This document outlines the implementation plan for migrating the Figma Plugin portion of the `figma-edit-mcp` project from JavaScript to TypeScript.

## Motivation
Converting the Figma Plugin to TypeScript provides several key benefits:
1. End-to-end type safety between the MCP Server and the Figma Plugin, specifically for the JSON messages sent over WebSockets.
2. Proper typings for the extensive Figma Plugin API, utilizing `@figma/plugin-typings`.
3. Improved maintainability and consistency across the entire repository (as the MCP Server is already in TypeScript).

## Prerequisites
- The backend MCP server is already in TypeScript.
- The project is already using `esbuild` for the plugin (`figma_plugin/build.js`), which supports TypeScript out-of-the-box.
- A new branch `feature/convert-plugin-to-typescript` has been created for these changes.

## Step-by-Step Implementation Plan

### 1. Update Project Dependencies
- **Task:** Install necessary type definitions for Figma.
- **Action:** Run `npm install --save-dev @figma/plugin-typings`.
- **Verification:** Ensure `package.json` and `package-lock.json` reflect the new dependency.

### 2. Configure TypeScript for the Plugin
- **Task:** Add a `tsconfig.json` file specifically for the Figma plugin to handle DOM and Figma API types correctly without interfering with the Node.js backend `tsconfig.json`.
- **Action:** Create `figma_plugin/tsconfig.json` with appropriate settings:
  - `compilerOptions`: `target: "es6"`, `lib: ["es6", "dom"]`, `strict: true`, `typeRoots`: `["./node_modules/@types", "./node_modules/@figma"]`.
  - `include`: `["src/**/*"]`.

### 3. Rename JavaScript Files to TypeScript
- **Task:** Change the file extensions of all plugin source files from `.js` to `.ts`.
- **Action:**
  - Rename `figma_plugin/src/main.js` to `main.ts`.
  - Rename all files in `figma_plugin/handlers/` and `figma_plugin/utils/` to `.ts`.
- **Verification:** Ensure all files are renamed and no `.js` files remain in these source directories.

### 4. Update the Build Script
- **Task:** Update the ESBuild configuration to target the new `.ts` entry point.
- **Action:** Modify `figma_plugin/build.js`:
  - Change `entryPoints: [join(__dirname, 'src/main.js')]` to `entryPoints: [join(__dirname, 'src/main.ts')]`.
- **Verification:** Run `npm run plugin:build` to confirm `esbuild` can process the `.ts` entry point (even with temporary type errors).

### 5. Resolve TypeScript Errors and Add Types
- **Task:** Systematically go through the newly renamed `.ts` files and fix TypeScript compilation errors.
- **Action:**
  - Add specific types to function parameters and return values (e.g., `figma.currentPage.selection: ReadonlyArray<SceneNode>`).
  - Define interfaces for the JSON RPC payloads sent between the plugin and the server. This may involve importing types from the backend `src/mcp_server` or defining shared types.
  - Fix any implicit `any` errors.
  - Ensure correct handling of null/undefined values, especially when querying Figma nodes.
- **Verification:** Running `tsc -p figma_plugin/tsconfig.json --noEmit` should complete with zero errors.

### 6. Verification and Testing
- **Task:** Verify the built plugin functions correctly within Figma.
- **Action:**
  - Run the full build command (`npm run build:all`).
  - Load the plugin into the Figma desktop app (Plugins -> Development -> Import plugin from manifest).
  - Test a representative sample of tools (e.g., creating a node, modifying a node, joining a channel) via the MCP server to ensure end-to-end functionality remains intact.
  - Verify WebSocket connection stability.

## Rollback Plan
If critical issues arise during the conversion that cannot be swiftly resolved:
1. Revert the branch `feature/convert-plugin-to-typescript` to the commit prior to renaming files.
2. Abort the migration and re-evaluate the complexity of the specific type definitions causing the issue.
