# PRD — Styled-Text Read Fidelity

- **Status:** Proposed
- **Release:** Version-unassigned standalone minor release
- **PRD date:** 2026-08-04
- **Source:** [Future Figma Design Editing Capability Expansion](<../Figma Design Editing Capability Expansion/prd.md>), Section 16.3 and the read-side paint normalization in Section 18.1
- **Required predecessors:** [`PRD-005-Scoped-Match-Discovery.md`](PRD-005-Scoped-Match-Discovery.md) and [`PRD-006-Typography-and-Font-Discovery.md`](PRD-006-Typography-and-Font-Discovery.md)
- **Optional sibling:** [`PRD-007-Direct-Variable-Binding-Discovery.md`](PRD-007-Direct-Variable-Binding-Discovery.md)

> [!IMPORTANT]
> This release exposes bounded, write-ready styled-text runs and owns the canonical read-side `PaintInput` serializer used by those runs and ordinary node paint reads.
>
> It does not add range styling, range content replacement, paint writes, image import, image dimensions, or `TEXT_PATH` creation. Those later releases depend on this read contract.

## 1. Executive summary

Range-based text work is unsafe when the caller can see only whole-node values. Before selecting UTF-16 offsets or replacing a style, an agent must be able to inspect the exact runs Figma computes for the requested fields.

This release adds an optional `node_info.styledTextSegments` computed-read request. It:

- accepts a strict non-empty list of Figma-supported styled-run fields;
- optionally limits the read to one valid half-open UTF-16 range;
- calls Figma’s native `getStyledTextSegments()` once per target/read request;
- returns exact characters, start/end offsets, requested values, complete segment counts, and bounded output;
- supports `TEXT` and `TEXT_PATH`;
- preserves variable alias IDs;
- serializes paint-valued fields into one strict canonical, later-write-ready union.

The same read-side paint serializer becomes canonical for requested `node_info` `fills` and `strokes`, eliminating a future divergence between ordinary node reads, styled-run reads, and paint write readback.

## 2. Release identity and compatibility

This work ships as one independently reviewable minor release after PRD-005 and PRD-006. Its concrete version is assigned only when scheduled. The assigned version must be synchronized across:

- `package.json`;
- root `package-lock.json` release-version fields;
- both `server.json` version fields;
- root `manifest.json`;
- plugin About/handshake bundle output;
- `CHANGELOG.md`.

`check:versions` and `check:plugin` must enforce the assigned version before tagging.

Public API effect:

| Surface | Change |
| :- | :- |
| `node_info` input | Add optional `styledTextSegments` to both `TREE` and `MATCHES` branches |
| Per-text-node `properties` output | Add bounded `styledTextSegments` computed output |
| Requested `fills`/`strokes` and segment `fills` | Normalize through one strict canonical read-side `PaintInput` union |

No tool is added, renamed, or removed. The styled-segment addition is opt-in. The canonical paint normalization can reshape requested paint output, especially image paints, and is therefore a deliberate read-shape hard cutover: no parallel legacy paint-output branch or hidden compatibility flag is allowed.

If maintainers do not accept that hard cutover for a scheduled minor, this PRD must be reclassified before implementation; duplicating paint shapes is not an acceptable workaround.

## 3. Source mapping and ambiguity resolution

| Umbrella source item | This PRD |
| :- | :- |
| Checklist item 20: expose computed styled-text segments | Sections 6–8 |
| D16 styled-text prerequisite | Sections 4–9 and 18 |
| Section 16.3 problem, fields, ranges, output, and acceptance | Sections 4–9 |
| Section 18.1 canonical read-side paint normalization | Sections 10–12 |
| Section 20 styled-field/range safety and errors | Sections 13–14 |
| Schema requirement 10 | Sections 6–7 |
| Phase 2 styled-text read implementation | Section 17 |

