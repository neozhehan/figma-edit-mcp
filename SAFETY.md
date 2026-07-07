# Safety Manual — `figma-edit-mcp` (v2.3.2)

> **What this is.** A *safety manual* for the project: it states the **safety guarantees** the system makes, the **assumptions** under which those guarantees hold, the **residual risks** it does not cover, and the **controls** (cross-cutting invariants + a per-tool gate matrix) that implement them. The framing is borrowed — informally — from functional-safety *safety manuals* (IEC 61508 / ISO 26262), whose job is to state a component's guarantees **and the conditions of safe use**. It is adapted to an MCP server and is **not** a certification artifact.
>
> **What this is *not*.** It is **not** a `SECURITY.md` vulnerability-disclosure policy — there is no reporting process, supported-versions table, or security contact here. This documents what the software *enforces*, not how to report a flaw.
>
> **Audience.** Contributors changing the enforcement code; host / integrator authors wiring the plugin into an agent; and auditors or agents reasoning about which edits are possible.
>
> **Applies to: v2.3.2** (the Conformance & Atomicity Hardening release). It describes the enforcement state **as of that release** — the v2.1.0/v2.2.0/v2.3.0/v2.3.1 scope-lock and name-verification model plus Phase 1 dispatcher guard parity, Phase 2 component set atomicity, and Phase 3 parent-first creation and cleanup. Bare `§N` references point into the [v2.2.0 PRD](documentation/completed/v2.2.0-safety-enhancement/prd.md), where those structural guards were specified; sections tagged `v2.3.0 §N` / `v2.3.1 §N` / `v2.3.2 §N` point into their own release PRDs.
>
> **Ground truth.** The enforcement lives in three places, in this order of authority:
> 1. The plugin dispatcher [`figma_plugin/src/main.ts`](figma_plugin/src/main.ts) — the per-command gate stack; the only layer an agent cannot bypass.
> 2. The handlers under [`figma_plugin/handlers/`](figma_plugin/handlers/) — type/range/structural checks performed during execution.
> 3. The MCP input schemas under [`src/mcp_server/tools/`](src/mcp_server/tools/) — Zod shape/enum/range validation, before the WebSocket round-trip.
>
> If this document and the code disagree, **the code is correct and this document is stale** — fix the doc.

---

## Safety goal & trust model

The system exists to prevent an LLM agent from making **unsafe or unintended edits to a live, user-owned Figma document**. The agent is **untrusted with respect to edit safety**: it may hold a stale node ID, hallucinate a name, or misjudge whether an edit is wanted.

The **Figma plugin is the trust boundary.** It holds the user-granted scope and permissions and refuses anything outside them — returning a structured `"Operation Denied: …"` error rather than relying on the agent's judgement. The MCP server and the agent's host are **not** trust boundaries (see Assumption AS1). Because the plugin cannot trust the agent's judgement about whether an edit is safe, it enforces *mechanical, checkable* properties (where, which node, what type, what protection) and leaves *intent* to the user (see Residual Risk R2).

---

## Safety guarantees

The system guarantees, subject to the Assumptions below, that:

| # | Guarantee | Implemented by |
|---|---|---|
| **G1** | **Bounded write surface** — no node write outside the user-selected scope subtree; no node writes at all without a scope link. | A2 |
| **G2** | **Right-node assurance** — no write proceeds unless the caller-supplied name matches the resolved node's actual name (every write tool, including `reaction_update` and `variable_delete`). | A3 |
| **G3** | **Explicit placement** — no node is created without an explicit, resolved parent. | A4 |
| **G4** | **All-or-nothing batches** — a batch containing any invalid member mutates nothing. | A5 |
| **G5** | **Reads cannot mutate** — discovery/navigation never change the document and are never blocked. | A6 |
| **G6** | **Self-preservation** — the session's scope anchor cannot be destroyed or replaced by an edit (`node_delete`/`node_flatten`/`node_ungroup`/`create_component`). | A9 · §1 |
| **G7** | **Respect explicit protection** — locked nodes, remote (shared-library) assets, and the interiors of component instances are not edited around. | A9 · §2/§4/§7 |
| **G8** | **Least authority for assets** — document-global variable and style edits each require an explicit, separate opt-in, independent of node-edit permission. | A2 · §14 |

