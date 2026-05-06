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
        "Get detailed information about one or more nodes. If no IDs provided, returns the editable scope node.",
        {
            nodeIds: z
                .array(z.string())
                .optional()
                .describe("Array of node IDs to get information about"),
            fields: z
                .array(z.string())
                .optional()
                .describe("Array of field names to return. Must exactly match keys in Figma's JSON_REST_V1 export format. Supported fields - Component Properties: componentPropertyDefinitions, componentProperties. Instance Data: overrides. Layout & Positioning: layoutMode, itemSpacing, paddingLeft, paddingRight, paddingTop, paddingBottom, primaryAxisAlignItems, counterAxisAlignItems, absoluteBoundingBox. Styling: fills, strokes, cornerRadius, opacity, blendMode, effects. Text: characters, style. Prototyping: transitionNodeID, transitionDuration, transitionEasing. Metadata: visible, locked. Default behavior: When empty or omitted, only id, name, type are returned per node (plus recursive children)."),
        },
        async ({ nodeIds, fields }: any) => {
            try {
                if (nodeIds) {
                    nodeIds = normalizeNodeIds(nodeIds);
                }
                const results = await sendCommandToFigma("get_nodes_info", { nodeIds, fields });

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
                            text: `Error getting nodes info: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Node Type Scanning Tool
    server.tool(
        "scan_nodes_by_types",
        "Scan for child nodes with specific types in the selected Figma node",
        {
            nodeId: z.string().describe("ID of the node to scan"),
            types: z
                .array(z.string())
                .describe(
                    "Array of node types to find in the child nodes (e.g. ['COMPONENT', 'FRAME'])"
                ),
        },
        async ({ nodeId, types }: any) => {
            try {
                // Initial response to indicate we're starting the process
                const initialStatus = {
                    type: "text" as const,
                    text: `Starting node type scanning for types: ${types.join(", ")}...`,
                };

                // Use the plugin's scan_nodes_by_types function
                const result = await sendCommandToFigma("scan_nodes_by_types", {
                    nodeId,
                    types,
                });

                // Format the response
                if (result && typeof result === "object" && "matchingNodes" in result) {
                    const typedResult = result as {
                        success: boolean;
                        count: number;
                        matchingNodes: Array<{
                            id: string;
                            name: string;
                            type: string;
                            bbox: {
                                x: number;
                                y: number;
                                width: number;
                                height: number;
                            };
                        }>;
                        searchedTypes: Array<string>;
                    };

                    const summaryText = `Scan completed: Found ${typedResult.count
                        } nodes matching types: ${typedResult.searchedTypes.join(", ")}`;

                    return {
                        content: [
                            initialStatus,
                            {
                                type: "text" as const,
                                text: summaryText,
                            },
                            {
                                type: "text" as const,
                                text: JSON.stringify(typedResult.matchingNodes, null, 2),
                            },
                        ],
                    };
                }

                // If the result is in an unexpected format, return it as is
                return {
                    content: [
                        initialStatus,
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error scanning nodes by types: ${error instanceof Error ? error.message : String(error)
                                }`,
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
