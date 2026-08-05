# PRD — Native Node Creation

| Field | Value |
| --- | --- |
| Status | Proposed |
| Release | Version-unassigned standalone minor release |
| Date | 2026-08-04 |
| Source | [Figma Design Editing Capability Expansion](<../Figma Design Editing Capability Expansion/prd.md>) |
| Source scopes | Checklist 6, 7, 8, and 10; decisions D7, D11, and D15; Sections 6–9 |
| Release boundary | TEXT_PATH and LINE creation, raw vector-path creation, and the unified native-region creator |

## 1. Release identity and source mapping

This PRD extracts four tightly coupled creation scopes from the capability-expansion source into one independently releasable minor. They share the same public creation surface, parent-verification gates, creator cleanup contract, and migration work. Splitting them would either duplicate those safety mechanics or leave an intermediate release with two competing region-creation APIs.

| Source item | This release |
| --- | --- |
| Checklist 6 — TEXT_PATH creation | Extend `create_text` with strict `TEXT` and `TEXT_PATH` branches. |
| Checklist 7 — LINE creation | Add the strict `LINE` branch to `create_shape`. |
| Checklist 8 — raw vector paths | Extend `create_svg` with explicit `SVG` and `VECTOR_PATHS` branches. |
| Checklist 10 — native region creation | Replace `create_frame` with `create_region` for FRAME, SECTION, and SLICE. |
| D7 | `create_frame` is hard-replaced by `create_region`; there is no public or hidden compatibility alias. |
| D11 | TEXT_PATH creation converts a clone of an existing vector-like source and preserves the source node. |
| D15 | FRAME, SECTION, and SLICE publish strict type-specific fields rather than one permissive region shape. |

This document is the release contract for these scopes. Source material outside the rows above is not silently inherited.

Release-local public-tool arithmetic is exact: add `create_region` (+1), remove
`create_frame` (-1), add no other tool names, and keep the total tool count
unchanged (net 0). TEXT_PATH, LINE, and VECTOR_PATHS are branches of existing
tools, not standalone registrations.

## 2. Problem

The server cannot currently create four native structures without lossy workarounds:

- text attached to an existing vector path;
- native line nodes;
- a single vector node from raw `VectorPath` records; and
- SECTION and SLICE regions through the same verified creation surface as FRAME.

The current creation APIs also expose overlapping shapes that make migration ambiguous: text has no discriminator, SVG creation implies an SVG string, and `create_frame` names one of three region kinds. These limitations push callers toward multi-step mutations, temporary SVG conversion, or direct plugin commands that do not share one documented safety and cleanup contract.

## 3. Goals

- Add strict discriminated creation branches for TEXT_PATH, LINE, VECTOR_PATHS, FRAME, SECTION, and SLICE.
- Preserve existing TEXT, non-LINE shape, and SVG creation behavior through explicitly documented migration rules.
- Make every parent-targeted creation verify the parent identifier and name before the first mutation.
- Validate complete branch inputs, cross-field rules, and dependencies before creating a node.
- Preserve the TEXT_PATH source node and remove disposable clones or newly created nodes after downstream failure when cleanup succeeds.
- Report authoritative created-node readback on success and explicit survivor evidence when cleanup fails.
- Remove `create_frame` from the published tool surface and replace it with `create_region` in this minor release.
- Ship schemas, server routing, plugin handlers, focused tests, live-host evidence, generated artifacts, and documentation together.

## 4. Non-goals

- Editing text ranges or existing path-text properties; those belong to PRD-014.
- Arbitrary vector-network authoring, vertex editing, boolean operations, or SVG round-tripping.
- LINE arrowheads, dash patterns, caps, joins, or endpoint editing beyond the initial length and rotation contract.
- Converting an existing text node to TEXT_PATH in place.
- Moving the TEXT_PATH source node, deleting it, or accepting a source from a different parent.
- Auto-selecting a font, falling back from an unavailable font, or silently substituting a style.
- Creating COMPONENT_SET, COMPONENT, INSTANCE, GROUP, BOOLEAN_OPERATION, or TABLE nodes.
- A permanent compatibility alias for `create_frame`.
- Idempotent creation or automatic deduplication after an ambiguous transport outcome.
- Selection-driven or current-page-driven targeting.

