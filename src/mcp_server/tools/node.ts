import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput, batchResults } from "./_result.js";
import { noDuplicateTargets } from "./_batch.js";
import { resizeIfOversized } from "../imageResize.js";
// Allowlist of bindable fields, generated from @figma/plugin-typings
// (VariableBindableNodeField ∪ VariableBindableTextField + fills/strokes) by
// scripts/gen-node-fields.ts. Regenerated on every build:all and CI-checked for
// drift (check:generated), so it can never fall out of sync with the typings —
// adding or removing a field there flows through automatically.
import { BINDABLE_FIELDS } from "./bindableFields.generated.js";

// Conceptual aliases agents reach for that aren't lexically close to the real
// field (so the case-insensitive fallback below wouldn't find them). Lexical
// near-misses — "fill"→"fills", or case slips like "fontsize"→"fontSize" — are
// caught by the fallback, not listed here.
const BIND_FIELD_ALIASES: Record<string, string> = {
    padding: "paddingLeft",
    gap: "itemSpacing",
    cornerRadius: "topLeftRadius",
    borderRadius: "topLeftRadius",
    radius: "topLeftRadius",
    spacing: "itemSpacing",
    fill: "fills",
    stroke: "strokes",
};
// Best-effort "did you mean" for an unknown bind field: a known alias, else the
// nearest field by case-insensitive exact match, else "" (no hint).
function suggestBindField(k: string): string {
    if (BIND_FIELD_ALIASES[k]) return BIND_FIELD_ALIASES[k];
    return BINDABLE_FIELDS.find((f) => f.toLowerCase() === k.toLowerCase()) ?? "";
}

// A node_info result entry. The entry shape is typed (so callers know each node
// carries id/name/type and optional properties/children/path/descendantCount),
// but `properties` values are heterogeneous (reference fields resolve to id /
// {id,name}; other fields are arbitrary) and children are the same recursive
// shape — both kept loose (z.any + .catchall) so output validation never rejects
// a valid live result.
const nodeInfoEntry = z.object({
    id: z.string().describe("Node ID"),
    name: z.string().describe("Node name"),
    type: z.string().describe("Node type"),
    properties: z.record(z.string(), z.any()).optional().describe("Requested fields → values; reference fields resolved to id / {id, name}"),
    children: z.array(z.any()).optional().describe("Recursive child entries (same shape) when the subtree is traversed"),
    path: z.array(z.array(z.string())).optional().describe("Ancestor path as [type, id, name] tuples"),
    descendantCount: z.number().optional().describe("Total descendant count"),
}).catchall(z.any());

