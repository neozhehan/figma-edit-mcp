import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
    sendCommandToFigma,
    getInstanceOverridesResult,
    setInstanceOverridesResult,
} from "../figma-client.js";
import { normalizeNodeId } from "../utils.js";

export function registerComponentTools(server: McpServer) {
    // Get Components Tool
    server.tool(
        "get_components",
        "Get components from the Figma document with filtering options",
        {
            filter: z.enum(["local", "remote"]).optional().describe("Filter components by origin: 'local' (created in this file) or 'remote' (library components). If omitted, returns all."),
            scope: z.enum(["current_page", "document"]).optional().default("current_page").describe("Scope of the search: 'current_page' (default) or 'document' (entire file, streams progress page-by-page and survives 60s inactivity timeout on large files)."),
        },
        async ({ filter, scope }: any) => {
            try {
                const result = await sendCommandToFigma("get_components", {
                    filter,
                    scope,
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
                            text: `Error getting components: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        }
    );



    // Create Component Tool
    server.tool(
        "create_component",
        "Transforms a frame into a main component.",
        {
            nodeId: z
                .string()
                .describe("The ID of the frame to convert to a component"),
            nodeName: z.string().describe("Name of the node to verify against"),
        },
        async ({ nodeId, nodeName }: any) => {
            try {
                nodeId = normalizeNodeId(nodeId);
                const result = await sendCommandToFigma("create_component", {
                    nodeId,
                    nodeName,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating component: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Create Component Instance Tool
    server.tool(
        "create_component_instance",
        "Create an instance of a component in Figma",
        {
            componentKey: z.string().optional().describe("Key of the component to instantiate (for remote/library components)"),
            componentId: z.string().optional().describe("Node ID of the component to instantiate (preferred for local components)"),
            x: z.number().describe("X position"),
            y: z.number().describe("Y position"),
            parentId: z
                .string()
                .optional()
                .describe("Optional parent node ID to append the instance to"),
            parentNodeName: z
                .string()
                .optional()
                .describe("Name of the parent node to verify against"),
        },
        async ({ componentKey, componentId, x, y, parentId, parentNodeName }: any) => {
            try {
                const result = await sendCommandToFigma("create_component_instance", {
                    componentKey,
                    componentId,
                    x,
                    y,
                    parentId,
                    parentNodeName,
                });
                const typedResult = result as any;
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(typedResult),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating component instance: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Copy Instance Overrides Tool
    server.tool(
        "get_instance_overrides",
        "Get all override properties from a selected component instance. These overrides can be applied to other instances, which will swap them to match the source component.",
        {
            nodeId: z
                .string()
                .optional()
                .describe(
                    "Optional ID of the component instance to get overrides from. If not provided, currently selected instance will be used."
                ),
        },
        async ({ nodeId }: any) => {
            try {
                const result = await sendCommandToFigma("get_instance_overrides", {
                    instanceNodeId: nodeId || null,
                });
                const typedResult = result as getInstanceOverridesResult;

                return {
                    content: [
                        {
                            type: "text",
                            text: typedResult.success
                                ? `Successfully got instance overrides: ${typedResult.message}`
                                : `Failed to get instance overrides: ${typedResult.message}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error copying instance overrides: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Set Instance Overrides Tool
    server.tool(
        "set_instance_overrides",
        "Apply previously copied overrides to selected component instances. Target instances will be swapped to the source component and all copied override properties will be applied.",
        {
            sourceInstanceId: z
                .string()
                .describe("ID of the source component instance"),
            targetNodes: z
                .array(
                    z.object({
                        nodeId: z.string().describe("The ID of the target instance"),
                        nodeName: z.string().describe("Name of the node to modify"),
                    })
                )
                .describe(
                    "Array of target instances with their expected names for verification."
                ),
        },
        async ({ sourceInstanceId, targetNodes }: any) => {
            try {
                const result = await sendCommandToFigma("set_instance_overrides", {
                    sourceInstanceId: sourceInstanceId,
                    targetNodes: targetNodes || [],
                });
                const typedResult = result as setInstanceOverridesResult;

                if (typedResult.success) {
                    const successCount =
                        typedResult.results?.filter((r) => r.success).length || 0;
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Successfully applied ${typedResult.totalCount || 0
                                    } overrides to ${successCount} instances.`,
                            },
                        ],
                    };
                } else {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Failed to set instance overrides: ${typedResult.message}`,
                            },
                        ],
                    };
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting instance overrides: ${error instanceof Error ? error.message : String(error)
                                }`,
                        },
                    ],
                };
            }
        }
    );

    // Create Component Set Tool
    server.tool(
        "create_component_set",
        "Transforms components into a component set (variants).",
        {
            components: z.array(z.object({
                nodeId: z.string().describe("ID of the component"),
                nodeName: z.string().describe("Current name (for verification)"),
                propertyValues: z.array(z.string()).describe("Values corresponding to properties array")
            })).describe("Array of component objects"),
            properties: z.array(z.string()).describe("Array of property names (e.g. ['Size', 'State'])"),
            componentSetName: z.string().optional().describe("Name for the component set"),
            parentId: z.string().optional().describe("Parent frame to place the set in"),
            parentNodeName: z.string().optional().describe("Name of parent node (required if parentId provided, for verification)"),
        },
        async ({ components, properties, componentSetName, parentId, parentNodeName }: any) => {
            try {
                // Normalize IDs
                const normalizedComponents = components.map((c: any) => ({
                    ...c,
                    nodeId: normalizeNodeId(c.nodeId)
                }));
                const normalizedParentId = parentId ? normalizeNodeId(parentId) : undefined;

                const result = await sendCommandToFigma("create_component_set", {
                    components: normalizedComponents,
                    properties,
                    componentSetName,
                    parentId: normalizedParentId,
                    parentNodeName
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error creating component set: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        }
    );

    // Set Component Instance Property Tool
    server.tool(
        "set_component_instance_property",
        "Set a specific property value (boolean toggle, text override, instance swap, or variant selection) on an instance.",
        {
            nodeId: z.string().describe("The ID of the instance node"),
            nodeName: z.string().describe("Name of the instance node for verification"),
            propertyName: z.string().describe("The human-readable name of the component property to change"),
            value: z.union([z.string(), z.boolean()]).describe("The new value for the property. For INSTANCE_SWAP properties, this must be a component key (the stable library identifier)."),
        },
        async ({ nodeId, nodeName, propertyName, value }: any) => {
            try {
                const result = await sendCommandToFigma("set_component_instance_property", {
                    nodeId,
                    nodeName,
                    propertyName,
                    value,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting component instance property: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        }
    );

    // Manage Component Property Tool
    server.tool(
        "manage_component_property",
        "Perform CRUD operations on property definitions for main components or variant sets.",
        {
            nodeId: z.string().describe("ID of the COMPONENT or COMPONENT_SET"),
            nodeName: z.string().describe("Name of the node for verification"),
            action: z.enum(["ADD", "EDIT", "DELETE"]).describe("Action to perform"),
            propertyName: z.string().describe("The human-readable name of the property to affect"),
            newPropertyName: z.string().optional().describe("For the EDIT action, to rename the property"),
            propertyType: z.enum(["BOOLEAN", "TEXT", "INSTANCE_SWAP"]).optional().describe("Required for ADD: The type of property"),
            defaultValue: z.union([z.string(), z.boolean()]).optional().describe("Required for ADD: Default value for the property. For INSTANCE_SWAP, this must be a component node ID (for local components, the node id; for library components, first import via importComponentByKeyAsync to obtain a local node id)."),
            newDefaultValue: z.union([z.string(), z.boolean()]).optional().describe("For the EDIT action, to change the default value. For INSTANCE_SWAP, this must be a component node ID."),
            preferredValues: z.array(z.object({
                type: z.enum(["COMPONENT", "COMPONENT_SET"]).describe("Whether the preferred value refers to a COMPONENT or a COMPONENT_SET"),
                key: z.string().describe("The library key (the stable identifier from component.key) of the preferred component or component set"),
            })).optional().describe("Array of preferred values for INSTANCE_SWAP properties during ADD or EDIT. Each entry must be { type, key } where key is the library key (component.key)."),
        },
        async (args: any) => {
            try {
                // Ensure required fields based on action
                if (args.action === "ADD" && (args.propertyType === undefined || args.defaultValue === undefined)) {
                    throw new Error("propertyType and defaultValue are required for ADD action");
                }

                const result = await sendCommandToFigma("manage_component_property", args);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error managing component property: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        }
    );

    // Instance Slot Filling Strategy Prompt
    server.prompt(
        "swap_overrides_instances",
        "Guide to swap instance overrides between instances",
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
- Use \`get_pages_info()\` to explore the document structure and identify node IDs.
- Determine which is the source node (with content to copy) and which are targets (where to apply content).

### 2. Extract Source Overrides
- Use \`get_instance_overrides()\` to extract customizations from the source instance
- This captures text content, property values, and style overrides
- Command syntax: \`get_instance_overrides({ nodeId: "source-instance-id" })\`
- Look for successful response like "Got component information from [instance name]"

### 3. Apply Overrides to Targets
- Apply captured overrides using \`set_instance_overrides()\`
- Command syntax:
  \`\`\`
  set_instance_overrides({
    sourceInstanceId: "source-instance-id",
    targetNodes: [
      { nodeId: "target-id-1", nodeName: "Target Name 1" },
      { nodeId: "target-id-2", nodeName: "Target Name 2" }
    ]
  })
  \`\`\`

### 4. Verification
- Verify results with \`get_nodes_info(nodeIds, properties: ["componentProperties", "characters", "overrides"])\`
- Confirm text content and style overrides have transferred successfully

## Key Tips
- Always join the appropriate channel first with \`join_channel()\`
- When working with multiple targets, verify their IDs with \`get_pages_info()\`.
- Preserve component relationships by using instance overrides rather than direct text manipulation`,
                        },
                    },
                ],
                description:
                    "Strategy for transferring overrides between component instances in Figma",
            };
        }
    );
}
