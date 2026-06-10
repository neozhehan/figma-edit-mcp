# v2.2.0 Safety & Validation Enhancements — Implementation Task List

This task list covers **all** requirements in [`prd.md`](./prd.md) for the v2.2.0 release of `figma-edit-mcp`. Every task cites its PRD `§`/`D` for traceability; the **Coverage map** at the end confirms totality.

**Conventions**
- All new guards are **plugin-side only** (PRD **D3**) — do **not** add MCP-side Zod/`.refine()` mirrors of any guard (existing range/enum Zod checks stay).
- Dispatcher guards (§1/§2/§4) run in the **existing pre-validation loop** so a bad batch member aborts with **zero mutations** (PRD **D6**); reuse the resolved-node reference the loop already holds.
- Reads are **never** gated (PRD **D5**) — no task may add a permission/scope/locked check to a read or to `view_navigate`/`node_export_visual`.
- Guard ordering when stacked: **permission → scope → name → locked → instance-interior / scope-root** (most-specific actionable error wins).

---

## Phase 1: Setup & Prerequisite Helpers
- [ ] **§D1:** Bump `package.json` `version` `2.0.0 → 2.2.0` (reconciles the lag; v2.1.0 never bumped it).
- [ ] **§0:** Add three shared helpers to `figma_plugin/utils/nodeUtils.ts` (single source; import everywhere). All are **pure synchronous `.parent` walks** — no `await`, no `getNodeByIdAsync` per hop:
  - [ ] `findLockedAncestor(node: BaseNode): BaseNode | null` — node itself or nearest ancestor with `locked === true`, else `null`. (§2)
  - [ ] `findInstanceAncestor(node: BaseNode): InstanceNode | null` — nearest ancestor (excluding the node itself) of type `INSTANCE`, else `null`. (§4)
  - [ ] `isAncestorOf(maybeAncestor: BaseNode, node: BaseNode): boolean` — walks `node.parent` up; `true` if `maybeAncestor` is encountered. (§3)
- [ ] **Tests:** Unit tests for the three helpers (self, direct parent, deep ancestor, no-match, detached node).

## Phase 2: Core State & Permissions — §14 (P1)
- [ ] **§14 state model (`main.ts`):** Replace `state.readOnly` with `allowEditNode: false|"page"|"node"`, `allowEditVariable: boolean`, `allowEditStyle: boolean`; keep `scopeRootId`. Invariant: `allowEditNode === false ⟺ scopeRootId === null`.
- [ ] **§14 `set-scope` handler (`main.ts:189`):** Set all three fields. Derive `allowEditNode = scopeNodeType === "PAGE" ? "page" : "node"` from the `scopeNodeType` already known via `scope-validation-result` (`main.ts:179`); set the two booleans from the checkbox payload. Collapse `editableScopeType` to `state.allowEditNode || "readonly"`.
- [ ] **§14 add error codes (`main.ts` ERRORS):** `VARIABLE_EDITS_DISABLED`, `STYLE_EDITS_DISABLED` (strings per PRD §14).
- [ ] **§14 dispatcher gating swaps (`main.ts`):**
  - [ ] ~35 node-write cases: `if (state.readOnly)` → `if (!state.allowEditNode)` (still throws `READ_ONLY_MODE`).
  - [ ] `checkScopeAccess` early-out (`:81`) **and** `checkScopeAccessRef` early-out (`:108`): `if (state.readOnly) return false` → `if (!state.allowEditNode) return false`.
  - [ ] `node_info` empty-args short-circuit (`:553`): `&& state.readOnly` → `&& !state.allowEditNode`.
  - [ ] `variable_manage`/`variable_delete` (`:598,:605`): gate on `!state.allowEditVariable` → `VARIABLE_EDITS_DISABLED`.
  - [ ] `style_manage`/`style_delete` (`:609,:614`): gate on `!state.allowEditStyle` → `STYLE_EDITS_DISABLED`.