The umbrella says styled-text paint fields use the `PaintInput` serializer specified later in Section 18, while Section 18’s safe mixed-text fill write directs callers back to styled segments. As separate releases, that creates a circular ownership seam. This PRD resolves it by owning the strict read-side serializer now. The later paint-write release must import and extend the same canonical types/helpers; it must not redefine the read format.

The umbrella presents `styledTextSegments` as a top-level `node_info` option but places its result under each node’s `properties`. This PRD makes that exact: the option does not have to appear in the ordinary `properties` string array, and a qualifying text node receives `properties.styledTextSegments` even when no other property was requested.

## 4. Problem

The current implementation uses `getStyledTextSegments(["fontName"])` internally only to discover fonts for writes. Callers cannot inspect:

- exact run boundaries;
- which fields cause segmentation;
- the current substring corresponding to future UTF-16 offsets;
- per-run paint/style/link/binding identities;
- whether output was bounded.

Reconstructing runs by repeatedly reading range properties is slower and can produce boundaries that differ from Figma’s native segmentation. Rebuilding a paint into a later write call is also unsafe when reads and writes use different shapes or silently omit aliases.

## 5. Goals and explicit non-goals

### Goals

1. Add one strict, opt-in styled-segment request to `node_info`.
2. Expose every source-approved Figma `StyledTextSegment` field.
3. Return Figma-native segmentation with exact UTF-16 boundaries and characters.
4. Permit one optional validated half-open range.
5. Bound returned segment arrays while reporting complete counts.
6. Support both `TEXT` and `TEXT_PATH`.
7. Preserve raw variable alias IDs in every segment field.
8. Define and implement one recursively strict canonical read-side paint union.
9. Use that serializer consistently for segment fills and ordinary requested node fills/strokes.
10. Make later text and paint writes consume this release rather than inventing another discovery or paint format.

### Explicit non-goals

- No `text_set_style` range fields or expanded writable property matrix.
- No `text_set_content` range replacement, insertion, or deletion.
- No text mutation or font loading.
- No `create_text TEXT_PATH`.
- No `node_set_fill` or `node_set_stroke` input change.
- No image URL/base64 import or pattern write.
- No intrinsic image dimension resolution.
- No paint patch-by-index API.
- No multiple independent text ranges in one call.
- No custom reconstruction of Figma’s segmentation.
- No standalone text-range, text-scan, font, or paint-read tool.
- No loss of variable alias identity in favor of display names.
- No style-object resolution beyond fields directly returned by the native segment API.

## 6. Exact `styledTextSegments` input contract

### 6.1 Field enum

```ts
type StyledTextSegmentField =
  | "fontSize"
  | "fontName"
  | "fontWeight"
  | "fontStyle"
  | "textDecoration"
  | "textDecorationStyle"
  | "textDecorationOffset"
  | "textDecorationThickness"
  | "textDecorationColor"
  | "textDecorationSkipInk"
  | "textCase"
  | "lineHeight"
  | "letterSpacing"
  | "fills"
  | "textStyleId"
  | "fillStyleId"
  | "listOptions"
  | "listSpacing"
  | "indentation"
  | "paragraphIndent"
  | "paragraphSpacing"
  | "hyperlink"
  | "boundVariables"
  | "textStyleOverrides"
  | "openTypeFeatures";

type StyledTextSegmentsRequest = {
  fields: StyledTextSegmentField[];
  start?: number;       // inclusive UTF-16 code-unit offset
  end?: number;         // exclusive UTF-16 code-unit offset
  maxSegments?: number; // integer 1..1000, default 250
};
```

The request object and all nested value objects are strict.

### 6.2 Presence and range rules

