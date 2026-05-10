# `get_nodes_info` Response Shape Update

## Overview

> **⚠️ Heads-up: back-to-back connect-payload break.** v1.4.0 modifies the connect payload's `node` block — a contract that v1.3.0 only just shipped. Any client that integrated against v1.3.0's `parentNodeId` / `parentNodeName` / `parentNodeType` / `containingPageId` / `containingPageName` fields between v1.3.0's release and this one MUST update to read the new `path` array instead. There is no compatibility shim, no alias, and no deprecation period — the v1.3.0 fields are removed in this release. Test fixtures pinned to the v1.3.0 shape will fail; release notes MUST call this out explicitly so integrators discover the break before deploying. See "Breaking changes summary" for the full list of removed fields and recommended migration paths.

This release aligns the `get_nodes_info` response shape with the Change 1 Node-scope `node` block defined in [v1.3.0 read tools update](../v1.3.0%20-%20read_tools_update/read_tools_update.md). v1.3.0 deferred this work explicitly under "Out of scope (follow-up)" so the connect-flow rewrite could ship without expanding the breaking-change surface; v1.4.0 closes that loop — and in doing so, breaks the connect-payload `node` block a second time in two releases. This was a deliberate trade-off (consolidating both shape revisions into a single migration window for clients) but is the most disruptive aspect of v1.4.0 for anyone who already migrated to v1.3.0.

After this release, the editable-scope node returned by the connect payload (`editableScopeType: "node"`) and the per-node objects returned by `get_nodes_info` use the same field names and the same ancestor-path metadata. They differ on `children` depth by design: the connect payload continues to surface direct children only (to keep connect cheap and bounded for large editable scopes), while `get_nodes_info` returns the **full recursive subtree** under each requested id (clients explicitly named the ids, so paying the subtree walk is acceptable). Both surfaces include a **`descendantCount`** field — the total recursive descendant count for the editable scope — so the LLM can gauge the scope's size at connect time and predict `get_nodes_info` response costs before issuing calls. The count walk is synchronous, reads only `node.children` recursively (no `exportAsync`, no property reads), and completes in <1ms on a 10k-node page; it adds no new loading requirements since the scope is already loaded at connect time. `descendantCount` is present on both page-scope and node-scope connect payloads; it is omitted in read-only mode (pages are not loaded). Clients refreshing the editable scope mid-session via `get_nodes_info()` with empty args should expect the recursive shape, not the connect-payload shape — see "Empty-args behavior" for the cost implications when the editable scope is a `PAGE`.

v1.4.0 also introduces a `path` array that replaces the v1.3.0 `parentNodeId` / `parentNodeName` / `parentNodeType` / `containingPageId` / `containingPageName` fields with a single, more informative representation. The `path` encodes the **full ancestor chain** from the containing page down to the immediate parent — giving the LLM complete structural context in fewer tokens. This is a breaking change to **both** the connect payload's `node` block and the `get_nodes_info` per-node shape.

