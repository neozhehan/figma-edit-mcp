# v2.0.0 Deep Adversarial Review & Critique

This document presents the findings of a deep adversarial review of all files in the `documentation/v2.0.0` folder, cross-referenced with the current codebase implementation. 

We have identified **5 critical architectural/logic gaps**, **2 documentation contradictions**, and **2 minor api/usability gotchas** that could block or cause runtime crashes during the v2.0.0 release.

---

## 1. Critical Gaps & Potential Runtime Crashes

### 1.1 The Circular Reference Serialization Crash (Systemic Gotcha)
* **Affected Files:** `documentation/v2.0.0/node-fields.md`, `figma_plugin/handlers/nodeReaders.ts`
* **The Problem:** In the new `node-fields.md`, fields such as `parent`, `mainComponent`, `stuckNodes`, `attachedConnectors`, and `exposedInstances` are documented as returning `string`, `string | null`, or `string[]` (representing the Figma node IDs).
  However, in `nodeReaders.ts` (specifically inside `extractProperties`), these fields are fetched dynamically from the Figma node:
  - `val = (node as any)[key]` for synchronous fields like `parent`, `stuckNodes`, `attachedConnectors`, and `exposedInstances`.
  - `val = await (node as any).getMainComponentAsync()` for `mainComponent`.
  Figma's native API returns **live Figma node/component objects** (or arrays of them) rather than string IDs.
* **The Crash:** When these live node objects are assigned to `props[key]` and passed back via `figma.ui.postMessage`, they will throw a serialization error (`TypeError: Converting circular structure to JSON` or `DataCloneError: The object could not be cloned`) and crash the plugin in the real Figma desktop app.
* **Why tests missed this:** The unit tests (e.g., `v140Contracts.test.ts`) mock `getMainComponentAsync` to return a plain JS object `{ id: "123:45", name: "MyComponent", type: "COMPONENT" }` which serializes without issue. A real Figma node has circular properties and host methods that cannot be serialized.
* **Mitigation:** The plugin-side implementation of `extractProperties` in `nodeReaders.ts` must explicitly intercept these reference properties and map them to their string IDs before returning.
  ```typescript
  if (key === "parent" && node.parent) {
      val = node.parent.id;
  } else if (key === "mainComponent" && typeof node.getMainComponentAsync === "function") {
      const component = await node.getMainComponentAsync();
      val = component ? component.id : null;
  } else if (key === "stuckNodes" && node.stuckNodes) {
      val = node.stuckNodes.map(n => n.id);
  } // ... same mapping for attachedConnectors and exposedInstances
  ```
* **Review verdict (verified against code, 2026-06-05): VALID — with two corrections.**
  * **Mechanism confirmed.** [`extractProperties`](../../figma_plugin/handlers/nodeReaders.ts) (lines 404–419) assigns raw `node[key]` for safe-list fields; that result crosses [`figma.ui.postMessage`](../../figma_plugin/src/main.ts) (main.ts:195), whose structured clone cannot serialize a live Figma node. `parent`, `mainComponent`, and `exposedInstances` are **already** in `SAFE_LIST_PROPERTIES`, so this is a **pre-existing latent bug** — *not* introduced by `node-fields.md`, which documents the correct ID behavior (`string` / `string[]`). The fix is impl-matches-doc.
  * **Correction 1 — caught error, not a plugin crash.** The throwing `postMessage` sits inside the try/catch at main.ts:192–206, so it surfaces as a `command-error` ("…could not be cloned") → a **failed `node_info`**, not a Figma crash. Severity is "workhorse read returns a cryptic error on common fields," not "runtime crash."
  * **Correction 2 — `stuckNodes` / `attachedConnectors` are NOT affected.** Neither is in `SAFE_LIST_PROPERTIES`, so they take the `exportAsync(JSON_REST_V1)` path (already-serialized JSON) and never hit `node[key]`. The actual crash set is **`parent` / `mainComponent` / `exposedInstances`**. (They remain node-reference fields and must be id-mapped once the safe-list is regenerated from typings.)
  * **Resolution:** captured as an explicit id-mapping requirement in [tasks.md](./tasks.md) **R3.8** and a *Node-reference fields* section in [node-fields.md](./node-fields.md). Fix = map references → `.id` / `.id[]` in `extractProperties`; **must be verified in a live Figma session** (unit tests mock these as plain objects, so they clone fine and pass green).

