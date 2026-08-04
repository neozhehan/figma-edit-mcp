# v2.1.0 Enhancement Plan: Current Page Elimination, Bounded Parallelism, Atomicity, and MCP Image Blocks


This document outlines the implementation plan for the v2.1.0 release of `figma-edit-mcp`. This release introduces several critical enhancements to reliability, performance, safety, and client rendering.

---

## API Change Notice (informational)

> [!NOTE]
> **Strict `parentId` Requirement**: Making `parentId` a required parameter on all node creation tools (`create_shape`, `create_frame`, `create_text`, `create_svg`, `create_instance`) modifies the client-facing MCP API contract. Client workflows must discover parent containers (via `page_info` or `node_info`) before issuing creation calls. **No sign-off required** — the project has zero end-users and backwards compatibility is explicitly not a constraint for this release; this notice is informational only.
>
> This is primarily an **API-clarity** change, not a new safety guarantee. For any *editable* connection the plugin already rejects parentless creation: an editable connection always has a `scopeRootId`, and the dispatcher runs `checkScopeAccess(params.parentId)` before the handler — with `parentId` omitted this resolves `getNodeByIdAsync(null) → null` and throws `PARENT_OUTSIDE_SCOPE`. The `figma.currentPage` fallback inside the creation handlers is therefore already unreachable for scoped connections. This change removes that dead fallback and surfaces the requirement at the schema layer so agents fail fast with a clear message.

## Decisions

> [!NOTE]
> **Partial Mutation Recovery**: Since Figma's plugin API lacks transaction rollback capabilities, a mutation failure mid-run (e.g., font loading timeout on the 3rd of 5 text replacements) leaves the document in a partially updated state.
> * *Decision* (applies to **all modification/deletion tools**): **accept partial mutation; mitigate with pre-validation + reporting; never auto-rollback.** Concretely:
>   1. **Pre-validation — fail before any mutation.** Validate every target up front (existence, scope, name, and type per §3) and throw with **zero** mutations if any check fails. The dispatcher in `figma_plugin/src/main.ts` already runs `checkScopeAccess` + `verifyNodeName` over every item in the batch tools (`node_delete`, `text_set_content`, `annotation_set`, `instance_set_overrides`, `create_component_set`) before invoking the handler; §3 adds the type check. This shrinks the runtime-failure window to near-zero.
>   2. **Stop-and-report — for failures that survive validation** (e.g. font load). Halt on the first mutation failure and return a structured report of which items succeeded and which failed, so the caller knows the exact partial state. `node_delete` is the deliberate exception (resilient parallel chunks, not mutation-atomic — see §3); it returns per-node `successCount`/`failureCount` instead of halting.
>   3. **Never auto-rollback.** No snapshotting or inverse-replay of committed edits — the state-tracking complexity and the risk of the inverse operations themselves failing outweigh the benefit. Recovery is the caller's responsibility, informed by the report.
> * *Follow-up (implementation)*: standardize the stop-and-report response shape across `setMultipleTextContents` / `setMultipleAnnotations` / `setInstanceOverrides`, which each accumulate per-item results in a slightly different shape today.

> [!NOTE]
> **Viewport Interruption during `view_navigate`**: Navigating to a page — or to a node on another page — requires setting `figma.currentPage = targetPage`. If a user is active in the Figma UI, their editor viewport will jump to the new page.
> * *Decision*: **Accepted — document only.** Switching the active page is the only way the Figma API allows reaching non-current-page elements, and `view_navigate` is deliberately un-scope-gated (§1.E), so off-page (and off-scope) navigation — and the resulting page jump — is expected behavior. We will **not** save/restore the prior page or gate the switch behind an opt-in flag; we document the behavior so users and agents know that navigating to off-page targets switches the active page.

---

## 1. Eliminate Reading/Writing `figma.currentPage`
Currently, multiple tools read `figma.currentPage` or implicitly fallback to it for parent resolution, selection, and scoping. This creates fragility: if the user clicks a different page/layer in Figma while an agent runs, operations can execute in the wrong context or throw errors. 

To resolve this, we will remove all implicit page-fallbacks and enforce either explicit IDs (e.g. a required `pageId` for page-scoped scans) or pages derived from the **target** node IDs (for `view_navigate` and `create_component_set`). No operation derives its page from `state.scopeRootId`.

### Proposed Changes

