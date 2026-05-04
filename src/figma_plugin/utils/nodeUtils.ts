/**
 * Node utility functions for Figma plugin
 */

import { rgbaToHex } from './colorUtils.js';

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
