# Tasks: v2.1.0 Enhancements Implementation

## Phase 1: Prerequisite & `figma.currentPage` Elimination (Plugin Handlers)
- [x] Implement prerequisite `getContainingPageNode` helper in `figma_plugin/utils/nodeUtils.ts` (page-or-self: returns the node itself if type `'PAGE'`, else walks the `parent` chain to the containing `PAGE`; returns `null` for detached/document-root nodes).
- [x] Refactor private `getContainingPageId` in `figma_plugin/handlers/componentHandlers.ts` to delegate to the shared helper.
- [x] Update shape/frame/text creators in `figma_plugin/handlers/nodeCreators.ts` to remove `figma.currentPage` fallbacks and throw errors.
- [x] Update `create_svg` in `figma_plugin/handlers/vectorHandlers.ts` to throw "Parent node not found" when `parentId` is not resolved.
- [x] Update component instantiator in `figma_plugin/handlers/componentHandlers.ts` to remove fallbacks.
- [x] Update `node_clone` in `figma_plugin/handlers/nodeCreators.ts` to throw an error if cloned node is parentless.
- [x] Rework `node_select` → **`view_navigate`** in `figma_plugin/handlers/nodeModifiers.ts` (handler `setSelections`, rename optional) and rename the dispatch case `"node_select"` → `"view_navigate"` in `main.ts`. Accept `ids` and branch by resolved type: **page target** (one `PAGE` id) → set `figma.currentPage = page`, no selection, return `{ pageId, pageName }`; **node target(s)** (all scene nodes) → resolve each node's page via `getContainingPageNode`, require they share one page, then switch page, set selection, and `scrollAndZoomIntoView`. Throw **before** any write on: id not found, a `DOCUMENT` id, a `PAGE` mixed with nodes/another page, a detached node (`null` page), or nodes spanning multiple pages. Keep it **un-scope-gated** — do not add `checkScopeAccess`/`READ_ONLY_MODE` to its dispatch case in `main.ts` (decision §1.E).
- [x] Update component combiner (`createComponentSet`) in `componentHandlers.ts` to combine in the containing page of the first component.
- [x] Update component list (`getComponents`) in `componentHandlers.ts` to require `pageId` when `scope === 'page'`, verify type `'PAGE'`, and query that page instead of `figma.currentPage`.
- [x] Update annotation list (`getAnnotations`) in `figma_plugin/handlers/annotationHandlers.ts` to require exactly one of `pageId` / `nodeId`, verify page type if `pageId` is supplied, and remove page fallback.
- [x] Update variable list (`getVariables`) in `figma_plugin/handlers/variableHandlers.ts` to require `pageId` when `includeConsumers === 'page'`, verify type `'PAGE'`, and scan that page.
- [x] Update override retrievals (`getInstanceOverrides`) in `componentHandlers.ts` to remove current selection fallback, and remove the now-dead no-arg `return await getInstanceOverrides();` branch from the `instance_get_overrides` dispatch in `figma_plugin/src/main.ts`.
- [x] Clean up unused selection-read: remove `getSelection` handler from `nodeReaders.ts`, its re-export from `handlers/index.ts`, and the `"get_selection"` dispatch case in `figma_plugin/src/main.ts`.
- [x] Document the accepted default template connector page scan fallback in `create_connection` (§1.J).
- [x] **Live test (§1)** — after `bun run plugin:build` and reloading the plugin in Figma (write-mode connection via a page/layer link), extend `scripts/live-verify.ts` and run `bun run test:live <channel>` to assert against a real document:
  - `create_shape`/`create_frame`/`create_text`/`create_svg` with **no** `parentId` → rejected; with an unresolved `parentId` → rejected; with a valid `parentId` → created under it (never dropped onto another page).
  - `view_navigate`: a `PAGE` id switches the active page (confirm via `page_info`/`get_connect_payload`); a node on another page switches page + selects + frames it; a `PAGE` mixed with nodes, a multi-page node set, and a detached node are each rejected before any write.
  - `component_list` `scope:'page'` errors without `pageId` and on a non-`PAGE` `pageId`, and returns that page's components; `annotation_list` works with `pageId` and with `nodeId` (errors on neither/both); `variable_list` `includeConsumers:'page'` errors without `pageId`.
  - `instance_get_overrides` with no instance id → rejected (selection fallback removed).
  - Clean up all created nodes at the end (extend the existing cleanup step).