#### A. Creation Tools (`create_shape`, `create_frame`, `create_text`, `create_svg`, `create_instance`)
* **Current Behavior** (varies by handler — verify before editing):
  * `create_shape` / `create_frame` / `create_text` (`figma_plugin/handlers/nodeCreators.ts`) **already** throw "Parent node not found" / "does not support children" when `parentId` is provided but invalid. They fall back to `figma.currentPage` **only** when `parentId` is omitted — and even that path is unreachable for editable connections (see the User Review note). The real change for these three is just deleting the now-dead `else { figma.currentPage.appendChild(...) }` branch.
  * `create_svg` (`figma_plugin/handlers/vectorHandlers.ts`) is the genuinely unsafe one: when `parentId` is provided **but not found**, it *silently* falls back to `figma.currentPage` instead of throwing. This must be changed to throw.
  * `create_instance`'s handler is `createComponentInstance` in `figma_plugin/handlers/componentHandlers.ts`, **not** `nodeCreators.ts`. It already throws on a not-found `parentId` but only appends when `parentId` is present.
* **v2.1.0 Change**:
  * Update the input schemas in `src/mcp_server/tools/create.ts` to make `parentId` a **required** parameter on all five tools.
  * In the plugin handlers (`nodeCreators.ts`, `vectorHandlers.ts`, **and** `componentHandlers.ts` for `create_instance`), remove every `figma.currentPage` fallback; throw "Parent node not found" when `parentId` does not resolve, and throw if `parentId` is missing (defense-in-depth behind the now-required schema).
  * **`create_instance` dispatch cleanup**: with `parentId` required, the `else` branch at `main.ts:346-351` that throws `ROOT_INSTANCE_DISALLOWED` when no `parentId` is supplied becomes unreachable. Remove that branch, and retire the `ROOT_INSTANCE_DISALLOWED` error constant if nothing else references it.

#### B. Clone Tool (`node_clone`)
* **Current Behavior**: Clones a node under the same parent. If the node has no parent, it appends the clone to `figma.currentPage`.
* **v2.1.0 Change**:
  * In `figma_plugin/handlers/nodeCreators.ts`, if the node being cloned has no parent, throw an error. Do not fall back to `figma.currentPage`.

#### C. Component Scanning (`component_list`)
* **Current Behavior**: The `scope` parameter defaults to `'current_page'`, which searches `figma.currentPage` inside `getComponents` (`figma_plugin/handlers/componentHandlers.ts`).
* **v2.1.0 Change** — note the layer split: the MCP server (`src/`) has **no** access to `state.scopeRootId`, which lives only in the plugin. The schema change is MCP-side; the page lookup is plugin-side. **Decision (read-only discovery):** the `'page'` scope requires an **explicit `pageId`**; it does **not** derive the page from `state.scopeRootId`. This makes behavior identical across read-only and editable connections, and is consistent with §1.D and §1.G. Agents discover page ids via `page_info`.
  * **MCP side** (`src/mcp_server/tools/component.ts`): rename the scope enum from `'current_page' | 'document'` to `'page' | 'document'`, and change the **default from `'current_page'` to `'document'`** (after eliminating `current_page` there is no cheap single-page default, and "list all components in the file" is the right no-argument behavior for discovery — it streams page-by-page). Add a `pageId` parameter (optional in the schema, but required at runtime when `scope === 'page'`). Update the `.describe(...)` to note the default is now document-wide and streams. Forward both to the plugin.
  * **Plugin side** (`getComponents` in `componentHandlers.ts`): when `scope === 'page'`, require `pageId`; resolve it via `figma.getNodeByIdAsync(pageId)` and verify the result is a `PAGE`. Throw "pageId is required when scope is 'page'" if missing, and "pageId does not resolve to a PAGE" if it is the wrong type. Scan that page via `page.findAllWithCriteria(...)` instead of `figma.currentPage`.
  * The dispatcher in `main.ts` passes `pageId` through; no scope state is read for this path.

