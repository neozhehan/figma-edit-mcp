/**
 * Node modifier handlers for Figma plugin
 * Handles moving, resizing, deleting, and selecting nodes
 */

import { generateCommandId, sendProgressUpdate } from '../utils/progressUtils.js';
import { delay } from '../utils/helpers.js';
import { getContainingPageNode, isAncestorOf } from '../utils/nodeUtils.js';
import { batchEnvelope } from '../utils/batchResult.js';
import { describeError } from '../utils/errors.js';

/**
 * Moves and/or resizes a node (sets absolute coordinates and dimensions)
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of node to transform
 * @param {number} [params.x] - Optional new X position
 * @param {number} [params.y] - Optional new Y position
 * @param {number} [params.width] - Optional new width
 * @param {number} [params.height] - Optional new height
 * @returns {Promise<Object>} Updated node info
 */
export async function transformNode(params: any) {
    const { nodeId, x, y, width, height } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    const warnings: string[] = [];

    // Apply X and Y if provided
    if (x !== undefined || y !== undefined) {
        if (!("x" in node) || !("y" in node)) {
            throw new Error(`Node does not support position: ${nodeId}`);
        }
        
        const parent = node.parent;
        if (parent && "layoutMode" in parent && (parent as any).layoutMode !== "NONE") {
            const isAbsolute = "layoutPositioning" in node && (node as any).layoutPositioning === "ABSOLUTE";
            if (!isAbsolute) {
                throw new Error(`Operation Denied: Cannot set x/y on node '${node.name}' because its parent ('${parent.name}') has Auto-layout applied and the node is not absolutely positioned. To reposition this node, either change its order in the parent's children array, set its layoutPositioning to "ABSOLUTE", or remove Auto-layout from the parent.`);
            }
        }

        if (x !== undefined) node.x = x;
        if (y !== undefined) node.y = y;
    }

    // Apply width and height if provided
    if (width !== undefined || height !== undefined) {
        if (!("resize" in node)) {
            throw new Error(`Node does not support resizing: ${nodeId}`);
        }
        
        let newWidth = width !== undefined ? width : (node as any).width;
        let newHeight = height !== undefined ? height : (node as any).height;

        const parent = node.parent;
        if (parent && "layoutMode" in parent && (parent as any).layoutMode !== "NONE") {
            const isAbsolute = "layoutPositioning" in node && (node as any).layoutPositioning === "ABSOLUTE";
            if (!isAbsolute) {
                if (width !== undefined && "layoutSizingHorizontal" in node && (node as any).layoutSizingHorizontal !== "FIXED") {
                    warnings.push(`Horizontal resize applied to '${node.name}', which reverted its layoutSizingHorizontal from ${(node as any).layoutSizingHorizontal} to FIXED.`);
                }
                if (height !== undefined && "layoutSizingVertical" in node && (node as any).layoutSizingVertical !== "FIXED") {
                    warnings.push(`Vertical resize applied to '${node.name}', which reverted its layoutSizingVertical from ${(node as any).layoutSizingVertical} to FIXED.`);
                }
            }
        } else if (!parent || ("layoutMode" in parent && (parent as any).layoutMode === "NONE")) {
            // Also warn if we resize a node itself that has auto-layout hugging, which breaks the hug.
            if (width !== undefined && "layoutSizingHorizontal" in node && (node as any).layoutSizingHorizontal !== "FIXED") {
                warnings.push(`Horizontal resize applied to '${node.name}', which reverted its layoutSizingHorizontal from ${(node as any).layoutSizingHorizontal} to FIXED.`);
            }
            if (height !== undefined && "layoutSizingVertical" in node && (node as any).layoutSizingVertical !== "FIXED") {
                warnings.push(`Vertical resize applied to '${node.name}', which reverted its layoutSizingVertical from ${(node as any).layoutSizingVertical} to FIXED.`);
            }
        }

        node.resize(newWidth, newHeight);
    }

    const result: any = {
        id: node.id,
        name: node.name,
        x: "x" in node ? node.x : undefined,
        y: "y" in node ? node.y : undefined,
        width: "width" in node ? node.width : undefined,
        height: "height" in node ? node.height : undefined,
    };
    if (warnings.length > 0) result.warnings = warnings;
    return result;
}

/**
 * Deletes multiple nodes with progress tracking
 * @param {Object} params - Parameters object
 * @param {string[]} params.nodeIds - Array of node IDs to delete
 * @returns {Promise<Object>} Deletion results
 */
