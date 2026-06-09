# Tool selection

Heuristics for picking the right tool when several overlap.

## `node_info` — the workhorse read

`node_info` is the one read tool for node data (it subsumes the old separate scan tools and the per-node variable read). Use its parameters to scope the read tightly:

- **`nodeIds: string[]`** — the roots of the traversal. If empty, defaults to the editable scope root ID.
- **`fields: string[]`** — return only these properties. Omitted properties are absent from the response (not `null`). Use aggressively to keep responses small. Common: `name`, `type`, `characters`, `fills`, `width`, `height`. The full field list (generated from `@figma/plugin-typings`, with types) is in the **`figma-edit://guide/node-fields`** resource.
- **`filter: { type: string | string[] }`** — prune the traversal tree. Only matching nodes (and their ancestors back to the root) are retained. Use for "all text nodes" / "all components" in a subtree.
- **`maxDepth: number`** — cap recursion. `maxDepth: 1` = immediate children; `maxDepth: 0` = the root nodes themselves.

| Goal | Call |
|---|---|
| All text in a frame | `node_info({ nodeIds: [frameId], filter: { type: "TEXT" }, fields: ["characters", "name"] })` |
| Immediate children of a node | `node_info({ nodeIds: [id], maxDepth: 1, fields: ["name", "type"] })` |
| All components in a page | `node_info({ nodeIds: [pageId], filter: { type: ["COMPONENT", "COMPONENT_SET"] }, fields: ["name"] })` |
| Full info on one known node | `node_info({ nodeIds: [id], maxDepth: 0 })` |
| Variables bound to a node | `node_info({ nodeIds: [id], fields: ["boundVariables", "explicitVariableModes"] })` |

The response includes `descendantCount` on top-level and boundary nodes — use it to gauge whether a deeper traversal is feasible before requesting it.

### Choosing fields: fast vs slow

Most fields are plain synchronous reads (**fast**) — request them freely. A few require async resolution or computed geometry (**slow**) and add latency; request them only when needed:

- **Slow:** `mainComponent`, `instances`, `vectorNetwork` / `vectorPaths`, `fillGeometry` / `strokeGeometry`, `absoluteRenderBounds`, and the **resolved names** of style/variable references.
- **The crux — raw vs resolved:** an ID is fast; the human-readable **name** behind it is slow. `fillStyleId`, `boundVariables`, `explicitVariableModes` return raw IDs cheaply; asking for the resolved style/variable/collection/mode names is the slow part.

When you only need to know *whether* something is bound, request the raw ID field. Ask for resolved names only when you'll show them to the user.

## Listings and Discovery Tools

* **`component_list`**: Defaults to a `scope` of `'document'`. If `scope` is set to `'page'`, a valid `pageId` (resolving to a `PAGE` type) **must** be provided.
* **`variable_list`**: The `includeConsumers` parameter is optional (defaults to no scan). It accepts `'page'` (requires `pageId` of a valid `PAGE` node) or `'document'`.
* **`annotation_list`**: Requires **exactly one** of `pageId` or `nodeId` (throws an error if neither or both are provided). If `pageId` is specified, it must resolve to a `PAGE` node.

## Disambiguating overlapping writes

| Want to… | Use | Not |
|---|---|---|
| Set an ad-hoc color | `node_set_fill` (literal RGBA) | `node_apply_style` (that links a shared paint style) |
| Make a value track a design token | `node_bind_variable` | `node_set_fill` (a literal won't update with the token) |
| Reuse a library style | `node_apply_style` (by `styleId`) | the raw `node_set_*` setters |
| Move and/or size a node | `node_transform` ({x?, y?, width?, height?}) | — |
| Create any basic shape | `create_shape` ({type, …}) | — |

## Batch vs single-item

Use a **batch** tool (`text_set_content`, `node_delete`, `annotation_set`, `instance_set_overrides`) when:

- You have more than 2–3 items of the same operation.
- The operations are independent of each other's results.
- Batch atomicity and pre-validation are desired (all targets are checked for existence, scope, name, and node-type before any write starts).

Use a **single-item** path when you have one item, later operations depend on earlier results, or you want per-item failure isolation.

## Streaming progress

Tools that may run long (`node_info` at high depth, `page_info` on large files) emit `progress_update` events. Treat them as informational — they prevent timeouts and signal the call is still working. Wait for the actual response; do not treat a progress event as completion.
