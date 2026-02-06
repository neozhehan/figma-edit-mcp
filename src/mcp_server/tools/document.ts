import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma, joinChannel } from "../figma-client.js";
import { normalizeNodeIds } from "../utils.js";

export function registerDocumentTools(server: McpServer) {
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
                            text: JSON.stringify(result),
                        },
                    ],
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
            pageId: z
                .string()
                .optional()
                .describe("ID of the page to inspect (default: current page)"),
        },
        async ({ pageId }: any) => {
            try {
                const result = await sendCommandToFigma("get_page_info", { pageId });
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
        },
        async ({ nodeIds }: any) => {
            try {
                if (nodeIds) {
                    nodeIds = normalizeNodeIds(nodeIds);
                }
                const results = await sendCommandToFigma("get_nodes_info", { nodeIds });

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

                await joinChannel(channel);

                // Fetch scope info after joining
                let scopeMessage = `Successfully joined channel: ${channel}`;
                try {
                    const scopeResult = await sendCommandToFigma("get_nodes_info", {});
                    if (Array.isArray(scopeResult) && scopeResult.length > 0) {
                        const scopeNode: any = scopeResult[0];
                        const nodeName = scopeNode.document?.name || 'Unknown';
                        scopeMessage += `\n\nEditable Scope identified:\n- Node Name: ${nodeName}\n- Node ID: ${scopeNode.nodeId}\n\nYou have edit access to this node and its children.`;
                    } else {
                        scopeMessage += `\n\nPlugin is in Read-Only Mode. You can read the design but cannot make changes.`;
                    }
                } catch (scopeError) {
                    scopeMessage += `\n\nNote: Could not automatically determine editable scope. You may be in Read-Only mode.`;
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: scopeMessage,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error joining channel: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Define design strategy prompt
    server.prompt(
        "design_strategy",
        "Best practices for working with Figma designs",
        (extra) => {
            return {
                messages: [
                    {
                        role: "assistant",
                        content: {
                            type: "text",
                            text: `When working with Figma designs, follow these best practices:

1. Start with Document Structure:
   - First use get_document_info() to understand the current document
   - Plan your layout hierarchy before creating elements
   - Create a main container frame for each screen/section

2. Naming Conventions:
   - Use descriptive, semantic names for all elements
   - Follow a consistent naming pattern (e.g., "Login Screen", "Logo Container", "Email Input")
   - Group related elements with meaningful names

3. Layout Hierarchy:
   - Create parent frames first, then add child elements
   - For forms/login screens:
     * Start with the main screen container frame
     * Create a logo container at the top
     * Group input fields in their own containers
     * Place action buttons (login, submit) after inputs
     * Add secondary elements (forgot password, signup links) last

4. Input Fields Structure:
   - Create a container frame for each input field
   - Include a label text above or inside the input
   - Group related inputs (e.g., username/password) together

5. Element Creation:
   - Use create_frame() for containers and input fields
   - Use create_text() for labels, buttons text, and links
   - Set appropriate colors and styles:
     * Use fillColor for backgrounds
     * Use strokeColor for borders
     * Set proper fontWeight for different text elements

6. Mofifying existing elements:
  - use set_multiple_text_contents() to modify text content.

7. Visual Hierarchy:
   - Position elements in logical reading order (top to bottom)
   - Maintain consistent spacing between elements
   - Use appropriate font sizes for different text types:
     * Larger for headings/welcome text
     * Medium for input labels
     * Standard for button text
     * Smaller for helper text/links

8. Best Practices:
   - Verify each creation with get_nodes_info()
   - Use parentId to maintain proper hierarchy
   - Group related elements together in frames
   - Keep consistent spacing and alignment

Example Login Screen Structure:
- Login Screen (main frame)
  - Logo Container (frame)
    - Logo (image/text)
  - Welcome Text (text)
  - Input Container (frame)
    - Email Input (frame)
      - Email Label (text)
      - Email Field (frame)
    - Password Input (frame)
      - Password Label (text)
      - Password Field (frame)
  - Login Button (frame)
    - Button Text (text)
  - Helper Links (frame)
    - Forgot Password (text)
    - Don't have account (text)`,
                        },
                    },
                ],
                description: "Best practices for working with Figma designs",
            };
        }
    );

    server.prompt(
        "read_design_strategy",
        "Best practices for reading Figma designs",
        (extra) => {
            return {
                messages: [
                    {
                        role: "assistant",
                        content: {
                            type: "text",
                            text: `When reading Figma designs, follow these best practices:

1. Start with Document Info:
   - Use get_document_info() to explore the page structure
   - Identify nodes by their IDs
`,
                        },
                    },
                ],
                description: "Best practices for reading Figma designs",
            };
        }
    );
}
