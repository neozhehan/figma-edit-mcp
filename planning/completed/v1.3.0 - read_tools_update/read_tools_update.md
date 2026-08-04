# Read Tools Update Specification

## Removed fields (breaking changes)

The following fields are removed from read-tool responses in v1.3.0. None of the new payloads in this spec include them, and consumers should not expect them.

| Removed field | Previously returned by | Reason for removal |
|---|---|---|
| `childCount` (per page) | `getDocumentInfo` ([figma_plugin/handlers/nodeReaders.ts](../../figma_plugin/handlers/nodeReaders.ts)) | Computing `childCount` for every page requires `figma.loadAllPagesAsync()`, which materializes the full node tree of every page into plugin memory. On documents with 100+ pages this can take 5–20+ seconds and consume 1+ GB, and it would be paid on every connect / no-args call. Clients that need to know whether a specific page is empty can call `get_pages_info({ pageIds: [...] })` and inspect `children.length`. |
| `type: "DOCUMENT"` (root discriminator) | `getDocumentInfo` | Redundant. The new payloads use `editableScopeType` to discriminate response shape, and `documentId` / `documentName` already identify the document root. |
| `isCurrent` (per page) and `currentPageId` / `currentPageName` (root) | `getDocumentInfo`, `getPageInfo` | The "current page" concept is no longer surfaced through the read tools. Editable-scope semantics replace it: clients should reason about pages via `editableScopeType` and the editable-scope payload, not the user's currently-viewed page. (Note: write-side handlers continue to use `figma.currentPage` internally — this will be addressed in a later release.) |

## Loading & performance

These rules govern the read-tool entry points introduced or modified by this spec — the connect-flow payloads in Change 1, and `get_pages_info` in Change 2. They do **not** apply to other read tools in the codebase (notably `get_components`, which retains its existing `scope: 'document'` escape hatch — see "Out of scope" below).

### Rules

1. **Read tools in this spec MUST NOT call `figma.loadAllPagesAsync()`.**
   Use `figma.root.children` for id/name enumeration (no load required) and `page.loadAsync()` per requested page only when the page's `children` are needed in the response.

