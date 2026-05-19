# Implementation Plan: `get_nodes_info` Update (v1.4.0)

This plan outlines the step-by-step tasks to implement the v1.4.0 update for `get_nodes_info`, including the breaking shape changes, performance optimizations, and tool consolidation. Every task traces back to the [spec](./get_nodes_info_update_spec.md); the [review](./get_nodes_info_update_review.md) confirms all open items are resolved.

> **Scope boundary**: `delete_variables` consumer scan is explicitly **out of scope** (spec §Out of scope). Per-node structured errors and bounded-parallelism streaming are also deferred.

---

## Phase 0: Infrastructure & Constants

- [x] **0.1 — Define Property Safe-List Constant**: Create a central `SAFE_LIST_PROPERTIES: ReadonlySet<string>` constant in `figma_plugin/utils/nodeUtils.ts` (or co-located with the handler). Enumerate all categories from spec §Safe-list properties: identity & structure, visibility, geometry & transform, auto-layout, constraints, corner radius, fills & strokes, effects, text, component/instance, prototyping, variables, export & dev metadata. This SAME constant is used to classify both `properties` array items AND `filter` dictionary keys.
- [x] **0.2 — Shared TypeScript Types**: Define types for the new response shapes:
    - `PathTuple = [type: string, id: string, name: string]` (named-tuple per spec §Schema implementation note).
    - `ChildEntry = { id: string; name: string; type: string; children: ChildEntry[]; descendantCount?: number; properties?: Record<string, unknown> }` — `descendantCount` is `optional` (present only on `maxDepth` boundary nodes; absent on interior descendants). `properties` is `optional` (present only when the request `properties` array is non-empty).
    - `NodeEntry = { nodeId: string; nodeName: string; type: string; descendantCount: number; path: PathTuple[]; children: ChildEntry[]; properties?: Record<string, unknown> }` — `descendantCount` always required on top-level entries.
    - `GetNodesInfoResponse = { nodes: NodeEntry[]; missingNodeIds?: string[] }` — the new response envelope (was a bare array).
- [x] **0.3 — Zod Schema (Compile-Time Only)**: Define a Zod schema for `GetNodesInfoResponse` using `z.lazy(() => ChildSchema)` for the recursive `children`. **CRITICAL**: this schema is for TypeScript compile-time type safety ONLY — it MUST NOT be passed as `outputSchema` in `server.tool()` or `server.registerTool()` registration. The MCP SDK runs `safeParseAsync` on every response when `outputSchema` is present; on a `PAGE`-scoped response (10k+ nodes), this adds overhead and — if validation fails on any node — silently discards the entire response. `descendantCount` on `ChildSchema` must be `z.number().optional()`.
- [x] **0.4 — Path Utility**: Implement a helper function `buildPathArray(node: BaseNode): PathTuple[]` to walk `node.parent` up to the containing page, returning the ancestor chain as 3-tuples `[type, id, name]`. Pages return `[]`. Direct children of a page return `[[pageType, pageId, pageName]]`. The node itself is NOT included in `path`.
- [x] **0.5 — Descendant Count Utility**: Implement `countDescendants(node: BaseNode): number` — a synchronous recursive walk of `node.children` that counts all descendants (not including the node itself). No `exportAsync`, no property reads — just counting. <1ms on a 10k-node page.

### ✅ Checkpoint: `bun run build:all`
Verify new types, Zod schemas, and utility functions compile cleanly before building on them. All existing tests should still pass (Phase 0 is purely additive).

---

## Phase 1: `get_nodes_info` Plugin Handler Rewrite

### 1.1 — Core Handler Structure