### 1.2 The `create_shape` and `createRectangle` Color Gap (API Gap)
* **Affected Files:** `documentation/v2.0.0/tasks.md` (R3.3), `figma_plugin/handlers/nodeCreators.ts`
* **The Problem:** The new `create_shape` tool consolidates the three shape tools and exposes optional `fillColor` and `strokeColor` parameters across all shapes (including rectangles).
  However, the plugin-side implementation of `createRectangle` in `figma_plugin/handlers/nodeCreators.ts` completely lacks logic to apply fills or strokes:
  ```typescript
  const rect = figma.createRectangle();
  rect.x = x;
  rect.y = y;
  rect.resize(width, height);
  rect.name = name;
  // Fills and strokes are never checked or applied here!
  ```
* **The Result:** If an agent attempts to create a rectangle with colors (e.g., `create_shape({ type: "RECTANGLE", fillColor: {r:1, g:0, b:0, a:1} })`), the colors will be silently ignored, resulting in a default gray rectangle.
* **Mitigation:** The plugin's `createRectangle` handler must be updated to apply `fillColor`, `strokeColor`, and `strokeWeight` parameters, matching the logic in `createEllipse` and `createPolygonStar`.
* **Review verdict (verified against code, 2026-06-05): VALID — but already planned, and `strokeWeight` is out of scope.**
  * **Confirmed:** [`createRectangle`](../../figma_plugin/handlers/nodeCreators.ts) (lines 19–71) applies no fill/stroke; [`createEllipse`](../../figma_plugin/handlers/nodeCreators.ts) (414–428) and `createPolygonStar` (492–505) both do.
  * **Already planned — not a gap:** the `create_shape` merge exists *specifically* to fix this — see tasks **R3.3** ("port the fill/stroke block to the RECTANGLE branch") and consolidation-sweep **C1** ("bonus fix"). The finding confirms the code to change; it does not reveal a missing decision.
  * **Correction:** `strokeWeight` is **not** "matching the logic in `createEllipse`/`createPolygonStar`" — neither sibling applies `strokeWeight`, and it isn't in the `create_shape` schema. Fix = `fillColor` + `strokeColor` only.

### 1.3 `createPolygonStar` `pointCount` Parity Bug (Usability Gotcha)
* **Affected Files:** `documentation/v2.0.0/tool-reference.md`, `figma_plugin/handlers/nodeCreators.ts`
* **The Problem:** For stars (`innerRadius < 1.0`), the plugin implementation in `createPolygonStar` expects `pointCount` to be the *total vertex count* (spikes + inner vertices), which must be even. It then divides it by 2 to set Figma's spike count (`node.pointCount = pointCount / 2`).
  However, the parameter description in the tool reference and the server schema states:
  > `"Total vertex count (≥3). For stars, this is the number of points."`
* **The Contradiction:** If an LLM/user wants to create a 5-point star, they will naturally pass `pointCount: 5`. The plugin will immediately crash, throwing `"Stars require even pointCount"`. To succeed, the client must pass `pointCount: 10`, which directly contradicts the documented description.
* **Mitigation:** The plugin's `createPolygonStar` handler should be refactored to accept `pointCount` as the number of spikes (points) directly (matching Figma's native API behavior, where `pointCount` is the number of spikes) and set it directly without dividing by 2 or enforcing even parity.
* **Review verdict (verified against code, 2026-06-05): VALID — and the silent bug is worse than the crash.** Confirmed: [`createPolygonStar`](../../figma_plugin/handlers/nodeCreators.ts) star branch does `node.pointCount = pointCount / 2` and throws on odd counts (lines 479–483); the polygon branch is native and fine.
  * **Correction:** the even requirement *is* documented — [creation.ts:370](../../src/mcp_server/tools/creation.ts) says "If < 1.0, pointCount must be even" — so it isn't a pure surprise crash.
  * **Worse than stated:** the quiet failure dominates — `pointCount: 10` silently yields a **5-spike** star (half the requested points), contradicting the schema's own "number of points" wording at [creation.ts:369](../../src/mcp_server/tools/creation.ts), which is itself self-contradictory ("total vertex count" vs "number of points").
  * **Fix (as proposed):** set `node.pointCount = pointCount` directly (drop `/2` + even check) to match Figma-native `StarNode.pointCount` = spikes; rewrite the `pointCount` description and drop "must be even." Captured in tasks **R3.3** + [tool-reference.md](./tool-reference.md) (`create_shape`).