## Phase 2: Schema Changes & Server Adapters (MCP Side)
- [x] Update input schemas in `src/mcp_server/tools/create.ts` to make `parentId` required on all 5 creation tools.
- [x] Clean up `create_instance` dispatch in `main.ts` by removing the `ROOT_INSTANCE_DISALLOWED` check, and retire the `ROOT_INSTANCE_DISALLOWED` error constant in `main.ts`.
- [x] Update `component_list` schema in `src/mcp_server/tools/component.ts`: rename scope `'current_page'` -> `'page'`, change default scope to `'document'`, add optional `pageId` parameter, and update description.
- [x] Update `annotation_list` schema in `src/mcp_server/tools/annotation.ts`: add optional `pageId` parameter and update description to require exactly one of `pageId` / `nodeId`.
- [x] Update `variable_list` schema in `src/mcp_server/tools/variable.ts`: rename `includeConsumers` enum value `'current_page'` -> `'page'`, add optional `pageId` parameter, and ensure `includeConsumers` remains optional with no default.
- [x] Update `instance_get_overrides` schema in `src/mcp_server/tools/instance.ts`: make input field `nodeId` required and update description.
- [x] Update `node_export_visual` schema in `src/mcp_server/tools/node.ts`: cap `scale` with `.min(0.1).max(4)` and update description.
- [x] Rename the select tool in `src/mcp_server/tools/node.ts`: `node_select` → `view_navigate`, input `nodeIds` → `ids`, update title/description ("Navigate the editor view to a page or node(s)"), update the `sendCommandToFigma("view_navigate", { ids })` call, and extend the output schema to cover the page branch (`{ pageId, pageName }`).
- [x] Complete the `node_select` → `view_navigate` rename fan-out (required for the build/tests to pass):
  - [x] `src/mcp_server/figma-client.ts`: update the command-name union type (`| "node_select"` → `| "view_navigate"`).
  - [x] Root `manifest.json`: rename the tool catalog entry (`name`: `node_select` → `view_navigate`) and update its `description`.
  - [x] `README.md`: update the tool-table row (name + description).
  - [x] `src/mcp_server/tests/unit/tools/v2Tools.test.ts`: update the tool-list assertion (`"node_select"` → `"view_navigate"`).
  - (Leave `CHANGELOG.md` and `documentation/completed/v2.0.0/*` untouched — historical records of the prior rename.)

## Phase 3: Bounded Parallelism in `node_info` Streaming
- [x] Update the MCP tool registration for `node_info` in `src/mcp_server/tools/node.ts` to pass `concurrencyLimit` (default `4`) inside WebSocket parameters.
- [x] Implement parallel subtree walk `getNodesInfoParallel` in `figma_plugin/handlers/nodeReaders.ts`:
  - Launch worker promises up to `concurrencyLimit`.
  - Process subtrees concurrently and increment progress counters for all node IDs (found, missing, or errored).
  - Emit progress updates with monotonic percentages.
  - Wrap recursive walk inside worker in try-catch to isolate errors.
  - Collate worker results in index order, filtering `{ missing: true }` markers into `missingNodeIds` and valid subtrees into `nodes`.
  - **Replace** the existing sequential multi-id loop inside `getNodesInfo` with this worker pool (do not add a second parallel path alongside the old one).
  - Preserve the intra-subtree yields (`setTimeout(0)` + per-25-node `progress_update`) inside `mapNodeRecursive`.
  - Keep the `'started'` and final `'completed'` progress events bookending the pool.
- [x] Make `exportCache` concurrency-safe (§2): in `extractProperties` (`nodeReaders.ts`), cache the pending `Promise` of `exportAsync(...).then(r => r.document)` *before* awaiting and `await` the cached promise on a hit, so overlapping subtrees/duplicate instances export each node exactly once.
- [x] **Live test (§2)** — after rebuilding/reloading the plugin, extend `scripts/live-verify.ts` (run via `bun run test:live <channel>`) to query `node_info` with many top-level ids including one deliberately missing id, asserting `nodes` is input-ordered, the missing id lands in `missingNodeIds`, and the call completes (progress streamed) without hanging.

