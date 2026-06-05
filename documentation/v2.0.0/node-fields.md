# v2.0.0 — Node Fields (fast vs slow)

> Authoritative field reference for `node.info` (← `get_nodes_info`), extracted from the **official Figma Plugin API** reference (developers.figma.com, June 2026). This **replaces** the stale `SAFE_LIST_PROPERTIES` in [nodeUtils.ts](../../figma_plugin/utils/nodeUtils.ts), which is outdated (and where "properties" should read "fields").

## How "fast vs slow" is defined

Figma publishes **no** fast/slow label. This classification is derived from the API's own semantics under `documentAccess: "dynamic-page"` (the modern required mode). A field is **SLOW** if reading it requires any of:

1. **Async read** — only obtainable via an `*Async` method (`getMainComponentAsync`, `getInstancesAsync`, vector-network async).
2. **Rendered / computed geometry** — `absoluteRenderBounds`, `fillGeometry`, `strokeGeometry`, `vectorPaths`, `vectorNetwork`.
3. **ID → object resolution** — the raw reference ID is fast; resolving its **name/object** is async.
4. **Mixed-range text resolution** — a text field that can be `figma.mixed` needs `getStyledTextSegments()` / `getRange*()` to get the real per-range values.

Everything else is a plain synchronous getter = **FAST**.

> **Scope:** this is the **field vocabulary of `node.info`** — the names valid in its `fields` (request) and `filter` params. It is the **union across node types** (a given node only exposes the subset valid for its `type`). **Excluded** (not `node.info` fields): anything delivered by a *separate tool* — e.g. a rendered image, which is `node.export_visual`, not a field — and stand-alone async *methods* that aren't node fields (`getCSSAsync`, `getPublishStatusAsync`). Methods like `clone()`/`resize()`/`findAll()` are excluded too; fields whose *read* requires a method (e.g. `mainComponent` via `getMainComponentAsync`) are in scope but flagged SLOW.

---

## FAST fields (synchronous getters)

| Category | Fields |
|---|---|
| Identity | `id` · `name` · `type` · `parent` · `removed` · `isAsset` · `key` · `expanded` |
| Visibility / blend | `visible` · `locked` · `opacity` · `blendMode` · `isMask` · `maskType` · `stuckNodes` · `attachedConnectors` |
| Transform / geometry | `x` · `y` · `width` · `height` · `minWidth` · `maxWidth` · `minHeight` · `maxHeight` · `rotation` · `relativeTransform` · `absoluteTransform` · `absoluteBoundingBox` · `constraints` · `constrainProportions` · `targetAspectRatio` · `layoutAlign` · `layoutGrow` · `layoutPositioning` · `layoutSizingHorizontal` · `layoutSizingVertical` |
| Auto-layout (frame) | `layoutMode` · `layoutWrap` · `paddingLeft` · `paddingRight` · `paddingTop` · `paddingBottom` · `primaryAxisSizingMode` · `counterAxisSizingMode` · `primaryAxisAlignItems` · `counterAxisAlignItems` · `counterAxisAlignContent` · `itemSpacing` · `counterAxisSpacing` · `itemReverseZIndex` · `strokesIncludedInLayout` · `clipsContent` · `layoutGrids` · `gridStyleId` · `guides` · `inferredAutoLayout` · `detachedInfo` |
| Grid child | `gridRowCount` · `gridColumnCount` · `gridRowGap` · `gridColumnGap` · `gridRowSizes` · `gridColumnSizes` · `gridAutoTracks` · `gridItemsPositioning` · `gridRowSpan` · `gridColumnSpan` · `gridChildHorizontalAlign` · `gridChildVerticalAlign` · `gridRowAnchorIndex` · `gridColumnAnchorIndex` |
| Fills / strokes (raw) | `fills` · `fillStyleId` · `strokes` · `strokeStyleId` · `strokeWeight` · `strokeJoin` · `strokeAlign` · `strokeCap` · `strokeMiterLimit` · `dashPattern` · `strokeTopWeight` · `strokeBottomWeight` · `strokeLeftWeight` · `strokeRightWeight` · `variableWidthStrokeProperties` · `complexStrokeProperties` |
| Corner | `cornerRadius` · `cornerSmoothing` · `topLeftRadius` · `topRightRadius` · `bottomLeftRadius` · `bottomRightRadius` |
| Effects | `effects` · `effectStyleId` |
| Variables (raw IDs) | `boundVariables` · `inferredVariables` · `resolvedVariableModes` · `explicitVariableModes` · `componentPropertyReferences` |
| Prototyping | `reactions` · `overflowDirection` · `numberOfFixedChildren` · `overlayPositionType` · `overlayBackground` · `overlayBackgroundInteraction` |
| Component / instance | `componentProperties` · `variantProperties` · `componentPropertyDefinitions` · `exposedInstances` · `isExposedInstance` · `scaleFactor` · `overrides` · `description` · `descriptionMarkdown` · `documentationLinks` · `remote` · `variantGroupProperties` |
| Text (when uniform) | `characters` · `hasMissingFont` · `autoRename` · `textAutoResize` · `textTruncation` · `maxLines` · `textAlignHorizontal` · `textAlignVertical` · `paragraphIndent` · `paragraphSpacing` · `listSpacing` · `hangingPunctuation` · `hangingList` · `fontSize` · `fontName` · `fontWeight` · `textCase` · `letterSpacing` · `lineHeight` · `leadingTrim` · `textDecoration` · `textDecorationStyle` · `textDecorationOffset` · `textDecorationThickness` · `textDecorationColor` · `textDecorationSkipInk` · `openTypeFeatures` · `textStyleId` · `hyperlink` |
| Vector | `handleMirroring` |
| Export / dev / annotation | `exportSettings` · `devStatus` · `annotations` |