- [ ] **§14 connect payload (`connectHandlers.ts:8`):** `if (state.readOnly === true)` → `if (!state.allowEditNode)`; surface `{ allowEditNode, allowEditVariable, allowEditStyle }` in **every** payload shape; drop the now-redundant page-vs-node re-derivation (`:34,:62-79`).
- [ ] **§14 schema (`src/mcp_server/tools/channel.ts:18-27`):** Add the three fields to the `channel_join` `outputSchema`.
- [ ] **§14 UI (`figma_plugin/ui.html`):**
  - [ ] Add two checkboxes near the scope-link section (`:261-275`): "Allow AI Agent to modify Variables", "Allow AI Agent to modify Styles".
  - [ ] Add `allowEditVariable`/`allowEditStyle` to the UI `state` object (`:333`); include them + `scopeNodeType` in the `set-scope` post (`:714`).
  - [ ] Disable both checkboxes **while connected** (mirror port/scope inputs at `:391-392`).
  - [ ] Reword the "Leave blank for Read-Only Mode" label (`:263`) — blank = **nodes** read-only, assets gated separately.
  - [ ] Fix the stale `Version: 1.0.0` (`:317`) → `2.2.0`.
  - [ ] Verify the UI height (`450`, `main.ts:156`) still fits the two new checkboxes; bump if needed.
- [ ] **§14 settled boundary (verify, no code unless drift):** `node_bind_variable`/`node_apply_style` stay **node** edits (gated by `allowEditNode`, not the asset flags); `style_manage` `bindVariables` needs only `allowEditStyle`.
- [ ] **Tests:**
  - [ ] Replace `state.readOnly` in `atomicityAndValidation.test.ts:42,82`; `getNodesInfo.integration.test.ts:40-41,456-461`; `componentHandlers.test.ts:346`.
  - [ ] Update tests asserting `variable_*`/`style_*` throw `READ_ONLY_MODE` → new flag errors (audit `handlers.test.ts`, `annotationsAndVariables.test.ts`).
  - [ ] Connect-payload snapshots (`connectHandlers.test.ts:125+`) assert all three axes are surfaced in every shape.
  - [ ] New: full **8-cell matrix**; node writes blocked when `allowEditNode === false` regardless of asset flags; `variable_*` need `allowEditVariable`, `style_*` need `allowEditStyle`; remote guard (§7) still wins; reads succeed under every combo (D5).
- [ ] **Live Verification:** Build the plugin; in Figma confirm the checkboxes enable/disable node, variable, and style edits independently, are disabled while connected, and that a linked-but-asset-unchecked session blocks asset edits.

## Phase 3: Dispatcher-Level Guards — `main.ts` unless noted (P0/P1)
- [ ] **§1 Scope-root self-destruction:** Reject when the resolved target id `=== state.scopeRootId` for `node_delete` (per item), `node_flatten`, `node_ungroup`, and **`create_component`** (it replaces the source frame with a new id). Reparenting the scope root via `node_insert_child` is **out of scope** (id unchanged). Error string per PRD §1.
- [ ] **§2 Locked-layer hard block (D2):** Add a single `assertNotLocked(node)` helper invoked **from the dispatcher** (next to `checkScopeAccess`/`verifyNodeName`, **not** per-handler), run **after** scope + name. Reject when `findLockedAncestor(target) !== null`:
  - [ ] Single-target writes — check `params.nodeId`.
  - [ ] Batch writes — check **each** target in the pre-validation loop (zero-mutation abort).
  - [ ] Creation/reparenting — check the **parent** (`parentId`); for `node_insert_child` **also check the child**.
  - [ ] Confirm reads are unaffected (D5).
