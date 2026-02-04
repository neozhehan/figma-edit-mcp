
import { jest } from '@jest/globals';

// Define mocks
jest.unstable_mockModule('../../../figma-client.js', () => ({
    sendCommandToFigma: jest.fn(),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

jest.unstable_mockModule('../../../utils.js', () => ({
    normalizeNodeId: jest.fn((id: string) => id),
}));

// Import modules
const { registerLayoutTools } = await import('../../../tools/layout.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Layout Tools", () => {
    let mockServer: any;
    let registeredTools: Record<string, Function> = {};

    beforeEach(() => {
        registeredTools = {};
        mockServer = {
            tool: jest.fn((name, description, schema, handler) => {
                registeredTools[name] = handler;
            })
        };
        (sendCommandToFigma as jest.Mock).mockReset();
    });

    it("should register layout tools", () => {
        registerLayoutTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["set_layout_mode"]).toBeDefined();
        expect(registeredTools["set_padding"]).toBeDefined();
        expect(registeredTools["set_axis_align"]).toBeDefined();
        expect(registeredTools["set_layout_sizing"]).toBeDefined();
        expect(registeredTools["set_item_spacing"]).toBeDefined();
    });

    it("set_layout_mode should call sendCommandToFigma with correct params", async () => {
        registerLayoutTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ name: "Frame" });

        const params = { nodeId: "node-1", nodeName: "Frame", layoutMode: "VERTICAL", layoutWrap: "WRAP" };
        const result = await registeredTools["set_layout_mode"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_layout_mode", params);
        expect(result.content[0].text).toContain('Set layout mode of frame "Frame" to VERTICAL with WRAP');
    });

    it("set_padding should call sendCommandToFigma with correct params", async () => {
        registerLayoutTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ name: "Frame" });

        const params = { nodeId: "node-1", nodeName: "Frame", paddingTop: 10, paddingBottom: 10 };
        const result = await registeredTools["set_padding"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_padding", expect.objectContaining({
            nodeId: "node-1",
            paddingTop: 10,
            paddingBottom: 10
        }));
        expect(result.content[0].text).toContain('Set padding (top: 10, bottom: 10) for frame "Frame"');
    });

    it("set_axis_align should call sendCommandToFigma with correct params", async () => {
        registerLayoutTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ name: "Frame" });

        const params = { nodeId: "node-1", nodeName: "Frame", primaryAxisAlignItems: "CENTER" };
        const result = await registeredTools["set_axis_align"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_axis_align", params);
        expect(result.content[0].text).toContain('Set axis alignment (primary: CENTER) for frame "Frame"');
    });

    it("set_layout_sizing should call sendCommandToFigma with correct params", async () => {
        registerLayoutTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ name: "Frame" });

        const params = { nodeId: "node-1", nodeName: "Frame", layoutSizingHorizontal: "FILL" };
        const result = await registeredTools["set_layout_sizing"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_layout_sizing", params);
        expect(result.content[0].text).toContain('Set layout sizing (horizontal: FILL) for frame "Frame"');
    });

    it("set_item_spacing should call sendCommandToFigma with correct params", async () => {
        registerLayoutTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ name: "Frame", itemSpacing: 20 });

        const params = { nodeId: "node-1", expectedName: "Frame", itemSpacing: 20 };
        const result = await registeredTools["set_item_spacing"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_item_spacing", params);
        expect(result.content[0].text).toContain('itemSpacing=20');
    });
});
