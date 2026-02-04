/**
 * Node reader handlers for Figma plugin
 * Handles reading and querying node information
 */

import { filterFigmaNode } from '../utils/nodeUtils.js';

/**
 * Gets information about the current document
 * @returns {Promise<Object>} Document information including pages and children
 */
export async function getDocumentInfo() {
    await figma.loadAllPagesAsync();
    const page = figma.currentPage;

    // Get all pages from document root
    // Note: figma.root.children returns all pages
    const allPages = figma.root.children.map((p) => ({
        id: p.id,
        name: p.name,
        childCount: p.children.length,
        isCurrent: p.id === page.id,
    }));

    return {
        name: figma.root.name,
        id: figma.root.id,
        type: "DOCUMENT",
        currentPageId: page.id,
        currentPageName: page.name,
        pages: allPages,
        pageCount: allPages.length,
    };
}

/**
 * Gets the content of a specific page
 * @param {Object} params - Parameters including pageId
 * @returns {Promise<Object>} Page information including children
 */
export async function getPageInfo(params) {
    const { pageId } = params || {};

    let targetPage = figma.currentPage;

    if (pageId && pageId !== figma.currentPage.id) {
        // Find the requested page
        targetPage = figma.root.children.find(p => p.id === pageId);
        if (!targetPage) {
            throw new Error(`Page with ID ${pageId} not found`);
        }
        await targetPage.loadAsync();
    } else {
        await figma.currentPage.loadAsync();
    }

    return {
        id: targetPage.id,
        name: targetPage.name,
        type: "PAGE",
        isCurrent: targetPage.id === figma.currentPage.id,
        children: targetPage.children.map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
        })),
    };
}

/**
 * Gets the current selection
 * @returns {Promise<Object>} Selection information
 */
export async function getSelection() {
    return {
        selectionCount: figma.currentPage.selection.length,
        selection: figma.currentPage.selection.map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
            visible: node.visible,
        })),
    };
}

/**
 * Gets detailed information about multiple nodes
 * @param {string[]} nodeIds - Array of node IDs to query
 * @returns {Promise<Object[]>} Array of node information objects
 */
export async function getNodesInfo(nodeIds) {
    try {
        // Load all nodes in parallel
        const nodes = await Promise.all(
            nodeIds.map((id) => figma.getNodeByIdAsync(id))
        );

        // Filter out any null values (nodes that weren't found)
        const validNodes = nodes.filter((node) => node !== null);

        // Export all valid nodes in parallel
        const responses = await Promise.all(
            validNodes.map(async (node) => {
                const response = await node.exportAsync({
                    format: "JSON_REST_V1",
                });
                return {
                    nodeId: node.id,
                    document: filterFigmaNode(response.document),
                };
            })
        );

        return responses;
    } catch (error) {
        throw new Error(`Error getting nodes info: ${error.message}`);
    }
}

/**
 * Reads the design of currently selected nodes
 * @returns {Promise<Object[]>} Array of selected node information
 */
export async function readMyDesign() {
    try {
        // Load all selected nodes in parallel
        const nodes = await Promise.all(
            figma.currentPage.selection.map((node) => figma.getNodeByIdAsync(node.id))
        );

        // Filter out any null values (nodes that weren't found)
        const validNodes = nodes.filter((node) => node !== null);

        // Export all valid nodes in parallel
        const responses = await Promise.all(
            validNodes.map(async (node) => {
                const response = await node.exportAsync({
                    format: "JSON_REST_V1",
                });
                return {
                    nodeId: node.id,
                    document: filterFigmaNode(response.document),
                };
            })
        );

        return responses;
    } catch (error) {
        throw new Error(`Error getting nodes info: ${error.message}`);
    }
}