## 5. Dependencies and shared contracts

This release is version-unassigned until its dependencies are implemented and proven.

| Dependency | Reuse contract |
| --- | --- |
| [PRD-006 — Typography and Font Discovery](./PRD-006-Typography-and-Font-Discovery.md) | **Required.** Consume the published `page_info.fontDiscovery` catalog and exact unavailable-font recovery operands used by creation; do not invent a creation-only catalog or candidate matcher. |
| [PRD-009 — Transform and Ellipse Geometry](./PRD-009-Transform-and-Ellipse-Geometry.md) | **Required.** Reuse the exact public `ArcData` schema and validation for the existing ELLIPSE branch of `create_shape`. Creation supplies explicit defaults for omitted ellipse arc values; it does not reuse existing-node live-merge semantics. |
| [PRD-012 — Layout System](./PRD-012-Layout-System.md) | **Conditional reuse only.** If already shipped, reuse compatible enum/numeric/cross-field helpers for FRAME fields. Otherwise this release retains and extends the scheduled baseline's existing `create_frame` validators; PRD-012-only edit groups remain outside creation. |
| [PRD-014 — Range-Safe Text Editing](./PRD-014-Range-Safe-Text-Editing.md) | **Conditional parity only.** If already shipped, reuse compatible TEXT/TEXT_PATH setter helpers. Otherwise creation owns its source-specified font setters using PRD-006 discovery/loading and does not wait for ranged editing. |
| Existing v2.3.3 creation safety | Preserve explicit parent identity verification, lock and instance-interior rejection, parent-first append, and creator cleanup behavior. |

This PRD must not create private substitutes for these shared types.

## 6. Compatibility and cutover policy

### 6.1 `create_text`

`create_text` becomes a strict discriminated union in this release. `type` is
required, and omission fails at the MCP boundary; ordinary callers migrate by
adding `type: "TEXT"`. There is no compatibility normalization, hidden plugin
default, or follow-up release needed to remove one.

### 6.2 `create_shape`

`LINE` is additive. Existing RECTANGLE, ELLIPSE, POLYGON, and STAR branches retain their established fields and outputs, subject to the same strict-union rejection of fields from another branch.

### 6.3 `create_svg`

`create_svg` becomes a strict `sourceType` union. `sourceType` is required at release. Existing callers must add `sourceType: "SVG"`; there is no omitted-discriminator compatibility branch.

### 6.4 `create_frame` to `create_region`

This is a hard public cutover:

- `create_region` is the only published region creator.
- `create_frame` is absent from `tools/list`, generated schemas, server routing, plugin routing, examples, and documentation.
- No hidden dispatcher alias or indefinitely deprecated implementation remains.
- Existing FRAME callers migrate to `create_region` with `regionType: "FRAME"` and otherwise retain the source-authorized FRAME fields.

## 7. Public input contracts

Every object below is strict: unknown keys and keys belonging only to another branch are rejected before mutation. All numbers must be finite. Every name used for identity verification must match the discovered Figma name exactly.

### 7.1 Shared parent identity

All four tools use:

```ts
type ParentIdentity = {
  parentId: string;       // non-empty exact Figma node ID
  parentNodeName: string; // explicit; empty is valid only when it exactly matches
};
```

The server does not infer a parent from selection or the current page. The plugin verifies that the parent exists, is appendable for the requested kind, is inside the authorized scope, and exactly matches `parentNodeName` before creation.

Creation colors retain the existing recursively strict RGBA input:

```ts
type RGBAInput = {
  r: number;              // finite, 0..1
  g: number;              // finite, 0..1
  b: number;              // finite, 0..1
  a?: number;             // finite, 0..1; omitted means 1
};
```

Every optional creation `name`, when supplied, is non-empty. This release does not change the existing default names for ordinary TEXT, existing shape branches, SVG imports, or FRAME creation.

### 7.2 `create_text`

