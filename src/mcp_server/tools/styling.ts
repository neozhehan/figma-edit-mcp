import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { normalizeNodeId } from "../utils.js";

export function registerStylingTools(server: McpServer) {
    // Set Fill Color Tool
    server.tool(
        "set_fill_color",
        "Set the fill color of a node in Figma can be TextNode or FrameNode",
        {
            nodeId: z.string().describe("The ID of the node to modify"),
            nodeName: z.string().describe("Name of the node to modify"),
            r: z.number().min(0).max(1).describe("Red component (0-1)"),
            g: z.number().min(0).max(1).describe("Green component (0-1)"),
            b: z.number().min(0).max(1).describe("Blue component (0-1)"),
            a: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe("Alpha component (0-1)"),
        },
        async ({ nodeId, nodeName, r, g, b, a }: any) => {
            try {
                const result = await sendCommandToFigma("set_fill_color", {
                    nodeId,
                    nodeName,
                    color: { r, g, b, a: a || 1 },
                });
                const typedResult = result as { name: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Set fill color of node "${typedResult.name}" to RGBA(${r}, ${g}, ${b}, ${a || 1
                                })`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting fill color: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Stroke Color Tool
    server.tool(
        "set_stroke_color",
        "Set the stroke color of a node in Figma",
        {
            nodeId: z.string().describe("The ID of the node to modify"),
            nodeName: z.string().describe("Name of the node to modify"),
            r: z.number().min(0).max(1).describe("Red component (0-1)"),
            g: z.number().min(0).max(1).describe("Green component (0-1)"),
            b: z.number().min(0).max(1).describe("Blue component (0-1)"),
            a: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe("Alpha component (0-1)"),
            weight: z.number().positive().optional().describe("Stroke weight"),
        },
        async ({ nodeId, nodeName, r, g, b, a, weight }: any) => {
            try {
                const result = await sendCommandToFigma("set_stroke_color", {
                    nodeId,
                    nodeName,
                    color: { r, g, b, a: a || 1 },
                    weight: weight || 1,
                });
                const typedResult = result as { name: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Set stroke color of node "${typedResult.name}" to RGBA(${r}, ${g}, ${b}, ${a || 1
                                }) with weight ${weight || 1}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting stroke color: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Corner Radius Tool
    server.tool(
        "set_corner_radius",
        "Set the corner radius of a node in Figma",
        {
            nodeId: z.string().describe("The ID of the node to modify"),
            nodeName: z.string().describe("Name of the node to modify"),
            radius: z.number().min(0).describe("Corner radius value"),
            corners: z
                .array(z.boolean())
                .length(4)
                .optional()
                .describe(
                    "Optional array of 4 booleans to specify which corners to round [topLeft, topRight, bottomRight, bottomLeft]"
                ),
        },
        async ({ nodeId, nodeName, radius, corners }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("set_corner_radius", {
                    nodeId,
                    nodeName,
                    radius,
                    corners: corners || [true, true, true, true],
                });
                const typedResult = result as { name: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Set corner radius of node "${typedResult.name}" to ${radius}px`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting corner radius: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Effects Tool
    server.tool(
        "set_effects",
        "Applies shadow/effect arrays to nodes.",
        {
            nodeId: z.string().describe("The ID of the node to modify"),
            nodeName: z.string().describe("Name of the node to verify against"),
            effects: z
                .array(
                    z.object({
                        type: z.enum([
                            "DROP_SHADOW",
                            "INNER_SHADOW",
                            "LAYER_BLUR",
                            "BACKGROUND_BLUR",
                        ]),
                        visible: z.boolean().optional(),
                        color: z
                            .object({
                                r: z.number(),
                                g: z.number(),
                                b: z.number(),
                                a: z.number().optional(),
                            })
                            .optional(),
                        offset: z.object({ x: z.number(), y: z.number() }).optional(),
                        radius: z.number().optional(),
                        spread: z.number().optional(),
                        blendMode: z.string().optional(),
                        showShadowBehindNode: z.boolean().optional(),
                    })
                )
                .describe("Array of effect objects"),
        },
        async ({ nodeId, nodeName, effects }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("set_effects", {
                    nodeId,
                    nodeName,
                    effects,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting effects: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Get Styles Tool
    server.tool(
        "get_styles",
        "Get all styles from the current Figma document",
        {},
        async () => {
            try {
                const result = await sendCommandToFigma("get_styles");
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
                            text: `Error getting styles: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Create Style Tool
    server.tool(
        "create_style",
        "Creates named styles (Text, Paint, Effect, Grid).",
        {
            type: z
                .enum(["TEXT", "PAINT", "EFFECT", "GRID"])
                .describe("Type of style to create"),
            name: z.string().describe("Name of the style"),
            description: z.string().optional().describe("Description of the style"),
            propertiesJson: z
                .string()
                .optional()
                .describe(
                    "JSON string containing style properties: {fontName?: {family, style}, fontSize?: number, paints?: [{type, color?, opacity?, visible?}], effects?: [{type, visible?, color?, offset?, radius?, spread?}], layoutGrids?: [{pattern, sectionSize?, visible?, color?}]}"
                ),
        },
        async ({ type, name, description, propertiesJson }: any) => {
            try {
                let properties;
                if (propertiesJson) {
                    try {
                        properties = JSON.parse(propertiesJson);
                    } catch (e) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Error parsing propertiesJson: ${e instanceof Error ? e.message : String(e)
                                        }`,
                                },
                            ],
                        };
                    }
                }
                const result = await sendCommandToFigma("create_style", {
                    type,
                    name,
                    description,
                    properties,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating style: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Apply Style Tool
    server.tool(
        "apply_style",
        "Applies a style to a node by ID.",
        {
            nodeId: z.string().describe("The ID of the node to apply style to"),
            nodeName: z.string().describe("Name of the node to verify against"),
            styleId: z.string().describe("The ID of the style to apply"),
            styleType: z
                .enum(["TEXT", "FILL", "STROKE", "EFFECT", "GRID"])
                .describe("Type of style to apply (target property)"),
        },
        async ({ nodeId, nodeName, styleId, styleType }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("apply_style", {
                    nodeId,
                    nodeName,
                    styleId,
                    styleType,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error applying style: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );
}
