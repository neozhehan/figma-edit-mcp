# Tasks: v2.1.0 Enhancements Implementation

## Phase 1: Prerequisite & `figma.currentPage` Elimination (Plugin Handlers)
- [ ] Implement prerequisite `getContainingPageNode` helper in `figma_plugin/utils/nodeUtils.ts` (page-or-self: returns the node itself if type `'PAGE'`, else walks the `parent` chain to the containing `PAGE`; returns `null` for detached/document-root nodes).
- [ ] Refactor private `getContainingPageId` in `figma_plugin/handlers/componentHandlers.ts` to delegate to the shared helper.
- [ ] Update shape/frame/text creators in `figma_plugin/handlers/nodeCreators.ts` to remove `figma.currentPage` fallbacks and throw errors.
- [ ] Update `create_svg` in `figma_plugin/handlers/vectorHandlers.ts` to throw "Parent node not found" when `parentId` is not resolved.
- [ ] Update component instantiator in `figma_plugin/handlers/componentHandlers.ts` to remove fallbacks.
- [ ] Update `node_clone` in `figma_plugin/handlers/nodeCreators.ts` to throw an error if cloned node is parentless.
- [ ] Rework `node_select` → **`view_navigate`** in `figma_plugin/handlers/nodeModifiers.ts` (handler `setSelections`, rename optional) and rename the dispatch case `"node_select"` → `"view_navigate"` in `main.ts`. Accept `ids` and branch by resolved type: **page target** (one `PAGE` id) → set `figma.currentPage = page`, no selection, return `{ pageId, pageName }`; **node target(s)** (all scene nodes) → resolve each node's page via `getContainingPageNode`, require they share one page, then switch page, set selection, and `scrollAndZoomIntoView`. Throw **before** any write on: id not found, a `DOCUMENT` id, a `PAGE` mixed with nodes/another page, a detached node (`null` page), or nodes spanning multiple pages. Keep it **un-scope-gated** — do not add `checkScopeAccess`/`READ_ONLY_MODE` to its dispatch case in `main.ts` (decision §1.E).
- [ ] Update component combiner (`createComponentSet`) in `componentHandlers.ts` to combine in the containing page of the first component.
- [ ] Update component list (`getComponents`) in `componentHandlers.ts` to require `pageId` when `scope === 'page'`, verify type `'PAGE'`, and query that page instead of `figma.currentPage`.
- [ ] Update annotation list (`getAnnotations`) in `figma_plugin/handlers/annotationHandlers.ts` to require exactly one of `pageId` / `nodeId`, verify page type if `pageId` is supplied, and remove page fallback.
- [ ] Update variable list (`getVariables`) in `figma_plugin/handlers/variableHandlers.ts` to require `pageId` when `includeConsumers === 'page'`, verify type `'PAGE'`, and scan that page.
- [ ] Update override retrievals (`getInstanceOverrides`) in `componentHandlers.ts` to remove current selection fallback, and remove the now-dead no-arg `return await getInstanceOverrides();` branch from the `instance_get_overrides` dispatch in `figma_plugin/src/main.ts`.
- [ ] Clean up unused selection-read: remove `getSelection` handler from `nodeReaders.ts`, its re-export from `handlers/index.ts`, and the `"get_selection"` dispatch case in `figma_plugin/src/main.ts`.
- [ ] Document the accepted default template connector page scan fallback in `create_connection` (§1.J).

## Phase 2: Schema Changes & Server Adapters (MCP Side)
- [ ] Update input schemas in `src/mcp_server/tools/create.ts` to make `parentId` required on all 5 creation tools.
- [ ] Clean up `create_instance` dispatch in `main.ts` by removing the `ROOT_INSTANCE_DISALLOWED` check, and retire the `ROOT_INSTANCE_DISALLOWED` error constant in `main.ts`.
- [ ] Update `component_list` schema in `src/mcp_server/tools/component.ts`: rename scope `'current_page'` -> `'page'`, change default scope to `'document'`, add optional `pageId` parameter, and update description.
- [ ] Update `annotation_list` schema in `src/mcp_server/tools/annotation.ts`: add optional `pageId` parameter and update description to require exactly one of `pageId` / `nodeId`.
- [ ] Update `variable_list` schema in `src/mcp_server/tools/variable.ts`: rename `includeConsumers` enum value `'current_page'` -> `'page'`, add optional `pageId` parameter, and ensure `includeConsumers` remains optional with no default.
- [ ] Update `instance_get_overrides` schema in `src/mcp_server/tools/instance.ts`: make input field `nodeId` required and update description.
- [ ] Update `node_export_visual` schema in `src/mcp_server/tools/node.ts`: cap `scale` with `.min(0.1).max(4)` and update description.
- [ ] Rename the select tool in `src/mcp_server/tools/node.ts`: `node_select` → `view_navigate`, input `nodeIds` → `ids`, update title/description ("Navigate the editor view to a page or node(s)"), update the `sendCommandToFigma("view_navigate", { ids })` call, and extend the output schema to cover the page branch (`{ pageId, pageName }`).
- [ ] Complete the `node_select` → `view_navigate` rename fan-out (required for the build/tests to pass):
  - `src/mcp_server/figma-client.ts`: update the command-name union type (`| "node_select"` → `| "view_navigate"`).
  - Root `manifest.json`: rename the tool catalog entry (`name`: `node_select` → `view_navigate`) and update its `description`.
  - `README.md`: update the tool-table row (name + description).
  - `src/mcp_server/tests/unit/tools/v2Tools.test.ts`: update the tool-list assertion (`"node_select"` → `"view_navigate"`).
  - (Leave `CHANGELOG.md` and `documentation/completed/v2.0.0/*` untouched — historical records of the prior rename.)

