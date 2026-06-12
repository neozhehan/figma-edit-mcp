# v2.2.0 PRD: Safety & Validation Enhancements

This document is the product/implementation spec for the **v2.2.0** release of `figma-edit-mcp`. The release hardens the plugin against unsafe LLM-issued edits by adding a layer of execution-time guards on top of the existing scope-lock, name-verification, and batch-validation model. Every guard is **plugin-side enforcement** (the agent cannot bypass it) and returns a structured, actionable error in the established `"Operation Denied: …"` style.

Source analysis: `documentation/v2.2.0-safety-enhancement/safety_checks_brainstorm.md` (reviewed and corrected — see §Provenance).

---

## Release identity

> [!IMPORTANT]
> **This is v2.2.0, not v2.1.0.** `v2.1.0` is already tagged (`git tag`) and merged (PR #41, commit `adcc39d`); it shipped Current-Page Elimination / Bounded Parallelism / Atomicity / Image Blocks (see `documentation/v2.1.0/plan.md`). The safety work described here is the **next** release.
>
> Separately, `package.json` still reads `"version": "2.0.0"` — it was never bumped for v2.1.0 and is now two releases behind. Bump it to `2.2.0` as part of this release and reconcile the lag.

## API Change Notice (informational)

> [!NOTE]
> These guards **reject operations that previously executed** (e.g. editing a locked node, deleting the scope root, structural edits inside an instance). That is a deliberate behavior change to the client-facing contract. **No sign-off required** — the project has zero end-users and backwards compatibility is explicitly not a constraint; this notice is informational. Each new rejection surfaces a structured error so agents fail fast with a clear recovery path rather than hitting a raw Figma exception or silently corrupting intent.
>
> **Permission-model change (D4 / §14):** the connection's single read-only flag splits into independent **node / variable / style** permissions, and asset editing now defaults **off**. A linked connection that previously could edit variables/styles will need the two new checkboxes ticked. Same disposition: informational, no sign-off.

---

## Decisions

> [!NOTE]
> **D1 — Version.** This release is **v2.2.0**. Bump `package.json` `2.0.0 → 2.2.0`.

> [!NOTE]
> **D2 — Locked layers are a hard block.** When an edit targets a node that is `locked`, or any of whose ancestors is `locked`, the operation is **rejected** — not warned-and-proceeded. Rationale: a lock is a deliberate user action to protect structure; the Figma Plugin API bypasses the UI lock, so silently honoring the request would violate explicit user intent. Agents that genuinely need to edit a locked node must surface the block to the user and have them unlock it (or re-scope). This mirrors the existing scope-lock philosophy: the plugin refuses, the agent adapts.

> [!NOTE]
> **D3 — Enforcement is plugin-side only (no MCP-side mirroring).** All v2.2.0 guards live and execute in the plugin (`figma_plugin/`) — the single source of truth and the only layer the agent cannot bypass. We do **not** mirror any guard as an MCP-side Zod/`.refine()` pre-check for this release, not even the cheap stateless ones (self-parent, batch-size, cross-field rules). Rationale: most guards need live document state the MCP server lacks, so a mirror could only ever cover a minority; the per-error transport saving (~sub-ms MCP-caught vs ~10–50 ms idle / up to seconds when queued plugin-side) is dwarfed by the agent's own multi-second re-planning turn, so "fail-fast" buys little wall-clock; and a second validation site risks silent divergence. Existing Zod range/enum checks (color `0–1`, layout enums) stay as-is. Revisit only if telemetry shows one stateless mistake dominating agent retries. Resolves discussion item 1.

> [!NOTE]
> **D4 — Per-asset edit permissions (resolves discussion item 2).** The single `readOnly` gate splits into three independent axes — **nodes / variables / styles**. Two plugin checkboxes ("Allow AI Agent to modify Variables", "Allow AI Agent to modify Styles") gate the document-global asset tools, **both unchecked by default**; node edits stay gated by the scope link. State becomes `allowEditNode: false|"page"|"node"` + `allowEditVariable`/`allowEditStyle` booleans + `scopeRootId` (the `readOnly` field is removed). Permissions are read at **connect time** (change = reconnect). `node_bind_variable`/`node_apply_style` remain **node** edits; binding a variable into a style needs only `allowEditStyle`. Full spec, 8-combination matrix, and migration in **§14**.

> [!NOTE]
> **D5 — Reads are never gated (resolves discussion item 4).** Every guard in this release — locked (§2), remote (§7), scope, and the asset-permission axes (§14) — applies to **writes only**. Read/discovery tools (`node_info`, `page_info`, all `*_list`, `instance_get_overrides`, `reaction_list`, `annotation_list`), `view_navigate`, and `node_export_visual` are never blocked by a lock, a remote flag, scope, or a permission toggle. Rationale: those are write constraints (you must read a locked node to learn it's locked), and discovery must see the whole document to be useful. Accepted residual: `node_export_visual` can render an off-scope node (mild data-surface concern, low risk since `node_info` already exposes full reads). If off-scope export is ever a real risk, scope **all** reads holistically — never single out export.

> [!NOTE]
> **D6 — New guards are pre-validation (resolves discussion item 3).** The scope-root (§1), locked (§2), and instance-interior (§4) guards run in the existing dispatch-level pre-validation loop in `figma_plugin/src/main.ts` — the same per-item pass that already checks scope + name — so a single bad member in a batch (`node_delete`, `node_group`, `text_set_content`, `annotation_set`, `instance_set_overrides`, `create_component_set`) aborts with **zero mutations**, inheriting the v2.1.0 atomicity contract (pre-validate → zero-mutation abort; stop-and-report on mutation-phase failures; never auto-rollback). Reuse the resolved-node reference the loop already holds (v2.1.0 §3 O(N) optimization). `node_delete` keeps its "validation-atomic, not mutation-atomic, resilient parallel chunks" exception — the new checks still run in its pre-validation loop, so it never *starts* deleting a locked or scope-root node.

> [!NOTE]
> **D7 — Instance-interior boundary (resolves discussion item 5).** Inside a component instance, §4 blocks **structural** edits only — child-list mutation (add/remove/reorder/reparent) and deletion (`node_delete`, `node_insert_child`, `node_group`, `node_ungroup`, creation under an instance-interior parent). **Property/override writes are allowed** (`instance_set_property`, `instance_set_overrides`, and fills/text/visibility on overridable descendants); Figma's own override rules are the final arbiter, and anything it still refuses degrades to a normal handler error. Confirm the structural-op list against the live Plugin API during implementation. Full spec in §4.

> [!NOTE]
> **D8 — Auto-layout child transform (resolves discussion item 6).** In `node_transform`, a layout-controlled child (parent is auto-layout and `layoutPositioning !== "ABSOLUTE"`) **hard-rejects** x/y writes (always a silent no-op there) with guidance to use absolute positioning, reorder, or adjust spacing. **Resize** is per-axis: apply the FIXED axis Figma honors and return a `warnings` entry for any HUG/FILL axis the parent controls, rather than rejecting the whole call. Matches Figma's real behavior instead of a coarser blanket rule. Full spec in §9.

> [!NOTE]
> **D9 — `insert_child` out-of-range index throws (resolves discussion item 7).** A present `index` is deliberate intent (append is expressed by *omitting* it), so an out-of-range value is rejected with a structured bounds error rather than silently clamped — surfacing the off-by-one / stale-child-count bug instead of masking it. Valid range `0 … parent.children.length` inclusive; throw on `< 0` or `> length`. The `node_insert_child` tool description must note that the output `index` reports the *actual* resolved position (reordering within the same parent shifts indices). Full spec in §13. *(Reverses the original 7A clamp lean.)*

> [!NOTE]
> **D10 — `INSTANCE_SWAP` validation is advisory (resolves discussion item 8).** In `instance_set_property` / `component_manage_property`, an `INSTANCE_SWAP` value is checked for *shape only* — it must resolve to a `COMPONENT` id or be a non-empty component key; clearly-wrong references (frame id, number, empty string) are rejected, plausible ones pass through for Figma to arbitrate. Do **not** validate against the property's `preferredValues` (advisory in Figma — swaps outside it are often legal); document in the error-playbook that a passed swap can still be refused by Figma. Full spec in §5.

> [!NOTE]
> **D11 — `variable_delete` requires name verification (resolves discussion item 9).** Names are **required**, not optional — correcting a misread that `style_delete` was lenient (its `styleName` is in fact a *required* schema field; the handler's `!== undefined` guard is only defensive). `variableIds` mode requires a parallel `variableNames: string[]` (verify each); `collectionId` mode requires `collectionName` (verify it). Also tighten `style_delete`'s handler to drop the dead `!== undefined` allowance, matching `verifyNodeName`. Conforms to the §2 "every write needs a verified name" invariant. Full spec in §6B.

> [!NOTE]
> **All open decisions resolved (D3–D11).** `discussion.md` retains the full options / pros-cons / rationale archive for each (items 1–9); every resolution is promoted into this §Decisions block. No open questions remain for this release.

---

## Scope & priority

| # | Guard | Priority | Primary location |
| :- | :- | :-: | :- |
| §1 | Scope-root self-destruction guard | **P0** | `figma_plugin/src/main.ts` |
| §2 | Locked-layer hard block (D2) | **P0** | `figma_plugin/src/main.ts` |
| §3 | Cyclic / self-parent hierarchy guard | **P0** | `figma_plugin/handlers/nodeModifiers.ts` |
| §4 | Structural edits inside component instances | **P1** | `figma_plugin/src/main.ts` |
| §5 | Component property type validation | **P1** | `figma_plugin/handlers/componentHandlers.ts` |
| §6 | Name-verification consistency (`reaction_update`, `variable_delete`) | **P1** | `figma_plugin/src/main.ts` |
| §7 | Remote library-asset guard (styles / variables / main components) | **P1** | `figma_plugin/src/main.ts` + handlers |
| §8 | Auto-layout `FILL` sizing guard | **P2** | `figma_plugin/handlers/layoutHandlers.ts` |
| §9 | Silent no-op on auto-layout child transform | **P2** | `figma_plugin/handlers/nodeModifiers.ts` |
| §10 | Mixed-font loading in `text_set_style` | **P2** | `figma_plugin/handlers/textHandlers.ts` |
| §11 | `create_component_set` duplicate-variant guard | **P2** | `figma_plugin/handlers/componentHandlers.ts` |
| §12 | `NaN` opacity bug (`parseFloat(a) ?? 1`) | **P2** | `figma_plugin/handlers/nodeCreators.ts` |
| §13 | `insert_child` index-bounds guard | **P2** | `figma_plugin/handlers/nodeModifiers.ts` |
| §14 | Per-asset edit permissions (Variables/Styles) — permission-model change | **P1** | `main.ts`, `ui.html`, `connectHandlers.ts`, `channel.ts` |
| §15 | `text_set_style` schema↔handler contract repair (functional bug) | **P1** | `src/mcp_server/tools/text.ts`, `figma_plugin/handlers/textHandlers.ts` |
| §16 | `text_set_content` schema↔handler contract repair (production-breaking) | **P0** | `src/mcp_server/tools/text.ts`, `figma_plugin/handlers/textHandlers.ts`, `figma_plugin/src/main.ts` |
| §17 | `node_bind_variable` schema↔handler contract repair (production-breaking) | **P0** | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/variableHandlers.ts` |
| §18 | Strict tool inputs + `node_info` `fields`→`properties` rename (silent-failure hardening) | **P1** | `src/mcp_server/tools/index.ts`, `src/mcp_server/tools/node.ts`, docs |

A shared prerequisite helper is defined in §0.

---

## §0. Shared helpers (prerequisites)

Add to `figma_plugin/utils/nodeUtils.ts` (single source; import everywhere):

1. **`findLockedAncestor(node: BaseNode): BaseNode | null`** — returns the node itself or the nearest ancestor with `locked === true`, else `null`. Walks `node.parent` synchronously (cheap; depth is small). Used by §2.
2. **`findInstanceAncestor(node: BaseNode): InstanceNode | null`** — returns the nearest ancestor (excluding the node itself) of type `INSTANCE`, else `null`. Used by §4.
3. **`isAncestorOf(maybeAncestor: BaseNode, node: BaseNode): boolean`** — walks `node.parent` up; `true` if `maybeAncestor` is encountered. Used by §3.

These are pure tree walks over the synchronous `.parent` chain — no `await`, no `getNodeByIdAsync` per hop.

---

## §1. Scope-root self-destruction guard (P0)

**The risk.** `checkScopeAccessRef` returns `true` when the target node **is** the scope root, so a node that destroys or replaces the scope root passes validation. `node_delete` removes it; `node_flatten`, `node_ungroup`, and `create_component` **replace** it with a new node (new id). The instant the scope root's id no longer resolves, every subsequent command throws `SCOPE_DELETED` (`main.ts:90`) and the session is bricked until the user re-links the plugin. This is a self-inflicted denial of service from a single call.

**Current behavior.** No guard. `node_delete` (`main.ts:439-464`), `node_flatten` (`main.ts:311-315`), `node_ungroup` (`main.ts:305-309`), and `create_component` (`componentHandlers.ts:679-693` — moves the frame's children into a freshly created component, then `node.remove()`s the source frame and returns the new id) all permit the scope root as target.

**v2.2.0 change.** In the dispatcher, before invoking the handler for any **destructive or node-replacing** op, reject when the resolved target id `=== state.scopeRootId`:
- `node_delete` — for each item, if `item.nodeId === state.scopeRootId` throw.
- `node_flatten`, `node_ungroup`, `create_component` — if `params.nodeId === state.scopeRootId` throw. (`create_component` added from `critique.md §1`: it replaces the source frame with a new component node, invalidating the scope id exactly like flatten/ungroup. Its dispatch case already resolves `params.nodeId` for scope + name checks, so reuse that reference.)

**Error string:**
> `Operation Denied: This node is the current Editable Scope root; deleting/flattening/ungrouping/converting it would invalidate the scope for the rest of the session. Re-scope to a parent first, or ask the user to select a different Editable Scope.`

**Note.** This is *not* the same as the §4 instance guard or the §2 locked guard; it is specifically about preserving `state.scopeRootId` resolvability. Reparenting the scope root (`node_insert_child` with `childId === scopeRootId`) does **not** change its id and is therefore out of scope for §1.

---

## §2. Locked-layer hard block (P0)

**The risk.** `locked` is read into node info (`nodeFields.generated.ts`) but never checked on any write. The Plugin API bypasses the UI lock, so an LLM can move/restyle/delete a node the user deliberately locked.

**Current behavior.** No write path consults `locked`.

**v2.2.0 change (D2 — hard block).** Add a single guard in the dispatcher, applied uniformly to **every mutating command**, that rejects when `findLockedAncestor(target) !== null`. Implementation must cover both shapes of write command:
- **Single-target writes** (`node_transform`, `node_rename`, `node_set_fill`, `node_set_stroke`, `node_set_corner_radius`, `node_set_effects`, `node_set_auto_layout`, `node_bind_variable`, `node_apply_style`, `text_set_style`, `node_clone` *(source)*, `node_flatten`, `node_ungroup`, `instance_set_property`, `reaction_update`): check the resolved `params.nodeId`.
- **Batch writes** (`node_delete`, `text_set_content`, `annotation_set`, `node_group`, `instance_set_overrides`, `create_component_set`): check **each** target in the existing pre-validation loop, so a locked member aborts the whole batch with zero mutations (consistent with the v2.1.0 atomicity model).
- **Creation/reparenting** (`create_shape`, `create_frame`, `create_text`, `create_svg`, `create_instance`, `node_insert_child`): check the **parent** (`parentId`) — you cannot add a child to a locked container. For `node_insert_child` also check the child.

**Error string:**
> `Operation Denied: Node '${node.name}' (or one of its ancestors, '${lockedAncestor.name}') is locked. Unlock the layer in Figma, or ask the user to unlock it, before editing.`

**Decisions & boundaries.**
- **Reads are never blocked** (D5): `node_info`, `page_info`, `node_export_visual`, all `*_list`, `instance_get_overrides`, `reaction_list`, `annotation_list` ignore locks.
- **Placement.** Implement as a helper invoked from the dispatcher next to `checkScopeAccess`/`verifyNodeName`, **not** inside individual handlers — a per-handler sprinkle will drift as handlers are added. A single `assertNotLocked(node)` call site per command keeps it auditable.
- **Ordering.** Run the locked check **after** scope + name verification, so the agent gets the most specific actionable error (wrong-id beats locked).

---

## §3. Cyclic / self-parent hierarchy guard (P0)

**The risk.** `node_insert_child` reparents `childId` under `parentId` with only an existence + `'children' in parent` check (`nodeModifiers.ts:484-508`). Reparenting a node into its own descendant, or into itself, throws a raw Figma exception that surfaces as an ugly bubbled message.

> **Accuracy note (corrected from brainstorm):** `appendChild`/`insertChild` into a descendant **throws a catchable exception** ("Cannot append a node to itself or its descendant") — it does *not* fatally crash the sandbox. The value of this guard is a **structured, actionable error**, not crash prevention. The PAGE/DOCUMENT-hierarchy cases from the brainstorm are largely unreachable under the scope model (a scoped `parentId` is a scene node, so `DOCUMENT` can't be a parent); the realistically reachable cases are **cyclic** and **self-parent**, which this section prioritizes. The PAGE/DOCUMENT type-compat check is added as cheap belt-and-suspenders only.

**Current behavior.** `insertChild` (`nodeModifiers.ts:484`): no self/cyclic/type-compat guard.

**v2.2.0 change.** In `insertChild` (and/or the dispatcher), before the reparent:
1. **Self-parent:** if `parentId === childId` → throw.
2. **Cyclic:** if `isAncestorOf(child, parent)` (child is an ancestor of the target parent) → throw.
3. **Type compatibility (belt-and-suspenders):** reject `PAGE` as child of a non-`DOCUMENT`, and a non-`PAGE` as child of `DOCUMENT`.

**Error strings:**
> `Operation Denied: A node cannot be inserted into itself.`
> `Operation Denied: Cannot insert node '${child.name}' into '${parent.name}' — the parent is a descendant of the node (cyclic hierarchy).`

---

## §4. Structural edits inside component instances (P1)

**The risk.** Figma forbids deleting, reparenting, grouping/ungrouping, or appending children to nodes that live **inside an `INSTANCE`** (the only legal mutation is via overrides). LLMs hit this constantly. Today these ops pass scope/name validation and then throw a raw Figma error ("Cannot remove/append node because it is part of an instance").

**Current behavior.** No instance-interior check on `node_delete`, `node_insert_child` (child or parent inside instance), `node_group`, `node_ungroup`, or creation tools whose `parentId` is inside an instance.

**v2.2.0 change.** For **structural** ops, reject when `findInstanceAncestor(target) !== null`:
- `node_delete`: each target.
- `node_insert_child`: both `childId` and `parentId` (the parent being inside an instance blocks the append).
- `node_group`, `node_ungroup`: target(s).
- `create_shape` / `create_frame` / `create_text` / `create_svg` / `create_instance`: the resolved `parentId`.

Pure **property** edits on an instance's own exposed/overridable properties are **not** structural and remain allowed (`instance_set_property`, `instance_set_overrides`, fills/strokes/text content where Figma permits overrides).

**Error string:**
> `Operation Denied: Node '${node.name}' is inside a component instance ('${instanceAncestor.name}') and cannot be ${verb} directly. Edit the main component, or use instance overrides.`

> [!NOTE]
> **Boundary (D7 — resolves discussion item 5):** block **structural** edits only — child-list mutation (add/remove/reorder/reparent) and deletion. **Allow** property/override writes (`instance_set_property`, `instance_set_overrides`, and fills/text/visibility on overridable descendants) — let Figma's override rules be the final arbiter; anything it still refuses degrades to a normal handler error. Confirm the structural-op list against the live Plugin API during implementation, and add a test asserting an override write succeeds while a child delete inside the same instance is rejected.

---

## §5. Component property type validation (P1)

**The risk.** Component properties are strictly typed (`BOOLEAN`, `TEXT`, `VARIANT`, `INSTANCE_SWAP`). Passing `"true"` to a `BOOLEAN`, a boolean to a `TEXT`, or an unlisted string to a `VARIANT` throws a runtime exception or produces a broken/blank state.

**Current behavior.**
- `setComponentInstanceProperty` (`componentHandlers.ts:777`) resolves the qualified key but passes `value` straight to `setProperties`, catching only the throw.
- `manageComponentProperty` ADD/EDIT (`componentHandlers.ts:844`) accepts a raw `defaultValue`/`newDefaultValue` with no type check.

**v2.2.0 change.** Validate `value` against the resolved property's `type` **before** the API call, in **both** tools:
1. **`BOOLEAN`** — accept a real boolean; coerce `"true"`/`"false"` (case-insensitive) to boolean for ergonomics; reject anything else.
2. **`TEXT`** — require a string.
3. **`VARIANT`** — cross-reference against the allowed values from the parent `ComponentSetNode.variantGroupProperties`; on miss, throw listing the valid options. (Note: variant options come from the **component set**, not the instance.)
4. **`INSTANCE_SWAP`** (D10) — best-effort/advisory: validate the value resolves to a `COMPONENT` id or is a non-empty component key; reject a wrong-type reference (frame id, number, empty string), but pass plausible references through and let Figma arbitrate. Do **not** validate against the property's `preferredValues` (advisory in Figma — swaps outside it are often still legal). The error-playbook must note that a passed swap can still be refused by Figma.

**Node-type guard (`manageComponentProperty` only — added from Figma-doc cross-check).** `addComponentProperty`/`editComponentProperty` are invalid on a **variant member** — a `COMPONENT` whose parent is a `COMPONENT_SET`. The current guard (`componentHandlers.ts:865`) allows any `COMPONENT`/`COMPONENT_SET`, so targeting a variant member degrades to a wrapped raw throw instead of structured guidance. Reject up front when `node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET"`:
> `Operation Denied: '${node.name}' is a variant inside a component set; manage properties on the set ('${node.parent.name}'), not the individual variant.`

**Error string (example, VARIANT):**
> `Operation Denied: '${value}' is not a valid value for variant property '${propertyName}'. Valid values: ${options.join(', ')}.`

---

## §6. Name-verification consistency (P1)

The codebase's safety invariant is "every write verifies `nodeName` against the resolved node so a stale id can't hit the wrong node." Two write paths violate it.

### 6A. `reaction_update`
**Current behavior.** `main.ts:588-591` runs `checkScopeAccess` but **not** `verifyNodeName`. A stale id rewrites prototype reactions on the wrong node.
**Change.** Add `verifyNodeName(params.nodeId, params.nodeName)` to the dispatch case (and `nodeName` to the MCP schema in `src/mcp_server/tools/reaction.ts` if absent).

### 6B. `variable_delete` (D11)
**Current behavior.** `deleteVariables` (`variableHandlers.ts:473`) takes only ids — **no name field at all**. `style_delete`'s `styleName` is a *required* schema field (`style.ts:124`); its handler `!== undefined` guard (`styleHandlers.ts:210`) is only defensive. So required-name is the established precedent and `variable_delete` is the outlier: a destructive delete by raw ID with no tripwire (the consumer-scan guards in-use variables, but an unused-variable wrong-id delete is unguarded).
**Change (required name, both modes).** `variableIds` mode → require a parallel `variableNames: string[]` (same length); verify each by id, reject on mismatch. `collectionId` mode → require `collectionName`; verify it. Throw a `"… does not match name of …"` style error on mismatch. Update `src/mcp_server/tools/variable.ts` (schema) + `deleteVariables`. **Also tighten `style_delete`'s handler** to drop the dead `!== undefined` allowance so it matches `verifyNodeName`'s "block if name absent" (`main.ts:123`) — consistency only, no behavior change for valid calls.

> [!CAUTION]
> **Do not globally enable `figma.skipInvisibleInstanceChildren` for the consumer scan.** `deleteVariables` runs a full-document consumer scan (`findVariableConsumers`, `variableHandlers.ts:524`) to refuse deleting an in-use variable. That scan **must see hidden nodes** — a variable consumed only by an invisible node inside an instance would otherwise look unused and be deleted, corrupting hidden variant state. If the perf flag from `figma-documentation-check.md §3` is adopted for discovery reads, scope it narrowly and **exclude this scan** (and any other correctness-critical full-tree walk).

---

## §7. Remote library-asset guard (P1)

**The risk.** Plugins cannot modify remote (shared-library) assets; attempting to throws `"Cannot modify a remote style"` (and equivalents for variables / main components).

> **Accuracy note (corrected from brainstorm):** This guard does **not** apply to arbitrary scene nodes. In-file scene nodes are local, and **an instance of a remote component is fully editable** (move/resize/override). `remote === true` lives on **styles, variables, and main `COMPONENT`/`COMPONENT_SET` nodes**. A blanket "if node.remote, deny" would wrongly block instance edits — do not implement it that way.

**Current behavior.** `remote` is read for discovery (`getStyles`, `getComponents`, `getVariables`) but never guarded on write.

**v2.2.0 change.** Add a remote check to the asset-mutation paths only:
- `style_manage` (edit existing via `styleId`), `style_delete`: if the resolved style `.remote` → throw.
- `variable_manage` (`UPDATE_VARIABLE`), `variable_delete`: if the resolved variable (or collection) `.remote` → throw.
- `component_manage_property`, `component_delete_property`: if the resolved **main component** `.remote` → throw.
- **`instance_set_property` is NOT remote-gated (corrected per `critique.md §2`).** It writes a *local override* on the instance via `setProperties` (`componentHandlers.ts:777`) and never mutates the remote main-component definition; gating it would break the standard, legal workflow of overriding instances of shared-library components — and would contradict this section's own accuracy note ("an instance of a remote component is fully editable"). Only writes to the remote main-component *definition* (the two tools above) are blocked.

**Error string:**
> `Operation Denied: '${name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`

---

## §8. Auto-layout `FILL` sizing guard (P2)

**The risk.** Setting `layoutSizingHorizontal`/`Vertical = "FILL"` requires the **parent** to be an auto-layout frame (`layoutMode` `HORIZONTAL`/`VERTICAL`). On a child of a plain frame/group/page it throws.

**Current behavior.** `setAutoLayout` (`layoutHandlers.ts:115-127`) validates the enum value but not the parent's layout mode before assigning `FILL`.

**v2.2.0 change.** In `setAutoLayout`, when either sizing is `"FILL"`, verify the parent is auto-layout; else throw:
> `Operation Denied: Sizing 'FILL' requires the parent to be an Auto-Layout frame (layoutMode HORIZONTAL or VERTICAL). Parent '${parent.name}' has layoutMode '${parentMode}'.`

**Silent-drop on a non-auto-layout frame (added from Figma-doc cross-check).** `setAutoLayout` early-returns when `node.layoutMode === "NONE"` (`layoutHandlers.ts:74-82`), so a call that supplies sizing/padding/alignment **without** also setting `layoutMode` returns `{id,name,layoutMode}` with no error and **no effect** — a silent no-op of the same class as §9. Reject (or surface a `warnings` entry) when auto-layout-only properties are supplied but the frame is and remains `NONE`:
> `Operation Denied: '${node.name}' is not an Auto-Layout frame (layoutMode NONE); set layoutMode to HORIZONTAL or VERTICAL before configuring sizing/padding/alignment.`

> [!NOTE]
> **No separate `HUG` guard.** A `HUG`-context guard (the original `figma-documentation-check.md §2` proposal) was considered and **rejected as dead code**: the only reachable sizing path requires `layoutMode !== "NONE"` (the frame *is* auto-layout), where `HUG` on its own axis is always valid; the invalid `HUG` case (a non-`TEXT`, non-auto-layout *child*) is never set by this tool, which only sizes the frame itself. The real defect is the silent drop above, not a missing `HUG` check.

---

## §9. Silent no-op on auto-layout child transform (P2)

**The risk.** `transformNode` sets `node.x`/`node.y` unconditionally (`nodeModifiers.ts:33-39`). For a child of an auto-layout frame (without `layoutPositioning === "ABSOLUTE"`), Figma **silently ignores** position writes — the handler then returns the post-write coordinates and the agent believes the move succeeded. A silent no-op is worse than an error because the agent can't recover from it.

**v2.2.0 change (D8).** Before applying `x`/`y`, detect: parent is auto-layout **and** `node.layoutPositioning !== "ABSOLUTE"`. In that case **hard-reject** the positional change (x/y are *always* a no-op there) with guidance (set `layoutPositioning = "ABSOLUTE"`, reorder via `node_insert_child` index, or adjust spacing/padding). For **resize**, apply the axis Figma honors (FIXED) and return a `warnings: [...]` entry for any axis the parent controls (HUG/FILL) rather than rejecting the whole call.
> `Operation Denied: '${node.name}' is laid out by its Auto-Layout parent; its x/y are controlled by the layout and cannot be set directly. Use absolute positioning, reorder the child, or adjust parent spacing.`

**Resize resets the node's own sizing modes (added from Figma-doc cross-check).** `node.resize()` (`nodeModifiers.ts:51`) silently reverts the resized node's **own** `layoutSizingHorizontal`/`Vertical` (and the legacy `primaryAxisSizingMode`/`counterAxisSizingMode`) to `FIXED`. This is a second silent side-effect in the same handler, distinct from the layout-controlled-child case above — it hits the node being resized, not its children. When a resize changes a non-`FIXED` sizing axis, read it back and return a `warnings: [...]` entry (e.g. `"resize reset layoutSizingHorizontal from HUG to FIXED"`) so a later relayout doesn't surprise the agent. Do **not** block the resize.

---

## §10. Mixed-font loading in `text_set_style` (P2)

**The risk.** Figma requires **all** fonts in a `TextNode`'s ranges to be loaded before modifying *any* text/layout property — even alignment or size. `setTextStyle` (`textHandlers.ts:246-263`) explicitly punts on the mixed-font case ("hope for the best"), so styling a mixed-font node throws an unloaded-font error.

**v2.2.0 change (approach revised — see `figma-documentation-check.md §5`).** When `node.fontName === figma.mixed`, load every font present before writing. Use the **native** `node.getStyledTextSegments(['fontName'])` to enumerate the fonts across all ranges, then load them in parallel — do **not** reuse `buildLinearOrder` (`textUtils.ts:37`), which carries a live bug (`getRangeFontName(spacesRangeStart, spacesRangeStart[0])` indexes a number — `textUtils.ts:58-61`). Factor a `loadAllFontsForNode(node)` helper around the native call, and short-circuit the single-font case by loading `node.fontName` directly:

```ts
const fonts = node.fontName === figma.mixed
  ? uniqBy(node.getStyledTextSegments(['fontName']).map(s => s.fontName), f => `${f.family}::${f.style}`)
  : [node.fontName];
await Promise.all(fonts.map(f => figma.loadFontAsync(f)));
```

**Unloadable-font edge case (from `critique.md §6`).** If a range uses a now-unavailable family, `loadFontAsync` rejects — and Figma then refuses *any* text-property write on the node (`Cannot write to node with unloaded font`). A `try/catch` around the loads does **not** enable a partial restyle (the later property write still throws), so do not "skip the bad font and proceed." Use the catch only to convert the raw rejection into an actionable error (`'${node.name}' contains an unavailable font; replace it before restyling`). Dedup (the `uniqBy` above) is the only real perf lever; `loadFontAsync` over a handful of distinct families is cheap, so the parallel-load count is not a concern.

---

## §11. `create_component_set` duplicate-variant guard (P2)

**The risk.** `createComponentSet` (`componentHandlers.ts:708`) validates property-value **count** but not **uniqueness**. `figma.combineAsVariants` throws if two components resolve to the same `Prop=Val, …` name (duplicate variant combination), surfacing as a raw error.

**v2.2.0 change.** Before `combineAsVariants`, build each component's variant name and detect duplicates; throw listing the colliding combination(s):
> `Operation Denied: Duplicate variant combination '${combo}' across components ${names}. Each component in a set must have a unique property-value combination.`

---

## §12. `NaN` opacity bug (P2 — latent bug)

**The risk.** `createFrame` (`nodeCreators.ts:247`) and `createText` (`nodeCreators.ts:382`) compute `opacity: parseFloat(fillColor.a) ?? 1`. When `a` is `undefined`, `parseFloat(undefined)` → `NaN`, and `??` only catches `null`/`undefined`, **not `NaN`** — so opacity becomes `NaN`. (`createShape` at `nodeCreators.ts:128` uses the correct `fillColor.a ?? 1`.)

> This is the real color-handling gap. Brainstorm item #4 (0–255 auto-scaling) is **already covered** by Zod `.min(0).max(1)` on every RGBA channel (`src/mcp_server/tools/create.ts:24-34, 72-80`), so out-of-range values can't reach the plugin through the normal path; that item is at most defense-in-depth and is **dropped** from this release in favor of fixing the `NaN` bug.

**v2.2.0 change.** Normalize alpha handling to `typeof a === 'number' ? a : 1` (or guard `Number.isFinite`) across `createFrame`, `createText`, and audit `createShape`/`setFillColor`/`setStroke` for the same pattern.

---

## §13. `insert_child` index-bounds guard (P2)

**The risk.** `index` flows straight into `parent.insertChild(index, child)` (`nodeModifiers.ts:498`); `index > parent.children.length` throws "Index out of bounds".

**v2.2.0 change (D9).** Validate `index` against the inclusive range `0 … parent.children.length` (`=== length` = legal append-at-end). Throw a structured bounds error on `index < 0` or `index > length` — do **not** clamp; a present `index` is deliberate intent (append is expressed by omitting it), so an out-of-range value is a bug to surface, not reinterpret. Omitted `index` appends, unchanged.
> `Operation Denied: index ${index} is out of range for parent '${parent.name}' (valid: 0–${parent.children.length}). Omit 'index' to append.`

**Tool-description requirement.** Update `node_insert_child`'s description (`src/mcp_server/tools/node.ts:316`) to note that the output `index` reports the **actual** resolved position: when the child is already under the same parent, remove-then-insert shifts indices, so the post-insert position can differ from the requested number even when in range (not an error — verify against the returned `index`).

---

## §14. Per-asset edit permissions — Variables & Styles (P1) — resolves discussion item 2 / OQ2

**Decision (Rec 2B, refined).** Split the single `readOnly` gate into three independent permission axes — **nodes / variables / styles** — surfaced as two new plugin checkboxes, **both unchecked by default**:
- ☐ Allow AI Agent to modify Variables
- ☐ Allow AI Agent to modify Styles

Node-edit permission (the scope link) and asset-edit permissions are fully independent — neither implies the other.

### State model (replaces `state.readOnly`)
```js
const state = {
  serverPort: 3055,
  scopeRootId: null,        // enforcement anchor for node edits; null ⇒ no node edits
  allowEditNode: false,     // false | "page" | "node"  — breadth label; truthy ⇔ scopeRootId set
  allowEditVariable: false, // boolean — document-global, independent of scope
  allowEditStyle: false,    // boolean — document-global, independent of scope
};
```
- **`readOnly` is removed.** `allowEditNode === false` ⟺ `scopeRootId === null` (the old `readOnly === true`).
- `allowEditNode`'s `"page"`/`"node"` value is descriptive (breadth + connect-payload shape); enforcement stays via `scopeRootId` + `checkScopeAccess`. The value never changes gate *logic* — only its truthiness does.
- Connect-payload `editableScopeType` collapses to `state.allowEditNode || "readonly"`.

### Permission matrix (3 toggles → 8 combinations)

| # | Scope link | ☑ Variables | ☑ Styles | Nodes | Variables | Styles | Notes |
|---|---|---|---|---|---|---|---|
| 1 | none | ☐ | ☐ | RO | RO | RO | = today's read-only |
| 2 | none | ☐ | ☑ | RO | RO | RW | new |
| 3 | none | ☑ | ☐ | RO | RW | RO | new |
| 4 | none | ☑ | ☑ | RO | RW | RW | new — node-RO, full asset edit |
| 5 | link | ☐ | ☐ | RW(scope) | RO | RO | ⚠ behavior change |
| 6 | link | ☐ | ☑ | RW(scope) | RO | RW | new |
| 7 | link | ☑ | ☐ | RW(scope) | RW | RO | new |
| 8 | link | ☑ | ☑ | RW(scope) | RW | RW | = today's linked behavior |

> [!WARNING]
> **Default inverts for linked connections (row 5).** Today a scope link sets `readOnly=false`, which already permits variable/style edits. With both checkboxes defaulting off, a linked connection now blocks asset edits that work today. Intended tightening; flagged because it changes existing linked-session behavior. Zero end-users → safe.

### Gating changes (dispatcher, `figma_plugin/src/main.ts`)

| Site | Today | v2.2.0 |
|---|---|---|
| Node writes (~35 cases) | `if (state.readOnly)` → `READ_ONLY_MODE` | `if (!state.allowEditNode)` → `READ_ONLY_MODE` |
| `checkScopeAccess` early-out (`:81,:108`) | `if (state.readOnly) return false` | `if (!state.allowEditNode) return false` |
| `node_info` empty-args short-circuit (`:553`) | `&& state.readOnly` | `&& !state.allowEditNode` |
| `variable_manage` / `variable_delete` (`:598,:605`) | `if (state.readOnly)` | `if (!state.allowEditVariable)` → new `VARIABLE_EDITS_DISABLED` |
| `style_manage` / `style_delete` (`:609,:614`) | `if (state.readOnly)` | `if (!state.allowEditStyle)` → new `STYLE_EDITS_DISABLED` |
| `getConnectPayload` (`connectHandlers.ts:8`) | `if (state.readOnly === true)` | `if (!state.allowEditNode)` |

The §7 remote-asset guard still stacks on top — enabling a checkbox still cannot edit a *remote* variable/style.

### Node-vs-asset boundary (settled)
- **`node_bind_variable`, `node_apply_style` are NODE edits** — gated by `allowEditNode` + scope + name, **not** the asset flags. They reference an asset but mutate a *node*; the variable/style definition is untouched.
- **Binding a variable into a style** (`style_manage` `bindVariables`, `styleHandlers.ts:88`) requires **only `allowEditStyle`** — it's a style edit; the referenced variable isn't mutated, so `allowEditVariable` is not required.

### Checkbox timing — connect-time
Permissions are read at connect and sent in the `set-scope` message; the checkboxes are **disabled while connected** (like the port/scope inputs at `ui.html:391-392`). Changing a permission requires disconnect + reconnect — consistent with scope being locked at connection time.

### Connect handshake / payload
- `set-scope` (`main.ts:189`) sets all three fields. The UI includes `scopeNodeType` (already known from `scope-validation-result`, `main.ts:179`) so the handler sets `allowEditNode = scopeNodeType === "PAGE" ? "page" : "node"` with no extra lookup; the two booleans come from the checkboxes.
- `get_connect_payload` surfaces `{ allowEditNode, allowEditVariable, allowEditStyle }` in **every** shape so the agent knows its capabilities up front; `editableScopeType` becomes a derived alias. Reading `state.allowEditNode` also drops the handler's page-vs-node re-derivation (`connectHandlers.ts:34,62-79`).
- `channel_join` `outputSchema` (`channel.ts:18-27`) adds the three fields.

### UI (`figma_plugin/ui.html`)
Two checkboxes in the connection section (near scope-link, `:261-275`); add `allowEditVariable`/`allowEditStyle` to the UI `state` object (`:333`); include them + `scopeNodeType` in the `set-scope` post (`:714`); disable while connected (`:391-392`); reword the "Leave blank for Read-Only Mode" label (`:263`) — blank = *nodes* read-only, assets gated separately. (Also fix the stale `Version: 1.0.0`, `:317`.) Verify the UI height (`450`, `main.ts:156`) fits two checkboxes.

### New error codes (`main.ts` ERRORS)
- `VARIABLE_EDITS_DISABLED` — "Operation Denied: Variable editing is disabled. Ask the user to tick 'Allow AI Agent to modify Variables' in the Figma plugin and reconnect."
- `STYLE_EDITS_DISABLED` — analogous for styles.

### Tests
- Replace `state.readOnly` in tests (`atomicityAndValidation.test.ts:42,82`; `getNodesInfo.integration.test.ts:40-41,456-461`; `componentHandlers.test.ts:346`) with the new fields.
- Update any test asserting `variable_*`/`style_*` throw `READ_ONLY_MODE` → new flag errors (audit `handlers.test.ts`, `annotationsAndVariables.test.ts`). Component-property gating tests are unaffected (node writes).
- Connect-payload snapshots (`connectHandlers.test.ts:125+`) assert the three capability fields are surfaced.
- New: the 8-cell matrix; node writes still blocked when `allowEditNode === false` regardless of asset flags; remote guard still wins.

### Docs
`constraints.md §1` (three axes; reframe read-only as node-only), `error-playbook.md` (new codes; clarify `READ_ONLY_MODE` is node-only), `workflows.md`, `tool-selection.md`, the `figma-edit://guide/*` resources, `AGENTS.md`.

---

## §15. `text_set_style` schema↔handler contract repair (P1 — functional bug)

**The risk.** `text_set_style` silently fails to do its primary job. The MCP schema (`src/mcp_server/tools/text.ts:45-80`) sends `fontName: {family, style}` and `paragraphIndent`, and the dispatcher forwards `params` untransformed (`main.ts:406-410`), but the handler `setTextStyle` (`textHandlers.ts:206-209`) destructures `fontFamily`, `fontStyle`, `textAlignHorizontal`, `textAlignVertical`. Verified against the code:
- **`fontName` is silently dropped.** `fontFamily`/`fontStyle` are always `undefined`, so the `if (fontFamily || fontStyle)` branch (`textHandlers.ts:223`) never runs — the tool cannot change a font. The else-branch instead reloads the node's *current* font, so the call "succeeds" with no font change.
- **`paragraphIndent`** is accepted by the schema but never applied.
- **`textAlignHorizontal`/`textAlignVertical`** are applied by the handler but **absent from the schema**, so the agent cannot reach them.

A tool that reports success while discarding the requested edit is exactly the "silent corruption of intent" this release exists to eliminate; it also undermines §10, which builds on this handler's font-loading path.

**v2.2.0 change.** Reconcile schema and handler in one pass (do this alongside §10 — same file):
1. **Font.** Make the handler read `fontName.family`/`fontName.style` (preferred — matches `style_manage`'s typed `fontName`), *or* flatten the schema to `fontFamily`/`fontStyle`. Pick one and make schema + handler agree.
2. **`lineHeight` AUTO.** Replace the value-required `lineHeight` (`text.ts:56-62`) with the union already used in `style.ts:36-39`, so an individual node's line height can be reset to `{unit:"AUTO"}` (resolves `figma-documentation-check.md §1`).
3. **`textAlignHorizontal`/`textAlignVertical`.** Add to the schema (the handler already applies them).
4. **`paragraphIndent`.** Apply it in the handler (the schema already sends it).

No structured `"Operation Denied: …"` string is required — this is a contract repair, not a new guard — but the fix **must** include a regression test asserting a font change via `text_set_style` actually takes effect.

---

## §16. `text_set_content` schema↔handler contract repair (P0 — production-breaking)

**The risk.** `text_set_content` is **non-functional in production** today; only handler-shaped unit tests pass, masking it. Two independent schema↔handler drifts, both verified:
1. **Phantom top-level `nodeId`.** The MCP tool sends `{ text: [...] }` with **no** top-level `nodeId` (`text.ts:13-34`), but the handler `setMultipleTextContents` requires one (`textHandlers.ts:58-61`: `if (!nodeId || …) throw "Missing required parameters: nodeId and text array"`). A real MCP call throws **before** touching any item.
2. **Per-item `characters` vs `text`.** Schema items carry `characters` (`text.ts:19`); the handler reads `replacement.text` (`textHandlers.ts:101, 138`) — always `undefined`. Even past drift #1, the batch fails with `"Missing nodeId or text in replacement entry"`.

**Why CI is green.** The unit tests feed the handler's *internal* shape, not the schema shape — `{ nodeId: "scope-root", text: [{ nodeId, nodeName, text }] }` (`atomicityAndValidation.test.ts:98-104, 240-247`) — fabricating the phantom top-level `nodeId` and per-item `text` that production never produces. There is no end-to-end coverage through the Zod schema for this tool.

**v2.2.0 change.** Reconcile schema, handler, and tests on one contract — the fix **must** address **both** drifts:
1. **Field name.** Standardize on `characters` (Figma-native): in `setMultipleTextContents` read `replacement.characters` (currently `replacement.text` at `textHandlers.ts:101, 138`). The internal `setTextContent` (`textHandlers.ts:20-48`) may keep its `text` param — just pass `replacement.characters` into it.
2. **Drop the phantom top-level `nodeId` guard.** The per-item `nodeId`s are the real targets; the top-level `nodeId` requirement (`textHandlers.ts:61`) and the `nodeId:` echoes in the return payload are dead weight the schema never satisfies. Remove the requirement.
3. **Test the schema shape.** Add a test that drives `text_set_content` with the exact `{ text: [{ nodeId, nodeName, characters }] }` payload the MCP tool emits, so this drift can't recur silently.

No `"Operation Denied: …"` string — this is a contract repair, not a guard. (Note: the dispatch-level pre-validation loop at `main.ts:389-403` is correct and unaffected; the break is downstream in the handler.)

---

## §17. `node_bind_variable` schema↔handler contract repair (P0 — production-breaking)

**The risk.** `node_bind_variable` is **non-functional through the MCP path** today — every real call throws. Two independent defects in the same handler, both verified live during v2.2.0 verification (combo B):

1. **Schema↔handler shape drift.** The MCP schema (`src/mcp_server/tools/node.ts:622-633`) sends two **maps** — `bindVariables: { property → variableId|null }` and `explicitVariableModes: { collectionId → modeId }` — and forwards them untransformed (`node.ts:645`). The dispatcher (`main.ts:277-281`) runs gate/scope/name checks then calls `setBoundVariable(params)` with no transformation. But the handler `setBoundVariable` (`variableHandlers.ts:694`) destructured a **flat** `{ field, variableId, collectionId, modeId }` it never receives. So `field`/`collectionId` were always `undefined`, every call skipped both branches and hit the final `throw "Must provide either (field + variableId) or (collectionId + modeId)"`. **Both** capabilities — property binding *and* explicit-mode theming — were dead.
2. **Collection-id vs collection-node (explicit modes).** Once the maps are consumed, `node.setExplicitVariableModeForCollection(collectionId, modeId)` throws under dynamic-page mode: *"Cannot call setExplicitVariableModeForCollection with a collection id in incremental mode. Please pass the collection node instead."* This was latent in the original code too — masked because the handler was entirely unreachable.

**Why CI was green.** No functional test of `setBoundVariable` existed — the only reference (`v2Tools.test.ts:35`) merely asserts the tool is *registered*. Unlike §16 (handler-shaped tests masked the drift), here the path was simply untested end-to-end, so the break went unnoticed until live verification.

**v2.2.0 change.** Reconcile on the schema's **map** contract (chosen over flattening the schema — matches `style_manage`'s `bindVariables` map, and supports batch bindings + unbind in one call):
1. **`bindVariables`** — iterate `{ field → variableId|null }`; for `fills`/`strokes` bind via `setBoundVariableForPaint` per SOLID paint, else `node.setBoundVariable(field, variable)`; a `null` value **unbinds** (no variable lookup). Preserves all the original per-field logic.
2. **`explicitVariableModes`** — iterate `{ collectionId → modeId }`; **resolve each id via `getVariableCollectionByIdAsync` and pass the collection NODE** to `setExplicitVariableModeForCollection`; throw `"Collection … not found"` on an unresolved id.
3. Throw a clear `"Must provide bindVariables (property → variableId) or explicitVariableModes (collectionId → modeId)"` when neither map is present (replaces the stale flat-shape message).

No `"Operation Denied: …"` string — this is a contract repair, not a guard. The fix **must** include regression tests driving the exact MCP map shapes (added to `setBoundVariable` tests in `annotationsAndVariables.test.ts`) so neither drift can recur.

---

## §18. Strict tool inputs + `node_info` parameter naming (P1 — silent-failure hardening)

**The risk.** MCP tool inputs are validated with Zod's default object behavior, which **silently strips unknown keys**. An agent that sends a misremembered or extra parameter on *any* tool has that key dropped and the tool runs as if it were omitted — succeeding while discarding intent, with no error. Surfaced by a real agent hallucination: `node_info({ properties: [...] })` was sent when the input was named `fields`; Zod stripped `properties`, the handler saw no field selection, and the call "succeeded" returning nothing requested. Same "silent corruption of intent" class as §15/§16/§17, but at the **agent↔schema** boundary (not the schema↔handler seam), and it affects **every** tool.

**Two root causes, two fixes:**
1. **Silent strip (systemic).** Register every tool's input schema as **strict** (reject unknown keys) so a wrong key fails at the MCP boundary with `Unrecognized key(s): …` (and the schema the agent sees lists the valid keys). Applied centrally in `registerAllTools` (`src/mcp_server/tools/index.ts`) via a server-proxy wrapper, so it can't be forgotten per-tool or drift as tools are added. Confirmed the MCP SDK enforces it at runtime (`mcp.js validateToolInput` → `safeParseAsync`) and that `.strict()` survives the SDK's `normalizeObjectSchema` for zod 4.4.3.
2. **`node_info` naming trap.** The input was `fields` while the output key and internal payload were `properties` — the mismatch that *induced* the wrong key. **Unify on `properties`**: rename the input `fields → properties` (input now equals output equals internal payload; the `properties: fields` remap is dropped). Update docs/skill/`figma-edit://guide/*` resources accordingly.

**Tests.** `strictInput.test.ts` drives the SDK's real validation path and asserts: the `node_info` `properties` key is accepted, the stale `fields` key is rejected, and **all 46 tools** reject an unknown key. `contractSeam.test.ts` and `v2Tools.test.ts` updated for the rename + strict (the latter no longer relies on key-stripping).

No `"Operation Denied: …"` string — this is input-contract hardening. Zero end-users, so the breaking param rename and stricter rejection need no sign-off (informational).

---

## Provenance — corrections applied to the brainstorm

The three originally-proposed checks (locked layers, component property typing, hierarchy) are carried forward (§2, §5, §3). The "additional gaps" list was corrected:
- **Remote assets** — reframed to styles/variables/main-components only; a blanket scene-node remote block would wrongly reject editable instances (§7).
- **Color range (0–255)** — dropped; already enforced by Zod. Replaced by the real `NaN`-opacity bug (§12).
- **Cross-page grouping** — dropped; `node_group` already enforces same-parent (`main.ts:285-301`), and cross-page reparenting is legal in Figma.
- **"Crashes Figma"** framing — corrected to "throws catchable exceptions"; the win is structured errors (§3).
- **Auto-layout FILL** and **mixed-font loading** — carried forward as-is (§8, §10).

New checks added from the codebase pass: §1 (scope-root self-destruction), §4 (instance-interior structural edits), §6 (name-verification consistency), §9 (silent no-op transforms), §11 (duplicate variants), §13 (index bounds).

Added from the official Figma MCP cross-check (`figma-documentation-check.md`): §15 (`text_set_style` contract repair); the §8 silent-drop sub-case (and the explicit rejection of a separate `HUG` guard); the §9 resize-sizing-mode-reset warning; the §10 native `getStyledTextSegments` approach (replacing the buggy `buildLinearOrder`); the §5 variant-member guard; and the §6B `skipInvisibleInstanceChildren` caution.

Added from the implementation critique (`critique.md`): §16 (`text_set_content` contract repair — production-breaking); the §1 `create_component` self-destruction case; the §7 `instance_set_property` carve-out (overrides on instances of remote components remain allowed); and the §10 unloadable-font edge-case note. (The critique's schema-consistency items for `reaction_update`/`variable_delete` were already covered by §6A/§6B; its test-working-directory note is a contributor-docs concern, not a spec change.)

Added from **live verification** (combo-B boundary probe, not in the brainstorm/critique): §17 (`node_bind_variable` contract repair — production-breaking; both the map-shape drift and the latent collection-id-vs-node bug in explicit modes). Same class as §15/§16 but for `node_bind_variable`.

Added from a **live agent hallucination** during verification: §18 (strict tool inputs + `node_info` `fields`→`properties` rename). An agent passed `properties` (the output key) where the input was named `fields`; Zod silently stripped it. Generalizes to all tools (silent key-strip) and is fixed centrally.

---

## Edge cases & mitigations

1. **Locked check on batch tools** — must run per-item in the existing pre-validation loop so a single locked member aborts with **zero** mutations (don't short-circuit only the first item's mutation). (§2)
2. **Scope root inside an instance / locked** — guards compose; the most specific error should win. Order: scope → name → locked → instance/self-destruct.
3. **`findLockedAncestor` / `findInstanceAncestor` performance** — pure synchronous `.parent` walks, O(depth); negligible even for 50-node batch deletes (no extra `getNodeByIdAsync`).
4. **Instance-interior allow/block boundary** (§4) — resolved (D7): block child-list mutation + deletion; allow property/override writes.
5. **TOCTOU** — a node can be locked/unlocked or reparented by the user between validation and mutation. Consistent with v2.1.0: accept the residual race; handlers' `try/catch` reports it.

---

## Open questions & deferred decisions

All unresolved questions and build-time choices have moved to **`discussion.md`** (each with options, pros/cons, and a recommendation). Index:

| discussion.md | Topic | Tag |
| :- | :- | :- |
| 1 (OQ1) | MCP-side mirroring vs plugin-only enforcement | ✅ Resolved → §Decisions D3 |
| 2 (OQ2) | Scope lock & document-global variables/styles | ✅ Resolved → §Decisions D4 / §14 |
| 3 (OQ3) | Atomicity contract for the new guards | ✅ Resolved → §Decisions D6 |
| 4 (OQ4) | Read-path gating (locked / remote / scope) | ✅ Resolved → §Decisions D5 |
| 5 | Instance-interior allow/block boundary (§4) | ✅ Resolved → §Decisions D7 |
| 6 | Auto-layout child transform: reject vs warn (§9) | ✅ Resolved → §Decisions D8 |
| 7 | `insert_child` out-of-range index: clamp vs throw (§13) | ✅ Resolved → §Decisions D9 |
| 8 | `INSTANCE_SWAP` validation depth (§5) | ✅ Resolved → §Decisions D10 |
| 9 | `variable_delete` name-verification shape (§6B) | ✅ Resolved → §Decisions D11 |

Resolutions get promoted back into §Decisions as they land.

---

## Verification plan

### Automated
- **§1** Deleting/flattening/ungrouping/converting-to-component a node whose id `=== scopeRootId` is rejected; a non-root node in scope still succeeds.
- **§2** Each mutating command rejects a locked target and a locked-ancestor target, with zero mutation on batch tools; reads succeed on locked nodes; creation under a locked parent is rejected.
- **§3** Self-parent and cyclic reparent rejected with structured errors; legal reparent still works.
- **§4** `node_delete`/`node_insert_child`/`node_group` on an instance-interior node rejected; `instance_set_property` on the same instance still succeeds.
- **§5** Each property type validated; `"true"`→`BOOLEAN` coerces; bad `VARIANT` lists valid options; `INSTANCE_SWAP` rejects a wrong-type reference but passes a plausible component id/key through (advisory); managing a property on a variant member (a `COMPONENT` inside a `COMPONENT_SET`) is rejected with set-level guidance.
- **§6** `reaction_update` rejects on name mismatch; `variable_delete` requires names in both modes (per-id `variableNames`, or `collectionName`) and rejects on mismatch; `style_delete` still rejects on mismatch with the tightened (no-`undefined`) guard.
- **§7** Editing/deleting a remote style/variable/main-component *definition* (via `component_manage_property`/`component_delete_property`) rejected; `instance_set_property` on an instance of a remote component still succeeds (local override); editing a local instance of a remote component still succeeds.
- **§8** `FILL` under a non-auto-layout parent rejected; under auto-layout parent succeeds; supplying sizing/padding/alignment to a `NONE` frame without `layoutMode` is rejected (not silently dropped).
- **§9** Setting x/y on a layout-controlled auto-layout child is rejected (not silently dropped); a resize on a HUG/FILL axis returns a `warnings` entry while the FIXED axis applies; a resize that reverts a non-`FIXED` sizing mode to `FIXED` returns a `warnings` entry.
- **§10** `text_set_style` on a mixed-font node succeeds (all fonts loaded).
- **§11** Duplicate variant combination rejected with the colliding combo named.
- **§12** Creating a frame/text without alpha yields opacity `1`, never `NaN`.
- **§13** `insert_child` with an out-of-range `index` (`< 0` or `> children.length`) throws a structured bounds error; omitted `index` appends; the output `index` reports the actual resolved position.
- **§14** Permission matrix (8 cells) enforced: node writes blocked when `allowEditNode === false` regardless of asset flags; `variable_*` require `allowEditVariable`, `style_*` require `allowEditStyle`; remote guard still wins; `node_bind_variable`/`node_apply_style` follow node permission; binding a variable into a style needs only `allowEditStyle`; connect payload surfaces all three axes; checkboxes disabled while connected.
- **§15** A font change via `text_set_style` actually takes effect (regression test); `lineHeight {unit:"AUTO"}` is accepted; `textAlignHorizontal`/`textAlignVertical` are reachable through the schema; `paragraphIndent` is applied.
- **§16** `text_set_content` succeeds end-to-end through the MCP schema shape (`{ text: [{ nodeId, nodeName, characters }] }`) — no top-level `nodeId` required, per-item `characters` is written; the old handler-shaped test is updated to the schema shape so the drift cannot recur.
- **§17** `node_bind_variable` succeeds end-to-end through the MCP map shapes: `{ bindVariables: { fills: "VariableID:…" } }` binds (and `null` unbinds) a property; `{ explicitVariableModes: { collectionId: modeId } }` resolves the collection to a node and sets the mode; neither-map throws the new error; an unresolved variable/collection id throws.
- **§18** Every tool rejects an unknown input key with `Unrecognized key(s): …` (strict), driven through the SDK's validation path; `node_info` accepts `properties` and rejects the old `fields`; the prior strip-reliant `v2Tools` creation-tool test is updated to per-tool valid inputs.

### Manual (Figma sandbox)
1. Lock a frame; confirm every edit tool refuses it and names the locked ancestor.
2. Attempt to delete the scope root; confirm refusal and that the session remains usable.
3. Attempt to delete a node inside an instance; confirm the override-guidance error.
4. Rebuild `figma_plugin/code.js` (esbuild bundle) — **source-only edits don't take effect live**; ship the rebuilt bundle.

---

## Documentation & build

- Update agent guidance (`skills/figma-edit/references/constraints.md`, `error-playbook.md`) with the new `"Operation Denied: …"` strings and the locked/remote/instance-interior constraints. Keep the `figma-edit://guide/*` MCP resources in sync (single source).
- Bump `package.json` to `2.2.0` (D1) and update `CHANGELOG.md`.
- Rebuild and ship `figma_plugin/code.js`.
