# Figma Edit MCP

[![npm version](https://img.shields.io/npm/v/figma-edit-mcp.svg)](https://www.npmjs.com/package/figma-edit-mcp)
[![npm downloads](https://img.shields.io/npm/dm/figma-edit-mcp.svg)](https://www.npmjs.com/package/figma-edit-mcp)
[![CI](https://github.com/neozhehan/figma-edit-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/neozhehan/figma-edit-mcp/actions/workflows/ci.yml)

Connect AI assistants to Figma via Model Context Protocol to read designs, create and modify elements, and manage design systems programmatically. 
  
This plugin empowers your AI assistant to become a Figma assistant, executing design updates **Safer**, **Cleaner**, and **Faster** than a human ever could.

This plugin allows you as a Designer to focus purely on creative decision-making, leaving the error-prone & repetitive manual changes to the automated systems.

[Read more about our design philosophy here.](DESIGN_PHILOSOPHY.md)  

## Core Principles
- 🛡️ **Safer:** The plugin performs programmatic checks and protections that exceed those in the Figma Desktop app. For example, it prevents the deletion of variables that are still in use, avoiding dangling references. By enforcing these strict validations before an action is taken, the plugin protects designs from both human error and AI hallucinations.
- ✨ **Cleaner:** Programmatic, thorough operations mean no node is ever skipped or forgotten during large updates, ensuring that the design file is always consistent.
- ⚡ **Faster:** Executing batch operations (like bulk text replacement or instance override propagation) via AI reduces hours of tedious manual design work down to seconds.

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
npx figma-edit-mcp-socket
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
npx figma-edit-mcp-socket --host 0.0.0.0
# or via environment variable:
FIGMA_EDIT_MCP_SOCKET_HOST=0.0.0.0 npx figma-edit-mcp-socket
```

Then point the Figma plugin's WebSocket address at your WSL instance's IP.

---

## Usage

1. Start the WebSocket bridge: `npx figma-edit-mcp-socket`
2. Configure the MCP server in your AI assistant (see [Integration-Specific Setup](#integration-specific-setup))
3. Open Figma and launch the Figma Edit MCP plugin from Plugins → Development
4. Use the `join_channel` MCP tool to establish communication
5. Use your AI assistant to interact with Figma via the available MCP tools

---

## MCP Tools

The MCP server provides the following tools for interacting with Figma:

### Document & Selection

| Tool | Description |
|---|---|
| `get_pages_info` | Get information about specific pages in Figma including their children |
| `get_nodes_info` | Get detailed information about one or more nodes. Supports recursive depth (`maxDepth`), filtering (`filter`), and specifying fields (`fields`) |
| `set_selections` | Set selection to one or more nodes and scroll the viewport to show them |

### Node Creation

| Tool | Description |
|---|---|
| `create_frame` | Create a frame with optional fill, stroke, and full auto-layout configuration |
| `create_rectangle` | Create a rectangle with position, size, and optional name |
| `create_text` | Create a text node with customizable font, size, weight, and color |
| `create_node_from_svg` | Create a node from an SVG XML string |

### Node Modification

| Tool | Description |
|---|---|
| `move_node` | Move a node to a new position |
| `resize_node` | Resize a node to new dimensions |
| `clone_node` | Clone an existing node with an optional position offset |
| `delete_multiple_nodes` | Delete one or more nodes in a single operation |
| `set_node_name` | Rename a node in the Figma layer panel |

### Styling

| Tool | Description |
|---|---|
| `set_fill_color` | Set the fill color of a node (RGBA) |
| `set_stroke_color` | Set the stroke color and weight of a node |
| `set_corner_radius` | Set corner radius with optional per-corner control |
| `set_effects` | Apply drop shadow, inner shadow, layer blur, or background blur |

### Auto Layout & Spacing

| Tool | Description |
|---|---|
| `set_layout_mode` | Set layout mode (`NONE`, `HORIZONTAL`, `VERTICAL`) and wrap behavior |
| `set_padding` | Set padding values (top, right, bottom, left) for an auto-layout frame |
| `set_axis_align` | Set primary and counter axis alignment for auto-layout frames |
| `set_layout_sizing` | Set horizontal and vertical sizing modes (`FIXED`, `HUG`, `FILL`) |
| `set_item_spacing` | Set spacing between children and across wrapped rows/columns |

### Text Operations

| Tool | Description |
|---|---|
| `set_multiple_text_contents` | Batch-update text content across multiple nodes in parallel |

### Annotations

| Tool | Description |
|---|---|
| `get_annotations` | Get annotations on a node, including available categories |
| `set_multiple_annotations` | Batch create or update annotations with markdown support |

### Components & Styles

| Tool | Description |
|---|---|
| `get_styles` | List all local styles in the document |
| `get_local_components` | List all local components in the document |
| `manage_style` | Create or update a named style (Text, Paint, Effect, or Grid) |
| `apply_style` | Apply an existing named style to a node |
| `create_component` | Convert a frame into a main component |
| `create_component_instance` | Instantiate a component by key at a given position |
| `get_instance_overrides` | Extract all override properties from a component instance |
| `set_instance_overrides` | Apply extracted overrides to one or more target instances |

### Variables

| Tool | Description |
|---|---|
| `get_variables` | List all variable collections, or get details for a specific variable by ID |
| `get_node_variables` | Inspect bound variables and explicit variable modes on a node |
| `set_bound_variable` | Bind a variable to a node property, or set an explicit variable mode |
| `manage_variables` | Create collections, create variables, and set values or aliases |

### Prototyping & Connections

| Tool | Description |
|---|---|
| `get_reactions` | Extract prototype reactions (click flows, overlays) from nodes |
| `set_default_connector` | Set a FigJam connector as the default style for new connections |
| `create_connections` | Draw connector lines between nodes based on mappings or prototype flows |

### Export

| Tool | Description |
|---|---|
| `export_node_as_image` | Export a node as PNG, JPG, SVG, or PDF |

### Connection Management

| Tool | Description |
|---|---|
| `join_channel` | Join a WebSocket channel to establish communication with the Figma plugin |

---

## MCP Prompts

Built-in prompts guide complex multi-step design tasks:

| Prompt | Description |
|---|---|
| `design_strategy` | Best practices for creating Figma designs with proper hierarchy and naming |
| `read_design_strategy` | Best practices for reading and exploring Figma designs |
| `text_replacement_strategy` | Chunked, progressive approach to bulk text replacement with visual verification |
| `annotation_conversion_strategy` | Convert legacy manual annotations to Figma's native annotation system |
| `swap_overrides_instances` | Transfer component instance overrides from a source to multiple targets |
| `reaction_to_connector_strategy` | Convert prototype reaction flows into visual FigJam connector lines |

---

## Hallucination Safeguards

The plugin enforces hard constraints (scope locking, name verification, batch validation) that AI agents cannot bypass. See [AGENTS.md](./AGENTS.md) for the full rules and error codes.

---

## Best Practices

When working with Figma Edit MCP:

1. Always join a channel first with `join_channel` before sending any other commands

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
