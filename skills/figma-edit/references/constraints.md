# Hard constraints (the plugin enforces)

These rules are checked inside the Figma plugin at execution time. Violating one returns a structured error — an error code (e.g. `READ_ONLY_MODE`) or an `Operation Denied: …` message — not a soft warning, and the operation is denied. There is no way around them, so plan your calls to comply up front rather than relying on retry.

## 1. Scope is locked at connection time

The user sets an editable scope when the plugin connects. You cannot modify anything outside that scope, and you cannot change or extend it programmatically. There are three independent permission axes:

| Axis | What it governs |
|---|---|
| **Node Scope** | Which nodes you can create, modify, or delete. If the connection lacks a Page/Layer link, it is **node read-only** and any node mutation fails with `READ_ONLY_MODE`. |
| **Variables** | Whether you can create, modify, or delete Local Variables. If disabled, variable mutations fail with `VARIABLE_EDITS_DISABLED`. |
| **Styles** | Whether you can create, modify, or delete Local Styles. If disabled, style mutations fail with `STYLE_EDITS_DISABLED`. |

If a write fails with a scope error, **do not retry with the same ID** — the scope is fixed for the session. Ask the user to reconnect with the necessary permissions.

## 2. Structural and State Constraints

Beyond the top-level scope, the plugin enforces strict structural boundaries:
- **Locked nodes:** You cannot modify a locked node or any of its descendants. It fails with `Operation Denied: Node '…' (or one of its ancestors, '…') is locked.`
- **Instance interiors:** You cannot make **structural** edits — delete, reparent, group/ungroup, or create/clone/add children — to nodes *inside* a component instance. It fails with `Operation Denied: Node '…' is inside a component instance ('…') and cannot be <deleted/grouped/…> directly.` Property and override writes are still allowed: use `instance_set_property` / `instance_set_overrides`, or set fills/text/visibility on overridable descendants.
- **Remote components:** You cannot mutate styles, variables, or main components subscribed from an external library. It fails with `Operation Denied: '…' is a remote library asset (style/variable/component) and is read-only in this file.` (An *instance* of a remote component is still editable via overrides.)
- **Scope Root:** You cannot delete, flatten, ungroup, or convert-to-component the root node of your editable scope — doing so would invalidate the session. It fails with `Operation Denied: This node is the current Editable Scope root…`. (Reparenting the scope root is allowed; its id is unchanged.)

## 3. Every write requires name verification

Every modification tool requires a `nodeName`. Every creation tool requires a `parentNodeName`. Batch tools require a name on each item in the array. The plugin resolves the actual name by ID and rejects the operation if it does not match.

**The only correct way to obtain a name:** read it from `node_info` or `page_info` and pass it back verbatim. Do not guess, abbreviate, normalize, translate, or "clean up" the name. Whitespace and casing must match exactly. This catches the most common failure: confidently operating on a stale or fabricated node ID.

## 4. Every creation tool requires a parentId

There is no default parent page or "current page" fallback. Every creation tool (`create_shape`, `create_frame`, `create_text`, `create_svg`, `create_instance`) requires a valid `parentId` and its corresponding `parentNodeName`. Attempting to omit `parentId` or passing an unresolved ID will result in a hard failure.

## 5. Retrieve overrides requires nodeId

The `instance_get_overrides` tool requires a `nodeId` of the target `INSTANCE` node. Silent fallback to the user's current selection has been removed.

## 6. Navigation/Selection is exempt from scope locks

The `view_navigate` tool is **un-scope-gated**. You can navigate the user's editor view or change their active page to any page or node in the document, even if they lie completely outside the editable scope or if the connection is in `READ_ONLY_MODE`.

## 7. Batch tools verify every item (Atomicity & Pre-Validation)

Batch tools (`text_set_content`, `annotation_set`, `instance_set_overrides`, `create_component_set`) perform type-integrity and presence checks on every target *before* making any mutations. If any node in the batch is not found, outside the editable scope, has a mismatched name, or does not match the required node type, **the entire command aborts with zero mutations applied**.

Once execution begins:
* Handlers process items sequentially and stop on the first mutation failure.
* They return a standardized report of completed vs. failed items.
* No automatic rollbacks are attempted.

*Note:* `node_delete` (`deleteMultipleNodes`) is excluded from the stop-on-first-failure rule, keeping its parallel chunked deletions resilient.

## 8. Node IDs from Figma URLs work as-is

Figma URLs contain node IDs with dashes (`20485-41`); the plugin API expects colons (`20485:41`). The server converts dash-format IDs automatically before forwarding. Pass URL-format IDs through unchanged — do not pre-convert them.

## 9. Variable Scopes

When creating a new variable with `variable_manage` (`action: "CREATE_VARIABLE"`), you **must always set `scopes` explicitly**. The `scopes` parameter controls where the variable can be applied (e.g., `["ALL_FILLS", "STROKE_COLOR"]`). Omit `scopes` when updating an existing variable to leave its current scopes unchanged.

---

## When a constraint forbids the request

If the user asks you to do something a hard constraint forbids — e.g. "edit this node" when the session lacks node permissions, or "rename it" when the parent is outside the scope — **do not attempt a workaround.** Explain the constraint, quote the structured error (code or `Operation Denied: …` message), and tell the user the concrete action they need to take (usually: reconnect with different permissions). The constraints exist because the plugin cannot trust an agent's judgment about whether an edit is safe; respect them in your responses too.
