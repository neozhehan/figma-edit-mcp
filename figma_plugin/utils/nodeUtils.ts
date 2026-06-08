/**
 * Node utility functions for Figma plugin
 */

import { rgbaToHex } from './colorUtils.js';
import { PathTuple } from '../../shared/nodeTypes.js';
import { NODE_DATA_FIELDS } from './nodeFields.generated.js';

/**
 * Property names readable directly from a Figma node without an exportAsync.
 *
 * The data fields are GENERATED from `@figma/plugin-typings` (run
 * `bun run gen:node-fields`) so this set can't drift from the official API and
 * covers every node field (e.g. `pointCount`, `innerRadius`, `arcData`).
 *
 * The node-reference fields below are added back so requesting only references
 * doesn't trigger an export — `extractProperties` serializes them to `id` /
 * `id[]` / `{id,name}` before they reach `postMessage`, so they're never
 * returned as raw host objects (DataCloneError). Other node-typed fields (e.g.
 * `defaultVariant`) are intentionally absent from the data set so they can't be
 * read raw.
 */
const RESOLVED_NODE_REFS = [
    "parent", "mainComponent", "instances", "exposedInstances", "stuckNodes", "attachedConnectors",
];
export const SAFE_LIST_PROPERTIES: ReadonlySet<string> = new Set([
    "id", "name", "type", "children",
    ...NODE_DATA_FIELDS,
    ...RESOLVED_NODE_REFS,
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
 * Resolves the containing page of a node.
 * If the node itself is of type 'PAGE', returns the node itself.
 * Otherwise walks node.parent until it reaches the containing PAGE.
 * Returns null if the node is not under a page (e.g. detached or DOCUMENT root).
 */
export function getContainingPageNode(node: any): any | null {
    let current = node;
    while (current) {
        if (current.type === 'PAGE') {
            return current;
        }
        if (current.type === 'DOCUMENT') {
            return null;
        }
        current = current.parent;
    }
    return null;
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

