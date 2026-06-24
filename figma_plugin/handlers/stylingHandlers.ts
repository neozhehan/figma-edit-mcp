/**
 * Styling handlers for Figma plugin
 * Handles fill, stroke, and corner radius operations
 */
import { base64ToBytes } from "../utils/exportUtils";

/**
 * Sets the fill color of a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the node to modify
 * @param {Object} params.color - Color object with r, g, b, a values (0-1)
 * @returns {Promise<Object>} Result with node info and applied fills
 */
export async function setFillColor(params: any) {
    console.log("setFillColor", params);
    const { nodeId, color, image, clear } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (clear) {
        if (!("fills" in node)) {
            throw new Error(`node_set_fill: '${node.name}' (type ${node.type}) has no 'fills' property to clear.`);
        }
        node.fills = [];
        return {
            id: node.id,
            name: node.name,
            fills: [],
        };
    }

    if (!("fills" in node)) {
        throw new Error(`node_set_fill: '${node.name}' (type ${node.type}) has no 'fills' property to set a fill on.`);
    }

    if (color && image) {
        throw new Error("node_set_fill: provide exactly one of: a solid color (r,g,b[,a]), an image, or clear:true.");
    }
    if (!color && !image) {
        throw new Error("node_set_fill: provide exactly one of: a solid color (r,g,b[,a]), an image, or clear:true.");
    }

    let paintStyle: any;

    if (color) {
        const { r, g, b, a } = color;
        // Create RGBA color
        const rgbColor: any = {
            r: parseFloat(r) || 0,
            g: parseFloat(g) || 0,
            b: parseFloat(b) || 0,
            a: a !== undefined ? parseFloat(a) : 1,
        };

        // Set fill
        paintStyle = {
            type: "SOLID",
            color: {
                r: parseFloat(rgbColor.r),
                g: parseFloat(rgbColor.g),
                b: parseFloat(rgbColor.b),
            },
            opacity: parseFloat(rgbColor.a),
        };
    } else {
        const { url, bytesBase64, scaleMode, opacity } = image;
        if (url && bytesBase64) {
            throw new Error("node_set_fill: image requires exactly one of 'url' or 'bytesBase64'.");
        }
        if (!url && !bytesBase64) {
            throw new Error("node_set_fill: image requires exactly one of 'url' or 'bytesBase64'.");
        }

        let figmaImage;
        try {
            if (url) {
                try {
                    figmaImage = await figma.createImageAsync(url);
                } catch (e: any) {
                    if (e.message && (e.message.includes("is too large") || e.message.includes("type is unsupported") || e.message.includes("is too small"))) {
                        throw e;
                    }
                    throw new Error(`node_set_fill: could not fetch image from URL '${url}' (network/CORS). createImageAsync needs a directly fetchable, public URL to a PNG/JPEG/GIF.`);
                }
            } else {
                let bytes;
                try {
                    bytes = base64ToBytes(bytesBase64);
                } catch (e) {
                    throw new Error("node_set_fill: 'bytesBase64' is not valid base64. Provide base64-encoded raw PNG/JPEG/GIF bytes.");
                }
                figmaImage = figma.createImage(bytes);
            }
        } catch (e: any) {
            let msg = e.message || String(e);
            if (msg.startsWith("node_set_fill:")) {
                throw e;
            }
            throw new Error(`node_set_fill: Figma rejected the image — '${msg}'. Images must be PNG/JPEG/GIF, ≤4096px per side. PNG/JPEG bytes are auto-resized; this typically means an oversized 'url' image, an oversized GIF, or an unsupported/too-small image — pre-resize or convert it.`);
        }

        paintStyle = {
            type: "IMAGE",
            imageHash: figmaImage.hash,
            scaleMode: scaleMode || "FILL",
        };
        if (opacity !== undefined) {
            paintStyle.opacity = opacity;
        }
    }

    console.log("paintStyle", paintStyle);

    node.fills = [paintStyle];

    return {
        id: node.id,
        name: node.name,
        fills: [paintStyle],
    };
}

/**
 * Sets the stroke color and weight of a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the node to modify
 * @param {Object} params.color - Color object with r, g, b, a values (0-1)
 * @param {number} params.weight - Uniform stroke weight (default: 1)
 * @param {number} params.strokeTopWeight - Top stroke weight (optional)
 * @param {number} params.strokeBottomWeight - Bottom stroke weight (optional)
 * @param {number} params.strokeLeftWeight - Left stroke weight (optional)
 * @param {number} params.strokeRightWeight - Right stroke weight (optional)
 * @returns {Promise<Object>} Result with node info and applied strokes
 */