```ts
type FontNameInput = {
  family: string;         // non-empty
  style: string;          // non-empty
};

type TextAppearanceInput = {
  name?: string;
  fontName?: FontNameInput;
  fontWeight?: number;    // integer multiple of 100, 100..900
  fontSize?: number;      // finite, >= 1
  fontColor?: RGBAInput;
};

type CreatePlainTextInput = ParentIdentity & TextAppearanceInput & {
  type: "TEXT";
  x: number;
  y: number;
  text: string;
};

type CreatePathTextInput = ParentIdentity & TextAppearanceInput & {
  type: "TEXT_PATH";
  pathNodeId: string;
  pathNodeName: string;
  startSegment: number;   // integer, >= 0
  startPosition: number;  // 0..1 inclusive
  text: string;
};

type CreateTextInput = CreatePlainTextInput | CreatePathTextInput;
```

`fontName` and `fontWeight` are mutually exclusive. An omitted `fontName` uses the established Inter convenience mapping: an omitted `fontWeight` resolves to Inter Regular; a supplied `fontWeight` resolves to the exact supported Inter style for that weight. The handler must load that exact font before creating or changing characters. Unsupported or unavailable mappings fail; there is no font fallback. Ordinary TEXT retains the current defaults of size 14, black color, and the name `Text` when those fields are omitted. TEXT_PATH uses the same size/color defaults; when `name` is omitted it returns Figma's actual created name rather than inventing one in the response.

For TEXT_PATH:

- `pathNodeId` must resolve to the discovered node named exactly `pathNodeName`.
- The source type must be exactly `VECTOR`, `RECTANGLE`, `ELLIPSE`, `POLYGON`, `STAR`, or `LINE`.
- The source and requested target parent must have the same direct parent.
- The source, parent, and relevant ancestor path must pass scope, lock, and instance-interior checks.
- `startSegment` must address a segment that exists on the converted path.
- `x`, `y`, `width`, and `height` are not accepted in the TEXT_PATH branch.

### 7.3 `create_shape` — LINE branch

```ts
type CreateLineInput = ParentIdentity & {
  type: "LINE";
  x: number;
  y: number;
  length: number;         // > 0
  rotation?: number;      // degrees; defaults to 0
  name?: string;
  strokeColor?: RGBAInput;
  strokeWeight?: number;  // > 0
};
```

The handler calls `figma.createLine()`, resizes it to `(length, 0)`, sets its position and finite degree rotation, and applies only the accepted initial stroke fields. `fillColor`, `arcData`, `pointCount`, `innerRadius`, `width`, and `height` are invalid in the LINE branch.

The complete public `create_shape` schema remains a strict union of the existing RECTANGLE, ELLIPSE, POLYGON, and STAR branches plus LINE. The ELLIPSE branch imports PRD-009 `ArcData`; this PRD does not redefine it.

### 7.4 `create_svg`

```ts
type VectorPathInput = {
  windingRule: "NONZERO" | "EVENODD";
  data: string;           // non-empty path data
};

type CreateSvgSourceInput = ParentIdentity & {
  sourceType: "SVG";
  svg: string;            // non-empty SVG markup
  x?: number;
  y?: number;
  name?: string;
};

type CreateVectorPathsInput = ParentIdentity & {
  sourceType: "VECTOR_PATHS";
  vectorPaths: [VectorPathInput, ...VectorPathInput[]];
  x?: number;
  y?: number;
  name?: string;
};

type CreateSvgInput = CreateSvgSourceInput | CreateVectorPathsInput;
```

The SVG branch continues to call Figma’s SVG parser and may produce a hierarchy. The VECTOR_PATHS branch calls `figma.createVector()` exactly once and assigns the ordered `vectorPaths` array directly. It returns one VECTOR node and must not serialize paths into SVG.

Malformed path data is reported with the failing zero-based path index when Figma or deterministic pre-validation can identify it. The branch rejects an empty array, an empty `data` value, SVG-only fields, and unknown winding rules before creation where possible.

### 7.5 `create_region`

