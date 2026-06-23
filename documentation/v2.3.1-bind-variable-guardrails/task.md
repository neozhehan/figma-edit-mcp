# v2.3.1 Task List: `node_bind_variable` Guardrails

> [!NOTE]
> **Conventions for this list.**
> - **Error messages must match the exact strings specified in the PRD** (§1 / §2 / §3); do not paraphrase.
> - **Manual live tests require the Phase 6 build** (rebuilt plugin + `dist/`). They are listed under their feature for traceability but are *executed in Phase 7*, after the build.
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
- [x] **Live Test (Manual → Phase 7):** `{padding: id}` → schema rejection with hint; `{strokeTopWeight: id}` → accepted. *(Executed early on channel `7geb`: reject hints for `padding`/`fill`/`fontsize`, accept path for the regression fields, and an end-to-end `fills`+`topLeftRadius` bind — all verified.)*

## Phase 3: §1 Paint-bind Path Guards & Silent-Success Fix (P0) — `figma_plugin/handlers/variableHandlers.ts` (`fills`/`strokes` branch)
- [ ] **Remove the silent-success no-op:** delete the existing `else { results.push("No SOLID paints found …") }` branch (`variableHandlers.ts:828-831`); it must be fully replaced by the handling below so the function **never returns `success: true` for a true no-op**.
- [ ] Add up-front guards, evaluated **in this order, before** the `JSON.parse(JSON.stringify(node[field]))` clone:
  - [ ] **Unsupported node:** if `!(field in node)` → throw the PRD "no '${field}' property" error (Finding 1).
  - [ ] **Mixed paint:** if `node[field] === figma.mixed` → throw the PRD "is mixed" error (Finding 1).
  - [ ] **Non-color variable:** if `variable && variable.resolvedType !== 'COLOR'` → throw the PRD non-color error. This guard covers the **whole** branch (existing paints *and* the empty/auto-create path), not just auto-create (Finding 4).
- [ ] No-SOLID-paint handling:
  - [ ] **Empty paint array** + binding (non-null variable): auto-create one SOLID paint **with placeholder color `{r:0,g:0,b:0}`** (overridden by the bound variable) via `setBoundVariableForPaint`, assign it, and report success "(created solid paint)" (D2).
  - [ ] **Non-empty but no SOLID paint** + binding: **throw** the PRD non-solid error; do **not** clobber the existing image/gradient fill (D2).
  - [ ] **Unbind** (`variableId === null`) with no solid paint: push a clear "nothing to unbind in `${field}`" note (not an error) (D2).
- [ ] **Multiple SOLID paints (Finding 5):** leave the existing loop that binds **all** SOLID paints; add a code comment stating this is intentional (single-fill is the common case) so it reads as a decision, not an accident.
- [ ] **Do not alter** the existing per-field `try/catch` or the verification/scope guards (PRD §1 Notes).
- [ ] **Unit Test** (extend `tests/unit/figma_plugin/annotationsAndVariables.test.ts`):
  - [ ] **Regression:** node with **one SOLID** paint still binds.
  - [ ] **Empty** `fills` → auto-creates a bound SOLID paint.
  - [ ] **Non-empty non-SOLID** `fills` → throws **and** leaves `fills` unmutated.
  - [ ] Unsupported node (e.g. GROUP) and `figma.mixed` fill each throw their guard error **before** any paint mutation (Finding 1).
  - [ ] FLOAT/STRING variable bound to `fills` throws the non-color error (Finding 4).
  - [ ] Node with **two** SOLID paints binds the token to **both** (Finding 5).
  - [ ] Unbind on a no-solid node returns the non-error "nothing to unbind" message.
  - [ ] Assert the result is **never** `success` for a true no-op.
- [ ] **Live Test (Manual → Phase 7):** bind a COLOR var to a node with no fill (bound solid paint appears); to an image-filled node (type-mismatch/non-solid error, fill untouched); a non-COLOR var to fills (non-color error).

## Phase 4: §3 Auto-layout Precheck for Padding/Spacing (P1) — `figma_plugin/handlers/variableHandlers.ts` (generic branch)
- [ ] Define `AUTOLAYOUT_FIELDS` Set (`paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`, `itemSpacing`, `counterAxisSpacing`).
- [ ] Before the generic `node.setBoundVariable(field, variable)`, throw the PRD §3 actionable error if the field ∈ `AUTOLAYOUT_FIELDS` and the node has no `layoutMode` or `layoutMode === "NONE"` (D4).
- [ ] **Do NOT** add prechecks for `primaryAxisAlignItems === "SPACE_BETWEEN"` (itemSpacing) or `layoutWrap === "NO_WRAP"` (counterAxisSpacing): these were **live-tested on `xg0d` and accept the bind** — guarding them would falsely reject valid operations (Finding 3, rejected). Keep the precheck narrow.
- [ ] **Do not auto-fix** by enabling auto-layout — detect and surface only (D4).
- [ ] **Unit Test** (extend `annotationsAndVariables.test.ts`): `paddingLeft` on a `layoutMode: "HORIZONTAL"` frame succeeds (mock); on a `layoutMode: "NONE"` frame throws the actionable error **before** `setBoundVariable` is called (assert the spy is not invoked); a non-padding scalar bind is unaffected.
- [ ] **Live Test (Manual → Phase 7):** bind `paddingLeft` on a plain frame → error; then set auto-layout and bind again → success.

## Phase 5: Documentation Updates
- [ ] **Update** `skills/figma-edit/references/error-playbook.md` with recovery entries for: non-solid fill bind (§1), non-color variable to fills (§1), mixed/unsupported node (§1), unknown bind field (§2), and padding/spacing bind on a non-auto-layout node (§3).
- [ ] **Update** `skills/figma-edit/references/workflows.md` and/or `tool-selection.md` with the ordering rules (set auto-layout → bind padding/spacing; set solid fill → bind colour; binding a colour token to an empty fill auto-creates a bound solid paint).
- [ ] **Update** `CHANGELOG.md` with a `v2.3.1` entry summarizing §1–§3 (silent-success + fill-branch guards, typings-derived bind-field allowlist, auto-layout precheck).

## Phase 6: Build
- [ ] **Build:** Rebuild `figma_plugin` (handlers TS → `code.js`); confirm the `node_bind_variable` dispatch reflects §1/§3.
- [ ] **Build:** Run `bun run build:all` (regenerates `BINDABLE_FIELDS`, builds `dist/`); confirm `check:generated` passes (generated allowlist in sync with the typings) and the §2 `partialRecord`/`z.enum` schema resolves under **both Node and Bun**.
- [ ] **Verify (Automated):** Run the full unit test suite and ensure all tests pass.

## Phase 7: Live Verification (post-build)
- [ ] Execute the **Live Test (Manual)** items from Phases 2, 3, and 4 against an editable Figma channel (e.g. `xg0d`), on an editable page. Clean up any test nodes/variables created during verification.