## Phase 3: Bounded Parallelism in `node_info` Streaming
- [ ] Update the MCP tool registration for `node_info` in `src/mcp_server/tools/node.ts` to pass `concurrencyLimit` (default `4`) inside WebSocket parameters.
- [ ] Implement parallel subtree walk `getNodesInfoParallel` in `figma_plugin/handlers/nodeReaders.ts`:
  - Launch worker promises up to `concurrencyLimit`.
  - Process subtrees concurrently and increment progress counters for all node IDs (found, missing, or errored).
  - Emit progress updates with monotonic percentages.
  - Wrap recursive walk inside worker in try-catch to isolate errors.
  - Collate worker results in index order, filtering `{ missing: true }` markers into `missingNodeIds` and valid subtrees into `nodes`.
  - **Replace** the existing sequential multi-id loop inside `getNodesInfo` with this worker pool (do not add a second parallel path alongside the old one).
  - Preserve the intra-subtree yields (`setTimeout(0)` + per-25-node `progress_update`) inside `mapNodeRecursive`.
  - Keep the `'started'` and final `'completed'` progress events bookending the pool.
- [ ] Make `exportCache` concurrency-safe (§2): in `extractProperties` (`nodeReaders.ts`), cache the pending `Promise` of `exportAsync(...).then(r => r.document)` *before* awaiting and `await` the cached promise on a hit, so overlapping subtrees/duplicate instances export each node exactly once.

## Phase 4: Atomicity in Modify and Delete Tools
- [ ] In the **batch** dispatch loops in `figma_plugin/src/main.ts` (`node_delete`, `text_set_content`, `annotation_set`, `instance_set_overrides`, `create_component_set`), resolve each item's node **once** and run the checks against that single reference, in order: explicit **not-found** (throw a clear "Node X not found" instead of today's misleading "outside scope"/"name mismatch" for stale ids), scope, name, then type (next item). Hoist the constant scope-root resolve out of the loop. Introduce any reference-based scope check **additively** (a new helper) — do **not** change the shared `checkScopeAccess`/`verifyNodeName` signatures or the single-target dispatch cases. (Justification: clean type-check integration + clearer errors — **not** performance.)
- [ ] Add type-integrity pre-validation checks in the dispatch loops of `main.ts`:
  - `text_set_content`: verify all targets are `TEXT` nodes.
  - `annotation_set`: verify all targets support `annotations`.
  - `instance_set_overrides`: verify targets and source instance are `INSTANCE` nodes.
- [ ] Update batch handlers (`setMultipleTextContents`, `setMultipleAnnotations`, `setInstanceOverrides`) to:
  - Stop processing on the first mutation failure.
  - Return a standardized report of completed vs. failed items.
  - Never attempt automatic state rollbacks.
- [ ] Confirm that `node_delete` (`deleteMultipleNodes`) is excluded from stop-on-first-failure, keeping its resilient parallel chunked deletions intact.

## Phase 5: MCP Image Content Blocks
- [ ] Update `toolResult` in `src/mcp_server/tools/_result.ts` to detect raster formats (`PNG` and `JPG` only) containing `imageData` and `mimeType`.
- [ ] Format `content` array for PNG/JPG results to return:
  1. A text block with trimmed metadata summary (excluding base64 `imageData`).
  2. A native MCP `image` block with base64 data and mime type.
- [ ] Ensure `structuredContent` still carries the full JSON response (including `imageData`).
- [ ] Ensure SVG and PDF outputs fall through to the standard text content blocks.

## Phase 6: Documentation, Builds, and Verification
- [ ] Update agent-facing guides in `skills/figma-edit/references/`:
  - `constraints.md` (required `parentId`, overrides `nodeId`, no-scope selection).
  - `tool-selection.md` (`component_list` defaults/scopes, `variable_list` opt-ins, `annotation_list` targets).
  - `error-playbook.md` (add missing page/parent/node type error strings, retire `ROOT_INSTANCE_DISALLOWED`).
  - `workflows.md` (discovery mandate, page-switching navigations, visual image block exports).
- [ ] Rebuild plugin bundle `figma_plugin/code.js` via `npm run build:all` (or `bun run build:all`).
- [ ] Add a CI/check that fails if `figma_plugin/code.js` is out of date relative to its sources (`figma_plugin/src/main.ts` + `figma_plugin/handlers/*.ts`).
- [ ] Rewrite integration streaming tests in `getNodesInfo.integration.test.ts` to assert parallel completion contract.
- [ ] Add a micro-benchmark test comparing `P = 4` vs `P = 1` performance.
- [ ] Add unit tests for `toolResult` (PNG/JPG image block formatting, text-block shape change, SVG/PDF text fallbacks, no `data:` URI prefix).
- [ ] Verify tool schemas are updated correctly: required `parentId` on all 5 creation tools; required `nodeId` on `instance_get_overrides`; `component_list.scope` = `'page' | 'document'` (default `'document'`); `variable_list.includeConsumers` = `'page' | 'document'` (optional, no default); `annotation_list` accepts `pageId`/`nodeId`; `node_export_visual.scale` capped at `.min(0.1).max(4)`.
- [ ] Verify type-integrity pre-validation failures abort with zero mutations.
- [ ] Verify `node_delete` resiliency.
- [ ] Verify `view_navigate` page/node branching, page switching, and select+frame behavior.
- [ ] Manually verify UI creators, page viewport jumps, and image rendering.