## Phase 4: Atomicity in Modify and Delete Tools
- [x] In the **batch** dispatch loops in `figma_plugin/src/main.ts` (`node_delete`, `text_set_content`, `annotation_set`, `instance_set_overrides`, `create_component_set`), resolve each item's node **once** and run the checks against that single reference, in order: explicit **not-found** (throw a clear "Node X not found" instead of today's misleading "outside scope"/"name mismatch" for stale ids), scope, name, then type (next item). Hoist the constant scope-root resolve out of the loop. Introduce any reference-based scope check **additively** (a new helper) — do **not** change the shared `checkScopeAccess`/`verifyNodeName` signatures or the single-target dispatch cases. (Justification: clean type-check integration + clearer errors — **not** performance.)
- [x] Add type-integrity pre-validation checks in the dispatch loops of `main.ts`:
  - `text_set_content`: verify all targets are `TEXT` nodes.
  - `annotation_set`: verify all targets support `annotations`.
  - `instance_set_overrides`: verify targets and source instance are `INSTANCE` nodes.
- [x] Update batch handlers (`setMultipleTextContents`, `setMultipleAnnotations`, `setInstanceOverrides`) to:
  - Stop processing on the first mutation failure.
  - Return a standardized report of completed vs. failed items.
  - Never attempt automatic state rollbacks.
- [x] Confirm that `node_delete` (`deleteMultipleNodes`) is excluded from stop-on-first-failure, keeping its resilient parallel chunked deletions intact.
- [x] **Live test (§3)** — after rebuilding/reloading the plugin, extend `scripts/live-verify.ts` (run via `bun run test:live <channel>`) to assert: a `text_set_content`/`annotation_set`/`instance_set_overrides` batch containing one wrong-typed target aborts with **zero** mutations (confirm the valid targets are untouched via `node_info`); and a `node_delete` over a mix of valid + **not-found** ids aborts at dispatch with "Node X not found" (**validation-atomic** — zero deletions; the resilient partial `successCount`/`failureCount` path applies only to **mutation-phase** failures on already-validated nodes — a node deleted/locked mid-run — and is covered by unit tests, not stageable live). Clean up any created nodes.

## Phase 5: MCP Image Content Blocks
- [x] Update `toolResult` in `src/mcp_server/tools/_result.ts` to detect raster formats (`PNG` and `JPG` only) containing `imageData` and `mimeType`.
- [x] Format `content` array for PNG/JPG results to return:
  1. A text block with trimmed metadata summary (excluding base64 `imageData`).
  2. A native MCP `image` block with base64 data and mime type.
- [x] Ensure `structuredContent` still carries the full JSON response (including `imageData`).
- [x] Ensure SVG and PDF outputs fall through to the standard text content blocks.

## Phase 6: Documentation, Builds, and Verification

### Documentation & build
- [x] Update agent-facing guides in `skills/figma-edit/references/`:
  - `constraints.md` (required `parentId`, overrides `nodeId`, no-scope selection).
  - `tool-selection.md` (`component_list` defaults/scopes, `variable_list` opt-ins, `annotation_list` targets).
  - `error-playbook.md` (add missing page/parent/node type error strings, retire `ROOT_INSTANCE_DISALLOWED`).
  - `workflows.md` (discovery mandate, page-switching navigations, visual image block exports).
- [x] Rebuild plugin bundle `figma_plugin/code.js` via `npm run build:all` (or `bun run build:all`).
- [x] Add a CI/check that fails if `figma_plugin/code.js` is out of date relative to its sources (`figma_plugin/src/main.ts` + `figma_plugin/handlers/*.ts`).

### Automated tests
Every functional change in this release needs unit coverage. Plugin handlers are unit-testable with the figma-stub + dynamic-import pattern under `src/mcp_server/tests/unit/figma_plugin/`; MCP tools under `src/mcp_server/tests/unit/tools/`.

