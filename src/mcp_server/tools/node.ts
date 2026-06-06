import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult } from "./_result.js";

export function registerNodeTools(server: McpServer) {
    // 1. Get Node Info Tool
    server.registerTool(
        "node.info",
        {
            title: "Get Node Info",
            description: "Read one or more nodes — recursive subtree traversal with `fields` selection, `filter`, and `maxDepth`. Returns only requested fields (incl. resolved `boundVariables`/`explicitVariableModes`). The workhorse read; start here before any write.",
            inputSchema: z.object({
                nodeIds: z
                    .array(z.string())
                    .optional()
                    .describe("Array of node IDs to inspect. If empty, uses editable scope."),
                fields: z
                    .array(z.string())
                    .optional()
                    .describe("Array of field names to return."),
                filter: z
                    .record(z.array(z.string()))
                    .optional()
                    .describe("Optional filter criteria."),
                maxDepth: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe("Maximum depth for recursive child traversal. 0 = self only, 1 = self and immediate children, etc."),
            }),
            outputSchema: z.object({
                nodes: z.array(z.any()).describe("List of node entries"),
                missingNodeIds: z.array(z.string()).optional().describe("List of missing node IDs"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeIds, fields, filter, maxDepth }: any) => {
            const result = await sendCommandToFigma("node.info", {
                nodeIds,
                properties: fields,
                filter,
                maxDepth
            });
            return toolResult(result);
        }
    );

    // 2. Transform Node Tool
    server.registerTool(
        "node.transform",
        {
            title: "Transform Node",
            description: "Move and/or resize a node by setting absolute `x`/`y`/`width`/`height` (any subset).",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to transform"),
                nodeName: z.string().describe("Name of the node to modify"),
                x: z.number().optional().describe("New X position"),
                y: z.number().optional().describe("New Y position"),
                width: z.number().positive().optional().describe("New width"),
                height: z.number().positive().optional().describe("New height"),
            }),
            outputSchema: z.object({
                id: z.string().optional().describe("ID of the transformed node"),
                name: z.string().optional().describe("Name of the transformed node"),
                x: z.number().optional().describe("Resulting X position"),
                y: z.number().optional().describe("Resulting Y position"),
                width: z.number().optional().describe("Resulting width"),
                height: z.number().optional().describe("Resulting height"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.transform", params);
            return toolResult(result);
        }
    );

    // 3. Rename Node Tool
    server.registerTool(
        "node.rename",
        {
            title: "Rename Node",
            description: "Rename a node (sets `name` to an exact value).",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to rename"),
                nodeName: z.string().describe("Name of the node to modify"),
                name: z.string().describe("New name for the node"),
            }),
            outputSchema: z.object({
                name: z.string().describe("The new name of the node"),
                oldName: z.string().describe("The old name of the node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.rename", params);
            return toolResult(result);
        }
    );

    // 4. Delete Nodes Tool
    server.registerTool(
        "node.delete",
        {
            title: "Delete Nodes",
            description: "Delete one or more nodes in a single batched, per-item-validated call. No API undo.",
            inputSchema: z.object({
                nodes: z
                    .array(
                        z.object({
                            nodeId: z.string().describe("The ID of the node to delete"),
                            nodeName: z.string().describe("Name of the node to modify"),
                        })
                    )
                    .describe("Array of nodes to delete"),
            }),
            outputSchema: z.object({
                success: z.boolean().describe("Whether the operation succeeded"),
                deletedCount: z.number().optional().describe("Number of deleted nodes"),
                results: z.array(z.any()).optional().describe("Detailed deletion results"),
            }),
            annotations: {
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ nodes }: any) => {
            const result = await sendCommandToFigma("node.delete", { nodes });
            return toolResult(result);
        }
    );

    // 5. Clone Node Tool
    server.registerTool(
        "node.clone",
        {
            title: "Clone Node",
            description: "Duplicate an existing node, optionally at a new `x`/`y`. Produces a new node id.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to clone"),
                nodeName: z.string().describe("Name of the node to modify"),
                x: z.number().optional().describe("New X position for the clone"),
                y: z.number().optional().describe("New Y position for the clone"),
            }),
            outputSchema: z.object({
                id: z.string().describe("ID of the new cloned node"),
                name: z.string().describe("Name of the cloned node"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.clone", params);
            return toolResult(result);
        }
    );

    // 6. Select Nodes Tool
    server.registerTool(
        "node.select",
        {
            title: "Select Nodes",
            description: "Set the canvas selection to one or more nodes and focus them in the viewport.",
            inputSchema: z.object({
                nodeIds: z.array(z.string()).describe("Array of node IDs to select"),
            }),
            outputSchema: z.object({
                count: z.number().describe("Number of selected nodes"),
                selectedNodes: z.array(z.object({
                    id: z.string().describe("Selected node ID"),
                    name: z.string().describe("Selected node name")
                })).describe("List of selected nodes"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeIds }: any) => {
            const result = await sendCommandToFigma("node.select", { nodeIds });
            return toolResult(result);
        }
    );

    // 7. Group Nodes Tool
    server.registerTool(
        "node.group",
        {
            title: "Group Nodes",
            description: "Wrap multiple nodes in a new group node.",
            inputSchema: z.object({
                nodes: z
                    .array(
                        z.object({
                            nodeId: z.string().describe("The ID of the node to group"),
                            nodeName: z.string().describe("Name of the node to modify"),
                        })
                    )
                    .describe("Array of nodes to group"),
                name: z.string().optional().describe("Name for the new group"),
            }),
            outputSchema: z.object({
                id: z.string().describe("ID of the new group node"),
                name: z.string().describe("Name of the new group node"),
                childCount: z.number().describe("Number of children in the group"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.group", params);
            return toolResult(result);
        }
    );

    // 8. Ungroup Node Tool
    server.registerTool(
        "node.ungroup",
        {
            title: "Ungroup Node",
            description: "Dissolve a group, promoting its children to the parent. Removes the group container.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the group to ungroup"),
                nodeName: z.string().describe("Name of the group to verify against"),
            }),
            outputSchema: z.object({
                parentId: z.string().nullable().describe("ID of the parent node (null if the group had no parent)"),
                ungroupedChildren: z.array(z.object({
                    id: z.string().describe("Child node ID"),
                    name: z.string().describe("Child node name")
                })).describe("List of ungrouped child nodes"),
            }),
            annotations: {
                destructiveHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.ungroup", params);
            return toolResult(result);
        }
    );

    // 9. Flatten Node Tool
    server.registerTool(
        "node.flatten",
        {
            title: "Flatten Node",
            description: "Flatten a node and its children into a single vector. Lossy — original structure is not recoverable.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to flatten"),
                nodeName: z.string().describe("Name of the node to verify against"),
            }),
            outputSchema: z.object({
                id: z.string().describe("ID of the flattened node"),
                name: z.string().describe("Name of the flattened node"),
                type: z.string().describe("Type of the flattened node (usually VECTOR)"),
            }),
            annotations: {
                destructiveHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.flatten", params);
            return toolResult(result);
        }
    );

    // 10. Reparent Node Tool
    server.registerTool(
        "node.insert_child",
        {
            title: "Reparent Node",
            description: "Reparent a node under a new parent at an optional `index`.",
            inputSchema: z.object({
                parentId: z.string().describe("ID of the new parent node"),
                parentNodeName: z.string().describe("Name of the parent node to verify against"),
                childId: z.string().describe("ID of the child node to reparent"),
                childNodeName: z.string().describe("Name of the child node to verify against"),
                index: z
                    .number()
                    .optional()
                    .describe("Position in parent's children array (default: append)"),
            }),
            outputSchema: z.object({
                childId: z.string().describe("ID of the reparented child node"),
                newParentId: z.string().describe("ID of the new parent node"),
                index: z.number().describe("Index at which the child was inserted"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.insert_child", params);
            return toolResult(result);
        }
    );

    // 11. Set Auto Layout Tool
    server.registerTool(
        "node.set_auto_layout",
        {
            title: "Set Auto Layout",
            description: "Configure a frame's auto-layout (mode, padding, spacing, alignment, sizing) in one unified setter.",
            inputSchema: z.object({
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
            }),
            outputSchema: z.object({
                name: z.string().describe("Name of the modified frame"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.set_auto_layout", params);
            return toolResult(result);
        }
    );

    // 12. Set Fill Color Tool
    server.registerTool(
        "node.set_fill",
        {
            title: "Set Fill Color",
            description: "Set a node's fill to a literal RGBA color. Use `node.apply_style` to link a shared paint style, or `node.bind_variable` to bind a color token.",
            inputSchema: z.object({
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
            }),
            outputSchema: z.object({
                name: z.string().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeId, nodeName, r, g, b, a }: any) => {
            const result = await sendCommandToFigma("node.set_fill", {
                nodeId,
                nodeName,
                color: { r, g, b, a: a ?? 1 },
            });
            return toolResult(result);
        }
    );

    // 13. Set Stroke Tool
    server.registerTool(
        "node.set_stroke",
        {
            title: "Set Stroke",
            description: "Set a node's stroke color and weight; supports uniform or per-side weights.",
            inputSchema: z.object({
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
                weight: z.number().positive().optional().describe("Uniform stroke weight (used when individual side weights are not provided)"),
                strokeTopWeight: z.number().min(0).optional().describe("Top side stroke weight"),
                strokeBottomWeight: z.number().min(0).optional().describe("Bottom side stroke weight"),
                strokeLeftWeight: z.number().min(0).optional().describe("Left side stroke weight"),
                strokeRightWeight: z.number().min(0).optional().describe("Right side stroke weight"),
            }),
            outputSchema: z.object({
                name: z.string().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeId, nodeName, r, g, b, a, weight, strokeTopWeight, strokeBottomWeight, strokeLeftWeight, strokeRightWeight }: any) => {
            const result = await sendCommandToFigma("node.set_stroke", {
                nodeId,
                nodeName,
                color: { r, g, b, a: a ?? 1 },
                weight: weight || 1,
                strokeTopWeight,
                strokeBottomWeight,
                strokeLeftWeight,
                strokeRightWeight,
            });
            return toolResult(result);
        }
    );

    // 14. Set Corner Radius Tool
    server.registerTool(
        "node.set_corner_radius",
        {
            title: "Set Corner Radius",
            description: "Set a node's corner radius — uniform or per-corner.",
            inputSchema: z.object({
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
            }),
            outputSchema: z.object({
                name: z.string().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeId, nodeName, radius, corners }: any) => {
            const result = await sendCommandToFigma("node.set_corner_radius", {
                nodeId,
                nodeName,
                radius,
                corners: corners || [true, true, true, true],
            });
            return toolResult(result);
        }
    );

    // 15. Set Effects Tool
    server.registerTool(
        "node.set_effects",
        {
            title: "Set Effects",
            description: "Set a node's effect array (shadows, blurs). Use `node.apply_style` to link a shared effect style instead.",
            inputSchema: z.object({
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
                            ]).describe("Effect type"),
                            visible: z.boolean().optional().describe("Visibility"),
                            color: z
                                .object({
                                    r: z.number().describe("Red (0-1)"),
                                    g: z.number().describe("Green (0-1)"),
                                    b: z.number().describe("Blue (0-1)"),
                                    a: z.number().optional().describe("Alpha (0-1)"),
                                })
                                .optional()
                                .describe("Effect color"),
                            offset: z.object({ x: z.number().describe("X offset"), y: z.number().describe("Y offset") }).optional().describe("Shadow offset"),
                            radius: z.number().optional().describe("Blur radius"),
                            spread: z.number().optional().describe("Shadow spread"),
                            blendMode: z.string().optional().describe("Blend mode"),
                            showShadowBehindNode: z.boolean().optional().describe("Show shadow behind node"),
                        }).describe("Figma effect settings")
                    )
                    .describe("Array of effect objects"),
            }),
            outputSchema: z.object({
                name: z.string().optional().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.set_effects", params);
            return toolResult(result);
        }
    );

    // 16. Apply Style Tool
    server.registerTool(
        "node.apply_style",
        {
            title: "Apply Style",
            description: "Link a node to a shared library style (paint/text/effect/grid) by `styleId`. Use the raw `node.set_*` setters for ad-hoc values not backed by a style.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to apply style to"),
                nodeName: z.string().describe("Name of the node to verify against"),
                styleId: z.string().describe("The ID of the style to apply"),
                styleType: z
                    .enum(["TEXT", "FILL", "STROKE", "EFFECT", "GRID"])
                    .describe("Type of style to apply (target property)"),
            }),
            outputSchema: z.object({
                success: z.boolean().describe("Whether the style was applied successfully"),
                name: z.string().optional().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.apply_style", params);
            return toolResult(result);
        }
    );

    // 17. Bind Variable Tool
    server.registerTool(
        "node.bind_variable",
        {
            title: "Bind Variable",
            description: "Bind a variable to a node property, or set an explicit variable mode. Use instead of a literal `node.set_*` when the value should track a design token.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to bind variables to"),
                nodeName: z.string().describe("Name of the node to verify against"),
                bindVariables: z
                    .record(z.string().nullable())
                    .optional()
                    .describe("Map of property names to variable IDs (to bind) or null (to unbind). E.g., { 'fills': 'VariableID:1:2' }"),
                explicitVariableModes: z
                    .record(z.string())
                    .optional()
                    .describe("Map of variable collection IDs to mode IDs. E.g., { 'VariableCollectionID:1:2': 'ModeID:1:3' }"),
            }),
            outputSchema: z.object({
                success: z.boolean().optional().describe("Whether the variables were bound successfully"),
                name: z.string().optional().describe("Name of the modified node"),
                message: z.string().optional().describe("Status message"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.bind_variable", params);
            return toolResult(result);
        }
    );

    // 18. Export Node Image Tool
    server.registerTool(
        "node.export_visual",
        {
            title: "Export Node Image",
            description: "Render a node to an image (PNG/JPG/SVG/PDF) at a given scale. Read-only; the canonical way to visually verify edits.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to export"),
                format: z
                    .enum(["PNG", "JPG", "SVG", "PDF"])
                    .default("PNG")
                    .describe("Export format"),
                scale: z
                    .number()
                    .default(1)
                    .describe("Export scale (e.g. 1, 2, 0.5)"),
            }),
            outputSchema: z.object({
                nodeId: z.string().optional().describe("ID of the exported node"),
                format: z.string().optional().describe("Image format"),
                scale: z.number().optional().describe("Export scale used"),
                mimeType: z.string().optional().describe("MIME type of the exported image"),
                imageData: z.string().optional().describe("Base64-encoded image data"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node.export_visual", params);
            return toolResult(result);
        }
    );
}
