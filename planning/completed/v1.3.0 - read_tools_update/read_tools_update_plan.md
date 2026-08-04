# Implementation Plan: v1.3.0 Read Tools Update

This document provides a comprehensive step-by-step implementation plan for the `v1.3.0` Read Tools Update, based on the specifications defined in `read_tools_update.md` and `read_tools_update_recommendation.md`.

## Overview

The implementation is broken down into four distinct phases to ensure stability and logical progression:
1. **Phase 1: Prerequisite Plumbing** - Establishing the async progress infrastructure.
2. **Phase 2: Read Tools Refactor** - Replacing existing read tools with the new streaming `get_pages_info`.
3. **Phase 3: Connect Flow Editable Scope Updates** - Dynamically adjusting the initial connect payloads based on editable scope.
4. **Phase 4: Testing & Validation** - Ensuring all contracts, performance requirements, and error states are met.

## Out of scope for v1.3.0

The following are deliberately excluded from this release. Each one is either filed as a follow-up or documented as a constraint that downstream code must work around:

- **`get_nodes_info` response shape stays unchanged.** The handler at [figma_plugin/handlers/nodeReaders.ts](../../figma_plugin/handlers/nodeReaders.ts) and the tool registration in [src/mcp_server/tools/document.ts](../../src/mcp_server/tools/document.ts) are NOT modified beyond what's required to keep them compiling after the rest of v1.3.0 lands. Clients using `get_nodes_info()` (no args) as the Node-scope refresh path receive today's `{ nodeId, parentId, document }[]` shape, NOT the Change 1 Node-scope `node` block. Aligning the two shapes is a follow-up release — bundling it here would expand the breaking-change surface and delay the connect-flow work. See the "Out of scope (follow-up)" section in [read_tools_update.md](read_tools_update.md).
- **`getComponents` streaming rewrite** — already filed as a follow-up; see the same section in the spec.
- **Write-side `figma.currentPage` reliance** — the read tools no longer surface the current-page concept, but write-side handlers continue to use `figma.currentPage` internally. That cleanup is a separate release.
- **MCP-first connect support** — today's design requires the plugin to join the channel before the MCP server. A "MCP joins, then plugin opens" flow would need a hold-open queue and is not in v1.3.0.

---

## Phase 1: Prerequisite Plumbing (Streaming Infrastructure)

**Objective**: Ensure the UI bridge can handle async progress events correctly without blocking or coalescing, which is a precondition for the streaming pattern.

