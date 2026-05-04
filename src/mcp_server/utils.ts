/**
 * Normalize node ID from Figma URL format to API format
 * Converts dash-separated IDs (e.g., "20485-41") to colon-separated (e.g., "20485:41")
 * This allows users to paste node IDs directly from Figma URLs
 * @param nodeId - The node ID to normalize
 * @returns Normalized node ID in API format
 */
export function normalizeNodeId(nodeId: string | undefined): string | undefined {
    if (!nodeId || typeof nodeId !== 'string') {
        return nodeId;
    }

    // Replace dash with colon if it matches the pattern: digits-digits
    // This handles Figma URL format (20485-41) -> API format (20485:41)
    return nodeId.replace(/^(\d+)-(\d+)$/, '$1:$2');
}

/**
 * Normalize an array of node IDs from URL format to API format
 * @param nodeIds - Array of node IDs to normalize
 * @returns Array of normalized node IDs
 */
export function normalizeNodeIds(nodeIds: string[] | undefined): string[] | undefined {
    if (!nodeIds || !Array.isArray(nodeIds)) {
        return nodeIds;
    }

    return nodeIds.map(id => normalizeNodeId(id) || id);
}


