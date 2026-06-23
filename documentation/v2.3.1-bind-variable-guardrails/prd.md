# v2.3.1 PRD: `node_bind_variable` Guardrails

This document is the product/implementation spec for the **v2.3.1** release of `figma-edit-mcp`. Where v2.3.0 closed capability and contract gaps, v2.3.1 hardens a single tool — **`node_bind_variable`** — against three failure modes surfaced while validating a design-system build workflow (binding fills and auto-layout padding to tokens). The tool *works*, but it fails unhelpfully:

1. **§1 — Binding a color token to a node with no SOLID paint silently reports success.** The handler finds no paint to bind, pushes a `"No SOLID paints found"` note, and the call still returns `success: true`. The agent believes the token bound; nothing did. **This is a correctness bug, not just a papercut.**
2. **§2 — Mistyped bind fields are not caught.** `bindVariables` is an open `z.record`, so a misremembered key (`padding` for `paddingLeft`, `gap` for `itemSpacing`) passes the schema untouched and only fails deep inside Figma's `setBoundVariable`, as an opaque throw.
3. **§3 — Binding padding/spacing on a non-auto-layout frame throws an opaque Figma error.** `node.setBoundVariable('paddingLeft', …)` is only valid on an auto-layout frame; on a plain frame the agent gets Figma's raw exception with no guidance to set `layoutMode` first.

Each issue below was verified against the current tree; see **§Provenance** for file:line evidence. The spec was then stress-tested against an adversarial peer review and live execution on channel `xg0d` — see **§Peer review**, which hardened §1/§2 and **disproved** a proposed §3 expansion.

---

## Release identity

> [!IMPORTANT]
> **This is v2.3.1.** v2.3.0 (`documentation/v2.3.0-fix-feature-gaps/`) is the prior release; `package.json` currently reads `"version": "2.3.0"` (verified) — bump it to `2.3.1` as part of this release. This is a **patch**: it adds guardrails and fixes a silent-failure bug on one existing tool; no new tools, no new capabilities.

## API Change Notice (informational)

> [!NOTE]
> v2.3.1 tightens the input contract of `node_bind_variable` (§2: open key map → validated key allowlist) and changes its **failure behaviour** (§1: silent success → either a real bind or an honest error; §3: opaque throw → actionable error). **No sign-off required** — the project has zero end-users and backwards compatibility is explicitly not a constraint (project memory). All changes turn silent/opaque failures into either success or a recoverable error; none remove a working path.

---

## Decisions

> [!NOTE]
> **D1 — Version.** This release is **v2.3.1**. Bump `package.json` `2.3.0 → 2.3.1`.

> [!NOTE]
> **D2 — Silent-success on fill-bind (§1) — DECIDED.** Eliminate the silent `success` path entirely; never report success for a no-op. Behaviour when the target `fills`/`strokes` array contains **no SOLID paint** to bind splits by current state, to stay non-destructive:
> - **Empty paint array** → **auto-create** a single SOLID paint bound to the variable (`figma.variables.setBoundVariableForPaint({type:'SOLID', color:{r:0,g:0,b:0}}, 'color', variable)` → assign). The colour is **not** a creative choice — it is driven entirely by the bound variable's resolved value — so this stays within the project's "don't invent design decisions" rule, and makes "bind a colour token to fills" a reliable one-call operation.
> - **Non-empty but only non-SOLID paints** (e.g. an existing IMAGE/GRADIENT fill) → **throw** a structured error rather than clobber the existing fill. Binding a colour token onto an image fill is ambiguous; surface it.
>
> **Fill-branch hardening (adversarial peer review).** Three additional guards on the same `fills`/`strokes` path:
> - **Non-color variable (Finding 4):** before any paint bind, assert `variable.resolvedType === 'COLOR'`; otherwise throw a clean "cannot bind a non-color variable to `${field}`" error. This covers the **whole** branch (existing paints *and* the auto-create path), not just auto-create — `setBoundVariableForPaint(..., 'color', v)` throws on a FLOAT/STRING variable today, opaquely.
> - **`figma.mixed` / unsupported node (Finding 1):** before `JSON.parse(JSON.stringify(node[field]))`, guard `!(field in node)` and `node[field] === figma.mixed`. A GROUP has no `fills`; a text node with per-character colours returns `figma.mixed`. Both currently degrade to an opaque wrapped `SyntaxError` (`JSON.stringify(undefined|symbol)` → `JSON.parse("undefined")`) — caught by the existing try/catch but meaningless. Throw clean errors instead.
> - **Multiple SOLID paints (Finding 5):** binding intentionally binds the token to **all** SOLID paints in the array — unchanged. Single-fill is the common case; multi-solid is rare. Documented so it is a decision, not an accident.
>
> Unbind (`variableId: null`) on a node with no solid paint is a no-op by definition and returns a clear "nothing to unbind" message (not an error). *(Rejected alternative: pure "make it loud" — throw in all no-op cases. Auto-create for the empty case removes a guaranteed round-trip with no semantic risk.)*

