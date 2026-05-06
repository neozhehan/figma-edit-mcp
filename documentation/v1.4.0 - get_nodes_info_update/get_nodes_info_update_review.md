# Review: `get_nodes_info_update.md` (v1.4.0)

This document reviews the v1.4.0 spec at [get_nodes_info_update.md](./get_nodes_info_update.md), focusing on three questions:

1. How well does the new `filter` parameter replace `scan_text_nodes` / `scan_nodes_by_types`?
2. What pitfalls, gaps, or performance concerns are not fully addressed?
3. What open questions are explicitly listed?

---

## 1. Does `filter` negate the need for `scan_text_nodes` and `scan_nodes_by_types`?

**Yes — both legacy tools are now strict subsets of `get_nodes_info` with `filter` + safe-list `properties`.** The spec still doesn't explicitly state which scan tools are deprecated and which are retained, and that omission is the main gap worth raising.

### `scan_nodes_by_types` — strong replacement

The legacy tool ([document.ts:87](../../src/mcp_server/tools/document.ts#L87)) takes `{ nodeId, types }` and returns `{ id, name, type, bbox }` per match. Under v1.4.0:

```
get_nodes_info({
  nodeIds: [nodeId],
  filter: { type: "FRAME" },
  properties: ["absoluteBoundingBox"]
})
```

returns the same node-set with ancestor passthrough preserving the path to each match, and — because the spec now attaches `properties` to descendants and `absoluteBoundingBox` is on the safe list — each matched FRAME carries its own `properties.absoluteBoundingBox` populated via direct property read. No `exportAsync`, no follow-up call, no 25-id ceiling concern. Strict superset of the legacy tool on structure and on bbox data.

One remaining gap:

- **No multi-type matching.** `scan_nodes_by_types` accepts an array of types in one call. The spec's [Open Question #2](./get_nodes_info_update.md#L328) explicitly leaves array-valued `type` undecided, so today's "give me FRAMEs and COMPONENTs in one shot" workflow has no equivalent in the proposed shape.

### `scan_text_nodes` — strong replacement

Today ([textHandlers.ts:279](../../src/figma_plugin/handlers/textHandlers.ts#L279)) it returns `characters`, `fontSize`, `fontFamily`, `fontStyle`, `x/y/width/height` per text node, with **chunked progress events** (`chunkSize: 10`). Under v1.4.0:

```
get_nodes_info({
  nodeIds: [scope],
  filter: { type: "TEXT" },
  properties: ["characters", "fontSize", "fontName", "fontWeight",
           "lineHeight", "letterSpacing", "absoluteBoundingBox"]
})
```

returns each matched TEXT node with the full text-styling block in `properties`, in a single call. All requested properties are on the safe list, so no `exportAsync` runs at all — they're populated via direct property reads. Streaming progress events still fire on the top-level entry (and per-iteration in the subtree walk if implementations follow the SHOULD-yield-every-25 guidance). The 25-id ceiling is irrelevant because there's only one requested id.

Note that `style` is NOT on the safe list (it's a REST-shaped aggregate). Callers that want grouped style data should use the direct text properties above (`fontSize`, `fontName`, `lineHeight`, `letterSpacing`, etc.) which return identical data via direct reads. Requesting `style` would force the export-fallback path and add per-included-node `exportAsync` cost for no gain.

### Recommendation

The spec should state explicitly which scan tools are deprecated and which are retained. Both tools are now strict subsets of `get_nodes_info` with `filter` + safe-list `properties`, and keeping them around as ergonomic wrappers is fine but should be a documented choice — not an omission. The current ambiguity means a reader of the spec can't tell whether the scan tools are being retired or kept.

---

## 2. Other pitfalls, gaps, and performance concerns

### a. ~~The cost model contradicts itself on empty-args~~ — RESOLVED in spec
Originally flagged: the Overview section warned that PAGE empty-args is the worst case, while Loading & performance rule 3 described empty-args as "single resolution… No streaming, no extra loads." The contradiction meant a `PAGE`-scoped empty-args call could block the sandbox without progress signals.

Resolved by restructuring rules 2 and 3 around **work profile, not `nodeIds.length`**. Empty-args is now explicitly treated as a single-id call where the id is the editable scope, inherits the SHOULD-yield-every-25-descendants intra-subtree yield whenever an export path is active or the structural walk is large (> ~250 nodes), and MUST emit `started` / `completed` bookend events. The Empty-args section, the implementation pointer for the empty-args dispatch, and the per-iteration cost section all now agree. The "no streaming, no extra loads" claim has been corrected — it was true for a `node`-scoped editable on a small subtree, never for `PAGE`-scoped editables.

### b. ~~Recursive walk + sequential per-node assembly is doubly serial~~ — RESOLVED in spec
Originally flagged: progress events fired only between top-level ids, so a deep single-id walk (or a request of 25 frames each with a deep subtree) would block the sandbox AND let the 60s MCP inactivity timeout fire — the streaming guarantee weakened in exactly the case it was added for.

Resolved in two steps. First the SHOULD-yield-every-25-descendants intra-subtree yield was added (which mitigated the sandbox-blocking half). Then — closing the second half of the gap — the rule was upgraded to a MUST that requires BOTH `sendProgressUpdate` AND `setTimeout(0)` to be called, in that order, every ~25 descendants whenever either export path is active or the structural walk is large (> ~250 nodes). The progress emit is what resets the MCP server's inactivity timeout; the yield is what flushes the sandbox. Yielding alone is now explicitly called out as insufficient. Rule 2, rule 3 (single-id and empty-args branches), and the implementation pointer all now reference the paired requirement.

### c. ~~Filter is silently a no-op against `properties`~~ — RESOLVED in spec
Originally flagged: `filter: { type: "TEXT" }, properties: ["characters"]` would prune `children` but only attach `properties` to the requested top-level ID, leaving matched descendants without text content. The spec now attaches `properties` to every node in the response tree (top-level + descendants) when `properties` is non-empty, so the natural call works as written. The remaining nuance — that filter passthrough containers also receive `properties` — is documented in the "Cost implication" bullet at the spec's [Per-node entry, with `properties`](./get_nodes_info_update.md#L106) section.

### d. ~~`path` parsing rule has an edge case the spec dismisses~~ — RESOLVED in spec
Originally flagged: the pipe-delimited form (`"TYPE|ID|Name"`) had a load-bearing parsing invariant — types and IDs were assumed never to contain `|`. If Figma ever changed that, the parser would silently mis-split.

Resolved by switching `path` to an array of 3-tuples: `[[type, id, name], ...]`. JSON quoting handles all escaping concerns; there is no parser, no character invariant, and no edge case. Token cost lands ~50% above the pipe-form but ~45% below the keyed-object form — a sensible middle ground that keeps `path` cheap on token budget while removing the fragility. The positional convention (`[0]=type, [1]=id, [2]=name`) is documented in the spec's notes and at the type level via TypeScript named tuples (`Array<[type: string, id: string, name: string]>`).

### e. ~~Breaking the connect-payload `node` block is bundled silently~~ — RESOLVED in spec
Originally flagged: the spec mentioned the connect-payload break in passing under "in addition to," giving the same visual weight as the `get_nodes_info` shape change. Clients who only just migrated to v1.3.0's `parentNodeId` / `containingPageId` shape would discover the second break only by reading deep into the spec.

Resolved with three changes. (1) A prominent **"⚠️ Heads-up: back-to-back connect-payload break"** callout at the top of the Overview, before any other content. (2) The Breaking changes summary now leads with the connect-payload bullet (marked 🚨), explicitly framed as "the second breaking change to this contract in two releases," with `get_nodes_info` shape changes listed below it. (3) A REQUIRED implementation pointer for the release notes, mandating that the connect-payload break appear as the first changelog item with a "Migration required" section, a tuple example, and a code-diff snippet — so the foregrounding survives implementation and reaches integrators.

### f. ~~`missingNodeIds` silent-skip swallows a real bug class~~ — RESOLVED in spec
Originally flagged: silent-skip is the only signal for unresolved ids. A stale id from a prior turn would land in `missingNodeIds` and silently disappear from `nodes`, with no error envelope to flag it. The LLM, reading only `nodes`, wouldn't notice.

Resolved by making the tool-description instruction a **MUST**. The MCP tool registration implementation pointer now requires the description to (a) tell the LLM to inspect `missingNodeIds` on every call, (b) treat its absence from `nodes` as authoritative (no assumption that the id was renamed or is elsewhere in the response), and (c) surface unresolved ids back to the user rather than silently retrying or fabricating data. Recommended copy for the description is provided. The "Missing nodes (silent-skip)" section also adds a cross-reference bullet noting this LLM-facing requirement as the most likely failure mode for the surface, so the requirement isn't lost during implementation.

### g. ~~Soft-batch guidance — spec body is now accurate; tool description is the gap~~ — RESOLVED in spec
Originally flagged: spec body had the cost analysis right (subtree-size, not id-count), but the tool description was a single paragraph that wouldn't carry those nuances to the LLM. The implementation pointer required *some* description content but was easy to under-edit during implementation, leaving the model with a stale "25 per call" mental model.

Resolved by restructuring the MCP tool registration implementation pointer into a formal **Required tool description content (CHECKLIST)** with eight numbered MUST items. The implementer can verify each item is present in the final description text. Item 5 specifically addresses 2g: it requires the description to frame cost as "batch by expected subtree size, not by id count," explicitly states "a single `PAGE`-level id is roughly equivalent in cost to thousands of leaf-node ids," and provides recommended copy. Items 4 (latency warning), 5 (cost framing), and 7 (`missingNodeIds`) are flagged as load-bearing — the spec now explicitly says missing any of them recreates the failure modes this release was designed to prevent. A "Verification" closing paragraph asks the implementer to re-read the description as if it were a first-turn LLM, with three specific cost-prediction questions to confirm the description is complete.

### h. ~~`get_components` page-by-page rewrite changes ordering~~ — RESOLVED in spec
Originally flagged: the ordering change from document-order to page-then-document-order was classified non-breaking and only flagged in the release notes. An LLM workflow relying on stable ordering would silently break — no schema change, no error, just a different traversal.

Resolved by adding a **REQUIRED regression test** to the `get_components` rule 4 in the spec. The test must use a multi-page fixture (recommended: 3 pages × 3 components with deterministic names), call `get_components({ scope: 'document' })`, pin the exact expected page-then-document-order in the assertion, and verify `pageId` is populated correctly. The fixture doubles as the smoke test for the `loadAllPagesAsync` removal and the streaming behavior, so it's a single test that validates all three behavior changes in `get_components`. The release notes still flag the ordering change, now with a reference to the regression test so integrators can confirm their use case isn't affected.

### i. `loadAsync` per page is uncached per call
Both `get_components` and `get_variables` rules call `await page.loadAsync()` every iteration. Figma's sandbox caches loaded pages session-scoped, so this is cheap on repeat calls — but the first multi-page call on a cold session is still O(pages × load latency). Not a correctness issue, but the [per-iteration cost section at line 271](./get_nodes_info_update.md#L271) handwaves this as "first-load case."

### j. Schema implementation note glosses over Zod's recursive type performance
[Line 280](./get_nodes_info_update.md#L280) prescribes `z.lazy(() => ChildSchema)`. For deep subtrees on a `PAGE` (10k+ nodes), Zod's recursive `.parse()` against the response can be a measurable cost on the MCP server side, and Zod errors on nested shapes are notoriously hard to read. Worth a note about whether validation is on the request-parse path only, or also on the outbound side.

### k. No mention of memory ceiling on the response
A `PAGE`-scoped empty-args call could produce a JSON response of tens of MB of `{id, name, type, children}`. The MCP transport (stdio/WS) has practical limits — the spec acknowledges it'd be slow but doesn't acknowledge the response-size ceiling or any chunking on the response side. The depth-cap follow-up is the natural answer, but the v1.4.0 doc shouldn't ship without acknowledging that empty-args on a large PAGE is currently unsafe.

---

## 3. Open questions explicitly listed in the .md

The doc surfaces three open questions, all under "Open Design Questions: Filter Parameter" at [line 323](./get_nodes_info_update.md#L323):

1. **Valid Filter Keys** — should the filter strictly white-list "cheap" properties (`type`, `visible`, `name`, `locked`)? Allowing arbitrary keys would force `exportAsync` per descendant and break the performance model.
2. **OR Logic / Array Values** — should `type` accept an array (e.g. `"type": ["FRAME", "COMPONENT"]`) for OR matching within a field? (This is the one most relevant to fully replacing `scan_nodes_by_types`.)
3. **Complex Matching** — do we need beyond strict equality (e.g. regex on `name`)? Initial implementation will stick to strict equality.

It also files three items under "Out of scope (follow-up)" at [line 296](./get_nodes_info_update.md#L296) that read more like deferred-but-known questions:

- **Depth-bounded recursion** (`maxDepth` / leaf-count cap) for empty-args on PAGEs.
- **Per-node structured errors** alongside `missingNodeIds` if `exportAsync` rejection becomes a real failure mode.
- **`get_nodes_info` streaming with bounded parallelism** — currently sequential to allow progress events; future could chunk-parallel.

The most consequential gap is the absence of an explicit deprecation/retention statement for `scan_text_nodes` and `scan_nodes_by_types` — given the doc's framing, a reader can't tell whether the scan tools are being retired or kept as ergonomic wrappers.