- [x] **Rewrite `getNodesInfo`** in `figma_plugin/handlers/nodeReaders.ts` (starting at line ~133). Accept new parameters: `nodeIds`, `properties`, `filter`, `maxDepth` (optional, default `undefined` = unlimited).
- [x] **Preserve `getNodeByIdAsync` resolution** — the existing `Promise.all(nodeIds.map(figma.getNodeByIdAsync))` pattern is already compliant with the "MUST NOT call `loadAllPagesAsync()`" rule (spec §Loading rule 1). Keep it.
- [x] **Input deduplication and ordering**: Deduplicate `nodeIds` first-occurrence. `nodes[i]` corresponds to the i-th resolvable id in the deduped input. `missingNodeIds` lists unresolved ids in the order they first appeared in the deduped input (spec §Ordering and deduplication).
- [x] **Missing nodes accumulator**: Nodes where `figma.getNodeByIdAsync(id)` returns `null` (not found, different document, unreachable) are added to `missingNodeIds`. The call does NOT fail — this is silent-skip (spec §Missing nodes).
- [x] **Response envelope**: Return `{ nodes: [...], missingNodeIds?: [...] }`. Omit `missingNodeIds` when every id resolves. This is a **breaking change** from the old bare-array response.
- [x] **Error response**: Single failure mode — unexpected exception surfaces as thrown error. No per-node error envelope. Partial failures during streaming are treated as missing entries, not envelope errors (spec §Error response).

### 1.2 — Empty-Args Behavior

- [x] **Empty-args dispatch**: `get_nodes_info()` with no/empty `nodeIds` is treated as a single-id call where the id is the editable-scope id captured at connect time. Route through the SAME handler path as a single-id call (do NOT short-circuit to a no-streaming branch — a `PAGE`-scoped editable will block the sandbox without progress events).
- [x] **Read-only mode**: Return `{ nodes: [] }` immediately with no plugin work — no resolution, no streaming, no events.
- [x] **Update empty-args dispatch** in `figma_plugin/src/main.ts` (line ~480-491) to use the new envelope shape and route through the unified handler path.

### 1.3 — Recursive Children Walk

- [x] **Implement recursive `children` mapping**: Each descendant entry is `{ id, name, type, children }`. The walk is synchronous (reading `node.children`, `node.type`, `node.name`) and does NOT load additional pages.
- [x] **`maxDepth` enforcement**: Track current depth during the walk (top-level entry = depth 0, its children = depth 1, etc.):
    - When `currentDepth === maxDepth`: set `children: []` on the node and compute `descendantCount` via `countDescendants()`.
    - Interior nodes (above the boundary) do NOT carry `descendantCount`.
    - When `maxDepth` is `undefined`: recurse fully, no depth tracking beyond the existing walk.
- [x] **`descendantCount` on top-level entries**: Always present, always the total recursive descendant count. Computed during the walk.
- [x] **`descendantCount` reflects unfiltered subtree size**: When a `filter` is active, `descendantCount` is the **total** descendant count regardless of filter — not the filtered count. This lets the LLM compare full scope vs. filtered `children`.
- [x] **Build `path` array**: Call `buildPathArray(node)` for each top-level entry. Descendants do NOT carry `path` (their position is encoded structurally).

### 1.4 — Filtering

- [x] **Filter scope**: Applied recursively across the entire subtree of each requested node. Does NOT filter the requested `nodeIds` themselves.
- [x] **AND logic**: All keys in the `filter` dictionary must match.
- [x] **OR logic for `type` and `layoutMode`**: These two keys accept an array of strings for OR matching (e.g., `"type": ["FRAME", "COMPONENT"]`). `Array.includes()` check. All other keys accept single values only — passing an array for other keys is a no-op (matches nothing).
- [x] **Ancestor passthrough pruning**: A descendant is included if it matches the filter OR any node in its subtree matches. Non-matching ancestors of a match are retained as containers. Non-matching nodes with no matches below them are pruned entirely.
- [x] **Filter + `maxDepth` interaction**: Filter evaluation only runs within the `maxDepth` window. Nodes below `maxDepth` are never visited, so filter matches deeper than the depth cap are invisible.
- [x] **Filter cost classification** (uses the same safe-list constant from Phase 0):
    - **All-safe-list filter keys**: Evaluate via direct property reads. No `exportAsync` on any candidate.
    - **Any non-safe-list filter key**: MUST call `exportAsync({ format: "JSON_REST_V1" })` on **every candidate descendant** in the subtree (before pruning) to evaluate the predicate. This is more expensive than the `properties` export path.

