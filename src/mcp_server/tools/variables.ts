import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { normalizeNodeId } from "../utils.js";

export function registerVariablesTools(server: McpServer) {
    // Get Variables Tool
    server.tool(
        "get_variables",
        "Get all local variables/collections or detailed info for a specific variable by ID",
        {
            variableId: z
                .string()
                .optional()
                .describe("Optional ID of a specific variable to retrieve"),
        },
        async ({ variableId }: any) => {
            try {
                const result = await sendCommandToFigma("get_variables", {
                    variableId,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error getting variables: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Get Node Variables Tool
    server.tool(
        "get_node_variables",
        "Get bound variables and explicit variable modes for a specific node",
        {
            nodeId: z.string().describe("The ID of the node to inspect"),
        },
        async ({ nodeId }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("get_node_variables", {
                    nodeId,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error getting node variables: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Bound Variable Tool
    server.tool(
        "set_bound_variable",
        "Bind a variable to a node's property or set explicit variable mode",
        {
            nodeId: z.string().describe("The ID of the node to modify"),
            nodeName: z.string().describe("Name of the node to modify"),
            field: z
                .string()
                .optional()
                .describe("The property field to bind (e.g. 'fills', 'width', 'fontName')"),
            variableId: z
                .string()
                .optional()
                .describe("The ID of the variable to bind. Pass null/undefined to unbind."),
            collectionId: z
                .string()
                .optional()
                .describe("If setting mode: The collection ID"),
            modeId: z
                .string()
                .optional()
                .describe("If setting mode: The mode ID to set for the collection"),
        },
        async ({
            nodeId,
            nodeName,
            field,
            variableId,
            collectionId,
            modeId,
        }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("set_bound_variable", {
                    nodeId,
                    nodeName,
                    field,
                    variableId,
                    collectionId,
                    modeId,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting bound variable: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Manage Variables Tool
    server.tool(
        "manage_variables",
        "Comprehensive tool to create collections, variables, and set values/aliases.",
        {
            action: z
                .enum(["CREATE_COLLECTION", "CREATE_VARIABLE", "UPDATE_VARIABLE"])
                .describe("Action type"),
            name: z.string().optional().describe("Name (for CREATE or UPDATE actions)"),
            description: z.string().optional().describe("Description (for UPDATE_VARIABLE)"),
            modeName: z
                .string()
                .optional()
                .describe("Mode name (for CREATE_COLLECTION)"),
            collectionId: z
                .string()
                .optional()
                .describe("Collection ID (for CREATE_VARIABLE)"),
            type: z
                .enum(["FLOAT", "COLOR", "STRING", "BOOLEAN"])
                .optional()
                .describe("Variable type (for CREATE_VARIABLE)"),
            value: z
                .union([
                    z.string(),
                    z.number(),
                    z.boolean(),
                    z.object({
                        r: z.number(),
                        g: z.number(),
                        b: z.number(),
                        a: z.number().optional(),
                    }),
                    z.object({
                        type: z.literal("VARIABLE_ALIAS"),
                        id: z.string(),
                    }),
                ])
                .optional()
                .describe("Value for the variable (or alias) (for CREATE or UPDATE)"),
            variableId: z
                .string()
                .optional()
                .describe("Variable ID (for UPDATE_VARIABLE or alias)"),
            currentVariableName: z
                .string()
                .optional()
                .describe("Current name of the variable to verify against (for UPDATE_VARIABLE)"),
            modeId: z.string().optional().describe("Mode ID (for UPDATE_VARIABLE value setting)"),
        },
        async ({
            action,
            name,
            description,
            modeName,
            collectionId,
            type,
            value,
            variableId,
            currentVariableName,
            modeId,
        }: any) => {
            try {
                const result = await sendCommandToFigma("manage_variables", {
                    action,
                    name,
                    description,
                    modeName,
                    collectionId,
                    type,
                    value,
                    variableId,
                    currentVariableName,
                    modeId,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error managing variables: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );
}
