<!-- DRAFT: prepend this entry to CHANGELOG.md, above [1.5.3]. -->

## [2.0.0]

> Major release. The tool API is redesigned with **no backwards-compatibility shims** — there were no published end-users on the prior API surface, so every tool is renamed for a cleaner long-term design. This is the one document that records the old names; all other docs use the new names only.

### Breaking changes

- **Tool API renamed to a two-level dot-notation namespace** (`group.action`) across 11 groups (`page` · `node` · `create` · `style` · `text` · `component` · `instance` · `variable` · `annotation` · `reaction` · `channel`). See the migration table below for the full old → new mapping.
- **Consolidations** (5 tools → 2):
  - `create.shape` replaces `create_rectangle` + `create_ellipse` + `create_polygon_star` (selected via a `type` discriminator; rectangles now also accept `fillColor` / `strokeColor`).
  - `node.transform` replaces `move_node` + `resize_node` (set any subset of `x` / `y` / `width` / `height`).
  - `get_node_variables` is **folded into `node.info`** — request `boundVariables` and `explicitVariableModes` as fields; the standalone tool is removed.
- **Split** (1 tool → 2): the `DELETE` action of `manage_component_property` becomes a standalone **`component.delete_property`**, so its destructive behavior is annotated separately. `component.manage_property` now handles `ADD` / `EDIT` only.
- **Prompts:** `annotation_conversion_strategy` is **removed**; `text_replacement_strategy` is removed as a prompt and its recipe is folded into the `workflows` usage reference. `reaction_to_connector_strategy` and `swap_overrides_instances` are retained, rewritten to the new tool names.

Net tool count: **48 → 45**.

### New

- **MCP resources** — the usage guide is now served over the connection under `figma-edit://guide/*` (`constraints`, `error-playbook`, `workflows`, `tool-selection`), fetched lazily so it costs nothing until needed.
- **Packaged skill** — a cross-tool `skills/figma-edit/` (`SKILL.md` + `references/`) discovered by agents that support the open `SKILL.md` standard; shipped in the npm tarball.
- **Eager `instructions` breadcrumb** — a tiny pointer delivered at connection time directing agents to the resources/skill before writes and on errors.
- **Tool annotations** — `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` on every tool.
- **Output schemas** — read tools declare an `outputSchema` and return `structuredContent` for type-checkable responses.
- **Registry & discoverability** — server icon added; the `.mcpb` `manifest.json` now declares the full `tools` array; `glama.json` added at the repo root.

### Fixed

- The server reported a hardcoded version at runtime; it now reads the real version from `package.json`.

### Migration: old → new

| Old tool | New tool |
|---|---|
| `get_pages_info` | `page.info` |
| `get_nodes_info` | `node.info` |
| `get_node_variables` | *(folded into `node.info`)* — request `boundVariables` / `explicitVariableModes` |
| `move_node` | `node.transform` |
| `resize_node` | `node.transform` |
| `set_node_name` | `node.rename` |
| `delete_multiple_nodes` | `node.delete` |
| `clone_node` | `node.clone` |
| `set_selections` | `node.select` |
| `group_nodes` | `node.group` |
| `ungroup_nodes` | `node.ungroup` |
| `flatten_node` | `node.flatten` |
| `insert_child` | `node.insert_child` |
| `set_auto_layout` | `node.set_auto_layout` |
| `set_fill_color` | `node.set_fill` |
| `set_stroke` | `node.set_stroke` |
| `set_corner_radius` | `node.set_corner_radius` |
| `set_effects` | `node.set_effects` |
| `apply_style` | `node.apply_style` |
| `set_bound_variable` | `node.bind_variable` |
| `export_node_as_image` | `node.export_visual` |
| `create_rectangle` | `create.shape` (`type: "RECTANGLE"`) |
| `create_ellipse` | `create.shape` (`type: "ELLIPSE"`) |
| `create_polygon_star` | `create.shape` (`type: "POLYGON"` / `"STAR"`) |
| `create_frame` | `create.frame` |
| `create_text` | `create.text` |
| `create_node_from_svg` | `create.svg` |
| `create_component` | `create.component` |
| `create_component_instance` | `create.instance` |
| `create_component_set` | `create.component_set` |
| `create_connections` | `create.connection` |
| `get_styles` | `style.list` |
| `manage_style` | `style.manage` |
| `set_multiple_text_contents` | `text.set_content` |
| `set_text_style` | `text.set_style` |
| `get_components` | `component.list` |
| `manage_component_property` (ADD/EDIT) | `component.manage_property` |
| `manage_component_property` (DELETE) | `component.delete_property` |
| `set_component_instance_property` | `instance.set_property` |
| `get_instance_overrides` | `instance.get_overrides` |
| `set_instance_overrides` | `instance.set_overrides` |
| `get_variables` | `variable.list` |
| `manage_variables` | `variable.manage` |
| `delete_variables` | `variable.delete` |
| `get_annotations` | `annotation.list` |
| `set_multiple_annotations` | `annotation.set` |
| `get_reactions` | `reaction.list` |
| `update_reactions` | `reaction.update` |
| `join_channel` | `channel.join` |
