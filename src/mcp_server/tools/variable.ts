import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult } from "./_result.js";

export function registerVariableTools(server: McpServer) {
    // 1. List Variables Tool
    server.registerTool(
        "variable.list",
        {
            title: "List Variables",
            description: "List local variables/collections, or detailed info for specific variable ids; optionally scan for consumers.",
            inputSchema: z.object({
                variableId: z
                    .array(z.string())
                    .optional()
                    .describe("Optional array of variable IDs to retrieve detailed information for. If omitted, lists all local variables."),
                includeConsumers: z
                    .enum(["current_page", "document"])
                    .optional()
                    .describe("Only used when variableId is provided; ignored otherwise. 'current_page' scans the active page (fast). 'document' scans all pages (streams progress page-by-page)."),
            }),
            outputSchema: z.object({
                collections: z.array(z.any()).optional().describe("List of variable collections"),
                variables: z.array(z.any()).optional().describe("List of variables"),
                consumers: z.any().optional().describe("Consumer mapping for the requested variables"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("variable.list", params);
            return toolResult(result);
        }
    );

    // 2. Manage Variables Tool
    server.registerTool(
        "variable.manage",
        {
            title: "Manage Variables",
            description: "Create collections and variables and set their values/aliases (create/update router).",
            inputSchema: z.object({
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
                            r: z.number().describe("Red (0-1)"),
                            g: z.number().describe("Green (0-1)"),
                            b: z.number().describe("Blue (0-1)"),
                            a: z.number().optional().describe("Alpha (0-1)"),
                        }).describe("RGBA color"),
                        z.object({
                            type: z.literal("VARIABLE_ALIAS"),
                            id: z.string().describe("Target variable ID"),
                        }).describe("Variable alias"),
                    ])
                    .optional()
                    .describe("Value for the variable (or alias) (for CREATE or UPDATE)"),
                variableId: z
                    .string()
                    .optional()
                    .describe("Variable ID (for UPDATE_VARIABLE)"),
                currentVariableName: z
                    .string()
                    .optional()
                    .describe("Current name of the variable to verify against (for UPDATE_VARIABLE)"),
                modeId: z.string().optional().describe("Mode ID (for UPDATE_VARIABLE value setting)"),
            }),
            outputSchema: z.object({
                id: z.string().optional().describe("ID of the collection or variable"),
                name: z.string().optional().describe("Name of the collection or variable"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("variable.manage", params);
            return toolResult(result);
        }
    );

    // 3. Delete Variables Tool
    server.registerTool(
        "variable.delete",
        {
            title: "Delete Variables",
            description: "Delete specific variables or an entire collection. Runs a full-document consumer check first and rejects the whole operation if any target is still in use.",
            inputSchema: z.object({
                variableIds: z
                    .array(z.string())
                    .optional()
                    .describe("Array of variable IDs to delete. Mutually exclusive with collectionId."),
                collectionId: z
                    .string()
                    .optional()
                    .describe("ID of a variable collection to delete. Mutually exclusive with variableIds."),
            }),
            outputSchema: z.object({
                success: z.boolean().optional().describe("Whether variables were deleted successfully"),
                message: z.string().optional().describe("Status message"),
            }),
            annotations: {
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("variable.delete", params);
            return toolResult(result);
        }
    );
}
