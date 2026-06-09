# Hard constraints (the plugin enforces)

These rules are checked inside the Figma plugin at execution time. Violating one returns a structured error code — not a soft warning — and the operation is denied. There is no way around them, so plan your calls to comply up front rather than relying on retry.

## 1. Scope is locked at connection time

The user sets an editable scope when the plugin connects. You cannot modify anything outside that scope, and you cannot change or extend it programmatically.

| Connection mode | What you can do |
|---|---|
| Connected **without** a Page/Layer link | Session is **read-only**. Every write tool fails with `READ_ONLY_MODE`. |
| Connected **with** a Page/Layer link | Writes succeed only inside that node and its descendants. Reads are always allowed. |

If a write fails with a scope error, **do not retry with the same ID** — the scope is fixed for the session. Either target a node inside the locked scope, or ask the user to reconnect with a broader scope.

## 2. Every write requires name verification

Every modification tool requires a `nodeName`. Every creation tool requires a `parentNodeName`. Batch tools require a name on each item in the array. The plugin resolves the actual name by ID and rejects the operation if it does not match.

**The only correct way to obtain a name:** read it from `node_info` or `page_info` and pass it back verbatim. Do not guess, abbreviate, normalize, translate, or "clean up" the name. Whitespace and casing must match exactly. This catches the most common failure: confidently operating on a stale or fabricated node ID.

## 3. Every creation tool requires a parentId

There is no default parent page or "current page" fallback. Every creation tool (`create_shape`, `create_frame`, `create_text`, `create_svg`, `create_instance`) requires a valid `parentId` and its corresponding `parentNodeName`. Attempting to omit `parentId` or passing an unresolved ID will result in a hard failure.

## 4. Retrieve overrides requires nodeId

The `instance_get_overrides` tool requires a `nodeId` of the target `INSTANCE` node. Silent fallback to the user's current selection has been removed.

## 5. Navigation/Selection is exempt from scope locks

The `view_navigate` tool is **un-scope-gated**. You can navigate the user's editor view or change their active page to any page or node in the document, even if they lie completely outside the editable scope or if the connection is in `READ_ONLY_MODE`.

## 6. Batch tools verify every item (Atomicity & Pre-Validation)

Batch tools (`text_set_content`, `annotation_set`, `instance_set_overrides`, `create_component_set`) perform type-integrity and presence checks on every target *before* making any mutations. If any node in the batch is not found, outside the editable scope, has a mismatched name, or does not match the required node type, **the entire command aborts with zero mutations applied**.

Once execution begins:
* Handlers process items sequentially and stop on the first mutation failure.
* They return a standardized report of completed vs. failed items.
* No automatic rollbacks are attempted.

*Note:* `node_delete` (`deleteMultipleNodes`) is excluded from the stop-on-first-failure rule, keeping its parallel chunked deletions resilient.

## 7. Node IDs from Figma URLs work as-is

Figma URLs contain node IDs with dashes (`20485-41`); the plugin API expects colons (`20485:41`). The server converts dash-format IDs automatically before forwarding. Pass URL-format IDs through unchanged — do not pre-convert them.

---

## When a constraint forbids the request

If the user asks you to do something a hard constraint forbids — e.g. "edit this node" when the session is `READ_ONLY_MODE`, or "rename it" when the parent is `OUTSIDE_SCOPE` — **do not attempt a workaround.** Explain the constraint, name the structured error code, and tell the user the concrete action they need to take (usually: reconnect with a different scope link). The constraints exist because the plugin cannot trust an agent's judgment about whether an edit is safe; respect them in your responses too.