```ts
type RegionBaseInput = ParentIdentity & {
  name?: string;
  x: number;
  y: number;
  width: number;          // > 0
  height: number;         // > 0
};

type CreateFrameInput = RegionBaseInput & {
  regionType: "FRAME";
  fillColor?: RGBAInput;
  strokeColor?: RGBAInput;
  strokeWeight?: number;  // > 0
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  layoutWrap?: "NO_WRAP" | "WRAP";
  paddingTop?: number;    // finite; preserve existing semantics
  paddingRight?: number;  // finite; preserve existing semantics
  paddingBottom?: number; // finite; preserve existing semantics
  paddingLeft?: number;   // finite; preserve existing semantics
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "BASELINE";
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
  itemSpacing?: number;   // finite
};

type CreateSectionInput = RegionBaseInput & {
  regionType: "SECTION";
  fillColor?: RGBAInput;
  sectionContentsHidden?: boolean;
};

type CreateSliceInput = RegionBaseInput & {
  regionType: "SLICE";
};

type CreateRegionInput =
  | CreateFrameInput
  | CreateSectionInput
  | CreateSliceInput;
```

FRAME retains the source `create_frame` fill, stroke, layout mode/wrap, padding, alignment, sizing, and spacing surface. It owns those scheduled-baseline creation validators. When PRD-012 is already present, compatible helpers are reused rather than copied; PRD-012 is not required to ship creation. Layout groups introduced only by PRD-012—such as grid-track authoring, child placement, constraints, and layout-grid operations—remain post-creation `node_set_layout` edits unless the authoritative creation source is revised.

SECTION creates a native section and may set `fillColor` and `sectionContentsHidden`; it rejects stroke and every auto-layout field. SLICE creates a native slice and rejects fill, stroke, children/layout, and `sectionContentsHidden`. All branches resize to the exact requested positive dimensions after append and before success readback.

## 8. Handler semantics

### 8.1 Common parent-first sequence

Each branch follows this order:

1. Parse the strict branch and validate every deterministic field and cross-field rule.
2. Resolve and verify the exact parent ID/name, scope, appendability, locks, and instance-interior boundary.
3. Resolve and verify all additional dependencies, including TEXT_PATH source identity, font availability, ArcData, and applicable layout rules.
4. Complete required reads and font loads before the first native creation call.
5. Create the native node, append it synchronously to the verified parent, and record its ID, name, type, and parent evidence.
6. Apply branch-specific fields.
7. Read the created node authoritatively and return the normalized result.

Creation must not occur before a later-known validation failure. A created node must be appended to the verified parent before fallible property writes or later awaits so cleanup and survivor evidence remain scoped and discoverable.

### 8.2 TEXT creation

TEXT calls `figma.createText()`, appends it to the verified parent, applies position and optional name, sets the loaded exact font, then writes characters, size, and color under the shared text contract.

### 8.3 TEXT_PATH creation

TEXT_PATH must preserve the discovered source:

1. Resolve and fully validate the source and exact shared parent.
2. Load the exact font.
3. Clone the source node.
4. Append the clone to the same verified parent and record clone identity.
5. Convert the clone to path text using the supported Figma API.
6. Set `startSegment`, `startPosition`, font, characters, optional size/color, and optional name on the converted node.
7. Read back the created TEXT_PATH node.

The original source is never mutated, reparented, or removed. Any temporary clone superseded by a distinct converted node must also be removed before success. A conversion API that mutates the clone in place treats that converted clone as the created output.

### 8.4 LINE creation

LINE calls `figma.createLine()`, appends it to the verified parent, resizes it to `(length, 0)`, then applies x, y, rotation, optional name, stroke, and stroke weight. The success readback must prove native type `LINE`, effective length, rotation, stroke, position, name, and parent.

### 8.5 SVG and VECTOR_PATHS creation

The SVG branch preserves the existing SVG-parser semantics. The VECTOR_PATHS branch creates one VECTOR and assigns the validated ordered array directly. Both append to the verified parent before later fallible writes. If SVG parsing returns a hierarchy, the returned root is the cleanup and readback target.

### 8.6 Region creation

