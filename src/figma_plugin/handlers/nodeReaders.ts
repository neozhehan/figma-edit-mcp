/**
 * Node reader handlers for Figma plugin
 * Handles reading and querying node information
 */

import { buildPathArray, countDescendants, SAFE_LIST_PROPERTIES } from '../utils/nodeUtils.js';
import { sendProgressUpdate } from '../utils/progressUtils.js';
import { NodeEntry, PathTuple } from '../../shared/nodeTypes.js';


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
                descendantCount: countDescendants(node),
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
 * Gets detailed information about multiple nodes with recursive children, filtering, and streaming.
 * @param {Object} params - Parameters including nodeIds, properties, filter, maxDepth, and commandId
 * @returns {Promise<Object>} Response envelope with nodes and missingNodeIds
 */
export async function getNodesInfo(params: any) {
    const { 
        nodeIds = [], 
        properties = [], 
        filter = {}, 
        maxDepth, 
        commandId 
    } = params || {};

    try {
        // 1. Input deduplication (first-occurrence)
        const seen = new Set<string>();
        const uniqueIds = (Array.isArray(nodeIds) ? nodeIds : []).filter((id: any) => 
            id && typeof id === 'string' && !seen.has(id) && (seen.add(id), true)
        );

        const nodes: NodeEntry[] = [];
        const missingNodeIds: string[] = [];
        const exportCache = new Map<string, any>();
        const stats = { processed: 0, commandId };

        if (commandId) {
            await sendProgressUpdate(
                commandId,
                'get_nodes_info',
                'started',
                0,
                uniqueIds.length,
                0,
                `Starting node info retrieval for ${uniqueIds.length} nodes`
            );
        }

        // 2. Process each top-level node ID
        for (const [index, id] of uniqueIds.entries()) {
            const node = await figma.getNodeByIdAsync(id);
            if (!node) {
                missingNodeIds.push(id);
                continue;
            }

            // Subtree walk starting at depth 0
            const mappedSubtree = await mapNodeRecursive(
                node, 
                0, 
                maxDepth, 
                properties, 
                filter, 
                exportCache, 
                stats
            );

            // 3. Top-level result construction
            // Per spec §Filtering: requested ids ALWAYS appear in the response,
            // even when neither the node nor any descendant matches the filter.
            // mapNodeRecursive returns null in that case — synthesize a
            // passthrough entry so the requested id is preserved.
            let entry = mappedSubtree;
            if (!entry) {
                entry = {
                    id: node.id,
                    name: node.name,
                    type: node.type
                };
                if (Array.isArray(properties) && properties.length > 0) {
                    const props = await extractProperties(node, properties, exportCache);
                    if (Object.keys(props).length > 0) {
                        entry.properties = props;
                    }
                }
            }
            // Ensure top-level entries have the mandatory path and descendantCount
            entry.path = buildPathArray(node);
            entry.descendantCount = countDescendants(node);
            nodes.push(entry);

            // Multi-id streaming: per spec §Loading rule 2, emit `in_progress`
            // + yield AFTER EACH id (not every-25). Order matters — emit first
            // resets the MCP 60s inactivity timer, yield then flushes the
            // sandbox postMessage queue so the event isn't coalesced.
            // Skipped for single-id calls (the intra-subtree pair inside
            // mapNodeRecursive carries the timeout reset for the lone iteration).
            if (commandId && uniqueIds.length > 1) {
                await sendProgressUpdate(
                    commandId,
                    'get_nodes_info',
                    'in_progress',
                    Math.round(((index + 1) / uniqueIds.length) * 100),
                    uniqueIds.length,
                    index + 1,
                    `Processed ${index + 1}/${uniqueIds.length} top-level nodes`
                );
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // 4. Final completion event
        if (commandId) {
            await sendProgressUpdate(
                commandId,
                'get_nodes_info',
                'completed',
                100,
                uniqueIds.length,
                uniqueIds.length,
                `Successfully processed ${nodes.length} nodes (${missingNodeIds.length} missing)`
            );
        }

        return {
            nodes,
            missingNodeIds: missingNodeIds.length > 0 ? missingNodeIds : undefined
        };

    } catch (error: any) {
        console.error(`[getNodesInfo] Error: ${error.message}`);
        throw error;
    }
}

/**
 * Recursively maps a Figma node and its children into a NodeEntry tree.
 * Respects maxDepth and applies filtering.
 */
async function mapNodeRecursive(
    node: BaseNode,
    depth: number,
    maxDepth: number | undefined,
    requestedProps: string[],
    filter: Record<string, string[]>,
    exportCache: Map<string, any>,
    progressTracker: { processed: number; commandId?: string }
): Promise<NodeEntry | null> {
    // 1. Progress + yield every N nodes. Order is REQUIRED per spec
    // (§Loading rule 2): emit first (resets MCP 60s inactivity timer), then
    // yield (flushes the sandbox postMessage queue so the event isn't coalesced).
    // Reversing the two reintroduces the coalescing bug.
    progressTracker.processed++;
    if (progressTracker.processed % 25 === 0) {
        if (progressTracker.commandId) {
            await sendProgressUpdate(
                progressTracker.commandId,
                'get_nodes_info',
                'in_progress',
                0, // Global percentage is hard to calculate for recursive walk
                0,
                progressTracker.processed,
                `Traversed ${progressTracker.processed} total nodes...`
            );
        }
        await new Promise(r => setTimeout(r, 0));
    }

    const matchesFilter = checkFilterMatch(node, filter);
    const hasChildren = "children" in node && (node as any).children.length > 0;
    const shouldRecurse = maxDepth === undefined || depth < maxDepth;

    // 2. Recursive descent
    const children: NodeEntry[] = [];
    let hasMatchingDescendant = false;

    if (hasChildren && shouldRecurse) {
        for (const child of (node as any).children) {
            const mappedChild = await mapNodeRecursive(
                child,
                depth + 1,
                maxDepth,
                requestedProps,
                filter,
                exportCache,
                progressTracker
            );
            if (mappedChild) {
                children.push(mappedChild);
                hasMatchingDescendant = true;
            }
        }
    }

    // 3. Pruning: Skip node if it doesn't match filter AND none of its children match
    if (!matchesFilter && !hasMatchingDescendant) {
        return null;
    }

    // 4. Property Extraction (only for nodes matching the filter)
    let properties: Record<string, any> | undefined;
    if (matchesFilter && requestedProps.length > 0) {
        properties = await extractProperties(node, requestedProps, exportCache);
    }

    // 5. Construct entry
    const entry: NodeEntry = {
        id: node.id,
        name: node.name,
        type: node.type
    };

    if (children.length > 0) {
        entry.children = children;
    }

    if (properties && Object.keys(properties).length > 0) {
        entry.properties = properties;
    }

    // 6. descendantCount on boundary nodes
    // Per spec §Per-node entry: boundary nodes at maxDepth carry descendantCount
    // so the LLM can distinguish genuine leaves (descendantCount: 0, children: [])
    // from truncated nodes (descendantCount: 12, children: []).
    if (!shouldRecurse) {
        entry.descendantCount = hasChildren ? countDescendants(node) : 0;
    }

    return entry;
}

/**
 * Checks if a node matches the provided filter criteria.
 * Field matching is AND. Values within a field are OR.
 */
function checkFilterMatch(node: BaseNode, filter: Record<string, string[]>): boolean {
    if (!filter || Object.keys(filter).length === 0) return true;

    // Type filter
    if (filter.type && Array.isArray(filter.type) && filter.type.length > 0) {
        if (!filter.type.includes(node.type)) return false;
    }

    // LayoutMode filter
    if (filter.layoutMode && Array.isArray(filter.layoutMode) && filter.layoutMode.length > 0) {
        const nodeLayoutMode = (node as any).layoutMode || "NONE";
        if (!filter.layoutMode.includes(nodeLayoutMode)) return false;
    }

    return true;
}

/**
 * Extracts requested properties from a node using safe-list or exportAsync.
 */
async function extractProperties(
    node: BaseNode,
    requestedProps: string[],
    exportCache: Map<string, any>
): Promise<Record<string, unknown>> {
    const props: Record<string, unknown> = {};
    const needsExport = requestedProps.some(p => !SAFE_LIST_PROPERTIES.has(p));

    let exportedData: any = null;
    if (needsExport) {
        if (exportCache.has(node.id)) {
            exportedData = exportCache.get(node.id);
        } else {
            // Using JSON_REST_V1 export to get comprehensive property data
            const response = await (node as any).exportAsync({
                format: "JSON_REST_V1",
            });
            exportedData = response.document;
            exportCache.set(node.id, exportedData);
        }
    }

    // Spec §Per-node entry, with `properties`: these keys are silently excluded
    // from the `properties` block — they live at the structured fields level.
    // Requesting them via `properties: [...]` must be a no-op, even though they
    // appear in SAFE_LIST_PROPERTIES (where they're used for filter-key matching).
    const STRUCTURAL_KEYS = new Set(["id", "name", "type", "children", "path"]);

    for (const key of requestedProps) {
        if (STRUCTURAL_KEYS.has(key)) continue;
        if (SAFE_LIST_PROPERTIES.has(key)) {
            // mainComponent on InstanceNode requires getMainComponentAsync() under
            // documentAccess: "dynamic-page" (manifest.json). Reading it sync
            // returns a Promise that would be stored unawaited.
            let val: any;
            if (key === "mainComponent" && typeof (node as any).getMainComponentAsync === "function") {
                val = await (node as any).getMainComponentAsync();
            } else {
                val = (node as any)[key];
            }
            // Only include if property is applicable (not undefined)
            if (val !== undefined && val !== null) {
                props[key] = val;
            }
        } else if (exportedData && exportedData[key] !== undefined) {
            props[key] = exportedData[key];
        }
    }

    return props;
}


