/// <reference types="@figma/plugin-typings" />
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput, pageCoverage } from "./_result.js";

const VARIABLE_SCOPES = [
    'ALL_SCOPES',
    'TEXT_CONTENT',
    'CORNER_RADIUS',
    'WIDTH_HEIGHT',
    'GAP',
    'ALL_FILLS',
    'FRAME_FILL',
    'SHAPE_FILL',
    'TEXT_FILL',
    'STROKE_COLOR',
    'STROKE_FLOAT',
    'EFFECT_FLOAT',
    'EFFECT_COLOR',
    'OPACITY',
    'FONT_FAMILY',
    'FONT_STYLE',
    'FONT_WEIGHT',
    'FONT_SIZE',
    'LINE_HEIGHT',
    'LETTER_SPACING',
    'PARAGRAPH_SPACING',
    'PARAGRAPH_INDENT'
] as const satisfies readonly VariableScope[];

export function registerVariableTools(server: McpServer) {
    // 1. List Variables Tool
    server.registerTool(
        "variable_list",
        {
            title: "List Variables",
            description: "List local variables/collections, or detailed info for specific variable ids; optionally scan for consumers. Document consumer scans isolate page failures and report them in `coverage`; page-scoped failures return their structured error directly.",
            inputSchema: z.object({
                variableId: z
                    .array(z.string())
                    .optional()
                    .describe("Optional array of variable IDs to retrieve detailed information for. If omitted, lists all local variables."),
                includeConsumers: z
                    .enum(["page", "document"])
                    .optional()
                    .describe("Only used when variableId is provided; ignored otherwise. 'page' scans a specific page, requiring pageId. 'document' scans all pages (streams progress page-by-page)."),
                pageId: z
                    .string()
                    .optional()
                    .describe("The page ID to scan for consumers when includeConsumers is 'page'."),
            }),
            outputSchema: looseOutput({
                variables: z.array(z.any()).optional().describe("List of variables — present in both list-all and lookup modes (each may carry nodeConsumers/styleConsumers/aliasConsumers when includeConsumers is set)"),
                collections: z.array(z.any()).optional().describe("List of variable collections (list-all mode only)"),
                missingIds: z.array(z.string()).optional().describe("Requested variable IDs that did not resolve (lookup mode only; omitted when none)"),
                coverage: pageCoverage,
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("variable_list", params);
            return toolResult(result);
        }
    );

    // 2. Manage Variables Tool
    server.registerTool(
        "variable_manage",
        {
            title: "Manage Variables",
            description: "Create collections and variables and set their values/aliases (create/update router). UPDATE_VARIABLE requires `currentVariableName`. CREATE_VARIABLE requires `collectionName` and `scopes`.",
            inputSchema: z.object({
                action: z
                    .enum(["CREATE_COLLECTION", "CREATE_VARIABLE", "UPDATE_VARIABLE"])
                    .describe("Action type"),
                name: z
                    .string()
                    .optional()
                    .describe("Name for collection/variable creation or variable update. Must be non-empty when supplied. It is required for CREATE_COLLECTION and CREATE_VARIABLE; omit it only on UPDATE_VARIABLE to leave the current name unchanged."),
                description: z.string().optional().describe("Description (for UPDATE_VARIABLE)"),
                modeName: z
                    .string()
                    .optional()
                    .describe("Optional initial mode name for CREATE_COLLECTION. Must be non-empty when supplied; omit it to keep the collection's native default mode name."),
                collectionId: z
                    .string()
                    .optional()
                    .describe("Collection ID (for CREATE_VARIABLE)"),
                collectionName: z
                    .string()
                    .optional()
                    .describe("REQUIRED for CREATE_VARIABLE — the parent collection's exact name, passed back verbatim from `variable_list`"),
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
                    .describe("REQUIRED for UPDATE_VARIABLE — the variable's **current exact** name, passed back verbatim from `variable_list`"),
                modeId: z.string().optional().describe("Mode ID (for UPDATE_VARIABLE value setting)"),
                scopes: z
                    .array(z.enum(VARIABLE_SCOPES))
                    .optional()
                    .describe("REQUIRED for CREATE_VARIABLE — variable scopes. ALWAYS set explicitly on create; omit on update to leave unchanged."),
            }).superRefine((data, ctx) => {
                if (data.action === "UPDATE_VARIABLE") {
                    if (data.name === "") {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["name"],
                            message: "name must not be empty. Omit name to leave the variable's name unchanged."
                        });
                    }
                    if (!data.variableId) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["variableId"],
                            message: "variableId is required for UPDATE_VARIABLE. Retrieve the variable ID from variable_list."
                        });
                    }
                    if (!data.currentVariableName) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["currentVariableName"],
                            message: "currentVariableName is required for UPDATE_VARIABLE. Retrieve the variable's current exact name from variable_list and pass it back verbatim."
                        });
                    }
                } else if (data.action === "CREATE_VARIABLE") {
                    if (!data.collectionId) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["collectionId"],
                            message: "collectionId is required for CREATE_VARIABLE. Retrieve the collection ID from variable_list."
                        });
                    }
                    if (!data.collectionName) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["collectionName"],
                            message: "collectionName is required for CREATE_VARIABLE. Retrieve the parent collection's exact name from variable_list and pass it back verbatim."
                        });
                    }
                    if (!data.scopes) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["scopes"],
                            message: "scopes is required for CREATE_VARIABLE. Specify the allowed scopes explicitly."
                        });
                    }
                    if (data.name === "") {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["name"],
                            message: "name must not be empty for CREATE_VARIABLE. Figma normalizes an empty name, so supply the name you want."
                        });
                    } else if (!data.name) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["name"],
                            message: "name is required for CREATE_VARIABLE."
                        });
                    }
                    if (!data.type) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["type"],
                            message: "type is required for CREATE_VARIABLE."
                        });
                    }
                } else if (data.action === "CREATE_COLLECTION") {
                    if (data.name === "") {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["name"],
                            message: "name must not be empty for CREATE_COLLECTION. Figma normalizes an empty name, so supply the name you want."
                        });
                    } else if (!data.name) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["name"],
                            message: "name is required for CREATE_COLLECTION."
                        });
                    }
                    if (data.modeName === "") {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["modeName"],
                            message: "modeName must not be empty for CREATE_COLLECTION. Omit modeName to keep the collection's default mode name."
                        });
                    }
                }
            }),
            outputSchema: looseOutput({
                id: z.string().optional().describe("ID of the collection or variable"),
                name: z.string().optional().describe("Name of the collection or variable"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("variable_manage", params);
            return toolResult(result);
        }
    );

    // 3. Delete Variables Tool
    server.registerTool(
        "variable_delete",
        {
            title: "Delete Variables",
            description: "Delete specific variables or an entire collection. Runs a full-document consumer check first, before any removal: if a target is still in use the call is refused with VARIABLE_IN_USE, whose `details.variablesInUse` lists every consumer; if any page cannot be loaded and read it is refused with DOCUMENT_SCAN_INCOMPLETE, because a page error can never mean zero consumers.",
            inputSchema: z.object({
                variableIds: z
                    .array(z.string())
                    .optional()
                    .describe("Array of variable IDs to delete. Mutually exclusive with collectionId."),
                variableNames: z
                    .array(z.string())
                    .optional()
                    .describe("Array of variable names corresponding to variableIds, for safety verification. Required if variableIds is used."),
                collectionId: z
                    .string()
                    .optional()
                    .describe("ID of a variable collection to delete. Mutually exclusive with variableIds."),
                collectionName: z
                    .string()
                    .optional()
                    .describe("Name of the collection to delete, for safety verification. Required if collectionId is used."),
            }),
            outputSchema: looseOutput({
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
            const result = await sendCommandToFigma("variable_delete", params);
            return toolResult(result);
        }
    );
}
