import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput } from "./_result.js";

export function registerCreateTools(server: McpServer) {
    // 1. Create Shape Tool
    server.registerTool(
        "create_shape",
        {
            title: "Create Shape",
            description: "Create a rectangle, ellipse, polygon, or star via `type`, with position/size and optional `fillColor`/`strokeColor`. Shape-specific params (`arcData`; `pointCount`/`innerRadius`) validated by `type`. `pointCount` = sides (polygon) or points (star), native count — no even-parity rule.",
            inputSchema: z.object({
                type: z.enum(["RECTANGLE", "ELLIPSE", "POLYGON", "STAR"]).describe("The type of shape to create"),
                x: z.number().describe("X position"),
                y: z.number().describe("Y position"),
                width: z.number().describe("Width of the shape"),
                height: z.number().describe("Height of the shape"),
                name: z.string().min(1).optional().describe("Optional non-empty name for the shape"),
                parentId: z.string().describe("Parent node ID to append the shape to"),
                parentNodeName: z.string().describe("The parent node's current exact name, passed back verbatim from `node_info`."),
                useAbsolutePosition: z.boolean().optional().describe("If true and parent is an auto-layout frame, forces absolute positioning to prevent layout shifts."),
                fillColor: z.object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
                }).optional().describe("Fill color in RGBA format"),
                strokeColor: z.object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
                }).optional().describe("Stroke color in RGBA format"),
                arcData: z.object({
                    startingAngle: z.number().optional().describe("Arc start in radians (0 = right/x-axis, default: 0)"),
                    endingAngle: z.number().optional().describe("Arc end in radians, clockwise (default: 2π for full ellipse)"),
                    innerRadius: z.number().min(0).max(1).optional().describe("0.0–1.0, creates donut hole (default: 0)"),
                }).optional().describe("Optional arc data for creating arcs/donuts (ELLIPSE only)"),
                pointCount: z.number().min(3).optional().describe("Number of sides (polygon) or points (star), ≥3. Required for POLYGON and STAR."),
                innerRadius: z.number().min(0).max(1).optional().describe("0.0–1.0, star sharpness (default: 1.0). STAR only."),
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the created shape"),
                name: z.string().describe("Name of the created shape"),
                parentId: z.string().optional().describe("ID of the parent the node was placed into — confirm containment without a follow-up read"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("create_shape", params);
            return toolResult(result);
        }
    );

    // 2. Create Frame Tool
    server.registerTool(
        "create_frame",
        {
            title: "Create Frame",
            description: "Create a frame (container) with optional fill/stroke and full auto-layout configuration.",
            inputSchema: z.object({
                x: z.number().describe("X position"),
                y: z.number().describe("Y position"),
                width: z.number().describe("Width of the frame"),
                height: z.number().describe("Height of the frame"),
                name: z.string().min(1).optional().describe("Optional non-empty name for the frame"),
                parentId: z.string().describe("Parent node ID to append the frame to"),
                parentNodeName: z.string().describe("The parent node's current exact name, passed back verbatim from `node_info`."),
                fillColor: z.object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
                }).optional().describe("Fill color in RGBA format"),
                strokeColor: z.object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
                }).optional().describe("Stroke color in RGBA format"),
                strokeWeight: z.number().positive().optional().describe("Stroke weight"),
                layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional().describe("Auto-layout mode for the frame"),
                layoutWrap: z.enum(["NO_WRAP", "WRAP"]).optional().describe("Whether the auto-layout frame wraps its children"),
                paddingTop: z.number().optional().describe("Top padding for auto-layout frame"),
                paddingRight: z.number().optional().describe("Right padding for auto-layout frame"),
                paddingBottom: z.number().optional().describe("Bottom padding for auto-layout frame"),
                paddingLeft: z.number().optional().describe("Left padding for auto-layout frame"),
                primaryAxisAlignItems: z.enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN"]).optional().describe("Primary axis alignment for auto-layout frame. Note: When set to SPACE_BETWEEN, itemSpacing will be ignored as children will be evenly spaced."),
                counterAxisAlignItems: z.enum(["MIN", "MAX", "CENTER", "BASELINE"]).optional().describe("Counter axis alignment for auto-layout frame"),
                layoutSizingHorizontal: z.enum(["FIXED", "HUG", "FILL"]).optional().describe("Horizontal sizing mode for auto-layout frame"),
                layoutSizingVertical: z.enum(["FIXED", "HUG", "FILL"]).optional().describe("Vertical sizing mode for auto-layout frame"),
                itemSpacing: z.number().optional().describe("Distance between children in auto-layout frame. Note: This value will be ignored if primaryAxisAlignItems is set to SPACE_BETWEEN."),
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the created frame"),
                name: z.string().describe("Name of the created frame"),
                parentId: z.string().optional().describe("ID of the parent the node was placed into — confirm containment without a follow-up read"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("create_frame", {
                ...params,
                fillColor: params.fillColor || { r: 1, g: 1, b: 1, a: 1 },
                name: params.name ?? "Frame",
            });
            return toolResult(result);
        }
    );

    // 3. Create Text Tool
    server.registerTool(
        "create_text",
        {
            title: "Create Text",
            description: "Create a text node with content and optional font size/weight/color.",
            inputSchema: z.object({
                x: z.number().describe("X position"),
                y: z.number().describe("Y position"),
                text: z.string().describe("Text content"),
                fontSize: z.number().min(1).optional().describe("Font size, minimum 1 (default: 14)"),
                fontWeight: z.number().int().min(100).max(900).multipleOf(100).optional()
                    .describe("Font weight: 100–900 in increments of 100 (default: 400)"),
                fontColor: z.object({
                    r: z.number().min(0).max(1).describe("Red component (0-1)"),
                    g: z.number().min(0).max(1).describe("Green component (0-1)"),
                    b: z.number().min(0).max(1).describe("Blue component (0-1)"),
                    a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
                }).optional().describe("Font color in RGBA format"),
                name: z.string().min(1).optional().describe("Optional non-empty semantic layer name for the text node"),
                parentId: z.string().describe("Parent node ID to append the text to"),
                parentNodeName: z.string().describe("The parent node's current exact name, passed back verbatim from `node_info`."),
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the created text node"),
                name: z.string().describe("Name of the created text node"),
                parentId: z.string().optional().describe("ID of the parent the node was placed into — confirm containment without a follow-up read"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("create_text", {
                ...params,
                fontSize: params.fontSize ?? 14,
                fontWeight: params.fontWeight ?? 400,
                fontColor: params.fontColor || { r: 0, g: 0, b: 0, a: 1 },
                name: params.name ?? "Text",
            });
            return toolResult(result);
        }
    );

    // 4. Create Node from SVG Tool
    server.registerTool(
        "create_svg",
        {
            title: "Create Node from SVG",
            description: "Create a node from an SVG markup string.",
            inputSchema: z.object({
                svg: z.string().describe("The SVG XML string"),
                name: z.string().min(1).optional().describe("Optional non-empty name for the new node"),
                parentId: z.string().describe("Parent ID to append to"),
                parentNodeName: z.string().describe("The parent node's current exact name, passed back verbatim from `node_info`."),
                x: z.number().optional().describe("X position"),
                y: z.number().optional().describe("Y position"),
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the created node"),
                name: z.string().describe("Name of the created node"),
                parentId: z.string().optional().describe("ID of the parent the node was placed into — confirm containment without a follow-up read"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("create_svg", params);
            return toolResult(result);
        }
    );

    // 5. Create Component Tool
    server.registerTool(
        "create_component",
        {
            title: "Create Component",
            description: "Convert an existing frame into a main component.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the frame to convert to a component"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the created component"),
                name: z.string().describe("Name of the created component"),
                parentId: z.string().optional().describe("ID of the parent the component was placed into — confirm containment without a follow-up read"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("create_component", params);
            return toolResult(result);
        }
    );

    // 6. Create Instance Tool
    server.registerTool(
        "create_instance",
        {
            title: "Create Instance",
            description: "Instantiate a component (by `componentKey` or `componentId`) at a position.",
            inputSchema: z.object({
                componentKey: z.string().optional().describe("Key of the component to instantiate (for remote/library components)"),
                componentId: z.string().optional().describe("Node ID of the component to instantiate (preferred for local components)"),
                x: z.number().describe("X position"),
                y: z.number().describe("Y position"),
                parentId: z.string().describe("Parent node ID to append the instance to"),
                parentNodeName: z.string().describe("The parent node's current exact name, passed back verbatim from `node_info`."),
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the created component instance"),
                name: z.string().describe("Name of the component instance"),
                componentId: z.string().describe("ID of the component the instance was created from"),
                parentId: z.string().optional().describe("ID of the parent the instance was placed into — confirm containment without a follow-up read"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("create_instance", params);
            return toolResult(result);
        }
    );

    // 7. Create Component Set Tool
    server.registerTool(
        "create_component_set",
        {
            title: "Create Component Set",
            description: "Combine components into a component set (variants) with property definitions.",
            inputSchema: z.object({
                components: z.array(z.object({
                    nodeId: z.string().describe("ID of the component"),
                    nodeName: z.string().describe("The component's current exact name, passed back verbatim from `node_info`."),
                    propertyValues: z.array(z.string()).describe("Values corresponding to properties array")
                })).describe("Array of component objects"),
                properties: z.array(z.string()).describe("Array of property names (e.g. ['Size', 'State'])"),
                componentSetName: z.string().min(1).optional().describe("Optional non-empty name for the component set"),
                parentId: z.string().describe("ID of the appendable parent container (frame, group, page, section, etc.) to place the set in; discover it with node_info"),
                parentNodeName: z.string().describe("The parent node's current exact name, passed back verbatim from `node_info`."),
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the created component set"),
                name: z.string().describe("Name of the component set"),
                parentId: z.string().optional().describe("ID of the parent the set was placed into — confirm containment without a follow-up read"),
                type: z.string().optional().describe("Node type (COMPONENT_SET)"),
                childCount: z.number().optional().describe("Number of variants in the set"),
                warning: z.string().optional().describe("Warning message if some properties could not be read"),
                variantProperties: z.record(z.string(), z.any()).optional().describe("Variant properties definition")
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("create_component_set", params);
            return toolResult(result);
        }
    );

    // 8. Create Connections Tool
    server.registerTool(
        "create_connection",
        {
            title: "Create Connections",
            description: "Create connector lines between nodes, or set/check the default connector template. Pass `connectorId` to set a default, `connections` to draw lines, or nothing to check the current default.",
            inputSchema: z.object({
                connectorId: z
                    .string()
                    .optional()
                    .describe("Optional: The ID of the connector node to set as default template"),
                connections: z
                    .array(
                        z.object({
                            startNodeId: z.string().describe("ID of the starting node"),
                            startNodeName: z.string().describe("The start node's current exact name, passed back verbatim from `node_info`."),
                            endNodeId: z.string().describe("ID of the ending node"),
                            endNodeName: z.string().describe("The end node's current exact name, passed back verbatim from `node_info`."),
                            text: z.string().optional().describe("Optional text to display on the connector"),
                        })
                    )
                    .optional()
                    .describe("Optional: Array of node connections to create"),
            }),
            outputSchema: looseOutput({
                success: z.boolean().optional().describe("Whether the connection command succeeded"),
                message: z.string().optional().describe("Status message"),
                defaultConnectorId: z.string().optional().describe("The ID of the default connector style"),
                results: z.any().optional().describe("Execution details"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async ({ connectorId, connections }: any) => {
            const result = await sendCommandToFigma("create_connection", {
                connectorId,
                connections,
                checkDefault: !connectorId && !connections
            });
            return toolResult(result);
        }
    );
}
