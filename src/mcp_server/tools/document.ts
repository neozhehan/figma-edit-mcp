import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma, joinChannel, resetChannel } from "../figma-client.js";
import { normalizeNodeIds } from "../utils.js";

export function registerDocumentTools(server: McpServer) {
    // Page Info Tool
    server.tool(
        "get_pages_info",
        "Get information about pages in the Figma document. No argument or empty array returns all pages without children. 1 or more pageIds returns the requested pageIds with top-level children for each requested page. Prefer batches of ≤25 pageIds per call; for larger requests, split across multiple calls for better responsiveness.",
        {
            pageIds: z
                .array(z.string())
                .optional()
                .describe("Array of page IDs to inspect"),
        },
        async ({ pageIds }: any) => {
            try {
                const result = await sendCommandToFigma("get_pages_info", { pageIds });
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
                            text: `Error getting page info: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Nodes Info Tool
    server.tool(
        "get_nodes_info",
        `Get detailed information about one or more nodes. Supports recursive subtree traversal, property filtering, and streaming progress.

- If no nodeIds are provided, the tool defaults to the current 'editable scope' (the node(s) selected when the plugin was opened).
- Properties: When 'fields' is empty, only 'id', 'name', and 'type' are returned for each node. To get more data, specify fields from Figma's REST API (e.g., 'fills', 'strokes', 'characters', 'layoutMode').
- Safe-list: Common properties like 'id', 'name', 'type', 'visible', 'locked', 'children', and 'descendantCount' are always available and do not incur additional performance cost.
- Filtering: Use the 'filter' object to prune the tree (e.g., {"type": ["TEXT", "COMPONENT"]}). A node is included if it matches the filter OR has matching descendants.
- Depth: 'maxDepth' controls how deep the recursive walk goes. Use 0 for just the target nodes, or higher for subtrees. Boundary nodes at maxDepth will include a 'descendantCount'.
- Performance: This tool streams progress updates and is safe for deep traversals.

RESPONSE SHAPE:
- Returns { nodes: [...], missingNodeIds?: [...] }. Each node has recursive 'children' arrays. When 'fields' is non-empty, every node (top-level and descendants) carries a 'properties' sub-object with only applicable keys — inapplicable keys are omitted (never null). Top-level entries always include 'descendantCount' (total recursive descendants). Boundary nodes at 'maxDepth' also include 'descendantCount' so you can distinguish truncated nodes from genuine leaves.

PATH:
- Each top-level node includes a 'path' array of 3-tuples [type, id, name] representing the ancestor chain from the containing page down to the immediate parent. Pages have path === []. Direct children of a page have one element.

FILTER BEHAVIOR:
- Filters are applied recursively across the entire subtree. Non-matching ancestors of matching nodes are retained as structural containers. Filter evaluation only runs within the maxDepth window — matches deeper than the depth cap are invisible.

COST & LATENCY:
- Cost scales with SUBTREE SIZE, not nodeId count. A single PAGE-level id can be as expensive as thousands of leaf ids. Use 'maxDepth' to bound the walk.
- Non-safe-list 'fields' trigger per-node exportAsync (moderate cost on retained nodes only). Non-safe-list 'filter' keys trigger exportAsync on EVERY candidate descendant before pruning (higher cost). Prefer safe-list filter keys with tight nodeIds or maxDepth.

MISSING NODES:
- ALWAYS check 'missingNodeIds' in the response. Any nodeId not present in 'nodes' is listed there. Treat absence from 'nodes' as authoritative and surface to the user.

RECOMMENDED PAIRINGS:
- For cheap structural scans: safe-list filter + no fields.
- For targeted property reads: tight nodeIds or maxDepth + specific fields.
- For filtered property reads: safe-list filter + fields on retained nodes.`,
        {
            nodeIds: z
                .array(z.string())
                .optional()
                .describe("Array of node IDs to get information about. If empty, uses editable scope."),
            fields: z
                .array(z.string())
                .optional()
                .describe("Array of field names to return. Supported fields include 'fills', 'strokes', 'cornerRadius', 'opacity', 'blendMode', 'effects', 'characters', 'style', 'layoutMode', 'itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'primaryAxisAlignItems', 'counterAxisAlignItems', 'absoluteBoundingBox', 'visible', 'locked', 'componentPropertyDefinitions', 'componentProperties', 'overrides', 'transitionNodeID', 'transitionDuration', 'transitionEasing'."),
            filter: z
                .record(z.array(z.string()))
                .optional()
                .describe("Optional filter criteria. Format: { fieldName: [value1, value2] }. Example: { type: ['TEXT', 'COMPONENT'], layoutMode: ['HORIZONTAL'] }. Matches are case-sensitive and multiple values for a field are treated as OR. Multiple fields are treated as AND."),
            maxDepth: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Maximum depth for recursive child traversal. 0 = self only, 1 = self and immediate children, etc. If omitted, performs a full depth traversal (use with caution on large subtrees)."),
        },
        async ({ nodeIds, fields, filter, maxDepth }: any) => {
            try {
                if (nodeIds) {
                    nodeIds = normalizeNodeIds(nodeIds);
                }
                const results = await sendCommandToFigma("get_nodes_info", { 
                    nodeIds, 
                    properties: fields, // Map 'fields' to 'properties' for plugin handler
                    filter, 
                    maxDepth 
                });

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(results),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error getting nodes info: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        }
    );


    // Update the join_channel tool
    server.tool(
        "join_channel",
        "Join a specific channel to communicate with Figma",
        {
            channel: z
                .string()
                .describe("The name of the channel to join")
                .default(""),
        },
        async ({ channel }: any) => {
            try {
                if (!channel) {
                    // If no channel provided, ask the user for input
                    return {
                        content: [
                            {
                                type: "text",
                                text: "Please provide a channel name to join:",
                            },
                        ],
                        followUp: {
                            tool: "join_channel",
                            description: "Join the specified channel",
                        },
                    };
                }

                try {
                    await joinChannel(channel);
                } catch (error: any) {
                    let errorCode = "UNKNOWN_ERROR";
                    let errorMessage = `An unexpected error occurred while joining the channel: ${error.message || String(error)}.`;

                    if (error.joinErrorCode === "CHANNEL_NOT_FOUND") {
                        errorCode = "CHANNEL_NOT_FOUND";
                        errorMessage = `Channel '${channel}' was not found. Verify the channel name and that the Figma plugin is running and connected.`;
                    } else if (error.message && error.message.includes("timed out")) {
                        errorCode = "CHANNEL_JOIN_FAILED";
                        errorMessage = `Failed to join channel '${channel}'. The Figma plugin did not acknowledge the join within the expected time. Try reconnecting the plugin.`;
                    } else if (error.message && error.message.includes("Connection closed")) {
                        errorCode = "PLUGIN_DISCONNECTED";
                        errorMessage = "The Figma plugin disconnected before the editable scope could be read. Reopen the plugin and try again.";
                    }

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                status: "error",
                                channel,
                                errorCode,
                                errorMessage
                            })
                        }]
                    };
                }

                // Leg 2: Get connect payload
                let payload: any;
                try {
                    payload = await sendCommandToFigma("get_connect_payload");
                } catch (error: any) {
                    resetChannel();
                    let errorCode = "UNKNOWN_ERROR";
                    let errorMessage = `An unexpected error occurred while joining the channel: ${error.message || String(error)}.`;

                    if (error.message && error.message.includes("Connection closed")) {
                        errorCode = "PLUGIN_DISCONNECTED";
                        errorMessage = "The Figma plugin disconnected before the editable scope could be read. Reopen the plugin and try again.";
                    }

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                status: "error",
                                channel,
                                errorCode,
                                errorMessage
                            })
                        }]
                    };
                }

                // Handle structured plugin error
                if (payload && payload.errorCode) {
                    resetChannel();
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                status: "error",
                                channel,
                                errorCode: payload.errorCode,
                                errorMessage: payload.errorMessage
                            })
                        }]
                    };
                }

                // Success path
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "success",
                            channel,
                            ...payload
                        })
                    }]
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                status: "error",
                                channel,
                                errorCode: "UNKNOWN_ERROR",
                                errorMessage: `An unexpected error occurred while joining the channel: ${error.message || String(error)}.`
                            }),
                        },
                    ],
                };
            }
        }
    );


}
