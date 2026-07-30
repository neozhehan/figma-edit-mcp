import { generateCommandId, sendProgressUpdate } from "../utils/progressUtils.js";

/**
 * Gets reactions from nodes and their children.
 */
export async function getReactions(nodeIds: any) {
    try {
        const commandId = generateCommandId();
        await sendProgressUpdate(
            commandId,
            "get_reactions",
            "started",
            0,
            nodeIds.length,
            0,
            `Starting deep search for reactions in ${nodeIds.length} nodes and their children`,
        );

        async function findNodesWithReactions(
            node: any,
            processedNodes = new Set(),
            depth = 0,
            results = [],
        ) {
            if (processedNodes.has(node.id)) {
                return results;
            }

            processedNodes.add(node.id);

            let filteredReactions: any[] = [];
            if (node.reactions && node.reactions.length > 0) {
                // v2.3.4 owns the contract fix that will return CHANGE_TO
                // reactions instead of filtering them out here.
                filteredReactions = node.reactions.filter((reaction: any) => {
                    if (
                        reaction.action &&
                        reaction.action.navigation === "CHANGE_TO"
                    ) {
                        return false;
                    }
                    if (Array.isArray(reaction.actions)) {
                        return !reaction.actions.some(
                            (action: any) => action.navigation === "CHANGE_TO",
                        );
                    }
                    return true;
                });
            }

            if (filteredReactions.length > 0) {
                // @ts-expect-error TS2345: reaction-summary object literal is not assignable to the parameter's declared type
                results.push({
                    id: node.id,
                    name: node.name,
                    type: node.type,
                    depth,
                    hasReactions: true,
                    reactions: filteredReactions,
                    path: getNodePath(node),
                });
            }

            if (node.children) {
                for (const child of node.children) {
                    await findNodesWithReactions(
                        child,
                        processedNodes,
                        depth + 1,
                        results,
                    );
                }
            }

            return results;
        }

        function getNodePath(node: any) {
            const path: any[] = [];
            let current = node;

            while (current && current.parent) {
                path.unshift(current.name);
                current = current.parent;
            }

            return path.join(" > ");
        }

        let allResults: any[] = [];
        let processedCount = 0;
        const totalCount = nodeIds.length;

        for (let i = 0; i < nodeIds.length; i++) {
            try {
                const nodeId = nodeIds[i];
                const node = await figma.getNodeByIdAsync(nodeId);

                if (!node) {
                    processedCount++;
                    await sendProgressUpdate(
                        commandId,
                        "get_reactions",
                        "in_progress",
                        processedCount / totalCount,
                        totalCount,
                        processedCount,
                        `Node not found: ${nodeId}`,
                    );
                    continue;
                }

                const processedNodes = new Set();
                const nodeResults = await findNodesWithReactions(
                    node,
                    processedNodes,
                );
                allResults = allResults.concat(nodeResults);

                processedCount++;
                await sendProgressUpdate(
                    commandId,
                    "get_reactions",
                    "in_progress",
                    processedCount / totalCount,
                    totalCount,
                    processedCount,
                    `Processed node ${processedCount}/${totalCount}, found ${nodeResults.length} nodes with reactions`,
                );
            } catch (error: any) {
                processedCount++;
                await sendProgressUpdate(
                    commandId,
                    "get_reactions",
                    "in_progress",
                    processedCount / totalCount,
                    totalCount,
                    processedCount,
                    `Error processing node: ${error.message}`,
                );
            }
        }

        await sendProgressUpdate(
            commandId,
            "get_reactions",
            "completed",
            1,
            totalCount,
            totalCount,
            `Completed deep search: found ${allResults.length} nodes with reactions.`,
        );

        return {
            nodesCount: nodeIds.length,
            nodesWithReactions: allResults.length,
            nodes: allResults,
        };
    } catch (error: any) {
        throw new Error(`Failed to get reactions: ${error.message}`);
    }
}

export async function updateReactions(params: any) {
    const { nodeId, reactions } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    if (!reactions || !Array.isArray(reactions)) {
        throw new Error("Missing or invalid reactions parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (!("reactions" in node)) {
        throw new Error(`Node with ID ${nodeId} does not support reactions`);
    }

    try {
        await (node as any).setReactionsAsync(reactions);
        return { success: true, message: `Successfully updated reactions for node ${nodeId}` };
    } catch (e: any) {
        throw new Error(`Failed to update reactions: ${e.message}`);
    }
}
