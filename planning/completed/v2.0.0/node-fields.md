# v2.0.0 — Node Fields (fast vs slow)

> Authoritative field reference for `node_info` (← `get_nodes_info`), extracted from the **official Figma Plugin API** reference (developers.figma.com, June 2026). This **replaces** the stale `SAFE_LIST_PROPERTIES` in [nodeUtils.ts](../../figma_plugin/utils/nodeUtils.ts), which is outdated (and where "properties" should read "fields").

## How "fast vs slow" is defined

Figma publishes **no** fast/slow label. This classification is derived from the API's own semantics under `documentAccess: "dynamic-page"` (the modern required mode). A field is **SLOW** if reading it requires any of:

1. **Async read** — only obtainable via an `*Async` method (`getMainComponentAsync`, `getInstancesAsync`, vector-network async).
2. **Rendered / computed geometry** — `absoluteRenderBounds`, `fillGeometry`, `strokeGeometry`, `vectorPaths`, `vectorNetwork`.
3. **ID → object resolution** — the raw reference ID is fast; resolving its **name/object** is async.
4. **Mixed-range text resolution** — a text field that can be `figma.mixed` needs `getStyledTextSegments()` / `getRange*()` to get the real per-range values.

Everything else is a plain synchronous getter = **FAST**.

> **Scope:** this is the **field vocabulary of `node_info`** — the names valid in its `fields` (request) and `filter` params. It is the **union across node types** (a given node only exposes the subset valid for its `type`). **Excluded** (not `node_info` fields): anything delivered by a *separate tool* — e.g. a rendered image, which is `node_export_visual`, not a field — and stand-alone async *methods* that aren't node fields (`getCSSAsync`, `getPublishStatusAsync`). Methods like `clone()`/`resize()`/`findAll()` are excluded too; fields whose *read* requires a method (e.g. `mainComponent` via `getMainComponentAsync`) are in scope but flagged SLOW.

---

## FAST fields (synchronous getters)

| Category | Fields |
|---|---|
| Identity | `id` · `name` · `type` · `parent` · `removed` · `isAsset` · `key` · `expanded` |
| Visibility / blend | `visible` · `locked` · `opacity` · `blendMode` · `isMask` · `maskType` · `stuckNodes` · `attachedConnectors` |
| Transform / geometry | `x` · `y` · `width` · `height` · `minWidth` · `maxWidth` · `minHeight` · `maxHeight` · `rotation` · `relativeTransform` · `absoluteTransform` · `absoluteBoundingBox` · `constraints` · `constrainProportions` · `targetAspectRatio` · `layoutAlign` · `layoutGrow` · `layoutPositioning` · `layoutSizingHorizontal` · `layoutSizingVertical` |
| Auto-layout (frame) | `layoutMode` · `layoutWrap` · `paddingLeft` · `paddingRight` · `paddingTop` · `paddingBottom` · `primaryAxisSizingMode` · `counterAxisSizingMode` · `primaryAxisAlignItems` · `counterAxisAlignItems` · `counterAxisAlignContent` · `itemSpacing` · `counterAxisSpacing` · `itemReverseZIndex` · `strokesIncludedInLayout` · `clipsContent` · `layoutGrids` · `guides` · `inferredAutoLayout` · `detachedInfo` |
| Grid child | `gridRowCount` · `gridColumnCount` · `gridRowGap` · `gridColumnGap` · `gridRowSizes` · `gridColumnSizes` · `gridAutoTracks` · `gridItemsPositioning` · `gridRowSpan` · `gridColumnSpan` · `gridChildHorizontalAlign` · `gridChildVerticalAlign` · `gridRowAnchorIndex` · `gridColumnAnchorIndex` |
| Fills / strokes (raw) | `fills` · `strokes` · `strokeWeight` · `strokeJoin` · `strokeAlign` · `strokeCap` · `strokeMiterLimit` · `dashPattern` · `strokeTopWeight` · `strokeBottomWeight` · `strokeLeftWeight` · `strokeRightWeight` · `variableWidthStrokeProperties` · `complexStrokeProperties` |
| Corner | `cornerRadius` · `cornerSmoothing` · `topLeftRadius` · `topRightRadius` · `bottomLeftRadius` · `bottomRightRadius` |
| Effects | `effects` |
| Variables (raw) | `inferredVariables` · `resolvedVariableModes` · `componentPropertyReferences` |
| Prototyping | `reactions` · `overflowDirection` · `numberOfFixedChildren` · `overlayPositionType` · `overlayBackground` · `overlayBackgroundInteraction` |
| Component / instance | `componentProperties` · `variantProperties` · `componentPropertyDefinitions` · `exposedInstances` · `isExposedInstance` · `scaleFactor` · `overrides` · `description` · `descriptionMarkdown` · `documentationLinks` · `remote` · `variantGroupProperties` |
| Text (when uniform) | `characters` · `hasMissingFont` · `autoRename` · `textAutoResize` · `textTruncation` · `maxLines` · `textAlignHorizontal` · `textAlignVertical` · `paragraphIndent` · `paragraphSpacing` · `listSpacing` · `hangingPunctuation` · `hangingList` · `fontSize` · `fontName` · `fontWeight` · `textCase` · `letterSpacing` · `lineHeight` · `leadingTrim` · `textDecoration` · `textDecorationStyle` · `textDecorationOffset` · `textDecorationThickness` · `textDecorationColor` · `textDecorationSkipInk` · `openTypeFeatures` · `hyperlink` |
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
| `*StyleId` (`fill`/`stroke`/`effect`/`text`/`grid`) · `boundVariables` · `explicitVariableModes` | **Library-object references** — `node_info` resolves these to `{id, name}` by default (one cached async hop via `getStyleByIdAsync` / `getVariableByIdAsync` / `getVariableCollectionByIdAsync`). See **Reference fields** below |
| Any text field that is `figma.mixed` | Real per-range values need `getStyledTextSegments()` / `getRange*()` |

