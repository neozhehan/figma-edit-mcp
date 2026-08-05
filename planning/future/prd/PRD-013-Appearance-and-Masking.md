# PRD — Appearance and Masking

- **Status:** Proposed; release closure requires pinned live mask-propagation evidence
- **Release:** Version-unassigned standalone minor release with an accepted hard cutover
- **PRD date:** 2026-08-04
- **Source:** [Figma Design Editing Capability Expansion, Section 4](../initiative/03%20-%20Figma%20Design%20Editing%20Capability%20Expansion/initiative.md#4-node_set_appearance-effects-visibility-opacity-blend-mask-p0)
- **Compatibility posture:** Hard-replace `node_set_effects` with `node_set_appearance`; no compatibility alias

> [!IMPORTANT]
> This PRD is one independently releasable minor release. It owns literal node effects, visibility, opacity, node blend mode, mask state/type, and the containment guard required by mask propagation. It does not include shared effect-style authoring, paint-stack expansion, layout, transform, text, creation, variable, component, instance, or structural-combine work.

## 1. Executive summary

Replace `node_set_effects` with `node_set_appearance`, preserving the complete existing node-effect contract while adding four related appearance decisions: visibility, opacity, blend mode, and masking. One exact-node call may set any non-empty combination of those fields. Omitted fields remain unchanged, `effects: []` clears literal effects, and success returns actual post-write values rather than an input echo.

The plugin remains the trust boundary. It resolves and authorizes the target, validates support for every supplied property, normalizes effects without mutation, validates every cross-field rule, and snapshots the relevant state before the first setter. A predictably invalid later field can never leave an earlier field applied.

Masking receives a stronger guard because changing one node's mask state can alter the rendering of its subsequent siblings. An effective `isMask` or `maskType` change is allowed only under a bounded group-like parent that is itself in scope, with every potentially affected sibling in scope and no instance-interior target. Enabling a new mask guards the complete subsequent-sibling suffix; disabling or changing an existing mask guards the exact sibling range affected by that mask before mutation. The success result identifies the ordered range protected by that decision.

This is an intentional public hard cutover in a minor release. The old tool name disappears from registration, command unions, dispatcher routes, manifests, active guidance, tests, and the safety matrix. Historical and migration prose may still name it; no callable alias remains.

## 2. Release identity and source mapping

| Source requirement | Disposition in this release |
| :- | :- |
| Source checklist item 4 | Complete: effects, visibility, opacity, blend mode, and masks are one appearance surface |
| Product decision D1 | Preserved: appearance is one model decision, not one tool per Figma setter |
| Product decision D2 | Preserved: strict top-level and effect-variant contracts; irrelevant or unknown fields are rejected |
| Product decision D3 | Preserved: exact-node discovery only; no current selection or implicit current page |
| Product decision D4 | Preserved: success returns actual resulting appearance values |
| Product decision D5 | Preserved: complete-call preflight before the first setter |
| Product decision D6 | Preserved: structured failures contain one-round-trip repair operands |
| Product decision D7 | Preserved: `node_set_effects` is a hard-cutover removal, not an alias |
| Product decision D10 | Preserved: the mask parent and transition-specific potentially affected sibling range are contained |
| Section 4 contract and acceptance criteria | Owned in full here |
| Section 20 `node_set_appearance` safety row | Owned here |
| Section 20 structured mask/unsupported-property errors | Owned here |
| Schema requirements 1-7 | Applied to the appearance schema, descriptions, enums, and plugin defense in depth |
| Phase 1 appearance schema/error/migration work | Expanded below |
| Phase 3 appearance handler, preflight, and containment work | Expanded below |
| Phase 8 documentation, generated output, versioning, and release work | Expanded below |
| Appearance schema, handler, safety, and live-smoke requirements | Owned here |

Public-surface arithmetic for this release:

- tools added by name: `node_set_appearance`;
- tools removed by name: `node_set_effects`;
- tools added as additional decisions: 0;
- net tool-count change: 0;
- permanent compatibility aliases: 0.

The exact version is assigned only when this release is scheduled. At implementation time, every repository-enforced version surface moves from the then-current baseline to that assigned minor version. This PRD does not assume a particular predecessor version.

## 3. Problem

The current node surface can replace or clear a literal effect array, but it exposes no write path for the adjacent Figma appearance properties `visible`, `opacity`, `blendMode`, `isMask`, or `maskType`. Agents must either leave those properties unchanged or depend on an out-of-contract workaround.

Simply adding setters would be unsafe and hard to use:

1. separate tools would make one appearance decision span multiple calls and increase tool-selection ambiguity;
2. `visible: false` and `opacity: 0` are materially different states but are easy to conflate;
3. a consolidated handler could apply an early valid field before discovering that a later field is unsupported;
4. a mask write can change sibling rendering outside the named target;
5. a native setter can still fail after preflight, so claiming transactional rollback would be false;
6. renaming while retaining the old callable name would permanently expose two overlapping contracts.

The repository baseline also has an intentional distinction between literal node effects and shared effect styles. The node tool accepts the strict node-effect subset; `style_manage` owns the broader shared-style effect surface. This release preserves that distinction.

## 4. Goals

1. Replace `node_set_effects` with one strict `node_set_appearance` tool.
2. Preserve every accepted node-effect variant, default, validation rule, and normalization behavior from the scheduled baseline.
3. Add exact absolute writes for visibility, opacity, node blend mode, mask state, and mask type.
4. Keep omitted fields unchanged and distinguish an omitted `effects` field from `effects: []`.
5. Validate the complete request, target capabilities, and mask propagation plan before the first setter.
6. Prevent a mask write from affecting a parent or sibling outside the connected edit scope.
7. Return actual resulting values and the ordered mask-affected node identities needed to verify the decision.
8. Give machine-usable, one-round-trip recovery for every predictable refusal.
9. Disclose exact or explicitly unknown residual state after an unexpected native failure.
10. Remove every active old-name route and synchronize schemas, safety, guides, generated output, version surfaces, and live evidence in the same release.

## 5. Explicit non-goals

- No permanent `node_set_effects` alias, hidden dispatcher case, fallback command-union member, or duplicate manifest entry.
- No standalone `set_visible`, `set_opacity`, `set_blend_mode`, or `set_mask` tool.
- No selection-based target and no implicit-current-page behavior.
- No batch target array. One call mutates one exact node.
- No relative/toggle operation; every supplied field is an absolute requested state.
- No expansion of the node-effect variant set merely because `style_manage` supports additional effect variants.
- No shared effect-style create/update work. Use `style_manage({ type: "EFFECT", ... })` for definitions and `node_apply_style` to link a shared effect style.
- No paint, fill/stroke, layout-grid, or text-run appearance work.
- No generalized layer-style copy, source-template transfer, or arbitrary property patch.
- No structural regrouping performed implicitly to make an unsafe mask fit the scope.
- No mutation of siblings, their descendants, their bindings, or their styles. Siblings are authorized and reported because their rendering may change, not because they are setter targets.
- No general transaction or guaranteed rollback layer.
- No transport receipt, timeout, or deduplication protocol; those remain separate release scope.

## 6. Product decisions

### D1 — Appearance is one model decision

Effects, visibility, opacity, blend mode, mask enablement, and mask type belong to one node-appearance tool. The public API does not mirror each native Figma setter with a separate MCP tool.

### D2 — The rename is a hard cutover

`node_set_effects` leaves the public tool list when `node_set_appearance` ships. The old name must be absent from:

- MCP registration and emitted `tools/list`;
- `FigmaCommand` and client command unions;
- plugin dispatcher cases and handler exports used as routes;
- generated root manifest and committed plugin bundle;
- active prompts, examples, agent guides, tool-selection tables, and `SAFETY.md` rows;
- tool-list, permission, output, schema, and routing tests.

Historical provenance, this PRD, the CHANGELOG migration entry, and explicit retired-route tests may name the old command. They do not make it callable.

### D3 — Complete-call preflight precedes mutation

The plugin validates every supplied field and every cross-field condition against one resolved live target before the first setter. An unsupported `maskType`, invalid mask parent, or other predictable later failure prevents valid effects, visibility, opacity, and blend fields from applying.

### D4 — Mask propagation is authorized against the pre-mutation affected range

The guarded range depends on the transition:

- enabling a live non-mask guards the target's complete ordered subsequent-sibling suffix, `parent.children.slice(targetIndex + 1)`;
- disabling an existing mask or changing its `maskType` guards the exact sibling range currently affected by that mask, identified from the pre-mutation hierarchy and pinned Figma mask-boundary semantics.

Every member of the selected range must be inside scope before the effective mask change. The implementation must fail closed if it cannot identify an existing mask's exact current range; it must not substitute the complete suffix unless pinned and live evidence establishes that the two are identical for the relevant parent and mask type. `maskAffectedNodes` names the guarded pre-mutation range; it is not a claim that every node's pixels visibly changed in a particular fixture.

### D5 — Success is live readback; failure is reconciliation

A successful result reads values from the Figma node after mutation. It never echoes unverified input as state. Predictable failures mutate nothing. Unexpected native failures preserve the initiating error and disclose observed before/requested/resulting state without an automatic retry or rollback claim.

## 7. Discovery and migration workflow

Discover the node and exact current name before writing:

```ts
node_info({
  nodeIds: [nodeId],
  properties: [
    "name",
    "effects",
    "visible",
    "opacity",
    "blendMode",
    "isMask",
    "maskType",
    "parent"
  ],
  maxDepth: 0
});
```

For a mask decision, read the returned parent at depth 1 to inspect its exact identity and child order. That read helps plan the call; the plugin still re-resolves and authorizes the complete mask context at execution time.

The effect-only migration is a name replacement with the same exact target identity and effect payload:

```ts
// Retired
node_set_effects({ nodeId, nodeName, effects });

// Required replacement
node_set_appearance({ nodeId, nodeName, effects });
```

Related but distinct decisions remain explicit:

```ts
// Set literal appearance on one node.
node_set_appearance({ nodeId, nodeName, opacity: 0.5 });

// Link an existing shared effect style.
node_apply_style({ nodeId, nodeName, styleId, styleType: "EFFECT" });

// Create or update a shared effect-style definition.
style_manage({ type: "EFFECT", /* exact style identity and properties */ });
```

No workflow reads `figma.currentPage.selection`, and no guide may recommend selection as a fallback.

## 8. Exact public contract

```ts
type BlendMode =
  | "PASS_THROUGH"
  | "NORMAL"
  | "DARKEN"
  | "MULTIPLY"
  | "LINEAR_BURN"
  | "COLOR_BURN"
  | "LIGHTEN"
  | "SCREEN"
  | "LINEAR_DODGE"
  | "COLOR_DODGE"
  | "OVERLAY"
  | "SOFT_LIGHT"
  | "HARD_LIGHT"
  | "DIFFERENCE"
  | "EXCLUSION"
  | "HUE"
  | "SATURATION"
  | "COLOR"
  | "LUMINOSITY";

type MaskType = "ALPHA" | "VECTOR" | "LUMINANCE";

// The exact strict node-effect union owned by the implementation baseline.
// At the drafting baseline this is DROP_SHADOW | INNER_SHADOW |
// LAYER_BLUR | BACKGROUND_BLUR; Section 8.2 preserves that surface.
type NodeEffect = /* strict per-variant union */;

type NodeSetAppearanceInput = {
  nodeId: string;
  nodeName: string;
  effects?: NodeEffect[]; // [] clears literal effects
  visible?: boolean;
  opacity?: number;       // finite, inclusive 0..1
  blendMode?: BlendMode;
  isMask?: boolean;
  maskType?: MaskType;
};
```

### 8.1 Top-level schema rules

- The top-level object and all nested effect objects are strict. Unknown keys fail; they are never stripped.
- `nodeId` and exact current `nodeName` are required.
- At least one of `effects`, `visible`, `opacity`, `blendMode`, `isMask`, or `maskType` is required.
- Omission means preserve the current value. Supplying `false`, `0`, or `[]` is presence and must never be treated as omission.
- `effects` may be empty; an empty array is the explicit clear operation.
- `opacity` is a finite number in the inclusive range `0..1` at the MCP boundary and again at the plugin boundary.
- `blendMode` and `maskType` use the closed enums above. They are not free strings.
- Every supplied field must be writable on the resolved target. A call with any unsupported supplied property fails as one complete preflight.
- Tool descriptions explicitly distinguish `visible: false` from `opacity: 0` and literal effects from linked effect styles.

### 8.2 Effect preservation contract

The source PRD writes `Effect[]` as shorthand. For this standalone release it means the exact strict effect surface already accepted by the retired node tool on the scheduled baseline, not every variant accepted by `style_manage` and not an open Figma catchall.

At the 2026-08-04 drafting baseline, `NodeEffect` contains exactly:

- `DROP_SHADOW`;
- `INNER_SHADOW`;
- `LAYER_BLUR`;
- `BACKGROUND_BLUR`.

The hard cutover preserves these rules:

- unknown types, unknown keys, and cross-variant keys fail at the MCP boundary;
- `showShadowBehindNode` is `DROP_SHADOW`-only;
- a progressive blur requires `blurType: "PROGRESSIVE"` and all of `startRadius`, `startOffset`, and `endOffset`; those fields are invalid on a normal blur;
- supplied colors are complete RGBA values with every channel in `0..1`;
- shadow and blur radii are non-negative;
- effect `blendMode`, where supported by that variant, uses the same closed `BlendMode` enum;
- established defaults for omitted effect-internal fields remain unchanged;
- `normalizeEffects` forwards every validated field and may only add the established defaults; it cannot rebuild effects from a lossy field allowlist;
- the success readback returns the actual normalized effect array stored by Figma.

This release neither adds nor removes an effect variant. If an earlier scheduled release deliberately changes the node-effect subset, Phase 0 records that accepted baseline and this hard cutover preserves it exactly. A broader shared-style union does not widen the node setter by implication.

### 8.3 Visibility and opacity semantics

- `visible: false` uses Figma visibility semantics: the layer is removed from rendering and from hit-testing/layout behavior where Figma applies visibility semantics.
- `opacity: 0` keeps the layer present while making it transparent.
- The two properties remain independently writable and independently readable.
- Supplying one never rewrites, defaults, or derives the other.
- A target that supports one supplied property but not another still rejects the complete call before either setter.

### 8.4 Mask cross-field rules

Mask validity is evaluated against the resolved live state:

| Input/state | Result |
| :- | :- |
| `isMask: true` with optional `maskType` | Enable the mask after containment preflight; set `isMask` before `maskType` |
| `isMask: false` without `maskType` | Disable the mask after containment preflight when this is an effective change |
| `maskType` with omitted `isMask` and live `isMask === true` | Change the existing mask type after containment preflight |
| `maskType` with omitted `isMask` and live `isMask !== true` | Refuse with a corrected call that includes `isMask: true` |
| `isMask: false` together with `maskType` | Refuse before mutation; the requested final state is internally inconsistent |
| Supplied mask fields already equal live state | Valid idempotent no-op; return readback and do not claim affected nodes |

Mask containment runs whenever the requested final mask state or type differs from live state. Other appearance fields may be combined with a mask change only after the complete mask plan passes.

### 8.5 Deterministic mutation order

After complete preflight, apply only supplied fields in this order:

1. `effects`;
2. `visible`;
3. `opacity`;
4. `blendMode`;
5. `isMask`;
6. `maskType`.

The order is observable only for unexpected native failures; no predictable invalid field may be discovered during this sequence. When enabling a mask with an explicit type, `isMask` necessarily precedes `maskType`.

No `await`, target re-resolution, telemetry call, or other fallible asynchronous work may occur between the final containment/snapshot step and these synchronous setters. This narrows but does not eliminate the documented TOCTOU residual.

### 8.6 Success output

```ts
type NodeSetAppearanceResult = {
  id: string;
  name: string;
  appearance: {
    effects?: NodeEffect[];
    visible?: boolean;
    opacity?: number;
    blendMode?: BlendMode;
    isMask?: boolean;
    maskType?: MaskType;
  };
  maskAffectedNodes?: Array<{
    id: string;
    name: string;
  }>;
};
```

Result rules:

- `id` and `name` come from the resolved live target.
- `appearance` includes every requested field, read back from the target after all setters complete.
- If either mask field was requested, both readable post-state mask fields are returned so the final pairing is verifiable.
- Values are actual Figma readback, including established effect defaults or other host normalization; they are not the request payload copied into the result.
- `maskAffectedNodes` is present only for an effective mask state/type change. It contains the exact guarded pre-mutation range in parent-child order: the complete subsequent-sibling suffix for enablement, or the currently affected range for disabling/type change. Enabling cannot produce an empty array; disabling or changing an existing mask may.
- Omitted, unsupported, unrequested non-mask fields are absent rather than invented as `null`.
- A successful absolute no-op is valid.

Annotations are:

```ts
{
  idempotentHint: true,
  openWorldHint: true
}
```

Annotations are advisory. Plugin-side gates and preflight remain authoritative.

## 9. Safety and mask-containment contract

### 9.1 Existing node-write stack

`node_set_appearance` inherits the complete single-node write stack before handler-specific validation:

1. node-edit permission and a valid connected scope;
2. target resolution and scope containment;
3. exact `nodeName` verification against the resolved node;
4. target/ancestor lock refusal;
5. handler support and cross-field validation.

The rename cannot weaken any permission, scope, name, lock, hostile-error normalization, or structured-partial-state guarantee present on the scheduled baseline. URL-format node IDs retain the common normalization path.

### 9.2 Complete handler preflight

Before the first setter, the plugin must:

1. resolve the target exactly once and retain the authorized reference;
2. verify that every supplied field exists and is writable on that target;
3. validate and normalize the complete effect array without assigning it;
4. validate opacity, enums, top-level presence, and all mask cross-field rules again;
5. resolve the target's parent and child index for an effective mask change;
6. complete the containment algorithm in Section 9.3;
7. snapshot every requested field's readable live value;
8. snapshot mask parent identity, child order, and the transition-specific guarded affected range when applicable;
9. perform no remaining asynchronous or predictably fallible preparation before mutation.

If any step fails predictably, zero appearance setters run.

### 9.3 Mask containment algorithm

For an effective `isMask` or `maskType` change:

1. Require the target to have a live parent and require that parent to contain the exact target ID in `children`.
2. Require the parent to have children and have exact type `GROUP`, `FRAME`, `COMPONENT`, `COMPONENT_SET`, or `SECTION`.
3. Require the parent itself to be inside the connected editable scope.
4. Reject a target that is an `INSTANCE` descendant or whose containing structural path crosses an `INSTANCE` interior.
5. If transitioning from non-mask to mask, compute the potentially affected set as every child after the target in the parent's current `children` order and require at least one member.
6. If disabling an existing mask or changing its type, identify the exact range currently affected by that mask from the current child order and the release-pinned mask-boundary rules before mutation. Fail closed when that range cannot be established; do not conservatively widen it to the full suffix unless the pinned and live probes prove equivalence for that case.
7. Require every node in the transition-specific affected set to be inside the connected editable scope.
8. Snapshot the ordered `{ id, name }` set for success or recovery evidence.
9. Reuse that exact pre-mutation set for the write and result; never recompute after mutation and present the new range as the authorized range.

The containment authorization covers rendering impact only. The handler assigns no field on a sibling.

### 9.4 Preservation rules

- Omitted appearance fields on the target remain unchanged.
- Unrelated target `componentPropertyReferences`, variable bindings, style links, plugin data, and structural placement remain unchanged.
- A directly targeted property may undergo only the native Figma consequences of assigning that property; the handler performs no additional unlink, clear, or migration operation.
- Sibling names, properties, component-property references, variables, styles, and hierarchy remain byte-for-byte unassigned by this handler.
- Mask enable/disable/type changes do not automatically group, reparent, reorder, clone, or delete any node.

### 9.5 Accepted residuals

Complete preflight is not a transaction. A user or the host may change target/parent state between validation and synchronous assignment, and Figma may throw after one or more setters. The implementation narrows this window by using retained references and one synchronous mutation sequence; it does not claim a lock or rollback system.

## 10. Structured errors and partial-state rules

### 10.1 Required predictable distinctions

New conditions originate through the central structured-error registry. The code names below are the standalone contract; an implementation that renames or merges them requires a reviewed PRD amendment.

| Code | Condition | Required `details` and recovery |
| :- | :- | :- |
| `APPEARANCE_PROPERTY_UNSUPPORTED` | At least one supplied field is not writable on the resolved target | Target ID/name/type, `unsupportedFields`, `supportedFields`, and a complete corrected call omitting unsupported fields when at least one mutation remains |
| `MASK_REQUIRES_ENABLE` | `maskType` was supplied for a live non-mask without `isMask: true`, or was paired with `isMask: false` | Target ID/name, current mask state, supplied values, and the exact corrected `node_set_appearance` call with `isMask: true` or with `maskType` removed |
| `MASK_NOT_CONTAINED` | Parent is missing/unbounded/out of scope, target is in an instance interior, target index is inconsistent, or any affected sibling is out of scope | Target, parent, accepted parent types, ordered affected nodes, out-of-scope identities subject to disclosure policy, scope root, failed containment reason, and explicit group/reconnect/retry guidance |
| `MASK_HAS_NO_AFFECTED_SIBLING` | A non-mask target is being enabled as the final child | Target/parent identity, target index, current child count/order, and guidance to place intended content after the mask inside one bounded in-scope parent |
| `MASK_AFFECTED_RANGE_UNAVAILABLE` | An existing mask's exact current affected range cannot be established from the pinned semantics and live hierarchy | Target/parent identity, mask state/type, child order, evidence gap, and guidance to inspect/restructure the bounded mask group before retrying; no appearance setter runs |

Malformed input that the emitted schema can reject still returns the MCP invalid-params boundary with the exact issue path and accepted values. The plugin repeats semantic validation for callers that bypass the schema; schema validation is not a safety boundary.

Existing permission, scope, name, lock, node-not-found, and Figma API conditions retain the then-current central codes and recovery contracts. This release does not parse codes from prose or collapse known errors into `UNKNOWN_ERROR`.

Example containment message:

```text
MASK_NOT_CONTAINED: Changing isMask on "Mask Shape" would affect sibling layers
outside the connected scope because its parent "Page 1" is not in scope. Group the
mask and intended content inside the editable scope, then retry node_set_appearance.
```

### 10.2 Predictable refusal invariant

Every predictable refusal occurs before `effects`, `visible`, `opacity`, `blendMode`, `isMask`, or `maskType` assignment. A test must inject an invalid last field into an otherwise valid multi-field call and prove that the first field did not change.

### 10.3 Unexpected native failure

Before mutation, snapshot the readable pre-state for every requested field. After any setter or success readback throws:

1. stop issuing later setters;
2. guard-read every requested field plus both mask fields when relevant;
3. compare readable post-state with `before` and `requested`;
4. preserve the initiating error code/message as primary;
5. attach `details.partialMutation: true` when state changed or when a crossed setter's post-state cannot be confirmed;
6. attach `details.outcomeUnknown: true` for any requested field whose post-state is unreadable;
7. include `failedField`, `before`, `requested`, `resulting`, `whatChanged`, and the preflight mask context;
8. omit `partialMutation` only when complete guarded readback proves no durable requested field changed;
9. never automatically retry or claim rollback.

If every setter completes but required success readback fails, do not return ordinary success. The call reports the applied-or-unknown outcome through the same partial-state envelope.

Best-effort progress, logging, serialization, and fallback formatting cannot erase the mutation outcome. A hostile thrown value may normalize the initiating code to canonical `UNKNOWN_ERROR`, but independently constructed partial-state evidence remains authoritative and must be reconciled before retry.

## 11. Dependencies and exclusions

### Required baseline

- The existing literal node-effect schema, normalizer, handler, and strict schema-to-handler parity tests.
- The current single-node permission, scope, exact-name, and locked-target dispatcher stack.
- Exact node discovery and readable `effects`, `visible`, `opacity`, `blendMode`, `isMask`, `maskType`, and `parent` fields through `node_info` or an equivalent scheduled read contract.
- The central structured-error boundary, total arbitrary-throw normalization, partial-mutation evidence convention, safety-contract tests, generated manifest, plugin bundle gate, and version gates.
- Pinned Figma declarations and a live Design host that expose the mask fields and allowed parent behavior described here.

If the scheduled baseline lacks an equivalent prerequisite, Phase 0 blocks implementation until this PRD is revised or the prerequisite is restored.

### Relationship to the typings/SHADER release

[`PRD-002-Figma-Typings-Bump-and-Shader-Effects.md`](PRD-002-Figma-Typings-Bump-and-Shader-Effects.md) is not a mandatory predecessor. It owns the declaration pin, `SHADER`, `noiseSizeVector`, and generated-field review. This appearance release owns no typings bump and no new effect variant.

If PRD-002 or another earlier release changes the literal **node** effect subset, Phase 0 must preserve the resulting reviewed subset through the rename and rerun parity. A change confined to the broader shared-style union does not silently widen `node_set_appearance`.

### Explicitly excluded adjacent releases

Transform/ellipse geometry, page rename, layout, paint/stroke/image metadata, text, native creation, variables, components, instances, and structural combine remain separate minor releases even when they touch `src/mcp_server/tools/node.ts`, the same guides, or the same release gates.

## 12. Implementation areas and phases

### Primary files and artifacts

- `src/mcp_server/tools/node.ts`
- `src/mcp_server/tools/style.ts` only if a shared exported enum/schema must be reused without changing its accepted surface
- `src/mcp_server/figma-client.ts`
- `figma_plugin/src/main.ts`
- `figma_plugin/handlers/stylingHandlers.ts`
- `figma_plugin/utils/errors.ts`
- `src/mcp_server/tests/unit/tools/`
- `src/mcp_server/tests/unit/figma_plugin/`
- `README.md`, `SAFETY.md`, and `CHANGELOG.md`
- `skills/figma-edit/references/` and their runtime `figma-edit://guide/*` resource sources
- generated root `manifest.json`
- generated `figma_plugin/code.js`
- release-version surfaces enforced by current checks

This inventory is a starting point. Phase 0 must search the scheduled baseline for every active old-name route/reference and every generated owner before edits.

### Phase 0 — Revalidate the scheduled baseline

- Record the current package version, typings pin, tool count/list, emitted schemas, accepted node-effect branches, normalizer behavior, dispatcher gate stack, output contract, generated owners, and clean verification counts.
- Search for every `node_set_effects` route/reference and classify it as active, generated, migration, test, or historical.
- Verify that the `node_info` fields used by discovery/readback are present.
- In a disposable live file, verify `visible` versus `opacity`, mask field writability, allowed parent types, child-order semantics, the enablement suffix, and the exact currently affected range for disabling/type changes across representative mask boundaries.
- Stop and revise this PRD if the pinned host contradicts the parent/child or mask-type contract; do not infer around a live discrepancy.

### Phase 1 — Schema, taxonomy, and migration map

- Register the strict `node_set_appearance` input/output schema and closed enums.
- Reuse the exact baseline `NodeEffect` objects; do not fork or loosen them.
- Add the top-level at-least-one-field refinement and visible-versus-opacity descriptions.
- Add the four central error factories and error-playbook entries.
- Add the exhaustive active-reference migration map and retired-route assertions.
- Red-proof emitted schema, enum, strictness, effect-parity, and old-name-absence levers before handler completion.

### Phase 2 — Complete preflight and appearance handler

- Refactor `setEffects` into an appearance handler without losing effect normalization.
- Implement per-field capability checks, pure pre-normalization, mask cross-field validation, and before-state snapshots.
- Implement one shared transition-aware mask-span helper: complete suffix for enablement and pinned exact current range for existing-mask disable/type changes.
- Apply the deterministic setter order with no intervening `await`.
- Add live readback plus unexpected-failure reconciliation.

### Phase 3 — Hard-cutover routing and safety

- Replace the command-union member and dispatcher case.
- Remove the old registration, route, and handler export naming; leave no internal compatibility path.
- Replace the `SAFETY.md` row with the complete appearance and mask gate stack.
- Update permission/safety expected-contract tables and bidirectional registered-write/safety-row checks.
- Prove both directions of old-name absence across source and generated surfaces.

### Phase 4 — Contract synchronization and release artifacts

- Update README tool tables, tool descriptions, workflows, tool selection, constraints, error playbook, and runtime resource content.
- Publish effect-only rename, visible-versus-opacity, mask discovery/containment, and shared-style alternative examples.
- Add a prominent CHANGELOG hard-cutover entry and old-to-new example.
- Regenerate the root manifest and plugin bundle through their owners; never hand-edit generated output.
- Assign and apply the standalone minor version across every enforced surface.

### Phase 5 — Repository and live closure

- Run focused schema, handler, dispatcher, safety, output, resource, generated, build, version, and full-suite gates.
- Red-proof the production/contract lines listed in Section 13.5, restore them, and record exact red/green counts.
- Run the complete live matrix on a dedicated disposable file without conflating mock/fixture evidence with live Figma evidence.
- Reconcile the file to its recorded baseline and report any unavailable live fixture honestly.
- Tag only when every acceptance item is closed and evidence classes are explicit.

## 13. Verification requirements

### 13.1 Emitted-schema and MCP-boundary tests

- `tools/list` contains `node_set_appearance` and not `node_set_effects`.
- The release's tool count is unchanged.
- The top-level schema is strict and requires at least one mutation field.
- `effects: []`, `visible: false`, and `opacity: 0` survive parsing as supplied values.
- Invalid opacity, blend mode, mask type, unknown top-level key, unknown effect key, and cross-variant effect field fail at the exact issue path.
- The emitted effect union exactly matches the scheduled node-effect baseline and preserves its nested refinements/descriptions.
- Descriptions distinguish visibility from opacity and literal effects from shared effect styles.
- The output schema includes nested `appearance` readback and ordered `maskAffectedNodes` identities.
- Annotations are exactly the absolute-setter contract in Section 8.6.

### 13.2 Plugin handler tests

- One success and one unsupported-property refusal for each of `effects`, `visible`, `opacity`, `blendMode`, `isMask`, and `maskType`.
- Effect-only regression fixtures preserve accepted variants, defaults, normalization, clears, and field-forwarding behavior.
- Visibility-only, opacity-only, blend-only, mask-only, and valid combined calls return actual post-state.
- `visible: false` and `opacity: 0` remain distinct, and changing one preserves the other.
- Every omitted field remains unchanged.
- `maskType` on an existing mask succeeds; on a non-mask it returns `MASK_REQUIRES_ENABLE` with the corrected call.
- `isMask: false` plus `maskType` is refused before mutation.
- Each allowed bounded parent type succeeds in a representative fixture.
- A missing/unbounded parent, parent outside scope, target-index mismatch, target inside an instance, and any out-of-scope member of the transition-specific affected range return `MASK_NOT_CONTAINED` before all setters.
- Enabling the last child returns `MASK_HAS_NO_AFFECTED_SIBLING`.
- An unresolvable current affected range for an existing mask returns `MASK_AFFECTED_RANGE_UNAVAILABLE` before all setters.
- Enabling returns the exact ordered subsequent-sibling suffix; disabling and changing type return the exact ordered range affected before mutation; a mask no-op returns no affected-node claim.
- Sibling properties/hierarchy and unrelated target bindings/styles/references remain unchanged.
- Deterministic setter order is asserted.
- A valid first field plus a predictably invalid last field invokes zero setters.
- Injected failure at each setter stops later setters and returns exact `before`, `requested`, `resulting`, `failedField`, `whatChanged`, and partial/unknown flags.
- Injected success-readback failure cannot become ordinary success.
- Repeating an identical absolute request is an idempotent no-op result.

### 13.3 Dispatcher and safety tests

- Permission, scope, exact-name, and locked-target failures happen before the appearance handler.
- The target-only ordinary property stack is preserved for non-mask calls.
- Mask parent, bounded-container, transition-specific affected-range scope, and instance-interior guards execute inside the plugin trust boundary.
- A target that is itself the scope root cannot enable a sibling-affecting mask through an out-of-scope parent.
- No handler or recovery path reads current selection or uses an implicit current page.
- Registered writes and `SAFETY.md` rows stay bidirectionally synchronized.
- The old command is absent from registration, client unions, dispatch, handler routes, active guides, manifests, and committed bundle.
- Historical/migration mentions are allowlisted narrowly and do not create a callable route.

### 13.4 Live Figma matrix

Verify in a real Figma Design file:

1. preserve, replace, and clear literal effects through the new name, with actual normalized readback;
2. independently toggle `visible` and set opacity to `0`, proving distinct behavior and readback;
3. set representative node blend modes and verify Figma-normalized output;
4. enable `ALPHA`, `VECTOR`, and `LUMINANCE` masks in bounded group-like fixtures;
5. verify the exact subsequent-sibling order returned for enablement as `maskAffectedNodes`;
6. disable an existing mask and change its type, returning the exact pre-mutation currently affected range and preserving unrelated fields;
7. refuse an enabling mask with no subsequent sibling;
8. refuse a target whose parent or affected sibling lies outside scope;
9. refuse a mask edit inside an instance interior;
10. combine effects/visibility/opacity/blend/mask in one valid call and verify exact readback;
11. prove an invalid later field leaves all earlier fields unchanged;
12. independently verify the final state through `node_info`.

The live record includes Figma environment, plugin/server build versions, exact fixture IDs/names, request/result envelopes, before/after state, and cleanup. Hermetic mocks establish only their encoded behavior and are not reported as live Figma proof.

### 13.5 Required red proofs

Temporarily break, one at a time, the exact production or invariant line that protects:

1. removal of the old registered name;
2. the top-level at-least-one-field refinement;
3. preservation of `false`, `0`, and `[]` presence;
4. complete preflight before the first setter;
5. parent-in-scope enforcement;
6. transition-specific affected-sibling scope enforcement;
7. instance-interior refusal;
8. node-effect field-forwarding/parity;
9. required post-write readback;
10. generated plugin-bundle freshness.

For each lever, record the named failing test and exact failure count, restore the protected line, and rerun the same scope green. A test that passes before and after the intended break is not evidence for that invariant.

## 14. Documentation, generated output, and version gates

Before release:

- Update [`README.md`](../../../README.md), [`SAFETY.md`](../../../SAFETY.md), and [`CHANGELOG.md`](../../../CHANGELOG.md).
- Update [`constraints.md`](../../../skills/figma-edit/references/constraints.md), [`error-playbook.md`](../../../skills/figma-edit/references/error-playbook.md), [`workflows.md`](../../../skills/figma-edit/references/workflows.md), and [`tool-selection.md`](../../../skills/figma-edit/references/tool-selection.md); their runtime `figma-edit://guide/*` resources must serve the same current content.
- Include an old-to-new name table, an effect-only migration example, visible-versus-opacity guidance, mask discovery/containment recovery, and the `node_apply_style`/`style_manage` alternatives.
- Replace the old `SAFETY.md` row with `node_set_appearance`: node-write stack, per-field support, complete-call preflight, and mask parent/sibling/instance containment.
- Update every tool-count, expected-tool-list, output-schema, contract-seam, permission-matrix, safety-contract, retired-route, and active-reference assertion.
- Run the canonical manifest generator and commit its root `manifest.json` output.
- Rebuild `figma_plugin/code.js` from source and rerun the bundle gate; never hand-edit the bundle.
- Assign the scheduled minor version in root `package.json`, root `package-lock.json` release fields, both root `server.json` version fields, and root `manifest.json`. Verify the derived plugin About/handshake/bundle output through `check:plugin`; do not add a version to `figma_plugin/manifest.json` or hard-code one in `src/shared/version.ts`.
- Add a CHANGELOG entry that states the hard cutover prominently; a minor version does not make the rename source-compatible.

Required repository gates, using the scripts present on the scheduled baseline, include:

- focused appearance/schema/dispatcher/safety/resource tests;
- `bun run gen:manifest` followed by a clean generated diff review;
- `bun run build:all`;
- `bun run check:generated`;
- `bun run check:plugin`;
- `bun run check:versions`;
- `bun run check:types:plugin`;
- `bun run check:types:scripts`;
- `bun run check:suppressions`;
- the full `bun test src/mcp_server/tests` suite;
- scoped `git diff --check` and a final search for active old-name remnants.

If the full suite needs loopback/local-socket permission, rerun with that capability before classifying the failure as a product defect. Record focused and full-suite counts separately.

## 15. Acceptance gate

The release is complete only when:

- [ ] `node_set_appearance` publishes the exact strict input/output contract in this PRD.
- [ ] `node_set_effects` has no registered alias, client-union member, dispatcher route, handler route, active guide entry, manifest tool entry, or bundle command.
- [ ] The tool count is unchanged and the hard cutover is prominent in release guidance.
- [ ] Every baseline node-effect input, default, validation, normalization, clear, and readback behavior survives the rename.
- [ ] Visibility and opacity remain distinct and independently editable.
- [ ] Invalid opacity, blend, mask, unknown, and cross-variant values fail before the plugin setter boundary where schema-visible.
- [ ] Every supplied target property is supported before any mutation begins.
- [ ] Mask changes require an in-scope bounded parent, no instance interior, and a wholly in-scope transition-specific affected range: complete subsequent-sibling suffix for enablement and exact current range for existing-mask disable/type change.
- [ ] Enabling a mask with no affected sibling is refused with one-round-trip repair guidance.
- [ ] Predictably invalid combined calls apply zero fields.
- [ ] Success returns actual Figma readback for every requested field and ordered affected-node identities for an effective mask change.
- [ ] Unexpected failures preserve the initiating error and disclose exact or explicitly unknown residual state without a rollback claim.
- [ ] Schema, handler, dispatcher, safety, injected-fault, red-proof, generated-artifact, full-suite, and live-host requirements pass or carry an explicit release-blocking status.
- [ ] README, SAFETY, CHANGELOG, guides/resource content, manifests, plugin bundle, and version surfaces are synchronized.
- [ ] Repository/mock, injected-fault, and live Figma evidence are labeled separately.
- [ ] No adjacent scope entered the release.

## 16. Risks and mitigations

| Risk | Mitigation |
| :- | :- |
| Hard cutover breaks existing prompts or clients | Prominent minor-release compatibility warning, exact rename example, repo-wide active-reference gate, and no ambiguous alias |
| Models confuse invisibility with transparency | Repeat distinct semantics in tool/field descriptions, guides, emitted-schema tests, and live readback fixtures |
| A later unsupported field leaves an earlier valid field applied | Resolve capabilities and validate the complete request before the first setter; inject invalid-last-field tests |
| Mask propagation reaches outside the named target | Require the parent and exact transition-specific affected range in scope; return the guarded identities |
| Pinned Figma mask-span behavior differs from assumptions | Phase 0 and release live probes; fail closed and revise the PRD instead of weakening containment |
| Fail-closed containment prevents disabling an already unsafe/unbounded mask | Preserve the source's symmetric guard; return explicit regroup/reconnect guidance rather than bypassing scope |
| Effects regress during the rename | Reuse the exact baseline schema objects and normalizer; parity, field-forwarding, clear, and readback regression tests |
| A shared-style effect expansion silently widens node literals | Keep node and style unions separate; require an explicit reviewed change to the node subset |
| Figma throws after some absolute setters | Deterministic order, guarded readback, primary initiating error, partial/outcome-unknown disclosure, no automatic retry |
| Readback or telemetry failure hides a committed change | Treat missing required readback as a partial/unknown error and make reporting best-effort/total |
| Stale docs keep teaching the old tool | Active-reference inventory, guide/resource tests, generated manifest/bundle checks, and CHANGELOG migration table |
| MCP annotations are mistaken for enforcement | State their advisory status and assert all controls in the plugin dispatcher/handler path |

## 17. Source fidelity, clarifications, and unresolved evidence

This standalone extraction preserves the umbrella's appearance scope and cross-cutting contracts. It makes three previously implicit points exact:

1. The umbrella's `effects?: Effect[]` notation maps to the existing strict **node** effect subset. It does not silently import variants that only `style_manage` accepts.
2. `isMask: false` plus `maskType` is rejected because it requests a mask type for a final non-mask state. The umbrella explicitly defined the omitted-`isMask` case but did not spell out this contradictory pair.
3. The umbrella's optional result fields are defined here as actual readback for every requested field, with paired mask readback when relevant. Unrequested fields are not echoed or invented.

The exact live rendering boundary for nested masks and each allowed parent type remains release-blocking evidence to collect, not a current-behavior claim. Enablement deliberately guards the full subsequent-sibling suffix. Existing-mask disable/type changes must use the range actually affected before mutation; a pinned or live inability to derive that range blocks release rather than authorizing an over-broad suffix or an under-broad guess. A contradiction in parent/type/property behavior requires a PRD revision.

There is no unresolved product-contract contradiction after the clarifications above. The source's symmetric containment rule can prevent this tool from disabling an already uncontained mask; that is a deliberate fail-closed tradeoff preserved here, not silently relaxed.

## 18. Provenance and references

### Source record

| Evidence | Record |
| :- | :- |
| Canonical source file | [`planning/future/initiative/03 - Figma Design Editing Capability Expansion/initiative.md`](../initiative/03%20-%20Figma%20Design%20Editing%20Capability%20Expansion/initiative.md) |
| Source section | [Section 4 — `node_set_appearance`](../initiative/03%20-%20Figma%20Design%20Editing%20Capability%20Expansion/initiative.md#4-node_set_appearance-effects-visibility-opacity-blend-mask-p0) |
| Source checklist row | Item 4 in the same document |
| Cross-cutting source | [Section 20 — safety and error contract](../initiative/03%20-%20Figma%20Design%20Editing%20Capability%20Expansion/initiative.md#20-cross-cutting-safety-and-error-contract-p0) |
| Historical Git commit | [`40d39e8bb48edacade40111e1d00b8bf82b7a5d8`](https://github.com/neozhehan/figma-edit-mcp/blob/40d39e8bb48edacade40111e1d00b8bf82b7a5d8/planning/future/Figma%20Design%20Editing%20Capability%20Expansion/prd.md) |
| Source Git blob | `9f1ec339ea5526bb4668a77edb6bd768d2cf32e0` |
| Source SHA-256 at extraction | `23cc718af794f8ec981244979f50b042229a5125d0e8b8000a4f17399cf39d77` |
| Appearance origin in source history | Rev 1, 2026-07-18 |

### Drafting-baseline repository evidence

The following 2026-08-04 inspection is repository evidence, not proof of the future implementation or current live Figma behavior:

| Area | Verified source | Drafting-baseline finding |
| :- | :- | :- |
| MCP node tool | `src/mcp_server/tools/node.ts` | Registers `node_set_effects` with exact `nodeId`, `nodeName`, and strict node effects; no visibility/opacity/blend/mask write fields |
| Node/style effect schema | `src/mcp_server/tools/style.ts` | Reuses four strict node-effect branches while shared effect styles have a broader union |
| Plugin handler | `figma_plugin/handlers/stylingHandlers.ts` | `setEffects` validates effect support, normalizes without an intended field-loss path, assigns one effects array, and returns effects |
| Dispatcher | `figma_plugin/src/main.ts` | Applies the single-node permission/scope/name/lock stack before `setEffects` |
| Command union | `src/mcp_server/figma-client.ts` | Still contains `node_set_effects` |
| Safety contract | [`SAFETY.md`](../../../SAFETY.md) | Current row covers node permission, scope, name, and lock for the old tool; it has no mask-propagation gates |
| Read fields | `skills/figma-edit/references/node-fields.md` | Generated guide exposes `visible`, `opacity`, `blendMode`, `isMask`, and `maskType` read properties |
| Existing regression suites | `src/mcp_server/tests/unit/tools/` and `src/mcp_server/tests/unit/figma_plugin/` | Contain tool-list, output, effect-schema/normalizer, dispatcher, and safety assertions that must move with the hard cutover |

The source PRD and this drafting snapshot are planning evidence. Only completed code, green repository gates, injected adverse tests, and a separately labeled live matrix can establish implementation and host behavior.