- [ ] **§4 Instance-interior structural block (D7):** Reject **structural** ops only when `findInstanceAncestor(target) !== null` — `node_delete` (each), `node_insert_child` (**both** `childId` and `parentId`), `node_group`, `node_ungroup`, and `create_*` (resolved `parentId`). **Allow** property/override writes (`instance_set_property`, `instance_set_overrides`, fills/text/visibility on overridable descendants) — Figma is the final arbiter. Confirm the structural-op list against the live Plugin API. Error string per PRD §4.
- [ ] **§6A `reaction_update` name verification:** Add `verifyNodeName(params.nodeId, params.nodeName)` to the dispatch case **and** add `nodeName` to the schema in `src/mcp_server/tools/reaction.ts` (currently absent — without it the call can never satisfy the check).
- [ ] **§7 Remote library-asset guard:** Reject when the resolved asset `.remote === true` for `style_manage` (edit-existing)/`style_delete`; `variable_manage` (`UPDATE_VARIABLE`)/`variable_delete`; `component_manage_property`/`component_delete_property`. **`instance_set_property` is explicitly NOT gated** (local override, not a definition edit). Stacks on top of §14. Error string per PRD §7.
- [ ] **Tests:**
  - [ ] §1: deleting/flattening/ungrouping/`create_component` on `scopeRootId` rejected; a non-root in-scope node still succeeds.
  - [ ] §2: each mutating command rejects a locked target **and** a locked-ancestor target; **zero mutation** on batch tools; creation under a locked parent rejected; **reads succeed on locked nodes**.
  - [ ] §4: structural op on an instance-interior node rejected; **an override write on the same instance still succeeds** (the D7 boundary test).
  - [ ] §6A: `reaction_update` rejects on name mismatch.
  - [ ] §7: editing/deleting a remote style/variable/component rejected; **editing a local instance of a remote component still succeeds**.
- [ ] **Live Verification:** Build plugin; in Figma confirm locked layers and instance-interior nodes reject structural mutations, an instance override still applies, and deleting the scope root is blocked.

