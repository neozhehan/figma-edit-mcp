/**
 * Node utility functions for Figma plugin
 */

import { rgbaToHex } from './colorUtils.js';
import { PathTuple } from '../../shared/nodeTypes.js';

/**
 * Constant set of property names that can be read directly from a Figma node
 * without requiring an expensive exportAsync call.
 */
export const SAFE_LIST_PROPERTIES: ReadonlySet<string> = new Set([
    // Identity & structure
    "id", "name", "type", "parent", "key", "expanded",
    // Visibility
    "visible", "locked", "opacity", "blendMode", "isMask", "maskType",
    // Geometry & transform
    "x", "y", "width", "height", "rotation", "absoluteBoundingBox", "absoluteRenderBounds", "absoluteTransform", "relativeTransform", "constrainProportions",
    // Auto-layout
    "layoutMode", "layoutAlign", "layoutGrow", "layoutPositioning", "layoutWrap", "layoutSizingHorizontal", "layoutSizingVertical", "primaryAxisAlignItems", "primaryAxisSizingMode", "counterAxisAlignItems", "counterAxisSizingMode", "counterAxisSpacing", "counterAxisAlignContent", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "itemSpacing", "minWidth", "maxWidth", "minHeight", "maxHeight", "clipsContent",
    // Constraints
    "constraints",
    // Corner radius
    "cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius", "cornerSmoothing",
    // Fills & strokes
    "fills", "fillStyleId", "strokes", "strokeStyleId", "strokeWeight", "strokeAlign", "strokeCap", "strokeJoin", "strokeMiterLimit", "dashPattern", "strokeLeftWeight", "strokeRightWeight", "strokeTopWeight", "strokeBottomWeight",
    // Effects
    "effects", "effectStyleId",
    // Text
    "characters", "fontSize", "fontName", "fontWeight", "lineHeight", "letterSpacing", "paragraphIndent", "paragraphSpacing", "listSpacing", "textCase", "textDecoration", "textAlignHorizontal", "textAlignVertical", "textAutoResize", "autoRename", "maxLines", "textTruncation", "hangingPunctuation", "hangingList", "leadingTrim", "hasMissingFont", "hyperlink",
    // Component / instance
    "componentProperties", "componentPropertyDefinitions", "componentPropertyReferences", "variantProperties", "overrides", "exposedInstances", "isExposedInstance", "scaleFactor", "mainComponent",
    // Prototyping
    "reactions", "transitionNodeID", "transitionDuration", "transitionEasing",
    // Variables
    "boundVariables", "explicitVariableModes",
    // Export & dev metadata
    "exportSettings", "devStatus", "annotations"
]);


/**
 * Filters and transforms a Figma node for serialization
 * @param {SceneNode} node - Figma node to filter
 * @returns {Object|null} Filtered node object or null for VECTOR nodes
 */
export function filterFigmaNode(node: any, fields?: string[]) {
    if (node.type === "VECTOR") {
        return null;
    }

    var filtered: any = {
        id: node.id,
        name: node.name,
        type: node.type,
    };

    if (fields && Array.isArray(fields)) {
        for (const field of fields) {
            if (field in node && field !== "id" && field !== "name" && field !== "type" && field !== "children") {
                filtered[field] = node[field];
            }
        }
    }

    if (node.children) {
        filtered.children = node.children
            .map((child: any) => {
                return filterFigmaNode(child, fields);
            })
            .filter((child: any) => {
                return child !== null;
            });
    }

    return filtered;
}

/**
 * Collects all nodes that need to be processed recursively
 * @param {SceneNode} node - Root node to start from
 * @param {Array} parentPath - Path to parent node
 * @param {number} depth - Current depth level
 * @param {Array} nodesToProcess - Array to collect nodes
 */
export async function collectNodesToProcess(
    node: any,
    parentPath = [],
    depth = 0,
    nodesToProcess = []
) {
    // Skip invisible nodes
    if (node.visible === false) return;

    // Get the path to this node
    const nodePath = [...parentPath, node.name || `Unnamed ${node.type}`];

    // Add this node to the processing list
    // @ts-ignore
    nodesToProcess.push({
        node: node,
        parentPath: nodePath,
        depth: depth,
    });

    // Recursively add children
    if ("children" in node) {
        for (const child of node.children) {
            // @ts-ignore
            await collectNodesToProcess(child, nodePath, depth + 1, nodesToProcess);
        }
    }
}

/**
 * Builds the full ancestor chain from the containing page down to the immediate parent.
 * Pages return []. Direct children of a page return [[pageType, pageId, pageName]].
 * The node itself is NOT included in the path.
 */
export function buildPathArray(node: any): PathTuple[] {
    const path: PathTuple[] = [];
    let current = node.parent;

    while (current && current.type !== 'DOCUMENT') {
        path.unshift([current.type as string, current.id as string, current.name as string]);
        if (current.type === 'PAGE') break;
        current = current.parent;
    }

    return path;
}

/**
 * Performs a synchronous recursive walk of node.children to count all descendants.
 * Does not include the node itself.
 */
export function countDescendants(node: any): number {
    let count = 0;
    if (node && 'children' in node && Array.isArray(node.children)) {
        for (const child of node.children) {
            count += 1 + countDescendants(child);
        }
    }
    return count;
}