export async function deleteMultipleNodes(params: any) {
    const { nodeIds } = params || {};
    const commandId = generateCommandId();

    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
        const errorMsg = "Missing or invalid nodeIds parameter";
        await sendProgressUpdate(
            commandId,
            "node_delete",
            "error",
            0,
            0,
            0,
            errorMsg,
            { error: errorMsg }
        );
        throw new Error(errorMsg);
    }

    console.log(`Starting deletion of ${nodeIds.length} nodes`);

    // Send started progress update
    await sendProgressUpdate(
        commandId,
        "node_delete",
        "started",
        0,
        nodeIds.length,
        0,
        `Starting deletion of ${nodeIds.length} nodes`,
        { requestedCount: nodeIds.length }
    );

    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process nodes in chunks of 50 to avoid overwhelming Figma
    const CHUNK_SIZE = 50;
    const chunks: any[] = [];

    for (let i = 0; i < nodeIds.length; i += CHUNK_SIZE) {
        chunks.push(nodeIds.slice(i, i + CHUNK_SIZE));
    }

    console.log(`Split ${nodeIds.length} deletions into ${chunks.length} chunks`);

    // Send chunking info update
    await sendProgressUpdate(
        commandId,
        "node_delete",
        "in_progress",
        5,
        nodeIds.length,
        0,
        `Preparing to delete ${nodeIds.length} nodes using ${chunks.length} chunks`,
        {
            requestedCount: nodeIds.length,
            chunks: chunks.length,
            chunkSize: CHUNK_SIZE,
        }
    );

    // Process each chunk sequentially
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        console.log(
            `Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length
            } nodes`
        );

        // Send chunk processing start update
        await sendProgressUpdate(
            commandId,
            "node_delete",
            "in_progress",
            Math.round(5 + (chunkIndex / chunks.length) * 90),
            nodeIds.length,
            successCount + failureCount,
            `Processing deletion chunk ${chunkIndex + 1}/${chunks.length}`,
            {
                currentChunk: chunkIndex + 1,
                totalChunks: chunks.length,
                // Q26/R9: progress uses the shared envelope count names — no second
                // count vocabulary. Local vars stay `successCount`/`failureCount`.
                succeededCount: successCount,
                failedCount: failureCount,
            }
        );

        // Process deletions within a chunk in parallel
        const chunkPromises = chunk.map(async (nodeId: any) => {
            try {
                const node = await figma.getNodeByIdAsync(nodeId);

                if (!node) {
                    console.error(`Node not found: ${nodeId}`);
                    return {
                        success: false,
                        nodeId: nodeId,
                        error: `Node not found: ${nodeId}`,
                    };
                }

                // Save node info before deleting
                const nodeInfo: any = {
                    id: node.id,
                    name: node.name,
                    type: node.type,
                };

                // Delete the node
                node.remove();

                console.log(`Successfully deleted node: ${nodeId}`);
                return {
                    success: true,
                    nodeId: nodeId,
                    nodeInfo: nodeInfo,
                };
            } catch (error: any) {
                const errorMessage = describeError(error);
                console.error(`Error deleting node ${nodeId}: ${errorMessage}`);
                return {
                    success: false,
                    nodeId: nodeId,
                    error: errorMessage,
                };
            }
        });

        // Wait for all deletions in this chunk to complete
        const chunkResults = await Promise.all(chunkPromises);

        // Process results for this chunk
        chunkResults.forEach((result: any) => {
            if (result.success) {
                successCount++;
            } else {
                failureCount++;
            }
            results.push(result);
        });

        // Send chunk processing complete update
        await sendProgressUpdate(
            commandId,
            "node_delete",
            "in_progress",
            Math.round(5 + ((chunkIndex + 1) / chunks.length) * 90),
            nodeIds.length,
            successCount + failureCount,
            `Completed chunk ${chunkIndex + 1}/${chunks.length
            }. ${successCount} successful, ${failureCount} failed so far.`,
            {
                currentChunk: chunkIndex + 1,
                totalChunks: chunks.length,
                // Q26/R9: shared envelope count names in progress, not a second vocabulary.
                succeededCount: successCount,
                failedCount: failureCount,
                chunkResults: chunkResults,
            }
        );

        // Add a small delay between chunks
        if (chunkIndex < chunks.length - 1) {
            console.log("Pausing between chunks...");
            await delay(20);
        }
    }

    console.log(
        `Deletion complete: ${successCount} successful, ${failureCount} failed`
    );

    // Send completed progress update
    await sendProgressUpdate(
        commandId,
        "node_delete",
        "completed",
        100,
        nodeIds.length,
        successCount + failureCount,
        `Node deletion complete: ${successCount} successful, ${failureCount} failed`,
        {
            // Q26: only the shared envelope counts in the progress payload.
            requestedCount: nodeIds.length,
            succeededCount: successCount,
            failedCount: failureCount,
            completedInChunks: chunks.length,
            results: results,
        }
    );

    // Q25: shared row vocabulary (nodeId/status/error); nodeInfo stays additive.
    const formattedResults = results.map((r: any) => ({
        success: r.success,
        status: r.success ? "success" : "failed",
        nodeId: r.nodeId,
        error: r.error,
        nodeInfo: r.nodeInfo
    }));

    // Q26: shared envelope counts only — `nodesDeleted`/`nodesFailed` dropped.
    return {
        ...batchEnvelope(nodeIds.length, successCount, failureCount, 0),
        results: formattedResults,
        completedInChunks: chunks.length,
        commandId,
    };
}

