export async function createStyle(params: any) {
    const { type, name, description, properties, styleId, bindVariables } = params;

    // Validate required parameters
    if (!type || !name) {
        throw new Error("Missing required parameters: type and name are required.");
    }

    let style;

    if (styleId) {
        style = await figma.getStyleByIdAsync(styleId);
        if (!style) {
            throw new Error(`Style with ID ${styleId} not found.`);
        }
        if (style.type !== type.toUpperCase()) {
            throw new Error(`Style parameter type ${type} does not match retrieved style type ${style.type}`);
        }
    } else {
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

    style.name = name;
    if (description) style.description = description;

    if (properties) {
        switch (type.toUpperCase()) {
            case 'TEXT': {
                const s = style as TextStyle;
                if (properties.fontName) await figma.loadFontAsync(properties.fontName);
                if (properties.fontName) s.fontName = properties.fontName;
                if (properties.fontSize) s.fontSize = properties.fontSize;
                if (properties.lineHeight) s.lineHeight = properties.lineHeight;
                if (properties.letterSpacing) s.letterSpacing = properties.letterSpacing;
                if (properties.paragraphIndent) s.paragraphIndent = properties.paragraphIndent;
                if (properties.paragraphSpacing) s.paragraphSpacing = properties.paragraphSpacing;
                if (properties.textCase) s.textCase = properties.textCase;
                if (properties.textDecoration) s.textDecoration = properties.textDecoration;
                break;
            }
            case 'PAINT': {
                const s = style as PaintStyle;
                if (properties.paints) s.paints = properties.paints;
                break;
            }
            case 'EFFECT': {
                const s = style as EffectStyle;
                if (properties.effects) s.effects = properties.effects;
                break;
            }
            case 'GRID': {
                const s = style as GridStyle;
                if (properties.layoutGrids) s.layoutGrids = properties.layoutGrids;
                break;
            }
        }
    }

    // bindVariables: map of field names to variable IDs (bind) or null (unbind)
    // Runs after properties so bindings aren't overwritten by paint assignments
    if (bindVariables && typeof bindVariables === 'object') {
        const entries = Object.entries(bindVariables) as [string, string | null][];

        if (type.toUpperCase() === 'PAINT') {
            const paintStyle = style as PaintStyle;
            const paints = [...paintStyle.paints];
            if (paints.length === 0) {
                throw new Error("Cannot bind/unbind variables on a paint style with no paints. Set paints first via properties.");
            }
            for (const [field, variableId] of entries) {
                if (variableId === null) {
                    paints[0] = figma.variables.setBoundVariableForPaint(paints[0] as SolidPaint, field as any, null);
                } else {
                    const variable = await figma.variables.getVariableByIdAsync(variableId);
                    if (!variable) {
                        throw new Error(`Variable with ID "${variableId}" not found (for field "${field}").`);
                    }
                    paints[0] = figma.variables.setBoundVariableForPaint(paints[0] as SolidPaint, field as any, variable);
                }
            }
            paintStyle.paints = paints;
        } else {
            for (const [field, variableId] of entries) {
                if (variableId === null) {
                    // @ts-ignore
                    style.setBoundVariable(field, null);
                } else {
                    const variable = await figma.variables.getVariableByIdAsync(variableId);
                    if (!variable) {
                        throw new Error(`Variable with ID "${variableId}" not found (for field "${field}").`);
                    }
                    // @ts-ignore
                    style.setBoundVariable(field, variable);
                }
            }
        }
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
