# v2.3.1 Task List: `node_bind_variable` Guardrails

> [!NOTE]
> **Conventions for this list.**
> - **Error messages must match the exact strings specified in the PRD** (§1 / §2 / §3); do not paraphrase.
> - **Manual live tests require the Phase 7 build** (rebuilt plugin + `dist/`). They are listed under their feature for traceability but are *executed in Phase 8*, after the build.
> - Spec source of truth: [`prd.md`](./prd.md). Each task cites the PRD decision it implements.

## Phase 1: Setup and Versioning
- [x] Bump version in `package.json` from `2.3.0` to `2.3.1` (D1).

## Phase 2: §2 `bindVariables` Key Allowlist (P1) — `src/mcp_server/tools/node.ts`

> [!NOTE]
> **Implementation note (supersedes the original D3 plan; see PRD §2/D3).** The original plan (hand-curated `BINDABLE_FIELDS` + a `satisfies` type-pin + a `.superRefine`) was replaced during implementation+review by a stronger approach, because (a) `@figma/plugin-typings` exports those types as **ambient globals**, so the planned `import type { … }` doesn't resolve and the `satisfies` pin references unresolved types; and (b) the project **never runs `tsc`** (build = tsup/esbuild, tests = bun, CI = neither), so a `satisfies` pin is never evaluated. Shipped instead: the list is **generated from the typings** by `scripts/gen-node-fields.ts`, the schema uses **`partialRecord` + `z.enum`** (so the allowlist is also published in the wire JSON schema, not just enforced at runtime), and drift is caught by a **`check:generated` CI step**, not by `satisfies`.

- [x] Generate `BINDABLE_FIELDS` (= `fills` + `strokes` + **every** member of `VariableBindableNodeField` and `VariableBindableTextField` — incl. the four per-side stroke weights, `gridRowGap`/`gridColumnGap`, `fontFamily`/`fontStyle`/`fontWeight`) from `@figma/plugin-typings` via `scripts/gen-node-fields.ts` → `src/mcp_server/tools/bindableFields.generated.ts`. Replaces the hand-curated list (Finding 2).
- [x] Drift protection without `tsc`: add a **`check:generated`** script (`scripts/check-generated.ts`) — regenerate + `git diff --exit-code` the generated outputs — wired into CI, so a typings bump that adds/removes a field **fails CI** instead of silently drifting (replaces the planned `satisfies` pin, D3).
- [x] Replace the open `bindVariables: z.record(z.string().nullable())` with **`z.partialRecord(z.enum(BINDABLE_FIELDS), z.string().nullable(), { error })`** (`partialRecord` keeps keys optional; a plain enum-keyed `z.record` would require all keys in Zod v4). The record-level `error` rewrites the opaque `invalid_key` into the PRD §2 error string with a "did you mean" hint via `suggestBindField` (`padding→paddingLeft`, `gap→itemSpacing`, `cornerRadius→topLeftRadius`, plus lexical near-misses like `fill→fills` and case slips like `fontsize→fontSize`). The enum surfaces the valid set in the published JSON schema (`propertyNames.enum`).
- [x] Update the `node_bind_variable` tool **description** inline to name the valid bind fields (enumerated from `BINDABLE_FIELDS`) and the ordering rules (auto-layout before padding/spacing; solid fill before colour bind).
- [x] **Unit Test** (`tests/unit/tools/node_bind_variable.test.ts`):
  - [x] `{paddingLeft: id}` passes; `{padding: id}` and `{gap: id}` rejected **with the hint** (issue `code: "invalid_key"`).
  - [x] `fills`/`strokes` accepted; **`strokeTopWeight` and `fontFamily` accepted** (regression guarding against the original incomplete hand list — Finding 2).
  - [x] Lexical near-misses get hints: `fill→fills`, `fontsize→fontSize`; unknown-but-unguessable keys get **no** "Did you mean".
  - [x] Wire JSON schema publishes the allowlist (`propertyNames.enum` contains valid fields, excludes typos).
  - [x] Empty / omitted `bindVariables` still valid (modes-only path).