/**
 * Navigates the editor view to a page or node(s).
 * @param {Object} params - Parameters object
 * @param {string[]} params.ids - Array of target IDs
 * @returns {Promise<Object>} Navigation result
 */
export async function viewNavigate(params: any) {
    if (!params || !params.ids || !Array.isArray(params.ids)) {
        throw new Error("Missing or invalid ids parameter");
    }

    if (params.ids.length === 0) {
        throw new Error("ids array cannot be empty");
    }

    // Resolve all ids first
    const resolvedNodes: any[] = [];
    const pageNodes: any[] = [];

    for (const id of params.ids) {
        const node = await figma.getNodeByIdAsync(id);
        if (!node) {
            throw new Error(`Node not found with ID: ${id}`);
        }
        if (node.type === 'DOCUMENT') {
            throw new Error("Cannot navigate to DOCUMENT root");
        }
        if (node.type === 'PAGE') {
            pageNodes.push(node);
        } else {
            resolvedNodes.push(node);
        }
    }

    // Branch by resolved types
    if (pageNodes.length > 0) {
        // Validation: cannot mix pages and nodes, or have multiple pages
        if (pageNodes.length > 1 || resolvedNodes.length > 0) {
            throw new Error("Cannot navigate to mixed targets or multiple pages");
        }
        const page = pageNodes[0];
        await figma.setCurrentPageAsync(page);
        return {
            pageId: page.id,
            pageName: page.name
        };
    } else {
        // All targets are scene nodes. Resolve containing page node for each
        const pages = resolvedNodes.map(node => {
            const page = getContainingPageNode(node);
            if (!page) {
                throw new Error(`Node ${node.id} is detached and not on a page`);
            }
            return page;
        });

        // Ensure all nodes share the same page
        const firstPage = pages[0];
        for (const page of pages) {
            if (page.id !== firstPage.id) {
                throw new Error("Selected nodes must belong to the same page");
            }
        }

        // Switch page first
        await figma.setCurrentPageAsync(firstPage);

        // Set selection
        figma.currentPage.selection = resolvedNodes;

        // Scroll and zoom into view
        figma.viewport.scrollAndZoomIntoView(resolvedNodes);

        const selectedNodes = resolvedNodes.map((node: any) => ({
            name: node.name,
            id: node.id
        }));

        return {
            success: true,
            count: resolvedNodes.length,
            selectedNodes: selectedNodes,
            message: `Selected ${resolvedNodes.length} nodes`
        };
    }
}

/**
 * Sets the name of a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of node to rename
 * @param {string} params.name - New name for the node
 * @returns {Promise<Object>} Updated node info
 */
