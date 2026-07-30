# Figma Edit MCP

[![npm version](https://img.shields.io/npm/v/figma-edit-mcp.svg)](https://www.npmjs.com/package/figma-edit-mcp)
[![npm downloads](https://img.shields.io/npm/dm/figma-edit-mcp.svg)](https://www.npmjs.com/package/figma-edit-mcp)
[![CI](https://github.com/neozhehan/figma-edit-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/neozhehan/figma-edit-mcp/actions/workflows/ci.yml)
[![Featured by IDEO](https://img.shields.io/badge/Featured%20by-IDEO-000000)](https://edges.ideo.com/emerging-wave-sessions/figma-edit-mcp)  

[![figma-edit-mcp MCP server](https://glama.ai/mcp/servers/neozhehan/figma-edit-mcp/badges/card.svg)](https://glama.ai/mcp/servers/neozhehan/figma-edit-mcp)

Connect AI assistants to Figma via Model Context Protocol to read designs, create and modify elements, and manage design systems programmatically. 
  
This plugin empowers your AI assistant to become a Figma assistant, executing design updates **Safer**, **Cleaner**, and **Faster** than a human ever could.

This plugin allows you as a Designer to focus purely on creative decision-making, leaving the error-prone & repetitive manual changes to the automated systems.

🏆 **Featured by IDEO:** [Letting AI edit live Figma files without trusting it to behave](https://edges.ideo.com/emerging-wave-sessions/figma-edit-mcp)

📖 **Documentation:** [neozhehan.github.io/figma-edit-mcp](https://neozhehan.github.io/figma-edit-mcp/)

## What This Does for You

The project has three goals: **Safer**, **Cleaner**, and **Faster**.

- 🛡️ **Safer:** The plugin checks every action the AI requests before that action runs. If an action would damage the file, the plugin refuses it and tells the AI why. For example, the plugin will not delete a color variable while layers still use it. Figma itself does not warn you when you delete a variable that is in use — the deletion leaves broken references that are very hard to find afterwards.
- ✨ **Cleaner:** Because damaging actions are refused, the file does not accumulate broken references or leftover values. Bulk updates cover every layer that matches your request, not just the layers a person remembers to check.
- ⚡ **Faster:** The AI applies one change across hundreds of layers in seconds. For example, it can replace a product name in every text layer on a page, or copy the overrides from one component instance to fifty others.

These goals support each other: when the plugin refuses mistakes, the file stays consistent, and a consistent file is easier for both you and the AI to work with.

[Read the full reasoning behind these goals →](DESIGN_PHILOSOPHY.md)

## What the AI Cannot Do to Your File

AI assistants sometimes invent things. An AI can name a layer that does not exist, or misremember which layer it was editing. This plugin does not depend on the AI being right. The plugin checks every edit itself, inside Figma, and refuses any edit that fails a check. The AI cannot skip these checks.

What the plugin enforces:

1. **The AI can only edit the area you chose.** When you connect, you choose one page or one frame for the session. The plugin refuses any edit outside that area. If you choose no area, the AI can read the file but cannot edit any layers.
2. **Every edit must name its exact target layer.** The plugin compares the layer name the AI supplies with the real layer's name. If the names do not match, the plugin refuses the edit. This stops the AI from editing a layer it invented or misremembered.
3. **A bulk edit with one bad item changes nothing.** The plugin validates every item in a bulk edit before it changes the first one. If any item fails validation, the plugin rejects the entire bulk edit.
4. **Protected layers stay protected.** The plugin refuses edits to locked layers and to assets from shared libraries. It also refuses to add, delete, or move layers inside a component instance.
5. **The AI cannot delete its own working area.** The plugin refuses any action that would delete or replace the page or frame you assigned for the session.
6. **Variables and styles require separate permission.** Editing your variables or styles requires its own checkbox in the plugin, and both checkboxes are off by default. You grant that permission; the AI cannot grant it to itself.

One honest limit: the plugin checks *where* an edit happens and *which layer* it touches. It cannot check whether the edit is the one you wanted. A wrong edit that follows all the rules will go through. So you review the AI's work the same way you would review a colleague's work.

The exact rules, and the conditions under which each one holds, are written down in **[SAFETY.md](SAFETY.md)**. That document is for developers. *(Your AI assistant loads the same rules at runtime via the `figma-edit` skill or the `figma-edit://guide/*` resources.)*

## How the Work Is Divided

You do not need to know every Figma feature to direct this system. The work splits three ways:

- **You** decide what the design should be. You describe the change in plain language, and you judge the result. You do not need to know which Figma menu or panel performs the change.
- **The AI assistant** turns your request into specific Figma operations and carries out the repetitive work across many layers.
- **The plugin** runs inside Figma, checks each operation, and refuses the unsafe ones.

The AI contributes scale. The plugin contributes protection. You contribute the design judgment.

## Supported AI Integrations
- Cursor
- GitHub Copilot (VS Code)
- Google Antigravity
- Claude Code (VS Code & CLI)
- Claude Desktop (Chat, Cowork & Code)
- LM Studio

## Quick Start

The quickest way to run Figma Edit MCP is directly from the NPM registry. You do **not** need to clone this repository.

### 1. Configure your AI assistant

Add the server to your AI assistant's MCP configuration:

```json
{
  "mcpServers": {
    "FigmaEdit": {
      "command": "npx",
      "args": ["-y", "figma-edit-mcp"]
    }
  }
}
```

The config file location depends on your host — see [Integration-Specific Setup](#integration-specific-setup) below. Bun users can substitute `bunx` for `npx`; both resolve the same package.

### 2. Start the WebSocket bridge

In a terminal, start the bridge that connects the MCP server to the Figma plugin. Keep this terminal running:

```bash
npx -y --package figma-edit-mcp figma-edit-mcp-socket
```

### 3. Install the Figma plugin

The Figma plugin ships inside the NPM package. Install the package once to materialize the plugin files on disk:

```bash
# In any directory of your choosing (e.g., ~/figma-edit-mcp/)
npm install figma-edit-mcp
```

Then in the Figma desktop app:

1. Open **Plugins → Development → Import plugin from manifest…**
2. Select `node_modules/figma-edit-mcp/figma_plugin/manifest.json` from the directory above.

The plugin is now available under Plugins → Development in any Figma file.

### 4. (Optional) Install the agent skill

The package also ships a cross-tool **skill** that teaches your agent the server's safety constraints, error recovery, and tool selection — loaded on demand, so it costs almost nothing until needed. Agents that support the open `SKILL.md` standard (Claude Code, GitHub Copilot, OpenAI Codex, Cursor, Gemini CLI, Google Antigravity) discover it once it's in their skills directory:

```bash
# copy the skill into your agent's skills directory (path varies by host)
cp -R node_modules/figma-edit-mcp/skills/figma-edit ~/.claude/skills/
```

Clients that don't support skills can still reach the same guidance over the MCP connection as resources under `figma-edit://guide/*` — no install required.

---

*Running from a local clone? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor-only `--local` development workflow.*

---

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

---

## Manual Configuration

If you prefer to edit your host's MCP config directly, paste this snippet into the appropriate config file:

```json
{
  "mcpServers": {
    "FigmaEdit": {
      "command": "npx",
      "args": ["-y", "figma-edit-mcp"]
    }
  }
}
```

| Integration | Config File Location |
|---|---|
| Cursor | `~/.cursor/mcp.json` |
| VS Code / Copilot | `~/Library/Application Support/Code/User/mcp.json` |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| LM Studio | Use the in-app editor (via Developer tab) or edit `mcp.json` |

Running from a local clone? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the `--local` workflow.

---

## Contributing

For local development — building from source, running the bridge from a clone, and the `--local` integrate workflow — see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Windows + WSL Guide

To allow Figma (running on Windows) to connect to the bridge (running inside WSL), the bridge needs to listen on `0.0.0.0` instead of `localhost`:

```bash
npx -y --package figma-edit-mcp figma-edit-mcp-socket --host 0.0.0.0
# or via environment variable:
FIGMA_EDIT_MCP_SOCKET_HOST=0.0.0.0 npx -y --package figma-edit-mcp figma-edit-mcp-socket
```

Then point the Figma plugin's WebSocket address at your WSL instance's IP.

---

## Usage

1. Start the WebSocket bridge: `npx -y --package figma-edit-mcp figma-edit-mcp-socket`
2. Configure the MCP server in your AI assistant (see [Integration-Specific Setup](#integration-specific-setup))
3. Open Figma and launch the Figma Edit MCP plugin from Plugins → Development
4. Use the `channel_join` MCP tool to establish communication
5. Use your AI assistant to interact with Figma via the available MCP tools

---

## MCP Tools

Tools are grouped into a two-level, underscore-separated namespace (`group_action`). Reads are `*_list` / `*_info`; writes use verb leaves. Anything that mutates a node lives under `node_*`.

### `page` — pages

| Tool | Description |
|---|---|
| `page_info` | List the document's pages; with `pageIds`, return those pages and their top-level children |

### `node` — read, transform, and style any node

| Tool | Description |
|---|---|
| `node_info` | Read one or more nodes — recursive traversal with `properties`, `filter`, and `maxDepth` (the workhorse read; also returns bound variables / explicit modes) |
| `node_transform` | Move and/or resize a node by setting absolute `x` / `y` / `width` / `height` |
| `node_rename` | Rename a node |
| `node_delete` | Delete one or more nodes in a single validated batch |
| `node_clone` | Duplicate a node, optionally at a new position |
| `view_navigate` | Navigate the editor view to a page or node(s) |
| `node_group` | Wrap nodes in a new group |
| `node_ungroup` | Dissolve a group, promoting its children |
| `node_flatten` | Flatten a node and its children into a single vector |
| `node_insert_child` | Reparent a node under a new parent at an optional index |
| `node_set_auto_layout` | Configure a frame's auto-layout (mode, padding, spacing, alignment, sizing) |
| `node_set_fill` | Set a node's fill to a color or image, or clear it |
| `node_set_stroke` | Set stroke color and weight (uniform or per-side) |
| `node_set_corner_radius` | Set corner radius (uniform or per-corner) |
| `node_set_effects` | Set the effect array (shadows, blurs) |
| `node_apply_style` | Link a node to a shared library style (paint/text/effect/grid) |
| `node_bind_variable` | Bind a variable to a node property, or set an explicit variable mode |
| `node_export_visual` | Render a node to an image (PNG / JPG / SVG / PDF) |

### `create` — make new nodes

| Tool | Description |
|---|---|
| `create_shape` | Create a rectangle, ellipse, polygon, or star (`type`) with optional fill/stroke |
| `create_frame` | Create a frame with optional fill/stroke and full auto-layout |
| `create_text` | Create a text node with optional font size/weight/color |
| `create_svg` | Create a node from an SVG markup string |
| `create_component` | Convert an existing frame into a main component |
| `create_instance` | Instantiate a component at a position |
| `create_component_set` | Combine components into a component set (variants) |

### `style` — shared styles

| Tool | Description |
|---|---|
| `style_list` | List all local styles (paint/text/effect/grid) |
| `style_manage` | Create a named style, or update one when `styleId` is given |
| `style_delete` | Delete a local style by id (detaches consumers, which keep their resolved values) |

### `text` — text content & typography

| Tool | Description |
|---|---|
| `text_set_content` | Batch-set the text of one or more text nodes |
| `text_set_style` | Set any combination of typography properties on a text node |

### `component` — components & variants

| Tool | Description |
|---|---|
| `component_list` | List components, with filtering and scope options |
| `component_manage_property` | Add or edit a component-property definition (BOOLEAN/TEXT/INSTANCE_SWAP) |
| `component_delete_property` | Remove a component-property definition |

### `instance` — component instances

| Tool | Description |
|---|---|
| `instance_set_property` | Set one property on an instance (toggle, text, swap, or variant) |
| `instance_get_overrides` | Read the override properties from a source instance |
| `instance_set_overrides` | Apply copied overrides to target instances |

### `variable` — variables & collections

| Tool | Description |
|---|---|
| `variable_list` | List variables/collections, or detail by ID; optionally scan consumers |
| `variable_manage` | Create collections and variables and set values/aliases |
| `variable_delete` | Delete variables or a collection (rejected if still in use) |

### `annotation` — Dev Mode annotations

| Tool | Description |
|---|---|
| `annotation_list` | Read annotations on a node; optionally include categories |
| `annotation_set` | Batch create or update native annotations (markdown) |

### `reaction` — prototype reactions

| Tool | Description |
|---|---|
| `reaction_list` | Read prototype reactions (click flows, overlays) from nodes |
| `reaction_update` | Replace a node's reactions with a full new array |

### `channel` — connection

| Tool | Description |
|---|---|
| `channel_join` | Join a WebSocket channel to establish communication with the plugin |

---

## MCP Prompts

Built-in prompts guide complex multi-step design tasks:

| Prompt | Description |
|---|---|
| `swap_overrides_instances` | Transfer component instance overrides from a source to multiple targets |

---

## Best Practices

When working with Figma Edit MCP:

1. Always join a channel first with `channel_join` before sending any other commands.

---

## Notes
### Automatic Node ID Normalization

Node IDs copied from Figma URLs use dashes (`20485-41`), but the plugin API expects colons (`20485:41`).  The MCP server automatically converts dash-format IDs before forwarding, so either format works without manual intervention.

---

## Acknowledgements

Built on prior work by [sonnylazuardi](https://github.com/sonnylazuardi) and the contributors to [grab/cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp). Thank you for the foundation this project builds on.

Thanks to [@dusskapark](https://github.com/dusskapark) for the following contributions:

- **Bulk text content replacement** — Batch-update text across large designs efficiently. [Demo video](https://www.youtube.com/watch?v=j05gGT3xfCs)
- **Instance override propagation** — Propagate component instance overrides from a source to multiple targets in a single command, dramatically reducing repetitive design work. [Demo video](https://youtu.be/uvuT8LByroI)

---

## License

The MIT License (MIT)

Copyright (c) 2025 sonnylazuardi  
Copyright (c) 2026 Neo Product LLC