**Unit — plugin handlers (`figma.currentPage` elimination, §1):**
- [x] `getContainingPageNode` (`nodeUtils.test.ts`): returns the containing `PAGE`; returns the node itself when it is a `PAGE`; returns `null` for detached/document-root nodes.
- [x] Creation tools reject bad parents (`nodeCreators`/`vectorHandlers`/`componentHandlers`): `create_shape`/`create_frame`/`create_text`/`create_svg`/`create_instance` throw when `parentId` is missing **and** when it does not resolve — and never append to `figma.currentPage`.
- [x] `node_clone` throws when the source node is parentless (no `figma.currentPage` fallback).
- [x] `createComponentSet` combines variants on the **first component's containing page**, not `figma.currentPage`.
- [x] `getComponents` with `scope: 'page'`: throws on missing `pageId`, throws when `pageId` is not a `PAGE`, and queries the given page (not `figma.currentPage`).
- [x] `getAnnotations`: requires exactly one of `pageId`/`nodeId` (throws on neither and on both); verifies `pageId` is a `PAGE`; no `figma.currentPage` fallback.
- [x] `getVariables` with `includeConsumers: 'page'`: throws on missing/non-`PAGE` `pageId`; omitting `includeConsumers` runs **no** consumer scan.
- [x] `getInstanceOverrides`: errors when no instance id is supplied (selection fallback removed); the no-arg dispatch branch is gone.
- [x] `view_navigate` (`setSelections`): page target switches page with no selection; node target(s) switch to the shared page + select + `scrollAndZoomIntoView`; throws **before any write** on not-found id, `DOCUMENT` id, `PAGE` mixed with nodes/another page, detached node, and multi-page node sets; remains un-scope-gated.
- [x] `getSelection` / the `"get_selection"` command are removed (no longer exported or dispatched).

**Unit — parallelism & atomicity (§2/§3, `nodeReaders` + `main.ts` dispatch):**
- [x] `exportCache` promise-memoization: an overlapping subtree / duplicate instance calls a stubbed `exportAsync` **once** per node id (assert call count).
- [x] Batch not-found error: a stale id in `node_delete`/`text_set_content`/etc. throws an explicit "Node X not found" (not "outside scope"/"name mismatch").
- [x] Type-integrity pre-validation aborts with **zero** mutations: `text_set_content` on a non-`TEXT` target, `annotation_set` on an unsupported target, `instance_set_overrides` on a non-`INSTANCE` target/source.
- [x] Mutation-phase stop-and-report: `setMultipleTextContents`/`setMultipleAnnotations`/`setInstanceOverrides` stop on the first runtime failure and return the standardized completed-vs-failed report; no rollback.
- [x] `node_delete` stays resilient: a mix of valid/invalid nodes returns partial `successCount`/`failureCount` (excluded from stop-on-first-failure).

**Unit — MCP tools & schemas (§1/§4, `tools/`):**
- [x] Schemas updated: required `parentId` on all 5 creation tools; required `nodeId` on `instance_get_overrides`; `component_list.scope = 'page'|'document'` (default `'document'`); `variable_list.includeConsumers = 'page'|'document'` (optional, no default); `annotation_list` accepts `pageId`/`nodeId`; `node_export_visual.scale` = `.min(0.1).max(4)`.
- [x] Tool registry: `view_navigate` is registered with input `ids`, and `node_select` is absent (update `v2Tools.test.ts`).
- [x] `toolResult`: PNG/JPG → text-summary + native `image` block (text block omits `imageData`); `structuredContent` keeps the full payload incl. `imageData`; SVG and PDF fall through to text; image `data` is bare base64 (no `data:` prefix).

**Integration:**
- [x] Rewrite the streaming tests in `getNodesInfo.integration.test.ts` to the parallel contract: `nodes` input-ordered; missing ids in `missingNodeIds`; progress count monotonic (missing ids included); a failing subtree is isolated (recorded missing/errored, others unaffected).
- [x] Add a micro-benchmark comparing `P = 4` vs `P = 1` on a representative multi-id export workload (gates the parallelism win; flips to `P = 1` on regression).

### Manual verification
- [ ] Manually verify UI creators require `parentId`, `view_navigate` page jumps (page target and cross-page node target), and PNG/JPG rendering as inline images in an MCP client.