In addition to the `get_nodes_info` shape work, v1.4.0 extends the v1.3.0 "Loading & performance" rule set to two more read tools: **`get_components`** (closes the canonical follow-up filed in v1.3.0's "Out of scope") and **`get_variables`** (the only other read-tool code path that walks pages sequentially without progress emission). These are not response-shape changes — only loading and streaming behavior — so they ride alongside `get_nodes_info` in this release without expanding the breaking-change surface for clients. See "Loading & performance" below.

v1.4.0 also **removes** two tools entirely: **`scan_text_nodes`** and **`scan_nodes_by_types`**. Both are fully superseded by `get_nodes_info` with `filter` and `properties`. See "Tool removals" below.

## Motivation

The v1.3.0 connect-flow change introduced a structured `node` block keyed on `nodeId` / `nodeName` / `parentNodeId` / `containingPageId` etc. It also fixed `children` to top-level-only on the connect payload to avoid unbounded recursion. `get_nodes_info` retained its legacy shape — a thin envelope around Figma's `JSON_REST_V1` export — for two reasons:

Additionally, the v1.3.0 `node` block used five separate fields (`parentNodeId`, `parentNodeName`, `parentNodeType`, `containingPageId`, `containingPageName`) to convey ancestry. This is token-heavy and only exposes the immediate parent plus the containing page — intermediate ancestors are lost. v1.4.0 replaces all five with a single `path` array that encodes the full ancestor chain.

1. The export-based shape carries arbitrary Figma node properties (fills, strokes, layoutMode, characters, etc.) that the LLM relies on for design reasoning. v1.3.0 didn't want to redesign that surface under time pressure.
2. Clients that depend on recursive `document.children` walks would have broken.

Both concerns are addressable. v1.4.0 addresses (1) by replacing the export envelope with a flat metadata block plus an optional `properties` sub-object; it addresses (2) by **preserving the recursive `children` traversal** with each descendant entry shaped as `{ id, name, type, children }` — and, when `properties` is non-empty, also carrying its own `properties` sub-object. Callers who want a cheap structural walk pass no `properties` and pay no per-descendant `exportAsync` cost; callers who want property data across a subtree pass `properties` (typically combined with `filter` to bound which descendants are exported) and get one-shot results without follow-up calls.

## Tool removals

v1.4.0 removes two MCP tools that are fully superseded by the enhanced `get_nodes_info`:

### `scan_text_nodes` — REMOVED

**What it did**: scanned all text nodes under a given `nodeId`, returning a flat list of text entries with `id`, `name`, `characters`, font metadata, and bounding box. Registered at [text.ts:281](../../src/mcp_server/tools/text.ts#L281); plugin handler at [textHandlers.ts:35](../../src/figma_plugin/handlers/textHandlers.ts#L35); dispatch at [main.ts:498](../../src/figma_plugin/src/main.ts#L498).

**Why it's removed**: `get_nodes_info({ filter: { type: "TEXT" }, properties: ["characters", "style"] })` returns the same data with more context — full ancestor `path`, recursive structural context, and the ability to combine with other filters or properties. The scan tool's flat-list output drops structural context that the LLM needs for multi-level text replacement workflows.

**Migration path**:
| `scan_text_nodes` call | `get_nodes_info` equivalent |
|---|---|
| `scan_text_nodes({ nodeId: "X" })` | `get_nodes_info({ nodeIds: ["X"], filter: { type: "TEXT" }, properties: ["characters"] })` |
| Full text scan with style | `get_nodes_info({ nodeIds: ["X"], filter: { type: "TEXT" }, properties: ["characters", "style"] })` |

### `scan_nodes_by_types` — REMOVED

**What it did**: scanned all child nodes under a given `nodeId` matching one or more Figma node types, returning a flat list with `id`, `name`, `type`, and bounding box. Registered at [document.ts:87](../../src/mcp_server/tools/document.ts#L87); plugin handler at [annotationHandlers.ts:141](../../src/figma_plugin/handlers/annotationHandlers.ts#L141); dispatch at [main.ts:502](../../src/figma_plugin/src/main.ts#L502).

**Why it's removed**: `get_nodes_info({ filter: { type: ["COMPONENT", "INSTANCE", "FRAME"] } })` provides the same type-filtered scan with `type` array OR-matching (added in v1.4.0), plus recursive structural context, `descendantCount`, and the ability to combine with `properties` for one-shot property extraction. The scan tool's flat output was the primary motivation for adding `type` array support to `filter`.

**Migration path**:
| `scan_nodes_by_types` call | `get_nodes_info` equivalent |
|---|---|
| `scan_nodes_by_types({ nodeId: "X", types: ["COMPONENT", "FRAME"] })` | `get_nodes_info({ nodeIds: ["X"], filter: { type: ["COMPONENT", "FRAME"] } })` |
| Type scan with properties | `get_nodes_info({ nodeIds: ["X"], filter: { type: ["COMPONENT", "FRAME"] }, properties: ["absoluteBoundingBox"] })` |

### Internal dependencies on removed tools

Both removed tools are referenced in **prompt strings** that must be updated:

1. **`text_replacement_strategy` prompt** ([text.ts:361-492](../../src/mcp_server/tools/text.ts#L361)): references `scan_text_nodes(nodeId: "node-id")` in the strategy's Step 1 code block. Replace with `get_nodes_info({ nodeIds: ["node-id"], filter: { type: "TEXT" }, properties: ["characters"] })`.
2. **`annotation_conversion_strategy` prompt** ([annotations.ts:186-342](../../src/mcp_server/tools/annotations.ts#L186)): references both `scan_text_nodes` (line 232) and `scan_nodes_by_types` (line 256) in Steps 2 and 3. Replace with the `get_nodes_info` equivalents from the migration tables above.

These are **prompt-only** changes — no tool logic depends on the scan tools internally (they're independent MCP tool registrations). The prompts are guidance text shown to the LLM; updating them prevents the LLM from trying to call tools that no longer exist.

## Removed fields (breaking changes)

| Removed field | Previously returned by | Reason for removal |
|---|---|---|
| `parentId` (per node) | `getNodesInfo` ([src/figma_plugin/handlers/nodeReaders.ts:151](../../src/figma_plugin/handlers/nodeReaders.ts#L151)) | Replaced by `path` array. The v1.3.0 spec introduced `parentNodeId` as the canonical name; v1.4.0 goes further and encodes the full ancestor chain (containing page → intermediate ancestors → immediate parent) in `path`, eliminating `parentId`, `parentNodeId`, `parentNodeName`, `parentNodeType`, `containingPageId`, and `containingPageName` in one pass. |
| `document` (per node, the filtered JSON_REST_V1 export) | `getNodesInfo` | Replaced by a flat metadata block plus an optional `properties` sub-object (see below). The export-based shape leaks Figma's REST schema into our wire format and forces clients to double-walk the tree (once via the export's recursive `children`, once via our own field set). It also conflates "node identity" with "node properties," which is what made `parentId` exist alongside `document.parent` ambiguous in the first place. |
| Per-descendant property data inside `document.children` (v1.3.0 export envelope: fills, strokes, layoutMode, characters, etc.) | `getNodesInfo` | The recursive structure is **preserved** — `children` continues to encode the full subtree — but each descendant entry is reshaped to `{ id, name, type, children }` plus an optional `properties` sub-object. When `properties` is empty/omitted, descendants stay structural and the recursion is cheap. When `properties` is non-empty, descendants carry a `properties` block with the requested property data, so a single call can fetch it across the subtree without follow-ups. Combine with `filter` to bound which descendants are exported (see "Filtering"). |

When `get_nodes_info({ nodeIds: [...], properties: [...], filter: { ... }, maxDepth: N })` is called, the response returns the requested nodes with their recursive subtree in `children` (bounded by `maxDepth` when provided, otherwise the full subtree), optionally filtered, and — when `properties` is non-empty — with `properties` attached to **every node in the response tree** (the requested top-level entries and every included descendant in `children`).

### Per-node entry, without `properties`

When `get_nodes_info` is called without a `properties` array (or with `properties: []`) and no `filter`, each entry in the response array uses this shape:

```json
{
  "nodeId": "string (The unique ID of the node)",
  "nodeName": "string (The user-facing name of the node)",
  "type": "string (The node type, e.g., 'FRAME', 'COMPONENT', 'GROUP', 'PAGE')",
  "descendantCount": "number (Total recursive descendant count for this node's subtree)",

  "path": [
    ["TYPE", "ID", "Name (Each element is a 3-tuple [type, id, name] encoding one ancestor, ordered from containing page down to immediate parent)"]
  ],

  "children": [
    {
      "id": "string (The ID of the child node)",
      "name": "string (The name of the child node)",
      "type": "string (The node type, e.g., 'FRAME', 'COMPONENT', 'GROUP')",
      "children": [
        {
          "id": "...",
          "name": "...",
          "type": "...",
          "children": [ "...recursive..." ]
        }
      ]
    }
  ]
}
```

Example for a node nested as `Page "Home" > Frame "Section" > Frame "Card" > [this node]` with a small subtree of its own:

```json
{
  "nodeId": "437:96",
  "nodeName": "Button",
  "type": "INSTANCE",
  "descendantCount": 2,
  "path": [
    ["PAGE",  "0:1",    "Home"],
    ["FRAME", "100:1",  "Section"],
    ["FRAME", "210:12", "Card"]
  ],
  "children": [
    {
      "id": "437:97",
      "name": "Icon",
      "type": "VECTOR",
      "children": []
    },
    {
      "id": "437:98",
      "name": "Label",
      "type": "TEXT",
      "children": []
    }
  ]
}
```

Notes:
- **`path`** is an array of 3-tuples. Each element is `[type, id, name]` — a positional triplet encoding one ancestor, in that exact order. The first element is always the containing page; the last element is the immediate parent. The node itself is NOT included in `path`.
- **Positional convention**: `path[i][0]` is the type (Figma node type enum, e.g. `"FRAME"`), `path[i][1]` is the id (e.g. `"100:1"`), `path[i][2]` is the name (any string, no escaping concerns since JSON quoting handles it). The triplet is positional rather than keyed to save tokens — at the cost of clients needing to know the index convention.
- **Containing page**: always `path[0]`. Derive `containingPageId` as `path[0][1]`, `containingPageName` as `path[0][2]`.
- **Immediate parent**: always `path[path.length - 1]`. Derive `parentNodeType` / `parentNodeId` / `parentNodeName` as the three positional elements of that last triplet (or destructure: `const [parentType, parentId, parentName] = path[path.length - 1]`).
- **Intermediate ancestors**: all elements between the first and last — structural context the v1.3.0 shape did not provide.
- **Pages themselves**: `path` is `[]` (empty array). A page has no ancestors above it (the document root is not surfaced). An empty `path` signals "this node is a page."
- **Direct children of a page**: `path` has exactly one element (the page itself), e.g. `[["PAGE", "0:1", "Home"]]`.
- **`descendantCount`** is the total recursive count of all nodes in the subtree (not including the node itself). It is always present on **top-level entries**. It is also present on **max-depth boundary nodes** — descendants at the `maxDepth` limit whose `children` are truncated to `[]` — so the LLM can distinguish genuine leaf nodes (`descendantCount: 0, children: []`) from truncated nodes (`descendantCount: 12, children: []`) and decide whether to drill deeper with a follow-up call. Interior descendants (above the boundary) do not carry `descendantCount` (the LLM can see their structure directly). The count is computed during the recursive `children` walk that already runs, so it adds zero extra traversal cost. When a `filter` is active, `descendantCount` reflects the **unfiltered** subtree size (the total number of descendants regardless of filter), not the filtered count — this lets the LLM compare the full scope against the filtered `children` to understand how much was pruned. Leaf nodes have `descendantCount: 0`.
- **`children` is recursive.** Each child entry has the same `{ id, name, type, children }` shape, populated for the subtree under the requested node down to `maxDepth` levels (or the full subtree when `maxDepth` is omitted). Leaf nodes (or nodes whose only descendants were filtered out) carry `children: []`. Descendants do not include `path` (the structure encodes their position). Interior descendants do not include `descendantCount`; max-depth boundary descendants do (see above). When `properties` is non-empty, descendants also carry a `properties` sub-object — see "Per-node entry, with `properties`" below. In the default-properties case shown here, descendants are structure-only.
- **`maxDepth` (optional, default: unlimited).** Controls how many levels of `children` are included in the response. `maxDepth: 0` returns the top-level entries with no children at all (just identity + `descendantCount`). `maxDepth: 1` returns direct children only (connect-payload depth). `maxDepth: N` returns N levels deep. When omitted or `undefined`, the full subtree is returned (backward compatible with pre-v1.4.0 behavior). Nodes at the depth boundary have their `children` set to `[]` and receive a `descendantCount` field so the LLM can see that truncation occurred and how many nodes remain below. `maxDepth` interacts with `filter`: the filter is applied within the depth window — nodes below `maxDepth` are never visited, so filter matches deeper than the depth cap are invisible. Use `maxDepth` for structural overview; use `filter` for targeted extraction across the full tree. The two can be combined (e.g., `maxDepth: 2, filter: { type: "TEXT" }`) but the filter only operates within the depth window.

  | `maxDepth` | Behavior | `descendantCount` on descendants |
  |---|---|---|
  | omitted | Full recursion (default) | Top-level only |
  | `0` | No children | Top-level only (no descendants in response) |
  | `1` | Direct children only | On each direct child (they are boundary nodes) |
  | `N` | N levels deep | On nodes at depth N (boundary); not on interior nodes |

### Per-node entry, with `properties`

When `properties` is non-empty, every node in the response tree (the requested top-level entries and every included descendant in `children`) carries a `properties` sub-object containing the requested Figma node properties. Descendant `children` entries are still `{ id, name, type, children }` plus the new `properties`:

```json
{
  "nodeId": "...",
  "nodeName": "...",
  "type": "...",
  "descendantCount": 47,
  "path": ["...", "..."],
  "properties": {
    "fills": [...],
    "layoutMode": "...",
    "characters": "..."
  },
  "children": [
    {
      "id": "...",
      "name": "...",
      "type": "...",
      "properties": {
        "fills": [...],
        "layoutMode": "...",
        "characters": "..."
      },
      "children": [ "...recursive — each entry also carries properties..." ]
    }
  ]
}
```

Notes:
- The response `properties` block is present only when the request specifies a non-empty `properties` array (`properties.length > 0`). When the request `properties` is omitted or empty, the response `properties` block is omitted from every node in the response (top-level and descendants).
- `properties` is a flat key/value map keyed by the requested field names. Unknown / unsupported field names are silently skipped (do not throw, do not appear in the response). The same field names apply to top-level entries and descendants — there is no per-level field set. **Critically, property keys are omitted for any node where they do not apply (e.g., `characters` is omitted for a `FRAME` even if requested)**; the response never returns `null` or `undefined` for an inapplicable property, it simply excludes the key.
- The set of supported field names is the same set documented today in the `get_nodes_info` tool description — Component Properties, Instance Data, Layout & Positioning, Styling, Text, Prototyping, Metadata. The exact list is the source of truth in [src/mcp_server/tools/document.ts](../../src/mcp_server/tools/document.ts) and stays unchanged in v1.4.0.
- `properties` does NOT include `id`, `name`, `type`, `children`, or `path` even if a client asks for them — those live at the structured fields. Requesting them via `properties` is a silent no-op.
- **Cost implication.** When `properties` contains only names from the **safe list** (see "Safe-list properties" below), `properties` is populated via direct property reads on each Figma node — no `exportAsync` is called, on the requested id or on any descendant. When `properties` contains **one or more names NOT on the safe list**, the handler falls back to `node.exportAsync({ format: "JSON_REST_V1" })` per node retained in the response tree, and the cost driver becomes the size of the pruned response tree. Filter passthrough containers — non-matching ancestors retained so the path to a match is preserved — are also exported in the fallback path. Pair non-safe `properties` with a `filter` (or with a narrow `nodeIds` selection) to bound which descendants are exported. **Symmetric warning for `filter`**: a non-safe-list key in `filter` triggers `exportAsync` on every *candidate* descendant in the subtree (not just retained ones) to evaluate the predicate — see "Filtering" for details. Both parameters can independently push the call into export-heavy territory; the tool description must warn about both.
- Implementation-wise, safe-list properties are sourced via direct property access (e.g., `node.fills`, `node.layoutMode`); non-safe properties are sourced via the filtered `node.exportAsync({ format: "JSON_REST_V1" })` export, the same path used today, so behavior of individual properties (fills color shape, layoutMode enum values, etc.) is identical to v1.3.0 in the export-fallback case.

### Safe-list properties (no `exportAsync` required)

The Figma Plugin API exposes most node properties as direct, synchronous property accesses on the node object — there is no need to round-trip through `exportAsync({ format: "JSON_REST_V1" })` to read them. v1.4.0 takes advantage of this: when every name in the requested `properties` array is on the safe list below, the handler builds `properties` by reading direct properties from each Figma node (one constant-time access per field per node) and **does not call `exportAsync` on the requested id or on any included descendant**.

When **at least one** requested property name is NOT on the safe list, the handler falls back to `node.exportAsync({ format: "JSON_REST_V1" })` per node retained in the response tree and slices the requested properties from the export. This fallback is async, serializes the node (including its subtree) to REST shape, and is the dominant latency contributor for `properties`-populated calls — particularly when combined with empty-args or `PAGE`-scoped requests.

**Implementation requirement (handler).** The plugin handler MUST classify each requested field name against the safe list before assembling `properties`:
- All-safe call: assemble `properties` via direct property reads. No `exportAsync` on the requested id, no `exportAsync` on any descendant.
- Any non-safe present: fall back to `exportAsync` per node retained in the response tree (top-level + descendants), subject to the streaming/yielding rules in "Loading & performance."
- Unrecognized property names (typos, names not on either list): silently dropped from the response `properties` block. They do NOT force the export fallback — the safe-list classifier ignores names it does not recognize when deciding the cost path. This means a typo costs nothing extra, but also produces no value for the LLM; verify property names if the response `properties` block returns empty.

**Implementation requirement (tool description).** The `get_nodes_info` MCP tool description MUST inform the LLM that latency is significantly higher when `properties` contains any field name not on the safe list, due to the per-node `exportAsync` fallback. The description SHOULD also enumerate the safe list (or at minimum reference it by category) so the model can predict cost before issuing the call. Recommended copy: *"Latency is significantly higher when `properties` includes any name NOT on the safe list — the handler falls back to `exportAsync` per node in the response tree. Stick to safe-list properties when possible; combine non-safe properties with a narrow `nodeIds` array or a `filter` to bound the export cost."*

#### Safe list (direct property access — no `exportAsync`)

These field names are read directly from the Figma plugin node object. Sources: [Shared node properties](https://developers.figma.com/docs/plugins/api/node-properties/) and per-node-type reference pages.

- **Identity & structure**: `id`, `name`, `type`, `parent`, `key`, `expanded`
- **Visibility**: `visible`, `locked`, `opacity`, `blendMode`, `isMask`, `maskType`
- **Geometry & transform**: `x`, `y`, `width`, `height`, `rotation`, `absoluteBoundingBox`, `absoluteRenderBounds`, `absoluteTransform`, `relativeTransform`, `constrainProportions`
- **Auto-layout**: `layoutMode`, `layoutAlign`, `layoutGrow`, `layoutPositioning`, `layoutWrap`, `layoutSizingHorizontal`, `layoutSizingVertical`, `primaryAxisAlignItems`, `primaryAxisSizingMode`, `counterAxisAlignItems`, `counterAxisSizingMode`, `counterAxisSpacing`, `counterAxisAlignContent`, `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`, `itemSpacing`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `clipsContent`
- **Constraints**: `constraints`
- **Corner radius**: `cornerRadius`, `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`, `cornerSmoothing`
- **Fills & strokes**: `fills`, `fillStyleId`, `strokes`, `strokeStyleId`, `strokeWeight`, `strokeAlign`, `strokeCap`, `strokeJoin`, `strokeMiterLimit`, `dashPattern`, `strokeLeftWeight`, `strokeRightWeight`, `strokeTopWeight`, `strokeBottomWeight`
- **Effects**: `effects`, `effectStyleId`
- **Text** (TextNode only): `characters`, `fontSize`, `fontName`, `fontWeight`, `lineHeight`, `letterSpacing`, `paragraphIndent`, `paragraphSpacing`, `listSpacing`, `textCase`, `textDecoration`, `textAlignHorizontal`, `textAlignVertical`, `textAutoResize`, `autoRename`, `maxLines`, `textTruncation`, `hangingPunctuation`, `hangingList`, `leadingTrim`, `hasMissingFont`, `hyperlink`
- **Component / instance**: `componentProperties`, `componentPropertyDefinitions`, `componentPropertyReferences`, `variantProperties`, `overrides`, `exposedInstances`, `isExposedInstance`, `scaleFactor`
- **Prototyping**: `reactions`, `transitionNodeID`, `transitionDuration`, `transitionEasing`
- **Variables**: `boundVariables`, `explicitVariableModes`
- **Export & dev metadata**: `exportSettings`, `devStatus`, `annotations`

**Caveat — `mainComponent`**: direct read on `InstanceNode` is sync EXCEPT when the plugin manifest sets `documentAccess: "dynamic-page"`, in which case it requires `getMainComponentAsync()`. The handler SHOULD detect manifest mode and use the async accessor when required; field semantics are unchanged from the caller's perspective. In dynamic-page mode this still avoids `exportAsync`, but it is a per-instance async hop — implementations MAY treat `mainComponent` as a third tier ("safe but async") if they want to surface that distinction; v1.4.0 classifies it as safe.

#### Non-safe-list properties (export-required fallback)

Any field name not in the lists above falls through to `exportAsync` per included node. Notable examples and notes:

- `style` — REST-shaped text style aggregate. Plugin equivalents are the direct text properties above (`fontSize`, `fontName`, `lineHeight`, `letterSpacing`, etc.); prefer those when possible to stay on the safe path.
- Any future REST-only aggregate field introduced by Figma REST schema updates that does not have a direct plugin-API equivalent.
- Vector geometry properties (`fillGeometry`, `strokeGeometry`, `vectorNetwork`, `vectorPaths`) — direct reads exist on the plugin API but are heavyweight and not currently exposed as v1.4.0 `properties`. If added later, they should land on the safe list (no `exportAsync` cost) but with their own size warning in the tool description.

### Filtering (Optional)

When `get_nodes_info({ nodeIds: [...], filter: { ... } })` is called, the recursive `children` subtree of each returned node is filtered according to the provided criteria.

```json
{
  "type": "FRAME",
  "visible": true
}
```

OR matching example (array value on `type`):

```json
{
  "type": ["FRAME", "COMPONENT"],
  "visible": true
}
```

Notes:
- **Scope**: The filter applies recursively across the **entire subtree** of each requested node. It does NOT filter the requested `nodeIds` themselves; if you request a node by ID, you always get its entry in the response, even if it doesn't match the filter.
- **Tree shape under filter**: A descendant is included in `children` if **either** it matches the filter **or** any node in its subtree matches. Non-matching nodes whose subtrees contain no match are pruned entirely (along with everything beneath them); non-matching ancestors of a match are retained as passthrough containers so the structural path from each requested id down to every match is preserved. This makes `filter: { type: "TEXT" }` on a deep frame return every text node in the subtree with their containing-frame path intact.
- **Criteria**: All provided keys in the `filter` dictionary must match (AND logic). Two keys — `type` and `layoutMode` — additionally accept an **array of strings** for OR matching within that field: e.g., `"type": ["FRAME", "COMPONENT"]` matches nodes whose type is either `FRAME` or `COMPONENT`. When an array is provided, the node matches the key if its value equals any element in the array. All other filter keys accept only a single value (strict equality); passing an array for a key other than `type` or `layoutMode` is a no-op (matches nothing, since no node's property value is an array of strings). These are the only two enum-like safe-list properties where subset selection is a natural operation — `type` is the primary use case (replacing `scan_nodes_by_types`), `layoutMode` enables "all auto-layout frames" queries (`["HORIZONTAL", "VERTICAL"]`). No performance cost: the evaluation is an `Array.includes()` check on a small array, and both keys remain on the safe list regardless of value shape.
- **Cost depends on filter key safe-list status**: `filter` accepts **any** property name available on the Figma node (see "Safe-list properties"). The matching cost differs sharply by classification:
  - **All-safe-list filter keys** (e.g., `type`, `visible`, `name`, `locked`, `layoutMode`, `fontSize`): the match predicate is evaluated via direct property reads. No `exportAsync` runs on any candidate node in the subtree, regardless of depth.
  - **Any non-safe-list filter key** (e.g., `style` and other REST-only aggregates): the handler MUST call `node.exportAsync({ format: "JSON_REST_V1" })` on **every candidate descendant** in the subtree just to evaluate the predicate. This is more expensive than the `properties` export-fallback path: `filter` must export every candidate (whether it ends up matching or not), while `properties` only exports nodes retained in the response tree after pruning. A non-safe-list filter on a `PAGE`-scoped subtree exports the entire page worth of nodes.
  - **Cache reuse**: when both `filter` and `properties` use non-safe-list names, implementations MUST cache the per-node export so it can be reused for response `properties` assembly without a second `exportAsync` call. The cache is per-call (not session-wide) and keyed by node id.
- **Empty Results**: If no node in a requested id's subtree matches the filter, that entry's `children` array is `[]`.

### Empty-args behavior

`get_nodes_info()` with no `nodeIds` array (or with an empty array) continues to return the editable-scope node:

- Page scope: returns a single-element array containing the editable page in the same shape as above (`type === "PAGE"`, `path === []`), with `children` populated recursively (or bounded by `maxDepth` when provided) to encode the page's node tree.
- Node scope: returns a single-element array containing the editable node, with `children` populated recursively (or bounded by `maxDepth`).
- Read-only mode: returns an empty `nodes` array (no editable scope to surface). This matches today's behavior at [src/figma_plugin/src/main.ts:491](../../src/figma_plugin/src/main.ts#L491).

The empty-args entry uses the same field set as the connect payload's `node` block (same `nodeId` / `nodeName` / `type` / `path`), but its `children` are recursive (or depth-bounded) whereas the connect-payload `node.children` are top-level only. Clients refreshing state via empty-args should be aware they are paying for the full subtree walk unless `maxDepth` is set; if the editable scope is a `PAGE` and `maxDepth` is omitted, this can be substantial. **Recommended pattern for PAGE-scoped overview**: `get_nodes_info({ maxDepth: 1 })` returns the page's direct children with `descendantCount` on each — equivalent to the connect-payload depth but with count metadata, letting the LLM pick which subtrees to expand.

**Empty-args is treated as a single-id call** where the id is the editable-scope id captured at connect time. This means it inherits the same streaming and yielding behavior described in "Loading & performance" rules 2 and 3 — bookend `started` / `completed` events always fire, and the SHOULD-yield-every-25-descendants intra-subtree yield kicks in whenever an export path is active or the structural walk is large. A `PAGE`-scoped empty-args call without `maxDepth` is the canonical worst case and MUST emit progress events; it is not a "no streaming, no extra loads" shape despite having `nodeIds.length === 0`.

A `filter` argument can be combined with empty-args to constrain the walk (e.g., `get_nodes_info({ filter: { type: "TEXT" } })` for the editable scope's text nodes only). A `maxDepth` argument can be combined with empty-args to bound the walk (e.g., `get_nodes_info({ maxDepth: 2 })` for the editable scope's top two levels). Both can be combined: `filter` operates within the `maxDepth` window. Combining empty-args with non-safe-list `properties` is the most expensive shape — it triggers `exportAsync` per node retained in the response tree, which on a `PAGE` scope without `filter` or `maxDepth` is one export per node in the whole page. Combining empty-args with a non-safe-list `filter` key is even worse: every candidate descendant in the page is exported just to evaluate the predicate. (Empty-args with safe-list-only `properties` and safe-list-only — or absent — `filter` stays cheap; `properties` is populated via direct property reads and no exports run.) Pair non-safe-list usage with `maxDepth`, a tight safe-list `filter`, or a narrow `nodeIds` array for any non-trivial request.

### Missing nodes (silent-skip)

Adopt the `missingPageIds` pattern from `get_pages_info`. When `nodeIds` contains ids that cannot be resolved — id not found, id belongs to a different document, or the id is otherwise unreachable — the call does not fail. The unresolved ids are surfaced via a `missingNodeIds` field on the response envelope:

```json
{
  "nodes": [ /* per-node entries as above */ ],
  "missingNodeIds": ["<id>", "<id>"]
}
```

Notes:
- This is a **shape change** at the top level of the response. The current shape is a bare array. Going forward, the response is an object with `nodes` and (when applicable) `missingNodeIds`. Clients calling `get_nodes_info` directly must update — this is documented under "Breaking changes."
- `missingNodeIds` is omitted entirely when every requested id resolves; clients should treat its absence and an empty array as equivalent.
- Empty-args calls always succeed and the response shape is `{ nodes: [...], missingNodeIds: [] }` (or `missingNodeIds` omitted) — a missing editable scope returns `nodes: []`, not a `missingNodeIds` entry.
- "Different document" detection uses `figma.getNodeByIdAsync(id)` returning `null` (Figma's API does not surface cross-document ids as resolvable in the plugin sandbox); cross-document ids land in `missingNodeIds` for the same reason that not-found ids do.
- **LLM-facing requirement**: because `missingNodeIds` is silent-skip (no thrown error, no per-node error envelope), the MCP tool description MUST explicitly instruct the LLM to inspect this field on every call and to surface unresolved ids back to the user rather than silently retrying or fabricating data. See the "MCP tool registration" implementation pointer for the required description copy. Without that instruction, stale ids passed from prior conversation turns disappear from `nodes` with no signal — the most likely failure mode for this surface.

### Ordering and deduplication

Mirror the `get_pages_info` rule: input order preserved, duplicates deduped first-occurrence. `nodes[i]` corresponds to the i-th resolvable id in the deduped input; `missingNodeIds` lists unresolved ids in the order they first appeared in the deduped input.

## Loading & performance

These rules govern three v1.4.0 read-tool surfaces — **`get_nodes_info`** (the primary subject of this release), **`get_components`**, and **`get_variables`**. They intentionally mirror the v1.3.0 "Loading & performance" rules so the read-tool surface behaves consistently across the codebase. Language is aligned with [read_tools_update.md](../completed/v1.3.0%20-%20read_tools_update/read_tools_update.md) by design.

`get_components`'s `loadAllPagesAsync` rewrite was filed as the canonical follow-up in v1.3.0's "Out of scope" section; v1.4.0 lands it. `get_variables` is added because `includeConsumers: 'document'` is the only other read-tool path in the codebase that walks pages sequentially without progress emission — fixing it alongside `get_components` keeps the streaming pattern uniform.

### `get_nodes_info` rules

1. **`get_nodes_info` MUST NOT call `figma.loadAllPagesAsync()`.**
   Resolve nodes individually via `figma.getNodeByIdAsync(id)`. The Figma sandbox loads the node's containing page implicitly as part of `getNodeByIdAsync`, so no separate `page.loadAsync()` is required. Walking `node.parent` to derive `path` does not require additional loads. The current handler's `Promise.all(nodeIds.map(figma.getNodeByIdAsync))` resolution path ([src/figma_plugin/handlers/nodeReaders.ts:136-138](../../src/figma_plugin/handlers/nodeReaders.ts#L136)) is already compliant on this rule and is preserved in v1.4.0.

2. **`get_nodes_info` MUST stream node-by-node when `nodeIds.length > 1`.**
   For each requested id (after dedup, in input order):
   1. resolve via `figma.getNodeByIdAsync(id)` (resolution can still be batched via `Promise.all` up front — see rule 1),
   2. assemble the per-node entry: parent-chain walk for `path`, **recursive `children` walk** (descend the full subtree synchronously inside the plugin sandbox, mapping each descendant to `{ id, name, type, children }`; apply `filter` per node with ancestor-passthrough pruning when present), and (when `properties` is non-empty) the `properties` block — populated either via direct property reads (all-safe-list properties path, no `exportAsync`) or via `node.exportAsync({ format: "JSON_REST_V1" })` per node retained in the response tree (any-non-safe-list path, see "Safe-list properties"),
   3. push the per-node entry into `nodes`,
   4. emit a `command_progress` event (`status: "in_progress"`) with running totals,
   5. `await new Promise(r => setTimeout(r, 0))` before the next iteration so the Figma sandbox flushes the UI message between chunks.

   The recursive `children` structural walk is cheap (reading `node.children`, `node.type`, `node.name`) when `filter` is omitted or contains only safe-list keys, and does NOT load additional pages — the requested node and its subtree are already in the same page, which `getNodeByIdAsync` loaded implicitly. Per-descendant `exportAsync` calls run in two independent cases:
   - **`properties` export-fallback**: `properties` is non-empty AND contains at least one non-safe-list name → export per node retained in the response tree (after `filter` pruning).
   - **`filter` export-required matching**: `filter` is non-empty AND contains at least one non-safe-list key → export per candidate descendant in the subtree (before pruning, since the predicate needs the export to evaluate).
   
   When both cases apply simultaneously, the implementation MUST cache the per-node export to avoid double-exporting (see "Filtering > Cache reuse"). When neither applies (no `properties`, or safe-list-only `properties` with no filter or safe-list-only filter), no `exportAsync` runs and the walk is purely structural plus direct property reads. For a single-id call (`nodeIds.length === 1`) — including empty-args, which is treated as a single-id call where the id is the editable scope (see rule 3) — there are no between-iteration progress events because there is only one iteration; bookend `started` / `completed` events still fire.

   **Intra-subtree streaming requirement.** When either export path is active, when `getMainComponentAsync()` is being called (e.g. for `mainComponent` in dynamic-page mode), OR the structural walk is large (> ~250 nodes), implementations MUST, every ~25 descendants inside the subtree walk:
   1. `await sendProgressUpdate(...)` with running totals (suggested payload: `{ nodesProcessed, nodesTotalEstimate, exportsIssued }`),
   2. `await new Promise(r => setTimeout(r, 0))` to flush the sandbox.

   Both calls are required. The `setTimeout(0)` yield alone keeps the Figma sandbox responsive but does NOT reset the MCP server's 60-second inactivity timeout — only `progress_update` events do that ([figma-client.ts:138-158](../../src/mcp_server/figma-client.ts#L138)). A deep subtree walk that yields without emitting progress will keep the sandbox happy but still time out the MCP request. Conversely, emitting progress without yielding will get coalesced by the sandbox and reintroduce blocking. The pair is the streaming guarantee for the single-id and empty-args shapes; it applies independently of `nodeIds.length` and to both the `properties` fallback walk and the `filter` predicate-evaluation walk. (For multi-id calls, the per-iteration progress emission described in step 4 above already handles the cross-id timeout reset; the intra-subtree pair handles the within-id case.)

   Bookend the loop with `started` and `completed` events. The MCP server already resets its inactivity timeout on `progress_update` ([src/mcp_server/figma-client.ts:138-158](../../src/mcp_server/figma-client.ts#L138)); the `setTimeout(0)` yield is what makes that reset effective — without it, events get coalesced and the streaming pattern collapses back into a blocking call.

   This is a behavior change from today's implementation, which parallelizes per-node `exportAsync` via `Promise.all` ([src/figma_plugin/handlers/nodeReaders.ts:144-155](../../src/figma_plugin/handlers/nodeReaders.ts#L144)) with no progress emission. v1.4.0 keeps `getNodeByIdAsync` parallel (cheap, latency-bound) but moves per-node assembly into a sequential loop so progress events can fire between iterations. A bounded-parallelism follow-up is filed under "Out of scope."

3. **Nodes SHOULD be resolved on demand, not pre-emptively.** Streaming and yielding are gated on the **work being done** (subtree size and export-active paths), not on `nodeIds.length`. Specifically:
   - **Read-only mode**: returns `{ nodes: [], missingNodeIds: [] }` immediately with no plugin work — no resolution, no streaming, no events.
   - **Empty-args** (`get_nodes_info()` / `get_nodes_info({ nodeIds: [] })`): treated as a single-id call where the id is the editable-scope id captured at connect time. Single `figma.getNodeByIdAsync` for resolution, then the assembly inherits all the same rules as a single-id call below — including the intra-subtree streaming requirement. **A `PAGE`-scoped editable is the worst-case empty-args shape and MUST emit progress events**: bookend `started` / `completed` always, plus the intra-subtree progress-emit + yield pair from rule 2 whenever an export path is active or the structural walk is large (> ~250 nodes is a reasonable threshold). The previous claim "empty-args is a single resolution with no streaming and no extra loads" was correct for a `node`-scoped editable on a small subtree but wrong for `PAGE`-scoped editables; the rule now uniformly inherits the streaming behavior from the work profile.
   - **Single-id call** (`nodeIds.length === 1`): single `figma.getNodeByIdAsync` + assembly. No per-iteration streaming is required between top-level entries (there's only one), but the **intra-subtree progress-emit + yield pair from rule 2 still applies**: when an export path is active or the structural walk is large, emit `sendProgressUpdate` AND yield every ~25 descendants. Both calls are required — yielding alone keeps the sandbox responsive but does not reset the MCP inactivity timeout. Bookend with `started` / `completed`.
   - **Multi-id call** (`nodeIds.length > 1`): rule 2 applies — parallel resolution, then per-node sequential assembly with progress events between iterations and the intra-subtree yield rule active per id.

4. **Soft batch guidance: `nodeIds.length <= 25` per call.**
   Not enforced at runtime. The guidance is delivered to the LLM via the `get_nodes_info` tool description so the model naturally chunks large requests. Even with progress events keeping the timeout alive, sequential `exportAsync` walks of dozens of nodes — combined with the recursive `children` walk per requested id — will feel slow. The dominant cost driver depends on which export path is active:
   - **`properties` export-fallback**: `Σ exportedNodeCount(nodeId)` (the count of nodes retained in each requested id's response tree, after `filter`) — one `exportAsync` per retained node.
   - **`filter` export-required matching**: `Σ subtreeSize(nodeId)` (the full subtree size before pruning) — one `exportAsync` per candidate node, since the predicate needs the export to evaluate. This is strictly worse than the `properties` fallback at equivalent subtree size.
   - **Both active with cache reuse**: `Σ subtreeSize(nodeId)` (filter dominates; cache means each node exports at most once).
   - **Neither active** (no `properties` or safe-list-only `properties`, with no `filter` or safe-list-only `filter`): `Σ subtreeSize(nodeId)` for the structural walk plus constant-time direct property reads — no exports.
   
   25 is a soft heuristic for the typical case (small/medium frames, no expensive properties in either parameter) and may be too generous for any export-active path or for callers that target a whole `PAGE`. Pair non-safe-list `properties` *and* non-safe-list `filter` keys with a tight `nodeIds` selection (or with safe-list-only filter pre-pruning) to bound the export cost.

   **Implementation MUST NOT cap, truncate, warn, log, or emit telemetry on oversize input.** The 25-id figure is description-only — a chunking nudge to the model, not a contract clients can rely on. Adding runtime enforcement turns it into a hard limit that callers have to defensively work around (re-implementing chunking on the client side that the server is already silently doing), which defeats the point. If a future change wants enforcement, it needs its own design pass and breaking-change documentation. (This rule mirrors the v1.3.0 `get_pages_info` rule verbatim by design.)

### `get_components` rules

1. **`get_components` MUST NOT call `figma.loadAllPagesAsync()`.**
   The current handler at [src/figma_plugin/handlers/componentHandlers.ts:60-64](../../src/figma_plugin/handlers/componentHandlers.ts#L60) calls `figma.loadAllPagesAsync()` then runs `figma.root.findAllWithCriteria({ types: ["COMPONENT"] })` when invoked with `scope: 'document'`. v1.4.0 replaces this with a per-page walk: iterate `figma.root.children`, `await page.loadAsync()` per page, and run `page.findAllWithCriteria({ types: ["COMPONENT"] })` page-locally. `scope: 'current_page'` is unchanged — single-page calls do not load any other pages.

2. **`get_components` with `scope: 'document'` MUST stream page-by-page.**
   For each `page` in `figma.root.children` order:
   1. `await page.loadAsync()`,
   2. run `page.findAllWithCriteria({ types: ["COMPONENT"] })`,
   3. apply the `filter` argument (`local` / `remote`) to the page's results,
   4. append per-page results to the response accumulator,
   5. emit a `command_progress` event (`status: "in_progress"`) with running totals (suggested payload: `{ pagesProcessed, pagesTotal, componentsFound }`),
   6. `await new Promise(r => setTimeout(r, 0))` before the next iteration.

   Bookend with `started` and `completed` events. `scope: 'current_page'` is a single-pass non-streaming call — no progress emission and no `setTimeout(0)` yield required (one page, one `findAllWithCriteria`, return).

3. **No soft batch guidance.**
   `get_components` does not take an input id array; the cost driver is page count, which is bounded by the file. The existing tool description already warns that `scope: 'document'` is "slower" — preserve that copy. **The implementation MUST extend the tool description to explicitly note that the call now streams progress page-by-page so it survives the 60 s inactivity timeout on large files.** This informs the LLM that document-wide searches are now safe to perform even on large files.

4. **Result-ordering note (non-breaking, but verify).**
   Today's `figma.root.findAllWithCriteria` produces a document-order traversal. The page-by-page rewrite produces a page-then-document-order traversal — components in the same page stay together; pages appear in `figma.root.children` order. This is technically a different order from the legacy implementation. `get_components` callers do not document an ordering contract and the response includes `pageId` per component so callers can re-bucket if needed; v1.4.0 does not treat the change as breaking.

   **Regression test (REQUIRED).** Even though the ordering change is classified non-breaking, an LLM workflow that relies on stable ordering across calls (e.g., "the first COMPONENT in the response") would silently break under the rewrite — there is no schema change, no error, just a different traversal. The implementation MUST add a regression test that:
   1. Sets up a fixture file with **at least 2 pages**, each containing **multiple components** (recommended: 3 pages × 3 components, with deterministic page and component names like `Page A` / `Page B` / `Page C` and `Comp-1` / `Comp-2` / `Comp-3` per page).
   2. Calls `get_components({ scope: 'document' })` on the fixture.
   3. Asserts the returned component order is **page-then-document-order**: all components from `figma.root.children[0]` (in their intra-page document order), then all components from `figma.root.children[1]`, etc. Pin the exact expected order in the test so any unintended reshuffle (e.g. accidental reintroduction of `figma.root.findAllWithCriteria`, parallel page processing, or sort-by-name) fails loudly.
   4. Asserts `pageId` is populated correctly on every entry so callers who need a different order can re-bucket.

   This fixture also serves as the smoke test for the `loadAllPagesAsync` removal (rule 1) and the streaming behavior (rule 2). Place the test next to the `get_pages_info` regression tests filed in v1.3.0 so the read-tool ordering contract is documented in one place. Flag the ordering change in the release notes alongside the regression-test reference, so integrators can confirm their use case isn't affected.

### `get_variables` rules

1. **`get_variables` already complies with Rule 1 (no `loadAllPagesAsync`).**
   The current handler at [src/figma_plugin/handlers/variableHandlers.ts:373-375](../../src/figma_plugin/handlers/variableHandlers.ts#L373) iterates `figma.root.children` directly and calls `await node.loadAsync()` per `PAGE` inside `findVariableConsumers` ([variableHandlers.ts:309-311](../../src/figma_plugin/handlers/variableHandlers.ts#L309)). No load-policy change required.

2. **`get_variables` with `includeConsumers: 'document'` MUST stream page-by-page.**
   For each `page` in `figma.root.children` order:
   1. invoke `findVariableConsumers(page, idSet)`,
   2. merge the resulting per-page node-consumer map into the cross-document accumulator,
   3. emit a `command_progress` event (`status: "in_progress"`) with running totals (suggested payload: `{ pagesProcessed, pagesTotal, consumersFound }`),
   4. `await new Promise(r => setTimeout(r, 0))` before the next iteration.

   Bookend with `started` and `completed` events. The two style/alias consumer scans (`findStyleConsumers` and `findAliasConsumers`) run in parallel as today and stay outside the streamed loop — they are not per-page work, so chunking them buys nothing; kicking them off concurrently with the page loop is fine and preserves today's parallelism.

   `includeConsumers: 'current_page'` is single-page and does not stream. Lookup mode without `includeConsumers` (single-shot variable detail fetch) and discovery mode (no `variableId` — uses `getLocalVariablesAsync` / `getLocalVariableCollectionsAsync`) are unchanged: both are O(1) in page count and do not need progress emission.

3. **No soft batch guidance on `variableId`.**
   The input `variableId` array is consumed by `Promise.all` lookups against `figma.variables.getVariableByIdAsync`, which is constant-time per id and not the bottleneck. The cost driver is the per-page consumer walk, which scales with page count, not with `variableId.length`. No `<= 25` guidance is added to the tool description.

4. **Out of scope: `delete_variables` consumer scan.**
   `delete_variables` ([variableHandlers.ts:484-487](../../src/figma_plugin/handlers/variableHandlers.ts#L484)) shares the same per-page consumer-scan pattern and is similarly long-running on large files, but it is a write tool and its scope correction belongs to a future release. v1.4.0 does not modify it.

### `get_pages_info` rules

1. **`get_pages_info` with `pageIds` MUST include `descendantCount` per page.**
   When one or more `pageIds` are provided, the handler already loads each resolved page via `await node.loadAsync()` ([nodeReaders.ts:61](../../src/figma_plugin/handlers/nodeReaders.ts#L61)). After loading, compute `descendantCount` — the total recursive descendant count — by walking `node.children` recursively (sync, no `exportAsync`, no property reads, just counting). Add `descendantCount` to the per-page entry alongside `pageId`, `pageName`, and `children`:

   ```json
   {
     "pageId": "0:1",
     "pageName": "Home",
     "descendantCount": 8432,
     "children": [
       { "id": "100:1", "name": "Header", "type": "FRAME" },
       { "id": "100:2", "name": "Hero Section", "type": "FRAME" }
     ]
   }
   ```

   The count walk is <1ms on a 10k-node page and runs on already-loaded data. It gives the LLM scope awareness per page — before it issues any `get_nodes_info` calls against that page's children — enabling cost prediction for subsequent subtree walks.

2. **`get_pages_info` with no args (or empty array) MUST NOT include `descendantCount`.**
   The no-args response ([nodeReaders.ts:21-33](../../src/figma_plugin/handlers/nodeReaders.ts#L21)) returns all pages with `{ pageId, pageName }` only — no `children`, no page loading. Adding `descendantCount` here would require `await page.loadAsync()` on every page, which defeats the cheap discovery contract established in v1.3.0. The LLM can request specific `pageIds` to get `descendantCount` for pages of interest.

### Prerequisite plumbing

The async `sendProgressUpdate` + trailing `setTimeout(0)` flush was landed in v1.3.0 ([src/figma_plugin/utils/progressUtils.ts](../../src/figma_plugin/utils/progressUtils.ts)) and is the canonical primitive for the per-iteration emission required by `get_nodes_info`, `get_components`, and `get_variables`. v1.4.0 does not need to re-do that work, but each handler MUST itself be `async` and MUST `await` every call to `sendProgressUpdate` — a missed `await` silently bypasses the flush and reintroduces the coalescing bug that PR #153 (upstream) and v1.3.0 (this codebase) both fixed. This applies to the new `getNodesInfo` body, the rewritten `getComponents` document-scope branch, and the modified `getVariables` `includeConsumers: 'document'` branch.

The `state.activeRequestId` capture in [src/figma_plugin/ui.html](../../src/figma_plugin/ui.html), also landed in v1.3.0, MUST remain intact so progress events fired by any of the three tools are tagged back to the originating MCP request. Re-verify on implementation: `message.id` is captured from inbound `broadcast` messages before forwarding to the plugin, pinned onto outbound `progress_update` payloads, and cleared on `command-result` / `command-error` dispatch. Without it, a concurrent read mid-flight can have its progress events mis-correlated with another request.

### Per-iteration cost

- `get_nodes_info`: per requested id, cost is the sum of (a) the parent-chain walk for `path` (constant — `node.parent` walk to the containing page), (b) the **recursive `children` walk** (proportional to the subtree's node count within the `maxDepth` window, or the full subtree when `maxDepth` is omitted; structure-only reads, plus constant-time direct property reads per included node when `properties` and `filter` use only safe-list names), and (c) `node.exportAsync` when either export path is active — once per retained node when only `properties` is non-safe; once per *candidate* descendant when `filter` is non-safe; once per node total (with cache reuse) when both are non-safe. When `maxDepth` is set, boundary nodes require an additional count walk for `descendantCount` (synchronous, <1ms per boundary node). Streaming benefits any export-active path (cost scales with the exported node count) and the large-subtree case (e.g., empty-args on a `PAGE`-scoped editable without `maxDepth`). The all-safe-list path remains cheap, but the streaming pattern applies uniformly so behavior is consistent across calls.
- `get_components`: dominated by `page.loadAsync()` (one-time cost the first time a given page is touched in the session) and `page.findAllWithCriteria` (proportional to node count on the page). Streaming primarily benefits the first-load case; once pages are warm, iteration is fast but the pattern stays uniform.
- `get_variables` (`includeConsumers: 'document'`): dominated by `findVariableConsumers`'s recursive walk per page, which is proportional to node count on the page and includes per-PAGE `loadAsync`. Streaming benefits scale with page count, not with `variableId.length`.

## Error response

`get_nodes_info` retains a single failure mode: an unexpected exception inside the plugin. This continues to surface as the existing thrown error pattern (`throw new Error(...)`) propagated to the MCP server. There is no per-node error envelope analogous to the connect-flow error codes — invalid ids are silent-skip via `missingNodeIds`, and partial failures during streaming are treated as missing entries rather than envelope errors. If we discover a need for structured per-node errors (e.g. `node.exportAsync` rejecting on a specific malformed node), that's a follow-up release.

## Schema implementation note

Because `properties` and `missingNodeIds` are conditionally present, the schema definition (e.g. Zod) should mark them as optional. The per-node entry's structured fields (`nodeId`, `nodeName`, `type`, `descendantCount`, `path`, `children`) are always required. `descendantCount` is a non-negative integer; on top-level entries it is always present; on descendants it is present only when the descendant is at a `maxDepth` boundary (otherwise omitted). In the Zod schema, `descendantCount` on the recursive `ChildSchema` should be `z.number().optional()` to handle both cases. `path` is always an array of 3-tuples `[type, id, name]` — empty array for pages, non-empty for all other nodes. In Zod this is `z.array(z.tuple([z.string(), z.string(), z.string()]))`; in TypeScript prefer named-tuple syntax `Array<[type: string, id: string, name: string]>` so the positional convention is documented at the type level. `children` is a **recursive** type — each entry is `{ id, name, type, children, descendantCount?, properties? }` where `children` is the same recursive array; in Zod this needs `z.lazy(() => ChildSchema)` (or equivalent) to express the self-reference. Descendants do NOT carry `path` (their position is encoded structurally). Descendants DO carry `properties` when `properties` is non-empty; the `properties` schema is the same on top-level entries and descendants (a flat key/value map keyed by the requested field names).

**Implementation requirement: do NOT register an `outputSchema` on `get_nodes_info`.** The Zod schema described above is for TypeScript compile-time type safety only — it MUST NOT be passed as `outputSchema` in the `server.tool()` or `server.registerTool()` registration. The MCP SDK runs `outputSchema.safeParseAsync(result.structuredContent)` on every response ([mcp.js:124](../../src/mcp_server/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js#L124)); on a recursive `z.lazy` schema against a `PAGE`-scoped response (10k+ nodes), this adds measurable validation overhead on the server's hot path after all plugin work is already complete. Worse, if validation fails on *any* node in the recursive tree — a single unexpected `null`, a Figma-side type edge case, a property shape mismatch — the SDK throws `McpError` and **discards the entire response** ([mcp.js:125-127](../../src/mcp_server/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js#L125)). A 10k-node result that took 30 seconds to assemble is silently nuked because one leaf node had an unexpected field shape. The consumer of this tool is an LLM, which reads text — it does not parse JSON Schema to understand a response. The tool description (see the required checklist in the implementation pointer) is the LLM-facing contract for the response shape; `outputSchema` provides no incremental benefit to the LLM and introduces an all-or-nothing reliability hazard on the response path. This prohibition applies to `get_nodes_info` specifically due to its recursive, variable-depth, variable-shape response; it is not a blanket prohibition on `outputSchema` for other tools with small, flat, predictable responses.

## Breaking changes summary

This is a breaking release for `get_nodes_info` AND for the connect payload's `node` block. There is no alias, no deprecation period, and no compatibility shim. Clients must update.

- **🚨 Connect payload `node` block (back-to-back break with v1.3.0)**: the five v1.3.0 fields (`parentNodeId`, `parentNodeName`, `parentNodeType`, `containingPageId`, `containingPageName`) are removed and replaced by a single `path` array of 3-tuples encoding the full ancestor chain. **This is the second breaking change to this contract in two releases** — clients that migrated to v1.3.0's `parentNodeId` / `containingPageId` shape between v1.3.0's release and v1.4.0 MUST migrate again to read `path` instead. This is the most disruptive change in the release; release notes MUST foreground it. After v1.4.0 the connect payload `node` block and the `get_nodes_info` per-node entry use the same shape (modulo `children` depth and `properties`), making future shape changes a single migration point.
- **Top-level `get_nodes_info` shape**: was `Array<{ nodeId, parentId, document }>`, now `{ nodes: Array<...>, missingNodeIds?: string[] }`.
- **Per-node `get_nodes_info` shape**: `parentId` removed; `document` removed; structured `nodeName` / `type` / `path` / `children` (recursive — each descendant `{ id, name, type, children }`) added. Like the connect payload above, the same five v1.3.0 fields are replaced by `path`.
- **Recursive `children`**: structure preserved, content reshaped. `children` is still recursive. By default each descendant entry is `{ id, name, type, children }`; when `properties` is non-empty, descendants additionally carry a `properties` sub-object keyed by the requested field names — the same `properties` shape used at the top level. The v1.3.0 export's per-descendant property fields (fills, layoutMode, characters, etc.) are no longer present implicitly; clients that previously read `document.children[i].fills` must now request the field explicitly via `properties: ["fills", ...]` and read it from `children[i].properties.fills`. No follow-up call is required as long as `properties` is set on the original call.
- **`properties` semantics**: unchanged in terms of which field names are valid and what data they return, but the populated values now live under `properties` instead of `document`.
- **Missing ids**: previously silently dropped (because `validNodes = nodes.filter(node => node !== null)` at [nodeReaders.ts:141](../../src/figma_plugin/handlers/nodeReaders.ts#L141) discarded them with no signal), now surfaced via `missingNodeIds`. Existing clients that didn't notice missing ids will start seeing them — verify this is desired, not a regression.
- **`scan_text_nodes` removal**: the MCP tool registration, the plugin handler, the plugin dispatch case, and all prompt references are removed. No deprecation shim — the tool is gone. LLM callers that attempt `scan_text_nodes` will receive an "unknown tool" error, which is the correct signal to use `get_nodes_info` with `filter: { type: "TEXT" }` instead.
- **`scan_nodes_by_types` removal**: same treatment — MCP registration, plugin handler, plugin dispatch, and prompt references are all removed. LLM callers receive "unknown tool" on attempt.
- **Prompt strings** referencing `scan_text_nodes` or `scan_nodes_by_types` in `text_replacement_strategy` and `annotation_conversion_strategy` must be rewritten to use `get_nodes_info` equivalents. See "Tool removals" for the migration tables.
- **Prompt strings** referencing `document.<field>` paths in [src/mcp_server/tools/annotations.ts](../../src/mcp_server/tools/annotations.ts), [src/mcp_server/tools/components.ts](../../src/mcp_server/tools/components.ts), or any other tool descriptions / system prompts must be updated to `properties.<field>`.
- **The v1.3.0 regression test** that pinned today's `{ nodeId, parentId, document }[]` shape (`Phase 4 step 4` in the v1.3.0 plan) MUST be updated or replaced — it will fail under v1.4.0 and that's the point.
- **The v1.3.0 connect payload test** that pinned the `node` block shape (`parentNodeId`, `parentNodeName`, etc.) MUST be updated to expect `path` instead.

## Out of scope (follow-up)

- **Per-node structured errors.** `node.exportAsync` can in theory reject on a malformed node; today such cases bubble out as a thrown handler error and abort the whole call. Surfacing per-node errors as a structured array entry alongside `missingNodeIds` is a possible follow-up if it becomes a real failure mode.
- **`get_nodes_info` streaming with parallelism.** Today the implementation parallelizes `getNodeByIdAsync` and `exportAsync` via `Promise.all`. v1.4.0 keeps that for the resolution step but moves the per-node assembly into a sequential loop to enable progress emission. A future release could parallelize within bounded chunks while still emitting progress events; out of scope here.

## Implementation pointers (non-binding)

These are the call sites that the implementation will need to touch. Listed for reviewer convenience; the actual implementation plan lives alongside this spec when one is written.

**`get_nodes_info`:**
- **Plugin handler (`getNodesInfo`)**: [src/figma_plugin/handlers/nodeReaders.ts:133](../../src/figma_plugin/handlers/nodeReaders.ts#L133) — replace the existing body. Accept `maxDepth` parameter (optional, default: `undefined` = unlimited). Add the parent-chain walk to build the `path` array, the **recursive `children` walk** (`{ id, name, type, children }` mapping; apply `filter` per node with ancestor-passthrough pruning when present; respect `maxDepth` by stopping recursion at the specified depth and attaching `descendantCount` to boundary nodes), and the `missingNodeIds` accumulator. Add a **safe-list classifier** applied to BOTH the `properties` array AND the `filter` dictionary keys before per-node assembly:
  - **`maxDepth` enforcement**: track current depth during the recursive walk (top-level entry = depth 0, its children = depth 1, etc.). When `currentDepth === maxDepth`, set `children: []` on the node and compute `descendantCount` via a synchronous count walk. Interior nodes (above the boundary) do not carry `descendantCount`. When `maxDepth` is `undefined`, recurse fully (no depth tracking needed beyond the existing walk).
  - **`filter` matching path**: if all filter keys are safe-list, evaluate predicate via direct property reads. If any filter key is non-safe-list, call `node.exportAsync({ format: "JSON_REST_V1" })` per *candidate* descendant during the subtree walk (before pruning) to evaluate the predicate. When `maxDepth` is set, filter evaluation only runs within the depth window — nodes below `maxDepth` are never visited.
  - **`properties` assembly path**: if `properties` is empty, attach no `properties` block. If non-empty and all-safe, populate `properties` on the requested id and on each retained descendant via direct property reads. If any non-safe, call `exportAsync` per node retained in the response tree (top-level + descendants within the depth window) and slice all requested properties from the export.
  - **Cache reuse (REQUIRED)**: when both filter and properties trigger the export path, maintain a per-call `Map<nodeId, exportResult>` so each node is exported at most once. Look up the cache before issuing any `exportAsync`.
  
  Every ~25 descendants inside the subtree walk, MUST emit `await sendProgressUpdate(...)` AND `await new Promise(r => setTimeout(r, 0))` — both calls, in that order — when **either** export path is active, when `getMainComponentAsync()` is active, OR the structural walk is large (> ~250 nodes). Yielding alone (without the progress emit) flushes the sandbox but does NOT reset the MCP server's 60s inactivity timeout, so a deep single-id walk would still time out the request. Define the safe-list constant (per the categories in the spec's "Safe-list properties" subsection) co-located with the handler so it can be unit-tested in isolation; the SAME constant is used to classify both `properties` and `filter` keys.
- **Plugin handler (`getConnectPayload`)**: [src/figma_plugin/handlers/connectHandlers.ts:87-102](../../src/figma_plugin/handlers/connectHandlers.ts#L87) — update the Node-scope `node` block to use `path` instead of `parentNodeId` / `parentNodeName` / `parentNodeType` / `containingPageId` / `containingPageName`. The parent-chain walk already exists (lines 60-69); reuse it to build `path`. Add a `descendantCount` field to **both** the page-scope and node-scope connect payloads. The count is computed by a synchronous recursive walk of `node.children` (no `exportAsync`, no property reads — just counting). For page scope ([connectHandlers.ts:48-58](../../src/figma_plugin/handlers/connectHandlers.ts#L48)), add `descendantCount` to the page entry in `pages[0]` after the page is loaded via `loadAsync` (line 34). For node scope ([connectHandlers.ts:87-102](../../src/figma_plugin/handlers/connectHandlers.ts#L87)), add `descendantCount` to the `node` block after the scope node is resolved via `getNodeByIdAsync` (line 23). The count walk is <1ms on a 10k-node page and runs on already-loaded data. Read-only mode ([connectHandlers.ts:7-19](../../src/figma_plugin/handlers/connectHandlers.ts#L7)) does NOT include `descendantCount` — pages are not loaded in read-only mode, and forcing `loadAsync` on every page would defeat the cheap discovery contract.
- **MCP tool registration**: [src/mcp_server/tools/document.ts:42-83](../../src/mcp_server/tools/document.ts#L42) — update the input schema to include the `filter`, `properties`, and `maxDepth` parameters, and update the response envelope. `maxDepth` is an optional non-negative integer (`z.number().int().min(0).optional()`) with no default (omission = unlimited). The description for `maxDepth` should read: *"Maximum depth of `children` recursion. 0 = no children (identity + descendantCount only). 1 = direct children only. Omit for full subtree. Nodes at the depth boundary carry `descendantCount` so you can distinguish truncated nodes from genuine leaves."*

  **Required tool description content (CHECKLIST).** The current description is one paragraph that the model sees on every call. Spec rules are useless to the LLM if they live only in this spec file — they MUST land in the description copy. The implementer SHOULD treat the following as a verification checklist: every numbered item below MUST be present in the final description text, and the recommended copy is provided as a starting point. Description copy is easy to under-edit during implementation; missing any item below recreates one of the failure modes this release was designed to prevent.

  1. **Response shape**: `children` is **recursive** (full subtree by default, bounded by `maxDepth` when provided). Each descendant carries `{ id, name, type, children }` (plus a `properties` sub-object when the `properties` parameter is non-empty). The `properties` sub-object is attached to every node in the response tree (top-level entries + included descendants), keyed by the names passed in the `properties` parameter. **If a requested property is not applicable to a specific node type (e.g. `characters` on a `FRAME`), the key is omitted from that node's `properties` block rather than returning `null`.** When `maxDepth` is set, nodes at the depth boundary have `children: []` and carry a `descendantCount` field — use this to distinguish truncated nodes from genuine leaves.
  2. **Filter behavior**: `filter` is applied recursively across `children` with ancestor passthrough — non-matching ancestors of a match are retained as containers so the path to each match is preserved. **Filtering occurs only within the `maxDepth` window; matches deeper than the depth cap are invisible.**
  3. **Path shape**: `path` is an array of 3-tuples `[type, id, name]` from containing page down to immediate parent. Page nodes have `path === []`. (See spec for derivation rules.)
  4. **Latency warning — non-safe-list `properties` or `filter`**: latency and response size increase significantly when **either** parameter includes one or more property names NOT on the safe list, due to per-node `exportAsync` calls. Non-safe `properties` exports each *retained* node; non-safe `filter` exports each *candidate* node in the subtree (more expensive at equivalent subtree size). Recommended copy: *"`properties` and `filter` both accept any Figma node property name, but using one or more property names NOT on the safe list in **either** parameter increases latency and response size significantly — the handler must call `exportAsync` per node (every retained node for non-safe `properties`; every candidate node in the subtree for non-safe `filter`). Stick to safe-list names in both parameters when possible; combine non-safe usage with a narrow `nodeIds` array or a safe-list `filter` to bound the export cost."*
  5. **Cost framing — batch by subtree size, not id count**: the soft `nodeIds.length <= 25` heuristic is a description-only chunking nudge for the typical case (small/medium frames with safe-list-only or no `properties`). It is **not** the right mental model for cost: the actual driver is the *exported node count* across the response tree, which is determined by subtree size, `maxDepth`, and the safe-list status of `properties` / `filter`. A single `PAGE`-level id without `maxDepth` is roughly equivalent to thousands of leaf-frame ids in cost; 25 such ids would dwarf any normal request. Recommended copy: *"Batch by expected subtree size, not by id count. The `nodeIds.length <= 25` heuristic is for typical small/medium frames with safe-list-only or no `properties`. A single `PAGE`-level id (or empty-args on a `PAGE` editable scope) without `maxDepth` walks the entire page — roughly equivalent in cost to thousands of leaf-node ids. Use `maxDepth` to bound large scopes (e.g., `maxDepth: 1` for an overview with `descendantCount` per child), and combine a `PAGE` scope with `maxDepth`, a `filter`, or both to avoid exporting every node in the page."*
  6. **Safe-list enumeration**: the description SHOULD enumerate the safe list (or reference it by category and link to the spec) so the model can predict cost before issuing the call. Categories at minimum: identity & structure, visibility, geometry & transform, auto-layout, constraints, corner radius, fills & strokes, effects, text, component/instance, prototyping, variables, dev metadata. (Full list in the spec's "Safe-list properties" section.)
  7. **`missingNodeIds` inspection requirement**: `missingNodeIds` is silent-skip — invalid, stale, or cross-document ids do not throw and are surfaced only via this field. The description MUST instruct the LLM to inspect it on every call. Recommended copy: *"On every call, inspect the response's `missingNodeIds` field. Any id you passed that does not appear there resolved successfully and is in `nodes`; any id that DOES appear in `missingNodeIds` was not found, belongs to a different document, or is otherwise unreachable — do NOT assume it still exists, was renamed, or is anywhere in `nodes`. Treat its absence from `nodes` as authoritative. If `missingNodeIds` is omitted or empty, all requested ids resolved. When you encounter ids in `missingNodeIds`, surface this back to the user (e.g., 'Node X was not found') rather than silently retrying or fabricating data about it."*
  8. **Recommended pairings**: combine non-safe `properties` with a tight `nodeIds` array or a safe-list `filter` to bound export cost. Combine `filter` with `properties` to get property data only on matching descendants while keeping the pruned tree size bounded.

  **Verification**: after writing the description, re-read it as if you were the LLM seeing this tool for the first time on a single conversation turn. If you couldn't tell that a `PAGE` id is much more expensive than a leaf id, that non-safe-list filter is more expensive than non-safe-list properties, or that `missingNodeIds` is the only signal for unresolved ids, the description is incomplete. Items 4, 5, and 7 are the load-bearing items — getting them wrong recreates the failure modes this release was specifically designed to address (silent timeouts, runaway exports, silent stale-id swallowing).
- **Empty-args dispatch**: [src/figma_plugin/src/main.ts:480-491](../../src/figma_plugin/src/main.ts#L480) — keep the editable-scope fallback, but ensure the wrapped response uses the new envelope shape (`{ nodes, missingNodeIds }`). The dispatch MUST route empty-args through the same handler path as a single-id call (with the editable-scope id substituted in), so the streaming/yielding rules from "Loading & performance" rules 2 and 3 apply uniformly. Do not short-circuit empty-args to a no-streaming branch — a `PAGE`-scoped editable will block the sandbox without progress events if it does. Bookend `started` / `completed` events MUST fire for every empty-args call (read-only mode is the only exception).
- **Prompt-string sweep**: grep for `document.fills`, `document.layoutMode`, `document.children`, `parentId`, `parentNodeId`, `containingPageId` (in node-info contexts), `document.<anything>`, `scan_text_nodes`, and `scan_nodes_by_types` across `src/mcp_server/tools/*.ts` and any system prompts; rewrite to the new paths / tool names.
- **Connect-flow consistency check**: confirm the connect-flow `node` block and the `get_nodes_info` per-node entry produce identical `nodeId` / `nodeName` / `type` / `path` / `descendantCount` for the same node id. They will **not** match on `children` — the connect payload's `node.children` is top-level only (each entry `{ id, name, type }`, no `properties`), while `get_nodes_info`'s `children` is recursive (each entry `{ id, name, type, children }`, plus `properties` when `properties` is non-empty) — so a snapshot test should compare the structured-identity fields, `path`, and `descendantCount`, then verify the connect-payload's `children` equals the first level of `get_nodes_info`'s `children` (called without `properties`) with the recursive `children` field stripped. The connect payload's `node` block does not adopt the descendant-`properties` behavior; the connect path stays cheap by design and never carries `properties`.
- **Connect payload tests**: update all tests that assert the v1.3.0 `parentNodeId` / `parentNodeName` / `parentNodeType` / `containingPageId` / `containingPageName` fields to expect `path` instead.
- **Release notes (REQUIRED)**: the v1.4.0 release notes / changelog MUST foreground the connect-payload `node` block break as the **first** breaking-change item, with explicit "second break in two releases" framing for clients that already migrated to v1.3.0. Do not bury this under "in addition to" or list it after the `get_nodes_info` shape change. Recommended structure: a leading "Migration required" section that lists (a) which v1.3.0 fields are gone, (b) the new `path` shape with a tuple example, (c) a one-line code-diff snippet showing the rename. Communicating this prominently is the difference between integrators discovering the break in their CI vs. in production. The release notes MUST also list `scan_text_nodes` and `scan_nodes_by_types` as removed tools with migration guidance pointing to `get_nodes_info` with `filter`.

**`scan_text_nodes` removal:**
- **MCP tool deregistration**: remove the `server.tool("scan_text_nodes", ...)` block at [text.ts:281-358](../../src/mcp_server/tools/text.ts#L281). The `text_replacement_strategy` prompt ([text.ts:361-492](../../src/mcp_server/tools/text.ts#L361)) references `scan_text_nodes` in its example code; update to use `get_nodes_info({ nodeIds: ["node-id"], filter: { type: "TEXT" }, properties: ["characters"] })`.
- **Plugin handler removal**: remove the `scanTextNodes` export from [textHandlers.ts](../../src/figma_plugin/handlers/textHandlers.ts) and all internal helper functions that only serve `scan_text_nodes`.
- **Plugin dispatch removal**: remove the `case "scan_text_nodes"` at [main.ts:498-499](../../src/figma_plugin/src/main.ts#L498) and the `scanTextNodes` import at [main.ts:33](../../src/figma_plugin/src/main.ts#L33).
- **Test removal**: remove [text.test.ts](../../src/mcp_server/tests/unit/tools/text.test.ts) test cases for `scan_text_nodes` (lines 40, 80-93).

**`scan_nodes_by_types` removal:**
- **MCP tool deregistration**: remove the `server.tool("scan_nodes_by_types", ...)` block at [document.ts:86-160](../../src/mcp_server/tools/document.ts#L86). This is in the same file as `get_nodes_info` — just remove the tool block, no other tool in the file is affected.
- **Plugin handler removal**: remove the `scanNodesByTypes` export from [annotationHandlers.ts](../../src/figma_plugin/handlers/annotationHandlers.ts). Verify that the remaining annotation handlers (`getAnnotations`, `setMultipleAnnotations`) do not depend on `scanNodesByTypes` internally (they don't — they're independent).
- **Plugin dispatch removal**: remove the `case "scan_nodes_by_types"` at [main.ts:502-503](../../src/figma_plugin/src/main.ts#L502) and the `scanNodesByTypes` import at [main.ts:34](../../src/figma_plugin/src/main.ts#L34).
- **Prompt update**: update the `annotation_conversion_strategy` prompt ([annotations.ts:186-342](../../src/mcp_server/tools/annotations.ts#L186)) to replace both `scan_text_nodes` (Step 2, line 232) and `scan_nodes_by_types` (Step 3, line 256) references with `get_nodes_info` equivalents.

**`get_components`:**
- **Plugin handler (`getComponents`)**: [src/figma_plugin/handlers/componentHandlers.ts:54-87](../../src/figma_plugin/handlers/componentHandlers.ts#L54) — for `scope: 'document'`, replace the `figma.loadAllPagesAsync()` + `figma.root.findAllWithCriteria(...)` block with a `for (const page of figma.root.children)` loop that does `await page.loadAsync()`, runs `page.findAllWithCriteria({ types: ["COMPONENT"] })`, applies `filter`, accumulates results, emits `sendProgressUpdate` with running totals, and yields via `await new Promise(r => setTimeout(r, 0))`. Bookend with `started` / `completed`. `scope: 'current_page'` keeps its current single-pass shape.
- **MCP tool registration**: [src/mcp_server/tools/components.ts:12-44](../../src/mcp_server/tools/components.ts#L12) — **MUST** extend the `scope: 'document'` description copy to mention progress streaming (e.g., *"Optimized to stream progress page-by-page, making it safe to use even on very large files without timing out."*); no schema change required.

**`get_variables`:**
- **Plugin handler (`getVariables`)**: [src/figma_plugin/handlers/variableHandlers.ts:369-386](../../src/figma_plugin/handlers/variableHandlers.ts#L369) — wrap the existing `for (const page of figma.root.children)` page loop with a `sendProgressUpdate` emission per iteration plus the trailing `await new Promise(r => setTimeout(r, 0))`. Bookend with `started` / `completed` events. Keep `findStyleConsumers` / `findAliasConsumers` running concurrently outside the page loop as today. `includeConsumers: 'current_page'` and lookup/discovery modes are untouched.
- **MCP tool registration**: [src/mcp_server/tools/variables.ts:8-47](../../src/mcp_server/tools/variables.ts#L8) — optionally extend the `includeConsumers: 'document'` description copy to mention progress streaming; no schema change required.

## Open Design Questions: Filter Parameter

The following questions remain open regarding the `filter` implementation and will be resolved during the implementation phase:

1.  ~~**Valid Filter Keys**~~ — **RESOLVED**: `filter` accepts the same set of property names as `properties` — i.e., any property name on the Figma node, both safe-list and non-safe-list. The cost implications are documented in the "Filtering" section ("Cost depends on filter key safe-list status") and in the per-iteration cost model: safe-list filter keys are evaluated via direct property reads (cheap), non-safe-list filter keys require `exportAsync` per candidate descendant in the subtree (the most expensive matching path, since every candidate must export — not just retained ones). The MCP tool description is required to warn the LLM about both parameters explicitly.
2.  ~~**OR Logic / Array Values**~~ — **RESOLVED**: `type` and `layoutMode` accept an array of strings for OR matching within the field (e.g., `"type": ["FRAME", "COMPONENT"]`). These are the only two keys that support array values — both are enum-like safe-list properties where subset selection is a natural workflow. `type` is the primary use case (fully replacing the now-removed `scan_nodes_by_types`); `layoutMode` enables "all auto-layout frames" queries. All other filter keys remain strict-equality only. No performance cost — the evaluation is an `Array.includes()` check on a small array, and both keys stay on the safe list. See the updated "Criteria" bullet in the "Filtering" section.
3.  **Complex Matching**: Do we need more than simple equality? (e.g., regex for name). Initial implementation will stick to strict equality to avoid complexity.