---

## Assumptions & conditions of safe use

Each guarantee holds **only while these conditions hold**. Violating one voids the corresponding guarantee — this is the heart of the safety-manual contract.

- **AS1 — The plugin is the sole write path.** Guarantees assume every edit flows through this plugin's dispatcher. A second plugin, manual editing, the REST API, or a host that bypasses the plugin is outside this manual's scope (see R4).
- **AS2 — The user sets scope and permissions truthfully.** The breadth of G1/G8 is exactly what the user links and ticks at connect time. The system enforces the granted scope; it cannot distinguish a wise scope from an unwise one.
- **AS3 — Names are passed back verbatim.** G2 depends on the agent reading names from `node_info`/`page_info` and not normalizing, translating, or "cleaning up" them. The plugin can verify a name but cannot reconstruct intent from a wrong one.
- **AS4 — The user locks what must be structurally protected.** G7's locked-layer guard protects only nodes the user actually locked; it does not infer importance.
- **AS5 — Connect-time binding is acceptable.** Scope and the three permission axes are read once at connect and fixed for the session; changing any of them requires reconnect. Mid-session changes of intent are not tracked.
- **AS6 — Schema validation is not relied upon for safety.** The MCP Zod layer is input hygiene, not a control; every safety-relevant check is owned plugin-side (PRD **D3**). A client that talks to the plugin directly, bypassing Zod, still hits every guarantee.

---

## Residual risks & known limitations

Explicitly **not** guaranteed — accepted trade-offs a safe integration must account for:

- **R1 — TOCTOU race.** A node may be locked/unlocked, reparented, or deleted by the user between validation and mutation; guards do not hold a lock across that gap. The handler's `try/catch` reports whatever Figma then throws. *(A8.)*
- **R2 — In-scope *wrong* edits.** The system bounds *where* and *which node (by name/type/protection)* — not whether an in-scope, name-matched, unprotected edit is *what the user actually wanted*. A confidently-wrong-but-valid edit is not prevented.
- **R3 — Off-scope visual export.** `node_export_visual` can render a node outside scope (read-surface only; low risk, since `node_info` already exposes full reads). *(A6 / PRD D5.)*
- **R4 — No protection against the host.** A malicious or buggy *host* that bypasses the plugin (violating AS1) is out of scope for this manual.
- **R5 — Advisory validations are not exhaustive.** Some checks deliberately defer final arbitration to Figma: `INSTANCE_SWAP` values are shape-checked only (§5/D10), and instance-interior *override* writes are permitted with Figma as the final arbiter (§4/D7). A structurally-valid call that Figma still refuses degrades to a normal handler error rather than a pre-emptive `"Operation Denied"`.

> Limitations present in earlier releases are now **closed** and have moved into the guarantees: document-global asset reach from a node-scoped session is gated by the permission axes (G8 / §14, v2.2.0), remote-library-asset edits are blocked by a structured pre-check (G7 / §7, v2.2.0), and the scope-root clone escape under G1 is closed by the `node_clone` destination-parent scope check (v2.3.2 — cloning the scope root is now denied).

---

## Operator / integrator responsibilities

To keep the guarantees valid, the human and host must:

- Connect with a Page/Layer link scoped to the **narrowest** region the task needs; leave it blank for a node-read-only session.
- Tick **"Allow AI Agent to modify Variables"** / **"Allow AI Agent to modify Styles"** only when the task genuinely needs document-global asset edits (both default **off**).
- **Lock** layers that must be structurally protected *before* connecting (AS4).
- Ensure the agent reads names from `node_info`/`page_info` and passes them back unchanged (AS3).
- Treat `"Operation Denied: …"` as a **stop** signal, not a retry prompt — adjust the target/scope/permission or reconnect; never attempt a workaround.

