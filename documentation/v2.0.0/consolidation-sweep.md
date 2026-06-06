# v2.0.0 — Tool Consolidation Sweep

> A tool-by-tool evaluation of every one of the 48 tools for consolidation, grounded in the actual parameter signatures. For the release plan see [plan.md](./plan.md); for the rename taxonomy see [plan.md §2.2](./plan.md).

## Methodology

Each tool is classified **Merge**, **Keep**, or **Already-consolidated**, using these rules (established earlier in the project):

1. **Converge → Merge.** If tools share a parameter shape and concept, merge them (optionally via a discriminated `type`/`action`).
2. **Diverge → Keep + disambiguate.** If concepts overlap but parameters diverge richly, keep separate; clarify with descriptions.
3. **Never merge get/set pairs.** Reads and writes stay split so `readOnlyHint` vs write annotations are clean.
4. **Never merge destructive into non-destructive.** Keep deletes separate so `destructiveHint: true` is scoped correctly.
5. **Respect the design philosophy.** This project favors explicit, individually-validated tools over a single free-form mutator. Do **not** create a universal `node.set({...})` mega-tool — it conflicts with per-property validation and annotation clarity.

## Summary verdict

> [!IMPORTANT]
> **The codebase is already well-consolidated.** It uses action-routers (`manage_variables`, `manage_component_property`, `create_connections`), batch tools (`*_multiple_*`), and unified setters (`set_auto_layout`, `set_text_style`). The only clear redundancy at sweep time was the **shape family** (a `get_node_variables` → `node.info` fold surfaced later — see C5).
>
> - **Strong merge:** shapes (3 → 1) → **−2 tools**.
> - **Judgment-call merges:** `move`+`resize` (−1); `delete_variables`→`manage` (−1, **not done**).
> - **Final (decided):** shapes + `move`/`resize` + a post-sweep `get_node_variables`→`node.info` fold → **48 → 44**; plus splitting the destructive `DELETE` out of `manage_component_property` (→ `component.delete_property`, see C6) → **45**; plus a net-new `style.delete` (completes the style lifecycle — an addition, not a consolidation) → **46**.
>
> Aggressive merging beyond this fights the explicit-validation design and won't materially move Glama's "tool count" sub-score — 48 tools is largely inherent to Figma's API surface. **The dot-notation tree + annotations do more for the scores than merging does.**

---

## Per-tool sweep

### create / shapes
| Tool | Key params | Verdict |
|---|---|---|
| `create_rectangle` | x,y,w,h,name?,parent?,absPos? **(no fill/stroke)** | **MERGE → `create.shape`** |
| `create_ellipse` | …+ `arcData`, fillColor, strokeColor | **MERGE → `create.shape`** |
| `create_polygon_star` | …+ `pointCount`, `innerRadius`, fill, stroke | **MERGE → `create.shape`** |
| `create_frame` | x,y,w,h + fill/stroke/strokeWeight + 13 auto-layout params; acts as container | **KEEP** — structurally different (container + full layout) |
| `create_text` | x,y,**text**,fontSize?,fontWeight?,fontColor? | **KEEP** — text/font params diverge |
| `create_node_from_svg` | **svg** string, name?, parent?, x?, y? | **KEEP** — distinct input |

### document / reads
| Tool | Key params | Verdict |
|---|---|---|
| `get_pages_info` | pageIds? | **KEEP** — page-scope read |
| `get_nodes_info` | nodeIds?, fields?, filter?, maxDepth? | **KEEP** — the workhorse read |
| `join_channel` | channel | **KEEP** — connection bootstrap |

### nodes / modification
| Tool | Key params | Verdict |
|---|---|---|
| `move_node` | nodeId,nodeName,**x,y** | **MERGE? → `node.transform`** (with resize) |
| `resize_node` | nodeId,nodeName,**w,h** | **MERGE? → `node.transform`** |
| `set_node_name` | …,**name** | **KEEP** — distinct property |
| `clone_node` | …,x?,y? | **KEEP** — produces a new node |
| `delete_multiple_nodes` | nodes[] | **KEEP** — destructive; batch |
| `set_selections` | nodeIds[] | **KEEP** — viewport/selection |
| `group_nodes` | nodes[],name? | **KEEP** — params diverge from ungroup |
| `ungroup_nodes` | nodeId,nodeName | **KEEP** — distinct verb |
| `flatten_node` | nodeId,nodeName | **KEEP** |
| `insert_child` | parentId,childId,index? | **KEEP** |
| `export_node_as_image` | nodeId,format?,scale? | **KEEP** |

