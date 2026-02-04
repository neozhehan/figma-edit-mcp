import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { normalizeNodeId } from "../utils.js";

export function registerModificationTools(server: McpServer) {
    // Move Node Tool
    server.tool(
        "move_node",
        "Move a node to a new position in Figma",
        {
            nodeId: z.string().describe("The ID of the node to move"),
            nodeName: z.string().describe("Name of the node to modify"),
            x: z.number().describe("New X position"),
            y: z.number().describe("New Y position"),
        },
        async ({ nodeId, nodeName, x, y }: any) => {
            try {
                const result = await sendCommandToFigma("move_node", {
                    nodeId,
                    nodeName,
                    x,
                    y,
                });
                const typedResult = result as { name: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Moved node "${typedResult.name}" to position (${x}, ${y})`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error moving node: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Resize Node Tool
    server.tool(
        "resize_node",
        "Resize a node in Figma",
        {
            nodeId: z.string().describe("The ID of the node to resize"),
            nodeName: z.string().describe("Name of the node to modify"),
            width: z.number().positive().describe("New width"),
            height: z.number().positive().describe("New height"),
        },
        async ({ nodeId, nodeName, width, height }: any) => {
            try {
                const result = await sendCommandToFigma("resize_node", {
                    nodeId,
                    nodeName,
                    width,
                    height,
                });
                const typedResult = result as { name: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Resized node "${typedResult.name}" to width ${width} and height ${height}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error resizing node: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Node Name Tool
    server.tool(
        "set_node_name",
        "Set the name of a node in Figma",
        {
            nodeId: z.string().describe("The ID of the node to rename"),
            nodeName: z.string().describe("Name of the node to modify"),
            name: z.string().describe("New name for the node"),
        },
        async ({ nodeId, nodeName, name }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("set_node_name", {
                    nodeId,
                    nodeName,
                    name,
                });
                const typedResult = result as { name: string; oldName: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Renamed node from "${typedResult.oldName}" to "${typedResult.name}"`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error renaming node: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Delete Multiple Nodes Tool
    server.tool(
        "delete_multiple_nodes",
        "Delete one or more nodes from Figma at once",
        {
            nodes: z
                .array(
                    z.object({
                        nodeId: z.string().describe("The ID of the node to delete"),
                        nodeName: z.string().describe("Name of the node to modify"),
                    })
                )
                .describe("Array of nodes to delete"),
        },
        async ({ nodes }: any) => {
            try {
                const result = await sendCommandToFigma("delete_multiple_nodes", {
                    nodes,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error deleting multiple nodes: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Clone Node Tool
    server.tool(
        "clone_node",
        "Clone an existing node in Figma",
        {
            nodeId: z.string().describe("The ID of the node to clone"),
            nodeName: z.string().describe("Name of the node to modify"),
            x: z.number().optional().describe("New X position for the clone"),
            y: z.number().optional().describe("New Y position for the clone"),
        },
        async ({ nodeId, nodeName, x, y }: any) => {
            try {
                const result = await sendCommandToFigma("clone_node", {
                    nodeId,
                    nodeName,
                    x,
                    y,
                });
                const typedResult = result as { name: string; id: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Cloned node "${typedResult.name}" with new ID: ${typedResult.id
                                }${x !== undefined && y !== undefined
                                    ? ` at position (${x}, ${y})`
                                    : ""
                                }`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error cloning node: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Selections Tool
    server.tool(
        "set_selections",
        "Set selection to one or more nodes in Figma and focus them",
        {
            nodeIds: z.array(z.string()).describe("Array of node IDs to select"),
        },
        async ({ nodeIds }: any) => {
            try {
                const result = await sendCommandToFigma("set_selections", { nodeIds });
                const typedResult = result as {
                    selectedNodes: Array<{ name: string; id: string }>;
                    count: number;
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Selected ${typedResult.count} nodes: ${typedResult.selectedNodes
                                .map((node) => `"${node.name}" (${node.id})`)
                                .join(", ")}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting selections: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );
}
