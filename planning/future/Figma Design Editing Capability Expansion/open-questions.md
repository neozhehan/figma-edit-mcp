# Figma Design Editing Capability Expansion: Open Questions

> **Status.** All four questions are resolved. Q1 was resolved on 2026-07-18 as Option A and is recorded in [`prd.md`](prd.md) Section 1 and D23. Q2 was resolved on 2026-07-19 as a revised Option A and is recorded in PRD Sections 14/16.2 and D25-D26: add guarded `instance_remove_overrides`, use `node_info` as the canonical manifest read, and remove `instance_get_overrides` plus the hybrid `instance_set_overrides`. Q3 was resolved on 2026-07-19 as Option B and is recorded in PRD Section 2 and D27: expand `node_transform` with strict existing-ellipse `arcData` patches. Q4 was resolved on 2026-07-19 as Option B and is recorded in PRD Section 19 and D28: hard-replace `node_group` with a required-operation `node_combine`. The adopted PRD has four additions, two removals, five hard-cutover renames, and a net public-tool increase of two; Q4 adds capability without adding a public tool.

This file follows the decision format used by [`../../v2.3.3/reviews/open-questions.md`](../../v2.3.3/reviews/open-questions.md): viable options are compared against one shared criterion, followed by a concrete recommendation and the contract implied by that recommendation.

The shared criterion is the project's Golden Rule:

> Maximize **first-call correctness**: the model can compose the correct call from the emitted schema and guides alone. Maximize **one-round-trip recovery**: when a call fails, the error contains enough observed state and repair instructions for one corrected retry.

The Golden Rule does not replace the safety contract. Scope, exact-name verification, locked-node checks, instance-interior rules, scope-root preservation, complete-plan validation, structured errors, and explicit readback remain mandatory.

## Summary

| # | Question | Recommendation | Golden Rule verdict | PRD effect / status |
|---|---|---|---|---|
| Q1 | What should "font discovery" discover, and where should it live? | **Resolved 2026-07-18 - Option A:** expand `page_info` with a strict, opt-in `fontDiscovery` mode and required `USED` or `AVAILABLE` source | Strong distinction without another tool-selection decision | Adopted in PRD Section 1 and D23; no new public tool |
| Q2 | How should all direct instance overrides be removed? | **Resolved 2026-07-19 - revised Option A:** add guarded `instance_remove_overrides`, make `node_info` the canonical manifest read, and retire both legacy override tools | Clear destructive intent and stale-manifest recovery without a duplicate read or unpredictable source-transfer path | Adopted in PRD Sections 14/16.2 and D25-D26; add one tool, remove two |
| Q3 | Where should ellipse arc editing live? | **Resolved 2026-07-19 - Option B:** add a strict optional `arcData` patch to `node_transform` | Good first-call correctness with explicit degree/radian descriptions; strong recovery through complete combined-call preflight | Adopted in PRD Section 2 and D27; no new public tool |
| Q4 | How should union, subtract, intersect, and exclude be exposed? | **Resolved 2026-07-19 - Option B:** hard-replace `node_group` with `node_combine`, using a required five-value operation enum, ordered nodes, and an exact parent/index plan | Strong first-call correctness from one required structural decision; equally strong per-item recovery through shared complete preflight | Adopted in PRD Section 19 and D28; one additional rename, no new public tool, net count unchanged |

---

## Verified baseline

The options below are grounded in the current source and the pinned Figma Plugin API, not tool names alone:

- Figwright's `get_fonts` at commit [`e2a30a3`](https://github.com/awdr74100/figwright/blob/e2a30a3de38fada3ad1c058a500c4b3b81641053/packages/mcp/src/tools/get-fonts.ts) means **fonts used on the implicit current page**. Its [handler](https://github.com/awdr74100/figwright/blob/e2a30a3de38fada3ad1c058a500c4b3b81641053/packages/plugin/src/handlers/get-fonts.ts) walks text nodes, counts one uniform font or each mixed-font segment, and sorts by usage. It does not call `listAvailableFontsAsync()`.
- The local project's pinned `@figma/plugin-typings` `1.125.0` exposes `figma.listAvailableFontsAsync(): Promise<Font[]>`. It returns the font family/style pairs currently accessible in Figma's font picker; it does not install or download fonts.
- Local `node_info` can already read generated safe-list properties including `fontName`, `arcData`, `overrides`, and `booleanOperation`. The future PRD also adds explicit styled-text-segment reads. Those paths expose fonts used by known nodes, but they do not provide a bounded aggregate or the editor's available-font catalog.
- Current `instance_get_overrides` reports only `sourceInstanceId`, `mainComponentId`, and `overridesCount`, despite its description saying it reads override properties. Native `InstanceNode.overrides` exposes the exact direct manifest as `{ id, overriddenFields }[]`, and `InstanceNode.removeOverrides()` removes all direct overrides. Inherited overrides are not included or removed.
- Current `create_shape` accepts partial `arcData` for a new ellipse. Current `node_transform` cannot edit an existing ellipse's `arcData`. Native `EllipseNode.arcData` is one complete object containing `startingAngle`, `endingAngle`, and `innerRadius`.
- The pinned API exposes `figma.union`, `figma.subtract`, `figma.intersect`, and `figma.exclude`. Each creates a `BooleanOperationNode`, reparents the supplied nodes under it, requires an explicit parent at the API boundary, and accepts an optional insertion index.