`create_region` dispatches to exactly one of `figma.createFrame()`, `figma.createSection()`, or `figma.createSlice()`. It appends first, resizes to the requested dimensions, applies position/name, then applies only the branch’s accepted fields. It must not implement SECTION or SLICE as styled FRAME substitutes.

## 9. Safety, errors, and partial-state contract

### 9.1 Pre-mutation refusals

The request fails without creation when any of these checks fail:

- strict schema, discriminator, finite-number, range, or cross-field validation;
- missing, stale, out-of-scope, non-appendable, locked, or instance-interior parent;
- parent name mismatch;
- missing, stale, out-of-scope, locked, instance-interior, unsupported, or name-mismatched TEXT_PATH source;
- TEXT_PATH source-parent mismatch or invalid segment/position;
- mutually exclusive or unavailable font request;
- unsupported LINE-only, SVG-only, vector-only, or region-only field combination;
- malformed ArcData, layout input, SVG, or deterministically invalid vector path.

Structured errors must retain existing stable codes where one already covers the condition. New conditions receive stable codes rather than prose-only classification. At minimum the tests and documentation distinguish invalid discriminator, invalid field combination, parent missing/name mismatch/not appendable/locked/instance interior, source missing/name mismatch/type mismatch/parent mismatch/locked/instance interior, font unavailable, invalid path index, invalid region dimensions, invalid layout field, and cleanup failure.

### 9.2 Cleanup after creation

Every branch owns cleanup for nodes it creates. TEXT_PATH additionally owns its disposable clone.

- If a downstream step fails and all created artifacts are removed, rethrow the primary structured failure with `partialMutation: false`.
- If cleanup itself fails, return a structured partial-mutation error. It must include the primary failure, cleanup failure, and every known survivor’s ID, name, native type, current parent ID/name when readable, and the originally verified parent evidence.
- Never claim rollback when removal was not confirmed.
- Cleanup must never remove the caller’s original TEXT_PATH source.

### 9.3 Readback and unknown outcomes

Success is based on authoritative post-write Figma readback, not the request echo. Each result includes created node ID, native type, effective name, current parent identity, and all branch-specific effective values promised by this PRD.

Creation is non-idempotent. In the published MCP annotations, creation tools set `openWorldHint: true` and omit `idempotentHint`; they do not publish a false value as a substitute for omission. A transport timeout after dispatch can leave an unknown outcome. The server must not automatically replay the request. The error contract must tell callers to rediscover by verified parent and expected node evidence before choosing any manual retry.

## 10. Outputs

Creation results remain flat and branch-specific. This release does not add a
shared `{ success, created, readback, partialMutation }` envelope: that shape is
not in the authoritative source and would break the existing TEXT, non-LINE
shape, and SVG result contracts. Existing branches preserve their scheduled
flat outputs byte-for-byte unless the authoritative branch contract itself
requires an additive field. Partial-mutation and survivor evidence appears only
in structured errors after a failed creation/cleanup path, never as a constant
success field.

Each flat branch result is exact enough to establish:

- TEXT: position, characters, font, size, color, and name;
- TEXT_PATH: source preservation evidence, start segment/position, characters, font, size, color, and name;
- LINE: endpoints implied by length/rotation, position, stroke, stroke weight, and name;
- SVG: returned root identity, position, and name;
- VECTOR_PATHS: ordered vector paths, position, and name;
- FRAME: bounds, paint/stroke fields, and effective source-authorized layout fields;
- SECTION: bounds and `sectionContentsHidden`;
- SLICE: bounds.

The newly added branches include these source-defined fields directly rather than hiding them behind another envelope:

```ts
type CreateTextPathReadback = {
  id: string;
  name: string;
  type: "TEXT_PATH";
  sourcePathId: string;
  sourcePreserved: true;
  parentId: string;
  startSegment: number;
  startPosition: number;
};

type CreateLineReadback = {
  id: string;
  name: string;
  type: "LINE";
  parentId: string;
  length: number;
  rotation: number;
  strokeColor?: RGBAInput;
  strokeWeight?: number;
};

type CreateVectorPathsReadback = {
  id: string;
  name: string;
  type: "VECTOR";
  parentId: string;
  x: number;
  y: number;
  vectorPaths: VectorPathInput[];
};

type CreateRegionReadback = {
  id: string;
  name: string;
  type: "FRAME" | "SECTION" | "SLICE";
  parentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sectionContentsHidden?: boolean;
};
```

