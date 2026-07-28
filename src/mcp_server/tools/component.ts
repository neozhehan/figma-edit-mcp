import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput } from "./_result.js";

export function registerComponentTools(server: McpServer) {
    // 1. List Components Tool
    server.registerTool(
        "component_list",
        {
            title: "List Components",
            description: "List components in the document, with filtering and scope options.",
            inputSchema: z.object({
                filter: z
                    .enum(["local", "remote"])
                    .optional()
                    .describe("Filter components by origin: 'local' (created in this file) or 'remote' (library components). If omitted, returns all."),
                scope: z
                    .enum(["page", "document"])
                    .optional()
                    .default("document")
                    .describe("Scope of the search: 'page' (queries a specific page, requiring pageId) or 'document' (entire file, default)."),
                pageId: z
                    .string()
                    .optional()
                    .describe("The ID of the page to query when scope is 'page'"),
            }),
            outputSchema: looseOutput({
                count: z.number().describe("Total count of components"),
                components: z.array(z.any()).describe("List of component objects"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("component_list", params);
            return toolResult(result);
        }
    );

    // 2. Manage Component Property Tool
    server.registerTool(
        "component_manage_property",
        {
            title: "Manage Component Property",
            description: "Add or edit a component-property definition (BOOLEAN/TEXT/INSTANCE_SWAP) on a main component or variant set. Deleting is `component_delete_property`.",
            inputSchema: z.object({
                nodeId: z.string().describe("ID of the COMPONENT or COMPONENT_SET"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                action: z.enum(["ADD", "EDIT"]).describe("Action to perform"),
                propertyName: z.string().describe("The human-readable name of the property to affect"),
                newPropertyName: z.string().min(1).optional().describe("For the EDIT action, to rename the property. Must be non-empty: Figma rejects an empty property name, so it is refused here instead of one round trip later."),
                propertyType: z.enum(["BOOLEAN", "TEXT", "INSTANCE_SWAP"]).optional().describe("Required for ADD: The type of property"),
                defaultValue: z.union([z.string(), z.boolean()]).optional().describe("Required for ADD: Default value for the property. For INSTANCE_SWAP, this must be a component node ID."),
                newDefaultValue: z.union([z.string(), z.boolean()]).optional().describe("For the EDIT action, to change the default value. For INSTANCE_SWAP, this must be a component node ID."),
                preferredValues: z
                    .array(
                        z.object({
                            type: z.enum(["COMPONENT", "COMPONENT_SET"]).describe("Whether the preferred value refers to a COMPONENT or a COMPONENT_SET"),
                            key: z.string().describe("The library key (stable identifier) of the preferred component/set"),
                        })
                    )
                    .optional()
                    .describe("Array of preferred values for INSTANCE_SWAP properties during ADD or EDIT."),
            }),
            outputSchema: looseOutput({
                id: z.string().optional().describe("ID of the component/component set"),
                name: z.string().optional().describe("Name of the component/component set"),
                action: z.string().optional().describe("The action that was performed (ADD/EDIT)"),
                propertyName: z.string().optional().describe("The affected property name"),
                success: z.boolean().optional().describe("Whether property management was successful"),
                results: z.any().optional().describe("Detailed execution results"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (args: any) => {
            if (args.action === "ADD" && (args.propertyType === undefined || args.defaultValue === undefined)) {
                throw new Error("propertyType and defaultValue are required for ADD action");
            }
            const result = await sendCommandToFigma("component_manage_property", args);
            return toolResult(result);
        }
    );

    // 3. Delete Component Property Tool
    server.registerTool(
        "component_delete_property",
        {
            title: "Delete Component Property",
            description: "Remove a component-property definition from a main component or variant set; propagates to every instance.",
            inputSchema: z.object({
                nodeId: z.string().describe("ID of the COMPONENT or COMPONENT_SET"),
                nodeName: z.string().describe("The node's current exact name, passed back verbatim from `node_info`."),
                propertyName: z.string().describe("The human-readable name of the property to delete"),
            }),
            outputSchema: looseOutput({
                id: z.string().optional().describe("ID of the component/component set"),
                name: z.string().optional().describe("Name of the component/component set"),
                propertyName: z.string().optional().describe("The deleted property name"),
                success: z.boolean().optional().describe("Whether property deletion was successful"),
                results: z.any().optional().describe("Detailed execution results"),
            }),
            annotations: {
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("component_delete_property", params);
            return toolResult(result);
        }
    );
}
