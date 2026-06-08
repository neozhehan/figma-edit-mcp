# Workflows

## The discover-before-acting pattern

Every workflow that touches a node should start with a read. There is no exception worth memorizing.

1. **Discover pages** with `page.info` to learn the page structure.
2. **Discover nodes** with `node.info({ nodeIds, filter, fields, maxDepth })` to get IDs, names, types, and any properties you need.
3. **Plan** the operation using the IDs and names from the read — verbatim, no transformation.
4. **Act** with the appropriate write tool.
5. **Verify** with another `node.info` (or `node.export_visual`) when the result matters.

**Anti-patterns to avoid:**

- Writing to an ID the user mentioned without first reading it. The ID may be stale; the user's name for it may be wrong.
- Reusing IDs across sessions. Node IDs are stable within a file, but the *scope* and *connection* are session-bound; re-verify each session.
- Skipping the read because "I just read it." The file is a shared editable document — the designer may have moved or renamed nodes between your read and your write. A `NAME_MISMATCH` means the document changed; re-read.

---

## Recipes

These are the canonical shapes. Adapt parameters; do not skip steps.

### Find and update text

```
1. page.info()                                          → find the page
2. node.info({ nodeIds: [pageId],
               filter: { type: "TEXT" },
               fields: ["characters", "name"] })         → list text nodes
3. text.set_content({ nodeId: parentId, text: [
     { nodeId, nodeName, text }, ...                     → names verbatim from step 2
   ]})
```

### Create a node inside a frame

```
1. node.info({ nodeIds: [frameId], maxDepth: 0 })       → confirm parent name
2. create.shape({ type: "RECTANGLE", parentId: frameId,
                  parentNodeName: <verbatim name>,
                  x, y, width, height })
```

### Modify a node by URL the user pasted

```
1. Pass the URL-format ID through unchanged (server normalizes dashes → colons)
2. node.info({ nodeIds: [urlId], maxDepth: 0 })          → discover real name
3. <write tool>({ nodeId: urlId, nodeName: <name from step 2>, ... })
```

### Bulk text replacement (large designs)

For replacing many text nodes safely, work in verifiable chunks rather than one giant call:

1. **Map the structure** — `node.info({ nodeIds: [rootId], filter: { type: "TEXT" }, fields: ["characters", "name"], maxDepth: 10 })`.
2. **Chunk** by logical grouping (table rows, card groups, form sections) — not arbitrarily.
3. **Optionally clone first** — `node.clone` the target to keep a safe copy while iterating.
4. **Replace a chunk** with one `text.set_content` call (names verbatim from step 1).
5. **Verify** that chunk with a small targeted export — `node.export_visual({ nodeId: chunkId, format: "PNG", scale: 0.5 })` — then fix issues before the next chunk.
6. **Final pass** — export the whole frame at a reduced scale to check cross-chunk consistency.

Scale exports down as chunks grow (≈1.0 for a few nodes, 0.3–0.5 for large groups) to keep responses small.