#### D. Annotation Scanning (`annotation_list`)
* **Current Behavior**: If `nodeId` is not provided, it scans `figma.currentPage` (walking the page's subtree). The `nodeId` path rejects targets without an `annotations` property (e.g. a `PAGE`), so a whole-page scan is only reachable today via the implicit `currentPage` fallback.
* **v2.1.0 Change** — consistent with the §1.C/§1.G decision, require an **explicit target**; no `state.scopeRootId` derivation and no `figma.currentPage` fallback:
  * In `src/mcp_server/tools/annotation.ts`, add an explicit `pageId` parameter alongside `nodeId`, and require that **exactly one** be supplied.
  * In `figma_plugin/handlers/annotationHandlers.ts`: when `pageId` is supplied, resolve it (verify `PAGE`) and run the existing page-subtree walk over it instead of `figma.currentPage`; when `nodeId` is supplied, keep the existing subtree scan. If neither is supplied, throw "pageId or nodeId is required".

#### E. View Navigation (`view_navigate`, replaces `node_select`)
* **Background**: `node_select` is renamed and generalized into a single attention/navigation tool that accepts **either a page or node(s)**. It is pure presentation — it directs the user's editor view and is not an edit (every edit tool takes explicit ids; selecting is never a precondition). This subsumes the speculative `page_navigate` and removes the "page id passed to a select tool" error — a page is now a valid target.
* **Current Behavior** (old `node_select`, `setSelections` in `figma_plugin/handlers/nodeModifiers.ts`): sets `figma.currentPage.selection = nodes` then `figma.viewport.scrollAndZoomIntoView(nodes)`, but never switches pages — so any target on another page throws a low-level Figma error, and a `PAGE` id throws because a page is not a selectable scene node.
* **v2.1.0 Change**:
  * **MCP side** (`src/mcp_server/tools/node.ts`): rename the tool `node_select` → `view_navigate`, rename input `nodeIds` → `ids` (targets may be a page or nodes), and update title/description. Rename the dispatch case `"node_select"` → `"view_navigate"` in `main.ts`. The handler may keep the name `setSelections` or be renamed.
  * **Behavior** — resolve all `ids`, then branch by resolved type, throwing **before** any page switch or selection write:
    1. **Page target** — `ids` is exactly one id resolving to a `PAGE`: set `figma.currentPage = page`; set no selection (a page is not selectable). Return `{ pageId, pageName }`.
    2. **Node target(s)** — every id resolves to a scene node:
       - resolve each node's page via `getContainingPageNode` (§1.K); a `null` (detached node) → throw "Node X is detached and not on a page";
       - all targets must share one page, else throw the multi-page error (Edge Cases §1);
       - set `figma.currentPage = page`, then `selection = nodes`, then `viewport.scrollAndZoomIntoView(nodes)` (frames offscreen and cross-page nodes). Return the selected nodes.
    3. **Invalid combinations** → clear error before any write: an id resolves to nothing ("id not found"); a `DOCUMENT` id; a `PAGE` mixed with node ids or with another page id ("navigate to one page, or to nodes on a single page — not a mix").
  * **Selection side effect (note)**: the node branch overwrites the user's current selection; the page branch leaves selection untouched. This asymmetry is intentional. If a "scroll-to without changing selection" mode is later needed, add an optional `select: boolean` (default `true`).
  * **Scope gating (decision)**: `view_navigate` is intentionally **not** scope-gated — keep its dispatch in `main.ts` free of `checkScopeAccess` and `READ_ONLY_MODE` guards. Directing the view is not a mutation; an agent must be able to show any node/page regardless of the locked editable scope (including from a read-only connection). The page switch is a viewport/navigation side effect, not an edit, and is accepted as document-only behavior (see the Viewport note under Decisions).

#### F. Variant Combiner (`create_component_set`)
* **Current Behavior**: Uses `figma.combineAsVariants(figmaComponents, figma.currentPage)`.
* **v2.1.0 Change**:
  * In `figma_plugin/handlers/componentHandlers.ts` (`createComponentSet`), resolve the containing page of the first component and pass that page node as the second parameter: `figma.combineAsVariants(figmaComponents, containingPage)`.

#### G. Variable Scanning (`variable_list`)
* **Current Behavior**: If `includeConsumers === 'current_page'`, `getVariables` walks `figma.currentPage` (`findVariableConsumers(figma.currentPage, ...)` in `figma_plugin/handlers/variableHandlers.ts`).
* **v2.1.0 Change** — same layer split and read-only decision as §1.C (explicit `pageId` required; no `scopeRootId` derivation):
  * **MCP side** (`src/mcp_server/tools/variable.ts`): rename the `includeConsumers` enum value `'current_page'` → `'page'`; add a `pageId` parameter (optional in the schema, required at runtime when `includeConsumers === 'page'`).
  * **Keep `includeConsumers` optional with _no default_** — omitting it means *no consumer scan* (the handler already gates on `if (includeConsumers)`). This is a deliberate asymmetry with `component_list.scope` (which defaults to `'document'`): `scope` is a search-domain selector that always runs, whereas `includeConsumers` is an opt-in enrichment whose safe default is **off**. Its effective states are *omitted (off) / `'page'` + `pageId` / `'document'`*. Do **not** give it a `'document'` default in a future "consistency" cleanup.
  * **Plugin side** (`getVariables` in `variableHandlers.ts`): when `includeConsumers === 'page'`, require `pageId`, resolve it via `figma.getNodeByIdAsync(pageId)`, and verify it is a `PAGE`; throw if missing or the wrong type. Walk that page node instead of `figma.currentPage`.

#### H. Overrides Retrieval (`instance_get_overrides`)
* **Current Behavior**: If no instance id is supplied, `getInstanceOverrides` falls back to reading `figma.currentPage.selection` (`figma_plugin/handlers/componentHandlers.ts`, ~lines 325-350).
* **v2.1.0 Change**:
  * In `src/mcp_server/tools/instance.ts`, make the **`nodeId`** input field **required** (note: the MCP-facing field is `nodeId`; it is mapped to the wire param `instanceNodeId` in the tool adapter). Update its `.describe(...)` to drop the "currently selected instance will be used" language.
  * Remove the selection fallback from `getInstanceOverrides` in `componentHandlers.ts`, and remove the no-arg `return await getInstanceOverrides();` branch from the `instance_get_overrides` dispatch in `main.ts`.

#### I. `getSelection` Cleanup
* **Current Behavior**: `getSelection` is **not** dead code — it is exported from `figma_plugin/handlers/index.ts` and dispatched via the `"get_selection"` case in `main.ts`. It is, however, unused **from the MCP side**: no registered MCP tool issues the `get_selection` command. Once §1.H removes the only other reader of `figma.currentPage.selection`, this is the last selection-read in the codebase.
* **Change**: Remove the `getSelection` handler from `nodeReaders.ts`, its re-export from `handlers/index.ts`, and the `"get_selection"` dispatch case from `figma_plugin/src/main.ts`.

#### J. Default Connector Discovery (`create_connection`)
* **Current Behavior**: When no default connector is stored, `create_connection` auto-discovers one via `figma.currentPage.findAllWithCriteria({ types: ['CONNECTOR'] })` (`figma_plugin/handlers/connectorHandlers.ts:242`). This is the one remaining `figma.currentPage` read not covered by §A–§I.
* **v2.1.0 Decision** — *out of scope / accepted.* This read selects a *style template* for new connectors (not an edit target), the result is cached in `clientStorage`, and there is no node id available from which to derive a page. Eliminating it would force a new required `connectorId` discovery step on a low-value path. We keep it and document the behavior. (If revisited, the fix is to require an explicit `connectorId` rather than auto-scanning a page.)

#### K. Shared `getContainingPageNode` Helper (prerequisite)
* **Requirement**: Add a single shared helper `getContainingPageNode(node: BaseNode): PageNode | null` that checks if the node itself is of type `'PAGE'` (returning it immediately if so), and otherwise walks `node.parent` until it reaches the containing `PAGE` (returning `null` when the node is not under a page, e.g. detached or document-root). This is a hard prerequisite for the sections that must resolve a node's page, and there must be exactly **one** implementation. Checking if the node itself is a `PAGE` is critical so that page target nodes don't return `null` during parent-chain walking.
* **Placement & users**: Put it in a shared plugin util (e.g. `figma_plugin/utils/nodeUtils.ts`) and import it from every site that resolves a page from a node: `view_navigate` (§1.E), `create_component_set` (§1.F), and the multi-page-selection guard under Edge Cases §1. (§1.C / §1.G no longer need it — they validate an explicit `pageId` rather than walking up from a node.)
* **De-duplicate**: `componentHandlers.ts` already contains a private `getContainingPageId(node)` that does the same walk but returns an id. Refactor it to delegate to (or be replaced by) the shared helper — e.g. `getContainingPageNode(node)?.id ?? 'unknown'` — so no third copy of the walk exists.

---

## 2. Bounded Parallelism in `get_nodes_info` Streaming
`get_nodes_info` walks subtrees recursively. For multi-id queries, the walk is currently sequential to facilitate progress streaming. For large subtrees or remote property exports (`exportAsync`), a purely sequential approach increases overall latency. We will introduce **bounded parallelism** to process up to `P` subtrees concurrently while maintaining progress updates and preserving the original input order.

### Design

1. **Concurrency Limit**: Default `P = 4`. Treat `P` as a **tunable** parameter. Instead of hardcoding `P` in the plugin code, the MCP server (`src/mcp_server/tools/node.ts`) will pass `concurrencyLimit` (default `4`) inside the WebSocket request parameters. The plugin will read this value, allowing server-side adjustments without rebuilding the plugin.
2. **Workers Pool**:
   * Maintain a `results` array initialized to `null` with size equal to `uniqueIds.length`.
   * Keep a shared cursor `nextIndex = 0` and a shared `stats` object. (`const index = nextIndex++` is safe: there is no `await` between the read and the increment in the single-threaded sandbox.)
   * Start `min(P, uniqueIds.length)` worker promises that pull indices from the cursor.
3. **Progress Events**:
   * Each worker, after finishing a top-level id (**including missing/errored ids**), increments `stats.processedCount` and fires a `command_progress` update with `processedCount / uniqueIds.length`. Missing ids **must** also increment the counter — otherwise the percentage never reaches 100% when any id is missing, a regression from the current sequential loop (which counts on the loop index).
   * Inside `mapNodeRecursive`, the intra-subtree yields (`setTimeout(0)` + `progress_update` every 25 nodes) remain active to prevent sandbox blocking and reset MCP timeouts. The shared `stats.processed` counter keeps working across workers (monotonic increments).
4. **Order Preservation & Missing-Node Post-Processing**: After `Promise.all(workers)`, walk `results` **in index order** and split it — entries flagged `{ missing: true }` go into `missingNodeIds`; all other entries are pushed into `nodes` in order. The `{ missing: true }` placeholder is an internal marker and must **never** appear in the `nodes` array. This preserves the existing contract (`nodes` in input order; missing ids in `missingNodeIds`).
5. **Error Isolation**: Wrap each subtree walk in a `try/catch` *inside the worker* so one failing subtree (e.g. a node deleted mid-run) is recorded as missing/errored and does not reject `Promise.all` and discard every other result. The `try/catch` must live in the worker body, not only in prose.

> **Ordering-contract change (breaks existing tests).** Today the per-id "emit `in_progress` then `setTimeout(0)` after EACH id" ordering is a deliberate, commented invariant (resets the MCP 60s inactivity timer, then flushes the sandbox `postMessage` queue) and is asserted by `getNodesInfo.integration.test.ts`. With parallel completion these per-id events fire in **completion order, not input order**. New contract: progress events are monotonic in count (1/N … N/N, missing ids included) but **not** ordered by input index; the **final `nodes` array remains input-ordered**. The existing streaming tests must be rewritten to assert the new contract (see Verification Plan).

> **Shared `exportCache` optimization.** The cache is shared across workers. To prevent concurrent workers from running redundant `exportAsync` calls on overlapping subtrees or duplicate instances before the cache is populated, the cache will store the pending **`Promise` of the export** (e.g. `exportCache.set(node.id, exportPromise)`) instead of the resolved data. Any concurrent lookup on a pending node will retrieve and `await` the same active promise, optimizing rendering thread overhead. Concurrency is safe due to single-threaded JS execution. This lives in `extractProperties` (the single get/set site in `nodeReaders.ts`); since the cache now holds promises, the hit path must `await` the cached value. Caveat: a rejected export is shared by all awaiters rather than retried per-consumer — harmless here, since a genuine failure fails those subtrees anyway and the worker's `try/catch` (Design #5) records them as errored.

```typescript
// Algorithm representation:
async function getNodesInfoParallel(uniqueIds, concurrencyLimit = 4) {
    const results = new Array(uniqueIds.length).fill(null);
    let nextIndex = 0;
    const stats = { processed: 0, processedCount: 0, commandId };

    async function emitProgress() {
        if (!commandId) return;
        await sendProgressUpdate(
            commandId,
            'get_nodes_info',
            'in_progress',
            Math.round((stats.processedCount / uniqueIds.length) * 100),
            uniqueIds.length,
            stats.processedCount,
            `Processed ${stats.processedCount}/${uniqueIds.length} top-level nodes`
        );
        await new Promise(r => setTimeout(r, 0)); // flush postMessage queue
    }

    async function worker() {
        while (nextIndex < uniqueIds.length) {
            const index = nextIndex++;          // atomic: no await between read & increment
            const id = uniqueIds[index];
            try {
                const node = await figma.getNodeByIdAsync(id);
                if (!node) {
                    results[index] = { id, missing: true };
                } else {
                    const mappedSubtree = await mapNodeRecursive(node, 0, maxDepth, properties, filter, exportCache, stats);
                    let entry = mappedSubtree;
                    if (!entry) {
                        entry = { id: node.id, name: node.name, type: node.type };
                        if (properties.length > 0) {
                            entry.properties = await extractProperties(node, properties, exportCache);
                        }
                    }
                    entry.path = buildPathArray(node);
                    entry.descendantCount = countDescendants(node);
                    results[index] = entry;
                }
            } catch (err) {
                // Error isolation (Design #5): record as missing, keep the pool alive.
                results[index] = { id, missing: true };
            }
            // Count EVERY id (found, missing, or errored) so the percentage reaches 100%.
            stats.processedCount++;
            await emitProgress();
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrencyLimit, uniqueIds.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    // Post-process (Design #4): split the ordered results into nodes + missingNodeIds.
    const nodes = [];
    const missingNodeIds = [];
    for (const entry of results) {              // index order preserved
        if (entry && entry.missing) missingNodeIds.push(entry.id);
        else if (entry) nodes.push(entry);
    }
    return { nodes, missingNodeIds: missingNodeIds.length ? missingNodeIds : undefined };
}
```

---

## 3. Atomicity in Modify and Delete Tools
Batch modify/delete tools should not commit *any* change if a target fails validation. **Most of this already exists** and must be *extended*, not rebuilt.

### What already exists (do not duplicate)
The command dispatcher in `figma_plugin/src/main.ts` already implements a validate-then-mutate split for batch tools: before calling the handler it loops over every item running `checkScopeAccess` + `verifyNodeName` and throws on the first failure. So **scope, name, and (implicitly) existence are already pre-validated with zero mutations** for `node_delete` (`main.ts:402-409`), `text_set_content` (`374-381`), `annotation_set` (`389-396`), `instance_set_overrides` (`424-428`), and `create_component_set` (`570-579`). The plan must extend these existing loops, not introduce a second, divergent validation path.

### The actual gap: type-integrity pre-validation
Type checks (e.g. "is this a `TEXT` node?", "does this node support `annotations`?") currently happen **per-node inside the mutation loop**, so a batch can partially mutate before hitting a wrong-typed node. The change is to **add a type check for each item to the existing dispatch-level validation loop**, so type mismatches abort before any mutation:
* **`text_set_content`**: every target resolves to a `TEXT` node.
* **`annotation_set`**: every target supports `annotations`.
* **`instance_set_overrides`**: every target (and the source instance) is an `INSTANCE`.
* **`node_delete`**: existence/scope/name already covered; no additional type constraint.

> **Optimization — Avoid Redundant Database Lookups**: The dispatcher in `figma_plugin/src/main.ts` currently runs `verifyNodeName(id, name)` which re-queries the node via `getNodeByIdAsync`. We will optimize this loop:
> 1. Resolve the node once in the dispatcher loop: `const node = await figma.getNodeByIdAsync(item.nodeId)`. Throw if not found (existence check).
> 2. Run the type-integrity check directly on this resolved reference (e.g., `node.type === "TEXT"`).
> 3. Verify names directly against the reference (`node.name === item.nodeName`) instead of invoking the helper `verifyNodeName`, reducing database queries from O(2N) to O(N).
> 4. Verify scope via `checkScopeAccess(node.id)`.

### Mutation-phase failures
After validation passes, runtime failures can still occur (e.g. font load during `text_set_content`). Handlers wrap individual edits in `try/catch`, stop on the first failure, and return a report of completed vs. failed items. No rollback is attempted.

### `node_delete` is a deliberate exception — decided explicitly
`deleteMultipleNodes` (`figma_plugin/handlers/nodeModifiers.ts:69-267`) is intentionally **resilient and parallel**: it deletes in `Promise.all` chunks of 50, catches per-node errors, and returns `successCount`/`failureCount`. "Stop immediately on the first failure" **cannot** apply mid-chunk to 50 concurrent `remove()` calls.

**Decision for v2.1.0**: keep `node_delete` resilient. Its scope/name/existence are already fully pre-validated at dispatch, so it cannot operate on the wrong node; the only residual failures are TOCTOU races on already-validated nodes. It is therefore **validation-atomic but not mutation-atomic**, and is **excluded** from the "stop on first mutation failure" rule above. Its per-node `results` return shape already communicates partial outcomes. (If full mutation atomicity is later required, the chunk loop must be reworked to sequential-with-early-abort — out of scope for this release.)

---

## 4. MCP Image Content Blocks for PNG/JPG Exports
Currently, `node_export_visual` returns base64 image data inside a JSON text payload. We will update the MCP server to return PNG and JPG image data as native **MCP image content blocks**. This allows compatible MCP clients to render exported Figma nodes directly as images in the chat interface.

### Proposed Changes

1. **Result Helper Update (`src/mcp_server/tools/_result.ts`)**:
   * Update the `toolResult` helper to check if the incoming result contains `imageData` and `mimeType`, and if `format` is `"PNG"` or `"JPG"`.
   * If so, format the `content` array to contain two blocks:
     1. A metadata **text** block summarizing the export.
     2. An **image** content block with base64 data and its MIME type.
   * Ensure `structuredContent` still carries the full JSON schema payload.

```typescript
// src/mcp_server/tools/_result.ts
export function toolResult(result: any) {
    const payload = result && typeof result === "object" ? result : {};
    
    // Convert raster PNG/JPG base64 data to native MCP image blocks
    if (payload.imageData && payload.mimeType && (payload.format === "PNG" || payload.format === "JPG")) {
        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify({
                        nodeId: payload.nodeId,
                        format: payload.format,
                        scale: payload.scale,
                        mimeType: payload.mimeType
                    })
                },
                {
                    type: "image" as const,
                    data: payload.imageData,
                    mimeType: payload.mimeType
                }
            ],
            structuredContent: payload
        };
    }
    
    return {
        content: [{ type: "text" as const, text: JSON.stringify(result ?? {}) }],
        structuredContent: payload,
    };
}
```

2. **Cap export `scale` (`src/mcp_server/tools/node.ts`)**: the `node_export_visual` schema is currently `scale: z.number().default(1)` with **no upper bound** (`node.ts:651-654`). Add `.max(4)` (and a sensible `.min(...)`, e.g. `0.1`) and note in the tool description that large frames at high scale can exceed WebSocket frame limits. This is the mitigation referenced under Edge Cases §4, listed here as an explicit change rather than only an edge-case note.

3. **PDF (and SVG) stay as text**: `node_export_visual` also returns base64 in `imageData` for `format: "PDF"`, but PDF is **not** convertible to an MCP `image` block. The `toolResult` branch must gate on `format === "PNG" || format === "JPG"` only; PDF (and SVG, which uses `svg`, not `imageData`) fall through to the text path. Do **not** simplify the guard to `if (payload.imageData)`.


---

## 5. Documentation & Build Updates
The agent-facing guidance and the compiled plugin artifact are part of the deliverable, not optional follow-ups. Skipping either ships a broken release: stale guidance actively misleads agents, and an un-rebuilt bundle runs the old code.

### A. Update the agent-facing guidance
The server is built around agents loading guidance before acting (`AGENTS.md` → the `figma-edit://guide/*` MCP resources and `skills/figma-edit/references/`). The same content is delivered both as MCP resources and as the skill references, so update the single source and keep both in sync. These docs describe behavior this release changes and will be **wrong** afterward:
* **`skills/figma-edit/references/constraints.md`**: `parentId` now required on all five creation tools; `instance_get_overrides` now requires `nodeId` (no selection fallback); `view_navigate` (replaces `node_select`) navigates to a page or node(s), switches pages, selects/frames nodes, and is not scope-gated.
* **`skills/figma-edit/references/tool-selection.md`**: `component_list` scope is now `'page' | 'document'` (default `'document'`, requires `pageId` for `'page'`); `variable_list.includeConsumers` is now `'page' | 'document'` (optional, off when omitted); `annotation_list` requires an explicit `pageId`/`nodeId`.
* **`skills/figma-edit/references/error-playbook.md`**: add the new error strings — `"Parent node not found…"`, `"pageId is required when scope is 'page'"`, `"pageId with ID ${pageId} not found"`, `"pageId does not resolve to a PAGE"`, `"pageId or nodeId is required"` — and remove guidance that relied on implicit `current_page`/selection fallbacks. Retire `ROOT_INSTANCE_DISALLOWED` if §1.A removes it.
* **`skills/figma-edit/references/workflows.md`**: discovery-before-creation now mandatory (`page_info` → resolve `parentId`/`pageId` → create); document that `view_navigate` (renamed from `node_select`) navigates to a page or node and switches the active page; document that `node_export_visual` returns PNG/JPG as native image blocks.

### B. Rebuild the plugin bundle
All §1/§3 plugin-side edits live in `figma_plugin/src/main.ts` and `figma_plugin/handlers/*.ts`, but the plugin runs the esbuild bundle `figma_plugin/code.js` (`build.js`, via `plugin:build` / `build:all`). **Rebuild `code.js` after every plugin-side change** and ship the rebuilt bundle — source-only edits do not take effect in the live plugin. Add a CI/check that fails if `code.js` is out of date relative to its sources.

---

## Edge Cases, Functionality Loss & Mitigations

### 1. Elimination of `figma.currentPage`
* **Functionality Loss (No Implicit Parent)**: Agents can no longer emit creation commands (`create_shape`, `create_frame`, etc.) without discovering or supplying an explicit parent ID (`parentId`). This introduces a slight orchestration overhead (agents must read the structure first), but is a deliberate trade-off to ensure safety and prevent nodes from being dropped onto arbitrary pages.
* **Functionality Loss (No Current User Selection Fallback)**: Tools like `instance_get_overrides` no longer default to the user's active canvas selection if the ID parameter is missing. Target node IDs must be explicitly specified.
* **Edge Case (Multi-Page Selection)**: Figma's API does not support a document selection spanning multiple different pages.
  * *Mitigation*: In `view_navigate` (`setSelections`), validate that all node targets share the same containing page node. If they belong to different pages, throw an error immediately before switching pages or modifying selection.
* **Edge Case (Appends to Document Root)**: Attempting to use the document root ID (`figma.root.id`) as `parentId` for shapes or frames will fail because Figma requires them to live under a `PAGE`.
  * *Mitigation*: Add runtime validation in creation tools to ensure the resolved parent node is of type `PAGE` or is a container node (e.g., `FRAME`, `GROUP`, `COMPONENT`) located on a page.

### 2. Bounded Parallelism in `get_nodes_info`
* **Edge Case (Worker Failures)**: If one subtree walk fails (e.g. node deleted concurrently), it shouldn't leave the whole command in a hung state.
  * *Mitigation*: Wrap the subtree walk inside the worker in a try-catch. If a worker encounters an error on a specific subtree, treat that ID as missing/error, log it, and add it to `missingNodeIds` (or reject the overall execution if it's a fatal transport error) to ensure safety.
* **Edge Case (Figma Sandbox Congestion)**: Multiple parallel `exportAsync` calls might compete for Figma's internal rendering thread, potentially causing latency spikes.
  * *Mitigation*: Limit concurrency strictly to `P = 4`. This is well within Figma's performance profile for standard subtrees.

### 3. Atomicity in Batch Operations
* **Edge Case (Post-Validation Mutation Races)**: A node might pass the validation phase but be deleted or modified by the user in the Figma editor during the asynchronous mutation phase (e.g., during font loading).
  * *Mitigation*: In the mutation phase, wrap individual node edits in try-catch blocks. If a modification fails despite passing validation, stop processing immediately and return a detailed response indicating which nodes were modified before the failure occurred.
* **Edge Case (History/Undo Step Splits)**: Async hops (using `await` inside loops or chunks) can occasionally cause Figma's history manager to split a single plugin execution into multiple undo steps.
  * *Mitigation*: Since Figma automatically groups synchronous modifications, we will minimize async yields inside the mutation loops. We will document this platform limitation in the API guide.

### 4. MCP Image Content Blocks
* **Edge Case (Legacy/Incompatible Clients)**: Older or custom MCP clients may not render `type: "image"` content blocks correctly.
  * *Mitigation*: Ensure the first block in the returned `content` array is a standard metadata `text` block, and keep the full JSON response in `structuredContent` for schema-aware clients.
* **Edge Case (Base64 Payload Size)**: Extremely large frame exports at high scales can exceed WebSocket frame sizes.
  * *Mitigation*: Set the schema validation for `scale` to limit the maximum value (e.g. max `4`), and warn agents in the tool description to avoid exporting massive frames at high scales.

---

## Verification Plan

### Automated Tests
* **Integration Tests**:
  * **Rewrite** the existing streaming assertions in `getNodesInfo.integration.test.ts`: they currently assert per-id emission order, which the parallel design changes (§2). Assert the new contract instead — progress count is monotonic (1/N … N/N, **missing ids included**) and the final `nodes` array is input-ordered with missing ids in `missingNodeIds`.
  * Add a **micro-benchmark gate** comparing `P = 4` vs `P = 1` on a representative multi-id export workload, so the parallelism win is measured rather than assumed and a regression can flip it back to `P = 1`.
  * Verify type-integrity pre-validation aborts batch tools with **zero** mutations (e.g. `text_set_content` with a non-`TEXT` target, `annotation_set` with an unsupported target).
  * Verify `node_delete` remains resilient (partial results returned, not all-or-nothing) per the §3 decision.
  * Check that schemas are correctly updated: required `parentId` on all five creation tools; required `nodeId` on `instance_get_overrides`; `scope`/`includeConsumers` renamed to `page` with optional `pageId` (and `component_list.scope` now defaults to `'document'`); `scale` capped at `max(4)`.
* **Unit Tests**:
  * `toolResult` formats PNG/JPG payloads into MCP `image` blocks, leaves **SVG and PDF** as `text`, and emits bare base64 (no `data:` URI prefix).
  * **Text-block shape change**: assert that for PNG/JPG the `content[0]` text block is the **trimmed** summary (`{nodeId, format, scale, mimeType}`) and **no longer contains `imageData`**, while `structuredContent` still carries the full payload **including `imageData`**. This pins the one field that moved (`imageData`: text block → image block) so a regression is caught.
  * **No consumer relies on the old text block**: grep/confirm that nothing parses `result.content[0].text` for `node_export_visual` expecting `imageData` (the schema-aware path reads `structuredContent.imageData`); if any test or caller does, migrate it to `structuredContent` before shipping.
  * Verify `view_navigate` page/node branching, page switching, and select+frame behavior.

### Manual Verification
* Deploy the updated plugin in the Figma sandbox and verify:
  1. Creating shapes/frames/text requires `parentId` and fails correctly if missing or invalid.
  2. `view_navigate` to a page, and to a node on another page, switches the active page correctly (and frames/selects the node).
  3. Exporting a frame to PNG renders the visual image directly in the MCP client chat interface.