### 1.5 — Property Extraction

- [x] **Safe-list classifier**: Before per-node assembly, classify each name in `properties` against the safe-list:
    - **All-safe**: Populate `properties` via direct property reads per node. No `exportAsync`.
    - **Any non-safe**: Fall back to `exportAsync` per node retained in the response tree (top-level + descendants + filter passthrough containers).
    - **Unrecognized names**: Silently dropped from response `properties`. Do NOT force the export fallback — unrecognized names are ignored when deciding the cost path.
- [x] **`properties` block presence**: Only present when the request `properties` array is non-empty (`properties.length > 0`). When omitted or empty, no `properties` block on any node.
- [x] **`properties` on every node**: When present, attached to top-level entries AND every included descendant in `children`.
- [x] **Inapplicable property keys are omitted**: e.g., `characters` is omitted for a `FRAME` even if requested. Never return `null` or `undefined` — just exclude the key.
- [x] **Structural fields excluded from `properties`**: `id`, `name`, `type`, `children`, `path` are silently excluded even if requested. These live at the structured fields level.
- [x] **`mainComponent` async handling**: On `InstanceNode`, direct read is sync except in `dynamic-page` manifest mode, which requires `getMainComponentAsync()`. Handler MUST detect manifest mode and use the async accessor. Still avoids `exportAsync`, but is a per-instance async hop.

### 1.6 — Export Cache

- [x] **Per-call cache**: When both `filter` and `properties` trigger the export path, maintain a `Map<string, ExportResult>` keyed by node id. Look up the cache before issuing any `exportAsync`. Each node is exported at most once per call. Cache is per-call, not session-wide.

---

## Phase 2: Progress & Streaming (Read Tools Consistency)

### 2.1 — `get_nodes_info` Streaming

- [x] **Multi-id streaming (rule 2)**: For each requested id (after dedup, in input order):
    1. Resolve via `figma.getNodeByIdAsync(id)` (resolution can be batched via `Promise.all` up front).
    2. Assemble the per-node entry (path, children walk, filter, properties).
    3. Push entry into `nodes`.
    4. Emit `command_progress` event (`status: "in_progress"`) with running totals.
    5. `await new Promise(r => setTimeout(r, 0))` before the next iteration.
- [x] **Intra-subtree streaming (MUST, not SHOULD)**: When **either** export path is active, when `getMainComponentAsync()` is active, OR the structural walk is large (> ~250 nodes), MUST emit every ~25 descendants:
    1. `await sendProgressUpdate(...)` with running totals (`{ nodesProcessed, nodesTotalEstimate, exportsIssued }`).
    2. `await new Promise(r => setTimeout(r, 0))` to flush the sandbox.
    - **Both calls are REQUIRED, in that order.** `setTimeout(0)` alone keeps the sandbox responsive but does NOT reset the MCP server's 60s inactivity timeout. `sendProgressUpdate` alone without yielding gets coalesced.
- [x] **Single-id calls** (`nodeIds.length === 1`): No per-iteration streaming between top-level entries (only one). But the intra-subtree pair still applies per the rules above.
- [x] **Empty-args calls**: Treated as single-id — inherits all single-id streaming rules. A `PAGE`-scoped editable is the worst case and MUST emit progress events.
- [x] **Bookend events**: EVERY call shape (multi-id, single-id, empty-args) must emit `started` and `completed` events. Read-only mode is the only exception.
- [x] **`await` on every `sendProgressUpdate`**: A missed `await` silently bypasses the flush and reintroduces the coalescing bug. Every handler MUST be `async` and MUST `await` every call.
- [x] **Verify `state.activeRequestId` capture**: Confirm the v1.3.0 `state.activeRequestId` in `figma_plugin/ui.html` is intact — `message.id` captured from inbound `broadcast` messages, pinned onto outbound `progress_update` payloads, cleared on `command-result` / `command-error`. Without it, concurrent read requests can have progress events mis-correlated.

