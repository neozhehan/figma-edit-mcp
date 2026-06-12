# Error response playbook

Every structured error you may receive, what it means, and the correct recovery.

**General principle:** structured error codes are deterministic — the plugin made a decision based on a hard rule. Retrying without changing inputs produces the same result. Either change inputs (refresh names/IDs) or stop and inform the user.

## Scope errors

| Code / Message | Meaning | Recovery |
|---|---|---|
| `READ_ONLY_MODE` | The session lacks node-editing permissions — the user connected without a Page/Layer link. | Inform the user. Only read tools work. To enable node mutations, the user must reconnect with a link to the Page or Layer they want edited. |
| `VARIABLE_EDITS_DISABLED` | The session lacks Local Variable edit permissions. | Inform the user. Ask them to reconnect with variable editing enabled. |
| `STYLE_EDITS_DISABLED` | The session lacks Local Style edit permissions. | Inform the user. Ask them to reconnect with style editing enabled. |
| `OUTSIDE_SCOPE` | The target `nodeId` exists but is outside the locked node scope. | Do not retry with the same ID. Pick a node inside the scope, or ask the user to reconnect with a broader scope. |
| `PARENT_OUTSIDE_SCOPE` | The `parentId` for a creation tool is outside the editable scope. | Pick a parent inside the scope, or ask the user to reconnect more broadly. |
| `CLONING_SOURCE_NODE_OUTSIDE_SCOPE` | `node_clone`'s source is outside the editable scope. | Clone creates inside the scope, but the source must be reachable. Pick a source inside the scope, or reconnect more broadly. |
| `Operation Denied: This node is the current Editable Scope root…` | You attempted to delete, flatten, ungroup, or convert-to-component the root node of the editable scope (which would invalidate the session). | Target children inside the scope instead. Reparenting the scope root is allowed — its id is unchanged. |
| `SCOPE_DELETED` | The locked scope node was deleted from the file after connecting. | The session is unrecoverable. Ask the user to reconnect. |
| `SCOPE_INVALID` | The connect-time scope payload was malformed. | Ask the user to reconnect with a fresh link. |

## Name verification errors

| Code / Message | Meaning | Recovery |
|---|---|---|
| `NAME_MISMATCH` | `nodeName` does not match the actual name of `nodeId`. | Your context is stale or the ID is wrong. Call `node_info({ nodeIds: [<id>] })` to refresh, then retry with the actual name. |
| `PARENT_NAME_MISMATCH` | `parentNodeName` does not match the actual name of `parentId`. | Refresh via `node_info` and retry. |

## Remote (library) asset errors

| Message | Meaning | Recovery |
|---|---|---|
| `'<name>' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.` | You tried to edit or delete a style, variable, or main component that is **subscribed from a library** (not local to this file). Plugins cannot modify remote assets. | Don't retry — edit it in its source library file, or create a local copy for file-specific changes. An *instance* of a remote component is still editable via overrides; only the remote *definition* is blocked. |

> **Finding remote-asset IDs.** `variable_list` and `style_list` return **local** assets only — remote/library assets never appear there. Discover them through a **consuming node**: `node_info({ nodeIds, properties: ["boundVariables", "fillStyleId", "strokeStyleId", "effectStyleId", "textStyleId"] })` resolves each to `{ id, name }`. Recognizable IDs: remote **variables** look like `VariableID:<key>/<subid>`; remote **styles** end with `,<num>:<num>` (e.g. `S:abc…,18499:124`) whereas local styles end with a bare trailing comma (`S:abc…,`).

## Instance interior errors

| Code / Message | Meaning | Recovery |
|---|---|---|
| `Operation Denied: Node '…' is inside a component instance ('…') and cannot be <deleted/grouped/…> directly.` | You tried to make a **structural** edit (delete, reparent, group/ungroup, add children) to a node inside a component instance. | Structural edits inside instances are forbidden. Use `instance_set_property` / `instance_set_overrides`, or set fills/text/visibility on overridable descendants — those property/override writes are allowed. |

## Type & Structure validation errors (Figma Plugin Pre-Validation)

| Message | Meaning | Recovery |
|---|---|---|
| `Node <ID> not found` | The target node ID was not found in the current Figma document. | The ID is wrong or stale. Refresh context via `page_info` or `node_info` and choose a valid ID. |
| `Parent node not found` | The parent ID provided for a creation tool does not resolve to a node in the document. | The parent ID is wrong or stale. Refresh context and provide a valid parent. |
| `Operation Denied: Node '…' (or one of its ancestors, '…') is locked.` | You attempted to modify a locked node, or a node with a locked ancestor. | Find an unlocked node or ask the user to unlock it in Figma. |
| `Node is not a text node: <ID> (type: <TYPE>)` | The target node ID for `text_set_content` does not have type `TEXT`. | Ensure the ID you pass corresponds to a text node. Run `node_info` to verify. |
| `Node type <TYPE> does not support annotations` | The target node for `annotation_set` does not support adding/updating annotations. | Do not set annotations on this node. Review which nodes support annotations. |
| `Source node is not an instance: <ID> (type: <TYPE>)` | The `sourceInstanceId` provided to `instance_set_overrides` is not an `INSTANCE` node. | Provide the ID of a valid instance node. |
| `Target is not an instance node: <ID> (type: <TYPE>)` | A target node provided in `targetNodes` for `instance_set_overrides` is not an `INSTANCE` node. | Ensure all targets are instance nodes. |
| `Invalid Grouping: All nodes must share the same parent...` | The nodes passed to `node_group` do not belong to the same parent. | Call `node_insert_child` to reparent them first before grouping. |

> **Advisory on `INSTANCE_SWAP` properties:** The `instance_set_property` tool validates that a provided swap value is a plausible component reference (an ID or key). However, Figma enforces deeper type constraints at execution time (e.g. variant bounds). A syntactically valid component swap may still be rejected by the Figma API if it violates the component definition.

## Page / target scoping errors (list & discovery tools)

| Message | Meaning | Recovery |
|---|---|---|
| `pageId is required when scope is 'page'` | `component_list` (`scope: 'page'`) or `variable_list` (`includeConsumers: 'page'`) was called without a `pageId`. | Supply a `pageId` from `page_info`, or use the `'document'` scope/value instead. |
| `pageId with ID <id> not found` | The supplied `pageId` does not resolve to any node. | Refresh page IDs via `page_info` and pass a valid one. |
| `pageId does not resolve to a PAGE` | The supplied `pageId` resolves to a node that is not a `PAGE`. | Pass the ID of an actual page (from `page_info`), not a frame/layer. |
| `Exactly one of pageId or nodeId is required` | `annotation_list` was called with neither or both of `pageId` / `nodeId`. | Pass exactly one — a `pageId` to scan a whole page, or a `nodeId` to scan a node and its subtree. |

## Connection errors

| Code | Meaning | Recovery |
|---|---|---|
| `CHANNEL_NOT_FOUND` | The channel the user provided does not exist. | Inform the user; the plugin in Figma may have disconnected or restarted. |
| `CHANNEL_JOIN_FAILED` | The plugin rejected the channel join. | Inform the user and ask them to re-open the plugin in Figma. |
| `PLUGIN_DISCONNECTED` | The plugin disconnected mid-session. | Inform the user; the plugin tab may have closed. They must reopen it before you can continue. |
| `DOCUMENT_LOAD_FAILED` | The Figma document could not be loaded by the plugin. | Inform the user. Often a Figma client-side issue. |
| `UNKNOWN_ERROR` | An unstructured failure inside the plugin. | Report the message to the user; do not silently retry. |