export function registerNodeTools(server: McpServer) {
    // 1. Get Node Info Tool
    server.registerTool(
        "node_info",
        {
            title: "Get Node Info",
            description: "Read one or more nodes — recursive subtree traversal with `properties` selection, `filter`, and `maxDepth`. Returns only the requested properties (incl. resolved `boundVariables`/`explicitVariableModes`) under each node's `properties` key. The workhorse read; start here before any write.",
            inputSchema: z.object({
                nodeIds: z
                    .array(z.string())
                    .optional()
                    .describe("Array of node IDs to inspect. If empty, uses editable scope."),
                properties: z
                    .array(z.string())
                    .optional()
                    .describe("Array of property names to return (populates each node's `properties` object in the response)."),
                filter: z
                    .record(z.string(), z.array(z.string()))
                    .optional()
                    .describe("Optional filter criteria."),
                maxDepth: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe("Maximum depth for recursive child traversal. 0 = self only, 1 = self and immediate children, etc."),
                concurrencyLimit: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("Concurrency limit for parallel subtree walk (default: 4)"),
            }),
            outputSchema: looseOutput({
                nodes: z.array(nodeInfoEntry).describe("Node entries (id/name/type + optional properties/children/path/descendantCount)"),
                missingNodeIds: z.array(z.string()).optional().describe("Requested IDs that weren't found"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeIds, properties, filter, maxDepth, concurrencyLimit }: any) => {
            const result = await sendCommandToFigma("node_info", {
                nodeIds,
                properties,
                filter,
                maxDepth,
                concurrencyLimit: concurrencyLimit ?? 4
            });
            return toolResult(result);
        }
    );

    // 2. Transform Node Tool
    server.registerTool(
        "node_transform",
        {
            title: "Transform Node",
            description: "Move and/or resize a node by setting absolute `x`/`y`/`width`/`height` (any subset).",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to transform"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                x: z.number().optional().describe("New X position"),
                y: z.number().optional().describe("New Y position"),
                width: z.number().positive().optional().describe("New width"),
                height: z.number().positive().optional().describe("New height"),
            }),
            outputSchema: looseOutput({
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
            const result = await sendCommandToFigma("node_transform", params);
            return toolResult(result);
        }
    );

    // 3. Rename Node Tool
    server.registerTool(
        "node_rename",
        {
            title: "Rename Node",
            description: "Rename a node (sets `name` to an exact value).",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to rename"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                name: z.string().describe("New name for the node"),
            }),
            outputSchema: looseOutput({
                name: z.string().describe("The new name of the node"),
                oldName: z.string().describe("The old name of the node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node_rename", params);
            return toolResult(result);
        }
    );

    // 4. Delete Nodes Tool
    server.registerTool(
        "node_delete",
        {
            title: "Delete Nodes",
            description: "Delete one or more nodes in a single batched, per-item-validated call. No API undo. If the status is 'partial_success', treat it as an incomplete operation, report the failed and skipped items to the user, and retry every non-success item (both failed and skipped).",
            inputSchema: z.object({
                nodes: z
                    .array(
                        z.object({
                            nodeId: z.string().describe("The ID of the node to delete"),
                            nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                        })
                    )
                    .min(1)
                    .superRefine(noDuplicateTargets)
                    .describe("Array of nodes to delete"),
            }),
            outputSchema: looseOutput({
                success: z.boolean().describe("Whether all deletions succeeded"),
                status: z.enum(["success", "partial_success", "failed"]).describe("Overall status of the batch operation"),
                requestedCount: z.number().describe("Number of requested deletions"),
                succeededCount: z.number().describe("Number of succeeded deletions"),
                failedCount: z.number().describe("Number of failed deletions"),
                skippedCount: z.number().describe("Number of skipped deletions"),
                results: batchResults("Detailed deletion results (one row per input, in input order)"),
            }),
            annotations: {
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ nodes }: any) => {
            const result = await sendCommandToFigma("node_delete", { nodes });
            return toolResult(result);
        }
    );

    // 5. Clone Node Tool
    server.registerTool(
        "node_clone",
        {
            title: "Clone Node",
            description: "Duplicate an existing node, optionally at a new `x`/`y`. Produces a new node id.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to clone"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                x: z.number().optional().describe("New X position for the clone"),
                y: z.number().optional().describe("New Y position for the clone"),
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the new cloned node"),
                name: z.string().describe("Name of the cloned node"),
                parentId: z.string().optional().describe("ID of the parent the clone was placed into — confirm containment without a follow-up read"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node_clone", params);
            return toolResult(result);
        }
    );

    // 6. Navigate View Tool
    server.registerTool(
        "view_navigate",
        {
            title: "Navigate View",
            description: "Navigate the editor view to a page or node(s).",
            inputSchema: z.object({
                ids: z.array(z.string()).describe("Array of page or node IDs to navigate to"),
            }),
            outputSchema: looseOutput({
                pageId: z.string().optional().describe("The ID of the target page transitioned to"),
                pageName: z.string().optional().describe("The name of the target page transitioned to"),
                success: z.boolean().optional().describe("Whether navigation was successful"),
                count: z.number().optional().describe("Number of selected nodes"),
                selectedNodes: z.array(z.object({
                    id: z.string().describe("Selected node ID"),
                    name: z.string().describe("Selected node name")
                })).optional().describe("List of selected nodes"),
                message: z.string().optional().describe("Status message"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ ids }: any) => {
            const result = await sendCommandToFigma("view_navigate", { ids });
            return toolResult(result);
        }
    );

    // 7. Group Nodes Tool
    server.registerTool(
        "node_group",
        {
            title: "Group Nodes",
            description: "Wrap multiple nodes in a new group node.",
            inputSchema: z.object({
                nodes: z
                    .array(
                        z.object({
                            nodeId: z.string().describe("The ID of the node to group"),
                            nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                        })
                    )
                    .describe("Array of nodes to group"),
                name: z.string().optional().describe("Name for the new group"),
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the new group node"),
                name: z.string().describe("Name of the new group node"),
                childCount: z.number().describe("Number of children in the group"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node_group", params);
            return toolResult(result);
        }
    );

    // 8. Ungroup Node Tool
    server.registerTool(
        "node_ungroup",
        {
            title: "Ungroup Node",
            description: "Dissolve a group, promoting its children to the parent. Removes the group container.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the group to ungroup"),
                nodeName: z.string().describe("The group's current exact name, passed back verbatim from `node_info`."),
            }),
            outputSchema: looseOutput({
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
            const result = await sendCommandToFigma("node_ungroup", params);
            return toolResult(result);
        }
    );

    // 9. Flatten Node Tool
    server.registerTool(
        "node_flatten",
        {
            title: "Flatten Node",
            description: "Flatten a node and its children into a single vector. Lossy — original structure is not recoverable.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to flatten"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
            }),
            outputSchema: looseOutput({
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
            const result = await sendCommandToFigma("node_flatten", params);
            return toolResult(result);
        }
    );

    // 10. Reparent Node Tool
    server.registerTool(
        "node_insert_child",
        {
            title: "Reparent Node",
            description: "Reparent a node under a new parent at an optional `index`. Valid range is 0 to parent's child count. Omit `index` to append.",
            inputSchema: z.object({
                parentId: z.string().describe("ID of the new parent node"),
                parentNodeName: z.string().describe("The parent node's current exact name, passed back verbatim from `node_info`."),
                childId: z.string().describe("ID of the child node to reparent"),
                childNodeName: z.string().describe("The child node's current exact name, passed back verbatim from `node_info`."),
                index: z
                    .number()
                    .optional()
                    .describe("Position in parent's children array (default: append). The output index reports the actual resolved position (same-parent reorder shifts indices)."),
            }),
            outputSchema: looseOutput({
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
            const result = await sendCommandToFigma("node_insert_child", params);
            return toolResult(result);
        }
    );

    // 11. Set Auto Layout Tool
    server.registerTool(
        "node_set_auto_layout",
        {
            title: "Set Auto Layout",
            description: "Configure a frame's auto-layout (mode, padding, spacing, alignment, sizing) in one unified setter.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the frame to modify"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
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
            outputSchema: looseOutput({
                name: z.string().describe("Name of the modified frame"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node_set_auto_layout", params);
            return toolResult(result);
        }
    );

    // 12. Set Fill Color Tool
    server.registerTool(
        "node_set_fill",
        {
            title: "Set Fill",
            description: "Set a node's fill to a literal RGBA color, an image, or clear it. Use `node_apply_style` to link a shared paint style, or `node_bind_variable` to bind a color token.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to modify"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                r: z.number().min(0).max(1).optional().describe("Red component (0-1)"),
                g: z.number().min(0).max(1).optional().describe("Green component (0-1)"),
                b: z.number().min(0).max(1).optional().describe("Blue component (0-1)"),
                a: z
                    .number()
                    .min(0)
                    .max(1)
                    .optional()
                    .describe("Alpha component (0-1)"),
                image: z.object({
                    url: z.string().url().optional().describe("HTTP(S) URL to a PNG/JPEG/GIF the plugin fetches via createImageAsync. Max 4096px per side and NOT resized — pre-resize larger images yourself, or use bytesBase64 (which is auto-resized)."),
                    bytesBase64: z.string().optional().describe("Base64-encoded raw PNG/JPEG/GIF bytes. PNG/JPEG over 4096px per side are auto-downscaled server-side (aspect ratio preserved); GIF is not resized. Very large PNG/JPEG (over ~45 megapixels) exceed the server resize budget and are rejected — pre-resize those yourself. Heavier over the socket."),
                    scaleMode: z.enum(["FILL","FIT","CROP","TILE"]).optional().describe("default FILL"),
                    opacity: z.number().min(0).max(1).optional().describe("Alpha opacity component for the image (0-1)"),
                }).optional().describe("Optional image payload. Must provide exactly one of solid color or image."),
                clear: z.boolean().optional().describe("Set to true to clear all fills. Must provide exactly one of solid color, image, or clear:true.")
            }).superRefine((data, ctx) => {
                const hasSolid = data.r !== undefined && data.g !== undefined && data.b !== undefined;
                const hasPartialRGB = !hasSolid && (data.r !== undefined || data.g !== undefined || data.b !== undefined);
                const hasImage = data.image !== undefined;
                const hasClear = data.clear === true;
                
                const numModes = (hasSolid ? 1 : 0) + (hasImage ? 1 : 0) + (hasClear ? 1 : 0);
                
                if (numModes !== 1 || hasPartialRGB) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "node_set_fill: provide exactly one of: a solid color (r,g,b[,a]), an image, or clear:true." });
                }
                
                if (hasImage && data.image) {
                    const hasUrl = data.image.url !== undefined;
                    const hasBytes = data.image.bytesBase64 !== undefined;
                    if (hasUrl && hasBytes) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "node_set_fill: image requires exactly one of 'url' or 'bytesBase64'." });
                    } else if (!hasUrl && !hasBytes) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "node_set_fill: image requires exactly one of 'url' or 'bytesBase64'." });
                    }
                }
            }),
            outputSchema: looseOutput({
                name: z.string().describe("Name of the modified node"),
                warnings: z.array(z.string()).optional().describe("Warnings from the operation (e.g., resizing)"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeId, nodeName, r, g, b, a, image, clear }: any) => {
            let processedImage = image;
            let warning: string | undefined;

            if (image && image.bytesBase64) {
                const resizeResult = await resizeIfOversized(image.bytesBase64);
                processedImage = {
                    ...image,
                    bytesBase64: resizeResult.base64
                };
                warning = resizeResult.warning;
            }

            const payload: any = { nodeId, nodeName };
            if (clear) {
                payload.clear = true;
            } else if (image) {
                payload.image = processedImage;
            } else {
                payload.color = { r, g, b, a: a ?? 1 };
            }

            const result = await sendCommandToFigma("node_set_fill", payload);
            
            if (warning) {
                if (!result.warnings) result.warnings = [];
                result.warnings.push(warning);
            }
            
            return toolResult(result);
        }
    );

    // 13. Set Stroke Tool
    server.registerTool(
        "node_set_stroke",
        {
            title: "Set Stroke",
            description: "Set a node's stroke color and weight; supports uniform or per-side weights.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to modify"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
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
            outputSchema: looseOutput({
                name: z.string().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeId, nodeName, r, g, b, a, weight, strokeTopWeight, strokeBottomWeight, strokeLeftWeight, strokeRightWeight }: any) => {
            const result = await sendCommandToFigma("node_set_stroke", {
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
        "node_set_corner_radius",
        {
            title: "Set Corner Radius",
            description: "Set a node's corner radius — uniform or per-corner.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to modify"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                radius: z.number().min(0).describe("Corner radius value"),
                corners: z
                    .array(z.boolean())
                    .length(4)
                    .optional()
                    .describe(
                        "Optional array of 4 booleans to specify which corners to round [topLeft, topRight, bottomRight, bottomLeft]"
                    ),
            }),
            outputSchema: looseOutput({
                name: z.string().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeId, nodeName, radius, corners }: any) => {
            const result = await sendCommandToFigma("node_set_corner_radius", {
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
        "node_set_effects",
        {
            title: "Set Effects",
            description: "Set a node's effect array (shadows, blurs). Use `node_apply_style` to link a shared effect style instead.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to modify"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
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
            outputSchema: looseOutput({
                name: z.string().optional().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node_set_effects", params);
            return toolResult(result);
        }
    );

    // 16. Apply Style Tool
    server.registerTool(
        "node_apply_style",
        {
            title: "Apply Style",
            description: "Link a node to a shared library style (paint/text/effect/grid) by `styleId`. Use the raw `node_set_*` setters for ad-hoc values not backed by a style.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to apply style to"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                styleId: z.string().describe("The ID of the style to apply"),
                styleType: z
                    .enum(["TEXT", "FILL", "STROKE", "EFFECT", "GRID"])
                    .describe("Type of style to apply (target property)"),
            }),
            outputSchema: looseOutput({
                success: z.boolean().describe("Whether the style was applied successfully"),
                name: z.string().optional().describe("Name of the modified node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node_apply_style", params);
            return toolResult(result);
        }
    );

    // 17. Bind Variable Tool
    server.registerTool(
        "node_bind_variable",
        {
            title: "Bind Variable",
            description: "Bind a variable to a node property, or set an explicit variable mode. Use instead of a literal `node_set_*` when the value should track a design token. Ordering rules: set auto-layout before binding padding/spacing; set a solid fill before binding a colour token.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to bind variables to"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                bindVariables: z
                    // Restrict keys to the typings-derived allowlist (z.enum), so the valid
                    // set is published in the wire JSON schema as propertyNames.enum — not just
                    // enforced at runtime. partialRecord keeps every key optional (a plain
                    // enum-keyed z.record would require all of them in Zod v4).
                    .partialRecord(z.enum(BINDABLE_FIELDS), z.string().nullable(), {
                        // An unknown key fails enum validation as an opaque `invalid_key`;
                        // rewrite only that into the actionable "Unknown bind field" error with a
                        // "did you mean" hint. Value-type errors keep their default message.
                        error: (iss) => {
                            if ((iss as { code?: string }).code !== "invalid_key") return undefined;
                            const k = String((iss as { input?: unknown }).input ?? "");
                            const suggestion = suggestBindField(k);
                            const hint = suggestion ? ` (Did you mean '${suggestion}'?)` : "";
                            return `Unknown bind field '${k}'. Valid fields are the Figma bindable node/text fields plus fills/strokes (e.g. paddingLeft, itemSpacing, topLeftRadius, fontSize, strokeTopWeight).${hint}`;
                        },
                    })
                    .optional()
                    .describe(`Map of property names to variable IDs (to bind) or null (to unbind). Valid fields: ${BINDABLE_FIELDS.join(", ")}. E.g., { 'fills': 'VariableID:1:2' }`),
                explicitVariableModes: z
                    .record(z.string(), z.string())
                    .optional()
                    .describe("Map of variable collection IDs to mode IDs. E.g., { 'VariableCollectionID:1:2': 'ModeID:1:3' }"),
            }),
            outputSchema: looseOutput({
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
            const result = await sendCommandToFigma("node_bind_variable", params);
            return toolResult(result);
        }
    );

    // 18. Export Node Image Tool
    server.registerTool(
        "node_export_visual",
        {
            title: "Export Node Image",
            description: "Render a node to an image (PNG/JPG/SVG/PDF) at a given scale. Read-only; the canonical way to visually verify edits. SVG returns raw XML in `svg` (directly readable); PNG/JPG/PDF return base64 in `imageData` (PDF is a delivery artifact — prefer PNG/SVG for inspection).",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the node to export"),
                format: z
                    .enum(["PNG", "JPG", "SVG", "PDF"])
                    .default("PNG")
                    .describe("Export format"),
                scale: z
                    .number()
                    .min(0.1)
                    .max(4)
                    .default(1)
                    .describe("Export scale, between 0.1 and 4.0 (e.g. 1, 2, 0.5)"),
            }),
            outputSchema: looseOutput({
                nodeId: z.string().optional().describe("ID of the exported node"),
                format: z.string().optional().describe("Image format"),
                scale: z.number().optional().describe("Export scale used"),
                mimeType: z.string().optional().describe("MIME type of the exported image"),
                imageData: z.string().optional().describe("Base64-encoded binary data (PNG/JPG/PDF)"),
                svg: z.string().optional().describe("Raw SVG XML markup (returned instead of imageData when format=SVG)"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("node_export_visual", params);
            return toolResult(result);
        }
    );
}
