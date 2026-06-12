/**
 * Layout handlers for Figma plugin
 * Handles auto-layout related operations
 */

/**
 * Sets auto-layout properties for a frame.
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the node to modify
 * @param {string} [params.layoutMode] - Layout mode (NONE, HORIZONTAL, VERTICAL)
 * @param {string} [params.layoutWrap] - Wrap behavior (NO_WRAP, WRAP)
 * @param {number} [params.paddingTop] - Top padding value
 * @param {number} [params.paddingRight] - Right padding value
 * @param {number} [params.paddingBottom] - Bottom padding value
 * @param {number} [params.paddingLeft] - Left padding value
 * @param {string} [params.primaryAxisAlignItems] - Primary axis alignment (MIN, MAX, CENTER, SPACE_BETWEEN)
 * @param {string} [params.counterAxisAlignItems] - Counter axis alignment (MIN, MAX, CENTER, BASELINE)
 * @param {string} [params.layoutSizingHorizontal] - Horizontal sizing (FIXED, HUG, FILL)
 * @param {string} [params.layoutSizingVertical] - Vertical sizing (FIXED, HUG, FILL)
 * @param {number} [params.itemSpacing] - Space between children
 * @param {number} [params.counterAxisSpacing] - Space between wrapped rows/columns
 * @returns {Promise<Object>} Result with node info and applied settings
 */
export async function setAutoLayout(params: any) {
    const {
        nodeId,
        layoutMode,
        layoutWrap,
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        primaryAxisAlignItems,
        counterAxisAlignItems,
        layoutSizingHorizontal,
        layoutSizingVertical,
        itemSpacing,
        counterAxisSpacing
    } = params || {};

    // Get the target node
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node with ID ${nodeId} not found`);
    }

    // Check if node is a frame or component that supports auto-layout
    if (
        node.type !== "FRAME" &&
        node.type !== "COMPONENT" &&
        node.type !== "COMPONENT_SET" &&
        node.type !== "INSTANCE"
    ) {
        throw new Error(`Node type ${node.type} does not support auto-layout properties`);
    }

    // 1. Set Layout Mode & Wrap
    // Setting layoutMode to NONE disables auto-layout, so other properties shouldn't be set if it's currently NONE and not being changed, 
    // or if it's being set to NONE.
    if (layoutMode !== undefined) {
        node.layoutMode = layoutMode;
    }

    if (layoutWrap !== undefined) {
        if (node.layoutMode === "NONE") {
            // If layoutMode is NONE, we can't set wrap. 
            // However, if we just set it to HORIZONTAL/VERTICAL above, we are fine.
        } else {
            node.layoutWrap = layoutWrap;
        }
    }

    // Check if we are in auto-layout mode before setting internal layout properties
    const isNone = node.layoutMode === "NONE";
    const internalProps = [paddingTop, paddingRight, paddingBottom, paddingLeft, primaryAxisAlignItems, counterAxisAlignItems, itemSpacing, counterAxisSpacing, layoutWrap];
    
    if (isNone && internalProps.some(p => p !== undefined)) {
        throw new Error(`Operation Denied: Cannot apply padding, alignment, wrap, or spacing to '${node.name}' because its layoutMode is NONE (it is not an Auto-layout frame).`);
    }

    // 2. Set Padding
    if (!isNone) {
        if (paddingTop !== undefined) node.paddingTop = paddingTop;
        if (paddingRight !== undefined) node.paddingRight = paddingRight;
        if (paddingBottom !== undefined) node.paddingBottom = paddingBottom;
        if (paddingLeft !== undefined) node.paddingLeft = paddingLeft;
    }


    // 3. Set Axis Alignment
    if (!isNone) {
        if (primaryAxisAlignItems !== undefined) {
            if (!["MIN", "MAX", "CENTER", "SPACE_BETWEEN"].includes(primaryAxisAlignItems)) {
                throw new Error("Invalid primaryAxisAlignItems value");
            }
            node.primaryAxisAlignItems = primaryAxisAlignItems;
        }

        if (counterAxisAlignItems !== undefined) {
            if (!["MIN", "MAX", "CENTER", "BASELINE"].includes(counterAxisAlignItems)) {
                throw new Error("Invalid counterAxisAlignItems value");
            }
            if (counterAxisAlignItems === "BASELINE" && node.layoutMode !== "HORIZONTAL") {
                throw new Error("BASELINE alignment is only valid for horizontal auto-layout frames");
            }
            node.counterAxisAlignItems = counterAxisAlignItems;
        }
    }

    // 4. Set Layout Sizing (Controls how this node behaves in its parent)
    if (layoutSizingHorizontal !== undefined) {
        if (!["FIXED", "HUG", "FILL"].includes(layoutSizingHorizontal)) {
            throw new Error("Invalid layoutSizingHorizontal value");
        }
        if (layoutSizingHorizontal === "FILL") {
            const parent = node.parent;
            if (!parent || !("layoutMode" in parent) || (parent as any).layoutMode === "NONE") {
                const parentMode = parent && "layoutMode" in parent ? (parent as any).layoutMode : "NONE";
                const parentName = parent ? parent.name : "(none)";
                throw new Error(`Operation Denied: Sizing 'FILL' requires the parent to be an Auto-Layout frame (layoutMode HORIZONTAL or VERTICAL). Parent '${parentName}' has layoutMode '${parentMode}'.`);
            }
        }
        node.layoutSizingHorizontal = layoutSizingHorizontal;
    }

    if (layoutSizingVertical !== undefined) {
        if (!["FIXED", "HUG", "FILL"].includes(layoutSizingVertical)) {
            throw new Error("Invalid layoutSizingVertical value");
        }
        if (layoutSizingVertical === "FILL") {
            const parent = node.parent;
            if (!parent || !("layoutMode" in parent) || (parent as any).layoutMode === "NONE") {
                const parentMode = parent && "layoutMode" in parent ? (parent as any).layoutMode : "NONE";
                const parentName = parent ? parent.name : "(none)";
                throw new Error(`Operation Denied: Sizing 'FILL' requires the parent to be an Auto-Layout frame (layoutMode HORIZONTAL or VERTICAL). Parent '${parentName}' has layoutMode '${parentMode}'.`);
            }
        }
        node.layoutSizingVertical = layoutSizingVertical;
    }

    // 5. Set Spacing
    if (!isNone) {
        if (itemSpacing !== undefined) {
            node.itemSpacing = itemSpacing;
        }

        if (counterAxisSpacing !== undefined) {
            if (node.layoutWrap === "WRAP") {
                node.counterAxisSpacing = counterAxisSpacing;
            } else {
                throw new Error("Counter axis spacing can only be set on frames with layoutWrap set to WRAP");
            }
        }
    }

    return {
        id: node.id,
        name: node.name,
        layoutMode: node.layoutMode,
        layoutWrap: node.layoutWrap,
        // Return other properties? Maybe just name/id/mode is enough. 
        // Let's return what we have in the original implementation sort of.
    };
}
