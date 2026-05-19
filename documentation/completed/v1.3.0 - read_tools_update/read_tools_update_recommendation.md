# Read Tools Update — Review Recommendations

Review of [read_tools_update.md](read_tools_update.md) against the current implementation in [src/mcp_server/tools/document.ts](../../src/mcp_server/tools/document.ts), [figma_plugin/handlers/nodeReaders.ts](../../figma_plugin/handlers/nodeReaders.ts), and [figma_plugin/src/main.ts](../../figma_plugin/src/main.ts).

## Resolved in the latest revision

- ✅ `editableScopeType` discriminator added — MCP server no longer has to infer payload shape.
- ✅ "Frame scope" renamed to "Node scope" with `nodeId` / `nodeName` — accurate for COMPONENT / GROUP / SECTION / FRAME.
- ✅ Node-scope `children` is now top-level only — eliminates unbounded recursion on connect.
- ✅ Page-scope payload now includes a top-level `type` field — consistent with Node-scope.
- ✅ `get_document_info` is now an outright removal (not "remove & deprecate"). Spec lists the concrete callsite cleanups required.
- ✅ `get_page_info` → `get_pages_info` is now an outright rename (no alias, no deprecation period). Spec lists the concrete rename steps across server registration, `FigmaCommand` union, plugin dispatch, handler, tests, and prompt strings.
- ✅ Empty `pageIds: []` vs omitted parameter is now explicitly clarified in the spec as equivalent (not "all pages with children").

## Still outstanding

### 1. ✅ Trailing commas in JSON examples — RESOLVED
Trailing commas have been removed from the Change 2 JSON examples; the blocks are now valid JSON.

### 2. ✅ Payload-shape inconsistency between Change 1 and Change 2 — RESOLVED
Page-scope and Node-scope payloads now embed the same `pages: [{ pageId, pageName, children }]` shape used by Change 2's `get_pages_info` response. Node scope additionally exposes a dedicated `node` block (`nodeId`, `nodeName`, `type`, `parentId`, `parentName`, `parentType`, `children`) — clean separation of "where you are in the file" vs. "what you can edit".

### 3. ✅ `pageCount` without `pages` is half-useful — RESOLVED
Both editable-scope payloads now include a populated `pages` array alongside `pageCount`.

### 4. ✅ No on-demand refresh for Node scope — RESOLVED
Spec now documents the canonical refresh paths under "Refreshing the editable scope":
- Page scope → `get_pages_info({ pageIds: [<editable page id>] })`
- Node scope → `get_nodes_info()` (empty args), with a note that its return shape will be aligned with the Change 1 Node-scope `node` block in a future release.
- Readonly → `get_pages_info()` (no args).

### 5. ✅ Loading & performance semantics unspecified — RESOLVED

Spec now has a top-level "Loading & performance" section that lands recommendation (a) (narrow scope to v1.3.0 read tools) and files recommendation (b) (`getComponents` rewrite) as a follow-up. The section covers:
- Ban on `figma.loadAllPagesAsync()` in this spec's read tools.
- MUST-stream rule for `get_pages_info({ pageIds })` with N > 1, including the `setTimeout(0)` flush.
- On-demand load policy per entry point.
- Soft batch guidance of `pageIds.length <= 25`.
- Prerequisite plumbing: `sendProgressUpdate` made async with trailing flush; `state.activeRequestId` audit in ui.html.
- Out-of-scope note carving `getComponents` out for a follow-up.

Original analysis retained below for reference.

#### Context: PR #153 from grab/cursor-talk-to-figma-mcp

#### Context: PR #153 from grab/cursor-talk-to-figma-mcp

This codebase is downstream of grab/cursor-talk-to-figma-mcp and has **partially** absorbed PR #153 (streaming progress). What's already wired up:

