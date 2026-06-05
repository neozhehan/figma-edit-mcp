# v2.0.0 — Canonical Tool Reference

> The **single authoritative list** of every tool: old name(s) → new name, the score-enhancing **description**, **title**, and behavioral **annotations** to be applied in WS3. This table is the source of truth for:
> - the **rename** ([tasks.md](./tasks.md) R3.2) and the §2.2 taxonomy in [plan.md](./plan.md),
> - the **descriptions** (R3.4), **annotations** (R3.7),
> - the **`manifest.json` `tools` array** (R4.1) — generate it to match this table verbatim,
> - the reader-facing **doc sweep** (WS6) — all surfaces use the new names + descriptions here.
>
> Parameter descriptions (R3.5) and output schemas (R3.6) are tracked separately — see [§ Output schemas & parameter descriptions](#output-schemas--parameter-descriptions). The `node.info` field set comes from [node-fields.md](./node-fields.md).

**Count:** 48 current → 44 (three consolidations: `create.shape`, `node.transform`, `get_node_variables`→`node.info`) → **45** (one destructive-split: `component.delete_property`). See [consolidation-sweep.md](./consolidation-sweep.md).

---

## Legend

**Annotation hints** (MCP `ToolAnnotations`):

| Hint | Meaning | Convention in this project |
|---|---|---|
| `readOnlyHint` | Does not modify the document. | `true` for every read (`*.list`, `*.info`, `get_*`, `node.export_visual`). |
| `destructiveHint` | May perform destructive/irreversible updates. Only meaningful when not read-only. | `true` for deletes and lossy/structural removals (`node.delete`, `variable.delete`, `component.delete_property`, `node.flatten`, `node.ungroup`). |
| `idempotentHint` | Repeating the call with the same args yields no *additional* change. | `true` for **absolute setters** (`node.set_*`, `node.rename`, `node.transform`, `text.set_*`, `reaction.update`, …) and re-deletes. `false` for **creators** (each call makes a new node) and **routers with a CREATE branch**. |
| `openWorldHint` | Interacts with an open world of external, concurrently-mutating entities. | **`true` for *every* tool** — the Figma file is a live document a human edits concurrently (state can change between your read and write; this is the premise of the name-verification constraint). Omitted from the table below since it is constant. |

`title` — human-readable display name (shown by clients). Derived from the new name; listed per tool.

**Table cells:** ✓ = `true`; blank = `false` / not applicable. Every tool also gains a verified description (below), parameter descriptions (R3.5), and an output schema (R3.6).

---

## Master table

### `page`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `page.info` | `get_pages_info` | Get Pages | List the document's pages; no args → all pages (no children), or pass `pageIds` → those pages with their top-level children. Batch ≤25 ids/call. | ✓ | | |

### `node`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `node.info` | `get_nodes_info` **+ `get_node_variables`** *(folded)* | Get Node Info | Read one or more nodes — recursive subtree traversal with `fields` selection, `filter`, and `maxDepth`. Returns only requested fields (incl. resolved `boundVariables`/`explicitVariableModes`). The workhorse read; start here before any write. | ✓ | | |
| `node.transform` | `move_node` **+** `resize_node` *(merged)* | Transform Node | Move and/or resize a node by setting absolute `x`/`y`/`width`/`height` (any subset). | | | ✓ |
| `node.rename` | `set_node_name` | Rename Node | Rename a node (sets `name` to an exact value). | | | ✓ |
| `node.delete` | `delete_multiple_nodes` | Delete Nodes | Delete one or more nodes in a single batched, per-item-validated call. No API undo. | | ✓ | ✓ |
| `node.clone` | `clone_node` | Clone Node | Duplicate an existing node, optionally at a new `x`/`y`. Produces a new node id. | | | |
| `node.select` | `set_selections` | Select Nodes | Set the canvas selection to one or more nodes and focus them in the viewport. | | | ✓ |
| `node.group` | `group_nodes` | Group Nodes | Wrap multiple nodes in a new group node. | | | |
| `node.ungroup` | `ungroup_nodes` | Ungroup Node | Dissolve a group, promoting its children to the parent. Removes the group container. | | ✓ | |
| `node.flatten` | `flatten_node` | Flatten Node | Flatten a node and its children into a single vector. Lossy — original structure is not recoverable. | | ✓ | |
| `node.insert_child` | `insert_child` | Reparent Node | Reparent a node under a new parent at an optional `index`. | | | ✓ |
| `node.set_auto_layout` | `set_auto_layout` | Set Auto Layout | Configure a frame's auto-layout (mode, padding, spacing, alignment, sizing) in one unified setter. | | | ✓ |
| `node.set_fill` | `set_fill_color` | Set Fill Color | Set a node's fill to a literal RGBA color. Use `node.apply_style` to link a shared paint style, or `node.bind_variable` to bind a color token. | | | ✓ |
| `node.set_stroke` | `set_stroke` | Set Stroke | Set a node's stroke color and weight; supports uniform or per-side weights. | | | ✓ |
| `node.set_corner_radius` | `set_corner_radius` | Set Corner Radius | Set a node's corner radius — uniform or per-corner. | | | ✓ |
| `node.set_effects` | `set_effects` | Set Effects | Set a node's effect array (shadows, blurs). Use `node.apply_style` to link a shared effect style instead. | | | ✓ |
| `node.apply_style` | `apply_style` | Apply Style | Link a node to a shared library style (paint/text/effect/grid) by `styleId`. Use the raw `node.set_*` setters for ad-hoc values not backed by a style. | | | ✓ |
| `node.bind_variable` | `set_bound_variable` | Bind Variable | Bind a variable to a node property, or set an explicit variable mode. Use instead of a literal `node.set_*` when the value should track a design token. | | | ✓ |
| `node.export_visual` | `export_node_as_image` | Export Node Image | Render a node to an image (PNG/JPG/SVG/PDF) at a given scale. Read-only; the canonical way to visually verify edits. | ✓ | | |

### `create`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `create.shape` | `create_rectangle` **+** `create_ellipse` **+** `create_polygon_star` *(merged)* | Create Shape | Create a rectangle, ellipse, polygon, or star via `type`, with position/size and optional `fillColor`/`strokeColor`. Shape-specific params (`arcData`; `pointCount`/`innerRadius`) validated by `type`. | | | |
| `create.frame` | `create_frame` | Create Frame | Create a frame (container) with optional fill/stroke and full auto-layout configuration. | | | |
| `create.text` | `create_text` | Create Text | Create a text node with content and optional font size/weight/color. | | | |
| `create.svg` | `create_node_from_svg` | Create Node from SVG | Create a node from an SVG markup string. | | | |
| `create.component` | `create_component` | Create Component | Convert an existing frame into a main component. | | | |
| `create.instance` | `create_component_instance` | Create Instance | Instantiate a component (by `componentKey` or `componentId`) at a position. | | | |
| `create.component_set` | `create_component_set` | Create Component Set | Combine components into a component set (variants) with property definitions. | | | |
| `create.connection` | `create_connections` | Create Connections | Create connector lines between nodes, or set/check the default connector template. Pass `connectorId` to set a default, `connections` to draw lines, or nothing to check the current default. | | | |

### `style`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `style.list` | `get_styles` | List Styles | List all local styles (paint/text/effect/grid) in the document. | ✓ | | |
| `style.manage` | `manage_style` | Manage Style | Create a named style (paint/text/effect/grid), or update an existing one when `styleId` is given. | | | |

### `text`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `text.set_content` | `set_multiple_text_contents` | Set Text Contents | Set the text of one or more text nodes in a single batched, per-item-validated call. | | | ✓ |
| `text.set_style` | `set_text_style` | Set Text Style | Set any combination of typography properties (font, size, weight, spacing, decoration, …) on a text node. | | | ✓ |

### `component`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `component.list` | `get_components` | List Components | List components in the document, with filtering and scope options. | ✓ | | |
| `component.manage_property` | `manage_component_property` *(ADD/EDIT)* | Manage Component Property | Add or edit a component-property definition (BOOLEAN/TEXT/INSTANCE_SWAP) on a main component or variant set. Deleting is `component.delete_property`. | | | |
| `component.delete_property` | `manage_component_property` *(DELETE)* | Delete Component Property | Remove a component-property definition from a main component or variant set; propagates to every instance. | | ✓ | ✓ |

### `instance`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `instance.set_property` | `set_component_instance_property` | Set Instance Property | Set one property on an instance — boolean toggle, text override, instance swap, or variant selection. | | | ✓ |
| `instance.get_overrides` | `get_instance_overrides` | Get Instance Overrides | Read the override properties from a source instance, to later apply them to other instances. | ✓ | | |
| `instance.set_overrides` | `set_instance_overrides` | Set Instance Overrides | Apply previously-read overrides to target instances; targets are swapped to the source component and all overrides applied. | | | ✓ |

### `variable`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `variable.list` | `get_variables` | List Variables | List local variables/collections, or detailed info for specific variable ids; optionally scan for consumers. | ✓ | | |
| `variable.manage` | `manage_variables` | Manage Variables | Create collections and variables and set their values/aliases (create/update router). | | | |
| `variable.delete` | `delete_variables` | Delete Variables | Delete specific variables or an entire collection. Runs a full-document consumer check first and rejects the whole operation if any target is still in use. | | ✓ | ✓ |

### `annotation`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `annotation.list` | `get_annotations` | List Annotations | Read the native annotations on a node (and subtree); optionally include the file's annotation categories. | ✓ | | |
| `annotation.set` | `set_multiple_annotations` | Set Annotations | Create or update native annotations on one or more nodes in a batched call (per item: `annotationId` present = update, absent = create). | | | ✓ |

### `reaction`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `reaction.list` | `get_reactions` | List Reactions | Read prototype reactions from one or more nodes. Process the output with the `reaction_to_connector_strategy` prompt to build `create.connection` parameters. | ✓ | | |
| `reaction.update` | `update_reactions` | Update Reactions | Replace a node's prototype reactions with a full new reactions array (read first via `reaction.list`). | | | ✓ |

### `channel`
| New name | Old name(s) | Title | Description | RO | Dst | Idm |
|---|---|---|---|:--:|:--:|:--:|
| `channel.join` | `join_channel` | Join Channel | Join a plugin channel to establish the live connection to the Figma document. | | | ✓ |

---

## Annotation rationale (borderline calls)

- **`node.delete` / `variable.delete` — `destructive` ✓ *and* `idempotent` ✓.** Deletion is destructive; a repeat call on an already-gone target adds no further change, so it is also idempotent.
- **`node.ungroup` / `node.flatten` — `destructive` ✓.** Neither removes "data" in the delete sense, but both **irreversibly remove structure** (ungroup destroys the group container; flatten collapses a subtree into one vector). Flagged destructive so clients warn appropriately.
- **`component.delete_property` split from `component.manage_property`.** Mirrors `variable.delete` vs `variable.manage` (rule 4): isolating `DELETE` keeps `manage_property` (ADD/EDIT) non-destructive and scopes `destructiveHint: true` to the delete alone, instead of over-warning on ADD/EDIT.
- **Routers with a CREATE branch (`style.manage`, `variable.manage`, `create.connection`) — `idempotent` blank.** They can create new objects, so repeats are not no-ops. `create.connection`'s no-arg "check default" path is read-only, but the tool as a whole writes, so it is not marked `readOnlyHint`.
- **`node.select` / `channel.join` — not `readOnlyHint`.** Neither edits document *content*, but both change session/editor state (selection; channel connection), so they are writes with `idempotent` ✓.
- **Creators (`create.*`, `node.clone`, `node.group`) — all hints blank.** Each call produces a new node, so they are neither read-only, destructive, nor idempotent.

---

## Output schemas & parameter descriptions

Tracked separately from this table (they are not expressible in the `.mcpb` manifest `tools` array — see R4.3):

- **Parameter descriptions (R3.5):** every input param across all 45 tools gets a `.describe(...)`. Audit during the rename.
- **Output schemas (R3.6):** migrate to `registerTool({ …, outputSchema })` + `structuredContent`. Priority-1 (high-value reads): `node.info`, `page.info`, `style.list`, `component.list`, `variable.list`; then extend to writes. `node.info`'s returnable field set + fast/slow flags come from [node-fields.md](./node-fields.md) (generated from `@figma/plugin-typings`).

---

## Counts

| | Tools |
|---|---|
| Current | 48 |
| − `create_ellipse`, `create_polygon_star` folded into `create.shape` | −2 |
| − `resize_node` folded into `node.transform` | −1 |
| − `get_node_variables` folded into `node.info` | −1 |
| + `component.delete_property` split from `component.manage_property` | +1 |
| **v2.0.0 total** | **45** |

(11 groups: `page` 1 · `node` 18 · `create` 8 · `style` 2 · `text` 2 · `component` 3 · `instance` 3 · `variable` 3 · `annotation` 2 · `reaction` 2 · `channel` 1.)
