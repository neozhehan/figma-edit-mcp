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
const { registerLayoutTools } = await import('../../../tools/layout.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Layout Tools", () => {
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

    it("should register set_auto_layout tool", () => {
        registerLayoutTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["set_auto_layout"]).toBeDefined();
    });

    it("set_auto_layout should call sendCommandToFigma with correct params", async () => {
        registerLayoutTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Frame" });

        const params = {
            nodeId: "node-1",
            nodeName: "Frame",
            layoutMode: "VERTICAL",
            layoutWrap: "WRAP",
            paddingTop: 10,
            paddingBottom: 20,
            primaryAxisAlignItems: "CENTER",
            layoutSizingHorizontal: "FILL",
            itemSpacing: 15
        };
        const result = await registeredTools["set_auto_layout"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_auto_layout", params);
        expect(result.content[0].text).toContain('Set auto-layout properties for frame "Frame"');
    });

    it("set_auto_layout handles error correctly", async () => {
        registerLayoutTools(mockServer as any);
        (sendCommandToFigma as any).mockRejectedValue(new Error("Failed to set properties"));

        const params = { nodeId: "node-1", nodeName: "Frame" };
        const result = await registeredTools["set_auto_layout"](params);

        expect(result.content[0].text).toContain("Error setting auto-layout: Failed to set properties");
    });
});
