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

const ExpressionSchema: z.ZodType<any> = z.lazy(() => z.object({
    type: z.literal('EXPRESSION').optional(), // Sometimes marked with type
    expressionFunction: z.string(),
    expressionArguments: z.array(VariableDataSchema),
}));

const ActionSchema: z.ZodType<any> = z.lazy(() => z.union([
    z.object({ type: z.enum(['BACK', 'CLOSE']) }),
    z.object({ type: z.literal('URL'), url: z.string(), openInNewTab: z.boolean().optional() }),
    z.object({ type: z.literal('UPDATE_MEDIA_RUNTIME'), destinationId: z.string().nullable().optional(), mediaAction: z.string(), amountToSkip: z.number().optional(), newTimestamp: z.number().optional() }),
    z.object({ type: z.literal('SET_VARIABLE'), variableId: z.string().nullable(), variableValue: VariableDataSchema.optional() }),
    z.object({ type: z.literal('SET_VARIABLE_MODE'), variableCollectionId: z.string().nullable(), variableModeId: z.string().nullable() }),
    z.object({ type: z.literal('CONDITIONAL'), conditionalBlocks: z.array(z.object({ condition: VariableDataSchema.optional(), actions: z.array(ActionSchema) })) }),
    z.object({ type: z.literal('NODE'), destinationId: z.string().nullable(), navigation: z.string(), transition: z.any().nullable().optional(), preserveScrollPosition: z.boolean().optional(), overlayRelativePosition: z.any().optional(), resetVideoPosition: z.boolean().optional(), resetScrollPosition: z.boolean().optional(), resetInteractiveComponents: z.boolean().optional() }),
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
    // 1. List Reactions Tool
    server.registerTool(
        "reaction_list",
        {
            title: "List Reactions",
            description: "Read prototype reactions from one or more nodes. Process the output with the `reaction_to_connector_strategy` prompt to build `create_connection` parameters.",
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

    // 2. Update Reactions Tool
    server.registerTool(
        "reaction_update",
        {
            title: "Update Reactions",
            description: "Replace a node's prototype reactions with a full new reactions array (read first via `reaction_list`).",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to update reactions for"),
                nodeName: z.string().describe("Name of the node to update reactions for (for verification)"),
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

    // reaction_to_connector_strategy prompt
    server.registerPrompt(
        "reaction_to_connector_strategy",
        {
            description: "Strategy for converting Figma prototype reactions to connector lines using the output of 'reaction_list'",
        },
        (extra) => {
            return {
                messages: [
                    {
                        role: "assistant",
                        content: {
                            type: "text",
                            text: `# Strategy: Convert Figma Prototype Reactions to Connector Lines

## Goal
Process the JSON output from the \`reaction_list\` tool to generate an array of connection objects suitable for the \`create_connection\` tool. This visually represents prototype flows as connector lines on the Figma canvas.

## Input Data
You will receive JSON data from the \`reaction_list\` tool. This data contains an array of nodes, each with potential reactions. A typical reaction object looks like this:
\`\`\`json
{
  "trigger": { "type": "ON_CLICK" },
  "action": {
    "type": "NAVIGATE",
    "destinationId": "destination-node-id",
    "navigationTransition": { ... },
    "preserveScrollPosition": false
  }
}
\`\`\`

## Step-by-Step Process

### 1. Preparation & Context Gathering
   - **Action:** Call \`node_info\` on the relevant node(s) to get context about the nodes involved (names, types, etc.). This helps in generating meaningful connector labels later.
   - **Action:** Call \`create_connection\` **without** any parameters (empty object).
   - **Check Result:** Analyze the response to see if a default connector is set.
   - **If it confirms a default connector is already set (e.g., "Default connector is already set"), proceed to Step 2.
   - **If it indicates no default connector is set, you **cannot** proceed with creating connections yet. Inform the user they need to manually copy a connector from FigJam, paste it onto the current page, select it, and then you can run \`create_connection({ connectorId: "SELECTED_NODE_ID" })\` before attempting to create the lines. **Do not proceed to Step 2 until a default connector is confirmed.**

### 2. Filter and Transform Reactions from \`reaction_list\` Output
   - **Iterate:** Go through the JSON array provided by \`reaction_list\`. For each node in the array:
     - Iterate through its \`reactions\` array.
   - **Filter:** Keep only reactions where the \`action\` meets these criteria:
     - Has a \`type\` that implies a connection (e.g., \`NAVIGATE\`, \`OPEN_OVERLAY\`, \`SWAP_OVERLAY\`). **Ignore** types like \`CHANGE_TO\`, \`CLOSE_OVERLAY\`, etc.
     - Has a valid \`destinationId\` property.
   - **Extract:** For each valid reaction, extract the following information:
     - \`sourceNodeId\`: The ID of the node the reaction belongs to (from the outer loop).
     - \`destinationNodeId\`: The value of \`action.destinationId\`.
     - \`actionType\`: The value of \`action.type\`.
     - \`triggerType\`: The value of \`trigger.type\`.

### 3. Generate Connector Text Labels
   - **For each extracted connection:** Create a concise, descriptive text label string.
   - **Combine Information:** Use the \`actionType\`, \`triggerType\`, and potentially the names of the source/destination nodes to generate the label.
   - **Example Labels:**
     - "On click, navigate to [Destination Node Name]"
     - "On drag, open [Destination Node Name] overlay"
   - **Keep it brief and informative.** Let this generated string be \`generatedText\`.

### 4. Prepare the \`connections\` Array for \`create_connection\`
   - **Structure:** Create a JSON array where each element is an object representing a connection.
   - **Format:** Each object in the array must have the following structure:
     \`\`\`json
     {
       "startNodeId": "sourceNodeId_from_step_2",
       "endNodeId": "destinationNodeId_from_step_2",
       "text": "generatedText_from_step_3"
     }
     \`\`\`
   - **Result:** This final array is the value you will pass to the \`connections\` parameter when calling the \`create_connection\` tool.

### 5. Execute Connection Creation
   - **Action:** Call the \`create_connection\` tool, passing the array generated in Step 4 as the \`connections\` argument.
   - **Verify:** Check the response from \`create_connection\` to confirm success or failure.

This detailed process ensures you correctly interpret the reaction data, prepare the necessary information, and use the appropriate tools to create the connector lines.`,
                        },
                    },
                ],
            };
        }
    );
}
