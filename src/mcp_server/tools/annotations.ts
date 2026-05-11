import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";

interface SetMultipleAnnotationsParams {
    nodeId: string;
    annotations: Array<{
        nodeId: string;
        labelMarkdown: string;
        categoryId?: string;
        annotationId?: string;
        properties?: Array<{ type: string }>;
    }>;
}

export function registerAnnotationTools(server: McpServer) {
    // Get Annotations Tool
    server.tool(
        "get_annotations",
        "Get all annotations in the current document or specific node",
        {
            nodeId: z
                .string()
                .describe("node ID to get annotations for specific node"),
            includeCategories: z
                .boolean()
                .optional()
                .default(true)
                .describe("Whether to include category information"),
        },
        async ({ nodeId, includeCategories }: any) => {
            try {
                const result = await sendCommandToFigma("get_annotations", {
                    nodeId,
                    includeCategories,
                });
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
                            text: `Error getting annotations: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Multiple Annotations Tool
    server.tool(
        "set_multiple_annotations",
        "Set one or more annotations parallelly in a node",
        {
            nodeId: z
                .string()
                .describe("The ID of the node containing the elements to annotate"),
            annotations: z
                .array(
                    z.object({
                        nodeId: z.string().describe("The ID of the node to annotate"),
                        nodeName: z.string().describe("Name of the node to modify"),
                        labelMarkdown: z
                            .string()
                            .describe("The annotation text in markdown format"),
                        categoryId: z
                            .string()
                            .optional()
                            .describe("The ID of the annotation category"),
                        annotationId: z
                            .string()
                            .optional()
                            .describe(
                                "The ID of the annotation to update (if updating existing annotation)"
                            ),
                        properties: z
                            .array(
                                z.object({
                                    type: z.string(),
                                })
                            )
                            .optional()
                            .describe("Additional properties for the annotation"),
                    })
                )
                .describe("Array of annotations to apply"),
        },
        async ({ nodeId, annotations }: any) => {
            try {
                if (!annotations || annotations.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "No annotations provided",
                            },
                        ],
                    };
                }

                // Initial response to indicate we're starting the process
                const initialStatus = {
                    type: "text" as const,
                    text: `Starting annotation process for ${annotations.length} nodes. This will be processed in batches of 5...`,
                };

                const totalToProcess = annotations.length;

                // Use the plugin's set_multiple_annotations function with chunking
                const result = await sendCommandToFigma("set_multiple_annotations", {
                    nodeId,
                    annotations,
                });

                // Cast the result to a specific type to work with it safely
                interface AnnotationResult {
                    success: boolean;
                    nodeId: string;
                    annotationsApplied?: number;
                    annotationsFailed?: number;
                    totalAnnotations?: number;
                    completedInChunks?: number;
                    results?: Array<{
                        success: boolean;
                        nodeId: string;
                        error?: string;
                        annotationId?: string;
                    }>;
                }

                const typedResult = result as AnnotationResult;

                // Format the results for display
                const progressText = `
        Annotation process completed:
        - ${typedResult.annotationsApplied || 0} of ${totalToProcess} successfully applied
        - ${typedResult.annotationsFailed || 0} failed
        - Processed in ${typedResult.completedInChunks || 1} batches
        `;

                // Detailed results
                const detailedResults = typedResult.results || [];
                const failedResults = detailedResults.filter((item) => !item.success);

                // Create the detailed part of the response
                let detailedResponse = "";
                if (failedResults.length > 0) {
                    detailedResponse = `\n\nNodes that failed:\n${failedResults
                        .map((item) => `- ${item.nodeId}: ${item.error || "Unknown error"}`)
                        .join("\n")}`;
                }

                return {
                    content: [
                        initialStatus,
                        {
                            type: "text" as const,
                            text: progressText + detailedResponse,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting multiple annotations: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Annotation Conversion Strategy Prompt
    server.prompt(
        "annotation_conversion_strategy",
        "Strategy for converting manual annotations to Figma's native annotations",
        (extra) => {
            return {
                messages: [
                    {
                        role: "assistant",
                        content: {
                            type: "text",
                            text: `# Automatic Annotation Conversion
            
## Process Overview

The process of converting manual annotations (numbered/alphabetical indicators with connected descriptions) to Figma's native annotations:

1. Get selected frame/component information
2. Scan and collect all annotation text nodes
3. Scan target UI elements (components, instances, frames)
4. Match annotations to appropriate UI elements
5. Apply native Figma annotations

## Step 1: Get Selection and Initial Setup

First, use get_pages_info to find the IDs of the frames or components:

\`\`\`typescript
// Get document structure
const doc = await get_pages_info();
// Find relevant node IDs from the response
const selectedNodeId = "..." // extracted from doc

// Get available annotation categories for later use
const annotationData = await get_annotations({
  nodeId: selectedNodeId,
  includeCategories: true
});
const categories = annotationData.categories;
\`\`\`

## Step 2: Scan Annotation Text Nodes

Scan all text nodes to identify annotations and their descriptions:

\`\`\`typescript
// Get all text nodes in the selection
const response = await get_nodes_info({
  nodeIds: [selectedNodeId],
  filter: { type: ["TEXT"] },
  properties: ["characters"]
});
const textNodes = response.nodes;

// Filter and group annotation markers and descriptions

// Markers typically have these characteristics:
// - Short text content (usually single digit/letter)
// - Specific font styles (often bold)
// - Located in a container with "Marker" or "Dot" in the name
// - Have a clear naming pattern (e.g., "1", "2", "3" or "A", "B", "C")


// Identify description nodes
// Usually longer text nodes near markers or with matching numbers in path
  
\`\`\`

## Step 3: Scan Target UI Elements

Get all potential target elements that annotations might refer to:

\`\`\`typescript
// Scan for all UI elements that could be annotation targets
const response = await get_nodes_info({
  nodeIds: [selectedNodeId],
  filter: { type: ["COMPONENT", "INSTANCE", "FRAME"] }
});
const targetNodes = response.nodes;
\`\`\`

## Step 4: Match Annotations to Targets

Match each annotation to its target UI element using these strategies in order of priority:

1. **Path-Based Matching**:
   - Look at the marker's parent container name in the Figma layer hierarchy
   - Remove any "Marker:" or "Annotation:" prefixes from the parent name
   - Find UI elements that share the same parent name or have it in their path
   - This works well when markers are grouped with their target elements

2. **Name-Based Matching**:
   - Extract key terms from the annotation description
   - Look for UI elements whose names contain these key terms
   - Consider both exact matches and semantic similarities
   - Particularly effective for form fields, buttons, and labeled components

3. **Proximity-Based Matching** (fallback):
   - Calculate the center point of the marker
   - Find the closest UI element by measuring distances to element centers
   - Consider the marker's position relative to nearby elements
   - Use this method when other matching strategies fail

Additional Matching Considerations:
- Give higher priority to matches found through path-based matching
- Consider the type of UI element when evaluating matches
- Take into account the annotation's context and content
- Use a combination of strategies for more accurate matching

## Step 5: Apply Native Annotations

Convert matched annotations to Figma's native annotations using batch processing:

\`\`\`typescript
// Prepare annotations array for batch processing
const annotationsToApply = Object.values(annotations).map(({ marker, description }) => {
  // Find target using multiple strategies
  const target = 
    findTargetByPath(marker, targetNodes) ||
    findTargetByName(description, targetNodes) ||
    findTargetByProximity(marker, targetNodes);
  
  if (target) {
    // Determine appropriate category based on content
    const category = determineCategory(description.characters, categories);

    // Determine appropriate additional annotationProperty based on content
    const annotationProperty = determineProperties(description.characters, target.type);
    
    return {
      nodeId: target.id,
      labelMarkdown: description.characters,
      categoryId: category.id,
      properties: annotationProperty
    };
  }
  return null;
}).filter(Boolean); // Remove null entries

// Apply annotations in batches using set_multiple_annotations
if (annotationsToApply.length > 0) {
  await set_multiple_annotations({
    nodeId: selectedNodeId,
    annotations: annotationsToApply
  });
}
\`\`\`


This strategy focuses on practical implementation based on real-world usage patterns, emphasizing the importance of handling various UI elements as annotation targets, not just text nodes.`,
                        },
                    },
                ],
                description:
                    "Strategy for converting manual annotations to Figma's native annotations",
            };
        }
    );
}
