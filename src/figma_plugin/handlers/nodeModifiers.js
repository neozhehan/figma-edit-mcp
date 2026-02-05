/**
 * Node modifier handlers for Figma plugin
 * Handles moving, resizing, deleting, and selecting nodes
 */

import { generateCommandId, sendProgressUpdate } from '../utils/progressUtils.js';
import { delay } from '../utils/helpers.js';

/**
 * Moves a node to a new position
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of node to move
 * @param {number} params.x - New X position
 * @param {number} params.y - New Y position
 * @returns {Promise<Object>} Updated node info
 */
export async function moveNode(params) {
    const { nodeId, x, y } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    if (x === undefined || y === undefined) {
        throw new Error("Missing x or y parameters");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (!("x" in node) || !("y" in node)) {
        throw new Error(`Node does not support position: ${nodeId}`);
    }

    node.x = x;
    node.y = y;

    return {
        id: node.id,
        name: node.name,
        x: node.x,
        y: node.y,
    };
}

/**
 * Resizes a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of node to resize
 * @param {number} params.width - New width
 * @param {number} params.height - New height
 * @returns {Promise<Object>} Updated node info
 */
export async function resizeNode(params) {
    const { nodeId, width, height } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    if (width === undefined || height === undefined) {
        throw new Error("Missing width or height parameters");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (!("resize" in node)) {
        throw new Error(`Node does not support resizing: ${nodeId}`);
    }

    node.resize(width, height);

    return {
        id: node.id,
        name: node.name,
        width: node.width,
        height: node.height,
    };
}

/**
 * Deletes multiple nodes with progress tracking
 * @param {Object} params - Parameters object
 * @param {string[]} params.nodeIds - Array of node IDs to delete
 * @returns {Promise<Object>} Deletion results
 */
export async function deleteMultipleNodes(params) {
    const { nodeIds } = params || {};
    const commandId = generateCommandId();

    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
        const errorMsg = "Missing or invalid nodeIds parameter";
        sendProgressUpdate(
            commandId,
            "delete_multiple_nodes",
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
    sendProgressUpdate(
        commandId,
        "delete_multiple_nodes",
        "started",
        0,
        nodeIds.length,
        0,
        `Starting deletion of ${nodeIds.length} nodes`,
        { totalNodes: nodeIds.length }
    );

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Process nodes in chunks of 50 to avoid overwhelming Figma
    const CHUNK_SIZE = 50;
    const chunks = [];

    for (let i = 0; i < nodeIds.length; i += CHUNK_SIZE) {
        chunks.push(nodeIds.slice(i, i + CHUNK_SIZE));
    }

    console.log(`Split ${nodeIds.length} deletions into ${chunks.length} chunks`);

    // Send chunking info update
    sendProgressUpdate(
        commandId,
        "delete_multiple_nodes",
        "in_progress",
        5,
        nodeIds.length,
        0,
        `Preparing to delete ${nodeIds.length} nodes using ${chunks.length} chunks`,
        {
            totalNodes: nodeIds.length,
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
        sendProgressUpdate(
            commandId,
            "delete_multiple_nodes",
            "in_progress",
            Math.round(5 + (chunkIndex / chunks.length) * 90),
            nodeIds.length,
            successCount + failureCount,
            `Processing deletion chunk ${chunkIndex + 1}/${chunks.length}`,
            {
                currentChunk: chunkIndex + 1,
                totalChunks: chunks.length,
                successCount,
                failureCount,
            }
        );

        // Process deletions within a chunk in parallel
        const chunkPromises = chunk.map(async (nodeId) => {
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
                const nodeInfo = {
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
            } catch (error) {
                console.error(`Error deleting node ${nodeId}: ${error.message}`);
                return {
                    success: false,
                    nodeId: nodeId,
                    error: error.message,
                };
            }
        });

        // Wait for all deletions in this chunk to complete
        const chunkResults = await Promise.all(chunkPromises);

        // Process results for this chunk
        chunkResults.forEach((result) => {
            if (result.success) {
                successCount++;
            } else {
                failureCount++;
            }
            results.push(result);
        });

        // Send chunk processing complete update
        sendProgressUpdate(
            commandId,
            "delete_multiple_nodes",
            "in_progress",
            Math.round(5 + ((chunkIndex + 1) / chunks.length) * 90),
            nodeIds.length,
            successCount + failureCount,
            `Completed chunk ${chunkIndex + 1}/${chunks.length
            }. ${successCount} successful, ${failureCount} failed so far.`,
            {
                currentChunk: chunkIndex + 1,
                totalChunks: chunks.length,
                successCount,
                failureCount,
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
    sendProgressUpdate(
        commandId,
        "delete_multiple_nodes",
        "completed",
        100,
        nodeIds.length,
        successCount + failureCount,
        `Node deletion complete: ${successCount} successful, ${failureCount} failed`,
        {
            totalNodes: nodeIds.length,
            nodesDeleted: successCount,
            nodesFailed: failureCount,
            completedInChunks: chunks.length,
            results: results,
        }
    );

    return {
        success: successCount > 0,
        nodesDeleted: successCount,
        nodesFailed: failureCount,
        totalNodes: nodeIds.length,
        results: results,
        completedInChunks: chunks.length,
        commandId,
    };
}

/**
 * Sets selection to multiple nodes
 * @param {Object} params - Parameters object
 * @param {string[]} params.nodeIds - Array of node IDs to select
 * @returns {Promise<Object>} Selection result
 */
export async function setSelections(params) {
    if (!params || !params.nodeIds || !Array.isArray(params.nodeIds)) {
        throw new Error("Missing or invalid nodeIds parameter");
    }

    if (params.nodeIds.length === 0) {
        throw new Error("nodeIds array cannot be empty");
    }

    // Get all valid nodes
    const nodes = [];
    const notFoundIds = [];

    for (const nodeId of params.nodeIds) {
        const node = await figma.getNodeByIdAsync(nodeId);
        if (node) {
            nodes.push(node);
        } else {
            notFoundIds.push(nodeId);
        }
    }

    if (nodes.length === 0) {
        throw new Error(`No valid nodes found for the provided IDs: ${params.nodeIds.join(', ')}`);
    }

    // Set selection to the nodes
    figma.currentPage.selection = nodes;

    // Scroll and zoom to show all nodes in viewport
    figma.viewport.scrollAndZoomIntoView(nodes);

    const selectedNodes = nodes.map(node => ({
        name: node.name,
        id: node.id
    }));

    return {
        success: true,
        count: nodes.length,
        selectedNodes: selectedNodes,
        notFoundIds: notFoundIds,
        message: `Selected ${nodes.length} nodes${notFoundIds.length > 0 ? ` (${notFoundIds.length} not found)` : ''}`
    };
}

/**
 * Sets the name of a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of node to rename
 * @param {string} params.name - New name for the node
 * @returns {Promise<Object>} Updated node info
 */
export async function setNodeName(params) {
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
export async function groupNodes(params) {
    const { nodes, name } = params;

    if (!nodes || nodes.length < 2) {
        throw new Error("At least 2 nodes are required to create a group");
    }

    // Collect all nodes
    const resolvedNodes = [];
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
export async function ungroupNodes(params) {
    const { nodeId } = params;

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) throw new Error(`Node not found with ID: ${nodeId}`);

    if (node.type !== "GROUP") {
        throw new Error(`Node is not a group (got ${node.type})`);
    }

    const parent = node.parent;
    const children = [...node.children]; // Snapshot children before ungrouping
    const childIds = children.map(c => ({ id: c.id, name: c.name }));

    figma.ungroup(node);

    return { ungroupedChildren: childIds, parentId: parent ? parent.id : null };
}

/**
 * Flattens a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - Node ID
 * @returns {Promise<Object>} Flattened node info
 */
export async function flattenNode(params) {
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
export async function insertChild(params) {
    const { parentId, childId, index } = params;

    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent) throw new Error(`Parent not found: ${parentId}`);

    if (!('children' in parent)) {
        throw new Error(`Parent node cannot have children (type: ${parent.type})`);
    }

    const child = await figma.getNodeByIdAsync(childId);
    if (!child) throw new Error(`Child not found: ${childId}`);

    // Perform reparenting
    if (index !== undefined) {
        parent.insertChild(index, child);
    } else {
        parent.appendChild(child);
    }

    return { childId: child.id, newParentId: parent.id, index: parent.children.indexOf(child) };
}
