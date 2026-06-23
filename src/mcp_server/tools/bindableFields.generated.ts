// AUTO-GENERATED from @figma/plugin-typings by scripts/gen-node-fields.ts.
// Do not edit by hand — run `bun run gen:node-fields`.

// Allowlist of fields node_bind_variable accepts in its bindVariables map:
// VariableBindableNodeField ∪ VariableBindableTextField, plus the paint
// pseudo-fields ("fills"/"strokes") handled by the fills/strokes branch.
export const BINDABLE_FIELDS = [
    "fills",
    "strokes",
    "height",
    "width",
    "characters",
    "itemSpacing",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "visible",
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "counterAxisSpacing",
    "strokeWeight",
    "strokeTopWeight",
    "strokeRightWeight",
    "strokeBottomWeight",
    "strokeLeftWeight",
    "opacity",
    "gridRowGap",
    "gridColumnGap",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "paragraphSpacing",
    "paragraphIndent",
] as const;

export type BindableField = (typeof BINDABLE_FIELDS)[number];