---

## Q1 - What should "font discovery" discover, and where should it live?

**Status: resolved on 2026-07-18 - Option A adopted.** The adopted contract is recorded in [`prd.md`](prd.md) Section 1 and D23. The alternatives remain below as the decision record.

### Context

"Font discovery" currently names two different model decisions:

1. **Used-font discovery:** Which exact family/style pairs are used on one or more document pages? Figwright's `get_fonts` answers the narrower implicit-current-page form of this question. Used-font discovery helps a model preserve an existing design's typography, identify dominant fonts, inspect mixed text, and find inconsistent or unavailable faces.
2. **Available-font discovery:** Which exact family/style pairs can the plugin load and assign in this editor session? This is what `listAvailableFontsAsync()` answers. It prevents the model from guessing a family or style that a later text write cannot load.

The sets are not equivalent. A file can contain a font that is not currently available to the editor, while an available font need not appear anywhere in the file. A contract that calls either set simply "fonts" invites a correct-looking but wrong first call.

The exact Figwright contract is also incompatible with this project's stated posture because it silently uses `figma.currentPage`. The local feature must use explicit `pageIds` or the documented document-wide behavior of `page_info` when those IDs are omitted; it must never substitute the visible page or inspect current selection.

### Option A - expand `page_info` with an explicit `fontDiscovery` mode (adopted)

Keep `page_info` as the document/page discovery surface and add two strict, opt-in branches:

```ts
type PageFontDiscoveryInput =
  | {
      pageIds?: string[]; // omitted means every document page
      search?: never;
      properties?: never;
      fontDiscovery: {
        source: "USED";
        query?: string;
        maxResults?: number; // integer 1..500, default 100
      };
    }
  | {
      pageIds?: never;
      search?: never;
      properties?: never;
      fontDiscovery: {
        source: "AVAILABLE";
        query?: string;
        maxResults?: number; // integer 1..500, default 100
      };
    };
```

The branches have intentionally different scope and result semantics:

- `USED` scans only `pageIds`, or every document page when `pageIds` is omitted. Omission never means current page. It returns each exact `{ family, style }` pair with distinct `textNodeCount` and `segmentCount`, per-page usage, and `available: boolean` from a live catalog cross-check. Uniform text is one segment; mixed text is segmented with `getStyledTextSegments(["fontName"])`.
- `AVAILABLE` calls `listAvailableFontsAsync()` live and returns exact assignable family/style pairs. Its output declares `scope: "EDITOR_SESSION"`; it must say explicitly that it cannot install a missing font. `pageIds` is forbidden because font availability is not page-scoped.
- `fontDiscovery` and the future `search` mode are mutually exclusive, and font branches reject search-only `properties`. This keeps one expensive traversal/result mode per call and prevents a partial font result from being mistaken for a complete search result.
- Ordinary `page_info()` and `page_info({ pageIds })` retain their existing lightweight behavior. Neither font list is computed or returned unless `fontDiscovery` is present.
- `query` is a case-insensitive family/style substring filter. Results are normalized, exact-pair deduplicated, deterministically sorted, bounded, and accompanied by `matchedCount`, `returnedCount`, and `truncated`. `maxResults` limits only the returned pair array; it does not short-circuit traversal or make usage/ranking counts partial.
- `USED` results sort by descending `textNodeCount`, then `segmentCount`, then family/style. `AVAILABLE` results sort by family/style.
- A used-font scan loads pages one at a time, emits progress, and follows the future `page_info` fail-closed completeness rule. A failed page load reports completed and failed page IDs rather than returning an apparently complete inventory.
- An unavailable font write returns `FONT_NOT_AVAILABLE` with the requested pair, exact styles available in the requested family, bounded close-family candidates, and the corrected `page_info({ fontDiscovery: { source: "AVAILABLE", ... } })` call. When one correction is unambiguous, the error includes the complete corrected write arguments.

Output keeps editor-wide availability separate from page-scoped usage:

```ts
type PageFontDiscoveryResult =
  | {
      source: "USED";
      scope: { kind: "PAGES"; pageIds: string[] };
      fonts: Array<{
        fontName: FontName;
        textNodeCount: number;
        segmentCount: number;
        pageUsage: Array<{
          pageId: string;
          textNodeCount: number;
          segmentCount: number;
        }>;
        available: boolean;
      }>;
      matchedCount: number;
      returnedCount: number;
      truncated: boolean;
      scannedPageCount: number;
      scannedNodeCount: number;
    }
  | {
      source: "AVAILABLE";
      scope: "EDITOR_SESSION";
      fonts: Array<{ fontName: FontName }>;
      matchedCount: number;
      returnedCount: number;
      truncated: boolean;
    };
```

