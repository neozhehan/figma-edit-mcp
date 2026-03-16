import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";

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
    type: z.string(),
    timeout: z.number().optional(),
    delay: z.number().optional(),
    deprecatedVersion: z.boolean().optional(),
    device: z.string().optional(),
    keyCodes: z.array(z.number()).optional(),
    mediaHitTime: z.number().optional(),
});

const ReactionSchema = z.object({
    action: ActionSchema.optional(),
    actions: z.array(ActionSchema).optional(),
    trigger: TriggerSchema.nullable(),
});

export function registerPrototypingTools(server: McpServer) {
    // A tool to update Figma Prototyping Reactions for a node (replaces existing reactions)
    server.tool(
        "update_reactions",
        "Update Figma Prototyping Reactions on a node by replacing its reactions array. Provide the full array of reactions. Use get_reactions first, modify the desired actions (e.g., to fix references to deleted variables), and pass the updated array here.",
        {
            nodeId: z.string().describe("The ID of the node to update reactions for"),
            reactions: z.array(ReactionSchema).describe("The full array of Reaction objects to set"),
        },
        async ({ nodeId, reactions }: any) => {
            try {
                const result = await sendCommandToFigma("update_reactions", { nodeId, reactions });
                return {
                    content: [{ type: "text", text: JSON.stringify(result) }]
                };
            } catch (error) {
                 return {
                    content: [
                        {
                            type: "text",
                            text: `Error updating reactions: ${error instanceof Error ? error.message : String(error)}`
                        }
                    ],
                    isError: true
                 };
            }
        }
    );

    // A tool to get Figma Prototyping Reactions from multiple nodes
    server.tool(
        "get_reactions",
        "Get Figma Prototyping Reactions from multiple nodes. CRITICAL: The output MUST be processed using the 'reaction_to_connector_strategy' prompt IMMEDIATELY to generate parameters for connector lines via the 'create_connections' tool.",
        {
            nodeIds: z
                .array(z.string())
                .describe("Array of node IDs to get reactions from"),
        },
        async ({ nodeIds }: any) => {
            try {
                const result = await sendCommandToFigma("get_reactions", { nodeIds });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result),
                        },
                        {
                            type: "text",
                            text: "IMPORTANT: You MUST now use the reaction data above and follow the `reaction_to_connector_strategy` prompt to prepare the parameters for the `create_connections` tool call. This is a required next step.",
                        },
                    ],
                    followUp: {
                        type: "prompt",
                        prompt: "reaction_to_connector_strategy",
                    },
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error getting reactions: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Connect Nodes Tool (Consolidated)
    server.tool(
        "create_connections",
        "Create connections between nodes, or set/check the default connector template. Pass 'connectorId' to set a default. Pass 'connections' to create lines. Pass nothing to check current default.",
        {
            connectorId: z
                .string()
                .optional()
                .describe("Optional: The ID of the connector node to set as default template"),
            connections: z
                .array(
                    z.object({
                        startNodeId: z.string().describe("ID of the starting node"),
                        startNodeName: z.string().describe("Name of the starting node"),
                        endNodeId: z.string().describe("ID of the ending node"),
                        endNodeName: z.string().describe("Name of the ending node"),
                        text: z
                            .string()
                            .optional()
                            .describe("Optional text to display on the connector"),
                    })
                )
                .optional()
                .describe("Optional: Array of node connections to create"),
        },
        async ({ connectorId, connections }: any) => {
            try {
                // If checking/setting default (connectorId provided OR no params)
                if (connectorId !== undefined || !connections) {
                    const result = await sendCommandToFigma("create_connections", {
                        connectorId,
                        checkDefault: !connectorId && !connections // Flag to indicate we just want to check
                    });

                    if (!connections) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Default connector status: ${JSON.stringify(result)}`,
                                },
                            ],
                        };
                    }
                }

                // If creating connections
                if (connections && connections.length > 0) {
                    const result = await sendCommandToFigma("create_connections", {
                        connectorId, // Pass checking/setting intent too if present
                        connections,
                    });

                    return {
                        content: [
                            {
                                type: "text",
                                text: `Created ${connections.length} connections: ${JSON.stringify(
                                    result
                                )}`,
                            },
                        ],
                    };
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: "No action performed. Provide 'connectorId' to set default, 'connections' to create lines, or no args to check default.",
                        },
                    ],
                };

            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error in create_connections: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Strategy for converting Figma prototype reactions to connector lines
    server.prompt(
        "reaction_to_connector_strategy",
        "Strategy for converting Figma prototype reactions to connector lines using the output of 'get_reactions'",
        (extra) => {
            return {
                messages: [
                    {
                        role: "assistant",
                        content: {
                            type: "text",
                            text: `# Strategy: Convert Figma Prototype Reactions to Connector Lines

## Goal
Process the JSON output from the \`get_reactions\` tool to generate an array of connection objects suitable for the \`create_connections\` tool. This visually represents prototype flows as connector lines on the Figma canvas.

## Input Data
You will receive JSON data from the \`get_reactions\` tool. This data contains an array of nodes, each with potential reactions. A typical reaction object looks like this:
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
   - **Action:** Call \`get_nodes_info\` on the relevant node(s) to get context about the nodes involved (names, types, etc.). This helps in generating meaningful connector labels later.
   - **Action:** Call \`create_connections\` **without** any parameters (empty object).
   - **Check Result:** Analyze the response to see if a default connector is set.
     - If it confirms a default connector is already set (e.g., "Default connector is already set"), proceed to Step 2.
     - If it indicates no default connector is set, you **cannot** proceed with creating connections yet. Inform the user they need to manually copy a connector from FigJam, paste it onto the current page, select it, and then you can run \`create_connections({ connectorId: "SELECTED_NODE_ID" })\` before attempting to create the lines. **Do not proceed to Step 2 until a default connector is confirmed.**

### 2. Filter and Transform Reactions from \`get_reactions\` Output
   - **Iterate:** Go through the JSON array provided by \`get_reactions\`. For each node in the array:
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

### 4. Prepare the \`connections\` Array for \`create_connections\`
   - **Structure:** Create a JSON array where each element is an object representing a connection.
   - **Format:** Each object in the array must have the following structure:
     \`\`\`json
     {
       "startNodeId": "sourceNodeId_from_step_2",
       "endNodeId": "destinationNodeId_from_step_2",
       "text": "generatedText_from_step_3"
     }
     \`\`\`
   - **Result:** This final array is the value you will pass to the \`connections\` parameter when calling the \`create_connections\` tool.

### 5. Execute Connection Creation
   - **Action:** Call the \`create_connections\` tool, passing the array generated in Step 4 as the \`connections\` argument.
   - **Verify:** Check the response from \`create_connections\` to confirm success or failure.

This detailed process ensures you correctly interpret the reaction data, prepare the necessary information, and use the appropriate tools to create the connector lines.`,
                        },
                    },
                ],
                description:
                    "Strategy for converting Figma prototype reactions to connector lines using the output of 'get_reactions'",
            };
        }
    );
}
