# Workflows

## The discover-before-acting pattern

Every workflow that touches a node should start with a read. There is no exception worth memorizing.

1. **Discover pages** with `page_info` to learn the page structure.
2. **Discover nodes** with `node_info({ nodeIds, filter, properties, maxDepth })` to get IDs, names, types, and any properties you need.
3. **Plan** the operation using the IDs and names from the read — verbatim, no transformation.
4. **Act** with the appropriate write tool.
5. **Verify** with another `node_info` (or `node_export_visual`) when the result matters.

**Anti-patterns to avoid:**

- Writing to an ID the user mentioned without first reading it. The ID may be stale; the user's name for it may be wrong.
- Reusing IDs across sessions. Node IDs are stable within a file, but the *scope* and *connection* are session-bound; re-verify each session.
- Skipping the read because "I just read it." The file is a shared editable document — the designer may have moved or renamed nodes between your read and your write. A `NAME_MISMATCH` means the document changed; re-read.

---

## Editor Navigation (view_navigate)

You can navigate the editor view using **`view_navigate`**:
* **Page Target**: Pass a single `PAGE` node ID in `ids` to switch the user's active page. No selection is made.
* **Node Target(s)**: Pass one or more scene node IDs (which must all share the same containing page). The plugin will automatically switch to that page, select the nodes, and center the editor viewport on them (`scrollAndZoomIntoView`).

*Note*: Navigation is exempt from scope locks and works even in `READ_ONLY_MODE`.

---

## Visual Image Block Exports (node_export_visual)

When exporting nodes to verify changes visually, using `PNG` or `JPG` format is extremely powerful:
* The `node_export_visual` tool will return a **native MCP image block** containing the base64-encoded image and its correct MIME type (`image/png` or `image/jpeg`).
* Supporting MCP clients will automatically render this image inline within your chat response.
* Always request `PNG` or `JPG` when you need to visually verify a layout change or present the current design state to the user.
* Request `SVG` or `PDF` when you need the raw structural markup or a vector file format.

---

## Recipes

These are the canonical shapes. Adapt parameters; do not skip steps.

### Find and update text

```
1. page_info()                                          → find the page
2. node_info({ nodeIds: [pageId],
               filter: { type: "TEXT" },
               properties: ["characters", "name"] })         → list text nodes
3. text_set_content({ text: [
     { nodeId, nodeName, characters }, ...               → names verbatim from step 2
   ]})
```

### Create a node inside a frame

```
1. node_info({ nodeIds: [frameId], maxDepth: 0 })       → confirm parent name
2. create_shape({ type: "RECTANGLE", parentId: frameId,
                  parentNodeName: <verbatim name>,
                  x, y, width, height })
```

### Apply an image fill

```
1. (For large local images) resize manually if >45MP to avoid decode budget errors.
2. node_info({ nodeIds: [nodeId], maxDepth: 0 })         → confirm node name
3. node_set_fill({ nodeId, nodeName: <verbatim name>,
                   image: { bytesBase64: <base64 string> } })
```

### Modify a node by URL the user pasted

```
1. Pass the URL-format ID through unchanged (server normalizes dashes → colons)
2. node_info({ nodeIds: [urlId], maxDepth: 0 })          → discover real name
3. <write tool>({ nodeId: urlId, nodeName: <name from step 2>, ... })
```

### Bulk text replacement (large designs)

For replacing many text nodes safely, work in verifiable chunks rather than one giant call:

1. **Map the structure** — `node_info({ nodeIds: [rootId], filter: { type: "TEXT" }, properties: ["characters", "name"], maxDepth: 10 })`.
2. **Chunk** by logical grouping (table rows, card groups, form sections) — not arbitrarily.
3. **Optionally clone first** — `node_clone` the target to keep a safe copy while iterating.
4. **Replace a chunk** with one `text_set_content` call (names verbatim from step 1).
5. **Verify** that chunk with a small targeted export — `node_export_visual({ nodeId: chunkId, format: "PNG", scale: 0.5 })` — then fix issues before the next chunk.
6. **Final pass** — export the whole frame at a reduced scale to check cross-chunk consistency.

Scale exports down as chunks grow (≈1.0 for a few nodes, 0.3–0.5 for large groups) to keep responses small.