- [x] **Live Test (Manual → Phase 8):** `{padding: id}` → schema rejection with hint; `{strokeTopWeight: id}` → accepted. *(Executed early on channel `7geb`: reject hints for `padding`/`fill`/`fontsize`, accept path for the regression fields, and an end-to-end `fills`+`topLeftRadius` bind — all verified.)*

## Phase 3: §1 Paint-bind Path Guards & Silent-Success Fix (P0) — `figma_plugin/handlers/variableHandlers.ts` (`fills`/`strokes` branch)

> [!NOTE]
> **Post-implementation hardening (adversarial review + live test on `n2k2`).** F1: the per-field `catch` was double-wrapping the §1 guard throws (`Failed to set bound variable for fills: node_bind_variable: …`) — confirmed live; fixed by passing `node_bind_variable:`-prefixed errors through verbatim and wrapping only opaque errors (see PRD §1 Notes, revised). F2: the guard tests used substring `.rejects.toThrow()` and couldn't detect the wrap — switched to exact-message (`toBe`) assertions. F4: added a unit test for the unbind-with-solid path (`setBoundVariableForPaint(paint,'color',null)`), which was live-verified but previously unit-untested. F5: trailing whitespace removed. F3 became §4 (Phase 5).
- [x] **Remove the silent-success no-op:** delete the existing `else { results.push("No SOLID paints found …") }` branch (`variableHandlers.ts:828-831`); it must be fully replaced by the handling below so the function **never returns `success: true` for a true no-op**.
- [x] Add up-front guards, evaluated **in this order, before** the `JSON.parse(JSON.stringify(node[field]))` clone:
  - [x] **Unsupported node:** if `!(field in node)` → throw the PRD "no '${field}' property" error (Finding 1).
  - [x] **Mixed paint:** if `node[field] === figma.mixed` → throw the PRD "is mixed" error (Finding 1).
  - [x] **Non-color variable:** if `variable && variable.resolvedType !== 'COLOR'` → throw the PRD non-color error. This guard covers the **whole** branch (existing paints *and* the empty/auto-create path), not just auto-create (Finding 4).
- [x] No-SOLID-paint handling:
  - [x] **Empty paint array** + binding (non-null variable): auto-create one SOLID paint **with placeholder color `{r:0,g:0,b:0}`** (overridden by the bound variable) via `setBoundVariableForPaint`, assign it, and report success "(created solid paint)" (D2).
  - [x] **Non-empty but no SOLID paint** + binding: **throw** the PRD non-solid error; do **not** clobber the existing image/gradient fill (D2).
  - [x] **Unbind** (`variableId === null`) with no solid paint: push a clear "nothing to unbind in `${field}`" note (not an error) (D2).
- [x] **Multiple SOLID paints (Finding 5):** leave the existing loop that binds **all** SOLID paints; add a code comment stating this is intentional (single-fill is the common case) so it reads as a decision, not an accident.
- [x] Keep the verification/scope guards untouched. **(Revised, F1):** the per-field `catch` now passes `node_bind_variable:`-prefixed guard errors through verbatim (wrapping only opaque errors) so the exact PRD strings surface (PRD §1 Notes, revised).
- [x] **Unit Test** (extend `tests/unit/figma_plugin/annotationsAndVariables.test.ts`):
  - [x] **Regression:** node with **one SOLID** paint still binds.
  - [x] **Empty** `fills` → auto-creates a bound SOLID paint.
  - [x] **Non-empty non-SOLID** `fills` → throws **and** leaves `fills` unmutated.
  - [x] Unsupported node (e.g. GROUP) and `figma.mixed` fill each throw their guard error **before** any paint mutation (Finding 1).
  - [x] FLOAT/STRING variable bound to `fills` throws the non-color error (Finding 4).
  - [x] Node with **two** SOLID paints binds the token to **both** (Finding 5).
  - [x] Unbind on a no-solid node returns the non-error "nothing to unbind" message.
  - [x] Assert the result is **never** `success` for a true no-op.
- [x] **Live Test (Manual → Phase 8):** bind a COLOR var to a node with no fill (bound solid paint appears); to an image-filled node (type-mismatch/non-solid error, fill untouched); a non-COLOR var to fills (non-color error).