2. **`get_pages_info({ pageIds })` MUST stream page-by-page when `pageIds.length > 1`.**
   For each requested id:
   1. `await page.loadAsync()`,
   2. emit a `command_progress` event (`status: "in_progress"`) with running totals,
   3. push the per-page entry into `pages`,
   4. `await new Promise(r => setTimeout(r, 0))` before the next iteration so the Figma sandbox flushes the UI message between chunks.

   Bookend the loop with `started` and `completed` events. The MCP server already resets its inactivity timeout on `progress_update` ([src/mcp_server/figma-client.ts:138-158](../../src/mcp_server/figma-client.ts#L138)); the `setTimeout(0)` yield is what makes that reset effective — without it, events get coalesced.

3. **Pages SHOULD be loaded on demand, not pre-emptively.**
   - Read-only connect payload: list `figma.root.children` (id + name only); no loads.
   - Page-scope connect payload: single `await targetPage.loadAsync()`.
   - Node-scope connect payload: `figma.getNodeByIdAsync(scopeRootId)` + walk up via `node.parent` to derive `containingPageId` / `containingPageName`. No additional load needed.
   - `get_pages_info()` no-args: same as read-only connect — enumerate, no loads.
   - `get_pages_info({ pageIds })`: per-page `loadAsync` only.

4. **Soft batch guidance: `pageIds.length <= 25` per call.**
   Not enforced at runtime. The guidance is delivered to the LLM via the `get_pages_info` tool description so the model naturally chunks large requests; see "Tool description" under Change 2 below. Even with progress events keeping the timeout alive, sequential `loadAsync` walks of dozens of pages will feel slow, so chunking client-side keeps responsiveness reasonable.

   **Implementation MUST NOT cap, truncate, warn, log, or emit telemetry on oversize input.** The 25-id figure is description-only — a chunking nudge to the model, not a contract clients can rely on. Adding runtime enforcement turns it into a hard limit that callers have to defensively work around (re-implementing chunking on the client side that the server is already silently doing), which defeats the point. If a future change wants enforcement, it needs its own design pass and breaking-change documentation.

### Prerequisite plumbing change

`sendProgressUpdate` in [figma_plugin/utils/progressUtils.ts:65](../../figma_plugin/utils/progressUtils.ts#L65) is currently synchronous. It MUST be made async with a trailing `await new Promise(r => setTimeout(r, 0))` after `figma.ui.postMessage(...)`. Without this, rule (2)'s progress events get coalesced or dropped and the streaming pattern collapses back into a blocking call. This is a one-line change but it's a precondition for any of the streaming benefits to land.

Implementation checklist:
- Update `sendProgressUpdate` to be async + flush.
- **Update every existing caller** to `await` the now-async function (and mark enclosing functions `async`). Known call sites today: `annotationHandlers.ts`, `connectorHandlers.ts`, `nodeModifiers.ts`, `componentHandlers.ts` — confirm with a grep for `sendProgressUpdate(`. A missed `await` silently bypasses the flush and reintroduces the coalescing bug.
- Audit `state.activeRequestId` capture in [figma_plugin/ui.html](../../figma_plugin/ui.html) so progress events fired by the plugin are tagged back to the originating MCP request. Concretely: capture `message.id` from inbound `broadcast` messages before forwarding to the plugin, pin it onto outbound `progress_update` payloads, and clear it on `command-result` / `command-error` dispatch. Without it, concurrent reads can have their progress events mis-correlated.

### Out of scope (follow-up)

`getComponents` ([figma_plugin/handlers/componentHandlers.ts:61](../../figma_plugin/handlers/componentHandlers.ts#L61)) calls `figma.loadAllPagesAsync()` when invoked with `scope: 'document'`. That handler is not modified by v1.3.0 — the rule above applies only to read tools introduced/modified by this spec. Replacing `getComponents`'s `loadAllPagesAsync` + `findAllWithCriteria` with a streaming page-by-page scan (the original pattern from grab/cursor-talk-to-figma-mcp PR #153) is filed as a follow-up; it changes return-time semantics, needs its own progress emission, and may surface different ordering, so it shouldn't ride alongside the read-tool spec change.

**`get_nodes_info` response shape is unchanged in v1.3.0.** The Change 1 Node-scope `node` block (`nodeId`, `nodeName`, `type`, `parentNodeId`, `parentNodeName`, `parentNodeType`, `containingPageId`, `containingPageName`, `children`) is the canonical shape going forward, but `get_nodes_info` continues to return its existing shape — the `Promise<{ nodeId, parentId, document: <filtered JSON_REST_V1 export> }[]>` produced by [figma_plugin/handlers/nodeReaders.ts](../../figma_plugin/handlers/nodeReaders.ts). Clients using `get_nodes_info()` (no args) as the Node-scope refresh path described in "Refreshing the editable scope" will receive today's shape and must adapt accordingly. Aligning `get_nodes_info`'s shape with the Change 1 Node-scope block is filed as a follow-up release; bundling it into v1.3.0 would expand the breaking-change surface for marginal benefit and risk delaying the connect-flow work that's actually load-bearing.

## Change 1

When a client connects, the MCP server should respond differently depending on the active editable scope.

### Connect-flow mechanics

The connect response is assembled by the MCP server's `join_channel` tool in two sequential legs:

1. **Socket-level join.** `joinChannel(channelName)` ([src/mcp_server/figma-client.ts](../../src/mcp_server/figma-client.ts)) performs the channel join against [src/socket.ts](../../src/socket.ts). The MCP server tags its join request with `clientType: "mcp"` so the socket server can distinguish it from a plugin's join. When an `mcp` joiner targets a channel that has no other members, the socket server replies with a structured `{ type: "join_error", code: "CHANNEL_NOT_FOUND", id }` and does not register the joiner. A missing socket-level ack within the join timeout produces `CHANNEL_JOIN_FAILED`. A connection drop mid-handshake produces `PLUGIN_DISCONNECTED`. Plugin clients omit `clientType` (or send `clientType: "plugin"`) and remain free to create new channels — backward compatible with older plugin builds.
2. **Plugin-level scope payload.** Once joined, the MCP server sends a new `get_connect_payload` command to the plugin. The plugin returns one of the three success bodies defined below (without the `status` / `channel` envelope fields), or a structured `{ errorCode, errorMessage }` for plugin-side failures (`SCOPE_DELETED`, `SCOPE_INVALID`, `DOCUMENT_LOAD_FAILED`, `UNKNOWN_ERROR`). The MCP server wraps the result with `status` and the joined `channel` name before returning it as the tool response.

The plugin command lives in a new `handlers/connectHandlers.ts` (kept separate from `nodeReaders.ts`, which is being trimmed). It MUST NOT call `figma.loadAllPagesAsync()` — see "Loading & performance" above for the per-scope load policy.

If leg 2 fails after leg 1 succeeded, the MCP server MUST clear `currentChannel` (so the next attempt re-joins cleanly) and return the Change 1 error envelope. Partial success — "joined but no scope" — is not a valid state; clients receive either a complete success payload or an error.

Error-code mapping for leg 2 failures:
- Plugin returns a structured `{ errorCode, errorMessage }` (resolved promise, scope check failure inside the plugin) → pass `errorCode` straight through. Expected codes: `SCOPE_DELETED`, `SCOPE_INVALID`, `DOCUMENT_LOAD_FAILED`, `UNKNOWN_ERROR`.
- Promise rejects with a WebSocket-close error → `PLUGIN_DISCONNECTED`.
- Promise rejects with a timeout or unclassified error → `UNKNOWN_ERROR`, with the underlying message appended to `errorMessage` for diagnostics.

In every leg-2 failure case, `currentChannel` is cleared before the envelope is returned, so a follow-up `join_channel` call performs the socket-level join again rather than reusing a half-attached channel.



### Read-Only Mode
If the plugin is in read-only mode, the MCP server should send to the client:
*(Note: the pages array should contain all pages in the document)*
```
{
  "status": "success",
  "channel": "<channel_name>",
  "editableScopeType": "string ('readonly' | 'page' | 'node')",

  "documentId": "string (The root document ID)",
  "documentName": "string (The name of the Figma file)",

  "pageCount": "number (Total number of pages in the file)",
  "pages": [
    {
      "pageId": "string (The unique ID of the page)",
      "pageName": "string (The user-facing name of the page)"
    }
  ]
}
```

### Editable Scope is a Page
If the editable scope is set to a page, the MCP server should send to the client:
*(Note: the pages array should only contain the editable page, and the children array should only contain top-level children)*

```
{
  "status": "success",
  "channel": "<channel_name>",
  "editableScopeType": "string ('readonly' | 'page' | 'node')",

  "documentId": "string (The root document ID)",
  "documentName": "string (The name of the Figma file)",

  "pageCount": "number (Total number of pages in the file)",
  "pages": [
    {
      "pageId": "string (The unique ID of the page)",
      "pageName": "string (The user-facing name of the page)",
      "children": [
        {
          "id": "string (The ID of the child node)",
          "name": "string (The name of the child node, e.g., 'Login Screen')",
          "type": "string (The node type, e.g., 'FRAME', 'COMPONENT', 'GROUP')"
        }
      ]
    }
  ]
}
```

### Editable Scope is a Node
If the editable scope is set to a node, the MCP server should send to the client:
*(Note: children array should only contain top-level children)*
*(Note: `containingPageId` / `containingPageName` reflect the page that contains the editable node **at connect time**. If the node is later moved to a different page within the session, the connect payload becomes stale — clients should call `get_nodes_info()` with empty args to fetch updated context. The `get_nodes_info` response shape is **unchanged in v1.3.0** — it continues to return today's `{ nodeId, parentId, document }[]` shape. Alignment with the Node-scope `node` block is deferred to a follow-up release; see "Out of scope (follow-up)".)*
```
{
  "status": "success",
  "channel": "<channel_name>",
  "editableScopeType": "string ('readonly' | 'page' | 'node')",

  "documentId": "string (The root document ID)",
  "documentName": "string (The name of the Figma file)",

  "node": {
    "nodeId": "string (The ID of the editable node)",
    "nodeName": "string (The name of the editable node)",
    "type": "string (The node type, e.g., 'FRAME', 'COMPONENT', 'GROUP')",

    "parentNodeId": "string (The ID of the parent of the editable node)",
    "parentNodeName": "string (The name of the parent of the editable node)",
    "parentNodeType": "string (The node type, e.g., 'FRAME', 'COMPONENT', 'GROUP', 'PAGE')",

    "containingPageId": "string (The unique ID of the page that contains the editable node)",
    "containingPageName": "string (The user-facing name of the page that contains the editable node)",

    "children": [ ... top-level children with Id, Name, Type ... ]
  }
}
```

### Error response

If the connect flow fails, the MCP server should send the following shape instead of any of the success payloads above:

```
{
  "status": "error",
  "channel": "<channel_name>",
  "errorCode": "string (one of the codes listed below)",
  "errorMessage": "string (human-readable description)"
}
```

Possible `errorCode` values and suggested `errorMessage` text:

| `errorCode` | When it occurs | Suggested `errorMessage` |
|---|---|---|
| `CHANNEL_NOT_FOUND` | The requested `channel` does not exist or has no plugin connected to it. | `"Channel '<channel_name>' was not found. Verify the channel name and that the Figma plugin is running and connected."` |
| `CHANNEL_JOIN_FAILED` | The WebSocket join handshake failed for a reason other than a missing channel (timeout, transport error, etc.). | `"Failed to join channel '<channel_name>'. The Figma plugin did not acknowledge the join within the expected time. Try reconnecting the plugin."` |
| `PLUGIN_DISCONNECTED` | The plugin was reachable initially but disconnected before the scope payload could be assembled. | `"The Figma plugin disconnected before the editable scope could be read. Reopen the plugin and try again."` |
| `SCOPE_DELETED` | The plugin holds a `scopeRootId`, but the referenced node no longer exists in the document. | `"The node previously set as the editable scope no longer exists. Disconnect the plugin and select a new editable scope via the 'Link to Selection' field."` |
| `SCOPE_INVALID` | The plugin reports a scope state that cannot be resolved to `readonly`, `page`, or `node` (e.g. corrupted plugin state). | `"The plugin reported an unrecognized editable scope state. Disconnect and reconnect the plugin to reset its scope."` |
| `DOCUMENT_LOAD_FAILED` | `figma.loadAllPagesAsync()` (or a per-page `loadAsync()`) threw while assembling the response. | `"Failed to load the Figma document's pages. The file may be too large or temporarily unavailable. Retry shortly."` |
| `UNKNOWN_ERROR` | Catch-all for unexpected exceptions. The underlying error message should be appended for diagnostics. | `"An unexpected error occurred while joining the channel: <underlying message>."` |

Notes:
- `errorCode` values are stable identifiers; clients should branch on `errorCode`, not on `errorMessage`.
- `errorMessage` is intended for the LLM / end-user; it should be safe to surface verbatim and should suggest a recovery action whenever possible.
- `channel` is echoed even on failure so clients can correlate the response to the request.

### Refreshing the editable scope

To re-fetch the current editable scope after the initial connect response, clients should use the following canonical refresh paths per `editableScopeType`:

- **`page` scope**: call `get_pages_info({ pageIds: [<editable page id>] })`. The single-page response shape (defined in Change 2 below) matches the `pages[0]` entry from the original Page-scope connect payload.
- **`node` scope**: call `get_nodes_info()` with no arguments. Empty-args `get_nodes_info` returns the editable scope node.
      - *(Note: `get_nodes_info`'s response shape is **unchanged in v1.3.0**. Callers must expect today's `{ nodeId, parentId, document }[]` shape, NOT the Change 1 Node-scope `node` block. Alignment is filed as a follow-up release — see "Out of scope (follow-up)".)*
- **`readonly` scope**: no refresh tool — there is no editable scope to re-fetch. Use `get_pages_info()` (no args) to refresh the document-level page list.

## Change 2

- Remove the `get_document_info` tool entirely (breaking change — no deprecation period):
      - Unregister the tool from the MCP server (delete its `server.tool("get_document_info", ...)` block in [src/mcp_server/tools/document.ts](../../src/mcp_server/tools/document.ts)).
      - Remove the `"get_document_info"` entry from the `FigmaCommand` union in [src/mcp_server/figma-client.ts](../../src/mcp_server/figma-client.ts).
      - Remove the `case "get_document_info":` branch and the `getDocumentInfo` import in [figma_plugin/src/main.ts](../../figma_plugin/src/main.ts).
      - Delete the `getDocumentInfo` function and its export from [figma_plugin/handlers/nodeReaders.ts](../../figma_plugin/handlers/nodeReaders.ts) and [figma_plugin/handlers/index.ts](../../figma_plugin/handlers/index.ts).
      - Remove the matching unit-test cases in [src/mcp_server/tests/unit/tools/document.test.ts](../../src/mcp_server/tests/unit/tools/document.test.ts).
      - Update prompt strings that instruct the model to call `get_document_info()` in [src/mcp_server/tools/annotations.ts](../../src/mcp_server/tools/annotations.ts) and [src/mcp_server/tools/components.ts](../../src/mcp_server/tools/components.ts) to reference `get_pages_info()` instead.
      - Document under "Breaking changes" in the release notes.
- Replace the `get_page_info` tool with `get_pages_info` (breaking change — no alias, no deprecation period):
      - Rename the tool registration in [src/mcp_server/tools/document.ts](../../src/mcp_server/tools/document.ts) from `get_page_info` to `get_pages_info`. Replace the `pageId?: string` parameter with `pageIds?: string[]`.
      - Replace the `"get_page_info"` entry in the `FigmaCommand` union in [src/mcp_server/figma-client.ts](../../src/mcp_server/figma-client.ts) with `"get_pages_info"`.
      - Rename the `case "get_page_info":` branch in [figma_plugin/src/main.ts](../../figma_plugin/src/main.ts) to `case "get_pages_info":` and update the imported handler reference.
      - Rename the `getPageInfo` handler in [figma_plugin/handlers/nodeReaders.ts](../../figma_plugin/handlers/nodeReaders.ts) to `getPagesInfo`, change its signature to accept `{ pageIds?: string[] }`, and update the export in [figma_plugin/handlers/index.ts](../../figma_plugin/handlers/index.ts).
      - Update the matching unit-test cases in [src/mcp_server/tests/unit/tools/document.test.ts](../../src/mcp_server/tests/unit/tools/document.test.ts) — rename test ids, update parameter shapes, and assert against the new response schema.
      - Update any prompt strings that reference `get_page_info()` to reference `get_pages_info()`.
      - Document under "Breaking changes" in the release notes. Existing clients calling `get_page_info` will receive a tool-not-found error and must update to `get_pages_info`.
      - `get_pages_info` accepts an optional array of `pageIds`
      - **Tool description (LLM-facing).** The `server.tool(...)` registration in [src/mcp_server/tools/document.ts](../../src/mcp_server/tools/document.ts) MUST surface the soft batch guidance from Rule 4 of "Loading & performance" so the model chunks large requests on its own. Recommended description:
> *"Get information about pages in the Figma document. No argument or empty array returns all pages without children. 1 or more pageIds returns the requested pageIds with top-level children for each requested page. Prefer batches of ≤25 pageIds per call; for larger requests, split across multiple calls for better responsiveness."*
      - When `get_pages_info` is called without any parameters or with an empty `pageIds` array, MCP server should send to the client:
      *(Note: the pages array should contain all pages in the document)*
```json
{
  "documentId": "string (The root document ID)",
  "documentName": "string (The name of the Figma file)",
  "pageCount": "number (Total number of pages in the file)",
  "pages": [
    {
      "pageId": "string (The unique ID of the page)",
      "pageName": "string (The user-facing name of the page)"
    }
  ]
}
```
      - When `get_pages_info` is called with 1 or more `pageIds`, MCP server should send to the client:
*(Note: the pages array should only contain the pages in the pageIds array, and the children array should only contain top-level children)*
*(Note: any `pageIds` that cannot be resolved — id not found, id refers to a node that is not a page, or id belongs to a different document — are silently skipped and surfaced via `missingPageIds`. The call does not fail when only some ids resolve. If none of the requested ids resolve, `pages` will be empty and `missingPageIds` will contain every requested id.)*
*(Note: "is a page" is a strict check — `node.type === "PAGE" && node.parent === figma.root`. `SECTION` and other page-like container nodes are not treated as pages even though they can hold top-level frames; their ids go to `missingPageIds`. Use `get_nodes_info({ nodeIds: [...] })` to inspect a `SECTION`'s contents.)*
*(Note: input ordering is preserved and duplicates are removed. The handler dedupes `pageIds` while keeping first occurrence, then iterates the deduped list in order. Both `pages` and `missingPageIds` reflect that order: `pages[i]` corresponds to the i-th resolved id, `missingPageIds` lists unresolved ids in the order they first appeared in the input. Streaming progress events (`in_progress` running totals) fire in the same order so per-event totals match the final array.)*
```json
{
  "documentId": "string (The root document ID)",
  "documentName": "string (The name of the Figma file)",
  "pageCount": "number (Total number of pages in the file)",
  "pages": [
    {
      "pageId": "string (The unique ID of the page)",
      "pageName": "string (The user-facing name of the page)",
      "children": [
          {
              "id": "string (The ID of the child node)",
              "name": "string (The name of the child node, e.g., 'Login Screen')",
              "type": "string (The node type, e.g., 'FRAME', 'COMPONENT', 'GROUP')"
          }
       ]
    }
  ],
  "missingPageIds": "string[] (Requested pageIds that could not be resolved; empty array if every requested id was found)"
}
```
      - **Schema Implementation Note:** Because the response shape dynamically changes based on the input arguments (`children` and `missingPageIds` are only present when `pageIds` are requested), the schema implementation (e.g., Zod) will need to handle this conditionally by defining them as optional fields.
