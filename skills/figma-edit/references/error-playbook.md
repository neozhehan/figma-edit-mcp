# Error response playbook

Every structured error you may receive, what it means, and the correct recovery.

**General principle:** structured error codes are deterministic — the plugin made a decision based on a hard rule. Retrying without changing inputs produces the same result. Either change inputs (refresh names/IDs) or stop and inform the user.

## Scope errors

| Code | Meaning | Recovery |
|---|---|---|
| `READ_ONLY_MODE` | The session is read-only — the user connected without a Page/Layer link. | Inform the user. Only read tools (`page_info`, `node_info`, `style_list`, `component_list`, …) work. To enable writes, the user must reconnect with a link to the Page or Layer they want edited. |
| `OUTSIDE_SCOPE` | The target `nodeId` exists but is outside the locked editable scope. | Do not retry with the same ID. Pick a node inside the scope, or ask the user to reconnect with a broader scope. |
| `PARENT_OUTSIDE_SCOPE` | The `parentId` for a creation tool is outside the editable scope. | Pick a parent inside the scope, or ask the user to reconnect more broadly. |
| `CLONING_SOURCE_NODE_OUTSIDE_SCOPE` | `node_clone`'s source is outside the editable scope. | Clone creates inside the scope, but the source must be reachable. Pick a source inside the scope, or reconnect more broadly. |
| `SCOPE_DELETED` | The locked scope node was deleted from the file after connecting. | The session is unrecoverable. Ask the user to reconnect. |
| `SCOPE_INVALID` | The connect-time scope payload was malformed. | Ask the user to reconnect with a fresh link. |

## Name verification errors

| Code | Meaning | Recovery |
|---|---|---|
| `NAME_MISMATCH` | `nodeName` does not match the actual name of `nodeId`. | Your context is stale or the ID is wrong. Call `node_info({ nodeIds: [<id>] })` to refresh, then retry with the actual name. |
| `PARENT_NAME_MISMATCH` | `parentNodeName` does not match the actual name of `parentId`. | Refresh via `node_info` and retry. |

## Connection errors

| Code | Meaning | Recovery |
|---|---|---|
| `CHANNEL_NOT_FOUND` | The channel the user provided does not exist. | Inform the user; the plugin in Figma may have disconnected or restarted. |
| `CHANNEL_JOIN_FAILED` | The plugin rejected the channel join. | Inform the user and ask them to re-open the plugin in Figma. |
| `PLUGIN_DISCONNECTED` | The plugin disconnected mid-session. | Inform the user; the plugin tab may have closed. They must reopen it before you can continue. |
| `DOCUMENT_LOAD_FAILED` | The Figma document could not be loaded by the plugin. | Inform the user. Often a Figma client-side issue. |
| `UNKNOWN_ERROR` | An unstructured failure inside the plugin. | Report the message to the user; do not silently retry. |