export async function setStroke(params: any) {
    const {
        nodeId,
        color: { r, g, b, a },
        weight = 1,
        strokeTopWeight,
        strokeBottomWeight,
        strokeLeftWeight,
        strokeRightWeight,
    } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (!("strokes" in node)) {
        throw new Error(`Node does not support strokes: ${nodeId}`);
    }

    // Create RGBA color
    const rgbColor: any = {
        r: r !== undefined ? r : 0,
        g: g !== undefined ? g : 0,
        b: b !== undefined ? b : 0,
        a: a !== undefined ? a : 1,
    };

    // Set stroke
    const paintStyle: any = {
        type: "SOLID",
        color: {
            r: rgbColor.r,
            g: rgbColor.g,
            b: rgbColor.b,
        },
        opacity: rgbColor.a,
    };

    node.strokes = [paintStyle];

    // Check if any individual stroke side weight is provided
    const hasIndividualWeights =
        strokeTopWeight !== undefined ||
        strokeBottomWeight !== undefined ||
        strokeLeftWeight !== undefined ||
        strokeRightWeight !== undefined;

    if (hasIndividualWeights) {
        // Set individual stroke side weights
        if ("strokeTopWeight" in node) {
            node.strokeTopWeight = strokeTopWeight !== undefined ? strokeTopWeight : 0;
            node.strokeBottomWeight = strokeBottomWeight !== undefined ? strokeBottomWeight : 0;
            node.strokeLeftWeight = strokeLeftWeight !== undefined ? strokeLeftWeight : 0;
            node.strokeRightWeight = strokeRightWeight !== undefined ? strokeRightWeight : 0;
        } else {
            throw new Error(`Node does not support individual stroke weights: ${nodeId}`);
        }
    } else if ("strokeWeight" in node) {
        // Set uniform stroke weight
        node.strokeWeight = weight;
    }

    // Build return value - handle figma.mixed Symbol for strokeWeight
    const strokeWeightValue = "strokeWeight" in node
        ? (node.strokeWeight === figma.mixed ? "mixed" : node.strokeWeight)
        : undefined;

    return {
        id: node.id,
        name: node.name,
        strokes: node.strokes,
        strokeWeight: strokeWeightValue,
        strokeTopWeight: "strokeTopWeight" in node ? node.strokeTopWeight : undefined,
        strokeBottomWeight: "strokeBottomWeight" in node ? node.strokeBottomWeight : undefined,
        strokeLeftWeight: "strokeLeftWeight" in node ? node.strokeLeftWeight : undefined,
        strokeRightWeight: "strokeRightWeight" in node ? node.strokeRightWeight : undefined,
    };
}

/**
 * Sets the corner radius of a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the node to modify
 * @param {number} params.radius - Corner radius value
 * @param {boolean[]} params.corners - Optional array of 4 booleans [topLeft, topRight, bottomRight, bottomLeft]
 * @returns {Promise<Object>} Result with node info and applied corner radii
 */
export async function setCornerRadius(params: any) {
    const { nodeId, radius, corners } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    if (radius === undefined) {
        throw new Error("Missing radius parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    // Check if node supports corner radius
    if (!("cornerRadius" in node)) {
        throw new Error(`Node does not support corner radius: ${nodeId}`);
    }

    // If corners array is provided, set individual corner radii
    if (corners && Array.isArray(corners) && corners.length === 4) {
        if ("topLeftRadius" in node) {
            // Node supports individual corner radii
            if (corners[0]) node.topLeftRadius = radius;
            if (corners[1]) node.topRightRadius = radius;
            if (corners[2]) node.bottomRightRadius = radius;
            if (corners[3]) node.bottomLeftRadius = radius;
        } else {
            // Node only supports uniform corner radius
            // @ts-ignore
            node.cornerRadius = radius;
        }
    } else {
        // Set uniform corner radius
        // @ts-ignore
        node.cornerRadius = radius;
    }

    return {
        id: node.id,
        name: node.name,
        cornerRadius: "cornerRadius" in node ? node.cornerRadius : undefined,
        topLeftRadius: "topLeftRadius" in node ? node.topLeftRadius : undefined,
        topRightRadius: "topRightRadius" in node ? node.topRightRadius : undefined,
        bottomRightRadius:
            "bottomRightRadius" in node ? node.bottomRightRadius : undefined,
        bottomLeftRadius:
            "bottomLeftRadius" in node ? node.bottomLeftRadius : undefined,
    };
}

/**
 * Sets effects (shadows, blurs) on a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the node to modify
 * @param {Array} params.effects - Array of effect objects
 * @returns {Promise<Object>} Result with node info and applied effects
 */
export function normalizeEffects(effects: any[]): any[] {
    return effects.map((effect: any) => {
        if (!effect.type) {
            throw new Error("Each effect must have a type (DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR)");
        }

        // Defaults for required fields if missing, to prevent crashes
        const baseEffect: any = {
            type: effect.type,
            visible: effect.visible !== undefined ? effect.visible : true,
        };

        if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
            const shadow: any = Object.assign({}, baseEffect, {
                color: effect.color || { r: 0, g: 0, b: 0, a: 0.25 },
                offset: effect.offset || { x: 0, y: 4 },
                radius: effect.radius !== undefined ? effect.radius : 4,
                spread: effect.spread !== undefined ? effect.spread : 0,
                blendMode: effect.blendMode || "NORMAL",
            });
            // showShadowBehindNode is a DROP_SHADOW-only property; Figma's runtime
            // rejects it on INNER_SHADOW ("Unrecognized key(s) ... 'showShadowBehindNode'").
            if (effect.type === "DROP_SHADOW") {
                shadow.showShadowBehindNode = effect.showShadowBehindNode !== undefined ? effect.showShadowBehindNode : false;
            }
            return shadow;
        } else if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
            return Object.assign({}, baseEffect, {
                radius: effect.radius !== undefined ? effect.radius : 4,
            });
        }

        return effect; // Pass through if it matches schema perfectly or is unknown type
    });
}

export async function setEffects(params: any) {
    const { nodeId, effects } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    if (!effects || !Array.isArray(effects)) {
        throw new Error("Missing effects parameter or it is not an array");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (!("effects" in node)) {
        throw new Error(`Node does not support effects: ${nodeId}`);
    }

    // Validate and process effects (basic validation)
    const processedEffects = normalizeEffects(effects);


    node.effects = processedEffects;

    return {
        id: node.id,
        name: node.name,
        effects: node.effects
    };
}
