import { describe, it, expect, beforeEach, mock } from "bun:test";

// Define mocks
mock.module('../../../figma-client.js', () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
}));

mock.module('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

mock.module('../../../utils.js', () => ({
    normalizeNodeId: mock((id) => id),
}));

// Import modules
const { registerStylingTools } = await import('../../../tools/styling.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Styling Tools", () => {
    let mockServer: any;
    let registeredTools: Record<string, Function> = {};

    beforeEach(() => {
        registeredTools = {};
        mockServer = {
            tool: mock((name, description, schema, handler) => {
                registeredTools[name] = handler;
            })
        };
        (sendCommandToFigma as any).mockClear();
    });

    it("should register styling tools", () => {
        registerStylingTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["set_fill_color"]).toBeDefined();
        expect(registeredTools["set_stroke_color"]).toBeDefined();
        expect(registeredTools["set_corner_radius"]).toBeDefined();
        expect(registeredTools["set_effects"]).toBeDefined();
        expect(registeredTools["get_styles"]).toBeDefined();
        expect(registeredTools["manage_style"]).toBeDefined();
        expect(registeredTools["apply_style"]).toBeDefined();
    });

    it("set_fill_color should call sendCommandToFigma with correct params", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = { nodeId: "node-1", nodeName: "Test Node", r: 1, g: 0, b: 0 };
        const result = await registeredTools["set_fill_color"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_fill_color", {
            nodeId: "node-1",
            nodeName: "Test Node",
            color: { r: 1, g: 0, b: 0, a: 1 }
        });
        expect(result.content[0].text).toContain('Set fill color of node "Test Node"');
    });

    it("set_stroke_color should call sendCommandToFigma with correct params", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = { nodeId: "node-1", nodeName: "Test Node", r: 0, g: 1, b: 0, weight: 2 };
        const result = await registeredTools["set_stroke_color"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_stroke_color", {
            nodeId: "node-1",
            nodeName: "Test Node",
            color: { r: 0, g: 1, b: 0, a: 1 },
            weight: 2
        });
        expect(result.content[0].text).toContain('Set stroke color of node "Test Node"');
    });

    it("set_corner_radius should call sendCommandToFigma with correct params", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = { nodeId: "node-1", nodeName: "Test Node", radius: 10 };
        const result = await registeredTools["set_corner_radius"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_corner_radius", {
            nodeId: "node-1",
            nodeName: "Test Node",
            radius: 10,
            corners: [true, true, true, true]
        });
        expect(result.content[0].text).toContain('Set corner radius of node "Test Node"');
    });

    it("get_styles should call sendCommandToFigma", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue([{ id: "style-1", name: "My Style" }]);

        const result = await registeredTools["get_styles"]({});

        expect(sendCommandToFigma).toHaveBeenCalledWith("get_styles");
        expect(result.content[0].text).toContain('[{"id":"style-1","name":"My Style"}]');
    });

    it("manage_style should call sendCommandToFigma with correct params", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ id: "style-1", name: "New Style" });

        const params = { type: "PAINT", name: "New Style", description: "Desc", propertiesJson: '{"paints":[]}' };
        const result = await registeredTools["manage_style"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("manage_style", {
            type: "PAINT",
            name: "New Style",
            description: "Desc",
            properties: { paints: [] },
            styleId: undefined,
            unbindVariables: undefined
        });
        expect(result.content[0].text).toContain('"id": "style-1"');
    });

    it("apply_style should call sendCommandToFigma with correct params", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ success: true });

        const params = { nodeId: "node-1", nodeName: "Node", styleId: "style-1", styleType: "FILL" };
        const result = await registeredTools["apply_style"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("apply_style", params);
        expect(result.content[0].text).toContain('"success": true');
    });
});