### [x] 1. Make `sendProgressUpdate` Async
- **File**: `figma_plugin/utils/progressUtils.ts` ([line 65](../../figma_plugin/utils/progressUtils.ts#L65))
- **Action**: Change the `sendProgressUpdate` function to be `async`.
- **Implementation**:
  - Immediately after the `figma.ui.postMessage(...)` call, add `await new Promise(r => setTimeout(r, 0));`.
  - **Reasoning**: This forces the Figma sandbox to flush the UI message to the UI thread before proceeding to the next iteration, preventing UI freezes and ensuring the MCP server's inactivity timeout gets reset correctly.

### [x] 1a. Update All Existing `sendProgressUpdate` Callers to `await`
- **Action**: Once `sendProgressUpdate` becomes `async`, every call site must be `await`ed (and its enclosing function made `async` if it isn't already). Without this, the trailing `setTimeout(0)` flush is bypassed — call sites move on without yielding and progress events coalesce, defeating the whole point of step 1.
- **Files & known call sites** (grep `sendProgressUpdate(` to confirm — list as of writing):
  - `figma_plugin/handlers/annotationHandlers.ts`
  - `figma_plugin/handlers/connectorHandlers.ts`
  - `figma_plugin/handlers/nodeModifiers.ts`
  - `figma_plugin/handlers/componentHandlers.ts`
  - `figma_plugin/handlers/textHandlers.ts` (if it calls it — verify with grep)
- **Implementation**:
  - For each call site: prepend `await`, ensure the enclosing function is `async`, ensure the call site's caller correctly awaits the now-async chain.
  - Watch for fire-and-forget patterns (`sendProgressUpdate(...).catch(...)` style) — the migration intent is sequential `await`, NOT background dispatch.
- **Verification**: TypeScript `strictNullChecks` + `noImplicitAny` won't catch missing `await` on a now-Promise-returning function. Run a grep at the end of the change to confirm zero unawaited `sendProgressUpdate(` call sites remain.

### [x] 2. Implement `activeRequestId` Capture in UI Bridge
- **File**: `figma_plugin/ui.html` ([command-handling section, lines 779-855 area](../../figma_plugin/ui.html#L779))
- **Action**: Ensure `state.activeRequestId` is set on every inbound MCP request and read by the outbound `command_progress` → `progress_update` forwarder.
- **Implementation**:
  - **Inbound capture**: when the UI receives a WebSocket message of `type === "broadcast"` carrying a `message.command` and `message.id`, store `state.activeRequestId = message.id` *before* posting the request to the plugin via `parent.postMessage(...)`.
  - **Outbound tagging**: in the `command_progress` handler that forwards to the WebSocket as `progress_update`, ensure the outgoing payload's `id` field is `state.activeRequestId`. Today the forwarder relies on whatever id the plugin tags into the progress event; with this change it pins the id to the active request even if the plugin's `commandId` (from `generateCommandId`) drifts.
  - **Clear on completion**: reset `state.activeRequestId = null` when the `command-result` / `command-error` is dispatched back to the WebSocket. This keeps a stale id from latching onto unrelated progress events emitted between requests.
- **Reasoning**: Without this, concurrent read requests can cross-wire — progress events from request B can be tagged as request A on the server side, and the inactivity-timeout reset at [figma-client.ts:138-158](../../src/mcp_server/figma-client.ts#L138) would refresh the wrong pending request.
- **Concurrency note**: today's plugin `state.commandQueue` ([main.ts:186](../../figma_plugin/src/main.ts#L186)) serializes execution, so in practice only one request is active at a time. The `activeRequestId` fix is correctness insurance for the moment that serialization changes.

---

## Phase 2: Read Tools Refactor (`get_pages_info`)

**Objective**: Eliminate the heavy `loadAllPagesAsync()` calls by removing `get_document_info`, replacing `get_page_info` with a streaming `get_pages_info` tool, and enforcing on-demand loading.

### [x] 1. Remove `get_document_info` Tool (Breaking Change)
- **File**: `src/mcp_server/tools/document.ts`
  - Delete the `server.tool("get_document_info", ...)` block.
- **File**: `src/mcp_server/figma-client.ts`
  - Remove `"get_document_info"` from the `FigmaCommand` union.
- **File**: `figma_plugin/src/main.ts`
  - Remove the `case "get_document_info":` branch and its associated import.
- **File**: `figma_plugin/handlers/nodeReaders.ts`
  - Delete the `getDocumentInfo` function.
- **File**: `figma_plugin/handlers/index.ts`
  - Remove the `getDocumentInfo` export.
- **File**: `src/mcp_server/tests/unit/tools/document.test.ts`
  - Delete all unit tests testing `get_document_info`.
- **Files**: `src/mcp_server/tools/annotations.ts`, `src/mcp_server/tools/components.ts`
  - Update LLM prompt strings to instruct the model to use `get_pages_info` instead of `get_document_info`.

### [x] 2. Replace `get_page_info` with `get_pages_info` (Breaking Change)
- **File**: `src/mcp_server/tools/document.ts`
  - Rename the tool registration from `get_page_info` to `get_pages_info`.
  - **Schema Update**:
    - Change parameter from `pageId?: string` to `pageIds?: string[]`.
    - Ensure `children` and `missingPageIds` are conditionally represented in the return type schema as optional, since they only appear when `pageIds` is provided.
  - **Description Update**: Surface soft batch guidance. Recommend <= 25 `pageIds` per call to encourage LLM chunking, and mention streaming semantics.
  - **Soft-limit enforcement: NONE.** The 25-id figure is description-only. Implementation MUST NOT cap, truncate, warn, log, or emit telemetry on oversize input. The handler accepts arrays of any length and processes them sequentially; the streaming progress events are what keep large calls alive. If a future PR proposes adding a runtime warning or cap, it needs its own design pass — point to this line.
- **File**: `src/mcp_server/figma-client.ts`
  - Update the `FigmaCommand` union to `"get_pages_info"`.
- **File**: `figma_plugin/src/main.ts`
  - Rename the switch case to `"get_pages_info"`.
- **File**: `figma_plugin/handlers/nodeReaders.ts`
  - Rename `getPageInfo` to `getPagesInfo`.
  - **Implementation Logic**:
    - **No arguments / Empty array**: Iterate over `figma.root.children` and return `{ documentId, documentName, pageCount, pages: [{ pageId, pageName }] }`. **Must NOT call `loadAsync()` or `loadAllPagesAsync()`**.
    - **With `pageIds`**:
      1. **Dedupe while preserving input order.**
         ```ts
         const seen = new Set<string>();
         const orderedIds = pageIds.filter(id => !seen.has(id) && (seen.add(id), true));
         ```
         Subsequent steps iterate `orderedIds`, not the raw `pageIds`. Duplicates are dropped silently — they don't appear in `pages` twice and they don't appear in `missingPageIds`.
      2. Initialize `pages = []` and `missingPageIds = []`.
      3. Emit a `started` progress event with `totalItems = orderedIds.length`.
      4. For each ID in `orderedIds` (in order):
         - Resolve via `await figma.getNodeByIdAsync(id)`.
         - **Strict page check**: treat the id as resolved only if `node && node.type === "PAGE" && node.parent === figma.root`. Otherwise (null, wrong type, or page node belonging to a different document — `node.parent !== figma.root`) push the id to `missingPageIds` and continue. `SECTION` and other page-like container types are explicitly NOT treated as pages.
         - If valid, `await page.loadAsync()`.
         - Map top-level children.
         - Push page data to `pages`.
         - `await sendProgressUpdate(...)` with `status: "in_progress"` and running totals (`processedItems` = resolved + skipped so far).
      5. Emit `completed` progress event.
      6. Return the full response object including `missingPageIds`.
    - **Ordering invariants** (must be covered by tests, see Phase 4):
      - `pages` reflects the deduped input order — `pages[i].pageId === orderedIds[k]` where `orderedIds[k]` is the i-th resolvable id.
      - `missingPageIds` lists unresolved ids in the order they first appeared in the input.
      - Progress events fire in the same iteration order, so `processedItems` at event N equals the count of items processed up to and including the N-th iteration.
- **File**: `figma_plugin/handlers/index.ts`
  - Update export to `getPagesInfo`.

### [x] 3. Removed-Fields Search-and-Replace Pass
- **Action**: Sweep the repo for the field names that Change 1 removes, so no caller, prompt string, or doc still references them after v1.3.0 lands.
- **Field list** (from "Removed fields" in [read_tools_update.md](read_tools_update.md)):
  - `childCount`
  - `currentPageId`
  - `currentPageName`
  - `isCurrent`
  - `type: "DOCUMENT"` (root discriminator)
- **Sweep targets**:
  - `src/**/*.ts` — code references (any remaining consumer or type alias).
  - `src/mcp_server/tools/**/*.ts` — tool descriptions and prompt strings handed to the LLM.
  - `CLAUDE.md`, `README.md`, any `docs/` content — user/contributor-facing docs.
  - Test fixtures and snapshots — stale assertions will fail loudly, but make the cleanup explicit.
- **Implementation**:
  - For each match, decide: delete (if it's only describing removed behavior), update (if the surrounding text needs to point at `get_pages_info` / `editableScopeType` instead), or leave (if it's an unrelated identifier — e.g. `childCount` referring to a different node concept; verify by reading context).
  - Specifically rewrite any prompt sentence like *"call `get_document_info` to learn about pages"* to *"call `get_pages_info` to learn about pages"*.
  - Final grep for each token must return zero v1.3.0-relevant hits before the change is considered done.

### [x] 4. Version Bump and Changelog
- **File**: `package.json`
  - Bump `version` to `1.3.0`.
- **File**: `CHANGELOG.md` (or release notes file — check what the repo uses)
  - Add a `1.3.0` entry under "Breaking changes" listing:
    - `get_document_info` removed (no deprecation period; clients receive tool-not-found if they call it).
    - `get_page_info` renamed to `get_pages_info` with new parameter shape (`pageIds?: string[]` replacing `pageId?: string`) and new response shape.
    - `join_channel` response shape changed from prose to JSON with `status` / `channel` / `editableScopeType` envelope.
    - Removed fields from connect/page payloads: `childCount`, `currentPageId`, `currentPageName`, `isCurrent`, root `type: "DOCUMENT"`.
  - Under "New": `editableScopeType` discriminator, `get_pages_info` streaming with progress events, structured connect-flow error codes (`CHANNEL_NOT_FOUND` / `CHANNEL_JOIN_FAILED` / `PLUGIN_DISCONNECTED` / `SCOPE_DELETED` / `SCOPE_INVALID` / `DOCUMENT_LOAD_FAILED` / `UNKNOWN_ERROR`).
  - Cross-link to [read_tools_update.md](../documentation/v1.3.0%20-%20read_tools_update/read_tools_update.md) for the full spec.
- **Reasoning**: Spec calls out "Document under Breaking changes in the release notes" — making it a discrete task ensures it lands.

---

## Phase 3: Connect Flow Editable Scope Updates

**Objective**: Dynamically return scope-specific payloads upon client connection, removing the deprecated `childCount`, `type: "DOCUMENT"`, and `isCurrent`/`currentPageId` fields, and adding structured error handling.

### Architectural decision: two-leg connect

The connect payload is assembled by the MCP server's `join_channel` tool in two sequential legs (see "Connect-flow mechanics" in the spec):
1. **Socket-level join** via the existing `joinChannel(...)` against [src/socket.ts](../../src/socket.ts).
2. **Plugin-level scope payload** via a new `get_connect_payload` plugin command, returned through `sendCommandToFigma(...)`.

The MCP server wraps the plugin's response with the `status` / `channel` envelope before returning it. Partial success ("joined but no scope") is not a valid state — leg 2 failures clear `currentChannel` and return the Change 1 error envelope.

### [x] 1. Add the `get_connect_payload` Plugin Command
- **File**: `figma_plugin/handlers/connectHandlers.ts` (new file)
  - Export an async `getConnectPayload()` handler. No params.
  - Branch on `state.readOnly` and `state.scopeRootId` (read from the module-level `state` in [main.ts](../../figma_plugin/src/main.ts), or refactor into a small accessor — implementer's call).
  - **Read-Only branch** (`state.readOnly === true`):
    - Return `{ editableScopeType: "readonly", documentId, documentName, pageCount, pages: [{ pageId, pageName }] }` by mapping `figma.root.children` directly. **No `loadAsync()`**.
  - **Page-Scope branch** (`scopeRootId` resolves to a `PAGE` node):
    - `await targetPage.loadAsync()`.
    - Return `{ editableScopeType: "page", documentId, documentName, pageCount, pages: [{ pageId, pageName, children: [...top-level...] }] }`.
  - **Node-Scope branch** (`scopeRootId` resolves to a non-`PAGE` node):
    - Walk `node.parent` chain until a `PAGE` is found.
    - Return `{ editableScopeType: "node", documentId, documentName, node: { nodeId, nodeName, type, parentNodeId, parentNodeName, parentNodeType, containingPageId, containingPageName, children: [...top-level...] } }`.
    - No additional `loadAsync()` required (`getNodeByIdAsync` already loads ancestors lazily).
  - **Error returns** (NOT thrown — return a structured `{ errorCode, errorMessage }`):
    - `SCOPE_DELETED` if `state.scopeRootId` is set but `figma.getNodeByIdAsync(scopeRootId)` resolves to `null`.
    - `SCOPE_INVALID` if the resolved node has no `PAGE` ancestor (orphaned node), or the scope state is otherwise unrecognizable.
    - `DOCUMENT_LOAD_FAILED` if any `loadAsync()` rejects — wrap in try/catch.
    - `UNKNOWN_ERROR` as catch-all with the underlying message appended.
- **File**: `figma_plugin/handlers/index.ts`
  - Export `getConnectPayload`.
- **File**: `figma_plugin/src/main.ts`
  - Add `import { getConnectPayload } from '../handlers/connectHandlers.js'`.
  - Add `case "get_connect_payload": return await getConnectPayload();` to the `handleCommand` switch.
- **File**: `src/mcp_server/figma-client.ts`
  - Add `"get_connect_payload"` to the `FigmaCommand` union.

### [x] 2. Rewrite the `join_channel` MCP Tool
- **File**: `src/mcp_server/tools/document.ts` ([lines 202-267](../../src/mcp_server/tools/document.ts#L202))
- **Action**: Replace the prose-based success message and the hacky `get_nodes_info` scope probe ([lines 233-244](../../src/mcp_server/tools/document.ts#L233)) with the two-leg flow.
- **Fail-closed contract** (covers Q6): "joined but no scope" is not a valid state. If leg 2 fails for any reason after leg 1 succeeded, the tool MUST:
  1. Reset transport state — clear `currentChannel` in [figma-client.ts](../../src/mcp_server/figma-client.ts) (export a `resetChannel()` helper or a setter; do NOT leave `currentChannel` pointing at a channel the client can't actually use). The next `joinChannel(...)` call then re-runs the full handshake.
  2. Return the Change 1 error envelope `{ status: "error", channel, errorCode, errorMessage }` — never a partial success object, never a `joined: true` flag with missing scope.
- **Implementation**:
  1. Validate / prompt for `channel` (existing behavior at lines 213-228 stays).
  2. **Leg 1** — `await joinChannel(channel)`. On rejection, classify and return error envelope:
     - Tagged `joinErrorCode === "CHANNEL_NOT_FOUND"` → `errorCode: "CHANNEL_NOT_FOUND"`.
     - Timeout (rejection message matches the pending-request timeout) → `errorCode: "CHANNEL_JOIN_FAILED"`.
     - WebSocket close mid-handshake → `errorCode: "PLUGIN_DISCONNECTED"`.
     - Anything else → `errorCode: "UNKNOWN_ERROR"` with the underlying message appended to `errorMessage`.
     - Note: leg 1 rejection means the join was never registered, so there's nothing to clean up — just return the envelope.
  3. **Leg 2** — `const payload = await sendCommandToFigma("get_connect_payload")`. Two failure modes to handle:
     - **Transport rejection** (timeout, WebSocket close): the promise rejects. Map to:
       - WebSocket close → `errorCode: "PLUGIN_DISCONNECTED"`.
       - Timeout / other → `errorCode: "UNKNOWN_ERROR"` with the underlying message.
       - Call the `resetChannel()` helper before returning the envelope.
     - **Structured plugin error** (`payload.errorCode` is set): the promise resolves but the payload is the `{ errorCode, errorMessage }` shape from `getConnectPayload`. Pass `errorCode` straight through (`SCOPE_DELETED`, `SCOPE_INVALID`, `DOCUMENT_LOAD_FAILED`, `UNKNOWN_ERROR`), call `resetChannel()`, return the envelope with `channel` echoed.
  4. **Success path**: wrap the resolved payload as `{ status: "success", channel, ...payload }` and return as the tool's `content[0].text` (JSON-stringified). Do NOT call `resetChannel()`.
- **Note**: Tool response is always a single `text` content item containing JSON — matches MCP convention. Both success and error envelopes use the same content shape; clients branch on `status`.

### [x] 3. Wire Socket-Side `CHANNEL_NOT_FOUND` Detection
- **File**: `src/mcp_server/figma-client.ts`
  - **Tag MCP joins.** Update `joinChannel` ([line 223](../../src/mcp_server/figma-client.ts#L223)) so the join request includes `clientType: "mcp"`. The plugin's existing join (sent from [figma_plugin/ui.html](../../figma_plugin/ui.html)) stays unchanged — absence of `clientType` is treated as a plugin join, which keeps older plugin builds working without modification.
  - **Recognize `join_error` acks.** In the `ws.on("message", ...)` handler ([lines 126-200](../../src/mcp_server/figma-client.ts#L126)), branch on `json.type === "join_error"` before the generic response path. Look up the pending request by `json.id`, reject with a tagged error (e.g. `Object.assign(new Error(json.message), { joinErrorCode: json.code })`), and delete the request entry. The tool layer reads `joinErrorCode` to decide which Change 1 `errorCode` to surface.
  - **Map timeouts and drops.** A pending join request that hits its `sendCommandToFigma` timeout maps to `CHANNEL_JOIN_FAILED`. A `ws.on("close", ...)` rejection ([line 206](../../src/mcp_server/figma-client.ts#L206)) of a still-pending join maps to `PLUGIN_DISCONNECTED`. Both can be distinguished by the existing rejection messages plus the `joinErrorCode` absence.
- **File**: `src/socket.ts` ([line 67](../../src/socket.ts#L67))
  - **Detect lone-MCP joins.** In the `data.type === "join"` branch, before adding the joiner to the channel, check `data.clientType === "mcp"`. If so, look at the channel's existing membership: `channels.get(channelName)?.size ?? 0`. If zero, the channel has no plugin attached — reply with `{ type: "join_error", code: "CHANNEL_NOT_FOUND", id: data.id, message: "Channel '<name>' was not found. Verify the channel name and that the Figma plugin is running and connected." }` and `return` without registering the client. Do NOT auto-create the channel for MCP joins.
  - **Plugin joins unchanged.** When `clientType` is absent or `"plugin"`, retain today's behavior (auto-create channel if missing, register the client, send the existing system ack at lines 89-102). This keeps the plugin's join path identical to current production.
  - **Race note.** This intentionally requires the plugin to join first. That matches the current UX (plugin opens → user copies channel name → MCP server joins). If we later want to support "MCP joins, then plugin opens," it'd need a different design (e.g. a hold-open queue), which is out of scope.
- **File**: `figma_plugin/ui.html`
  - **No change required.** The plugin's join request continues to omit `clientType` and is treated as a plugin join by the socket server.

### [x] 4. Map Plugin-Side `SCOPE_DELETED` to a Structured Code
- **File**: `figma_plugin/src/main.ts` ([line 85](../../figma_plugin/src/main.ts#L85))
- **Action**: Today `checkScopeAccess` throws a free-text error. Leave that behavior alone for write paths, but in `getConnectPayload`, perform the same scope-existence check first and return `{ errorCode: "SCOPE_DELETED", errorMessage: ... }` as a structured value rather than letting it propagate as a thrown string.

---

## Phase 4: Testing & Validation

**Objective**: Ensure changes are stable, schemas validate properly, and legacy usages fail predictably.

### [x] 1. Schema & Dispatch Unit Tests
- **File**: `src/mcp_server/tests/unit/tools/document.test.ts`
  - Rename old `get_page_info` tests to `get_pages_info`.
  - Add tests validating that calling `get_pages_info` with no arguments returns the schema *without* `children` and `missingPageIds`.
  - Add tests validating that calling with `pageIds` returns `children` and correctly populated `missingPageIds`.
  - **Ordering & dedupe tests** (cover the Q3 invariants):
    - Input `[a, b, c]`, all resolvable → `pages` is `[a, b, c]`.
    - Input `[c, a, b]`, all resolvable → `pages` is `[c, a, b]` (input order, not Figma's traversal order).
    - Input `[a, X, b]` where `X` is unresolvable → `pages` is `[a, b]`, `missingPageIds` is `[X]`.
    - Input `[a, a, b]` (duplicate) → `pages` is `[a, b]` (single entry for `a`), `missingPageIds` is `[]`.
    - Input `[X, X, Y]` (duplicate unresolvable) → `pages` is `[]`, `missingPageIds` is `[X, Y]` (deduped, first-occurrence order).
  - **Soft-limit non-enforcement test** (covers the Q5 invariant):
    - Input array of length 100 (all resolvable) → handler processes all 100 without truncation, warning, or error. `pages.length === 100`. No `console.warn` / `logger.warn` calls observed. (Asserts the description-only contract — a future PR adding a cap or warning will fail this test.)
  - **Strict page-validity tests** (cover the Q4 invariants):
    - Input is a valid `PAGE` id whose `parent === figma.root` → resolves into `pages`.
    - Input is a `SECTION` id → goes to `missingPageIds` (not treated as a page even though it can contain top-level frames).
    - Input is a `FRAME` / `COMPONENT` / `GROUP` id → goes to `missingPageIds`.
    - Input is a node id from a different document (mock `figma.getNodeByIdAsync` returns a `PAGE` whose `parent !== figma.root`) → goes to `missingPageIds`.
    - Input is a non-existent id (mock returns `null`) → goes to `missingPageIds`.
  - Verify `get_document_info` is completely rejected by the tool router.

### [x] 2. Progress Event Streaming Tests
- **File**: Unit tests for `nodeReaders.ts`
  - Mock `figma.ui.postMessage`.
  - Call `getPagesInfo` with multiple mocked IDs.
  - Assert that `postMessage` is called for `started`, interleaved `in_progress`, and `completed`.
  - **Concrete yield-between-chunks assertion**: spy on `setTimeout` (or use `jest.useFakeTimers()` + a microtask checkpoint). Run `getPagesInfo` with 3 mocked IDs. Assert that between consecutive `figma.ui.postMessage` calls, a `setTimeout(fn, 0)` was scheduled and resolved before the next `postMessage` runs. Equivalent assertion: capture the order of side effects and verify `[postMessage#1, setTimeout#1 resolves, postMessage#2, setTimeout#2 resolves, postMessage#3]`. A test that only checks "`postMessage` was called N times" passes even when the yield is missing — this assertion is what catches a future regression that drops the `await new Promise(r => setTimeout(r, 0))`.

### [x] 2a. `sendProgressUpdate` Caller Regression Tests
- **Action**: After making `sendProgressUpdate` async (Phase 1 step 1) and updating all callers (Phase 1 step 1a), confirm the callers still produce correctly-ordered progress streams.
- **Files** (add or extend tests for the handlers updated in Phase 1 step 1a):
  - `src/mcp_server/tests/unit/figma_plugin/annotationHandlers.test.ts` (or equivalent)
  - tests covering `connectorHandlers`, `nodeModifiers`, `componentHandlers` — wherever progress emission already has coverage; otherwise add a thin smoke test per handler.
- **Per-handler assertion**: invoke a code path that emits at least 2 progress events; spy on `figma.ui.postMessage` and `setTimeout`; assert events fire in order *and* a `setTimeout(fn, 0)` resolves between them. This catches the failure mode where a caller forgot the `await` and the post-message flush is bypassed.

### [x] 2b. `getPagesInfo` Does Not Call `figma.loadAllPagesAsync()`
- **File**: Unit tests for `nodeReaders.ts`
- **Action**: Spy on a mocked `figma.loadAllPagesAsync` and assert it is **never** invoked across the full `getPagesInfo` test suite — no-args path, single-id path, multi-id path, missing-ids path, length-100 path. This is the regression canary for "Loading & performance" Rule 1.
- **Why separate from connect-flow tests**: connect-flow tests in step 3 already check this for the connect path. This step locks down the handler in isolation so a future refactor that introduces a "convenience" `loadAllPagesAsync` call doesn't slip through under the assumption that "the connect tests will catch it."

### [x] 3. Connect Flow Scope Tests
- **File**: E2E or Integration connection tests
  - Mock the Figma plugin state into `readonly`, `page`, and `node` scopes.
  - Assert the connection payload returned exactly matches the schema in Change 1.
  - Specifically check that `loadAllPagesAsync` is never called.
  - Test Error Scenarios: specifically mock a deleted node for `SCOPE_DELETED` to ensure the correct `errorCode` and `errorMessage` are produced.

### [x] 3a. Handler-Level `get_connect_payload` Tests
- **File**: New unit test file, `src/mcp_server/tests/unit/figma_plugin/connectHandlers.test.ts` (or co-located depending on repo conventions)
- **Action**: Test `getConnectPayload()` directly against a mocked Figma sandbox, independent of the `join_channel` tool layer. The integration tests in step 3 cover the end-to-end path; these isolate the handler's branching logic.
- **Cases**:
  - `state.readOnly === true` → returns `editableScopeType: "readonly"` payload; spy confirms no `loadAsync()` call.
  - `state.scopeRootId` resolves to a `PAGE` node with `parent === figma.root` → returns `editableScopeType: "page"` payload with that page's top-level children; spy confirms exactly one `targetPage.loadAsync()` call and no `loadAllPagesAsync`.
  - `state.scopeRootId` resolves to a `FRAME` (or `COMPONENT` / `GROUP` / `SECTION`) → returns `editableScopeType: "node"` payload with `containingPageId` derived by walking `node.parent`; spy confirms no extra `loadAsync` beyond what `getNodeByIdAsync` does internally.
  - `state.scopeRootId` resolves to `null` (deleted) → returns `{ errorCode: "SCOPE_DELETED", errorMessage }` as a structured value, NOT a thrown string.
  - Resolved node has no `PAGE` ancestor (orphaned) → returns `{ errorCode: "SCOPE_INVALID", errorMessage }`.
  - `loadAsync()` rejects → returns `{ errorCode: "DOCUMENT_LOAD_FAILED", errorMessage }`.
  - Catch-all path (any other unexpected throw) → returns `{ errorCode: "UNKNOWN_ERROR", errorMessage }` with the underlying message appended.

### [x] 3b. Snapshot Tests for the Three Connect-Payload Shapes
- **File**: `src/mcp_server/tests/unit/figma_plugin/connectHandlers.test.ts`
- **Action**: For each `editableScopeType`, snapshot the full handler return value to lock the schema. Snapshot tests catch silent shape drift (a renamed field, an accidentally-added property, a swapped order) that schema-shape unit tests can miss.
- **Cases** (one snapshot per scope):
  - **Readonly snapshot**: deterministic mock document with 3 pages, no scope. Assert snapshot matches `{ editableScopeType: "readonly", documentId, documentName, pageCount: 3, pages: [...3 entries with pageId+pageName only...] }` exactly.
  - **Page-scope snapshot**: deterministic mock with `state.scopeRootId` pointing at the second page; that page has 2 mock children. Assert snapshot matches `{ editableScopeType: "page", documentId, documentName, pageCount: 3, pages: [{ pageId, pageName, children: [...2 entries...] }] }` — exactly one entry in `pages`, children present.
  - **Node-scope snapshot**: deterministic mock with `state.scopeRootId` pointing at a `FRAME` two levels under page 2. Assert snapshot matches `{ editableScopeType: "node", documentId, documentName, node: { nodeId, nodeName, type: "FRAME", parentNodeId, parentNodeName, parentNodeType, containingPageId, containingPageName, children: [...] } }` — no top-level `pages` array, all node fields populated.
- **Maintenance**: snapshot updates require explicit reviewer sign-off. A PR that "fixes" a snapshot without a corresponding spec change should be questioned.
  - **Fail-closed tests** (cover the Q6 invariants — leg 2 failure must not leave `currentChannel` set and must not return a partial-success envelope):
    - Leg 1 succeeds, leg 2 plugin returns `{ errorCode: "SCOPE_DELETED", errorMessage }` → tool response is `{ status: "error", channel, errorCode: "SCOPE_DELETED", errorMessage }`. After the call, `currentChannel` is `null`. A subsequent `join_channel` call re-runs `joinChannel(...)` (verified by spy on the underlying socket send).
    - Leg 1 succeeds, leg 2 plugin returns `{ errorCode: "DOCUMENT_LOAD_FAILED" }` → envelope has `errorCode: "DOCUMENT_LOAD_FAILED"`; `currentChannel` cleared.
    - Leg 1 succeeds, leg 2 promise rejects with a WebSocket-close error → envelope has `errorCode: "PLUGIN_DISCONNECTED"`; `currentChannel` cleared.
    - Leg 1 succeeds, leg 2 promise rejects with a timeout → envelope has `errorCode: "UNKNOWN_ERROR"` with the underlying timeout message appended; `currentChannel` cleared.
    - **No partial success**: assert the tool response never contains both `status: "success"` and a missing/error scope payload, in any leg-2 failure case.
    - **Recovery**: after any leg-2 failure, calling `join_channel` again with a now-valid plugin scope returns `{ status: "success", ...complete payload }` — confirms the reset path actually works.

### [x] 4. `get_nodes_info` Regression Tests (Q7 — shape unchanged)
- **File**: `src/mcp_server/tests/unit/tools/document.test.ts`
- **Action**: Add tests that lock in today's `get_nodes_info` shape so the v1.3.0 work doesn't accidentally drift it. These also serve as the canary that the deferred shape-alignment hasn't snuck in.
- **Cases**:
  - `get_nodes_info({ nodeIds: [<id>] })` returns `[{ nodeId, parentId, document }]` — no `nodeName`, no `containingPageId`, no Change 1 Node-scope `node` block.
  - `get_nodes_info()` (empty args) — when the plugin reports a `scopeRootId`, the tool resolves to the editable scope node and returns the same `{ nodeId, parentId, document }[]` shape (single-element array).
  - `get_nodes_info()` (empty args) — when the plugin is in `readonly` scope (no `scopeRootId`), behavior is whatever it is today; document the current behavior in the test rather than redefining it.