---

## Part A — Safety guarantees in detail (the enforced invariants)

These cross-cutting invariants are the mechanisms behind the G-claims. Part B says which apply to each tool.

### A1. Enforcement is plugin-side; the agent cannot bypass it
All access control runs **inside the Figma plugin** at execution time and returns a structured `"Operation Denied: …"` error. The MCP server's Zod schemas validate *shape* (types, enums, numeric ranges) but are **not** a security boundary — they exist for ergonomics and fail-fast input errors (AS6). Per PRD **D3**, the v2.2.0 guards are plugin-only, not mirrored MCP-side.

### A2. The permission / scope model → G1, G8
Connection state carries four fields, set **at connect time** and **locked for the session** (changing any requires disconnect + reconnect — AS5):

```
scopeRootId       // enforcement anchor for node edits; null ⇒ no node edits
allowEditNode     // false | "page" | "node"  — truthy ⇔ scopeRootId set
allowEditVariable // boolean — document-global, independent of scope
allowEditStyle    // boolean — document-global, independent of scope
```

The three permission axes are **independent** — none implies another:

| Axis | Granted by | Gate | Failure |
|---|---|---|---|
| **Node edits** | a Page/Layer scope link | `allowEditNode` set **and** target within `scopeRootId` | `READ_ONLY_MODE` (node-only) / `OUTSIDE_SCOPE` |
| **Variable edits** | "Allow … Variables" checkbox | `allowEditVariable` | `VARIABLE_EDITS_DISABLED` |
| **Style edits** | "Allow … Styles" checkbox | `allowEditStyle` | `STYLE_EDITS_DISABLED` |

- **Scope is an ancestor check.** A node-write target must be the scope root or a descendant (`checkScopeAccess`/`checkScopeAccessRef`). Creation checks the **parent**; reparent checks **both** parent and child. Scope cannot be widened programmatically.
- **Both asset checkboxes default off** — the safe default is "node edits within scope only." A linked session can no longer edit variables/styles unless explicitly granted (intended tightening vs. pre-v2.2.0).
- `node_bind_variable` / `node_apply_style` are **node** edits (gated by `allowEditNode` + scope + name), not asset edits — they reference an asset but mutate a node. Binding a variable *into a style* (`style_manage`) needs only `allowEditStyle`.
- `get_connect_payload` surfaces `{ allowEditNode, allowEditVariable, allowEditStyle }` so the agent knows its capabilities up front. (Full 8-combination matrix: PRD §14.)

### A3. Every write verifies the resolved name → G2
Every modify tool requires a `nodeName`; every create tool a `parentNodeName`; batch tools a name **per item**. The plugin resolves the node by ID and rejects on mismatch (`verifyNodeName`; absent name ⇒ rejected). This catches stale/fabricated IDs. Names must be passed back **verbatim** (AS3). As of v2.2.0 this is universal — `reaction_update` (§6A) and `variable_delete` (§6B, both id and collection modes) now verify names, and `style_delete`'s guard matches the strict rule.

### A4. Creation requires an explicit parent → G3
No "current page" fallback. `create_shape`/`create_frame`/`create_text`/`create_svg`/`create_instance` require a resolvable `parentId` + `parentNodeName`.

### A5. Batch atomicity (pre-validate → zero-mutation abort) → G4
Batch tools validate **every** item (existence, scope, name, type, **locked**, **instance-interior**, **scope-root**) **before** any mutation. A single bad member aborts the whole batch with **zero mutations**. Once mutation begins, handlers process sequentially, stop on first failure, and return a completed-vs-failed report — **no general transaction layer is promised**. Residual TOCTOU placement failures are reported without auto-rollback. (`text_set_content`, `annotation_set`, `instance_set_overrides`, `create_component_set`, `node_delete`.)
- **Exception:** `node_delete` (`deleteMultipleNodes`) runs resilient parallel chunks and is excluded from stop-on-first-failure — but its **pre-validation** still runs, so it never *starts* on an invalid target.
- The v2.2.0 scope-root / locked / instance-interior guards run inside this same pre-validation loop (PRD **D6**), reusing the resolved-node reference.

