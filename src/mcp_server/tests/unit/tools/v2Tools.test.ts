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
            "view_navigate", "node_group", "node_ungroup", "node_flatten", "node_insert_child",
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

    describe("v2.1.0 schema constraints", () => {
        it("all five creation tools require parentId and parentNodeName", () => {
            const registered = (server as any)._registeredTools;
            // Input schemas are now STRICT (reject unknown keys), so each tool gets
            // exactly its own required fields — a shared superset would be rejected
            // for the keys that don't belong to that tool.
            const requiredByTool: Record<string, any> = {
                create_shape: { type: "RECTANGLE", x: 0, y: 0, width: 10, height: 10 },
                create_frame: { x: 0, y: 0, width: 10, height: 10 },
                create_text: { x: 0, y: 0, text: "hi" },
                create_svg: { svg: "<svg/>" },
                create_instance: { x: 0, y: 0 },
            };
            for (const [t, fields] of Object.entries(requiredByTool)) {
                const schema = registered[t].inputSchema;
                expect(schema.safeParse({ ...fields }).success).toBe(false);          // no parentId or parentNodeName → rejected
                expect(schema.safeParse({ ...fields, parentId: "p1" }).success).toBe(false);          // no parentNodeName → rejected
                expect(schema.safeParse({ ...fields, parentNodeName: "parent" }).success).toBe(false); // no parentId → rejected
                expect(schema.safeParse({ ...fields, parentId: "p1", parentNodeName: "parent" }).success).toBe(true);
            }
        });

        it("create_component_set requires parentId and parentNodeName", () => {
            const registered = (server as any)._registeredTools;
            const schema = registered["create_component_set"].inputSchema;
            const baseFields = {
                components: [{ nodeId: "c1", nodeName: "c1", propertyValues: ["A"] }],
                properties: ["Prop"]
            };
            expect(schema.safeParse({ ...baseFields }).success).toBe(false); // missing both
            expect(schema.safeParse({ ...baseFields, parentId: "p1" }).success).toBe(false); // missing parentNodeName
            expect(schema.safeParse({ ...baseFields, parentNodeName: "parent" }).success).toBe(false); // missing parentId
            expect(schema.safeParse({ ...baseFields, parentId: "p1", parentNodeName: "parent" }).success).toBe(true);
        });

        it("instance_get_overrides requires nodeId", () => {
            const schema = (server as any)._registeredTools["instance_get_overrides"].inputSchema;
            expect(schema.safeParse({}).success).toBe(false);
            expect(schema.safeParse({ nodeId: "i1" }).success).toBe(true);
        });

        it("node_export_visual caps scale to [0.1, 4]", () => {
            const schema = (server as any)._registeredTools["node_export_visual"].inputSchema;
            expect(schema.safeParse({ nodeId: "n1", scale: 5 }).success).toBe(false);
            expect(schema.safeParse({ nodeId: "n1", scale: 0.05 }).success).toBe(false);
            expect(schema.safeParse({ nodeId: "n1", scale: 4 }).success).toBe(true);
            expect(schema.safeParse({ nodeId: "n1", scale: 0.1 }).success).toBe(true);
        });

        it("component_list defaults scope to 'document' and only accepts 'page'|'document'", () => {
            const schema = (server as any)._registeredTools["component_list"].inputSchema;
            const parsed = schema.safeParse({});
            expect(parsed.success).toBe(true);
            expect((parsed as any).data.scope).toBe("document");
            expect(schema.safeParse({ scope: "current_page" }).success).toBe(false); // old value retired
        });

        it("variable_list.includeConsumers is optional with no default (off when omitted)", () => {
            const schema = (server as any)._registeredTools["variable_list"].inputSchema;
            const parsed = schema.safeParse({});
            expect(parsed.success).toBe(true);
            expect((parsed as any).data.includeConsumers).toBeUndefined();
            expect(schema.safeParse({ includeConsumers: "page" }).success).toBe(true);
            expect(schema.safeParse({ includeConsumers: "current_page" }).success).toBe(false);
        });

        it("view_navigate is registered with input `ids` and node_select is absent", () => {
            const registered = (server as any)._registeredTools;
            expect("view_navigate" in registered).toBe(true);
            expect("node_select" in registered).toBe(false);
            expect("ids" in registered["view_navigate"].inputSchema.shape).toBe(true);
        });

        it("node_set_fill requires solid color or image, not both, not neither, and partial RGB is rejected", () => {
            const schema = (server as any)._registeredTools["node_set_fill"].inputSchema;
            // Valid solid
            expect(schema.safeParse({ nodeId: "1", nodeName: "A", r: 1, g: 0, b: 0 }).success).toBe(true);
            // Valid image
            expect(schema.safeParse({ nodeId: "1", nodeName: "A", image: { url: "http://example.com/img.png" } }).success).toBe(true);
            expect(schema.safeParse({ nodeId: "1", nodeName: "A", image: { bytesBase64: "YWJj" } }).success).toBe(true);
            // Invalid: both
            expect(schema.safeParse({ nodeId: "1", nodeName: "A", r: 1, g: 0, b: 0, image: { url: "http://example.com/img.png" } }).success).toBe(false);
            // Invalid: neither
            expect(schema.safeParse({ nodeId: "1", nodeName: "A" }).success).toBe(false);
            // Invalid: partial RGB
            expect(schema.safeParse({ nodeId: "1", nodeName: "A", r: 1, g: 0 }).success).toBe(false);
            // Invalid: image with both url and bytesBase64
            expect(schema.safeParse({ nodeId: "1", nodeName: "A", image: { url: "http://example.com/img.png", bytesBase64: "YWJj" } }).success).toBe(false);
            // Invalid: image with neither url nor bytesBase64
            expect(schema.safeParse({ nodeId: "1", nodeName: "A", image: { scaleMode: "FIT" } }).success).toBe(false);
        });

        it("variable_manage accepts valid scopes and rejects an invalid enum value", () => {
            const schema = (server as any)._registeredTools["variable_manage"].inputSchema;
            // valid scopes accepted
            expect(schema.safeParse({
                action: "CREATE_VARIABLE",
                collectionId: "coll-1",
                collectionName: "MyColl",
                name: "var1",
                type: "FLOAT",
                scopes: ["ALL_FILLS", "STROKE_COLOR"]
            }).success).toBe(true);
            // scopes omission is rejected
            expect(schema.safeParse({
                action: "CREATE_VARIABLE",
                collectionId: "coll-1",
                collectionName: "MyColl",
                name: "var1",
                type: "FLOAT"
            }).success).toBe(false);
            // an invalid enum value is rejected by Zod
            expect(schema.safeParse({
                action: "CREATE_VARIABLE",
                collectionId: "coll-1",
                collectionName: "MyColl",
                name: "var1",
                type: "FLOAT",
                scopes: ["NOT_A_REAL_SCOPE"]
            }).success).toBe(false);
        });
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

        it("style_manage forwards the typed `properties` object to the plugin", async () => {
            const registered = (server as any)._registeredTools;
            const tool = registered["style_manage"];

            const properties = { paints: [{ type: "SOLID", color: { r: 0, g: 0.7, b: 0.2 } }] };
            await (tool.handler || tool.callback)(
                { type: "PAINT", name: "Brand", properties },
                {} as any
            );

            const arg = (sendCommandToFigma as any).mock.calls.at(-1)[1];
            // The handler reads `properties` directly; no JSON-string indirection.
            expect(arg.properties).toEqual(properties);
            expect(arg.propertiesJson).toBeUndefined();
            expect(arg).toMatchObject({ type: "PAINT", name: "Brand" });
        });

        it("style_manage input schema types the common cases (enums) and passes through polymorphic types", () => {
            const registered = (server as any)._registeredTools;
            const schema = registered["style_manage"].inputSchema;
            const ok = (input: any) => schema.safeParse(input).success;

            // Previously-undocumented TEXT props are now typed + validated.
            expect(ok({ type: "TEXT", name: "Body", properties: { fontSize: 14, textCase: "UPPER", lineHeight: { value: 20, unit: "PIXELS" } } })).toBe(true);
            expect(ok({ type: "TEXT", name: "Body", properties: { lineHeight: { unit: "AUTO" } } })).toBe(true);
            // Bad enum / out-of-range channel are rejected before reaching Figma.
            expect(ok({ type: "TEXT", name: "Body", properties: { textCase: "BOGUS" } })).toBe(false);
            expect(ok({ type: "PAINT", name: "C", properties: { paints: [{ type: "SOLID", color: { r: 5, g: 0, b: 0 } }] } })).toBe(false);
            // SOLID typed; GRADIENT/IMAGE pass through with their extra fields intact.
            expect(ok({ type: "PAINT", name: "C", properties: { paints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] } })).toBe(true);
            const grad = schema.safeParse({ type: "PAINT", name: "G", properties: { paints: [{ type: "GRADIENT_LINEAR", gradientStops: [{ position: 0 }] }] } });
            expect(grad.success).toBe(true);
            expect(grad.data.properties.paints[0].gradientStops).toEqual([{ position: 0 }]);

            // Verify blendMode is accepted in effects
            const effectRes = schema.safeParse({ type: "EFFECT", name: "E", properties: { effects: [{ type: "DROP_SHADOW", blendMode: "MULTIPLY" }] } });
            expect(effectRes.success).toBe(true);
            expect(effectRes.data.properties.effects[0].blendMode).toBe("MULTIPLY");
        });

        it("R3.8 polish: node_info outputSchema accepts real result shapes (typed, not over-strict)", () => {
            const registered = (server as any)._registeredTools;
            const out = registered["node_info"].outputSchema;
            const ok = (r: any) => out.safeParse(r).success;

            // Representative result: resolved refs, recursive children, path, missingNodeIds.
            expect(ok({
                nodes: [{
                    id: "1:2", name: "Frame", type: "FRAME",
                    properties: { fillStyleId: { id: "S:x", name: "Brand" }, pointCount: 5, parent: "0:1", cornerRadius: "mixed" },
                    path: [["PAGE", "0:1", "Page 1"], ["FRAME", "1:1", "Outer"]],
                    descendantCount: 3,
                    children: [{ id: "1:3", name: "Child", type: "TEXT", properties: { characters: "hi" } }],
                }],
                missingNodeIds: ["9:9"],
            })).toBe(true);
            // Minimal entry (id/name/type only) is valid.
            expect(ok({ nodes: [{ id: "1:2", name: "N", type: "RECTANGLE" }] })).toBe(true);
            // Missing a required structural key fails.
            expect(ok({ nodes: [{ name: "N", type: "RECTANGLE" }] })).toBe(false);
        });
    });
});
