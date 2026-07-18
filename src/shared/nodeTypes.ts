import { z } from 'zod';

/**
 * 3-tuple encoding [type, id, name] for a node ancestor path.
 * Ordered from containing page down to immediate parent.
 */
export type PathTuple = [type: string, id: string, name: string];

/**
 * Recursive node entry structure for Figma trees.
 */
export interface NodeEntry {
    id: string;
    name: string;
    type: string;
    path?: PathTuple[]; // Only populated for top-level entries
    descendantCount?: number; // Only for boundary nodes
    properties?: Record<string, unknown>;
    children?: NodeEntry[];
}

/**
 * Response envelope for get_nodes_info.
 */
export interface GetNodesInfoResponse {
    nodes: NodeEntry[];
    missingNodeIds?: string[];
}

/**
 * Zod schema for NodeEntry (Recursive).
 * Used for compile-time type safety.
 */
export const NodeEntrySchema: z.ZodType<NodeEntry> = z.lazy(() => z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    path: z.array(z.tuple([z.string(), z.string(), z.string()])).optional(),
    descendantCount: z.number().int().nonnegative().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    children: z.array(NodeEntrySchema).optional()
}));

/**
 * Zod schema for GetNodesInfoResponse.
 * MANDATORY: Do NOT pass this as outputSchema in server.tool() registration.
 */
export const GetNodesInfoResponseSchema = z.object({
    nodes: z.array(NodeEntrySchema),
    missingNodeIds: z.array(z.string()).optional()
});