The existing SVG flat output continues to report the actual returned native
type because SVG parsing may yield a container. VECTOR_PATHS uses the flat
`CreateVectorPathsReadback` above and therefore reports native type `VECTOR`.

Normalized result schemas must avoid undocumented raw Figma objects and must remain machine-readable through MCP structured content.

## 11. Implementation ownership

The implementation must update at least these current surfaces; exact extraction into new modules is allowed when it preserves ownership clarity.

| Surface | Required work |
| --- | --- |
| `src/mcp_server/tools/create.ts` | Define strict public unions, annotations, descriptions, routing, output schemas, and the `create_frame` removal. |
| `figma_plugin/handlers/nodeCreators.ts` | Implement TEXT/TEXT_PATH, LINE, and native region handler paths with preflight and cleanup. |
| `figma_plugin/handlers/vectorHandlers.ts` | Implement the explicit SVG/VECTOR_PATHS union and direct vector assignment. |
| `figma_plugin/src/main.ts` | Register only the released command names and remove the `create_frame` route. |
| `figma_plugin/utils/nodeUtils.ts` | Preserve or extend creator cleanup and survivor-evidence helpers without weakening existing callers. |
| Shared validation modules | Import required PRD-006 discovery/recovery and PRD-009 ArcData contracts; conditionally reuse compatible PRD-012/014 helpers only when already shipped. |
| Generated artifacts and docs | Regenerate MCP schema snapshots and update README, guides, examples, SAFETY, and changelog/release notes. |

Implementation phases:

1. **Dependency lock:** land and pin PRD-006 and PRD-009; inventory the scheduled baseline and conditionally reuse PRD-012/014 helpers only if present.
2. **Schema and migration:** add all required discriminators, strict branches, and stable errors; remove `create_frame` and the omitted-`create_text.type` shape everywhere.
3. **TEXT_PATH:** implement exact-source preflight, font load, clone/convert, source preservation, cleanup, and readback.
4. **LINE and VECTOR_PATHS:** implement native creation and direct vector-path assignment with branch-specific readback.
5. **Regions:** implement native FRAME/SECTION/SLICE creation and shared source-authorized layout validation.
6. **Proof and release sync:** finish focused/unit/integration/live tests, regenerate artifacts, update docs, align versions, and record every hard-cut migration.

## 12. Verification plan

### 12.1 Schema and routing tests

- Official MCP `tools/list` exposes the updated strict schemas and output schemas.
- `create_frame` is absent from the official list, server router, plugin router, generated artifacts, docs, and examples.
- `create_region` is present and the release-local add-one/remove-one delta
  leaves the official total tool count unchanged.
- `create_text` accepts both explicit branches; omitting `type` fails `-32602`
  at the official MCP boundary and cannot reach a plugin default.
- `create_shape` accepts LINE and preserves every existing strict branch.
- `create_svg` requires `sourceType` and rejects cross-branch keys.
- `create_region` requires `regionType` and accepts only FRAME, SECTION, or SLICE with their exact fields.
- Unknown keys, NaN/infinity, empty required strings, invalid ranges, and discriminator mismatches fail before plugin dispatch.

### 12.2 Handler and safety tests

For every branch, prove:

- exact parent ID/name success and mismatch refusal;
- missing parent, out-of-scope parent, locked path, instance interior, and incompatible parent refusal before creation;
- append-before-fallible-write ordering;
- exact authoritative success readback;
- injected failure after creation removes the created node;
- injected cleanup failure reports survivor evidence and `partialMutation: true`;
- no selection or current-page targeting occurs.

TEXT_PATH tests additionally prove source preservation, direct-parent equality, supported source types, invalid segment refusal, exact font load, clone cleanup, converted-node cleanup, and that the original source is never removed.