---

## SLOW fields

| Field | Reason (official API) |
|---|---|
| `mainComponent` | Read only via `getMainComponentAsync()` under dynamic-page (the property is write-only there) |
| `instances` (ComponentNode) | Throws under dynamic-page; use `getInstancesAsync()` |
| `vectorNetwork` | Async read under dynamic-page + large computed geometry |
| `vectorPaths` | Large computed vector geometry |
| `fillGeometry` · `strokeGeometry` | Computed vector path geometry |
| `absoluteRenderBounds` | Derived from **rendering** (cf. the fast `absoluteBoundingBox`) |
| Resolved **names** of `fillStyleId` / `strokeStyleId` / `effectStyleId` / `textStyleId` / `gridStyleId` | Raw ID is fast; the style **name** needs `getStyleByIdAsync()` |
| Resolved `boundVariables` / `explicitVariableModes` | Raw alias/mode IDs are fast; **variable / collection / mode names** need `getVariableByIdAsync()` / `getVariableCollectionByIdAsync()` |
| Any text field that is `figma.mixed` | Real per-range values need `getStyledTextSegments()` / `getRange*()` |

---

## The crux: raw reference = fast, resolved reference = slow

This is the key rule for the `get_node_variables` → `node.info` fold (tasks R3.3) and for any style/component reference:

- The **IDs** — `fillStyleId`, `effectStyleId`, `textStyleId`, `boundVariables`, `explicitVariableModes`, `mainComponent` (write side) — are cheap synchronous reads.
- Turning those IDs into human-readable **names** (`getStyleByIdAsync`, `getVariableByIdAsync`, `getMainComponentAsync`) is the async/slow work.

So a "resolved" field (e.g. enriched `boundVariables` with names) is **SLOW** even though the raw form is FAST.

---

## Format & delivery

Three decisions about how this list reaches the LLM (they're one decision — keep the LLM-facing artifact terse so it stays cheap to read whole):

- **Two artifacts, two formats.** The **source of truth is JSON/TS**, generated from `@figma/plugin-typings` (see Maintenance), and feeds *both* the `node.info` output schema and the rendered doc. The **LLM-facing reference is Markdown** — for tabular data a pipe-delimited row beats JSON on tokens (JSON repeats keys per record) and is grep-friendly (one field per line).
- **Carry the type, not prose.** Emit `name → type` for every field (free from the typings, denser and more accurate than a hand-written sentence, can't drift). The field *list itself* solves discovery; the flag solves cost; the **type** solves semantics for ~70% of fields whose names are self-documenting. Add a terse one-clause gloss **only** to the cryptic tail (`leadingTrim`, `hangingPunctuation`, `strokesIncludedInLayout`, `itemReverseZIndex`, `targetAspectRatio`, `inferredAutoLayout`, `detachedInfo`, `variableWidthStrokeProperties`, `componentPropertyReferences`, `gridItemsPositioning`, …). Do **not** write a description per field.
- **Full read, not grep.** The agent reads this to scan "what *can* I ask for, and which are cheap" — a whole-list scan, not a single-field lookup. Grep also doesn't work through the primary channel: the list ships as an MCP resource (`figma-edit://guide/*`) and `resources/read` returns the whole body — there's no server-side search. Keep the file small (the two decisions above keep it ~2–3k tokens) so one read is cheap. If it ever grows, **split fast vs slow into two resources** (read the fast list by default, pay for slow on demand) rather than suggesting grep.

## Maintenance

- This is a **point-in-time** extraction (June 2026). The Figma API evolves.
- **Do not hand-maintain.** The durable fix is to **generate this table from `@figma/plugin-typings`** at build/doc time (it's already a devDependency) — the typings encode sync getters vs `*Async` methods, which is exactly the fast/slow signal. That keeps it single-source and drift-free, unlike the old `SAFE_LIST_PROPERTIES`.

## How v2.0.0 uses this

- Feeds the **`node.info` output schema** (D5) — the enumerable returnable fields.
- Feeds the **`tool-selection` reference** field guidance (deferred resource, pay-per-use) so an agent can pick fields cost-aware.
- Replaces `SAFE_LIST_PROPERTIES`; the plugin's `extractProperties` fast/slow routing should track this list (regenerated from typings).
