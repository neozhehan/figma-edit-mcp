# v2.2.0 Safety Enhancement — Open Discussion Items

Companion to `prd.md`. Each item below is an unresolved decision: the question, the candidate approaches with pros/cons, and a recommendation. Items are tagged **[Blocking]** (must resolve before/while implementing the named section) or **[Philosophical]** (a design-direction call that can ship as-is and be revisited).

Resolved decisions (version → v2.2.0; locked layers → hard block) live in `prd.md §Decisions` and are **not** repeated here.

| # | Item | Tag | Affects |
| :- | :- | :- | :- |
| 1 | MCP-side mirroring vs plugin-only enforcement | ✅ Resolved → 1A | All guards |
| 2 | Scope lock & document-global variables/styles | ✅ Resolved → 2B (refined) | `variable_*`, `style_*` |
| 3 | Atomicity contract for the new guards | ✅ Resolved → 3A | §2, §4 batch paths |
| 4 | Read-path gating (locked / remote / scope) | ✅ Resolved → 4A | reads, `node_export_visual` |
| 5 | Instance-interior allow/block boundary | ✅ Resolved → 5A | §4 |
| 6 | Auto-layout child transform: reject vs warn | ✅ Resolved → 6A | §9 |
| 7 | `insert_child` out-of-range index: clamp vs throw | ✅ Resolved → 7B | §13 |
| 8 | `INSTANCE_SWAP` validation depth | ✅ Resolved → 8A | §5 |
| 9 | `variable_delete` name-verification shape | ✅ Resolved → 9B | §6B |

---

## 1. MCP-side mirroring vs plugin-only enforcement  [✅ Resolved → 1A] — OQ1

**Decision: Rec 1A — plugin-only enforcement; mirror nothing for v2.2.0.** Promoted to `prd.md` §Decisions D3.

**Question (for the record).** The new guards are plugin-side (un-bypassable). Should any be *also* surfaced as MCP-side Zod/pre-checks in `src/mcp_server/` so the agent gets a faster, clearer error before the WebSocket round-trip?

**Why 1A:**
- Single source of truth; no logic duplication that can drift; the plugin already returns structured `"Operation Denied: …"` strings the agent reads. Smallest surface for v2.2.0.
- Most guards (cyclic, locked, scope, existence, type, instance-interior, remote, FILL-parent) need **live document state** the MCP server doesn't have, so any mirror could only ever cover a stateless minority (self-parent, batch-size, cross-field rules).
- The transport saving is small in context: ~sub-ms (MCP-caught) vs ~10–50 ms idle — or up to seconds when queued behind the plugin's serialized command queue — but either is dwarfed by the agent's own multi-second re-planning turn, so "fail-fast" buys little wall-clock.
- **Accepted cost:** a stateless mistake still costs one full round-trip.

**Revisit trigger.** Only if telemetry shows one stateless mistake (e.g. self-parent, duplicate variant combos) dominating agent retries — then mirror *just that check* via Zod `.refine()`, never the stateful guards. Existing Zod range/enum validation (color `0–1`, layout enums) stays as-is. Policy: "enforcement plugin-side, ergonomics opt-in later" — a contributor should not 'helpfully' duplicate validators.

---

## 2. Scope lock & document-global variables/styles  [✅ Resolved → 2B, refined] — OQ2

**Decision: Rec 2B — gate document-global asset edits behind explicit permission, refined into two per-asset checkboxes.** Promoted to `prd.md` §Decisions D4 + full spec in §14.

**Question (for the record).** `variable_manage` / `variable_delete` / `style_manage` / `style_delete` checked only `readOnly`, never scope (`main.ts:598-616`). A session "locked" to a single frame could still create or delete **any** document variable or style. Should the lock constrain globals?

**Chosen — Rec 2B, refined into two checkboxes.** Rather than one coarse "allow globals" flag, split into **"Allow AI Agent to modify Variables"** and **"Allow AI Agent to modify Styles"** — both unchecked by default, decoupled from node-edit scope. This satisfies 2B (asset edits are an explicit opt-in grant) *and* unlocks the inverse the user wanted: a node-read-only connection that still permits asset edits (matrix rows 2–4). The single `readOnly` flag becomes three axes (`allowEditNode` / `allowEditVariable` / `allowEditStyle`).