LINE tests prove `(length, 0)` resize, finite rotation, optional stroke application, and rejection of shape-only fields.

VECTOR_PATHS tests prove array order, winding-rule preservation, one native VECTOR result, no SVG serialization, and failing path-index diagnostics.

Region tests prove native Figma types, exact dimensions and position, FRAME layout validation reuse, SECTION fill and hidden-content behavior, SLICE field rejection, and the complete `create_frame` cutover.

### 12.3 Red proofs

Before accepting each protected contract, deliberately break the production boundary and record named red counts, then restore and rerun green. Required red proofs include:

- bypass parent-name verification;
- create before completing branch validation;
- mutate or remove the original TEXT_PATH source;
- accept a LINE-only forbidden field;
- serialize VECTOR_PATHS through SVG;
- route `create_frame` after removal;
- suppress cleanup-failure survivor evidence.

Mock red proofs establish repository enforcement only; they are not live-Figma evidence.

### 12.4 Live Figma matrix

Use a dedicated disposable file/channel. Discover with `page_info`, then `node_info`, and pass names back verbatim.

| Probe | Required evidence |
| --- | --- |
| TEXT hard cut | Explicit TEXT creates a readable native TEXT node with exact font/text values; the formerly valid omitted-type shape fails before dispatch and creates nothing. |
| TEXT_PATH | Vector-like source remains unchanged; created path text has the requested segment, position, text, font, and same direct parent. |
| LINE | Native LINE readback proves length, rotation, stroke, position, and parent. |
| VECTOR_PATHS | One native VECTOR contains the ordered raw paths and expected winding rules. |
| FRAME | Native FRAME proves dimensions and at least one non-default source-authorized layout configuration. |
| SECTION | Native SECTION proves dimensions, fill, and both values of `sectionContentsHidden`. |
| SLICE | Native SLICE proves dimensions and rejects a frame-only field. |
| Refusals | Name mismatch, source-parent mismatch, invalid path data, and invalid branch fields cause no new node. |
| Cleanup | A controlled post-create failure either leaves no artifact or returns exact survivor evidence; clean up disposable artifacts afterward. |

Live evidence must record file/channel identity, discovered IDs and names, request/response summaries, readback, before/after artifact counts, cleanup, and any skipped repository gate. A mock does not establish Figma host behavior.

### 12.5 Repository and release gates

Run and record, from a clean understanding of the current channel constraints:

```sh
bun run build:all
bun run check:plugin
bun run check:generated
bun run check:versions
bun run check:types:plugin
bun run check:types:scripts
bun run check:suppressions
bun test src/mcp_server/tests
```

Also run the focused plugin and server suites introduced by this release. If a live channel would be destroyed by a build or plugin check, finish and reconcile the live evidence first, then run the gate in a fresh session; do not imply an intentionally skipped gate passed.

## 13. Documentation and generated artifacts

The release is incomplete until all of the following agree with the implementation:

- README creation-tool tables and examples;
- `skills/figma-edit/references/` constraints, error playbook, workflows, and tool selection;
- MCP guide resources generated from or equivalent to those references;
- `SAFETY.md` gate matrix, cleanup guarantees, unknown-outcome residual risk, and non-idempotence;
- generated tool/schema snapshots;
- changelog and standalone minor-release notes;
- root `package.json`, root `package-lock.json` release fields, both root
  `server.json` version fields, and root `manifest.json`, plus the derived
  plugin About/handshake/bundle output checked by `check:plugin`; do not add a
  version to `figma_plugin/manifest.json` or hard-code one in
  `src/shared/version.ts`;
- migration examples for explicit TEXT, explicit SVG, and `create_frame` to `create_region`;
- explicit notice that omitted `create_text.type` is retired immediately and
  migrates to `type: "TEXT"`.

## 14. Acceptance criteria