### A6. Reads are never gated → G5
Discovery and navigation ignore the node/variable/style permission axes, scope, and locks: `node_info`, `page_info`, all `*_list`, `instance_get_overrides`, `reaction_list`, `annotation_list`, `view_navigate`, and `node_export_visual` (PRD **D5**). Accepted residual R3: `node_export_visual` can render an off-scope node.

### A7. Node-ID normalization
Figma-URL IDs use dashes (`20485-41`); the API expects colons (`20485:41`). The MCP server converts before forwarding; pass URL-format IDs through unchanged.

### A8. TOCTOU is an accepted residual → R1
A node can be locked/unlocked, reparented, or deleted by the user between validation and mutation. Guards do not hold a lock across the gap; the handler's `try/catch` reports whatever Figma throws.

### A9. Structural-integrity guards (cross-cutting) → G6, G7
Four families of plugin-side guard, each returning `"Operation Denied: …"`:
- **Scope-root preservation (§1):** refuse to delete/flatten/ungroup/convert the node that *is* `scopeRootId` — it would brick the session with `SCOPE_DELETED`. Covers `node_delete`, `node_flatten`, `node_ungroup`, and `create_component` (which replaces the source frame with a new component id). → **G6**
- **Locked-layer block (§2):** refuse any write whose target — or any ancestor — is `locked` (`findLockedAncestor`). Single-target writes check the target; batch writes check each item; creation/reparent check the parent (and, for reparent, the child). → **G7**
- **Instance-interior block (§4):** refuse *structural* edits — delete, reparent, group/ungroup, create-under — inside an `INSTANCE` (`findInstanceAncestor`), or when the parent node is an `INSTANCE` itself. Property/override writes remain allowed, with Figma as final arbiter (R5). → **G7**
- **Remote-asset block (§7):** refuse edits to remote (shared-library) **styles, variables, and main components** (`.remote`). Instances of remote components stay fully editable (local overrides), so `instance_set_property` is **not** remote-gated. → **G7**

---

## Part B — Controls: per-tool enforcement matrix

Gate order in the dispatcher (most-specific error wins): **permission → scope → name → locked → instance-interior / scope-root → handler checks.** Shorthand: **node-perm** = `allowEditNode` + scope link; **var-perm** = `allowEditVariable`; **style-perm** = `allowEditStyle`.

### B1. Node write tools (single target)

| Tool | Enforced gate stack |
|---|---|
| `node_set_fill` | node-perm · scope · name · locked |
| `node_set_stroke` | node-perm · scope · name · locked |
| `node_set_corner_radius` | node-perm · scope · name · locked |
| `node_set_effects` | node-perm · scope · name · locked |
| `node_set_auto_layout` | node-perm · scope · name · locked · enum checks · **FILL needs auto-layout parent (§8)** · **NONE-frame silent-drop rejected (§8)** · BASELINE horizontal-only · counterAxisSpacing WRAP-only |
| `node_rename` | node-perm · scope · name · locked |
| `node_transform` | node-perm · scope · name · locked · **layout-controlled x/y hard-reject (§9)** · **resize-resets-sizing warning (§9)** |
| `node_bind_variable` | node-perm · scope · name · locked · **unsupported node / mixed paint guard (v2.3.1 §1)** · **auto-layout precheck (v2.3.1 §3)** · SOLID-only paint bind (**type-mismatch guard**, gated by node-perm not var-perm) |
| `node_apply_style` | node-perm · scope · name · locked (gated by node-perm, **not** style-perm) |
| `node_clone` | node-perm · scope(source) · name · locked(source) · **instance-interior(source) (§4)** · parent scope · **parent appendable (v2.3.2 §1)** · parent locked · parent instance-interior |
| `node_flatten` | node-perm · scope · name · locked · **scope-root (§1)** |
| `node_ungroup` | node-perm · scope · name · locked · **scope-root (§1)** · **instance-interior (§4)** · must be GROUP |
| `text_set_style` | node-perm · scope · name · locked · type TEXT · **mixed-font load via getStyledTextSegments (§10)** · **full schema↔handler contract incl. fontName + lineHeight AUTO (§15)** |
| `instance_set_property` | node-perm · scope · name · locked · type INSTANCE · **value type validation BOOLEAN/TEXT/VARIANT/INSTANCE_SWAP (§5)** · **not** remote-gated (local override) |
| `reaction_update` | node-perm · scope · **name (§6A)** · locked |

