import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "./figma-client.js";
import { normalizeNodeIds, normalizeNodeId } from "./utils.js";

export function registerTools(server: McpServer) {
    // Document Info Tool
    server.tool(
        "get_document_info",
        "Get detailed information about the current Figma document",
        {},
        async () => {
            try {
                const result = await sendCommandToFigma("get_document_info");
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result)
                        }
                    ]
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error getting document info: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Page Info Tool
    server.tool(
        "get_page_info",
        "Get information about a specific page in Figma including its children",
        {
            pageId: z.string().optional().describe("ID of the page to inspect (default: current page)")
        },
        async ({ pageId }: any) => {
            try {
                const result = await sendCommandToFigma("get_page_info", { pageId });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result)
                        }
                    ]
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error getting page info: ${error instanceof Error ? error.message : String(error)}`
                        },
                    ],
                };
            }
        }
    );

    // Nodes Info Tool
    server.tool(
        "get_nodes_info",
        "Get detailed information about one or more nodes in Figma",
        {
            nodeIds: z.array(z.string()).describe("Array of node IDs to get information about")
        },
        async ({ nodeIds }: any) => {
            try {
                nodeIds = normalizeNodeIds(nodeIds);
                const results = await sendCommandToFigma("get_nodes_info", { nodeIds });

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(results)
                        }
                    ]
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error getting nodes info: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Create Rectangle Tool
    server.tool(
        "create_rectangle",
        "Create a new rectangle in Figma",
        {
            x: z.number().describe("X position"),
            y: z.number().describe("Y position"),
            width: z.number().describe("Width of the rectangle"),
            height: z.number().describe("Height of the rectangle"),
            name: z.string().optional().describe("Optional name for the rectangle"),
            parentId: z
                .string()
                .optional()
                .describe("Optional parent node ID to append the rectangle to"),
            parentNodeName: z.string().optional().describe("Name of the parent node to verify against"),
        },
        async ({ x, y, width, height, name, parentId, parentNodeName }: any) => {
            try {
                const result = await sendCommandToFigma("create_rectangle", {
                    x,
                    y,
                    width,
                    height,
                    name: name || "Rectangle",
                    parentId,
                    parentNodeName,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Created rectangle "${JSON.stringify(result)}"`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating rectangle: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );
}
