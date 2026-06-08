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
 * Gets detailed information about multiple nodes with recursive children, filtering, and streaming.
 * @param {Object} params - Parameters including nodeIds, properties, filter, maxDepth, and commandId
 * @returns {Promise<Object>} Response envelope with nodes and missingNodeIds
 */
/**
 * Worker pool implementation for parallel subtree walk.
 */
async function getNodesInfoParallel(
    uniqueIds: string[],
    properties: string[],
    filter: Record<string, string[]>,
    maxDepth: number | undefined,
    concurrencyLimit: number,
    commandId: string | undefined,
    exportCache: Map<string, any>,
    stats: { processed: number; commandId?: string }
): Promise<{ nodes: NodeEntry[]; missingNodeIds: string[] }> {
    const results = new Array(uniqueIds.length);
    let nextIndex = 0;
    let completedCount = 0;
    let lastEmittedPercentage = 0;

    const runWorker = async () => {
        while (true) {
            const index = nextIndex++;
            if (index >= uniqueIds.length) {
                break;
            }
            const id = uniqueIds[index];
            try {
                const node = await figma.getNodeByIdAsync(id);
                if (!node) {
                    results[index] = { missing: true, id };
                } else {
                    const mappedSubtree = await mapNodeRecursive(
                        node,
                        0,
                        maxDepth,
                        properties,
                        filter,
                        exportCache,
                        stats
                    );

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
                    entry.path = buildPathArray(node);
                    entry.descendantCount = countDescendants(node);
                    results[index] = entry;
                }
            } catch (error: any) {
                console.error(`[getNodesInfoParallel] Error processing node ${id}: ${error.message}`);
                results[index] = { missing: true, id };
            } finally {
                completedCount++;
                if (commandId && uniqueIds.length > 1) {
                    const rawPercentage = Math.round((completedCount / uniqueIds.length) * 100);
                    const progressPercent = Math.max(lastEmittedPercentage, rawPercentage);
                    lastEmittedPercentage = progressPercent;

                    await sendProgressUpdate(
                        commandId,
                        'get_nodes_info',
                        'in_progress',
                        progressPercent,
                        uniqueIds.length,
                        completedCount,
                        `Processed ${completedCount}/${uniqueIds.length} top-level nodes`
                    );
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        }
    };

    const poolLimit = Math.min(concurrencyLimit, uniqueIds.length);
    const workers = [];
    for (let i = 0; i < poolLimit; i++) {
        workers.push(runWorker());
    }
    await Promise.all(workers);

    const nodes: NodeEntry[] = [];
    const missingNodeIds: string[] = [];
    for (let i = 0; i < uniqueIds.length; i++) {
        const res = results[i];
        if (res && res.missing) {
            missingNodeIds.push(res.id);
        } else if (res) {
            nodes.push(res);
        }
    }

    return { nodes, missingNodeIds };
}

export async function getNodesInfo(params: any) {
    const { 
        nodeIds = [], 
        properties = [], 
        filter = {}, 
        maxDepth, 
        concurrencyLimit = 4,
        commandId 
    } = params || {};

    try {
        // 1. Input deduplication (first-occurrence)
        const seen = new Set<string>();
        const uniqueIds = (Array.isArray(nodeIds) ? nodeIds : []).filter((id: any) => 
            id && typeof id === 'string' && !seen.has(id) && (seen.add(id), true)
        );

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

        const exportCache = new Map<string, any>();
        const stats = { processed: 0, commandId };
        const limit = Math.max(1, typeof concurrencyLimit === 'number' ? concurrencyLimit : 4);

        const { nodes, missingNodeIds } = await getNodesInfoParallel(
            uniqueIds,
            properties,
            filter,
            maxDepth,
            limit,
            commandId,
            exportCache,
            stats
        );

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
/**
 * Helper to recursively resolve variable aliases to {id, name}
 */
async function resolveVariableAliases(obj: any): Promise<any> {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return Promise.all(obj.map(item => resolveVariableAliases(item)));
    }
    if (typeof obj === 'object') {
        if (obj.type === 'VARIABLE_ALIAS' && typeof obj.id === 'string') {
            try {
                const variable = await figma.variables.getVariableByIdAsync(obj.id);
                return {
                    id: obj.id,
                    name: variable ? variable.name : "Unknown Variable"
                };
            } catch (e) {
                return { id: obj.id, name: "Unknown Variable" };
            }
        }
        const resolved: any = {};
        for (const [key, value] of Object.entries(obj)) {
            resolved[key] = await resolveVariableAliases(value);
        }
        return resolved;
    }
    return obj;
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
        if (!exportCache.has(node.id)) {
            const promise = (node as any).exportAsync({
                format: "JSON_REST_V1",
            }).then((r: any) => r.document);
            exportCache.set(node.id, promise);
        }
        exportedData = await exportCache.get(node.id);
    }

    // Spec §Per-node entry, with `properties`: these keys are silently excluded
    // from the `properties` block — they live at the structured fields level.
    // Requesting them via `properties: [...]` must be a no-op, even though they
    // appear in SAFE_LIST_PROPERTIES (where they're used for filter-key matching).
    const STRUCTURAL_KEYS = new Set(["id", "name", "type", "children", "path"]);

    for (const key of requestedProps) {
        if (STRUCTURAL_KEYS.has(key)) continue;

        // 1. Node reference fields -> map to ID(s)
        if (key === "parent") {
            props["parent"] = node.parent ? node.parent.id : null;
        } else if (key === "mainComponent") {
            if ("getMainComponentAsync" in node && typeof (node as any).getMainComponentAsync === "function") {
                const mainComp = await (node as any).getMainComponentAsync();
                props["mainComponent"] = mainComp ? mainComp.id : null;
            } else {
                props["mainComponent"] = null;
            }
        } else if (key === "instances") {
            if ("getInstancesAsync" in node && typeof (node as any).getInstancesAsync === "function") {
                const instances = await (node as any).getInstancesAsync();
                props["instances"] = instances ? instances.map((inst: any) => inst.id) : [];
            } else {
                props["instances"] = [];
            }
        } else if (key === "exposedInstances") {
            const expInst = (node as any).exposedInstances;
            props["exposedInstances"] = expInst ? expInst.map((inst: any) => inst.id) : [];
        } else if (key === "stuckNodes") {
            const stuck = (node as any).stuckNodes;
            props["stuckNodes"] = stuck ? stuck.map((n: any) => n.id) : [];
        } else if (key === "attachedConnectors") {
            const conn = (node as any).attachedConnectors;
            props["attachedConnectors"] = conn ? conn.map((c: any) => c.id) : [];
        }

        // 2. Style references -> resolve to {id, name}
        else if (key.endsWith("StyleId")) {
            const styleId = (node as any)[key];
            if (styleId && typeof styleId === 'string' && styleId !== "") {
                try {
                    const style = await figma.getStyleByIdAsync(styleId);
                    props[key] = {
                        id: styleId,
                        name: style ? style.name : "Unknown Style"
                    };
                } catch (e) {
                    props[key] = { id: styleId, name: "Unknown Style" };
                }
            } else {
                props[key] = null;
            }
        }

        // 3. Variable references -> resolve recursively
        else if (key === "boundVariables") {
            const boundVars = (node as any).boundVariables;
            if (boundVars && Object.keys(boundVars).length > 0) {
                props["boundVariables"] = await resolveVariableAliases(boundVars);
            } else {
                props["boundVariables"] = {};
            }
        } else if (key === "explicitVariableModes") {
            const modes = (node as any).explicitVariableModes;
            if (modes && Object.keys(modes).length > 0) {
                const resolvedModes: any = {};
                for (const [colId, modeId] of Object.entries(modes)) {
                    try {
                        const col = await figma.variables.getVariableCollectionByIdAsync(colId);
                        const m = col ? col.modes.find((mode: any) => mode.modeId === modeId) : null;
                        resolvedModes[colId] = {
                            id: modeId,
                            name: m ? `${col!.name}: ${m.name}` : "Unknown Mode"
                        };
                    } catch (e) {
                        resolvedModes[colId] = { id: modeId, name: "Unknown Mode" };
                    }
                }
                props["explicitVariableModes"] = resolvedModes;
            } else {
                props["explicitVariableModes"] = {};
            }
        }

        // 4. Regular safe-list properties or fallback
        else if (SAFE_LIST_PROPERTIES.has(key)) {
            const val = (node as any)[key];
            if (val !== undefined && val !== null) {
                // `figma.mixed` is a Symbol (returned when a field has mixed
                // values across a node's range) and isn't structured-cloneable —
                // serialize it so it can't throw DataCloneError on postMessage.
                props[key] = typeof val === "symbol" ? "mixed" : val;
            }
        } else if (exportedData && exportedData[key] !== undefined) {
            props[key] = exportedData[key];
        }
    }

    return props;
}