> **v2.3.2 contract extension (D9):** the `node_clone` row previously promised only `locked(source)`. The full stack above — source scope/name/locked/instance-interior plus destination-parent scope/appendability/locked/instance checks — is enforced as of v2.3.2 and closes the G1 scope-root clone escape (the destination parent of a scope-root clone is outside scope by definition, so cloning the scope root is denied).

### B2. Node batch tools (per-item pre-validation, zero-mutation abort)

| Tool | Enforced gate stack (per item unless noted) |
|---|---|
| `node_delete` | node-perm · scopeRoot present · exists · scope · name · **locked** · **instance-interior (§4)** · **scope-root (§1)** |
| `node_group` | node-perm · scope · name · **same-parent** · **locked** · **instance-interior (§4)** |
| `text_set_content` | node-perm · scopeRoot · exists · scope · name · type TEXT · **locked** · **correct `characters` contract (§16)** |
| `annotation_set` | node-perm · scopeRoot · exists · scope · name · supports-annotations · **locked** |
| `instance_set_overrides` | node-perm · scopeRoot · source exists+INSTANCE · per-target exists+scope+name+INSTANCE+**locked** |
| `create_component_set` | node-perm · scopeRoot · per-component exists+scope+name+propValues-count+COMPONENT-type · **instance-interior (§4)** · **remote block (§7)** · parent scope+name+**locked**+**instance-interior (§4)** · **parent-cycle (v2.3.2 §2)** · **set-member block (v2.3.2 §2)** · **value separator rules (v2.3.2 §2)** · **duplicate component IDs (v2.3.2 §2)** · **duplicate-variant uniqueness (§11)** · **plan/mutate two-phase (v2.3.2 §2)** |

### B3. Creation tools (gate on the parent)

| Tool | Enforced gate stack |
|---|---|
| `create_shape` | node-perm · parent scope+name+**locked**+**instance-interior (§4)** · shape-param checks (arcData=ellipse, pointCount≥3, innerRadius=star) · color 0–1 (Zod) · **parent-first + cleanup (v2.3.2 §3)** |
| `create_frame` | node-perm · parent scope+name+**locked**+**instance-interior (§4)** · color 0–1 (Zod) · **opacity normalized, no NaN (§12)** · **parent-first + cleanup (v2.3.2 §3)** |
| `create_text` | node-perm · parent scope+name+**locked**+**instance-interior (§4)** · color 0–1 (Zod) · **opacity normalized, no NaN (§12)** · **parent-first + cleanup (v2.3.2 §3)** |
| `create_svg` | node-perm · parent scope+name+**locked**+**instance-interior (§4)** · **parent-first + cleanup (v2.3.2 §3)** |
| `create_instance` | node-perm · parent scope+name+**locked**+**instance-interior (§4)** · **parent-first + cleanup (v2.3.2 §3)** |
| `create_component` | node-perm · scope · name · locked · **scope-root self-destruction (§1)** · **parent-first + cleanup (v2.3.2 §3)** |
| `node_insert_child` | node-perm · parent scope+name · child scope+name · **locked(parent & child)** · **self/cyclic-parent (§3)** · **instance-interior, both ids (§4)** · **index bounds (§13)** |
| `create_connection` | node-perm · connector scope (if set) · per-connection start/end scope+name · locked |

