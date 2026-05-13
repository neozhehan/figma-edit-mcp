# AGENTS.md — Using figma-edit-mcp from an AI agent

> **Draft — pre-release content for the canonical `AGENTS.md`. Promote to the repo root as `AGENTS.md` in the v1.5.0 release PR. After promotion, rewrite all `../../` relative links to `./` per Q16 (link-checker-gated).**

This document is for **AI agents that have figma-edit-mcp installed and connected** to a Figma file. It tells you how to use the tools without breaking things — what the plugin will refuse to do, how to discover state, and how to recover from each structured error.

If you are a human looking to install or develop figma-edit-mcp, see [README.md](../../README.md) (install) and [CONTRIBUTING.md](../../CONTRIBUTING.md) (development) instead.

---

## The framing: who decides what

figma-edit-mcp is built on a tripartite separation of responsibility. Internalize this before you do anything else — it determines what you should and should not attempt.

- **The plugin enforces.** Hard constraints (scope locking, name verification, per-item batch validation) are checked inside the Figma plugin at execution time. You cannot bypass them. The plugin is the last line of defense against hallucinated edits.
- **The agent orchestrates.** You discover state, plan operations, sequence calls, and report results. Your job is correctness and clarity, not creative judgment.
- **The designer decides.** Anything that is a creative or product decision belongs to the human. Do not pick colors, names, layout, copy, or visual hierarchy without explicit instruction. When in doubt, ask.

Tools that look like they let you make creative choices (e.g., `set_fill_color`, `create_text`) are *execution* tools — you run them with the values the designer specified, not values you invented.

---

## Hard constraints (the plugin will refuse)

These rules are enforced by the plugin itself. Violating them does not cause a soft warning — the operation is denied and you receive a structured error code. There is no way around them. Plan your calls to comply with them up front rather than relying on retry.

### 1. Scope is locked at connection time

The user sets an editable scope when the Figma plugin connects. You cannot modify anything outside that scope, and you cannot change or extend it programmatically.

| Connection mode | What you can do |
|---|---|
| User connected **without** a link to a Page/Layer | Session is **read-only**. Every write tool will fail with `READ_ONLY_MODE`. |
| User connected **with** a link to a Page/Layer | Writes succeed only inside that node and its descendants. Reads are always allowed. |

If a write fails with a scope error, **do not retry with the same ID**. The scope is fixed for the session; the only resolutions are (a) target a node inside the locked scope, or (b) ask the user to reconnect with a broader scope.

### 2. Every write requires name verification

Every modification tool requires a `nodeName` parameter. Every creation tool requires a `parentNodeName`. Batch tools require a name on each item in the array. The plugin resolves the actual name by ID and rejects the operation if it does not match.

**The only correct way to obtain a name:** read it from `get_nodes_info` or `get_pages_info` and pass it back verbatim. Do not guess, abbreviate, normalize, translate, or "clean up" the name. Whitespace and casing must match exactly.

This catches the most common hallucination failure: confidently operating on a stale or fabricated node ID that no longer points to the intended target.

### 3. There is no implicit selection state

No tool reads or acts on "current selection" or "last-touched node." Every tool requires explicit IDs. Never assume you know which node the user is looking at — discover it via `get_pages_info` / `get_nodes_info` first.

### 4. Batch tools verify every item

`delete_multiple_nodes`, `set_multiple_text_contents`, `set_multiple_annotations`, `set_instance_overrides`, and the other batch tools run scope and name checks on each item independently. **One invalid item fails the entire operation.** Validate every item's ID and name before calling. If the batch fails on item 7, items 1–6 may have already been applied or the whole batch may have rolled back depending on the tool — re-read state before retrying.

### 5. Node IDs from Figma URLs work as-is

Figma URLs contain node IDs with dashes (`20485-41`); the plugin API expects colons (`20485:41`). The MCP server converts dash-format IDs to colon-format automatically before forwarding. Pass URL-format IDs through unchanged. Do not pre-convert them.

---

## Error response playbook

Every structured error you will see, what it means, and the correct recovery action.

### Scope errors

