# Audit: README.md — Quick Start & Cross-Section Consistency

This audit reviews the current state of [README.md](../../README.md) against the architectural decisions made for the **v1.5.0** release (see [questions.md](./questions.md) Q6, Q7, Q8, Q15, Q24). It identifies every section that contradicts the NPM-first model and prescribes the changes needed to make the README internally consistent.

---

## 1. Is the "Quick Start" section outdated?

> [!IMPORTANT]
> **Yes — and it is not the only outdated section.** A Quick Start rewrite in isolation will leave the rest of the README contradicting itself. The audit below treats the Quick Start as the headline fix, but the README needs a coordinated edit across **six** sections.

### The contradiction

The current Quick Start ([README.md:34-89](../../README.md#L34-L89)) instructs users to clone the repo, install Bun, and run:
```bash
bun setup
bun integrate
bun socket
```
However, v1.5.0 has transitioned to a fully-featured **NPM-first publication model**:
- **For end-users**: no clone, no Bun install required. The package is consumed directly from the NPM registry:
  - **MCP Server**: `npx figma-edit-mcp` (referenced as `bin` in [package.json:34-37](../../package.json#L34-L37))
  - **WebSocket Bridge**: `npx figma-edit-mcp-socket` (second `bin` per Q6)
  - **Figma Plugin**: shipped in the NPM tarball under `figma_plugin/manifest.json` (per Q15, see [questions.md:162](./questions.md#L162) and [questions.md:312](./questions.md#L312))
- **For contributors**: the clone-and-build workflow (`bun setup`, `bun integrate --local`) is strictly contributor-only and lives in [CONTRIBUTING.md](../../CONTRIBUTING.md) (Q24).

Retaining clone-and-build commands in the README's main Quick Start forces end-users into a contributor setup rather than the registry.

---

## 2. All README sections that need updating

Beyond Quick Start, five additional README sections still reference the clone-based workflow and will contradict a rewritten Quick Start unless updated together.

| # | Section | Lines | Issue | Action |
|---|---|---|---|---|
| 1 | Quick Start | [34-89](../../README.md#L34-L89) | Clone + `bun setup`/`bun integrate`/`bun socket` workflow | **Rewrite** — see Section 4 below |
| 2 | Integration-Specific Setup | [91-124](../../README.md#L91-L124) | Tells users to "Run `bun integrate`" | **Rewrite** — reframe each integration around the host-specific config file path; remove `bun integrate` references (the script is now contributor-only per Q8/Q24) |
| 3 | Manual Configuration | [128-149](../../README.md#L128-L149) | Already uses `npx`, but **duplicates** the proposed Quick Start | **Keep & update** — retain as a reference section for end users who want the config-file paths and snippet in one place; ensure it stays consistent with the Quick Start (single canonical `npx` snippet, no `bun integrate` references) |
| 4 | Development Setup | [155-186](../../README.md#L155-L186) | Clone-only commands (`bun install`, `bun run build`, `bun socket`, plugin link from `figma_plugin/`) | **Remove** — fully covered by [CONTRIBUTING.md](../../CONTRIBUTING.md) per Q24; leave a one-line pointer instead |
| 5 | Windows + WSL Guide | [190-209](../../README.md#L190-L209) | References editing `src/socket.ts` and running `bun socket` (clone path) | **Rewrite** — translate to the NPM path: configure hostname via the `--host` / env-var contract introduced in Q23 (see [questions.md:562](./questions.md#L562)), and start the bridge via `npx figma-edit-mcp-socket` |
| 6 | Usage | [213-220](../../README.md#L213-L220) | References `bun socket` and `bun integrate` | **Rewrite** — replace with `npx figma-edit-mcp-socket` and reference the host-specific config step instead of `bun integrate` |

> [!NOTE]
> The single canonical install form, per [questions.md:178 (Q7 decision)](./questions.md#L178), is **`npx figma-edit-mcp`**. The Q7 decision explicitly rejected dual `npx`/`bunx` presentation in the README because "dual presentation doubles the config-table length and creates real copy-paste risk." Bunx mentions belong at most as a one-line note, not as a second equal-weight code path.

---

## 3. The Figma plugin install gap

> [!WARNING]
> **The most common drafting mistake when proposing this rewrite is recommending `npx figma-edit-mcp` for the server *and* pointing Figma at `node_modules/figma-edit-mcp/figma_plugin/manifest.json` for the plugin — without an install step in between.**

`npx` does **not** populate `node_modules` in the user's working directory; it caches the package elsewhere. To make the `node_modules/figma-edit-mcp/figma_plugin/manifest.json` path that Q15 endorses actually exist on the user's filesystem, the Quick Start needs an **explicit local install step** before the plugin import.

**✅ Decision (2026-05-19): Option A — explicit local install for the plugin only.**

```bash
# In any directory of your choosing (e.g., ~/figma-edit-mcp/)
npm install figma-edit-mcp
# Then point Figma at ./node_modules/figma-edit-mcp/figma_plugin/manifest.json
```

The MCP server still runs via `npx` (no local install needed for the server). The local install exists solely to materialize the plugin's `manifest.json` at a stable on-disk path. This keeps Q15's `node_modules` symmetry intact and requires no additional release machinery — the cost is one extra shell command in the Quick Start.

---

## 4. Proposed README rewrite

This is the full replacement for sections 1, 2, 3, 5, and 6 from the table in Section 2. (Section 4 — Development Setup — collapses to a single pointer line.)

### 4a. Replacement for the Quick Start (replaces [README.md:34-89](../../README.md#L34-L89))

```markdown
## Quick Start

The quickest way to run Figma Edit MCP is directly from the NPM registry. You do **not** need to clone this repository.

### 1. Configure your AI assistant

Add the server to your AI assistant's MCP configuration:

​```json
{
  "mcpServers": {
    "FigmaEdit": {
      "command": "npx",
      "args": ["-y", "figma-edit-mcp"]
    }
  }
}
​```

The config file location depends on your host — see [Integration-Specific Setup](#integration-specific-setup) below. Bun users can substitute `bunx` for `npx`; both resolve the same package.

### 2. Start the WebSocket bridge

In a terminal, start the bridge that connects the MCP server to the Figma plugin. Keep this terminal running:

​```bash
npx figma-edit-mcp-socket
​```

### 3. Install the Figma plugin

The Figma plugin ships inside the NPM package. Install the package once to materialize the plugin files on disk:

​```bash
# In any directory of your choosing (e.g., ~/figma-edit-mcp/)
npm install figma-edit-mcp
​```

Then in the Figma desktop app:

1. Open **Plugins → Development → Import plugin from manifest…**
2. Select `node_modules/figma-edit-mcp/figma_plugin/manifest.json` from the directory above.

The plugin is now available under Plugins → Development in any Figma file.

---

*Running from a local clone? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor-only `--local` development workflow.*
```

> [!NOTE]
> The triple backticks inside the code fence above are rendered with a zero-width joiner (`​`) before the backticks to keep this audit file's markdown valid. Strip the zero-width joiner before pasting into `README.md`.

### 4b. Replacement for Integration-Specific Setup (replaces [README.md:91-124](../../README.md#L91-L124))

Remove every reference to `bun integrate`. The script is now contributor-only ([questions.md Q8 decision, line 193](./questions.md#L193)). Reframe each integration as: "the config file lives at X — paste the snippet from the Quick Start into it." Sketch:

```markdown
## Integration-Specific Setup

Paste the JSON snippet from the Quick Start into your host's MCP config file:

| Integration | Config File Location | Notes |
|---|---|---|
| Cursor | `~/.cursor/mcp.json` | Restart Cursor after editing |
| VS Code / GitHub Copilot | `~/Library/Application Support/Code/User/mcp.json` | Requires VS Code 1.102+ with Copilot; enable Agent Mode |
| Google Antigravity | `~/.gemini/antigravity/mcp_config.json` | Restart Antigravity to load |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | — |
| Claude Code (CLI / VS Code) | run `claude mcp add FigmaEdit npx figma-edit-mcp` | No file edit needed |
| LM Studio | edit `mcp.json` via the Developer tab | Or use a deeplink, if provided |
```

### 4c. Manual Configuration (updates [README.md:128-149](../../README.md#L128-L149))

**Keep this section.** End users may want a single reference block that pairs config-file paths with the canonical snippet. Update it to:
- Match the single canonical `npx` snippet from the Quick Start (no dual `npx`/`bunx` blocks).
- Drop any references to `bun integrate` or clone-based workflows.
- Keep the file-location table for hosts where the config is a file edit.

```markdown
## Manual Configuration

If you prefer to edit your host's MCP config directly, paste this snippet into the appropriate config file:

​```json
{
  "mcpServers": {
    "FigmaEdit": {
      "command": "npx",
      "args": ["-y", "figma-edit-mcp"]
    }
  }
}
​```

| Integration | Config File Location |
|---|---|
| Cursor | `~/.cursor/mcp.json` |
| VS Code / Copilot | `~/Library/Application Support/Code/User/mcp.json` |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| LM Studio | Use the in-app editor (via Developer tab) or edit `mcp.json` |

Running from a local clone? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the `--local` workflow.
```

### 4d. Development Setup (replaces [README.md:155-186](../../README.md#L155-L186))

Collapse the entire section to one line:

```markdown
## Contributing

For local development — building from source, running the bridge from a clone, and the `--local` integrate workflow — see [CONTRIBUTING.md](./CONTRIBUTING.md).
```

### 4e. Replacement for the Windows + WSL Guide (replaces [README.md:190-209](../../README.md#L190-L209))

> [!IMPORTANT]
> **Prerequisite code change (decided 2026-05-19, Path A):** add the `--host` / `FIGMA_EDIT_MCP_SOCKET_HOST` contract to [src/cli.ts](../../src/cli.ts) and [src/socket.ts](../../src/socket.ts), mirroring the existing `--port` / `FIGMA_EDIT_MCP_SOCKET_PORT` parsing. Default host: `localhost`. Pass the resolved value through to `Bun.serve({ hostname })` ([src/socket.ts:23](../../src/socket.ts#L23)). The current README's "uncomment `hostname` in `src/socket.ts`" instruction ([src/socket.ts:25](../../src/socket.ts#L25)) is removed once the flag/env contract is in place.

```markdown
## Windows + WSL Guide

To allow Figma (running on Windows) to connect to the bridge (running inside WSL), the bridge needs to listen on `0.0.0.0` instead of `localhost`:

​```bash
npx figma-edit-mcp-socket --host 0.0.0.0
# or via environment variable:
FIGMA_EDIT_MCP_SOCKET_HOST=0.0.0.0 npx figma-edit-mcp-socket
​```

Then point the Figma plugin's WebSocket address at your WSL instance's IP.
```

### 4f. Replacement for Usage (replaces [README.md:213-220](../../README.md#L213-L220))

```markdown
## Usage

1. Start the WebSocket bridge: `npx figma-edit-mcp-socket`
2. Configure the MCP server in your AI assistant (see [Integration-Specific Setup](#integration-specific-setup))
3. Open Figma and launch the Figma Edit MCP plugin from Plugins → Development
4. Use the `join_channel` MCP tool to establish communication
5. Use your AI assistant to interact with Figma via the available MCP tools
```

---

## 5. Open questions for the implementer

1. ~~**Plugin install path (Section 3).**~~ **Resolved 2026-05-19 — Option A** (`npm install figma-edit-mcp` to materialize `node_modules/.../manifest.json`).
2. ~~**Windows + WSL host binding (Section 4e).**~~ **Resolved 2026-05-19 — Path A.** Implement the `--host` / `FIGMA_EDIT_MCP_SOCKET_HOST` contract in [src/cli.ts](../../src/cli.ts) and [src/socket.ts](../../src/socket.ts), mirroring the existing `--port` / `FIGMA_EDIT_MCP_SOCKET_PORT` parsing. Default host: `localhost`. Pass the resolved value through to `Bun.serve({ hostname })` in [src/socket.ts:23](../../src/socket.ts#L23). After implementation, the Section 4e snippet is used as-is.
3. ~~**`bunx` mention placement.**~~ **Resolved 2026-05-19 — single-sentence aside in the Quick Start** ("Bun users can substitute `bunx` for `npx`").
4. ~~**Manual Configuration disposition.**~~ **Resolved 2026-05-19 — keep & update** the section as a reference block (see 4c).

---

## 6. Summary of changes

| Action | Sections affected |
|---|---|
| **Rewrite** | Quick Start (4a), Integration-Specific Setup (4b), Manual Configuration (4c), Windows + WSL (4e), Usage (4f) |
| **Collapse to pointer** | Development Setup (4d) |
| **Add (docs)** | Explicit `npm install figma-edit-mcp` step in Quick Start to materialize the plugin manifest path |
| **Add (code)** | `--host` / `FIGMA_EDIT_MCP_SOCKET_HOST` contract in [src/cli.ts](../../src/cli.ts) and [src/socket.ts](../../src/socket.ts) (prerequisite for 4e) |
| **Remove** | All references to `bun setup`, `bun integrate`, `bun socket`, and editing files in `src/` from non-contributor sections |