### 2.2 — `get_components` Optimization

- [x] **Remove `figma.loadAllPagesAsync()`** from `figma_plugin/handlers/componentHandlers.ts` (line ~60-64).
- [x] **Implement page-by-page iteration** for `scope: 'document'`: `for (const page of figma.root.children)` → `await page.loadAsync()` → `page.findAllWithCriteria({ types: ["COMPONENT"] })` → apply `filter` → accumulate → emit `sendProgressUpdate` (`{ pagesProcessed, pagesTotal, componentsFound }`) → `await new Promise(r => setTimeout(r, 0))`.
- [x] **Bookend with `started` / `completed` events**.
- [x] **`scope: 'current_page'` is unchanged** — single-pass, no progress emission, no `setTimeout(0)` yield.
- [x] **Result ordering is now page-then-document-order** (not the legacy document-order traversal). This is classified non-breaking (spec §get_components rule 4).

### 2.3 — `get_variables` Optimization

- [x] **Add streaming for `includeConsumers: 'document'`** in `figma_plugin/handlers/variableHandlers.ts` (line ~369-386): wrap the existing page loop with `sendProgressUpdate` per iteration (`{ pagesProcessed, pagesTotal, consumersFound }`) + trailing `await new Promise(r => setTimeout(r, 0))`.
- [x] **Bookend with `started` / `completed` events**.
- [x] **`findStyleConsumers` / `findAliasConsumers` stay outside** the streamed loop, run concurrently as today.
- [x] **`includeConsumers: 'current_page'`** is single-page, does not stream. Lookup/discovery modes (no `variableId`, or no `includeConsumers`) are unchanged.
- [x] **No soft batch guidance on `variableId`** — cost driver is per-page consumer walk, not `variableId.length`. Deliberately omitted from tool description.

### ✅ Checkpoint: `bun run build:all`
Phases 1+2 rewrite the plugin handler and add streaming. Verify the plugin compiles. Existing tests **will fail** — they assert the old `{ nodeId, parentId, document }[]` response shape and reference `scan_text_nodes` / `scan_nodes_by_types`. Those failures confirm the breaking changes are real; they'll be fixed in Phase 6.

---

## Phase 3: Connect Payload & Page Info Updates

### 3.1 — Connect Payload Update

- [x] **Update `getConnectPayload`** in `figma_plugin/handlers/connectHandlers.ts`:
    - Replace `parentNodeId` / `parentNodeName` / `parentNodeType` / `containingPageId` / `containingPageName` with the `path` array (reuse `buildPathArray` from Phase 0).
    - Add `descendantCount` to **both** page-scope and node-scope payloads (computed via `countDescendants()`).
    - **Read-only mode does NOT include `descendantCount`** — pages are not loaded, forcing `loadAsync` on every page would defeat the cheap discovery contract.
    - **Connect payload `children` stays top-level only** — each entry `{ id, name, type }`, no `properties`, no recursive children. The connect path stays cheap by design.

### 3.2 — `get_pages_info` Update

- [x] **Add `descendantCount` to per-page entries** when `pageIds` are provided. After `await node.loadAsync()`, compute via `countDescendants()`. Add to the entry alongside `pageId`, `pageName`, `children`.
- [x] **No-args / empty-array calls MUST NOT include `descendantCount`** — these return `{ pageId, pageName }` only, no children, no page loading. Adding `descendantCount` would require `loadAsync` on every page, defeating the cheap discovery contract from v1.3.0.

### 3.3 — Connect-Flow Consistency Check

- [x] **Verify** that the connect payload's `node` block and `get_nodes_info` per-node entry produce identical `nodeId` / `nodeName` / `type` / `path` / `descendantCount` for the same node id.
- [x] **Verify** the connect payload's `children` equals the first level of `get_nodes_info`'s `children` (called without `properties`) with the recursive `children` field stripped.
- [x] **Document** that connect payload does NOT adopt descendant-`properties` behavior.