| Code | Meaning | Recovery |
|---|---|---|
| `READ_ONLY_MODE` | The session is read-only because the user connected without a Page/Layer link. | Inform the user. Only read tools (`get_pages_info`, `get_nodes_info`, `get_styles`, `get_components`, etc.) will work. To enable writes, the user must reconnect with a link to the Page or Layer they want you to edit. |
| `OUTSIDE_SCOPE` | The target `nodeId` exists but is outside the locked editable scope. | Do not retry with the same ID. The scope cannot be changed mid-session. Either pick a node inside the scope or ask the user to reconnect with a broader scope. |
| `PARENT_OUTSIDE_SCOPE` | The `parentId` you specified for a creation tool is outside the editable scope. | Same as above — the parent node is not in the editable tree. Pick a parent inside the scope. |
| `CLONING_SOURCE_NODE_OUTSIDE_SCOPE` | `clone_node`'s source is outside the editable scope. | Even though clone *creates* inside the scope, the source must be reachable. Pick a source inside the scope, or ask the user to reconnect more broadly. |
| `SCOPE_DELETED` | The locked scope node has been deleted from the file (e.g., the user deleted the frame after connecting). | The session is unrecoverable. Inform the user and ask them to reconnect. |
| `SCOPE_INVALID` | The connect-time scope payload was malformed. | Inform the user; ask them to reconnect with a fresh link. |

### Name verification errors

| Code | Meaning | Recovery |
|---|---|---|
| `NAME_MISMATCH` | `nodeName` does not match the actual name of `nodeId`. | Your context is stale or the ID is wrong. Call `get_nodes_info({ nodeIds: [<id>] })` to refresh, then retry with the actual name. |
| `PARENT_NAME_MISMATCH` | `parentNodeName` does not match the actual name of `parentId`. | Same — refresh via `get_nodes_info` and retry. |

### Connection errors

| Code | Meaning | Recovery |
|---|---|---|
| `CHANNEL_NOT_FOUND` | The channel the user provided does not exist. | Inform the user; the plugin in Figma may have disconnected or restarted. |
| `CHANNEL_JOIN_FAILED` | The plugin rejected the channel join. | Inform the user and ask them to re-open the plugin in Figma. |
| `PLUGIN_DISCONNECTED` | The plugin disconnected mid-session. | Inform the user; the plugin tab may have closed. They need to reopen it before you can continue. |
| `DOCUMENT_LOAD_FAILED` | The Figma document could not be loaded by the plugin. | Inform the user. Often a Figma client-side issue. |
| `UNKNOWN_ERROR` | An unstructured failure inside the plugin. | Report the message to the user; do not silently retry. |

**General principle:** structured error codes are deterministic — the plugin made a decision based on a hard rule. Retrying without changing inputs will produce the same result. Either change inputs (refresh names/IDs) or stop and inform the user.

---

## The discover-before-acting pattern

Every workflow that touches a node should start with a read. There is no exception worth memorizing.

1. **Discover pages** with `get_pages_info` to learn the page structure.
2. **Discover nodes** with `get_nodes_info({ nodeIds, filter, fields, maxDepth })` to get IDs, names, types, and any properties you need.
3. **Plan** the operation using the IDs and names from the read response — verbatim, no transformation.
4. **Act** with the appropriate write tool.
5. **Verify** with another `get_nodes_info` call if the result matters (e.g., the user asked for a confirmation, or a downstream operation depends on the new state).

**Anti-patterns to avoid:**

- Writing to an ID the user mentioned without first reading it. The user's ID may be stale; the user's name for it may be wrong.
- Reusing IDs across sessions. Node IDs are stable within a file but the *scope* and *connection* are session-bound; re-verify on each new session.
- Skipping the read because "I just read it." The Figma file is a shared editable document — the designer may have moved or renamed nodes between your read and your write. If a write fails on `NAME_MISMATCH`, the document changed; re-read.
- Building a multi-step plan without reading state between steps when later steps depend on earlier ones. Read what you need, when you need it.

---

## Tool selection guidance

Many tools have overlapping use cases. These are the heuristics for picking the right one.

### `get_nodes_info` — the workhorse read tool