- `fields` is required and non-empty.
- Unknown fields fail with the complete accepted list.
- Duplicate fields are accepted and deduplicated in first-occurrence order before the native call. The plugin repeats that normalization at its boundary so direct/internal dispatch cannot produce a different segment request. Unknown fields still fail; deduplication never hides an unknown value.
- `start` and `end` must be supplied together or both omitted.
- Both are finite non-negative integers.
- With a range, require `0 <= start < end <= characters.length`.
- A range is forbidden on an empty text node.
- Neither boundary may split a UTF-16 surrogate pair.
- A split boundary fails and returns the nearest valid lower and upper boundaries; it is never rounded.
- With no range, the complete character span is passed to the native segment API. For an empty text node, preserve the pinned runtime's native cardinality and values; do not synthesize or delete a zero-length segment. Counts report that observed native result.
- `maxSegments` is an integer `1..1000`, default `250`.
- `maxSegments` bounds returned output only; the complete native segment result is counted.

### 6.3 Integration into `node_info`

The option is legal in both PRD-005 branches:

```ts
type NodeInfoTreeExtension = {
  resultMode?: "TREE";
  styledTextSegments?: StyledTextSegmentsRequest;
};

type NodeInfoMatchesExtension = {
  resultMode: "MATCHES";
  styledTextSegments?: StyledTextSegmentsRequest;
};
```

Rules:

- In unfiltered `TREE`, compute segments for each returned `TEXT`/`TEXT_PATH` node inside the selected roots and `maxDepth`.
- In filtered `TREE`, compute them only for matching text nodes, not path-preserving ancestors.
- In `MATCHES`, compute them only for returned matching text nodes. Nodes counted but omitted after global `maxResults` are not serialized.
- Non-text nodes omit the computed property; a mixed node result is not an error.
- If all explicitly requested roots are non-text, return the normal successful read with no segment properties.
- The option does not change matching predicates or result counts.
- It does not need to be repeated in the `properties` string array.
- Existing requested properties remain additive and use existing allowlists.

## 7. Native segmentation behavior

- For each qualifying text node, call `getStyledTextSegments(fields, start?, end?)`.
- Do not reconstruct runs with individual range getters.
- Do not split or merge native segments after normalization except to cap the returned array.
- Each segment always includes `characters`, `start`, and `end`.
- Each segment includes every requested field and no unrequested styled field.
- `start`/`end` in output remain offsets into the complete node string, including when the request supplied a subrange.
- Preserve returned segment order.
- Segment boundaries must be contiguous over the requested non-empty range unless the native API explicitly documents otherwise; a gap or overlap fails as incomplete/invalid native output.
- For a non-empty requested span, the first segment starts at the requested `start` or `0` and the last segment ends at the requested `end` or `characters.length`.
- For a non-empty requested span, concatenating segment `characters` must reproduce the exact requested substring code-unit-for-code-unit.
- Empty `TEXT` and empty `TEXT_PATH` behavior is release-blocked on a pinned live probe. The recorded native cardinality becomes the handler/test expectation; the implementation must not infer zero or one segment from mocks or typings alone.
- Any native output that violates those invariants fails closed; do not repair it silently.
- The scheduled pinned typings expose the approved field set through the shared non-resizable text mixin for both `TEXT` and `TEXT_PATH`. Handler tests must still type- and runtime-check the target before calling the method.

PRD-006’s internal typography extractor may use a minimal native segment call for matching. This release must share the underlying native-call/UTF-16 validation primitive while retaining ownership of the public field/value serialization.

## 8. Styled-segment output contract

Per qualifying node, under `properties`:

```ts
type StyledTextSegmentsResult = {
  segments: Array<{
    characters: string;
    start: number;
    end: number;
    [requestedField: string]: unknown;
  }>;
  totalSegmentCount: number;
  returnedSegmentCount: number;
  truncated: boolean;
};
```

Rules:

- `totalSegmentCount` is the complete native count for the selected range.
- `returnedSegmentCount` equals `segments.length`.
- `truncated` is exactly `totalSegmentCount > returnedSegmentCount`.
- Return the first `maxSegments` segments in native order.
- A truncated result includes recovery metadata naming the complete range and the end offset of the last returned segment.
- Tool guidance tells the caller to retry with a narrower `[start, end)` range beginning at that boundary; it does not pretend pagination is snapshot-stable after intervening edits.
- Every `VariableAlias` in `boundVariables`, paints, or other returned structures is normalized as:

```ts
type CanonicalVariableAlias = {
  type: "VARIABLE_ALIAS";
  id: string;
  name?: string; // enrichment only
};
```

- Alias `id` is mandatory and authoritative.
- Failure to resolve an optional alias name does not remove the ID or fail the read.
- `textStyleId` and `fillStyleId` preserve exact raw IDs, including an empty string when Figma represents an unlinked state that way.

## 9. Field serialization contract

Primitive/enumerated fields retain the exact pinned Figma values. Structured fields use strict JSON-safe shapes:

- `fontName`: exact non-empty `{ family, style }`;
- `lineHeight`, `letterSpacing`, decoration offset/thickness/color: preserve their exact discriminated native variants;
- `fills`: canonical paint array from Sections 10–12;
- `listOptions`, `hyperlink`, `textStyleOverrides`, and `openTypeFeatures`: preserve their complete pinned fields without unknown-key stripping;
- `boundVariables`: preserve every alias ID in its pinned scalar/array/map shape.

Mixed sentinels, functions, symbols, undefined object properties, cyclic objects, and other non-JSON values must not leak into output. Because native segmentation is requested for exact fields, an unexpected mixed sentinel is a structured incomplete-read error, not a silently omitted value.

## 10. Canonical read-side paint contract

### 10.1 Shared value types

```ts
type RGB = { r: number; g: number; b: number };
type RGBA = { r: number; g: number; b: number; a: number };
type Transform = [[number, number, number], [number, number, number]];

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

type ImageFilters = {
  exposure?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  highlights?: number;
  shadows?: number;
};
```

All colors, transforms, filters, opacities, scaling factors, positions, and spacing vectors must be finite. Read normalization validates that Figma’s returned values satisfy the pinned ranges; it never clamps or drops an invalid value.

### 10.2 Strict paint union