---

## Reference fields (derived — not raw getters)

Some fields' getters return a **reference** — a live node, or an opaque library-object id. `node_info` never returns the raw object / opaque-id form; it returns a **derived** value. Two rules, by reference kind:

### Node references → ID(s)

Getter returns a live Figma node (or array of nodes): `parent` · `mainComponent` · `instances` · `exposedInstances` · `stuckNodes` · `attachedConnectors`.

`node_info` returns the node **id(s)** (`string` / `string[]`) — never the raw node object. Mandatory, not cosmetic: a live Figma node is a host object that **cannot be structured-cloned across `figma.ui.postMessage` nor `JSON.stringify`'d**; returning one raw throws `DataCloneError` / "Converting circular structure to JSON", surfacing as a failed `node_info`. `extractProperties` must map each to `.id` (or `.map(n => n.id)`) **before** the result is posted. Latency: `parent` / `exposedInstances` / `stuckNodes` / `attachedConnectors` are sync (FAST); `mainComponent` / `instances` are async (SLOW). The id-mapping itself is trivial.

**Why id, not name:** you operate on nodes **by id** (every write tool takes an id), and a node's name is one cheap `node_info` away. The id is the operative key.

### Library-object references → `{id, name}` (resolved by default)

Getter holds an opaque id pointing at a **style, variable, or mode**: `fillStyleId` · `strokeStyleId` · `effectStyleId` · `textStyleId` · `gridStyleId` · `boundVariables` · `explicitVariableModes`.

`node_info` returns the **resolved superset `{id, name}`** — for `boundVariables` / `explicitVariableModes`, per binding, **recursing into arrays** (`fills` / `strokes` / `effects` / `layoutGrids`) and **nested maps** (`componentProperties`) (see tasks R3.3). There is **no raw-id-only variant.**

**Why resolve by default, and why no raw tier:** unlike a node id, a style/variable id (`VariableID:1:23`) is **opaque** — an LLM can't reason about it, so a raw default would just force an inevitable follow-up to fetch the name. The resolved form is a **superset** — it still carries the `id`, so round-tripping into `node_bind_variable` / `node_apply_style` (which take ids) still works. A raw-id-only field would serve only a niche "bulk-transfer-by-id, names never needed" case while making the obvious field name return opaque ids — a footgun. Cost is bounded: resolution **caches per unique style/variable**, so it scales with distinct tokens, not node count. These fields are therefore **SLOW** (one cached async hop), reclassified out of the FAST tables above.

See tasks **R3.3** (recursive resolver) and **R3.8** (field set / generation).

---

## Format & delivery

Three decisions about how this list reaches the LLM (they're one decision — keep the LLM-facing artifact terse so it stays cheap to read whole):

- **Two artifacts, two formats.** The **source of truth is JSON/TS**, generated from `@figma/plugin-typings` (see Maintenance), and feeds *both* the `node_info` output schema and the rendered doc. The **LLM-facing reference is Markdown** — for tabular data a pipe-delimited row beats JSON on tokens (JSON repeats keys per record) and is grep-friendly (one field per line).
- **Carry the type, not prose.** Emit `name → type` for every field (free from the typings, denser and more accurate than a hand-written sentence, can't drift). The field *list itself* solves discovery; the flag solves cost; the **type** solves semantics for ~70% of fields whose names are self-documenting. Add a terse one-clause gloss **only** to the cryptic tail (`leadingTrim`, `hangingPunctuation`, `strokesIncludedInLayout`, `itemReverseZIndex`, `targetAspectRatio`, `inferredAutoLayout`, `detachedInfo`, `variableWidthStrokeProperties`, `componentPropertyReferences`, `gridItemsPositioning`, …). Do **not** write a description per field.
- **Full read, not grep.** The agent reads this to scan "what *can* I ask for, and which are cheap" — a whole-list scan, not a single-field lookup. Grep also doesn't work through the primary channel: the list ships as an MCP resource (`figma-edit://guide/*`) and `resources/read` returns the whole body — there's no server-side search. Keep the file small (the two decisions above keep it ~2–3k tokens) so one read is cheap. If it ever grows, **split fast vs slow into two resources** (read the fast list by default, pay for slow on demand) rather than suggesting grep.

## Maintenance

- This is a **point-in-time** extraction (June 2026). The Figma API evolves.
- **Do not hand-maintain.** The durable fix is to **generate this table from `@figma/plugin-typings`** at build/doc time (it's already a devDependency) — the typings encode sync getters vs `*Async` methods, which is exactly the fast/slow signal. That keeps it single-source and drift-free, unlike the old `SAFE_LIST_PROPERTIES`.

## How v2.0.0 uses this

- Feeds the **`node_info` output schema** (D5) — the enumerable returnable fields.
- Feeds the **`tool-selection` reference** field guidance (deferred resource, pay-per-use) so an agent can pick fields cost-aware.
- Replaces `SAFE_LIST_PROPERTIES`; the plugin's `extractProperties` fast/slow routing should track this list (regenerated from typings).
