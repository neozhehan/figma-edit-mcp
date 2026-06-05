# Node fields — `node.info`

> Sample of the **generated, LLM-facing** reference (the artifact an agent reads via the `tool-selection` resource). Generated from `@figma/plugin-typings`; do not hand-edit. The authoritative spec (provenance, fast/slow rule, maintenance) is [node-fields.md](./node-fields.md); this file shows the rendered shape.

Pass field names to `node.info({ nodeIds, fields: [...] })`. Omitted fields are absent from the response (not `null`).

- **fast** = synchronous read, cheap. Request freely.
- **slow** = async resolution / computed geometry. Request only when needed; adds latency.
- A node exposes only the subset valid for its `type`. `mixed` marks a value that can be `figma.mixed` — reading the real per-range value is **slow** (see end).

---

## Fast fields

### Identity
| field | type |
|---|---|
| `id` | `string` |
| `name` | `string` |
| `type` | `NodeType` |
| `parent` | `string \| null` — parent node id |
| `removed` | `boolean` |
| `isAsset` | `boolean` |
| `key` | `string` — component/style key |
| `expanded` | `boolean` |

### Visibility & blend
| field | type |
|---|---|
| `visible` | `boolean` |
| `locked` | `boolean` |
| `opacity` | `number` (0–1) |
| `blendMode` | `BlendMode` |
| `isMask` | `boolean` |
| `maskType` | `'ALPHA' \| 'VECTOR' \| 'LUMINANCE'` |
| `stuckNodes` | `string[]` — ids of nodes stuck to this |
| `attachedConnectors` | `string[]` — connector ids |

### Transform & geometry
| field | type |
|---|---|
| `x` · `y` | `number` |
| `width` · `height` | `number` |
| `minWidth` · `maxWidth` · `minHeight` · `maxHeight` | `number \| null` |
| `rotation` | `number` — degrees |
| `relativeTransform` | `Transform` — 2×3 matrix vs parent |
| `absoluteTransform` | `Transform` |
| `absoluteBoundingBox` | `Rect \| null` |
| `constraints` | `Constraints` |
| `constrainProportions` | `boolean` |
| `targetAspectRatio` | `Vector \| null` — locked W:H ratio |
| `layoutAlign` | `'MIN' \| 'CENTER' \| 'MAX' \| 'STRETCH' \| 'INHERIT'` |
| `layoutGrow` | `number` |
| `layoutPositioning` | `'AUTO' \| 'ABSOLUTE'` |
| `layoutSizingHorizontal` · `layoutSizingVertical` | `'FIXED' \| 'HUG' \| 'FILL'` |

### Auto-layout (frame)
| field | type |
|---|---|
| `layoutMode` | `'NONE' \| 'HORIZONTAL' \| 'VERTICAL' \| 'GRID'` |
| `layoutWrap` | `'NO_WRAP' \| 'WRAP'` |
| `paddingLeft` · `paddingRight` · `paddingTop` · `paddingBottom` | `number` |
| `primaryAxisSizingMode` · `counterAxisSizingMode` | `'FIXED' \| 'AUTO'` |
| `primaryAxisAlignItems` | `'MIN' \| 'MAX' \| 'CENTER' \| 'SPACE_BETWEEN'` |
| `counterAxisAlignItems` | `'MIN' \| 'MAX' \| 'CENTER' \| 'BASELINE'` |
| `counterAxisAlignContent` | `'AUTO' \| 'SPACE_BETWEEN'` |
| `itemSpacing` | `number` |
| `counterAxisSpacing` | `number \| null` |
| `itemReverseZIndex` | `boolean` — last child renders on top |
| `strokesIncludedInLayout` | `boolean` — stroke counts toward layout size |
| `clipsContent` | `boolean` |
| `layoutGrids` | `LayoutGrid[]` |
| `gridStyleId` | `string` |
| `guides` | `Guide[]` |
| `inferredAutoLayout` | `InferredAutoLayoutResult \| null` — layout Figma infers for a non-AL frame |
| `detachedInfo` | `DetachedInfo \| null` — provenance if detached from a component |

### Grid (parent + child)
| field | type |
|---|---|
| `gridRowCount` · `gridColumnCount` | `number` |
| `gridRowGap` · `gridColumnGap` | `number` |
| `gridRowSizes` · `gridColumnSizes` | `number[]` |
| `gridAutoTracks` | `GridTrackSize[]` |
| `gridItemsPositioning` | `'AUTO' \| 'MANUAL'` — auto-flow vs explicit placement |
| `gridRowSpan` · `gridColumnSpan` | `number` |
| `gridChildHorizontalAlign` · `gridChildVerticalAlign` | `'AUTO' \| 'MIN' \| 'CENTER' \| 'MAX'` |
| `gridRowAnchorIndex` · `gridColumnAnchorIndex` | `number` |

### Fills & strokes (raw)
| field | type |
|---|---|
| `fills` | `Paint[]` · `mixed` |
| `fillStyleId` | `string` · `mixed` |
| `strokes` | `Paint[]` |
| `strokeStyleId` | `string` |
| `strokeWeight` | `number` · `mixed` |
| `strokeJoin` | `StrokeJoin` · `mixed` |
| `strokeAlign` | `'INSIDE' \| 'OUTSIDE' \| 'CENTER'` |
| `strokeCap` | `StrokeCap` · `mixed` |
| `strokeMiterLimit` | `number` |
| `dashPattern` | `number[]` |
| `strokeTopWeight` · `strokeBottomWeight` · `strokeLeftWeight` · `strokeRightWeight` | `number` |
| `variableWidthStrokeProperties` | `VariableWidthStroke[]` — per-point variable stroke width |
| `complexStrokeProperties` | `ComplexStroke` — advanced stroke geometry |