> [!NOTE]
> **D3 — Bind-field allowlist (§2) — DECIDED (revised in implementation; see "Implementation outcome" below).** Replace the open `z.record(z.string().nullable())` for `bindVariables` with a key allowlist, rejecting unknown keys at the protocol boundary with a "did you mean" hint. **Derive the allowlist from the Figma typings, not a hand-curated list.** Adversarial review showed the original hand list was missing **nine** valid fields (`strokeTopWeight`/`strokeRightWeight`/`strokeBottomWeight`/`strokeLeftWeight`, `gridRowGap`, `gridColumnGap`, `fontFamily`, `fontStyle`, `fontWeight`) — a too-aggressive allowlist would **falsely reject valid binds**, which is *worse* than the typo problem it solves (Figma already rejects typos, just opaquely). The allowlist is `BINDABLE_FIELDS` = the `VariableBindableNodeField | VariableBindableTextField` union (`@figma/plugin-typings`) plus the paint pseudo-fields `fills`/`strokes`. This catches the **pure-typo** class only; "valid field, wrong node type" remains state-dependent and is handled per §3 / by Figma.
>
> **Implementation outcome (revised D3).** The originally-specified mechanism — `.superRefine` over a hand-written `BINDABLE_FIELDS`, type-pinned with `satisfies … (VariableBindableNodeField | VariableBindableTextField | …)[]` — was replaced during implementation+review for two concrete reasons, then verified:
> - `@figma/plugin-typings` exports those types as **ambient globals** (the `.d.ts` is a global script; the package entry only `declare global`s), so `import type { VariableBindableNodeField } from "@figma/plugin-typings"` does **not** resolve (`TS2305`) — the `satisfies` clause would reference unresolved types.
> - The project **never runs `tsc`** (build = `tsup`/esbuild, tests = `bun`, CI = neither), so a `satisfies` pin is **never evaluated** — the "compile error on drift" guarantee would be vacuous. (A `satisfies` is also one-directional: it catches removals, not the realistic case of an *added* field.)
>
> Shipped instead: **`BINDABLE_FIELDS` is generated from the typings** by `scripts/gen-node-fields.ts` (the repo's existing typings-codegen, which already emits `nodeFields.generated.ts`) into `src/mcp_server/tools/bindableFields.generated.ts`; the schema is **`z.partialRecord(z.enum(BINDABLE_FIELDS), z.string().nullable(), { error })`** (so the allowlist is also published in the wire JSON schema as `propertyNames.enum`, not merely enforced at runtime); and drift is caught by a **`check:generated` CI step** (regenerate + `git diff --exit-code`) that fails when the committed file falls out of sync with the typings — replacing the non-functional `satisfies` pin with an actually-enforced guard.

> [!NOTE]
> **D4 — Auto-layout precheck (§3) — DECIDED.** In the plugin handler, before the generic `node.setBoundVariable(field, variable)`, detect auto-layout-only fields (`paddingLeft/Right/Top/Bottom`, `itemSpacing`, `counterAxisSpacing`) on a node whose `layoutMode` is absent or `"NONE"`, and **throw a clear, recoverable error** instructing the agent to set auto-layout first. **Do not auto-fix** by switching the frame to auto-layout — the layout mode and axis are semantic choices the caller did not make; detect and surface, never paper over (same advisory philosophy as v2.3.0 D4/D5). The precheck stays **narrow**: a peer-proposed extension to two more layout states was live-tested and **rejected** (see §Peer review, Finding 3).

> [!NOTE]
> **All decisions recorded and confirmed.** D2 auto-creates for the empty-fill case, throws for the non-empty-non-solid case, and adds the peer-review fill-branch guards (non-color variable, mixed/unsupported node, multi-solid intent); D3 closes the bind-field key set by **generating it from the Figma typings** (codegen + a `check:generated` CI drift guard, replacing the originally-planned `satisfies` pin) and a `partialRecord`/`enum` schema; D4 prechecks auto-layout and is deliberately *not* expanded (the extra states accept the bind, confirmed live). No open questions remain.

---

## Scope & priority

| # | Change | Priority | Primary location |
| :- | :- | :-: | :- |
| §1 | Silent `success` on fill/stroke bind with no SOLID paint, + fill-branch guards | **P0** | `figma_plugin/handlers/variableHandlers.ts` |
| §2 | `bindVariables` key allowlist, typings-derived | **P1** | `src/mcp_server/tools/node.ts` |
| §3 | Auto-layout precheck for padding/spacing binds (opaque-throw repair) | **P1** | `figma_plugin/handlers/variableHandlers.ts` |

All three also require doc updates (see **§Documentation impact**).

---

## §1. Silent success + fill-branch guards on the paint-bind path (P0)

**The bug.** `node_bind_variable` with `{ fills: <colorVarId> }` on a node that has no SOLID paint does nothing and **reports success**. The agent has no signal that the token didn't bind — the worst failure shape, because it surfaces only much later (or never). Peer review surfaced three adjacent ways the same branch fails unhelpfully (Findings 1, 4, 5).

**Current behavior.**
- The `fills`/`strokes` branch clones the paint array via `JSON.parse(JSON.stringify(node[field]))`, rebinds each SOLID paint via `setBoundVariableForPaint`, and sets `modified = true` only if at least one SOLID paint was found (`variableHandlers.ts:812-826`).
- If `modified` is false, it pushes `"No SOLID paints found in ${field} to bind variable"` and `continue`s (`variableHandlers.ts:828-831`).
- The function returns `{ success: true, name, message }` regardless (`variableHandlers.ts:844`) — so the no-op is reported as success.
- The clone line itself throws an opaque `SyntaxError` on `figma.mixed` / nodes lacking the property (caught and wrapped, but meaningless); a non-COLOR variable makes `setBoundVariableForPaint` throw opaquely.

**v2.3.1 change (D2).** In the `fills`/`strokes` branch, add up-front guards, then replace the `modified === false` no-op with state-dependent handling:

*Up-front guards (Findings 1 & 4) — before reading `node[field]`:*
- **Unsupported node:** if `!(field in node)`, throw `node_bind_variable: '${node.name}' (type ${node.type}) has no '${field}' property to bind.`
- **Mixed paint:** if `node[field] === figma.mixed`, throw the mixed error below.
- **Non-color variable:** if `variable && variable.resolvedType !== 'COLOR'`, throw the type-mismatch error below. (Applies to the whole branch, not just auto-create.)

*No-SOLID-paint handling:*
- **`node[field]` empty** and binding (non-null variable): construct one bound SOLID paint and assign it.
  ```ts
  const bound = figma.variables.setBoundVariableForPaint(
    { type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", variable);
  node[field] = [bound];
  results.push(`Bound ${field} to variable ${variable.name} (created solid paint)`);
  ```
- **`node[field]` non-empty with no SOLID paint** and binding: `throw` the non-solid error below (do not clobber).
- **Unbind** (`variableId === null`) with no solid paint: push a clear `"nothing to unbind in ${field}"` note (not an error).

*Multiple SOLID paints (Finding 5):* when the array has several SOLID paints, the token is bound to **all** of them — unchanged, intentional. Documented so the behaviour is a decision, not an accident.

**Error strings.**
> `node_bind_variable: '${node.name}' has a non-solid ${field} (image/gradient) and no SOLID paint to bind a color token to. Set a solid fill first, or unbind the existing paint.`
>
> `node_bind_variable: '${node.name}' (type ${node.type}) has no '${field}' property to bind.`  *(unsupported node — Finding 1)*
>
> `node_bind_variable: '${field}' on '${node.name}' is mixed (multiple values); bind on a node with a single ${field} value.`  *(figma.mixed — Finding 1)*
>
> `node_bind_variable: cannot bind a non-color variable ('${variable.name}', ${variable.resolvedType}) to ${field}; ${field} requires a COLOR variable.`  *(type mismatch — Finding 4)*

**Notes.**
- Keep the existing per-field try/catch and the verification/scope guards untouched.
- The `node.setBoundVariable` generic path (scalars) is unaffected — it already throws on failure rather than no-op'ing.

**Tests.** Unit (extend `tests/unit/figma_plugin/annotationsAndVariables.test.ts`): binding a color var to a node with **one SOLID** paint still binds (regression); **empty** `fills` auto-creates a bound SOLID paint; **non-empty non-SOLID** `fills` **throws** and does not mutate `fills`; unbind on a node with no solid paint returns a non-error "nothing to unbind" message; the result is **never** `success` for a true no-op; a node lacking the property (e.g. GROUP) and a `figma.mixed` fill each throw their guard error **before** any paint mutation (Finding 1); a FLOAT/STRING variable bound to `fills` throws the non-color error (Finding 4); a node with **two** SOLID paints binds the token to **both** (Finding 5, documents intent).

---

## §2. `bindVariables` key allowlist, typings-derived (P1)

**The gap.** `bindVariables` accepts any string key, so a typo (`padding`, `gap`, `cornerRadius` vs `topLeftRadius`) is forwarded verbatim and fails only inside Figma's `setBoundVariable`, as an opaque throw the agent can't easily map back to "you used the wrong field name."

**Current behavior.**
- Schema: `bindVariables: z.record(z.string().nullable()).optional()` — open key set (`src/mcp_server/tools/node.ts:676-679`).
- The MCP server forwards `params` untransformed to the plugin (`node.ts:695-697`); the plugin dispatches unknown fields straight to `node.setBoundVariable(field, …)` (`variableHandlers.ts:834-836`).

**v2.3.1 change (D3, as implemented).** Constrain `bindVariables` keys to an allowlist **generated from the Figma typings** (not hand-curated, not a `satisfies` pin — see D3 "Implementation outcome"). `scripts/gen-node-fields.ts` reads `VariableBindableNodeField | VariableBindableTextField` from `@figma/plugin-typings` via the TS compiler API and emits `src/mcp_server/tools/bindableFields.generated.ts`:
```ts
// AUTO-GENERATED by scripts/gen-node-fields.ts from @figma/plugin-typings.
// fills/strokes + VariableBindableNodeField ∪ VariableBindableTextField (36 fields).
export const BINDABLE_FIELDS = ["fills", "strokes", "height", "width", /* … */ "paragraphIndent"] as const;
```
The schema uses `partialRecord` + `z.enum` (so the key set is also published in the wire JSON schema as `propertyNames.enum`), with a record-level `error` that rewrites the opaque `invalid_key` into the §2 error string + hint:
```ts
bindVariables: z
  .partialRecord(z.enum(BINDABLE_FIELDS), z.string().nullable(), {
    // only invalid_key is rewritten; value-type errors keep their default message
    error: (iss) => iss.code !== "invalid_key" ? undefined
      : `Unknown bind field '${iss.input}'. … (e.g. paddingLeft, …, strokeTopWeight).${hint(iss.input)}`,
  })
  .optional()
  .describe(`Map of property names to variable IDs … Valid fields: ${BINDABLE_FIELDS.join(", ")}. …`);
// hint(): alias map (padding→paddingLeft, gap→itemSpacing, cornerRadius→topLeftRadius, fill→fills, …)
// then a case-insensitive nearest-field fallback (fontsize→fontSize); else no hint.
```
> Why `partialRecord` not `z.record(z.enum(…))`: in Zod v4 an enum-keyed `z.record` requires **all** enum members as keys; `partialRecord` keeps every key optional (the actual contract).

> [!WARNING]
> The original hand-curated list (peer review, Finding 2) silently omitted **nine** valid fields — the four per-side stroke weights, `gridRowGap`/`gridColumnGap`, and `fontFamily`/`fontStyle`/`fontWeight` — which would have **falsely rejected valid binds**. Generating from the typings (with the `check:generated` drift guard) is the fix, not cosmetic.

**Error string (schema validation).**
> `Unknown bind field '${k}'. Valid fields are the Figma bindable node/text fields plus fills/strokes (e.g. paddingLeft, itemSpacing, topLeftRadius, fontSize, strokeTopWeight). (Did you mean '${suggestion}'?)`

**Notes.**
- Catches the **typo** class only; a valid field on the wrong node type (`paddingLeft` on a RECTANGLE) is state-dependent — handled by §3 for padding, or left to Figma for the rest.
- Consistent with `withStrictInputSchemas` (`tools/index.ts:30-46`), which already rejects unknown top-level keys; this extends the same honesty to the `bindVariables` map keys — and, via the published `propertyNames.enum`, advertises the valid set in the wire schema rather than only at call time.
- Maintenance coupling (D3): `BINDABLE_FIELDS` is **generated** from `VariableBindableNodeField | VariableBindableTextField`, and the `check:generated` CI step (regenerate + `git diff --exit-code`) fails when a typings add/remove isn't regenerated-and-committed — so it can't drift silently (and, unlike a `satisfies` pin, this is actually enforced, since the repo runs no `tsc`).

**Tests.** Unit (`tests/unit/tools/node_bind_variable.test.ts`): a valid map (`{paddingLeft: id}`) passes; `{padding: id}`/`{gap: id}` rejected with the hint (issue `code: "invalid_key"`); `fills`/`strokes` accepted; `strokeTopWeight` and `fontFamily` accepted (regression against the original incomplete list, Finding 2); lexical near-misses (`fill→fills`, `fontsize→fontSize`) get hints while unguessable keys get none; the wire JSON schema publishes the allowlist as `propertyNames.enum`; an empty/omitted `bindVariables` still valid (modes-only path).

---

## §3. Auto-layout precheck for padding/spacing binds (P1)

**The gap.** Binding `paddingLeft`/`itemSpacing`/etc. to a token only works on an auto-layout frame. On a plain frame, `node.setBoundVariable('paddingLeft', …)` throws Figma's raw error with no hint to set `layoutMode` first — and ordering (`set auto-layout → then bind padding`) is exactly the kind of structural-context rule agents miss.

**Current behavior.**
- The generic branch calls `node.setBoundVariable(field, variable)` with no precheck (`variableHandlers.ts:834-836`); any failure is wrapped as `Failed to set bound variable for ${field}: …` (`variableHandlers.ts:838-839`) — Figma's opaque message, no remediation.

**v2.3.1 change (D4).** Before the generic `setBoundVariable`, precheck auto-layout-only fields:
```ts
const AUTOLAYOUT_FIELDS = new Set([
  "paddingLeft","paddingRight","paddingTop","paddingBottom","itemSpacing","counterAxisSpacing",
]);
if (AUTOLAYOUT_FIELDS.has(field) &&
    (!("layoutMode" in node) || (node as any).layoutMode === "NONE")) {
  throw new Error(
    `node_bind_variable: cannot bind '${field}' on '${node.name}' — it is not an auto-layout frame. ` +
    `Set auto-layout (node_set_auto_layout with layoutMode HORIZONTAL or VERTICAL) first, then bind.`);
}
```

**Notes.**
- Detect-and-surface only; **never** auto-enable auto-layout (D4).
- Leaves all non-padding scalar binds to Figma's own validation (a deliberately narrow precheck — only the highest-frequency, most-confusing case).
- **Not expanded (peer review, Finding 3).** A proposed extension — also precheck binding `itemSpacing` under `primaryAxisAlignItems === "SPACE_BETWEEN"`, and `counterAxisSpacing` under `layoutWrap === "NO_WRAP"` — was **live-tested on channel `xg0d` and rejected**: both binds **succeed and persist** (verified via `boundVariables`). Figma accepts the bind at the property level regardless of those layout states, so adding guards would falsely reject valid operations.

**Tests.** Unit (extend `annotationsAndVariables.test.ts`): binding `paddingLeft` on a frame with `layoutMode: "HORIZONTAL"` succeeds (mock); binding `paddingLeft` on a frame with `layoutMode: "NONE"` throws the actionable error **before** `setBoundVariable` is called (assert the spy is not invoked); a non-padding scalar bind is unaffected.

---

## §Documentation impact

Update the single source of operational guidance (MCP resources + the `figma-edit` skill + in-repo `skills/figma-edit/references/`):

- **`error-playbook.md`** — recovery entries for: bind on a non-solid fill (§1: set a solid fill first or unbind), bind a non-color variable to fills (§1: use a COLOR variable), bind on a mixed/unsupported node (§1), unknown bind field (§2: use the exact Figma field name), and padding/spacing bind on a non-auto-layout node (§3: set `layoutMode` first).
- **`workflows.md` / `tool-selection.md`** — document the **ordering** for tokenised components: set auto-layout → bind padding/spacing; set a solid fill → bind the colour token. Note that binding a colour token to an **empty** fill auto-creates a bound solid paint.
- **`node_bind_variable` tool description** (`node.ts`) — name the valid bind fields and the ordering rules inline.

---

## §Testing & rollout

- **Build:** `figma_plugin` bundles to `code.js` (handlers are TS → bundled); rebuild and confirm the `node_bind_variable` dispatch reflects §1/§3. MCP server (`src/mcp_server`) rebuilds `dist/` via `bun run build:all` (regenerates `BINDABLE_FIELDS` first); confirm `check:generated` passes (allowlist in sync with the typings) and the §2 `partialRecord`/`z.enum` schema resolves under both Node and Bun.
- **Unit tests:** extend `tests/unit/figma_plugin/annotationsAndVariables.test.ts` (§1, §3) and the tool-schema suite under `tests/unit/tools/` (§2). All convert a previously silent/opaque path into an asserted success-or-error.
- **Manual verification (live Figma, channel like `xg0d`):** on an editable page — (§1) bind a COLOR var to a node with no fill (confirm a bound solid paint appears), to an image-filled node (confirm the structured error, fill untouched), and a non-COLOR var to fills (confirm the type-mismatch error); (§2) attempt `{padding: id}` and confirm schema rejection with hint, and `{strokeTopWeight: id}` succeeds; (§3) bind `paddingLeft` on a plain frame (confirm the "set auto-layout first" error), then set auto-layout and confirm the bind succeeds.
- **Version:** bump `package.json` `2.3.0 → 2.3.1` (D1).
- **CHANGELOG:** add a `v2.3.1` entry to `CHANGELOG.md` covering §1–§3 (silent-success + fill-branch guards, typings-derived bind-field allowlist, auto-layout precheck).

---

## §Peer review (adversarial)

This spec was stress-tested against an adversarial peer review (`critique.md`). Each claim was verified against `@figma/plugin-typings` and, where behavioural, against live channel `xg0d` before disposition:

| # | Claim | Verdict | Disposition |
| :- | :- | :- | :- |
| 1 | `JSON.parse(JSON.stringify(node[field]))` breaks on `figma.mixed` / nodes without the property | **Valid** — severity overstated (caught by the existing try/catch, so an *opaque error*, not a crash) | Folded into §1/D2 as up-front guards |
| 2 | Allowlist omits `strokeTopWeight`/`strokeRightWeight`/`strokeBottomWeight`/`strokeLeftWeight` | **Valid — and understated:** verification against the typings found **nine** missing (also `gridRowGap`/`gridColumnGap`/`fontFamily`/`fontStyle`/`fontWeight`) | §2/D3 changed to **generate the list from the typings** (codegen + `check:generated` drift guard; the originally-planned `satisfies` pin was dropped — it doesn't resolve against the ambient-global typings and the repo runs no `tsc`) |
| 3 | Binding `itemSpacing` under `SPACE_BETWEEN` and `counterAxisSpacing` under `NO_WRAP` throw | **False** — live-tested on `xg0d`: both **succeed and persist** in `boundVariables` | **Rejected;** §3/D4 left narrow |
| 4 | Non-COLOR variable bound to fills throws | **Valid but mis-scoped** — applies to the whole fills/strokes branch, not just auto-create | Folded into §1/D2 as a `resolvedType === 'COLOR'` guard on the whole branch |
| 5 | Token binds to all SOLID paints when several exist | **Valid (minor)** — pre-existing, intentional | Documented in §1/D2; behaviour unchanged |

The critique's one verifiable factual claim (#2) was both correct *and* incomplete — taking it at face value would have fixed four fields and left five broken. #3 was confirmed false only by live execution, not inspection; the test frame and variable were created and then deleted, leaving the document unchanged.

---

## §Provenance — issue verification

Every issue was confirmed against the current tree before this PRD was written:

| Issue | Verified at | Finding |
| :- | :- | :- |
| §1 Silent success on fill-bind | `variableHandlers.ts:812-831`, `:844` | `fills`/`strokes` branch sets `modified` only when a SOLID paint exists; otherwise pushes `"No SOLID paints found"` and `continue`s, yet the function returns `success: true` — a no-op reported as success. |
| §1 Mixed/unsupported clone crash | `variableHandlers.ts:815` | `JSON.parse(JSON.stringify(node[field]))` throws on `figma.mixed` (→ `JSON.stringify` is `undefined`) and on nodes lacking the property; wrapped by the try/catch into an opaque message. |
| §2 Open bind-field map | `src/mcp_server/tools/node.ts:676-679`, `:695-697` | `bindVariables: z.record(z.string().nullable())` accepts any key; the server forwards untransformed and the plugin dispatches unknown fields straight to `node.setBoundVariable` (`variableHandlers.ts:834-836`). |
| §2 Bindable field set | `@figma/plugin-typings/plugin-api-standalone.d.ts:5772-5807` | Authoritative `VariableBindableNodeField` (incl. four per-side stroke weights, `gridRowGap`/`gridColumnGap`) and `VariableBindableTextField` (incl. `fontFamily`/`fontStyle`/`fontWeight`); the basis for the derived allowlist. |
| §3 Opaque throw on padding bind | `variableHandlers.ts:834-839` | Generic branch calls `node.setBoundVariable(field, …)` with no auto-layout precheck; failures wrap as `Failed to set bound variable for ${field}` with Figma's raw message and no remediation. |
