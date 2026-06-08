---
name: figma-edit
description: >-
  Use when reading or editing a Figma file through the figma-edit-mcp server —
  inspecting nodes; creating or modifying shapes, frames, text, styles,
  variables, components, instances, annotations, or prototype reactions; and
  recovering from the server's structured errors. Explains the plugin's hard
  constraints (scope locking, name verification, batch validation) and how to
  pick the right tool.
---

# figma-edit

figma-edit-mcp lets an agent read and edit a live Figma document through a plugin that **enforces** safety constraints at execution time. Two things to internalize before acting:

1. **Discover before acting.** Every workflow that touches a node starts with a read (`page.info` → `node.info`). IDs and names the user gives you may be stale; verify them.
2. **The plugin can refuse you.** Hard constraints (scope, name verification, per-item batch checks) are checked inside Figma and return structured error codes. You cannot bypass them — plan calls to comply up front.

## References

Load the one you need:

- **[references/constraints.md](references/constraints.md)** — the hard rules the plugin enforces (scope locking, name verification, no implicit selection, batch validation, URL IDs) and what to do when a constraint forbids the request.
- **[references/error-playbook.md](references/error-playbook.md)** — every structured error code and its correct recovery.
- **[references/workflows.md](references/workflows.md)** — the discover-before-acting pattern and canonical recipes (find-and-update text, create-in-frame, edit-by-URL, bulk text replacement).
- **[references/tool-selection.md](references/tool-selection.md)** — choosing among overlapping tools, `node.info` field selection (fast vs slow), batch vs single, and streaming progress.

The same content is available over the MCP connection as resources under `figma-edit://guide/*`.