### B4. Document-global asset tools (gated by the asset permission axes, not positional scope)

| Tool | Enforced gate stack |
|---|---|
| `variable_manage` | **var-perm (§14)** · **remote block on UPDATE (§7)** |
| `variable_delete` | **var-perm (§14)** · ids-xor-collection · **required name verification, both modes (§6B)** · **remote block (§7)** · full-document consumer scan refuses in-use deletes |
| `style_manage` | **style-perm (§14)** · **remote block on edit-existing (§7)** · (binding a variable into a style needs only style-perm) |
| `style_delete` | **style-perm (§14)** · `styleName` verification (strict) · **remote block (§7)** |
| `component_manage_property` | node-perm · scope · name · locked · COMPONENT/COMPONENT_SET · blocks VARIANT add · **value type validation (§5)** · **variant-member guard (§5)** · **remote block (§7)** |
| `component_delete_property` | node-perm · scope · name · locked · **remote block (§7)** |

> **Note:** `component_*_property` edit a *main component definition* and remain **node** edits (node-perm + scope + name), plus the §7 remote block. Only `variable_*`/`style_*` move onto the new asset permission axes.

### B5. Read & navigation tools — ungated (A6)

| Tool | Requirement | Gated? |
|---|---|---|
| `node_info` | empty-args → falls back to `scopeRootId`; node-read-only empty-args returns `{nodes:[]}` | No (read) |
| `page_info`, `style_list`, `component_list`, `variable_list`, `annotation_list` | — | No (read) |
| `instance_get_overrides` | requires `instanceNodeId` | No (read) |
| `reaction_list` | requires `nodeIds[]` | No (read) |
| `node_export_visual` | — | No (read; accepted off-scope residual R3) |
| `view_navigate` | resolves ids; rejects DOCUMENT root, mixed page/node, cross-page selection | No — **deliberately scope-exempt (A6)** |
| `get_connect_payload` | — | No (handshake; surfaces the three permission axes) |

---

## Part C — Input-validation (Zod / schema-level) checks

These run in the MCP server before the plugin and reject malformed input early (not a control — see A1/AS6). Notable ones:

- **Color channels** `r,g,b,a` constrained `0–1` on `create_shape`/`create_frame`/`create_text` and `style_manage` paints (`min(0).max(1)`). (Plugin-side, `create_frame`/`create_text` also normalize alpha so a missing `a` never yields `NaN` opacity — §12.)
- **Mutual Exclusivity:** `node_set_fill` requires exactly one of a solid color (`r,g,b`), an image payload (`url` or `bytesBase64`) (v2.3.0 §1), or `clear:true` (v2.3.1 §4); `variable_delete` ids-xor-collection; `create_connection` connector-vs-connections.
- **Enums** for layout (`layoutMode`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `layoutSizingHorizontal/Vertical`), `textCase`, `textDecoration`, shape `type`, paint `type`, grid `pattern`.
- **Bindable Fields Allowlist:** `node_bind_variable` constrains `bindVariables` keys to a strict typings-derived allowlist `BINDABLE_FIELDS` instead of an open record (v2.3.1 §2).
- **Shape params:** `pointCount ≥ 3`, `innerRadius`/`arcData.innerRadius` `0–1`, `strokeWeight` positive.
- **`lineHeight`:** both `style_manage` and `text_set_style` accept the `{unit:"AUTO"}` union (§15).
- **Name fields:** `nodeName`/`parentNodeName` on every write; `variableNames`/`collectionName` on `variable_delete` (§6B); `nodeName` on `reaction_update` (§6A).