---

## Phase 4: MCP Server Tool Registration

### 4.1 — Update `get_nodes_info` Registration

- [x] **Update input Zod schema** in `src/mcp_server/tools/document.ts` (line ~42-83):
    - Add `filter` parameter — an object where keys are property names, values are strings or (for `type` and `layoutMode` only) arrays of strings.
    - Add `properties` parameter — array of strings (field names).
    - Add `maxDepth` parameter — `z.number().int().min(0).optional()` with no default (omission = unlimited). Description: *"Maximum depth of `children` recursion. 0 = no children (identity + descendantCount only). 1 = direct children only. Omit for full subtree. Nodes at the depth boundary carry `descendantCount` so you can distinguish truncated nodes from genuine leaves."*
- [x] **Update response handling** to expect the new envelope shape `{ nodes: [...], missingNodeIds?: [...] }`.
- [x] **Do NOT pass `outputSchema`** in the tool registration (Phase 0.3 constraint).
- [x] **Implementation MUST NOT cap, truncate, warn, log, or emit telemetry on oversize `nodeIds` input.** The 25-id figure is description-only.
- [x] **MANDATORY — Rewrite tool description** to include ALL 8 items from the spec's Required tool description content (CHECKLIST):
    1. **Response shape**: Recursive `children`, `properties` sub-object on every node, inapplicable keys omitted (not `null`), `maxDepth` boundary nodes carry `descendantCount`.
    2. **Filter behavior**: Recursive with ancestor passthrough, filter only within `maxDepth` window.
    3. **Path shape**: Array of 3-tuples `[type, id, name]`, pages have `path === []`.
    4. **Latency warning — non-safe-list**: Both `properties` and `filter` can independently trigger `exportAsync`. Non-safe `filter` exports every *candidate* (worse than non-safe `properties` which exports only *retained* nodes).
    5. **Cost framing — batch by subtree size, not id count**: Single `PAGE`-level id ≈ thousands of leaf ids in cost. Use `maxDepth` to bound.
    6. **Safe-list enumeration**: Enumerate or reference by category.
    7. **`missingNodeIds` inspection**: MUST instruct LLM to check on every call, treat absence from `nodes` as authoritative, surface to user.
    8. **Recommended pairings**: Non-safe `properties` + tight `nodeIds` or safe-list `filter`.
- [x] **Post-write verification**: Re-read the description as the LLM. Can you tell that a `PAGE` id is much more expensive than a leaf id? That non-safe `filter` > non-safe `properties` in cost? That `missingNodeIds` is the only signal for unresolved ids? If not, revise.

### 4.2 — Update `get_components` Registration

- [x] **Update description** in `src/mcp_server/tools/components.ts` to explicitly note that `scope: 'document'` now streams progress page-by-page and survives the 60s inactivity timeout on large files.

### 4.3 — Update `get_variables` Registration

- [x] **Extend** `includeConsumers: 'document'` description in `src/mcp_server/tools/variables.ts` to mention progress streaming. No schema change required.

### ✅ Checkpoint: `bun run build:all`
MCP server registration is now aligned with the plugin handler. Both sides compile against the new response shapes. Tests still fail (old shape assertions, removed tool references not yet cleaned up) — that's expected until Phases 5+6.

---

## Phase 5: Cleanup & Deprecation

### 5.1 — Remove `scan_text_nodes`

- [x] Delete tool registration (`server.tool("scan_text_nodes", ...)`) at `src/mcp_server/tools/text.ts` (line ~281-358).
- [x] Delete plugin handler (`scanTextNodes` export) from `figma_plugin/handlers/textHandlers.ts` and any internal helpers that only serve `scan_text_nodes`.
- [x] Remove dispatch case (`case "scan_text_nodes"`) at `figma_plugin/src/main.ts` (line ~498-499).
- [x] Remove `scanTextNodes` import at `figma_plugin/src/main.ts` (line ~33).
- [x] Remove test cases for `scan_text_nodes` in `src/mcp_server/tests/unit/tools/text.test.ts` (lines ~40, 80-93).

