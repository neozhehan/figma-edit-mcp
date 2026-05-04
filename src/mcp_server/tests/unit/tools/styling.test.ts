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
        expect(registeredTools["set_stroke"]).toBeDefined();
        expect(registeredTools["set_corner_radius"]).toBeDefined();
        expect(registeredTools["set_effects"]).toBeDefined();
        expect(registeredTools["get_styles"]).toBeDefined();
        expect(registeredTools["manage_style"]).toBeDefined();
        expect(registeredTools["apply_style"]).toBeDefined();
    });

    it("should no longer register set_stroke_color (renamed to set_stroke)", () => {
        registerStylingTools(mockServer as any);
        expect(registeredTools["set_stroke_color"]).toBeUndefined();
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

    it("set_stroke should call sendCommandToFigma with uniform weight", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = { nodeId: "node-1", nodeName: "Test Node", r: 0, g: 1, b: 0, weight: 2 };
        const result = await registeredTools["set_stroke"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_stroke", {
            nodeId: "node-1",
            nodeName: "Test Node",
            color: { r: 0, g: 1, b: 0, a: 1 },
            weight: 2,
            strokeTopWeight: undefined,
            strokeBottomWeight: undefined,
            strokeLeftWeight: undefined,
            strokeRightWeight: undefined,
        });
        expect(result.content[0].text).toContain('Set stroke of node "Test Node"');
        expect(result.content[0].text).toContain("with weight 2");
    });

    it("set_stroke should call sendCommandToFigma with individual side weights", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = {
            nodeId: "node-1",
            nodeName: "Test Node",
            r: 0, g: 0, b: 1,
            strokeTopWeight: 2,
            strokeBottomWeight: 4,
            strokeLeftWeight: 1,
            strokeRightWeight: 3,
        };
        const result = await registeredTools["set_stroke"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_stroke", {
            nodeId: "node-1",
            nodeName: "Test Node",
            color: { r: 0, g: 0, b: 1, a: 1 },
            weight: 1,
            strokeTopWeight: 2,
            strokeBottomWeight: 4,
            strokeLeftWeight: 1,
            strokeRightWeight: 3,
        });
        expect(result.content[0].text).toContain("with individual weights");
        expect(result.content[0].text).toContain("top=2");
        expect(result.content[0].text).toContain("bottom=4");
        expect(result.content[0].text).toContain("left=1");
        expect(result.content[0].text).toContain("right=3");
    });

    it("set_stroke should support partial individual side weights", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = {
            nodeId: "node-1",
            nodeName: "Test Node",
            r: 1, g: 0, b: 0,
            strokeTopWeight: 5,
            // other sides not provided
        };
        const result = await registeredTools["set_stroke"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_stroke", {
            nodeId: "node-1",
            nodeName: "Test Node",
            color: { r: 1, g: 0, b: 0, a: 1 },
            weight: 1,
            strokeTopWeight: 5,
            strokeBottomWeight: undefined,
            strokeLeftWeight: undefined,
            strokeRightWeight: undefined,
        });
        expect(result.content[0].text).toContain("with individual weights");
        expect(result.content[0].text).toContain("top=5");
        expect(result.content[0].text).toContain("bottom=0");
        expect(result.content[0].text).toContain("left=0");
        expect(result.content[0].text).toContain("right=0");
    });

    it("set_stroke should default alpha to 1 when not provided", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = { nodeId: "node-1", nodeName: "Test Node", r: 0, g: 0, b: 0 };
        await registeredTools["set_stroke"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_stroke", expect.objectContaining({
            color: { r: 0, g: 0, b: 0, a: 1 },
        }));
    });

    it("set_stroke should default weight to 1 when not provided", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = { nodeId: "node-1", nodeName: "Test Node", r: 0, g: 0, b: 0 };
        await registeredTools["set_stroke"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_stroke", expect.objectContaining({
            weight: 1,
        }));
    });

    it("set_stroke should handle errors gracefully", async () => {
        registerStylingTools(mockServer as any);
        (sendCommandToFigma as any).mockRejectedValue(new Error("Node not found"));

        const params = { nodeId: "node-1", nodeName: "Test Node", r: 0, g: 0, b: 0 };
        const result = await registeredTools["set_stroke"](params);

        expect(result.content[0].text).toContain("Error setting stroke");
        expect(result.content[0].text).toContain("Node not found");
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