The existing `page_info` read annotations remain unchanged:

```ts
{
  readOnlyHint: true,
  openWorldHint: true
}
```

- First-call correctness: **strongest overall.** The required `source` field prevents the model from confusing fonts already present with fonts it can assign. `USED` follows the same explicit/all-pages scope semantics as future page search, while `AVAILABLE` visibly declares its editor-session scope. Reusing the discovery tool models already call removes one public-tool selection decision.
- One-round-trip recovery: **equal to a dedicated font tool.** Text-write validation uses the same live catalog and can return concrete style/candidate data plus the exact corrected `page_info` call. Mode-conflict and invalid-scope errors can show the complete corrected branch in one response.
- Other: no new public tool. The tool title and description must broaden from "Get Pages" to "Get Document and Page Information" and explicitly advertise both font modes. Large catalogs and traversals still require progress, output bounds, and truncation metadata.

### Option B - add a dedicated `font_list` tool

Use the same strict `USED` and `AVAILABLE` distinction in a new read-only tool, with explicit page IDs for `USED` and no page scope for `AVAILABLE`.

- First-call correctness: **strong and locally simpler.** The tool name makes font discovery highly visible, and its schema contains no unrelated page/search fields. It does, however, add another tool-selection decision for information that belongs to the project's existing document-discovery workflow.
- One-round-trip recovery: **equal to Option A.** Errors can return exact candidate pairs and a corrected `font_list` call.
- Other: one additional public tool, safety-matrix row, registration, dispatcher route, guide entry, and tool-count change. Prefer this option only if live agent tests show that models fail to discover `page_info.fontDiscovery` from the broadened title and description.

### Option C - copy Figwright's page-local `get_fonts` contract

Add an empty-input read that scans `figma.currentPage` and returns used-font counts.

- First-call correctness: **superficially simple, semantically weak.** The call is easy to compose, but the model cannot tell which page will be scanned from the schema, and it may incorrectly treat a used font as assignable.
- One-round-trip recovery: **weak.** It gives no available alternatives when a font cannot be loaded and cannot explain a result from the wrong visible page.
- Other: violates the explicit no-implicit-current-page posture and reproduces Figwright's current-page dependency.

### Option D - expose used fonts through `node_info` and available fonts only in write errors

Add an aggregate-font flag to `node_info`; do not add a success-path available catalog. Failed text writes internally query available fonts and return candidates.

- First-call correctness: **mixed.** It avoids a new tool, but a page/document font inventory becomes a surprising mode of a node-details tool. A model that wants an assignable font must guess or wait for a failure.
- One-round-trip recovery: **strong after failure**, if errors include candidates, but weaker before the first write. Used-font aggregation also competes with `node_info`'s direct/tree/search result shapes.
- Other: cannot express the full requested available-font discovery capability.

### Recommendation and adopted rationale

**Option A is adopted.** The required `USED` versus `AVAILABLE` discriminator turns an easy-to-confuse concept into an explicit model decision, while `page_info` already owns document-wide page traversal and is planned to support cross-page search. Making fonts an explicit, mutually exclusive mode preserves that ownership without adding another public name.

The PRD records the decision coherently across the following surfaces:

- The `font-inventory` non-goal is removed, while a standalone `get_fonts` / `font_list` tool remains a non-goal.
- Phase 2 owns the page/editor inventory contract. Phase 4's font work is narrowed to discovering and loading exact font pairs on affected text runs.
- The `page_info` title/description and emitted schema cover direct, search, `USED`, and `AVAILABLE` modes, including their required and forbidden fields.
- The existing `page_info` read-only safety row, guides, traversal/load tests, output bounds, and live smoke matrix are updated. No new safety row or public tool is added.
- Text creation, content, and style paths consume exact requested `{ family, style }` pairs and never silently substitute Inter or another font. The existing explicitly documented no-font `create_text` default remains distinct from fallback behavior.

**Decision (2026-07-18): Option A adopted.** Expand `page_info` with mutually exclusive `fontDiscovery.source: "USED" | "AVAILABLE"` branches exactly as specified above; do not add a standalone font tool.

---

## Q2 - How should all direct instance overrides be removed?

**Status: resolved on 2026-07-19 - revised Option A adopted.** The adopted contract is recorded in [`prd.md`](prd.md) Sections 14/16.2 and D25-D26. The alternatives remain below as the decision record.

### Context

Native `instance.removeOverrides()` removes **all direct overrides** from one `InstanceNode`. It is not selective, does not remove inherited overrides, and has no native inverse that restores the discarded values.

This is a different user decision from the pre-release `instance_set_overrides` operation. That setter copies overrides from a source instance to one or more targets and also swaps each target to the source component. Override removal has one target, no source, no component swap, one whole-instance native setter, and destructive data-loss semantics. The adopted instance redesign removes that hybrid transfer tool entirely because its component swap plus field replay produces an outcome the model cannot reliably predict.

