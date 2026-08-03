# figma-edit-mcp: Detailed Review of 5 Key Gaps

This note expands the five gaps identified in the source-level critical review of `neozhehan/figma-edit-mcp`. The focus is limited to the project’s supported edit surface, not the complete Figma feature set or broader non-design risks. Local transport security is intentionally out of scope.

## Summary Table

| # | Gap | Severity | Core issue |
|---|---|---:|---|
| 1 | Design-system updates do not fully live up to “right-object assurance” | High | Node edits are strongly current-name verified, but style and variable update paths are weaker after opt-in. |
| 2 | “All-or-nothing” should be renamed “prevalidation atomicity” | High | Batch validation is strong before mutation begins, but there is no general rollback layer after mutation starts. |
| 3 | Create-tool schemas contradict the safety contract | Medium | Runtime effectively requires parent-name verification, but MCP schemas mark `parentNodeName` optional. |
| 4 | Instance-interior wording is too broad | Medium | Structural edits inside instances are blocked, but some override/property/content writes may still be allowed. |
| 5 | Batch result semantics can be misleading | Medium | Some batch handlers can report overall success even when individual items failed. |

---

## Gap 1: Design-system updates do not fully live up to “right-object assurance”

### The claim

The project’s safety story strongly emphasizes that the AI agent should not be able to mutate a hallucinated, stale, or unintended object merely because it has an ID. For ordinary node writes, this is implemented with a current-name check: the agent must provide both the node ID and the node’s current name, and the plugin verifies that they match before mutating.

This supports the project’s “right node, right operation, right scope” story for scoped node editing.

### What the code appears to do well

For node edits, the design is strong:

- Node write schemas require `nodeId` plus `nodeName`.
- The plugin re-fetches the actual node and compares its current name to the supplied name.
- If the name does not match, the write is rejected.
- This protects against stale IDs, hallucinated IDs, renamed nodes, and accidental cross-target mutations.

For destructive design-system operations, especially variable deletion, the code is also much stronger:

- `variable_delete` requires names when IDs are supplied.
- It verifies collection or variable names before deletion.
- It scans for consumers before removing variables.

### Where the gap is

The same level of “current object identity” assurance is not consistently applied to style and variable **update** operations.

The problematic pattern is:

- Variable/style editing is gated by explicit permission, which is good.
- But once permission is granted, some update paths can rely primarily on IDs.
- `currentVariableName` is optional rather than required for variable updates.
- Style update by ID does not appear to require a separate current-style-name verification comparable to `nodeName`.

That means the safety invariant is uneven:

> Node writes generally require ID + current name.  
> Some global design-system update writes can proceed with weaker current-name confirmation.

This is especially important because design-system edits can have wide blast radius. A single variable or style update can affect many nodes across the file.

### Why this matters

The README’s safety language is strongest when it talks about preventing damage to shared design-system objects. But the code’s strongest identity checks are concentrated on node writes and deletion paths, not all style/variable update paths.

This creates a mismatch between:

- the project’s general safety philosophy, and
- the actual guarantees provided once style or variable editing is enabled.

A stale style ID or variable ID is less likely than an arbitrary hallucination, but the point of the project’s model is that the plugin should not trust the agent’s implied object identity. The same reasoning that justifies `nodeName` should apply to global tokens and styles.

### Practical failure scenario

1. The agent reads a variable called `Color / Primary`.
2. The user or another tool renames or replaces variables before the agent writes.
3. The agent still holds an old variable ID or stale assumption.
4. The update path does not require a verified current variable name.
5. The plugin may update the wrong or no-longer-intended global object.

A similar stale-target scenario can apply to styles.

### Recommended fix

Bring style and variable update paths up to the node-write standard.

Recommended changes:

- Require `currentVariableName` for variable updates by ID.
- Require `collectionName` when creating variables by collection ID.
- Add `currentStyleName` for style updates by ID.
- Enforce these fields in both MCP schemas and plugin handlers.
- Update README and `SAFETY.md` to distinguish between:
  - write paths that are exact-name verified, and
  - any paths that are only permission-gated.