## Phase 4: §3 Auto-layout Precheck for Padding/Spacing (P1) — `figma_plugin/handlers/variableHandlers.ts` (generic branch)

> [!NOTE]
> **Post-implementation hardening (adversarial review + live test on `bco6`).** F-A: the single "set auto-layout first" message gave a dead-end instruction for nodes that can't have auto-layout (a RECTANGLE/TEXT can't); split into two cases — auto-layout off (fixable: turn it on) vs. node type with no `layoutMode` (bind on an auto-layout frame instead) — so the LLM always gets the correct next step (see PRD §3, revised). F-B: hoisted `AUTOLAYOUT_FIELDS` to module scope (was re-allocated per bound field). F-C: added a unit test for the no-`layoutMode` (case-2) branch. F-D: §3 guard tests now use exact-match (`toBe`) like §1's F2 fix. The deliberately-narrow scope (Finding 3) was **re-validated live**: `itemSpacing` under `SPACE_BETWEEN` and `counterAxisSpacing` under `NO_WRAP` both bind and persist.
- [x] Define `AUTOLAYOUT_FIELDS` Set (`paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`, `itemSpacing`, `counterAxisSpacing`).
- [x] Before the generic `node.setBoundVariable(field, variable)`, throw the PRD §3 actionable error if the field ∈ `AUTOLAYOUT_FIELDS` and the node has no `layoutMode` or `layoutMode === "NONE"` (D4).
- [x] **Do NOT** add prechecks for `primaryAxisAlignItems === "SPACE_BETWEEN"` (itemSpacing) or `layoutWrap === "NO_WRAP"` (counterAxisSpacing): these were **live-tested on `xg0d` and accept the bind** — guarding them would falsely reject valid operations (Finding 3, rejected). Keep the precheck narrow.
- [x] **Do not auto-fix** by enabling auto-layout — detect and surface only (D4).
- [x] **Unit Test** (extend `annotationsAndVariables.test.ts`): `paddingLeft` on a `layoutMode: "HORIZONTAL"` frame succeeds (mock); on a `layoutMode: "NONE"` frame throws the actionable error **before** `setBoundVariable` is called (assert the spy is not invoked); a non-padding scalar bind is unaffected.
- [x] **Live Test (Manual → Phase 8):** bind `paddingLeft` on a plain frame → error; then set auto-layout and bind again → success.

## Phase 5: §4 `node_set_fill` Clear-Fill (new capability, P2) — `src/mcp_server/tools/node.ts` (schema) + `figma_plugin/handlers/stylingHandlers.ts` (plugin)

> [!NOTE]
> Surfaced by the §1 adversarial review (F3): no MCP path produces an empty-`fills` node, so §1's empty-fill auto-create branch isn't reachable end-to-end. D5 adds a `clear` mode to `node_set_fill` to close that loop. Scope is **fills only**; stroke-clearing is a deliberate non-goal here.

> [!NOTE]
> **Post-implementation hardening (adversarial review + live test on `dadz`).** The headline §4→§1 loop was verified live (clear → `fills:[]` → bind COLOR → auto-created bound solid). G-A: added a unit test for the `clear`+`image` rejection pair (only `clear`+solid was covered). G-B: the plugin guard tests now use exact-match (`caughtMessage` helper) instead of substring. G-C: the **non-clear** "no fills" error was the terse pre-§4 `Node does not support fills: ${nodeId}`; aligned it to the same friendly shape as the clear guard (`node_set_fill: '${name}' (type ${type}) has no 'fills' property to set a fill on.`) so both fill paths read consistently for an LLM.