The pre-release dedicated read is also insufficient: `instance_get_overrides` returns a count but not the `{ id, overriddenFields }[]` manifest. `node_info({ properties: ["overrides"] })` can expose that manifest and already owns general node-state discovery. The adopted revision therefore removes the duplicate dedicated reader and makes `node_info` canonical.

### Option A - a separate, guarded `instance_remove_overrides` tool (adopted with revised read/removal posture)

Add a dedicated destructive tool and require the caller to pass back the direct-override manifest from the discovery read:

```ts
{
  nodeId: string;
  nodeName: string;
  expectedOverrides: Array<{
    id: string;
    overriddenFields: string[];
  }>;
}
```

Required behavior:

- Remove `instance_get_overrides`. Use `node_info({ nodeIds: [nodeId], properties: ["mainComponent", "overrides", "componentProperties"], maxDepth: 0 })` as the sole canonical discovery read.
- Remove `instance_set_overrides` and its source-to-target prompt/dispatcher/handler path. There is no null-source reset sentinel or hidden compatibility route.
- Validate the expected manifest, reject duplicate IDs/fields, and canonicalize deterministic ordering before comparison so order alone cannot create a stale-state failure. Compare IDs and field sets exactly.
- Resolve and exact-name-verify one in-scope `INSTANCE`; reject a locked target or any locked descendant before the broad reset. Instances of remote components remain eligible because the mutation is local. The instance itself may be the scope root because its ID and hierarchy do not change.
- Preserve the existing policy that explicit property/override writes may target a nested instance. `removeOverrides()` affects only that explicitly named instance's direct overrides; it is not the ancestor-detaching behavior that makes nested `instance_detach` unsafe.
- If the current manifest differs from `expectedOverrides`, fail before mutation with `INSTANCE_OVERRIDES_CHANGED`. Include the current canonical manifest and the complete corrected retry arguments in `error.details`.
- After all checks, call native `removeOverrides()` once and read the manifest back. Return the removed manifest, resulting direct manifest, and `noOp`; a non-empty result is an explicit mismatch failure, not false success. State that the manifest is an audit summary, not a value-bearing restore payload.
- Passing an expected empty manifest against an empty current manifest is a successful no-op. Selective field removal is out of scope because the native API does not provide it and emulation would require a broad, lossy property-restoration engine.
- Disclose that the manifest detects added/removed overridden nodes and fields, not a value-only change to an already-overridden field. Callers use a fresh `node_info` read immediately before reset.

Annotations:

```ts
{
  destructiveHint: true,
  openWorldHint: true
}
```

Do not advertise `idempotentHint: true`: a second identical guarded call observes a different manifest and should return the stale-state refusal rather than pretend it repeated the original state transition.

- First-call correctness: **strong.** The tool name maps to one destructive decision, its schema has no irrelevant source/target branches, and the required manifest follows the project's discover-before-write workflow. Using `node_info` avoids making the model choose between two reads for the same state. The cost is one explicit copy-through field from the read result.
- One-round-trip recovery: **strongest safe form.** A stale manifest error carries the newly observed manifest and exact retry. Wrong type/name/scope/lock errors use the existing recovery vocabulary. A successful unintended reset cannot be repaired automatically, which is why the precondition is valuable.
- Other: the static destructive hint is accurate for every call. One native setter keeps predictable partial mutation out of the operation, but no API-level undo is promised.

### Option B - a separate target-only removal tool

Use only `{ nodeId, nodeName }`, read the current manifest internally for the success result, and remove whatever direct overrides exist at execution time.

- First-call correctness: **easiest call shape.** There is no manifest to copy.
- One-round-trip recovery: **good for failures, poor for stale successful intent.** A concurrent override added after discovery is silently removed; because the native call succeeds, no recovery-bearing error exists.
- Other: acceptable for less defensive tools, but weaker than this project's stale-state posture for irreversible broad resets.

### Option C - add a `REMOVE` action to `instance_set_overrides`

Turn the existing setter into an action router for apply/copy and remove/reset behavior.

This option is superseded by the adopted hard removal of `instance_set_overrides`; it remains here only as a rejected alternative.

- First-call correctness: **weaker.** The tool name says "set", the apply branch requires a source plus targets, and the remove branch requires one target plus no source. Conditional forbidden fields become a prominent part of the schema.
- One-round-trip recovery: **weaker.** Apply failures concern component compatibility and per-target partial results; remove failures concern stale direct state. Combining them makes error and output branches harder to select and explain.
- Other: MCP annotations are tool-wide. The server would either mark ordinary apply calls destructive or under-label removal calls. This is the same reason swap and detach remain separate in PRD D13-D14.

### Option D - emulate reset with swap, detach, or instance recreation