### Better claim wording

Instead of:

> Every write requires exact-name verification.

Use:

> Scoped node writes and destructive design-system writes require current-name verification. Style and variable updates should also require current-name verification before they can be described as having the same right-object assurance.

---

## Gap 2: “All-or-nothing” should be renamed “prevalidation atomicity”

### The claim

The README suggests that bulk edits cannot half-finish. This is a strong claim because it implies some form of atomicity: either the whole operation happens, or none of it does.

### What the code appears to do well

The project does implement meaningful prevalidation before many batch mutations:

- It checks scope before mutation.
- It checks node names before mutation.
- It checks locked/protected state before mutation.
- It validates batches before passing them to handlers.

This is valuable. It prevents an obvious class of partial failures where the first item succeeds and the second item is invalid because it was never checked.

In that sense, the project supports this narrower claim:

> If batch prevalidation fails, mutation should not begin.

That is a good safety property.

### Where the gap is

Prevalidation is not the same as full transactional atomicity.

The project does not appear to have a general rollback system for mutations that fail after mutation begins. Some handlers apply changes sequentially. If item 1 succeeds and item 2 fails due to a runtime/Figma API issue, there is not a universal mechanism to undo item 1.

Examples of this risk include:

- Text content batch updates that apply changes one by one.
- Delete operations that run in chunks.
- Figma API failures after some mutations have already succeeded.
- Runtime errors in the middle of a handler.
- Time-of-check/time-of-use changes between validation and mutation.

The project’s `SAFETY.md` is more honest than the marketing copy: it acknowledges that there is no general transaction layer after mutation begins.

### Why this matters

“All-or-nothing” is a very strong phrase. Users may infer rollback semantics that the code does not provide.

The actual guarantee is closer to:

> The plugin prevalidates supported batches before mutation begins, reducing the chance of partial edits caused by invalid inputs. It does not provide general rollback for failures that occur after mutation starts.

This is still a useful guarantee, but it is not the same as transactional safety.

### Practical failure scenario

1. User asks the agent to update 50 text nodes.
2. The plugin prevalidates all 50 node IDs, names, scopes, and types.
3. Mutation begins.
4. The first 20 text nodes update successfully.
5. The 21st update fails due to a Figma API issue, unloaded font problem, plugin runtime issue, or unexpected node state.
6. The first 20 changes remain applied.
7. The batch has half-finished despite passing prevalidation.

### Recommended fix

There are two possible paths.

#### Documentation fix

Change README language immediately.

Replace claims like:

> Cannot half-finish a bulk edit.

With:

> Bulk edits are prevalidated before mutation begins. If prevalidation fails, no mutation starts. Runtime failures after mutation begins are reported, but the plugin does not provide general rollback for all mutation types.

#### Engineering fix

If the project wants to support the stronger claim, implement transaction-like behavior for selected operations:

- Capture pre-mutation state for reversible operations.
- Apply mutations.
- If a later mutation fails, restore prior state where possible.
- Report rollback success/failure explicitly.

This will be easier for operations like text content, fills, strokes, transforms, and names. It will be harder or impossible to fully guarantee for destructive operations like delete, flatten, group, ungroup, detach, or component conversion.

### Better claim wording

Use:

> Prevalidated batches reduce partial-edit risk.

Avoid:

> Bulk edits cannot half-finish.

Unless a real rollback layer exists for the specific operation being claimed.

---

## Gap 3: Create-tool schemas contradict the safety contract

### The claim

The safety model says creation is scoped and parent-verified. In practice, a create operation should not be able to place a new node under an arbitrary or hallucinated parent. The caller should provide both:

- `parentId`
- `parentNodeName`

The plugin then verifies that the parent is in scope and that its current name matches the supplied name.

### What the code appears to do well

The plugin-side behavior appears safer than the schema suggests:

- Create commands go through parent validation.
- Parent validation checks scope.
- Parent validation checks the parent’s current name.
- Missing or incorrect parent name should fail closed.

