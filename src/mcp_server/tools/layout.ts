import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { normalizeNodeId } from "../utils.js";

export function registerLayoutTools(server: McpServer) {
    // Set Layout Mode Tool
    server.tool(
        "set_layout_mode",
        "Set the layout mode and wrap behavior of a frame in Figma",
        {
            nodeId: z.string().describe("The ID of the frame to modify"),
            nodeName: z.string().describe("Name of the node to modify"),
            layoutMode: z
                .enum(["NONE", "HORIZONTAL", "VERTICAL"])
                .describe("Layout mode for the frame"),
            layoutWrap: z
                .enum(["NO_WRAP", "WRAP"])
                .optional()
                .describe("Whether the auto-layout frame wraps its children"),
        },
        async ({ nodeId, nodeName, layoutMode, layoutWrap }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("set_layout_mode", {
                    nodeId,
                    nodeName,
                    layoutMode,
                    layoutWrap: layoutWrap || "NO_WRAP",
                });
                const typedResult = result as { name: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Set layout mode of frame "${typedResult.name}" to ${layoutMode}${layoutWrap ? ` with ${layoutWrap}` : ""
                                }`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting layout mode: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Padding Tool
    server.tool(
        "set_padding",
        "Set padding values for an auto-layout frame in Figma",
        {
            nodeId: z.string().describe("The ID of the frame to modify"),
            nodeName: z.string().describe("Name of the node to modify"),
            paddingTop: z.number().optional().describe("Top padding value"),
            paddingRight: z.number().optional().describe("Right padding value"),
            paddingBottom: z.number().optional().describe("Bottom padding value"),
            paddingLeft: z.number().optional().describe("Left padding value"),
        },
        async ({
            nodeId,
            nodeName,
            paddingTop,
            paddingRight,
            paddingBottom,
            paddingLeft,
        }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("set_padding", {
                    nodeId,
                    nodeName,
                    paddingTop,
                    paddingRight,
                    paddingBottom,
                    paddingLeft,
                });
                const typedResult = result as { name: string };

                // Create a message about which padding values were set
                const paddingMessages = [];
                if (paddingTop !== undefined) paddingMessages.push(`top: ${paddingTop}`);
                if (paddingRight !== undefined)
                    paddingMessages.push(`right: ${paddingRight}`);
                if (paddingBottom !== undefined)
                    paddingMessages.push(`bottom: ${paddingBottom}`);
                if (paddingLeft !== undefined)
                    paddingMessages.push(`left: ${paddingLeft}`);

                const paddingText =
                    paddingMessages.length > 0
                        ? `padding (${paddingMessages.join(", ")})`
                        : "padding";

                return {
                    content: [
                        {
                            type: "text",
                            text: `Set ${paddingText} for frame "${typedResult.name}"`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting padding: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Axis Align Tool
    server.tool(
        "set_axis_align",
        "Set primary and counter axis alignment for an auto-layout frame in Figma",
        {
            nodeId: z.string().describe("The ID of the frame to modify"),
            nodeName: z.string().describe("Name of the node to modify"),
            primaryAxisAlignItems: z
                .enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN"])
                .optional()
                .describe(
                    "Primary axis alignment (MIN/MAX = left/right in horizontal, top/bottom in vertical). Note: When set to SPACE_BETWEEN, itemSpacing will be ignored as children will be evenly spaced."
                ),
            counterAxisAlignItems: z
                .enum(["MIN", "MAX", "CENTER", "BASELINE"])
                .optional()
                .describe(
                    "Counter axis alignment (MIN/MAX = top/bottom in horizontal, left/right in vertical)"
                ),
        },
        async ({
            nodeId,
            nodeName,
            primaryAxisAlignItems,
            counterAxisAlignItems,
        }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("set_axis_align", {
                    nodeId,
                    nodeName,
                    primaryAxisAlignItems,
                    counterAxisAlignItems,
                });
                const typedResult = result as { name: string };

                // Create a message about which alignments were set
                const alignMessages = [];
                if (primaryAxisAlignItems !== undefined)
                    alignMessages.push(`primary: ${primaryAxisAlignItems}`);
                if (counterAxisAlignItems !== undefined)
                    alignMessages.push(`counter: ${counterAxisAlignItems}`);

                const alignText =
                    alignMessages.length > 0
                        ? `axis alignment (${alignMessages.join(", ")})`
                        : "axis alignment";

                return {
                    content: [
                        {
                            type: "text",
                            text: `Set ${alignText} for frame "${typedResult.name}"`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting axis alignment: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Layout Sizing Tool
    server.tool(
        "set_layout_sizing",
        "Set horizontal and vertical sizing modes for an auto-layout frame in Figma",
        {
            nodeId: z.string().describe("The ID of the frame to modify"),
            nodeName: z.string().describe("Name of the node to modify"),
            layoutSizingHorizontal: z
                .enum(["FIXED", "HUG", "FILL"])
                .optional()
                .describe(
                    "Horizontal sizing mode (HUG for frames/text only, FILL for auto-layout children only)"
                ),
            layoutSizingVertical: z
                .enum(["FIXED", "HUG", "FILL"])
                .optional()
                .describe(
                    "Vertical sizing mode (HUG for frames/text only, FILL for auto-layout children only)"
                ),
        },
        async ({
            nodeId,
            nodeName,
            layoutSizingHorizontal,
            layoutSizingVertical,
        }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("set_layout_sizing", {
                    nodeId,
                    nodeName,
                    layoutSizingHorizontal,
                    layoutSizingVertical,
                });
                const typedResult = result as { name: string };

                // Create a message about which sizing modes were set
                const sizingMessages = [];
                if (layoutSizingHorizontal !== undefined)
                    sizingMessages.push(`horizontal: ${layoutSizingHorizontal}`);
                if (layoutSizingVertical !== undefined)
                    sizingMessages.push(`vertical: ${layoutSizingVertical}`);

                const sizingText =
                    sizingMessages.length > 0
                        ? `layout sizing (${sizingMessages.join(", ")})`
                        : "layout sizing";

                return {
                    content: [
                        {
                            type: "text",
                            text: `Set ${sizingText} for frame "${typedResult.name}"`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting layout sizing: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Item Spacing Tool
    server.tool(
        "set_item_spacing",
        "Set distance between children in an auto-layout frame",
        {
            nodeId: z.string().describe("The ID of the frame to modify"),
            expectedName: z
                .string()
                .describe("The name of the node to verify against before modifying"),
            itemSpacing: z
                .number()
                .optional()
                .describe(
                    "Distance between children. Note: This value will be ignored if primaryAxisAlignItems is set to SPACE_BETWEEN."
                ),
            counterAxisSpacing: z
                .number()
                .optional()
                .describe(
                    "Distance between wrapped rows/columns. Only works when layoutWrap is set to WRAP."
                ),
        },
        async ({ nodeId, expectedName, itemSpacing, counterAxisSpacing }: any) => {
            try {
                const params: any = { nodeId, expectedName };
                if (itemSpacing !== undefined) params.itemSpacing = itemSpacing;
                if (counterAxisSpacing !== undefined)
                    params.counterAxisSpacing = counterAxisSpacing;

                const result = await sendCommandToFigma("set_item_spacing", params);
                const typedResult = result as {
                    name: string;
                    itemSpacing?: number;
                    counterAxisSpacing?: number;
                };

                let message = `Updated spacing for frame "${typedResult.name}":`;
                if (itemSpacing !== undefined) message += ` itemSpacing=${itemSpacing}`;
                if (counterAxisSpacing !== undefined)
                    message += ` counterAxisSpacing=${counterAxisSpacing}`;

                return {
                    content: [
                        {
                            type: "text",
                            text: message,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting spacing: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );
}