`get_nodes_info` replaces what used to be three tools (`get_node_info`, `scan_nodes_by_types`, `scan_text_nodes`). Use its parameters to scope the read tightly:

- **`nodeIds: string[]`** — the roots of the traversal. Always required.
- **`fields: string[]`** — only return these properties. Omitted properties are absent from the response (not `null`). Use this aggressively to keep responses small. Common fields: `name`, `type`, `characters`, `fills`, `width`, `height`.
- **`filter: { type: string | string[], ... }`** — prune the traversal tree. Only matching nodes (and their ancestors back to the root) are retained. Use this when you need *all* text nodes or *all* components in a subtree.
- **`maxDepth: number`** — cap recursion. Use `maxDepth: 1` for "just the immediate children." Use `maxDepth: 0` for "just the root nodes themselves."

| Goal | Call |
|---|---|
| Find all text in a frame | `get_nodes_info({ nodeIds: [frameId], filter: { type: "TEXT" }, fields: ["characters", "name"] })` |
| List immediate children of a node | `get_nodes_info({ nodeIds: [id], maxDepth: 1, fields: ["name", "type"] })` |
| Find all components in a page | `get_nodes_info({ nodeIds: [pageId], filter: { type: ["COMPONENT", "COMPONENT_SET"] }, fields: ["name"] })` |
| Get full info on a single known node | `get_nodes_info({ nodeIds: [id], maxDepth: 0 })` |

The response includes `descendantCount` on top-level and boundary nodes — use it to gauge whether a deeper traversal is feasible before requesting it.

### Batch tools vs. single-item tools

Use a batch tool when:

- You have **more than 2–3 items** of the same operation type.
- The operations are **independent** of each other's results (no item depends on another item's output).
- Per-item validation is acceptable (the batch tool will validate each item's name and scope independently and fail the whole batch on any single mismatch).

Use a single-item tool when:

- You only have one item.
- Later operations depend on the result of earlier ones.
- You want to handle per-item failure independently.

| Single | Batch | Use batch when |
|---|---|---|
| `set_text_content` (via `create_text` / modification) | `set_multiple_text_contents` | Updating text across many nodes from a known mapping |
| `delete_node` (via `delete_multiple_nodes` only) | `delete_multiple_nodes` | Always — there is no single-delete tool |
| `set_component_instance_property` | `set_instance_overrides` | Propagating overrides from one source to many targets |
| `set_annotation` (via batch only) | `set_multiple_annotations` | Always |

### Streaming progress events

Tools that may run long (`get_nodes_info` at high depth, `get_pages_info` on large files) emit `progress_update` events. Treat them as informational — they prevent timeouts and signal that the call is still working. Do not treat them as completion; wait for the actual response.

---

## Quick-reference: workflow recipes

These are the canonical shapes. Adapt parameters; do not skip steps.

### Find and update text

```
1. get_pages_info()                                    → find the page
2. get_nodes_info({ nodeIds: [pageId],
                    filter: { type: "TEXT" },
                    fields: ["characters", "name"] })   → list text nodes
3. set_multiple_text_contents({ updates: [
     { nodeId, nodeName, text }, ...                    → names verbatim from step 2
   ]})
```

### Create a new node inside a frame

```
1. get_nodes_info({ nodeIds: [frameId], maxDepth: 0 }) → confirm parent name
2. create_rectangle({ parentId: frameId,
                      parentNodeName: <verbatim name from step 1>,
                      x, y, width, height })
```

### Modify a node by URL the user pasted

```
1. Pass the URL-format ID through unchanged (server normalizes)
2. get_nodes_info({ nodeIds: [urlId], maxDepth: 0 })   → discover real name
3. <write tool>({ nodeId: urlId, nodeName: <name from step 2>, ... })
```

---

## When the rules and the user conflict

If the user asks you to do something a hard constraint forbids — for example, "edit this node" when the session is `READ_ONLY_MODE`, or "rename it to X" when the parent is `OUTSIDE_SCOPE` — **do not attempt a workaround.** Explain the constraint, name the structured error code, and tell the user the concrete action they need to take (usually: reconnect with a different scope link). The constraints exist because the plugin cannot trust your judgment about whether an edit is safe; respect them in your responses too.