- First-call correctness: **poor.** None of these operations means "remove direct overrides while preserving this instance identity and component relationship."
- One-round-trip recovery: **poor.** Reconstruction can change IDs, hierarchy, component identity, and compatible properties; failures cannot name one corrected retry that restores the original state.
- Other: rejected as a lossy workaround when a native API exists.

### Recommendation and adopted rationale

**Revised Option A is adopted.** A separate tool is warranted by destructive intent, static annotations, and a contract that shares neither source nor output shape with the former source-transfer operation. The required manifest slightly increases call size but converts a changed direct-override set into a repairable refusal.

The revision improves the original recommendation in two ways under the Golden Rule:

- `node_info` is the one canonical state read, so the model does not choose between a general reader and a weaker dedicated reader.
- Removing `instance_set_overrides` eliminates a hybrid component-swap/field-replay operation whose success could still produce an unpredictable mixed result. Explicit swap, exact component-property, direct-node, and clone tools replace its separate intents; no behavior-preserving one-call migration is claimed.

The PRD synchronizes the decision across the override-reset non-goal, public tool arithmetic, migration table, locked-subtree and manifest safety gates, structured stale/readback errors, schemas, rollout, tests, success criteria, risks, and provenance.

**Decision (2026-07-19): revised Option A adopted.** Add guarded one-target `instance_remove_overrides`; use `node_info` for manifest discovery; remove `instance_get_overrides` and `instance_set_overrides` without aliases.

---

## Q3 - Where should ellipse arc editing live?

**Status: resolved on 2026-07-19 - Option B adopted.** The adopted contract is recorded in [`prd.md`](prd.md) Section 2 and D27. The alternatives remain below as the decision record.

### Context

The local project can create an ellipse with `arcData`, and `node_info` can read `arcData`, but no write updates an existing ellipse. Figma requires assignment of the complete object:

```ts
interface ArcData {
  startingAngle: number;
  endingAngle: number;
  innerRadius: number;
}
```

The model-facing operation is more specific than ordinary transform. It means making or editing a pie slice, gauge, ring, or donut. Its two angles are in **radians**, while the future `node_transform.rotation` field is in **degrees**. That unit split is the main first-call risk.

### Option A - add a focused `node_set_arc` tool (original recommendation, not adopted)

Add one type-specific but coherent geometry setter:

```ts
{
  nodeId: string;
  nodeName: string;
  arcData: {
    startingAngle?: number; // radians
    endingAngle?: number;   // radians
    innerRadius?: number;   // 0..1
  };
}
```

Required behavior:

- `arcData` must contain at least one field. Angles must be finite numbers; `innerRadius` is constrained to `0..1` at the MCP boundary and checked again in the plugin.
- Resolve, scope-check, exact-name-verify, and lock-check the target; require type `ELLIPSE` before any mutation.
- Read current `arcData`, merge only the supplied fields, validate the complete result, then assign the complete object once. Omitted fields preserve their current values; they never reset to creation defaults.
- Describe radians with concrete constants in the tool and field descriptions: full circle `0` to `2 * Math.PI`, half circle `Math.PI`. Do not silently interpret degree-looking values or normalize them before Figma does.
- Return `previousArcData` and the exact resulting `arcData`. `node_info({ nodeIds: [nodeId], properties: ["arcData"] })` remains the canonical verification read.
- Share the `ArcData` schema/validator with `create_shape`, while retaining creation's explicit default semantics and editing's preserve-current semantics.

Annotations:

```ts
{
  idempotentHint: true,
  openWorldHint: true
}
```

- First-call correctness: **strongest.** The name exposes the pie/ring decision directly, the schema contains only arc fields, and radians are not placed beside a degree-based rotation field. It adds one tool, but avoids increasing the reasoning cost of every ordinary transform call.
- One-round-trip recovery: **strongest.** `ARC_TARGET_NOT_ELLIPSE`, empty-patch, and range errors can name the observed node type/value and show the exact corrected `node_set_arc` call. A failed arc validation cannot partially move, resize, or rotate the node because those operations are not in this call.
- Other: this is three coupled fields assigned through one native property, not a thin tool for one scalar setter. Absolute/preserve-current semantics make retries idempotent.

### Option B - add optional `arcData` to `node_transform` (adopted)

Broaden the future transform tool to move, resize, rotate, and patch ellipse arc data within one completely preflighted call.

```ts
type ArcDataPatch = {
  startingAngle?: number; // radians
  endingAngle?: number;   // radians
  innerRadius?: number;   // 0..1
};

type NodeTransformInput = {
  nodeId: string;
  nodeName: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;      // degrees
  arcData?: ArcDataPatch; // existing ELLIPSE only
};
```

Required behavior:

- Include `arcData` in the top-level at-least-one-mutation refinement. The nested patch is strict and must contain at least one field.
- Angles are finite radians; `innerRadius` is `0..1`. Tool and field descriptions explicitly contrast degree `rotation` with radian arc angles and include numeric `Math.PI`/`2 * Math.PI` examples. Never guess or convert units.
- If `arcData` is supplied, require the exact target type `ELLIPSE` before any mutation. Without it, ordinary transform-compatible nodes retain current behavior.
- Read current complete `arcData`, merge only the supplied fields, validate the merged result, and assign the complete object once. Omitted fields preserve live values rather than taking creation defaults.
- Share strict arc field/value validation with `create_shape`, but keep omission semantics separate: creation defaults missing fields; editing preserves them.
- Preflight target capabilities, layout effects, every affine field, and the merged arc plan before the first setter. A wrong-type or invalid arc cannot partially move, resize, or rotate the node.
- Apply a deterministic tested order and return exact affine/rotation readback plus `previousArcData` and resulting `arcData` when requested.
- Consolidation does not promise an API transaction. An unexpected failure after mutation returns exact before/requested/resulting state, `partialMutation: true`, and the failed field group.
- Keep the existing `node_transform` idempotent/open-world annotations and `node_info({ nodeIds: [nodeId], properties: ["arcData"], maxDepth: 0 })` as the independent verification read.

- First-call correctness: **good and accepted.** It removes a public tool-selection decision and supports size-plus-arc edits in one call. The remaining type/unit ambiguity is mitigated by exact ELLIPSE enforcement, strict nested schema, and repeated degree/radian wording in emitted descriptions.
- One-round-trip recovery: **strong under the adopted preflight contract.** Wrong-type and invalid-arc failures happen before any requested transform mutation and include observed/accepted values plus an exact ellipse-discovery prerequisite. A valid transform-only retry is included only when another mutation field remains; an arc-only failure never receives an empty retry. Unexpected native failures disclose the exact resulting state rather than claiming rollback.
- Other: no public tool, dispatcher route, safety row, or tool-count increase. The cost is a broader transform schema and handler test matrix.

### Option C - add a generalized `node_set_shape_geometry` tool

Create a discriminated tool intended eventually to edit ellipse arcs, polygon point counts, star radii, and other shape geometry.

- First-call correctness: **weaker today.** The broader name introduces a new tool-selection boundary without any other approved branch, and the emitted schema advertises an abstraction rather than the requested operation.
- One-round-trip recovery: **potentially strong**, but every future node type adds branch-specific errors and forbidden fields.
- Other: revisit when at least one additional existing-shape geometry edit is approved. Do not build an empty extension point in this release.

### Option D - add an edit branch to `create_shape`

- First-call correctness: **poor.** Creation requires a parent and produces a new ID; editing requires a target and preserves identity. A model cannot infer from the tool name whether it will create or mutate.
- One-round-trip recovery: **poor.** Parent errors and target-type errors would share one contract, and creation cleanup has nothing to do with an existing-node setter.
- Other: rejected because it mixes creation and mutation annotations, fields, and results.

### Recommendation and adopted rationale

**Option B is adopted.** It trades the original recommendation's narrower schema for fewer tool-selection decisions and a useful combined size/rotation/arc workflow. It measures up to the Golden Rule only with the strict safeguards above; a loosely optional `arcData` object or sequential validate-as-you-mutate handler would not be acceptable.

The PRD records the decision coherently across the following surfaces:

- `node_transform` gains the strict non-empty patch and a broadened title/description; `node_set_arc` and generalized shape-geometry tools remain non-goals.
- D27 fixes degree/radian semantics, live-state merge behavior, complete-call preflight, deterministic mutation order, and residual-failure disclosure.
- The existing transform safety row is expanded rather than adding a new row or public name.
- Shared arc validation, structured errors, emitted-schema assertions, handler/safety tests, live smoke coverage, success criteria, risks, and provenance are updated.
- Public tool arithmetic remains four additions, two removals, and net `+2`.

**Decision (2026-07-19): Option B adopted.** Expand `node_transform` with optional existing-ellipse `arcData`; do not add `node_set_arc`.

---

## Q4 - How should union, subtract, intersect, and exclude be exposed?

**Status: resolved on 2026-07-19 - Option B adopted.** The adopted contract is recorded in [`prd.md`](prd.md) Section 19 and D28. The alternatives remain below as the decision record.

### Context

Figma's four native functions share one structural contract: consume an ordered list of nodes, create one `BOOLEAN_OPERATION` container under an explicit parent/index, and reparent the inputs as editable children. This is not flattening: the child nodes remain in the document. It is also more than grouping: the operation changes rendered geometry, and input order is semantically important, especially for subtract.

The local project currently exposes `node_group`, `node_ungroup`, and lossy `node_flatten`, but no boolean operation. `node_group` already requires explicit per-node IDs/names, same-parent membership, scope access, unlocked nodes, and no instance-interior structural edits, but it infers the parent from the first input and exposes no insertion index. Boolean creation should start from that gate set and add the operation-specific constraints below.

### Option A - one new `node_boolean_operation` tool with an operation enum (original recommendation, not adopted)

Expose the four native operations as one coherent structural decision:

