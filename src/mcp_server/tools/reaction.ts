import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput } from "./_result.js";

// Figma Plugin API typings for Reaction (as of current known API version)
const VariableDataSchema: z.ZodType<any> = z.lazy(() => z.object({
    type: z.string().optional(),
    resolvedType: z.string().optional(),
    value: z.any().optional(), // Could be string, number, boolean, VariableAlias, or Expression
}));

const ActionSchema: z.ZodType<any> = z.lazy(() => z.union([
    z.object({ type: z.enum(["BACK", "CLOSE"]) }),
    z.object({ type: z.literal("URL"), url: z.string(), openInNewTab: z.boolean().optional() }),
    z.object({ type: z.literal("UPDATE_MEDIA_RUNTIME"), destinationId: z.string().nullable().optional(), mediaAction: z.string(), amountToSkip: z.number().optional(), newTimestamp: z.number().optional() }),
    z.object({ type: z.literal("SET_VARIABLE"), variableId: z.string().nullable(), variableValue: VariableDataSchema.optional() }),
    z.object({ type: z.literal("SET_VARIABLE_MODE"), variableCollectionId: z.string().nullable(), variableModeId: z.string().nullable() }),
    z.object({ type: z.literal("CONDITIONAL"), conditionalBlocks: z.array(z.object({ condition: VariableDataSchema.optional(), actions: z.array(ActionSchema) })) }),
    z.object({ type: z.literal("NODE"), destinationId: z.string().nullable(), navigation: z.string(), transition: z.any().nullable().optional(), preserveScrollPosition: z.boolean().optional(), overlayRelativePosition: z.any().optional(), resetVideoPosition: z.boolean().optional(), resetScrollPosition: z.boolean().optional(), resetInteractiveComponents: z.boolean().optional() }),
]));

const TriggerSchema = z.object({
    type: z.string().describe("Trigger type (e.g. ON_CLICK, ON_HOVER)"),
    timeout: z.number().optional().describe("Timeout for delay triggers"),
    delay: z.number().optional().describe("Delay before trigger fires"),
    deprecatedVersion: z.boolean().optional().describe("Whether the trigger is deprecated"),
    device: z.string().optional().describe("Device setting"),
    keyCodes: z.array(z.number()).optional().describe("Key codes for key trigger"),
    mediaHitTime: z.number().optional().describe("Media hit time"),
});

const ReactionSchema = z.object({
    action: ActionSchema.optional().describe("Primary action of the reaction"),
    actions: z.array(ActionSchema).optional().describe("List of actions for multi-action triggers"),
    trigger: TriggerSchema.nullable().describe("Trigger settings"),
});

export function registerReactionTools(server: McpServer) {
    server.registerTool(
        "reaction_list",
        {
            title: "List Reactions",
            description: "Read prototype reactions from one or more nodes and their descendants.",
            inputSchema: z.object({
                nodeIds: z.array(z.string()).describe("Array of node IDs to get reactions from"),
            }),
            outputSchema: looseOutput({
                nodesCount: z.number().optional().describe("Number of inspected nodes"),
                nodesWithReactions: z.number().optional().describe("Number of nodes found that have reactions"),
                nodes: z.array(z.any()).optional().describe("List of node entries with their reactions"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeIds }: any) => {
            const result = await sendCommandToFigma("reaction_list", { nodeIds });
            return toolResult(result);
        }
    );

    server.registerTool(
        "reaction_update",
        {
            title: "Update Reactions",
            description: "Replace a node's prototype reactions with a full new reactions array (read first via `reaction_list`).",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to update reactions for"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                reactions: z.array(ReactionSchema).describe("The full array of Reaction objects to set"),
            }),
            outputSchema: looseOutput({
                success: z.boolean().optional().describe("Whether the reactions were updated successfully"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("reaction_update", params);
            return toolResult(result);
        }
    );
}