### 5.2 — Remove `scan_nodes_by_types`

- [x] Delete tool registration (`server.tool("scan_nodes_by_types", ...)`) at `src/mcp_server/tools/document.ts` (line ~86-160).
- [x] Delete plugin handler (`scanNodesByTypes` export) from `figma_plugin/handlers/annotationHandlers.ts`. Verify remaining annotation handlers (`getAnnotations`, `setMultipleAnnotations`) do not depend on it.
- [x] Remove dispatch case (`case "scan_nodes_by_types"`) at `figma_plugin/src/main.ts` (line ~502-503).
- [x] Remove `scanNodesByTypes` import at `figma_plugin/src/main.ts` (line ~34).

### 5.3 — Update Prompts

- [x] **`text_replacement_strategy`** prompt in `text.ts` (line ~361-492): Replace `scan_text_nodes(nodeId: "node-id")` with `get_nodes_info({ nodeIds: ["node-id"], filter: { type: "TEXT" }, properties: ["characters"] })`.
- [x] **`annotation_conversion_strategy`** prompt in `annotations.ts` (line ~186-342): Replace both `scan_text_nodes` (Step 2, line ~232) and `scan_nodes_by_types` (Step 3, line ~256) references with `get_nodes_info` equivalents per the migration tables in the spec.
- [x] **Prompt-string sweep**: Grep for and update ALL occurrences across `src/mcp_server/tools/*.ts` and any system prompts:
    - `document.fills`, `document.layoutMode`, `document.children`, `document.<anything>` → `properties.<field>`
    - `parentId`, `parentNodeId`, `parentNodeName`, `parentNodeType` → `path` references
    - `containingPageId`, `containingPageName` → `path[0]` references
    - `scan_text_nodes`, `scan_nodes_by_types` → `get_nodes_info` equivalents
- [x] **Specific files to check**: `src/mcp_server/tools/annotations.ts`, `src/mcp_server/tools/components.ts`, and any other tool description files referencing `document.<field>` paths.

### ✅ Checkpoint: `bun run build:all` + `bun test`
Removals are the riskiest step for dangling imports. Build verifies no broken references. Test run verifies old scan-tool tests are removed and prompt updates don't break other tests. This is the first point where the full suite should pass (the v1.3.0 regression tests that need updating will be handled in Phase 6).

---

## Phase 6: Testing & Validation

### 6.1 — Unit Tests

- [x] **Safe-list classifier**: Test that all safe-list properties return `true`, non-safe properties return `false`, unrecognized names return `false` (but do not force export fallback).
- [x] **Path builder**: Test page nodes return `[]`, direct children of a page return one element, deeply nested nodes return the full ancestor chain (page first, immediate parent last), node itself is not in `path`.
- [x] **Descendant count**: Test leaf nodes return `0`, nodes with known subtrees return exact counts.
- [x] **Filter logic**: Test AND matching, OR matching for `type` and `layoutMode`, array value on non-`type`/`layoutMode` keys is a no-op, ancestor passthrough pruning.
- [x] **Input deduplication**: Test first-occurrence dedup, ordering preserved.

### 6.2 — Integration / Regression Tests