### 1.4 Variable Name Resolution Gap for Fills and Strokes (Functional Gap)
* **Affected Files:** `documentation/v2.0.0/tasks.md` (R3.3), `figma_plugin/handlers/variableHandlers.ts`
* **The Problem:** The plan is to fold `get_node_variables` into `node_info` by adding resolved variables as an async branch in `extractProperties`. However, the resolution helper `getNodeVariables` resolves bound variables via a shallow check:
  ```typescript
  if (alias && alias.id) {
      // Resolve ID to name...
  } else {
      resolvedBindings[field] = alias; // Keep raw
  }
  ```
* **The Gap:** For colors bound to `fills` or `strokes` (which is the most common use case in design systems), `node.boundVariables` returns an *array* of aliases (e.g. `fills: [ { id: "var-123", type: "VARIABLE_ALIAS" } ]`). Because `alias` is an array, it has no top-level `.id` property. The resolver falls into the `else` branch and returns the raw alias array.
* **The Result:** The folded `node_info` tool will fail to resolve names for variables bound to colors (`fills` or `strokes`), returning raw IDs instead.
* **Mitigation:** The resolution helper must be updated to recursively check for arrays and nested objects of aliases to ensure nested alias IDs (especially in `fills` and `strokes`) are properly resolved.
* **Review verdict (verified against code, 2026-06-05): VALID — material, and a plan gap.** [`getNodeVariables`](../../figma_plugin/handlers/variableHandlers.ts) resolves only a top-level `.id` (line 652); `fills`/`strokes`/`effects`/`layoutGrids` bindings are **arrays** of aliases and `componentProperties` is a **nested map**, so all fall into the `else` branch (line 666) and return **raw IDs** — i.e. the most common case (a color token on a fill) never resolves. Not a crash; silent incompleteness, pre-existing in `get_node_variables`. R3.3 said "reuse the resolution logic," which would inherit the bug — **now fixed in R3.3**: the reused resolver must recurse into arrays and nested objects.

### 1.5 `node_transform` Partial Updates Gotcha (Logic Gap)
* **Affected Files:** `documentation/v2.0.0/tasks.md` (R3.3), `figma_plugin/handlers/nodeModifiers.ts`
* **The Problem:** `node_transform` is proposed to merge `move_node` and `resize_node` into a single tool supporting any subset of `{ x?, y?, width?, height? }`.
  However, the plugin-side handlers `moveNode` and `resizeNode` currently throw if any of their respective parameters are missing:
  ```typescript
  if (x === undefined || y === undefined) throw new Error("Missing x or y parameters");
  if (width === undefined || height === undefined) throw new Error("Missing width or height parameters");
  ```
* **The Gotcha:** If the developer merges these into a single command but maps them directly without reading the node's current dimensions as fallbacks, it will cause runtime errors or layout distortion when only a subset of properties is passed.
* **Mitigation:** The merged plugin-side handler must fetch the node's existing properties first and use them as default values when parameters are omitted:
  ```typescript
  node.x = x !== undefined ? x : node.x;
  node.y = y !== undefined ? y : node.y;
  if (width !== undefined || height !== undefined) {
      node.resize(
          width !== undefined ? width : node.width,
          height !== undefined ? height : node.height
      );
  }
  ```
* **Review verdict (verified against code, 2026-06-05): VALID — genuine plan gap.**
  * **Confirmed:** [`moveNode`](../../figma_plugin/handlers/nodeModifiers.ts) (line 24) and `resizeNode` (line 63) both **throw** when their params are missing, so a naive merge breaks partial updates (`x`-only, `width`-only, or move-without-resize).
  * **Gap, not just impl:** unlike §1.2, tasks **R3.3** said nothing about the merged handler logic — now fixed there (apply only the provided subset; `node.resize(width ?? node.width, height ?? node.height)`; keep the resize-capability guard; all-undefined = no-op).
  * **Note:** the existing single-purpose `moveNode`/`resizeNode` are *correct* to require both params — this is purely a v2.0.0 merge concern, not a shipped bug.

---

## 2. Specification & Documentation Contradictions

