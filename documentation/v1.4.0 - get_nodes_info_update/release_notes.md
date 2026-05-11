# v1.4.0 Release Notes

**⚠️ Migration Required: Second Breaking Change to Connect Payload in Two Releases**

We apologize for the churn, but v1.4.0 introduces a second breaking change to the `getConnectPayload` (node-scope) schema. For clients that just migrated to v1.3.0, the flat metadata fields introduced in that release have been removed and replaced with a structured `path` array.

This break must be addressed immediately by any integrators relying on the `node` block returned during plugin initialization or channel join.

### 1. Connect Payload `node` Block Changes

**Removed Fields (v1.3.0):**
The following fields have been removed from the `node` block:
- `containingPageId`
- `containingPageName`
- `parentNodeId`
- `parentNodeName`

**New Field (v1.4.0): `path`**
These have been replaced by a `path` array, which represents the full ancestor chain from the containing page down to the immediate parent. Each element in the array is a 3-tuple of `[type, id, name]`.

*Example shape:*
```json
"path": [
  ["PAGE", "0:1", "Page 1"],
  ["FRAME", "10:2", "Hero Section"],
  ["GROUP", "15:4", "Button Group"]
]
```

**New Field (v1.4.0): `descendantCount`**
Both page-scope and node-scope payloads now include a `descendantCount` integer representing the total recursive descendants of the scope root.

*Code Diff Example for Integrators:*
```diff
- const pageId = payload.node.containingPageId;
+ const pageId = payload.node.path[0][1]; // path[0] is always the PAGE
```

---

### 2. `get_nodes_info` Overhaul

The `get_nodes_info` tool has been completely redesigned to support deep recursive traversal, powerful filtering, and exact property selection, avoiding the need for multiple tool calls to scan documents.

**API Changes:**
- **`properties` renamed to `fields`**: The parameter for requesting specific node properties is now `fields` to align with standard REST API conventions.
- **New `filter` parameter**: You can now pass a filter object (e.g., `{ type: ["TEXT", "FRAME"] }`) to prune the traversal tree. Only nodes matching the filter or containing descendants that match the filter are retained.
- **New `maxDepth` parameter**: Cap the depth of recursive traversal to protect performance on large subtrees (e.g., `maxDepth: 2`).

**Response Shape Changes:**
- `get_nodes_info` now returns recursive `children` arrays, mirroring the Figma document structure, rather than a flat list.
- Top-level and boundary nodes include `descendantCount`.
- Non-requested properties are fully omitted rather than returned as `null`.

---

### 3. Tool Removals

Two legacy scanning tools have been entirely removed in favor of the new `get_nodes_info` capabilities. There is no deprecation shim; calls to these tools will fail with an "unknown tool" error.

**`scan_nodes_by_types` (REMOVED)**
*Migration:* Use `get_nodes_info` with the `filter` parameter.
```diff
- scan_nodes_by_types({ nodeId: "X", types: ["COMPONENT", "FRAME"] })
+ get_nodes_info({ nodeIds: ["X"], filter: { type: ["COMPONENT", "FRAME"] } })
```

**`scan_text_nodes` (REMOVED)**
*Migration:* Use `get_nodes_info` with `filter` and `fields`.
```diff
- scan_text_nodes({ nodeId: "X" })
+ get_nodes_info({ nodeIds: ["X"], filter: { type: "TEXT" }, fields: ["characters"] })
```

---

### 4. Progress Streaming

All potentially slow traversal operations (like `get_nodes_info` with high depth, or large `get_pages_info` requests) now stream `progress_update` events back to the client. This prevents timeout errors and provides UI feedback for large document processing.
