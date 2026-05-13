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

### i. ~~`loadAsync` per page is uncached per call~~ — IGNORED (nitpick)
Originally flagged: both `get_components` and `get_variables` rules call `await page.loadAsync()` every iteration, and the first multi-page call on a cold session is O(pages × load latency).

Ignored: the cold-load cost is intrinsic to Figma's sandbox and unavoidable — you must call `loadAsync` to access a page's nodes. The spec already documents this correctly in the per-iteration cost section ("one-time cost the first time a given page is touched in the session"), and the streaming rules (progress events + `setTimeout(0)` yield between iterations) are specifically designed to keep the MCP timeout alive and the sandbox responsive during those cold loads. Session-scoped caching by Figma's sandbox handles repeat calls. Bounded parallelism (loading N pages concurrently) is already filed under "Out of scope (follow-up)." No spec or implementation change required.

### j. ~~Schema implementation note glosses over Zod's recursive type performance~~ — RESOLVED in spec
Originally flagged: the spec prescribes `z.lazy(() => ChildSchema)` for the recursive response type but doesn't clarify whether Zod `.parse()` runs on the outbound response path. For deep subtrees (10k+ nodes), recursive `safeParseAsync` would add measurable overhead, and — critically — the MCP SDK's `outputSchema` validation throws `McpError` and discards the entire response if any node in the tree fails validation.

Resolved by adding an explicit **"do NOT register an `outputSchema` on `get_nodes_info`"** implementation requirement to the schema note. The Zod schema is for compile-time type safety only. The spec now documents: (1) the SDK runs `safeParseAsync` on every response when `outputSchema` is present, making it an all-or-nothing reliability hazard on recursive shapes; (2) the LLM consumer reads text, not JSON Schema — the tool description checklist is the LLM-facing contract, and `outputSchema` provides no incremental benefit; (3) the prohibition is scoped to `get_nodes_info` specifically due to its recursive, variable-depth response, not a blanket rule for other tools.

### k. ~~No mention of memory ceiling on the response~~ — RESOLVED in spec
Originally flagged: a `PAGE`-scoped empty-args call could produce a JSON response of tens of MB. The spec acknowledged it'd be slow but didn't acknowledge the response-size ceiling.

Resolved by adding three complementary mechanisms: (1) **`descendantCount`** on the connect payload (page-scope and node-scope), `get_pages_info` (with pageIds), and `get_nodes_info` top-level entries — giving the LLM scope awareness at every decision point before committing to expensive calls; (2) **`maxDepth`** parameter on `get_nodes_info` (optional, default unlimited for backward compatibility) — giving the LLM a hard knob to bound response size (e.g., `maxDepth: 1` for a connect-payload-depth overview with `descendantCount` per child); and (3) **boundary-node `descendantCount`** — nodes at the `maxDepth` limit carry `descendantCount` so the LLM can distinguish truncated nodes from genuine leaves and decide whether to drill deeper. Together these address the memory ceiling: the LLM can predict cost via `descendantCount`, bound cost via `maxDepth`, and detect truncation at depth boundaries. Depth-bounded recursion is no longer out-of-scope; it is a v1.4.0 feature.

---

## 3. Open questions explicitly listed in the .md

The doc surfaces three open questions under "Open Design Questions: Filter Parameter":

1. ~~**Valid Filter Keys**~~ — **RESOLVED in spec.** The spec now states that `filter` accepts the same set of property names as `properties` (any Figma node property, both safe-list and non-safe-list). The cost implications are documented in the "Filtering" section ("Cost depends on filter key safe-list status"): safe-list keys evaluate via direct property reads, non-safe-list keys require `exportAsync` per candidate descendant. The MCP tool description checklist item 4 requires warning the LLM about both parameters.
2. ~~**OR Logic / Array Values**~~ — **RESOLVED in spec.** `type` and `layoutMode` now accept an array of strings for OR matching (e.g., `"type": ["FRAME", "COMPONENT"]`). These are the only two keys that support array values — both are enum-like safe-list properties where subset selection is a natural workflow. This closes the gap that blocked full `scan_nodes_by_types` replacement. No performance cost — the evaluation is an `Array.includes()` check on a small array, and both keys remain on the safe list.
3. ~~**Complex Matching**~~ — **IGNORED.** The spec already states strict equality only for v1.4.0. Regex on `name` is the only plausible use case, but it introduces parsing/validation complexity, catastrophic-backtracking risk on untrusted patterns, and a new error surface incompatible with the current silent-skip model. The LLM can achieve name-pattern matching by requesting `properties: ["name"]` with a broad `type` filter and reasoning over the results.

It also files three items under "Out of scope (follow-up)" that read more like deferred-but-known questions:

- ~~**Depth-bounded recursion**~~ — **RESOLVED in spec.** Promoted from "Out of scope" to a v1.4.0 feature as the `maxDepth` parameter. Default is unlimited (backward compatible). See review item 2k for the full resolution.
- ~~**Per-node structured errors**~~ — **IGNORED.** `exportAsync` rejection on a valid, resolvable node is theoretical — no reported occurrences. Already deferred in the spec's "Out of scope" section. If it becomes a real failure mode, it needs its own design pass (error schema, LLM guidance, streaming interaction).
- ~~**`get_nodes_info` streaming with bounded parallelism**~~ — **IGNORED.** Pure latency optimization for multi-id calls. The sequential approach is correct and safe; parallelism only reduces wall-clock time by overlapping `exportAsync` calls within batches. No semantic change, no response shape change. Correctly deferred in the spec's "Out of scope" section.

~~The most consequential gap is the absence of an explicit deprecation/retention statement for `scan_text_nodes` and `scan_nodes_by_types`~~ — **RESOLVED in spec.** Both tools are fully removed in v1.4.0 (no deprecation shim, no alias). The spec's new \"Tool removals\" section documents what each tool did, why it's removed, migration tables mapping old calls to `get_nodes_info` equivalents, and internal prompt dependencies that must be updated. Breaking changes summary lists both removals. Implementation pointers provide file-by-file deregistration steps (MCP registration, plugin handler, plugin dispatch, test cases, prompt strings).
