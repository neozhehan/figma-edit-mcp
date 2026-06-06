import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult } from "./_result.js";

export function registerStyleTools(server: McpServer) {
    // 1. List Styles Tool
    server.registerTool(
        "style.list",
        {
            title: "List Styles",
            description: "List all local styles (paint/text/effect/grid) in the document.",
            inputSchema: z.object({}),
            outputSchema: z.object({
                colors: z.array(z.any()).describe("List of paint/color styles"),
                texts: z.array(z.any()).describe("List of text styles"),
                effects: z.array(z.any()).describe("List of effect styles"),
                grids: z.array(z.any()).describe("List of grid styles"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async () => {
            const result = await sendCommandToFigma("style.list");
            return toolResult(result);
        }
    );

    // 2. Manage Style Tool
    server.registerTool(
        "style.manage",
        {
            title: "Manage Style",
            description: "Create a named style (paint/text/effect/grid), or update an existing one when `styleId` is given.",
            inputSchema: z.object({
                type: z
                    .enum(["TEXT", "PAINT", "EFFECT", "GRID"])
                    .describe("Type of style to create or update"),
                name: z.string().describe("Name of the style"),
                description: z.string().optional().describe("Description of the style"),
                propertiesJson: z
                    .string()
                    .optional()
                    .describe(
                        "JSON string containing style properties: {fontName?: {family, style}, fontSize?: number, paints?: [{type, color?, opacity?, visible?}], effects?: [{type, visible?, color?, offset?, radius?, spread?}], layoutGrids?: [{pattern, sectionSize?, visible?, color?}]}"
                    ),
                styleId: z.string().optional().describe("ID of the style to update (if not creating a new one)"),
                bindVariables: z.record(z.string(), z.string().nullable()).optional().describe("Map of field names to variable IDs (to bind) or null (to unbind). For PAINT styles, valid fields include 'color'. For TEXT styles, fields include 'fontSize', 'fontFamily', etc."),
            }),
            outputSchema: z.object({
                id: z.string().describe("ID of the style"),
                name: z.string().describe("Name of the style"),
                type: z.string().describe("Type of the style"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("style.manage", params);
            return toolResult(result);
        }
    );

    // 3. Delete Style Tool
    server.registerTool(
        "style.delete",
        {
            title: "Delete Style",
            description: "Delete a local style by id. Detaches consumers — they keep their resolved values and lose only the style link.",
            inputSchema: z.object({
                styleId: z.string().describe("ID of style to delete"),
                styleName: z.string().describe("Expected name of style to delete (verification)"),
            }),
            outputSchema: z.object({
                success: z.boolean().describe("Whether style was successfully deleted"),
                message: z.string().describe("Success/failure status message"),
            }),
            annotations: {
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("style.delete", params);
            return toolResult(result);
        }
    );
}
