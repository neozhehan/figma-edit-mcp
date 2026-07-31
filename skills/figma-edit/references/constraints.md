# Hard constraints (the plugin enforces)

These rules are checked inside the Figma plugin at execution time. Violating one returns a structured error — an error code (e.g. `READ_ONLY_MODE`) or an `Operation Denied: …` message — not a soft warning, and the operation is denied. There is no way around them, so plan your calls to comply up front rather than relying on retry.

## 1. Scope is locked at connection time

The user sets an editable scope when the plugin connects. A successful command cannot modify anything outside that scope, and you cannot change or extend it programmatically. A failed implicit creator can survive outside its verified destination only when cleanup cannot be confirmed; that exceptional outcome is returned as an explicit partial mutation with survivor/location evidence, never as success. There are three independent permission axes:

| Axis | What it governs |
|---|---|
| **Node Scope** | Which nodes you can create, modify, or delete. If the connection lacks a Page/Layer link, it is **node read-only** and any node mutation fails with `READ_ONLY_MODE`. |
| **Variables** | Whether you can create, modify, or delete Local Variables. If disabled, variable mutations fail with `VARIABLE_EDITS_DISABLED`. |
| **Styles** | Whether you can create, modify, or delete Local Styles. If disabled, style mutations fail with `STYLE_EDITS_DISABLED`. |

If a write fails with a scope error, **do not retry with the same ID** — the scope is fixed for the session. Ask the user to reconnect with the necessary permissions.

## 2. Structural and State Constraints

Beyond the top-level scope, the plugin enforces strict structural boundaries:
- **Locked nodes:** You cannot modify a locked node or any of its descendants. It fails with `Operation Denied: Node '…' (or one of its ancestors, '…') is locked.`
- **Instance interiors:** You cannot make **structural** edits — delete, reparent, group/ungroup, create/clone/add children, or convert-to-component — to nodes *inside* a component instance. It fails with `Operation Denied: Node '…' is inside a component instance ('…') and cannot be <deleted/grouped/converted/…> directly.` Property and override writes are still allowed: use `instance_set_property` / `instance_set_overrides`, or set fills/text/visibility on overridable descendants.
- **Remote components:** You cannot mutate styles, variables, or main components subscribed from an external library. It fails with `Operation Denied: '…' is a remote library asset (style/variable/component) and is read-only in this file.` (An *instance* of a remote component is still editable via overrides.)
- **Scope Root:** You cannot delete, flatten, ungroup, or convert-to-component the root node of your editable scope — doing so would invalidate the session. It fails with `Operation Denied: This node is the current Editable Scope root…`. (Reparenting the scope root is allowed; its id is unchanged.)

## 3. Every write requires name verification

No write against an existing object proceeds unless the caller-supplied current name matches the resolved object's actual name — nodes, variables, styles, and collections alike; creation verifies the identified parent or collection instead.

Node modification tools require a `nodeName`. Parent-targeted creators require `parentNodeName`; `create_component` verifies the source `nodeName`, while `create_component_set` verifies every component `nodeName` plus its `parentNodeName`. Batch tools require a name on each item in the array. The plugin resolves the actual name by ID and rejects the operation if it does not match.

**The only correct way to obtain a name:** read it from `node_info` or `page_info` and pass it back verbatim. Do not guess, abbreviate, normalize, translate, or "clean up" the name. Whitespace and casing must match exactly. This catches the most common failure: confidently operating on a stale or fabricated node ID.

Name **verification** and name **assignment** are different contracts. A field that assigns a user-visible name rejects an explicit `""` at both the MCP and plugin boundaries before mutation; lookup fields keep their own exact/missing semantics, classified per action. Recovery depends on the assigning field: required `node_rename.name`, variable/style creation `name`, and component-property ADD `propertyName` need a non-empty value; omit optional `node_group.name` or `CREATE_COLLECTION.modeName` for the native default; omit optional style/variable update `name` or component-property EDIT `newPropertyName` to keep the current name. Do not infer a universal empty-lookup rule from C9: that decision covers `parentNodeName` on its two protected parent paths.

## 4. Parent-targeted creation requires an explicit destination

There is no successful default-parent or "current page" fallback. Every parent-targeted creator (`create_shape`, `create_frame`, `create_text`, `create_svg`, `create_instance`, and `create_component_set`) requires a valid `parentId` and corresponding `parentNodeName`. `create_component` instead derives its destination from the verified source frame's parent. Attempting to omit a required parent or passing an unresolved ID is a hard failure.

Figma's implicit creator APIs initially attach a node to `currentPage`; the plugin inserts it into the verified destination as the immediate next synchronous operation, before any `await` or fallible configuration. A successful response reports the actual `parentId`. If later configuration fails, cleanup is best-effort. A cleanup that throws or returns without confirming removal preserves the initiating error and adds `details.partialMutation: true`, `whatChanged`, and `before` evidence including the survivor, `survivingParentState: "located" | "detached" | "unknown"`, nullable `survivingParentId`, and `verifiedParentId`. These are the actual and verified parent IDs when the actual ID is readable; `located` carries that exact ID, only an observed null parent is `detached`, and an unreadable parent or ID is `unknown`, never assumed detached. `create_component` uses the analogous `survivingComponentParentState`/`survivingComponentParentId` and removes the new component only after it positively confirms that the source is live, every original child is restored, and the component is empty; unknown or relocated child state is disclosed instead. Inspect and reconcile that state before retrying.