export async function setNodeName(params: any) {
    const { nodeId, name } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    if (name === undefined) {
        throw new Error("Missing name parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    const oldName = node.name;
    node.name = name;

    return {
        id: node.id,
        name: node.name,
        oldName: oldName,
    };
}

/**
 * Groups nodes together
 * @param {Object} params - Parameters object
 * @param {Array<{nodeId: string, nodeName: string}>} params.nodes - Nodes to group
 * @param {string} [params.name] - Optional name for the group
 * @returns {Promise<Object>} Group info
 */
export async function groupNodes(params: any) {
    const { nodes, name } = params;

    if (!nodes || nodes.length < 2) {
        throw new Error("At least 2 nodes are required to create a group");
    }

    // Collect all nodes
    const resolvedNodes: any[] = [];
    for (const { nodeId } of nodes) {
        const node = await figma.getNodeByIdAsync(nodeId);
        if (node) resolvedNodes.push(node);
    }

    if (resolvedNodes.length < 2) {
        throw new Error("Could not resolve enough nodes to group");
    }

    // Verify all nodes have the same parent
    const parent = resolvedNodes[0].parent;
    if (!parent) {
        throw new Error("Nodes must have a parent to be grouped");
    }

    for (const node of resolvedNodes) {
        if (node.parent !== parent) {
            throw new Error("All nodes must have the same parent to be grouped");
        }
    }

    const group = figma.group(resolvedNodes, parent);
    if (name) group.name = name;

    return { id: group.id, name: group.name, childCount: group.children.length };
}

/**
 * Ungroups a group
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - Group ID
 * @returns {Promise<Object>} Ungroup info
 */
export async function ungroupNodes(params: any) {
    const { nodeId } = params;

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) throw new Error(`Node not found with ID: ${nodeId}`);

    if (node.type !== "GROUP") {
        throw new Error(`Node is not a group (got ${node.type})`);
    }

    const parent = node.parent;
    const children = [...node.children]; // Snapshot children before ungrouping
    const childIds = children.map((c: any) => ({ id: c.id, name: c.name }));

    figma.ungroup(node);

    return { ungroupedChildren: childIds, parentId: parent ? parent.id : null };
}

/**
 * Flattens a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - Node ID
 * @returns {Promise<Object>} Flattened node info
 */
export async function flattenNode(params: any) {
    const { nodeId } = params;

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) throw new Error(`Node not found with ID: ${nodeId}`);

    // Note: flatten() is destructive and replaces the node
    const flattened = figma.flatten([node]);

    return { id: flattened.id, name: flattened.name, type: flattened.type };
}

/**
 * Reparents a node (inserts child)
 * @param {Object} params - Parameters object
 * @param {string} params.parentId - New parent ID
 * @param {string} params.childId - Child ID
 * @param {number} [params.index] - Index to insert at
 * @returns {Promise<Object>} Operation info
 */
export async function insertChild(params: any) {
    const { parentId, childId, index } = params;

    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent) throw new Error(`Parent not found: ${parentId}`);

    if (!('children' in parent)) {
        throw new Error(`Parent node cannot have children (type: ${parent.type})`);
    }

    const child = await figma.getNodeByIdAsync(childId);
    if (!child) throw new Error(`Child not found: ${childId}`);

    if (parentId === childId) {
        throw new Error(`Operation Denied: A node cannot be inserted into itself.`);
    }

    if (isAncestorOf(child, parent)) {
        throw new Error(`Operation Denied: Cannot insert node '${child.name}' into '${parent.name}' — the parent is a descendant of the node (cyclic hierarchy).`);
    }

    if (child.type === 'PAGE' && parent.type !== 'DOCUMENT') {
        throw new Error(`Operation Denied: A PAGE node can only be inserted into a DOCUMENT.`);
    }
    if (child.type !== 'PAGE' && parent.type === 'DOCUMENT') {
        throw new Error(`Operation Denied: Only PAGE nodes can be inserted directly into a DOCUMENT.`);
    }

    // Perform reparenting
    if (index !== undefined) {
        const length = (parent as any).children.length;
        if (index < 0 || index > length) {
            throw new Error(`Operation Denied: index ${index} is out of range for parent '${parent.name}' (valid: 0–${length}). Omit 'index' to append.`);
        }
        // @ts-expect-error TS2345: Argument of type 'DocumentNode | PageNode | SceneNode' is not assignable to parameter of type 'never'.
        parent.insertChild(index, child);
    } else {
        // @ts-expect-error TS2345: Argument of type 'DocumentNode | PageNode | SceneNode' is not assignable to parameter of type 'never'.
        parent.appendChild(child);
    }

    // @ts-expect-error TS2345: Argument of type 'DocumentNode | PageNode | SceneNode' is not assignable to parameter of type 'never'.
    return { childId: child.id, newParentId: parent.id, index: parent.children.indexOf(child) };
}
