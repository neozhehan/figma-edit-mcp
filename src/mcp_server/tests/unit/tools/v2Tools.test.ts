import { describe, it, expect, beforeEach, mock } from "bun:test";

mock.module('../../../figma-client.js', () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve()),
    resetChannel: mock(() => {}),
}));

// Import modules
const { registerAllTools } = await import("../../../tools/index.js");
const { sendCommandToFigma } = await import("../../../figma-client.js");
const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");

describe("v2.0.0 Tool Registration & Routing Tests (WS3)", () => {
    let server: McpServer;

    beforeEach(() => {
        server = new McpServer({ name: "test-server", version: "2.0.0" });
        registerAllTools(server);
        (sendCommandToFigma as any).mockClear();
    });

    it("should register all 46 tools in correct groups", () => {
        const registered = (server as any)._registeredTools;
        expect(Object.keys(registered).length).toBe(46);

        // Verification of presence of expected tools
        const expectedTools = [
            // page
            "page_info",
            // node
            "node_info", "node_transform", "node_rename", "node_delete", "node_clone",
            "node_select", "node_group", "node_ungroup", "node_flatten", "node_insert_child",
            "node_set_auto_layout", "node_set_fill", "node_set_stroke", "node_set_corner_radius",
            "node_set_effects", "node_apply_style", "node_bind_variable", "node_export_visual",
            // create
            "create_shape", "create_frame", "create_text", "create_svg", "create_component",
            "create_instance", "create_component_set", "create_connection",
            // style
            "style_list", "style_manage", "style_delete",
            // text
            "text_set_content", "text_set_style",
            // component
            "component_list", "component_manage_property", "component_delete_property",
            // instance
            "instance_set_property", "instance_get_overrides", "instance_set_overrides",
            // variable
            "variable_list", "variable_manage", "variable_delete",
            // annotation
            "annotation_list", "annotation_set",
            // reaction
            "reaction_list", "reaction_update",
            // channel
            "channel_join"
        ];

        for (const toolName of expectedTools) {
            expect(toolName in registered).toBe(true);
        }

        // R5.1a: Verify that legacy names are no longer registered.
        // NOTE: create_frame/create_text/create_component/create_component_set are
        // intentionally absent — those tools' old flat names already equal their
        // new underscored names (e.g. create.frame -> create_frame), so they are
        // legitimately registered and must NOT be asserted as removed.
        const legacyNames = [
            "create_rectangle", "create_node_from_svg", "create_ellipse", "create_polygon_star",
            "move_node", "resize_node", "set_node_name", "delete_multiple_nodes", "clone_node", "set_selections",
            "group_nodes", "ungroup_nodes", "flatten_node", "insert_child", "set_fill_color", "set_stroke",
            "set_corner_radius", "set_effects", "get_styles", "manage_style", "apply_style",
            "set_multiple_text_contents", "set_text_style", "get_components",
            "create_component_instance", "get_instance_overrides", "set_instance_overrides",
            "set_component_instance_property", "manage_component_property", "get_variables", "get_node_variables",
            "set_bound_variable", "manage_variables", "delete_variables", "get_annotations", "set_multiple_annotations",
            "update_reactions", "get_reactions", "create_connections", "get_pages_info", "get_nodes_info",
            "join_channel", "export_node_as_image"
        ];

        for (const legacyName of legacyNames) {
            expect(legacyName in registered).toBe(false);
        }

        // Regression guard for the Antigravity / function-calling failure: every
        // tool name (and thus `mcp_<server>_<name>`) must satisfy the LLM
        // tool-name constraint ^[a-zA-Z0-9_-]{1,64}$ — NO dots. Dotted names are
        // rejected by Antigravity and the Anthropic/OpenAI/Gemini function APIs.
        for (const name of Object.keys(registered)) {
            expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
        }
    });

    it("should carry correct title, descriptions and annotations verbatim", () => {
        const registered = (server as any)._registeredTools;

        // 1. page.info
        const pageInfo = registered["page_info"];
        expect(pageInfo.title).toBe("Get Pages");
        expect(pageInfo.description).toContain("List the document's pages");
        expect(pageInfo.annotations?.readOnlyHint).toBe(true);

        // 2. node.delete
        const nodeDelete = registered["node_delete"];
        expect(nodeDelete.title).toBe("Delete Nodes");
        expect(nodeDelete.annotations?.destructiveHint).toBe(true);
        expect(nodeDelete.annotations?.idempotentHint).toBe(true);

        // 3. create.shape
        const createShape = registered["create_shape"];
        expect(createShape.title).toBe("Create Shape");
        expect(createShape.description).toContain("Create a rectangle, ellipse, polygon, or star");
        expect(createShape.annotations?.readOnlyHint).toBeUndefined();
        expect(createShape.annotations?.idempotentHint).toBeUndefined();

        // 4. style.delete
        const styleDelete = registered["style_delete"];
        expect(styleDelete.title).toBe("Delete Style");
        expect(styleDelete.annotations?.destructiveHint).toBe(true);
        expect(styleDelete.annotations?.idempotentHint).toBe(true);

        // 5. component.delete_property
        const compDelProp = registered["component_delete_property"];
        expect(compDelProp.title).toBe("Delete Component Property");
        expect(compDelProp.annotations?.destructiveHint).toBe(true);
        expect(compDelProp.annotations?.idempotentHint).toBe(true);

        // 6. variable.delete
        const varDelete = registered["variable_delete"];
        expect(varDelete.title).toBe("Delete Variables");
        expect(varDelete.annotations?.destructiveHint).toBe(true);
        expect(varDelete.annotations?.idempotentHint).toBe(true);
    });

    it("should satisfy R5.1j and R5.1k: schema completeness, annotations, and parameter descriptions", () => {
        const registered = (server as any)._registeredTools;

        for (const [name, tool] of Object.entries(registered) as [string, any][]) {
            // R5.1k: every tool has a non-empty description
            expect(tool.description).toBeDefined();
            expect(tool.description.trim().length).toBeGreaterThan(0);

            // R5.1j: every tool registers an outputSchema and title
            expect(tool.outputSchema).toBeDefined();
            expect(tool.title).toBeDefined();
            expect(tool.title.trim().length).toBeGreaterThan(0);
            expect(tool.annotations).toBeDefined();

            // R5.1k: every input param has a .describe(...)
            const schema = tool.inputSchema;
            if (schema && schema.shape) {
                for (const [paramName, paramField] of Object.entries(schema.shape) as [string, any][]) {
                    const desc = paramField.description;
                    if (!desc) {
                        console.error(`Missing description for tool "${name}", parameter "${paramName}"`);
                    }
                    expect(desc).toBeDefined();
                    expect(desc.trim().length).toBeGreaterThan(0);
                }
            }
        }
    });

    describe("Tool routing & payload verification", () => {
        it("create.shape routes to figma with correct type and properties", async () => {
            const registered = (server as any)._registeredTools;
            const shapeTool = registered["create_shape"];

            const params = {
                type: "STAR",
                x: 100,
                y: 100,
                width: 200,
                height: 200,
                pointCount: 5,
                innerRadius: 0.38,
                fillColor: { r: 1, g: 0.5, b: 0, a: 1 }
            };

            await (shapeTool.handler || shapeTool.callback)(params, {} as any);

            expect(sendCommandToFigma).toHaveBeenCalledWith("create_shape", params);
        });

        it("node.transform routes to figma with subset x,y,width,height", async () => {
            const registered = (server as any)._registeredTools;
            const transformTool = registered["node_transform"];

            const params = {
                nodeId: "1:2",
                nodeName: "Test",
                width: 150
            };

            await (transformTool.handler || transformTool.callback)(params, {} as any);

            expect(sendCommandToFigma).toHaveBeenCalledWith("node_transform", params);
        });

        it("style.delete routes to figma style.delete command", async () => {
            const registered = (server as any)._registeredTools;
            const styleDeleteTool = registered["style_delete"];

            const params = {
                styleId: "S:1",
                styleName: "Brand Color"
            };

            await (styleDeleteTool.handler || styleDeleteTool.callback)(params, {} as any);

            expect(sendCommandToFigma).toHaveBeenCalledWith("style_delete", params);
        });

        it("component.delete_property routes to figma component.delete_property command", async () => {
            const registered = (server as any)._registeredTools;
            const delPropTool = registered["component_delete_property"];

            const params = {
                nodeId: "2:2",
                nodeName: "Btn",
                propertyName: "Label"
            };

            await (delPropTool.handler || delPropTool.callback)(params, {} as any);

            expect(sendCommandToFigma).toHaveBeenCalledWith("component_delete_property", params);
        });

        it("style_manage parses propertiesJson into a `properties` object (regression: empty styles)", async () => {
            const registered = (server as any)._registeredTools;
            const tool = registered["style_manage"];

            const props = { paints: [{ type: "SOLID", color: { r: 0, g: 0.7, b: 0.2 } }] };
            await (tool.handler || tool.callback)(
                { type: "PAINT", name: "Brand", propertiesJson: JSON.stringify(props) },
                {} as any
            );

            const arg = (sendCommandToFigma as any).mock.calls.at(-1)[1];
            // Handler reads `properties` (object); the raw `propertiesJson` string must NOT leak through.
            expect(arg.properties).toEqual(props);
            expect(arg.propertiesJson).toBeUndefined();
            expect(arg).toMatchObject({ type: "PAINT", name: "Brand" });
        });

        it("style_manage rejects malformed propertiesJson", async () => {
            const registered = (server as any)._registeredTools;
            const tool = registered["style_manage"];
            await expect(
                (tool.handler || tool.callback)(
                    { type: "PAINT", name: "Bad", propertiesJson: "{not valid json" },
                    {} as any
                )
            ).rejects.toThrow(/Invalid propertiesJson/);
        });
    });
});