Creator names are presence-sensitive but cannot be explicitly empty. Live Figma normalizes `""` to a type/content-derived layer name, so `create_shape`, `create_frame`, `create_text`, `create_svg`, and `create_component_set` reject an explicitly empty `name` / `componentSetName` before any creator, rename, or combine mutation. Omit the optional field to keep the established default, or supply a non-empty name.

## 5. Retrieve overrides requires nodeId

The `instance_get_overrides` tool requires a `nodeId` of the target `INSTANCE` node. Silent fallback to the user's current selection has been removed.

## 6. Navigation/Selection is exempt from scope locks

The `view_navigate` tool is **un-scope-gated**. You can navigate the user's editor view or change their active page to any page or node in the document, even if they lie completely outside the editable scope or if the connection is in `READ_ONLY_MODE`.

## 7. Batch tools verify every item (Atomicity & Pre-Validation)

Batch tools (`text_set_content`, `annotation_set`, `instance_set_overrides`, `create_component_set`) perform type-integrity and presence checks on every target *before* making any mutations. If any node in the batch is not found, outside the editable scope, has a mismatched name, or does not match the required node type, **the entire command aborts with zero mutations applied**.

Once execution begins:
* Handlers process items sequentially and stop on the first mutation failure.
* They return a standardized report of completed vs. failed items.
* There is no general transaction or guaranteed rollback. Tool-specific best-effort recovery may run, and any durable state it cannot restore is disclosed as a partial mutation.

*Note:* `node_delete` (`deleteMultipleNodes`) is excluded from the stop-on-first-failure rule, keeping its parallel chunked deletions resilient.

For accepted batch execution, `status: "partial_success"` is incomplete: account for and retry every non-success row (`failed` and `skipped`), except that `annotation_set` requires the list-before-retry check below because append is not idempotent. Every batch result row carries the shared `nodeId`/`status`/`error` vocabulary, with `error` required on failed and skipped rows.

`annotation_set` count fields are verified observations. `beforeCount`/`afterCount` may be null and are paired with required `beforeCountVerified`/`afterCountVerified`. If an append was attempted but post-state could not be read, the row fails safe with `partialMutation: true` and `outcomeUnknown: true` (plus optional secondary `postStateError`). Do not interpret null as zero or matching numbers as verified unless their flags are true; call `annotation_list` before any retry.

For `create_component_set`, failed-combine recovery inspects each member's placement before writing a recovery name. Ordinary members confirmed at their original placement are restored best-effort, continuing after individual recovery failures. Members confirmed inside a surviving `COMPONENT_SET` retain or best-effort confirm their computed variant names; a changed parent with unreadable type blocks original-name restoration. Its error evidence separates `appliedComponents`, `restoredComponents`, `unrestoredComponents`, `removedComponents`, `unknownRemovalComponents`, `reparentedComponents`, `unverifiedPlacementComponents`, `survivingComponentSets`, `retainedVariantComponents`, and `unconfirmedVariantComponents`. Removal is `live | removed | unknown`; unknown never authorizes optimistic recovery. Once a component set exists, member names remain valid variant names, the set's required identity/location is snapshotted and verified, and optional projection-read failures become success warnings.

## 8. Node IDs from Figma URLs work as-is

Figma URLs contain node IDs with dashes (`20485-41`); the plugin API expects colons (`20485:41`). The server converts dash-format IDs automatically before forwarding. Pass URL-format IDs through unchanged — do not pre-convert them.

## 9. Variable Scopes

When creating a new variable with `variable_manage` (`action: "CREATE_VARIABLE"`), you **must always set `scopes` explicitly**. The `scopes` parameter controls where the variable can be applied (e.g., `["ALL_FILLS", "STROKE_COLOR"]`). Omit `scopes` when updating an existing variable to leave its current scopes unchanged.

## 10. Error reporting is total

JavaScript may throw hostile values whose `code`, nested `error`, `message`, `details`, or string conversion also throws. The plugin and registered MCP boundary guard those reads, optional-details copying, and fallback rendering. A readable coded error keeps its structural fields; an unreadable thrown value becomes the canonical `UNKNOWN_ERROR` envelope and unreadable optional details are omitted. If the error still carries `details.partialMutation: true`, its independently constructed recovery evidence remains authoritative: reconcile it before retrying even though the initiating code is `UNKNOWN_ERROR`.

## 11. Native prototype metadata is the supported surface

Use `reaction_list` and `reaction_update` for native prototype work in the connected Design file. v2.3.3 has no connector-template discovery or automatic connector-diagram workflow; lossless reaction reads and state-safe localized updates are explicitly deferred to v2.3.4.

---

## When a constraint forbids the request

If the user asks you to do something a hard constraint forbids — e.g. "edit this node" when the session lacks node permissions, or "rename it" when the parent is outside the scope — **do not attempt a workaround.** Explain the constraint, quote the structured error (code or `Operation Denied: …` message), and tell the user the concrete action they need to take (usually: reconnect with different permissions). The constraints exist because the plugin cannot trust an agent's judgment about whether an edit is safe; respect them in your responses too.