```ts
type PaintInput =
  | {
      type: "SOLID";
      color: RGB;
      boundVariables?: { color: CanonicalVariableAlias };
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
        boundVariables?: { color: CanonicalVariableAlias };
      }>;
      visible?: boolean;
      opacity?: number;
      blendMode?: BlendMode;
    }
  | {
      type: "IMAGE";
      source: { kind: "HASH"; imageHash: string };
      scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
      imageTransform?: Transform;
      scalingFactor?: number;
      rotation?: 0 | 90 | 180 | 270;
      filters?: ImageFilters;
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

Every union branch and nested object is recursively strict.

### 10.3 Read-only normalization rules

- SOLID colors preserve exact RGB and optional direct color alias.
- Gradients preserve ordered stops, exact transform, stop RGBA, and optional stop aliases.
- IMAGE output always uses `source: { kind: "HASH", imageHash }`.
- Read output never contains URL bytes, base64 bytes, or an invented source URL.
- VIDEO preserves the existing non-empty `videoHash`; this release does not import or validate video availability through a nonexistent lookup API.
- PATTERN resolves and exact-name serializes its source node through the existing authorized node-read helper.
- If a required pattern source cannot be resolved within the authorized read contract, fail that computed paint read with a structured incomplete-read error; do not fabricate or omit `sourceNodeName`.
- Preserve Figma array order exactly.
- Preserve `visible`, `opacity`, and `blendMode` when present.
- Do not add read-only metadata such as intrinsic image dimensions inside `PaintInput`.
- Do not resize a node or load/create an image.
- Unknown paint variants or unknown required fields fail closed and trigger the pinned-union parity gate.

### 10.4 Applicability rules

- `imageTransform`/`videoTransform` appear only for `CROP`.
- `scalingFactor` appears only for `TILE` and must be positive.
- `rotation` appears only where the pinned Figma paint supports it.
- Gradient stop positions and opacity/filter fields must remain within pinned Figma ranges.
- Gradient arrays contain at least two ordered stops.
- These rules validate read fidelity; there is no setter in this release.

## 11. Serializer ownership and application

Implement one production serializer:

```ts
normalizePaintForRead(
  paint: Paint,
  authorizedReadContext: ReadContext
): Promise<PaintInput>
```

Use it for:

- `styledTextSegments[].fills`;
- requested ordinary `node_info` `fills`;
- requested ordinary `node_info` `strokes`;
- later paint-write success readback.

This release updates the first three. A later paint-write release consumes the helper for setters/readback.

Do not keep:

- the current loose pass-through paint serializer;
- a separate text-paint serializer;
- a legacy image-paint output branch;
- per-handler normalization that drops unknown keys.

If a `fills`/`strokes` property is `figma.mixed`, ordinary node output preserves the existing explicit mixed-state representation or structured refusal; it must not treat the mixed sentinel as a concrete paint array. Styled segments should provide concrete arrays for each native run.

## 12. Paint output safety and failure behavior

- `PaintInput` is the canonical public read/write shape; this release implements only its read serializer. A later write release may accept URL/base64 `ImageSource` inputs in addition to hash input, but read output remains the exact hash-bearing branches above.
- Paint normalization is read-only and retains `readOnlyHint: true`.
- Pattern source resolution cannot broaden authorized document/page/root scope silently.
- Image and video hashes are identifiers, not downloadable content.
- Variable alias enrichment is optional; raw alias IDs are preserved.
- A serializer failure reports the target node, property/segment index, paint index, observed paint type, and completed output scope.
- Partial per-node paint output must not be labeled complete.
- Unknown paint keys are not silently stripped into a write-ready object.
- Canonical output does not assert that a hash remains writable after the read; later writes revalidate assets.

## 13. Overall safety and scope

- Existing PRD-005 explicit-root and result-mode rules remain authoritative.
- Existing PRD-006 typography extraction is reused; no current-page or selection path is introduced.
- The plugin validates node type, range, fields, cap, and output invariants.
- Segment reads are allowed only for nodes already authorized by the selected traversal.
- A non-text node is omitted, not coerced.
- `TEXT` and `TEXT_PATH` are type-checked before the native call.
- No read result grants later write authority.
- All failures use central structured errors and do not mutate.

Update `node_info`’s computed-metadata row in [`SAFETY.md`](../../../SAFETY.md) with styled-field/range validation, output caps, paint normalization, alias identity, and pattern-source resolution.

## 14. Structured errors and recovery

Required distinct conditions:

| Condition | Required details and recovery |
| :- | :- |
| `STYLED_TEXT_FIELDS_REQUIRED` | Exact accepted field list and corrected request |
| `STYLED_TEXT_FIELD_INVALID` | Rejected field, accepted enum, closest suggestion |
| `STYLED_TEXT_FIELD_DUPLICATE` | Duplicate indexes and first-occurrence corrected request |
| `STYLED_TEXT_RANGE_INCOMPLETE` | Missing companion and complete paired request |
| `STYLED_TEXT_RANGE_INVALID` | Supplied values, text length, accepted inequality |
| `STYLED_TEXT_RANGE_SPLITS_SURROGATE` | Boundary, nearest valid lower/upper offsets, corrected request |
| `STYLED_TEXT_RANGE_EMPTY_NODE` | Node identity and whole-node read alternative |
| `STYLED_TEXT_LIMIT_INVALID` | Supplied value and integer range `1..1000` |
| `STYLED_TEXT_FIELD_UNAVAILABLE` | Target type, field, accepted fields for that type |
| `STYLED_TEXT_NATIVE_OUTPUT_INVALID` | Node/range, gap/overlap/content mismatch details |
| `PAINT_READ_VARIANT_UNSUPPORTED` | Node/property/segment/paint index, observed type, pinned accepted variants |
| `PAINT_READ_SHAPE_INVALID` | Exact invalid path/value and no false-complete output |
| `PAINT_PATTERN_SOURCE_UNAVAILABLE` | Source ID, authorized scope, narrower/explicit read recovery |

Truncation is a successful result, not an error. It includes the exact narrower-range continuation guidance described in Section 8.

## 15. Documentation and generated-contract requirements

Update:

- `README.md`;
- [`SAFETY.md`](../../../SAFETY.md);
- [`constraints.md`](../../../skills/figma-edit/references/constraints.md);
- [`error-playbook.md`](../../../skills/figma-edit/references/error-playbook.md);
- [`workflows.md`](../../../skills/figma-edit/references/workflows.md);
- [`tool-selection.md`](../../../skills/figma-edit/references/tool-selection.md);
- mirrored MCP resources;
- `node_info` descriptions/examples;
- node-field references if their output shape is documented;
- `CHANGELOG.md`;
- generated `manifest.json`;
- generated `figma_plugin/code.js`.

Guides must explain:

- why styled segments precede range edits;
- fields determine native segmentation;
- UTF-16 offsets and surrogate boundaries;
- whole-node versus ranged segment reads;
- output caps and narrower-range recovery;
- `TEXT` and `TEXT_PATH`;
- raw alias ID preservation;
- canonical paint shapes;
- image hash versus image bytes/dimensions;
- PATTERN source identity;
- no write capability in this release.

## 16. Implementation context and owned files

Primary production areas:

- `src/mcp_server/tools/node.ts`;
- shared result/filter modules from PRD-005;
- shared typography-run/native-segment primitive from PRD-006;
- `figma_plugin/handlers/nodeReaders.ts`;
- a new shared canonical paint schema/serializer module;
- existing style/paint schema modules only as needed to replace duplicate read normalization;
- `figma_plugin/src/main.ts` only for input/output routing.

Primary tests:

- MCP boundary, strict-input, and output-schema suites;
- `getNodesInfo` unit/integration tests;
- node field and serializer tests;
- current-page-elimination and safety consistency tests;
- generated artifact tests.

The canonical paint type must live in a dependency-neutral shared module that later node/text paint setters can import. It must not import a write handler or create a cyclic server/plugin dependency.

## 17. Phased implementation

### Phase 0 — dependency and pinned-contract audit

- Confirm PRD-005 and PRD-006 are released and green.
- Re-read pinned `StyledTextSegment`, `getStyledTextSegments`, `Paint`, and all nested paint declarations.
- Inventory current node/style/text paint serializers and output shapes.
- Capture baseline `node_info` fills/strokes output for each available paint fixture.
- Confirm `TEXT_PATH` supports the native segment method on the scheduled pin and live runtime.

### Phase 1 — strict schemas and error registry

- Add the exact field enum, request, output, alias, and paint schemas.
- Extend both `node_info` branches without changing matching.
- Add central errors and emitted-schema tests.
- Add a pinned paint-variant/field parity gate.

### Phase 2 — range and native segmentation

- Implement paired range, bounds, UTF-16, and surrogate validation.
- Share the native call primitive with PRD-006.
- Validate native continuity/content invariants.
- Add segment cap/count/truncation and narrower-range metadata.

### Phase 3 — canonical read-side paint serializer

- Implement every strict paint branch.
- Preserve alias IDs.
- Normalize IMAGE to hash source.
- Resolve PATTERN source identity through authorized reads.
- Apply the serializer to segment fills and ordinary requested fills/strokes.
- Remove duplicate/loose read serializers.

### Phase 4 — node reader integration

- Compute output only for qualifying returned text nodes.
- Preserve PRD-005 traversal, property, result-count, and cap behavior.
- Add precise per-node failure context.
- Test composition with PRD-006 and optional PRD-007 filters.

### Phase 5 — synchronization and release

- Update safety, resources, guides, examples, changelog, generated manifest, bundle, and version surfaces.
- Run focused/full/generated/plugin/version tests, red proofs, and live probes.

## 18. Verification requirements

### 18.1 Schema tests

Assert:

- exact non-empty field enum;
- duplicate acceptance with deterministic first-occurrence deduplication;
- paired optional range;
- integer/bound rules;
- cap `1..1000`;
- strict unknown-key rejection;
- availability in both `TREE` and `MATCHES`;
- no requirement to repeat the computed option in `properties`;
- exact output count fields;
- strict paint and alias unions.

### 18.2 Segment tests

Cover:

- uniform and mixed runs;
- empty `TEXT` and empty `TEXT_PATH` without a range, preserving the pinned native cardinality and values;
- full-node and subrange reads;
- every approved field individually;
- combinations that change segmentation;
- UTF-16 emoji boundaries;
- start/end at valid neighboring code-unit boundaries;
- native output continuity and exact substring reconstruction;
- `TEXT` and `TEXT_PATH`;
- non-text omission;
- filtered tree/matches and unfiltered tree;
- cap/count/truncation and narrower-range guidance;
- alias ID preservation;
- unsupported/malformed native output failures.

### 18.3 Paint serializer tests

Cover:

- SOLID with and without color alias;
- every gradient variant, transform, ordered stops, and stop aliases;
- IMAGE hash and every valid scale-mode companion;
- VIDEO hash and companions;
- PATTERN source identity and unresolved/out-of-scope failure;
- common visible/opacity/blend fields;
- filters, rotations, finite/range validation;
- array order;
- unknown variant/field fail-closed behavior;
- ordinary fills/strokes and segment fills produce the same canonical shape;
- no URL/base64 bytes or dimensions in read output.

### 18.4 Composition tests

- PRD-006 font/Text Style matching plus styled output.
- Optional PRD-007 variable binding plus `boundVariables` styled field.
- Global match cap does not compute/emit segments for omitted match objects.
- Segment cap does not change node match counts.
- Requested ordinary properties remain additive.

### 18.5 Red proofs

Record named red failures for:

- accepting an unknown field or failing to preserve first-occurrence order while deduplicating repeated fields;
- accepting a partial/surrogate-splitting range;
- reconstructing rather than using native segmentation;
- synthesizing empty-node segment cardinality instead of preserving the pinned native result;
- dropping an alias ID after name enrichment;
- emitting a loose/legacy image paint shape;
- silently stripping an unknown paint variant/key;
- reading a pattern source outside authorized scope;
- calling a text write or loading a font.

Restore and rerun exact named tests green.

### 18.6 Live Figma probes

Use a dedicated document containing:

- mixed fonts, sizes, fills, hyperlinks, lists, style IDs, and variable-bound text where supported;
- emoji or another surrogate-pair fixture;
- both `TEXT` and `TEXT_PATH`;
- empty `TEXT` and empty `TEXT_PATH` fixtures;
- solid, gradient, image, video, and pattern paint fixtures where legitimately authorable.

Verify exact native boundaries, field-driven segmentation, ranges, caps, alias IDs, canonical paint shapes, and empty-node cardinality/value behavior for both `TEXT` and `TEXT_PATH`. Empty-node behavior is release-blocking rather than fixture-optional because the handler contract and tests must preserve the pinned native result. If VIDEO, PATTERN, remote style, variable, or non-empty `TEXT_PATH` fixtures are unavailable, record each as fixture-unavailable rather than claiming mock evidence proves live behavior.

## 19. Repository and release gates

Required:

- focused schema/reader/serializer tests;
- `bun test`;
- `bun run check:types:plugin`;
- `bun run check:types:scripts`;
- `bun run check:suppressions`;
- `bun run check:generated`;
- `bun run build:all`;
- `bun run check:plugin`;
- `bun run check:versions`;
- generated diff review;
- live evidence and cleanup reconciliation.

## 20. Acceptance criteria

The release is complete only when:

1. PRD-005 and PRD-006 are in the scheduled baseline.
2. One minor version is assigned and synchronized.
3. `node_info` accepts one strict styled-segment request in both result modes.
4. The field list is exact, non-empty, and enum-backed; repeated fields normalize to one first-occurrence-ordered list before native segmentation.
5. Range fields are paired, in bounds, and cannot split a surrogate pair.
6. `TEXT` and `TEXT_PATH` use native `getStyledTextSegments`.
7. Output always carries exact characters/start/end plus requested fields.
8. Native continuity and substring invariants are checked.
9. Segment output is bounded with complete counts and truthful truncation/retry guidance.
10. Non-text nodes omit the computed property without changing match results.
11. Every variable alias preserves its exact ID.
12. One strict canonical read-side paint serializer covers all pinned paint variants.
13. Segment fills and ordinary node fills/strokes use the same shape.
14. IMAGE reads use hash sources and contain no bytes or intrinsic dimensions.
15. PATTERN source identity obeys authorized read scope and fails closed when unavailable.
16. No loose/legacy parallel paint-output path remains.
17. Safety, errors, guides/resources, descriptions, changelog, generated manifest, plugin bundle, and version surfaces are synchronized.
18. Focused/full/generated/plugin/version gates, red proofs, and live probes are green.
19. No text mutation, paint mutation, image import/dimensions, or `TEXT_PATH` creation ships here.

## 21. Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Callers choose stale/invalid UTF-16 offsets | High without validation | Paired range, exact bounds, surrogate refusal, returned characters |
| Reconstructed segments differ from Figma | Medium | One native call and continuity/content invariant checks |
| Large mixed text overwhelms context | High | `maxSegments`, complete counts, narrower-range recovery |
| Alias enrichment discards write identity | Medium | ID mandatory, name optional |
| Read and later write paint shapes diverge | High without shared ownership | One dependency-neutral canonical serializer |
| Canonical paint reshaping breaks stale readers | Certain for affected callers | Hard-cut migration examples; no parallel branch |
| Pattern source resolution leaks scope | Medium | Existing authorized helper and fail-closed output |
| Unknown future paint variant is silently dropped | Medium | Strict union and pinned parity gate |
| Fixture scarcity is reported as verified behavior | Medium | Separate repository/mock/live evidence and explicit unavailable status |

## 22. Dependencies and exclusions

### Required predecessors

PRD-005 provides result branches, authorized traversal, returned-node selection, paths, properties, and global match caps.

PRD-006 provides the shared native typography-run primitive and exact typography identity types. This release extends that primitive for public serialization rather than duplicating it.

### Optional sibling

PRD-007 is not a product dependency. If installed, styled `boundVariables` preserve aliases independently while filter evidence retains PRD-007’s normalized location semantics.

### Downstream releases

- Range text style/content releases consume returned offsets, characters, font identities, and paint shapes.
- Paint-stack write releases import `PaintInput` and `normalizePaintForRead` for input parity/readback, then add write-only URL/base64 sources and mutation gates in their own scope.
- Image-dimension work adds metadata beside, never inside, the canonical paint union.

### Explicit exclusions

No setter, creator, asset import, image dimension lookup, range mutation, variable mutation, component/instance change, or page lifecycle work belongs here.

## 23. References

- [Umbrella capability-expansion PRD](<../Figma Design Editing Capability Expansion/prd.md>)
- [Scoped Match Discovery predecessor](PRD-005-Scoped-Match-Discovery.md)
- [Typography and Font Discovery predecessor](PRD-006-Typography-and-Font-Discovery.md)
- [Direct Variable-Binding Discovery sibling](PRD-007-Direct-Variable-Binding-Discovery.md)
- [Repository safety contract](../../../SAFETY.md)
- [Contributor and verification guidance](../../../CONTRIBUTING.md)
- [Figma-edit constraints](../../../skills/figma-edit/references/constraints.md)
- [Figma-edit error playbook](../../../skills/figma-edit/references/error-playbook.md)
- [Figma-edit workflows](../../../skills/figma-edit/references/workflows.md)
- [Figma-edit tool-selection guide](../../../skills/figma-edit/references/tool-selection.md)