### 2.1 `boundVariables` Fast vs. Slow Classification Conflict
* **Affected Files:** `documentation/v2.0.0/node-fields.md` (lines 32 vs 52), `documentation/v2.0.0/drafts/skills/figma-edit/references/tool-selection.draft.md`
* **The Contradiction:** `boundVariables` and `explicitVariableModes` are listed under both **FAST fields** (raw alias/mode IDs) and **SLOW fields** (resolved style/variable/collection/mode names) in `node-fields.md`.
  Because the client requests these properties using the same string name (`"boundVariables"`), the plugin cannot distinguish if the client wants the raw (fast) or resolved (slow) version. If the server resolves them by default, they are no longer FAST fields.
* **Mitigation:** Introduce separate field names in the `node_info` field set to differentiate the two:
  - `boundVariables` (returns raw IDs - fast)
  - `resolvedBoundVariables` (returns resolved names - slow)
  - `explicitVariableModes` (returns raw IDs - fast)
  - `resolvedExplicitVariableModes` (returns resolved names - slow)
* **Review verdict (verified, 2026-06-05): VALID design gap — resolved differently than proposed, and broader.** The ambiguity is real (one field name can't mean both raw-fast and resolved-slow), and it applies to **all** raw-id/resolved-name pairs — the `*StyleId` fields too, not just `boundVariables`. **Resolution chosen — not the raw/resolved split.** Instead `node_info` returns the **resolved superset `{id, name}` by default** for these library-object references and offers **no raw-id-only variant**: the resolved form carries the `id` (round-trips into `node_bind_variable`/`node_apply_style` still work), an opaque style/variable id alone is rarely useful to an LLM, and a raw default would just force an inevitable follow-up for the name. Resolution caches per unique token, so cost scales with distinct tokens, not node count. Captured in [node-fields.md → Reference fields](./node-fields.md) and tasks **R3.3**/**R3.8**. (Contrast **node** references — `parent`/`mainComponent`, §1.1 — which resolve to **id**, not name: you operate on nodes by id.)

### 2.2 Lack of a Style Deletion API
* **Affected Files:** `documentation/v2.0.0/plan.md` (§2.2), `documentation/v2.0.0/tool-reference.md`
* **The Problem:** The design separates destructive and non-destructive operations. Under `component`, we split `component_delete_property` from `component_manage_property`. Under `variable`, we have `variable_delete` separate from `variable_manage`.
  However, under the `style` group, there is ONLY `style_list` and `style_manage` (which creates/updates). There is no `style_delete` tool, and `style_manage` has no delete action.
* **The Gap:** This makes it impossible for an agent to delete a local style, creating a functional gap in design system management.
* **Recommendation:** Consider adding a `style_delete` tool to make style lifecycle management complete and consistent with variables and component properties.
* **Review verdict (verified, 2026-06-05): VALID — accepted into v2.0.0.** Confirmed: `manage_style` is create/update only ([styleHandlers.ts](../../figma_plugin/handlers/styleHandlers.ts) has only `createStyle`/`applyStyle`); no deletion path exists. **Accepted** — adding `style_delete` (45 → 46) completes the `style.*` lifecycle, symmetric with `variable.*` / `component.*`. Nuance vs the proposal: style deletion is a **safe detach** (consumers keep resolved values, lose only the link), unlike variable deletion (dangling refs) — so it needs **only `destructiveHint: true`, no consumer-safety check** (mirrors `component_delete_property`), cheaper than the `variable_delete` pattern. It's a **net-new, non-breaking addition** (didn't strictly require the breaking release), landed here for lifecycle completeness. Captured in [plan.md §2.2](./plan.md), [tool-reference.md](./tool-reference.md), and tasks **R3.3**.

---

## 3. General Recommendations & Warnings

> [!WARNING]
> **Mock Verification Bias:**
> The current test suite relies heavily on mocked Figma APIs. Since mocks do not enforce structured clone limits (e.g., circular structures on `parent`, `mainComponent` nodes), these tests will pass green while failing immediately in a live environment. **Manual verification inside Figma is mandatory for WS3.**

> [!TIP]
> **Discriminated Unions in `create_shape`:**
> To enhance the Smithery rating and improve developer UX, the schema for `create_shape` should utilize Zod's `discriminatedUnion` on the `type` field. This ensures that parameters like `arcData` are rejected at the schema level if `type` is not `ELLIPSE`, rather than relying on unstructured backend verification.