| PR #153 piece | Status | Location |
|---|---|---|
| Server-side `progress_update` handler that resets inactivity timeout | ✅ Present (60 s reset window after each progress event) | [src/mcp_server/figma-client.ts:138-158](../../src/mcp_server/figma-client.ts#L138) |
| `socket.ts` forwarding progress between peers | ✅ Effectively present (server receives them) | [src/socket.ts](../../src/socket.ts) |
| UI bridge `command_progress` → `progress_update` to server | ✅ Present | [figma_plugin/ui.html:779-799,855](../../figma_plugin/ui.html#L779) |
| `sendProgressUpdate` utility | ✅ Present | [figma_plugin/utils/progressUtils.ts](../../figma_plugin/utils/progressUtils.ts) |

What's still missing (and matters for v1.3.0):

1. **`sendProgressUpdate` is synchronous** — no `await setTimeout(0)` after `figma.ui.postMessage()` ([progressUtils.ts:65](../../figma_plugin/utils/progressUtils.ts#L65)). PR #153's headline fix. Without it, the Figma sandbox doesn't flush the message before the next chunk runs, so the UI still freezes and progress events get coalesced — defeating the server's inactivity reset.
2. **Read handlers don't emit progress** — `sendProgressUpdate` is used in write-side handlers (`annotationHandlers`, `connectorHandlers`, `nodeModifiers`) but **not** in `nodeReaders.ts`. Today's `getDocumentInfo` does a single `figma.loadAllPagesAsync()` ([nodeReaders.ts:13](../../figma_plugin/handlers/nodeReaders.ts#L13)) with no progress and no chunking — the exact pattern PR #153 replaced.
3. **`activeRequestId` capture in ui.html** — `state.activeRequestId` is not set from incoming MCP requests. Without it, a concurrent read mid-flight can have its progress events mis-correlated.

#### Mapping v1.3.0 entry points to the right strategy

| v1.3.0 entry point | Recommended pattern |
|---|---|
| Read-only connect payload (`pages: [{ id, name }]` for all pages) | Iterate `figma.root.children` directly. `id` and `name` are accessible **without** `loadAsync()`. **Do not** call `loadAllPagesAsync`. Sub-100ms even on 500-page files. |
| Page-scope connect payload (one page + top-level children) | Single `await targetPage.loadAsync()`. No progress needed. |
| Node-scope connect payload (one node + top-level children) | `figma.getNodeByIdAsync(scopeRootId)` + walk to containing page via `node.parent` chain (no extra load). No progress needed. |
| `get_pages_info()` no-args | Same as readonly connect — `figma.root.children` walk, no loads. |
| `get_pages_info({ pageIds: [...] })` with N pages | Stream page-by-page: for each id, `await page.loadAsync()`, emit `in_progress` with running totals, push the per-page entry, then `await new Promise(r => setTimeout(r, 0))` before the next iteration. Emit `started` / `completed` bookends. |

#### Concrete recommendations for the spec

1. **Make `sendProgressUpdate` async with the trailing flush.** One-line change in [progressUtils.ts:65](../../figma_plugin/utils/progressUtils.ts#L65), but it's a precondition for any streaming pattern to actually work. Apply once; every long-running handler in the repo benefits.

2. **Mandate the streaming pattern for `get_pages_info({ pageIds })` when N is large.** Suggested spec language:
   > When `get_pages_info` is called with `pageIds.length > 1`, the plugin SHOULD emit `command_progress` events (`started` → `in_progress` per page → `completed`) so the MCP server can keep its inactivity timeout fresh. Implementations MUST `await` a yield (e.g. `setTimeout(0)`) after each `figma.ui.postMessage` so the sandbox flushes UI messages between iterations.

3. **Forbid `figma.loadAllPagesAsync()` in read tools.** Suggested spec language:
   > Read tools MUST NOT call `figma.loadAllPagesAsync()`. Use `figma.root.children` for id/name enumeration (no load required) and `page.loadAsync()` per requested page only when `children` is needed.

4. **Audit `activeRequestId` capture.** Add a one-line verification task in the implementation checklist; without it, concurrent reads can get crossed wires when progress events return to the server.

5. **Spec a soft batch limit.** Recommend `pageIds.length <= 25` per call as guidance (not enforcement). Beyond that, the model should chunk client-side — even with progress events keeping the timeout alive, the sequential `loadAsync` walk gets slow.

#### Original sub-points — all now answered

- ✅ "State that pages are loaded on demand" — answered by Rule 3 in the spec's Loading & performance section, with an explicit per-entry-point breakdown.
- ✅ "Set an upper bound or guidance" — answered by Rule 4: soft batch guidance of `pageIds.length <= 25` per call.
- ✅ "Confirm whether `get_pages_info()` with no args also loads all pages" — answered by Rule 3 bullet: "`get_pages_info()` no-args: same as read-only connect — enumerate, no loads." (Today's `getDocumentInfo` mistakenly does load; that handler is being deleted as part of Change 2.)

### 6. ✅ Error contract missing — RESOLVED
Spec now states unresolvable `pageIds` (not found / non-page node / different document) are silently skipped and surfaced via a `missingPageIds: string[]` field on the response. The call only fails atomically if every requested id is unresolvable… correction: even then it returns a normal response with an empty `pages` array and all ids in `missingPageIds`. Pure silent-skip semantics, as recommended.

### 7. ✅ Scope-deleted state not handled — RESOLVED
Covered by the new "Error response" section in Change 1: `errorCode: "SCOPE_DELETED"` (referenced node no longer exists) and `errorCode: "SCOPE_INVALID"` (unrecognized scope state) are both specified, with suggested `errorMessage` text instructing the user to reconnect the plugin.

### 8. ✅ Node-scope `parentPageId` / `parentPageName` semantics — RESOLVED
- Renamed to `containingPageId` / `containingPageName` (and the immediate-parent fields renamed to `parentNodeId` / `parentNodeName` / `parentNodeType`) — naming nit addressed.
- Spec now states `containingPage*` is captured at connect time; if the node moves pages mid-session, clients should call `get_nodes_info()` with empty args to refresh, with `get_nodes_info`'s shape to be aligned with the Node-scope `node` block in a subsequent release.

### 9. ✅ Functionality dropped beyond "current page" — RESOLVED
Spec now has a top-level "Removed fields (breaking changes)" section documenting the removal of all three with rationale:
- `childCount` per page — removed because computing it forces `figma.loadAllPagesAsync()`, which is prohibitive on 100+ page documents (5–20+ s, 1+ GB). Clients can derive emptiness via `get_pages_info({ pageIds: [...] })`.
- `type: "DOCUMENT"` root discriminator — redundant; `editableScopeType` plus `documentId` / `documentName` cover the role.
- `isCurrent` / `currentPageId` / `currentPageName` — current-page concept dropped from read surface in favor of editable-scope semantics.

### 10. ✅ Internal `figma.currentPage` reliance is unaffected — RESOLVED
Out of scope for v1.3.0. Write-side usage of `figma.currentPage` will be addressed in a later release.

### 12. ✅ Mixed prose + JSON message body — RESOLVED
Change 1 responses are now pure JSON with `status` + `channel` fields. No more prose preamble for clients to skip past.

## Suggested spec additions

- **Section: Breaking changes** — list `get_document_info` removal, `get_page_info` rename, payload shape changes.
- **Section: Error responses** — define per-tool failure modes.
- **Section: Loading & performance** — document `loadAllPagesAsync` / `loadAsync` requirements and any batching guidance.
- **Section: Removed fields** — `childCount`, document-root `type`, `currentPageId/Name`, `isCurrent`.

## New items raised by the Change 1 restructure

### 13. ✅ `pages` array semantics in editable-scope payloads are ambiguous — RESOLVED
Spec now spells it out per scope:
- Read-only: `pages` = all pages.
- Page scope: `pages` = only the editable page (with children).
- Node scope: no top-level `pages` array; containing page id/name lives inside the `node` object.

Caveat (not blocking): under Page scope the model has no list of *other* page names without an extra `get_pages_info()` round-trip. If that becomes a usability issue in practice, consider adding a slim `otherPages: [{ pageId, pageName }]` array.

### 14. ✅ Node-scope: `pages[].children` vs. `node.children` overlap is unclear — RESOLVED
Moot. Node-scope payload no longer has a top-level `pages` array; only `node.children` is present, so there is no overlap to resolve.

### 15. ✅ JSON validity nits — RESOLVED
Missing comma after `parentPageName` added; trailing whitespace on the Page-scope closing `]` cleaned up.
- Note: blank lines inside JSON objects are valid whitespace per the JSON spec; the earlier note flagging them was incorrect — disregard.

### 16. ✅ Page-scope `type: "PAGE"` discriminator — RESOLVED
With prose removed and `editableScopeType` carrying the discriminator (plus distinct payload shapes per scope), the per-page `type` field is no longer needed. Closing this out.

### 17. ✅ Naming churn: `scopeType` → `editableScopeType` — RESOLVED
`editableScopeType` is the final name. All references in this recommendation file have been updated.

### 18. ✅ `status: "success"` field implies a failure response shape that's not specified — RESOLVED
Spec now defines an "Error response" section with the `{ status, channel, errorCode, errorMessage }` shape and a table of error codes (`CHANNEL_NOT_FOUND`, `CHANNEL_JOIN_FAILED`, `PLUGIN_DISCONNECTED`, `SCOPE_DELETED`, `SCOPE_INVALID`, `DOCUMENT_LOAD_FAILED`, `UNKNOWN_ERROR`) with suggested human-readable messages. This also resolves item 7 (scope-deleted state) — see `SCOPE_DELETED` and `SCOPE_INVALID`.