- [ ] The four source checklist scopes and D7/D11/D15 are fully represented, with no unrelated capability folded into the release.
- [ ] All four public inputs are strict discriminated unions and reject cross-branch fields before mutation.
- [ ] `create_text` requires an explicit discriminator, rejects the omitted-type shape through the official MCP boundary, and implements the exact font rules.
- [ ] TEXT_PATH preserves its exact source, enforces same-parent identity, and reports authoritative path-text readback.
- [ ] LINE is a native LINE with exact length/rotation/stroke readback.
- [ ] VECTOR_PATHS creates one native VECTOR by direct `vectorPaths` assignment and reports indexed malformed-path errors.
- [ ] `create_region` creates native FRAME, SECTION, and SLICE nodes.
- [ ] `create_frame` is absent from every public, generated, routed, documented, and tested surface.
- [ ] The official tool inventory records `create_region` +1,
  `create_frame` -1, no other new names, net 0, and an unchanged total count.
- [ ] Required PRD-006 font discovery and PRD-009 ArcData are imported rather
  than forked; compatible PRD-012/014 helpers are reused only when already
  shipped and never become hidden release dependencies.
- [ ] Every branch validates dependencies before creation and appends before later fallible writes.
- [ ] Injected post-create failures prove cleanup; injected cleanup failures prove exact survivor evidence.
- [ ] Success results contain authoritative branch-specific readback and parent identity.
- [ ] Creation tools omit `idempotentHint`, retain `openWorldHint: true`, and unknown transport outcomes are not automatically replayed.
- [ ] Focused, integration, red-proof, generated, type, version, and live-Figma gates are green and recorded separately.
- [ ] Documentation, safety contract, generated artifacts, examples, and release notes match the shipped schemas.

## 15. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| TEXT_PATH conversion mutates or deletes the caller’s source. | Convert only a verified clone; assert source identity and readback before success; fault-inject cleanup paths. |
| A missing font is silently substituted. | Reuse PRD-006 exact discovery/recovery and the creation handler's exact font load; reject unavailable mappings before creation. |
| Strict-union migration breaks existing callers unexpectedly. | Publish exact TEXT, SVG, and region before/after examples and assert retired shapes fail consistently; do not carry a second transitional contract. |
| Raw paths create malformed or lossy SVG-derived output. | Assign ordered `vectorPaths` directly to one VECTOR and test no SVG serialization. |
| Region unification changes native semantics. | Dispatch to native FRAME/SECTION/SLICE constructors and prove native types in live readback. |
| Creation succeeds but a later write fails. | Parent-first append, owned-artifact cleanup, and precise survivor evidence when cleanup cannot complete. |
| A timeout encourages duplicate creation. | Keep non-idempotent annotations, prohibit automatic replay, and document discovery-based reconciliation. |
| Shared ArcData/layout/text contracts drift. | Import one canonical schema/validator per dependency and add equivalence tests at tool and handler boundaries. |

## 16. Dependencies, exclusions, and release readiness

This standalone minor may ship after PRD-006 and PRD-009 provide the exact shared contracts named above. PRD-012 and PRD-014 are optional helper-parity inputs, not release gates. It does not require unrelated capability-expansion tracks.

Release readiness requires all acceptance criteria, a documented hard-cutover migration, repository gates, and successful live-host evidence. If the required Figma API for clone-based TEXT_PATH conversion is unavailable or differs from the assumed native behavior, that is a release blocker: revise the source contract and this PRD rather than shipping an SVG or destructive-source workaround.

## 17. Provenance notes and resolved source choices

- The authoritative source describes the combined expansion as a major API-shape change. This extracted document follows the requested packaging constraint and defines one standalone minor with explicit hard cutovers.
- The source permits, but does not require, temporary compatibility for omitted
  `create_text.type`. This PRD explicitly elects an immediate strict
  discriminator cutover, avoiding a second transitional contract and a later
  cleanup release.
- The source gives FRAME creation its existing layout surface while PRD-012 owns broader layout editing. This PRD owns the source-authorized creation fields and conditionally reuses PRD-012 helpers without importing its broader groups or release dependency.
- Required dependency links are PRD-006 and PRD-009. PRD-012 and PRD-014 are named only as conditional reuse seams when their compatible helpers already exist.
