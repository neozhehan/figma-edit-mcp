# PRD — Transform and Ellipse Geometry

- **Status:** Proposed
- **Release:** Version-unassigned standalone minor release
- **PRD date:** 2026-08-04
- **Source:** [Figma Design Editing Capability Expansion, Section 2](../Figma%20Design%20Editing%20Capability%20Expansion/prd.md#2-rotation-and-existing-ellipse-arcs-in-node_transform-p0)
- **Compatibility posture:** Additive expansion of `node_transform`; no new or renamed MCP tool

> [!IMPORTANT]
> This PRD is one independently releasable minor release. It owns absolute rotation, existing-ellipse arc editing, and the shared `ArcData` schema/value validator. It does not include layout, page rename, structural combination, appearance, paint, text, or creation-surface expansion.

## 1. Executive summary

Expand `node_transform` so one exact-node call can set absolute rotation and patch an existing ellipse's arc geometry alongside position and size. The contract keeps Figma's two unit systems explicit: node rotation is measured in degrees, while ellipse start/end angles are measured in radians.

The handler must resolve and authorize the target, snapshot requested state, validate every affine, layout, and merged-arc condition, and only then begin mutation. Predictable failures apply nothing. An unexpected Figma failure after a setter begins is not presented as atomic: the result reports exact before/requested/resulting state and the failed field group.

This release introduces the reusable `ArcData` schema and validator. Existing ellipse creation retains its creation defaults; existing-node editing merges omitted patch fields over live state. Later creation work may reuse the validator but must not redefine this release's editing contract.

## 2. Release identity and source mapping

| Source requirement | Disposition in this release |
| :- | :- |
| Source checklist item 2, add rotation to `node_transform` | Complete |
| Source checklist item 30, edit existing ellipse arcs | Complete |
| Product decision D27 | Preserved: arc editing is part of `node_transform`, not a new tool |
| Section 20 `node_transform` safety row | Owned here |
| Schema requirement 20 | Owned here |
| Phase 3 transform bullet | Expanded into the implementation phases below |
| Transform/arc schema, handler, safety, and live tests | Owned here |

Public-surface arithmetic for this release:

- tools added: 0;
- tools removed: 0;
- tools renamed: 0;
- tools expanded: `node_transform`;
- net tool-count change: 0.

The concrete version is assigned only when scheduled. At implementation time, all repository-enforced version surfaces must move from the then-current baseline to that assigned minor version.

## 3. Problem

The current public transform surface supports position and size but not rotation. Figma exposes writable rotation on compatible nodes and writable complete `arcData` on ellipses. Existing ellipse creation already has arc fields, but there is no safe write path for changing an existing ellipse without recreating it.

A naive field-by-field extension would create four failure modes:

1. degree rotation could be confused with radian arc angles;
2. a partial arc patch could reset omitted fields to creation defaults;
3. a bad arc field could be discovered only after position, size, or rotation already changed;
4. an unexpected later setter failure could be reported as if the call were transactional.

## 4. Goals

1. Add absolute `rotation` to the existing `node_transform` decision.
2. Add a strict, non-empty `arcData` patch for existing `ELLIPSE` nodes.
3. Preserve omitted live arc fields exactly.
4. Validate the complete affine/layout/arc plan before the first setter.
5. Use deterministic setter ordering and exact post-write readback.
6. Return one-round-trip repair operands for predictable failures.
7. Disclose residual state after unexpected partial mutation.
8. Establish one shared arc schema/value validator without conflating creation defaults and edit-time merge semantics.

## 5. Explicit non-goals

- No `node_set_arc` or generalized shape-geometry tool.
- No delta rotation; rotation is absolute.
- No arbitrary pivot point or general matrix-transform API.
- No implicit degrees-to-radians or radians-to-degrees conversion.
- No silent angle normalization before Figma.
- No non-ellipse `arcData` support.
- No change to current selection or implicit-current-page behavior.
- No general transaction or automatic rollback system.
- No expansion of `create_shape`; this release only preserves its existing ellipse behavior while centralizing validation.
- No layout, constraints, page rename, appearance, paint, text, or structural-combine work.

## 6. Product decisions

### D1 — Transform remains one user decision

Rotation and existing-ellipse arc geometry extend `node_transform`. A separate public tool would force the caller to choose between overlapping geometry tools and would make common resize-plus-arc edits multi-call.

### D2 — Units are never inferred

- `rotation` is an absolute Figma value in **degrees**.
- `arcData.startingAngle` and `arcData.endingAngle` are in **radians**.
- `Math.PI` is approximately `3.14159`.
- `2 * Math.PI` is approximately `6.28319`.

The schema, descriptions, examples, handler tests, and guides must all preserve this wording.

### D3 — Existing-node arc omission means preserve live state

The plugin reads the current complete `arcData`, overlays only supplied patch fields, validates the complete merged object, and assigns it once. Creation defaults of `0`, `2 * Math.PI`, and `0` remain creation-only semantics.

### D4 — Complete preflight precedes mutation

Scope, exact name, lock state, transform capability, auto-layout effects, numeric values, ellipse type, and merged arc state are all validated before the first setter. Consolidation is not permission to partially apply a predictably invalid request.

### D5 — Unexpected failure is reconciled, not hidden

After a native failure, the plugin reads every requested transform/arc field and reports what changed. It must not silently retry or claim rollback.

## 7. Exact public contract

```ts
type ArcData = {
  startingAngle: number;
  endingAngle: number;
  innerRadius: number;
};

type ArcDataPatch = {
  startingAngle?: number; // radians; 0 = right/x-axis
  endingAngle?: number;   // radians; clockwise from startingAngle
  innerRadius?: number;   // 0..1
};

type NodeTransformInput = {
  nodeId: string;
  nodeName: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;      // absolute Figma degrees
  arcData?: ArcDataPatch; // existing ELLIPSE only
};
```

### 7.1 Schema rules

- The top-level object and `arcData` are strict. Unknown keys fail; they are never stripped.
- At least one of `x`, `y`, `width`, `height`, `rotation`, or `arcData` is required.
- `arcData`, when present, contains at least one of its three fields. `{}` is invalid.
- All numeric inputs are finite.
- `width` and `height` are positive.
- `innerRadius` is between `0` and `1`, inclusive, at both the MCP and plugin boundaries.
- Descriptions identify degrees and radians and include the concrete `Math.PI` constants.

Example:

```json
{
  "nodeId": "10:24",
  "nodeName": "Progress ring",
  "width": 240,
  "height": 240,
  "rotation": 45,
  "arcData": {
    "startingAngle": 0,
    "endingAngle": 3.141592653589793,
    "innerRadius": 0.65
  }
}
```

Here, `45` is degrees and `3.141592653589793` is radians.

### 7.2 Eligibility and effective-state rules

- Resolve the exact target before mutation.
- Apply the existing node-write permission, scope, exact-name, lock, remote-state, instance-interior, and scope-root controls.
- Every supplied affine field must be writable on the target.
- `rotation` requires a writable numeric rotation property.
- `arcData` requires exact target type `ELLIPSE`.
- Existing auto-layout-controlled `x`/`y` checks run only when `x` or `y` is supplied. Rotation-only and arc-only calls are not refused merely because position is parent-controlled.
- Read and snapshot all requested current values before mutation.
- Read current complete ellipse `arcData`, merge the patch, and validate the merged result before mutation.

### 7.3 Mutation order

After complete preflight, apply field groups in this order:

1. resize;
2. rotation;
3. `x` and `y`;
4. one complete `arcData` assignment.

This preserves requested `x`/`y` as final absolute coordinates. Arc geometry does not resize ellipse bounds.

### 7.4 Success output

```ts
type NodeTransformResult = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // Figma-normalized degrees
  previousArcData?: ArcData;
  arcData?: ArcData; // exact Figma readback when requested
  warnings?: string[];
  partialMutation?: boolean;
  failedFieldGroup?: "RESIZE" | "ROTATION" | "POSITION" | "ARC_DATA";
};
```

Return the full resulting transform snapshot (`x`, `y`, `width`, `height`, and `rotation`) after every successful call, including calls that requested only one field. When `arcData` was supplied, also return both the prior and exact resulting complete arc object. A successful no-op is allowed when the requested absolute state already matches.

Annotations remain:

```ts
{
  idempotentHint: true,
  openWorldHint: true
}
```

MCP annotations are advisory; plugin-side enforcement is authoritative.

## 8. Safety and error contract

### 8.1 Predictable refusal invariant

Every predictable refusal occurs before resize, rotation, position, or arc assignment. In particular, a non-ellipse or invalid merged arc cannot leave valid affine fields applied.

### 8.2 Required error distinctions

The central taxonomy may share factories with existing errors, but callers must be able to distinguish:

| Condition | Required recovery details |
| :- | :- |
| Empty transform | Accepted mutation fields and a corrected call skeleton |
| Empty/unknown arc patch | Accepted arc fields and the rejected keys |
| `ARC_TARGET_NOT_ELLIPSE` | Target ID/name, observed type, required `ELLIPSE` type, and exact discovery/retry calls |
| Non-finite arc angle | Field, supplied value, radians wording, and valid numeric example |
| Invalid inner radius | Supplied value and inclusive `0..1` range |
| Unsupported rotation/transform property | Target type, unsupported field, accepted target capability |
| Auto-layout-controlled position | Target and parent identities, effective layout state, and a corrected call omitting or enabling the field |
| Unexpected native partial mutation | `before`, `requested`, `resulting`, `failedFieldGroup`, and `partialMutation: true` |

For `ARC_TARGET_NOT_ELLIPSE`, details include the canonical discovery path:

```ts
node_info({
  resultMode: "MATCHES",
  filter: { types: ["ELLIPSE"] },
  properties: ["arcData"]
});
```

If at least one non-arc mutation remains, also return a complete transform-only retry with `arcData` omitted. Never emit an empty retry for an arc-only request. Independent verification remains:

```ts
node_info({
  nodeIds: [nodeId],
  properties: ["arcData"],
  maxDepth: 0
});
```

### 8.3 Unexpected native failure

If any setter throws after mutation begins:

1. stop issuing further setters;
2. read back every requested affine and arc field;
3. compare with the pre-call snapshot and requested state;
4. report `partialMutation: true` whenever observable state changed;
5. identify the failed field group;
6. do not automatically retry or claim rollback.

## 9. Shared `ArcData` ownership

This release owns:

- the strict complete `ArcData` shape;
- the strict non-empty `ArcDataPatch` shape;
- finite-number and `innerRadius` validation;
- unit descriptions and examples;
- merge-over-live-state logic for editing;
- validator parity tests at the MCP and plugin boundaries.

Existing and future `create_shape` ellipse branches reuse the field/value validator but retain separate omission semantics:

| Context | Omitted arc field behavior |
| :- | :- |
| Existing-node `node_transform` | Preserve the current live value |
| Ellipse creation | Use explicit creation defaults: `0`, `2 * Math.PI`, `0` |

No later release may fork the accepted ranges or unit descriptions without revising this contract.

## 10. Dependencies and exclusions

### Required baseline

- Existing `node_transform` position/size behavior and node-write safety stack.
- Existing exact-node discovery through `node_info`.
- The strict `node_info` `MATCHES`/plural `types` contract must be scheduled before this release if the exact recovery example above is to ship unchanged. Otherwise implementation is blocked; the recovery text may not point to an unavailable call.
- Pinned Figma typings must expose writable node rotation and complete `EllipseNode.arcData` as described by the source PRD.

### Downstream consumers

The later creation-capability release may reuse the shared validator. It is not a prerequisite for this release.

### Explicitly excluded adjacent work

`node_set_layout`, PAGE rename, `node_set_appearance`, paint stacks, text ranges, creation branches, and `node_combine` remain separate releases even though some touch the same files.

## 11. Implementation areas and phases

### Primary files

- `src/mcp_server/tools/node.ts`
- `figma_plugin/handlers/nodeModifiers.ts`
- `figma_plugin/src/main.ts` when dispatcher plumbing or permission metadata changes
- the shared schema/validator module selected during implementation
- `src/mcp_server/tests/unit/tools/`
- `src/mcp_server/tests/unit/figma_plugin/`
- `SAFETY.md`
- `skills/figma-edit/references/` and matching `figma-edit://guide/*` resource sources
- generated `figma_plugin/code.js`

### Phase 0 — Revalidate the scheduled baseline

- Record current tool schema, handler behavior, typings pin, version surfaces, and green gates.
- Verify current Figma declarations and live support for absolute rotation and writable complete ellipse `arcData`.
- Verify the required `node_info` recovery call exists.

### Phase 1 — Shared schema and errors

- Add strict `ArcData` and `ArcDataPatch` definitions.
- Add transform at-least-one-field refinement and numeric constraints.
- Add unit-rich emitted descriptions.
- Add stable central error factories and playbook entries.
- Red-proof schema and description assertions before implementing handlers.

### Phase 2 — Complete preflight and handler

- Refactor transform handling to resolve, snapshot, and validate the complete plan.
- Implement rotation support checks and ellipse live-state merge.
- Apply the deterministic field-group order.
- Add exact readback and native-failure reconciliation.

### Phase 3 — Existing creation parity

- Move existing ellipse creation onto the shared field/value validator.
- Prove creation defaults remain unchanged.
- Prove edit-time omissions never inherit creation defaults.

### Phase 4 — Contract synchronization

- Update `SAFETY.md`, guides/resource mirrors, tool descriptions, examples, and changelog.
- Regenerate the plugin bundle; do not hand-edit `figma_plugin/code.js`.
- Update version surfaces and tool-schema snapshots.

### Phase 5 — Repository and live closure

- Run all focused and full gates.
- Run live Figma tests on a dedicated disposable file/channel.
- Record repository/mock, injected-fault, and live-host evidence separately.

## 12. Verification requirements

### 12.1 Emitted-schema and MCP-boundary tests

- `tools/list` includes `rotation` and strict non-empty `arcData` under `node_transform`.
- Top-level empty input and empty arc patches fail.
- Nested unknown keys fail and are not stripped.
- Non-finite values fail; width/height and inner-radius limits are encoded.
- Descriptions label degrees versus radians and contain the concrete constants.
- Tool count and annotations remain unchanged.

### 12.2 Handler tests

- Position/size-only regression fixtures remain green.
- Rotation-only, arc-only, and combined calls succeed.
- Full, half, partial, and ring arcs read back exactly.
- Omitted arc fields preserve live values.
- Wrong type, unsupported property, invalid radius, non-finite angle, and empty patch fail before all setters.
- Auto-layout-controlled position checks run only when position is requested.
- Setter order is deterministic.
- Injected failures in each field group report exact before/requested/resulting state and stop later groups.
- Repeating the same absolute call is a no-op/idempotent result.
- Shared-validator tests prove creation defaults and edit merges remain distinct.

### 12.3 Safety tests

- Scope, name, lock, instance-interior, permission, and scope-root gates remain plugin-side.
- A non-ellipse or invalid merged arc prevents valid move/resize/rotation fields from mutating.
- No handler uses current selection or implicit current page.
- Registered write tools and `SAFETY.md` remain bidirectionally synchronized.

### 12.4 Live Figma matrix

Verify in a real Figma Design file:

1. absolute degree rotation on a supported node;
2. arc-only full, half, partial, and ring edits on an existing ellipse;
3. combined resize, rotation, position, and radian-arc editing;
4. preservation of omitted live arc fields;
5. wrong-type and invalid-arc atomic refusal;
6. rotation/position behavior in horizontal, vertical, and grid-managed contexts;
7. Figma's exact normalized readback;
8. the independent `node_info` verification read.

Live behavior, not mocks or typings alone, closes these claims.

## 13. Documentation, generated output, and version gates

Before release:

- Update `README.md`, `SAFETY.md`, `CHANGELOG.md`, tool-selection, workflows, constraints, and error playbook where this capability is referenced.
- Update all `figma-edit://guide/*` mirrors from their canonical sources.
- Include examples that visibly distinguish degree rotation from radian arcs.
- Document existing-node merge semantics and creation defaults.
- Regenerate `figma_plugin/code.js`; never hand-edit it.
- Assert emitted schema, tool count, permission matrix, safety rows, and generated output.
- Assign and synchronize the scheduled version in root `package.json`, root `package-lock.json` release fields, both version fields in root `server.json`, and root `manifest.json`. Verify the derived plugin About/handshake/bundle output through `check:plugin`; do not add a version to `figma_plugin/manifest.json` or hard-code a second version in `src/shared/version.ts`.
- Run `check:versions`, `check:plugin`, server/plugin type checks, generated-file checks, suppression checks, and the full unit suite using the repository's current scripts.

## 14. Acceptance gate

The release is complete only when:

- [ ] `node_transform` publishes the exact strict contract in this PRD.
- [ ] Rotation is absolute degrees; arc angles are radians everywhere.
- [ ] Existing ellipses accept non-empty arc patches and preserve omitted live fields.
- [ ] Shared validation does not change creation defaults.
- [ ] Complete preflight prevents every predictable partial mutation.
- [ ] Unexpected failures disclose exact residual state and failed field group.
- [ ] Every success returns Figma's full resulting `x`/`y`/`width`/`height`/`rotation` snapshot; an arc request also returns previous/resulting complete arc values.
- [ ] Schema, handler, safety, injected-fault, and live tests pass.
- [ ] Documentation, resource mirrors, generated output, changelog, and version surfaces are synchronized.
- [ ] No adjacent scope entered the release.

## 15. Risks and mitigations

| Risk | Mitigation |
| :- | :- |
| Models confuse degrees with radians | Repeat units in tool/field descriptions, examples, schema tests, and guides; never infer or convert |
| A partial patch resets omitted arc fields | Merge over a live complete snapshot and assign once |
| A bad arc applies earlier transform fields | Validate target type and the complete merged plan before resize |
| Shared validation imports creation defaults into editing | Keep validator and omission policy separate and test both contexts |
| Auto-layout checks over-refuse rotation-only calls | Gate position rules only on supplied position fields |
| Figma throws after some setters | Stop, read back, and disclose exact partial state without retry or rollback claims |
| Typings and live behavior differ | Revalidate the pinned API and run live smoke tests before release |

## 16. Source fidelity and unresolved evidence

This PRD preserves the umbrella contract without expanding it. The umbrella's exact code baseline and pinned-typings findings are historical evidence and must be revalidated at implementation time.

The only release-blocking dependency is availability of the documented strict `node_info` `MATCHES` recovery call. There is no product-contract contradiction inside this scope. If the scheduled baseline lacks that read contract, this release must wait or be explicitly revised; it must not publish a recovery instruction that cannot be executed.
