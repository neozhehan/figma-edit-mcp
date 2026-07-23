import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput } from "./_result.js";
import { noDuplicateTargets } from "./_batch.js";

export function registerInstanceTools(server: McpServer) {
    // 1. Set Instance Property Tool
    server.registerTool(
        "instance_set_property",
        {
            title: "Set Instance Property",
            description: "Set one property on an instance — boolean toggle, text override, instance swap, or variant selection.",
            inputSchema: z.object({
                nodeId: z.string().describe("The ID of the instance node"),
                nodeName: z.string().describe("Name of the instance node for verification"),
                propertyName: z.string().describe("The human-readable name of the component property to change"),
                value: z.union([z.string(), z.boolean()]).describe("The new value for the property. For INSTANCE_SWAP properties, this must be a component key (the stable library identifier)."),
            }),
            outputSchema: looseOutput({
                success: z.boolean().optional().describe("Whether property update was successful"),
                results: z.any().optional().describe("Execution details"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("instance_set_property", params);
            return toolResult(result);
        }
    );

    // 2. Get Instance Overrides Tool
    server.registerTool(
        "instance_get_overrides",
        {
            title: "Get Instance Overrides",
            description: "Read the override properties from a source instance, to later apply them to other instances.",
            inputSchema: z.object({
                nodeId: z
                    .string()
                    .describe("The ID of the component instance to get overrides from."),
            }),
            outputSchema: looseOutput({
                success: z.boolean().optional().describe("Whether overrides retrieval was successful"),
                message: z.string().optional().describe("Status message"),
                sourceInstanceId: z.string().optional().describe("Source instance ID"),
                mainComponentId: z.string().optional().describe("ID of the main component"),
                overridesCount: z.number().optional().describe("Number of overrides found"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async ({ nodeId }: any) => {
            const result = await sendCommandToFigma("instance_get_overrides", {
                instanceNodeId: nodeId || null,
            });
            return toolResult(result);
        }
    );

    // 3. Set Instance Overrides Tool
    server.registerTool(
        "instance_set_overrides",
        {
            title: "Set Instance Overrides",
            description: "Apply previously-read overrides to target instances; targets are swapped to the source component and all overrides applied. If the status is 'partial_success', treat it as an incomplete operation, report the failed and skipped items to the user, and retry every non-success item (both failed and skipped).",
            inputSchema: z.object({
                sourceInstanceId: z.string().describe("ID of the source component instance"),
                targetNodes: z
                    .array(
                        z.object({
                            nodeId: z.string().describe("The ID of the target instance"),
                            nodeName: z.string().describe("Name of the node to modify"),
                        })
                    )
                    .min(1)
                    .superRefine(noDuplicateTargets)
                    .describe("Array of target instances with their expected names for verification."),
            }),
            outputSchema: looseOutput({
                success: z.boolean().describe("Whether overrides application was successful"),
                status: z.enum(["success", "partial_success", "failed"]).describe("Overall status of the batch operation"),
                requestedCount: z.number().describe("Number of requested targets"),
                succeededCount: z.number().describe("Number of succeeded targets"),
                failedCount: z.number().describe("Number of failed targets"),
                skippedCount: z.number().describe("Number of skipped targets"),
                results: z.array(z.any()).optional().describe("Results per target node"),
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("instance_set_overrides", params);
            return toolResult(result);
        }
    );

    // Swap overrides instance prompt
    server.registerPrompt(
        "swap_overrides_instances",
        {
            description: "Strategy for transferring overrides between component instances in Figma",
        },
        (extra) => {
            return {
                messages: [
                    {
                        role: "assistant",
                        content: {
                            type: "text",
                            text: `# Swap Component Instance and Override Strategy

## Overview
This strategy enables transferring content and property overrides from a source instance to one or more target instances in Figma, maintaining design consistency while reducing manual work.

## Step-by-Step Process

### 1. Selection Analysis
- Use \`page_info()\` to explore the document structure and identify node IDs.
- Determine which is the source node (with content to copy) and which are targets (where to apply content).

### 2. Extract Source Overrides
- Use \`instance_get_overrides()\` to extract customizations from the source instance
- This captures text content, property values, and style overrides
- Command syntax: \`instance_get_overrides({ nodeId: "source-instance-id" })\`
- Look for successful response like "Got component information from [instance name]"

### 3. Apply Overrides to Targets
- Apply captured overrides using \`instance_set_overrides()\`
- Command syntax:
  \`\`\`
  instance_set_overrides({
    sourceInstanceId: "source-instance-id",
    targetNodes: [
      { nodeId: "target-id-1", nodeName: "Target Name 1" },
      { nodeId: "target-id-2", nodeName: "Target Name 2" }
    ]
  })
  \`\`\`

### 4. Verification
- Verify results with \`node_info({ nodeIds, properties: ["componentProperties", "characters", "overrides"] })\`
- Confirm text content and style overrides have transferred successfully

## Key Tips
- Always join the appropriate channel first with \`channel_join()\`
- When working with multiple targets, verify their IDs with \`page_info()\`.
- Preserve component relationships by using instance overrides rather than direct text manipulation`,
                        },
                    },
                ],
            };
        }
    );
}
