import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";

export function registerAssetTools(server: McpServer) {
    // Export Node as Image Tool
    server.tool(
        "export_node_as_image",
        "Export a node as an image from Figma",
        {
            nodeId: z.string().describe("The ID of the node to export"),
            format: z
                .enum(["PNG", "JPG", "SVG", "PDF"])
                .optional()
                .describe("Export format"),
            scale: z.number().positive().optional().describe("Export scale"),
        },
        async ({ nodeId, format, scale }: any) => {
            try {
                const result = await sendCommandToFigma("export_node_as_image", {
                    nodeId,
                    format: format || "PNG",
                    scale: scale || 1,
                });
                const typedResult = result as { imageData: string; mimeType: string };

                return {
                    content: [
                        {
                            type: "image",
                            data: typedResult.imageData,
                            mimeType: typedResult.mimeType || "image/png",
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error exporting node as image: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );
}
