# Plan Review: v1.3.0 Read Tools Update

Review of [read_tools_update_plan.md](read_tools_update_plan.md) against [read_tools_update.md](read_tools_update.md), [read_tools_update_recommendation.md](read_tools_update_recommendation.md), and the current implementation in [src/mcp_server/tools/document.ts](../../src/mcp_server/tools/document.ts), [src/figma_plugin/handlers/nodeReaders.ts](../../src/figma_plugin/handlers/nodeReaders.ts), [src/figma_plugin/src/main.ts](../../src/figma_plugin/src/main.ts), [src/mcp_server/figma-client.ts](../../src/mcp_server/figma-client.ts), and [src/socket.ts](../../src/socket.ts).

## Missing tasks

### Phase 1 — Prerequisite plumbing

1. **Update every existing caller of `sendProgressUpdate` to `await` it.**
   Once the function becomes `async`, sync callers in `annotationHandlers.ts`, `connectorHandlers.ts`, `nodeModifiers.ts`, `componentHandlers.ts`, etc. must be updated. Otherwise the trailing `setTimeout(0)` flush is lost — call sites move on without yielding. The plan only changes the function itself.

2. **Specify the `state.activeRequestId` task concretely.**
   "Audit and implement" is too thin. Pin down:
   - Which incoming WebSocket message types carry the request id.
   - Where in [src/figma_plugin/ui.html](../../src/figma_plugin/ui.html) it gets stored on `state`.
   - How the existing `command_progress` → `progress_update` forwarder ([ui.html:779-799](../../src/figma_plugin/ui.html#L779)) reads it.

   Without this the task is unactionable.

### Phase 2 — `get_pages_info`

3. **Define what counts as a "valid page" id.**
   Spec says ids "not found / not a page / different document" go to `missingPageIds`. The handler needs a concrete check — e.g. `node && node.type === "PAGE" && node.parent === figma.root`. Plan should call it out so reviewers don't re-derive it.

4. **Decide ordering of the returned `pages` array** when `pageIds` resolve out of order or with duplicates. Neither spec nor plan says. Recommendation: preserve input order, dedupe, and put surviving missing ids in input order in `missingPageIds`.

5. **Search-and-replace pass for the removed field names.**
   Grep for `childCount`, `currentPageId`, `currentPageName`, `isCurrent`, and `type: "DOCUMENT"` across `src/`, `CLAUDE.md`, README, and any prompt/description strings in tool registrations. Plan only lists the `getDocumentInfo` callsite.

6. **Verify `get_nodes_info()` empty-args path still resolves to the editable scope node.**
   Spec relies on it for node-scope refresh ([main.ts:481-482](../../src/figma_plugin/src/main.ts#L481)). Add a regression test so the rename work doesn't break it.

7. **Bump version (`package.json` → 1.3.0) and update CHANGELOG / release notes.**
   Mentioned in spec ("Document under Breaking changes") but not as a discrete task in the plan.

### Phase 3 — Connect flow (biggest gap)

8. **Design the plugin → server scope-payload command.**
   The MCP server can't construct the Change 1 payload by itself; the editable scope (`state.scopeRootId`, `state.readOnly`) lives in the plugin. The plan says "Connection handler in server and plugin" without specifying:
   - Name of the new plugin command (e.g. `get_connect_payload`).
   - Its addition to the `FigmaCommand` union in [figma-client.ts](../../src/mcp_server/figma-client.ts) and its switch case in [main.ts](../../src/figma_plugin/src/main.ts).
   - The handler module/file (new file in `handlers/`?).
   - How `join_channel` in [tools/document.ts:202-267](../../src/mcp_server/tools/document.ts#L202) orchestrates: `joinChannel(...)` → call new command → return JSON content (replacing the current prose template at lines 233–244).

9. **Replace the prose response in `join_channel`.**
   The plan never says "delete the current prose-formatted success message and the hacky `get_nodes_info` scope probe." Today's handler returns a multi-line string; the new contract is structured JSON. This is a concrete deletion task.

10. **Define how each `errorCode` is detected and surfaced.**
    Spec lists 7 codes; plan just lists the names again. The hard part is detection wiring:
    - `CHANNEL_NOT_FOUND` vs `CHANNEL_JOIN_FAILED` — currently [socket.ts:67](../../src/socket.ts#L67) accepts any join blindly. Need either a server-side check (does the channel have a plugin attached?) or a timeout heuristic.
    - `SCOPE_DELETED` — currently thrown as a string error at [main.ts:85](../../src/figma_plugin/src/main.ts#L85); needs to be surfaced as a structured `errorCode`, not free-text.
    - `PLUGIN_DISCONNECTED` — needs a path that distinguishes mid-handshake disconnect from a steady-state one.
    - `UNKNOWN_ERROR` — what error is appended? Plan should pick a format.

11. **Decide how Node-scope walks to the containing page.**
    Plan says "walk `node.parent` until a page is reached" but doesn't say what to do if no page ancestor exists (e.g. node orphaned mid-flight). That edge case should fall under `SCOPE_DELETED` or a new code — pick one.

### Phase 4 — Testing

12. **Test that all existing `sendProgressUpdate` callers still work after the async change** (pairs with #1).

13. **Test that `getPagesInfo` does not call `figma.loadAllPagesAsync()`.**
    Plan only asserts this for the connect flow.

14. **Test ordering and dedupe behavior** of `pages` / `missingPageIds` (pairs with #4).

15. **Test the actual yield between chunks.**
    Plan says "assert the presence of the asynchronous yield" — needs a concrete approach: spy on `setTimeout` or use a microtask checkpoint between two `postMessage` calls. Without a concrete approach this test won't get written.

16. **Test the new connect-payload plugin command directly** (handler-level), not only end-to-end through `join_channel`.

17. **Snapshot tests for the three connect-payload shapes** to lock the schema (readonly / page / node).

## Open questions to resolve before implementation

- **Q1 (blocks Phase 3):** What is the name and shape of the new plugin command that returns the editable-scope payload? Without this answer, Phase 3 cannot be sequenced.
  - **Recommendation:** Add a single plugin command `get_connect_payload` (no params). Its return type is a discriminated union keyed on `editableScopeType` matching the three success shapes in Change 1 (minus the envelope fields `status` / `channel`, which the MCP server adds when forwarding to the client). Errors that originate inside the plugin (e.g. `SCOPE_DELETED`, `SCOPE_INVALID`, `DOCUMENT_LOAD_FAILED`) surface as a structured `{ errorCode, errorMessage }` return — *not* a thrown string — so the MCP server can map them straight into the Change 1 error envelope without parsing prose. Lives in a new `handlers/connectHandlers.ts` (keeps it out of `nodeReaders.ts`, which is being trimmed). Adding the command to the `FigmaCommand` union, the switch in [main.ts](../../src/figma_plugin/src/main.ts), and the handler export in [handlers/index.ts](../../src/figma_plugin/handlers/index.ts) becomes a concrete checklist instead of a TBD.
  - **Resolution:** Accepted (Option C — separate plugin command, two-leg connect). Alternatives considered: Option A (socket server caches plugin scope) and Option B (socket server defers join ack until plugin replies). Both rejected because they push domain knowledge into [src/socket.ts](../../src/socket.ts), which is currently a dumb relay; conflate transport-layer and plugin-layer error vocabularies in a single ack; and require socket + plugin to upgrade in lockstep. Option C keeps the layers separate, lets the Change 1 error codes split cleanly along the two legs, and produces a reusable command that can be re-invoked for future refresh paths. Spec updated under "Connect-flow mechanics" in [read_tools_update.md](read_tools_update.md); plan steps for the new command, the rewritten `join_channel` tool, the socket-side `CHANNEL_NOT_FOUND` detection, and the structured `SCOPE_DELETED` mapping are added to Phase 3 of [read_tools_update_plan.md](read_tools_update_plan.md).

- **Q2 (blocks Phase 3):** Is `CHANNEL_NOT_FOUND` going to be detected server-side in [socket.ts](../../src/socket.ts) (requires changing the socket protocol) or via a join-ack timeout heuristic in [figma-client.ts](../../src/mcp_server/figma-client.ts)? Different effort, different risk.
  - **Recommendation:** Detect server-side in [socket.ts](../../src/socket.ts). The socket server already tracks which clients are in which channel; extend the `join` handler at [socket.ts:67](../../src/socket.ts#L67) so that when a non-plugin client (the MCP server) joins a channel with no plugin attached, it replies with `{ type: "join_error", code: "CHANNEL_NOT_FOUND" }`. Use the existing 5s join timeout for `CHANNEL_JOIN_FAILED` (no plugin response). This is deterministic and doesn't conflate "plugin slow" with "channel doesn't exist." The socket protocol change is small (one new ack message type) and fully backward-compatible with older plugins because they never see this message — only the MCP server does.
  - **Resolution:** Accepted (server-side detection in [socket.ts](../../src/socket.ts), with `clientType: "mcp"` tagging the MCP join request). Mechanism: MCP server tags its join with `clientType: "mcp"`; socket server checks channel membership before registering an `mcp` joiner — if the channel has no existing members, it replies with `{ type: "join_error", code: "CHANNEL_NOT_FOUND", id }` and does not auto-create the channel. Plugin joins omit `clientType` and retain today's auto-create-and-register behavior, so older plugin builds work unchanged. Join-ack timeout maps to `CHANNEL_JOIN_FAILED`; a connection drop on a pending join maps to `PLUGIN_DISCONNECTED`. Spec updated under "Connect-flow mechanics" in [read_tools_update.md](read_tools_update.md); Phase 3 step 3 in [read_tools_update_plan.md](read_tools_update_plan.md) now spells out the `clientType` tagging, the lone-MCP detection logic, the pending-request matching by `id`, and the timeout/drop mapping. Trade-off recorded: this design requires the plugin to join first (matches current UX); a "MCP-first, plugin-later" flow would need a hold-open queue and is out of scope for v1.3.0.

- **Q3:** Should `get_pages_info` preserve `pageIds` order and dedupe, or return whatever order pages resolve in?
  - **Recommendation:** Preserve input order and dedupe. Concretely: `const seen = new Set(); const orderedIds = pageIds.filter(id => !seen.has(id) && seen.add(id))`, then iterate `orderedIds` and append to `pages` / `missingPageIds` in that order. Predictable output makes test assertions stable and lets the LLM reason positionally about the response. The streaming progress events should also fire in this order so running totals match the final array.
  - **Resolution:** Accepted (preserve input order, dedupe with first-occurrence semantics). Duplicates are dropped silently — they appear in neither `pages` nor `missingPageIds`. Progress events fire in the deduped iteration order so `processedItems` running totals are consistent with the final array. Spec updated in [read_tools_update.md](read_tools_update.md) (Change 2 note on the `pageIds` response). Plan in [read_tools_update_plan.md](read_tools_update_plan.md) now contains the explicit dedupe step, ordering invariants, and a Phase 4 test matrix covering normal order, reordered input, interleaved missing ids, duplicates, and duplicate-of-missing.

- **Q4:** Does "not a page" include Figma's `SECTION` nodes that look page-like, or strictly `node.type === "PAGE" && node.parent === figma.root`?
  - **Recommendation:** Strict check: `node.type === "PAGE" && node.parent === figma.root`. Sections are container nodes that live *inside* a page, not pages themselves — accepting them would force `loadAsync` semantics that don't apply and confuse downstream `pages[].children` consumers. A `SECTION` id passed in goes to `missingPageIds` like any other invalid id.
  - **Resolution:** Accepted (strict `node.type === "PAGE" && node.parent === figma.root`). `SECTION`, `FRAME`, `COMPONENT`, `GROUP`, cross-document `PAGE` (parent !== figma.root), and missing ids all route to `missingPageIds`. Spec note added in [read_tools_update.md](read_tools_update.md) directing callers to `get_nodes_info` for `SECTION` inspection. Plan in [read_tools_update_plan.md](read_tools_update_plan.md) now spells out the strict check inline in the iteration loop and adds 5 page-validity test cases (`PAGE`, `SECTION`, `FRAME`/`COMPONENT`/`GROUP`, cross-document `PAGE`, missing id) to Phase 4.

- **Q5:** When the model's `pageIds` array exceeds 25, the spec says it's a soft limit surfaced via tool description. Confirm: no runtime warning, no truncation, no telemetry — just description text? Plan should record the answer so a future contributor doesn't re-litigate it.
  - **Recommendation:** Description-only. No runtime warning, no truncation, no telemetry. The whole point of "soft" guidance is that the LLM internalizes the chunking heuristic from the tool description; adding runtime enforcement turns a chunking nudge into a hard contract that clients have to defensively work around. Record this explicitly in the plan ("soft limit is description-only — implementation MUST NOT cap, warn, or truncate") so a future "let's just add a warning" PR has something to point at.
  - **Resolution:** Accepted (description-only; no runtime cap, truncation, warning, log, or telemetry). Spec updated under Rule 4 of "Loading & performance" in [read_tools_update.md](read_tools_update.md) with an explicit MUST-NOT clause and the rationale (avoids forcing clients to re-implement chunking around silent server behavior). Plan in [read_tools_update_plan.md](read_tools_update_plan.md) records the same constraint at the tool registration step and adds a Phase 4 non-enforcement test (input length 100 must process all entries with no `console.warn`/`logger.warn` calls), so a future PR proposing a cap or warning fails the test rather than the design review.

- **Q6:** If `join_channel` succeeds but the new scope-payload command fails, should we still report `joined` and degrade to an error envelope, or treat the whole connect as failed? Spec's error envelope implies the latter; confirm.
  - **Recommendation:** Treat the whole connect as failed and return the Change 1 error envelope. Reporting "joined" without scope info gives the client a half-state it can't act on — it can't tell if it's read-only or scoped. Map the underlying failure to `DOCUMENT_LOAD_FAILED` if it came from a `loadAsync` rejection, `SCOPE_DELETED` / `SCOPE_INVALID` if the plugin reported a structured scope error, otherwise `UNKNOWN_ERROR` with the underlying message appended. The MCP server should *not* leave the channel joined after a failed connect; have `join_channel` call a `leaveChannel(...)` (or just clear `currentChannel`) on the error path so a retry starts clean.
  - **Resolution:** Accepted (fail closed; return the Change 1 error envelope; clear `currentChannel` on every leg-2 failure). Concrete error mapping pinned down: structured plugin errors (`SCOPE_DELETED` / `SCOPE_INVALID` / `DOCUMENT_LOAD_FAILED` / `UNKNOWN_ERROR`) pass through; WebSocket close → `PLUGIN_DISCONNECTED`; timeout / unclassified rejection → `UNKNOWN_ERROR` with underlying message appended. Leg 1 failures don't need cleanup because the join was never registered. Spec updated under "Connect-flow mechanics" in [read_tools_update.md](read_tools_update.md) with the per-failure-mode mapping table. Plan in [read_tools_update_plan.md](read_tools_update_plan.md): Phase 3 step 2 carries an explicit "Fail-closed contract" block plus per-leg implementation steps, and Phase 4 step 3 adds 6 fail-closed test cases (each plugin error code, transport rejection, no-partial-success assertion, recovery via subsequent `join_channel`). A `resetChannel()` helper is called out as the cleanup primitive in [figma-client.ts](../../src/mcp_server/figma-client.ts).

- **Q7:** The spec notes `get_nodes_info`'s shape will be re-aligned "in a future release" but Change 1's node-scope refresh path depends on it *now*. Is there any interim adapter expected in v1.3.0, or do clients live with the current shape until then? The plan should explicitly say "no change to `get_nodes_info` in v1.3.0" if that's the answer.
  - **Recommendation:** No change to `get_nodes_info` in v1.3.0. Add an explicit "Out of scope" line in both the spec and plan stating: `get_nodes_info()` empty-args continues to return its existing shape; alignment with the Change 1 Node-scope `node` block is deferred to a follow-up release. Clients calling the documented refresh path get today's shape and should not assume the Change 1 shape from `get_nodes_info` until the follow-up ships. Bundling the rewrite with v1.3.0 expands the breaking-change surface for marginal benefit and risks delaying the connect-flow work that's actually load-bearing.
  - **Resolution:** Accepted (no `get_nodes_info` shape changes in v1.3.0; alignment deferred). Spec updates: the "Out of scope (follow-up)" section in [read_tools_update.md](read_tools_update.md) carries an explicit `get_nodes_info`-stays-unchanged paragraph, and the two earlier forward-references (Change 1 Node-scope note and the "Refreshing the editable scope" bullet) now say "unchanged in v1.3.0" with a back-link to the out-of-scope section. Plan updates: a new top-level "Out of scope for v1.3.0" section in [read_tools_update_plan.md](read_tools_update_plan.md) lists `get_nodes_info`, `getComponents`, write-side `figma.currentPage`, and MCP-first connect support as deferred work. Phase 4 step 4 adds regression tests that lock in today's `{ nodeId, parentId, document }[]` shape so a future PR can't accidentally drift it. Trade-off recorded: clients using `get_nodes_info()` as the Node-scope refresh path must adapt to today's shape, not the Change 1 `node` block, until the follow-up ships.