---

## Part D — Structured error codes (reference)

The plugin returns these from [`main.ts` `ERRORS`](figma_plugin/src/main.ts#L45) and inline throws. Full recovery guidance lives in [`skills/figma-edit/references/error-playbook.md`](skills/figma-edit/references/error-playbook.md).

| Code / message | Meaning |
|---|---|
| `READ_ONLY_MODE` | No scope link → **node** writes blocked (asset edits gated separately). |
| `VARIABLE_EDITS_DISABLED` / `STYLE_EDITS_DISABLED` | The corresponding asset permission axis is off (§14). |
| `OUTSIDE_SCOPE` / `PARENT_OUTSIDE_SCOPE` / `CLONING_SOURCE_NODE_OUTSIDE_SCOPE` | Target/parent/clone-source not under `scopeRootId`. |
| `SCOPE_DELETED` | `scopeRootId` no longer resolves — the bricking the §1 scope-root guard prevents. |
| `NAME_MISMATCH` / `PARENT_NAME_MISMATCH` | Resolved name ≠ supplied name (stale/fabricated id). |
| `"… is locked …"` (§2) | Target or an ancestor is locked. |
| `"… is inside a component instance …"` (§4) | Structural edit inside an `INSTANCE`. |
| `"… is a remote library asset …"` (§7) | Edit targets a remote style/variable/main-component. |
| `"… is the current Editable Scope root …"` (§1) | Destructive/replacing op on the scope anchor. |
| `"… cannot be inserted into itself …"` / cyclic (§3) | Self- or cyclic reparent. |
| `"Sizing 'FILL' requires … Auto-Layout parent"` (§8); index-bounds (§13); duplicate-variant (§11); auto-layout child transform (§9) | The remaining structured `"Operation Denied: …"` strings. |
| Actionable Prechecks | `node_bind_variable` blocks missing auto-layout (v2.3.1 §3) and non-solid paint binds (v2.3.1 §1). |
| `MISSING_*` / type errors | Parameter/shape/type violations from the dispatcher and handlers. |

---

## Maintenance

- This file is the **canonical safety manual** for v2.3.2, an aggregated view regenerated from the dispatcher + handlers + schemas. When a tool's gate stack changes, update both the code and this matrix (or delete the row if the tool is removed). Part B's generic gate tokens are **mechanically diffed in both directions** against the executable contract table in `src/mcp_server/tests/unit/figma_plugin/safetyContract.test.ts` (PRD v2.3.2 OQ4): a gate claimed here but not asserted there fails CI, and vice versa; unknown tokens fail with a pointer to the alias/ignore tables. When a guarantee, assumption, or residual risk changes, update the G/AS/R lists too — they are the contract.
- **Publication:** published at the **repo root** as `SAFETY.md` — the **contributor / integrator / auditor-facing** companion to the agent-facing guides in [`skills/figma-edit/references/`](skills/figma-edit/references/) (`constraints.md` et al.) and to [`DESIGN_PHILOSOPHY.md`](DESIGN_PHILOSOPHY.md). The **end-user-facing** safety value proposition lives in [`README.md`](README.md#safer-than-figma-itself), which links here for the full contract. If the project ever accepts external vulnerability reports, add a *separate* thin `SECURITY.md` for disclosure — it is a different document from this one.
- Cross-references: holistic agent guidance → `constraints.md`; per-error recovery → `error-playbook.md`; the v2.3.2 change rationale → [`prd.md`](documentation/v2.3.2-safety-contract-conformance-&-atomicity-hardening/prd.md) (v2.3.1: [`prd.md`](documentation/completed/v2.3.1-bind-variable-guardrails/prd.md)); review provenance → [`figma-documentation-check.md`](documentation/completed/v2.2.0-safety-enhancement/figma-documentation-check.md) and [`critique.md`](documentation/completed/v2.3.1-bind-variable-guardrails/critique.md).
