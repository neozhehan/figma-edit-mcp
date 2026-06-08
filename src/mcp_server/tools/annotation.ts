import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult } from "./_result.js";

export function registerAnnotationTools(server: McpServer) {
    // 1. List Annotations Tool
    server.registerTool(
        "annotation_list",
        {
            title: "List Annotations",
            description: "Read the native annotations on a page or node (and subtree); exactly one of pageId or nodeId is required. Optionally include the file's annotation categories.",
            inputSchema: z.object({
                pageId: z.string().optional().describe("The page ID to get annotations from. Exactly one of pageId or nodeId is required."),
                nodeId: z.string().optional().describe("The node ID to get annotations from. Exactly one of pageId or nodeId is required."),
                includeCategories: z.boolean().optional().describe("If true, retrieves the list of global annotation categories in the file"),
            }),
            outputSchema: z.object({
                annotations: z.array(z.any()).optional().describe("List of annotations"),
                categories: z.array(z.any()).optional().describe("List of global annotation categories"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("annotation_list", params);
            return toolResult(result);
        }
    );

    // 2. Set Annotations Tool
    server.registerTool(
        "annotation_set",
        {
            title: "Set Annotations",
            description: "Create or update native annotations on one or more nodes in a batched call (per item: `annotationId` present = update, absent = create).",
            inputSchema: z.object({
                annotations: z
                    .array(
                        z.object({
                            nodeId: z.string().describe("The node ID to annotate"),
                            nodeName: z.string().describe("Expected name of the node (verification)"),
                            annotationId: z.string().optional().describe("If updating: ID of the existing annotation"),
                            categoryId: z.string().describe("The ID of the category"),
                            status: z.enum(["TODO", "DONE", "NONE"]).optional().describe("Annotation status"),
                            properties: z.record(z.any()).optional().describe("Custom metadata properties"),
                        })
                    )
                    .describe("Array of annotations to set"),
            }),
            outputSchema: z.object({
                success: z.boolean().optional().describe("Whether annotations were set successfully"),
                results: z.any().optional().describe("Detailed execution results"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ annotations }: any) => {
            const result = await sendCommandToFigma("annotation_set", { annotations });
            return toolResult(result);
        }
    );
}
