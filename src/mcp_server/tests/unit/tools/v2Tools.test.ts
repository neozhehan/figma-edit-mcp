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
            "page.info",
            // node
            "node.info", "node.transform", "node.rename", "node.delete", "node.clone",
            "node.select", "node.group", "node.ungroup", "node.flatten", "node.insert_child",
            "node.set_auto_layout", "node.set_fill", "node.set_stroke", "node.set_corner_radius",
            "node.set_effects", "node.apply_style", "node.bind_variable", "node.export_visual",
            // create
            "create.shape", "create.frame", "create.text", "create.svg", "create.component",
            "create.instance", "create.component_set", "create.connection",
            // style
            "style.list", "style.manage", "style.delete",
            // text
            "text.set_content", "text.set_style",
            // component
            "component.list", "component.manage_property", "component.delete_property",
            // instance
            "instance.set_property", "instance.get_overrides", "instance.set_overrides",
            // variable
            "variable.list", "variable.manage", "variable.delete",
            // annotation
            "annotation.list", "annotation.set",
            // reaction
            "reaction.list", "reaction.update",
            // channel
            "channel.join"
        ];

        for (const toolName of expectedTools) {
            expect(toolName in registered).toBe(true);
        }
    });

    it("should carry correct title, descriptions and annotations verbatim", () => {
        const registered = (server as any)._registeredTools;

        // 1. page.info
        const pageInfo = registered["page.info"];
        expect(pageInfo.title).toBe("Get Pages");
        expect(pageInfo.description).toContain("List the document's pages");
        expect(pageInfo.annotations?.readOnlyHint).toBe(true);

        // 2. node.delete
        const nodeDelete = registered["node.delete"];
        expect(nodeDelete.title).toBe("Delete Nodes");
        expect(nodeDelete.annotations?.destructiveHint).toBe(true);
        expect(nodeDelete.annotations?.idempotentHint).toBe(true);

        // 3. create.shape
        const createShape = registered["create.shape"];
        expect(createShape.title).toBe("Create Shape");
        expect(createShape.description).toContain("Create a rectangle, ellipse, polygon, or star");
        expect(createShape.annotations?.readOnlyHint).toBeUndefined();
        expect(createShape.annotations?.idempotentHint).toBeUndefined();

        // 4. style.delete
        const styleDelete = registered["style.delete"];
        expect(styleDelete.title).toBe("Delete Style");
        expect(styleDelete.annotations?.destructiveHint).toBe(true);
        expect(styleDelete.annotations?.idempotentHint).toBe(true);

        // 5. component.delete_property
        const compDelProp = registered["component.delete_property"];
        expect(compDelProp.title).toBe("Delete Component Property");
        expect(compDelProp.annotations?.destructiveHint).toBe(true);
        expect(compDelProp.annotations?.idempotentHint).toBe(true);

        // 6. variable.delete
        const varDelete = registered["variable.delete"];
        expect(varDelete.title).toBe("Delete Variables");
        expect(varDelete.annotations?.destructiveHint).toBe(true);
        expect(varDelete.annotations?.idempotentHint).toBe(true);
    });

    describe("Tool routing & payload verification", () => {
        it("create.shape routes to figma with correct type and properties", async () => {
            const registered = (server as any)._registeredTools;
            const shapeTool = registered["create.shape"];

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

            expect(sendCommandToFigma).toHaveBeenCalledWith("create.shape", params);
        });

        it("node.transform routes to figma with subset x,y,width,height", async () => {
            const registered = (server as any)._registeredTools;
            const transformTool = registered["node.transform"];

            const params = {
                nodeId: "1:2",
                nodeName: "Test",
                width: 150
            };

            await (transformTool.handler || transformTool.callback)(params, {} as any);

            expect(sendCommandToFigma).toHaveBeenCalledWith("node.transform", params);
        });

        it("style.delete routes to figma style.delete command", async () => {
            const registered = (server as any)._registeredTools;
            const styleDeleteTool = registered["style.delete"];

            const params = {
                styleId: "S:1",
                styleName: "Brand Color"
            };

            await (styleDeleteTool.handler || styleDeleteTool.callback)(params, {} as any);

            expect(sendCommandToFigma).toHaveBeenCalledWith("style.delete", params);
        });

        it("component.delete_property routes to figma component.delete_property command", async () => {
            const registered = (server as any)._registeredTools;
            const delPropTool = registered["component.delete_property"];

            const params = {
                nodeId: "2:2",
                nodeName: "Btn",
                propertyName: "Label"
            };

            await (delPropTool.handler || delPropTool.callback)(params, {} as any);

            expect(sendCommandToFigma).toHaveBeenCalledWith("component.delete_property", params);
        });
    });
});