## Phase 4: Node Modifiers & Creators Validations (P0/P2)
- [ ] **§3 Cyclic / self-parent guard (`nodeModifiers.ts` `insertChild`):** Before reparent — reject (1) `parentId === childId`; (2) `isAncestorOf(child, parent)` (cyclic); (3) type-compat belt-and-suspenders (`PAGE` as child of non-`DOCUMENT`, non-`PAGE` as child of `DOCUMENT`). Error strings per PRD §3.
- [ ] **§13 `insert_child` index-bounds guard (`nodeModifiers.ts` `insertChild`):** Validate `index` against inclusive `0 … parent.children.length`; throw a structured bounds error on `< 0` or `> length`; **do not clamp**; omitted `index` appends (unchanged). Error string per PRD §13.
- [ ] **§13 tool description (`src/mcp_server/tools/node.ts:316`):** Document **both** (a) valid range + "omit `index` to append"; and (b) the output `index` reports the **actual resolved position** (same-parent reorder shifts indices, so the post-insert position can differ from the requested one — not an error).
- [ ] **§9 Auto-layout child transform (`nodeModifiers.ts` `transformNode`, D8):** Before applying `x`/`y`, detect parent auto-layout **and** `layoutPositioning !== "ABSOLUTE"` → **hard-reject** the positional change with guidance (error string per PRD §9). For **resize**: apply the FIXED axis, return a `warnings[]` entry for any HUG/FILL axis the parent controls (don't reject the whole call). **Also** warn when `resize()` reverts the node's own non-`FIXED` sizing mode to `FIXED` (added per `critique`/figma-doc cross-check).
- [ ] **§8 Auto-layout `FILL` sizing guard (`layoutHandlers.ts` `setAutoLayout`):** When either sizing is `"FILL"`, verify the parent is auto-layout, else throw (error string per PRD §8). **Also** reject (or `warnings`-surface) the silent-drop: sizing/padding/alignment supplied to a frame that is and remains `layoutMode "NONE"` (early-return drops them today). Do **not** add a separate `HUG` guard (dead code — see PRD §8 note).
- [ ] **§12 `NaN` opacity bug (`nodeCreators.ts`):** Fix `createFrame` (`:247`) and `createText` (`:382`) to `typeof a === 'number' ? a : 1` (or `Number.isFinite` guard). **Audit** `createShape` (`:128`), `setFillColor`, `setStroke` for the same pattern (verified safe — confirm no regression).
- [ ] **Tests:** §3 self/cyclic rejected + legal reparent works; §13 out-of-range throws, omitted appends, output `index` reports actual position; §9 layout-controlled x/y rejected, HUG/FILL resize returns `warnings`, sizing-mode reset returns `warnings`; §8 `FILL` under non-auto-layout parent rejected, under auto-layout succeeds, NONE-frame silent-drop rejected; §12 frame/text without alpha yields opacity `1` (never `NaN`).
- [ ] **Live Verification:** In Figma confirm `FILL`/child-transform respond with proper rejections/warnings rather than silently failing.

## Phase 5: Component & Asset Validations (`componentHandlers.ts` unless noted) (P1/P2)
- [ ] **§5 Component property type validation** in **both** `setComponentInstanceProperty` (`:777`) and `manageComponentProperty` (`:844`), **before** the API call:
  - [ ] `BOOLEAN` — accept real boolean; coerce `"true"`/`"false"` (case-insensitive); reject anything else.
  - [ ] `TEXT` — require a string.
  - [ ] `VARIANT` — cross-reference allowed values from the parent **`ComponentSetNode.variantGroupProperties`** (options come from the **set**, not the instance); on miss, throw listing valid options (error string per PRD §5).
  - [ ] `INSTANCE_SWAP` (D10, **advisory**) — validate the value resolves to a `COMPONENT` id or is a non-empty component key; reject a wrong-type reference (frame id, number, empty string); pass plausible refs through. **Do NOT** validate against `preferredValues`.
- [ ] **§5 Variant-member node-type guard (`manageComponentProperty`):** Reject when `node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET"` with set-level guidance (error string per PRD §5).
- [ ] **§11 Duplicate-variant guard (`createComponentSet` `:708`):** Before `combineAsVariants`, build each component's `Prop=Val, …` variant name and detect duplicate combinations; throw listing the colliding combo(s) (error string per PRD §11).
- [ ] **§6B `variable_delete` required names (D11):** Schema (`src/mcp_server/tools/variable.ts`) — `variableIds` mode requires a parallel `variableNames: string[]` (same length); `collectionId` mode requires `collectionName`. Handler (`variableHandlers.ts` `deleteVariables`) — verify each by id / verify the collection; throw a `"… does not match name of …"` error on mismatch.
- [ ] **§6B `style_delete` tighten (`styleHandlers.ts:210`):** Drop the dead `!== undefined` allowance so it matches `verifyNodeName`'s "block if name absent" (consistency only).
- [ ] **Tests:** §5 each type validated, `"true"`→`BOOLEAN` coerces, bad `VARIANT` lists options, `INSTANCE_SWAP` rejects wrong-type but passes a plausible id/key, variant-member rejected; §11 duplicate combo rejected with collision named; §6B `variable_delete` requires names in both modes and rejects on mismatch, `style_delete` rejects on mismatch with the tightened guard.
- [ ] **Live Verification:** In Figma confirm a duplicate variant throws the intended error and `INSTANCE_SWAP` accepts a valid component reference.

## Phase 6: Text Tool Contract Repairs (`textHandlers.ts` + `src/mcp_server/tools/text.ts`) (P0/P1/P2)
- [ ] **§10 Mixed-font loading (`setTextStyle`):** Factor a `loadAllFontsForNode(node)` helper using native `node.getStyledTextSegments(['fontName'])` (dedupe via `uniqBy`; short-circuit `node.fontName !== figma.mixed`). Do **not** reuse the buggy `buildLinearOrder` (`textUtils.ts:58-61`). On an unavailable font, surface an actionable error — **do not** skip-and-proceed (a missing font blocks any write regardless).
- [ ] **§15 `text_set_style` schema↔handler repair (functional bug):**
  - [ ] Make schema (`text.ts`) and handler agree on the font — read `fontName.family`/`fontName.style` in the handler (preferred; matches `style_manage`) **or** flatten the schema to `fontFamily`/`fontStyle`. (Today `fontName` is silently dropped.)
  - [ ] Replace value-required `lineHeight` (`text.ts:56-62`) with the `{unit:"AUTO"} | {value, unit:"PIXELS"|"PERCENT"}` union from `style.ts:36-39`.
  - [ ] Add `textAlignHorizontal`/`textAlignVertical` to the schema (handler already applies them).
  - [ ] Apply `paragraphIndent` in the handler (schema already sends it).
- [ ] **§16 `text_set_content` production-breakage repair (P0):**
  - [ ] Standardize on `characters`: in `setMultipleTextContents` read `replacement.characters` (currently `replacement.text` at `textHandlers.ts:101,138`); pass it into `setTextContent`.
  - [ ] Drop the phantom top-level `nodeId` requirement (`textHandlers.ts:61`) and the `nodeId:` echoes the schema never supplies.
- [ ] **Tests:** End-to-end tests driving the **MCP schema shape** — `text_set_style` actually changes a font, accepts `lineHeight {unit:"AUTO"}`, reaches `textAlign*`, applies `paragraphIndent`; `text_set_content` with `{ text: [{ nodeId, nodeName, characters }] }` (no top-level `nodeId`) updates characters. Update the existing handler-shaped tests (`atomicityAndValidation.test.ts:98-104,240-247`) to the schema shape so the drift cannot recur.
- [ ] **Live Verification:** In Figma confirm `text_set_style` changes the font and `text_set_content` updates characters.

## Phase 7: Documentation, Build & Release
- [ ] **Docs — agent guidance (single source):** Update `skills/figma-edit/references/constraints.md` (reframe read-only as **node-only**; the three permission axes; new locked/remote/instance-interior/scope-root constraints), `error-playbook.md` (new codes `VARIABLE_EDITS_DISABLED`/`STYLE_EDITS_DISABLED`; clarify `READ_ONLY_MODE` is node-only; note the **INSTANCE_SWAP advisory** — a passed swap can still be refused by Figma, D10), `workflows.md`, `tool-selection.md`, and `AGENTS.md`. Keep the **`figma-edit://guide/*` MCP resources** in sync (same single source).
- [ ] **Docs — Safety Manual:** Promote `documentation/v2.2.0-safety-enhancement/SAFETY.DRAFT.md` to a published `SAFETY.md` (repo root or `skills/figma-edit/references/`); drop the draft once merged.
- [ ] **Build — plugin bundle:** Rebuild `figma_plugin/code.js` via the esbuild bundle — **source-only edits don't take effect live**; the rebuilt bundle must ship.
- [ ] **Build — server:** Run `npm run build`; ensure a clean bundle and the full suite passes from the repo root.
- [ ] **Release:** Update `CHANGELOG.md` with all v2.2.0 changes; confirm `package.json` is `2.2.0` (D1).

---

## Coverage map (PRD → Phase)

| PRD item | Where covered |
|---|---|
| **D1** version bump | Phase 1 (§D1) · Phase 7 (confirm) |
| **D2** locked hard block | Phase 3 (§2) |
| **D3** plugin-only (no MCP mirror) | Conventions (guardrail) |
| **D4 / §14** per-asset permissions | Phase 2 |
| **D5** reads never gated | Conventions + Phase 2/3 tests |
| **D6** guards in pre-validation loop | Conventions + Phase 3 |
| **D7** instance-interior boundary | Phase 3 (§4) |
| **D8 / §9** auto-layout child transform | Phase 4 (§9) |
| **D9 / §13** index bounds | Phase 4 (§13) |
| **D10 / §5** INSTANCE_SWAP advisory | Phase 5 (§5) · Phase 7 (playbook note) |
| **D11 / §6B** variable_delete names | Phase 5 (§6B) |
| **§0** helpers | Phase 1 |
| **§1** scope-root (incl. `create_component`) | Phase 3 |
| **§2** locked | Phase 3 |
| **§3** cyclic/self-parent | Phase 4 |
| **§4** instance-interior | Phase 3 |
| **§5** component property types + variant-member guard | Phase 5 |
| **§6A** reaction_update name (+ schema) | Phase 3 |
| **§6B** variable_delete + style_delete | Phase 5 |
| **§7** remote-asset guard | Phase 3 |
| **§8** FILL guard + NONE-frame silent-drop | Phase 4 |
| **§9** transform reject/warn + resize sizing-mode warn | Phase 4 |
| **§10** mixed-font via getStyledTextSegments | Phase 6 |
| **§11** duplicate-variant | Phase 5 |
| **§12** NaN opacity (+ audit) | Phase 4 |
| **§13** index bounds + tool-description (both notes) | Phase 4 |
| **§14** permissions (state, gating, UI, payload, schema, tests) | Phase 2 |
| **§15** text_set_style contract | Phase 6 |
| **§16** text_set_content contract | Phase 6 |
| Documentation & build (bundle rebuild, guide resources, CHANGELOG) | Phase 7 |