- [x] **Schema (`node.ts`):** add `clear: z.boolean().optional()` to `node_set_fill`; extend the `.superRefine` so **exactly one of {solid color (r,g,b[,a]), image, `clear:true`}** is provided. Replace the existing "either a solid color or an image, not both/neither" messages with the PRD §4 string: `node_set_fill: provide exactly one of: a solid color (r,g,b[,a]), an image, or clear:true.` (D5).
- [x] **Plugin (`stylingHandlers.ts`):** when `clear` is set, assign `node.fills = []` (instead of `[paintStyle]`). **Guard first:** if `!('fills' in node)` → throw the PRD §4 guard error `node_set_fill: '${node.name}' (type ${node.type}) has no 'fills' property to clear.` (D5).
- [x] **Keep it narrow (D5):** do **not** add stroke-clearing, and do **not** add a `figma.mixed` guard (mixed fills are unambiguously clearable — assigning `[]` is well-defined).
- [x] Update the `node_set_fill` tool **description** inline to state the three modes (solid color, image, or `clear`), then run **`bun run gen:manifest`** so `manifest.json` reflects it.
- [x] **Unit Test** (`tests/unit/tools/node_set_fill.test.ts`):
  - [x] `{clear:true}` passes; `{clear:true, r,g,b}` rejected (mutually exclusive); `{}` (none of the three) still rejected.
  - [x] **Regression:** existing solid `{r,g,b}` and `{image:{…}}` inputs still pass.
- [x] **Unit Test** (plugin, `tests/unit/figma_plugin/setFillColor.test.ts`):
  - [x] `{clear:true}` sets `node.fills = []`.
  - [x] a node without a `fills` property throws the PRD §4 guard error **before** any mutation.
- [x] **Live Test (Manual → Phase 8):** `node_set_fill {clear:true}` on a shape → `fills` becomes `[]` (verify via `node_info`); then `node_bind_variable {fills: <colorVar>}` on it → auto-creates a bound solid paint (closes the §1 loop end-to-end); `clear:true` on a node type without `fills` (e.g. GROUP) → the guard error.

## Phase 6: Documentation Updates
- [x] **Update** `skills/figma-edit/references/error-playbook.md` with recovery entries for: non-solid fill bind (§1), non-color variable to fills (§1), mixed/unsupported node (§1), unknown bind field (§2), padding/spacing bind on a non-auto-layout node (§3), and **clear-fill on a node with no `fills` property (§4)**.
- [x] **Update** `skills/figma-edit/references/workflows.md` and/or `tool-selection.md` with the ordering rules (set auto-layout → bind padding/spacing; set solid fill → bind colour; binding a colour token to an empty fill auto-creates a bound solid paint) **and the `node_set_fill {clear:true}` mode** (how to remove a fill / reach the empty-fill state). Update `tool-selection.md`'s "Image Fills (`node_set_fill`)" / ad-hoc-color rows to name the third mode (clear).
- [x] **Update** the `node_set_fill` entry in `README.md`'s tool table — currently "Set a node's fill to a literal RGBA color" (stale since v2.3.0 added image) → "Set a node's fill to a color or image, or clear it" (§4).
- [x] **Update** `CHANGELOG.md` with a `v2.3.1` entry summarizing §1–§4 (silent-success + fill-branch guards, typings-derived bind-field allowlist, auto-layout precheck, `node_set_fill` clear mode).
- [x] **Note:** the MCP guide resources (`figma-edit://guide/*`) are served from `skills/figma-edit/references/*.md` (see `src/mcp_server/resources.ts`), so updating those files updates the resources too — no separate edit needed.

## Phase 7: Build
- [x] **Build:** Rebuild `figma_plugin` (handlers TS → `code.js`); confirm the `node_bind_variable` dispatch reflects §1/§3 **and the `node_set_fill` dispatch reflects §4** (`clear` → `fills = []`).
- [x] **Build:** Run `bun run build:all` (regenerates `BINDABLE_FIELDS`, builds `dist/`); confirm `check:generated` passes (generated allowlist in sync with the typings) and the §2 `partialRecord`/`z.enum` + §4 `clear` schemas resolve under **both Node and Bun**. Run `bun run gen:manifest` and confirm `manifest.json` reflects the updated `node_set_fill` description.
- [x] **Verify (Automated):** Run the full unit test suite and ensure all tests pass.

## Phase 8: Live Verification (post-build)
- [x] Execute the **Live Test (Manual)** items from Phases 2, 3, 4, and 5 against an editable Figma channel (e.g. `xg0d`), on an editable page. Clean up any test nodes/variables created during verification.
