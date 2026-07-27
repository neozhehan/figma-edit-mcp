import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput, batchResultRow } from "./_result.js";

// Kept in exact parity with the pinned @figma/plugin-typings
// `AnnotationPropertyType` union. The Phase 7 contract test mechanically
// compares this inventory with plugin-api-standalone.d.ts.
export const ANNOTATION_PROPERTY_TYPES = [
    "width",
    "height",
    "maxWidth",
    "minWidth",
    "maxHeight",
    "minHeight",
    "fills",
    "strokes",
    "effects",
    "strokeWeight",
    "cornerRadius",
    "textStyleId",
    "textAlignHorizontal",
    "fontFamily",
    "fontStyle",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "itemSpacing",
    "padding",
    "layoutMode",
    "alignItems",
    "opacity",
    "mainComponent",
    "gridRowGap",
    "gridColumnGap",
    "gridRowCount",
    "gridColumnCount",
    "gridRowAnchorIndex",
    "gridColumnAnchorIndex",
    "gridRowSpan",
    "gridColumnSpan",
] as const;

const annotationPropertyType = z.enum(ANNOTATION_PROPERTY_TYPES);

const annotationProperties = z
    .array(
        z.object({
            type: annotationPropertyType.describe("The annotated Figma property"),
        })
    )
    .superRefine((properties, ctx) => {
        const seen = new Set<string>();
        properties.forEach((property, index) => {
            if (seen.has(property.type)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [index, "type"],
                    message: `Duplicate annotation property type '${property.type}'. Include each property type at most once.`,
                });
            }
            seen.add(property.type);
        });
    });

const nativeAnnotation = z
    .object({
        label: z.string().optional().describe("Optional plain-text annotation label"),
        labelMarkdown: z.string().optional().describe("Optional Markdown annotation label"),
        properties: z.array(z.object({ type: annotationPropertyType })).optional(),
        categoryId: z.string().optional(),
    })
    .catchall(z.any());

const annotatedNode = z
    .object({
        nodeId: z.string().describe("ID of the node that owns these annotations"),
        name: z.string().describe("Current name of the owning node"),
        annotations: z.array(nativeAnnotation).describe("Annotations owned by this node"),
    })
    .catchall(z.any());

const annotationCategoryColor = z.enum([
    "yellow",
    "orange",
    "red",
    "pink",
    "violet",
    "blue",
    "teal",
    "green",
]);

const annotationCategory = z
    .object({
        id: z.string(),
        label: z.string(),
        color: annotationCategoryColor,
        isPreset: z.boolean(),
    })
    .catchall(z.any());

const annotationResultRow = batchResultRow.safeExtend({
    beforeCount: z.number().int().nonnegative().describe("Annotation count on the target immediately before this row"),
    afterCount: z.number().int().nonnegative().describe("Annotation count on the target immediately after this row"),
});

export function registerAnnotationTools(server: McpServer) {
    // 1. List Annotations Tool
    server.registerTool(
        "annotation_list",
        {
            title: "List Annotations",
            description: "Read the native annotations on a page or node (and subtree); exactly one of pageId or nodeId is required. Optionally include the file's annotation categories.",
            inputSchema: z.object({
                pageId: z.string().optional().describe("The page ID to get annotations from. Exactly one of pageId or nodeId is required."),
                nodeId: z.string().optional().describe("The node ID to get annotations from. Exactly one of pageId or nodeId is required."),
                includeCategories: z.boolean().optional().describe("If true, retrieves the list of global annotation categories in the file"),
            }),
            outputSchema: looseOutput({
                annotatedNodes: z.array(annotatedNode).describe("Grouped annotations, preserving the owning node in page and node modes"),
                categories: z.array(annotationCategory).optional().describe("List of global annotation categories"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("annotation_list", params);
            return toolResult(result);
        }
    );

    // 2. Set Annotations Tool
    server.registerTool(
        "annotation_set",
        {
            title: "Set Annotations",
            description: "Append native annotations to one or more nodes in a batched call. If the status is 'partial_success', treat it as an incomplete operation and report the failed and skipped items to the user. Appending is NOT idempotent and a 'failed' row may already have appended its annotation (its beforeCount and afterCount differ, and it carries partialMutation: true) — before retrying any non-success item, call annotation_list and compare the labels already on the node, or you will create a duplicate.",
            inputSchema: z.object({
                annotations: z
                    .array(
                        z.object({
                            nodeId: z.string().describe("The node ID to annotate"),
                            nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                            labelMarkdown: z
                                .string()
                                .refine((value) => value.trim().length > 0, {
                                    message: "labelMarkdown must contain at least one non-whitespace character.",
                                })
                                .describe("Markdown annotation text; required and rejected when blank"),
                            categoryId: z.string().optional().describe("Optional annotation category ID from annotation_list"),
                            properties: annotationProperties.optional().describe("Optional duplicate-free Figma annotation property references"),
                        })
                    )
                    .min(1)
                    .describe("Array of annotations to set"),
            }),
            outputSchema: looseOutput({
                success: z.boolean().describe("Whether all annotations were set successfully"),
                status: z.enum(["success", "partial_success", "failed"]).describe("Overall status of the batch operation"),
                requestedCount: z.number().describe("Number of requested annotations"),
                succeededCount: z.number().describe("Number of succeeded annotations"),
                failedCount: z.number().describe("Number of failed annotations"),
                skippedCount: z.number().describe("Number of skipped annotations"),
                results: z.array(annotationResultRow).describe("Detailed execution results with before/after annotation counts (one row per input, in input order)"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async ({ annotations }: any) => {
            const result = await sendCommandToFigma("annotation_set", { annotations });
            return toolResult(result);
        }
    );
}