**Why not the alternatives:**
- **2A (keep un-scoped, document only):** rejected — the user wants asset editing to be an explicit, revocable grant, not always-on whenever a node scope is set.
- **2C (restrict to in-scope consumers):** rejected — variables/styles are document-global with no positional "in scope" subset; a subtree consumer-scan on every write is expensive and breaks creating brand-new assets (which have no consumers yet).

**Sub-decisions settled (folded into §14):**
- **State model:** `allowEditNode: false|"page"|"node"` + `allowEditVariable`/`allowEditStyle` booleans + `scopeRootId`; `readOnly` removed (naming variant A — `allowEditNode` carries breadth).
- **Timing:** read at connect; checkboxes disabled while connected; change = reconnect.
- **`node_bind_variable` / `node_apply_style`:** stay **node** edits (gated by `allowEditNode` + scope), not the asset flags.
- **Variable-in-style binding:** requires only `allowEditStyle`.
- **Behavior change:** a linked connection no longer implies asset-edit permission (default off) — matrix row 5.

---

## 3. Atomicity contract for the new guards  [✅ Resolved → 3A] — OQ3

**Decision: Rec 3A — new guards run in the existing dispatch-level pre-validation loop (pre-validate → zero-mutation abort; never mutation-phase).** Promoted to `prd.md` §Decisions D6.

**Question (for the record).** v2.1.0 settled on "pre-validate the whole batch → fail with zero mutations; otherwise stop-and-report; never auto-rollback" (`documentation/v2.1.0/plan.md §3`). Do the new locked (§2) and instance-interior (§4) guards run in that pre-validation loop, so a single bad member aborts the batch before any mutation?

**Why 3A:**
- Inherits the proven v2.1.0 model; a locked/instance member aborts the batch with zero mutations.
- One validation pass, no second divergent path; reuses the resolved-node reference the loop already holds (the O(N) optimization from v2.1.0 §3).
- These are synchronous ancestor walks — cheap to fold into the existing loop.

**Boundary.** New guards are pre-validation, not mutation-phase. `node_delete` keeps its documented "validation-atomic, not mutation-atomic, resilient parallel chunks" exception — the locked/scope-root checks still run in its pre-validation loop, so it never *starts* deleting a locked or scope-root node.

---

## 4. Read-path gating (locked / remote / scope)  [✅ Resolved → 4A] — OQ4

**Decision: Rec 4A — guards apply to writes only; reads, `view_navigate`, and export are never gated by lock, remote, or scope/permission.** Promoted to `prd.md` §Decisions D5.

**Question (for the record).** Are reads exempt from the locked/remote guards — and should any read be *scope*-gated? `node_export_visual` today has no scope/read-only check (`main.ts:568`): it can render any node in the document.

