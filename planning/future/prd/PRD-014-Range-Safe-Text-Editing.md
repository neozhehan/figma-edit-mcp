# PRD — Range-Safe Text Editing

| Field | Value |
| :- | :- |
| Status | Proposed; implementation not started |
| Release class | Version-unassigned standalone minor release (`v2.x.0`; assign the exact version when scheduled) |
| Standalone extraction/revision | 2026-08-04 |
| Source scope | Capability Expansion Section 5; source-checklist items 5 and 23 |
| Authoritative source | [Future PRD: Figma Design Editing Capability Expansion](../Figma%20Design%20Editing%20Capability%20Expansion/prd.md#5-text-ranges-full-style-surface-and-content-replacement-p0) |
| Required predecessors | [PRD-006 — Typography and Font Discovery](PRD-006-Typography-and-Font-Discovery.md) and [PRD-008 — Styled-Text Read Fidelity](PRD-008-Styled-Text-Read-Fidelity.md) |

## 1. Executive summary

This release expands the two existing text write tools without adding a public tool:

1. `text_set_style` gains one optional half-open UTF-16 range and the complete writable text-property surface in the pinned Figma Plugin API.
2. `text_set_content` keeps its batch-across-distinct-nodes model and adds a strict guarded range branch for replacement, insertion, and deletion.
3. Both tools accept existing `TEXT_PATH` nodes for the exact subset the pinned API supports. This release does not create text paths; it must work with text paths already present in a file whether or not the later creation release has shipped.
4. Every predictable failure—including stale content, an invalid range, an unavailable font, or an unsupported text-path property—is found before the first mutation it can invalidate. Unexpected host failures remain non-transactional and carry exact partial-state evidence.

The canonical discovery step is the bounded styled-segment read delivered by PRD-008. Callers can take a returned segment's `start`, `end`, and `characters` unchanged into these write tools. Text fills consume PRD-008's canonical `PaintInput`/serializer and extend only its IMAGE source with the source-approved URL/base64 write branches; fill readback remains exactly `PaintInput`. This release must not define a second paint family or lossy text-only normalizer.

> [!IMPORTANT]
> This is one independently releasable minor release, not “the text phase” of a larger umbrella release. The exact version remains unassigned until scheduling. Its public tool count is unchanged, its normal whole-node call shapes remain available, and its new branches are not complete until schema, handler, generated bundle, safety documentation, and live Figma evidence agree.

## 2. Release identity and compatibility

- No public tool is added, renamed, or removed.
- `text_set_style` remains a single-target absolute setter. Omitting `start` and `end` selects whole-node behavior; supplying both selects one contiguous range.
- `text_set_content` remains one batch over distinct target nodes. Each item is now exactly one whole-node or ranged branch.
- Existing whole-node inputs remain valid. There is no legacy alias, hidden range array, separate `set_text_range`, or implicit compatibility route.
- `TEXT_PATH` support is additive and applies to existing nodes. Text-path creation belongs to a separate release and is neither bundled nor required here.
- Range indices are UTF-16 code-unit offsets, matching JavaScript strings and Figma's text APIs. They are not Unicode scalar, grapheme-cluster, byte, or visual-cursor indices.
- The plugin remains the trust boundary. MCP schema validation improves first-call correctness but never replaces plugin-side scope, name, lock, type, range, font, and batch checks.
- Both tools retain `idempotentHint: true` and `openWorldHint: true`. An expected-text guard may turn an already-applied retry into a stale-state refusal; it must never apply the mutation twice.
- At scheduling, the assigned minor version must replace the then-current version on every enforced surface: `package.json`, root `package-lock.json`, both `server.json` fields, root `manifest.json`, the plugin About handshake/bundle surface, and every version fixture enforced by `check:versions` or `check:plugin`.
- The public changelog must show whole-node, ranged-style, ranged-replacement, insertion, deletion, stale-text, emoji-boundary, and `TEXT_PATH` examples and state plainly that prevalidation atomicity is not runtime rollback.

## 3. Source identity and requirement mapping

This PRD preserves the source's identifiers so later audits can prove that the umbrella scope was neither dropped nor silently expanded.

| Authoritative source item | Standalone destination |
| :- | :- |
| Source checklist item 5: optional `start`/`end` and full writable style surface | Sections 7–10 |
| Source checklist item 23: range-based `text_set_content` | Sections 11–13 |
| Section 5 style range rules | Sections 7–10 |
| Section 5 content union, guarded replacement, native algorithm, and output | Sections 11–13 |
| Section 5 writable-property matrix, exclusions, `TEXT_PATH`, and acceptance | Sections 8–10 and 20 |
| D8: one range, not a range array | RTE-D1 |
| D9: UTF-16 code-unit indices and no silent rounding | RTE-D1 |
| D16: styled-text reads are a release gate | Sections 6 and 19 |
| D20: guarded half-open content replacement | RTE-D3 |
| D2, D4, D5, and D6: strict branches, readback, complete preflight, repair-bearing errors | RTE-D2 through RTE-D5 |
| Section 16.3 styled-text discovery | Required predecessor PRD-008; Sections 6, 7, and 18 |
| Section 18.1 `PaintInput` and write-ready paint readback | Required predecessor PRD-008; Sections 6, 8, and 10 |
| Section 20 text safety rows and structured errors | Sections 14–15 |
| Schema requirements 1–7, 10, 12, 14, and 18 | Sections 7–15 and 18 |
| Phase 4 text work and Phase 8 synchronization | Sections 17–19 |
| Relevant schema, handler, safety, and live tests | Section 18 |
| Relevant success measures, risks, and provenance | Sections 20–22 |

The source revision history remains at the [authoritative umbrella document](../Figma%20Design%20Editing%20Capability%20Expansion/prd.md#revision-history). This extraction does not rewrite that historical ledger.

## 4. Problem and current repository baseline

At the 2026-08-04 drafting baseline:

- `src/mcp_server/tools/text.ts` publishes only whole-node `text_set_style` fields and whole-node `text_set_content` batch items.
- `figma_plugin/handlers/textHandlers.ts` accepts only `TEXT`, applies a subset of node-level style setters, and has no public range validation or range readback.
- Whole-node content replacement assigns `characters`; that operation can collapse deliberately mixed styled runs.
- The content batch already has important safety behavior that must survive this release: distinct targets, batch-wide target prevalidation, ordered rows, stop-on-first runtime failure, skipped rows, and partial-mutation disclosure when a font changed before character assignment failed.
- Internal font loading uses styled segments, but callers cannot safely compose a partial edit from that internal read. PRD-008 supplies the public, bounded, identity-preserving segment contract this release requires.
- The pinned Figma declarations expose UTF-16 range getters/setters, `insertCharacters`, `deleteCharacters`, asynchronous text/fill-style linkage, and a narrower text-path mixin. The source property matrix follows that declared capability split.

Repository evidence proves only the encoded baseline. It does not prove that every declared setter behaves identically in the live Figma host. This release therefore requires declaration-parity tests and a separate live matrix.

## 5. Goals

1. Let a caller style exactly one contiguous `[start, end)` span without changing styles outside it.
2. Publish every writable text property in the pinned API and map every schema field to one exact whole/range setter path.
3. Replace, insert, or delete exactly one guarded content range while preserving content and styled runs outside it.
4. Reject stale offsets by comparing the exact expected current substring before mutation and again at the item's execution boundary.
5. Reject partial, reversed, out-of-bounds, non-integer, or surrogate-splitting ranges with one-step repair data.
6. Discover, validate, and load every current or requested exact font pair needed by the complete call before the first setter.
7. Accept existing `TEXT_PATH` nodes only for the pinned API-supported subset and refuse the complete request if any supplied field is unsupported.
8. Preserve the existing content-batch result envelope and ordered partial-state rules.
9. Return enough authoritative readback to verify indices, content, fonts, style links, and every requested value without an immediate second read.
10. Keep schema, handler, safety matrix, guides/resources, generated plugin bundle, manifest, version surfaces, and tests synchronized.

## 6. Dependencies and explicit exclusions

### Required predecessors

1. **PRD-006 — Typography and Font Discovery.** This release consumes exact `FontName` pairs, editor-session `AVAILABLE` discovery, candidate ordering, and the `FONT_NOT_AVAILABLE` recovery call. It does not create another font catalog or install/substitute fonts.
2. **PRD-008 — Styled-Text Read Fidelity.** This is a P0 release gate. It supplies:
   - `node_info.styledTextSegments` with bounded UTF-16 `start`/`end`/`characters` evidence for `TEXT` and `TEXT_PATH`;
   - write-ready, identity-preserving read values;
   - the canonical strict `PaintInput` union and `normalizePaintForRead` serializer used by styled/node paint reads and text-fill readback.
3. **Existing safety baseline.** The scheduled branch must retain equivalent scope locking, exact-name verification, locked-ancestor checks, total structured-error handling, duplicate-target rejection, batch prevalidation, ordered batch rows, and partial-mutation vocabulary from the current safety contract.

This release extends that shared paint family into the source-approved write input by permitting IMAGE `URL`, `BASE64`, and `HASH` sources. The later paint/stroke release consumes the resulting shared write schema; neither release may fork it. If either PRD-006 or PRD-008 is absent, behaviorally incomplete, or has drifted from these consumed contracts, implementation is blocked until this PRD is revised. Copying a private subset into this release is not an allowed workaround.

### Explicit non-goals

- No public tool addition, text scan tool, font tool, text-range tool, or selection-based shortcut.
- No multiple-range array on one node. Independently styled ranges require separate `text_set_style` calls; multiple content ranges on one node require separate `text_set_content` calls.
- No Unicode grapheme-cluster segmentation or silent rounding. The contract prevents surrogate-pair splits only.
- No text-path creation, path-geometry editing, or source-path conversion. A later creation PRD may depend on this release; this release does not depend on it.
- No text-range variable-binding setter. `node_bind_variable` remains the variable-binding surface.
- No write support for read-only `fontWeight`, `fontStyle`, `openTypeFeatures`, `textStyleOverrides`, or computed mixed values.
- No movement of `characters` into `text_set_style`.
- No implicit font fallback, nearby-font substitution, or font installation in a new/ranged branch.
- No general transaction, document lock, rollback engine, or promise that a later runtime/TOCTOU failure cannot leave earlier accepted batch rows applied.
- No second paint grammar, text-only paint normalizer, fill-stack index patch, or silent paint-field stripping.
- No unrelated paint/stroke node setter, image metadata, text creation, layout, or transform work.

## 7. Product decisions

### RTE-D1 — One paired UTF-16 half-open range

`text_set_style` accepts `start` and `end` together or neither. A ranged style call requires:

```ts
0 <= start < end <= node.characters.length
```

`text_set_content` uses the same coordinate system, but permits `start === end` for insertion:

```ts
0 <= start <= end <= node.characters.length
```

Both indices are finite non-negative integers. A boundary is invalid when it falls between the high and low surrogate code units of one UTF-16 pair. The plugin returns the nearest valid lower and upper boundaries and never rounds for the caller. Combining marks, zero-width joiner sequences, and other multi-code-point graphemes may still be split; that limitation is documented rather than hidden.

An empty text node cannot receive a style range. It can receive a whole-node style call and a ranged-content insertion at `[0, 0)`.

### RTE-D2 — `text_set_style` is one strict at-least-one-mutation schema

Conceptually, the emitted input contract is:

```ts
type FontNameInput = {
  family: string; // non-empty
  style: string;  // non-empty
};

type LengthInput = {
  value: number; // finite
  unit: "PIXELS" | "PERCENT";
};

type AutoLengthInput =
  | { unit: "AUTO" }
  | LengthInput;

type HyperlinkInput =
  | { type: "URL" | "NODE"; value: string }
  | null;

type TextListOptionsInput = {
  type: "NONE" | "ORDERED" | "UNORDERED";
};

type TextDecorationColorInput =
  | { value: "AUTO" }
  | { value: SolidPaintInput };

type ImageSourceInput =
  | { kind: "URL"; url: string }
  | { kind: "BASE64"; bytesBase64: string }
  | { kind: "HASH"; imageHash: string };

type CanonicalPaintInput = PaintInput; // imported from PRD-008

type TextPaintInput =
  | Exclude<CanonicalPaintInput, { type: "IMAGE" }>
  | (Omit<Extract<CanonicalPaintInput, { type: "IMAGE" }>, "source"> & {
      source: ImageSourceInput;
    });

type SolidPaintInput = Extract<CanonicalPaintInput, { type: "SOLID" }>;

type TextSetStyleInput = {
  nodeId: string;
  nodeName: string;
  start?: number; // paired; inclusive UTF-16 offset
  end?: number;   // paired; exclusive UTF-16 offset

  fontName?: FontNameInput;
  fontSize?: number;
  textCase?: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS" | "SMALL_CAPS_FORCED";
  letterSpacing?: LengthInput;
  hyperlink?: HyperlinkInput;
  fills?: TextPaintInput[];
  textStyleId?: string | null;
  fillStyleId?: string | null;

  textDecoration?: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
  textDecorationStyle?: "SOLID" | "WAVY" | "DOTTED";
  textDecorationOffset?: AutoLengthInput;
  textDecorationThickness?: AutoLengthInput;
  textDecorationColor?: TextDecorationColorInput;
  textDecorationSkipInk?: boolean;
  lineHeight?: AutoLengthInput;
  listOptions?: TextListOptionsInput;
  listSpacing?: number;
  indentation?: number;
  paragraphIndent?: number;
  paragraphSpacing?: number;

  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
  textAutoResize?: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT";
  textTruncation?: "DISABLED" | "ENDING";
  maxLines?: number | null;
  hangingPunctuation?: boolean;
  hangingList?: boolean;
  leadingTrim?: "NONE" | "CAP_HEIGHT";
  autoRename?: boolean;
};
```

The TypeScript notation is explanatory; the registered MCP schema is authoritative and must enforce all of the following:

- Every object, including `FontNameInput`, length objects, hyperlink targets, list options, decoration colors, and every nested `TextPaintInput`, is strict. Unknown keys fail rather than being stripped.
- `nodeId`, `nodeName`, font family/style, hyperlink values, and non-null style IDs are non-empty strings.
- At least one writable property is required. `nodeId`, `nodeName`, and a range alone do not form a mutation.
- `start` and `end` are both present or both absent; the emitted JSON Schema and descriptions make that pairing visible.
- `fontSize` is finite and at least `1`.
- All numeric style values are finite. `listSpacing` and `indentation` are non-negative. `maxLines` is either `null` or an integer at least `1`.
- `fills` is an ordered complete array for the addressed text span and may be empty to clear. Every non-IMAGE branch is exactly PRD-008 `PaintInput`; IMAGE changes only `source` to the strict source-approved `URL`/`BASE64`/`HASH` union above. URL, base64, and hash strings are non-empty. Readback always normalizes IMAGE to the canonical `PaintInput` `HASH` branch. No broader `unknown` paint escape hatch is allowed.
- `textStyleId: null` and `fillStyleId: null` are the public unlink forms. The plugin may translate them to the pinned API's empty-ID clearing call, but output normalizes an unlinked value back to `null`.
- Deprecated `textAutoResize: "TRUNCATE"` is rejected and the error directs the caller to `textTruncation` plus `maxLines` where appropriate.

### RTE-D3 — Content replacement is a guarded strict union

The emitted `text_set_content.text[]` item contract is exactly one of:

```ts
type WholeTextContentItem = {
  nodeId: string;
  nodeName: string;
  characters: string;
};

type RangedTextContentItem = {
  nodeId: string;
  nodeName: string;
  start: number;
  end: number;
  expectedText: string;
  characters: string;
  inheritStyleFrom?: "BEFORE" | "AFTER";
};

type TextContentItem = WholeTextContentItem | RangedTextContentItem;
```

The registered schema is a strict visible `oneOf` or equivalent mutually exclusive union:

- The array is non-empty.
- Every nested item is strict.
- The ranged branch requires `start`, `end`, and `expectedText` together.
- The whole branch forbids `start`, `end`, `expectedText`, and `inheritStyleFrom`.
- The ranged branch requires integer offsets and permits `start === end`.
- Duplicate normalized node IDs are forbidden across the complete batch. Dash- and colon-form equivalents count as the same target.
- A node may therefore receive at most one range in one batch. Callers use separate calls for dependent edits so each next offset is based on the previous authoritative result.

Immediately before font loading or mutation, `expectedText` must equal `node.characters.slice(start, end)` code-unit-for-code-unit. The same comparison is repeated at the item's execution boundary to catch shared-document drift after batch preflight. There is no case folding, normalization, trimming, or line-ending rewrite.

Content semantics are:

- `start < end`, non-empty `characters`: replace.
- `start < end`, `characters === ""`: delete.
- `start === end`, non-empty `characters`: insert.
- `start === end`, `characters === ""`: successful no-op.
- A whole or ranged replacement whose exact resulting text already equals the original may return `noOp: true` without crossing a setter.
- `inheritStyleFrom` is forbidden unless non-empty characters are inserted.
- When omitted, inheritance is `BEFORE` if `start > 0`, otherwise `AFTER`; an empty node uses its node-level text style.
- An explicitly selected missing side is a pre-mutation error. At `start === 0` only `AFTER` is available when existing text follows; at `start === length` only `BEFORE` is available when existing text precedes. On an empty node neither neighbor is available, so explicit `inheritStyleFrom` is refused and omission selects the node-level style.
- Inserted content receives one neighboring style. The tool does not infer or recreate multiple styles from the removed span. A caller that wants deliberate mixed styling follows with `text_set_style`.

For a non-empty insertion or replacement, call `insertCharacters(start, characters, useStyle)` first while the selected neighboring style still exists. If the original range was non-empty, delete the shifted original range:

```ts
[start + characters.length, end + characters.length)
```

A pure deletion calls `deleteCharacters(start, end)`. An insertion has no zero-width delete step. Rebuilding and assigning the complete string is forbidden for ranged items because it destroys unaffected styled runs.

### RTE-D4 — Complete preflight precedes mutation; runtime failure remains non-transactional

For `text_set_style`, resolve and validate the target, range, property compatibility, style assets, paints, cross-field state, every required font, and the full setter plan before the first setter.

For `text_set_content`, perform those checks for every item before item one:

1. normalize and deduplicate IDs;
2. resolve every node;
3. apply the existing permission, scope, exact-name, locked-ancestor, and type checks;
4. validate every range, surrogate boundary, expected substring, and inheritance side;
5. discover, validate, and load every exact font pair needed by every whole/range operation;
6. snapshot the original full text and the planned affected range for every item.

A predictable failure in item N aborts the complete command before item one mutates. Once execution begins, items run sequentially. A runtime or TOCTOU failure stops the batch: prior rows remain `success`, the failing row is `failed`, and later rows are `skipped`. This is prevalidation atomicity, not transactional rollback.

Before each item's first setter, recheck the target's existence, identity/name, type, lock/scope state, range bounds, surrogate boundaries, and expected substring. A recheck failure can therefore produce an incomplete batch after earlier rows succeeded, but it cannot mutate the drifting item.

For `text_set_style`, snapshot every requested value before applying the deterministic setter plan. Link setters (`textStyleId`, then `fillStyleId`) run before literal direct setters, so direct fields are final. Every remaining setter runs in the property-matrix order in Section 8. An unexpected later failure preserves the initiating error and adds `details.partialMutation: true` only when authoritative readback proves a requested value changed; details include `whatChanged`, complete requested-field `before` values, and exact readable resulting values. The tool never labels a partially applied style call as success.

For ranged content, insert-before-delete intentionally biases a rare second-step failure toward duplicated content rather than silent loss of the original. Such a row must contain `partialMutation: true`, a plain-language `whatChanged`, the original full text, original range, replaced substring, inserted substring/range, and the exact resulting full text. Existing whole-node font-before-character failure evidence remains at least as strong as the current contract. Partial evidence is never replaced by a clean generic error, and telemetry/reporting failure cannot erase the mutation result.

### RTE-D5 — Every success is read back; every refusal is a repair instruction

No success payload is a bare boolean. The handler reads the actual target after mutation and returns the requested resulting values, content ranges, exact lengths, and loaded font pairs. Paints use PRD-008's write-ready serializer; linked style IDs normalize an unlinked state to `null`.

Every new predictable refusal uses a stable central code, retains machine-usable details, and names the exact read or corrected call needed next. Unreadable arbitrary throws continue through the repository's canonical total-error fallback without discarding independently captured partial-mutation evidence.

## 8. Complete writable property and setter matrix

`TEXT_PATH` columns below refer to pre-existing text-path nodes as well as any created by a later release. “No” means the complete request is rejected before any “Yes” property in that request is changed.

| Property | Whole `TEXT` | Range `TEXT` | Whole `TEXT_PATH` | Range `TEXT_PATH` | Canonical input / setter note |
| :- | :-: | :-: | :-: | :-: | :- |
| `fontName` | Yes | Yes | Yes | Yes | Exact `{ family, style }`; load before write; node property / `setRangeFontName` |
| `fontSize` | Yes | Yes | Yes | Yes | Finite `>= 1`; node property / `setRangeFontSize` |
| `textCase` | Yes | Yes | Yes | Yes | Exact pinned enum; node property / `setRangeTextCase` |
| `letterSpacing` | Yes | Yes | Yes | Yes | Pixels or percent; node property / `setRangeLetterSpacing` |
| `hyperlink` | Yes | Yes | Yes | Yes | URL/NODE target or `null`; node property / `setRangeHyperlink` |
| `fills` | Yes | Yes | Yes | Yes | PRD-008 `PaintInput[]`; `[]` clears; node fills / `setRangeFills` |
| `textStyleId` | Yes | Yes | Yes | Yes | Non-empty ID or `null`; async whole/range setter under dynamic-page access |
| `fillStyleId` | Yes | Yes | Yes | Yes | Non-empty ID or `null`; async whole/range setter under dynamic-page access |
| `textDecoration` | Yes | Yes | No | No | `NONE`/`UNDERLINE`/`STRIKETHROUGH`; property / `setRangeTextDecoration` |
| `textDecorationStyle` | Yes | Yes | No | No | `SOLID`/`WAVY`/`DOTTED`; property / range setter |
| `textDecorationOffset` | Yes | Yes | No | No | `AUTO`, pixels, or percent; property / range setter |
| `textDecorationThickness` | Yes | Yes | No | No | `AUTO`, pixels, or percent; property / range setter |
| `textDecorationColor` | Yes | Yes | No | No | `AUTO` or exactly one canonical solid paint; property / range setter |
| `textDecorationSkipInk` | Yes | Yes | No | No | Boolean; property / range setter |
| `lineHeight` | Yes | Yes | No | No | `AUTO`, pixels, or percent; property / `setRangeLineHeight` |
| `listOptions` | Yes | Yes | No | No | `{ type: "NONE" | "ORDERED" | "UNORDERED" }`; property / range setter |
| `listSpacing` | Yes | Yes | No | No | Finite non-negative number; property / range setter |
| `indentation` | Yes | Yes | No | No | Finite non-negative value accepted by pinned Figma API; property / range setter |
| `paragraphIndent` | Yes | Yes | No | No | Finite number; property / range setter |
| `paragraphSpacing` | Yes | Yes | No | No | Finite number; property / range setter |
| `textAlignHorizontal` | Yes | No | Yes | No | `LEFT`/`CENTER`/`RIGHT`/`JUSTIFIED`; node-only property |
| `textAlignVertical` | Yes | No | Yes | No | `TOP`/`CENTER`/`BOTTOM`; node-only property |
| `textAutoResize` | Yes | No | No | No | `NONE`/`WIDTH_AND_HEIGHT`/`HEIGHT`; node-only; deprecated `TRUNCATE` rejected |
| `textTruncation` | Yes | No | No | No | `DISABLED`/`ENDING`; node-only |
| `maxLines` | Yes | No | No | No | Integer `>= 1` or `null`; node-only |
| `hangingPunctuation` | Yes | No | No | No | Boolean; node-only |
| `hangingList` | Yes | No | No | No | Boolean; node-only |
| `leadingTrim` | Yes | No | No | No | `NONE`/`CAP_HEIGHT`; node-only |
| `autoRename` | Yes | No | Yes | No | Boolean; node-only |

The handler and schema use one shared checked inventory for this table. Every published field must have exactly one supported execution path for each “Yes” cell; every handler path must be published; every “No” cell must have a direct negative test. A distant occurrence of the same property name is not sufficient parity evidence.

### Explicit exclusions from the style schema

- `fontWeight` and `fontStyle` are read-only Plugin API values. Select an exact `fontName.style` instead.
- `openTypeFeatures`, `textStyleOverrides`, and computed mixed values have no general setter in the pinned API.
- `characters` belongs only to `text_set_content`.
- Variable binding belongs only to `node_bind_variable`.

## 9. Cross-field and effective-state rules

All cross-field rules are evaluated against the effective resulting state after merging supplied values with current target values, but before any setter:

1. Decoration detail fields require `textDecoration: "UNDERLINE"` in the call or an addressed span that is already uniformly underlined. A mixed or non-underlined span is not treated as underlined.
2. `maxLines` is permitted only when the effective `textTruncation` is `ENDING`. If the call would leave truncation disabled, return the required companion field in the correction.
3. With effective `textAutoResize: "HEIGHT"` or `"WIDTH_AND_HEIGHT"`, ending truncation must have an effective positive `maxLines` or an already established finite `maxHeight`; otherwise the request is ineffective and is rejected. `textAutoResize: "NONE"` may truncate against the fixed box with `maxLines: null`.
4. `textAutoResize: "TRUNCATE"` is never accepted, even if a stale client bypasses MCP validation.
5. `textStyleId` and direct fields may coexist. Apply link IDs first and direct fields second; direct fields therefore express the final requested values, and output discloses whether the style/fill link survived Figma's normalization.
6. `fills` uses the complete ordered canonical array. Unknown paint keys, invalid branches, unresolved aliases/assets, or a lossy serializer fail before any text setter.
7. A range containing any node-only property is rejected as one complete request. The error returns the exact supplied node-only fields and the accepted range-capable field list.
8. A `TEXT_PATH` request containing any unsupported field is rejected as one complete request. Compatible fields in the same call must remain unchanged.

## 10. Font preflight, application, and style readback

Before the first setter, the handler must:

1. Determine the exact affected span: the whole character string or supplied range.
2. Read every distinct current `{ family, style }` pair in that span through the native segment/range APIs.
3. Add every pair required by a supplied `fontName`, resolved `textStyleId`, and any existing field whose setter requires its font to be loaded.
4. Validate requested pairs against PRD-006's live editor-session availability semantics.
5. Load every pair, deduplicated in deterministic first-use order, for the complete call (or complete content batch).

For ranged content, include fonts in the removed/affected range and the selected inheritance side. An empty-node insertion loads the node-level font. A whole content replacement retains its established public behavior but may not use a new silent fallback to make an unavailable exact pair appear successful.

`FONT_NOT_AVAILABLE` returns:

- the exact requested or required `{ family, style }` pair;
- exact available styles in that family;
- bounded close-family candidates using PRD-006's ordering;
- the complete recovery call `page_info({ fontDiscovery: { source: "AVAILABLE", query: <family> } })`;
- a complete corrected write only when one correction is unambiguous.

No setter runs if any required font cannot be validated or loaded. A host font-load rejection retains its exact origin message inside the structured error; the handler does not relabel it as success or substitute Inter/another style.

`text_set_style` success returns:

```ts
{
  success: true;
  nodeId: string;
  nodeName: string;
  nodeType: "TEXT" | "TEXT_PATH";
  mode: "WHOLE" | "RANGE";
  appliedRange: { start: number; end: number }; // whole span for WHOLE
  characterLength: number;
  loadedFonts: FontNameInput[];
  resultingValues: Record<RequestedPropertyName, CanonicalReadbackValue>;
}
```

`resultingValues` contains every and only requested mutation property. Values follow the public input shapes where possible: paint values use PRD-008 `PaintInput` (so imported URL/base64 images read back as `HASH`), unlinked style IDs are `null`, and no raw `figma.mixed` sentinel crosses the MCP boundary. A requested property that cannot be read back exactly after the setter prevents a success claim and follows the partial-state error contract.

## 11. `text_set_content` batch contract

The top-level output retains the existing canonical batch envelope:

```ts
{
  success: boolean;
  status: "success" | "partial_success" | "failed";
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  results: TextContentResultRow[]; // exactly one per input, input order
}
```

`success` is true exactly when `status === "success"`. Counts reconcile exactly to `requestedCount`. Every accepted call produces one ordered row per input. Failed and skipped rows retain the repository's shared non-empty actionable `error` and structured `details` vocabulary. This PRD does not rename or weaken that shared envelope.

Each success row is:

```ts
{
  success: true;
  status: "success";
  nodeId: string;
  nodeName: string;
  mode: "WHOLE" | "RANGE";
  replacedRange: { start: number; end: number };
  insertedRange: { start: number; end: number };
  originalText: string;
  replacedText: string;
  characters: string;
  resultingText: string;
  resultingLength: number;
  inheritStyleFrom?: "BEFORE" | "AFTER";
  noOp: boolean;
}
```

For a whole-node item, `replacedRange` is `[0, originalText.length)`, `insertedRange` is `[0, characters.length)`, and `replacedText === originalText`. For a ranged item, both ranges use the original `start`; the inserted end is `start + characters.length`. `inheritStyleFrom` is present only when non-empty inserted content inherited from an actual neighboring side. An empty-node node-style insertion omits it.

## 12. Content mismatch and recovery contract

`TEXT_RANGE_CONTENT_MISMATCH` is raised before font loading or mutation when the guarded substring is stale. Its details include:

```ts
{
  nodeId: string;
  nodeName: string;
  start: number;
  end: number;
  expectedText: string;
  actualText: string;
  currentLength: number;
  contextBefore: string; // bounded
  contextAfter: string;  // bounded
  retryItem: RangedTextContentItem; // same intent, observed expectedText
  discoveryCall: {
    tool: "node_info";
    arguments: {
      nodeIds: string[];
      properties: ["characters"];
      maxDepth: 0;
    };
  };
}
```

The retry item is offered as mechanical recovery evidence, not permission to accept a potentially wrong offset. The message tells the caller to use the named `node_info` call when surrounding context suggests the intended text moved. Context bounds are one shared documented constant, asserted in tests, and may not expose an unbounded document string.

## 13. Partial-state rules for content mutation

After accepted execution begins:

- A failure before an item's first setter is clean for that item. Prior success rows remain committed; later rows are skipped.
- A non-empty ranged replacement that inserts successfully and then fails to delete the shifted original is `failed` with `partialMutation: true`. The original survives alongside the insertion; the exact `resultingText` must prove that state.
- A delete/insert setter that throws after changing text is classified by authoritative readback, not by promise/throw shape alone.
- A whole-node content path retains any stronger existing disclosure, including a changed-font snapshot when font mutation preceded failed character assignment.
- No failure row claims rollback unless readback proves the original text and requested style state were restored.
- Callers must reconcile a partial row before retrying it. Ordinary failed/skipped rows can be retried only after accounting for prior successes and refreshing offsets/names where the error instructs.

Required ranged partial evidence is:

```ts
{
  partialMutation: true;
  whatChanged: string;
  before: {
    originalText: string;
    replacedRange: { start: number; end: number };
    replacedText: string;
  };
  insertedRange: { start: number; end: number };
  characters: string;
  resultingText: string;
}
```

The initiating host/structured error remains primary. Secondary readback or reporting failures cannot overwrite it or silently erase known mutation evidence.

## 14. Safety and permission contract

The following plugin-side gates are mandatory in addition to schema validation:

| Tool branch | Required controls before mutation |
| :- | :- |
| `text_set_style` whole/range | Existing node-write permission and connected-scope checks; exact `nodeName`; locked target/ancestor refusal; exact `TEXT`/`TEXT_PATH` type; paired UTF-16 range; full property/type matrix; cross-field state; paint/style/font resolution; complete setter-plan preflight |
| `text_set_content` whole/range | Existing whole-batch node-write stack; normalized unique targets; exact names; locked target/ancestor refusal; exact `TEXT`/`TEXT_PATH` type; whole/range union; UTF-16 bounds; exact guarded substring; inheritance and all-font preflight for every item before item one |

These are property writes, not structural edits. This release introduces no new instance-interior or scope-root prohibition beyond the existing text-write policy. It also introduces no authority over current selection or current page. Node IDs and names come from explicit `page_info`/`node_info` reads and names are passed back verbatim.

The plugin repeats every strict branch and cross-field rule even if the MCP schema already rejected it. No schema transform may strip an unknown or incompatible field and then forward a smaller successful call.

## 15. Structured error taxonomy

The final central taxonomy may share a code for causes with identical recovery, but it must retain at least the following distinguishable conditions and detail operands:

| Required code/condition | Minimum repair-bearing details |
| :- | :- |
| `TEXT_RANGE_INCOMPLETE` | Supplied/missing boundary names and complete corrected branch shape |
| `TEXT_RANGE_INVALID` | Node ID/name, current length, supplied start/end, valid inequality, nearest bounded call where meaningful |
| `TEXT_RANGE_SPLITS_SURROGATE` | Which boundary failed, supplied offset, nearest valid lower/upper offsets, current length |
| `TEXT_RANGE_EMPTY_STYLE` | Empty-node identity and instruction to omit the range or insert content first |
| `TEXT_RANGE_CONTENT_MISMATCH` | Complete Section 12 payload |
| `TEXT_RANGE_INHERITANCE_UNAVAILABLE` | Requested side, start/end/current length, available side or node-style omission rule, corrected item |
| `TEXT_RANGE_PROPERTY_UNAVAILABLE` | Supplied node-only fields, accepted range-capable fields, corrected whole/range alternatives |
| `TEXT_PATH_PROPERTY_UNAVAILABLE` | Target identity, unsupported supplied fields, exact accepted `TEXT_PATH` fields, corrected call |
| `FONT_NOT_AVAILABLE` | Exact pair, same-family styles, bounded close families, discovery call, unambiguous corrected write if one exists |
| `TEXT_STYLE_STATE_INVALID` | Failed decoration/truncation/auto-resize condition, observed effective state, accepted combinations, corrected fields |
| `TEXT_PAINT_INVALID` | Exact nested path, paint discriminator/accepted values, PRD-008-compatible corrected shape |
| `TEXT_UNSUPPORTED_TARGET` | Observed node type and discovery call for the intended node |

Example:

```ts
{
  code: "TEXT_RANGE_SPLITS_SURROGATE",
  message: "text_set_style start=5 splits a UTF-16 surrogate pair in 'Title'. Use start=4 or start=6 and retry.",
  details: {
    nodeId: "10:24",
    boundary: "start",
    suppliedOffset: 5,
    lowerBoundary: 4,
    upperBoundary: 6
  }
}
```

All codes are defined in the server and plugin canonical registries with parity tests. A predictable new refusal may not fall through to an uncoded prose error. Existing generic scope/name/lock codes remain authoritative and are not duplicated under text-specific names.

## 16. Implementation ownership and files

| Area | Primary files / artifact families | Required work |
| :- | :- | :- |
| MCP contracts | `src/mcp_server/tools/text.ts`, shared schema/output helpers | Strict style schema, whole/range content union, exact outputs, descriptions, annotations, duplicate normalization |
| Canonical shared inputs | PRD-006 font contract and PRD-008 styled-text/`PaintInput` modules | Import/reuse exact pairs, paint schemas, and `normalizePaintForRead`; extend only IMAGE write sources in the same shared family |
| Plugin execution | `figma_plugin/handlers/textHandlers.ts`, `figma_plugin/utils/textUtils.ts` | Complete preflight plans, UTF-16 helper, font loading, whole/range setters, native insert/delete algorithm, readback, partial evidence |
| Dispatcher/trust boundary | `figma_plugin/src/main.ts` and existing permission/batch validators | Admit `TEXT_PATH`, preserve exact-name/scope/lock gates, validate complete batch before handler mutation |
| Structured errors | `src/shared/errorCodes.ts`, `figma_plugin/utils/errors.ts`, MCP error boundary/playbook tests | Add canonical codes/factories, server/plugin parity, total arbitrary-throw handling |
| Safety/docs | `SAFETY.md`, `README.md`, `skills/figma-edit/references/{constraints,error-playbook,workflows,tool-selection}.md`, `CHANGELOG.md` | Range discovery/action/recovery, full matrix, batch/partial rules, whole-vs-range and text-vs-text-path selection |
| Generated/release artifacts | `figma_plugin/code.js`, generated tool manifest/root manifest, version surfaces | Regenerate through repository scripts; never hand-edit generated output |
| Tests | `src/mcp_server/tests/unit/tools/*`, `src/mcp_server/tests/unit/figma_plugin/*`, safety/resource/generated/version suites, live verifier | Section 18 matrix and exact red proofs |

The implementation may factor internal helpers, but a refactor cannot broaden this PRD. Any new shared file must have one owner, direct tests, and no duplicate range/paint/font definition.

## 17. Implementation plan

### Phase 0 — Scheduled-baseline and dependency gate

- [ ] Assign the standalone minor version and record the scheduled repository/plugin/pinned-typings baseline.
- [ ] Prove PRD-006 exact-pair availability/candidate behavior is merged and green.
- [ ] Prove PRD-008 styled-segment fields, UTF-16 boundaries, `TEXT_PATH` restrictions, `PaintInput`, and write-ready readback are merged and green.
- [ ] Revalidate every “Yes” and “No” matrix cell against the scheduled pinned declarations; any drift requires a reviewed PRD revision, not a silent test change.
- [ ] Record clean focused/full/type/generated/bundle/version baselines and obtain explicit human approval before implementation.

### Phase 1 — Contract and central errors

- [ ] Implement the strict at-least-one style schema and visible paired range.
- [ ] Implement the strict whole/range content `oneOf`, required `expectedText`, and normalized duplicate-target refusal.
- [ ] Publish strict success outputs and preserve the shared batch envelope.
- [ ] Add the central structured codes/factories and server/plugin parity tests before handler use.
- [ ] Add a shared checked property/method/type matrix consumed by schema/handler parity tests.

### Phase 2 — Style preflight and execution

- [ ] Add UTF-16 boundary and range helpers with exact repair details.
- [ ] Resolve current values, styles, paints, effective cross-field state, and all required fonts before mutation.
- [ ] Implement every whole/range `TEXT` setter and exact readback.
- [ ] Implement only the supported `TEXT_PATH` cells and atomic unsupported-property refusal.
- [ ] Enforce link-before-direct ordering and unexpected-setter partial-state disclosure.

### Phase 3 — Guarded content execution

- [ ] Build every item plan and load every batch font before item one.
- [ ] Recheck mutable state at each item's execution boundary.
- [ ] Implement native insertion, shifted-original deletion, pure deletion, empty insertion, and no-op paths.
- [ ] Preserve one ordered row per accepted input and stop/skip behavior after the first runtime failure.
- [ ] Implement exact stale-text and insert-before-delete partial evidence.

### Phase 4 — Contract synchronization and versioning

- [ ] Update `SAFETY.md`, README, tool descriptions, all four skill/resource guides, and public changelog examples.
- [ ] Regenerate the tool manifest and committed plugin bundle; do not hand-edit them.
- [ ] Update the assigned minor version on every enforced surface.
- [ ] Update registered-tool/schema/output/safety matrices without changing public tool count.

### Phase 5 — Verification and release closure

- [ ] Run the complete repository and red-proof matrices in Section 18.
- [ ] Run the dedicated-file live matrix after the final plugin build; do not rebuild during the bound session.
- [ ] Separate repository/mock, injected-fault, and live-host evidence in the release record.
- [ ] Reconcile the live document to its opening state and record exact counts.
- [ ] Release only when every non-live acceptance item is green and any unavailable live fixture is labeled honestly.

## 18. Verification requirements

### Emitted-schema and registered-boundary tests

- Snapshot the emitted `tools/list` schemas and exercise the actual registered callbacks, not only local Zod objects.
- Prove every top-level/nested unknown key fails without stripping.
- Prove `text_set_style` requires at least one writable field and accepts either no range or both boundaries, never a partial pair.
- Prove `text_set_content` emits mutually exclusive whole/range branches; range requires `expectedText`; whole forbids every range field.
- Prove integer/range-independent numeric bounds, non-empty identities, exact enums, nullable link IDs, `maxLines`, and `TRUNCATE` rejection.
- Prove dash/colon duplicate targets collide and no duplicate node range enters a batch.
- Prove the complete matrix in both directions: remove one schema field and the parity test fails; add a handler-only setter and it fails; flip one type/range support cell and it fails.
- Prove `fills` and decoration color reference PRD-008's canonical paint schema/serializer, the write extension changes only IMAGE source, and no copied permissive branch exists.
- Prove both tools retain their annotations and the total registered tool count is unchanged.
- Prove strict output schemas accept the exact style/content success rows and reject missing/miscounted/extra contradictory fields.

### Plugin handler and adversarial tests

- Cover every “Yes” matrix cell through its exact whole/range setter and authoritative readback; cover every “No” cell with zero mutation.
- Cover uniform, mixed, empty, and missing-font `TEXT`; pre-existing `TEXT_PATH`; exact supported subsets; and a mixed compatible/incompatible text-path call.
- Cover style range start/end at zero, middle, full length, empty range refusal, out-of-bounds/reversed/non-integer values, and both surrogate boundaries.
- Cover decoration prerequisites, style-link/direct-field ordering, fill-link/direct-fill ordering, truncation/max-line/resize combinations, and deprecated `TRUNCATE`.
- Cover exact requested/current/style-derived font pairs, one-load-per-pair deduplication, all-fonts-before-setter ordering, unavailable candidates, load failures, and no fallback.
- Cover guarded replacement, insertion at beginning/middle/end/empty node, deletion, empty no-op, identical replacement no-op, default/explicit inheritance, and unavailable sides.
- Prove stale `expectedText` returns exact bounded context/retry/discovery details and makes zero font-load or setter calls.
- Prove one invalid batch item makes zero mutation across the whole batch.
- Inject shared-document drift after preflight for an early and later item; prove the drifting item is clean, prior rows remain truthful, and later rows skip.
- Inject every style setter failure after at least one earlier setter and assert exact before/resulting partial evidence.
- Inject ranged insert success followed by delete failure and prove the exact duplicate-content result, partial flag, original evidence, counts, and skipped rows.
- Inject pure-delete/insert throws before and after durable state change and classify from readback, not the throw alone.
- Preserve the existing whole-content changed-font-before-character-failure regression and batch envelope.
- Exercise hostile thrown values/getters/stringification through the real registered boundary; coded errors remain coded and unreadable values become only the canonical fallback without losing partial evidence.
- Prove progress/telemetry and result serialization failures cannot erase a known mutation outcome.

### Safety and documentation contract tests

- Bidirectionally diff registered write tools/branches against the `SAFETY.md` rows.
- Prove scope, exact name, locked ancestor, target type, duplicate target, and complete batch prevalidation at the real dispatcher/handler boundary.
- Prove no handler reads `figma.currentPage.selection` or acquires an implicit current-page target.
- Prove property writes do not accidentally inherit structural instance-interior restrictions or bypass existing text-write gates.
- Prove every new code exists in both canonical registries, has a playbook entry, preserves `details`, and has one-step recovery guidance.
- Prove tool descriptions distinguish whole versus range, style versus content, UTF-16 versus grapheme indices, text versus text path, used versus available fonts, and literal fills versus shared fill styles.
- Prove MCP resources serve the updated guide text.

### Regression red-proofing

Deliberately break each protected production/contract line, record the named failing test and exact count, restore it, and rerun green. At minimum red-proof:

1. paired `start`/`end` enforcement;
2. surrogate-boundary rejection;
3. required `expectedText` and code-unit comparison;
4. normalized duplicate-target rejection;
5. all-items-before-item-one content preflight;
6. all-fonts-before-first-setter ordering and no requested-font fallback;
7. insert-before-delete order;
8. partial-mutation evidence after shifted-original delete failure;
9. one representative range-capable setter and one node-only range refusal;
10. one supported and one unsupported `TEXT_PATH` matrix cell;
11. PRD-008 paint identity, strict IMAGE-source extension, and canonical readback preservation;
12. style-link-before-direct-field ordering;
13. exact requested-property readback;
14. generated plugin bundle freshness.

A test that stays green before and after the protected line is broken is not a regression guard. Keep confounding distant occurrences intact so the red result proves locality.

### Live Figma Design matrix

Use a dedicated Design file and a fresh channel:

1. Record repository/package/plugin versions, tool inventory, channel/file identity, permission scope, pinned typings, and opening node/artifact counts.
2. Discover with `page_info`, then `node_info`; pass every target name back verbatim.
3. Use PRD-008 styled segments to select a mixed-font/mixed-fill span and pass its `start`, `end`, and `characters` unchanged into ranged style/content calls.
4. Style only the selected span; cover representative font, fill, link, decoration, paragraph/list, and style-ID families and verify unaffected surrounding runs.
5. Exercise guarded replacement, insertion, and deletion; verify exact output ranges, resulting content, and preserved outside runs.
6. Exercise a stale `expectedText` refusal and both sides of an emoji surrogate-boundary refusal with zero mutation.
7. Exercise mixed-font preloading and one genuinely unavailable requested font; verify no substitution.
8. Exercise an existing `TEXT_PATH` through every supported method family and one unsupported-property atomic refusal. Do not create the fixture through unreleased scope.
9. Exercise whole-node calls for the pre-existing public fields to verify compatibility.
10. Read every changed target back with `node_info`/styled segments and, where useful, a visual export.
11. Restore or remove disposable changes and reconcile the exact opening state.

If a real `TEXT_PATH`, missing-font, or specific host-normalization fixture is unavailable, record that row as `fixture-unavailable`. Hermetic mocks and declaration parity prove only the encoded contract; they are not live Figma evidence.

### Repository and release gates

Run and record at minimum:

- focused schema, registered-boundary, plugin-handler, safety, resource, output, and generated-artifact tests;
- the full test suite;
- `bun run gen:manifest` followed by a clean generated-manifest diff;
- `bun run build:all`;
- `bun run check:plugin`;
- `bun run check:generated`;
- `bun run check:versions`;
- `bun run check:types:plugin`;
- `bun run check:types:scripts`;
- `bun run check:suppressions`;
- `git diff --check`.

Record exact pass/fail counts. A green bundle gate before rebuilding source changes is not post-change evidence.

## 19. Documentation and release deliverables

The release updates, in the same change:

- tool titles/descriptions and emitted schemas;
- `SAFETY.md` gate rows and residual-risk language;
- README tool surface and before/after examples;
- constraint, error-playbook, workflow, and tool-selection skill files, which also back `figma-edit://guide/*` resources;
- public `CHANGELOG.md` with the assigned version and migration examples;
- generated tool manifest and `figma_plugin/code.js`;
- all version surfaces and their fixtures.

Guides must teach this workflow:

1. discover the exact node and name;
2. request only the styled fields needed from PRD-008;
3. choose a segment/range in UTF-16 units;
4. use `text_set_style` for formatting or guarded `text_set_content` for content;
5. reconcile any partial evidence before retrying;
6. use returned readback to plan the next dependent range.

The documentation must not say “atomic” without the qualifier “predictable prevalidation before mutation.” It must not imply rollback, grapheme safety, font installation, selection access, or universal `TEXT_PATH` property support.

## 20. Acceptance gate

The release is complete only when:

1. One exact minor version is assigned and every enforced version surface agrees.
2. PRD-006 and PRD-008 are merged, verified, and consumed without duplicated font, range-read, or paint contracts.
3. Source-checklist items 5 and 23 and every Section 5 requirement map to implemented code/tests/docs or an explicit exclusion in this PRD.
4. No public tool is added, renamed, removed, or aliased; the registered count is unchanged.
5. Existing whole-node calls remain valid for all currently supported style fields and content items.
6. `text_set_style` exposes every matrix field, requires a real mutation, and applies only the requested whole span or `[start, end)` range.
7. `text_set_content` exposes an emitted strict whole/range union with required guarded text and one distinct target per batch.
8. UTF-16 bounds and surrogate-pair refusals return exact nearest-boundary recovery and never round silently.
9. Stale expected content, invalid inheritance, unavailable fonts, unsupported target/property combinations, and invalid cross-field states make zero predictable mutation.
10. Every required font for a call/batch is validated and loaded before the first setter; no new/ranged path substitutes a font.
11. Ranged insertion/replacement/deletion uses native APIs and preserves content/styled runs outside the selected range.
12. Existing `TEXT_PATH` nodes accept exactly the supported matrix subset; a mixed unsupported request changes nothing.
13. Every style success returns applied range, character length, loaded fonts, and exact requested-property readback.
14. Every content success returns the exact source-prescribed range/content/readback fields, and envelope counts/rows reconcile.
15. Any predictable invalid content item prevents every batch item from mutating.
16. Runtime/TOCTOU failures preserve ordered prior/failed/skipped state without claiming rollback.
17. Insert-before-delete failure returns exact original/resulting text and partial-mutation evidence; callers can reconcile without guessing.
18. Every published property has a handler path and every handler path is published; matrix/parity tests fail on drift.
19. All new predictable conditions are centrally coded with server/plugin parity and playbook recovery.
20. Scope, name, lock, type, duplicate, batch, and total-error safety regressions remain green through real boundaries.
21. Focused, full, type, suppression, generated, manifest, version, bundle, and diff gates pass with exact recorded counts.
22. Every named regression has exact-line red and restored-green evidence.
23. Live ranged style/content and existing-text-path rows succeed, or unavailable fixtures are labeled without converting mock evidence into a live claim.
24. The dedicated live file is reconciled to its opening state and evidence classes are reported separately.
25. README, safety contract, all runtime guides/resources, changelog, generated artifacts, and tool descriptions agree with the shipped contract.

## 21. Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Stale offsets edit the wrong substring | High without a guard | Require exact `expectedText`, compare twice, return bounded context and a corrected discovery call |
| An index splits a surrogate pair | Medium | UTF-16 boundary detector, nearest valid offsets, no rounding, emoji live refusal |
| Callers assume grapheme safety | Medium | Explicitly scope the guarantee to surrogate pairs and document multi-code-point graphemes |
| A later invalid batch item leaves earlier items changed | High without complete preflight | Resolve every target/range/font before item one; retain runtime TOCTOU partial rows without claiming rollback |
| Delete fails after insertion | Medium | Insert before delete so original survives, read back exact duplicate state, return mandatory partial evidence |
| Ranged editing destroys outside styles | High if whole-string assignment is reused | Require native insert/delete/range setters and assert outside runs before/after |
| Mixed or unavailable fonts cause mutation/fallback | High without font preflight | Load every exact pair before setters, consume PRD-006 catalog/recovery, forbid substitution |
| Style ID and direct fields produce surprising final values | Medium | Fixed link-before-direct order and exact requested-field/link readback |
| Full text support overpromises read-only fields | Medium | Complete writable matrix, explicit exclusions, schema/handler parity tests |
| `TEXT_PATH` is treated like `TEXT` | High without an exact matrix | Four-column type/range matrix, atomic unsupported-property refusal, existing-path live tests |
| A copied paint schema loses variables/assets | High | Consume PRD-008 `PaintInput` and serializer by identity; extend only IMAGE write sources; parity/red-proof the shared path |
| Strict schema becomes hard to compose | Medium | Exact enums/unions, property alternatives in descriptions, styled-segment discovery, repair-bearing errors |
| Figma normalizes a requested value | Medium | Return authoritative readback rather than echoing input; live-test representative families |
| Unexpected style setter failure leaves a prefix applied | Medium | Complete predictable preflight, deterministic order, before/resulting snapshot, partial disclosure |
| Generated bundle or guides lag source | Medium | Regenerate, equality gates, resource tests, post-build bundle verification |
| Live host lacks a required fixture | Medium | Record `fixture-unavailable`; never promote mocks/declarations to live proof |

## 22. Provenance and evidence boundary

| Evidence source | Finding carried into this PRD |
| :- | :- |
| [Capability Expansion Section 5](../Figma%20Design%20Editing%20Capability%20Expansion/prd.md#5-text-ranges-full-style-surface-and-content-replacement-p0) | Authoritative style/content schemas, property matrix, UTF-16/font rules, `TEXT_PATH` subset, native content algorithm, output, and acceptance |
| [Capability Expansion Section 16.3](../Figma%20Design%20Editing%20Capability%20Expansion/prd.md#163-styled-text-segments-through-node_info) | Styled segments are the mandatory canonical discovery path before partial writes |
| [Capability Expansion Section 18.1](../Figma%20Design%20Editing%20Capability%20Expansion/prd.md#181-expand-node_set_fill-and-node_set_stroke) | Text fills must use the same strict write-ready `PaintInput` and serializer; PRD-008 owns the predecessor contract consumed here |
| `src/mcp_server/tools/text.ts` | Current public style is whole-node/subset; content items are whole-node only |
| `figma_plugin/handlers/textHandlers.ts` and `figma_plugin/utils/textUtils.ts` | Current handlers are `TEXT`-only, have internal font logic, whole-string assignment, ordered batch rows, and existing font-before-content partial evidence |
| `SAFETY.md` and the four figma-edit guide references | Existing plugin-enforced scope/name/lock/batch/partial/error contracts that this release must preserve |
| Pinned `@figma/plugin-typings` declarations | Declared whole/range text methods, insert/delete APIs, writable/read-only split, and narrower `TEXT_PATH` surface; must be revalidated at scheduling |

Repository and declaration evidence establish an implementation contract, not current live-host behavior. Unit mocks establish only their encoded Figma behavior. Live acceptance must name the real file/channel/fixture, record before/readback/cleanup evidence, and avoid categorical claims beyond the exercised paths.
