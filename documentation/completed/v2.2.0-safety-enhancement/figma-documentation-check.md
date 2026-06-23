# Figma Documentation Validation & Optimization Check

This document outlines the gaps, checks, and optimizations identified by reviewing the official Figma MCP guidelines (`SKILL.md`, `gotchas.md`, and `validation-and-recovery.md`) against the `figma-edit-mcp` local codebase.

> **Status / organization.** Findings that have been incorporated into `prd.md` (v2.2.0) are collected at the bottom under **[Promoted to prd.md](#promoted-to-prdmd)** — their original section numbers (**§1, §2, §3, §5, §6A, §6D**) are preserved there so `prd.md` cross-references stay valid. The main body below holds only **open review notes** (backlog/advisory items judged out of theme for the v2.2.0 safety release), the framing context, and the "already handled" confirmations. Every claim was checked against the source, not inferred from the docs.

---

## 0. Framing: these docs describe a *different* runtime than this project

The three Figma files document the **`use_figma` code-execution sandbox** — an `eval`-style tool where the model writes a one-shot JS script that runs and returns a value. This repository is a **conventional Figma plugin** ([figma_plugin/](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin) + [ui.html](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/ui.html)) driven by a per-command dispatcher. A large slice of the guidance is **sandbox-only** and must **not** be ported as plugin rules:

- *"Never use `figma.notify()`"* — this plugin uses it **12×** legitimately (e.g. [main.ts:165,193,197](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts#L165)); it only throws inside the sandbox.
- *"MUST `return` all IDs"*, *"no async IIFE"*, *"`console.log` is invisible"*, *"≤10 ops per call"*, *"`setCurrentPageAsync` once per call"*, `placeholder`/`screenshot`, `node.query`/`node.set`/`createAutoLayout`, *"`getPluginData` unsupported"* — all sandbox-runtime rules, not Plugin-API truths.

The portable, valuable parts are the **Plugin-API gotchas** (font loading, sizing rules, immutable paints, `resize()` side-effects) and the **validation workflow**. Everything below is filtered against that line.

---

# Open review notes (not promoted to prd.md)

These remain here as backlog/advisory — verified against the code, but out of theme for the v2.2.0 safety/validation release.

## 4. Batching Sequential Awaits — correct, but under-scoped

### The Gap
Awaiting async lookups sequentially in a loop serializes round-trip latency. Verified at [textHandlers.ts:113](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/textHandlers.ts#L113) (`figma.getNodeByIdAsync` inside a `for` loop).

### What the original finding missed (verified)
*   **Triple resolution per item.** In `text_set_content` each node is resolved **three times**: the pre-validation loop [main.ts:389-403](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts#L389-L403), then the handler at [line 113](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/textHandlers.ts#L113), then `setTextContent` at [line 27](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/textHandlers.ts#L27). The real win — and the one consistent with the v2.1.0 "reuse the resolved-node reference" rule (PRD D6) — is to resolve **once** and thread the reference, not just add a `Promise.all` inside the handler.
*   **Pattern, not a one-file fix.** The same serialized-await loop lives in the other batch validators: [node_delete:450](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts#L450), [annotation_set:422](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts#L422), [create_component_set:643](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts#L643), [instance_set_overrides:493](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts#L493). (Note: `variable_delete` already batches correctly via `Promise.all` at [variableHandlers.ts:507-509](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/variableHandlers.ts#L507-L509).)
*   **Lookups aren't the dominant cost.** Per-item `await sendProgressUpdate` and the `await new Promise(r => setTimeout(r, 0))` at [line 159](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/textHandlers.ts#L159) serialize more wall-clock than the node lookups; batching only the lookups is a modest gain.

### Recommended Action
Treat this as a **batch-validator pattern**: pre-fetch all targets once with `Promise.all`, and thread the resolved references through to the mutating handler (eliminating the 2nd/3rd re-resolution) rather than fetching the same nodes at each layer.
```typescript
const nodes = await Promise.all(items.map(i => figma.getNodeByIdAsync(i.nodeId)));
```

---

## 6. Additional advisory checks (from the 3 docs)

> The two items originally in this section that became `prd.md` changes — **§6A (`resize()` resets sizing modes)** → prd.md §9, and **§6D (variant-component property guard)** → prd.md §5 — have moved to [Promoted to prd.md](#promoted-to-prdmd). The remaining advisory items stay here.

### 6B. Variables are created with `ALL_SCOPES`
SKILL/gotchas: *"always set `variable.scopes` explicitly when creating variables."* Verified: the `CREATE_VARIABLE` path never assigns `scopes` (the only `.scopes` reference, [variableHandlers.ts:371](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/variableHandlers.ts#L371), is read-only output). Every agent-created variable defaults to `ALL_SCOPES` and pollutes every property picker. Quality, not safety — but cheap to expose an optional `scopes` parameter on `variable_manage`.

### 6C. No font-style discovery + hardcoded Inter style names
SKILL: *"`SemiBold` vs `Semi Bold` is a common footgun — verify via `listAvailableFontsAsync`."* Verified: there is no font-listing tool anywhere, and `create_text` maps weight→style with hardcoded strings (e.g. `"Semi Bold"`) in [getFontStyle, nodeCreators.ts:305-328](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeCreators.ts#L305-L328) that only exist for Inter-like families. `create_text` swallows the throw and falls back ([nodeCreators.ts:366](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeCreators.ts#L366)); `text_set_style` would surface a raw `loadFontAsync` error. **Action:** consider a `font_list` read tool, or at minimum an error-playbook entry for the style-name footgun.

### 6E. Advisory (best surfaced in tool descriptions, not guards)
*   **TEXT created without `textAutoResize`** ignores `FILL` and threads into a tall, narrow column (gotchas). `create_text` never sets it (only present in [nodeFields.generated.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/utils/nodeFields.generated.ts#L158) as a readable field).
*   **Reparented nodes keep absolute x/y** (gotchas). `insertChild` ([nodeModifiers.ts:498-507](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeModifiers.ts#L498-L507)) doesn't reset position, so a child moved into a non-auto-layout parent can land offscreen.

### 6F. Encode a "validate-after-write" loop in the agent docs
`validation-and-recovery.md`/SKILL describe an inspect → mutate → re-inspect → fix rhythm, with a *"STOP, don't blind-retry"* rule on error. The project already ships the equivalents of `get_metadata` (`node_info`) and `get_screenshot` (`node_export_visual`). **Action:** adopt this rhythm explicitly in `workflows.md`/`error-playbook.md` ("after a structural edit, read back; on error stop and re-inspect before retrying").

---

## 7. Already handled correctly (no action — confirmation)

*   **SOLID-only / empty-fills variable binding** (gotchas) — [setBoundVariable](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/variableHandlers.ts#L734-L751) clones the paints array, binds only `SOLID` paints, **captures** the new paint from `setBoundVariableForPaint`, and returns a clear `"No SOLID paints found"` failure instead of silently no-op'ing.
*   **`combineAsVariants` requires COMPONENTs** (gotchas) — validated at [componentHandlers.ts:724](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/componentHandlers.ts#L724). (Duplicate-variant uniqueness remains open — that is PRD §11.)
*   **Paint `color` must omit `a`; opacity at paint level** — all handlers comply. The only remaining color bug is the `NaN`-opacity issue (PRD §12), verified: buggy in [createFrame:247](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeCreators.ts#L247) / [createText:382](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeCreators.ts#L382), but safe in `createShape` ([:128](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeCreators.ts#L128)), `setFillColor` ([:38](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/stylingHandlers.ts#L38)), and `setStroke` ([:104](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/stylingHandlers.ts#L104)).
*   **`FILL` needs an auto-layout parent** (PRD §8) and **page switching via `setCurrentPageAsync`** ([viewNavigate, nodeModifiers.ts:311](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeModifiers.ts#L311)) — already correct.
*   **`counterAxisAlignItems` has no `STRETCH`** — schema enums already exclude it.

---

## Priority summary (index of all findings)

| Priority | Item | Status |
| :-: | :- | :- |
| **High** | §1 — `text_set_style` schema↔handler contract (not just `lineHeight`) | **Promoted → prd.md §15** |
| **High** | §2 — silent early-return drop in `setAutoLayout` (no `HUG` guard) | **Promoted → prd.md §8** |
| **High** | §3 — scope `skipInvisibleInstanceChildren`; exclude `variable_delete` scan | **Promoted → prd.md §6B** |
| **Medium** | §5 — adopt `getStyledTextSegments` for §10 | **Promoted → prd.md §10** |
| **Medium** | §6A — `resize()` resets sizing modes | **Promoted → prd.md §9** |
| **Medium** | §6D — variant-component property guard | **Promoted → prd.md §5** |
| **Low** | §4 — batching awaits (batch-validator ref reuse) | Open (backlog) |
| **Low** | §6B — variable `scopes` default | Open (backlog) |
| **Low** | §6C — font-style discovery / hardcoded Inter styles | Open (backlog) |
| **Low** | §6E — TEXT autoresize / reparent x-y tool-desc notes | Open (advisory) |
| **Low** | §6F — "validate-after-write" rhythm in agent docs | Open (docs) |

---

# Promoted to prd.md

The findings below have been incorporated into `prd.md` (v2.2.0) and are retained here for traceability. **Section numbers are preserved** so existing `prd.md` cross-references (which cite `figma-documentation-check.md §1/§2/§3/§5`) remain valid. Each heading lists where it landed.

## 1. Inconsistent `lineHeight` Schema + broken `text_set_style` contract → **prd.md §15** (+ the `lineHeight` AUTO item within it)

### The Gap
In Figma, setting line height back to its auto/intrinsic value requires passing `{ unit: "AUTO" }` (no `value` field).
*   In the style tool [style.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/style.ts#L36-L39), `lineHeight` is correctly a union supporting `{ unit: "AUTO" }`.
*   In the text-node tool [text.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/text.ts#L56-L62), `lineHeight` requires `value: z.number()`, so the agent cannot reset an individual text node's line height to `AUTO`.

### Deeper deficiency (verified): the `text_set_style` schema↔handler contract is broken on more than `lineHeight`
The handler [setTextStyle](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/textHandlers.ts#L206-L209) destructures `fontFamily, fontStyle, textAlignHorizontal, textAlignVertical`, but the schema sends `fontName:{family,style}` and `paragraphIndent`, and [main.ts:410](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts#L410) forwards `params` untransformed. Verified consequences:
*   **`fontName` is silently dropped.** `fontFamily`/`fontStyle` are always `undefined`, so `if (fontFamily || fontStyle)` ([textHandlers.ts:223](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/textHandlers.ts#L223)) never runs — the tool cannot actually change a font.
*   **`paragraphIndent`** is accepted by the schema but never applied by the handler.
*   **`textAlignHorizontal`/`textAlignVertical`** are applied by the handler but **absent from the schema**, so the agent cannot reach them.

### Recommended Action
Align the `text_set_style` schema to [style.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/style.ts) **and** reconcile it with the handler in the same pass:
```typescript
lineHeight: z.union([
    z.object({ unit: z.literal("AUTO") }),
    z.object({ value: z.number(), unit: z.enum(["PIXELS", "PERCENT"]) }),
]).optional()
```
Then either (a) make the handler read `fontName.family`/`fontName.style` (preferred — matches `style_manage`), or (b) flatten the schema to `fontFamily`/`fontStyle`; add `textAlignHorizontal`/`textAlignVertical` to the schema; and apply `paragraphIndent`. Fixing only `lineHeight` leaves a tool that still can't set a font.

---

## 2. Auto-layout sizing: the original `HUG` finding was based on an incorrect premise → **prd.md §8** (silent-drop sub-case + the `[!NOTE]` rejecting a separate `HUG` guard)

> **Correction.** The originally proposed guard
> `if (layoutSizingHorizontal === "HUG" && node.layoutMode === "NONE") throw …`
> is effectively **dead code**, and the "this triggers a hard exception on a plain frame" claim does not hold. Verified against [layoutHandlers.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/layoutHandlers.ts):

### Why the original premise fails
*   [setAutoLayout](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/layoutHandlers.ts#L74-L82) **early-returns** when `node.layoutMode === "NONE"`. Calling it on a plain frame with just `layoutSizingHorizontal:"HUG"` returns *before* the sizing code at [line 115](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/layoutHandlers.ts#L115) — no exception is thrown.
*   The sizing code is only reachable when `layoutMode !== "NONE"`, i.e. the frame **is** auto-layout — and `HUG` on an auto-layout frame's own axis (hug its children) is **valid**. So the proposed throw can never fire in a correct scenario.
*   The `HUG`-invalid-context case the gotcha actually describes (`HUG` on a non-`TEXT`, non-auto-layout *child*) does not map onto this tool at all: `setAutoLayout` only sets sizing on the frame **itself**, never on arbitrary children.

### The real deficiency: a silent no-op (same class as PRD §9)
Calling `setAutoLayout` with sizing / padding / alignment on a `NONE` frame (without also setting `layoutMode`) hits the early return and returns `{ id, name, layoutMode }` with **no error and no effect**. The agent believes it configured the frame; nothing happened.

### Recommended Action
Drop the proposed `HUG` check. Instead, address the **silent drop**: when auto-layout-only properties are supplied but the frame is (and remains) `NONE`, either reject with guidance ("set `layoutMode` to HORIZONTAL/VERTICAL first") or surface a `warnings: [...]` entry — consistent with the PRD §9 stance against silent success. The genuine value-context rule that *does* belong here is the **`FILL` requires an auto-layout parent** guard, already captured as PRD §8.

---

## 3. Performance: `figma.skipInvisibleInstanceChildren` — valid, but **do not set it globally** → **prd.md §6B** (`[!CAUTION]`)

### The Gap (confirmed)
The Figma guide recommends `figma.skipInvisibleInstanceChildren = true` for read-only traversals that don't need invisible instance interiors. Verified: the flag is set **nowhere** in the codebase (grep returns no matches). Full-document scans such as the variable-deletion consumer check ([variableHandlers.ts:524](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/variableHandlers.ts#L524)) run without it.

> **Correction.** The original recommendation — *"initialize it globally in [main.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/src/main.ts)"* — would introduce a **safety regression**.

### Why "global" is unsafe
`variable_delete`'s consumer scan ([findVariableConsumers, variableHandlers.ts:524](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/variableHandlers.ts#L524), walking every page) **must see hidden nodes**. A variable consumed only by an invisible node inside an instance would become invisible to the scan, so the "no consumers ⇒ safe to delete" check would wrongly pass and delete an in-use variable. The gotcha itself warns: *"Don't set it if you need to read/mutate hidden variant states."*

### Recommended Action
Scope the flag to specific discovery reads (e.g. set it at the start of a `node_info`/search traversal and reset it after), and **explicitly exclude the `variable_delete` consumer scan** (and any other correctness-critical full-tree walk). Do **not** set it process-wide in the plugin entry point.

---

## 5. Simplify Font Loading in §10 using `getStyledTextSegments` → **prd.md §10**

### The Gap
To avoid `Cannot write to node with unloaded font` when mutating mixed-font nodes, PRD §10 originally proposed reusing the legacy string-delimiter helper `buildLinearOrder` ([textUtils.ts:37](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/utils/textUtils.ts#L37)). The Figma gotchas guide recommends the native `textNode.getStyledTextSegments(['fontName'])` instead. Verified: `getStyledTextSegments` is used **nowhere**; the legacy path is the only one present.

### Why this is stronger than "edge-case prone"
`buildLinearOrder` contains a **live bug**: [textUtils.ts:58-61](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/utils/textUtils.ts#L58-L61) calls
`node.getRangeFontName(spacesRangeStart, spacesRangeStart[0])` — indexing a **number** (`spacesRangeStart[0]` ⇒ `undefined`). Replacing it with the native API isn't just simpler; it sidesteps broken code.

### Recommended Action
Use `getStyledTextSegments(['fontName'])` to resolve and preload all fonts in §10:
```typescript
const segments = textNode.getStyledTextSegments(['fontName']);
const fonts = uniqBy(segments.map(s => s.fontName), f => `${f.family}::${f.style}`);
await Promise.all(fonts.map(f => figma.loadFontAsync(f)));
```
Refinements: dedupe fonts before `loadFontAsync` (cheap), and short-circuit when `node.fontName !== figma.mixed` (single font — load it directly).

---

## 6A. `resize()` silently resets sizing modes to `FIXED` — affects `node_transform` → **prd.md §9**

The gotchas guide notes `resize()` silently resets `primaryAxisSizingMode`/`counterAxisSizingMode` (and `layoutSizing*`) to `FIXED`. `node_transform` calls `node.resize()` at [nodeModifiers.ts:51](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/nodeModifiers.ts#L51), so resizing a node that had `HUG`/`FILL` silently reverts those modes. This is adjacent to PRD §9 but distinct (it affects the resized node itself, not a layout-controlled child). **Action:** document on `node_transform`, and ideally read-back and surface a `warnings` entry when the resize changed a non-`FIXED` sizing mode.

---

## 6D. `component_manage_property` on a *variant* COMPONENT throws → **prd.md §5**

gotchas: `addComponentProperty` is invalid on a variant member (a `COMPONENT` whose parent is a `COMPONENT_SET`). The handler guards `COMPONENT`/`COMPONENT_SET` ([componentHandlers.ts:865](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/componentHandlers.ts#L865)) but not the variant-member case, so it degrades to a wrapped raw error rather than structured guidance. **Action:** fold into PRD §5 — if `node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET"`, reject with "manage the property on the component set instead."