### styling — direct node setters (group under `node.*`)
| Tool | Key params | Verdict |
|---|---|---|
| `set_fill_color` | r,g,b,a? | **KEEP** — group as `node.set_fill` |
| `set_stroke` | r,g,b,a?,weight?,side-weights | **KEEP** — rich distinct params |
| `set_corner_radius` | radius,corners? | **KEEP** |
| `set_effects` | effects[] | **KEEP** |

> Rejected: a `node.set({fill?,stroke?,radius?,effects?})` mega-setter — each sub-shape is rich and distinct; merging muddies annotations and validation. Group via dot-notation instead.

### styles — Style objects (`style.*`)
| Tool | Key params | Verdict |
|---|---|---|
| `get_styles` | — | **KEEP** (read) |
| `manage_style` | type,name,propertiesJson?,styleId?,bindVariables? | **ALREADY-CONSOLIDATED** (create+update router) |
| `apply_style` | nodeId,styleId,styleType | **KEEP** — links node→style (write) |
| *(net-new)* `style.delete` | styleId, styleName | **ADD** — no style-deletion path existed; completes the `style.*` lifecycle (destructive, safe detach — no consumer check). See critique §2.2 |

### text
| Tool | Key params | Verdict |
|---|---|---|
| `set_multiple_text_contents` | nodeId, text[] | **KEEP** — batch write |
| `set_text_style` | 10 optional typography props | **ALREADY-CONSOLIDATED** (unified setter) |

### layout
| Tool | Key params | Verdict |
|---|---|---|
| `set_auto_layout` | 14 layout props | **ALREADY-CONSOLIDATED** ("replaces individual layout tools") |

### components
| Tool | Key params | Verdict |
|---|---|---|
| `get_components` | filter?,scope? | **KEEP** (read) |
| `create_component` | nodeId | **KEEP** → `create.component` |
| `create_component_instance` | componentKey?\|componentId?,x,y,parent? | **KEEP** → `create.instance` |
| `create_component_set` | components[],properties[] | **KEEP** → `create.component_set` |
| `get_instance_overrides` | nodeId? | **KEEP** — get half of pair |
| `set_instance_overrides` | sourceInstanceId,targetNodes[] | **KEEP** — set half of pair |
| `set_component_instance_property` | propertyName,value | **KEEP** — operates on an instance |
| `manage_component_property` | action ADD/EDIT/DELETE,… | **SPLIT** — keep ADD/EDIT as `component.manage_property`; split `DELETE` → `component.delete_property` (rule 4; mirrors `variable.delete`). See C6 |

### variables
| Tool | Key params | Verdict |
|---|---|---|
| `get_variables` | variableId?[],includeConsumers? | **KEEP** — doc/by-id read |
| `get_node_variables` | nodeId | **FOLD → `node.info`** — expose `boundVariables` + `explicitVariableModes` as resolvable fields (plugin resolves them like `mainComponent`); drop the tool |
| `set_bound_variable` | field?,variableId?,collectionId?,modeId? | **KEEP** — bind/unbind + set mode |
| `manage_variables` | action CREATE_COLLECTION/CREATE_VARIABLE/UPDATE_VARIABLE | **ALREADY-CONSOLIDATED** (router) |
| `delete_variables` | variableIds?[]\|collectionId? (consumer-check) | **KEEP (recommended)** — destructive; see note |

### annotations
| Tool | Key params | Verdict |
|---|---|---|
| `get_annotations` | nodeId,includeCategories? | **KEEP** (read) |
| `set_multiple_annotations` | nodeId,annotations[] | **KEEP** (batch write) |

### prototyping
| Tool | Key params | Verdict |
|---|---|---|
| `get_reactions` | nodeIds[] | **KEEP** — get half of pair |
| `update_reactions` | nodeId,reactions[] | **KEEP** — set half of pair |
| `create_connections` | connectorId?,connections?[] | **ALREADY-CONSOLIDATED** (set-default / create / check router) |

---

## Recommended merge (strong)

### `create.shape` ← `create_rectangle` + `create_ellipse` + `create_polygon_star`

