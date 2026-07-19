import { normalizeEffects } from "./stylingHandlers";
import { REFUSALS, withPartialDisclosure } from "../utils/errors.js";

export async function createStyle(params: any) {
    const { type, name, description, properties, styleId, currentStyleName, bindVariables } = params;

    // Validate required parameters
    if (!type) {
        throw new Error("Missing required parameter: type is required.");
    }

    // Empty names are rejected, never assigned: a style named "" could not
    // pass exact-name verification afterward (P4-6).
    if (name === "") {
        throw new Error("Style name must not be empty. Omit name to leave the style's name unchanged.");
    }

    // Create/update splits on PRESENCE, not truthiness (P4-2): an explicit
    // empty styleId must never fall into the create branch.
    if (styleId !== undefined) {
        if (!currentStyleName) {
            throw REFUSALS.STYLE_NAME_MISSING();
        }
    } else {
        if (!name) {
            throw new Error("Missing required parameter: name is required to create a style.");
        }
    }

    // Validate-before-mutate: Resolve all variable bindings first
    const resolvedVariables: Record<string, Variable | null> = {};
    if (bindVariables && typeof bindVariables === 'object') {
        const entries = Object.entries(bindVariables) as [string, string | null][];
        for (const [field, variableId] of entries) {
            if (variableId !== null) {
                const variable = await figma.variables.getVariableByIdAsync(variableId);
                if (!variable) {
                    throw new Error(`Variable with ID "${variableId}" not found (for field "${field}").`);
                }
                resolvedVariables[field] = variable;
            } else {
                resolvedVariables[field] = null;
            }
        }
    }

    let style: BaseStyle | null = null;
    if (styleId !== undefined) {
        style = await figma.getStyleByIdAsync(styleId);
        if (!style) {
            throw new Error(`Style with ID ${styleId} not found.`);
        }
        if (style.name !== currentStyleName) {
            throw REFUSALS.STYLE_NAME_MISMATCH(style.name, currentStyleName);
        }
        if (style.type !== type.toUpperCase()) {
            throw new Error(`Style parameter type ${type} does not match retrieved style type ${style.type}`);
        }
        if (style.remote) {
            throw new Error(`Operation Denied: '${style.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
        }
    }

    // Q17 pre-check: a PAINT bind against an existing style with no paints is a
    // predictable failure and must not mutate the style first. Creates are
    // exempt — a fresh style is disposable under the rollback guard below.
    if (style && type.toUpperCase() === 'PAINT' && bindVariables && typeof bindVariables === 'object' && Object.keys(bindVariables).length > 0) {
        const effectivePaints = (properties && properties.paints !== undefined)
            ? properties.paints
            : (style as PaintStyle).paints;
        if (!effectivePaints || effectivePaints.length === 0) {
            throw new Error("Cannot bind/unbind variables on a paint style with no paints. Set paints first via properties.");
        }
    }

    // Q19: updates load the target font BEFORE any mutation — an existing style
    // must not mutate before its font is proven loadable. Creates load after
    // creation instead (inside the rollback guard): only the created style can
    // report its actual default font, and a fresh style is disposable.
    if (type.toUpperCase() === 'TEXT' && properties && style) {
        await figma.loadFontAsync(properties.fontName ? properties.fontName : (style as TextStyle).fontName as FontName);
    }

    let isNew = false;
    if (!style) {
        isNew = true;
        switch (type.toUpperCase()) {
            case 'TEXT':
                style = figma.createTextStyle();
                break;
            case 'PAINT':
                style = figma.createPaintStyle();
                break;
            case 'EFFECT':
                style = figma.createEffectStyle();
                break;
            case 'GRID':
                style = figma.createGridStyle();
                break;
            default:
                throw new Error(`Unsupported style type: ${type}`);
        }
    }

    // Apply name/properties/bindings. If anything throws on a freshly-created
    // style, remove it — otherwise a partial failure (e.g. an unloaded font)
    // leaves an orphaned empty style behind. On updates, a failure after the
    // first write discloses the partial mutation with before-values (Q18).
    const before: Record<string, any> = isNew ? {} : { name: style.name, description: style.description };
    const applied: string[] = [];
    try {
        // Q19 create-path font load: only the created style can report its
        // actual default font, so load it here rather than guessing one.
        if (isNew && type.toUpperCase() === 'TEXT' && properties) {
            await figma.loadFontAsync(properties.fontName ? properties.fontName : (style as TextStyle).fontName as FontName);
        }

        if (isNew) {
            style.name = name!;
        } else if (name !== undefined) {
            style.name = name;
            applied.push(`name (was "${before.name}")`);
        }

        if (description) {
            style.description = description;
            applied.push("description");
        }

        if (properties) {
            switch (type.toUpperCase()) {
                case 'TEXT': {
                    const s = style as TextStyle;
                    if (properties.fontName) { s.fontName = properties.fontName; applied.push("fontName"); }
                    if (properties.fontSize) { s.fontSize = properties.fontSize; applied.push("fontSize"); }
                    if (properties.lineHeight) { s.lineHeight = properties.lineHeight; applied.push("lineHeight"); }
                    if (properties.letterSpacing) { s.letterSpacing = properties.letterSpacing; applied.push("letterSpacing"); }
                    if (properties.paragraphIndent) { s.paragraphIndent = properties.paragraphIndent; applied.push("paragraphIndent"); }
                    if (properties.paragraphSpacing) { s.paragraphSpacing = properties.paragraphSpacing; applied.push("paragraphSpacing"); }
                    if (properties.textCase) { s.textCase = properties.textCase; applied.push("textCase"); }
                    if (properties.textDecoration) { s.textDecoration = properties.textDecoration; applied.push("textDecoration"); }
                    break;
                }
                case 'PAINT': {
                    const s = style as PaintStyle;
                    if (properties.paints) { s.paints = properties.paints; applied.push("paints"); }
                    break;
                }
                case 'EFFECT': {
                    const s = style as EffectStyle;
                    if (properties.effects) { s.effects = normalizeEffects(properties.effects); applied.push("effects"); }
                    break;
                }
                case 'GRID': {
                    const s = style as GridStyle;
                    if (properties.layoutGrids) { s.layoutGrids = properties.layoutGrids; applied.push("layoutGrids"); }
                    break;
                }
            }
        }

        // bindVariables: map of field names to variable IDs (bind) or null (unbind)
        // Runs after properties so bindings aren't overwritten by paint assignments.
        // An EMPTY map is a documented no-op (P4-3): nothing requested, nothing
        // checked, nothing done — the exact condition of the Q17 pre-check above,
        // so a predictable paints-missing failure can never fire post-mutation.
        const bindingEntries = Object.entries(resolvedVariables);
        if (bindingEntries.length > 0) {
            if (type.toUpperCase() === 'PAINT') {
                const paintStyle = style as PaintStyle;
                const paints = [...paintStyle.paints];
                if (paints.length === 0) {
                    throw new Error("Cannot bind/unbind variables on a paint style with no paints. Set paints first via properties.");
                }
                for (const [field, variable] of bindingEntries) {
                    paints[0] = figma.variables.setBoundVariableForPaint(paints[0] as SolidPaint, field as any, variable);
                }
                paintStyle.paints = paints;
                applied.push("variable bindings");
            } else {
                for (const [field, variable] of bindingEntries) {
                    // @ts-expect-error TS2551: Property 'setBoundVariable' does not exist on type 'BaseStyle'. Did you mean 'boundVariables'?
                    style.setBoundVariable(field, variable);
                    applied.push(`variable binding "${field}"`);
                }
            }
        }
    } catch (e) {
        // Roll back a style we created here (isNew = freshly created).
        if (isNew) {
            try { (style as any).remove(); } catch { /* best-effort cleanup */ }
            throw e;
        }
        // Q18: disclose a partial update; a clean failure rethrows untouched.
        if (applied.length > 0) {
            throw withPartialDisclosure(e, `the style's ${applied.join(", ")} had already been updated when the failure occurred.`, before);
        }
        throw e;
    }

    return {
        id: style.id,
        name: style.name,
        type: style.type
    };
}

export async function applyStyle(params: any) {
    const { nodeId, styleId, styleType } = params;

    // Validate parameters
    if (!nodeId || !styleId || !styleType) {
        throw new Error("Missing required parameters: nodeId, styleId, and styleType are required.");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node with ID ${nodeId} not found.`);
    }

    // Determine which property to set based on styleType
    // styleType can be: TEXT, FILL, STROKE, EFFECT, GRID
    switch (styleType.toUpperCase()) {
        case 'TEXT':
            if (node.type !== 'TEXT') throw new Error("Target node must be a Text node to apply specific text styles.");
            // We need to load the font of the style before we can apply it? 
            // Actually, assigning textStyleId usually works if the style exists.
            // But if the command fails, we might need to load fonts.
            // However, figma.getStyleByIdAsync might be needed to verify.
            // For now, simpler implementation:
            await node.setTextStyleIdAsync(styleId);
            break;
        case 'FILL':
            if (!('fillStyleId' in node)) throw new Error("Target node does not support fill styles.");
            await node.setFillStyleIdAsync(styleId);
            break;
        case 'STROKE':
            if (!('strokeStyleId' in node)) throw new Error("Target node does not support stroke styles.");
            await node.setStrokeStyleIdAsync(styleId);
            break;
        case 'EFFECT':
            if (!('effectStyleId' in node)) throw new Error("Target node does not support effect styles.");
            await node.setEffectStyleIdAsync(styleId);
            break;
        case 'GRID':
            if (!('gridStyleId' in node)) throw new Error("Target node does not support grid styles.");
            await node.setGridStyleIdAsync(styleId);
            break;
        default:
            throw new Error(`Unsupported style type target: ${styleType}`);
    }

    return {
        success: true,
        message: `Style ${styleId} applied to node ${nodeId}`
    };
}

/**
 * Deletes a local style
 * @param {Object} params - Parameters object
 * @param {string} params.styleId - ID of style to delete
 * @param {string} params.styleName - Expected name of style to delete (verification)
 * @returns {Promise<Object>} Status info
 */
export async function deleteStyle(params: any) {
    const { styleId, styleName } = params || {};

    if (!styleId) {
        throw new Error("Missing styleId parameter");
    }

    const style = await figma.getStyleByIdAsync(styleId);
    if (!style) {
        throw new Error(`Style with ID ${styleId} not found.`);
    }

    if (!styleName || style.name !== styleName) {
        throw new Error("Operation Denied: styleName does not match name of styleId. Refresh context & recheck to ensure correct styleId is passed in.");
    }

    if (style.remote) {
        throw new Error(`Operation Denied: '${style.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
    }

    style.remove();

    return {
        success: true,
        message: `Style ${styleId} ("${styleName}") successfully deleted.`
    };
}