**Why 4A:**
- Locks/remoteness are *write* constraints — blocking reads on them is nonsensical (you must read a locked node to learn it's locked).
- Un-scoped reads match the model where discovery (`node_info`, `page_info`, `*_list`) must see the whole document to be useful; `view_navigate` is already deliberately un-scope-gated (v2.1.0 §1.E). Export-anywhere is consistent with read-anywhere.
- **Accepted residual:** `node_export_visual` can render an off-scope node to an image (a mild data-surface concern). Low risk — the agent already has full read access via `node_info`.

**Revisit trigger.** If off-scope export is ever deemed a real exfiltration risk, address read-scoping **holistically** (gate all reads consistently), never by singling out export — gating export while `node_info` leaks more would be security theater.

---

## 5. Instance-interior allow/block boundary  [✅ Resolved → 5A] — §4

**Decision: Rec 5A — block child-list mutation + deletion only; allow all property/override writes.** Promoted to `prd.md` §Decisions D7 + §4.

**Question (for the record).** §4 blocks *structural* edits inside an `INSTANCE` but allows *override* edits. Where exactly is the line? Figma permits more than `setProperties` (text content, visibility, fills on overridable children) but forbids child-list mutation and deletion.

**Chosen — Rec 5A:**
- **Block:** `node_delete`, `node_insert_child`, `node_group`, `node_ungroup`, and creation whose `parentId` is instance-interior.
- **Allow:** `instance_set_property`, `instance_set_overrides`, and property writes (`node_set_fill`, `text_set_content`, etc.) on overridable descendants — let Figma's own override rules be the final arbiter (the handler `try/catch` reports anything Figma still refuses).
- **Why:** matches the actual API constraint (structure locked, properties overridable); doesn't over-block override workflows, which are a primary use case; the residual "Figma refused this specific override" case degrades to a normal handler error.
- **Accepted limitation:** the allow-list isn't a hard guarantee — some writes on non-overridable fields still throw from Figma; the guard doesn't pre-empt those.

**Why not the alternatives:**
- **5B (block all instance-interior writes):** rejected — breaks override editing, the single most common reason to touch an instance interior. Far too aggressive.
- **5C (enumerate exact allowed field set per node type):** rejected — large, brittle mapping that must track Figma API changes; high effort for marginal gain over 5A.

**Implementation note:** confirm the structural-op list against the live Plugin API; add a test asserting an override write succeeds while a child delete inside the same instance is rejected.

---

## 6. Auto-layout child transform: reject vs warn  [✅ Resolved → 6A] — §9

**Decision: Rec 6A — hard-reject x/y on a layout-positioned child; warn-and-partial-apply on resize.** Promoted to `prd.md` §Decisions D8 + §9.

**Question (for the record).** Setting x/y (and resizing layout-controlled axes) on an auto-layout child is silently ignored by Figma. §9 wants to stop the silent no-op — but reject, or apply-what-works and warn?

**Chosen — Rec 6A:**
- **x/y:** hard-reject with guidance (use `layoutPositioning: "ABSOLUTE"`, reorder via index, or adjust spacing) — position is fully layout-owned, so the write is *always* a no-op.
- **resize:** Figma honors resize on FIXED axes and ignores it on HUG/FILL axes; apply the honored axis and return a `warnings: [...]` entry for the ignored one (don't reject the whole call).
- **Why:** eliminates the dangerous *silent* success while preserving the parts Figma actually applies; precise per-axis behavior matching the platform.
- **Accepted cost:** per-axis logic is more code than a blanket rule — needs parent `layoutMode` + child `layoutSizingHorizontal/Vertical` + `layoutPositioning`.

**Why not the alternatives:**
- **6B (reject any x/y/resize unless ABSOLUTE):** rejected — over-blocks FIXED-axis resizes Figma *would* honor; forces agents into absolute positioning they may not want.
- **6C (always apply, just return a `warnings` array):** rejected — agents frequently ignore non-error fields, so the silent-success problem persists in practice.

---

## 7. `insert_child` out-of-range index: clamp vs throw  [✅ Resolved → 7B] — §13

**Decision: Rec 7B — throw a clear bounds error.** Promoted to `prd.md` §Decisions D9 + §13. *(Reverses the original 7A lean — see rationale.)*

**Question (for the record).** `index > parent.children.length` throws a raw "Index out of bounds". Clamp to a valid position, or reject with a structured error?

**Chosen — Rec 7B:**
- An omitted `index` already expresses "append"; a *present* `index` is a deliberate, computed target. Silently clamping it would hide exactly the off-by-one / stale-child-count bug this release exists to surface — passing an index signals explicit intent, not a default.
- Validate against `0 … parent.children.length` **inclusive** (`=== length` is the legal append-at-end position). Throw when `index < 0` or `index > length`, naming the valid bound. Omitted `index` still appends.
- **Tool-description requirement:** `node_insert_child`'s description must note that the output `index` reports the *actual* resolved position — when the child is already under the same parent, remove-then-insert shifts indices, so the post-insert position can differ from the requested number even when in range (not an error; the agent verifies against the returned `index`).

**Why not 7A (clamp):** rejected — clamping reinterprets a deliberate, computed index as "append," masking the agent's mistaken assumption. The common "append" case is already served by omitting `index`, so clamping only buys tolerance for genuine errors we'd rather surface.

---

## 8. `INSTANCE_SWAP` validation depth  [✅ Resolved → 8A] — §5

**Decision: Rec 8A — shape/resolve check only, advisory.** Promoted to `prd.md` §Decisions D10 + §5.

**Question (for the record).** For an `INSTANCE_SWAP` property value, how hard do we validate that the value is a usable component reference, given we can't fully verify it client-side?

**Chosen — Rec 8A:**
- Verify the value resolves to a `COMPONENT` node id (via `getNodeByIdAsync`) or is a non-empty component key string; reject a wrong-type reference; otherwise pass through and let Figma arbitrate.
- **Why:** catches the obvious mistakes (frame id, number, empty string) cheaply without pretending to a guarantee it can't make.
- **Accepted limitation:** a syntactically-valid but contextually-invalid swap (component not among the property's `preferredValues`) still fails at the API; the guard doesn't pre-empt it. Document in the error-playbook that a passed swap can still be refused by Figma.

**Why not the alternatives:**
- **8B (full validation against `preferredValues`):** rejected — `preferredValues` is advisory in Figma (swaps outside it are often still legal), so this would *over*-reject valid swaps; high complexity.
- **8C (no validation, pass straight through):** rejected — loses the cheap, high-value type check (wrong-id/empty-string) and is inconsistent with the BOOLEAN/TEXT/VARIANT rigor in §5.

---

## 9. `variable_delete` name-verification shape  [✅ Resolved → 9B] — §6B

**Decision: Rec 9B — required name verification for both modes.** Promoted to `prd.md` §Decisions D11 + §6B. *(Reverses the original 9A lean, which rested on a misread of `style_delete`.)*

**Premise correction.** 9A assumed `style_delete`'s `styleName` is *optional*. It is not — `styleName: z.string()` is a **required** schema field (`style.ts:124`); the handler's `!== undefined` guard (`styleHandlers.ts:210`) is just defensive belt-and-suspenders. So `style_delete` already requires names, the consistent precedent is **required**, and the real outlier is `variable_delete`, which has *no* name field at all — a destructive delete by raw ID with no tripwire.

**Question (for the record).** `variable_delete` deletes by **either** `variableIds[]` **or** `collectionId`. What names do we confirm, required or optional?

**Chosen — Rec 9B (required, mode-appropriate granularity):**
- **`variableIds` mode** → require a parallel `variableNames: string[]` (same length); verify each by id, reject on any mismatch — mirrors `style_delete`'s `styleId`+`styleName` pair.
- **`collectionId` mode** → require `collectionName`; verify it (individual variables aren't named by the agent in a cascade delete, so the collection name is the right granularity).
- **`style_delete` handler tightening (sub-item):** drop the now-dead `!== undefined` allowance so it matches `verifyNodeName`'s "block if name absent" (`main.ts:123`) — consistency only, no behavior change for valid calls.
- **Why:** the agent already has the names from `variable_list` (as it has node names from `node_info`), so requiring them costs nothing and closes a destructive wrong-ID hole; conforms to the constraints.md §2 invariant.

**Why not the alternatives:**
- **9A (optional-but-verified):** rejected — rested on the misread that `style_delete` is lenient; making names optional reintroduces the no-tripwire hole on a destructive tool.
- **9C (collection-name in collection-mode, per-id names in id-mode):** 9B adopts exactly this per-mode granularity, but **required** rather than optional — so 9C is subsumed, not a separate option.

---

## Suggested resolution order

1. **All [Blocking] items resolved** — 3 → 3A, 5 → 5A, 6 → 6A, 7 → 7B, 8 → 8A, 9 → 9B. Handler implementation is unblocked.
2. **All [Philosophical] items resolved** — 1 → 1A, 2 → 2B, 4 → 4A. No remaining policy calls.
3. Fold each resolution back into `prd.md` (promote from Open Questions to Decisions).
