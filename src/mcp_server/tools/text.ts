import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { normalizeNodeId } from "../utils.js";
import { sendCommandToFigma } from "../figma-client.js";

export function registerTextTools(server: McpServer) {
    // Create Text Tool
    server.tool(
        "create_text",
        "Create a new text element in Figma",
        {
            x: z.number().describe("X position"),
            y: z.number().describe("Y position"),
            text: z.string().describe("Text content"),
            fontSize: z.number().optional().describe("Font size (default: 14)"),
            fontWeight: z
                .number()
                .optional()
                .describe("Font weight (e.g., 400 for Regular, 700 for Bold)"),
            fontColor: z
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
                .describe("Font color in RGBA format"),
            name: z
                .string()
                .optional()
                .describe("Semantic layer name for the text node"),
            parentId: z
                .string()
                .optional()
                .describe("Optional parent node ID to append the text to"),
            parentNodeName: z
                .string()
                .optional()
                .describe("Name of the parent node to verify against"),
        },
        async ({
            x,
            y,
            text,
            fontSize,
            fontWeight,
            fontColor,
            name,
            parentId,
            parentNodeName,
        }: any) => {
            try {
                const result = await sendCommandToFigma("create_text", {
                    x,
                    y,
                    text,
                    fontSize: fontSize || 14,
                    fontWeight: fontWeight || 400,
                    fontColor: fontColor || { r: 0, g: 0, b: 0, a: 1 },
                    name: name || "Text",
                    parentId,
                    parentNodeName,
                });
                const typedResult = result as { name: string; id: string };
                return {
                    content: [
                        {
                            type: "text",
                            text: `Created text "${typedResult.name}" with ID: ${typedResult.id}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating text: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Multiple Text Contents Tool
    server.tool(
        "set_multiple_text_contents",
        "Set one or more text contents parallelly in a node",
        {
            nodeId: z
                .string()
                .describe("The ID of the node containing the text nodes to replace"),
            text: z
                .array(
                    z.object({
                        nodeId: z.string().describe("The ID of the text node"),
                        nodeName: z.string().describe("Name of the node to modify"),
                        text: z.string().describe("The replacement text"),
                    })
                )
                .describe("Array of text node IDs and their replacement texts"),
        },
        async ({ nodeId, text }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                if (!text || text.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "No text provided",
                            },
                        ],
                    };
                }

                // Initial response to indicate we're starting the process
                const initialStatus = {
                    type: "text" as const,
                    text: `Starting text replacement for ${text.length} nodes. This will be processed in batches of 5...`,
                };

                const totalToProcess = text.length;

                // Use the plugin's set_multiple_text_contents function with chunking
                const result = await sendCommandToFigma("set_multiple_text_contents", {
                    nodeId,
                    text: text.map((item: any) => ({ ...item, nodeId: normalizeNodeId(item.nodeId) })),
                });

                // Cast the result to a specific type to work with it safely
                interface TextReplaceResult {
                    success: boolean;
                    nodeId: string;
                    replacementsApplied?: number;
                    replacementsFailed?: number;
                    totalReplacements?: number;
                    completedInChunks?: number;
                    results?: Array<{
                        success: boolean;
                        nodeId: string;
                        error?: string;
                        originalText?: string;
                        translatedText?: string;
                    }>;
                }

                const typedResult = result as TextReplaceResult;

                const progressText = `
        Text replacement completed:
        - ${typedResult.replacementsApplied || 0} of ${totalToProcess} successfully updated
        - ${typedResult.replacementsFailed || 0} failed
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
                            text: `Error setting multiple text contents: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Text Style Tool
    server.tool(
        "set_text_style",
        "Set any combination of text styles on a node",
        {
            nodeId: z.string().describe("Target text node ID"),
            nodeName: z.string().describe("Name of the node (for verification)"),
            fontFamily: z.string().optional().describe('Font family (e.g., "Inter", "Roboto")'),
            fontStyle: z.string().optional().describe('Font style including weight (e.g., "Regular", "Bold", "Light Italic")'),
            fontSize: z.number().optional().describe("Font size in pixels"),
            letterSpacing: z
                .object({
                    value: z.number(),
                    unit: z.enum(["PIXELS", "PERCENT"]),
                })
                .optional()
                .describe("Letter spacing"),
            lineHeight: z
                .union([
                    z.object({
                        value: z.number(),
                        unit: z.enum(["PIXELS", "PERCENT"]),
                    }),
                    z.object({
                        unit: z.literal("AUTO"),
                    }),
                ])
                .optional()
                .describe("Line height"),
            paragraphSpacing: z.number().optional().describe("Space between paragraphs in pixels"),
            textCase: z
                .enum(["ORIGINAL", "UPPER", "LOWER", "TITLE"])
                .optional()
                .describe("Text casing"),
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
        },
        async (params: any) => {
            try {
                const { nodeId, ...rest } = params;
                const normalizedNodeId = normalizeNodeId(nodeId);

                const result = await sendCommandToFigma("set_text_style", {
                    nodeId: normalizedNodeId,
                    ...rest,
                });

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting text style: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        }
    );

    // Text Node Scanning Tool
    server.tool(
        "scan_text_nodes",
        "Scan all text nodes in the selected Figma node",
        {
            nodeId: z.string().describe("ID of the node to scan"),
        },
        async ({ nodeId }: any) => {
            try {
                // Initial response to indicate we're starting the process
                const initialStatus = {
                    type: "text" as const,
                    text: "Starting text node scanning. This may take a moment for large designs...",
                };

                // Use the plugin's scan_text_nodes function with chunking flag
                const result = await sendCommandToFigma(
                    "scan_text_nodes",
                    {
                        nodeId,
                        useChunking: true, // Enable chunking on the plugin side
                        chunkSize: 10, // Process 10 nodes at a time
                    },
                    120000
                );

                // If the result indicates chunking was used, format the response accordingly
                if (result && typeof result === "object" && "chunks" in result) {
                    const typedResult = result as {
                        success: boolean;
                        totalNodes: number;
                        processedNodes: number;
                        chunks: number;
                        textNodes: Array<any>;
                    };

                    const summaryText = `
          Scan completed:
          - Found ${typedResult.totalNodes} text nodes
          - Processed in ${typedResult.chunks} chunks
          `;

                    return {
                        content: [
                            initialStatus,
                            {
                                type: "text" as const,
                                text: summaryText,
                            },
                            {
                                type: "text" as const,
                                text: JSON.stringify(typedResult.textNodes, null, 2),
                            },
                        ],
                    };
                }

                // If chunking wasn't used or wasn't reported in the result format, return the result as is
                return {
                    content: [
                        initialStatus,
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error scanning text nodes: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Text Replacement Strategy Prompt
    server.prompt(
        "text_replacement_strategy",
        "Systematic approach for replacing text in Figma designs",
        (extra) => {
            return {
                messages: [
                    {
                        role: "assistant",
                        content: {
                            type: "text",
                            text: `# Intelligent Text Replacement Strategy

## 1. Analyze Design & Identify Structure
- Scan text nodes to understand the overall structure of the design
- Use AI pattern recognition to identify logical groupings:
  * Tables (rows, columns, headers, cells)
  * Lists (items, headers, nested lists)
  * Card groups (similar cards with recurring text fields)
  * Forms (labels, input fields, validation text)
  * Navigation (menu items, breadcrumbs)
\`\`\`
scan_text_nodes(nodeId: "node-id")
get_nodes_info(nodeIds: ["node-id"])  // optional
\`\`\`

## 2. Strategic Chunking for Complex Designs
- Divide replacement tasks into logical content chunks based on design structure
- Use one of these chunking strategies that best fits the design:
  * **Structural Chunking**: Table rows/columns, list sections, card groups
  * **Spatial Chunking**: Top-to-bottom, left-to-right in screen areas
  * **Semantic Chunking**: Content related to the same topic or functionality
  * **Component-Based Chunking**: Process similar component instances together

## 3. Progressive Replacement with Verification
- Create a safe copy of the node for text replacement
- Replace text chunk by chunk with continuous progress updates
- After each chunk is processed:
  * Export that section as a small, manageable image
  * Verify text fits properly and maintain design integrity
  * Fix issues before proceeding to the next chunk

\`\`\`
// Clone the node to create a safe copy
clone_node(nodeId: "selected-node-id", x: [new-x], y: [new-y])

// Replace text chunk by chunk
set_multiple_text_contents(
  nodeId: "parent-node-id", 
  text: [
    { nodeId: "node-id-1", text: "New text 1" },
    // More nodes in this chunk...
  ]
)

// Verify chunk with small, targeted image exports
export_node_as_image(nodeId: "chunk-node-id", format: "PNG", scale: 0.5)
\`\`\`

## 4. Intelligent Handling for Table Data
- For tabular content:
  * Process one row or column at a time
  * Maintain alignment and spacing between cells
  * Consider conditional formatting based on cell content
  * Preserve header/data relationships

## 5. Smart Text Adaptation
- Adaptively handle text based on container constraints:
  * Auto-detect space constraints and adjust text length
  * Apply line breaks at appropriate linguistic points
  * Maintain text hierarchy and emphasis
  * Consider font scaling for critical content that must fit

## 6. Progressive Feedback Loop
- Establish a continuous feedback loop during replacement:
  * Real-time progress updates (0-100%)
  * Small image exports after each chunk for verification
  * Issues identified early and resolved incrementally
  * Quick adjustments applied to subsequent chunks

## 7. Final Verification & Context-Aware QA
- After all chunks are processed:
  * Export the entire design at reduced scale for final verification
  * Check for cross-chunk consistency issues
  * Verify proper text flow between different sections
  * Ensure design harmony across the full composition

## 8. Chunk-Specific Export Scale Guidelines
- Scale exports appropriately based on chunk size:
  * Small chunks (1-5 elements): scale 1.0
  * Medium chunks (6-20 elements): scale 0.7
  * Large chunks (21-50 elements): scale 0.5
  * Very large chunks (50+ elements): scale 0.3
  * Full design verification: scale 0.2

## Sample Chunking Strategy for Common Design Types

### Tables
- Process by logical rows (5-10 rows per chunk)
- Alternative: Process by column for columnar analysis
- Tip: Always include header row in first chunk for reference

### Card Lists
- Group 3-5 similar cards per chunk
- Process entire cards to maintain internal consistency
- Verify text-to-image ratio within cards after each chunk

### Forms
- Group related fields (e.g., "Personal Information", "Payment Details")
- Process labels and input fields together
- Ensure validation messages and hints are updated with their fields

### Navigation & Menus
- Process hierarchical levels together (main menu, submenu)
- Respect information architecture relationships
- Verify menu fit and alignment after replacement

## Best Practices
- **Preserve Design Intent**: Always prioritize design integrity
- **Structural Consistency**: Maintain alignment, spacing, and hierarchy
- **Visual Feedback**: Verify each chunk visually before proceeding
- **Incremental Improvement**: Learn from each chunk to improve subsequent ones
- **Balance Automation & Control**: Let AI handle repetitive replacements but maintain oversight
- **Respect Content Relationships**: Keep related content consistent across chunks

Remember that text is never just text—it's a core design element that must work harmoniously with the overall composition. This chunk-based strategy allows you to methodically transform text while maintaining design integrity.`,
                        },
                    },
                ],
                description: "Systematic approach for replacing text in Figma designs",
            };
        }
    );
}