So the runtime safety story is mostly intact.

### Where the gap is

The MCP schemas for create tools mark `parentNodeName` as optional for several create operations, including common create paths such as:

- shape creation
- frame creation
- text creation
- SVG creation
- instance creation

This contradicts the safety documentation and the apparent runtime requirement.

The result is not necessarily a safety bypass, because the plugin validator can still reject the request. But it is a contract mismatch between three layers:

1. README / `SAFETY.md`: parent name is required.
2. MCP schema: parent name is optional.
3. Plugin runtime: parent name is effectively required to pass validation.

### Why this matters

The MCP schema is what the AI assistant sees as the tool contract. If it marks `parentNodeName` optional, the model may omit it. That creates avoidable failed calls and weakens the project’s claim that the agent is operating from a precise, safety-aware tool interface.

In safety-oriented tools, schemas are not just developer convenience. They are part of the safety boundary because they define what the model is instructed to supply.

### Practical failure scenario

1. The agent wants to create a rectangle inside `Card Container`.
2. The schema says `parentNodeName` is optional.
3. The agent sends `parentId` but omits `parentNodeName`.
4. The plugin rejects the call because parent-name verification cannot pass.
5. The failure is safe, but unnecessary.
6. The model may retry with confused arguments, increasing friction and unpredictability.

### Recommended fix

Make the schema match the runtime safety contract.

Recommended changes:

- Mark `parentNodeName` as required for every create operation that accepts `parentId`.
- Ensure generated tool descriptions say the parent name must be the current exact Figma layer name.
- Add tests that verify each create schema rejects calls missing `parentNodeName`.
- Add plugin tests that verify missing, stale, or mismatched parent names fail closed.

### Better claim wording

After schema correction, the project can safely say:

> Create operations require both the target parent ID and the parent’s current exact name. The plugin verifies both scope and parent identity before insertion.

Before schema correction, the more accurate claim is:

> The plugin enforces parent-name verification at runtime, but some MCP create schemas currently mark that field optional.

---

## Gap 4: Instance-interior wording is too broad

### The claim

The README and safety language imply that instance interiors are protected from agent edits. This is an important promise because editing inside instances can break component semantics or create confusing overrides.

### What the code appears to do well

The project has real guards around component instances:

- It blocks many structural edits inside instances.
- It checks for instance ancestors.
- It protects against operations that would mutate structure under an instance.
- It distinguishes normal scoped node edits from structural edits that would violate component-instance boundaries.

This is a good design choice. Structural modifications inside component instances are especially risky for AI agents because they can create hidden divergence from the component source.

### Where the gap is

The plain-language claim “instance interiors are off-limits” is too broad.

The more accurate behavior is:

- Structural edits inside instances are blocked.
- Some override-like edits may still be allowed.
- Some content/property edits may rely on Figma’s own rules and plugin validation rather than a blanket instance-interior prohibition.

For example, the safety model may reasonably allow supported instance property overrides, because overriding instance properties is a normal Figma workflow. Text content changes inside instances may also be treated differently from structural edits, depending on the handler and Figma’s API behavior.

This means the project should not imply that every possible mutation to a descendant of an instance is categorically impossible.

### Why this matters

There is a meaningful distinction between:

- changing the structure of an instance, and
- applying an allowed override to an instance.

Users who read “instance interiors are off-limits” may expect a broader guarantee than the project intends or implements.

The current behavior may be correct. The problem is not necessarily the code; it is the wording.

### Practical failure scenario

1. User believes the agent cannot alter anything inside component instances.
2. Agent performs a supported override or text/content update on a descendant of an instance.
3. The operation is allowed because it is not treated as a blocked structural edit.
4. User sees this as a violation of the README claim, even if it is consistent with Figma’s override model.

### Recommended fix

Clarify the documentation.

Recommended wording:

> Structural edits inside component instances are blocked. Supported override and property edits may still be allowed when Figma permits them and when they pass the plugin’s scope, name, lock, and permission checks.

Also consider adding a table to `SAFETY.md` that separates operations into categories:

