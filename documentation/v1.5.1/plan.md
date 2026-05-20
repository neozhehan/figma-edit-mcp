# v1.5.1 — NPM-First Quick Start & Hostname Binding: Implementation Plan

This plan outlines the step-by-step implementation phases to execute the transition to the registry-first model and introduce hostname command-line/environment-variable binding for the WebSocket bridge. 

The implementation details are based on the audit decisions recorded in [quick_start_audit.md](./quick_start_audit.md).

---

## Phase 1 — CLI & WebSocket Code Changes

Implement the `--host` flag and `FIGMA_EDIT_MCP_SOCKET_HOST` environment variable contract.

- [x] **Modify `src/cli.ts`**:
  - Update `parseCliArgs` to accept, parse, and return the `host` parameter (default: `"localhost"`).
  - Support `FIGMA_EDIT_MCP_SOCKET_HOST` as an environment variable fallback.
  - Support `--host <ip>` as a CLI option (e.g. `npx figma-edit-mcp-socket --host 0.0.0.0`).
  - Update `--help` usage output to list `--host` alongside `--port` and `--version`.
- [x] **Modify `src/socket.ts`**:
  - Extract `host` alongside `port` from `parseCliArgs`.
  - Pass the resolved `host` value as the `hostname` property in the `Bun.serve` options payload.
  - Update the startup console message from `WebSocket server running on port ${server.port}` to `WebSocket server running on ${server.hostname}:${server.port}`.
- [x] **Local CLI Verification**:
  - Run `bun run build:all` to compile.
  - Start the bridge using `bun run dist/socket.js --host 127.0.0.1 --port 3056` and confirm it listens on `127.0.0.1:3056`.
  - Start the bridge using `FIGMA_EDIT_MCP_SOCKET_HOST=127.0.0.1 bun run dist/socket.js --port 3056` and confirm the env-var fallback binds to `127.0.0.1:3056`.
  - Start the bridge using `bun run dist/socket.js --host 0.0.0.0 --port 3056` and confirm it binds to `0.0.0.0:3056` (the WSL case from audit Section 4e).
  - Check that the server exits cleanly with `0` when run with `--help` or `--version`.

---

## Phase 2 — README.md Documentation Overhaul

Restructure `README.md` to reflect the NPM-first/registry-based consumption workflow and deprecate local clone instructions for non-contributors.

- [x] **Quick Start (replace lines 34-89)**:
  - Outline direct NPM config integration (`npx -y figma-edit-mcp`).
  - After the JSON snippet, add the bridge sentence: "The config file location depends on your host — see [Integration-Specific Setup](#integration-specific-setup) below."
  - Add single-sentence aside referencing `bunx` for Bun users ("Bun users can substitute `bunx` for `npx`; both resolve the same package.").
  - Add WebSocket bridge invocation using `npx figma-edit-mcp-socket`.
  - Add local plugin installation instructions via `npm install figma-edit-mcp` to materialize the manifest path (`node_modules/figma-edit-mcp/figma_plugin/manifest.json`).
  - End the section with the trailing pointer line: "*Running from a local clone? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor-only `--local` development workflow.*"
- [x] **Integration-Specific Setup (replace lines 91-124)**:
  - Remove all instructions referencing `bun integrate` or clone workflow.
  - Frame setup around copy-pasting the canonical `npx` snippet into the host config file paths.
  - Reproduce the per-host Notes column from audit Section 4b verbatim:
    - **Cursor** — `~/.cursor/mcp.json`; "Restart Cursor after editing".
    - **VS Code / GitHub Copilot** — `~/Library/Application Support/Code/User/mcp.json`; "Requires VS Code 1.102+ with Copilot; enable Agent Mode".
    - **Google Antigravity** — `~/.gemini/antigravity/mcp_config.json`; "Restart Antigravity to load".
    - **Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`.
    - **Claude Code (CLI / VS Code)** — non-file workflow: `claude mcp add FigmaEdit npx figma-edit-mcp`; "No file edit needed".
    - **LM Studio** — edit `mcp.json` via the Developer tab (or use a deeplink, if provided).
- [x] **Manual Configuration (replace lines 128-149)**:
  - Keep the section (per audit 4c — it serves as a reference block for end users).
  - Preserve the file-location table (Cursor, VS Code/Copilot, Antigravity, Claude Desktop, LM Studio) pairing each host with its config file path.
  - Enforce the single canonical `npx` snippet (no dual `npx`/`bunx` codeblocks).
  - Remove all clone references and any lingering `bun integrate` mentions.
- [x] **Development Setup → Contributing (replace lines 155-186)**:
  - **Rename the section heading** from "Development Setup" to "Contributing" (per audit 4d).
  - Collapse the body to a single redirect line pointing to `CONTRIBUTING.md` for the `--local` workflow.
- [x] **Windows + WSL Guide (replace lines 190-209)**:
  - Remove manual modification of `src/socket.ts`.
  - Update setup instructions to run `npx figma-edit-mcp-socket --host 0.0.0.0` or configure hostname via the `FIGMA_EDIT_MCP_SOCKET_HOST=0.0.0.0` environment variable.
- [x] **Usage (replace lines 213-220)**:
  - Restructure the list to reference `npx figma-edit-mcp-socket` and the host-specific configuration files instead of `bun socket`/`bun integrate`.
- [x] **Final sweep — remove all legacy clone references**:
  - Grep the rewritten README for `bun setup`, `bun integrate`, `bun socket`, and `src/socket\.ts` (and any other `src/` file paths).
  - Confirm zero remaining hits outside the Contributing pointer line.

---

## Phase 3 — Version & Changelog Packaging

Update repository metadata and release tracking.

- [x] **Modify `package.json`**:
  - Bump `"version"` from `"1.5.0"` to `"1.5.1"`.
- [x] **Modify `CHANGELOG.md`**:
  - Add entry for `[1.5.1]` outlining the CLI host binding, the README rewrite, and documentation enhancements.

---

## Phase 4 — Global Verification & Pre-Release Smoke Tests

Ensure no build, test, or package regressions exist.

- [x] **Execute Tests**:
  - Run `bun test` to verify all 294+ unit and integration test assertions pass.
- [x] **Package & Asset Inspection**:
  - Run `bun run build:all`.
  - Pack the package locally via `npm pack`.
  - Validate the tarball contents to confirm all distribution files (build outputs in `dist/`, plugin manifest/code in `figma_plugin/`, metadata) are present and untainted.
- [x] **Smoke Test Binaries**:
  - In a temporary scratch directory outside the workspace, run:
    ```bash
    npm init -y
    npm install --no-save /path/to/figma-edit-mcp-1.5.1.tgz
    npx figma-edit-mcp --version
    npx figma-edit-mcp-socket --version
    npx figma-edit-mcp-socket --host 127.0.0.1 --port 3057 --help
    ```
  - Verify every command executes successfully and exits with status code `0`.
  - Confirm the plugin manifest is materialized at `node_modules/figma-edit-mcp/figma_plugin/manifest.json` (the on-disk path the README's Quick Start instructs Figma to import).
