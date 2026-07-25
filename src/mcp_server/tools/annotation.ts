import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput, batchResults } from "./_result.js";

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
            outputSchema: looseOutput({
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
            description: "Create or update native annotations on one or more nodes in a batched call (per item: `annotationId` present = update, absent = create). If the status is 'partial_success', treat it as an incomplete operation, report the failed and skipped items to the user, and retry every non-success item (both failed and skipped).",
            inputSchema: z.object({
                annotations: z
                    .array(
                        z.object({
                            nodeId: z.string().describe("The node ID to annotate"),
                            nodeName: z.string().describe("Expected name of the node (verification)"),
                            annotationId: z.string().optional().describe("If updating: ID of the existing annotation"),
                            categoryId: z.string().describe("The ID of the category"),
                            status: z.enum(["TODO", "DONE", "NONE"]).optional().describe("Annotation status"),
                            properties: z.record(z.string(), z.any()).optional().describe("Custom metadata properties"),
                        })
                    )
                    .min(1)
                    .describe("Array of annotations to set"),
            }),
            outputSchema: looseOutput({
                success: z.boolean().describe("Whether all annotations were set successfully"),
                status: z.enum(["success", "partial_success", "failed"]).describe("Overall status of the batch operation"),
                requestedCount: z.number().describe("Number of requested annotations"),
                succeededCount: z.number().describe("Number of succeeded annotations"),
                failedCount: z.number().describe("Number of failed annotations"),
                skippedCount: z.number().describe("Number of skipped annotations"),
                results: batchResults("Detailed execution results (one row per input, in input order)"),
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