- [x] **New `get_nodes_info` response shape**: Verify the `{ nodes, missingNodeIds }` envelope replaces the bare array.
- [x] **`missingNodeIds` silent-skip**: Verify unresolved ids appear in `missingNodeIds`, resolved ids appear in `nodes`, ordering matches deduped input.
- [x] **`descendantCount` accuracy**: Verify correct counts on top-level entries, on `maxDepth` boundary nodes, and absence on interior descendants.
- [x] **`maxDepth` truncation**: Verify `maxDepth: 0` returns no children, `maxDepth: 1` returns direct children only with `descendantCount` on each, `maxDepth: N` returns N levels deep with boundary nodes carrying `descendantCount`.
- [x] **Filter + `maxDepth` interaction**: Verify filter only evaluates within the depth window — matches below `maxDepth` are invisible.
- [x] **Boundary-node `descendantCount` vs leaf nodes**: Verify truncated nodes (`descendantCount: 12, children: []`) are distinguishable from genuine leaves (`descendantCount: 0, children: []`).
- [x] **`properties` on inapplicable nodes**: Verify keys are omitted (not `null` or `undefined`) for nodes where the property doesn't apply (e.g., `characters` on `FRAME`).
- [x] **Export cache reuse**: Verify a node is exported at most once when both `filter` and `properties` trigger the export path.
- [x] **Empty-args**: Verify empty-args routes through the same handler path as single-id, verify `PAGE`-scoped empty-args emits progress events.
- [x] **Read-only mode**: Verify returns `{ nodes: [] }` immediately with no plugin work.
- [x] **Update v1.3.0 `{ nodeId, parentId, document }[]` regression test** — it MUST be updated or replaced to expect the new shape. It will fail under v1.4.0 and that's the point.
- [x] **Update v1.3.0 connect payload test** — update to expect `path` instead of `parentNodeId`, `parentNodeName`, `parentNodeType`, `containingPageId`, `containingPageName`.
- [x] **Connect-flow consistency snapshot test**: Verify connect payload and `get_nodes_info` produce identical `nodeId` / `nodeName` / `type` / `path` / `descendantCount` for the same node. Verify connect `children` equals first level of `get_nodes_info` `children` (without `properties`) with recursive `children` stripped.
- [x] **`get_components` ordering regression test** (REQUIRED by spec):
    - Fixture: at least 2 pages (recommended 3), each with multiple components (recommended 3 per page), deterministic names (`Page A` / `Page B` / `Page C`, `Comp-1` / `Comp-2` / `Comp-3`).
    - Call `get_components({ scope: 'document' })`.
    - Assert page-then-document-order: all components from `figma.root.children[0]` first, then `[1]`, etc.
    - Assert `pageId` populated correctly on every entry.
    - Place next to `get_pages_info` regression tests for co-location.
    - This fixture also serves as the smoke test for `loadAllPagesAsync` removal and streaming behavior.
- [x] **`get_pages_info` `descendantCount`**: Verify present when `pageIds` provided, absent for no-args calls.

### 6.3 — Manual Validation

- [ ] Verify streaming progress in the UI/Logs (bookend events, intra-subtree progress).
- [ ] Verify connect-payload migration in a test client (path array, descendantCount).
- [ ] Verify `scan_text_nodes` and `scan_nodes_by_types` return "unknown tool" error when called.

---

## Phase 7: Documentation & Release

- [x] **Update README.md**: Reflect tool removals (`scan_text_nodes`, `scan_nodes_by_types`) and the enhanced `get_nodes_info` capabilities (filter, properties, maxDepth).
- [x] **Draft Release Notes** with the following REQUIRED structure:
    1. **FIRST item — Connect payload `node` block break** (🚨): Explicitly framed as "the second breaking change to this contract in two releases." Include a "Migration required" section with:
        - (a) Which v1.3.0 fields are gone (`parentNodeId`, `parentNodeName`, `parentNodeType`, `containingPageId`, `containingPageName`).
        - (b) The new `path` shape with a 3-tuple example.
        - (c) A one-line code-diff snippet showing the migration.
    2. **`get_nodes_info` shape changes**: Top-level envelope change, per-node shape change, recursive `children` reshaping, `properties` semantics.
    3. **`scan_text_nodes` and `scan_nodes_by_types` removed**: Migration guidance pointing to `get_nodes_info` with `filter` (include migration tables from spec).
    4. **`get_components` ordering change**: Mention page-then-document-order, reference the regression test.
    5. **`get_pages_info` `descendantCount`**: New field on per-page entries when `pageIds` provided.
    6. **Streaming improvements**: `get_components` and `get_variables` now stream page-by-page.