```
create.shape({
  type: "RECTANGLE" | "ELLIPSE" | "POLYGON" | "STAR",
  x, y, width, height,
  name?, parentId?, parentNodeName?, useAbsolutePosition?,
  fillColor?, strokeColor?,                 // now consistent across ALL shapes
  arcData?,                                 // ELLIPSE only
  pointCount?, innerRadius?,                // POLYGON / STAR only
})
```

- **Why:** identical base; shape-specific params are few and optional.
- **Bonus fix:** `create_rectangle` currently lacks `fillColor`/`strokeColor` while ellipse/star have them — the merge removes that inconsistency.
- **Validation:** reject `arcData` unless `type==="ELLIPSE"`; require `pointCount` for `POLYGON`/`STAR`.

---

## Judgment-call merges (need a decision)

### M1 — `node.transform` ← `move_node` + `resize_node`
```
node.transform({ nodeId, nodeName, x?, y?, width?, height? })
```
- **For:** params converge (node + numeric geometry); one obvious "place/size this node" tool.
- **Against:** loses two clear, simple verbs; a no-op if all geometry omitted.
- **Recommendation:** **optional** — take it only if we prefer fewer tools over verb explicitness.

### M2 — fold `delete_variables` into `variable.manage` (as `DELETE_*` actions)
- **For:** `manage_variables` is already an action-router; −1 tool.
- **Against:** `delete_variables` is **destructive** with a full-document consumer-safety check; folding it mixes destructive + non-destructive behind one tool, so `destructiveHint` can't be scoped cleanly (violates rule 4).
- **Recommendation:** **do NOT merge** — keep `variable.delete` separate for a clean destructive annotation + safety clarity.

---

## Considered but rejected

| Idea | Why rejected |
|---|---|
| Fold `create_frame`/`create_text`/`create_node_from_svg` into `create.shape` | Structurally different (container + 13 layout params / text+font / SVG string) |
| `node.set({fill?,stroke?,radius?,effects?})` mega-setter | Rich divergent sub-shapes; muddies validation + annotations |
| Universal `node.set({...})` mutator (Figma `node.set` style) | Conflicts with the explicit per-property validation design philosophy |
| Merge `group`/`ungroup`, all get/set pairs, `variable.list`/`of_node` | Divergent params and/or read-vs-write; rules 2–3 |

---

## Net effect & recommendation

| Scenario | Count | Δ |
|---|---|---|
| Current | 48 | — |
| Shapes merge only (recommended) | 46 | −2 |
| + M1 (`node.transform`) | 45 | −3 |
| + M1 + M2 | 44 | −4 |
| **Decided** (shapes + M1 + C5 fold) | 44 | net −4 |
| **+ C6 split** (`component.delete_property`) | 45 | +1 |
| **+ `style.delete`** (net-new addition, critique §2.2) | **46** | +1 |

**Recommendation:** take the **shape merge** (clear win + fixes an inconsistency); treat **M1 as optional**; **reject M2**. Land at **46** (or **45** with M1).

**Honest conclusion:** consolidation is a minor lever here — the codebase is already consolidated, and Figma's surface inherently needs ~45+ tools. The **dot-notation taxonomy, annotations, descriptions, and output schemas** are where the quality-score gains actually come from. Consolidation should be done for *correctness/clarity* (the shape merge), not to chase a lower count.

---

## Open decisions

| # | Decision | Recommendation | **DECIDED** |
|---|---|---|---|
| C1 | Take the `create.shape` merge? | Yes | ✅ **Yes** |
| C2 | M1 — merge `move`+`resize` → `node.transform`? | Optional | ✅ **Yes** |
| C3 | M2 — fold `delete_variables` into `variable.manage`? | No | ✅ **Yes — No fold, keep `variable.delete`** |
| C4 | Any other merges (at sweep time)? | None | ✅ None found in sweep |
| C5 | Fold `get_node_variables` into `node.info` fields? (found post-sweep: `extractProperties` already does per-field async resolution, e.g. `mainComponent`) | Fold | ✅ **Yes — fold** |
| C6 | Split destructive `DELETE` out of `manage_component_property`? (parallels C3 / `variable.delete`; isolates `destructiveHint` to the delete) | Split | ✅ **Yes — split → `component.delete_property`** |

**Outcome:** shapes merge + transform merge + `get_node_variables`→`node.info` fold → 48 → 44; + `component.delete_property` split (C6) → 45; + net-new `style.delete` (addition, critique §2.2) → **46 tools**.
