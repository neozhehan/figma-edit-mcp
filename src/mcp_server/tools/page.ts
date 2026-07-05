import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput } from "./_result.js";

export function registerPageTools(server: McpServer) {
    server.registerTool(
        "page_info",
        {
            title: "Get Pages",
            description: "List the document's pages; no args → all pages (no children), or pass `pageIds` → those pages with their top-level children. Batch ≤25 ids/call.",
            inputSchema: z.object({
                pageIds: z
                    .array(z.string())
                    .optional()
                    .describe("Array of page IDs to inspect"),
            }),
            outputSchema: looseOutput({
                documentId: z.string().describe("ID of the Figma document"),
                documentName: z.string().describe("Name of the Figma document"),
                pageCount: z.number().describe("Total page count"),
                pages: z.array(z.object({
                    pageId: z.string().describe("ID of the page"),
                    pageName: z.string().describe("Name of the page"),
                    descendantCount: z.number().optional().describe("Total recursive descendants inside this page"),
                    children: z.array(z.object({
                        id: z.string().describe("Child node ID"),
                        name: z.string().describe("Child node name"),
                        type: z.string().describe("Child node type"),
                    })).optional().describe("Top-level children in the page"),
                })).describe("List of page objects"),
                missingPageIds: z.array(z.string()).optional().describe("Page IDs that could not be found"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async ({ pageIds }: any) => {
            const result = await sendCommandToFigma("page_info", { pageIds });
            return toolResult(result);
        }
    );
}
