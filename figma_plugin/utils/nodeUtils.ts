/**
 * Node utility functions for Figma plugin
 */

import { rgbaToHex } from './colorUtils.js';
import { PathTuple } from '../../src/shared/nodeTypes.js';
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
    // @ts-expect-error TS2345: traversal stack entry object literal is not assignable to the parameter's declared type
    nodesToProcess.push({
        node: node,
        parentPath: nodePath,
        depth: depth,
    });

    // Recursively add children
    if ("children" in node) {
        for (const child of node.children) {
            // @ts-expect-error TS2345: Argument of type 'any[]' is not assignable to parameter of type 'never[]'.
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

/**
 * Returns the node itself or nearest ancestor with locked === true, else null.
 */
export function findLockedAncestor(node: any): any | null {
    let current = node;
    while (current && current.type !== 'DOCUMENT') {
        if (current.locked === true) {
            return current;
        }
        current = current.parent;
    }
    return null;
}

/**
 * Returns the nearest ancestor (excluding the node itself) of type INSTANCE, else null.
 */
export function findInstanceAncestor(node: any): any | null {
    let current = node?.parent;
    while (current && current.type !== 'DOCUMENT') {
        if (current.type === 'INSTANCE') {
            return current;
        }
        current = current.parent;
    }
    return null;
}

/**
 * Throws the canonical locked-layer denial when the node or an ancestor is locked.
 */
export function assertNotLocked(node: any) {
    const lockedAncestor = findLockedAncestor(node);
    if (lockedAncestor) {
        throw new Error(`Operation Denied: Node '${node.name}' (or one of its ancestors, '${lockedAncestor.name}') is locked. Unlock the layer in Figma, or ask the user to unlock it, before editing.`);
    }
}

/**
 * Throws the canonical instance-interior denial when the node is inside a
 * component instance. Excludes the node itself — parent-side checks that must
 * also reject the node being an INSTANCE use assertNotInstanceParent.
 */
export function assertNotInstanceInterior(node: any, verb: string) {
    const instanceAncestor = findInstanceAncestor(node);
    if (instanceAncestor) {
        throw new Error(`Operation Denied: Node '${node.name}' is inside a component instance ('${instanceAncestor.name}') and cannot be ${verb} directly. Edit the main component, or use instance overrides.`);
    }
}

/**
 * Include-self variant for parent-side instance checks (v2.3.2 parent-is-instance
 * rule): rejects a parent that IS an INSTANCE node as well as one inside an
 * instance interior.
 */
export function assertNotInstanceParent(parent: any, verb: string) {
    if (parent.type === "INSTANCE") {
        throw new Error(`Operation Denied: Node '${parent.name}' is a component instance and cannot be ${verb} directly. Edit the main component, or use instance overrides.`);
    }
    assertNotInstanceInterior(parent, verb);
}

/**
 * Walks node.parent up; true if maybeAncestor is encountered.
 */
export function isAncestorOf(maybeAncestor: any, node: any): boolean {
    if (!maybeAncestor || !node) return false;
    let current = node?.parent;
    while (current && current.type !== 'DOCUMENT') {
        if (current.id === maybeAncestor.id) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

/**
 * Removes a created-but-uncommitted node during D11 cleanup, best-effort.
 *
 * Cleanup runs on the failure path, so a throwing `remove()` would REPLACE the
 * error that actually caused the failure — the caller would be told the cleanup
 * complaint instead of the real cause. Removal failure is therefore reported to
 * the console and swallowed, the same rule notification and progress delivery
 * follow (C3/R14/R15): recovery machinery may not become a second failure.
 *
 * Returns true when the node is known to be gone, so a caller that must decide
 * whether the document was left changed (Q32) can branch on the real outcome.
 */
export function removeUncommitted(node: any, context: string): boolean {
    if (!node) return true;
    if ((node as any).removed === true) return true;
    if (typeof node.remove !== "function") return false;
    try {
        node.remove();
        return true;
    } catch (cleanupError: any) {
        console.error(`${context}: failed to remove the uncommitted node during cleanup`, cleanupError);
        return false;
    }
}