| Operation category | Inside instance descendant? | Rationale |
|---|---:|---|
| Delete / group / ungroup / flatten / insert / create structural child | Blocked | Structural mutation risk |
| Rename instance descendant | Depends on intended policy | Could be structural/semantic |
| Text content override | Allowed or blocked depending on policy | Should be explicit |
| Instance property override | Allowed | Normal Figma override workflow |
| Component source mutation | Permission/scoped | Should be explicit |

### Better claim wording

Avoid:

> Instance interiors are off-limits.

Use:

> Structural edits inside instances are blocked; supported instance overrides may still be allowed.

---

## Gap 5: Batch result semantics can be misleading

### The claim

The safety story emphasizes clear failure behavior. In a safety-oriented editing tool, the agent and user need to know whether a mutation fully succeeded, partially succeeded, or failed.

### What the code appears to do well

Batch handlers return structured details, including failure information for individual items. That is better than returning only a boolean.

For example, a delete batch can report which items succeeded and which failed. That diagnostic information is useful for recovery.

### Where the gap is

Some batch operations can have partial success while still reporting an overall success-like status. For example, a delete batch may report success if at least one deletion succeeded, while also including failed items.

That is risky because many agent workflows treat top-level `success: true` as the main signal. If the model does not carefully inspect every detail field, it may tell the user the operation succeeded even though some items failed.

### Why this matters

In an AI-driven editing workflow, result semantics need to be hard to misread. A human developer might inspect `failedItems`, but a model may over-weight the top-level boolean.

For safety-sensitive tools, partial success should be first-class. It should not be encoded as “success with some failure details.”

### Practical failure scenario

1. User asks the agent to delete 30 obsolete nodes.
2. The operation deletes 24 nodes and fails on 6.
3. The handler returns `success: true` because some deletion occurred.
4. The response includes failure details.
5. The agent sees `success: true` and summarizes: “Deleted the obsolete nodes.”
6. User believes all 30 nodes were deleted.

### Recommended fix

Use explicit status semantics.

Recommended response shape:

```ts
type BatchStatus = "success" | "partial_success" | "failed";

interface BatchResult {
  status: BatchStatus;
  success: boolean; // true only when status === "success"
  total: number;
  succeeded: number;
  failed: number;
  failedItems: Array<{
    id: string;
    name?: string;
    reason: string;
  }>;
}
```

Recommended boolean behavior:

- `success: true` only when every requested item succeeded.
- `success: false` when any requested item failed.
- `status: "partial_success"` when at least one item succeeded and at least one failed.
- `status: "failed"` when zero requested items succeeded.

Also update agent-facing tool descriptions to instruct the model:

> Treat `partial_success` as an incomplete operation and report failed items to the user.

### Better claim wording

Use:

> Batch operations report per-item outcomes and distinguish complete success, partial success, and failure.

Avoid:

> The operation succeeded.

When any requested item failed.

---

## Priority Fix List

Recommended order of work:

1. **Fix design-system update identity checks.** Require current-name verification for style and variable updates.
2. **Correct README atomicity language.** Replace all-or-nothing wording with prevalidation wording unless rollback is implemented.
3. **Make create schemas match runtime validation.** Require `parentNodeName` in MCP schemas.
4. **Clarify instance-interior policy.** Document structural edits vs allowed overrides.
5. **Make partial batch outcomes unambiguous.** Introduce `status: "success" | "partial_success" | "failed"`.

## Final Assessment

The project’s safety model is real and unusually thoughtful for an MCP editing bridge. Its strongest guarantees are scoped node writes, current-name checks for node mutations, scope-root preservation, locked-node protection, explicit opt-in for global design-system writes, and guarded variable deletion.

The main issue is not that the project is unsafe across the board. The issue is that some documentation and marketing language overgeneralizes from the strongest node-edit guarantees to the entire edit surface.

The highest-value improvement is to make style and variable updates as identity-safe as node edits, then align README wording, MCP schemas, plugin behavior, and result semantics so they all describe the same safety contract.
