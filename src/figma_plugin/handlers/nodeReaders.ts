/**
 * Node reader handlers for Figma plugin
 * Handles reading and querying node information
 */

import { filterFigmaNode } from '../utils/nodeUtils.js';
import { sendProgressUpdate } from '../utils/progressUtils.js';

/**
 * Gets information about pages in the document
 * @param {Object} params - Parameters including pageIds and commandId
 * @returns {Promise<Object>} Pages information
 */
export async function getPagesInfo(params: any) {
    const { pageIds, commandId } = params || {};

    const documentId = figma.root.id;
    const documentName = figma.root.name;
    const pageCount = figma.root.children.length;

    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
        const pages = figma.root.children.map((p: any) => ({
            pageId: p.id,
            pageName: p.name
        }));
        
        return {
            documentId,
            documentName,
            pageCount,
            pages
        };
    }

    const seen = new Set<string>();
    const orderedIds = pageIds.filter((id: string) => !seen.has(id) && (seen.add(id), true));

    const pages: any[] = [];
    const missingPageIds: string[] = [];

    if (commandId) {
        await sendProgressUpdate(
            commandId,
            'get_pages_info',
            'started',
            0,
            orderedIds.length,
            0,
            `Starting page info retrieval for ${orderedIds.length} pages`
        );
    }

    let processedItems = 0;
    for (const id of orderedIds) {
        const node = await figma.getNodeByIdAsync(id);
        
        // Strict page check: must be PAGE and parent must be root
        // @ts-ignore
        if (node && node.type === "PAGE" && node.parent?.id === figma.root.id) {
            // @ts-ignore
            await node.loadAsync();
            pages.push({
                pageId: node.id,
                pageName: node.name,
                // @ts-ignore
                children: node.children.map((child: any) => ({
                    id: child.id,
                    name: child.name,
                    type: child.type
                }))
            });
        } else {
            missingPageIds.push(id);
        }

        processedItems++;
        
        if (commandId) {
            await sendProgressUpdate(
                commandId,
                'get_pages_info',
                'in_progress',
                Math.round((processedItems / orderedIds.length) * 100),
                orderedIds.length,
                processedItems,
                `Processed ${processedItems}/${orderedIds.length} pages`
            );
        }
    }

    if (commandId) {
        await sendProgressUpdate(
            commandId,
            'get_pages_info',
            'completed',
            100,
            orderedIds.length,
            processedItems,
            `Completed retrieving page info`
        );
    }

    return {
        documentId,
        documentName,
        pageCount,
        pages,
        missingPageIds
    };
}

/**
 * Gets the current selection
 * @returns {Promise<Object>} Selection information
 */
export async function getSelection() {
    return {
        selectionCount: figma.currentPage.selection.length,
        selection: figma.currentPage.selection.map((node: any) => ({
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
export async function getNodesInfo(nodeIds: any, fields?: string[]) {
    try {
        // Load all nodes in parallel
        const nodes = await Promise.all(
            nodeIds.map((id: any) => figma.getNodeByIdAsync(id))
        );

        // Filter out any null values (nodes that weren't found)
        const validNodes = nodes.filter((node: any) => node !== null);

        // Export all valid nodes in parallel
        const responses = await Promise.all(
            validNodes.map(async (node: any) => {
                const response = await node.exportAsync({
                    format: "JSON_REST_V1",
                });
                return {
                    nodeId: node.id,
                    parentId: node.parent ? node.parent.id : null,
                    document: filterFigmaNode(response.document, fields),
                };
            })
        );

        return responses;
    } catch (error: any) {
        throw new Error(`Error getting nodes info: ${error.message}`);
    }
}

