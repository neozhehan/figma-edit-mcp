# PRD — Paint, Stroke, and Image Metadata

| Field | Value |
| :- | :- |
| Status | Proposed; implementation not started |
| Release class | Version-unassigned standalone minor release |
| PRD date | 2026-08-04 |
| Source scope | Expansion checklist items 21 and 24; decisions D19 and D21; Section 18 |
| Authoritative source | [Figma Design Editing Capability Expansion](<../initiative/03 - Figma Design Editing Capability Expansion/initiative.md#18-paint-stacks-stroke-geometry-and-image-dimensions-p0>) |

## Executive summary

This release completes the existing paint decisions without adding another public
tool. It hard-cuts `node_set_fill` and `node_set_stroke` over to ordered,
strict, complete paint arrays; adds the common writable stroke-geometry surface;
and exposes Figma-stored intrinsic image dimensions both after paint writes and
through an explicit `node_info` computed read.

Release-local public-tool arithmetic is net 0: no tool name is added, removed,
or renamed; both paint setters and `node_info` change contract in place.

The release owns three inseparable contracts:

1. one canonical `PaintInput` union is used by writes and write-ready reads;
2. paint setters replace complete arrays and return authoritative complete
   arrays rather than patching unstable indexes; and
3. image dimensions are metadata from `Image.getSizeAsync()`, never guessed
   from a node frame and never an implicit resize request.

## Release identity, dependencies, and compatibility

The exact version is assigned only when this release is scheduled. Every
enforced version surface moves from the then-current predecessor to that
standalone minor version: root `package.json` and `package-lock.json`, both
`server.json` fields, root `manifest.json`, the plugin About handshake/bundle,
generated tool metadata, and every surface checked by `check:versions` and
`check:plugin`.

Required predecessors:

- [PRD-008 — Styled-Text Read Fidelity](PRD-008-Styled-Text-Read-Fidelity.md)
  supplies the canonical shared hash-bearing `PaintInput` read
  contract and `normalizePaintForRead` serializer used by
  `node_info.styledTextSegments` and ordinary paint reads. PRD-015 extends that
  same shared family for complete node fill/stroke writes; it must not fork a
  second serializer or change the already-published read union silently.
- [PRD-014 — Range-Safe Text Editing](PRD-014-Range-Safe-Text-Editing.md)
  must land first. It consumes PRD-008's read contract and introduces the
  source-approved IMAGE URL/BASE64/HASH write-source extension for ranged text
  fills. This release reuses that extension rather than defining a competing
  branch. `TEXT_HAS_MIXED_FILLS` recovery also depends on its ranged text
  read/edit workflow being available in the shipped predecessor.
- The scheduled checkout must retain the v2.3.3 node-write, exact-name,
  permission, scope, lock, instance-interior, structured-error, creator/image,
  generated-artifact, and plugin-bundle gates.

Compatibility posture:

- `node_set_fill` removes the legacy `r`/`g`/`b`/`a`, `image`, and `clear`
  branches. A single solid/image paint is a one-element `fills` array and clear
  is `fills: []`. There is no hidden dispatcher fallback.
- `node_set_stroke` keeps its name but replaces its convenience paint shape
  with `strokes?: PaintInput[]` plus strict geometry fields. Legacy
  `r`/`g`/`b`/`a`, `weight`, `strokeTopWeight`, `strokeRightWeight`,
  `strokeBottomWeight`, and `strokeLeftWeight` inputs are removed in favor of
  `strokes`, `strokeWeight`, and `individualStrokeWeights`; there is no hidden
  schema or dispatcher fallback.
- Reads normalize paints to the same write-ready union. URL/base64 upload bytes
  and other read-only metadata are never placed back into `PaintInput`.
- This is a public input-shape hard cutover. The CHANGELOG and guides require
  before/after examples and must state the complete-array overwrite semantics.
- Both setters preserve the absolute-write annotations
  `{ idempotentHint: true, openWorldHint: true }`; neither is newly destructive.
  These hints are asserted from emitted `tools/list`, not inferred from handler
  behavior.

## Source mapping

| Authoritative source | Standalone disposition |
| :- | :- |
| Checklist item 21; Section 18.1 | Complete fill/stroke arrays and stroke geometry |
| Checklist item 24; Section 18.2 | Write-result and existing-image dimensions |
| D19 | Ordered complete replacement; no index patching |
| D21 | Dimensions are explicit metadata, never implicit resize |
| Phase 2 image-read work | `node_info.resolveImageDimensions` phase |
| Phase 3 paint work | Fill/stroke implementation phases |
| Gate-matrix paint rows | Plugin-side safety and source preflight |
| Schema rules 1–7, 12, 13, and 15 | Strict unions, numeric bounds, branch exclusions, read dependency |
| Paint/image schema, handler, safety, and live matrices | Verification sections below |
| Paint/image success measures, risks, and provenance | Acceptance, risks, and evidence boundary |

## Problem

The current surface can replace fills with one solid/image or clear them, while
stroke authoring is limited to one solid and a small weight surface. It cannot
represent ordered multi-paint gradients, patterns, reusable hashes, video
references, variable-bound colors, or the common stroke geometry declared by
the pinned Plugin API. Neither write returns intrinsic image-resource size.

Three failure modes follow:

- a caller cannot round-trip a complete existing stack without loss;
- a convenience setter can hide linked-style override effects or accidentally
  erase intentional mixed text fills; and
- image-resource dimensions are easily confused with the rendered node's
  width/height.

## Goals

1. Publish one strict, recursively validated `PaintInput` union for fills,
   strokes, node reads, styled-text paint reads, and write results.
2. Replace complete ordered arrays in one decided operation; preserve order and
   return the complete authoritative result.
3. Resolve every image, variable alias, and pattern source before target
   mutation wherever the Plugin API permits deterministic preflight.
4. Reject whole-node mixed TEXT and TEXT_PATH fill destruction with a shipped
   ranged-text recovery path.
5. Add uniform/per-side weights, align, cap, join, miter, and dash geometry
   without clearing omitted fields.
6. Return intrinsic stored image dimensions for every resolved IMAGE paint and
   expose the same metadata through opt-in `node_info` reads.
7. Preserve the existing safety boundary and disclose any residual native/API
   partial state truthfully.

## Explicit non-goals

- No standalone fill-stack, stroke-stack, image-import, or image-dimension tool.
- No paint-array index patching, merge-by-position, or automatic stale-state
  merge.
- No variable-width profiles, dynamic/brush strokes, custom brush loading,
  video import, or video-hash discovery.
- No raw image bytes in read results and no reconstruction of URL/base64 input
  from an existing hash.
- No implicit node resize, crop, transform, or aspect-ratio correction.
- No general transaction or rollback guarantee. Predictable failures are
  preflighted; unexpected native failures use exact read-back disclosure.
- No relaxation of mixed-text safety merely because a concrete range paint
  serializer exists.
- No claim that repository mocks prove Figma image or pattern behavior.

## Exact shared paint contract

All top-level and nested objects are strict. Common `visible`, `opacity`, and
`blendMode` fields are available on every paint branch. `opacity` is finite and
in `0..1`; `BlendMode` comes from the scheduled pinned typings/generator and may
not be an arbitrary string.

```ts
type ImageSource =
  | { kind: "URL"; url: string }
  | { kind: "BASE64"; bytesBase64: string }
  | { kind: "HASH"; imageHash: string };

type PaintInput =
  | {
      type: "SOLID";
      color: RGB;
      boundVariables?: { color: VariableAlias };
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    }
  | {
      type:
        | "GRADIENT_LINEAR"
        | "GRADIENT_RADIAL"
        | "GRADIENT_ANGULAR"
        | "GRADIENT_DIAMOND";
      gradientTransform: Transform;
      gradientStops: Array<{
        position: number;
        color: RGBA;
        boundVariables?: { color: VariableAlias };
      }>;
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    }
  | {
      type: "IMAGE";
      source: ImageSource;
      scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
      imageTransform?: Transform;
      scalingFactor?: number;
      rotation?: 0 | 90 | 180 | 270;
      filters?: {
        exposure?: number;
        contrast?: number;
        saturation?: number;
        temperature?: number;
        tint?: number;
        highlights?: number;
        shadows?: number;
      };
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    }
  | {
      type: "VIDEO";
      videoHash: string;
      scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
      videoTransform?: Transform;
      scalingFactor?: number;
      rotation?: 0 | 90 | 180 | 270;
      filters?: ImageFilters;
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    }
  | {
      type: "PATTERN";
      sourceNodeId: string;
      sourceNodeName: string;
      tileType:
        | "RECTANGULAR"
        | "HORIZONTAL_HEXAGONAL"
        | "VERTICAL_HEXAGONAL";
      scalingFactor: number;
      spacing: { x: number; y: number };
      horizontalAlignment: "START" | "CENTER" | "END";
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    };
```

Normative validation and normalization:

- RGB/RGBA channels, gradient positions, opacity, and image-filter members are
  finite and inside their pinned Figma ranges. A gradient has at least two
  stops in non-decreasing position order.
- `Transform` is exactly two rows of three finite numbers.
- `imageTransform`/`videoTransform` are legal only with `CROP`.
  `scalingFactor` is legal only with `TILE` and is positive. Rotation is
  accepted only on branches/modes the pin supports.
- URL and BASE64 create a new image. HASH must be a non-empty existing hash
  resolved with `figma.getImageByHash()`. Every source failure precedes target
  paint assignment.
- VIDEO accepts a non-empty existing `videoHash`; Figma is the final validator
  because the pin exposes no `getVideoByHash()` equivalent.
- Pattern scale is positive; spacing members are finite. Resolve and exact-name
  verify the source node inside the connected scope, do not mutate it, and use
  `setFillsAsync`/`setStrokesAsync` so Figma loads it correctly.
- `boundVariables.color` is strict on SOLID and gradient stops. Resolve every
  alias before target mutation and require a COLOR variable. Ordinary simple
  bindings should still prefer `node_bind_variable`.
- Write-ready read normalization emits IMAGE as
  `{source:{kind:"HASH",imageHash}}` and emits PATTERN with exact
  `sourceNodeId` plus resolved `sourceNodeName`. It is identical across write
  results, `node_info` fills/strokes, and styled-text fills.

## `node_set_fill` contract

```ts
type NodeSetFillInput = {
  nodeId: string;
  nodeName: string;
  fills: PaintInput[];
};
```

- `fills` is required, ordered, and may be `[]` to clear.
- The target must implement `MinimalFillsMixin`; `figma.mixed` is not a
  concrete replacement array.
- A `TEXT` or `TEXT_PATH` target with mixed range fills refuses
  `TEXT_HAS_MIXED_FILLS`; the stable error details include the observed native
  target type. The recovery names `node_info.styledTextSegments` with
  `fields:["fills"]`, then ranged `text_set_style` from PRD-014. It must not
  suggest a whole-node retry. Phase 0 must verify the pinned representation of
  mixed fills on both native types; if TEXT_PATH cannot be detected with the
  same safety, whole-node TEXT_PATH fill writes remain disabled rather than
  silently overwriting range styling.
- Resolve/validate the complete stack before assignment. Use `setFillsAsync`
  when any PATTERN is present; otherwise assign one complete immutable array.
- Success returns the canonical resulting `fills`, resulting `fillStyleId`,
  and `imageDimensions`. Literal replacement makes any linked-style override
  visible rather than silently claiming the link remained authoritative.

## `node_set_stroke` contract

```ts
type NodeSetStrokeInput = {
  nodeId: string;
  nodeName: string;
  strokes?: PaintInput[];
  strokeWeight?: number;
  individualStrokeWeights?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  strokeAlign?: "CENTER" | "INSIDE" | "OUTSIDE";
  strokeCap?:
    | "NONE"
    | "ROUND"
    | "SQUARE"
    | "ARROW_LINES"
    | "ARROW_EQUILATERAL"
    | "DIAMOND_FILLED"
    | "TRIANGLE_FILLED"
    | "CIRCLE_FILLED";
  strokeJoin?: "MITER" | "BEVEL" | "ROUND";
  strokeMiterLimit?: number;
  dashPattern?: number[];
};
```

- At least one mutation field is required. Omission preserves that field;
  `strokes: []` clears and `dashPattern: []` restores a solid stroke.
- `strokeWeight` and `individualStrokeWeights` are mutually exclusive.
  Individual weights require all four finite non-negative sides. Uniform
  weight is finite and non-negative.
- Align, join, and dash require `MinimalStrokesMixin`; cap and miter limit
  require `GeometryMixin`. Miter limit requires the effective join to be
  `MITER`. Unsupported targets fail before paint mutation.
- Every dash/gap value is finite and non-negative. Return Figma's normalized
  pattern rather than echoing the input.
- Preflight every source and geometry field. When paints and geometry coexist,
  submit the complete paint array first so an API-only VIDEO-hash refusal cannot
  leave geometry applied. Any later native geometry failure is a disclosed
  partial mutation, not a clean failure.
- Success returns complete canonical strokes, `strokeStyleId`, uniform/mixed or
  per-side weights, align, cap, join, miter limit, dash pattern, and
  `imageDimensions`.

## Intrinsic image metadata contract

Before any target mutation, every resolved IMAGE paint calls
`Image.getSizeAsync()`. A successful fill/stroke response includes:

```ts
type ImageDimensionEntry = {
  paintField: "fills" | "strokes";
  paintIndex: number;
  imageHash: string;
  intrinsicSize: { width: number; height: number };
  aspectRatio: number;
  sourceSize?: { width: number; height: number };
  wasResized: boolean;
};

type PaintImageMetadata = {
  imageDimensions: ImageDimensionEntry[];
};
```

`intrinsicSize` is the positive-integer pixel size Figma stores/renders.
Oversized base64 PNG/JPEG inputs that the MCP server downsizes also return the
decoded pre-resize `sourceSize` and `wasResized:true`. URL/HASH entries omit
`sourceSize` unless independently known. No guessed value is emitted.

Existing-image reads add:

```ts
type NodeInfoImageDimensionOption = {
  resolveImageDimensions?: boolean;
};
```

- `true` requires `properties` to contain `fills`, `strokes`, or both. The SDK
  refinement returns the exact corrected request otherwise.
- For every returned node, inspect IMAGE paints only, deduplicate hashes for API
  calls, resolve them with `figma.getImageByHash()`, and await `getSizeAsync()`.
- Preserve every paint reference in output even when hashes deduplicate. Place
  entries under `properties.imageDimensions` with field/index/hash/intrinsic
  size/aspect ratio; never return bytes.
- Missing/unloadable hashes appear under `unresolvedImageHashes` with an
  actionable per-hash reason while successful entries remain available.
- The option works in direct `TREE` and `MATCHES` reads, obeying that mode's
  scope, caps, ordering, and concurrency limits without consulting selection or
  implicit current page.

## Safety, errors, read-back, and partial-state rules

### Complete preflight

Before the first target setter, the plugin must:

1. resolve the target once and enforce the existing permission, scope-root,
   scope ancestry, exact-name, lock/ancestor-lock, and instance-interior gates;
2. snapshot the complete requested before-state, including arrays, style IDs,
   geometry fields, and referenced image hashes;
3. validate every strict paint branch and every requested geometry property;
4. resolve image sources, existing hashes, COLOR aliases, and pattern sources;
5. exact-name/scope verify every pattern source and confirm target mixins;
6. obtain IMAGE sizes and finish all deterministic async work; and
7. reject mixed TEXT or TEXT_PATH fills before any target write, or fail closed
   for TEXT_PATH when the pinned API cannot expose a trustworthy mixed-state
   check.

Schema validation is Layer 1 usability; repeat safety-critical type/range/branch
checks at the plugin boundary. Progress/reporting is best effort and must never
erase a mutation result.

### Stable errors

Central registry codes must distinguish at least:

- invalid/unknown paint branch or branch-specific field;
- invalid image source/base64/URL/hash and image dimensions unavailable;
- invalid VIDEO hash with Figma's normalized diagnostic;
- invalid COLOR alias or variable type;
- pattern source missing, stale name, outside scope, or unsupported;
- target paint/stroke mixin unavailable;
- `TEXT_HAS_MIXED_FILLS` for TEXT or TEXT_PATH, with the observed native type
  and exact ranged recovery;
- conflicting/invalid stroke weights, unsupported stroke field, and miter/join
  incompatibility; and
- unexpected paint/stroke partial mutation or unreadable read-back.

Every error carries machine-usable operands, observed values, accepted values,
the authoritative discovery call, and a corrected call when one retry is safe.
Never collapse an API diagnostic to `undefined`, silently discard nested
details, or imply retry safety when outcome is unknown.

### Result and failure classification

- A normal success is returned only after authoritative target read-back and
  write-ready paint normalization.
- If a native call reports failure, perform guarded read-back. Exact intended
  state may be reported as verified success with the normalized native report;
  exact before-state is a clean API failure; other readable state is
  `partialMutation:true`; unreadable state is outcome-unknown. Do not infer
  document state from promise settlement alone.
- For stroke calls, if paints landed before a later geometry failure, return
  before, intended, and current paints/geometry plus `whatChanged` and
  `partialMutation:true`. There is no automatic rollback claim.
- If read-back/reporting itself fails after mutation, preserve the primary
  setter outcome and disclose the read-back failure rather than replacing it.
- Complete-array writes carry a residual stale-array overwrite risk. Guides
  require a fresh `node_info` read before recomposition; this release does not
  invent unstable paint-item identity or claim compare-and-set semantics.

## Implementation ownership and phases

Primary production files:

- `src/mcp_server/tools/node.ts`
- `figma_plugin/handlers/stylingHandlers.ts`
- `figma_plugin/handlers/nodeReaders.ts`
- `figma_plugin/src/main.ts`
- the one shared PaintInput/read-normalization module established by PRD-008
  and extended for text writes by PRD-014
- `src/mcp_server/tools/_result.ts` and shared error factories only where their
  existing contracts require extension
- generated `figma_plugin/code.js` and tool manifest through generators only

Primary existing test seams include
`src/mcp_server/tests/unit/tools/node_set_fill.test.ts`,
`src/mcp_server/tests/unit/figma_plugin/stylingHandlers.test.ts`,
`src/mcp_server/tests/unit/imageResize.test.ts`, registered-MCP boundary suites,
generated-contract tests, and image fixtures under
`src/mcp_server/tests/fixtures/images/`.

### Phase 0 — Dependency and baseline gate

- Confirm PRD-008's serializer/read contract and PRD-014's shared IMAGE
  write-source extension plus ranged recovery are present and version-compatible.
- Record the current pin, tool schemas, handler branches, read serializers,
  version, tool count, and clean baseline gate/test counts.
- Re-inventory generator ownership and obtain explicit human approval of this
  PRD and the hard-cutover migration before production edits.

### Phase 1 — Shared schemas, errors, and read normalization

- Extend the one canonical strict union and pinned enum/parity tests.
- Implement one write-ready normalizer for write results, node fills/strokes,
  and styled-text fills; reject any forked allowlist.
- Add central error factories/playbook rows and public output schemas.
- Red-proof branch strictness and lossless read/write parity.

### Phase 2 — Image metadata reads

- Add the strict `node_info.resolveImageDimensions` refinement/output.
- Implement hash deduplication, bounded concurrency, positive-integer size
  validation, per-reference output, and unresolved-hash evidence.
- Cover direct TREE and MATCHES paths without implicit page/selection state.

### Phase 3 — Fill hard cutover

- Remove legacy schema/dispatcher branches.
- Implement complete preflight, mixed TEXT/TEXT_PATH refusal, array assignment/pattern
  setter, image metadata, authoritative read-back, and failure classification.
- Prove retired call shapes fail through the official SDK callback.

### Phase 4 — Stroke paints and geometry

- Add the strict mutation/refinement surface and mixin checks.
- Remove every legacy stroke-color/weight schema and dispatcher branch.
- Implement paint-first ordering, complete read-back, normalized dash output,
  and exact partial-state disclosure.
- Prove no invalid later field permits an earlier predictable mutation.

### Phase 5 — Contract synchronization and release

- Update tool descriptions, `README.md`, `SAFETY.md`, `CHANGELOG.md`, guides,
  playbook, examples, and `figma-edit://guide/*` mirrors.
- Update generated manifest/tool-list/safety-row/permission tests and rebuild
  the committed plugin bundle.
- Assign/apply the minor version and run every acceptance gate below.
- Execute the dedicated live matrix and reconcile the test file exactly.

## Verification requirements

### Schema and registered-boundary tests

- Snapshot emitted `tools/list`, not only local Zod objects.
- Assert both setters publish exactly `idempotentHint: true` and
  `openWorldHint: true` and do not acquire `destructiveHint: true`.
- Exercise every PaintInput and ImageSource discriminator; require/forbid exact
  fields and reject nested unknown keys.
- Cover finite/range rules, transform dimensions, two-or-more ordered gradient
  stops, mode-specific transform/scale, strict aliases, and pattern shape.
- Prove `fills` is always present/may be empty; stroke requires at least one
  field and rejects uniform/per-side coexistence.
- Prove every old fill field and old stroke field (`r`, `g`, `b`, `a`, `image`,
  `clear`, `weight`, and all four `stroke*Weight` keys) fails `-32602` at the
  official MCP boundary and no dispatcher fallback accepts it.
- Prove the image-dimension flag requires requested paint properties and its
  emitted description distinguishes intrinsic resource pixels from node size.
- Assert exact success and structured failure shapes at registered callbacks.

### Handler and safety tests

- Cover ordered multi-paint solid/gradient/image/video/pattern stacks, clear
  arrays, variable-bound colors, every image source, reused hashes, and pattern
  source scope/name verification.
- Cover common stroke geometry, mixin failures, weight exclusion, effective
  MITER behavior, normalized dash patterns, and omitted-field preservation.
- Invalid paint N prevents paints 0..N-1 and every stroke geometry mutation.
- Mixed TEXT and TEXT_PATH fills refuse before mutation and return the exact
  PRD-014 recovery; if the pin cannot expose TEXT_PATH mixed state safely, all
  whole-node TEXT_PATH fill writes refuse before mutation.
- Pattern sources outside scope or with stale names never mutate the target.
- Cover linked-style read-back and write-ready node/styled-segment parity.
- Inject native failures before mutation, after paint application, during
  geometry, and during read-back; assert clean/partial/unknown classification
  and complete evidence.
- Cover new/reused/resized images, stored/source sizes, repeated-hash
  deduplication, missing hashes, and TREE/MATCHES output.
- Prove no handler reads current selection or implicit current page.

Every new regression guard is red-proofed by breaking its exact production or
contract line, recording the named failure and exact counts, restoring it, and
rerunning green.

### Repository gates

- `bun run build:all`
- `bun run check:generated`
- `bun run check:plugin`
- `bun run check:versions`
- `bun run check:types:plugin`
- `bun run check:types:scripts`
- `bun run check:suppressions`
- focused schema, handler, registered-boundary, image, and docs suites
- full `bun test src/mcp_server/tests`
- `git diff --check`

Record exact pass/assertion counts. A restricted socket/environment failure is
reported separately and is neither product failure nor full-suite green.

### Live Figma verification

Use a dedicated Figma Design file and fresh channel. Discover with `page_info`
then `node_info`, pass names verbatim, record versions/tool inventory/opening
state, and never rebuild inside the bound live session.

Required matrix:

1. ordered SOLID plus all four gradient variants with exact read-back;
2. URL, base64, and reused-hash IMAGE paints, including an oversized base64
   resize with distinct source/stored sizes;
3. an authorable PATTERN fill and stroke with a verified in-scope source;
4. VIDEO reuse only when a legitimate existing hash is available; otherwise
   record fixture unavailability rather than inventing a hash;
5. common stroke geometry, uniform/per-side weights, and clear arrays;
6. invalid stack atomic refusal and pattern out-of-scope/stale-name refusal;
7. mixed TEXT and TEXT_PATH fill refusal followed by styled-segment discovery
   and a ranged PRD-014 correction that preserves other runs; when the pin
   cannot expose TEXT_PATH mixed state, verify the explicit fail-closed
   whole-node refusal instead;
8. identical dimensions for existing fill/stroke image hashes through
   `node_info`, repeated-hash deduplication, and explicit unresolved metadata;
9. a residual injected/native failure when safely authorable, with exact
   before/result state and no rollback overclaim; and
10. cleanup/reconciliation to the exact opening document state.

Repository stubs prove only encoded behavior. Any missing live fixture is
reported as blocked/fixture-unavailable, never as a successful probe.

## Documentation and generated artifacts

- Tool descriptions say complete ordered replacement, `[]` clear, fresh-read
  workflow, strict source branches, mixed-text recovery, the TEXT_PATH
  fail-closed rule when applicable, and intrinsic-vs-node dimensions.
- The CHANGELOG contains old/new fill and stroke calls, including every retired
  color/weight key, linked-style disclosure, and the node-info metadata example.
- `SAFETY.md` adds exact fill/stroke gate rows; registered-write/safety-row tests
  remain bidirectional.
- `constraints.md`, `workflows.md`, `tool-selection.md`, and
  `error-playbook.md` are updated and mirrored through served resources.
- Generated schema/tool manifests and `figma_plugin/code.js` come from their
  source generators; they are never hand-edited.
- Tool count remains unchanged by this release.

## Acceptance gate

The minor release is complete only when:

1. PRD-008 and PRD-014 dependencies are present; the read union, IMAGE
   write-source extension, and normalizer remain one shared contract with no
   fork or downgrade.
2. Old `node_set_fill` and `node_set_stroke` shapes are absent at schema,
   registered callback, dispatcher, generated, documentation, prompt, guide,
   and example boundaries.
3. Both setters retain the exact absolute-write annotations from this PRD in
   emitted tool metadata.
4. One strict PaintInput union round-trips all supported paint branches and
   preserves order, aliases, and pattern source identity.
5. Complete fill/stroke arrays and every common geometry field return exact
   authoritative state; omitted stroke fields remain unchanged.
6. Invalid calls produce zero predictable mutation and unexpected residual
   mutations return exact partial/outcome evidence.
7. Mixed TEXT and TEXT_PATH fills cannot be destroyed by whole-node replacement
   and the correction path is executable in the shipped predecessor; a pin
   without trustworthy TEXT_PATH mixed-state visibility enforces the documented
   whole-node refusal.
8. Image metadata comes from `getSizeAsync()`, distinguishes source/stored size,
   deduplicates calls without losing references, and never reports node size as
   intrinsic size.
9. All schema/handler/safety/boundary/docs regressions are red-proofed and all
   repository gates pass with recorded counts.
10. Required live evidence is recorded separately from repository/injected-fault
   evidence and the dedicated document is exactly reconciled.
11. Guides, served resources, safety matrix, generated artifacts, CHANGELOG,
    and all version surfaces describe the shipped contract exactly.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| A stale complete array overwrites a newer paint edit | Medium | Require fresh `node_info`, document full replacement, return complete arrays, offer no unstable index patch |
| Whole-node fill destroys mixed text colors | High without guard | Refuse mixed TEXT/TEXT_PATH before mutation; require PRD-014 styled-range recovery, or disable whole-node TEXT_PATH fills if its mixed state is not trustworthy |
| Invalid paint N partially applies earlier paints/geometry | High without full preflight | Validate and resolve the complete call before target mutation; adverse-path tests at every step |
| VIDEO hash rejection cannot be pre-resolved | Medium | Paint-first ordering before geometry, authoritative read-back, partial-state disclosure |
| Pattern source escapes scope or has stale identity | High without source guard | Exact ID/name and scope validation; source is read-only; zero target mutation on refusal |
| Open or duplicated paint serializers drift | High | One PRD-008-rooted, PRD-014-extended generated strict union/normalizer and parity tests across every consumer |
| Intrinsic pixels are confused with node size | Medium | `intrinsicSize` naming, `getSizeAsync()` provenance, explicit `node_transform` follow-up |
| Missing hashes become fabricated zero sizes | Medium | Per-hash unresolved entries while preserving successful metadata |
| URL/base64 upload or resize evidence is mistaken for live Figma proof | Medium | Separate server decode/resize evidence, plugin resource evidence, and live read-back |
| Linked style behavior is hidden by literal replacement | Medium | Return resulting style ID and complete literal arrays; document override effect |
| New pin adds paint variants/fields | Medium | Declaration-backed parity test; explicit PRD revision rather than fallback/catchall |

## Evidence boundary and provenance

The source evidence was measured against the repository and pinned
`@figma/plugin-typings` 1.125.0. It established that the current fill surface is
single-solid/image/clear, stroke is one solid plus limited weights, and neither
returns `Image.getSizeAsync()` dimensions. Those facts motivate the release but
must be reverified at Phase 0 against the scheduled checkout and pin.

Repository tests, schemas, and injected Figma stubs establish only encoded
behavior. Live image storage, pattern loading, normalization, and partial native
outcomes require the separately recorded live matrix. No dated source claim is
presented as current without revalidation.