```ts
{
  operation: "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE";
  nodes: Array<{
    nodeId: string;
    nodeName: string;
  }>; // at least 2; order is preserved verbatim
  parentId: string;
  parentNodeName: string;
  index?: number; // omit to append, matching the native API
  name?: string;
}
```

Required behavior:

- Require at least two unique, reparentable nodes. Reject duplicates and any ancestor/descendant pair before mutation.
- Resolve every node first; enforce node permission, scope, exact name, lock, instance-interior, and scope-root preservation for every input.
- Resolve and exact-name-verify an appendable, in-scope, unlocked parent that is not an instance or inside an instance.
- Require every input's current parent to equal `parentId`. The first release does not hide cross-parent reparenting inside the boolean call. A failure identifies each mismatched parent and gives the exact `node_insert_child` prerequisite.
- Validate `index` against the parent before the native call. Omission means append/topmost, exactly as the schema states; do not silently choose an undocumented Figma-UI position.
- Preserve the supplied `nodes` order verbatim into the native call and return the resulting child order. Before documenting which array position is the subtract base, run a live pinned-API probe for all four operations and lock the observed order/index semantics in tests. The typings say the arguments match `group`, but do not fully document subtract's visual ordering.
- Validate all predictable failures before calling exactly one of `figma.union`, `figma.subtract`, `figma.intersect`, or `figma.exclude`.
- Return the new ID/name, `type: "BOOLEAN_OPERATION"`, exact `booleanOperation`, parent/index, and ordered child IDs/names. `node_info({ properties: ["booleanOperation", "children"] })` is the verification read.
- Live-verify `figma.ungroup(BooleanOperationNode)` under the pinned API. If it preserves child identity and absolute placement as the type signature indicates, expand `node_ungroup` to accept `BOOLEAN_OPERATION` in the same release and return the promoted children. Do not claim an MCP inverse until that probe passes.

Annotations:

```ts
{
  destructiveHint: true,
  openWorldHint: true
}
```

Do not set `idempotentHint: true`: repeating a structural combine is not the same logical operation and can create nesting or a parent mismatch.

- First-call correctness: **strongest practical form.** The model chooses one clearly named tool, one four-value enum, an explicit ordered node list, and an explicit parent. The schema cannot accidentally infer from selection, node order, or current page.
- One-round-trip recovery: **strongest.** Per-node identities make duplicate, stale name, wrong parent, locked, instance-interior, scope-root, and invalid-index failures identify the exact offending item and corrected prerequisite. One native operation after full preflight avoids predictable partial reparenting.
- Other: the conservative destructive hint is justified because the call changes hierarchy, z-order, and rendered geometry even though the children remain editable. Native input-order behavior is a release-blocking live probe, not a detail to guess from UI conventions.

### Option B - rename and expand `node_group` into `node_combine` (adopted)

Replace `node_group` with a required `operation: "GROUP" | "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE"` branch.

Adopted contract:

```ts
{
  operation: "GROUP" | "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE";
  nodes: Array<{
    nodeId: string;
    nodeName: string;
  }>; // at least 2 unique nodes; order is preserved verbatim
  parentId: string;
  parentNodeName: string;
  index?: number;
  name?: string;
}
```

- `operation` is mandatory and has no default. Omitting it must fail at the MCP boundary; it may never imply `GROUP`.
- Every branch uses the same complete structural preflight: resolve and exact-name-verify all nodes and the parent, require scope and write permission, reject locks, scope roots, instance interiors, unsupported node types, duplicates, ancestor/descendant pairs, and cycles, and require every input to have the exact named parent.
- `parentId`/`parentNodeName` are explicit even for `GROUP`; the replacement does not retain `node_group`'s inferred-parent behavior. Mixed-parent recovery reports each actual parent and exact legal `node_insert_child` prerequisites.
- When a prior `page_info`/search path does not already expose the parent tuple, discover it without selection state by reading each input's `parent` ID through `node_info`, then reading that shared parent at `maxDepth: 1` for its exact name and child order.
- Preserve the supplied node order unchanged into exactly one matching native call. A release-blocking pinned live probe defines resulting child order, the subtract base, insertion-index behavior, child-ID preservation, and absolute placement for all five operations.
- Return one normalized result containing result type, requested operation, boolean operation where applicable, exact parent/index, and ordered children. Unexpected native drift or partial reparenting returns before/resulting structural state instead of attempting an unverified rollback.
- Hard-remove `node_group`; migration guidance shows the exact `node_combine({ operation: "GROUP", ... })` replacement. Do not retain an alias or hidden dispatcher route.
- Apply one static `destructiveHint: true`, `openWorldHint: true`, and no idempotent hint to the combined tool. This conservatively covers boolean branches; the description must explain that `GROUP` preserves editable children but still changes hierarchy and z-order.
- Live-probe `node_ungroup` against boolean results. Expand it to `GROUP | BOOLEAN_OPERATION` only if child IDs, absolute placement, and sibling order are verified; otherwise retain its `GROUP` restriction and state that no verified boolean inverse exists.

