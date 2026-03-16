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