### Corner
| field | type |
|---|---|
| `cornerRadius` | `number` · `mixed` |
| `cornerSmoothing` | `number` — squircle smoothing 0–1 |
| `topLeftRadius` · `topRightRadius` · `bottomLeftRadius` · `bottomRightRadius` | `number` |

### Effects
| field | type |
|---|---|
| `effects` | `Effect[]` |
| `effectStyleId` | `string` |

### Variables (raw ids)
| field | type |
|---|---|
| `boundVariables` | `{ [field]: VariableAlias \| VariableAlias[] }` — raw alias ids; **resolved names = slow** |
| `inferredVariables` | `{ [field]: VariableAlias[] }` — variables Figma infers for unbound fields |
| `resolvedVariableModes` | `{ [collectionId]: modeId }` |
| `explicitVariableModes` | `{ [collectionId]: modeId }` — raw mode ids; **resolved names = slow** |
| `componentPropertyReferences` | `{ [field]: string } \| null` — maps a field to a component-property name |

### Prototyping
| field | type |
|---|---|
| `reactions` | `Reaction[]` |
| `overflowDirection` | `OverflowDirection` |
| `numberOfFixedChildren` | `number` — pinned (sticky) children |
| `overlayPositionType` | `OverlayPositionType` |
| `overlayBackground` | `OverlayBackground` |
| `overlayBackgroundInteraction` | `'NONE' \| 'CLOSE_ON_CLICK_OUTSIDE'` |

### Component & instance
| field | type |
|---|---|
| `componentProperties` | `{ [name]: { type, value, ... } }` — instance |
| `variantProperties` | `{ [name]: string } \| null` — instance |
| `componentPropertyDefinitions` | `{ [name]: { type, defaultValue, ... } }` — component/set |
| `exposedInstances` | `string[]` — nested instance ids exposed on this instance |
| `isExposedInstance` | `boolean` |
| `scaleFactor` | `number` |
| `overrides` | `{ id, overriddenFields }[]` — fields overridden in the instance subtree |
| `description` | `string` |
| `descriptionMarkdown` | `string` |
| `documentationLinks` | `DocumentationLink[]` |
| `remote` | `boolean` — published from an external library |
| `variantGroupProperties` | `{ [name]: { values } }` — component-set only |

### Text (uniform value; per-range = slow)
| field | type |
|---|---|
| `characters` | `string` |
| `hasMissingFont` | `boolean` |
| `autoRename` | `boolean` |
| `textAutoResize` | `'NONE' \| 'WIDTH_AND_HEIGHT' \| 'HEIGHT' \| 'TRUNCATE'` |
| `textTruncation` | `'DISABLED' \| 'ENDING'` |
| `maxLines` | `number \| null` |
| `textAlignHorizontal` | `'LEFT' \| 'CENTER' \| 'RIGHT' \| 'JUSTIFIED'` |
| `textAlignVertical` | `'TOP' \| 'CENTER' \| 'BOTTOM'` |
| `paragraphIndent` · `paragraphSpacing` · `listSpacing` | `number` |
| `hangingPunctuation` | `boolean` — punctuation hangs into the margin |
| `hangingList` | `boolean` — list markers hang in the indent |
| `fontSize` | `number` · `mixed` |
| `fontName` | `FontName` · `mixed` |
| `fontWeight` | `number` · `mixed` |
| `textCase` | `TextCase` · `mixed` |
| `letterSpacing` | `LetterSpacing` · `mixed` |
| `lineHeight` | `LineHeight` · `mixed` |
| `leadingTrim` | `'CAP_HEIGHT' \| 'NONE'` · `mixed` — trims line-box leading |
| `textDecoration` | `TextDecoration` · `mixed` |
| `openTypeFeatures` | `{ [feature]: boolean }` |
| `textStyleId` | `string` · `mixed` |
| `hyperlink` | `HyperlinkTarget \| null` · `mixed` |

### Vector / export / dev
| field | type |
|---|---|
| `handleMirroring` | `'NONE' \| 'ANGLE' \| 'ANGLE_AND_LENGTH'` · `mixed` — bezier handle symmetry |
| `exportSettings` | `ExportSettings[]` |
| `devStatus` | `{ type: 'READY_FOR_DEV' \| 'NONE', description? } \| null` |
| `annotations` | `Annotation[]` |

---

## Slow fields

| field | type | why slow |
|---|---|---|
| `mainComponent` | `string \| null` — component id | async `getMainComponentAsync()` under dynamic-page |
| `instances` | `string[]` — instance ids | async `getInstancesAsync()` |
| `vectorNetwork` | `VectorNetwork` | async + large computed geometry |
| `vectorPaths` | `VectorPaths` | large computed vector geometry |
| `fillGeometry` · `strokeGeometry` | `VectorPaths` | computed vector path geometry |
| `absoluteRenderBounds` | `Rect \| null` | derived from rendering (use fast `absoluteBoundingBox` instead) |
| *resolved* `fillStyleId` · `strokeStyleId` · `effectStyleId` · `textStyleId` · `gridStyleId` | `string` (name) | id is fast; the **name** needs `getStyleByIdAsync()` |
| *resolved* `boundVariables` · `explicitVariableModes` | `{ …names }` | ids are fast; variable/collection/mode **names** need `getVariableByIdAsync()` etc. |
| any `mixed` text field, per-range | `StyledTextSegment[]` | `getStyledTextSegments()` / `getRange*()` |

> **`mixed`:** a uniform value reads fast; if the field varies across the text the uniform read returns `figma.mixed` and the real per-range values are slow.
>
> **Not `node.info` fields** (use the right tool — not requestable here): rendered image → `node.export_visual`; CSS → `getCSSAsync()`; publish status → `getPublishStatusAsync()`.
