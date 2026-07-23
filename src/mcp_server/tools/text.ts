import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput } from "./_result.js";
import { noDuplicateTargets } from "./_batch.js";

export function registerTextTools(server: McpServer) {
    // 1. Set Text Contents Tool
    server.registerTool(
        "text_set_content",
        {
            title: "Set Text Contents",
            description: "Set the text of one or more text nodes in a single batched, per-item-validated call. If the status is 'partial_success', treat it as an incomplete operation, report the failed and skipped items to the user, and retry every non-success item (both failed and skipped).",
            inputSchema: z.object({
                text: z
                    .array(
                        z.object({
                            nodeId: z.string().describe("ID of the text node"),
                            nodeName: z.string().describe("Expected name of the node (verification)"),
                            characters: z.string().describe("New text content"),
                        })
                    )
                    .min(1)
                    .superRefine(noDuplicateTargets)
                    .describe("Array of text objects"),
            }),
            outputSchema: looseOutput({
                success: z.boolean().describe("Whether all replacements succeeded"),
                status: z.enum(["success", "partial_success", "failed"]).describe("Overall status of the batch operation"),
                requestedCount: z.number().describe("Number of requested text replacements"),
                succeededCount: z.number().describe("Number of succeeded text replacements"),
                failedCount: z.number().describe("Number of failed text replacements"),
                skippedCount: z.number().describe("Number of skipped text replacements"),
                results: z.array(z.any()).optional().describe("Detailed results per node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ text }: any) => {
            const result = await sendCommandToFigma("text_set_content", { text });
            return toolResult(result);
        }
    );

    // 2. Set Text Style Tool
    server.registerTool(
        "text_set_style",
        {
            title: "Set Text Style",
            description: "Set any combination of typography properties (font, size, weight, spacing, decoration, …) on a text node.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the text node to modify"),
                nodeName: z.string().describe("Name of the node to verify against"),
                fontSize: z.number().optional().describe("Font size"),
                fontName: z
                    .object({
                        family: z.string().describe("Font family name"),
                        style: z.string().describe("Font style name (e.g. Regular, Bold)"),
                    })
                    .optional()
                    .describe("Font family and style"),
                lineHeight: z
                    .union([
                        z.object({
                            unit: z.literal("AUTO").describe("Auto line height"),
                        }),
                        z.object({
                            value: z.number().describe("Line height value"),
                            unit: z.enum(["PIXELS", "PERCENT"]).describe("Line height unit"),
                        })
                    ])
                    .optional()
                    .describe("Line height settings"),
                letterSpacing: z
                    .object({
                        value: z.number().describe("Letter spacing value"),
                        unit: z.enum(["PIXELS", "PERCENT"]).describe("Letter spacing unit"),
                    })
                    .optional()
                    .describe("Letter spacing settings"),
                paragraphIndent: z.number().optional().describe("Paragraph indent in pixels"),
                paragraphSpacing: z.number().optional().describe("Paragraph spacing in pixels"),
                textCase: z
                    .enum(["ORIGINAL", "UPPER", "LOWER", "TITLE", "SMALL_CAPS", "SMALL_CAPS_FORCED"])
                    .optional()
                    .describe("Case transformation on the text"),
                textDecoration: z
                    .enum(["NONE", "UNDERLINE", "STRIKETHROUGH"])
                    .optional()
                    .describe("Text decoration"),
                textAlignHorizontal: z
                    .enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"])
                    .optional()
                    .describe("Horizontal text alignment"),
                textAlignVertical: z
                    .enum(["TOP", "CENTER", "BOTTOM"])
                    .optional()
                    .describe("Vertical text alignment"),
            }),
            outputSchema: looseOutput({
                success: z.boolean().optional().describe("Whether style was set successfully"),
                name: z.string().optional().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("text_set_style", params);
            return toolResult(result);
        }
    );
}
