import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { normalizeNodeId } from "../utils.js";

export function registerLayoutTools(server: McpServer) {
    // Set Auto Layout Tool
    server.tool(
        "set_auto_layout",
        "Set auto-layout properties for a frame in Figma. This unified tool replaces individual layout tools.",
        {
            nodeId: z.string().describe("The ID of the frame to modify"),
            nodeName: z.string().describe("Name of the node to modify"),
            layoutMode: z
                .enum(["NONE", "HORIZONTAL", "VERTICAL"])
                .optional()
                .describe("Layout mode for the frame"),
            layoutWrap: z
                .enum(["NO_WRAP", "WRAP"])
                .optional()
                .describe("Whether the auto-layout frame wraps its children"),
            paddingTop: z.number().optional().describe("Top padding value"),
            paddingRight: z.number().optional().describe("Right padding value"),
            paddingBottom: z.number().optional().describe("Bottom padding value"),
            paddingLeft: z.number().optional().describe("Left padding value"),
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
        async ({
            nodeId,
            nodeName,
            layoutMode,
            layoutWrap,
            paddingTop,
            paddingRight,
            paddingBottom,
            paddingLeft,
            primaryAxisAlignItems,
            counterAxisAlignItems,
            layoutSizingHorizontal,
            layoutSizingVertical,
            itemSpacing,
            counterAxisSpacing,
        }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("set_auto_layout", {
                    nodeId,
                    nodeName,
                    layoutMode,
                    layoutWrap,
                    paddingTop,
                    paddingRight,
                    paddingBottom,
                    paddingLeft,
                    primaryAxisAlignItems,
                    counterAxisAlignItems,
                    layoutSizingHorizontal,
                    layoutSizingVertical,
                    itemSpacing,
                    counterAxisSpacing,
                });
                const typedResult = result as { name: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Set auto-layout properties for frame "${typedResult.name}"`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting auto-layout: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );
}