Golden Rule evaluation:

- First-call correctness: **strong after the hard cutover.** There is one structural-combine tool-selection decision, while a required five-value enum makes the intended operation explicit and prevents omission from silently succeeding as a plain group. The exact parent and ordered node list expose every structural operand. The cost is a broader schema and one extra required field for ordinary grouping.
- One-round-trip recovery: **equal to Option A and strongest practical form.** All five branches share the same per-input and parent validation, so duplicate, stale-name, wrong-parent, locked, instance-interior, scope-root, ancestry, and index failures can identify the offending operand and give one corrected call or prerequisite.
- Other: this is a breaking rename and its tool-wide destructive annotation is broader than the `GROUP` branch alone. In return, it adds all four boolean capabilities without adding another public tool or creating a permanent group-versus-boolean tool-selection fork.

### Option C - add four separate tools

Expose `node_union`, `node_subtract`, `node_intersect`, and `node_exclude` with duplicated node/parent schemas.

- First-call correctness: **clear names, excessive selection surface.** The operation is visible in the tool name, but a four-value enum is already a low-ambiguity choice and avoids four near-identical registrations.
- One-round-trip recovery: **no better than Option A.** All four need the same gate errors, parent repair, and result shape; duplicated contracts are more likely to drift.
- Other: four safety rows, tool schemas, docs, tests, and dispatcher routes for one native contract.

### Option D - absorb boolean operations into `node_flatten`, `create_shape`, or an optional mode on `node_group`

- First-call correctness: **poor.** Flatten destroys child structure, create-shape does not consume existing nodes, and an optional group mode can silently create a plain group when the model omits the operation.
- One-round-trip recovery: **poor.** The wrong operation may succeed and produce the wrong hierarchy, leaving no recovery-bearing error.
- Other: rejected because these contracts have materially different identity, reversibility, and annotation semantics.

### Recommendation and adopted rationale

Adopt **Option B**. Option A remains a clean standalone design, but Option B better matches the chosen product direction: group and boolean creation are variants of one explicit structural-combine decision, and the required no-default discriminator keeps that consolidation legible to a model. It avoids adding a fifth new public tool while preserving the same ordered operands, exact parent, complete preflight, native call, readback, and recovery quality recommended for Option A.

The Golden Rule depends on the strictness of the consolidation. An optional operation, an inferred parent, operation-specific ignored fields, or branch-specific validation gaps would make Option B worse than the standalone tool. The adopted PRD therefore:

- hard-replaces `node_group` instead of keeping two overlapping names;
- requires the operation, ordered node identities, and exact parent identity for every branch;
- uses one normalized result and one structural error vocabulary across all five operations;
- applies the broadest static destructive annotation rather than understating boolean behavior;
- makes the native order/index/subtract-base probe release-blocking and the boolean-ungroup expansion conditional on a separate live probe;
- keeps lossy `node_flatten`, creation tools, and direct editing of an existing `BooleanOperationNode.booleanOperation` outside this contract.

This gives strong first-call correctness after migration and strongest-practical one-round-trip recovery. Its accepted costs are the hard rename, a more explicit `GROUP` call, and conservative destructive labeling for that branch.

**Decision (2026-07-19): Option B adopted.** Replace `node_group` with strict required-operation `node_combine`; do not add `node_boolean_operation` or four operation-specific tools.

---

## Cross-question release impact

Q1-Q4 are adopted and synchronized in the PRD. No question in this file remains open:

1. The adopted public surface has four additions (`instance_swap_component`, `instance_detach`, `instance_remove_overrides`, and `node_bind_component_property`), two removals (`instance_get_overrides` and `instance_set_overrides`), five hard-cutover renames, and net `+2` tools. Q1 and Q3 expand existing tools without adding names; Q4 replaces one name with one name.
2. `node_info` is the canonical direct-override manifest read. No dedicated override reader or source-transfer compatibility route remains.
3. Shared/generated contracts include exact `FontName`, strict `page_info` modes, canonical direct-override manifests, strict `ArcData` fields/patches, and required `NodeCombineOperation` plus explicit structural parent/index inputs.
4. The safety matrix expands existing read/transform rows, adds guarded override removal, and replaces the `node_group` row with one structural/destructive `node_combine` row and static-annotation tests.
5. The implementation plan includes font traversal/catalog work, override reset and retired-route cleanup, existing-ellipse arc editing, structural-combine dispatch and native-order probes, generated output, guide/resource synchronization, and live tests.
6. Standalone font, arc, and boolean-operation tools remain explicit non-goals because those capabilities live in `page_info`, `node_transform`, and `node_combine` respectively. `node_flatten` remains the separate lossy geometry operation.
7. The release remains selection-independent. Used-font discovery scans explicit `pageIds` or all document pages; every override, ellipse, combine input, and combine parent is explicit.

Q4 changes migration and annotation requirements but not public-tool arithmetic: `node_group` leaves as `node_combine` enters, so the adopted release remains net `+2`.
