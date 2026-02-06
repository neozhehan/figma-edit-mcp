import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { normalizeNodeId } from "../utils.js";

export function registerCreationTools(server: McpServer) {
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
            parentNodeName: z
                .string()
                .optional()
                .describe("Name of the parent node to verify against"),
            useAbsolutePosition: z
                .boolean()
                .optional()
                .describe(
                    "If true and parent is an auto-layout frame, forces absolute positioning to prevent layout shifts."
                ),
        },
        async ({ x, y, width, height, name, parentId, parentNodeName, useAbsolutePosition }: any) => {
            try {
                const result = await sendCommandToFigma("create_rectangle", {
                    x,
                    y,
                    width,
                    height,
                    name: name || "Rectangle",
                    parentId,
                    parentNodeName,
                    useAbsolutePosition,
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

    // Create Frame Tool
    server.tool(
        "create_frame",
        "Create a new frame in Figma",
        {
            x: z.number().describe("X position"),
            y: z.number().describe("Y position"),
            width: z.number().describe("Width of the frame"),
            height: z.number().describe("Height of the frame"),
            name: z.string().optional().describe("Optional name for the frame"),
            parentId: z
                .string()
                .optional()
                .describe("Optional parent node ID to append the frame to"),
            parentNodeName: z
                .string()
                .optional()
                .describe("Name of the parent node to verify against"),
            fillColor: z
                .object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z
                        .number()
                        .min(0)
                        .max(1)
                        .optional()
                        .describe("Alpha component (0-1)"),
                })
                .optional()
                .describe("Fill color in RGBA format"),
            strokeColor: z
                .object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z
                        .number()
                        .min(0)
                        .max(1)
                        .optional()
                        .describe("Alpha component (0-1)"),
                })
                .optional()
                .describe("Stroke color in RGBA format"),
            strokeWeight: z.number().positive().optional().describe("Stroke weight"),
            layoutMode: z
                .enum(["NONE", "HORIZONTAL", "VERTICAL"])
                .optional()
                .describe("Auto-layout mode for the frame"),
            layoutWrap: z
                .enum(["NO_WRAP", "WRAP"])
                .optional()
                .describe("Whether the auto-layout frame wraps its children"),
            paddingTop: z
                .number()
                .optional()
                .describe("Top padding for auto-layout frame"),
            paddingRight: z
                .number()
                .optional()
                .describe("Right padding for auto-layout frame"),
            paddingBottom: z
                .number()
                .optional()
                .describe("Bottom padding for auto-layout frame"),
            paddingLeft: z
                .number()
                .optional()
                .describe("Left padding for auto-layout frame"),
            primaryAxisAlignItems: z
                .enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN"])
                .optional()
                .describe(
                    "Primary axis alignment for auto-layout frame. Note: When set to SPACE_BETWEEN, itemSpacing will be ignored as children will be evenly spaced."
                ),
            counterAxisAlignItems: z
                .enum(["MIN", "MAX", "CENTER", "BASELINE"])
                .optional()
                .describe("Counter axis alignment for auto-layout frame"),
            layoutSizingHorizontal: z
                .enum(["FIXED", "HUG", "FILL"])
                .optional()
                .describe("Horizontal sizing mode for auto-layout frame"),
            layoutSizingVertical: z
                .enum(["FIXED", "HUG", "FILL"])
                .optional()
                .describe("Vertical sizing mode for auto-layout frame"),
            itemSpacing: z
                .number()
                .optional()
                .describe(
                    "Distance between children in auto-layout frame. Note: This value will be ignored if primaryAxisAlignItems is set to SPACE_BETWEEN."
                ),
        },
        async ({
            x,
            y,
            width,
            height,
            name,
            parentId,
            fillColor,
            strokeColor,
            strokeWeight,
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
        }: any) => {
            try {
                const result = await sendCommandToFigma("create_frame", {
                    x,
                    y,
                    width,
                    height,
                    name: name || "Frame",
                    parentId,
                    fillColor: fillColor || { r: 1, g: 1, b: 1, a: 1 },
                    strokeColor: strokeColor,
                    strokeWeight: strokeWeight,
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
                });
                const typedResult = result as { name: string; id: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Created frame "${typedResult.name}" with ID: ${typedResult.id}. Use the ID as the parentId to appendChild inside this frame.`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating frame: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Create Node From SVG Tool
    server.tool(
        "create_node_from_svg",
        "Creates a node from an SVG string.",
        {
            svg: z.string().describe("The SVG XML string"),
            name: z.string().optional().describe("Name for the new node"),
            parentId: z.string().optional().describe("Parent ID to append to"),
            parentNodeName: z
                .string()
                .optional()
                .describe("Parent Name to verify against"),
            x: z.number().optional().describe("X position"),
            y: z.number().optional().describe("Y position"),
        },
        async ({ svg, name, parentId, parentNodeName, x, y }: any) => {
            try {
                if (parentId) parentId = normalizeNodeId(parentId);
                const result = await sendCommandToFigma("create_node_from_svg", {
                    svg,
                    name,
                    parentId,
                    parentNodeName,
                    x,
                    y,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating node from SVG: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Create Ellipse Tool
    server.tool(
        "create_ellipse",
        "Create a new ellipse (circle, arc, donut) in Figma",
        {
            x: z.number().describe("X position"),
            y: z.number().describe("Y position"),
            width: z.number().describe("Width of the ellipse"),
            height: z.number().describe("Height of the ellipse"),
            arcData: z
                .object({
                    startingAngle: z.number().optional().describe("Arc start in radians (0 = right/x-axis, default: 0)"),
                    endingAngle: z.number().optional().describe("Arc end in radians, clockwise (default: 2π for full ellipse)"),
                    innerRadius: z.number().min(0).max(1).optional().describe("0.0–1.0, creates donut hole (default: 0)"),
                })
                .optional()
                .describe("Optional arc data for creating arcs/donuts"),
            name: z.string().optional().describe("Optional name for the ellipse"),
            parentId: z
                .string()
                .optional()
                .describe("Optional parent node ID to append the ellipse to"),
            parentNodeName: z
                .string()
                .optional()
                .describe("Name of the parent node to verify against"),
            fillColor: z
                .object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
                })
                .optional()
                .describe("Fill color in RGBA format"),
            strokeColor: z
                .object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
                })
                .optional()
                .describe("Stroke color in RGBA format"),
            useAbsolutePosition: z
                .boolean()
                .optional()
                .describe(
                    "If true and parent is an auto-layout frame, forces absolute positioning to prevent layout shifts."
                ),
        },
        async ({ x, y, width, height, arcData, name, parentId, parentNodeName, fillColor, strokeColor, useAbsolutePosition }: any) => {
            try {
                if (parentId) parentId = normalizeNodeId(parentId);
                const result = await sendCommandToFigma("create_ellipse", {
                    x,
                    y,
                    width,
                    height,
                    arcData,
                    name,
                    parentId,
                    parentNodeName,
                    fillColor,
                    strokeColor,
                    useAbsolutePosition,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating ellipse: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        }
    );

    // Create Polygon/Star Tool
    server.tool(
        "create_polygon_star",
        "Create a new polygon or star in Figma",
        {
            x: z.number().describe("X position"),
            y: z.number().describe("Y position"),
            width: z.number().describe("Width of the shape"),
            height: z.number().describe("Height of the shape"),
            pointCount: z.number().min(3).describe("Total vertex count (≥3). For stars, this is the number of points."),
            innerRadius: z.number().min(0).max(1).optional().describe("0.0–1.0, star sharpness (default: 1.0 = polygon). If < 1.0, pointCount must be even."),
            name: z.string().optional().describe("Optional name for the shape"),
            parentId: z
                .string()
                .optional()
                .describe("Optional parent node ID to append the shape to"),
            parentNodeName: z
                .string()
                .optional()
                .describe("Name of the parent node to verify against"),
            fillColor: z
                .object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
                })
                .optional()
                .describe("Fill color in RGBA format"),
            strokeColor: z
                .object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
                })
                .optional()
                .describe("Stroke color in RGBA format"),
            useAbsolutePosition: z
                .boolean()
                .optional()
                .describe(
                    "If true and parent is an auto-layout frame, forces absolute positioning to prevent layout shifts."
                ),
        },
        async ({ x, y, width, height, pointCount, innerRadius, name, parentId, parentNodeName, fillColor, strokeColor, useAbsolutePosition }: any) => {
            try {
                if (parentId) parentId = normalizeNodeId(parentId);
                const result = await sendCommandToFigma("create_polygon_star", {
                    x,
                    y,
                    width,
                    height,
                    pointCount,
                    innerRadius,
                    name,
                    parentId,
                    parentNodeName,
                    fillColor,
                    strokeColor,
                    useAbsolutePosition,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating polygon/star: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        }
    );
}
